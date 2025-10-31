const logger = require('../../utils/logger');
const RelevanceFilterService = require('./relevanceFilter');
const SegregationService = require('./segregation');

/**
 * Analysis Service
 * Main orchestration for AI analysis workflows
 */
class AnalysisService {
  /**
   * Perform focused analysis for a specific category
   * @param {Array} posts - Posts to analyze
   * @param {string} expandedQuery - Expanded search query
   * @param {string} selectedCategory - Category: pain-points, trending-ideas, content-ideas
   * @returns {Promise<Object>} Analysis results
   */
  static async performFocusedAnalysis(posts, expandedQuery, selectedCategory) {
    if (!posts || posts.length === 0) {
      return {
        results: [],
        metadata: {
          totalPosts: 0,
          relevantPosts: 0,
          category: selectedCategory,
          expandedQuery: expandedQuery
        }
      };
    }

    try {
      logger.info(`🎯 Performing focused analysis for "${expandedQuery}" in category: ${selectedCategory}`);
      
      // Step 1: Enhanced relevance filtering
      const relevantPosts = await RelevanceFilterService.filterRelevantPosts(posts, expandedQuery);
      
      if (relevantPosts.length === 0) {
        logger.warn('No relevant posts found after focused filtering');
        return {
          results: [],
          metadata: {
            totalPosts: posts.length,
            relevantPosts: 0,
            category: selectedCategory,
            expandedQuery: expandedQuery
          }
        };
      }

      // Step 2: Category-specific analysis
      const categorizedResults = await SegregationService.performCategorySpecificAnalysis(
        relevantPosts, 
        expandedQuery, 
        selectedCategory
      );
      
      // Check if AI returned no relevant content message
      if (categorizedResults && categorizedResults.noRelevantContent) {
        logger.warn('⚠️ No relevant content message returned from category analysis');
        return {
          results: [],
          metadata: {
            totalPosts: posts.length,
            relevantPosts: relevantPosts.length,
            category: selectedCategory,
            expandedQuery: expandedQuery,
            relevanceScore: relevantPosts.length / posts.length,
            noRelevantContent: true,
            message: categorizedResults.message,
            availablePosts: categorizedResults.availablePosts || 0
          }
        };
      }
      
      // Ensure categorizedResults is an array
      const finalResults = Array.isArray(categorizedResults) ? categorizedResults : [];
      
      logger.info(`✅ Focused analysis complete: ${finalResults.length} posts for ${selectedCategory}`);
      
      return {
        results: finalResults,
        metadata: {
          totalPosts: posts.length,
          relevantPosts: relevantPosts.length,
          category: selectedCategory,
          expandedQuery: expandedQuery,
          relevanceScore: relevantPosts.length / posts.length
        }
      };

    } catch (error) {
      logger.error('Focused analysis error:', error);
      return {
        results: [],
        metadata: {
          totalPosts: posts.length,
          relevantPosts: 0,
          category: selectedCategory,
          expandedQuery: expandedQuery,
          error: error.message
        }
      };
    }
  }

  /**
   * Categorize posts into all three categories (pain points, trending ideas, content ideas)
   * @param {Array} posts - Posts to categorize
   * @param {string} query - Search query
   * @returns {Promise<Object>} Categorized posts
   */
  static async categorizePosts(posts, query) {
    if (!posts || posts.length === 0) {
      return {
        painPoints: [],
        trendingIdeas: [],
        contentIdeas: [],
        relevanceAnalysis: { 
          totalRelevantPosts: 0, 
          relevanceScore: 0, 
          excludedPromotedContent: 0, 
          excludedIrrelevantPosts: 0 
        }
      };
    }

    try {
      // Step 1: AI-powered relevance filtering
      logger.info(`🤖 AI analyzing ${posts.length} posts for relevance to query: "${query}" using TinyLlama`);
      const relevantPosts = await RelevanceFilterService.filterRelevantPosts(posts, query);
      
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
      const result = await SegregationService.aiSentimentAnalysis(relevantPosts, query);
      
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
      return SegregationService.enhancedSentimentAnalysis(posts, query);
    }
  }

  /**
   * Generate content ideas based on posts
   * @param {string} query - Search query
   * @param {Array} posts - Posts to analyze
   * @returns {Promise<Array>} Content ideas
   */
  static async generateContentIdeas(query, posts) {
    try {
      const OllamaClient = require('./ollamaClient');
      const prompt = `Based on these social media posts about "${query}", generate 5 creative content ideas:

Posts context:
${posts.slice(0, 10).map(post => `- ${post.content.substring(0, 100)}...`).join('\n')}

Generate 5 specific, actionable content ideas. Each idea should include:
1. A catchy title
2. A brief description
3. The target platform (blog, Instagram, YouTube, etc.)

Format as a JSON array of objects with "title", "description", and "platform" fields.`;

      const aiResponse = await OllamaClient.call(prompt, {
        temperature: 0.7,
        max_tokens: 800
      });

      const AIUtils = require('./utils');
      const jsonMatch = AIUtils.extractJSON(aiResponse);
      return JSON.parse(jsonMatch || '[]');

    } catch (error) {
      logger.error('AI content generation error:', error);
      return this.generateSimpleContentIdeas(query, posts);
    }
  }

  /**
   * Generate simple content ideas (fallback)
   */
  static generateSimpleContentIdeas(query, posts) {
    return [
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
  }
}

module.exports = AnalysisService;

