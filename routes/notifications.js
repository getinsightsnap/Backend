const express = require('express');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Send new signup notification
 * POST /api/notifications/signup
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, name, subscription_tier, signup_method } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    logger.info(`📬 New signup notification request for: ${email}`);
    
    const userData = {
      email,
      name: name || email.split('@')[0],
      subscription_tier: subscription_tier || 'free',
      signup_method: signup_method || 'email',
      timestamp: new Date().toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        dateStyle: 'full',
        timeStyle: 'long'
      })
    };

    const result = await emailService.notifyNewSignup(userData);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Signup notification sent successfully',
        messageId: result.messageId
      });
    } else {
      res.json({
        success: false,
        message: result.message || 'Failed to send notification',
        error: result.error
      });
    }

  } catch (error) {
    logger.error('Signup notification error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to send signup notification',
      message: error.message
    });
  }
});

/**
 * Test email service
 * GET /api/notifications/test
 */
router.get('/test', async (req, res) => {
  try {
    const result = await emailService.testConnection();
    
    res.json({
      success: result.success,
      message: result.message || result.error,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Email service test error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Email service test failed',
      message: error.message
    });
  }
});

/**
 * Health check
 * GET /api/notifications/health
 */
router.get('/health', (req, res) => {
  const isConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
  
  res.json({
    status: isConfigured ? 'OK' : 'WARNING',
    service: 'notifications',
    configured: isConfigured,
    message: isConfigured ? 'Email service configured' : 'Email credentials not set',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

