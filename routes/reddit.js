const express = require('express');
const RedditService = require('../services/redditService');
const { validateRedditSearchRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Reddit search endpoint
router.post('/search', validateRedditSearchRequest, async (req, res) => {
  try {
    const { query, language, timeFilter } = req.body;
    
    logger.info(`🔍 Reddit search: "${query}" (${timeFilter})`);
    
    const startTime = Date.now();
    const posts = await RedditService.searchPosts(query, language, timeFilter);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: posts,
      metadata: {
        query,
        language,
        timeFilter,
        totalPosts: posts.length,
        duration,
        platform: 'reddit',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Reddit search error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Reddit search failed',
      message: error.message,
      platform: 'reddit',
      timestamp: new Date().toISOString()
    });
  }
});

// Get Reddit subreddit info
router.get('/subreddit/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    // This would typically fetch subreddit metadata
    // For now, return basic info
    res.json({
      success: true,
      data: {
        name: name,
        displayName: `r/${name}`,
        description: `Subreddit: ${name}`,
        subscribers: 'Unknown',
        activeUsers: 'Unknown',
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Subreddit info error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subreddit info',
      message: error.message
    });
  }
});

// Get popular subreddits
router.get('/popular', async (req, res) => {
  try {
    const popularSubreddits = [
      { name: 'AskReddit', description: 'Ask Reddit anything', category: 'Discussion' },
      { name: 'worldnews', description: 'World news and events', category: 'News' },
      { name: 'technology', description: 'Technology discussions', category: 'Technology' },
      { name: 'entrepreneur', description: 'Entrepreneurship and business', category: 'Business' },
      { name: 'marketing', description: 'Marketing strategies and tips', category: 'Business' },
      { name: 'startups', description: 'Startup discussions', category: 'Business' },
      { name: 'programming', description: 'Programming and coding', category: 'Technology' },
      { name: 'investing', description: 'Investment discussions', category: 'Finance' },
      { name: 'personalfinance', description: 'Personal finance advice', category: 'Finance' },
      { name: 'productivity', description: 'Productivity tips and tools', category: 'Lifestyle' }
    ];

    res.json({
      success: true,
      data: popularSubreddits,
      total: popularSubreddits.length
    });

  } catch (error) {
    logger.error('Popular subreddits error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular subreddits',
      message: error.message
    });
  }
});

// Health check for Reddit service
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'reddit',
    timestamp: new Date().toISOString(),
    available: true
  });
});

module.exports = router;
