const express = require('express');
const RedditService = require('../services/redditService');
const XService = require('../services/xService');
const YouTubeService = require('../services/youtubeService');
const AIService = require('../services/aiService');
const { validateSearchRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Helper function to generate intelligent no-results messages
function generateNoResultsMessage(query, timeFilter, totalPosts) {
  const timeMessages = {
    'hour': 'No recent buzz in the past hour',
    'day': 'No trending discussions in the past day',
    'week': 'No recent buzz or trending discussions in the past week',
    'month': 'No trending discussions in the past month',
    '3months': 'No trending discussions in the past 3 months',
    '6months': 'No trending discussions in the past 6 months',
    'year': 'No trending discussions in the past year',
    'all': 'No trending discussions found'
  };

  const suggestions = {
    'hour': ['Try "Past Day" or "Past Week" for more results'],
    'day': ['Try "Past Week" or "Past Month" for more results'],
    'week': ['Try "Past Month" or "Past 3 Months" for more results'],
    'month': ['Try "Past 3 Months" or "Past Year" for more results'],
    '3months': ['Try "Past 6 Months" or "Past Year" for more results'],
    '6months': ['Try "Past Year" or "All Time" for more results'],
    'year': ['Try "All Time" for historical discussions'],
    'all': ['Try different search terms or check if the topic exists']
  };

  const baseMessage = timeMessages[timeFilter] || 'No trending discussions found';
  const timeContext = ` for "${query}"`;
  const suggestionList = suggestions[timeFilter] || [];

  return {
    title: `${baseMessage}${timeContext}`,
    message: `Found ${totalPosts} posts but none were relevant to your search. This might be because:`,
    reasons: [
      `The topic "${query}" hasn't been trending in the selected time period`,
      'The posts found were about different topics',
      'The search terms need to be more specific'
    ],
    suggestions: suggestionList,
    tip: 'Try expanding your time range or using more specific search terms for better results.'
  };
}

function generateNoPostsMessage(query, timeFilter, errors) {
  const timeMessages = {
    'hour': 'No discussions found in the past hour',
    'day': 'No discussions found in the past day', 
    'week': 'No discussions found in the past week',
    'month': 'No discussions found in the past month',
    '3months': 'No discussions found in the past 3 months',
    '6months': 'No discussions found in the past 6 months',
    'year': 'No discussions found in the past year',
    'all': 'No discussions found'
  };

  const baseMessage = timeMessages[timeFilter] || 'No discussions found';
  
  // Check if it's due to API errors
  const hasApiErrors = errors.length > 0;
  
  return {
    title: `${baseMessage} for "${query}"`,
    message: hasApiErrors 
      ? 'No posts were retrieved due to API issues. This might be because:'
      : `No discussions found about "${query}" in the selected time period. This might be because:`,
    reasons: hasApiErrors 
      ? [
          'Temporary API rate limits or connectivity issues',
          'Some social media platforms are currently unavailable',
          'High traffic causing delays in data retrieval'
        ]
      : [
          `"${query}" hasn't been discussed much recently`,
          'The topic might be too niche or specific',
          'Try different time ranges or search terms'
        ],
    suggestions: hasApiErrors 
      ? ['Wait a few minutes and try again', 'Check back later when traffic is lower']
      : ['Try a broader time range', 'Use different search terms', 'Check if the topic is trending'],
    tip: hasApiErrors 
      ? 'Our team monitors API status continuously. Please try again shortly.'
      : 'Consider searching for related terms or expanding your time range for better results.'
  };
}

// Main search endpoint
router.post('/', validateSearchRequest, async (req, res) => {
  try {
    const { query, platforms, language, timeFilter } = req.body;
    
    logger.info(`🔍 Search request: "${query}" on platforms: ${platforms.join(', ')}`);
    
    const startTime = Date.now();
    const allPosts = [];

    // Parallel API calls with timeout
    const promises = [];
    
    if (platforms.includes('reddit')) {
      promises.push(
        RedditService.searchPosts(query, language, timeFilter)
          .then(posts => ({ platform: 'reddit', posts, success: true }))
          .catch(error => ({ platform: 'reddit', error: error.message, success: false }))
      );
    }
    
    if (platforms.includes('x')) {
      promises.push(
        XService.searchPosts(query, language, timeFilter, 50)
          .then(posts => ({ platform: 'x', posts, success: true }))
          .catch(error => ({ platform: 'x', error: error.message, success: false }))
      );
    }

    // YouTube search
    if (platforms.includes('youtube')) {
      promises.push(
        YouTubeService.searchPosts(query, language, timeFilter, 50)
          .then(posts => ({ platform: 'youtube', posts, success: true }))
          .catch(error => ({ platform: 'youtube', error: error.message, success: false }))
      );
    }

    // Wait for all API calls with overall timeout (increased for high traffic)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Search timeout')), 45000) // Increased to 45 seconds
    );

    let apiResults;
    try {
      apiResults = await Promise.race([
        Promise.allSettled(promises),
        timeoutPromise
      ]);
    } catch (timeoutError) {
      // If timeout occurs, still try to get partial results
      logger.warn('⚠️ Search timeout occurred, attempting to get partial results');
      apiResults = await Promise.allSettled(promises);
    }

    // Process results with better error handling
    const errors = [];
    const successfulPlatforms = [];
    
    apiResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        allPosts.push(...result.value.posts);
        successfulPlatforms.push(result.value.platform);
        logger.info(`✅ ${result.value.platform}: ${result.value.posts.length} posts`);
      } else {
        const error = result.status === 'fulfilled' ? result.value.error : result.reason?.message || 'Unknown error';
        const platform = result.value?.platform || 'unknown';
        errors.push(`${platform}: ${error}`);
        logger.warn(`❌ ${platform} failed: ${error}`);
      }
    });

    // Log success rate for monitoring
    const successRate = (successfulPlatforms.length / promises.length) * 100;
    logger.info(`📊 API Success Rate: ${successRate.toFixed(0)}% (${successfulPlatforms.length}/${promises.length} platforms)`);

    // If all platforms failed, return helpful error
    if (allPosts.length === 0 && errors.length > 0) {
      logger.error('🚨 All platforms failed to return results');
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable',
        message: 'All data sources are currently unavailable. This may be due to high traffic or API rate limits. Please try again in a few minutes.',
        details: errors,
        retryAfter: 60, // Suggest retry after 60 seconds
        timestamp: new Date().toISOString()
      });
    }

    // Categorize posts using AI
    let categorizedResults = {
      painPoints: [],
      trendingIdeas: [],
      contentIdeas: []
    };

    if (allPosts.length > 0) {
      try {
        categorizedResults = await AIService.categorizePosts(allPosts, query);
      } catch (error) {
        logger.error('AI categorization failed:', error);
        // Fallback to simple categorization
        categorizedResults = AIService.simpleCategorization(allPosts);
      }
    }

    const duration = Date.now() - startTime;
    const totalPosts = allPosts.length;
    const totalResults = (categorizedResults.painPoints?.length || 0) + 
                        (categorizedResults.trendingIdeas?.length || 0) + 
                        (categorizedResults.contentIdeas?.length || 0);
    
    logger.info(`🎉 Search completed: ${totalPosts} total posts, ${totalResults} categorized results in ${duration}ms`);

    // Generate intelligent no-results message if needed
    let noResultsMessage = null;
    if (totalResults === 0 && totalPosts > 0) {
      noResultsMessage = generateNoResultsMessage(query, timeFilter, totalPosts);
    } else if (totalResults === 0 && totalPosts === 0) {
      noResultsMessage = generateNoPostsMessage(query, timeFilter, errors);
    }

    // Response with relevance analysis and intelligent messaging
    res.json({
      success: true,
      data: categorizedResults,
      metadata: {
        query,
        platforms,
        timeFilter,
        totalPosts,
        totalResults,
        duration,
        errors: errors.length > 0 ? errors : undefined,
        relevanceAnalysis: categorizedResults.relevanceAnalysis,
        noResultsMessage,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Search endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check for search service
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'search',
    timestamp: new Date().toISOString(),
    availablePlatforms: ['reddit', 'x', 'youtube']
  });
});

// Get search statistics
router.get('/stats', async (req, res) => {
  try {
    // This could be expanded to include actual statistics from a database
    res.json({
      totalSearches: 0, // Would come from database
      popularQueries: [], // Would come from database
      platformStats: {
        reddit: { available: true, lastChecked: new Date().toISOString() },
        x: { available: !!process.env.X_BEARER_TOKEN, lastChecked: new Date().toISOString() },
        youtube: { available: false, lastChecked: new Date().toISOString() }
      }
    });
  } catch (error) {
    logger.error('Stats endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

module.exports = router;
