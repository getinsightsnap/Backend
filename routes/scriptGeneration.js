const express = require('express');
const axios = require('axios');
const logger = require('../utils/logger');

const router = express.Router();

class ScriptGenerationService {
  static baseUrl = 'https://api.perplexity.ai';
  static timeout = 30000; // 30 seconds

  static async generateScript(request) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey) {
        throw new Error('Perplexity API key not configured');
      }

      logger.info(`🎬 Generating ${request.contentType} script for ${request.category} category`);

      // Prepare enhanced context from posts
      const postsContext = this.preparePostsContext(request.posts);
      
      // Create intelligent prompt based on category and filters
      const prompt = this.createIntelligentPrompt(request, postsContext);

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(request.contentType, request.tone)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.getMaxTokens(request.length, request.contentType),
        temperature: this.getTemperature(request.tone),
        top_p: 0.9
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new Error('No response from Perplexity AI');
      }

      // Parse and validate the AI response
      const parsedScript = this.parseScriptResponse(aiResponse, request);
      
      logger.info(`✅ Script generated successfully for ${request.category}`);
      return parsedScript;

    } catch (error) {
      logger.error('Script generation error:', error);
      throw new Error(`Script generation failed: ${error.message}`);
    }
  }

  static preparePostsContext(posts) {
    return posts.map((post, index) => {
      const engagement = post.engagement || 0;
      const isHighEngagement = engagement > 1000;
      const engagementIndicator = isHighEngagement ? '🔥 HIGH ENGAGEMENT' : '';
      
      return `${index + 1}. [${post.platform.toUpperCase()}] ${post.source} | ${engagement} engagement ${engagementIndicator}
   Content: "${post.content.substring(0, 400)}${post.content.length > 400 ? '...' : ''}"
   Posted: ${post.timestamp}
   URL: ${post.url || 'N/A'}`;
    }).join('\n\n');
  }

  static createIntelligentPrompt(request, postsContext) {
    const categoryInstructions = this.getCategoryInstructions(request.category);
    const contentSpecs = this.getContentSpecifications(request.contentType, request.length);
    const toneGuidance = this.getToneGuidance(request.tone);
    const platformGuidance = this.getPlatformGuidance(request.platform);

    return `You are an expert content creator analyzing social media insights to create engaging ${request.contentType} content.

CONTENT CONTEXT:
Category: ${request.category}
Platform Focus: ${request.platform}
Content Type: ${request.contentType}
Tone: ${request.tone}
Length: ${request.length}

SOCIAL MEDIA INSIGHTS:
${postsContext}

${categoryInstructions}

${contentSpecs}

${toneGuidance}

${platformGuidance}

TASK: Create a complete, ready-to-use ${request.contentType} script that a content creator can immediately use.

CRITICAL REQUIREMENTS:
1. Write the ACTUAL script content, not instructions
2. Make it engaging and ${request.tone}
3. Address the specific insights from the social media posts
4. Include a compelling call-to-action
5. Use relevant hashtags if appropriate
6. Ensure the content is actionable and valuable

RESPOND WITH VALID JSON ONLY:
{
  "title": "Engaging title for the content",
  "content": "Complete script content with full sentences and paragraphs",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "callToAction": "Compelling call-to-action",
  "hashtags": ["#relevant", "#hashtags"],
  "estimatedDuration": "X minutes",
  "targetAudience": "Description of target audience",
  "contentStrategy": "Brief strategy explanation"
}`;
  }

  static getCategoryInstructions(category) {
    switch (category) {
      case 'painPoints':
        return `PAIN POINT ANALYSIS:
- Identify the core problems or frustrations mentioned in the posts
- Focus on providing practical solutions and actionable advice
- Address the emotional aspects of the pain point
- Create content that offers genuine help and relief
- Use empathy and understanding in your approach`;
      
      case 'trendingIdeas':
        return `TRENDING TOPIC ANALYSIS:
- Capitalize on the current momentum and interest
- Provide fresh insights or angles on the trending topic
- Include current data, statistics, or recent developments
- Make it shareable and engaging for social media
- Position the content as timely and relevant`;
      
      case 'contentIdeas':
        return `CONTENT OPPORTUNITY ANALYSIS:
- Focus on educational and informational value
- Create content that teaches or explains concepts
- Address questions or knowledge gaps
- Make it comprehensive and valuable
- Encourage learning and skill development`;
      
      default:
        return '';
    }
  }

  static getContentSpecifications(contentType, length) {
    const specs = {
      video: {
        short: { duration: '30-60 seconds', structure: 'Hook → Main Point → CTA' },
        medium: { duration: '2-5 minutes', structure: 'Hook → Problem → Solution → CTA' },
        long: { duration: '5-15 minutes', structure: 'Hook → Context → Deep Dive → Examples → CTA' }
      },
      blog: {
        short: { duration: '2-3 minutes', structure: 'Introduction → Key Points → Conclusion' },
        medium: { duration: '5-8 minutes', structure: 'Introduction → Problem → Solution → Examples → Conclusion' },
        long: { duration: '10-15 minutes', structure: 'Introduction → Background → Analysis → Solutions → Case Studies → Conclusion' }
      },
      social: {
        short: { duration: 'Quick read', structure: 'Hook → Value → CTA' },
        medium: { duration: '1-2 minutes', structure: 'Attention → Interest → Desire → Action' },
        long: { duration: '3-5 minutes', structure: 'Story → Problem → Solution → Benefits → CTA' }
      },
      email: {
        short: { duration: '1 minute', structure: 'Subject → Greeting → Main Point → CTA' },
        medium: { duration: '2-3 minutes', structure: 'Subject → Greeting → Problem → Solution → CTA' },
        long: { duration: '5-8 minutes', structure: 'Subject → Story → Problem → Solution → Benefits → Social Proof → CTA' }
      }
    };

    const spec = specs[contentType][length];
    return `CONTENT SPECIFICATIONS:
- Type: ${contentType}
- Length: ${length} (${spec.duration})
- Structure: ${spec.structure}
- Format: Complete, ready-to-use script`;
  }

  static getToneGuidance(tone) {
    const tones = {
      professional: 'Use formal language, industry terminology, and authoritative voice. Focus on credibility and expertise.',
      casual: 'Use conversational language, personal anecdotes, and friendly tone. Make it relatable and approachable.',
      educational: 'Use clear explanations, examples, and step-by-step guidance. Focus on learning and understanding.',
      entertaining: 'Use humor, storytelling, and engaging elements. Make it fun and memorable while still being informative.'
    };
    
    return `TONE GUIDANCE: ${tones[tone]}`;
  }

  static getPlatformGuidance(platform) {
    const platforms = {
      all: 'Create content suitable for cross-platform sharing with universal appeal.',
      reddit: 'Use detailed explanations, community-focused language, and encourage discussion.',
      x: 'Use concise language, trending topics, and Twitter-friendly formatting.',
      youtube: 'Use engaging hooks, visual descriptions, and YouTube-optimized structure.'
    };
    
    return `PLATFORM OPTIMIZATION: ${platforms[platform]}`;
  }

  static getSystemPrompt(contentType, tone) {
    return `You are an expert ${contentType} content creator and scriptwriter. You specialize in creating engaging, well-structured content based on social media insights and trends. 

Your expertise includes:
- Analyzing social media sentiment and trends
- Creating content that resonates with target audiences
- Writing compelling scripts that drive engagement
- Adapting content for different platforms and formats
- Using ${tone} tone effectively

Always respond with valid JSON only. Focus on creating actionable, valuable content that content creators can immediately use.`;
  }

  static getMaxTokens(length, contentType) {
    const baseTokens = {
      video: { short: 800, medium: 1200, long: 1800 },
      blog: { short: 600, medium: 1000, long: 1500 },
      social: { short: 400, medium: 600, long: 800 },
      email: { short: 300, medium: 500, long: 700 }
    };
    
    return baseTokens[contentType][length];
  }

  static getTemperature(tone) {
    const temperatures = {
      professional: 0.3,
      casual: 0.6,
      educational: 0.4,
      entertaining: 0.7
    };
    
    return temperatures[tone];
  }

  static parseScriptResponse(response, request) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      
      // Validate required fields
      if (!parsed.title || !parsed.content) {
        throw new Error('Invalid script format - missing required fields');
      }
      
      // Add metadata
      parsed.metadata = {
        generatedAt: new Date().toISOString(),
        category: request.category,
        contentType: request.contentType,
        tone: request.tone,
        length: request.length,
        platform: request.platform,
        postsAnalyzed: request.posts.length
      };
      
      return parsed;
      
    } catch (error) {
      // If JSON parsing fails, create a structured response
      logger.warn('Failed to parse AI response as JSON, creating structured response');
      
      return {
        title: `Generated ${request.contentType} Script`,
        content: response,
        keyPoints: ['Key insights from social media analysis', 'Actionable recommendations', 'Engaging content strategy'],
        callToAction: 'Engage with this content and share your thoughts!',
        hashtags: ['#content', '#insights', '#engagement'],
        estimatedDuration: '2-3 minutes',
        targetAudience: 'Social media users interested in this topic',
        contentStrategy: 'Based on current social media insights and trends',
        metadata: {
          generatedAt: new Date().toISOString(),
          category: request.category,
          contentType: request.contentType,
          tone: request.tone,
          length: request.length,
          platform: request.platform,
          postsAnalyzed: request.posts.length
        }
      };
    }
  }
}

// Generate script endpoint
router.post('/generate', async (req, res) => {
  try {
    const {
      category,
      posts,
      platform,
      contentType,
      tone,
      length,
      userId
    } = req.body;

    // Validate required fields
    if (!category || !posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: category and posts are required'
      });
    }

    logger.info(`🎬 Script generation request: ${contentType} ${category} script for ${posts.length} posts`);

    const script = await ScriptGenerationService.generateScript({
      category,
      posts,
      platform: platform || 'all',
      contentType: contentType || 'video',
      tone: tone || 'educational',
      length: length || 'medium',
      userId
    });

    res.json({
      success: true,
      data: script
    });

  } catch (error) {
    logger.error('Script generation endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Script generation failed',
      message: error.message
    });
  }
});

// Health check for script generation service
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'script-generation',
    timestamp: new Date().toISOString(),
    perplexityConfigured: !!process.env.PERPLEXITY_API_KEY
  });
});

module.exports = router;
