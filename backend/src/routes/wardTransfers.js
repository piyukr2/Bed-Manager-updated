const express = require('express');
const router = express.Router();
const WardTransfer = require('../models/WardTransfer');
const Bed = require('../models/Bed');
const Patient = require('../models/Patient');

// Create a new ward transfer request
router.post('/', async (req, res) => {
  try {
    const { bedId, patientId, currentWard, targetWard, reason, requestedBy } = req.body;

    // Validate required input
    if (!bedId || !patientId || !currentWard || !targetWard || !requestedBy) {
      return res.status(400).json({ error: 'Required fields: bedId, patientId, currentWard, targetWard, requestedBy' });
    }

    // Check if target ward is Emergency (not allowed)
    if (targetWard.toLowerCase() === 'emergency') {
      return res.status(400).json({ error: 'Patients CANNOT be transferred TO Emergency ward' });
    }

    // Check if current and target wards are different
    if (currentWard === targetWard) {
      return res.status(400).json({ error: 'Target ward must be different from current ward' });
    }

    // Verify bed and patient exist
    const bed = await Bed.findById(bedId).populate('patientId');
    if (!bed) {
      return res.status(404).json({ error: 'Bed not found' });
    }

    if (!bed.patientId || bed.patientId._id.toString() !== patientId) {
      return res.status(400).json({ error: 'Patient not found in the specified bed' });
    }

    // Check if there's already a pending transfer for this patient
    const existingTransfer = await WardTransfer.findOne({
      patientId: patientId,
      status: 'pending'
    });

    if (existingTransfer) {
      return res.status(400).json({ error: 'A transfer request for this patient is already pending' });
    }

    // Create the transfer request
    const wardTransfer = new WardTransfer({
      bedId,
      patientId,
      currentWard,
      targetWard,
      reason,
      requestedBy
    });

    await wardTransfer.save();

    // Populate the response with patient and requestor details
    await wardTransfer.populate('patientId', 'name mrn');
    await wardTransfer.populate('requestedBy', 'name role');

    // Emit socket event for new ward transfer request
    if (req.io) {
      req.io.emit('new-ward-transfer', wardTransfer);
    }

    res.status(201).json(wardTransfer);
  } catch (error) {
    console.error('Error creating ward transfer request:', error);
    res.status(500).json({ error: 'Failed to create transfer request' });
  }
});

