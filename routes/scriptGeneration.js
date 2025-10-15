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
        model: 'llama-3.1-sonar-large-128k-chat',
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
1. Write ACTUAL CONTENT with SPECIFIC insights, solutions, and advice - NOT generic instructions like "identify the challenge" or "take action"
2. Extract and address the EXACT problems, trends, or questions from the social media posts above
3. Provide CONCRETE, ACTIONABLE steps with real examples (e.g., "Use zero-based budgeting" not "manage your budget better")
4. Make it engaging, valuable, and ${request.tone}
5. DO NOT use vague phrases like "let me break this down", "start by identifying", "take action", "many people struggle"
6. Include specific numbers, strategies, tools, or frameworks when relevant
7. Write as if you're an expert giving a masterclass, not a teacher explaining how to teach

EXAMPLE OF BAD vs GOOD CONTENT:
❌ BAD: "Today we'll explore spending control. First, understand the challenge. Then identify your problems. Finally, take action."
✅ GOOD: "Your agency grew from 3 to 12 people and spending is out of control. Here's the fix: 1) Implement the 'Rule of 40' - keep employee costs under 40% of revenue. Right now you're at 65%. 2) Switch from monthly to weekly budget reviews. 3) Use Finmark or Runway for real-time cash tracking. This saved my agency $8K/month."

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
        return `PAIN POINT ANALYSIS - CREATE SOLUTION-FOCUSED CONTENT:
YOU MUST:
- Identify the SPECIFIC problem from the posts (e.g., "spending spiraling when scaling from 3 to 12 employees")
- Provide 3-5 CONCRETE solutions with exact steps (e.g., "Implement weekly budget reviews every Monday at 9am")
- Give real examples, frameworks, or tools (e.g., "Use Profit First method: allocate 5% to profit account first")
- Show empathy but focus on SOLUTIONS, not just acknowledging the problem
- Include immediate actions they can take TODAY

DO NOT write generic advice like "manage your finances better" or "make a plan"
DO write specific advice like "Cut contractor costs by 30% by hiring one full-time developer instead of 3 freelancers"`;
      
      case 'trendingIdeas':
        return `TRENDING TOPIC ANALYSIS - CREATE MOMENTUM-DRIVEN CONTENT:
YOU MUST:
- State the SPECIFIC trend from the posts (e.g., "AI agents are replacing customer service teams")
- Provide a UNIQUE angle or insight others aren't discussing
- Include recent stats, numbers, or developments (e.g., "3 companies saved $50K in 2 months")
- Give 3-5 ways to capitalize on this trend NOW
- Make bold, shareable statements backed by evidence

DO NOT write generic trend commentary like "this is getting popular"
DO write specific insights like "Companies using Claude AI for support are seeing 67% faster response times"`;
      
      case 'contentIdeas':
        return `CONTENT OPPORTUNITY ANALYSIS - CREATE EDUCATIONAL CONTENT:
YOU MUST:
- Answer the SPECIFIC question or knowledge gap from the posts
- Break down concepts into simple, digestible explanations with examples
- Provide a step-by-step process or framework (numbered or bulleted)
- Include real-world examples or case studies
- Give them a complete understanding they can apply immediately

DO NOT write vague explanations like "you need to understand the basics first"
DO write clear teaching like "SEO has 3 parts: 1) Keywords in titles (example: 'best yoga mat for beginners'), 2) Fast page speed (under 3 seconds), 3) Backlinks from authority sites"`;
      
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
    return `You are an expert ${contentType} content creator and scriptwriter with 10+ years of experience. You create SPECIFIC, ACTIONABLE content, NOT generic instructions.

CRITICAL RULES:
- Extract EXACT insights from the social media posts provided
- Provide CONCRETE solutions, strategies, and steps (with numbers, tools, frameworks)
- Write ACTUAL content that educates/solves/informs, NOT meta-instructions about how to think
- Use ${tone} tone effectively
- Be specific and detailed, avoid vague statements

BAD EXAMPLE: "Start by identifying your core challenge and then take action"
GOOD EXAMPLE: "Your core challenge is cash flow when scaling. Here's what to do: 1) Implement weekly budget reviews every Monday, 2) Use the Profit First method - allocate 5% to profit first, 3) Cut contractor costs by hiring one full-time dev instead of 3 freelancers"

Always respond with valid JSON only. Your content must be immediately usable without any additional work.`;
  }

  static getMaxTokens(length, contentType) {
    const baseTokens = {
      video: { short: 1000, medium: 1500, long: 2200 },
      blog: { short: 800, medium: 1300, long: 2000 },
      social: { short: 500, medium: 800, long: 1200 },
      email: { short: 400, medium: 700, long: 1000 }
    };
    
    return baseTokens[contentType][length];
  }

  static getTemperature(tone) {
    const temperatures = {
      professional: 0.4,  // Slightly higher for more natural flow
      casual: 0.7,        // Higher for conversational, engaging tone
      educational: 0.5,   // Balanced for clear but engaging teaching
      entertaining: 0.8   // High for creative, fun content
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
