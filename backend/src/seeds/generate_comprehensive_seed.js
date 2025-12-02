const fs = require('fs');

// Helper functions
const generatePatientId = (num) => 'PAT' + String(num).padStart(6, '0');
const generateRequestId = (num) => 'REQ' + String(num).padStart(6, '0');

// Indian names database
const indianFirstNames = {
  male: ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Arnav', 'Ayaan', 'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Reyansh', 'Shivansh', 'Rishi', 'Krish', 'Parth', 'Karan', 'Rohan', 'Harsh', 'Yash', 'Dev', 'Dhruv', 'Rudra', 'Kabir', 'Ansh', 'Advait', 'Viraj', 'Aaradhya', 'Aryan', 'Shiv', 'Om', 'Raghav', 'Lakshya', 'Aarush', 'Vedant', 'Veer', 'Darsh'],
  female: ['Saanvi', 'Aadhya', 'Kiara', 'Diya', 'Pihu', 'Ananya', 'Fatima', 'Anika', 'Riya', 'Navya', 'Angel', 'Pari', 'Aaradhya', 'Sara', 'Myra', 'Aanya', 'Zara', 'Prisha', 'Anvi', 'Avni', 'Ishita', 'Kavya', 'Mira', 'Nisha', 'Pooja', 'Shreya', 'Tanvi', 'Isha', 'Meera', 'Siya', 'Aditi', 'Ahana', 'Alisha', 'Anjali', 'Aria', 'Charvi', 'Divya', 'Ira', 'Janvi', 'Khushi']
};

const indianLastNames = ['Kumar', 'Singh', 'Sharma', 'Patel', 'Gupta', 'Reddy', 'Rao', 'Joshi', 'Iyer', 'Mehta', 'Nair', 'Desai', 'Pillai', 'Agarwal', 'Malhotra', 'Chopra', 'Kapoor', 'Verma', 'Shah', 'Jain', 'Pandey', 'Mishra', 'Sinha', 'Khan', 'Das', 'Bose', 'Ghosh', 'Chatterjee', 'Mukherjee', 'Banerjee', 'Saxena', 'Trivedi', 'Kulkarni', 'Bhatt', 'Menon'];

const reasons = {
  'Emergency': ['Motor Vehicle Accident', 'Fall Injury', 'Severe Trauma', 'Acute Poisoning', 'Severe Burns', 'Stroke Symptoms', 'Cardiac Arrest', 'Severe Allergic Reaction'],
  'ICU': ['Post-Surgery Critical Care', 'Respiratory Failure', 'Septic Shock', 'Multi-Organ Failure', 'Severe COVID-19', 'Brain Hemorrhage', 'Cardiac Arrest Recovery', 'Severe Pneumonia'],
  'Cardiology': ['Heart Attack', 'Cardiac Arrhythmia', 'Heart Failure', 'Angina Pectoris', 'Myocardial Infarction', 'Atrial Fibrillation', 'Coronary Artery Disease', 'Valve Disorder'],
  'General Ward': ['Pneumonia', 'Appendicitis', 'Diabetic Management', 'Kidney Stones', 'Gastrointestinal Infection', 'Post-Surgery Recovery', 'Fracture Treatment', 'Asthma', 'Hypertension Management', 'Gastroenteritis']
};

const getRandomName = (gender) => {
  const firstNames = gender === 'Male' ? indianFirstNames.male : indianFirstNames.female;
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = indianLastNames[Math.floor(Math.random() * indianLastNames.length)];
  return `${firstName} ${lastName}`;
};

const getRandomReason = (ward) => {
  const wardReasons = reasons[ward] || reasons['General Ward'];
  return wardReasons[Math.floor(Math.random() * wardReasons.length)];
};

const getRandomGender = () => Math.random() > 0.5 ? 'Male' : 'Female';
const getRandomAge = () => Math.floor(Math.random() * 70) + 18; // 18-88 years
const getRandomPhone = () => '98' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');

// Date is December 3, 2025 - generate data for last 60 days
const endDate = new Date('2025-12-03T08:00:00.000Z');
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - 60); // Oct 4, 2024

