const express = require('express');
const RedditService = require('../services/redditService');
const XService = require('../services/xService');
const AIService = require('../services/aiService');
const { validateSearchRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

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

    // YouTube placeholder (not implemented yet)
    if (platforms.includes('youtube')) {
      promises.push(
        Promise.resolve({ platform: 'youtube', posts: [], success: true, message: 'YouTube API not implemented yet' })
      );
    }

    // Wait for all API calls with overall timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Search timeout')), 25000) // 25 seconds
    );

    const apiResults = await Promise.race([
      Promise.allSettled(promises),
      timeoutPromise
    ]);

    // Process results
    const errors = [];
    apiResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        allPosts.push(...result.value.posts);
        logger.info(`✅ ${result.value.platform}: ${result.value.posts.length} posts`);
      } else {
        const error = result.status === 'fulfilled' ? result.value.error : result.reason.message;
        errors.push(`${result.value?.platform || 'unknown'}: ${error}`);
        logger.warn(`❌ ${result.value?.platform || 'unknown'} failed: ${error}`);
      }
    });

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
    
    logger.info(`🎉 Search completed: ${totalPosts} total posts in ${duration}ms`);

    // Response with sentiment analysis
    res.json({
      success: true,
      data: categorizedResults,
      metadata: {
        query,
        platforms,
        totalPosts,
        duration,
        errors: errors.length > 0 ? errors : undefined,
        sentimentAnalysis: categorizedResults.sentimentAnalysis,
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
