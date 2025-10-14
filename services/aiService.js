const axios = require('axios');
const logger = require('../utils/logger');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client for rating insights (with fallbacks)
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    logger.info('✅ Supabase client initialized for rating insights');
  } else {
    logger.warn('⚠️ Supabase credentials not configured - rating insights disabled');
  }
} catch (error) {
  logger.error('❌ Failed to initialize Supabase client:', error);
  supabase = null;
}

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

      // Step 1: AI-powered relevance filtering
      logger.info(`🤖 AI analyzing ${posts.length} posts for relevance to query: "${query}"`);
      const relevantPosts = await this.filterRelevantPosts(posts, query);
      
      if (relevantPosts.length === 0) {
        logger.warn('No relevant posts found after AI filtering');
        return {
          painPoints: [],
          trendingIdeas: [],
          contentIdeas: [],
          relevanceAnalysis: { 
            totalRelevantPosts: 0, 
            relevanceScore: 0, 
            excludedPromotedContent: 0, 
            excludedIrrelevantPosts: posts.length 
          }
        };
      }

      // Step 2: AI-powered sentiment categorization
      logger.info(`🤖 Using AI sentiment analysis for ${relevantPosts.length} relevant posts with query: "${query}"`);
      const result = await this.aiSentimentAnalysis(relevantPosts, query);
      
      // Update relevance analysis
      result.relevanceAnalysis = {
        totalRelevantPosts: relevantPosts.length,
        relevanceScore: relevantPosts.length / posts.length,
        excludedPromotedContent: 0,
        excludedIrrelevantPosts: posts.length - relevantPosts.length
      };

      return result;

    } catch (error) {
      logger.error('AI analysis error:', error);
      logger.info('Falling back to enhanced sentiment analysis');
      return this.enhancedSentimentAnalysis(posts, query);
    }
  }

  static async filterRelevantPosts(posts, query) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        logger.warn('No Perplexity API key, skipping AI relevance filtering');
        return posts; // Return all posts if no API key
      }

      logger.info(`🔍 AI filtering ${posts.length} posts for relevance to: "${query}"`);
      
      // Process posts in batches to avoid token limits
      const batchSize = 50;
      const relevantPosts = [];
      
      for (let i = 0; i < posts.length; i += batchSize) {
        const batch = posts.slice(i, i + batchSize);
        const batchRelevant = await this.filterBatchRelevance(batch, query, i);
        relevantPosts.push(...batchRelevant);
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < posts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`✅ AI relevance filtering complete: ${relevantPosts.length}/${posts.length} posts are relevant`);
      return relevantPosts;
      
    } catch (error) {
      logger.error('AI relevance filtering error:', error);
      logger.info('Falling back to returning all posts');
      return posts; // Return all posts on error
    }
  }

  static async filterBatchRelevance(posts, query, offset) {
    try {
      // Get historical rating data for this query to improve relevance
      const ratingInsights = await this.getRatingInsights(query);
      
      const postsText = posts.map((post, index) => 
        `${offset + index + 1}. [${post.platform.toUpperCase()}] ${post.source} (${post.engagement} engagement):\n   "${post.content.substring(0, 300)}${post.content.length > 300 ? '...' : ''}"`
      ).join('\n\n');

      let ratingContext = '';
      if (ratingInsights && ratingInsights.length > 0) {
        ratingContext = `\n\nLEARNING FROM USER FEEDBACK:\nPrevious users rated posts about "${query}" with these patterns:\n${ratingInsights.map(insight => `- ${insight.platform}: Average rating ${insight.avg_rating}/5 (${insight.total_ratings} ratings) - ${insight.improvement_suggestions || 'No specific suggestions'}`).join('\n')}\n\nUse this feedback to better understand what users consider relevant for "${query}".`;
      }

      const prompt = `You are an expert content relevance analyzer. Your task is to determine which posts are ACTUALLY RELEVANT to the user's search query.

SEARCH QUERY: "${query}"

ANALYSIS CRITERIA:
1. The post must be directly related to the search topic or contain meaningful discussion about it
2. Posts that only mention keywords without context are NOT relevant
3. Posts about completely different topics are NOT relevant
4. Consider semantic meaning, not just keyword presence
5. Posts asking questions about the topic ARE relevant
6. Posts sharing experiences related to the topic ARE relevant
7. Posts offering solutions or advice about the topic ARE relevant${ratingContext}

EXAMPLES:
- Query: "workflow automation for real estate agents"
- RELEVANT: Posts about real estate automation tools, CRM systems for agents, workflow challenges in real estate
- NOT RELEVANT: Posts about personal finance, career changes, or general business topics that happen to mention "workflow"

Posts to analyze:
${postsText}

Respond with ONLY a JSON object containing the indices (1-based) of relevant posts:
{"relevant": [1, 3, 7, 12, ...]}

If no posts are relevant, respond with: {"relevant": []}`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.1 // Low temperature for consistent relevance filtering
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from AI relevance filter');
      }

      // Parse AI response
      const result = JSON.parse(aiResponse);
      const relevantIndices = result.relevant || [];
      
      // Convert 1-based indices to 0-based and filter posts
      const relevantPosts = relevantIndices
        .filter(index => index >= 1 && index <= posts.length)
        .map(index => posts[index - 1])
        .filter(Boolean);

      logger.info(`📊 Batch ${Math.floor(offset/batchSize) + 1}: ${relevantPosts.length}/${posts.length} posts relevant`);
      return relevantPosts;

    } catch (error) {
      logger.error('Batch relevance filtering error:', error);
      // Return all posts in batch if filtering fails
      return posts;
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

      const prompt = `You are an expert social media sentiment analyst specializing in "${query}". Analyze these posts and categorize them by SENTIMENT and INTENT, not by platform.

SEARCH CONTEXT: "${query}"
Focus on understanding what people are saying about this specific topic across all platforms.

IMPORTANT: Mix posts from ALL platforms (Reddit, X/Twitter, YouTube) in each category. Do NOT separate by platform.

CATEGORIES BY SENTIMENT/INTENT:
1. PAIN POINTS: Posts expressing problems, frustrations, challenges, complaints, or negative experiences specifically related to "${query}"
2. TRENDING IDEAS: Posts about popular/viral discussions, news, emerging trends, or high-engagement content related to "${query}"
3. CONTENT IDEAS: Posts offering solutions, tips, tutorials, educational content, or asking questions about "${query}"

ANALYSIS RULES:
- Focus on posts that are directly relevant to "${query}" context
- DISTRIBUTE posts across ALL THREE categories (don't put everything in one category)
- MIX platforms in each category - a category can have Reddit + X + YouTube posts together
- Prioritize high engagement posts for trending ideas
- Include posts asking questions about the topic as content ideas
- Include complaints and frustrations about the topic as pain points
- Consider the broader context of "${query}" when categorizing

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

  // Get rating insights for a query to improve AI relevance
  static async getRatingInsights(query) {
    try {
      // Return null if Supabase is not configured
      if (!supabase) {
        logger.debug('Supabase not configured - skipping rating insights');
        return null;
      }

      const normalizedQuery = query.toLowerCase().trim();
      
      // Get analytics data for this query
      const { data: analytics, error } = await supabase
        .from('relevance_analytics')
        .select('platform, avg_rating, total_ratings')
        .eq('search_query', normalizedQuery);

      if (error) {
        logger.warn('Failed to fetch rating insights:', error);
        return null;
      }

      // Get learning patterns for this query
      const { data: patterns, error: patternsError } = await supabase
        .from('ai_learning_patterns')
        .select('platform, avg_relevance_score, improvement_suggestions')
        .eq('search_query', normalizedQuery);

      if (patternsError) {
        logger.warn('Failed to fetch learning patterns:', patternsError);
      }

      // Combine analytics and patterns
      const insights = analytics?.map(analytic => ({
        platform: analytic.platform,
        avg_rating: parseFloat(analytic.avg_rating),
        total_ratings: analytic.total_ratings,
        improvement_suggestions: patterns?.find(p => p.platform === analytic.platform)?.improvement_suggestions || null
      })) || [];

      return insights.length > 0 ? insights : null;

    } catch (error) {
      logger.error('Error getting rating insights:', error);
      return null;
    }
  }
}

module.exports = AIService;