console.log('='.repeat(60));
console.log('BedManager Comprehensive Seed Data Generator');
console.log('='.repeat(60));
console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
console.log('Days: 60');
console.log('='.repeat(60));

const data = {
  metadata: {
    generatedAt: new Date().toISOString(),
    version: '2.0.0',
    description: 'Comprehensive BedManager seed data for 60 days with realistic patient flow',
    dateRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      days: 60
    },
    capacities: {
      Emergency: 10,
      ICU: 20,
      'General Ward': 50,
      Cardiology: 20,
      Total: 100
    },
    finalOccupancy: {
      Emergency: 8,
      ICU: 17,
      'General Ward': 32,
      Cardiology: 8,
      Total: 65
    }
  },
  beds: [],
  patients: [],
  bedRequests: [],
  wardTransfers: [],
  occupancyHistory: [],
  alerts: []
};

// Generate beds
console.log('\n[1/6] Generating beds...');
const wardConfigs = {
  'Emergency': { count: 10, prefix: 'ER', floor: 0, equipment: ['Standard', 'Ventilator'] },
  'ICU': { count: 20, prefix: 'ICU', floor: 1, equipment: ['ICU Monitor', 'Ventilator'] },
  'Cardiology': { count: 20, prefix: 'CARD', floor: 2, equipment: ['Cardiac Monitor', 'VAD'] },
  'General Ward': { count: 50, prefix: 'GEN', floor: 3, equipment: ['Standard'] }
};

Object.entries(wardConfigs).forEach(([ward, config]) => {
  for (let i = 1; i <= config.count; i++) {
    const bedNumber = `${config.prefix}-${String(i).padStart(3, '0')}`;
    const section = String.fromCharCode(65 + Math.floor((i - 1) / 5));
    data.beds.push({
      bedNumber,
      ward,
      status: 'available',
      equipmentType: config.equipment[Math.floor(Math.random() * config.equipment.length)],
      location: {
        floor: config.floor,
        section,
        roomNumber: `${config.floor}${section}${String(((i - 1) % 5) + 1).padStart(2, '0')}`
      },
      lastCleaned: new Date(endDate.getTime() - Math.random() * 24 * 3600000).toISOString(),
      lastUpdated: new Date().toISOString(),
      notes: '',
      maintenanceSchedule: {
        nextMaintenance: new Date(endDate.getTime() + Math.random() * 30 * 24 * 3600000).toISOString(),
        lastMaintenance: new Date(endDate.getTime() - Math.random() * 30 * 24 * 3600000).toISOString()
      }
    });
  }
});

console.log(`   ✓ Generated ${data.beds.length} beds`);

// Track occupancy over time
const bedOccupancy = {}; // Track which beds are occupied at any time
data.beds.forEach(bed => {
  bedOccupancy[bed.bedNumber] = null; // null means available
});

let patientCounter = 1;
let requestCounter = 1;

console.log('\n[2/6] Generating patient flow over 60 days...');

