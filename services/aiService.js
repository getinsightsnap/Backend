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
        contentIdeas: []
      };
    }

    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey) {
        logger.warn('Perplexity API key not configured, using simple categorization');
        return this.simpleCategorization(posts);
      }

      logger.info(`🤖 Categorizing ${posts.length} posts using AI...`);
      
      // Prepare posts for AI analysis with timestamps
      const postsText = posts.slice(0, 20).map((post, index) => 
        `${index + 1}. [${post.platform}] Posted ${post.timestamp}: ${post.content.substring(0, 200)}...`
      ).join('\n\n');

      const prompt = `Analyze these social media posts about "${query}" and categorize them into three groups. Consider both the content AND the post time (recency matters for trending ideas):

1. PAIN POINTS: Posts that express problems, frustrations, complaints, or challenges
2. TRENDING IDEAS: Posts about popular topics, viral content, or emerging trends
3. CONTENT IDEAS: Posts that suggest solutions, tips, tutorials, or valuable insights

Posts to analyze:
${postsText}

Please respond with a JSON object in this exact format:
{
  "painPoints": [list of post indices that are pain points],
  "trendingIdeas": [list of post indices that are trending ideas],
  "contentIdeas": [list of post indices that are content ideas]
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
        contentIdeas: this.getCategorizedPosts(posts, categorization.contentIdeas || [])
      };

      logger.info(`✅ AI categorization complete: ${result.painPoints.length} pain points, ${result.trendingIdeas.length} trending ideas, ${result.contentIdeas.length} content ideas`);
      
      return result;

    } catch (error) {
      logger.error('AI categorization error:', error);
      logger.info('Falling back to simple categorization');
      return this.simpleCategorization(posts);
    }
  }

  static getCategorizedPosts(posts, indices) {
    return indices
      .filter(index => index >= 0 && index < posts.length)
      .map(index => posts[index])
      .filter(Boolean);
  }

  static simpleCategorization(posts) {
    const painPointKeywords = [
      'problem', 'issue', 'struggle', 'difficult', 'hard', 'frustrated', 'annoying',
      'hate', 'terrible', 'awful', 'worst', 'broken', 'doesn\'t work', 'failed',
      'disappointed', 'upset', 'angry', 'complaint', 'bug', 'error'
    ];

    const trendingKeywords = [
      'viral', 'trending', 'popular', 'hot', 'buzz', 'hype', 'craze', 'fad',
      'everyone is talking about', 'all over', 'blowing up', 'going viral',
      'trend', 'happening now', 'latest', 'new'
    ];

    const contentKeywords = [
      'tip', 'tutorial', 'guide', 'how to', 'solution', 'advice', 'recommend',
      'best', 'top', 'list', 'check out', 'try this', 'learn', 'trick',
      'hack', 'secret', 'insider', 'expert', 'pro', 'professional'
    ];

    const painPoints = [];
    const trendingIdeas = [];
    const contentIdeas = [];

    posts.forEach(post => {
      const content = post.content.toLowerCase();
      
      const painScore = painPointKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const trendingScore = trendingKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );
      
      const contentScore = contentKeywords.reduce((score, keyword) => 
        score + (content.includes(keyword) ? 1 : 0), 0
      );

      // Categorize based on highest score
      if (painScore > trendingScore && painScore > contentScore) {
        painPoints.push(post);
      } else if (trendingScore > contentScore) {
        trendingIdeas.push(post);
      } else if (contentScore > 0) {
        contentIdeas.push(post);
      } else {
        // Default to content ideas if no clear category
        contentIdeas.push(post);
      }
    });

    return {
      painPoints: painPoints.slice(0, 20),
      trendingIdeas: trendingIdeas.slice(0, 20),
      contentIdeas: contentIdeas.slice(0, 20)
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
