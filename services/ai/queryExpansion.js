const logger = require('../../utils/logger');
const OllamaClient = require('./ollamaClient');
const AIUtils = require('./utils');

/**
 * Query Expansion Service
 * Generates focus areas using TinyLlama
 */
class QueryExpansionService {
  /**
   * Generate 6 focus areas for a query
   * @param {string} query - User's search query
   * @returns {Promise<Array>} Array of focus areas (6 + 1 custom)
   */
  static async generateQueryExpansion(query) {
    try {
      logger.info(`🤖 Generating AI query expansion for: "${query}" using TinyLlama`);

      // Ultra-simplified prompt optimized for TinyLlama
      // TinyLlama works better with very direct, minimal instructions
      const prompt = `Query: "${query}"

Generate 6 focus areas as JSON array only:

[{"title":"Focus 1 title","description":"Description 1","expandedQuery":"search terms 1","category":"problems"},{"title":"Focus 2 title","description":"Description 2","expandedQuery":"search terms 2","category":"experiences"},{"title":"Focus 3 title","description":"Description 3","expandedQuery":"search terms 3","category":"questions"},{"title":"Focus 4 title","description":"Description 4","expandedQuery":"search terms 4","category":"success"},{"title":"Focus 5 title","description":"Description 5","expandedQuery":"search terms 5","category":"tools"},{"title":"Focus 6 title","description":"Description 6","expandedQuery":"search terms 6","category":"trends"}]

Categories: problems experiences questions success tools trends

Generate JSON for "${query}":`;

      // Try up to 3 times to get valid AI response
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logger.info(`🔄 Attempt ${attempt}/3: Calling Ollama for query expansion`);
          
          const aiResponse = await OllamaClient.call(prompt, {
            temperature: 0.9, // Very high temperature for maximum creativity
            max_tokens: 2000, // More tokens to ensure complete JSON generation
          });

          if (!aiResponse || aiResponse.trim().length === 0) {
            logger.warn(`❌ Attempt ${attempt}: No AI response content received`);
            continue;
          }

          logger.info(`📝 Attempt ${attempt} - AI Response length: ${aiResponse.length} chars`);
          logger.info(`📝 Attempt ${attempt} - Full AI Response: ${aiResponse}`);

          // Extract and parse JSON
          const jsonMatch = AIUtils.extractJSON(aiResponse);
          
          if (!jsonMatch) {
            logger.warn(`❌ Attempt ${attempt}: Could not extract JSON from response`);
            continue;
          }

          let subtopics;
          try {
            subtopics = JSON.parse(jsonMatch);
            
            // Validate array structure
            if (!Array.isArray(subtopics)) {
              throw new Error('Response is not an array');
            }
            
            if (subtopics.length === 0) {
              throw new Error('Array is empty');
            }
            
            // Validate and clean subtopics
            const validSubtopics = subtopics
              .filter(subtopic => 
                subtopic && 
                typeof subtopic === 'object' &&
                subtopic.title && 
                typeof subtopic.title === 'string' &&
                subtopic.description && 
                typeof subtopic.description === 'string' &&
                subtopic.expandedQuery && 
                typeof subtopic.expandedQuery === 'string'
              )
              .map(subtopic => ({
                title: (subtopic.title || '').trim(),
                description: (subtopic.description || '').trim(),
                expandedQuery: (subtopic.expandedQuery || '').trim(),
                category: subtopic.category || 'experiences'
              }))
              .slice(0, 6); // Take first 6 valid ones
            
            if (validSubtopics.length === 0) {
              throw new Error('No valid subtopics found after validation');
            }
            
            // Ensure we have exactly 6 subtopics
            while (validSubtopics.length < 6 && validSubtopics.length > 0) {
              const existing = validSubtopics[validSubtopics.length - 1];
              validSubtopics.push({
                ...existing,
                title: `${existing.title} (Alternate)`,
                expandedQuery: `${existing.expandedQuery} alternative`
              });
            }
            
            logger.info(`✅ Successfully parsed ${validSubtopics.length} AI-generated focus areas on attempt ${attempt}`);
            
            // Add custom option
            validSubtopics.push({
              title: "Custom Topic",
              description: "Specify your own specific area of interest",
              expandedQuery: query,
              category: "custom",
              isCustom: true
            });

            return validSubtopics.slice(0, 7); // Return 6 + custom
            
          } catch (parseError) {
            logger.warn(`❌ Attempt ${attempt}: JSON parsing failed: ${parseError.message}`);
            logger.warn(`📝 Problematic JSON: ${jsonMatch}`);
            logger.warn(`📝 Original AI Response: ${aiResponse}`);
            lastError = parseError;
            continue;
          }
          
        } catch (attemptError) {
          logger.warn(`❌ Attempt ${attempt} failed: ${attemptError.message}`);
          lastError = attemptError;
        }
      }
      