// Generate patients and requests day by day
for (let day = 0; day < 60; day++) {
  const currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + day);
  
  if (day % 10 === 0) {
    process.stdout.write(`   Processing days ${day + 1}-${Math.min(day + 10, 60)}...\n`);
  }
  
  // Determine target occupancy for this day (varied)
  let targetOccupancyRate;
  const rand = Math.random();
  
  if (day < 15) {
    targetOccupancyRate = 0.45 + rand * 0.20; // 45-65%
  } else if (day < 30) {
    targetOccupancyRate = 0.60 + rand * 0.25; // 60-85%
  } else if (day < 45) {
    targetOccupancyRate = 0.70 + rand * 0.25; // 70-95% (some high occupancy)
  } else if (day < 59) {
    targetOccupancyRate = 0.55 + rand * 0.30; // 55-85%
  } else {
    // Last day - need to reach exactly 65 occupied
    targetOccupancyRate = 0.65; // 65%
  }
  
  // Count current occupancy
  const getCurrentOccupancy = () => {
    return Object.values(bedOccupancy).filter(p => p !== null).length;
  };
  
  const getCurrentOccupancyByWard = (ward) => {
    return data.beds.filter(b => b.ward === ward && bedOccupancy[b.bedNumber] !== null).length;
  };
  
  const currentOcc = getCurrentOccupancy();
  const targetOcc = day < 59 ? Math.floor(100 * targetOccupancyRate) : 65;
  
  // Discharge patients who have stayed long enough
  const toDischarge = [];
  Object.entries(bedOccupancy).forEach(([bedNum, patientData]) => {
    if (patientData && patientData.expectedDischarge <= currentDate) {
      toDischarge.push({ bedNum, patientData });
    }
  });
  
  // Process discharges (between 10 AM and 6 PM)
  toDischarge.forEach(({ bedNum, patientData }) => {
    const dischargeHour = 10 + Math.floor(Math.random() * 8); // 10 AM - 6 PM
    const dischargeTime = new Date(currentDate);
    dischargeTime.setHours(dischargeHour, Math.floor(Math.random() * 60), 0, 0);
    
    // Find patient in data and update
    const patient = data.patients.find(p => p.patientId === patientData.patientId);
    if (patient) {
      patient.actualDischarge = dischargeTime.toISOString();
      patient.status = 'discharged';
    }
    
    bedOccupancy[bedNum] = null;
  });
  
  // Admit new patients to reach target occupancy
  const newAdmissionsNeeded = Math.max(0, targetOcc - getCurrentOccupancy());
  
  for (let i = 0; i < newAdmissionsNeeded; i++) {
    const admissionHour = Math.floor(Math.random() * 24);
    const admissionTime = new Date(currentDate);
    admissionTime.setHours(admissionHour, Math.floor(Math.random() * 60), 0, 0);
    
    // Night admissions (10 PM - 8 AM) go to Emergency only
    let preferredWard;
    if (admissionHour >= 22 || admissionHour < 8) {
      preferredWard = 'Emergency';
    } else {
      // Distribute among all wards
      const weights = [0.15, 0.25, 0.40, 0.20]; // ER, ICU, General, Cardiology
      const r = Math.random();
      if (r < weights[0]) preferredWard = 'Emergency';
      else if (r < weights[0] + weights[1]) preferredWard = 'ICU';
      else if (r < weights[0] + weights[1] + weights[2]) preferredWard = 'General Ward';
      else preferredWard = 'Cardiology';
    }
    
    // Find available bed in preferred ward
    const availableBeds = data.beds.filter(b => 
      b.ward === preferredWard && !bedOccupancy[b.bedNumber]
    );
    
    if (availableBeds.length === 0) {
      // Try other wards if preferred ward is full
      const allAvailableBeds = data.beds.filter(b => !bedOccupancy[b.bedNumber]);
      if (allAvailableBeds.length === 0) continue;
      const assignedBed = allAvailableBeds[Math.floor(Math.random() * allAvailableBeds.length)];
      preferredWard = assignedBed.ward;
    }
    
    const availableBedsInWard = data.beds.filter(b => 
      b.ward === preferredWard && !bedOccupancy[b.bedNumber]
    );
    
    if (availableBedsInWard.length === 0) continue;
    
    const assignedBed = availableBedsInWard[Math.floor(Math.random() * availableBedsInWard.length)];
    const gender = getRandomGender();
    const patientName = getRandomName(gender);
    const patientId = generatePatientId(patientCounter++);
    const requestId = generateRequestId(requestCounter++);
    
    // Determine stay duration (minimum 2 days, up to 8 days)
    const stayDays = 2 + Math.floor(Math.random() * 6);
    const expectedDischarge = new Date(admissionTime);
    expectedDischarge.setDate(expectedDischarge.getDate() + stayDays);
    
    // Create patient
    const patient = {
      patientId,
      name: patientName,
      age: getRandomAge(),
      gender,
      contactNumber: getRandomPhone(),
      emergencyContact: {
        name: getRandomName(getRandomGender()),
        relation: ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend'][Math.floor(Math.random() * 5)],
        phone: getRandomPhone()
      },
      department: preferredWard,
      reasonForAdmission: getRandomReason(preferredWard),
      estimatedStay: stayDays * 24,
      admissionDate: admissionTime.toISOString(),
      expectedDischarge: expectedDischarge.toISOString(),
      actualDischarge: null,
      bedId: assignedBed.bedNumber,
      status: ['admitted', 'stable', 'recovering'][Math.floor(Math.random() * 3)],
      transferHistory: []
    };
    
    data.patients.push(patient);
    
    // Create bed request
    const isDenied = Math.random() > 0.95; // 5% denied
    const isReservation = Math.random() > 0.70 && !isDenied; // 30% are reservations
    
    const request = {
      requestId,
      createdBy: {
        username: 'erstaff',
        name: 'ER Staff User'
      },
      patientDetails: {
        name: patientName,
        age: patient.age,
        gender: patient.gender,
        contactNumber: patient.contactNumber,
        reasonForAdmission: patient.reasonForAdmission,
        requiredEquipment: assignedBed.equipmentType,
        estimatedStay: stayDays * 24
      },
      preferredWard,
      eta: admissionTime.toISOString(),
      status: isDenied ? 'denied' : 'approved',
      priority: admissionHour >= 22 || admissionHour < 8 ? 5 : Math.floor(Math.random() * 3) + 2,
      createdAt: new Date(admissionTime.getTime() - (15 + Math.random() * 45) * 60000).toISOString(),
      updatedAt: admissionTime.toISOString()
    };
    
    if (!isDenied) {
      request.assignedBed = {
        bedNumber: assignedBed.bedNumber,
        ward: preferredWard
      };
      request.reviewedBy = {
        username: 'anuradha',
        name: 'Anuradha (ICU Manager)',
        reviewedAt: new Date(admissionTime.getTime() - Math.random() * 15 * 60000).toISOString()
      };
      request.fulfilledAt = admissionTime.toISOString();
    } else {
      request.denialReason = 'No beds available in requested ward';
      request.reviewedBy = {
        username: 'anuradha',
        name: 'Anuradha (ICU Manager)',
        reviewedAt: new Date(admissionTime.getTime() - Math.random() * 10 * 60000).toISOString()
      };
    }
    
    data.bedRequests.push(request);
    
    if (!isDenied) {
      // Mark bed as occupied
      bedOccupancy[assignedBed.bedNumber] = {
        patientId,
        admissionDate: admissionTime,
        expectedDischarge
      };
    }
  }
  
  // Record daily occupancy snapshot
  const dailyOccupancy = {
    date: currentDate.toISOString().split('T')[0],
    totalOccupied: getCurrentOccupancy(),
    wards: {
      Emergency: getCurrentOccupancyByWard('Emergency'),
      ICU: getCurrentOccupancyByWard('ICU'),
      'General Ward': getCurrentOccupancyByWard('General Ward'),
      Cardiology: getCurrentOccupancyByWard('Cardiology')
    }
  };
  
  // Generate hourly occupancy data for the day
  const hourlyData = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourTime = new Date(currentDate);
    hourTime.setHours(hour, 0, 0, 0);
    
    // Add small variations in hourly data
    const hourOcc = getCurrentOccupancy();
    const hourVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const adjustedOcc = Math.max(0, Math.min(100, hourOcc + hourVariation));
    
    hourlyData.push({
      hour,
      timestamp: hourTime.toISOString(),
      totalBeds: 100,
      occupied: adjustedOcc,
      available: 100 - adjustedOcc,
      cleaning: Math.floor(Math.random() * 3),
      reserved: Math.floor(Math.random() * 2),
      occupancyRate: ((adjustedOcc / 100) * 100).toFixed(2),
      wardStats: [
        {
          ward: 'Emergency',
          total: 10,
          occupied: getCurrentOccupancyByWard('Emergency'),
          available: 10 - getCurrentOccupancyByWard('Emergency'),
          cleaning: 0,
          reserved: 0,
          occupancyRate: ((getCurrentOccupancyByWard('Emergency') / 10) * 100).toFixed(2)
        },
        {
          ward: 'ICU',
          total: 20,
          occupied: getCurrentOccupancyByWard('ICU'),
          available: 20 - getCurrentOccupancyByWard('ICU'),
          cleaning: 0,
          reserved: 0,
          occupancyRate: ((getCurrentOccupancyByWard('ICU') / 20) * 100).toFixed(2)
        },
        {
          ward: 'General Ward',
          total: 50,
          occupied: getCurrentOccupancyByWard('General Ward'),
          available: 50 - getCurrentOccupancyByWard('General Ward'),
          cleaning: 0,
          reserved: 0,
          occupancyRate: ((getCurrentOccupancyByWard('General Ward') / 50) * 100).toFixed(2)
        },
        {
          ward: 'Cardiology',
          total: 20,
          occupied: getCurrentOccupancyByWard('Cardiology'),
          available: 20 - getCurrentOccupancyByWard('Cardiology'),
          cleaning: 0,
          reserved: 0,
          occupancyRate: ((getCurrentOccupancyByWard('Cardiology') / 20) * 100).toFixed(2)
        }
      ]
    });
  }
  
  // Create occupancy history record
  const occRecord = {
    timestamp: new Date(currentDate).toISOString(),
    totalBeds: 100,
    occupied: dailyOccupancy.totalOccupied,
    available: 100 - dailyOccupancy.totalOccupied,
    cleaning: Math.floor(Math.random() * 5),
    reserved: Math.floor(Math.random() * 3),
    maintenance: 0,
    occupancyRate: ((dailyOccupancy.totalOccupied / 100) * 100).toFixed(2),
    wardStats: [
      {
        ward: 'Emergency',
        total: 10,
        occupied: dailyOccupancy.wards.Emergency,
        available: 10 - dailyOccupancy.wards.Emergency,
        cleaning: 0,
        reserved: 0,
        occupancyRate: ((dailyOccupancy.wards.Emergency / 10) * 100).toFixed(2)
      },
      {
        ward: 'ICU',
        total: 20,
        occupied: dailyOccupancy.wards.ICU,
        available: 20 - dailyOccupancy.wards.ICU,
        cleaning: 0,
        reserved: 0,
        occupancyRate: ((dailyOccupancy.wards.ICU / 20) * 100).toFixed(2)
      },
      {
        ward: 'General Ward',
        total: 50,
        occupied: dailyOccupancy.wards['General Ward'],
        available: 50 - dailyOccupancy.wards['General Ward'],
        cleaning: 0,
        reserved: 0,
        occupancyRate: ((dailyOccupancy.wards['General Ward'] / 50) * 100).toFixed(2)
      },
      {
        ward: 'Cardiology',
        total: 20,
        occupied: dailyOccupancy.wards.Cardiology,
        available: 20 - dailyOccupancy.wards.Cardiology,
        cleaning: 0,
        reserved: 0,
        occupancyRate: ((dailyOccupancy.wards.Cardiology / 20) * 100).toFixed(2)
      }
    ],
    peakHour: dailyOccupancy.totalOccupied > 85,
    hourlyData
  };
  
  data.occupancyHistory.push(occRecord);
  
  // Generate alerts for high occupancy
  if (dailyOccupancy.totalOccupied >= 90) {
    data.alerts.push({
      type: 'critical',
      message: `CRITICAL: Hospital occupancy at ${((dailyOccupancy.totalOccupied/100)*100).toFixed(1)}% (${dailyOccupancy.totalOccupied}/100 beds)`,
      ward: 'All',
      acknowledged: day < 59, // Acknowledge old alerts
      priority: 5,
      createdAt: currentDate.toISOString(),
      updatedAt: currentDate.toISOString()
    });
  }
  
  // Ward-specific alerts
  Object.entries(dailyOccupancy.wards).forEach(([ward, occupied]) => {
    const capacity = wardConfigs[ward].count;
    const occRate = (occupied / capacity) * 100;
    
    if (occRate >= 90) {
      data.alerts.push({
        type: occRate >= 95 ? 'critical' : 'warning',
        message: `${ward} at ${occRate.toFixed(1)}% occupancy (${occupied}/${capacity} beds)`,
        ward,
        acknowledged: day < 59,
        priority: occRate >= 95 ? 5 : 4,
        createdAt: currentDate.toISOString(),
        updatedAt: currentDate.toISOString()
      });
    }
  });
}

