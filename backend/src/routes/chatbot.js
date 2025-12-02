const express = require('express');
const router = express.Router();
const OccupancyHistory = require('../models/OccupancyHistory');
const BedRequest = require('../models/BedRequest');
const Patient = require('../models/Patient');
const Bed = require('../models/Bed');

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

// Define available functions that AI can call
const availableFunctions = {
  // Get occupancy data for a specific date range
  getOccupancyData: async ({ startDate, endDate, ward = null }) => {
    const query = {
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const data = await OccupancyHistory.find(query).sort({ timestamp: 1 }).limit(500);

    if (ward) {
      return data.map(d => ({
        date: d.timestamp,
        occupancyRate: d.occupancyRate,
        wardData: d.wardStats?.find(w => w.ward === ward)
      })).filter(d => d.wardData);
    }

    return data.map(d => ({
      date: d.timestamp,
      occupancyRate: d.occupancyRate,
      occupied: d.occupied,
      total: d.totalBeds
    }));
  },

  // Calculate statistics for a date range
  calculateOccupancyStats: async ({ startDate, endDate, ward = null }) => {
    const data = await availableFunctions.getOccupancyData({ startDate, endDate, ward });

    if (data.length === 0) return { error: 'No data found for this period' };

    const rates = data.map(d => parseFloat(d.occupancyRate || 0));
    const avg = (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2);
    const max = Math.max(...rates).toFixed(2);
    const min = Math.min(...rates).toFixed(2);
    const current = rates[rates.length - 1].toFixed(2);

    return {
      average: avg,
      peak: max,
      lowest: min,
      current: current,
      dataPoints: data.length,
      ward: ward || 'All'
    };
  },

  // Get bed request statistics
  getBedRequestStats: async ({ startDate, endDate, status = null, ward = null }) => {
    const query = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (status) query.status = status;
    if (ward) query.preferredWard = ward;

    const requests = await BedRequest.find(query);

    return {
      total: requests.length,
      approved: requests.filter(r => r.status === 'approved').length,
      denied: requests.filter(r => r.status === 'denied').length,
      pending: requests.filter(r => r.status === 'pending').length,
      byWard: requests.reduce((acc, r) => {
        acc[r.preferredWard] = (acc[r.preferredWard] || 0) + 1;
        return acc;
      }, {})
    };
  },

  // Get patient statistics
  getPatientStats: async ({ startDate, endDate, ward = null }) => {
    const query = {
      admissionDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (ward) query.department = ward;

    const patients = await Patient.find(query);

    // Calculate average stay
    const completedStays = patients.filter(p => p.actualDischarge);
    let avgStay = 0;

    if (completedStays.length > 0) {
      const totalHours = completedStays.reduce((sum, p) => {
        const admission = new Date(p.admissionDate);
        const discharge = new Date(p.actualDischarge);
        return sum + (discharge - admission) / (1000 * 60 * 60);
      }, 0);
      avgStay = (totalHours / completedStays.length).toFixed(1);
    }

    return {
      totalAdmissions: patients.length,
      currentlyAdmitted: patients.filter(p => !p.actualDischarge).length,
      discharged: completedStays.length,
      averageStayHours: avgStay,
      byWard: patients.reduce((acc, p) => {
        const w = p.department || 'Unknown';
        acc[w] = (acc[w] || 0) + 1;
        return acc;
      }, {})
    };
  },

  // Get current bed status
  getCurrentBedStatus: async ({ ward = null }) => {
    const query = ward ? { ward } : {};
    const beds = await Bed.find(query);

    const stats = {
      total: beds.length,
      occupied: beds.filter(b => b.status === 'occupied').length,
      available: beds.filter(b => b.status === 'available').length,
      cleaning: beds.filter(b => b.status === 'cleaning').length,
      reserved: beds.filter(b => b.status === 'reserved').length
    };

    if (!ward) {
      stats.byWard = beds.reduce((acc, b) => {
        if (!acc[b.ward]) {
          acc[b.ward] = { total: 0, occupied: 0, available: 0, cleaning: 0, reserved: 0 };
        }
        acc[b.ward].total++;
        acc[b.ward][b.status]++;
        return acc;
      }, {});
    }

    return stats;
  },

  // Compare two time periods
  compareTimePeriods: async ({ period1Start, period1End, period2Start, period2End, metric = 'occupancy' }) => {
    const [period1Data, period2Data] = await Promise.all([
      availableFunctions.calculateOccupancyStats({ startDate: period1Start, endDate: period1End }),
      availableFunctions.calculateOccupancyStats({ startDate: period2Start, endDate: period2End })
    ]);

    return {
      period1: {
        range: `${period1Start} to ${period1End}`,
        stats: period1Data
      },
      period2: {
        range: `${period2Start} to ${period2End}`,
        stats: period2Data
      },
      comparison: {
        averageChange: (parseFloat(period2Data.average) - parseFloat(period1Data.average)).toFixed(2),
        peakChange: (parseFloat(period2Data.peak) - parseFloat(period1Data.peak)).toFixed(2)
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
      sevenDaysAgo: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      thirtyDaysAgo: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sixtyDaysAgo: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    // Create system prompt with context
    const systemPrompt = `You are an expert hospital analytics assistant with access to real-time hospital data.

CURRENT DATE: ${dates.today}
AVAILABLE DATA RANGE: Last 60 days (${dates.sixtyDaysAgo} to ${dates.today})

AVAILABLE WARDS:
- Emergency
- ICU
- Cardiology
- General Ward

You can call functions to get specific data. When analyzing:
1. Determine what data you need to answer the question
2. Call appropriate functions with relevant date ranges
3. Analyze the results
4. Provide clear, actionable insights

Be specific with dates - use YYYY-MM-DD format. For relative queries like "last week", calculate the actual dates based on today's date.

Remember previous conversation context and refer to it when relevant.`;

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

    while (response.functionCalls() && functionCallCount < maxFunctionCalls) {
      functionCallCount++;
      console.log(`🔧 Function call round ${functionCallCount}`);

      const functionCalls = response.functionCalls();
      const functionResponses = [];

      for (const call of functionCalls) {
        console.log(`  📞 Calling: ${call.name}`, call.args);

        try {
          const functionName = call.name;
          const functionArgs = call.args;

          // Execute the function
          if (availableFunctions[functionName]) {
            const functionResult = await availableFunctions[functionName](functionArgs);
            functionResults[functionName] = functionResult;

            functionResponses.push({
              functionResponse: {
                name: functionName,
                response: { result: functionResult }
              }
            });

            console.log(`  ✅ ${functionName} completed`);
          } else {
            console.log(`  ❌ Function ${functionName} not found`);
            functionResponses.push({
              functionResponse: {
                name: functionName,
                response: { error: 'Function not found' }
              }
            });
          }
        } catch (error) {
          console.error(`  ❌ Error executing ${call.name}:`, error.message);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: error.message }
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

    res.json({
      success: true,
      message: aiMessage,
      metadata: {
        functionCallsUsed: functionCallCount,
        functionsExecuted: Object.keys(functionResults),
        dataQueried: functionResults
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Chatbot error:', error);

    let errorMessage = 'Failed to process query. Please try again.';
    if (error.message && error.message.includes('API key')) {
      errorMessage = 'Invalid API key. Please check your Gemini API configuration.';
    } else if (error.message && error.message.includes('quota')) {
      errorMessage = 'API quota exceeded. Please try again later or check your Gemini API limits.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        availableFunctions: Object.keys(availableFunctions)
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

module.exports = router;
