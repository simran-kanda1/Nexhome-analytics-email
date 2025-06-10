// dailyEmailService.js
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { PipedriveAPI } = require('./pipedriveAPI'); // Adjust path as needed

class DailyAnalyticsEmailService {
  constructor(emailConfig) {
    this.emailConfig = emailConfig;
    this.setupEmailTransporter();
    this.startScheduler();
  }

  setupEmailTransporter() {
    // Configure your email service (Gmail, Outlook, etc.)
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // or your email service
      auth: {
        user: this.emailConfig.user,
        pass: this.emailConfig.password // Use app password for Gmail
      }
    });
    
    // Alternative configuration for custom SMTP
    /*
    this.transporter = nodemailer.createTransporter({
      host: 'your-smtp-server.com',
      port: 587,
      secure: false,
      auth: {
        user: this.emailConfig.user,
        pass: this.emailConfig.password
      }
    });
    */
  }

  startScheduler() {
    // Schedule to run every day at 8:30 AM
    // Format: '30 8 * * *' means: minute=30, hour=8, every day, every month, every day of week
    cron.schedule('30 8 * * *', async () => {
      console.log('Running daily analytics email at', new Date().toISOString());
      try {
        await this.sendDailyAnalyticsEmail();
      } catch (error) {
        console.error('Error sending daily analytics email:', error);
      }
    }, {
      timezone: "America/Toronto" // Adjust to your timezone
    });

    console.log('Daily analytics email scheduler started. Will send at 8:30 AM daily.');
  }

  async fetchYesterdayAnalytics() {
    try {
      // Get yesterday's date range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      const dateRange = {
        startDate: yesterday.toISOString().split('T')[0],
        endDate: endOfYesterday.toISOString().split('T')[0]
      };

      console.log('Fetching analytics for:', dateRange);

      // Add delays between API calls to avoid rate limiting
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Fetch all necessary data
      const [
        dealsResponse,
        activitiesResponse,
        usersResponse,
        pipelinesResponse
      ] = await Promise.all([
        PipedriveAPI.getDeals(),
        PipedriveAPI.getActivitiesByDateRange(dateRange.startDate, dateRange.endDate),
        PipedriveAPI.getUsers(),
        PipedriveAPI.getPipelines()
      ]);

      await delay(300);

      const allDeals = dealsResponse.data || [];
      const allActivities = activitiesResponse.data || [];
      const users = usersResponse.data || [];
      const pipelines = pipelinesResponse.data || [];

      // Fetch call activities
      let callActivities = [];
      try {
        const callsResponse = await PipedriveAPI.getCallActivitiesWithDeals(dateRange.startDate, dateRange.endDate);
        callActivities = callsResponse.data || [];
      } catch (error) {
        console.error('Error fetching call activities:', error);
        callActivities = allActivities.filter(activity => 
          activity.type === 'call' || (activity.key_string && activity.key_string.includes('call'))
        );
      }

      await delay(300);

      // Fetch notes (with rate limiting)
      let notes = [];
      try {
        notes = await this.fetchNotesForDate(dateRange, allDeals);
      } catch (error) {
        console.error('Error fetching notes:', error);
        notes = [];
      }

      await delay(300);

      // Fetch simple deal movements (deals updated yesterday)
      const dealMovements = await this.fetchDealMovements(dateRange, allDeals, pipelines);

      // Filter data for yesterday
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);

      // Won deals yesterday
      const wonDeals = allDeals.filter(deal => {
        if (deal.status !== 'won' || !deal.won_time) return false;
        const wonDate = new Date(deal.won_time);
        return wonDate >= startDate && wonDate <= endDate;
      });

      // Lost deals yesterday
      const lostDeals = allDeals.filter(deal => {
        if (deal.status !== 'lost' || !deal.lost_time) return false;
        const lostDate = new Date(deal.lost_time);
        return lostDate >= startDate && lostDate <= endDate;
      });

      // Activities completed yesterday
      const completedActivities = allActivities.filter(activity => activity.done);

      // Calculate analytics by owner
      const analyticsData = this.calculateAnalyticsByOwner({
        callActivities,
        notes,
        dealMovements,
        completedActivities,
        wonDeals,
        lostDeals,
        users
      });

      return {
        date: yesterday.toLocaleDateString('en-CA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        totalStats: {
          callsMade: callActivities.length,
          notesCreated: notes.length,
          dealMovements: dealMovements.length,
          activitiesDone: completedActivities.length,
          dealsWon: wonDeals.length,
          dealsLost: lostDeals.length
        },
        byOwner: analyticsData,
        detailedData: {
          wonDeals,
          lostDeals,
          callActivities,
          notes,
          dealMovements
        }
      };

    } catch (error) {
      console.error('Error fetching yesterday analytics:', error);
      throw error;
    }
  }

  async fetchNotesForDate(dateRange, allDeals) {
    try {
      const params = {
        limit: 500,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate
      };

      const notesResponse = await PipedriveAPI.getNotes(params);
      const allNotes = notesResponse.data || [];

      const dealMap = new Map();
      allDeals.forEach(deal => {
        dealMap.set(deal.id, deal);
      });

      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);

      return allNotes
        .filter(note => {
          if (!note.add_time) return false;
          const noteDate = new Date(note.add_time);
          return noteDate >= startDate && noteDate <= endDate;
        })
        .map(note => {
          const deal = note.deal_id ? dealMap.get(note.deal_id) : null;
          return {
            id: note.id,
            content: note.content || 'Note added',
            dealId: note.deal_id,
            dealTitle: deal ? deal.title : 'No Deal Associated',
            dealOwner: deal ? deal.user_id : null,
            addTime: note.add_time,
            userId: note.user_id
          };
        });
        
    } catch (error) {
      console.error('Error fetching notes:', error);
      return [];
    }
  }

  async fetchDealMovements(dateRange, allDeals, pipelines) {
    try {
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);

      const updatedDeals = allDeals.filter(deal => {
        if (!deal.update_time) return false;
        const updateDate = new Date(deal.update_time);
        return updateDate >= startDate && updateDate <= endDate;
      });

      return updatedDeals.map(deal => ({
        id: `deal_update_${deal.id}`,
        dealId: deal.id,
        dealTitle: deal.title,
        dealOwner: deal.user_id,
        changeDescription: 'Deal updated',
        changeDate: deal.update_time,
        pipelineId: deal.pipeline_id,
        pipelineName: pipelines.find(p => p.id === deal.pipeline_id)?.name || 'Unknown Pipeline'
      }));

    } catch (error) {
      console.error('Error fetching deal movements:', error);
      return [];
    }
  }

  calculateAnalyticsByOwner(data) {
    const { callActivities, notes, dealMovements, completedActivities, wonDeals, lostDeals, users } = data;
    const ownerStats = new Map();

    // Helper function to get user name
    const getUserName = (userId) => {
      if (typeof userId === 'object' && userId.name) return userId.name;
      const user = users.find(u => u.id === userId);
      return user ? user.name : 'Unknown User';
    };

    // Initialize stats for all users who had activity
    const allUserIds = new Set([
      ...callActivities.map(c => c.displayOwner || c.user_id),
      ...notes.map(n => n.dealOwner || n.userId).filter(Boolean),
      ...dealMovements.map(d => d.dealOwner).filter(Boolean),
      ...completedActivities.map(a => a.user_id).filter(Boolean),
      ...wonDeals.map(d => d.user_id).filter(Boolean),
      ...lostDeals.map(d => d.user_id).filter(Boolean)
    ]);

    allUserIds.forEach(userId => {
      if (userId) {
        ownerStats.set(userId, {
          name: getUserName(userId),
          callsMade: 0,
          notesCreated: 0,
          dealMovements: 0,
          activitiesDone: 0,
          dealsWon: 0,
          dealsLost: 0
        });
      }
    });

    // Count calls by owner
    callActivities.forEach(call => {
      const ownerId = call.displayOwner || call.user_id;
      if (ownerId && ownerStats.has(ownerId)) {
        ownerStats.get(ownerId).callsMade++;
      }
    });

    // Count notes by owner
    notes.forEach(note => {
      const ownerId = note.dealOwner || note.userId;
      if (ownerId && ownerStats.has(ownerId)) {
        ownerStats.get(ownerId).notesCreated++;
      }
    });

    // Count deal movements by owner
    dealMovements.forEach(movement => {
      const ownerId = movement.dealOwner;
      if (ownerId && ownerStats.has(ownerId)) {
        ownerStats.get(ownerId).dealMovements++;
      }
    });

    // Count completed activities by owner
    completedActivities.forEach(activity => {
      const ownerId = activity.user_id;
      if (ownerId && ownerStats.has(ownerId)) {
        ownerStats.get(ownerId).activitiesDone++;
      }
    });

    // Count won deals by owner
    wonDeals.forEach(deal => {
      const ownerId = deal.user_id;
      if (ownerId && ownerStats.has(ownerId)) {
        ownerStats.get(ownerId).dealsWon++;
      }
    });

    // Count lost deals by owner
    lostDeals.forEach(deal => {
      const ownerId = deal.user_id;
      if (ownerId && ownerStats.has(ownerId)) {
        ownerStats.get(ownerId).dealsLost++;
      }
    });

    return Array.from(ownerStats.values()).filter(stats => 
      stats.callsMade > 0 || stats.notesCreated > 0 || stats.dealMovements > 0 || 
      stats.activitiesDone > 0 || stats.dealsWon > 0 || stats.dealsLost > 0
    );
  }

  generateEmailHTML(analyticsData) {
    const { date, totalStats, byOwner, detailedData } = analyticsData;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Analytics Report - ${date}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #4f46e5; margin: 0; font-size: 28px; }
          .header p { color: #666; margin: 10px 0 0 0; font-size: 16px; }
          .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
          .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; }
          .stat-card.green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
          .stat-card.red { background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%); }
          .stat-card.blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .stat-card h3 { margin: 0 0 10px 0; font-size: 16px; opacity: 0.9; }
          .stat-card .number { font-size: 32px; font-weight: bold; margin: 0; }
          .owner-section { margin-top: 30px; }
          .owner-section h2 { color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
          .owner-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 15px; }
          .owner-name { font-size: 18px; font-weight: bold; color: #374151; margin-bottom: 15px; }
          .owner-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
          .owner-stat { text-align: center; padding: 10px; background: white; border-radius: 6px; border: 1px solid #d1d5db; }
          .owner-stat .label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px; }
          .owner-stat .value { font-size: 20px; font-weight: bold; color: #374151; }
          .summary { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin-top: 30px; }
          .summary h3 { color: #1e40af; margin: 0 0 15px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Daily Analytics Report</h1>
            <p>${date}</p>
          </div>

          <div class="stats-grid">
            <div class="stat-card blue">
              <h3>📞 Phone Calls</h3>
              <p class="number">${totalStats.callsMade}</p>
            </div>
            <div class="stat-card">
              <h3>📝 Notes Created</h3>
              <p class="number">${totalStats.notesCreated}</p>
            </div>
            <div class="stat-card">
              <h3>🔄 Deal Movements</h3>
              <p class="number">${totalStats.dealMovements}</p>
            </div>
            <div class="stat-card green">
              <h3>✅ Activities Done</h3>
              <p class="number">${totalStats.activitiesDone}</p>
            </div>
            <div class="stat-card green">
              <h3>🏆 Deals Won</h3>
              <p class="number">${totalStats.dealsWon}</p>
            </div>
            <div class="stat-card red">
              <h3>❌ Deals Lost</h3>
              <p class="number">${totalStats.dealsLost}</p>
            </div>
          </div>

          ${byOwner.length > 0 ? `
          <div class="owner-section">
            <h2>👥 Performance by Team Member</h2>
            ${byOwner.map(owner => `
              <div class="owner-card">
                <div class="owner-name">${owner.name}</div>
                <div class="owner-stats">
                  <div class="owner-stat">
                    <div class="label">Calls</div>
                    <div class="value">${owner.callsMade}</div>
                  </div>
                  <div class="owner-stat">
                    <div class="label">Notes</div>
                    <div class="value">${owner.notesCreated}</div>
                  </div>
                  <div class="owner-stat">
                    <div class="label">Movements</div>
                    <div class="value">${owner.dealMovements}</div>
                  </div>
                  <div class="owner-stat">
                    <div class="label">Activities</div>
                    <div class="value">${owner.activitiesDone}</div>
                  </div>
                  <div class="owner-stat">
                    <div class="label">Won</div>
                    <div class="value">${owner.dealsWon}</div>
                  </div>
                  <div class="owner-stat">
                    <div class="label">Lost</div>
                    <div class="value">${owner.dealsLost}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          <div class="summary">
            <h3>📈 Summary</h3>
            <p>
              Yesterday, your team made <strong>${totalStats.callsMade} phone calls</strong> and created 
              <strong>${totalStats.notesCreated} notes</strong>. There were <strong>${totalStats.dealMovements} deal movements</strong> 
              and <strong>${totalStats.activitiesDone} activities completed</strong>.
            </p>
            ${totalStats.dealsWon > 0 || totalStats.dealsLost > 0 ? `
            <p>
              Deal outcomes: <strong style="color: #059669;">${totalStats.dealsWon} deals won</strong> 
              ${totalStats.dealsLost > 0 ? `and <strong style="color: #dc2626;">${totalStats.dealsLost} deals lost</strong>` : ''}.
            </p>
            ` : ''}
          </div>

          <div class="footer">
            <p>Generated automatically by your Pipedrive Analytics System</p>
            <p>Report generated at ${new Date().toLocaleString('en-CA')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendDailyAnalyticsEmail() {
    try {
      const analyticsData = await this.fetchYesterdayAnalytics();
      const emailHTML = this.generateEmailHTML(analyticsData);

      const mailOptions = {
        from: this.emailConfig.user,
        to: this.emailConfig.recipients, // Array of email addresses
        subject: `📊 Daily Analytics Report - ${analyticsData.date}`,
        html: emailHTML
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Daily analytics email sent successfully:', result.messageId);
      return result;

    } catch (error) {
      console.error('Error sending daily analytics email:', error);
      throw error;
    }
  }

  // Method to send test email immediately
  async sendTestEmail() {
    console.log('Sending test email...');
    return await this.sendDailyAnalyticsEmail();
  }

  // Method to stop the scheduler
  stopScheduler() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      console.log('Daily analytics email scheduler stopped.');
    }
  }
}

module.exports = DailyAnalyticsEmailService;