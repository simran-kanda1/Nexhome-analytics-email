// dailyEmailService.js - FIXED VERSION with proper call detection from pipedriveAPI.js
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { PipedriveAPI } = require('./pipedriveAPI');

class DailyAnalyticsEmailService {
  constructor(emailConfig) {
    this.emailConfig = emailConfig;
    this.setupEmailTransporter();
    this.startScheduler();
  }

  setupEmailTransporter() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.emailConfig.user,
        pass: this.emailConfig.password
      }
    });
  }

  startScheduler() {
    cron.schedule('30 8 * * *', async () => {
      console.log('Running daily analytics email at', new Date().toISOString());
      try {
        await this.sendDailyAnalyticsEmail();
      } catch (error) {
        console.error('Error sending daily analytics email:', error);
      }
    }, {
      timezone: "America/Toronto"
    });

    console.log('Daily analytics email scheduler started. Will send at 8:30 AM daily.');
  }

  // Helper function to normalize user ID (handle both objects and numbers)
  normalizeUserId(userId) {
    if (!userId) return null;
    if (typeof userId === 'object' && userId.id) return userId.id;
    return userId;
  }

  // Helper function to get user name
  getUserName(userId, users) {
    if (!userId) return 'Unknown User';
    
    const normalizedId = this.normalizeUserId(userId);
    const user = users.find(u => u.id === normalizedId);
    return user ? user.name : `User ${normalizedId}`;
  }

  // FIXED: Enhanced call detection using the same logic as pipedriveAPI.js
  filterCallActivities(activities) {
    const callActivities = activities.filter(activity => {
      const isCall = (
        activity.type === 'call' ||
        activity.key_string === 'call' ||
        (activity.key_string && activity.key_string.toLowerCase().includes('call')) ||
        (activity.subject && activity.subject.toLowerCase().includes('call')) ||
        (activity.note && activity.note.toLowerCase().includes('call')) ||
        // Check for JustCall integration patterns
        (activity.subject && activity.subject.includes('Outgoing Call')) ||
        (activity.subject && activity.subject.includes('Incoming Call')) ||
        (activity.note && activity.note.includes('Call Recording')) ||
        // Check for call recording URLs
        (activity.note && activity.note.includes('justcall.io/recordings/'))
      );
      
      if (isCall) {
        console.log(`Found call activity: ${activity.id} - ${activity.subject || activity.key_string}`);
      }
      
      return isCall;
    });

    console.log(`Total activities: ${activities.length}, Call activities found: ${callActivities.length}`);
    return callActivities;
  }

  async fetchYesterdayAnalytics() {
    try {
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

      // FIXED: Use enhanced call detection logic
      const callActivities = this.filterCallActivities(allActivities);

      await delay(300);

      // Fetch notes using the corrected method
      let notes = [];
      try {
        notes = await this.fetchNewNotesOptimized(dateRange, allDeals, 'all');
      } catch (error) {
        console.error('Error fetching notes:', error);
        notes = [];
      }

      await delay(300);

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

      // Activities completed yesterday (filter by date properly)
      const completedActivities = allActivities.filter(activity => {
        if (!activity.done || !activity.marked_as_done_time) return false;
        const completedDate = new Date(activity.marked_as_done_time);
        return completedDate >= startDate && completedDate <= endDate;
      });

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

  // ALTERNATIVE: Use the dedicated method from pipedriveAPI.js
  async fetchYesterdayAnalyticsWithDedicatedMethod() {
    try {
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

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Use the dedicated method from pipedriveAPI.js for calls
      const [
        dealsResponse,
        callActivitiesResponse,
        usersResponse,
        pipelinesResponse
      ] = await Promise.all([
        PipedriveAPI.getDeals(),
        PipedriveAPI.getCallActivitiesWithDeals(dateRange.startDate, dateRange.endDate),
        PipedriveAPI.getUsers(),
        PipedriveAPI.getPipelines()
      ]);

      await delay(300);

      const allDeals = dealsResponse.data || [];
      const callActivitiesData = callActivitiesResponse.data || [];
      const users = usersResponse.data || [];
      const pipelines = pipelinesResponse.data || [];

      // Get all activities for other calculations
      const allActivitiesResponse = await PipedriveAPI.getActivitiesByDateRange(dateRange.startDate, dateRange.endDate);
      const allActivities = allActivitiesResponse.data || [];

      await delay(300);

      // Fetch notes
      let notes = [];
      try {
        notes = await this.fetchNewNotesOptimized(dateRange, allDeals, 'all');
      } catch (error) {
        console.error('Error fetching notes:', error);
        notes = [];
      }

      await delay(300);

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
      const completedActivities = allActivities.filter(activity => {
        if (!activity.done || !activity.marked_as_done_time) return false;
        const completedDate = new Date(activity.marked_as_done_time);
        return completedDate >= startDate && completedDate <= endDate;
      });

      // Calculate analytics by owner
      const analyticsData = this.calculateAnalyticsByOwner({
        callActivities: callActivitiesData,
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
          callsMade: callActivitiesData.length,
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
          callActivities: callActivitiesData,
          notes,
          dealMovements
        }
      };

    } catch (error) {
      console.error('Error fetching yesterday analytics:', error);
      throw error;
    }
  }

  // Use the same logic as DealAnalytics.jsx
  async fetchNewNotesOptimized(dateRange, allDeals, selectedPipeline = 'all') {
    try {
      console.log('Fetching notes for date range:', dateRange);
      
      // Try to use date filtering if the API supports it
      const params = {
        limit: 500,
        // Add date filters if supported by your API wrapper
        start_date: dateRange.startDate,
        end_date: dateRange.endDate
      };
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const notesResponse = await PipedriveAPI.getNotes(params);
      const allNotes = notesResponse.data || [];
      
      console.log('Raw notes from API:', allNotes.length);
      
      // Create deal map for quick lookup
      const dealMap = new Map();
      allDeals.forEach(deal => {
        dealMap.set(deal.id, deal);
      });
      
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      const filteredNotes = allNotes
        .filter(note => {
          if (!note.add_time) return false;
          const noteDate = new Date(note.add_time);
          return noteDate >= startDate && noteDate <= endDate;
        })
        .map(note => {
          if (note.deal_id) {
            const deal = dealMap.get(note.deal_id);
            if (!deal || (selectedPipeline !== 'all' && deal.pipeline_id != selectedPipeline)) {
              return null;
            }
            
            return {
              id: note.id,
              content: note.content || 'Note added',
              dealId: note.deal_id,
              dealTitle: deal.title || 'Unknown Deal',
              dealOwner: this.normalizeUserId(deal.user_id),
              addTime: note.add_time,
              userId: this.normalizeUserId(note.user_id),
              updateTime: note.update_time
            };
          } else if (selectedPipeline === 'all') {
            return {
              id: note.id,
              content: note.content || 'Note added',
              dealId: null,
              dealTitle: 'No Deal Associated',
              dealOwner: null,
              addTime: note.add_time,
              userId: this.normalizeUserId(note.user_id),
              updateTime: note.update_time
            };
          }
          return null;
        })
        .filter(Boolean);
      
      console.log('Notes after filtering:', filteredNotes.length);
      return filteredNotes;
      
    } catch (error) {
      console.error('Error fetching new notes:', error);
      
      if (error.message.includes('429')) {
        console.warn('Rate limit exceeded for notes, skipping notes data for this load...');
        return [];
      }
      
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
        dealOwner: this.normalizeUserId(deal.user_id),
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
    
    // Create a map to store stats by user ID - this prevents duplicates
    const ownerStatsMap = new Map();

    // Initialize all users who appear in any activity
    const allUserIds = new Set();
    
    // Collect all user IDs, normalizing them properly
    callActivities.forEach(c => {
      const userId = this.normalizeUserId(c.user_id);
      if (userId) allUserIds.add(userId);
    });
    
    notes.forEach(n => {
      const userId = this.normalizeUserId(n.dealOwner || n.userId);
      if (userId) allUserIds.add(userId);
    });
    
    dealMovements.forEach(d => {
      const userId = this.normalizeUserId(d.dealOwner);
      if (userId) allUserIds.add(userId);
    });
    
    completedActivities.forEach(a => {
      const userId = this.normalizeUserId(a.user_id);
      if (userId) allUserIds.add(userId);
    });
    
    wonDeals.forEach(d => {
      const userId = this.normalizeUserId(d.user_id);
      if (userId) allUserIds.add(userId);
    });
    
    lostDeals.forEach(d => {
      const userId = this.normalizeUserId(d.user_id);
      if (userId) allUserIds.add(userId);
    });

    // Initialize stats for each unique user
    allUserIds.forEach(userId => {
      ownerStatsMap.set(userId, {
        id: userId,
        name: this.getUserName(userId, users),
        callsMade: 0,
        notesCreated: 0,
        dealMovements: 0,
        activitiesDone: 0,
        dealsWon: 0,
        dealsLost: 0
      });
    });

    // Count activities for each user - no duplicates possible now
    callActivities.forEach(call => {
      const userId = this.normalizeUserId(call.user_id);
      if (userId && ownerStatsMap.has(userId)) {
        ownerStatsMap.get(userId).callsMade++;
      }
    });

    notes.forEach(note => {
      const userId = this.normalizeUserId(note.dealOwner || note.userId);
      if (userId && ownerStatsMap.has(userId)) {
        ownerStatsMap.get(userId).notesCreated++;
      }
    });

    dealMovements.forEach(movement => {
      const userId = this.normalizeUserId(movement.dealOwner);
      if (userId && ownerStatsMap.has(userId)) {
        ownerStatsMap.get(userId).dealMovements++;
      }
    });

    completedActivities.forEach(activity => {
      const userId = this.normalizeUserId(activity.user_id);
      if (userId && ownerStatsMap.has(userId)) {
        ownerStatsMap.get(userId).activitiesDone++;
      }
    });

    wonDeals.forEach(deal => {
      const userId = this.normalizeUserId(deal.user_id);
      if (userId && ownerStatsMap.has(userId)) {
        ownerStatsMap.get(userId).dealsWon++;
      }
    });

    lostDeals.forEach(deal => {
      const userId = this.normalizeUserId(deal.user_id);
      if (userId && ownerStatsMap.has(userId)) {
        ownerStatsMap.get(userId).dealsLost++;
      }
    });

    // Convert map to array and filter out users with no activity
    const result = Array.from(ownerStatsMap.values()).filter(stats => 
      stats.callsMade > 0 || stats.notesCreated > 0 || stats.dealMovements > 0 || 
      stats.activitiesDone > 0 || stats.dealsWon > 0 || stats.dealsLost > 0
    );

    // Sort by total activity (most active first)
    result.sort((a, b) => {
      const totalA = a.callsMade + a.notesCreated + a.dealMovements + a.activitiesDone + a.dealsWon + a.dealsLost;
      const totalB = b.callsMade + b.notesCreated + b.dealMovements + b.activitiesDone + b.dealsWon + b.dealsLost;
      return totalB - totalA;
    });

    return result;
  }

  // Email HTML generation (unchanged)
  generateEmailHTML(analyticsData) {
    const { date, totalStats, byOwner } = analyticsData;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Analytics Report - ${date}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0; 
            padding: 20px; 
            line-height: 1.5;
            font-size: 14px;
          }
          .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: #ffffff; 
            border-radius: 12px; 
            overflow: hidden;
            box-shadow: 0 15px 35px rgba(0,0,0,0.12);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center; 
            padding: 30px 25px;
          }
          .header h1 { 
            font-size: 24px; 
            font-weight: 700; 
            margin-bottom: 6px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
          }
          .header p { 
            font-size: 16px; 
            opacity: 0.9;
            font-weight: 300;
          }
          .content { padding: 30px 25px; }
          .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); 
            gap: 20px; 
            margin-bottom: 40px; 
          }
          .stat-card { 
            background: #ffffff;
            border: 1px solid #e5e7eb;
            padding: 20px; 
            border-radius: 10px; 
            text-align: center;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
          }
          .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--accent-color, #667eea);
          }
          .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.08);
          }
          .stat-card.calls::before { background: #3b82f6; }
          .stat-card.notes::before { background: #8b5cf6; }
          .stat-card.movements::before { background: #f59e0b; }
          .stat-card.activities::before { background: #10b981; }
          .stat-card.won::before { background: #059669; }
          .stat-card.lost::before { background: #dc2626; }
          
          .stat-icon { 
            font-size: 20px; 
            margin-bottom: 8px; 
            display: block;
          }
          .stat-card h3 { 
            color: #374151; 
            font-size: 12px; 
            font-weight: 600;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .stat-card .number { 
            font-size: 28px; 
            font-weight: 800; 
            color: #111827;
            margin: 0;
          }
          
          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 25px 0;
            text-align: center;
            position: relative;
          }
          .section-title::after {
            content: '';
            position: absolute;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 50px;
            height: 2px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 1px;
          }
          
          .team-grid {
            display: grid;
            gap: 16px;
          }
          .team-member { 
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 10px; 
            overflow: hidden;
            transition: all 0.3s ease;
          }
          .team-member:hover {
            box-shadow: 0 6px 12px rgba(0,0,0,0.08);
            border-color: #d1d5db;
          }
          .member-header {
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            padding: 16px;
            border-bottom: 1px solid #e5e7eb;
          }
          .member-name { 
            font-size: 16px; 
            font-weight: 700; 
            color: #111827;
            margin: 0;
          }
          .member-stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); 
            padding: 0;
          }
          .member-stat { 
            text-align: center; 
            padding: 14px 8px;
            border-right: 1px solid #e5e7eb;
            transition: background-color 0.2s ease;
          }
          .member-stat:last-child { border-right: none; }
          .member-stat:hover { background-color: #ffffff; }
          .member-stat .label { 
            font-size: 10px; 
            color: #6b7280; 
            text-transform: uppercase; 
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-bottom: 4px; 
          }
          .member-stat .value { 
            font-size: 18px; 
            font-weight: 800; 
            color: #111827;
          }
          
          .summary { 
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 1px solid #bfdbfe;
            border-radius: 10px; 
            padding: 24px; 
            margin-top: 30px;
            text-align: center;
          }
          .summary h3 { 
            color: #1e40af; 
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 12px; 
          }
          .summary p {
            color: #1f2937;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 8px;
          }
          .summary strong { color: #111827; }
          
          .footer { 
            text-align: center; 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid #e5e7eb; 
            color: #6b7280; 
            font-size: 12px;
          }
          .footer p { margin-bottom: 3px; }
          
          .no-activity {
            text-align: center;
            padding: 30px;
            color: #6b7280;
            font-style: italic;
            font-size: 14px;
          }
          
          @media (max-width: 600px) {
            .container { margin: 10px; border-radius: 10px; }
            .header { padding: 25px 20px; }
            .content { padding: 25px 20px; }
            .stats-grid { grid-template-columns: 1fr; gap: 14px; }
            .member-stats { grid-template-columns: repeat(3, 1fr); }
            .member-stat { padding: 12px 6px; }
            .stat-card .number { font-size: 24px; }
            .member-stat .value { font-size: 16px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Daily Analytics Report</h1>
            <p>${date}</p>
          </div>

          <div class="content">
            <div class="stats-grid">
              <div class="stat-card calls">
                <span class="stat-icon">📞</span>
                <h3>Phone Calls</h3>
                <p class="number">${totalStats.callsMade}</p>
              </div>
              <div class="stat-card notes">
                <span class="stat-icon">📝</span>
                <h3>Notes Created</h3>
                <p class="number">${totalStats.notesCreated}</p>
              </div>
              <div class="stat-card movements">
                <span class="stat-icon">🔄</span>
                <h3>Deal Updates</h3>
                <p class="number">${totalStats.dealMovements}</p>
              </div>
              <div class="stat-card activities">
                <span class="stat-icon">✅</span>
                <h3>Activities Done</h3>
                <p class="number">${totalStats.activitiesDone}</p>
              </div>
              <div class="stat-card won">
                <span class="stat-icon">🏆</span>
                <h3>Deals Won</h3>
                <p class="number">${totalStats.dealsWon}</p>
              </div>
              <div class="stat-card lost">
                <span class="stat-icon">❌</span>
                <h3>Deals Lost</h3>
                <p class="number">${totalStats.dealsLost}</p>
              </div>
            </div>

            ${byOwner.length > 0 ? `
            <h2 class="section-title">👥 Team Performance</h2>
            <div class="team-grid">
              ${byOwner.map(owner => `
                <div class="team-member">
                  <div class="member-header">
                    <h3 class="member-name">${owner.name}</h3>
                  </div>
                  <div class="member-stats">
                    <div class="member-stat">
                      <div class="label">Calls</div>
                      <div class="value">${owner.callsMade}</div>
                    </div>
                    <div class="member-stat">
                      <div class="label">Notes</div>
                      <div class="value">${owner.notesCreated}</div>
                    </div>
                    <div class="member-stat">
                      <div class="label">Updates</div>
                      <div class="value">${owner.dealMovements}</div>
                    </div>
                    <div class="member-stat">
                      <div class="label">Tasks</div>
                      <div class="value">${owner.activitiesDone}</div>
                    </div>
                    <div class="member-stat">
                      <div class="label">Won</div>
                      <div class="value">${owner.dealsWon}</div>
                    </div>
                    <div class="member-stat">
                      <div class="label">Lost</div>
                      <div class="value">${owner.dealsLost}</div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
            ` : `
            <div class="no-activity">
              <p>No individual activity recorded for yesterday.</p>
            </div>
            `}

            <div class="summary">
              <h3>📈 Daily Summary</h3>
              <p>
                Yesterday, your team made <strong>${totalStats.callsMade} phone calls</strong> and created 
                <strong>${totalStats.notesCreated} notes</strong>. There were <strong>${totalStats.dealMovements} deal updates</strong> 
                and <strong>${totalStats.activitiesDone} activities completed</strong>.
              </p>
              ${totalStats.dealsWon > 0 || totalStats.dealsLost > 0 ? `
              <p>
                Deal outcomes: <strong style="color: #059669;">${totalStats.dealsWon} deals won</strong>${totalStats.dealsLost > 0 ? ` and <strong style="color: #dc2626;">${totalStats.dealsLost} deals lost</strong>` : ''}.
              </p>
              ` : ''}
            </div>

            <div class="footer">
              <p><strong>Pipedrive Daily Analytics by SIMVANA Digital Agency</strong></p>
              <p>Generated on ${new Date().toLocaleString('en-CA', { 
                timeZone: 'America/Toronto',
                year: 'numeric',
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</p>
            </div>
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
        to: this.emailConfig.recipients,
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

  async sendTestEmail() {
    console.log('Sending test email...');
    return await this.sendDailyAnalyticsEmail();
  }

  stopScheduler() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      console.log('Daily analytics email scheduler stopped.');
    }
  }
}

module.exports = DailyAnalyticsEmailService;