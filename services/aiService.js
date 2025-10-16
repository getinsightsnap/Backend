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

  // New method: Generate query expansion options
  static async generateQueryExpansion(query) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        logger.warn('No Perplexity API key - using fallback query expansion');
        return this.getFallbackQueryExpansion(query);
      }

      logger.info(`🤖 Generating AI query expansion for: "${query}"`);

      const prompt = `Generate 6 specific focus areas for social media research on "${query}". 

Each focus area should be relevant to what people actually discuss about "${query}" on social platforms.

Return ONLY a JSON array with this exact format:
[
  {
    "title": "Focus Area Name",
    "description": "What this reveals about the topic",
    "expandedQuery": "search terms for this focus area",
    "category": "experiences|problems|questions|success|tools|trends|perspectives"
  }
]

Make each focus area specific to "${query}". Avoid generic categories.`;

      // Try with the primary model first
      let response;
      try {
        response = await axios.post(`${this.baseUrl}/chat/completions`, {
          model: 'sonar-pro',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 800,
          temperature: 0.3
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        });
      } catch (primaryError) {
        logger.warn('Primary AI model failed, trying fallback model');
        
        // Try with a different model as fallback
        try {
          response = await axios.post(`${this.baseUrl}/chat/completions`, {
            model: 'sonar-medium',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 600,
            temperature: 0.3
          }, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          });
        } catch (fallbackError) {
          logger.error('Both AI models failed, using hardcoded fallback');
          return this.getFallbackQueryExpansion(query);
        }
      }

      const aiResponse = response.data.choices[0]?.message?.content;
      if (!aiResponse) {
        logger.warn('❌ No AI response content received');
        return this.getFallbackQueryExpansion(query);
      }

      logger.info(`📝 AI Response: ${aiResponse.substring(0, 200)}...`);

      // Clean and parse JSON response
      let cleanResponse = aiResponse.trim();
      
      // Remove any markdown code blocks
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Try to find JSON array
      let jsonMatch = cleanResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Try parsing the entire response as JSON
        jsonMatch = [cleanResponse];
      }

      let subtopics;
      try {
        subtopics = JSON.parse(jsonMatch[0]);
        
        // Validate that it's an array with proper structure
        if (!Array.isArray(subtopics) || subtopics.length === 0) {
          throw new Error('Invalid array format');
        }
        
        // Validate each subtopic has required fields
        const validSubtopics = subtopics.filter(subtopic => 
          subtopic.title && subtopic.description && subtopic.expandedQuery
        );
        
        if (validSubtopics.length === 0) {
          throw new Error('No valid subtopics found');
        }
        
        logger.info(`✅ Successfully parsed ${validSubtopics.length} AI-generated focus areas`);
        subtopics = validSubtopics;
        
      } catch (parseError) {
        logger.warn(`❌ AI response parsing failed, using fallback: ${parseError.message}`);
        return this.getFallbackQueryExpansion(query);
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

    } catch (error) {
      logger.error(`❌ AI query expansion failed for "${query}":`, error.message);
      logger.info('🔄 Falling back to hardcoded patterns');
      return this.getFallbackQueryExpansion(query);
    }
  }

  static getFallbackQueryExpansion(query) {
    const lowerQuery = query.toLowerCase();
    
    // Generate context-aware subtopics based on query analysis
    const subtopics = [];
    
    // Business/Marketing topics
    if (lowerQuery.includes('sales') || lowerQuery.includes('marketing') || lowerQuery.includes('business')) {
      subtopics.push(
        { title: "Sales Struggles", description: "Real sales challenges and frustrations", expandedQuery: `${query} struggling problems difficult`, category: "problems" },
        { title: "Sales Success", description: "Success stories and wins", expandedQuery: `${query} success story win achieved`, category: "success" },
        { title: "Sales Tools", description: "Tools and software people use", expandedQuery: `${query} tools software CRM platform`, category: "tools" },
        { title: "Sales Questions", description: "Questions people ask about sales", expandedQuery: `${query} how to help advice`, category: "questions" },
        { title: "Sales Experiences", description: "Personal sales experiences and stories", expandedQuery: `${query} experience story happened`, category: "experiences" }
      );
    } else if (lowerQuery.includes('plant') || lowerQuery.includes('disease')) {
      subtopics.push(
        { title: "Plant Problems", description: "Plant issues and disease symptoms", expandedQuery: `${query} dying yellow leaves problems`, category: "problems" },
        { title: "Plant Care", description: "How people care for their plants", expandedQuery: `${query} care tips watering fertilizing`, category: "experiences" },
        { title: "Plant Solutions", description: "What worked to fix plant issues", expandedQuery: `${query} fixed cured treatment worked`, category: "success" },
        { title: "Plant Questions", description: "Questions about plant care", expandedQuery: `${query} help identify what wrong`, category: "questions" },
        { title: "Plant Products", description: "Products and treatments people use", expandedQuery: `${query} fertilizer spray treatment product`, category: "tools" }
      );
    } else if (lowerQuery.includes('marriage') || lowerQuery.includes('proposal')) {
      subtopics.push(
        { title: "Proposal Disasters", description: "Failed proposal stories and mistakes", expandedQuery: `${query} failed disaster mistake wrong`, category: "problems" },
        { title: "Creative Ideas", description: "Unique and creative proposal stories", expandedQuery: `${query} creative unique romantic amazing`, category: "experiences" },
        { title: "Ring Shopping", description: "Ring buying experiences and advice", expandedQuery: `${query} ring shopping jewelry diamond`, category: "experiences" },
        { title: "Nervous Stories", description: "Being nervous and anxiety experiences", expandedQuery: `${query} nervous anxious scared worried`, category: "experiences" },
        { title: "Proposal Planning", description: "Planning help and advice questions", expandedQuery: `${query} planning help advice how to`, category: "questions" },
        { title: "Surprise Stories", description: "Surprise proposal moments and reactions", expandedQuery: `${query} surprise reaction shocked cried`, category: "success" }
      );
    } else if (lowerQuery.includes('government') || lowerQuery.includes('political') || lowerQuery.includes('politics')) {
      subtopics.push(
        { title: "Government Services", description: "Experiences with government services and bureaucracy", expandedQuery: `${query} services bureaucracy dmv passport visa`, category: "experiences" },
        { title: "Political Issues", description: "Current political problems and controversies", expandedQuery: `${query} problems issues controversy scandal`, category: "problems" },
        { title: "Policy Success", description: "Successful government policies and programs", expandedQuery: `${query} success worked policy program effective`, category: "success" },
        { title: "Voting & Elections", description: "Voting experiences and election discussions", expandedQuery: `${query} voting election ballot democracy`, category: "experiences" },
        { title: "Government Help", description: "Questions about government assistance and programs", expandedQuery: `${query} help assistance benefits programs how to`, category: "questions" },
        { title: "Government Tools", description: "Government websites, apps, and digital services", expandedQuery: `${query} website app digital portal online`, category: "tools" }
      );
    } else {
      // Generate dynamic, context-aware subtopics based on query
      const baseTopics = [
        { title: "Real Experiences", description: "Personal experiences and stories", expandedQuery: `${query} experience story happened personal`, category: "experiences" },
        { title: "Common Problems", description: "Problems and frustrations people have", expandedQuery: `${query} problems issues struggling difficult`, category: "problems" },
        { title: "Success Stories", description: "What worked and success stories", expandedQuery: `${query} success worked amazing great`, category: "success" },
        { title: "Questions Asked", description: "Questions people ask about this", expandedQuery: `${query} help advice how to`, category: "questions" },
        { title: "Tools & Products", description: "Tools and products people mention", expandedQuery: `${query} tools products software app`, category: "tools" }
      ];
      
      // Customize titles based on query context
      if (lowerQuery.includes('health') || lowerQuery.includes('medical') || lowerQuery.includes('doctor')) {
        baseTopics[0].title = "Health Experiences";
        baseTopics[1].title = "Health Problems";
        baseTopics[2].title = "Health Success";
      } else if (lowerQuery.includes('tech') || lowerQuery.includes('software') || lowerQuery.includes('app')) {
        baseTopics[0].title = "Tech Experiences";
        baseTopics[1].title = "Tech Problems";
        baseTopics[2].title = "Tech Success";
      } else if (lowerQuery.includes('education') || lowerQuery.includes('school') || lowerQuery.includes('learn')) {
        baseTopics[0].title = "Learning Experiences";
        baseTopics[1].title = "Learning Problems";
        baseTopics[2].title = "Learning Success";
      } else if (lowerQuery.includes('food') || lowerQuery.includes('recipe') || lowerQuery.includes('cook')) {
        baseTopics[0].title = "Food Experiences";
        baseTopics[1].title = "Cooking Problems";
        baseTopics[2].title = "Cooking Success";
      } else if (lowerQuery.includes('travel') || lowerQuery.includes('vacation') || lowerQuery.includes('trip')) {
        baseTopics[0].title = "Travel Experiences";
        baseTopics[1].title = "Travel Problems";
        baseTopics[2].title = "Travel Success";
      }
      
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

  // New method: Focused analysis based on user's specific selections
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
      
      // Step 1: Enhanced relevance filtering with expanded query
      const relevantPosts = await this.filterRelevantPosts(posts, expandedQuery);
      
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
      const categorizedResults = await this.performCategorySpecificAnalysis(relevantPosts, expandedQuery, selectedCategory);
      
      return {
        results: categorizedResults,
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

  static async performCategorySpecificAnalysis(posts, expandedQuery, category) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        return this.fallbackCategoryAnalysis(posts, category);
      }

      logger.info(`🔍 Performing ${category} analysis for: "${expandedQuery}"`);

      // Generate semantic context for better understanding
      const semanticContext = await this.generateSemanticContext(expandedQuery);
      
      // Generate category-specific context
      const categoryContext = this.getCategoryContext(category, expandedQuery);

      const postsText = posts.map((post, index) => 
        `${index + 1}. [${post.platform.toUpperCase()}] ${post.source} (${post.engagement} engagement):\n   "${post.content.substring(0, 300)}${post.content.length > 300 ? '...' : ''}"`
      ).join('\n\n');

      const prompt = `You are an expert social media analyst. Your task is to analyze posts and extract the most relevant insights for "${expandedQuery}" in the ${category.toUpperCase()} category.

SEARCH CONTEXT: "${expandedQuery}"
ANALYSIS CATEGORY: ${category.toUpperCase()}

SEMANTIC UNDERSTANDING:
${semanticContext}

${categoryContext}

CRITICAL FILTERING RULES:
- ONLY include posts that are genuinely relevant to "${expandedQuery}" in its ACTUAL context/domain
- Match the CONTEXT of the query - if it's about theme parks, focus on amusement park content; if it's about cooking, focus on food/recipe content
- REJECT posts about completely unrelated topics (programming when searching for theme parks, stock trading when searching for cooking, etc.)
- For ${category}, focus specifically on posts that provide meaningful ${category} insights about "${expandedQuery}"
- Prioritize high-quality, actionable content that users would find valuable
- Remember: "${expandedQuery}" defines the specific focus - stay within that domain

Posts to analyze (${posts.length} total):
${postsText}

Respond with ONLY a JSON object containing the indices (1-based) of the most relevant posts for ${category}:
{"relevant": [1, 3, 7, 12, ...]}

Return maximum 15 most relevant posts for ${category}.`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'sonar-pro',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from AI category analysis');
      }

      // Parse AI response
      const result = JSON.parse(aiResponse);
      const relevantIndices = result.relevant || [];
      
      // Convert indices to posts
      const relevantPosts = relevantIndices
        .filter(index => index >= 1 && index <= posts.length)
        .map(index => posts[index - 1])
        .filter(Boolean);

      logger.info(`✅ Category analysis complete: ${relevantPosts.length} posts for ${category}`);
      return relevantPosts;

    } catch (error) {
      logger.error('Category-specific analysis error:', error);
      return this.fallbackCategoryAnalysis(posts, category);
    }
  }

  static getCategoryContext(category, query) {
    const contexts = {
      'pain-points': `PAIN POINTS ANALYSIS: Extract posts that discuss problems, frustrations, challenges, complaints, or negative experiences related to "${query}". Focus on real-world issues people are facing.`,
      'trending-ideas': `TRENDING IDEAS ANALYSIS: Extract posts about popular discussions, viral content, emerging trends, news, or high-engagement content related to "${query}". Focus on what's currently popular and gaining attention.`,
      'content-ideas': `CONTENT IDEAS ANALYSIS: Extract posts that offer solutions, tips, tutorials, educational content, how-to guides, or posts asking questions about "${query}". Focus on actionable and educational content.`
    };

    return contexts[category] || `ANALYSIS: Extract the most relevant posts related to "${query}" in the context of ${category}.`;
  }

  static fallbackCategoryAnalysis(posts, category) {
    logger.info(`🔄 Using fallback analysis for ${category}`);
    
    // Simple engagement-based filtering as fallback
    const sortedPosts = posts
      .sort((a, b) => (b.engagement || 0) - (a.engagement || 0))
      .slice(0, 15);

    return sortedPosts;
  }

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

      // Generate semantic context for the query
      const semanticContext = await this.generateSemanticContext(query);

      const prompt = `You are an expert content relevance analyzer. Your task is to determine which posts are ACTUALLY RELEVANT to the user's search query.

SEARCH QUERY: "${query}"

SEMANTIC UNDERSTANDING:
${semanticContext}

STRICT RELEVANCE CRITERIA:
1. The post must be directly related to the search topic in ANY meaningful context (business, consumer, personal, entertainment, etc.)
2. Consider the FULL semantic meaning of the search query, not just individual keywords
3. Posts about completely unrelated topics (stock trading, horror stories, gaming, programming, etc.) are NEVER relevant
4. Posts that only mention keywords without proper context are NOT relevant
5. Posts asking questions about the topic ARE relevant
6. Posts sharing experiences related to the topic ARE relevant
7. Posts offering solutions or advice about the topic ARE relevant
8. Posts discussing tools, platforms, strategies, or challenges related to the topic ARE relevant${ratingContext}

CONTEXT AWARENESS:
- If searching for "theme park problems", look for theme park, amusement park, rides, tickets, crowds, etc.
- If searching for "programming", look for coding, software, development, etc.
- If searching for "cooking", look for recipes, food, kitchen, etc.
- Match the CONTEXT of the query, not just keywords

REJECTION EXAMPLES for "${query}":
- Stock market discussions (GameStop, trading, investments)
- Horror stories, fiction, entertainment content
- Gaming, sports, celebrity gossip
- Programming/technical content when searching for non-tech topics
- Personal drama unrelated to the search topic
- Random mentions of keywords without context

Posts to analyze:
${postsText}

Respond with ONLY a JSON object containing the indices (1-based) of relevant posts:
{"relevant": [1, 3, 7, 12, ...]}

If no posts are relevant, respond with: {"relevant": []}`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'sonar-pro',
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

      // Get semantic context for better categorization
      const semanticContext = await this.generateSemanticContext(query);

      const prompt = `You are an expert social media sentiment analyst. Analyze these posts and categorize them by SENTIMENT and INTENT related to "${query}".

SEARCH CONTEXT: "${query}"

SEMANTIC UNDERSTANDING:
${semanticContext}

IMPORTANT: Mix posts from ALL platforms (Reddit, X/Twitter, YouTube) in each category. Do NOT separate by platform.

CATEGORIES BY SENTIMENT/INTENT:
1. PAIN POINTS: Posts expressing problems, frustrations, challenges, complaints, or negative experiences specifically related to "${query}" in its natural context
2. TRENDING IDEAS: Posts about popular/viral discussions, news, emerging trends, or high-engagement content related to "${query}" in its natural context  
3. CONTENT IDEAS: Posts offering solutions, tips, tutorials, educational content, or asking questions about "${query}" in its natural context

STRICT ANALYSIS RULES:
- ONLY categorize posts that are genuinely relevant to "${query}" in its ACTUAL domain/context
- REJECT posts about completely unrelated topics (stock trading, horror stories, gaming when searching for cooking, programming when searching for theme parks, etc.)
- DISTRIBUTE posts across ALL THREE categories (don't put everything in one category)
- MIX platforms in each category - a category can have Reddit + X + YouTube posts together
- Prioritize high engagement posts for trending ideas
- Include posts asking questions about the topic as content ideas
- Include complaints and frustrations about the topic as pain points
- Match the CONTEXT of the query - if it's about theme parks, look for amusement park discussions; if it's about programming, look for coding discussions

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
        model: 'sonar-pro',
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
        model: 'sonar-pro',
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

  // Generate semantic context for better AI understanding
  static async generateSemanticContext(query) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        // Fallback semantic context without AI
        return this.getFallbackSemanticContext(query);
      }

      const prompt = `Analyze this search query and provide a comprehensive semantic understanding that will help filter relevant social media posts.

