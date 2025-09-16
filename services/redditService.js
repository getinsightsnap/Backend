const axios = require('axios');
const logger = require('../utils/logger');

class RedditService {
  static userAgent = 'InsightSnap/1.0.0';
  static baseUrl = 'https://www.reddit.com';
  static timeout = 10000; // 10 seconds

  static async searchPosts(query, language = 'en', timeFilter = 'week') {
    const startTime = Date.now();
    logger.info(`🔍 Starting Reddit search for: "${query}"`);

    try {
      const allPosts = [];
      
      // Search popular subreddits
      const subreddits = [
        'AskReddit', 'worldnews', 'news', 'entrepreneur', 'business',
        'startups', 'marketing', 'technology', 'programming', 'investing',
        'personalfinance', 'productivity', 'careerguidance', 'smallbusiness'
      ];

      // Search each subreddit in parallel (with concurrency limit)
      const concurrencyLimit = 3;
      for (let i = 0; i < subreddits.length; i += concurrencyLimit) {
        const batch = subreddits.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(subreddit => 
          this.searchSubreddit(subreddit, query, language)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            allPosts.push(...result.value);
          }
        });

        // Rate limiting between batches
        if (i + concurrencyLimit < subreddits.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Global search if we don't have enough results
      if (allPosts.length < 20) {
        try {
          logger.info('📡 Performing global Reddit search...');
          const globalPosts = await this.performGlobalSearch(query, timeFilter);
          allPosts.push(...globalPosts);
        } catch (error) {
          logger.warn('Global Reddit search failed:', error.message);
        }
      }

      // Remove duplicates and sort
      const uniquePosts = this.removeDuplicates(allPosts);
      const sortedPosts = uniquePosts
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 50);

      const duration = Date.now() - startTime;
      logger.info(`✅ Reddit search completed: ${sortedPosts.length} posts in ${duration}ms`);

      return sortedPosts;

    } catch (error) {
      logger.error('Reddit search error:', error);
      throw new Error(`Reddit search failed: ${error.message}`);
    }
  }

  static async searchSubreddit(subreddit, query, language) {
    try {
      const url = `${this.baseUrl}/r/${subreddit}/hot.json?limit=25`;
      
      const response = await axios.get(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: this.timeout
      });

      if (!response.data?.data?.children) {
        return [];
      }

      const posts = response.data.data.children
        .map(child => child.data)
        .filter(post => this.isRelevant(post, query))
        .map(post => this.formatPost(post))
        .slice(0, 5);

      logger.debug(`Found ${posts.length} relevant posts in r/${subreddit}`);
      return posts;

    } catch (error) {
      logger.warn(`Subreddit r/${subreddit} search failed:`, error.message);
      return [];
    }
  }

  static async performGlobalSearch(query, timeFilter) {
    try {
      const searchUrl = `${this.baseUrl}/search.json?q=${encodeURIComponent(query)}&sort=top&t=${timeFilter}&limit=25`;
      
      const response = await axios.get(searchUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: this.timeout
      });

      if (!response.data?.data?.children) {
        return [];
      }

      return response.data.data.children
        .map(child => child.data)
        .map(post => this.formatPost(post))
        .slice(0, 15);

    } catch (error) {
      logger.warn('Global search failed:', error.message);
      return [];
    }
  }

  static isRelevant(post, query) {
    const content = (post.title + ' ' + (post.selftext || '')).toLowerCase();
    const queryWords = query.toLowerCase().split(' ').filter(word => word.length > 2);
    
    // Check if any query words appear in the content
    const hasQueryWords = queryWords.some(word => content.includes(word));
    const hasFullQuery = content.includes(query.toLowerCase());
    
    // Additional relevance checks
    const hasGoodEngagement = (post.score + post.num_comments) > 5;
    const isNotDeleted = !post.removed_by_category;
    
    return (hasQueryWords || hasFullQuery) && hasGoodEngagement && isNotDeleted;
  }

  static formatPost(post) {
    return {
      id: `reddit_${post.id}`,
      content: post.title + (post.selftext ? ' ' + post.selftext : ''),
      platform: 'reddit',
      source: `r/${post.subreddit}`,
      engagement: post.score + post.num_comments,
      timestamp: this.formatTimestamp(post.created_utc),
      url: `https://reddit.com${post.permalink}`,
      author: post.author,
      upvotes: post.score,
      comments: post.num_comments,
      subreddit: post.subreddit,
      flair: post.link_flair_text || null,
      isNsfw: post.over_18 || false
    };
  }

  static formatTimestamp(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
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

  static removeDuplicates(posts) {
    const seen = new Set();
    return posts.filter(post => {
      if (seen.has(post.id)) {
        return false;
      }
      seen.add(post.id);
      return true;
    });
  }
}

module.exports = RedditService;
