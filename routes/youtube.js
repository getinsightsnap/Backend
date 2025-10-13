const express = require('express');
const YouTubeService = require('../services/youtubeService');
const { validateSearchRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/youtube/search
 * Search YouTube videos and comments
 */
router.post('/search', validateSearchRequest, async (req, res) => {
  try {
    const { query, language = 'en', timeFilter = 'week' } = req.body;
    
    logger.info(`🎥 YouTube search request: "${query}" (language: ${language}, timeFilter: ${timeFilter})`);
    
    const posts = await YouTubeService.searchPosts(query, language, timeFilter);
    
    res.json({
      success: true,
      data: posts,
      count: posts.length,
      platform: 'youtube',
      query,
      timeFilter,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('YouTube search endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: 'YouTube search failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/youtube/trending
 * Get trending videos for a topic
 */
router.get('/trending', async (req, res) => {
  try {
    const { query, language = 'en' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }
    
    logger.info(`🔥 YouTube trending request: "${query}"`);
    
    const videos = await YouTubeService.getTrendingVideos(query, language);
    
    res.json({
      success: true,
      data: videos,
      count: videos.length,
      platform: 'youtube',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('YouTube trending endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending videos',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/youtube/health
 * Health check for YouTube API
 */
router.get('/health', async (req, res) => {
  const hasApiKey = !!process.env.YOUTUBE_API_KEY;
  
  res.json({
    success: true,
    service: 'YouTube API',
    configured: hasApiKey,
    status: hasApiKey ? 'ready' : 'not configured',
    message: hasApiKey 
      ? 'YouTube API is configured and ready' 
      : 'YouTube API key not configured',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

