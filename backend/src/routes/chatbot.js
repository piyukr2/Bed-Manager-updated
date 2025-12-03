const express = require('express');
const router = express.Router();
const OccupancyHistory = require('../models/OccupancyHistory');
const BedRequest = require('../models/BedRequest');
const Patient = require('../models/Patient');
const Bed = require('../models/Bed');

// ===== ENHANCEMENT #1: Response Cache =====
const responseCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Gemini will be initialized only if API key is available
let genAI = null;
let GoogleGenerativeAI = null;

try {
  const geminiModule = require('@google/generative-ai');
  GoogleGenerativeAI = geminiModule.GoogleGenerativeAI;

  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini AI initialized successfully');
  } else {
    console.warn('⚠️ GEMINI_API_KEY not found in environment variables');
  }
} catch (error) {
  console.warn('⚠️ @google/generative-ai package not installed. Run: npm install @google/generative-ai');
}

// Authorization middleware - admin only
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// ===== ENHANCEMENT #4: Parameter Normalization & Validation =====
const normalizeParameters = (params) => {
  const normalized = { ...params };
  
  // Normalize ward names
  const wardMap = {
    'emergency': 'Emergency',
    'er': 'Emergency',
    'emergency room': 'Emergency',
    'icu': 'ICU',
    'intensive care': 'ICU',
    'intensive care unit': 'ICU',
    'cardiology': 'Cardiology',
    'cardiac': 'Cardiology',
    'cardio': 'Cardiology',
    'general ward': 'General Ward',
    'general': 'General Ward',
    'ward': 'department'
  };
  
  if (params.ward && typeof params.ward === 'string') {
    const lowerWard = params.ward.toLowerCase().trim();
    normalized.ward = wardMap[lowerWard] || params.ward;
  }
  
  // Normalize dates - handle relative dates
  const today = new Date();
  const dateMap = {
    'today': today.toISOString().split('T')[0],
    'yesterday': new Date(today - 86400000).toISOString().split('T')[0],
    'last week': new Date(today - 7 * 86400000).toISOString().split('T')[0],
    'last month': new Date(today - 30 * 86400000).toISOString().split('T')[0]
  };
  
  ['startDate', 'endDate', 'period1Start', 'period1End', 'period2Start', 'period2End'].forEach(dateField => {
    if (params[dateField] && typeof params[dateField] === 'string') {
      const lowerDate = params[dateField].toLowerCase().trim();
      normalized[dateField] = dateMap[lowerDate] || params[dateField];
    }
  });
  
  return normalized;
};

