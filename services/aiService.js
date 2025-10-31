/**
 * AI Service - Main Entry Point
 * This file maintains backward compatibility by exporting from the new modular structure
 */

const QueryExpansionService = require('./ai/queryExpansion');
const AnalysisService = require('./ai/analysis');

/**
 * AIService - Backward compatible interface
 * Redirects to new modular services
 */
class AIService {
  /**
   * Generate query expansion options (focus areas)
   * Uses TinyLlama
   */
  static async generateQueryExpansion(query) {
    return QueryExpansionService.generateQueryExpansion(query);
  }

  /**
   * Perform focused analysis
   */
  static async performFocusedAnalysis(posts, expandedQuery, selectedCategory) {
    return AnalysisService.performFocusedAnalysis(posts, expandedQuery, selectedCategory);
  }

  /**
   * Categorize posts
   */
  static async categorizePosts(posts, query) {
    return AnalysisService.categorizePosts(posts, query);
  }

  /**
   * Generate content ideas
   */
  static async generateContentIdeas(query, posts) {
    return AnalysisService.generateContentIdeas(query, posts);
  }
}

module.exports = AIService;
