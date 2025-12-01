const express = require('express');
const router = express.Router();
const BedRequest = require('../models/BedRequest');
const Bed = require('../models/Bed');
const Patient = require('../models/Patient');
const Alert = require('../models/Alert');

const ALLOWED_STATUSES = ['pending', 'approved', 'denied'];

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Create a new bed request (ER Staff)
router.post('/', authorize('er_staff', 'admin'), async (req, res) => {
  try {
    const { patientDetails, preferredWard, eta } = req.body;

    // Validate required fields
    if (!patientDetails || !patientDetails.name) {
      return res.status(400).json({ error: 'Patient details with name are required' });
    }

    const bedRequest = new BedRequest({
      createdBy: {
        userId: req.user.id,
        username: req.user.username,
        name: req.user.name
      },
      patientDetails,
      preferredWard,
      eta: eta || new Date(Date.now() + 30 * 60 * 1000), // Default 30 minutes
      status: 'pending'
    });

    await bedRequest.save();

    // Emit socket event for new request
    req.io.emit('new-bed-request', bedRequest);

    // Create alert for ICU managers
    await Alert.create({
      type: 'info',
      message: `New bed request from ${req.user.name} (${bedRequest.requestId})`,
      priority: bedRequest.priority,
      ward: preferredWard || 'All'
    });

    res.status(201).json({
      message: 'Bed request created successfully',
      request: bedRequest
    });
  } catch (error) {
    console.error('Error creating bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all bed requests with filtering
router.get('/', async (req, res) => {
  try {
    const { status, createdBy, ward } = req.query;
    const query = { isDeleted: { $ne: true } }; // Exclude soft-deleted records

    // Role-based filtering
    if (req.user.role === 'er_staff') {
      // ER staff can only see their own requests
      query['createdBy.userId'] = req.user.id;
    } else if (req.user.role === 'icu_manager') {
      // ICU managers see all pending requests and requests for their ward
      if (req.user.ward) {
        query.$or = [
          { preferredWard: req.user.ward },
          { 'assignedBed.ward': req.user.ward },
          { status: 'pending' }
        ];
      }
    } else if (req.user.role === 'ward_staff') {
      // Ward staff only see requests for their specific ward
      if (req.user.ward) {
        query.$or = [
          { preferredWard: req.user.ward },
          { 'assignedBed.ward': req.user.ward }
        ];
      }
    }
    // Admin sees all

    // Apply query filters
  if (status) query.status = status;
    if (createdBy) query['createdBy.username'] = createdBy;
    if (ward) query.preferredWard = ward;

    const requests = await BedRequest.find(query)
      .populate('assignedBed.bedId')
      .sort({ priority: -1, createdAt: -1 })
      .limit(100);

    res.json(requests);
  } catch (error) {
    console.error('Error fetching bed requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get request statistics
router.get('/stats', async (req, res) => {
  try {
    const query = { isDeleted: { $ne: true } }; // Exclude soft-deleted records

    // Role-based filtering
    if (req.user.role === 'er_staff') {
      query['createdBy.userId'] = req.user.id;
    } else if (req.user.role === 'icu_manager' && req.user.ward) {
      query.$or = [
        { preferredWard: req.user.ward },
        { 'assignedBed.ward': req.user.ward }
      ];
    }

  const total = await BedRequest.countDocuments(query);
  const pending = await BedRequest.countDocuments({ ...query, status: 'pending' });
  const approved = await BedRequest.countDocuments({ ...query, status: 'approved' });
  const denied = await BedRequest.countDocuments({ ...query, status: 'denied' });

    // Ward-wise breakdown for ER staff
    const wardStats = await BedRequest.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$preferredWard',
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          denied: {
            $sum: { $cond: [{ $eq: ['$status', 'denied'] }, 1, 0] }
          }
        }
      }
    ]);

    // Convert wardStats array to an object for easier frontend access
    const byWard = {};
    wardStats.forEach(ward => {
      byWard[ward._id] = {
        total: ward.total,
        pending: ward.pending,
        approved: ward.approved,
        denied: ward.denied
      };
    });

    res.json({
      total,
      pending,
      approved,
      denied,
      byWard
    });
  } catch (error) {
    console.error('Error fetching request stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single bed request
router.get('/:id', async (req, res) => {
  try {
    const request = await BedRequest.findById(req.params.id)
      .populate('assignedBed.bedId')
      .populate('createdBy.userId')
      .populate('reviewedBy.userId');

    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    // Check access permissions
    if (req.user.role === 'er_staff' && request.createdBy?.userId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this request' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve and assign bed (ICU Manager)
router.post('/:id/approve', authorize('icu_manager', 'admin'), async (req, res) => {
  try {
    const { bedId } = req.body;

    const request = await BedRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve request with status: ${request.status}` });
    }

    // Verify bed exists and is available
    const bed = await Bed.findById(bedId);
    if (!bed) {
      return res.status(404).json({ error: 'Bed not found' });
    }

    if (bed.status !== 'available') {
      return res.status(400).json({ error: `Bed ${bed.bedNumber} is not available (current status: ${bed.status})` });
    }

    // Bed Manager (icu_manager) can assign beds from any ward - no ward restriction
    // They manage all hospital wards and bed allocation

    // Reserve the bed
    bed.status = 'reserved';
    bed.notes = `Reserved for request ${request.requestId}`;
    await bed.save();

    // Update request
    request.status = 'approved';
    request.assignedBed = {
      bedId: bed._id,
      bedNumber: bed.bedNumber,
      ward: bed.ward
    };
    request.reviewedBy = {
      userId: req.user.id,
      username: req.user.username,
      name: req.user.name,
      reviewedAt: new Date()
    };
    await request.save();

    // Emit socket events
    req.io.emit('bed-request-approved', request);
    req.io.emit('bed-updated', bed);

    // Create alert
    await Alert.create({
      type: 'success',
      message: `Bed request ${request.requestId} approved. Bed ${bed.bedNumber} reserved for ${request.patientDetails.name}`,
      priority: 3,
      ward: bed.ward
    });

    res.json({
      message: 'Bed request approved successfully',
      request,
      bed
    });
  } catch (error) {
    console.error('Error approving bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deny bed request (ICU Manager)
router.post('/:id/deny', authorize('icu_manager', 'admin'), async (req, res) => {
  try {
    const { reason } = req.body;

    const request = await BedRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot deny request with status: ${request.status}` });
    }

    request.status = 'denied';
    request.denialReason = reason || 'No available beds matching criteria';
    request.reviewedBy = {
      userId: req.user.id,
      username: req.user.username,
      name: req.user.name,
      reviewedAt: new Date()
    };

    await request.save();

    // Emit socket event
    req.io.emit('bed-request-denied', request);

    // Create alert
    await Alert.create({
      type: 'warning',
      message: `Bed request ${request.requestId} denied: ${reason}`,
      priority: 3,
      ward: request.preferredWard || 'All'
    });

    res.json({
      message: 'Bed request denied',
      request
    });
  } catch (error) {
    console.error('Error denying bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fulfill bed request (create patient and admit)
router.post('/:id/fulfill', authorize('icu_manager', 'ward_staff', 'admin'), async (req, res) => {
  try {
    const request = await BedRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ error: `Cannot fulfill request with status: ${request.status}` });
    }

    if (!request.assignedBed || !request.assignedBed.bedId) {
      return res.status(400).json({ error: 'No bed assigned to this request' });
    }

    // Get the bed
    const bed = await Bed.findById(request.assignedBed.bedId);
    if (!bed) {
      return res.status(404).json({ error: 'Assigned bed not found' });
    }

    // Generate patient ID
    const patientCount = await Patient.countDocuments();
    const patientId = `PAT-${String(patientCount + 1).padStart(6, '0')}`;

    // Create patient
    const patient = await Patient.create({
      patientId,
      name: request.patientDetails.name,
      age: request.patientDetails.age,
      gender: request.patientDetails.gender,
      contactNumber: request.patientDetails.contactNumber,
      department: bed.ward,
      reasonForAdmission: request.patientDetails.reasonForAdmission,
      estimatedStay: request.patientDetails.estimatedStay || 24,
      admissionDate: new Date(),
      bedId: bed._id,
      status: 'admitted'
    });

    // Update bed status
    bed.status = 'occupied';
    bed.patientId = patient._id;
    bed.notes = `Admitted from request ${request.requestId}`;
    await bed.save();

    // Update request
    request.fulfilledAt = new Date();
    await request.save();

  // Emit socket events
  req.io.emit('patient-admitted', patient);
  req.io.emit('bed-updated', bed);

    // Create alert
    await Alert.create({
      type: 'success',
      message: `Patient ${patient.name} admitted to bed ${bed.bedNumber} (Request ${request.requestId} approved)`,
      priority: 2,
      ward: bed.ward
    });

    res.json({
      message: 'Patient admitted successfully',
      request,
      patient,
      bed
    });
  } catch (error) {
    console.error('Error fulfilling bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel bed request
router.post('/:id/cancel', authorize('er_staff', 'icu_manager', 'admin'), async (req, res) => {
  try {
    const { reason } = req.body;

    const request = await BedRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    // ER staff can only cancel their own requests
    if (req.user.role === 'er_staff' && request.createdBy?.userId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Can only cancel your own requests' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel request with status: ${request.status}` });
    }

    // If bed was assigned, make it available again
    if (request.assignedBed && request.assignedBed.bedId) {
      const bed = await Bed.findById(request.assignedBed.bedId);
      if (bed && bed.status === 'reserved') {
        bed.status = 'available';
        bed.notes = 'Reservation cancelled';
        await bed.save();
        req.io.emit('bed-updated', bed);
      }
    }

    request.status = 'denied';
    request.cancelledAt = new Date();
    request.cancelledBy = {
      userId: req.user.id,
      name: req.user.name,
      reason: reason || 'Cancelled by user'
    };
    request.denialReason = reason || 'Cancelled by user';
    request.reviewedBy = {
      userId: req.user.id,
      username: req.user.username,
      name: req.user.name,
      reviewedAt: new Date()
    };

    await request.save();

    // Emit socket event
    req.io.emit('bed-request-denied', request);

    await Alert.create({
      type: 'warning',
      message: `Bed request ${request.requestId} cancelled by ${req.user.name}`,
      priority: 2,
      ward: request.preferredWard || 'All'
    });

    res.json({
      message: 'Bed request cancelled',
      request
    });
  } catch (error) {
    console.error('Error cancelling bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update bed request (limited fields)
router.put('/:id', async (req, res) => {
  try {
    const { eta } = req.body;

    const request = await BedRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    // ER staff can only update their own requests
    if (req.user.role === 'er_staff' && request.createdBy?.userId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Can only update your own requests' });
    }

    if (eta) request.eta = eta;

    await request.save();

    res.json({
      message: 'Bed request updated',
      request
    });
  } catch (error) {
    console.error('Error updating bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Soft delete bed request (marks as deleted, keeps in DB for audit)
router.delete('/:id', authorize('er_staff', 'admin'), async (req, res) => {
  try {
    const request = await BedRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: 'Bed request not found' });
    }

    // ER staff can only delete their own requests
    if (req.user.role === 'er_staff' && request.createdBy?.userId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Can only delete your own requests' });
    }

    // Prevent deletion of active requests (must cancel first)
    if (['pending', 'approved'].includes(request.status)) {
      return res.status(400).json({ 
        error: 'Cannot delete active requests. Please cancel the request first.' 
      });
    }

    // Soft delete
    request.isDeleted = true;
    request.deletedAt = new Date();
    request.deletedBy = {
      userId: req.user.id,
      name: req.user.name
    };

    await request.save();

    // Emit socket event to all clients
    req.io.emit('bed-request-deleted', {
      requestId: request._id,
      deletedBy: req.user.name
    });

    res.json({
      message: 'Bed request removed successfully',
      requestId: request._id
    });
  } catch (error) {
    console.error('Error deleting bed request:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
