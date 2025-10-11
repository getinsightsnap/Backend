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
        logger.warn('Perplexity API key not configured, using simple categorization');
        return this.simpleCategorization(posts);
      }

      // Increase post limit to 100 for better analysis
      const maxPosts = Math.min(posts.length, 100);
      logger.info(`🤖 Categorizing ${maxPosts} posts using AI with sentiment analysis...`);
      
      // Prepare posts for AI analysis with timestamps and more context
      const postsText = posts.slice(0, maxPosts).map((post, index) => 
        `${index + 1}. [${post.platform}] Posted ${post.timestamp}: ${post.content.substring(0, 180)}...`
      ).join('\n\n');

      const prompt = `Analyze these social media posts and ONLY include posts that are directly relevant to "${query}".

CRITICAL FILTERING RULES:
1. ONLY include posts that are directly about "${query}" or closely related topics
2. EXCLUDE promoted content, sponsored posts, or advertisements
3. EXCLUDE posts that only mention "${query}" in passing without being about the topic
4. EXCLUDE irrelevant posts that happen to contain the keyword "${query}"

USER SEARCH INTENT: "${query}" - The user wants insights specifically about this topic.

For each RELEVANT post, categorize into three groups:

1. PAIN POINTS: Posts expressing problems, frustrations, or challenges related to "${query}"
2. TRENDING IDEAS: Posts about popular/viral discussions, news, or emerging trends about "${query}"
3. CONTENT IDEAS: Posts offering solutions, tips, tutorials, or valuable insights about "${query}"

Posts to analyze (${maxPosts} total):
${postsText}

IMPORTANT: Only include post indices that are DIRECTLY relevant to "${query}". If a post is not about "${query}", do not include it in any category.

Respond with JSON:
{
  "painPoints": [list of RELEVANT post indices about problems with "${query}"],
  "trendingIdeas": [list of RELEVANT post indices about trends in "${query}"], 
  "contentIdeas": [list of RELEVANT post indices about solutions for "${query}"],
  "relevanceAnalysis": {
    "totalRelevantPosts": number,
    "relevanceScore": 0.0-1.0,
    "excludedPromotedContent": number,
    "excludedIrrelevantPosts": number
  }
}

Only include the JSON response, no other text.`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500, // Increased for sentiment analysis
        temperature: 0.2  // Lower temperature for more consistent sentiment analysis
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 40000 // Increased timeout for larger analysis
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
        relevanceAnalysis: categorization.relevanceAnalysis || {
          totalRelevantPosts: 0,
          relevanceScore: 0,
          excludedPromotedContent: 0,
          excludedIrrelevantPosts: 0
        }
      };

      logger.info(`✅ AI categorization complete: ${result.painPoints.length} pain points, ${result.trendingIdeas.length} trending ideas, ${result.contentIdeas.length} content ideas`);
      logger.info(`📊 Relevance: ${result.relevanceAnalysis.totalRelevantPosts} relevant posts (score: ${result.relevanceAnalysis.relevanceScore}), excluded: ${result.relevanceAnalysis.excludedPromotedContent} promoted + ${result.relevanceAnalysis.excludedIrrelevantPosts} irrelevant`);
      
      return result;

    } catch (error) {
      logger.error('AI categorization error:', error);
      logger.info('Falling back to simple categorization');
      return this.simpleCategorization(posts, query);
    }
  }

  static getCategorizedPosts(posts, indices) {
    return indices
      .filter(index => index >= 0 && index < posts.length)
      .map(index => posts[index])
      .filter(Boolean);
  }

  static simpleCategorization(posts, query = '') {
    // Keywords that indicate promoted/sponsored content (to exclude)
    const promotedKeywords = [
      'sponsored', 'promoted', 'ad', 'advertisement', 'paid partnership',
      'affiliate', 'commission', 'buy now', 'click here', 'link in bio',
      'swipe up', 'use code', 'discount code', 'promo code'
    ];

    // Enhanced keyword lists with sentiment indicators
    const painPointKeywords = [
      // Negative sentiment words
      'problem', 'issue', 'struggle', 'difficult', 'hard', 'frustrated', 'annoying',
      'hate', 'terrible', 'awful', 'worst', 'broken', 'doesn\'t work', 'failed',
      'disappointed', 'upset', 'angry', 'complaint', 'bug', 'error', 'sucks',
      'horrible', 'pathetic', 'useless', 'waste', 'regret', 'disappointed',
      'annoying', 'ridiculous', 'stupid', 'dumb', 'hate', 'loathe', 'despise'
    ];

    const trendingKeywords = [
      // Positive sentiment + trending indicators
      'viral', 'trending', 'popular', 'hot', 'buzz', 'hype', 'craze', 'fad',
      'everyone is talking about', 'all over', 'blowing up', 'going viral',
      'trend', 'happening now', 'latest', 'new', 'amazing', 'love', 'awesome',
      'incredible', 'fantastic', 'brilliant', 'game changer', 'mind blown',
      'obsessed', 'addicted', 'can\'t stop', 'so good', 'perfect', 'excellent'
    ];

    const contentKeywords = [
      // Solution-oriented positive words
      'tip', 'tutorial', 'guide', 'how to', 'solution', 'advice', 'recommend',
      'best', 'top', 'list', 'check out', 'try this', 'learn', 'trick',
      'hack', 'secret', 'insider', 'expert', 'pro', 'professional', 'works',
      'helpful', 'useful', 'effective', 'success', 'improve', 'better',
      'step by step', 'easy way', 'quick fix', 'simple', 'clear', 'understand'
    ];

    const painPoints = [];
    const trendingIdeas = [];
    const contentIdeas = [];
    let excludedPromoted = 0;
    let excludedIrrelevant = 0;

    posts.forEach(post => {
      const content = post.content.toLowerCase();
      const queryLower = query.toLowerCase();
      
      // Check if post is promoted/sponsored content
      const isPromoted = promotedKeywords.some(keyword => content.includes(keyword));
      if (isPromoted) {
        excludedPromoted++;
        return; // Skip promoted content
      }

      // Check relevance to query (basic keyword matching)
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      const hasQueryRelevance = queryWords.some(word => content.includes(word));
      
      if (!hasQueryRelevance) {
        excludedIrrelevant++;
        return; // Skip irrelevant posts
      }
      
      const painScore = painPointKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const trendingScore = trendingKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const contentScore = contentKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );

      // Categorize based on highest score
      if (painScore > trendingScore && painScore > contentScore) {
        painPoints.push(post);
      } else if (trendingScore > contentScore) {
        trendingIdeas.push(post);
      } else if (contentScore > 0) {
        contentIdeas.push(post);
      } else {
        // Default to content ideas if no clear category
        contentIdeas.push(post);
      }
    });

    const totalRelevant = painPoints.length + trendingIdeas.length + contentIdeas.length;

    return {
      painPoints: painPoints.slice(0, 50),
      trendingIdeas: trendingIdeas.slice(0, 50),
      contentIdeas: contentIdeas.slice(0, 50),
      relevanceAnalysis: {
        totalRelevantPosts: totalRelevant,
        relevanceScore: totalRelevant > 0 ? Math.min(totalRelevant / posts.length, 1) : 0,
        excludedPromotedContent: excludedPromoted,
        excludedIrrelevantPosts: excludedIrrelevant
      }
    };
  }

  static async generateContentIdeas(query, posts) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey) {
        return this.generateSimpleContentIdeas(query, posts);
      }

      const prompt = `Based on these social media posts about "${query}", generate 5 creative content ideas for a blog or social media:

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
