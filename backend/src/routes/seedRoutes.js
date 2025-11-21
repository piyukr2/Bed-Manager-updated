/**
 * Seed Data Import Routes
 * Handles importing historical data from JSON seed files
 */

const express = require('express');
const router = express.Router();

// Import models - these will be passed via middleware
let Bed, Patient, OccupancyHistory, Alert, CleaningJob, CleaningStaff;

// Middleware to inject models
const initializeModels = (models) => {
  Bed = models.Bed;
  Patient = models.Patient;
  OccupancyHistory = models.OccupancyHistory;
  Alert = models.Alert;
  CleaningJob = models.CleaningJob;
  CleaningStaff = models.CleaningStaff;
};

/**
 * POST /api/seed/import
 * Import seed data from JSON (merge mode - skip duplicates)
 */
router.post('/import', async (req, res) => {
  try {
    const seedData = req.body;

    if (!seedData || !seedData.metadata) {
      return res.status(400).json({ error: 'Invalid seed data format. Missing metadata.' });
    }

    const results = {
      beds: { imported: 0, skipped: 0, errors: 0 },
      patients: { imported: 0, skipped: 0, errors: 0 },
      occupancyHistory: { imported: 0, skipped: 0, errors: 0 },
      alerts: { imported: 0, skipped: 0, errors: 0 },
      cleaningJobs: { imported: 0, skipped: 0, errors: 0 },
      cleaningStaff: { imported: 0, skipped: 0, errors: 0 }
    };

    // 1. Import Beds
    if (seedData.beds && Array.isArray(seedData.beds)) {
      for (const bedData of seedData.beds) {
        try {
          const existingBed = await Bed.findOne({ bedNumber: bedData.bedNumber });
          if (existingBed) {
            results.beds.skipped++;
          } else {
            const bed = new Bed({
              bedNumber: bedData.bedNumber,
              ward: bedData.ward,
              status: bedData.status || 'available',
              equipmentType: bedData.equipmentType || 'Standard',
              location: bedData.location,
              lastCleaned: bedData.lastCleaned ? new Date(bedData.lastCleaned) : new Date(),
              lastUpdated: new Date(),
              notes: bedData.notes || '',
              maintenanceSchedule: bedData.maintenanceSchedule
            });
            await bed.save();
            results.beds.imported++;
          }
        } catch (error) {
          console.error(`Error importing bed ${bedData.bedNumber}:`, error.message);
          results.beds.errors++;
        }
      }
    }

    // Build bed lookup map for patient assignment
    const bedLookup = {};
    const allBeds = await Bed.find({});
    allBeds.forEach(bed => {
      bedLookup[bed.bedNumber] = bed._id;
    });

    // 2. Import Patients
    if (seedData.patients && Array.isArray(seedData.patients)) {
      for (const patientData of seedData.patients) {
        try {
          const existingPatient = await Patient.findOne({ patientId: patientData.patientId });
          if (existingPatient) {
            results.patients.skipped++;
          } else {
            // Find bed if assigned
            let bedId = null;
            if (patientData.assignedBedNumber && bedLookup[patientData.assignedBedNumber]) {
              bedId = bedLookup[patientData.assignedBedNumber];

              // Update bed status if patient is not discharged
              if (patientData.status !== 'discharged') {
                await Bed.findByIdAndUpdate(bedId, {
                  status: 'occupied',
                  lastUpdated: new Date()
                });
              }
            }

            const patient = new Patient({
              patientId: patientData.patientId,
              name: patientData.name,
              age: patientData.age,
              gender: patientData.gender,
              contactNumber: patientData.contactNumber,
              emergencyContact: patientData.emergencyContact,
              department: patientData.department,
              reasonForAdmission: patientData.reasonForAdmission,
              estimatedStay: patientData.estimatedStay,
              admissionDate: patientData.admissionDate ? new Date(patientData.admissionDate) : new Date(),
              expectedDischarge: patientData.expectedDischarge ? new Date(patientData.expectedDischarge) : null,
              actualDischarge: patientData.actualDischarge ? new Date(patientData.actualDischarge) : null,
              bedId: bedId,
              vitals: patientData.vitals || [],
              medications: patientData.medications || [],
              status: patientData.status || 'admitted',
              transferHistory: patientData.transferHistory || []
            });
            await patient.save();

            // Update bed with patient reference
            if (bedId && patientData.status !== 'discharged') {
              await Bed.findByIdAndUpdate(bedId, { patientId: patient._id });
            }

            results.patients.imported++;
          }
        } catch (error) {
          console.error(`Error importing patient ${patientData.patientId}:`, error.message);
          results.patients.errors++;
        }
      }
    }

    // 3. Import Occupancy History
    if (seedData.occupancyHistory && Array.isArray(seedData.occupancyHistory)) {
      for (const historyData of seedData.occupancyHistory) {
        try {
          const timestamp = new Date(historyData.timestamp);
          // Check for existing record on the same day
          const startOfDay = new Date(timestamp);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(timestamp);
          endOfDay.setHours(23, 59, 59, 999);

          const existing = await OccupancyHistory.findOne({
            timestamp: { $gte: startOfDay, $lte: endOfDay }
          });

          if (existing) {
            results.occupancyHistory.skipped++;
          } else {
            const history = new OccupancyHistory({
              timestamp: timestamp,
              totalBeds: historyData.totalBeds,
              occupied: historyData.occupied,
              available: historyData.available,
              cleaning: historyData.cleaning,
              reserved: historyData.reserved,
              maintenance: historyData.maintenance || 0,
              occupancyRate: historyData.occupancyRate,
              wardStats: historyData.wardStats,
              peakHour: historyData.peakHour
            });
            await history.save();
            results.occupancyHistory.imported++;
          }
        } catch (error) {
          console.error(`Error importing occupancy history:`, error.message);
          results.occupancyHistory.errors++;
        }
      }
    }

    // 4. Import Alerts (only recent ones, skip acknowledged old ones)
    if (seedData.alerts && Array.isArray(seedData.alerts)) {
      const recentAlerts = seedData.alerts.filter(alert => {
        const createdAt = new Date(alert.createdAt);
        const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreation <= 7; // Only import alerts from last 7 days
      });

      for (const alertData of recentAlerts) {
        try {
          // Check for duplicate based on message and timestamp
          const existingAlert = await Alert.findOne({
            message: alertData.message,
            createdAt: new Date(alertData.createdAt)
          });

          if (existingAlert) {
            results.alerts.skipped++;
          } else {
            const alert = new Alert({
              type: alertData.type,
              message: alertData.message,
              ward: alertData.ward,
              acknowledged: alertData.acknowledged,
              acknowledgedBy: alertData.acknowledgedBy,
              acknowledgedAt: alertData.acknowledgedAt ? new Date(alertData.acknowledgedAt) : null,
              priority: alertData.priority,
              createdAt: new Date(alertData.createdAt)
            });
            await alert.save();
            results.alerts.imported++;
          }
        } catch (error) {
          console.error(`Error importing alert:`, error.message);
          results.alerts.errors++;
        }
      }
    }

    // 5. Import Cleaning Staff
    if (seedData.cleaningStaff && Array.isArray(seedData.cleaningStaff)) {
      for (const staffData of seedData.cleaningStaff) {
        try {
          const existingStaff = await CleaningStaff.findOne({ staffId: staffData.staffId });
          if (existingStaff) {
            results.cleaningStaff.skipped++;
          } else {
            const staff = new CleaningStaff({
              staffId: staffData.staffId,
              name: staffData.name,
              status: staffData.status || 'available',
              activeJobsCount: staffData.activeJobsCount || 0,
              totalJobsCompleted: staffData.totalJobsCompleted || 0,
              createdAt: staffData.createdAt ? new Date(staffData.createdAt) : new Date()
            });
            await staff.save();
            results.cleaningStaff.imported++;
          }
        } catch (error) {
          console.error(`Error importing cleaning staff ${staffData.staffId}:`, error.message);
          results.cleaningStaff.errors++;
        }
      }
    }

    // Build staff lookup for cleaning jobs
    const staffLookup = {};
    const allStaff = await CleaningStaff.find({});
    allStaff.forEach(staff => {
      staffLookup[staff.staffId] = staff._id;
    });

    // 6. Import Cleaning Jobs (only recent ones)
    if (seedData.cleaningJobs && Array.isArray(seedData.cleaningJobs)) {
      const recentJobs = seedData.cleaningJobs.filter(job => {
        const createdAt = new Date(job.createdAt);
        const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreation <= 7; // Only import jobs from last 7 days
      });

      for (const jobData of recentJobs) {
        try {
          const bedId = bedLookup[jobData.bedNumber];
          if (!bedId) {
            results.cleaningJobs.skipped++;
            continue;
          }

          // Check for duplicate
          const existingJob = await CleaningJob.findOne({
            bedNumber: jobData.bedNumber,
            createdAt: new Date(jobData.createdAt)
          });

          if (existingJob) {
            results.cleaningJobs.skipped++;
          } else {
            const job = new CleaningJob({
              bedId: bedId,
              bedNumber: jobData.bedNumber,
              ward: jobData.ward,
              floor: jobData.floor,
              section: jobData.section,
              roomNumber: jobData.roomNumber,
              status: jobData.status,
              assignedTo: staffLookup[jobData.assignedToStaffId] || null,
              assignedToName: jobData.assignedToName,
              createdAt: new Date(jobData.createdAt),
              startedAt: jobData.startedAt ? new Date(jobData.startedAt) : null,
              completedAt: jobData.completedAt ? new Date(jobData.completedAt) : null
            });
            await job.save();
            results.cleaningJobs.imported++;
          }
        } catch (error) {
          console.error(`Error importing cleaning job:`, error.message);
          results.cleaningJobs.errors++;
        }
      }
    }

    // Calculate totals
    const totalImported = Object.values(results).reduce((sum, r) => sum + r.imported, 0);
    const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

    res.json({
      success: true,
      message: `Import completed: ${totalImported} records imported, ${totalSkipped} skipped (duplicates), ${totalErrors} errors`,
      results,
      metadata: seedData.metadata
    });

  } catch (error) {
    console.error('Seed import error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import seed data',
      details: error.message
    });
  }
});

