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
      
      // Calculate average engagement for context
      const avgEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0) / posts.length;

      // Prepare posts for AI analysis with timestamps, engagement, and context
      const postsText = posts.slice(0, maxPosts).map((post, index) => {
        const engagement = post.engagement || 0;
        const isHighEngagement = engagement > (avgEngagement * 2);
        const engagementIndicator = isHighEngagement ? '🔥 HIGH ENGAGEMENT' : '';
        return `${index + 1}. [${post.platform}] Posted ${post.timestamp} | Engagement: ${engagement} ${engagementIndicator}\n   ${post.content.substring(0, 180)}...`;
      }).join('\n\n');

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
   - PRIORITIZE posts with HIGH ENGAGEMENT (marked with 🔥)
   - PRIORITIZE recent posts (posted within last few days)
   - Look for posts that indicate something is "blowing up" or "going viral"
3. CONTENT IDEAS: Posts offering solutions, tips, tutorials, or valuable insights about "${query}"

Posts to analyze (${maxPosts} total):
${postsText}

IMPORTANT: 
- Only include post indices that are DIRECTLY relevant to "${query}"
- For TRENDING IDEAS, heavily weight posts with high engagement and recent timestamps
- Posts marked with 🔥 HIGH ENGAGEMENT should be strongly considered for trending category

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

    // Calculate average engagement for velocity detection
    const avgEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0) / posts.length;
    
    logger.info(`📊 Average engagement across ${posts.length} posts: ${avgEngagement.toFixed(2)}`);

    const painPoints = [];
    const trendingIdeas = [];
    const contentIdeas = [];
    let excludedPromoted = 0;
    let excludedIrrelevant = 0;

    // Enhanced scoring with engagement, recency, and velocity
    const scoredPosts = posts.map(post => {
      const content = post.content.toLowerCase();
      const queryLower = query.toLowerCase();
      
      // Check if post is promoted/sponsored content
      const isPromoted = promotedKeywords.some(keyword => content.includes(keyword));
      if (isPromoted) {
        excludedPromoted++;
        return null;
      }

      // Check relevance to query (basic keyword matching)
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      const hasQueryRelevance = queryWords.some(word => content.includes(word));
      
      if (!hasQueryRelevance) {
        excludedIrrelevant++;
        return null;
      }
      
      // 1. ENGAGEMENT SCORING
      // Normalize engagement score (0-1 scale)
      const engagement = post.engagement || 0;
      const engagementScore = Math.min(engagement / (avgEngagement * 3), 1); // Cap at 3x average
      
      // 2. RECENCY WEIGHTING
      // Calculate how old the post is (in hours)
      let recencyMultiplier = 1;
      if (post.timestamp) {
        try {
          const postDate = new Date(post.timestamp);
          const hoursOld = (Date.now() - postDate.getTime()) / (1000 * 60 * 60);
          // Decay over 1 week (168 hours), recent posts get higher weight
          recencyMultiplier = Math.max(0.3, 1 - (hoursOld / 336)); // 2 weeks decay, min 0.3
        } catch (e) {
          // If timestamp parsing fails, use default multiplier
          recencyMultiplier = 0.5;
        }
      }
      
      // 3. VELOCITY DETECTION
      // Posts with 2x+ average engagement are "accelerating"
      const isAccelerating = engagement > (avgEngagement * 2);
      const velocityBonus = isAccelerating ? 1.5 : 1.0;
      
      // Base keyword scoring
      const painScore = painPointKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const trendingScore = trendingKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const contentScore = contentKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );

      // Apply enhanced scoring to trending (engagement + recency + velocity matter most for trends)
      const enhancedTrendingScore = (
        trendingScore * 1.0 +                    // Base keyword score
        engagementScore * 5.0 +                  // Engagement heavily weighted
        recencyMultiplier * 3.0 +                // Recent posts favored
        (isAccelerating ? velocityBonus * 2 : 0) // Accelerating posts get bonus
      );

      // Pain points and content ideas get moderate engagement boost
      const enhancedPainScore = painScore + (engagementScore * 2);
      const enhancedContentScore = contentScore + (engagementScore * 1.5);

      return {
        post,
        painScore: enhancedPainScore,
        trendingScore: enhancedTrendingScore,
        contentScore: enhancedContentScore,
        engagement,
        recencyMultiplier,
        isAccelerating
      };
    }).filter(Boolean); // Remove nulls (promoted/irrelevant posts)

    // Sort by score and categorize
    scoredPosts.forEach(scored => {
      const { post, painScore, trendingScore, contentScore, isAccelerating } = scored;
      
      // Categorize based on highest score
      if (painScore > trendingScore && painScore > contentScore) {
        painPoints.push(post);
      } else if (trendingScore > contentScore) {
        trendingIdeas.push(post);
        if (isAccelerating) {
          logger.debug(`🚀 Accelerating trend detected: "${post.content.substring(0, 50)}..." (engagement: ${scored.engagement})`);
        }
      } else if (contentScore > 0) {
        contentIdeas.push(post);
      } else {
        // Default to content ideas if no clear category
        contentIdeas.push(post);
      }
    });

    // Sort trending ideas by engagement and recency (most engaging + recent first)
    trendingIdeas.sort((a, b) => {
      const engagementDiff = (b.engagement || 0) - (a.engagement || 0);
      if (Math.abs(engagementDiff) > avgEngagement * 0.5) {
        return engagementDiff; // Significant engagement difference
      }
      // If engagement similar, sort by recency
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    const totalRelevant = painPoints.length + trendingIdeas.length + contentIdeas.length;

    logger.info(`✅ Enhanced categorization: ${painPoints.length} pain points, ${trendingIdeas.length} trending (${trendingIdeas.filter(p => (p.engagement || 0) > avgEngagement * 2).length} accelerating), ${contentIdeas.length} content ideas`);

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
