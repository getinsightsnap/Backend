const axios = require('axios');
const logger = require('../utils/logger');

class RedditService {
  static userAgent = 'InsightSnap/1.0.0';
  static baseUrl = 'https://www.reddit.com';
  static timeout = 10000; // 10 seconds

  static async searchPosts(query, language = 'en', timeFilter = 'week') {
    const startTime = Date.now();
    logger.info(`🔍 Starting dynamic Reddit search for: "${query}" (timeFilter: ${timeFilter})`);

    // Map custom time filters to Reddit's supported values
    const redditTimeFilter = this.mapTimeFilter(timeFilter);
    logger.debug(`Mapped timeFilter ${timeFilter} to Reddit's ${redditTimeFilter}`);

    try {
      const allPosts = [];
      
      // Step 1: Find relevant subreddits dynamically based on query
      const relevantSubreddits = await this.findRelevantSubreddits(query);
      logger.info(`🎯 Found ${relevantSubreddits.length} relevant subreddits for "${query}"`);

      // Step 2: Add fallback subreddits for broader coverage
      const fallbackSubreddits = [
        'entrepreneur', 'business', 'startups', 'marketing', 'technology', 
        'programming', 'investing', 'personalfinance', 'productivity', 
        'careerguidance', 'smallbusiness'
      ];

      // Combine relevant and fallback subreddits (remove duplicates)
      const allSubreddits = [...new Set([...relevantSubreddits, ...fallbackSubreddits])];
      logger.info(`📊 Total subreddits to search: ${allSubreddits.length}`);

      // Step 3: Search each subreddit in parallel (with concurrency limit)
      const concurrencyLimit = 4; // Increased for better performance
      for (let i = 0; i < allSubreddits.length; i += concurrencyLimit) {
        const batch = allSubreddits.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(subreddit => 
          this.searchSubreddit(subreddit, query, language, redditTimeFilter)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            allPosts.push(...result.value);
            logger.debug(`✅ ${batch[index]}: ${result.value.length} posts`);
          } else {
            logger.warn(`❌ ${batch[index]}: ${result.reason || result.value?.error || 'Unknown error'}`);
          }
        });

        // Rate limiting between batches
        if (i + concurrencyLimit < allSubreddits.length) {
          await new Promise(resolve => setTimeout(resolve, 300)); // Reduced delay
        }
      }

