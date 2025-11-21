const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');

// Get all alerts
router.get('/', async (req, res) => {
  try {
    const { type, ward, acknowledged, limit = 50 } = req.query;
    const query = {};
    
    if (type) query.type = type;
    if (ward) query.ward = ward;
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';
    
    const alerts = await Alert.find(query)
      .populate('bedId')
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single alert
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).populate('bedId');
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new alert
router.post('/', async (req, res) => {
  try {
    const { type, message, ward, bedId, priority } = req.body;
    
    if (!type || !message) {
      return res.status(400).json({ error: 'Type and message are required' });
    }
    
    const alert = await Alert.create({
      type,
      message,
      ward,
      bedId,
      priority: priority || 1
    });
    
    // Emit socket event
    req.io.emit('new-alert', alert);
    if (ward) {
      req.io.to(`ward-${ward}`).emit('ward-alert', alert);
    }
    
    res.status(201).json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Acknowledge alert
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const { acknowledgedBy } = req.body;
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: new Date()
      },
      { new: true }
    ).populate('bedId');
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Emit socket event
    req.io.emit('alert-acknowledged', alert);
    
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete alert
router.delete('/:id', async (req, res) => {
  try {
    const alert = await Alert.findByIdAndDelete(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    req.io.emit('alert-deleted', { id: req.params.id });
    
    res.json({ message: 'Alert deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get alert statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await Alert.countDocuments();
    const unacknowledged = await Alert.countDocuments({ acknowledged: false });
    const critical = await Alert.countDocuments({ type: 'critical', acknowledged: false });
    const warning = await Alert.countDocuments({ type: 'warning', acknowledged: false });
    
    const byType = await Alert.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      total,
      unacknowledged,
      critical,
      warning,
      byType
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;