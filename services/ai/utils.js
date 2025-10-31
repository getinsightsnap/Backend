const logger = require('../../utils/logger');
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

/**
 * Utility functions for AI services
 */
class AIUtils {
  /**
   * Extract JSON from AI response (handles markdown, extra text, etc.)
   */
  static extractJSON(aiResponse) {
    if (!aiResponse || !aiResponse.trim()) {
      return null;
    }

    let cleanResponse = aiResponse.trim();
    logger.info(`🧹 Cleaning response - Original length: ${cleanResponse.length}`);
    
    // Remove markdown code blocks
    cleanResponse = cleanResponse.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // Remove text before first [ or {
    const jsonStart = Math.max(
      cleanResponse.indexOf('['),
      cleanResponse.indexOf('{')
    );
    
    if (jsonStart > 0) {
      logger.info(`📝 Found text before JSON, removing ${jsonStart} chars`);
      cleanResponse = cleanResponse.substring(jsonStart);
    }
    
    // Find complete JSON structure
    let jsonMatch = null;
    let bracketCount = 0;
    let startIndex = Math.max(
      cleanResponse.indexOf('['),
      cleanResponse.indexOf('{')
    );
    
    if (startIndex >= 0) {
      const startChar = cleanResponse[startIndex];
      const endChar = startChar === '[' ? ']' : '}';
      
      for (let i = startIndex; i < cleanResponse.length; i++) {
        if (cleanResponse[i] === startChar) bracketCount++;
        if (cleanResponse[i] === endChar) bracketCount--;
        if (bracketCount === 0 && i > startIndex) {
          jsonMatch = cleanResponse.substring(startIndex, i + 1);
          logger.info(`✅ Found complete JSON structure (length: ${jsonMatch.length})`);
          break;
        }
      }
    }
    
    if (!jsonMatch) {
      logger.warn(`⚠️ Could not find complete JSON, trying entire response`);
      jsonMatch = cleanResponse;
    }
    
    logger.info(`📦 JSON to parse (length: ${jsonMatch.length}): ${jsonMatch.substring(0, 300)}...`);
    return jsonMatch;
  }

  /**
   * Generate semantic context for queries
   */
  static async generateSemanticContext(query, ollamaClient) {
    try {
      const prompt = `Analyze this search query: "${query}"

Provide context:
1. What this means (business/consumer/entertainment/personal)
2. Related terms people use
3. Common problems and solutions
4. What posts would be relevant vs irrelevant

Be concise. Focus on what people actually discuss about this on social media.`;

      const aiResponse = await ollamaClient.call(prompt, {
        temperature: 0.2,
        max_tokens: 400
      });

      return aiResponse || this.getFallbackSemanticContext(query);
    } catch (error) {
      logger.error('Error generating semantic context:', error);
      return this.getFallbackSemanticContext(query);
    }
  }

  /**
   * Fallback semantic context
   */
  static getFallbackSemanticContext(query) {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('sales') || lowerQuery.includes('marketing')) {
      return `Business Context: Sales/marketing discussions including strategies, tools, CRM, processes, challenges, and optimization.`;
    }
    
    if (lowerQuery.includes('theme park') || lowerQuery.includes('amusement')) {
      return `Entertainment Context: Theme park discussions including rides, tickets, crowds, food, experiences, and reviews.`;
    }
    
    if (lowerQuery.includes('cooking') || lowerQuery.includes('recipe')) {
      return `Food Context: Cooking discussions including recipes, ingredients, techniques, tools, and experiences.`;
    }
    
    if (lowerQuery.includes('travel') || lowerQuery.includes('vacation')) {
      return `Travel Context: Travel discussions including destinations, planning, accommodations, tips, and experiences.`;
    }
    
    if (lowerQuery.includes('health') || lowerQuery.includes('fitness')) {
      return `Health Context: Health discussions including wellness, fitness, nutrition, and experiences.`;
    }
    
    if (lowerQuery.includes('programming') || lowerQuery.includes('coding')) {
      return `Technology Context: Programming discussions including languages, tools, debugging, and solutions.`;
    }
    
    return `Context: Discussions about "${query}" including experiences, problems, solutions, tips, and questions people share.`;
  }

  /**
   * Get rating insights from Supabase
   */
  static async getRatingInsights(query) {
    try {
      if (!supabase) {
        return null;
      }

      const normalizedQuery = query.toLowerCase().trim();
      
      const { data: analytics, error } = await supabase
        .from('relevance_analytics')
        .select('platform, avg_rating, total_ratings')
        .eq('search_query', normalizedQuery);

      if (error) {
        logger.warn('Failed to fetch rating insights:', error);
        return null;
      }

      const { data: patterns } = await supabase
        .from('ai_learning_patterns')
        .select('platform, avg_relevance_score, improvement_suggestions')
        .eq('search_query', normalizedQuery);

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

  /**
   * Get categorized posts from indices
   */
  static getCategorizedPosts(posts, indices) {
    return indices
      .filter(index => index >= 1 && index <= posts.length)
      .map(index => posts[index - 1])
      .filter(Boolean);
  }

  /**
   * Get platform counts for posts
   */
  static getPlatformCounts(posts) {
    const counts = { reddit: 0, x: 0, youtube: 0, linkedin: 0, threads: 0 };
    posts.forEach(post => {
      if (counts.hasOwnProperty(post.platform)) {
        counts[post.platform]++;
      }
    });
    return counts;
  }

  /**
   * Ensure all categories have results
   */
  static ensureAllCategoriesHaveResults(result, allPosts) {
    logger.info('🔄 Ensuring all sentiment categories have results...');
    
    const minPostsPerCategory = Math.max(1, Math.floor(allPosts.length / 10));
    
    if (result.painPoints.length === 0 && allPosts.length > 0) {
      const otherPosts = [...result.trendingIdeas, ...result.contentIdeas];
      result.painPoints = otherPosts.slice(0, minPostsPerCategory);
    }

    if (result.trendingIdeas.length === 0 && allPosts.length > 0) {
      const otherPosts = [...result.painPoints, ...result.contentIdeas];
      result.trendingIdeas = otherPosts.slice(0, minPostsPerCategory);
    }

    if (result.contentIdeas.length === 0 && allPosts.length > 0) {
      const otherPosts = [...result.painPoints, ...result.trendingIdeas];
      result.contentIdeas = otherPosts.slice(0, minPostsPerCategory);
    }

    ['painPoints', 'trendingIdeas', 'contentIdeas'].forEach(categoryName => {
      const platformCounts = this.getPlatformCounts(result[categoryName]);
      const platformList = Object.entries(platformCounts).map(([p, c]) => `${p}: ${c}`).join(', ');
      logger.info(`📊 ${categoryName}: ${result[categoryName].length} posts - ${platformList}`);
    });

    return result;
  }
}

module.exports = AIUtils;

