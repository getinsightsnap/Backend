const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize Supabase client (with fallbacks)
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    logger.info('✅ Supabase client initialized for ratings API');
  } else {
    logger.warn('⚠️ Supabase credentials not configured - ratings API disabled');
  }
} catch (error) {
  logger.error('❌ Failed to initialize Supabase client:', error);
  supabase = null;
}

// Submit relevance rating
router.post('/submit', async (req, res) => {
  try {
    // Check if Supabase is available
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Rating system not available - database not configured'
      });
    }

    const { searchQuery, postId, platform, rating, userId } = req.body;

    // Validate input
    if (!searchQuery || !postId || !platform || rating === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: searchQuery, postId, platform, rating'
      });
    }

    if (rating < 0 || rating > 5 || !Number.isInteger(rating)) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be an integer between 0 and 5'
      });
    }

    logger.info(`📊 Rating submission: "${searchQuery}" - ${platform} post ${postId} rated ${rating}/5`);

    // Insert rating into database
    const { data, error } = await supabase
      .from('relevance_ratings')
      .insert({
        user_id: userId || null,
        search_query: searchQuery.toLowerCase().trim(),
        post_id: postId,
        platform: platform,
        rating: rating
      })
      .select();

    if (error) {
      logger.error('Database error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save rating'
      });
    }

    // Trigger AI learning analysis for this query
    await triggerAILearning(searchQuery, platform);

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: data[0]
    });

  } catch (error) {
    logger.error('Rating submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get relevance analytics for a search query
router.get('/analytics/:query', async (req, res) => {
  try {
    // Check if Supabase is available
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Analytics not available - database not configured'
      });
    }

    const { query } = req.params;
    const normalizedQuery = query.toLowerCase().trim();

    // Get analytics data
    const { data: analytics, error } = await supabase
      .from('relevance_analytics')
      .select('*')
      .eq('search_query', normalizedQuery);

    if (error) {
      logger.error('Analytics query error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics'
      });
    }

    // Get recent ratings for context
    const { data: recentRatings, error: ratingsError } = await supabase
      .from('relevance_ratings')
      .select('platform, rating, created_at')
      .eq('search_query', normalizedQuery)
      .order('created_at', { ascending: false })
      .limit(50);

    if (ratingsError) {
      logger.warn('Recent ratings query error:', ratingsError);
    }

    res.json({
      success: true,
      data: {
        analytics: analytics || [],
        recentRatings: recentRatings || [],
        totalRatings: recentRatings?.length || 0
      }
    });

  } catch (error) {
    logger.error('Analytics fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user's rating history
router.get('/user/:userId', async (req, res) => {
  try {
    // Check if Supabase is available
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'User ratings not available - database not configured'
      });
    }

    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('relevance_ratings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('User ratings query error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user ratings'
      });
    }

    res.json({
      success: true,
      data: data || []
    });

  } catch (error) {
    logger.error('User ratings fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Trigger AI learning analysis
async function triggerAILearning(searchQuery, platform) {
  try {
    // Skip if Supabase is not available
    if (!supabase) {
      logger.debug('Supabase not available - skipping AI learning trigger');
      return;
    }

    logger.info(`🤖 Triggering AI learning for: "${searchQuery}" on ${platform}`);
    
    // Get recent ratings for this query
    const { data: ratings, error } = await supabase
      .from('relevance_ratings')
      .select('post_id, platform, rating, created_at')
      .eq('search_query', searchQuery.toLowerCase().trim())
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !ratings || ratings.length < 5) {
      logger.info(`Not enough ratings for AI learning: ${ratings?.length || 0} ratings`);
      return;
    }

    // Calculate patterns and improvements
    const platformRatings = ratings.filter(r => r.platform === platform);
    const avgRating = platformRatings.reduce((sum, r) => sum + r.rating, 0) / platformRatings.length;
    
    // Generate improvement suggestions based on rating patterns
    const suggestions = generateImprovementSuggestions(searchQuery, platform, avgRating, ratings);

    // Store learning patterns
    await supabase
      .from('ai_learning_patterns')
      .upsert({
        search_query: searchQuery.toLowerCase().trim(),
        platform: platform,
        avg_relevance_score: avgRating,
        improvement_suggestions: suggestions,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'search_query,platform'
      });

    logger.info(`✅ AI learning updated for "${searchQuery}" - avg rating: ${avgRating.toFixed(2)}`);

  } catch (error) {
    logger.error('AI learning trigger error:', error);
  }
}

// Generate improvement suggestions based on rating patterns
function generateImprovementSuggestions(query, platform, avgRating, ratings) {
  const suggestions = [];
  
  if (avgRating < 2.0) {
    suggestions.push(`Very low relevance scores for "${query}" on ${platform}. Consider adjusting search parameters or content filtering.`);
  } else if (avgRating < 3.0) {
    suggestions.push(`Below average relevance for "${query}" on ${platform}. Review content matching criteria.`);
  }
  
  // Analyze rating distribution
  const lowRatings = ratings.filter(r => r.rating <= 2).length;
  const highRatings = ratings.filter(r => r.rating >= 4).length;
  
  if (lowRatings > ratings.length * 0.6) {
    suggestions.push(`High percentage of low ratings (${Math.round(lowRatings/ratings.length*100)}%). Consider stricter relevance filtering.`);
  }
  
  if (highRatings < ratings.length * 0.3) {
    suggestions.push(`Low percentage of high ratings (${Math.round(highRatings/ratings.length*100)}%). May need better content selection.`);
  }

  return suggestions.join(' ');
}

module.exports = router;
