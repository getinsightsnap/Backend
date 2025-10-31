const logger = require('../../utils/logger');
const OllamaClient = require('./ollamaClient');
const AIUtils = require('./utils');

/**
 * Segregation Service
 * Categorizes posts by sentiment/intent using GPT-2
 */
class SegregationService {
  /**
   * Perform category-specific analysis (single category)
   * @param {Array} posts - Posts to analyze
   * @param {string} expandedQuery - Expanded search query
   * @param {string} category - Category: pain-points, trending-ideas, content-ideas
   * @returns {Promise<Array>} Relevant posts for the category
   */
  static async performCategorySpecificAnalysis(posts, expandedQuery, category) {
    try {
      logger.info(`🔍 Performing ${category} analysis for: "${expandedQuery}" using GPT-2`);

      const semanticContext = await AIUtils.generateSemanticContext(expandedQuery, OllamaClient);
      const categoryContext = this.getCategoryContext(category, expandedQuery);

      const postsText = posts.map((post, index) => 
        `${index + 1}. [${post.platform.toUpperCase()}] ${post.source} (${post.engagement} engagement):\n   "${post.content.substring(0, 300)}${post.content.length > 300 ? '...' : ''}"`
      ).join('\n\n');

      const prompt = `You are an expert social media analyst. Extract the most relevant posts for "${expandedQuery}" in the ${category.toUpperCase()} category.

SEARCH CONTEXT: "${expandedQuery}"
ANALYSIS CATEGORY: ${category.toUpperCase()}

SEMANTIC UNDERSTANDING:
${semanticContext}

${categoryContext}

CRITICAL FILTERING RULES:
- ONLY include posts genuinely relevant to "${expandedQuery}" in its ACTUAL context/domain
- Match the CONTEXT of the query
- REJECT posts about unrelated topics
- For ${category}, focus specifically on posts that provide meaningful ${category} insights
- Prioritize high-quality, actionable content

Posts to analyze (${posts.length} total):
${postsText}

Respond with ONLY a JSON object: {"relevant": [1, 3, 7, 12, ...]}
Return maximum 15 most relevant posts for ${category}.`;

      const aiResponse = await OllamaClient.call(prompt, {
        temperature: 0.1,
        max_tokens: 500,
        useSegregationModel: true // Use GPT-2
      });

      if (!aiResponse) {
        logger.error('No response content from GPT-2');
        throw new Error('No response from GPT-2 category analysis');
      }

      logger.info(`📝 AI response received: ${aiResponse.substring(0, 200)}...`);

      // Parse AI response
      let result;
      try {
        const jsonMatch = AIUtils.extractJSON(aiResponse);
        result = JSON.parse(jsonMatch);
      } catch (parseError) {
        logger.error('Failed to parse GPT-2 response:', parseError.message);
        logger.error('GPT-2 response was:', aiResponse);
        return [];
      }
      
      const relevantIndices = result.relevant || [];
      
      // Convert indices to posts
      const relevantPosts = relevantIndices
        .filter(index => index >= 1 && index <= posts.length)
        .map(index => posts[index - 1])
        .filter(Boolean);

      // Check minimum threshold
      const minRelevantPosts = 1;
      if (relevantPosts.length < minRelevantPosts) {
        logger.warn(`❌ Not enough relevant posts found for ${category}: ${relevantPosts.length}/${minRelevantPosts} minimum`);
        return {
          noRelevantContent: true,
          message: `We couldn't find relevant ${category.replace('-', ' ')} content for "${expandedQuery}" in the current time period.`,
          availablePosts: relevantPosts.length,
          totalPosts: posts.length
        };
      }

      logger.info(`✅ Category analysis complete: ${relevantPosts.length} posts for ${category}`);
      return relevantPosts;

    } catch (error) {
      logger.error('Category-specific analysis error:', error.message);
      return [];
    }
  }

