const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Bed = require('../models/Bed');
const Alert = require('../models/Alert');

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Get all patients with role-based filtering
router.get('/', async (req, res) => {
  try {
    const { status, ward, department } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (department) query.department = department;
    
    // Exclude discharged patients by default
    if (!status || status !== 'discharged') {
      query.status = { $ne: 'discharged' };
    }
    
    let patientsQuery = Patient.find(query)
      .populate('bedId')
      .sort({ admissionDate: -1 });
    
    const patients = await patientsQuery;
    
    // Apply role-based filtering
    // Ward staff can see patients from all wards
    // ICU managers are restricted to their ward
    let filteredPatients = patients;
    if (req.user.role === 'icu_manager') {
      filteredPatients = patients.filter(p => p.bedId?.ward === req.user.ward);
    } else if (ward && ward !== 'All') {
      filteredPatients = patients.filter(p => p.bedId?.ward === ward);
    }
    
    res.json(filteredPatients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single patient
router.get('/:id', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('bedId');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Check role-based access
    // Ward staff can access patients in all wards
    // ICU managers are restricted to their ward
    if (req.user.role === 'icu_manager' && patient.bedId?.ward !== req.user.ward) {
      return res.status(403).json({ error: 'Access denied to this ward' });
    }
    
    res.json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admit patient
router.post('/', authorize('admin', 'icu_manager', 'er_staff'), async (req, res) => {
  try {
    const { 
      patientId, name, age, gender, contactNumber, emergencyContact,
      department, reasonForAdmission, estimatedStay, ward, equipmentType,
      status = 'admitted'
    } = req.body;
    
    // Validate required fields
    if (!name || !age || !gender) {
      return res.status(400).json({ error: 'Missing required fields: name, age, gender' });
    }
    
    // Check for duplicate patient ID
    if (patientId) {
      const existingPatient = await Patient.findOne({ patientId });
      if (existingPatient) {
        return res.status(400).json({ 
          error: 'Patient ID already exists',
          suggestion: 'Use a different patient ID or leave blank for auto-generation'
        });
      }
    }
    
    // Find available bed with ENHANCED MATCHING
    let availableBed = null;
    
    // Priority 1: Match both ward AND equipment
    if (ward && equipmentType) {
      availableBed = await Bed.findOne({ 
        status: 'available',
        ward,
        equipmentType
      }).sort({ lastUpdated: 1 });
    }
    
    // Priority 2: Match equipment only
    if (!availableBed && equipmentType) {
      availableBed = await Bed.findOne({ 
        status: 'available',
        equipmentType
      }).sort({ lastUpdated: 1 });
    }
    
    // Priority 3: Match ward only
    if (!availableBed && ward) {
      availableBed = await Bed.findOne({ 
        status: 'available',
        ward
      }).sort({ lastUpdated: 1 });
    }
    
    // Priority 4: Any available bed
    if (!availableBed) {
      availableBed = await Bed.findOne({ 
        status: 'available'
      }).sort({ lastUpdated: 1 });
    }
    
    if (!availableBed) {
      // Create critical alert
      await Alert.create({
        type: 'critical',
        message: `No beds available for admission: ${name} (Requested: Ward=${ward || 'Any'}, Equipment=${equipmentType || 'Any'})`,
        ward: ward || 'Any',
        priority: 5
      });
      
      const cleaningBeds = await Bed.find({ status: 'cleaning' })
        .sort({ lastCleaned: -1 })
        .limit(5);
      
      return res.status(400).json({ 
        error: 'No available beds',
        suggestion: 'Check other wards or expedite discharges',
        requested: {
          ward: ward || 'Any',
          equipmentType: equipmentType || 'Any'
        },
        alternatives: cleaningBeds
      });
    }
    
    // Calculate expected discharge
    const expectedDischarge = new Date();
    expectedDischarge.setHours(expectedDischarge.getHours() + (estimatedStay || 24));
    
    // Create patient
    const patient = new Patient({
      patientId: patientId || `PAT-${Date.now()}`,
      name,
      age,
      gender,
      contactNumber,
      emergencyContact,
      department: department || availableBed.ward,
      reasonForAdmission,
      estimatedStay,
      expectedDischarge,
      bedId: availableBed._id,
      status
    });
    
    await patient.save();
    
    // Update bed
    availableBed.status = 'occupied';
    availableBed.patientId = patient._id;
    availableBed.lastUpdated = Date.now();
    await availableBed.save();
    
    const populatedPatient = await Patient.findById(patient._id).populate('bedId');
    
    // Determine match level
    let matchMessage = 'Perfect match';
    if (availableBed.ward !== ward || availableBed.equipmentType !== equipmentType) {
      if (availableBed.equipmentType === equipmentType) {
        matchMessage = `Equipment match - assigned to ${availableBed.ward} instead of ${ward}`;
      } else if (availableBed.ward === ward) {
        matchMessage = `Ward match - ${availableBed.equipmentType} bed assigned`;
      } else {
        matchMessage = `Alternative bed assigned - ${availableBed.ward}, ${availableBed.equipmentType}`;
      }
    }
    
    // Create success alert
    await Alert.create({
      type: 'success',
      message: `Patient ${name} admitted to ${availableBed.bedNumber} in ${availableBed.ward}. ${matchMessage}`,
      ward: availableBed.ward,
      bedId: availableBed._id,
      priority: 2
    });
    
    // Emit socket events
    req.io.emit('patient-admitted', populatedPatient);
    req.io.emit('bed-updated', availableBed);
    req.io.to(`ward-${availableBed.ward}`).emit('ward-patient-admitted', populatedPatient);
    
    res.json({ 
      patient: populatedPatient, 
      bed: availableBed,
      matchLevel: matchMessage
    });
  } catch (error) {
    console.error('Error admitting patient:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update patient vitals
router.put('/:id/vitals', authorize('admin', 'icu_manager', 'ward_staff'), async (req, res) => {
  try {
    const { bloodPressure, heartRate, temperature, oxygenLevel } = req.body;
    
    const patient = await Patient.findById(req.params.id).populate('bedId');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Check role-based access
    // Ward staff can update vitals for patients in all wards
    // ICU managers are restricted to their ward
    if (req.user.role === 'icu_manager' && patient.bedId?.ward !== req.user.ward) {
      return res.status(403).json({ error: 'Access denied to this ward' });
    }
    
    patient.vitals.push({
      timestamp: new Date(),
      bloodPressure,
      heartRate,
      temperature,
      oxygenLevel
    });
    
    // Check for critical vitals
    if (oxygenLevel < 90 || heartRate > 120 || heartRate < 50 || temperature > 39) {
      await Alert.create({
        type: 'critical',
        message: `Critical vitals for ${patient.name}: O2=${oxygenLevel}%, HR=${heartRate}, Temp=${temperature}°C`,
        ward: patient.bedId?.ward,
        bedId: patient.bedId?._id,
        priority: 5
      });
      
      req.io.emit('critical-vitals', {
        patient: patient.name,
        vitals: { oxygenLevel, heartRate, temperature, bloodPressure },
        ward: patient.bedId?.ward
      });
    }
    
    await patient.save();
    
    req.io.emit('patient-vitals-updated', patient);
    
    res.json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transfer patient
router.post('/:id/transfer', authorize('admin', 'icu_manager', 'ward_staff'), async (req, res) => {
  try {
    const { toBedId, reason } = req.body;
    
    if (!toBedId) {
      return res.status(400).json({ error: 'Target bed ID is required' });
    }
    
    const patient = await Patient.findById(req.params.id).populate('bedId');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Check role-based access
    // Ward staff can transfer patients across all wards
    // ICU managers are restricted to their ward
    if (req.user.role === 'icu_manager' && patient.bedId?.ward !== req.user.ward) {
      return res.status(403).json({ error: 'Access denied to this ward' });
    }
    
    const oldBed = await Bed.findById(patient.bedId);
    const newBed = await Bed.findById(toBedId);
    
    if (!newBed || newBed.status !== 'available') {
      return res.status(400).json({ error: 'Target bed not available' });
    }
    
    // Update transfer history
    patient.transferHistory.push({
      fromBed: oldBed.bedNumber,
      toBed: newBed.bedNumber,
      timestamp: new Date(),
      reason: reason || 'Transfer requested'
    });
    
    patient.bedId = newBed._id;
    await patient.save();
    
    // Update beds
    oldBed.status = 'cleaning';
    oldBed.patientId = null;
    oldBed.lastUpdated = Date.now();
    await oldBed.save();
    
    newBed.status = 'occupied';
    newBed.patientId = patient._id;
    newBed.lastUpdated = Date.now();
    await newBed.save();
    
    // Create alert
    await Alert.create({
      type: 'info',
      message: `Patient ${patient.name} transferred from ${oldBed.bedNumber} to ${newBed.bedNumber}`,
      ward: newBed.ward,
      bedId: newBed._id,
      priority: 2
    });
    
    // Emit socket events
    req.io.emit('patient-transferred', { patient, oldBed, newBed });
    req.io.emit('bed-updated', oldBed);
    req.io.emit('bed-updated', newBed);
    
    res.json({ patient, oldBed, newBed });
  } catch (error) {
    console.error('Error transferring patient:', error);
    res.status(500).json({ error: error.message });
  }
});

// Discharge patient
router.delete('/:id', authorize('admin', 'icu_manager', 'ward_staff'), async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('bedId');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Check role-based access
    // Ward staff can discharge patients from all wards
    // ICU managers are restricted to their ward
    if (req.user.role === 'icu_manager' && patient.bedId?.ward !== req.user.ward) {
      return res.status(403).json({ error: 'Access denied to this ward' });
    }
    
    // Update bed status
    const bed = await Bed.findById(patient.bedId);
    if (bed) {
      bed.status = 'cleaning';
      bed.patientId = null;
      bed.lastUpdated = Date.now();
      await bed.save();
    }
    
    // Mark patient as discharged
    patient.status = 'discharged';
    patient.actualDischarge = new Date();
    await patient.save();
    
    // Create alert
    await Alert.create({
      type: 'success',
      message: `Patient ${patient.name} discharged from ${bed?.bedNumber}`,
      ward: bed?.ward,
      bedId: bed?._id,
      priority: 2
    });
    
    // Emit socket events
    req.io.emit('patient-discharged', { patient, bed });
    req.io.emit('bed-updated', bed);
    
    res.json({ 
      message: 'Patient discharged successfully',
      patient,
      bed 
    });
  } catch (error) {
    console.error('Error discharging patient:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get expected discharges
router.get('/discharges/upcoming', async (req, res) => {
  try {
    const { hours = 12 } = req.query;
    const futureTime = new Date();
    futureTime.setHours(futureTime.getHours() + parseInt(hours));
    
    let upcomingDischarges = await Patient.find({
      status: { $ne: 'discharged' },
      expectedDischarge: { $lte: futureTime, $gte: new Date() }
    })
    .populate('bedId')
    .sort({ expectedDischarge: 1 });
    
    // Apply role-based filtering
    // Ward staff can see upcoming discharges from all wards
    // ICU managers are restricted to their ward
    if (req.user.role === 'icu_manager') {
      upcomingDischarges = upcomingDischarges.filter(p => p.bedId?.ward === req.user.ward);
    }
    
    res.json(upcomingDischarges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;