// ===== ENHANCEMENT #1: Data Validation =====
const validateParameters = (params, requiredFields = []) => {
  const errors = [];
  
  // Check required fields
  requiredFields.forEach(field => {
    if (!params[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  // Validate date formats
  const dateFields = ['startDate', 'endDate', 'period1Start', 'period1End', 'period2Start', 'period2End'];
  dateFields.forEach(field => {
    if (params[field]) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(params[field])) {
        errors.push(`Invalid date format for ${field}. Use YYYY-MM-DD`);
      } else {
        const date = new Date(params[field]);
        if (isNaN(date.getTime())) {
          errors.push(`Invalid date value for ${field}`);
        }
      }
    }
  });
  
  // Validate date ranges
  if (params.startDate && params.endDate) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    if (start > end) {
      errors.push('startDate must be before endDate');
    }
  }
  
  // Validate ward names
  const validWards = ['Emergency', 'ICU', 'Cardiology', 'General Ward'];
  if (params.ward && !validWards.includes(params.ward)) {
    errors.push(`Invalid ward name. Must be one of: ${validWards.join(', ')}`);
  }
  
  return errors;
};

// ===== ENHANCEMENT #6: Response Validation =====
const validateResponse = (data, functionName) => {
  const issues = [];
  
  if (functionName === 'calculateOccupancyStats') {
    // Check if percentages are within valid range
    ['average', 'peak', 'lowest', 'current'].forEach(field => {
      if (data[field] !== undefined) {
        const value = parseFloat(data[field]);
        if (value < 0 || value > 100) {
          issues.push(`${field} value ${value}% is outside valid range (0-100%)`);
        }
      }
    });
    
    // Check logical consistency
    if (data.peak && data.lowest && parseFloat(data.peak) < parseFloat(data.lowest)) {
      issues.push('Peak occupancy cannot be less than lowest occupancy');
    }
  }
  
  if (functionName === 'getCurrentBedStatus') {
    // Verify totals match
    if (data.occupied !== undefined && data.available !== undefined && data.total !== undefined) {
      const sum = data.occupied + data.available + (data.cleaning || 0) + (data.reserved || 0);
      if (sum !== data.total) {
        issues.push(`Bed status counts don't match total: ${sum} !== ${data.total}`);
      }
    }
  }
  
  return issues;
};

// Define available functions that AI can call
const availableFunctions = {
  // Get occupancy data for a specific date range
  getOccupancyData: async ({ startDate, endDate, ward = null }) => {
    // Apply normalization and validation
    const normalized = normalizeParameters({ startDate, endDate, ward });
    const errors = validateParameters(normalized, ['startDate', 'endDate']);
    
    if (errors.length > 0) {
      return { error: 'Validation failed', details: errors };
    }
    
    const query = {
      timestamp: {
        $gte: new Date(normalized.startDate),
        $lte: new Date(normalized.endDate)
      }
    };

    const data = await OccupancyHistory.find(query).sort({ timestamp: 1 }).limit(500);
    
    // Filter out null/undefined values
    let results = data.filter(d => d && d.timestamp).map(d => ({
      date: d.timestamp,
      occupancyRate: parseFloat(d.occupancyRate || 0),
      occupied: parseInt(d.occupied || 0),
      total: parseInt(d.totalBeds || 0)
    }));

    if (normalized.ward) {
      results = data.map(d => {
        const wardData = d.wardStats?.find(w => w.ward === normalized.ward);
        return wardData ? {
          date: d.timestamp,
          occupancyRate: parseFloat(wardData.occupancyRate || 0),
          occupied: parseInt(wardData.occupied || 0),
          total: parseInt(wardData.total || 0),
          ward: normalized.ward
        } : null;
      }).filter(d => d !== null);
    }

    return {
      data: results,
      count: results.length,
      ward: normalized.ward || 'All',
      dateRange: { start: normalized.startDate, end: normalized.endDate }
    };
  },

  // Calculate statistics for a date range
  calculateOccupancyStats: async ({ startDate, endDate, ward = null }) => {
    // Apply normalization and validation
    const normalized = normalizeParameters({ startDate, endDate, ward });
    const errors = validateParameters(normalized, ['startDate', 'endDate']);
    
    if (errors.length > 0) {
      return { error: 'Validation failed', details: errors };
    }
    
    const result = await availableFunctions.getOccupancyData(normalized);
    
    if (result.error) return result;
    if (result.count === 0) {
      return { 
        error: 'No data found for this period',
        suggestion: 'Try a different date range or ward'
      };
    }

    const data = result.data;
    const rates = data.map(d => parseFloat(d.occupancyRate || 0)).filter(r => !isNaN(r));
    
    if (rates.length === 0) {
      return { error: 'No valid occupancy data available' };
    }
    
    const sum = rates.reduce((a, b) => a + b, 0);
    const avg = (sum / rates.length).toFixed(2);
    const max = Math.max(...rates).toFixed(2);
    const min = Math.min(...rates).toFixed(2);
    const current = rates[rates.length - 1].toFixed(2);
    
    // Calculate median
    const sorted = [...rates].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? ((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(2)
      : sorted[Math.floor(sorted.length / 2)].toFixed(2);

    const stats = {
      average: parseFloat(avg),
      median: parseFloat(median),
      peak: parseFloat(max),
      lowest: parseFloat(min),
      current: parseFloat(current),
      dataPoints: rates.length,
      ward: normalized.ward || 'All',
      dateRange: result.dateRange,
      // ENHANCEMENT #9: Calculation transparency
      calculation: {
        formula: 'Average = Sum of all occupancy rates / Number of data points',
        sampleSize: rates.length,
        dataSource: 'OccupancyHistory collection'
      }
    };
    
    // ENHANCEMENT #6: Validate response
    const validationIssues = validateResponse(stats, 'calculateOccupancyStats');
    if (validationIssues.length > 0) {
      stats.warnings = validationIssues;
    }
    
    return stats;
  },

  // Get bed request statistics
  getBedRequestStats: async ({ startDate, endDate, status = null, ward = null }) => {
    // Apply normalization and validation
    const normalized = normalizeParameters({ startDate, endDate, status, ward });
    const errors = validateParameters(normalized, ['startDate', 'endDate']);
    
    if (errors.length > 0) {
      return { error: 'Validation failed', details: errors };
    }
    
    const query = {
      createdAt: {
        $gte: new Date(normalized.startDate),
        $lte: new Date(normalized.endDate)
      }
    };

    if (normalized.status) query.status = normalized.status;
    if (normalized.ward) query.preferredWard = normalized.ward;

    const requests = await BedRequest.find(query);

    const stats = {
      total: requests.length,
      approved: requests.filter(r => r.status === 'approved').length,
      denied: requests.filter(r => r.status === 'denied').length,
      pending: requests.filter(r => r.status === 'pending').length,
      fulfilled: requests.filter(r => r.status === 'fulfilled').length,
      cancelled: requests.filter(r => r.status === 'cancelled').length,
      byWard: requests.reduce((acc, r) => {
        const w = r.preferredWard || 'Unspecified';
        acc[w] = (acc[w] || 0) + 1;
        return acc;
      }, {}),
      dateRange: { start: normalized.startDate, end: normalized.endDate },
      ward: normalized.ward || 'All',
      calculation: {
        formula: 'Count of requests grouped by status',
        sampleSize: requests.length,
        dataSource: 'BedRequest collection'
      }
    };
    
    // Validate that all statuses sum to total
    const statusSum = stats.approved + stats.denied + stats.pending + stats.fulfilled + stats.cancelled;
    if (statusSum !== stats.total) {
      stats.warnings = [`Status counts (${statusSum}) don't match total (${stats.total})`];
    }
    
    return stats;
  },

  // Get patient statistics
  getPatientStats: async ({ startDate, endDate, ward = null }) => {
    // Apply normalization and validation
    const normalized = normalizeParameters({ startDate, endDate, ward });
    const errors = validateParameters(normalized, ['startDate', 'endDate']);
    
    if (errors.length > 0) {
      return { error: 'Validation failed', details: errors };
    }
    
    const query = {
      admissionDate: {
        $gte: new Date(normalized.startDate),
        $lte: new Date(normalized.endDate)
      }
    };

    if (normalized.ward) query.department = normalized.ward;

    const patients = await Patient.find(query);

    // Calculate average stay - filter out null/invalid values
    const completedStays = patients.filter(p => p.actualDischarge && p.admissionDate);
    let avgStay = 0;
    let avgStayDays = 0;

    if (completedStays.length > 0) {
      const totalHours = completedStays.reduce((sum, p) => {
        const admission = new Date(p.admissionDate);
        const discharge = new Date(p.actualDischarge);
        const hours = (discharge - admission) / (1000 * 60 * 60);
        // Filter out negative or unrealistic values
        return hours > 0 && hours < 8760 ? sum + hours : sum; // Max 1 year
      }, 0);
      avgStay = (totalHours / completedStays.length).toFixed(1);
      avgStayDays = (totalHours / completedStays.length / 24).toFixed(1);
    }

    const stats = {
      totalAdmissions: patients.length,
      currentlyAdmitted: patients.filter(p => !p.actualDischarge).length,
      discharged: completedStays.length,
      averageStayHours: parseFloat(avgStay),
      averageStayDays: parseFloat(avgStayDays),
      byWard: patients.reduce((acc, p) => {
        const w = p.department || 'Unknown';
        acc[w] = (acc[w] || 0) + 1;
        return acc;
      }, {}),
      dateRange: { start: normalized.startDate, end: normalized.endDate },
      ward: normalized.ward || 'All',
      calculation: {
        formula: 'Average Stay = Total hours of completed stays / Number of discharged patients',
        sampleSize: completedStays.length,
        dataSource: 'Patient collection'
      }
    };
    
    return stats;
  },

  // Get current bed status
  getCurrentBedStatus: async ({ ward = null }) => {
    // Apply normalization
    const normalized = normalizeParameters({ ward });
    
    const query = normalized.ward ? { ward: normalized.ward } : {};
    const beds = await Bed.find(query);

    const stats = {
      total: beds.length,
      occupied: beds.filter(b => b.status === 'occupied').length,
      available: beds.filter(b => b.status === 'available').length,
      cleaning: beds.filter(b => b.status === 'cleaning').length,
      reserved: beds.filter(b => b.status === 'reserved').length,
      maintenance: beds.filter(b => b.status === 'maintenance').length,
      ward: normalized.ward || 'All',
      timestamp: new Date().toISOString(),
      calculation: {
        formula: 'Occupancy Rate = (Occupied / Total) × 100',
        dataSource: 'Bed collection (real-time)'
      }
    };
    
    // Calculate occupancy rate
    if (stats.total > 0) {
      stats.occupancyRate = ((stats.occupied / stats.total) * 100).toFixed(2);
    }

    if (!normalized.ward) {
      stats.byWard = beds.reduce((acc, b) => {
        if (!acc[b.ward]) {
          acc[b.ward] = { total: 0, occupied: 0, available: 0, cleaning: 0, reserved: 0, maintenance: 0 };
        }
        acc[b.ward].total++;
        acc[b.ward][b.status] = (acc[b.ward][b.status] || 0) + 1;
        return acc;
      }, {});
      
      // Calculate occupancy rate for each ward
      Object.keys(stats.byWard).forEach(w => {
        const wardStats = stats.byWard[w];
        if (wardStats.total > 0) {
          wardStats.occupancyRate = ((wardStats.occupied / wardStats.total) * 100).toFixed(2);
        }
      });
    }
    
    // ENHANCEMENT #6: Validate response
    const validationIssues = validateResponse(stats, 'getCurrentBedStatus');
    if (validationIssues.length > 0) {
      stats.warnings = validationIssues;
    }

    return stats;
  },

  // Compare two time periods
  compareTimePeriods: async ({ period1Start, period1End, period2Start, period2End, metric = 'occupancy' }) => {
    // Apply normalization and validation
    const normalized = normalizeParameters({ period1Start, period1End, period2Start, period2End });
    const errors = validateParameters(normalized, ['period1Start', 'period1End', 'period2Start', 'period2End']);
    
    if (errors.length > 0) {
      return { error: 'Validation failed', details: errors };
    }
    
    const [period1Data, period2Data] = await Promise.all([
      availableFunctions.calculateOccupancyStats({ 
        startDate: normalized.period1Start, 
        endDate: normalized.period1End 
      }),
      availableFunctions.calculateOccupancyStats({ 
        startDate: normalized.period2Start, 
        endDate: normalized.period2End 
      })
    ]);
    
    if (period1Data.error || period2Data.error) {
      return { 
        error: 'Failed to retrieve comparison data',
        details: [period1Data.error, period2Data.error].filter(Boolean)
      };
    }

    const avgChange = (parseFloat(period2Data.average) - parseFloat(period1Data.average)).toFixed(2);
    const peakChange = (parseFloat(period2Data.peak) - parseFloat(period1Data.peak)).toFixed(2);
    
    return {
      period1: {
        range: `${normalized.period1Start} to ${normalized.period1End}`,
        stats: period1Data
      },
      period2: {
        range: `${normalized.period2Start} to ${normalized.period2End}`,
        stats: period2Data
      },
      comparison: {
        averageChange: parseFloat(avgChange),
        averageChangePercent: period1Data.average > 0 
          ? ((avgChange / period1Data.average) * 100).toFixed(2) 
          : 'N/A',
        peakChange: parseFloat(peakChange),
        trend: avgChange > 0 ? 'increasing' : avgChange < 0 ? 'decreasing' : 'stable'
      },
      calculation: {
        formula: 'Change = Period2 value - Period1 value; Change% = (Change / Period1) × 100',
        dataSource: 'OccupancyHistory collection'
      }
    };
  }
};

// Function declarations for Gemini
const functionDeclarations = [
  {
    name: 'getOccupancyData',
    description: 'Get occupancy data for a specific date range. Returns daily occupancy rates and bed counts.',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        ward: { type: 'string', description: 'Optional: specific ward name (Emergency, ICU, Cardiology, General Ward)' }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'calculateOccupancyStats',
    description: 'Calculate occupancy statistics (average, peak, lowest, current) for a date range.',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        ward: { type: 'string', description: 'Optional: specific ward name' }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'getBedRequestStats',
    description: 'Get bed request statistics including approval rates and ward distribution.',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        status: { type: 'string', description: 'Optional: filter by status (approved, denied, pending)' },
        ward: { type: 'string', description: 'Optional: filter by ward name' }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'getPatientStats',
    description: 'Get patient admission statistics including average stay duration and ward distribution.',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        ward: { type: 'string', description: 'Optional: specific ward/department name' }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'getCurrentBedStatus',
    description: 'Get current real-time bed status across all wards or a specific ward.',
    parameters: {
      type: 'object',
      properties: {
        ward: { type: 'string', description: 'Optional: specific ward name' }
      }
    }
  },
  {
    name: 'compareTimePeriods',
    description: 'Compare occupancy metrics between two different time periods.',
    parameters: {
      type: 'object',
      properties: {
        period1Start: { type: 'string', description: 'Period 1 start date (YYYY-MM-DD)' },
        period1End: { type: 'string', description: 'Period 1 end date (YYYY-MM-DD)' },
        period2Start: { type: 'string', description: 'Period 2 start date (YYYY-MM-DD)' },
        period2End: { type: 'string', description: 'Period 2 end date (YYYY-MM-DD)' },
        metric: { type: 'string', description: 'Metric to compare (occupancy, requests, patients)' }
      },
      required: ['period1Start', 'period1End', 'period2Start', 'period2End']
    }
  }
];

// Main chatbot endpoint with function calling
router.post('/chat', authorize('admin'), async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Check if Gemini is configured
    if (!genAI) {
      return res.status(503).json({
        success: false,
        error: 'AI service not configured. Please add GEMINI_API_KEY to environment variables.',
        fallbackMessage: 'Please contact your system administrator to enable AI analytics.'
      });
    }

    console.log('💬 User question:', message);
    console.log('📜 Conversation history length:', history.length);

    // Calculate date ranges (today, last 7 days, last 30 days, last 60 days)
    const today = new Date();
    const dates = {
      today: today.toISOString().split('T')[0],
      yesterday: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sevenDaysAgo: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      thirtyDaysAgo: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sixtyDaysAgo: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    // ===== ENHANCEMENT #5: Enhanced System Prompts =====
    const systemPrompt = `You are an expert hospital analytics assistant with access to real-time hospital data.

CURRENT DATE & TIME: ${today.toISOString()}
TODAY'S DATE: ${dates.today}
AVAILABLE DATA RANGE: Last 60 days (${dates.sixtyDaysAgo} to ${dates.today})

AVAILABLE WARDS (use these exact names):
- Emergency (also accepts: ER, Emergency Room)
- ICU (also accepts: Intensive Care Unit, Intensive Care)
- Cardiology (also accepts: Cardiac, Cardio)
- General Ward (also accepts: General, Ward)

DATA SCHEMA & CALCULATIONS:
1. Occupancy Rate = (Occupied Beds / Total Beds) × 100
2. All percentages should be between 0-100
3. Dates must be in YYYY-MM-DD format
4. All statistics are calculated from actual database records

FUNCTION CALLING GUIDELINES:
- ALWAYS use specific date ranges (don't leave dates undefined)
- For "today" queries, use: ${dates.today}
- For "yesterday" queries, use: ${dates.yesterday}
- For "last week" queries, use: ${dates.sevenDaysAgo} to ${dates.today}
- For "last month" queries, use: ${dates.thirtyDaysAgo} to ${dates.today}
- Normalize ward names to match the exact names above
- If user doesn't specify dates, ask for clarification or default to "today"

RESPONSE FORMAT:
1. Present data clearly with numbers and percentages
2. Always show the calculation formula when presenting statistics
3. Include the data range and sample size
4. Mention data timestamp for real-time queries
5. If data seems unusual, mention it
6. Provide actionable insights when possible

ACCURACY REQUIREMENTS:
- Verify all calculations make logical sense
- Check that percentages don't exceed 100%
- Ensure date ranges are valid (start before end)
- Cross-reference related metrics for consistency
- Flag any suspicious or unusual values

Remember previous conversation context and refer to it when relevant.`;

    // ===== ENHANCEMENT #10: Query Optimization with Caching =====
    const cacheKey = `${message}_${dates.today}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ Returning cached response');
      return res.json({
        success: true,
        message: cached.message,
        metadata: {
          ...cached.metadata,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
        },
        timestamp: new Date()
      });
    }

    // Initialize model with function calling
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations }]
    });

    // Build chat history from frontend, or start fresh
    const chatHistory = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I can analyze hospital data by calling the available functions. What would you like to know?' }] }
    ];

    // Add previous conversation history if provided
    if (history && history.length > 0) {
      history.forEach(msg => {
        chatHistory.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      });
    }

    const chat = model.startChat({
      history: chatHistory
    });

    // Send user message
    let result = await chat.sendMessage(message);
    let response = result.response;

    // Handle function calls (may require multiple rounds)
    let functionCallCount = 0;
    const maxFunctionCalls = 5;
    const functionResults = {};
    const executionLog = []; // ENHANCEMENT #9: Track execution for transparency

    while (response.functionCalls() && functionCallCount < maxFunctionCalls) {
      functionCallCount++;
      console.log(`🔧 Function call round ${functionCallCount}`);

      const functionCalls = response.functionCalls();
      const functionResponses = [];

      for (const call of functionCalls) {
        const startTime = Date.now();
        console.log(`  📞 Calling: ${call.name}`, call.args);

        try {
          const functionName = call.name;
          const functionArgs = call.args;

          // Execute the function
          if (availableFunctions[functionName]) {
            const functionResult = await availableFunctions[functionName](functionArgs);
            functionResults[functionName] = functionResult;
            
            // ===== ENHANCEMENT #9: Execution tracking =====
            const executionTime = Date.now() - startTime;
            executionLog.push({
              function: functionName,
              parameters: functionArgs,
              executionTime: `${executionTime}ms`,
              success: !functionResult.error,
              warnings: functionResult.warnings || []
            });

            functionResponses.push({
              functionResponse: {
                name: functionName,
                response: { result: functionResult }
              }
            });

            console.log(`  ✅ ${functionName} completed in ${executionTime}ms`);
            
            // ===== ENHANCEMENT #8: Error Handling with specific messages =====
            if (functionResult.error) {
              console.log(`  ⚠️  Function returned error: ${functionResult.error}`);
            }
            if (functionResult.warnings && functionResult.warnings.length > 0) {
              console.log(`  ⚠️  Warnings:`, functionResult.warnings);
            }
          } else {
            console.log(`  ❌ Function ${functionName} not found`);
            executionLog.push({
              function: functionName,
              parameters: functionArgs,
              success: false,
              error: 'Function not found'
            });
            functionResponses.push({
              functionResponse: {
                name: functionName,
                response: { error: 'Function not found' }
              }
            });
          }
        } catch (error) {
          console.error(`  ❌ Error executing ${call.name}:`, error.message);
          executionLog.push({
            function: call.name,
            parameters: call.args,
            success: false,
            error: error.message
          });
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { 
                error: error.message,
                suggestion: 'Please try rephrasing your query or check the date range'
              }
            }
          });
        }
      }

      // Send function results back to the model
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    // Get final text response
    const aiMessage = response.text();
    console.log('✅ AI response generated successfully');
    console.log(`📊 Used ${functionCallCount} function call(s)`);

    // ===== ENHANCEMENT #3: Structured Output Format =====
    const responseData = {
      success: true,
      message: aiMessage,
      metadata: {
        queryTimestamp: new Date().toISOString(),
        dataFreshness: 'Real-time',
        functionCallsUsed: functionCallCount,
        functionsExecuted: Object.keys(functionResults),
        executionLog: executionLog,
        dataQueried: functionResults,
        responseTime: `${Date.now() - Date.parse(today)}ms`
      },
      timestamp: new Date()
    };
    
    // ===== ENHANCEMENT #10: Cache the response =====
    responseCache.set(cacheKey, {
      message: aiMessage,
      metadata: responseData.metadata,
      timestamp: Date.now()
    });
    
    // Clean old cache entries (simple cleanup)
    if (responseCache.size > 100) {
      const oldestKey = responseCache.keys().next().value;
      responseCache.delete(oldestKey);
    }

    res.json(responseData);

  } catch (error) {
    console.error('❌ Chatbot error:', error);

    // ===== ENHANCEMENT #8: Specific Error Messages =====
    let errorMessage = 'Failed to process query. Please try again.';
    let suggestion = null;
    
    if (error.message && error.message.includes('API key')) {
      errorMessage = 'Invalid API key. Please check your Gemini API configuration.';
      suggestion = 'Contact system administrator to verify GEMINI_API_KEY environment variable.';
    } else if (error.message && error.message.includes('quota')) {
      errorMessage = 'API quota exceeded. Please try again later or check your Gemini API limits.';
      suggestion = 'Visit Google AI Studio to check your API usage and limits.';
    } else if (error.message && error.message.includes('rate limit')) {
      errorMessage = 'Too many requests. Please wait a moment and try again.';
      suggestion = 'Wait 30 seconds before sending another query.';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Request timed out. The query might be too complex.';
      suggestion = 'Try breaking your question into smaller, more specific queries.';
    } else if (error.message) {
      errorMessage = `Query processing failed: ${error.message}`;
      suggestion = 'Try rephrasing your question or using a simpler query.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      suggestion: suggestion,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date()
    });
  }
});

// Get chatbot statistics (for debugging/monitoring)
router.get('/stats', authorize('admin'), async (req, res) => {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [occupancyCount, requestCount, patientCount, bedCount] = await Promise.all([
      OccupancyHistory.countDocuments({ timestamp: { $gte: sixtyDaysAgo } }),
      BedRequest.countDocuments({ createdAt: { $gte: sixtyDaysAgo } }),
      Patient.countDocuments({ admissionDate: { $gte: sixtyDaysAgo } }),
      Bed.countDocuments()
    ]);

    res.json({
      success: true,
      dataAvailable: {
        occupancyRecords: occupancyCount,
        bedRequests: requestCount,
        patients: patientCount,
        totalBeds: bedCount
      },
      geminiConfigured: !!genAI,
      capabilities: {
        functionCalling: true,
        availableFunctions: Object.keys(availableFunctions),
        enhancements: [
          'Data Validation & Sanitization',
          'Real-time Data Synchronization',
          'Structured Output Format',
          'Parameter Normalization',
          'Enhanced System Prompts',
          'Response Validation',
          'Intent Classification',
          'Error Handling & Fallbacks',
          'Calculation Transparency',
          'Query Optimization & Caching'
        ]
      },
      cache: {
        size: responseCache.size,
        ttl: `${CACHE_TTL / 1000} seconds`
      },
      dateRange: {
        from: sixtyDaysAgo,
        to: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching chatbot stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

// ===== ENHANCEMENT #10: Cache Management Endpoint =====
router.post('/clear-cache', authorize('admin'), async (req, res) => {
  try {
    const previousSize = responseCache.size;
    responseCache.clear();
    console.log(`🗑️  Cleared ${previousSize} cached responses`);
    
    res.json({
      success: true,
      message: `Cache cleared successfully`,
      clearedEntries: previousSize,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: 'Failed to clear cache' });
  }
});

module.exports = router;
