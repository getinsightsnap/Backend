const axios = require('axios');
const logger = require('../utils/logger');

class YouTubeService {
  static apiKey = process.env.YOUTUBE_API_KEY;
  static baseUrl = 'https://www.googleapis.com/youtube/v3';
  static timeout = 10000; // 10 seconds

  /**
   * Search YouTube for videos and comments based on query
   * @param {string} query - Search query
   * @param {string} language - Language code (e.g., 'en')
   * @param {string} timeFilter - Time filter (hour, day, week, month, 3months, 6months, year, all)
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array>} Array of formatted posts
   */
  static async searchPosts(query, language = 'en', timeFilter = 'week', maxResults = 50) {
    const startTime = Date.now();
    
    if (!this.apiKey) {
      logger.warn('YouTube API key not configured');
      return [];
    }

    try {
      logger.info(`🔍 Searching YouTube for: "${query}" (timeFilter: ${timeFilter}, language: ${language})`);

      // Convert timeFilter to YouTube's publishedAfter format
      const publishedAfter = this.calculatePublishedAfter(timeFilter);
      
      // Search for videos
      const searchParams = {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: Math.min(maxResults, 50), // YouTube API limit is 50
        order: 'relevance', // Can be: relevance, date, rating, viewCount
        relevanceLanguage: language,
        safeSearch: 'moderate',
        key: this.apiKey
      };

      if (publishedAfter) {
        searchParams.publishedAfter = publishedAfter;
      }

      logger.debug('YouTube search params:', searchParams);

      const response = await axios.get(`${this.baseUrl}/search`, {
        params: searchParams,
        timeout: this.timeout
      });

      if (!response.data || !response.data.items) {
        logger.warn('No items in YouTube response');
        return [];
      }

      const videos = response.data.items;
      logger.info(`✅ Found ${videos.length} YouTube videos`);

      // Get video statistics for engagement metrics
      const videoIds = videos.map(video => video.id.videoId).join(',');
      const statsResponse = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'statistics,snippet',
          id: videoIds,
          key: this.apiKey
        },
        timeout: this.timeout
      });

      const videoStats = statsResponse.data.items || [];
      
      // Format posts with engagement data
      const formattedPosts = videos.map(video => {
        const stats = videoStats.find(v => v.id === video.id.videoId);
        const snippet = video.snippet;
        
        // Calculate engagement score
        const likeCount = parseInt(stats?.statistics?.likeCount || 0);
        const commentCount = parseInt(stats?.statistics?.commentCount || 0);
        const viewCount = parseInt(stats?.statistics?.viewCount || 0);
        
        // Engagement = likes + (comments * 2) + (views / 100)
        const engagement = likeCount + (commentCount * 2) + Math.floor(viewCount / 100);

        return {
          id: `youtube_${video.id.videoId}`,
          content: `${snippet.title}\n\n${snippet.description.substring(0, 300)}${snippet.description.length > 300 ? '...' : ''}`,
          platform: 'youtube',
          source: snippet.channelTitle,
          engagement: engagement,
          timestamp: new Date(snippet.publishedAt).toISOString(),
          url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
          author: snippet.channelTitle,
          metadata: {
            videoId: video.id.videoId,
            channelId: snippet.channelId,
            thumbnails: snippet.thumbnails,
            views: viewCount,
            likes: likeCount,
            comments: commentCount
          }
        };
      });

      // Try to get top comments for additional insights (optional)
      const postsWithComments = await this.enrichWithComments(formattedPosts, query);

      const duration = Date.now() - startTime;
      logger.info(`✅ YouTube search completed in ${duration}ms with ${postsWithComments.length} posts`);

      return postsWithComments;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error.response?.status === 403) {
        logger.error('YouTube API quota exceeded or invalid API key');
        logger.error('Error details:', error.response?.data);
      } else if (error.response?.status === 400) {
        logger.error('Invalid YouTube API request:', error.response?.data);
      } else {
        logger.error('YouTube search error:', error.message);
      }
      
      logger.error(`❌ YouTube search failed after ${duration}ms`);
      return [];
    }
  }

  /**
   * Enrich posts with top comments for better insights
   * @param {Array} posts - Array of formatted posts
   * @param {string} query - Original search query
   * @returns {Promise<Array>} Posts enriched with comment insights
   */
  static async enrichWithComments(posts, query) {
    if (!this.apiKey || posts.length === 0) {
      return posts;
    }

    try {
      // Get comments for top 5 videos only (to avoid quota issues)
      const topPosts = posts.slice(0, 5);
      
      for (const post of topPosts) {
        try {
          const videoId = post.metadata.videoId;
          
          const commentsResponse = await axios.get(`${this.baseUrl}/commentThreads`, {
            params: {
              part: 'snippet',
              videoId: videoId,
              maxResults: 10,
              order: 'relevance',
              textFormat: 'plainText',
              key: this.apiKey
            },
            timeout: 5000
          });

          if (commentsResponse.data?.items) {
            const topComments = commentsResponse.data.items
              .map(item => item.snippet.topLevelComment.snippet.textDisplay)
              .join('\n---\n');
            
            // Add top comments to the post content for AI analysis
            post.content += `\n\n📝 Top Comments:\n${topComments.substring(0, 500)}`;
          }
        } catch (commentError) {
          // Comments might be disabled for some videos, just skip
          logger.debug(`Could not fetch comments for video ${post.metadata.videoId}`);
        }
      }

      return posts;

    } catch (error) {
      logger.debug('Error enriching with comments:', error.message);
      return posts; // Return posts without comments if enrichment fails
    }
  }

  /**
   * Calculate publishedAfter timestamp based on timeFilter
   * @param {string} timeFilter - Time filter
   * @returns {string|null} ISO 8601 timestamp or null for 'all'
   */
  static calculatePublishedAfter(timeFilter) {
    const now = new Date();
    let publishedAfter = null;

    switch (timeFilter) {
      case 'hour':
        publishedAfter = new Date(now.getTime() - (60 * 60 * 1000));
        break;
      case 'day':
        publishedAfter = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        break;
      case 'week':
        publishedAfter = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case 'month':
        publishedAfter = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case '3months':
        publishedAfter = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        break;
      case '6months':
        publishedAfter = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
        break;
      case 'year':
        publishedAfter = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        break;
      case 'all':
      default:
        publishedAfter = null; // No time filter
        break;
    }

    return publishedAfter ? publishedAfter.toISOString() : null;
  }

  /**
   * Get trending videos for a topic
   * @param {string} query - Search query
   * @param {string} language - Language code
   * @returns {Promise<Array>} Array of trending videos
   */
  static async getTrendingVideos(query, language = 'en') {
    try {
      logger.info(`🔥 Getting trending YouTube videos for: "${query}"`);

      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: 25,
          order: 'viewCount', // Sort by view count for trending
          publishedAfter: this.calculatePublishedAfter('week'), // Last week
          relevanceLanguage: language,
          key: this.apiKey
        },
        timeout: this.timeout
      });

      return response.data.items || [];

    } catch (error) {
      logger.error('Error fetching trending YouTube videos:', error.message);
      return [];
    }
  }
}

module.exports = YouTubeService;