      // Global search if we don't have enough results
      if (allPosts.length < 20) {
        try {
          logger.info('📡 Performing global Reddit search...');
          const globalPosts = await this.performGlobalSearch(query, redditTimeFilter);
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

  static async searchSubreddit(subreddit, query, language, timeFilter = 'week') {
    try {
      // Use top posts with time filter instead of hot posts
      const url = `${this.baseUrl}/r/${subreddit}/top.json?t=${timeFilter}&limit=25`;
      
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

      logger.debug(`Found ${posts.length} relevant posts in r/${subreddit} (timeFilter: ${timeFilter})`);
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

  static mapTimeFilter(timeFilter) {
    // Map custom time filters to Reddit's supported values
    // Reddit supports: hour, day, week, month, year, all
    const mapping = {
      'hour': 'hour',
      'day': 'day',
      'week': 'week',
      'month': 'month',
      '3months': 'year', // Reddit doesn't have 3-month, use year to get broader results
      '6months': 'year', // Reddit doesn't have 6-month, use year
      'year': 'year',
      'all': 'all'
    };
    
    return mapping[timeFilter] || 'week';
  }

  static async findRelevantSubreddits(query) {
    try {
      logger.info(`🔍 Finding relevant subreddits for: "${query}"`);
      
      // Clean and prepare search terms
      const searchTerms = query.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove special characters
        .split(/\s+/)
        .filter(term => term.length > 2) // Remove short words
        .slice(0, 5); // Limit to 5 most important terms

      const relevantSubreddits = new Set();

      // Method 1: Use Reddit's subreddit search API
      try {
        const searchUrl = `${this.baseUrl}/subreddits/search.json?q=${encodeURIComponent(query)}&limit=25&sort=relevance`;
        const response = await axios.get(searchUrl, {
          headers: { 'User-Agent': this.userAgent },
          timeout: this.timeout
        });

        if (response.data?.data?.children) {
          response.data.data.children.forEach(subreddit => {
            const subName = subreddit.data.display_name;
            if (subName && !this.isExcludedSubreddit(subName)) {
              relevantSubreddits.add(subName);
            }
          });
          logger.info(`📊 Found ${response.data.data.children.length} subreddits via Reddit search API`);
        }
      } catch (error) {
        logger.warn('Reddit subreddit search API failed, using fallback method:', error.message);
      }

      // Method 2: Use global search to find subreddits mentioned in posts
      try {
        const globalSearchUrl = `${this.baseUrl}/search.json?q=${encodeURIComponent(query)}&limit=50&sort=relevance&type=link`;
        const response = await axios.get(globalSearchUrl, {
          headers: { 'User-Agent': this.userAgent },
          timeout: this.timeout
        });

        if (response.data?.data?.children) {
          response.data.data.children.forEach(post => {
            const subreddit = post.data.subreddit;
            if (subreddit && !this.isExcludedSubreddit(subreddit)) {
              relevantSubreddits.add(subreddit);
            }
          });
          logger.info(`📊 Found ${response.data.data.children.length} subreddits via global search`);
        }
      } catch (error) {
        logger.warn('Reddit global search failed:', error.message);
      }

      // Method 3: Keyword-based subreddit suggestions
      const keywordSuggestions = this.getSubredditSuggestionsByKeywords(searchTerms);
      keywordSuggestions.forEach(sub => relevantSubreddits.add(sub));

      // Convert to array and limit results
      const result = Array.from(relevantSubreddits).slice(0, 30); // Limit to top 30
      logger.info(`🎯 Total relevant subreddits found: ${result.length}`);
      
      return result;

    } catch (error) {
      logger.error('Error finding relevant subreddits:', error);
      return []; // Return empty array on error
    }
  }

  static isExcludedSubreddit(subreddit) {
    const excluded = [
      'AskReddit', 'worldnews', 'news', 'politics', 'funny', 'memes',
      'gaming', 'pics', 'videos', 'aww', 'mildlyinteresting', 'todayilearned',
      'Showerthoughts', 'LifeProTips', 'explainlikeimfive', 'unpopularopinion',
      'AmItheAsshole', 'relationship_advice', 'relationships', 'tifu',
      'gonewild', 'nsfw', 'sex', 'dating', 'marriage', 'divorce'
    ];
    return excluded.includes(subreddit);
  }

  static getSubredditSuggestionsByKeywords(keywords) {
    const suggestions = [];
    
    // AI/Technology related
    if (keywords.some(k => ['ai', 'artificial', 'intelligence', 'machine', 'learning', 'ml'].includes(k))) {
      suggestions.push('artificial', 'MachineLearning', 'AI', 'datascience', 'computervision', 'deeplearning', 'nlp');
    }
    
    // Marketing related
    if (keywords.some(k => ['marketing', 'advertising', 'promotion', 'brand', 'campaign'].includes(k))) {
      suggestions.push('marketing', 'digitalmarketing', 'socialmedia', 'content_marketing', 'marketingautomation', 'advertising', 'PPC', 'SEO', 'growthmarketing');
    }
    
    // Business related
    if (keywords.some(k => ['business', 'startup', 'entrepreneur', 'company', 'corporate'].includes(k))) {
      suggestions.push('entrepreneur', 'startups', 'business', 'smallbusiness', 'investing', 'personalfinance');
    }
    
    // Technology related
    if (keywords.some(k => ['tech', 'technology', 'software', 'programming', 'coding', 'development'].includes(k))) {
      suggestions.push('technology', 'programming', 'software', 'webdev', 'cscareerquestions', 'learnprogramming');
    }
    
    // Health/Fitness related
    if (keywords.some(k => ['health', 'fitness', 'workout', 'exercise', 'nutrition', 'diet'].includes(k))) {
      suggestions.push('fitness', 'loseit', 'gainit', 'bodybuilding', 'nutrition', 'health');
    }
    
    // Finance related
    if (keywords.some(k => ['money', 'finance', 'investment', 'trading', 'crypto', 'bitcoin'].includes(k))) {
      suggestions.push('investing', 'personalfinance', 'cryptocurrency', 'stocks', 'trading');
    }
    
    // Education related
    if (keywords.some(k => ['learn', 'education', 'study', 'course', 'training', 'skill'].includes(k))) {
      suggestions.push('learnprogramming', 'studytips', 'college', 'university', 'careerguidance');
    }

    return suggestions;
  }
}

module.exports = RedditService;
