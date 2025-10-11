const axios = require('axios');
const logger = require('../utils/logger');

class XService {
  static baseUrl = 'https://api.x.com/2';
  static timeout = 15000; // 15 seconds

  static async searchPosts(query, language = 'en', timeFilter = 'week', maxResults = 50) {
    const startTime = Date.now();
    logger.info(`🐦 Starting X search for: "${query}" (timeFilter: ${timeFilter})`);

    try {
      const bearerToken = process.env.X_BEARER_TOKEN;
      
      if (!bearerToken) {
        throw new Error('X API bearer token not configured');
      }

      // Build search query with language filter
      let searchQuery = query;
      if (language !== 'en') {
        searchQuery = `${query} lang:${language}`;
      }

      // Calculate start time based on time filter
      const startTimeISO = this.calculateStartTime(timeFilter);

      // Build API request parameters
      const params = new URLSearchParams({
        'query': searchQuery,
        'max_results': Math.min(maxResults, 100).toString(),
        'tweet.fields': 'created_at,public_metrics,context_annotations,lang,author_id,conversation_id,referenced_tweets',
        'user.fields': 'username,name,verified,public_metrics',
        'expansions': 'author_id',
        'sort_order': 'relevancy'
      });

      // Add start_time if calculated
      if (startTimeISO) {
        params.append('start_time', startTimeISO);
      }

      const url = `${this.baseUrl}/tweets/search/recent?${params}`;

      // Make request to X API
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout
      });

      if (!response.data?.data) {
        logger.warn('No tweets found in X API response');
        return [];
      }

      // Transform X API response to our format
      const tweets = response.data.data;
      const users = response.data.includes?.users || [];
      const userMap = new Map(users.map(user => [user.id, user]));

      const posts = tweets.map(tweet => this.formatTweet(tweet, userMap));

      // Sort by engagement
      const sortedPosts = posts.sort((a, b) => b.engagement - a.engagement);

      const duration = Date.now() - startTime;
      logger.info(`✅ X search completed: ${sortedPosts.length} tweets in ${duration}ms`);

      return sortedPosts;

    } catch (error) {
      logger.error('X search error:', error);
      
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.detail || error.message;
        
        if (status === 401) {
          throw new Error('X API authentication failed. Please check your bearer token.');
        } else if (status === 429) {
          throw new Error('X API rate limit exceeded. Please try again later.');
        } else if (status === 403) {
          throw new Error('X API access forbidden. Please check your API permissions.');
        } else {
          throw new Error(`X API error (${status}): ${message}`);
        }
      }
      
      throw new Error(`X search failed: ${error.message}`);
    }
  }

  static formatTweet(tweet, userMap) {
    const user = userMap.get(tweet.author_id) || {};
    const metrics = tweet.public_metrics || {};
    
    // Calculate engagement score
    const engagement = (metrics.like_count || 0) + 
                     (metrics.retweet_count || 0) + 
                     (metrics.reply_count || 0) + 
                     (metrics.quote_count || 0);

    return {
      id: `x_${tweet.id}`,
      content: tweet.text,
      platform: 'x',
      source: `@${user.username || 'unknown'}`,
      engagement: engagement,
      timestamp: this.formatTimestamp(tweet.created_at),
      url: `https://x.com/${user.username || 'unknown'}/status/${tweet.id}`,
      author: user.name || user.username || 'Unknown',
      likes: metrics.like_count || 0,
      retweets: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
      quotes: metrics.quote_count || 0,
      isVerified: user.verified || false,
      followersCount: user.public_metrics?.followers_count || 0,
      isRetweet: !!tweet.referenced_tweets?.find(ref => ref.type === 'retweeted'),
      isReply: !!tweet.referenced_tweets?.find(ref => ref.type === 'replied_to')
    };
  }

  static calculateStartTime(timeFilter) {
    const now = new Date();
    let daysAgo;

    switch (timeFilter) {
      case 'hour':
        daysAgo = 1 / 24; // 1 hour in days
        break;
      case 'day':
        daysAgo = 1;
        break;
      case 'week':
        daysAgo = 7;
        break;
      case 'month':
        daysAgo = 30;
        break;
      case '3months':
        daysAgo = 90;
        break;
      case '6months':
        daysAgo = 180;
        break;
      case 'year':
        daysAgo = 365;
        break;
      case 'all':
        // Twitter API only supports recent search (last 7 days for standard access)
        daysAgo = 7;
        break;
      default:
        daysAgo = 7; // default to week
    }

    const startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Twitter API requires ISO 8601 format
    return startTime.toISOString();
  }

  static formatTimestamp(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }

  static async getTrendingTopics() {
    try {
      const bearerToken = process.env.X_BEARER_TOKEN;
      
      if (!bearerToken) {
        throw new Error('X API bearer token not configured');
      }

      const url = `${this.baseUrl}/trends/by/woeid/1.json`; // Worldwide trends
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout
      });

      return response.data[0]?.trends || [];

    } catch (error) {
      logger.warn('Failed to fetch trending topics:', error.message);
      return [];
    }
  }
}

module.exports = XService;
