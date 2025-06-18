// Pipedrive API Service - Updated with correct endpoints
const PIPEDRIVE_API_TOKEN = 'cc8a0efcadd639ed8fd56a3efe0a33cbc8021473';
const PIPEDRIVE_BASE_URL_V1 = 'https://api.pipedrive.com/v1';
const PIPEDRIVE_BASE_URL_V2 = 'https://api.pipedrive.com/api/v2'; // Note: v2 uses /api/v2 not /v2

class PipedriveAPI {
  static async makeRequest(endpoint, options = {}) {
    // Determine which API version to use
    const apiVersion = options.apiVersion || 'v1';
    const baseUrl = apiVersion === 'v2' ? PIPEDRIVE_BASE_URL_V2 : PIPEDRIVE_BASE_URL_V1;
    const url = `${baseUrl}${endpoint}`;
    
    const params = new URLSearchParams({
      api_token: PIPEDRIVE_API_TOKEN,
      ...options.params
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Pipedrive API Error (${apiVersion}${endpoint}):`, error);
      throw new Error(`Failed to fetch from ${apiVersion}${endpoint}: ${error.message}`);
    }
  }

  // Get all deals with pagination support - UPDATED to use v2
  static async getDeals(options = {}) {
    const params = {
      limit: 1000,
      status: 'all_not_deleted',
      // V2 API uses different field inclusion syntax
      ...options
    };
    
    return this.makeRequest('/deals', { params, apiVersion: 'v2' });
  }

  // Get deals by specific criteria - UPDATED to use v2
  static async getDealsByStatus(status) {
    return this.makeRequest('/deals', { 
      params: { status, limit: 1000 },
      apiVersion: 'v2'
    });
  }

  // Get deals by date range - UPDATED for v2 API
  static async getDealsByDateRange(startDate, endDate, pipelineId = null) {
    const params = {
      'add_time': `${startDate}:${endDate}`, // v2 uses different date range format
      limit: 1000
    };
    
    if (pipelineId && pipelineId !== 'all') {
      params.pipeline_id = pipelineId;
    }
    
    return this.makeRequest('/deals', { params, apiVersion: 'v2' });
  }

  // Get all activities - UPDATED to use v2 (was /v1/activities/collection)
  static async getActivities(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/activities', { params, apiVersion: 'v2' });
  }

  // Get activities by date range - UPDATED to use v2
  static async getActivitiesByDateRange(startDate, endDate) {
    const params = {
      'add_time': `${startDate}:${endDate}`, // v2 uses colon-separated date ranges
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params, apiVersion: 'v2' });
  }

  // Get activities by deal ID - UPDATED to use v2 query parameter
  static async getActivitiesByDealId(dealId) {
    const params = {
      deal_id: dealId,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params, apiVersion: 'v2' });
  }

  // Get call activities with associated deals - UPDATED for v2
  static async getCallActivitiesWithDeals(startDate, endDate) {
    try {
      console.log(`Fetching activities for date range: ${startDate} to ${endDate}`);
      
      // Get all activities in date range using v2 API
      const activitiesResponse = await this.getActivitiesByDateRange(startDate, endDate);
      const allActivities = activitiesResponse.data || [];
      
      console.log(`Total activities found: ${allActivities.length}`);
      
      // Enhanced call detection - check multiple patterns
      const callActivities = allActivities.filter(activity => {
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

      console.log(`Call activities found: ${callActivities.length}`);

      // Get associated deals for each call using v2 API
      const callsWithDeals = await Promise.all(
        callActivities.map(async (activity) => {
          if (activity.deal_id) {
            try {
              const dealResponse = await this.makeRequest(`/deals/${activity.deal_id}`, { apiVersion: 'v2' });
              return {
                ...activity,
                deal: dealResponse.data
              };
            } catch (error) {
              console.error(`Failed to get deal ${activity.deal_id} for activity ${activity.id}`);
              return {
                ...activity,
                deal: null
              };
            }
          }
          return {
            ...activity,
            deal: null
          };
        })
      );

      return {
        success: true,
        data: callsWithDeals,
        total: callsWithDeals.length,
        debug: {
          totalActivities: allActivities.length,
          callActivities: callActivities.length,
          dateRange: { startDate, endDate }
        }
      };
    } catch (error) {
      console.error('Error fetching call activities with deals:', error);
      throw error;
    }
  }

  // Get overdue activities - UPDATED for v2
  static async getOverdueActivities() {
    const today = new Date().toISOString().split('T')[0];
    const params = {
      'due_date': `<${today}`, // v2 might handle this differently, may need adjustment
      done: 0,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params, apiVersion: 'v2' });
  }

  // Get activities by type - UPDATED for v2
  static async getActivitiesByType(type) {
    const params = {
      type,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params, apiVersion: 'v2' });
  }

  // Get notes by date range - NOTES still use v1 (not deprecated)
  static async getNotesByDateRange(startDate, endDate, options = {}) {
    const params = {
      start_date: startDate,
      end_date: endDate,
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/notes', { params, apiVersion: 'v1' });
  }

  // Get all notes - NOTES still use v1 (not deprecated)
  static async getNotes(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/notes', { params, apiVersion: 'v1' });
  }

  // Get all users - USERS still use v1 (not deprecated)
  static async getUsers() {
    return this.makeRequest('/users', { apiVersion: 'v1' });
  }

  // Get user by ID - USERS still use v1 (not deprecated)
  static async getUserById(userId) {
    return this.makeRequest(`/users/${userId}`, { apiVersion: 'v1' });
  }

  // Get all pipelines - UPDATED to use v2
  static async getPipelines() {
    return this.makeRequest('/pipelines', { apiVersion: 'v2' });
  }

  // Get pipeline stages - UPDATED to use v2
  static async getStages(pipelineId = null) {
    const endpoint = pipelineId ? `/pipelines/${pipelineId}/stages` : '/stages';
    return this.makeRequest(endpoint, { apiVersion: 'v2' });
  }

  // Get deal fields - DEALFIELDS still use v1 (not deprecated)
  static async getDealFields() {
    return this.makeRequest('/dealFields', { apiVersion: 'v1' });
  }

  // Get activity fields - ACTIVITYFIELDS still use v1 (not deprecated)
  static async getActivityFields() {
    return this.makeRequest('/activityFields', { apiVersion: 'v1' });
  }

  // Get organizations - UPDATED to use v2
  static async getOrganizations(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/organizations', { params, apiVersion: 'v2' });
  }

  // Get persons - UPDATED to use v2
  static async getPersons(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/persons', { params, apiVersion: 'v2' });
  }

  // Analytics helper methods - UPDATED for v2
  static async getDealsAnalytics(timeFrame = 'today') {
    try {
      const { startDate, endDate } = this.getDateRange(timeFrame);
      
      // Get deals within date range using v2
      const dealsResponse = await this.getDealsByDateRange(startDate, endDate);

      // Get activities (calls) within date range using v2
      const activitiesResponse = await this.getActivitiesByDateRange(startDate, endDate);
      
      // Get overdue activities using v2
      const overdueResponse = await this.getOverdueActivities();

      return {
        deals: dealsResponse.data || [],
        activities: activitiesResponse.data || [],
        overdueActivities: overdueResponse.data || [],
        totalCount: dealsResponse.additional_data?.pagination?.total || 0
      };
    } catch (error) {
      console.error('Error fetching deals analytics:', error);
      throw error;
    }
  }

  static async getOwnerAnalytics() {
    try {
      const [usersResponse, dealsResponse, activitiesResponse] = await Promise.all([
        this.getUsers(), // v1 (still valid)
        this.getDeals(), // v2
        this.getActivities() // v2
      ]);

      const users = usersResponse.data || [];
      const deals = dealsResponse.data || [];
      const activities = activitiesResponse.data || [];

      // Process analytics by owner
      const ownerStats = users.map(user => {
        const userDeals = deals.filter(deal => deal.user_id?.id === user.id);
        const userActivities = activities.filter(activity => activity.user_id === user.id);
        const callActivities = userActivities.filter(activity => 
          activity.type === 'call' || activity.key_string?.includes('call')
        );

        const overdueActivities = userActivities.filter(activity => {
          const dueDate = new Date(activity.due_date);
          const today = new Date();
          return !activity.done && dueDate < today;
        });

        const scheduledActivities = userActivities.filter(activity => {
          const dueDate = new Date(activity.due_date);
          const today = new Date();
          return !activity.done && dueDate >= today;
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          dealsCount: userDeals.length,
          callsCount: callActivities.length,
          overdueCount: overdueActivities.length,
          scheduledCount: scheduledActivities.length,
          wonDeals: userDeals.filter(deal => deal.status === 'won').length,
          lostDeals: userDeals.filter(deal => deal.status === 'lost').length,
          totalValue: userDeals.reduce((sum, deal) => sum + (deal.value || 0), 0)
        };
      });

      return ownerStats;
    } catch (error) {
      console.error('Error fetching owner analytics:', error);
      throw error;
    }
  }

  // Get deal history/flow - DEAL FLOW still uses v1 (not deprecated)
  static async getDealHistory(dealId) {
    return this.makeRequest(`/deals/${dealId}/flow`, { apiVersion: 'v1' });
  }

  // Get deals with history - MIXED v2 for deals, v1 for flow
  static async getDealsWithHistory(options = {}) {
    const params = {
      limit: 1000,
      status: 'all_not_deleted',
      ...options
    };
    
    const dealsResponse = await this.makeRequest('/deals', { params, apiVersion: 'v2' });
    const deals = dealsResponse.data || [];
    
    // Get history for each deal using v1 (flow endpoint not deprecated)
    const dealsWithHistory = await Promise.all(
      deals.map(async (deal) => {
        try {
          const historyResponse = await this.getDealHistory(deal.id);
          return {
            ...deal,
            history: historyResponse.data || []
          };
        } catch (error) {
          console.error(`Failed to get history for deal ${deal.id}:`, error);
          return {
            ...deal,
            history: []
          };
        }
      })
    );
    
    return {
      ...dealsResponse,
      data: dealsWithHistory
    };
  }

  // Helper method to get date ranges - UPDATED for v2 format
  static getDateRange(timeFrame) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    let startDate, endDate;
  
    switch (timeFrame.toLowerCase()) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
      case 'last_7_days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
      case 'last_30_days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case '3_months':
      case 'last_90_days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 90);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'year':
        startDate = new Date(today);
        startDate.setFullYear(today.getFullYear() - 1);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
    }
  
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
  }

  // Helper to format currency
  static formatCurrency(amount, currency = 'CAD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  }

  // Helper to calculate conversion rate
  static calculateConversionRate(wonDeals, totalDeals) {
    if (totalDeals === 0) return 0;
    return Math.round((wonDeals / totalDeals) * 100);
  }

  // Test API connection
  static async testConnection() {
    try {
      const response = await this.makeRequest('/users/me', { apiVersion: 'v1' });
      return {
        success: true,
        data: response.data,
        message: 'API connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'API connection failed'
      };
    }
  }
}

export { PipedriveAPI };