console.log(`   ✓ Generated ${data.patients.length} patient records`);
console.log(`   ✓ Generated ${data.bedRequests.length} bed requests`);
console.log(`   ✓ Generated ${data.occupancyHistory.length} daily occupancy records`);

// Generate ward transfers
console.log('\n[3/6] Generating ward transfers...');
let transferCounter = 1;

// Find patients who were admitted but not yet discharged (longer stays)
const eligiblePatients = data.patients.filter(p => {
  const admission = new Date(p.admissionDate);
  const discharge = p.actualDischarge ? new Date(p.actualDischarge) : endDate;
  const stayDays = (discharge - admission) / (1000 * 60 * 60 * 24);
  return stayDays >= 2; // Patients who stayed at least 2 days
});

// Create transfers with specific patterns as required
const transferPatterns = [
  { from: 'Emergency', to: 'ICU', reason: 'Critical condition requiring ICU care' },
  { from: 'ICU', to: 'General Ward', reason: 'Condition stabilized, step-down care' },
  { from: 'Emergency', to: 'General Ward', reason: 'Stable condition, general care sufficient' },
  { from: 'General Ward', to: 'Cardiology', reason: 'Cardiac complications detected' },
  { from: 'ICU', to: 'Cardiology', reason: 'Specialized cardiac care required' },
  { from: 'Emergency', to: 'Cardiology', reason: 'Acute cardiac condition' }
];

