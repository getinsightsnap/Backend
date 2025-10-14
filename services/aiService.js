const axios = require('axios');
const logger = require('../utils/logger');

class AIService {
  static baseUrl = 'https://api.perplexity.ai';
  static timeout = 30000; // 30 seconds

  static async categorizePosts(posts, query) {
    if (!posts || posts.length === 0) {
      return {
        painPoints: [],
        trendingIdeas: [],
        contentIdeas: [],
        relevanceAnalysis: { totalRelevantPosts: 0, relevanceScore: 0, excludedPromotedContent: 0, excludedIrrelevantPosts: 0 }
      };
    }

    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey) {
        logger.warn('Perplexity API key not configured, using enhanced sentiment analysis');
        return this.enhancedSentimentAnalysis(posts, query);
      }

      // Use AI for sentiment analysis
      logger.info(`🤖 Using AI sentiment analysis for ${posts.length} posts with query: "${query}"`);
      return await this.aiSentimentAnalysis(posts, query);

    } catch (error) {
      logger.error('AI sentiment analysis error:', error);
      logger.info('Falling back to enhanced sentiment analysis');
      return this.enhancedSentimentAnalysis(posts, query);
    }
  }

  static async aiSentimentAnalysis(posts, query) {
    try {
      const maxPosts = Math.min(posts.length, 100);
      logger.info(`🤖 AI analyzing sentiment of ${maxPosts} posts using Perplexity AI...`);
      
      // Calculate average engagement for context
      const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0);
      const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

      // Prepare posts for AI analysis - mix all platforms together
      const postsText = posts.slice(0, maxPosts).map((post, index) => {
        const engagement = post.engagement || 0;
        const isHighEngagement = engagement > (avgEngagement * 2);
        const engagementIndicator = isHighEngagement ? '🔥 HIGH ENGAGEMENT' : '';
        return `${index + 1}. [${post.platform.toUpperCase()}] Posted ${post.timestamp} | Engagement: ${engagement} ${engagementIndicator}\n   ${post.content.substring(0, 200)}...`;
      }).join('\n\n');

      const prompt = `You are an expert social media sentiment analyst. Analyze these posts related to "${query}" and categorize them by SENTIMENT and INTENT, not by platform.

IMPORTANT: Mix posts from ALL platforms (Reddit, X/Twitter, YouTube) in each category. Do NOT separate by platform.

CATEGORIES BY SENTIMENT/INTENT:
1. PAIN POINTS: Posts expressing problems, frustrations, challenges, complaints, or negative experiences
2. TRENDING IDEAS: Posts about popular/viral discussions, news, emerging trends, or high-engagement content
3. CONTENT IDEAS: Posts offering solutions, tips, tutorials, educational content, or asking questions

RULES:
- Include posts that mention "${query}" or are related to it
- DISTRIBUTE posts across ALL THREE categories (don't put everything in one category)
- MIX platforms in each category - a category can have Reddit + X + YouTube posts together
- Prioritize high engagement posts for trending ideas
- Include posts asking questions as content ideas
- Include complaints and frustrations as pain points
- Be inclusive - include posts even if they only briefly mention the topic

Posts to analyze (${maxPosts} total):
${postsText}

Respond with ONLY a JSON object in this exact format:
{
  "painPoints": [list of post indices (1-based)],
  "trendingIdeas": [list of post indices (1-based)],
  "contentIdeas": [list of post indices (1-based)]
}

Example: {"painPoints": [1, 5, 8], "trendingIdeas": [2, 3, 7], "contentIdeas": [4, 6, 9]}`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new Error('No response from AI service');
      }

      // Parse AI response
      const categorization = JSON.parse(aiResponse);
      
      // Apply categorization to posts
      const result = {
        painPoints: this.getCategorizedPosts(posts, categorization.painPoints || []),
        trendingIdeas: this.getCategorizedPosts(posts, categorization.trendingIdeas || []),
        contentIdeas: this.getCategorizedPosts(posts, categorization.contentIdeas || []),
        relevanceAnalysis: {
          totalRelevantPosts: posts.length,
          relevanceScore: 1.0,
          excludedPromotedContent: 0,
          excludedIrrelevantPosts: 0
        }
      };

      logger.info(`✅ AI sentiment analysis complete: ${result.painPoints.length} pain points, ${result.trendingIdeas.length} trending ideas, ${result.contentIdeas.length} content ideas`);
      
      // Ensure all categories have results
      return this.ensureAllCategoriesHaveResults(result, posts);

    } catch (error) {
      logger.error('AI sentiment analysis error:', error);
      throw error;
    }
  }

  static enhancedSentimentAnalysis(posts, query) {
    logger.info(`🔄 Using enhanced sentiment analysis for ${posts.length} posts with query: "${query}"`);
    
    if (!posts || !Array.isArray(posts)) {
      logger.error('Invalid posts array in enhancedSentimentAnalysis');
      return {
        painPoints: [],
        trendingIdeas: [],
        contentIdeas: [],
        relevanceAnalysis: { totalRelevantPosts: 0, relevanceScore: 0, excludedPromotedContent: 0, excludedIrrelevantPosts: 0 }
      };
    }

    // Enhanced sentiment keywords
    const painKeywords = [
      'problem', 'issue', 'frustrated', 'difficult', 'hard', 'struggle', 'hate', 'annoying', 'broken',
      'fail', 'worst', 'terrible', 'awful', 'sucks', 'disappointed', 'angry', 'upset', 'complaint',
      'bug', 'error', 'glitch', 'not working', 'broken', 'slow', 'expensive', 'overpriced',
      'confused', 'lost', 'stuck', 'can\'t', 'won\'t', 'doesn\'t work', 'help me', 'fix this',
      'why is', 'how do i', 'trouble', 'issue with', 'having problems', 'struggling with',
      'frustrating', 'annoying', 'hate', 'terrible', 'awful', 'worst', 'sucks', 'broken',
      'doesn\'t work', 'not working', 'bug', 'error', 'glitch', 'slow', 'expensive'
    ];

    const trendingKeywords = [
      'trending', 'viral', 'popular', 'hot', 'new', 'latest', 'everyone', 'all over', 'everywhere',
      'breaking', 'just dropped', 'huge', 'massive', 'insane', 'crazy', 'amazing', 'incredible',
      'game changer', 'revolutionary', 'breakthrough', 'innovative', 'cutting edge', 'next level',
      'blowing up', 'going viral', 'happening now', 'check this out', 'you need to see',
      'love this', 'obsessed', 'addicted', 'can\'t stop', 'so good', 'perfect', 'excellent'
    ];

    const contentKeywords = [
      'how to', 'tutorial', 'learn', 'teach', 'explain', 'guide', 'want to know', 'help',
      'tips', 'tricks', 'advice', 'recommend', 'suggest', 'what is', 'where to', 'when to',
      'why', 'best way', 'step by step', 'beginner', 'advanced', 'pro tip', 'expert',
      'should i', 'what do you think', 'opinions', 'experience', 'review',
      'anyone know', 'help me', 'how do', 'what\'s the best', 'recommendations'
    ];

    // Calculate average engagement
    const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0);
    const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;
    
    logger.info(`📊 Average engagement: ${avgEngagement.toFixed(2)}`);

    // Score posts by sentiment
    const scoredPosts = posts.map(post => {
      const content = post.content.toLowerCase();
      
      // Calculate sentiment scores
      const painScore = painKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const trendingScore = trendingKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const contentScore = contentKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );

      // Add engagement bonus
      const engagement = post.engagement || 0;
      const engagementBonus = Math.log(engagement + 1) / 10;
      
      // Add question bonus for content ideas
      const questionBonus = (content.match(/\?/g) || []).length * 0.5;
      
      // Add emotional words bonus
      const emotionalWords = ['love', 'hate', 'amazing', 'terrible', 'awesome', 'awful', 'incredible', 'horrible'];
      const emotionalBonus = emotionalWords.filter(word => content.includes(word)).length * 0.3;
      
      return {
        post,
        painScore: painScore + engagementBonus + emotionalBonus,
        trendingScore: trendingScore + engagementBonus + (engagement > avgEngagement * 2 ? 1 : 0),
        contentScore: contentScore + engagementBonus + questionBonus
      };
    });

    // Categorize posts by highest sentiment score
    const painPoints = [];
    const trendingIdeas = [];
    const contentIdeas = [];

    scoredPosts.forEach(scored => {
      const { post, painScore, trendingScore, contentScore } = scored;
      const maxScore = Math.max(painScore, trendingScore, contentScore);
      
      if (maxScore === painScore) {
        painPoints.push(post);
      } else if (maxScore === trendingScore) {
        trendingIdeas.push(post);
      } else {
        contentIdeas.push(post);
      }
    });

    // Sort by engagement within each category
    painPoints.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    trendingIdeas.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    contentIdeas.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));

    const result = {
      painPoints: painPoints.slice(0, 50),
      trendingIdeas: trendingIdeas.slice(0, 50),
      contentIdeas: contentIdeas.slice(0, 50),
      relevanceAnalysis: {
        totalRelevantPosts: posts.length,
        relevanceScore: 1.0,
        excludedPromotedContent: 0,
        excludedIrrelevantPosts: 0
      }
    };

    logger.info(`✅ Enhanced sentiment analysis: ${result.painPoints.length} pain points, ${result.trendingIdeas.length} trending ideas, ${result.contentIdeas.length} content ideas`);
    
    // Ensure all categories have results
    return this.ensureAllCategoriesHaveResults(result, posts);
  }

  static ensureAllCategoriesHaveResults(result, allPosts) {
    logger.info('🔄 Ensuring all sentiment categories have results...');
    
    // Ensure each category has at least some posts
    const minPostsPerCategory = Math.max(1, Math.floor(allPosts.length / 10));
    
    // If any category is empty, redistribute from other categories
    if (result.painPoints.length === 0 && allPosts.length > 0) {
      logger.info(`🔄 Pain points empty, redistributing posts from other categories`);
      const otherPosts = [...result.trendingIdeas, ...result.contentIdeas];
      result.painPoints = otherPosts.slice(0, minPostsPerCategory);
    }

    if (result.trendingIdeas.length === 0 && allPosts.length > 0) {
      logger.info(`🔄 Trending ideas empty, redistributing posts from other categories`);
      const otherPosts = [...result.painPoints, ...result.contentIdeas];
      result.trendingIdeas = otherPosts.slice(0, minPostsPerCategory);
    }

    if (result.contentIdeas.length === 0 && allPosts.length > 0) {
      logger.info(`🔄 Content ideas empty, redistributing posts from other categories`);
      const otherPosts = [...result.painPoints, ...result.trendingIdeas];
      result.contentIdeas = otherPosts.slice(0, minPostsPerCategory);
    }

    // Log platform distribution for each category (mixed platforms)
    ['painPoints', 'trendingIdeas', 'contentIdeas'].forEach(categoryName => {
      const platformCounts = this.getPlatformCounts(result[categoryName]);
      logger.info(`📊 ${categoryName}: ${result[categoryName].length} posts - Reddit: ${platformCounts.reddit}, X: ${platformCounts.x}, YouTube: ${platformCounts.youtube} (MIXED)`);
    });

    return result;
  }

  static getCategorizedPosts(posts, indices) {
    return indices
      .filter(index => index >= 1 && index <= posts.length) // 1-based indexing
      .map(index => posts[index - 1]) // Convert to 0-based
      .filter(Boolean);
  }

  static getPlatformCounts(posts) {
    const counts = { reddit: 0, x: 0, youtube: 0 };
    posts.forEach(post => {
      if (counts.hasOwnProperty(post.platform)) {
        counts[post.platform]++;
      }
    });
    return counts;
  }

  static async generateContentIdeas(query, posts) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey) {
        return this.generateSimpleContentIdeas(query, posts);
      }

      const prompt = `Based on these social media posts about "${query}", generate 5 creative content ideas:

Posts context:
${posts.slice(0, 10).map(post => `- ${post.content.substring(0, 100)}...`).join('\n')}

Generate 5 specific, actionable content ideas that would resonate with this audience. Each idea should include:
1. A catchy title
2. A brief description
3. The target platform (blog, Instagram, YouTube, etc.)

Format as a JSON array of objects with "title", "description", and "platform" fields.`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0]?.message?.content;
      return JSON.parse(aiResponse || '[]');

    } catch (error) {
      logger.error('AI content generation error:', error);
      return this.generateSimpleContentIdeas(query, posts);
    }
  }

  static generateSimpleContentIdeas(query, posts) {
    const ideas = [
      {
        title: `"${query}" - Complete Guide`,
        description: `A comprehensive guide covering everything about ${query}`,
        platform: 'blog'
      },
      {
        title: `Top 10 ${query} Tips`,
        description: `A listicle featuring the most valuable tips about ${query}`,
        platform: 'Instagram'
      },
      {
        title: `Common ${query} Mistakes to Avoid`,
        description: `Educational content highlighting frequent mistakes and how to avoid them`,
        platform: 'YouTube'
      },
      {
        title: `${query} Success Stories`,
        description: `Case studies and success stories related to ${query}`,
        platform: 'LinkedIn'
      },
      {
        title: `${query} Trends for 2024`,
        description: `Analysis of current trends and future predictions for ${query}`,
        platform: 'Twitter'
      }
    ];

    return ideas;
  }
}

module.exports = AIService;
