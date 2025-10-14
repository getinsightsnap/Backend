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
        return this.simpleCategorization(posts, query);
      }

      // Increase post limit to 100 for better analysis
      const maxPosts = Math.min(posts.length, 100);
      logger.info(`🤖 Categorizing ${maxPosts} posts using AI with sentiment analysis...`);
      
      // Calculate average engagement for context
      const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0);
      const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

      // Prepare posts for AI analysis with timestamps, engagement, and context
      const postsText = posts.slice(0, maxPosts).map((post, index) => {
        const engagement = post.engagement || 0;
        const isHighEngagement = engagement > (avgEngagement * 2);
        const engagementIndicator = isHighEngagement ? '🔥 HIGH ENGAGEMENT' : '';
        return `${index + 1}. [${post.platform}] Posted ${post.timestamp} | Engagement: ${engagement} ${engagementIndicator}\n   ${post.content.substring(0, 180)}...`;
      }).join('\n\n');

      const prompt = `Analyze these social media posts related to "${query}". Include posts that are relevant to the topic, even if they mention it in passing or discuss related aspects.

FILTERING RULES:
1. INCLUDE posts that are about "${query}" or closely related topics
2. INCLUDE posts that mention "${query}" in context, even if not the main focus
3. EXCLUDE only obviously promoted content, sponsored posts, or advertisements
4. EXCLUDE posts that are completely unrelated to "${query}" (e.g., random spam)
5. BE INCLUSIVE: If a post has any connection to "${query}", include it

USER SEARCH INTENT: "${query}" - The user wants insights about this topic and related discussions.

For each RELEVANT post, categorize into three groups (ensure ALL categories get posts):

1. PAIN POINTS: Posts expressing problems, frustrations, challenges, or negative experiences related to "${query}"
   - Look for complaints, issues, difficulties, struggles
   - Include posts asking for help or expressing confusion
   - Even minor frustrations count as pain points

2. TRENDING IDEAS: Posts about popular/viral discussions, news, or emerging trends related to "${query}"
   - PRIORITIZE posts with HIGH ENGAGEMENT (marked with 🔥)
   - PRIORITIZE recent posts (posted within last few days)
   - Look for posts that indicate something is "blowing up" or "going viral"
   - Include discussions about new features, updates, or developments

3. CONTENT IDEAS: Posts offering solutions, tips, tutorials, or valuable insights about "${query}"
   - Include educational content, how-to posts, recommendations
   - Include posts sharing experiences or success stories
   - Include questions that could inspire content creation

Posts to analyze (${maxPosts} total):
${postsText}

CRITICAL REQUIREMENTS:
- DISTRIBUTE posts across ALL THREE categories (pain points, trending ideas, content ideas)
- Each category should have at least some posts (aim for balanced distribution)
- ENSURE platform diversity: try to include posts from Reddit, X (Twitter), and YouTube in each category when possible
- For TRENDING IDEAS, heavily weight posts with high engagement and recent timestamps
- Posts marked with 🔥 HIGH ENGAGEMENT should be strongly considered for trending category
- If a post could fit multiple categories, choose the most appropriate one
- Prioritize posts from different platforms to ensure diverse perspectives in each category

Respond with JSON:
{
  "painPoints": [list of post indices about problems/frustrations with "${query}"],
  "trendingIdeas": [list of post indices about trends/viral content related to "${query}"], 
  "contentIdeas": [list of post indices about solutions/insights for "${query}"],
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
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        postsCount: posts?.length || 0,
        query: query
      });
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
    try {
      logger.info(`🔄 Using simple categorization for ${posts.length} posts with query: "${query}"`);
      
      // Validate posts array
      if (!posts || !Array.isArray(posts)) {
        logger.error('Invalid posts array in simpleCategorization');
        return {
          painPoints: [],
          trendingIdeas: [],
          contentIdeas: [],
          relevanceAnalysis: { totalRelevantPosts: 0, relevanceScore: 0, excludedPromotedContent: 0, excludedIrrelevantPosts: 0 }
        };
      }
      
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
    const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0);
    const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;
    
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

      // Check relevance to query (VERY RELAXED filtering - include most posts)
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      
      // For single word queries, must match
      // For multi-word queries, require at least 1 word to match (very relaxed)
      const minWordsRequired = queryWords.length === 1 ? 1 : 1; // Always just 1 word for multi-word queries
      const matchedWords = queryWords.filter(word => content.includes(word));
      
      const hasQueryRelevance = matchedWords.length >= minWordsRequired;
      
      if (!hasQueryRelevance) {
        excludedIrrelevant++;
        logger.debug(`Excluded irrelevant post: "${post.content.substring(0, 50)}..." (matched ${matchedWords.length}/${queryWords.length} query words)`);
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

    // Sort by score and categorize - ensure balanced distribution across all categories
    // First pass: Categorize posts based on their strongest category
    scoredPosts.forEach(scored => {
      const { post, painScore, trendingScore, contentScore, isAccelerating } = scored;
      
      // Determine highest score (NO minimum threshold - categorize all posts)
      const maxScore = Math.max(painScore, trendingScore, contentScore);
      
      // Categorize based on highest score
      if (maxScore === painScore) {
        painPoints.push(post);
        logger.debug(`📍 Pain point: "${post.content.substring(0, 40)}..." (score: ${painScore.toFixed(2)})`);
      } else if (maxScore === trendingScore) {
        trendingIdeas.push(post);
        if (isAccelerating) {
          logger.debug(`🚀 Accelerating trend: "${post.content.substring(0, 40)}..." (score: ${trendingScore.toFixed(2)}, engagement: ${scored.engagement})`);
        }
      } else {
        contentIdeas.push(post);
      }
    });

    // Second pass: Ensure all categories have posts AND platform diversity
    const totalPosts = scoredPosts.length;
    const minPostsPerCategory = Math.max(1, Math.floor(totalPosts / 10)); // At least 10% in each category
    
    // Ensure platform diversity in each category (at least 1 post from each platform if available)
    const ensurePlatformDiversity = (categoryPosts, categoryName, allAvailablePosts) => {
      try {
        const platforms = ['reddit', 'x', 'youtube'];
        const currentPlatforms = new Set(categoryPosts.map(p => p && p.platform).filter(Boolean));
        const missingPlatforms = platforms.filter(platform => !currentPlatforms.has(platform));
        
        if (missingPlatforms.length > 0) {
          logger.info(`🔄 ${categoryName} missing platforms: ${missingPlatforms.join(', ')}, adding posts for diversity`);
          
          missingPlatforms.forEach(platform => {
            try {
              // Find best post from missing platform that's not already used
              const usedIds = new Set(categoryPosts.map(p => p && p.id).filter(Boolean));
              const availableFromPlatform = allAvailablePosts
                .filter(p => p && p.platform === platform && p.id && !usedIds.has(p.id))
                .sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
              
              if (availableFromPlatform.length > 0) {
                categoryPosts.push(availableFromPlatform[0]);
                logger.debug(`  Added ${platform} post to ${categoryName}: "${(availableFromPlatform[0].content || '').substring(0, 40)}..."`);
              }
            } catch (platformError) {
              logger.error(`Error adding ${platform} to ${categoryName}:`, platformError);
            }
          });
        }
      } catch (error) {
        logger.error(`Error in ensurePlatformDiversity for ${categoryName}:`, error);
      }
      
      return categoryPosts;
    };

    // Apply platform diversity to each category
    try {
      const allPosts = scoredPosts.map(s => s && s.post).filter(Boolean);
      painPoints = ensurePlatformDiversity(painPoints, 'pain points', allPosts);
      trendingIdeas = ensurePlatformDiversity(trendingIdeas, 'trending ideas', allPosts);
      contentIdeas = ensurePlatformDiversity(contentIdeas, 'content ideas', allPosts);
    } catch (error) {
      logger.error('Error applying platform diversity:', error);
      // Continue without platform diversity if there's an error
    }

    // Third pass: Fill empty categories with balanced distribution
    if (painPoints.length === 0 && totalPosts > 0) {
      logger.info(`🔄 No pain points found, redistributing from other categories (min: ${minPostsPerCategory})`);
      // Take posts from content ideas first, then trending
      const postsToMove = [...contentIdeas.slice(0, minPostsPerCategory), ...trendingIdeas.slice(0, minPostsPerCategory)];
      painPoints.push(...postsToMove.slice(0, minPostsPerCategory));
      // Remove moved posts from original categories
      const movedIds = new Set(postsToMove.slice(0, minPostsPerCategory).map(p => p.id));
      contentIdeas = contentIdeas.filter(p => !movedIds.has(p.id));
      trendingIdeas = trendingIdeas.filter(p => !movedIds.has(p.id));
    }

    if (trendingIdeas.length === 0 && totalPosts > 0) {
      logger.info(`🔄 No trending ideas found, redistributing from other categories (min: ${minPostsPerCategory})`);
      // Take posts from content ideas first, then pain points
      const postsToMove = [...contentIdeas.slice(0, minPostsPerCategory), ...painPoints.slice(0, minPostsPerCategory)];
      trendingIdeas.push(...postsToMove.slice(0, minPostsPerCategory));
      // Remove moved posts from original categories
      const movedIds = new Set(postsToMove.slice(0, minPostsPerCategory).map(p => p.id));
      contentIdeas = contentIdeas.filter(p => !movedIds.has(p.id));
      painPoints = painPoints.filter(p => !movedIds.has(p.id));
    }

    if (contentIdeas.length === 0 && totalPosts > 0) {
      logger.info(`🔄 No content ideas found, redistributing from other categories (min: ${minPostsPerCategory})`);
      // Take posts from trending first, then pain points
      const postsToMove = [...trendingIdeas.slice(0, minPostsPerCategory), ...painPoints.slice(0, minPostsPerCategory)];
      contentIdeas.push(...postsToMove.slice(0, minPostsPerCategory));
      // Remove moved posts from original categories
      const movedIds = new Set(postsToMove.slice(0, minPostsPerCategory).map(p => p.id));
      trendingIdeas = trendingIdeas.filter(p => !movedIds.has(p.id));
      painPoints = painPoints.filter(p => !movedIds.has(p.id));
    }

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
    logger.info(`📊 Categorization breakdown: ${posts.length} total → ${totalRelevant} categorized, ${excludedPromoted} promoted, ${excludedIrrelevant} irrelevant`);
    
    // DEBUG: Log platform distribution
    const platformBreakdown = {
      painPoints: this.getPlatformCounts(painPoints),
      trendingIdeas: this.getPlatformCounts(trendingIdeas),
      contentIdeas: this.getPlatformCounts(contentIdeas)
    };
    logger.info(`📊 Platform distribution:`, platformBreakdown);
    
    // DEBUG: Log if categories are empty
    if (painPoints.length === 0) {
      logger.warn(`⚠️ No pain points found. Sample posts: ${posts.slice(0, 2).map(p => p.content.substring(0, 50)).join(', ')}`);
    }
    if (trendingIdeas.length === 0) {
      logger.warn(`⚠️ No trending ideas found. Sample posts: ${posts.slice(0, 2).map(p => p.content.substring(0, 50)).join(', ')}`);
    }

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
    
    } catch (error) {
      logger.error('Error in simpleCategorization:', error);
      return {
        painPoints: [],
        trendingIdeas: [],
        contentIdeas: [],
        relevanceAnalysis: { totalRelevantPosts: 0, relevanceScore: 0, excludedPromotedContent: 0, excludedIrrelevantPosts: 0 }
      };
    }
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
