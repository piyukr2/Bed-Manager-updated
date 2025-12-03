const express = require('express');
const router = express.Router();
const Bed = require('../models/Bed');
const Patient = require('../models/Patient');
const OccupancyHistory = require('../models/OccupancyHistory');
const Alert = require('../models/Alert');
const CleaningJob = require('../models/CleaningJob');
const QRCode = require('qrcode');

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Filter beds based on user role
const filterBedsByRole = (beds, user) => {
  if (user.role === 'admin') {
    return beds;
  }
  // Ward staff can see all beds (they manage all departments)
  if (user.role === 'ward_staff') {
    return beds;
  }
  // ICU managers only see beds in their ward
  if (user.role === 'icu_manager') {
    return beds.filter(bed => bed.ward === user.ward);
  }
  return beds;
};

// Get all beds with optional filtering
router.get('/', async (req, res) => {
  try {
    const { ward, status, floor, equipmentType } = req.query;
    const query = {};
    
    // Apply role-based filtering
    // Bed Manager (formerly ICU Manager) can now see all wards
    // Ward staff manages operations across ALL departments - they see all beds
    if (req.user.role === 'icu_manager' || req.user.role === 'ward_staff') {
      // Bed Manager and Ward staff can see all wards, but can filter by specific ward if requested
      if (ward && ward !== 'All') {
        query.ward = ward;
      }
      // If ward is 'All' or undefined, show all beds (no ward filter)
    } else {
      // For other roles (admin, er_staff, etc.), apply ward filter if specified
      if (ward && ward !== 'All') {
        query.ward = ward;
      }
    }
    
    if (status) query.status = status;
    if (floor) query['location.floor'] = parseInt(floor);
    if (equipmentType) query.equipmentType = equipmentType;
    
    const beds = await Bed.find(query)
      .populate('patientId')
      .sort({ bedNumber: 1 });
    
    res.json(beds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available beds
router.get('/available', async (req, res) => {
  try {
    const { ward, equipmentType, urgency } = req.query;
    const query = { status: 'available' };
    
    // Apply role-based filtering
    // Bed Manager (formerly ICU Manager) and Ward staff can see available beds from all wards
    if ((req.user.role === 'icu_manager' || req.user.role === 'ward_staff') && ward && ward !== 'All') {
      query.ward = ward;
    } else if (req.user.role !== 'icu_manager' && req.user.role !== 'ward_staff' && ward && ward !== 'All') {
      query.ward = ward;
    }
    // Bed Manager, ward_staff and other roles can see all available beds or filter by ward
    
    if (equipmentType) {
      query.equipmentType = equipmentType;
    }
    
    let beds = await Bed.find(query).sort({ bedNumber: 1 });
    
    // If urgency is high and no beds found
    if (urgency === 'high' && beds.length === 0 && equipmentType) {
      beds = await Bed.find({ 
        status: 'available',
        equipmentType 
      }).sort({ bedNumber: 1 });
    }
    
    if (urgency === 'high' && beds.length === 0) {
      const cleaningBeds = await Bed.find({ 
        status: 'cleaning',
        ...(equipmentType && { equipmentType })
      })
      .sort({ lastCleaned: -1 })
      .limit(5);
      
      res.json({
        available: [],
        alternatives: cleaningBeds,
        message: 'No available beds. These beds are under cleaning and may be ready soon.'
      });
      return;
    }
    
    res.json(beds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bed statistics
router.get('/stats', async (req, res) => {
  try {
    let query = {};

    // Apply role-based filtering
    // Bed Manager (formerly ICU Manager) and Ward staff see all beds across all wards
    // No ward restriction for icu_manager role - they manage all wards
    // ward_staff and other roles see all beds (no filter)
    
    const totalBeds = await Bed.countDocuments(query);
    const occupied = await Bed.countDocuments({ ...query, status: 'occupied' });
    const available = await Bed.countDocuments({ ...query, status: 'available' });
    const cleaning = await Bed.countDocuments({ ...query, status: 'cleaning' });
    const reserved = await Bed.countDocuments({ ...query, status: 'reserved' });
    
    // Ward-wise statistics
    // No ward filtering for any role - all roles see all ward stats
    const wardStatsQuery = [];

    const wardStats = await Bed.aggregate([
      ...wardStatsQuery,
      {
        $group: {
          _id: '$ward',
          total: { $sum: 1 },
          occupied: {
            $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] }
          },
          available: {
            $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] }
          },
          cleaning: {
            $sum: { $cond: [{ $eq: ['$status', 'cleaning'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Equipment-wise statistics
    const equipmentStats = await Bed.aggregate([
      ...wardStatsQuery,
      {
        $group: {
          _id: '$equipmentType',
          total: { $sum: 1 },
          available: {
            $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] }
          },
          occupied: {
            $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const occupancyRate = totalBeds > 0 
      ? parseFloat(((occupied / totalBeds) * 100).toFixed(1)) 
      : 0;
    
    // Generate alerts based on thresholds
    let alert = null;
    if (occupancyRate >= 95) {
      alert = {
        type: 'critical',
        message: `CRITICAL: ${occupancyRate}% occupancy! Immediate action required (${occupied}/${totalBeds} beds)`,
        timestamp: new Date(),
        priority: 5
      };
      await Alert.create({
        type: 'critical',
        message: alert.message,
        ward: req.user.ward || 'All',
        priority: 5
      });
    } else if (occupancyRate >= 90) {
      alert = {
        type: 'critical',
        message: `Critical occupancy: ${occupancyRate}% (${occupied}/${totalBeds} beds occupied)`,
        timestamp: new Date(),
        priority: 4
      };
      await Alert.create({
        type: 'critical',
        message: alert.message,
        ward: req.user.ward || 'All',
        priority: 4
      });
    } else if (occupancyRate >= 80) {
      alert = {
        type: 'warning',
        message: `High occupancy: ${occupancyRate}% (${occupied}/${totalBeds} beds occupied)`,
        timestamp: new Date(),
        priority: 3
      };
      await Alert.create({
        type: 'warning',
        message: alert.message,
        ward: req.user.ward || 'All',
        priority: 3
      });
    }
    
    // Save to history - Update or create today's entry only
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow

    // Check if today's entry exists
    const existingTodayEntry = await OccupancyHistory.findOne({
      timestamp: { $gte: today, $lt: tomorrow }
    });

    const historyData = {
      totalBeds,
      occupied,
      available,
      cleaning,
      reserved,
      occupancyRate,
      wardStats: wardStats.map(w => ({
        ward: w._id,
        total: w.total,
        occupied: w.occupied,
        available: w.available,
        occupancyRate: parseFloat(((w.occupied / w.total) * 100).toFixed(1))
      })),
      peakHour: occupancyRate >= 85,
      timestamp: new Date() // Current timestamp for today's entry
    };

    if (existingTodayEntry) {
      // Update today's entry
      await OccupancyHistory.findByIdAndUpdate(existingTodayEntry._id, historyData);
    } else {
      // Create new entry for today
      await OccupancyHistory.create(historyData);
    }
    
    res.json({
      totalBeds,
      occupied,
      available,
      cleaning,
      reserved,
      occupancyRate,
      wardStats,
      equipmentStats,
      alert
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get occupancy history
router.get('/history', async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    let startTime = new Date();

    if (period === 'today') {
      // Set to start of today (midnight)
      startTime.setHours(0, 0, 0, 0);
    } else if (period === '7d') {
      startTime.setHours(startTime.getHours() - 168);
    } else if (period === '30d') {
      startTime.setHours(startTime.getHours() - 720);
    }

    const history = await OccupancyHistory.find({
      timestamp: { $gte: startTime }
    })
    .sort({ timestamp: 1 })
    .limit(100);

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single bed
router.get('/:id', async (req, res) => {
  try {
    const bed = await Bed.findById(req.params.id).populate('patientId');
    if (!bed) {
      return res.status(404).json({ error: 'Bed not found' });
    }
    
    // Check role-based access
    // Bed Manager (formerly ICU Manager) and Ward staff can access all wards
    // No restrictions for these roles
    
    res.json(bed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update bed status
router.put('/:id', authorize('admin', 'icu_manager', 'ward_staff'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const bed = await Bed.findById(req.params.id);
    if (!bed) {
      return res.status(404).json({ error: 'Bed not found' });
    }
    
    // Check role-based access
    // Bed Manager (formerly ICU Manager) and Ward staff can update beds in all wards
    // No restrictions for these roles

    const previousStatus = bed.status;

    // Validate bed state transitions (only when status is provided)
    if (typeof status !== 'undefined' && status !== previousStatus) {
      const validTransitions = {
        available: ['occupied', 'reserved', 'cleaning'],
        occupied: ['cleaning', 'available'],
        cleaning: ['available'],
        reserved: ['occupied', 'available']
      };

      const allowedNextStates = validTransitions[previousStatus] || [];

      if (!allowedNextStates.includes(status)) {
        return res.status(400).json({
          error: `Invalid state transition: Cannot change from '${previousStatus}' to '${status}'. Allowed transitions: ${allowedNextStates.join(', ')}`
        });
      }
    }

    const updateFields = { lastUpdated: Date.now() };

    if (typeof status !== 'undefined') {
      updateFields.status = status;
    }

    if (typeof notes !== 'undefined') {
      updateFields.notes = notes;
    }

    if (status === 'cleaning') {
      updateFields.lastCleaned = Date.now();
    }

    if (status === 'available') {
      updateFields.patientId = null;
    }

    const updatedBed = await Bed.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).populate('patientId');

    // Create cleaning job if bed status changed from 'occupied' to anything else
    if (previousStatus === 'occupied' && status !== 'occupied') {
      console.log('🧹 Creating cleaning job for bed:', updatedBed.bedNumber);
      const cleaningJob = await CleaningJob.create({
        bedId: updatedBed._id,
        bedNumber: updatedBed.bedNumber,
        ward: updatedBed.ward,
        floor: updatedBed.location.floor,
        section: updatedBed.location.section,
        roomNumber: updatedBed.location.roomNumber,
        status: 'pending'
      });

      console.log('🧹 Cleaning job created:', cleaningJob._id);
      // Emit socket event for new cleaning job notification
      console.log('📡 Emitting new-cleaning-job event to all clients');
      req.io.emit('new-cleaning-job', cleaningJob);
    }
    
    // Emit socket events
    req.io.emit('bed-updated', updatedBed);
    req.io.to(`bed-${updatedBed._id}`).emit('bed-status-changed', updatedBed);
    req.io.to(`ward-${updatedBed.ward}`).emit('ward-bed-updated', updatedBed);
    
    // Create alert
    await Alert.create({
      type: 'info',
      message: `Bed ${updatedBed.bedNumber} status changed to ${status} by ${req.user.name}`,
      ward: updatedBed.ward,
      bedId: updatedBed._id,
      priority: 2
    });
    
    res.json(updatedBed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate QR code for site
router.get('/qr/site', async (req, res) => {
  try {
    const siteUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:3000';
    
    const qrCodeImage = await QRCode.toDataURL(siteUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    res.json({ 
      qrCode: qrCodeImage, 
      siteUrl,
      message: 'Scan this QR code to access BedManager from your mobile device'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recommend bed for emergency
router.post('/recommend', authorize('admin', 'icu_manager', 'er_staff'), async (req, res) => {
  try {
    const { ward, equipmentType, urgency, limit = 3 } = req.body;

    // Trim and validate ward parameter
    const requestedWard = ward ? ward.trim() : null;
    const maxResults = Math.min(parseInt(limit) || 3, 3); // Max 3 results

    // Log the recommendation request for debugging
    console.log(`🔍 Bed Recommendation Request: Ward='${requestedWard || 'Any'}', Equipment='${equipmentType || 'Any'}', Urgency='${urgency || 'normal'}', Limit=${maxResults}`);

    let recommendedBeds = [];
    let perfectMatches = [];
    let wardMatches = [];
    let equipmentMatches = [];
    let otherAvailable = [];

    // If ward is specified (non-empty string), ONLY look for beds in that specific ward
    if (requestedWard && requestedWard !== '' && requestedWard !== 'Any') {
      // Priority 1: Perfect Match - both ward AND equipment
      if (equipmentType) {
        // Get all perfect matches first
        const allPerfectMatches = await Bed.find({
          status: 'available',
          ward: requestedWard,
          equipmentType
        }).sort({ lastUpdated: 1 });

        // Smart allocation based on number of perfect matches
        if (allPerfectMatches.length >= 3) {
          // If 3+ perfect matches exist: take 2 perfect + 1 different equipment
          perfectMatches = allPerfectMatches.slice(0, 2);
          
          // Get 1 bed with different equipment
          wardMatches = await Bed.find({
            status: 'available',
            ward: requestedWard,
            equipmentType: { $ne: equipmentType }
          }).sort({ lastUpdated: 1 }).limit(1);
          
          console.log(`✅ Found ${allPerfectMatches.length} perfect matches. Taking 2 perfect + 1 different equipment`);
        } else if (allPerfectMatches.length >= 2) {
          // If 2 perfect matches exist: take 2 perfect + 1 any other
          perfectMatches = allPerfectMatches.slice(0, 2);
          
          // Get 1 more bed with different equipment
          wardMatches = await Bed.find({
            status: 'available',
            ward: requestedWard,
            equipmentType: { $ne: equipmentType }
          }).sort({ lastUpdated: 1 }).limit(1);
          
          console.log(`✅ Found 2 perfect matches. Taking 2 perfect + 1 different equipment`);
        } else if (allPerfectMatches.length === 1) {
          // If 1 perfect match: take 1 perfect + 2 different equipment
          perfectMatches = allPerfectMatches;
          
          // Get 2 more beds with different equipment
          wardMatches = await Bed.find({
            status: 'available',
            ward: requestedWard,
            equipmentType: { $ne: equipmentType }
          }).sort({ lastUpdated: 1 }).limit(2);
          
          console.log(`✅ Found 1 perfect match. Taking 1 perfect + 2 different equipment`);
        } else {
          // If 0 perfect matches: take up to 3 with different equipment
          wardMatches = await Bed.find({
            status: 'available',
            ward: requestedWard
          }).sort({ lastUpdated: 1 }).limit(3);
          
          console.log(`⚠️ No perfect matches. Taking up to 3 beds with any equipment`);
        }
      } else {
        // No equipment specified: just get up to 3 beds from the ward
        wardMatches = await Bed.find({
          status: 'available',
          ward: requestedWard
        }).sort({ lastUpdated: 1 }).limit(3);
      }

      // Combine results
      recommendedBeds = [
        ...perfectMatches.map(bed => ({ bed, matchLevel: 'perfect' })),
        ...wardMatches.map(bed => ({ bed, matchLevel: 'ward_match' }))
      ];

      // If no available beds in requested ward, show alternatives from THAT ward only
      if (recommendedBeds.length === 0) {
        const cleaningBeds = await Bed.find({
          status: 'cleaning',
          ward: requestedWard
        }).sort({ lastCleaned: -1 }).limit(3);

        const reservedBeds = await Bed.find({
          status: 'reserved',
          ward: requestedWard
        }).sort({ lastUpdated: 1 }).limit(3);

        console.log(`❌ No available beds in ${requestedWard} ward. Showing ${cleaningBeds.length} cleaning and ${reservedBeds.length} reserved beds from ${requestedWard} only.`);

        return res.status(404).json({
          error: `No available beds in ${requestedWard} ward`,
          suggestion: `Check beds under cleaning in ${requestedWard} ward or wait for upcoming availability`,
          alternatives: {
            cleaning: cleaningBeds,
            reserved: reservedBeds
          },
          message: `Requested: Ward=${requestedWard}, Equipment=${equipmentType || 'Any'}`
        });
      }

      console.log(`✅ Found ${recommendedBeds.length} beds in ${requestedWard} ward (${perfectMatches.length} perfect matches, ${wardMatches.length} ward matches)`);
    } else {
      // No ward specified (null, empty, or "Any") - can search across all wards
      console.log(`🔍 No specific ward requested. Searching across all wards...`);

      // Priority 1: Equipment match (any ward)
      if (equipmentType) {
        const allEquipmentMatches = await Bed.find({
          status: 'available',
          equipmentType
        }).sort({ lastUpdated: 1 });

        if (allEquipmentMatches.length >= 3) {
          // If 3+ equipment matches: take 2 matching + 1 different
          equipmentMatches = allEquipmentMatches.slice(0, 2);
          
          otherAvailable = await Bed.find({
            status: 'available',
            equipmentType: { $ne: equipmentType }
          }).sort({ lastUpdated: 1 }).limit(1);
        } else if (allEquipmentMatches.length >= 2) {
          // If 2 equipment matches: take 2 matching + 1 any other
          equipmentMatches = allEquipmentMatches.slice(0, 2);
          
          otherAvailable = await Bed.find({
            status: 'available',
            equipmentType: { $ne: equipmentType }
          }).sort({ lastUpdated: 1 }).limit(1);
        } else {
          // Take what we have + fill with others
          equipmentMatches = allEquipmentMatches;
          
          const remaining = 3 - equipmentMatches.length;
          otherAvailable = await Bed.find({
            status: 'available',
            equipmentType: { $ne: equipmentType }
          }).sort({ lastUpdated: 1 }).limit(remaining);
        }
      } else {
        // No equipment specified: just get up to 3 beds from any ward
        otherAvailable = await Bed.find({
          status: 'available'
        }).sort({ lastUpdated: 1 }).limit(3);
      }

      // Combine results
      recommendedBeds = [
        ...equipmentMatches.map(bed => ({ bed, matchLevel: 'equipment_match' })),
        ...otherAvailable.map(bed => ({ bed, matchLevel: 'any_available' }))
      ];

      // Show alternatives from any ward if no available beds
      if (recommendedBeds.length === 0) {
        const cleaningBeds = await Bed.find({ status: 'cleaning' })
          .sort({ lastCleaned: -1 })
          .limit(3);

        const reservedBeds = await Bed.find({ status: 'reserved' })
          .sort({ lastUpdated: 1 })
          .limit(3);

        console.log(`❌ No available beds across all wards. Showing ${cleaningBeds.length} cleaning and ${reservedBeds.length} reserved beds.`);

        return res.status(404).json({
          error: 'No available beds matching criteria',
          suggestion: 'Check beds under cleaning or contact wards',
          alternatives: {
            cleaning: cleaningBeds,
            reserved: reservedBeds
          },
          message: `Requested: Equipment=${equipmentType || 'Any'}`
        });
      }

      console.log(`✅ Found ${recommendedBeds.length} beds across all wards (${equipmentMatches.length} equipment matches, ${otherAvailable.length} other available)`);
    }

    res.json({
      beds: recommendedBeds,
      count: recommendedBeds.length,
      message: `Found ${recommendedBeds.length} available bed option(s)`,
      summary: {
        perfectMatches: perfectMatches.length,
        wardMatches: wardMatches.length,
        equipmentMatches: equipmentMatches.length,
        otherAvailable: otherAvailable.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function getMatchLevel(bed, requestedWard, requestedEquipment) {
  if (bed.ward === requestedWard && bed.equipmentType === requestedEquipment) {
    return 'perfect';
  } else if (bed.equipmentType === requestedEquipment) {
    return 'equipment_match';
  } else if (bed.ward === requestedWard) {
    return 'ward_match';
  }
  return 'any_available';
}

module.exports = router;