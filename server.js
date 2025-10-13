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
    
    logger.info(`🎉 Search completed: ${totalPosts} total posts in ${duration}ms`);

    // Response with relevance analysis
    res.json({
      success: true,
      data: categorizedResults,
      metadata: {
        query,
        platforms,
        totalPosts,
        duration,
        errors: errors.length > 0 ? errors : undefined,
        relevanceAnalysis: categorizedResults.relevanceAnalysis,
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
