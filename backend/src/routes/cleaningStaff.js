const express = require('express');
const router = express.Router();
const CleaningStaff = require('../models/CleaningStaff');

// Get all cleaning staff
router.get('/', async (req, res) => {
  try {
    const staff = await CleaningStaff.find().sort({ staffId: 1 });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single staff member
router.get('/:id', async (req, res) => {
  try {
    const staff = await CleaningStaff.findById(req.params.id);
    
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new staff member
router.post('/', async (req, res) => {
  try {
    const { staffId, name } = req.body;

    const existingStaff = await CleaningStaff.findOne({ staffId });
    if (existingStaff) {
      return res.status(400).json({ error: 'Staff ID already exists' });
    }

    const staff = new CleaningStaff({
      staffId,
      name,
      status: 'available',
      activeJobsCount: 0
    });

    await staff.save();
    res.status(201).json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update staff member
router.patch('/:id', async (req, res) => {
  try {
    const { name, status } = req.body;
    const updates = {};
    
    if (name) updates.name = name;
    if (status) updates.status = status;

    const staff = await CleaningStaff.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete staff member
router.delete('/:id', async (req, res) => {
  try {
    const staff = await CleaningStaff.findByIdAndDelete(req.params.id);
    
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    res.json({ message: 'Staff deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