/**
 * GET /api/seed/status
 * Get current database status for import preview
 */
router.get('/status', async (req, res) => {
  try {
    const [bedCount, patientCount, historyCount, alertCount, jobCount, staffCount] = await Promise.all([
      Bed.countDocuments(),
      Patient.countDocuments(),
      OccupancyHistory.countDocuments(),
      Alert.countDocuments(),
      CleaningJob.countDocuments(),
      CleaningStaff.countDocuments()
    ]);

    res.json({
      currentCounts: {
        beds: bedCount,
        patients: patientCount,
        occupancyHistory: historyCount,
        alerts: alertCount,
        cleaningJobs: jobCount,
        cleaningStaff: staffCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get database status' });
  }
});

/**
 * POST /api/seed/validate
 * Validate seed data without importing
 */
router.post('/validate', async (req, res) => {
  try {
    const seedData = req.body;
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {}
    };

    if (!seedData || !seedData.metadata) {
      validation.isValid = false;
      validation.errors.push('Missing metadata in seed file');
      return res.json(validation);
    }

    // Check metadata
    validation.summary.version = seedData.metadata.version;
    validation.summary.generatedAt = seedData.metadata.generatedAt;
    validation.summary.daysOfHistory = seedData.metadata.daysOfHistory;

    // Validate beds
    if (seedData.beds) {
      validation.summary.beds = seedData.beds.length;
      const bedNumbers = new Set();
      seedData.beds.forEach((bed, index) => {
        if (!bed.bedNumber) {
          validation.errors.push(`Bed at index ${index} missing bedNumber`);
          validation.isValid = false;
        }
        if (bedNumbers.has(bed.bedNumber)) {
          validation.warnings.push(`Duplicate bed number: ${bed.bedNumber}`);
        }
        bedNumbers.add(bed.bedNumber);
      });
    }

    // Validate patients
    if (seedData.patients) {
      validation.summary.patients = seedData.patients.length;
      validation.summary.currentPatients = seedData.patients.filter(p => p.status !== 'discharged').length;
      validation.summary.dischargedPatients = seedData.patients.filter(p => p.status === 'discharged').length;

      const patientIds = new Set();
      seedData.patients.forEach((patient, index) => {
        if (!patient.patientId) {
          validation.errors.push(`Patient at index ${index} missing patientId`);
          validation.isValid = false;
        }
        if (patientIds.has(patient.patientId)) {
          validation.warnings.push(`Duplicate patient ID: ${patient.patientId}`);
        }
        patientIds.add(patient.patientId);
      });
    }

    // Validate other collections
    if (seedData.occupancyHistory) {
      validation.summary.occupancyHistory = seedData.occupancyHistory.length;
    }
    if (seedData.alerts) {
      validation.summary.alerts = seedData.alerts.length;
    }
    if (seedData.cleaningJobs) {
      validation.summary.cleaningJobs = seedData.cleaningJobs.length;
    }
    if (seedData.cleaningStaff) {
      validation.summary.cleaningStaff = seedData.cleaningStaff.length;
    }

    res.json(validation);
  } catch (error) {
    res.status(500).json({
      isValid: false,
      errors: [error.message]
    });
  }
});

module.exports = { router, initializeModels };
