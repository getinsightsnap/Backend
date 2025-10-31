const logger = require('../../utils/logger');
const OllamaClient = require('./ollamaClient');
const AIUtils = require('./utils');

/**
 * Relevance Filtering Service
 * Filters posts for relevance using TinyLlama
 */
class RelevanceFilterService {
  /**
   * Filter posts for relevance to query
   * @param {Array} posts - Posts to filter
   * @param {string} query - Search query
   * @returns {Promise<Array>} Relevant posts
   */
  static async filterRelevantPosts(posts, query) {
    try {
      logger.info(`🔍 AI filtering ${posts.length} posts for relevance to: "${query}" using TinyLlama`);
      
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

  /**
   * Filter a batch of posts for relevance
   * @param {Array} posts - Batch of posts
   * @param {string} query - Search query
   * @param {number} offset - Offset for indexing
   * @returns {Promise<Array>} Relevant posts from batch
   */
  static async filterBatchRelevance(posts, query, offset) {
    try {
      // Get historical rating data and semantic context
      const [ratingInsights, semanticContext] = await Promise.all([
        AIUtils.getRatingInsights(query),
        AIUtils.generateSemanticContext(query, OllamaClient)
      ]);
      
      const postsText = posts.map((post, index) => 
        `${offset + index + 1}. [${post.platform.toUpperCase()}] ${post.source} (${post.engagement} engagement):\n   "${post.content.substring(0, 300)}${post.content.length > 300 ? '...' : ''}"`
      ).join('\n\n');

      let ratingContext = '';
      if (ratingInsights && ratingInsights.length > 0) {
        ratingContext = `\n\nLEARNING FROM USER FEEDBACK:\nPrevious users rated posts about "${query}" with these patterns:\n${ratingInsights.map(insight => `- ${insight.platform}: Average rating ${insight.avg_rating}/5 (${insight.total_ratings} ratings) - ${insight.improvement_suggestions || 'No specific suggestions'}`).join('\n')}\n\nUse this feedback to better understand what users consider relevant for "${query}".`;
      }

      const prompt = `You are an expert content relevance analyzer. Determine which posts are ACTUALLY RELEVANT to: "${query}"

SEMANTIC UNDERSTANDING:
${semanticContext}

STRICT RELEVANCE CRITERIA:
1. Post must be directly related to "${query}" in ANY meaningful context
2. Consider FULL semantic meaning, not just keywords
3. REJECT unrelated topics (stock trading, horror stories, gaming, programming when not relevant)
4. Posts asking questions about the topic ARE relevant
5. Posts sharing experiences ARE relevant
6. Posts offering solutions ARE relevant${ratingContext}

CONTEXT AWARENESS:
- Match the CONTEXT of the query, not just keywords
- If searching "theme park problems", look for amusement parks, rides, tickets
- If searching "programming", look for coding, software, development

REJECTION EXAMPLES for "${query}":
- Stock market discussions
- Horror stories, fiction
- Gaming, sports, celebrity gossip
- Programming when searching non-tech topics
- Random keyword mentions without context

Posts to analyze:
${postsText}

Respond with ONLY a JSON object: {"relevant": [1, 3, 7, 12, ...]}
If no posts are relevant: {"relevant": []}`;

      const aiResponse = await OllamaClient.call(prompt, {
        temperature: 0.1,
        max_tokens: 500
      });
      
      if (!aiResponse) {
        throw new Error('No response from AI relevance filter');
      }

      // Parse AI response
      const jsonMatch = AIUtils.extractJSON(aiResponse);
      const result = JSON.parse(jsonMatch);
      const relevantIndices = result.relevant || [];
      
      // Convert 1-based indices to 0-based and filter posts
      const relevantPosts = relevantIndices
        .filter(index => index >= 1 && index <= posts.length)
        .map(index => posts[index - 1])
        .filter(Boolean);

      logger.info(`📊 Batch ${Math.floor(offset/50) + 1}: ${relevantPosts.length}/${posts.length} posts relevant`);
      return relevantPosts;

    } catch (error) {
      logger.error('Batch relevance filtering error:', error);
      // Return all posts in batch if filtering fails
      return posts;
    }
  }
}

module.exports = RelevanceFilterService;