// Get all ward transfer requests with optional filtering
router.get('/', async (req, res) => {
  try {
    const { status, currentWard, targetWard, limit = 50 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (currentWard) filter.currentWard = currentWard;
    if (targetWard) filter.targetWard = targetWard;

    const transfers = await WardTransfer.find(filter)
      .populate('patientId', 'name mrn')
      .populate('requestedBy', 'name role')
      .populate('reviewedBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(transfers);
  } catch (error) {
    console.error('Error fetching ward transfer requests:', error);
    res.status(500).json({ error: 'Failed to fetch transfer requests' });
  }
});

// Get a specific ward transfer request
router.get('/:id', async (req, res) => {
  try {
    const transfer = await WardTransfer.findById(req.params.id)
      .populate('patientId', 'name mrn')
      .populate('bedId', 'bedNumber ward')
      .populate('requestedBy', 'name role')
      .populate('reviewedBy', 'name role');

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    res.json(transfer);
  } catch (error) {
    console.error('Error fetching ward transfer request:', error);
    res.status(500).json({ error: 'Failed to fetch transfer request' });
  }
});

// Approve a ward transfer request
router.post('/:id/approve', async (req, res) => {
  try {
    const { reviewedBy, notes } = req.body;

    const transfer = await WardTransfer.findById(req.params.id)
      .populate('patientId')
      .populate('bedId');

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: 'Transfer request has already been processed' });
    }

    // Helper function to get default equipment types for each ward
    const getWardDefaultEquipment = (ward) => {
      const equipmentMap = {
        'ICU': ['ICU Monitor', 'Ventilator'],
        'General Ward': ['Standard'],
        'Cardiology': ['Cardiac Monitor', 'VAD'],
        'Emergency': ['Standard', 'Ventilator']
      };
      return equipmentMap[ward] || [];
    };

    // Find an available bed in the target ward with default equipment for that ward
    const currentBed = transfer.bedId;
    const targetWardEquipment = getWardDefaultEquipment(transfer.targetWard);
    
    const targetBed = await Bed.findOne({
      ward: transfer.targetWard,
      status: 'available',
      equipmentType: { $in: targetWardEquipment }
    }).sort({ 'location.floor': 1, 'location.section': 1 });

    if (!targetBed) {
      return res.status(400).json({ 
        error: `No available beds with appropriate equipment (${targetWardEquipment.join(' or ')}) in ${transfer.targetWard} ward` 
      });
    }

    // Perform the actual transfer - IMMEDIATE EXECUTION
    const patient = transfer.patientId;

    // Release the current bed (mark as cleaning immediately)
    currentBed.status = 'cleaning';
    currentBed.patientId = null;
    currentBed.notes = `Patient transferred to ${transfer.targetWard} - ${targetBed.bedNumber}`;
    await currentBed.save();

    // Assign patient to new bed (mark as occupied immediately)
    targetBed.status = 'occupied';
    targetBed.patientId = patient._id;
    targetBed.notes = `Patient transferred from ${transfer.currentWard} - ${currentBed.bedNumber}`;
    await targetBed.save();

    // Update patient record
    patient.bedId = targetBed._id;
    await patient.save();

    // Update transfer status to 'completed' (since transfer happens immediately)
    transfer.status = 'completed';
    transfer.reviewedBy = reviewedBy;
    transfer.reviewedAt = new Date();
    transfer.newBedId = targetBed._id;
    transfer.completedAt = new Date();
    if (notes) transfer.notes = notes;

    await transfer.save();

    // Emit socket events for real-time updates
    if (req.io) {
      // Notify about the transfer completion (immediate)
      req.io.emit('ward-transfer-updated', {
        action: 'completed',
        transfer: transfer
      });

      // Notify specifically about approval with complete details
      req.io.emit('ward-transfer-approved', {
        transfer: transfer,
        newBed: targetBed,
        oldBed: currentBed
      });

      // Notify about bed updates (both old and new)
      req.io.emit('bed-updated', currentBed);
      req.io.emit('bed-updated', targetBed);

      // Notify about patient transfer (immediate)
      req.io.emit('patient-transferred', {
        patient: patient,
        fromBed: currentBed,
        toBed: targetBed,
        fromWard: transfer.currentWard,
        toWard: transfer.targetWard
      });
    }

    res.json({ 
      message: 'Transfer approved and completed successfully. Patient immediately transferred to new bed.', 
      transfer,
      newBed: targetBed,
      oldBed: currentBed
    });
  } catch (error) {
    console.error('Error approving ward transfer request:', error);
    res.status(500).json({ error: 'Failed to approve transfer request' });
  }
});

// Deny a ward transfer request
router.post('/:id/deny', async (req, res) => {
  try {
    const { reason, reviewedBy } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason for denial is required' });
    }

    const transfer = await WardTransfer.findById(req.params.id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: 'Transfer request has already been processed' });
    }

    // Update transfer status
    transfer.status = 'denied';
    transfer.denyReason = reason;
    transfer.reviewedBy = reviewedBy;
    transfer.reviewedAt = new Date();

    await transfer.save();

    // Emit socket event for denied transfer
    if (req.io) {
      req.io.emit('ward-transfer-updated', {
        action: 'denied',
        transfer: transfer
      });

      // Notify specifically about denial
      req.io.emit('ward-transfer-denied', {
        transfer: transfer
      });
    }

    res.json({ message: 'Transfer request denied successfully', transfer });
  } catch (error) {
    console.error('Error denying ward transfer request:', error);
    res.status(500).json({ error: 'Failed to deny transfer request' });
  }
});

// Update a ward transfer request (for additional details)
router.put('/:id', async (req, res) => {
  try {
    const { reason, notes } = req.body;

    const transfer = await WardTransfer.findById(req.params.id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot modify processed transfer request' });
    }

    // Update allowed fields
    if (reason) transfer.reason = reason;
    if (notes) transfer.notes = notes;

    await transfer.save();

    res.json(transfer);
  } catch (error) {
    console.error('Error updating ward transfer request:', error);
    res.status(500).json({ error: 'Failed to update transfer request' });
  }
});

// Delete a ward transfer request (only if pending)
router.delete('/:id', async (req, res) => {
  try {
    const transfer = await WardTransfer.findById(req.params.id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot delete processed transfer request' });
    }

    await WardTransfer.findByIdAndDelete(req.params.id);

    res.json({ message: 'Transfer request deleted successfully' });
  } catch (error) {
    console.error('Error deleting ward transfer request:', error);
    res.status(500).json({ error: 'Failed to delete transfer request' });
  }
});

module.exports = router;