// Generate 60-80 transfers
const targetTransfers = 60 + Math.floor(Math.random() * 20);
let transfersCreated = 0;
const usedPatients = new Set();

for (let attempt = 0; attempt < eligiblePatients.length && transfersCreated < targetTransfers; attempt++) {
  const patient = eligiblePatients[attempt];
  
  // Skip if already used for transfer
  if (usedPatients.has(patient.patientId)) continue;
  
  // Find matching pattern for patient's current department
  const validPatterns = transferPatterns.filter(p => p.from === patient.department);
  if (validPatterns.length === 0) continue;
  
  const pattern = validPatterns[Math.floor(Math.random() * validPatterns.length)];
  
  const transferTime = new Date(patient.admissionDate);
  const daysAfterAdmission = 1 + Math.floor(Math.random() * 2); // 1-2 days
  transferTime.setDate(transferTime.getDate() + daysAfterAdmission);
  
  // Make sure transfer happened before discharge
  if (patient.actualDischarge && transferTime >= new Date(patient.actualDischarge)) continue;
  
  // Find old bed
  const oldBedNumber = patient.bedId;
  
  // Create transfer record
  data.wardTransfers.push({
    patientId: patient.patientId,
    currentWard: pattern.from,
    targetWard: pattern.to,
    currentBedId: oldBedNumber,
    newBedId: null, // Will be updated when we assign new bed
    reason: pattern.reason,
    status: 'completed',
    requestedBy: {
      username: 'wardstaff',
      name: 'Ward Staff User'
    },
    reviewedBy: {
      username: 'anuradha',
      name: 'Anuradha (ICU Manager)',
      reviewedAt: transferTime.toISOString()
    },
    completedAt: transferTime.toISOString(),
    createdAt: new Date(transferTime.getTime() - 30 * 60000).toISOString(),
    updatedAt: transferTime.toISOString()
  });
  
  // Update patient record
  patient.transferHistory.push({
    fromBed: oldBedNumber,
    toBed: `${pattern.to}-TBD`,
    timestamp: transferTime.toISOString(),
    reason: pattern.reason
  });
  
  patient.department = pattern.to;
  usedPatients.add(patient.patientId);
  transfersCreated++;
}

