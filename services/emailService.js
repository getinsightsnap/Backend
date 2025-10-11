const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.adminEmail = null;
    this.isConfigured = false;
    
    // Only initialize if SMTP credentials are available
    this.checkConfiguration();
  }

  // Check if SMTP is properly configured
  checkConfiguration() {
    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      try {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false, // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        });
        this.adminEmail = process.env.ADMIN_EMAIL || 'admin@insightsnap.co';
        this.isConfigured = true;
        console.log('✅ Email service configured successfully');
      } catch (error) {
        console.warn('⚠️ Failed to configure email service:', error.message);
        this.isConfigured = false;
      }
    } else {
      console.log('📧 Email service disabled - SMTP credentials not configured');
      this.isConfigured = false;
    }
  }

  // Initialize transporter lazily when first needed (fallback method)
  initTransporter() {
    if (!this.transporter && this.isConfigured) {
      return this.checkConfiguration();
    }
    return this.transporter;
  }

  /**
   * Send new signup notification to admin
   */
  async notifyNewSignup(userData) {
    try {
      // Check if email service is configured
      if (!this.isConfigured || !this.transporter) {
        logger.info('📧 Email notification skipped - SMTP not configured');
        return { success: false, message: 'Email service not configured' };
      }

      const { email, name, subscription_tier, signup_method } = userData;
      
      logger.info(`📧 Sending new signup notification for: ${email}`);

      const mailOptions = {
        from: `"InsightSnap Notifications" <${process.env.SMTP_USER}>`,
        to: this.adminEmail,
        subject: `🎉 New User Signup: ${name || email}`,
        html: this.generateSignupEmailHTML(userData),
        text: this.generateSignupEmailText(userData)
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`✅ Signup notification email sent: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (error) {
      logger.error('❌ Failed to send signup notification email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate HTML email for signup notification
   */
  generateSignupEmailHTML(userData) {
    const { email, name, subscription_tier, signup_method, timestamp } = userData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
          .info-row { display: flex; margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 5px; }
          .info-label { font-weight: bold; min-width: 150px; color: #667eea; }
          .info-value { color: #333; }
          .badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .badge-free { background: #e3f2fd; color: #1976d2; }
          .badge-standard { background: #fff3e0; color: #f57c00; }
          .badge-pro { background: #f3e5f5; color: #7b1fa2; }
          .badge-google { background: #fce4ec; color: #c2185b; }
          .badge-email { background: #e8f5e9; color: #388e3c; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .cta-button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 New User Signup!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Someone just joined InsightSnap</p>
          </div>
          
          <div class="content">
            <h2 style="color: #667eea; margin-top: 0;">User Details</h2>
            
            <div class="info-row">
              <span class="info-label">👤 Name:</span>
              <span class="info-value">${name || 'Not provided'}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">📧 Email:</span>
              <span class="info-value">${email}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">💳 Subscription Tier:</span>
              <span class="info-value">
                <span class="badge badge-${subscription_tier || 'free'}">${subscription_tier || 'free'}</span>
              </span>
            </div>
            
            <div class="info-row">
              <span class="info-label">🔐 Signup Method:</span>
              <span class="info-value">
                <span class="badge badge-${signup_method === 'google' ? 'google' : 'email'}">${signup_method || 'email'}</span>
              </span>
            </div>
            
            <div class="info-row">
              <span class="info-label">⏰ Time:</span>
              <span class="info-value">${timestamp || new Date().toLocaleString()}</span>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: #f0f7ff; border-left: 4px solid #667eea; border-radius: 5px;">
              <p style="margin: 0; color: #667eea; font-weight: bold;">📊 Quick Stats</p>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
                This user will have access to <strong>${subscription_tier === 'pro' ? 'unlimited' : subscription_tier === 'standard' ? '50' : '5'} searches per day</strong> 
                and can view up to <strong>${subscription_tier === 'pro' ? 'unlimited' : subscription_tier === 'standard' ? '5' : '3'} results per category</strong>.
              </p>
            </div>
            
            <div style="text-align: center;">
              <a href="https://insightsnap.co/dashboard" class="cta-button">View Dashboard</a>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from InsightSnap</p>
            <p style="color: #999; margin-top: 10px;">
              InsightSnap - AI-Powered Content Research Platform<br>
              © ${new Date().getFullYear()} InsightSnap. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text email for signup notification
   */
  generateSignupEmailText(userData) {
    const { email, name, subscription_tier, signup_method, timestamp } = userData;
    
    return `
🎉 NEW USER SIGNUP - InsightSnap

User Details:
-------------
Name: ${name || 'Not provided'}
Email: ${email}
Subscription Tier: ${subscription_tier || 'free'}
Signup Method: ${signup_method || 'email'}
Time: ${timestamp || new Date().toLocaleString()}

Quick Stats:
-----------
- Searches per day: ${subscription_tier === 'pro' ? 'unlimited' : subscription_tier === 'standard' ? '50' : '5'}
- Results per category: ${subscription_tier === 'pro' ? 'unlimited' : subscription_tier === 'standard' ? '5' : '3'}

View your dashboard: https://insightsnap.co/dashboard

---
This is an automated notification from InsightSnap
© ${new Date().getFullYear()} InsightSnap. All rights reserved.
    `.trim();
  }

  /**
   * Test email configuration
   */
  async testConnection() {
    try {
      if (!this.isConfigured || !this.transporter) {
        return { success: false, error: 'Email service not configured' };
      }
      
      await this.transporter.verify();
      logger.info('✅ Email service connection verified');
      return { success: true, message: 'Email service configured correctly' };
    } catch (error) {
      logger.error('❌ Email service connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get email service status
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      hasTransporter: !!this.transporter,
      adminEmail: this.adminEmail,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: process.env.SMTP_PORT || 587
    };
  }
}

module.exports = new EmailService();

