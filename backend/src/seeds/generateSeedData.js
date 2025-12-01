/**
 * Seed Data Generator for Hospital Bed Management System
 * Generates 31 days of historical patient and hospital data
 *
 * Usage: node generateSeedData.js [outputFile]
 * Example: node generateSeedData.js hospital_seed_data.json
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  DAYS_OF_HISTORY: 31,
  WARDS: [
    { name: 'Emergency', floor: 0, beds: 15, equipment: ['Standard', 'Ventilator'] },
    { name: 'ICU', floor: 1, beds: 15, equipment: ['ICU Monitor', 'Ventilator'] },
    { name: 'Cardiology', floor: 2, beds: 15, equipment: ['Cardiac Monitor', 'Standard'] },
    { name: 'General Ward', floor: 3, beds: 15, equipment: ['Standard'] }
  ],
  AVG_OCCUPANCY_RATE: 0.70,
  PEAK_HOURS: [9, 10, 11, 14, 15, 16],
  PATIENT_STATUSES: ['admitted', 'critical', 'stable', 'recovering', 'discharged'],
  GENDERS: ['Male', 'Female', 'Other']
};

// Sample data for realistic generation
const SAMPLE_DATA = {
  firstNames: ['John', 'Jane', 'Michael', 'Sarah', 'Robert', 'Emily', 'David', 'Lisa', 'James', 'Maria',
               'William', 'Jennifer', 'Richard', 'Patricia', 'Joseph', 'Linda', 'Thomas', 'Barbara',
               'Charles', 'Elizabeth', 'Daniel', 'Susan', 'Matthew', 'Jessica', 'Anthony', 'Karen',
               'Rajesh', 'Priya', 'Amit', 'Sunita', 'Vikram', 'Anita', 'Suresh', 'Kavita', 'Ramesh', 'Meera'],
  lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
              'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
              'Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Rao', 'Verma', 'Joshi', 'Chopra'],
  admissionReasons: {
    'Emergency': ['Accident Trauma', 'Severe Burns', 'Acute Respiratory Failure', 'Drug Overdose',
                  'Severe Allergic Reaction', 'Stroke Symptoms', 'Heart Attack', 'Severe Bleeding'],
    'ICU': ['Post-Surgery Recovery', 'Sepsis', 'Multiple Organ Failure', 'Severe Pneumonia',
            'Cardiac Arrest Recovery', 'Severe Head Injury', 'Respiratory Failure', 'Kidney Failure'],
    'Cardiology': ['Heart Attack', 'Arrhythmia', 'Heart Failure', 'Chest Pain Investigation',
                   'Cardiac Catheterization', 'Pacemaker Implant', 'Bypass Surgery Recovery', 'Valve Replacement'],
    'General Ward': ['Appendicitis', 'Gallbladder Surgery', 'Hernia Repair', 'Fracture Treatment',
                     'Infection Treatment', 'Diabetes Management', 'Hypertension', 'General Surgery Recovery']
  },
  medications: [
    { name: 'Aspirin', dosage: '100mg', frequency: 'Once daily' },
    { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily' },
    { name: 'Lisinopril', dosage: '10mg', frequency: 'Once daily' },
    { name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily' },
    { name: 'Omeprazole', dosage: '20mg', frequency: 'Once daily' },
    { name: 'Morphine', dosage: '10mg', frequency: 'As needed' },
    { name: 'Heparin', dosage: '5000 units', frequency: 'Every 12 hours' },
    { name: 'Insulin', dosage: '10 units', frequency: 'Before meals' }
  ],
  alertMessages: {
    critical: ['Critical occupancy level reached', 'Emergency capacity exceeded', 'ICU at full capacity'],
    warning: ['Occupancy approaching critical level', 'Multiple beds require cleaning', 'Staff shortage alert'],
    info: ['New patient admitted', 'Patient discharged', 'Bed maintenance completed'],
    success: ['Cleaning job completed', 'Patient transferred successfully', 'Bed now available']
  },
  cleaningStaff: [
    { staffId: 'CS001', name: 'Ramesh Kumar' },
    { staffId: 'CS002', name: 'Sunil Verma' },
    { staffId: 'CS003', name: 'Geeta Devi' },
    { staffId: 'CS004', name: 'Mohan Singh' },
    { staffId: 'CS005', name: 'Lakshmi Rao' }
  ]
};

// Utility functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generatePatientId(index) {
  return `PAT${String(index).padStart(6, '0')}`;
}

function generateBedNumber(ward, index) {
  const wardPrefixes = {
    'Emergency': 'ER',
    'ICU': 'ICU',
    'Cardiology': 'CARD',
    'General Ward': 'GEN'
  };
  return `${wardPrefixes[ward] || 'BED'}-${String(index).padStart(3, '0')}`;
}

function generatePhone() {
  return `+91-${randomInt(70, 99)}${randomInt(10000000, 99999999)}`;
}

function generateVitals() {
  return {
    bloodPressure: `${randomInt(100, 140)}/${randomInt(60, 90)}`,
    heartRate: randomInt(60, 100),
    temperature: (36 + Math.random() * 2).toFixed(1),
    oxygenLevel: randomInt(94, 100)
  };
}

// Main generation functions
function generateBeds() {
  const beds = [];
  let bedIndex = 1;

  for (const ward of CONFIG.WARDS) {
    for (let i = 1; i <= ward.beds; i++) {
      const section = String.fromCharCode(65 + Math.floor((i - 1) / 5)); // A, B, C sections
      beds.push({
        bedNumber: generateBedNumber(ward.name, i),
        ward: ward.name,
        status: 'available', // Will be updated based on patients
        equipmentType: randomChoice(ward.equipment),
        location: {
          floor: ward.floor,
          section: section,
          roomNumber: `${ward.floor}${section}${String(((i - 1) % 5) + 1).padStart(2, '0')}`
        },
        lastCleaned: new Date(),
        lastUpdated: new Date(),
        notes: '',
        maintenanceSchedule: {
          nextMaintenance: new Date(Date.now() + randomInt(7, 30) * 24 * 60 * 60 * 1000),
          lastMaintenance: new Date(Date.now() - randomInt(7, 30) * 24 * 60 * 60 * 1000)
        }
      });
      bedIndex++;
    }
  }

  return beds;
}

function generatePatients(beds, daysOfHistory) {
  const patients = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - daysOfHistory * 24 * 60 * 60 * 1000);

  let patientIndex = 1;

  // Generate discharged patients (historical)
  const numDischargedPatients = Math.floor(beds.length * CONFIG.AVG_OCCUPANCY_RATE * daysOfHistory * 0.3);

  for (let i = 0; i < numDischargedPatients; i++) {
    const admissionDate = randomDate(startDate, new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
    const stayDays = randomInt(1, 10);
    const dischargeDate = new Date(admissionDate.getTime() + stayDays * 24 * 60 * 60 * 1000);

    if (dischargeDate > now) continue;

    const ward = randomChoice(CONFIG.WARDS);
    const firstName = randomChoice(SAMPLE_DATA.firstNames);
    const lastName = randomChoice(SAMPLE_DATA.lastNames);

    patients.push({
      patientId: generatePatientId(patientIndex++),
      name: `${firstName} ${lastName}`,
      age: randomInt(18, 85),
      gender: randomChoice(CONFIG.GENDERS),
      contactNumber: generatePhone(),
      emergencyContact: {
        name: `${randomChoice(SAMPLE_DATA.firstNames)} ${lastName}`,
        relation: randomChoice(['Spouse', 'Parent', 'Child', 'Sibling']),
        phone: generatePhone()
      },
      department: ward.name,
      reasonForAdmission: randomChoice(SAMPLE_DATA.admissionReasons[ward.name]),
      estimatedStay: stayDays * 24,
      admissionDate: admissionDate.toISOString(),
      expectedDischarge: dischargeDate.toISOString(),
      actualDischarge: dischargeDate.toISOString(),
      bedId: null, // Bed reference will be set during import
      vitals: Array.from({ length: randomInt(3, 10) }, () => ({
        timestamp: randomDate(admissionDate, dischargeDate).toISOString(),
        ...generateVitals()
      })),
      medications: SAMPLE_DATA.medications.slice(0, randomInt(1, 4)).map(med => ({
        ...med,
        startDate: admissionDate.toISOString(),
        endDate: dischargeDate.toISOString()
      })),
      status: 'discharged',
      transferHistory: []
    });
  }

  // Generate current patients (admitted)
  const numCurrentPatients = Math.floor(beds.length * CONFIG.AVG_OCCUPANCY_RATE);
  const availableBeds = [...beds];

  for (let i = 0; i < numCurrentPatients && availableBeds.length > 0; i++) {
    const bedIndex = randomInt(0, availableBeds.length - 1);
    const bed = availableBeds.splice(bedIndex, 1)[0];

    const admissionDate = randomDate(
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      now
    );
    const estimatedStay = randomInt(2, 14);
    const expectedDischarge = new Date(admissionDate.getTime() + estimatedStay * 24 * 60 * 60 * 1000);

    const ward = CONFIG.WARDS.find(w => w.name === bed.ward);
    const firstName = randomChoice(SAMPLE_DATA.firstNames);
    const lastName = randomChoice(SAMPLE_DATA.lastNames);
    const status = randomChoice(['admitted', 'critical', 'stable', 'recovering']);

    patients.push({
      patientId: generatePatientId(patientIndex++),
      name: `${firstName} ${lastName}`,
      age: randomInt(18, 85),
      gender: randomChoice(CONFIG.GENDERS),
      contactNumber: generatePhone(),
      emergencyContact: {
        name: `${randomChoice(SAMPLE_DATA.firstNames)} ${lastName}`,
        relation: randomChoice(['Spouse', 'Parent', 'Child', 'Sibling']),
        phone: generatePhone()
      },
      department: bed.ward,
      reasonForAdmission: randomChoice(SAMPLE_DATA.admissionReasons[ward.name]),
      estimatedStay: estimatedStay * 24,
      admissionDate: admissionDate.toISOString(),
      expectedDischarge: expectedDischarge.toISOString(),
      actualDischarge: null,
      assignedBedNumber: bed.bedNumber, // Reference for import
      vitals: Array.from({ length: randomInt(2, 5) }, () => ({
        timestamp: randomDate(admissionDate, now).toISOString(),
        ...generateVitals()
      })),
      medications: SAMPLE_DATA.medications.slice(0, randomInt(1, 4)).map(med => ({
        ...med,
        startDate: admissionDate.toISOString(),
        endDate: null
      })),
      status: status,
      transferHistory: []
    });

    // Update bed status
    bed.status = 'occupied';
    bed.assignedPatientId = patients[patients.length - 1].patientId;
  }

  return patients;
}

function generateOccupancyHistory(beds, daysOfHistory) {
  const history = [];
  const now = new Date();

  for (let day = daysOfHistory; day >= 0; day--) {
    const timestamp = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    timestamp.setHours(23, 59, 59, 999);

    // Simulate varying occupancy rates
    const dayOfWeek = timestamp.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseOccupancy = CONFIG.AVG_OCCUPANCY_RATE + (isWeekend ? -0.1 : 0.05);
    const variance = (Math.random() - 0.5) * 0.2;
    const occupancyRate = Math.max(0.3, Math.min(0.95, baseOccupancy + variance));

    const totalBeds = beds.length;
    const occupied = Math.round(totalBeds * occupancyRate);
    const cleaning = randomInt(1, 4);
    const reserved = randomInt(0, 3);
    const maintenance = randomInt(0, 2);
    const available = Math.max(0, totalBeds - occupied - cleaning - reserved - maintenance);

    const wardStats = CONFIG.WARDS.map(ward => {
      const wardBeds = ward.beds;
  const wardOccupied = Math.round(wardBeds * occupancyRate * (0.8 + Math.random() * 0.4));
      const wardCleaning = randomInt(0, 2);
      const wardReserved = randomInt(0, 1);
      const wardAvailable = Math.max(0, wardBeds - wardOccupied - wardCleaning - wardReserved);

      return {
        ward: ward.name,
        total: wardBeds,
        occupied: Math.min(wardOccupied, wardBeds),
        available: wardAvailable,
        cleaning: wardCleaning,
        reserved: wardReserved,
        occupancyRate: ((Math.min(wardOccupied, wardBeds) / wardBeds) * 100).toFixed(1)
      };
    });

    history.push({
      timestamp: timestamp.toISOString(),
      totalBeds,
      occupied,
      available,
      cleaning,
      reserved,
      maintenance,
      occupancyRate: ((occupied / totalBeds) * 100).toFixed(1),
      wardStats,
      peakHour: CONFIG.PEAK_HOURS.includes(timestamp.getHours())
    });
  }

  return history;
}

function generateAlerts(daysOfHistory) {
  const alerts = [];
  const now = new Date();

  for (let day = daysOfHistory; day >= 0; day--) {
    const numAlerts = randomInt(2, 8);

    for (let i = 0; i < numAlerts; i++) {
      const timestamp = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
      timestamp.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));

      const type = randomChoice(['critical', 'warning', 'info', 'success']);
      const ward = randomChoice(CONFIG.WARDS).name;

      alerts.push({
        type,
        message: randomChoice(SAMPLE_DATA.alertMessages[type]),
        ward,
        acknowledged: day > 1 ? true : Math.random() > 0.5,
        acknowledgedBy: day > 1 ? 'admin' : null,
        acknowledgedAt: day > 1 ? new Date(timestamp.getTime() + randomInt(1, 60) * 60 * 1000).toISOString() : null,
        priority: type === 'critical' ? 5 : type === 'warning' ? 3 : 1,
        createdAt: timestamp.toISOString()
      });
    }
  }

  return alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function generateCleaningJobs(beds, daysOfHistory) {
  const jobs = [];
  const now = new Date();

  for (let day = daysOfHistory; day >= 0; day--) {
    const numJobs = randomInt(3, 10);

    for (let i = 0; i < numJobs; i++) {
      const bed = randomChoice(beds);
      const createdAt = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
      createdAt.setHours(randomInt(6, 22), randomInt(0, 59), randomInt(0, 59));

      const status = day > 0 ? 'completed' : randomChoice(['pending', 'active', 'completed']);
      const staff = randomChoice(SAMPLE_DATA.cleaningStaff);

      const startedAt = status !== 'pending'
        ? new Date(createdAt.getTime() + randomInt(5, 30) * 60 * 1000)
        : null;

      const completedAt = status === 'completed'
        ? new Date(startedAt.getTime() + randomInt(15, 45) * 60 * 1000)
        : null;

      jobs.push({
        bedNumber: bed.bedNumber,
        ward: bed.ward,
        floor: bed.location.floor,
        section: bed.location.section,
        roomNumber: bed.location.roomNumber,
        status,
        assignedToStaffId: staff.staffId,
        assignedToName: staff.name,
        createdAt: createdAt.toISOString(),
        startedAt: startedAt ? startedAt.toISOString() : null,
        completedAt: completedAt ? completedAt.toISOString() : null
      });
    }
  }

  return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function generateCleaningStaff() {
  return SAMPLE_DATA.cleaningStaff.map(staff => ({
    ...staff,
    status: randomChoice(['available', 'busy']),
    activeJobsCount: 0,
    totalJobsCompleted: randomInt(50, 200),
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  }));
}

// Main execution
function generateSeedData() {
  console.log('Generating seed data for Hospital Bed Management System...\n');

  const beds = generateBeds();
  console.log(`Generated ${beds.length} beds across ${CONFIG.WARDS.length} wards`);

  const patients = generatePatients(beds, CONFIG.DAYS_OF_HISTORY);
  const currentPatients = patients.filter(p => p.status !== 'discharged');
  const dischargedPatients = patients.filter(p => p.status === 'discharged');
  console.log(`Generated ${patients.length} patients (${currentPatients.length} current, ${dischargedPatients.length} discharged)`);

  const occupancyHistory = generateOccupancyHistory(beds, CONFIG.DAYS_OF_HISTORY);
  console.log(`Generated ${occupancyHistory.length} days of occupancy history`);

  const alerts = generateAlerts(CONFIG.DAYS_OF_HISTORY);
  console.log(`Generated ${alerts.length} alerts`);

  const cleaningJobs = generateCleaningJobs(beds, CONFIG.DAYS_OF_HISTORY);
  console.log(`Generated ${cleaningJobs.length} cleaning jobs`);

  const cleaningStaff = generateCleaningStaff();
  console.log(`Generated ${cleaningStaff.length} cleaning staff records`);

  const seedData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      daysOfHistory: CONFIG.DAYS_OF_HISTORY,
      description: 'Hospital Bed Management System Seed Data'
    },
    beds,
    patients,
    occupancyHistory,
    alerts,
    cleaningJobs,
    cleaningStaff
  };

  return seedData;
}

// CLI execution
if (require.main === module) {
  const outputFile = process.argv[2] || 'hospital_seed_data.json';
  const outputPath = path.resolve(process.cwd(), outputFile);

  const seedData = generateSeedData();

  fs.writeFileSync(outputPath, JSON.stringify(seedData, null, 2));

  console.log(`\nSeed data written to: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
}

module.exports = { generateSeedData, CONFIG };