SEARCH QUERY: "${query}"

Provide a detailed analysis including:
1. What this query means in its specific context (business, consumer, entertainment, personal, etc.)
2. Related topics, concepts, and terms people actually use when discussing this
3. Common problems, challenges, and pain points people discuss
4. Solutions, experiences, and advice people share
5. Industry/domain context and use cases
6. What posts would be RELEVANT vs IRRELEVANT for this specific topic

IMPORTANT: Consider the FULL context of the query. If it's about theme parks, focus on amusement parks, rides, tickets, crowds, etc. If it's about programming, focus on coding, software, etc. Match the actual domain of the topic.

Keep the response concise but comprehensive. Focus on what people actually discuss about this topic on social media.`;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'sonar-pro',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 400,
        temperature: 0.2
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0]?.message?.content;
      return aiResponse || this.getFallbackSemanticContext(query);

    } catch (error) {
      logger.error('Error generating semantic context:', error);
      return this.getFallbackSemanticContext(query);
    }
  }

  static getFallbackSemanticContext(query) {
    // Basic semantic context without AI
    const lowerQuery = query.toLowerCase();
    
    // Business contexts
    if (lowerQuery.includes('sales')) {
      return `Business Context: Sales-related discussions including sales strategies, CRM tools, sales processes, lead generation, sales training, sales metrics, sales automation, sales teams, sales challenges, customer acquisition, conversion optimization, sales platforms, and sales performance.`;
    }
    
    if (lowerQuery.includes('engagement')) {
      return `Business Context: Engagement-related discussions including customer engagement, employee engagement, social media engagement, engagement strategies, engagement metrics, engagement tools, user engagement, content engagement, and engagement optimization.`;
    }
    
    if (lowerQuery.includes('marketing')) {
      return `Business Context: Marketing-related discussions including marketing strategies, digital marketing, content marketing, social media marketing, marketing automation, marketing tools, marketing campaigns, marketing metrics, and marketing optimization.`;
    }
    
    // Entertainment contexts
    if (lowerQuery.includes('theme park') || lowerQuery.includes('amusement')) {
      return `Entertainment Context: Theme park discussions including rides, attractions, tickets, crowds, wait times, food, experiences, family trips, park reviews, seasonal events, fast passes, and visitor experiences.`;
    }
    
    if (lowerQuery.includes('movie') || lowerQuery.includes('film')) {
      return `Entertainment Context: Movie discussions including reviews, recommendations, plot discussions, actor performances, box office, streaming, genres, franchises, and cinematic experiences.`;
    }
    
    // Food contexts
    if (lowerQuery.includes('cooking') || lowerQuery.includes('recipe') || lowerQuery.includes('food')) {
      return `Food Context: Cooking discussions including recipes, ingredients, cooking techniques, kitchen tools, meal planning, food reviews, dietary preferences, cooking challenges, and culinary experiences.`;
    }
    
    // Travel contexts
    if (lowerQuery.includes('travel') || lowerQuery.includes('vacation') || lowerQuery.includes('trip')) {
      return `Travel Context: Travel discussions including destinations, planning, accommodations, transportation, activities, travel tips, experiences, budgeting, and travel recommendations.`;
    }
    
    // Health contexts
    if (lowerQuery.includes('health') || lowerQuery.includes('fitness') || lowerQuery.includes('exercise')) {
      return `Health Context: Health discussions including wellness, fitness routines, medical advice, nutrition, mental health, physical challenges, recovery, and health experiences.`;
    }
    
    // Technology contexts
    if (lowerQuery.includes('programming') || lowerQuery.includes('coding') || lowerQuery.includes('software')) {
      return `Technology Context: Programming discussions including coding languages, software development, debugging, frameworks, tools, programming challenges, career advice, and technical solutions.`;
    }
    
    // Default context based on query
    return `Context: Discussions related to "${query}" including experiences, problems, solutions, tips, questions, and insights that people share about this topic on social media.`;
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
