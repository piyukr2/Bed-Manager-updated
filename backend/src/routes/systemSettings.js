const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');

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

// Update system settings (admin only)
router.put('/', authorize('admin'), async (req, res) => {
  try {
    const {
      thresholds,
      reporting,
      reservationPolicies,
      exportOptions
    } = req.body;

    const settings = await SystemSettings.getSettings();

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

    // Update reservation policies
    if (reservationPolicies) {
      if (reservationPolicies.defaultReservationTTL !== undefined) {
        settings.reservationPolicies.defaultReservationTTL = reservationPolicies.defaultReservationTTL;
      }
      if (reservationPolicies.autoExpireReservations !== undefined) {
        settings.reservationPolicies.autoExpireReservations = reservationPolicies.autoExpireReservations;
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
      settings
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
