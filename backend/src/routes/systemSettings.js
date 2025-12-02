const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const Bed = require('../models/Bed');

// Role-based authorization - only admin can modify
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Get system settings (all authenticated users can view)
router.get('/', async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to sync beds with ward capacity
async function syncWardBeds(ward, targetCapacity, io) {
  const wardConfig = {
    'Emergency': { floor: 0, prefix: 'ER', equipment: ['Standard', 'Ventilator'] },
    'ICU': { floor: 1, prefix: 'ICU', equipment: ['ICU Monitor', 'Ventilator'] },
    'Cardiology': { floor: 2, prefix: 'CARD', equipment: ['Cardiac Monitor', 'Standard'] },
    'General Ward': { floor: 3, prefix: 'GEN', equipment: ['Standard'] }
  };

  const config = wardConfig[ward];
  if (!config) return { added: 0, removed: 0 };

  const currentBeds = await Bed.find({ ward }).sort({ bedNumber: 1 });
  const currentCount = currentBeds.length;
  let added = 0, removed = 0;

  console.log(`[syncWardBeds] ${ward}: current=${currentCount}, target=${targetCapacity}`);

  if (targetCapacity > currentCount) {
    // Add beds
    const bedsToAdd = targetCapacity - currentCount;
    for (let i = 0; i < bedsToAdd; i++) {
      const newBedNum = currentCount + i + 1;
      const section = String.fromCharCode(65 + Math.floor((newBedNum - 1) / 5));
      const bedNumber = `${config.prefix}-${String(newBedNum).padStart(3, '0')}`;

      // Check if bed already exists
      const exists = await Bed.findOne({ bedNumber });
      if (!exists) {
        await Bed.create({
          bedNumber,
          ward,
          status: 'available',
          equipmentType: config.equipment[Math.floor(Math.random() * config.equipment.length)],
          location: {
            floor: config.floor,
            section,
            roomNumber: `${config.floor}${section}${String(((newBedNum - 1) % 5) + 1).padStart(2, '0')}`
          },
          lastCleaned: new Date(),
          lastUpdated: new Date()
        });
        added++;
      }
    }
  } else if (targetCapacity < currentCount) {
    // Remove beds (only unoccupied ones, from the end)
    const bedsToRemove = currentCount - targetCapacity;
    // Include available, cleaning, and reserved beds for removal (but not occupied)
    const removableBeds = currentBeds
      .filter(b => b.status === 'available' || b.status === 'cleaning' || b.status === 'reserved')
      .reverse()
      .slice(0, bedsToRemove);

    for (const bed of removableBeds) {
      await Bed.findByIdAndDelete(bed._id);
      removed++;
    }

    // If we couldn't remove enough beds (some are occupied), log warning
    if (removed < bedsToRemove) {
      console.log(`Warning: Could only remove ${removed}/${bedsToRemove} beds from ${ward} (others are occupied)`);
    }
  }

  console.log(`[syncWardBeds] ${ward}: added=${added}, removed=${removed}, final count should be=${currentCount + added - removed}`);

  // Emit bed updates
  if (added > 0 || removed > 0) {
    io.emit('beds-synced', { ward, added, removed });
  }

  return { added, removed };
}

// Update system settings (admin only)
router.put('/', authorize('admin'), async (req, res) => {
  console.log('====================================');
  console.log('[Settings API] PUT /api/settings called');
  console.log('[Settings API] Request body:', JSON.stringify(req.body, null, 2));
  console.log('====================================');
  
  try {
    const {
      thresholds,
      reporting,
      exportOptions,
      wardCapacity
    } = req.body;

    const settings = await SystemSettings.getSettings();
    const bedSyncResults = {};

    // Update thresholds
    if (thresholds) {
      if (thresholds.warningThreshold !== undefined) {
        settings.thresholds.warningThreshold = thresholds.warningThreshold;
      }
      if (thresholds.criticalThreshold !== undefined) {
        settings.thresholds.criticalThreshold = thresholds.criticalThreshold;
      }
    }

    // Update reporting config
    if (reporting) {
      if (reporting.defaultPeriod) {
        settings.reporting.defaultPeriod = reporting.defaultPeriod;
      }
      if (reporting.autoRefreshInterval !== undefined) {
        settings.reporting.autoRefreshInterval = reporting.autoRefreshInterval;
      }
    }

    // Update export options
    if (exportOptions) {
      if (exportOptions.includePHI !== undefined) {
        settings.exportOptions.includePHI = exportOptions.includePHI;
      }
      if (exportOptions.defaultFormat) {
        settings.exportOptions.defaultFormat = exportOptions.defaultFormat;
      }
    }

    // Update ward capacity and sync beds
    if (wardCapacity) {
      console.log('[Settings Update] Ward capacities received:', wardCapacity);
      for (const [ward, capacity] of Object.entries(wardCapacity)) {
        if (capacity !== undefined && capacity > 0) {
          const oldCapacity = settings.wardCapacity[ward] || 15;
          console.log(`[Settings Update] ${ward}: ${oldCapacity} -> ${capacity}`);
          settings.wardCapacity[ward] = capacity;

          // Sync actual beds if capacity changed
          if (capacity !== oldCapacity) {
            bedSyncResults[ward] = await syncWardBeds(ward, capacity, req.io);
          } else {
            console.log(`[Settings Update] ${ward}: No change in capacity, skipping sync`);
          }
        }
      }
      
      // Log final summary
      const totalTarget = Object.values(wardCapacity).reduce((sum, val) => sum + (val || 0), 0);
      console.log(`[Settings Update] Total target capacity: ${totalTarget}`);
    }

    // Track who updated
    settings.lastUpdatedBy = {
      userId: req.user.id,
      username: req.user.username,
      name: req.user.name
    };

    await settings.save();

    // Emit socket event for settings update
    req.io.emit('settings-updated', settings);

    res.json({
      message: 'Settings updated successfully',
      settings,
      bedSyncResults
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset to defaults (admin only)
router.post('/reset', authorize('admin'), async (req, res) => {
  try {
    await SystemSettings.deleteMany({ singleton: 'settings' });
    const settings = await SystemSettings.getSettings();

    // Emit socket event
    req.io.emit('settings-updated', settings);

    res.json({
      message: 'Settings reset to defaults',
      settings
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
