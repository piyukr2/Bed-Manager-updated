const express = require('express');
const router = express.Router();
const CleaningJob = require('../models/CleaningJob');
const CleaningStaff = require('../models/CleaningStaff');
const Bed = require('../models/Bed');

// Get all cleaning jobs with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, floor, ward } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (floor !== undefined) filter.floor = parseInt(floor);
    if (ward) filter.ward = ward;

    const jobs = await CleaningJob.find(filter)
      .populate('assignedTo', 'name staffId status')
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get job statistics (floor-wise and ward-wise counts)
router.get('/stats', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const floorStats = await CleaningJob.aggregate([
      { $match: filter },
      { $group: { _id: '$floor', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const wardStats = await CleaningJob.aggregate([
      { $match: filter },
      { $group: { _id: '$ward', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      byFloor: floorStats.map(stat => ({ floor: stat._id, count: stat.count })),
      byWard: wardStats.map(stat => ({ ward: stat._id, count: stat.count }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new cleaning job (usually called automatically when bed status changes)
router.post('/', async (req, res) => {
  try {
    const { bedId, bedNumber, ward, floor, section, roomNumber } = req.body;

    const job = new CleaningJob({
      bedId,
      bedNumber,
      ward,
      floor,
      section,
      roomNumber,
      status: 'pending'
    });

    await job.save();

    // Emit socket event for real-time notification
    req.app.get('io').emit('new-cleaning-job', job);

    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a cleaning job
router.patch('/:id/start', async (req, res) => {
  try {
    const job = await CleaningJob.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'pending') {
      return res.status(400).json({ error: 'Job is not in pending status' });
    }

    job.status = 'active';
    job.startedAt = new Date();
    await job.save();

    // Emit socket event
    req.app.get('io').emit('jobStarted', job);

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign a cleaning job to staff
router.patch('/:id/assign', async (req, res) => {
  try {
    const { staffId } = req.body;
    console.log('🔄 Assigning job:', req.params.id, 'to staff:', staffId);
    
    const job = await CleaningJob.findById(req.params.id);
    if (!job) {
      console.log('❌ Job not found:', req.params.id);
      return res.status(404).json({ error: 'Job not found' });
    }

    const staff = await CleaningStaff.findById(staffId);
    if (!staff) {
      console.log('❌ Staff not found:', staffId);
      return res.status(404).json({ error: 'Staff not found' });
    }

    console.log('✅ Found job and staff, updating...');

    // Update previous staff if exists
    if (job.assignedTo) {
      const prevStaff = await CleaningStaff.findById(job.assignedTo);
      if (prevStaff) {
        prevStaff.activeJobsCount = Math.max(0, prevStaff.activeJobsCount - 1);
        if (prevStaff.activeJobsCount === 0) {
          prevStaff.status = 'available';
        }
        await prevStaff.save();
      }
    }

    // Assign to new staff
    job.assignedTo = staff._id;
    job.assignedToName = staff.name;
    await job.save();

    // Update staff status
    staff.activeJobsCount += 1;
    staff.status = 'busy';
    await staff.save();

    const populatedJob = await CleaningJob.findById(job._id)
      .populate('assignedTo', 'name staffId status');

    console.log('✅ Job assigned successfully');
    // Emit socket event
    req.app.get('io').emit('jobAssigned', populatedJob);

    res.json(populatedJob);
  } catch (error) {
    console.error('❌ Error assigning staff:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete a cleaning job
router.patch('/:id/complete', async (req, res) => {
  try {
    const job = await CleaningJob.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'active') {
      return res.status(400).json({ error: 'Job is not in active status' });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();

    // Update staff status
    if (job.assignedTo) {
      const staff = await CleaningStaff.findById(job.assignedTo);
      if (staff) {
        staff.activeJobsCount = Math.max(0, staff.activeJobsCount - 1);
        staff.totalJobsCompleted += 1;
        if (staff.activeJobsCount === 0) {
          staff.status = 'available';
        }
        await staff.save();
      }
    }

    // Update bed status to available
    await Bed.findByIdAndUpdate(job.bedId, {
      status: 'available',
      lastCleaned: new Date()
    });

    // Emit socket events
    req.app.get('io').emit('jobCompleted', job);
    req.app.get('io').emit('bedUpdate', await Bed.findById(job.bedId));

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a job (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const job = await CleaningJob.findByIdAndDelete(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update staff if job was assigned
    if (job.assignedTo && job.status === 'active') {
      const staff = await CleaningStaff.findById(job.assignedTo);
      if (staff) {
        staff.activeJobsCount = Math.max(0, staff.activeJobsCount - 1);
        if (staff.activeJobsCount === 0) {
          staff.status = 'available';
        }
        await staff.save();
      }
    }

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