console.log(`   ✓ Generated ${data.wardTransfers.length} ward transfers`);

// Update final bed statuses
console.log('\n[4/6] Updating final bed statuses and adjusting to target occupancy...');

// First, mark all beds based on current occupancy
data.beds.forEach(bed => {
  if (bedOccupancy[bed.bedNumber]) {
    bed.status = 'occupied';
    bed.patientId = bedOccupancy[bed.bedNumber].patientId;
  } else {
    bed.status = 'available';
    bed.patientId = null;
  }
});

// Count current occupancy by ward
const getCurrentOccByWard = (ward) => data.beds.filter(b => b.ward === ward && b.status === 'occupied').length;

const currentFinal = {
  Emergency: getCurrentOccByWard('Emergency'),
  ICU: getCurrentOccByWard('ICU'),
  'General Ward': getCurrentOccByWard('General Ward'),
  Cardiology: getCurrentOccByWard('Cardiology')
};

const targetFinal = {
  Emergency: 8,
  ICU: 17,
  'General Ward': 32,
  Cardiology: 8
};

console.log('   Adjusting occupancy to match targets...');

// Adjust each ward to match target
Object.keys(targetFinal).forEach(ward => {
  const current = currentFinal[ward];
  const target = targetFinal[ward];
  const diff = target - current;
  
  if (diff > 0) {
    // Need to add patients - admit new ones on Dec 3rd early morning
    const availableBeds = data.beds.filter(b => b.ward === ward && b.status === 'available');
    
    for (let i = 0; i < Math.min(diff, availableBeds.length); i++) {
      const bed = availableBeds[i];
      const admitTime = new Date('2025-12-03T' + String(Math.floor(Math.random() * 8)).padStart(2, '0') + ':' + String(Math.floor(Math.random() * 60)).padStart(2, '0') + ':00.000Z');
      
      const gender = getRandomGender();
      const patientName = getRandomName(gender);
      const patientId = generatePatientId(patientCounter++);
      const requestId = generateRequestId(requestCounter++);
      
      const stayDays = 3 + Math.floor(Math.random() * 4);
      const expectedDischarge = new Date(admitTime);
      expectedDischarge.setDate(expectedDischarge.getDate() + stayDays);
      
      // Create patient
      const patient = {
        patientId,
        name: patientName,
        age: getRandomAge(),
        gender,
        contactNumber: getRandomPhone(),
        emergencyContact: {
          name: getRandomName(getRandomGender()),
          relation: ['Spouse', 'Parent', 'Sibling', 'Child'][Math.floor(Math.random() * 4)],
          phone: getRandomPhone()
        },
        department: ward,
        reasonForAdmission: getRandomReason(ward),
        estimatedStay: stayDays * 24,
        admissionDate: admitTime.toISOString(),
        expectedDischarge: expectedDischarge.toISOString(),
        actualDischarge: null,
        bedId: bed.bedNumber,
        status: 'admitted',
        transferHistory: []
      };
      
      data.patients.push(patient);
      
      // Create bed request
      const request = {
        requestId,
        createdBy: {
          username: admitTime.getHours() >= 22 || admitTime.getHours() < 8 ? 'erstaff' : 'anuradha',
          name: admitTime.getHours() >= 22 || admitTime.getHours() < 8 ? 'ER Staff User' : 'ICU Manager'
        },
        patientDetails: {
          name: patientName,
          age: patient.age,
          gender: patient.gender,
          contactNumber: patient.contactNumber,
          reasonForAdmission: patient.reasonForAdmission,
          requiredEquipment: bed.equipmentType,
          estimatedStay: stayDays * 24
        },
        preferredWard: ward,
        eta: admitTime.toISOString(),
        status: 'approved',
        assignedBed: {
          bedNumber: bed.bedNumber,
          ward: ward
        },
        reviewedBy: {
          username: 'anuradha',
          name: 'Anuradha (ICU Manager)',
          reviewedAt: new Date(admitTime.getTime() - 10 * 60000).toISOString()
        },
        priority: admitTime.getHours() >= 22 || admitTime.getHours() < 8 ? 5 : 3,
        fulfilledAt: admitTime.toISOString(),
        createdAt: new Date(admitTime.getTime() - 20 * 60000).toISOString(),
        updatedAt: admitTime.toISOString()
      };
      
      data.bedRequests.push(request);
      
      // Update bed
      bed.status = 'occupied';
      bed.patientId = patientId;
      bedOccupancy[bed.bedNumber] = {
        patientId,
        admissionDate: admitTime,
        expectedDischarge
      };
    }
  } else if (diff < 0) {
    // Need to remove patients - discharge some early
    const occupiedBeds = data.beds.filter(b => b.ward === ward && b.status === 'occupied');
    
    for (let i = 0; i < Math.abs(diff); i++) {
      if (i >= occupiedBeds.length) break;
      
      const bed = occupiedBeds[i];
      const patient = data.patients.find(p => p.patientId === bed.patientId);
      
      if (patient && !patient.actualDischarge) {
        // Discharge this patient on Dec 2nd
        const dischargeTime = new Date('2025-12-02T' + (10 + Math.floor(Math.random() * 8)) + ':00:00.000Z');
        patient.actualDischarge = dischargeTime.toISOString();
        patient.status = 'discharged';
        
        bed.status = Math.random() > 0.5 ? 'cleaning' : 'available';
        bed.patientId = null;
        bedOccupancy[bed.bedNumber] = null;
      }
    }
  }
});

