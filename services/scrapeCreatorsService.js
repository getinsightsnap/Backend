const axios = require('axios');
const logger = require('../utils/logger');

class ScrapeCreatorsService {
  static apiKey = process.env.SCRAPECREATORS_API_KEY || 'AmqXWJbjbPMZMQ0f9ilxYjL2V6o2';
  static baseUrl = 'https://api.scrapecreators.com'; // Update with actual base URL
  static timeout = 30000; // 30 seconds

  /**
   * Search posts across all platforms using ScrapeCreators API
   * @param {string} query - Search query
   * @param {string[]} platforms - Array of platforms: 'reddit', 'x', 'youtube', 'linkedin', 'threads'
   * @param {string} language - Language code (e.g., 'en')
   * @param {string} timeFilter - Time filter (hour, day, week, month, year)
   * @param {number} maxResults - Maximum number of results per platform
   * @returns {Promise<Array>} Array of formatted posts with platform field
   */
  static async searchPosts(query, platforms = ['reddit', 'x', 'youtube', 'linkedin', 'threads'], language = 'en', timeFilter = 'week', maxResults = 50) {
    const startTime = Date.now();
    logger.info(`🔍 ScrapeCreators search for: "${query}" on platforms: ${platforms.join(', ')}`);

    if (!this.apiKey) {
      logger.error('❌ ScrapeCreators API key not configured!');
      return [];
    }

    try {
      const allPosts = [];
      
      // Map platforms to ScrapeCreators platform identifiers
      const platformMap = {
        'reddit': 'reddit',
        'x': 'twitter',
        'youtube': 'youtube',
        'linkedin': 'linkedin',
        'threads': 'threads'
      };

      // Search each platform in parallel
      const platformPromises = platforms.map(async (platform) => {
        try {
          const platformId = platformMap[platform];
          if (!platformId) {
            logger.warn(`⚠️ Unknown platform: ${platform}`);
            return [];
          }

          const posts = await this.searchPlatform(platformId, query, language, timeFilter, maxResults);
          
          // Add platform identifier to each post
          return posts.map(post => ({
            ...post,
            platform: platform
          }));
        } catch (error) {
          logger.error(`❌ Error searching ${platform}:`, error.message);
          return [];
        }
      });

      const results = await Promise.all(platformPromises);
      results.forEach(posts => allPosts.push(...posts));

      const duration = Date.now() - startTime;
      logger.info(`✅ ScrapeCreators search completed: ${allPosts.length} posts in ${duration}ms`);

      // Sort by engagement
      return allPosts.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));

    } catch (error) {
      logger.error('ScrapeCreators search error:', error);
      return [];
    }
  }

  /**
   * Search a specific platform
   */
  static async searchPlatform(platformId, query, language, timeFilter, maxResults) {
    try {
      logger.debug(`📡 Searching ${platformId} for: "${query}"`);

      // Calculate date range based on time filter
      const dateFrom = this.calculateDateFrom(timeFilter);

      // Build request to ScrapeCreators API
      const requestBody = {
        platform: platformId,
        query: query,
        max_results: maxResults,
        language: language,
        date_from: dateFrom
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/search`, // TODO: Verify actual ScrapeCreators API endpoint URL
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-API-Key': this.apiKey, // Try both header formats (use whichever ScrapeCreators requires)
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      if (!response.data || !response.data.posts) {
        logger.warn(`No posts found for ${platformId}`);
        return [];
      }

      // Transform ScrapeCreators response to our format
      const posts = response.data.posts.map(post => this.formatPost(post, platformId));
      
      logger.info(`✅ Found ${posts.length} posts from ${platformId}`);
      return posts;

    } catch (error) {
      logger.error(`Error searching ${platformId}:`, error.message);
      // Return empty array on error to not block other platforms
      return [];
    }
  }

  /**
   * Format post from ScrapeCreators API to our standard format
   */
  static formatPost(post, platformId) {
    // Calculate engagement (sum of likes, comments, shares, etc.)
    const engagement = (post.likes || 0) + 
                      (post.comments || 0) + 
                      (post.shares || 0) + 
                      (post.retweets || 0) + 
                      (post.views || 0) * 0.1; // Weight views less

    return {
      id: post.id || `${platformId}_${Date.now()}_${Math.random()}`,
      content: post.text || post.content || post.title || '',
      source: post.author || post.username || post.channel || 'Unknown',
      engagement: Math.round(engagement),
      timestamp: post.created_at || post.date || new Date().toISOString(),
      url: post.url || post.permalink || '#',
      author: post.author_name || post.author || post.username
    };
  }

  /**
   * Calculate date_from based on time filter
   */
  static calculateDateFrom(timeFilter) {
    const now = new Date();
    let dateFrom = new Date();

    switch (timeFilter.toLowerCase()) {
      case 'hour':
        dateFrom.setHours(now.getHours() - 1);
        break;
      case 'day':
        dateFrom.setDate(now.getDate() - 1);
        break;
      case 'week':
        dateFrom.setDate(now.getDate() - 7);
        break;
      case 'month':
        dateFrom.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        dateFrom.setMonth(now.getMonth() - 3);
        break;
      case '6months':
        dateFrom.setMonth(now.getMonth() - 6);
        break;
      case 'year':
        dateFrom.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
      default:
        dateFrom = new Date(0); // Beginning of time
        break;
    }

    return dateFrom.toISOString();
  }
}

module.exports = ScrapeCreatorsService;