  /**
   * AI sentiment analysis (categorize into all 3 categories)
   * @param {Array} posts - Posts to categorize
   * @param {string} query - Search query
   * @returns {Promise<Object>} Categorized posts
   */
  static async aiSentimentAnalysis(posts, query) {
    try {
      const maxPosts = Math.min(posts.length, 100);
      logger.info(`🤖 AI analyzing sentiment of ${maxPosts} posts using GPT-2 for segregation...`);
      
      const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0);
      const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

      const postsText = posts.slice(0, maxPosts).map((post, index) => {
        const engagement = post.engagement || 0;
        const isHighEngagement = engagement > (avgEngagement * 2);
        const engagementIndicator = isHighEngagement ? '🔥 HIGH ENGAGEMENT' : '';
        return `${index + 1}. [${post.platform.toUpperCase()}] Posted ${post.timestamp} | Engagement: ${engagement} ${engagementIndicator}\n   ${post.content.substring(0, 200)}...`;
      }).join('\n\n');

      const semanticContext = await AIUtils.generateSemanticContext(query, OllamaClient);

      const prompt = `You are an expert social media sentiment analyst. Categorize these posts by SENTIMENT and INTENT related to "${query}".

SEARCH CONTEXT: "${query}"

SEMANTIC UNDERSTANDING:
${semanticContext}

IMPORTANT: Mix posts from ALL platforms (Reddit, X/Twitter, YouTube, LinkedIn, Threads) in each category.

CATEGORIES BY SENTIMENT/INTENT:
1. PAIN POINTS: Problems, frustrations, challenges, complaints, negative experiences
2. TRENDING IDEAS: Popular/viral discussions, news, emerging trends, high-engagement content
3. CONTENT IDEAS: Solutions, tips, tutorials, educational content, questions

STRICT ANALYSIS RULES:
- ONLY categorize posts genuinely relevant to "${query}" in its ACTUAL domain/context
- REJECT unrelated topics
- DISTRIBUTE posts across ALL THREE categories
- MIX platforms in each category
- Prioritize high engagement posts for trending ideas

Posts to analyze (${maxPosts} total):
${postsText}

Respond with ONLY a JSON object:
{"painPoints": [1, 5, 8], "trendingIdeas": [2, 3, 7], "contentIdeas": [4, 6, 9]}`;

      const aiResponse = await OllamaClient.call(prompt, {
        temperature: 0.3,
        max_tokens: 1000,
        useSegregationModel: true // Use GPT-2
      });
      
      if (!aiResponse) {
        throw new Error('No response from AI service');
      }

      // Parse AI response
      const jsonMatch = AIUtils.extractJSON(aiResponse);
      const categorization = JSON.parse(jsonMatch);
      
      // Apply categorization to posts
      const result = {
        painPoints: AIUtils.getCategorizedPosts(posts, categorization.painPoints || []),
        trendingIdeas: AIUtils.getCategorizedPosts(posts, categorization.trendingIdeas || []),
        contentIdeas: AIUtils.getCategorizedPosts(posts, categorization.contentIdeas || []),
        relevanceAnalysis: {
          totalRelevantPosts: posts.length,
          relevanceScore: 1.0,
          excludedPromotedContent: 0,
          excludedIrrelevantPosts: 0
        }
      };

      logger.info(`✅ GPT-2 sentiment analysis complete: ${result.painPoints.length} pain points, ${result.trendingIdeas.length} trending ideas, ${result.contentIdeas.length} content ideas`);
      
      return AIUtils.ensureAllCategoriesHaveResults(result, posts);

    } catch (error) {
      logger.error('AI sentiment analysis error:', error);
      throw error;
    }
  }

  /**
   * Enhanced sentiment analysis (fallback without AI)
   */
  static enhancedSentimentAnalysis(posts, query) {
    logger.info(`🔄 Using enhanced sentiment analysis for ${posts.length} posts with query: "${query}"`);
    
    if (!posts || !Array.isArray(posts)) {
      return {
        painPoints: [],
        trendingIdeas: [],
        contentIdeas: [],
        relevanceAnalysis: { totalRelevantPosts: 0, relevanceScore: 0, excludedPromotedContent: 0, excludedIrrelevantPosts: 0 }
      };
    }

    const painKeywords = [
      'problem', 'issue', 'frustrated', 'difficult', 'hard', 'struggle', 'hate', 'annoying', 'broken',
      'fail', 'worst', 'terrible', 'awful', 'sucks', 'disappointed', 'angry', 'upset', 'complaint',
      'bug', 'error', 'glitch', 'not working', 'slow', 'expensive', 'confused', 'stuck'
    ];

    const trendingKeywords = [
      'trending', 'viral', 'popular', 'hot', 'new', 'latest', 'everyone', 'breaking',
      'huge', 'massive', 'amazing', 'incredible', 'game changer', 'revolutionary'
    ];

    const contentKeywords = [
      'how to', 'tutorial', 'learn', 'teach', 'explain', 'guide', 'tips', 'tricks',
      'advice', 'recommend', 'what is', 'best way', 'step by step'
    ];

    const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0);
    const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

    const scoredPosts = posts.map(post => {
      const content = post.content.toLowerCase();
      
      const painScore = painKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const trendingScore = trendingKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const contentScore = contentKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );

      const engagement = post.engagement || 0;
      const engagementBonus = Math.log(engagement + 1) / 10;
      
      return {
        post,
        painScore: painScore + engagementBonus,
        trendingScore: trendingScore + engagementBonus + (engagement > avgEngagement * 2 ? 1 : 0),
        contentScore: contentScore + engagementBonus
      };
    });

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

    // Sort by engagement
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
    
    return AIUtils.ensureAllCategoriesHaveResults(result, posts);
  }

  /**
   * Get category-specific context prompt
   */
  static getCategoryContext(category, query) {
    const contexts = {
      'pain-points': `PAIN POINTS ANALYSIS: Extract posts that discuss problems, frustrations, challenges, complaints, or negative experiences related to "${query}". Focus on real-world issues people are facing.`,
      'trending-ideas': `TRENDING IDEAS ANALYSIS: Extract posts about popular discussions, viral content, emerging trends, news, or high-engagement content related to "${query}". Focus on what's currently popular and gaining attention.`,
      'content-ideas': `CONTENT IDEAS ANALYSIS: Extract posts that offer solutions, tips, tutorials, educational content, how-to guides, or posts asking questions about "${query}". Focus on actionable and educational content.`
    };

    return contexts[category] || `ANALYSIS: Extract the most relevant posts related to "${query}" in the context of ${category}.`;
  }

  /**
   * Fallback category analysis (engagement-based)
   */
  static fallbackCategoryAnalysis(posts, category) {
    logger.info(`🔄 Using fallback analysis for ${category}`);
    
    const sortedPosts = posts
      .sort((a, b) => (b.engagement || 0) - (a.engagement || 0))
      .slice(0, 15);

    return sortedPosts;
  }
}

module.exports = SegregationService;

