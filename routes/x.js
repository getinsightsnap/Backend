const express = require('express');
const XService = require('../services/xService');
const { validateXSearchRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// X search endpoint
router.post('/search', validateXSearchRequest, async (req, res) => {
  try {
    const { query, language, maxResults } = req.body;
    
    logger.info(`🐦 X search: "${query}" (${language}, max: ${maxResults})`);
    
    const startTime = Date.now();
    const posts = await XService.searchPosts(query, language, maxResults);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: posts,
      metadata: {
        query,
        language,
        maxResults,
        totalPosts: posts.length,
        duration,
        platform: 'x',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('X search error:', error);
    
    // Handle specific X API errors
    let statusCode = 500;
    if (error.message.includes('authentication failed')) {
      statusCode = 401;
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
    } else if (error.message.includes('forbidden')) {
      statusCode = 403;
    }
    
    res.status(statusCode).json({
      success: false,
      error: 'X search failed',
      message: error.message,
      platform: 'x',
      timestamp: new Date().toISOString()
    });
  }
});

// Get trending topics
router.get('/trending', async (req, res) => {
  try {
    logger.info('📈 Fetching X trending topics...');
    
    const trendingTopics = await XService.getTrendingTopics();
    
    res.json({
      success: true,
      data: trendingTopics,
      total: trendingTopics.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Trending topics error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending topics',
      message: error.message,
      platform: 'x',
      timestamp: new Date().toISOString()
    });
  }
});

// Get X user info (placeholder)
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    // This would typically fetch user metadata from X API
    // For now, return basic info
    res.json({
      success: true,
      data: {
        username: username,
        displayName: `@${username}`,
        verified: false,
        followersCount: 'Unknown',
        followingCount: 'Unknown',
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('X user info error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user info',
      message: error.message
    });
  }
});

// Health check for X service
router.get('/health', (req, res) => {
  const hasApiKey = !!process.env.X_BEARER_TOKEN;
  
  res.json({
    status: hasApiKey ? 'OK' : 'WARNING',
    service: 'x',
    timestamp: new Date().toISOString(),
    available: hasApiKey,
    message: hasApiKey ? 'X API configured' : 'X API key not configured'
  });
});

// Get X API status
router.get('/status', async (req, res) => {
  try {
    const hasApiKey = !!process.env.X_BEARER_TOKEN;
    
    if (!hasApiKey) {
      return res.json({
        success: false,
        status: 'not_configured',
        message: 'X API key not configured',
        timestamp: new Date().toISOString()
      });
    }

    // Test API connection with a simple request
    try {
      await XService.getTrendingTopics();
      
      res.json({
        success: true,
        status: 'operational',
        message: 'X API is working correctly',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({
        success: false,
        status: 'error',
        message: `X API error: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error('X status check error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to check X API status',
      message: error.message
    });
  }
});

module.exports = router;