      // If all attempts failed, use fallback
      logger.error(`❌ All 3 attempts failed for query "${query}". Last error: ${lastError?.message}`);
      logger.warn('⚠️ USING FALLBACK DATA - AI generation failed. Check Ollama connection.');
      
      const fallback = this.getFallbackQueryExpansion(query);
      fallback.forEach(item => {
        item.isFallback = true;
      });
      return fallback;

    } catch (error) {
      logger.error(`❌ AI query expansion completely failed for "${query}":`, error.message);
      const fallback = this.getFallbackQueryExpansion(query);
      fallback.forEach(item => {
        item.isFallback = true;
      });
      return fallback;
    }
  }

  /**
   * Fallback query expansion (hardcoded)
   */
  static getFallbackQueryExpansion(query) {
    const lowerQuery = query.toLowerCase();
    const subtopics = [];

    // Business/Marketing topics
    if (lowerQuery.includes('sales') || lowerQuery.includes('marketing') || lowerQuery.includes('business')) {
      subtopics.push(
        { title: "Sales Struggles", description: "Real sales challenges and frustrations", expandedQuery: `${query} struggling problems difficult`, category: "problems" },
        { title: "Sales Success", description: "Success stories and wins", expandedQuery: `${query} success story win achieved`, category: "success" },
        { title: "Sales Tools", description: "Tools and software people use", expandedQuery: `${query} tools software CRM platform`, category: "tools" },
        { title: "Sales Questions", description: "Questions people ask about sales", expandedQuery: `${query} how to help advice`, category: "questions" },
        { title: "Sales Experiences", description: "Personal sales experiences and stories", expandedQuery: `${query} experience story happened`, category: "experiences" },
        { title: "Sales Trends", description: "Current trends in sales", expandedQuery: `${query} trends latest popular`, category: "trends" }
      );
    } else if (lowerQuery.includes('plant') || lowerQuery.includes('disease')) {
      subtopics.push(
        { title: "Plant Problems", description: "Plant issues and disease symptoms", expandedQuery: `${query} dying yellow leaves problems`, category: "problems" },
        { title: "Plant Care", description: "How people care for their plants", expandedQuery: `${query} care tips watering fertilizing`, category: "experiences" },
        { title: "Plant Solutions", description: "What worked to fix plant issues", expandedQuery: `${query} fixed cured treatment worked`, category: "success" },
        { title: "Plant Questions", description: "Questions about plant care", expandedQuery: `${query} help identify what wrong`, category: "questions" },
        { title: "Plant Products", description: "Products and treatments people use", expandedQuery: `${query} fertilizer spray treatment product`, category: "tools" },
        { title: "Plant Trends", description: "Trending plant topics", expandedQuery: `${query} trending popular viral`, category: "trends" }
      );
    } else {
      // Generic topics
      const baseTopics = [
        { title: "Real Experiences", description: "Personal experiences and stories", expandedQuery: `${query} experience story happened personal`, category: "experiences" },
        { title: "Common Problems", description: "Problems and frustrations people have", expandedQuery: `${query} problems issues struggling difficult`, category: "problems" },
        { title: "Success Stories", description: "What worked and success stories", expandedQuery: `${query} success worked amazing great`, category: "success" },
        { title: "Questions Asked", description: "Questions people ask about this", expandedQuery: `${query} help advice how to`, category: "questions" },
        { title: "Tools & Products", description: "Tools and products people mention", expandedQuery: `${query} tools products software app`, category: "tools" },
        { title: "Current Trends", description: "What's trending about this topic", expandedQuery: `${query} trends latest popular viral`, category: "trends" }
      ];
      
      subtopics.push(...baseTopics);
    }

    // Add custom option
    subtopics.push({
      title: "Custom Topic",
      description: "Specify your own specific area of interest",
      expandedQuery: query,
      category: "custom",
      isCustom: true
    });

    return subtopics;
  }
}

module.exports = QueryExpansionService;