// Set some available beds to cleaning status
const availableBeds = data.beds.filter(b => b.status === 'available');
const cleaningCount = 6;
for (let i = 0; i < Math.min(cleaningCount, availableBeds.length); i++) {
  availableBeds[i].status = 'cleaning';
}

// Verify final occupancy matches requirements
const finalOcc = {
  Emergency: data.beds.filter(b => b.ward === 'Emergency' && b.status === 'occupied').length,
  ICU: data.beds.filter(b => b.ward === 'ICU' && b.status === 'occupied').length,
  'General Ward': data.beds.filter(b => b.ward === 'General Ward' && b.status === 'occupied').length,
  Cardiology: data.beds.filter(b => b.ward === 'Cardiology' && b.status === 'occupied').length
};

console.log('\n[5/6] Final occupancy verification:');
console.log(`   Emergency:    ${finalOcc.Emergency}/10 (target: 8) ${finalOcc.Emergency === 8 ? '✓' : '✗'}`);
console.log(`   ICU:          ${finalOcc.ICU}/20 (target: 17) ${finalOcc.ICU === 17 ? '✓' : '✗'}`);
console.log(`   General Ward: ${finalOcc['General Ward']}/50 (target: 32) ${finalOcc['General Ward'] === 32 ? '✓' : '✗'}`);
console.log(`   Cardiology:   ${finalOcc.Cardiology}/20 (target: 8) ${finalOcc.Cardiology === 8 ? '✓' : '✗'}`);
const totalOcc = finalOcc.Emergency + finalOcc.ICU + finalOcc['General Ward'] + finalOcc.Cardiology;
console.log(`   Total:        ${totalOcc}/100 (target: 65) ${totalOcc === 65 ? '✓' : '✗'}`);

// Write to file
console.log('\n[6/6] Writing to file...');
const outputPath = '/home/piyush/Downloads/BedManager-14Nov-morning/BedManager-11Nov/backend/comprehensive_seed_data.json';
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
console.log(`   ✓ File written: ${outputPath}`);
console.log(`   ✓ File size: ${fileSize} MB`);

console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log('='.repeat(60));
console.log(`Beds:              ${data.beds.length}`);
console.log(`Patients:          ${data.patients.length} (${data.patients.filter(p => !p.actualDischarge).length} active, ${data.patients.filter(p => p.actualDischarge).length} discharged)`);
console.log(`Bed Requests:      ${data.bedRequests.length} (${data.bedRequests.filter(r => r.status === 'approved').length} approved, ${data.bedRequests.filter(r => r.status === 'denied').length} denied)`);
console.log(`Ward Transfers:    ${data.wardTransfers.length}`);
console.log(`Occupancy Records: ${data.occupancyHistory.length}`);
console.log(`Alerts:            ${data.alerts.length}`);
console.log('='.repeat(60));
console.log('✅ Seed data generation complete!');
console.log('='.repeat(60));
