// server.js - Main server file to run the email service
require('dotenv').config();
const DailyAnalyticsEmailService = require('./dailyEmailService');

// Email configuration
const emailConfig = {
  user: process.env.EMAIL_USER, // Your email address
  password: process.env.EMAIL_PASSWORD, // Your email password or app password
  recipients: [
    process.env.RECIPIENT_EMAIL_1, // Primary recipient
    // Add more recipients as needed
    // 'manager@company.com',
    // 'team@company.com'
  ].filter(Boolean) // Remove any undefined emails
};

// Validate configuration
if (!emailConfig.user || !emailConfig.password) {
  console.error('Email configuration missing! Please set EMAIL_USER and EMAIL_PASSWORD in your .env file');
  process.exit(1);
}

if (emailConfig.recipients.length === 0) {
  console.error('No recipients configured! Please set RECIPIENT_EMAIL_1 in your .env file');
  process.exit(1);
}

console.log('Starting Daily Analytics Email Service...');
console.log('Configured recipients:', emailConfig.recipients);

// Initialize the email service
const emailService = new DailyAnalyticsEmailService(emailConfig);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  emailService.stopScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  emailService.stopScheduler();
  process.exit(0);
});

// Optional: Add a test endpoint if you want to trigger emails manually
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Test endpoint to send email immediately
app.post('/send-test-email', async (req, res) => {
  try {
    console.log('Manual test email requested');
    const result = await emailService.sendTestEmail();
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'running',
    service: 'Daily Analytics Email Service',
    nextRun: '8:30 AM daily',
    timezone: 'America/Toronto'
  });
});

app.listen(PORT, () => {
  console.log(`Email service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test email: POST http://localhost:${PORT}/send-test-email`);
  console.log('Scheduled to send daily analytics at 8:30 AM');
});

console.log('Daily Analytics Email Service is now running...');
console.log('The service will automatically send daily reports at 8:30 AM');
console.log('Press Ctrl+C to stop the service');