// Pipedrive API Service
const PIPEDRIVE_API_TOKEN = 'cc8a0efcadd639ed8fd56a3efe0a33cbc8021473';
const PIPEDRIVE_BASE_URL = 'https://api.pipedrive.com/v1';

class PipedriveAPI {
  static async makeRequest(endpoint, options = {}) {
    const url = `${PIPEDRIVE_BASE_URL}${endpoint}`;
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
      console.error(`Pipedrive API Error (${endpoint}):`, error);
      throw new Error(`Failed to fetch from ${endpoint}: ${error.message}`);
    }
  }

  // Get all deals with pagination support
  static async getDeals(options = {}) {
    const params = {
      limit: 1000,
      status: 'all_not_deleted',
      // Add these fields to get more complete data
      include_fields: 'id,title,value,currency,status,probability,add_time,update_time,close_time,won_time,lost_time,lost_reason,stage_id,stage_name,pipeline_id,user_id,person_id,org_id,person_name,org_name',
      ...options
    };
    
    return this.makeRequest('/deals', { params });
  }

  // Get deals by specific criteria
  static async getDealsByStatus(status) {
    return this.makeRequest('/deals', { 
      params: { status, limit: 1000 } 
    });
  }

  // Get deals by date range - FIXED VERSION
  static async getDealsByDateRange(startDate, endDate, pipelineId = null) {
    const params = {
      start_time: startDate, // Use start_time instead of start_date
      end_time: endDate,     // Use end_time instead of end_date
      limit: 1000
    };
    
    if (pipelineId && pipelineId !== 'all') {
      params.pipeline_id = pipelineId;
    }
    
    return this.makeRequest('/deals', { params });
  }

  // Get all activities with better filtering
  static async getActivities(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/activities', { params });
  }

  // Get activities by date range - FIXED VERSION
  static async getActivitiesByDateRange(startDate, endDate) {
    const params = {
      start_date: startDate,
      end_date: endDate,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params });
  }

  // Get activities by deal ID - NEW METHOD
  static async getActivitiesByDealId(dealId) {
    const params = {
      deal_id: dealId,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params });
  }

  // Get call activities with associated deals - NEW METHOD
  static async getCallActivitiesWithDeals(startDate, endDate) {
    try {
      console.log(`Fetching activities for date range: ${startDate} to ${endDate}`);
      
      // Get all activities in date range
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
          (activity.note && activity.note.includes('Call Recording'))
          // Check for call recording URLs
          (activity.note && activity.note.includes('justcall.io/recordings/'))
        );
        
        if (isCall) {
          console.log(`Found call activity: ${activity.id} - ${activity.subject || activity.key_string}`);
        }
        
        return isCall;
      });

      console.log(`Call activities found: ${callActivities.length}`);

      // Get associated deals for each call
      const callsWithDeals = await Promise.all(
        callActivities.map(async (activity) => {
          if (activity.deal_id) {
            try {
              const dealResponse = await this.makeRequest(`/deals/${activity.deal_id}`);
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

  // Get overdue activities
  static async getOverdueActivities() {
    const today = new Date().toISOString().split('T')[0];
    const params = {
      due_date: `<${today}`,
      done: 0,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params });
  }

  // Get activities by type (e.g., 'call')
  static async getActivitiesByType(type) {
    const params = {
      type,
      limit: 1000
    };
    
    return this.makeRequest('/activities', { params });
  }

  // NEW: Get notes by date range
  static async getNotesByDateRange(startDate, endDate, options = {}) {
    const params = {
      start_date: startDate,
      end_date: endDate,
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/notes', { params });
  }

  // NEW: Get all notes with optional filtering
  static async getNotes(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/notes', { params });
  }

  // Get all users (team members)
  static async getUsers() {
    return this.makeRequest('/users');
  }

  // Get user by ID
  static async getUserById(userId) {
    return this.makeRequest(`/users/${userId}`);
  }

  // Get all pipelines
  static async getPipelines() {
    return this.makeRequest('/pipelines');
  }

  // Get pipeline stages
  static async getStages(pipelineId = null) {
    const endpoint = pipelineId ? `/pipelines/${pipelineId}/stages` : '/stages';
    return this.makeRequest(endpoint);
  }

  // Get deal fields to understand custom fields
  static async getDealFields() {
    return this.makeRequest('/dealFields');
  }

  // Get activity fields
  static async getActivityFields() {
    return this.makeRequest('/activityFields');
  }

  // Get organization details
  static async getOrganizations(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/organizations', { params });
  }

  // Get persons (contacts)
  static async getPersons(options = {}) {
    const params = {
      limit: 1000,
      ...options
    };
    
    return this.makeRequest('/persons', { params });
  }

  // Analytics helper methods
  static async getDealsAnalytics(timeFrame = 'today') {
    try {
      const { startDate, endDate } = this.getDateRange(timeFrame);
      
      // Get deals within date range
      const dealsResponse = await this.getDeals({
        start_date: startDate,
        end_date: endDate
      });

      // Get activities (calls) within date range  
      const activitiesResponse = await this.getActivitiesByDateRange(startDate, endDate);
      
      // Get overdue activities
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
        this.getUsers(),
        this.getDeals(),
        this.getActivities()
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

  static async getDealHistory(dealId) {
    return this.makeRequest(`/deals/${dealId}/flow`);
  }

  static async getDealsWithHistory(options = {}) {
    const params = {
      limit: 1000,
      status: 'all_not_deleted',
      ...options
    };
    
    const dealsResponse = await this.makeRequest('/deals', { params });
    const deals = dealsResponse.data || [];
    
    // Get history for each deal (this might be slow for many deals)
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

  // Helper method to get date ranges - FIXED VERSION
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
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
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
      const response = await this.makeRequest('/users/me');
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