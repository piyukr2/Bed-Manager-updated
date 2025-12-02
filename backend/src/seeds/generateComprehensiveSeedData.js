const fs = require('fs');
const { ObjectId } = require('mongodb');

// Configuration
const WARDS = {
  'ICU': { capacity: 20, equipment: ['Ventilator', 'ICU Monitor'] },
  'General Ward': { capacity: 50, equipment: ['Standard'] },
  'Cardiology': { capacity: 20, equipment: ['Cardiac Monitor'] },
  'Emergency': { capacity: 10, equipment: ['Standard', 'Ventilator'] }
};

const FINAL_OCCUPANCY = {
  'ICU': 17,
  'General Ward': 32,
  'Cardiology': 8,
  'Emergency': 8
};

// Indian names pool
const INDIAN_NAMES = {
  male: [
    'Raj Kumar', 'Amit Sharma', 'Vikram Singh', 'Arjun Patel', 'Rohan Verma',
    'Sanjay Gupta', 'Ajay Reddy', 'Karan Malhotra', 'Rahul Nair', 'Aditya Joshi',
    'Manoj Kumar', 'Ravi Shankar', 'Suresh Babu', 'Ankit Agarwal', 'Nikhil Mehta',
    'Varun Krishna', 'Harsh Saxena', 'Deepak Rao', 'Gaurav Kapoor', 'Mohit Bhatia',
    'Abhishek Iyer', 'Vishal Desai', 'Prakash Pillai', 'Ashok Naidu', 'Ramesh Chand',
    'Satish Menon', 'Pankaj Thakur', 'Sandeep Kulkarni', 'Rajesh Sinha', 'Naveen Chawla',
    'Anil Pandey', 'Vinod Kumar', 'Sunil Yadav', 'Mukesh Singh', 'Devendra Prabhu',
    'Gopal Krishnan', 'Hari Om', 'Jagdish Prasad', 'Krishna Murthy', 'Lakshman Rao',
    'Mahesh Babu', 'Naresh Kumar', 'Om Prakash', 'Pranav Mishra', 'Raghav Reddy',
    'Shyam Sundar', 'Tarun Jain', 'Uday Shankar', 'Vijay Kumar', 'Yash Chopra'
  ],
  female: [
    'Priya Sharma', 'Anjali Patel', 'Neha Verma', 'Pooja Gupta', 'Ritu Singh',
    'Kavita Reddy', 'Sunita Nair', 'Meera Iyer', 'Divya Joshi', 'Sneha Malhotra',
    'Rekha Desai', 'Anita Kumar', 'Geeta Pillai', 'Shilpa Rao', 'Nisha Kapoor',
    'Swati Mehta', 'Vidya Menon', 'Asha Kulkarni', 'Radha Naidu', 'Lakshmi Babu',
    'Sita Agarwal', 'Uma Saxena', 'Vaishali Thakur', 'Deepika Sinha', 'Komal Bhatia',
    'Nidhi Chawla', 'Preeti Pandey', 'Rashmi Yadav', 'Sapna Singh', 'Tanvi Prabhu',
    'Aditi Krishnan', 'Bhavana Om', 'Chandrika Prasad', 'Devika Murthy', 'Ekta Rao',
    'Falguni Babu', 'Garima Kumar', 'Harini Mishra', 'Indira Reddy', 'Jyoti Sundar',
    'Kalpana Jain', 'Lalita Shankar', 'Madhuri Kumar', 'Namita Chopra', 'Pallavi Singh'
  ]
};

const ADMISSION_REASONS = {
  'ICU': [
    'Severe respiratory distress',
    'Post-operative monitoring',
    'Septic shock',
    'Multi-organ failure',
    'Acute respiratory failure',
    'Cardiac arrest recovery',
    'Severe trauma',
    'Post-cardiac surgery'
  ],
  'General Ward': [
    'Fever and infection',
    'Appendectomy recovery',
    'Diabetes management',
    'Pneumonia',
    'Gastroenteritis',
    'Minor surgery recovery',
    'Observation post-treatment',
    'Routine procedure'
  ],
  'Cardiology': [
    'Acute myocardial infarction',
    'Heart failure',
    'Arrhythmia',
    'Chest pain evaluation',
    'Post-angioplasty monitoring',
    'Valve disorder',
    'Hypertensive crisis',
    'Cardiac catheterization'
  ],
  'Emergency': [
    'Road traffic accident',
    'Acute chest pain',
    'Severe bleeding',
    'Stroke symptoms',
    'Allergic reaction',
    'Trauma',
    'Acute abdomen',
    'Poisoning'
  ]
};

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(array) {
  return array[randomInt(0, array.length - 1)];
}

function generatePhone() {
  return `+91-${randomInt(70000, 99999)}-${randomInt(10000, 99999)}`;
}

function getAdmissionTimeInRange(date, isEmergencyOnly) {
  const d = new Date(date);
  if (isEmergencyOnly) {
    // 10 PM to 8 AM next day
    if (Math.random() < 0.5) {
      // 10 PM to midnight
      d.setHours(22 + randomInt(0, 1), randomInt(0, 59), randomInt(0, 59));
    } else {
      // Midnight to 8 AM
      d.setHours(randomInt(0, 7), randomInt(0, 59), randomInt(0, 59));
    }
  } else {
    // 8 AM to 10 PM
    d.setHours(8 + randomInt(0, 13), randomInt(0, 59), randomInt(0, 59));
  }
  return d;
}

function getDischargeTime(date) {
  const d = new Date(date);
  // 10 AM to 6 PM
  d.setHours(10 + randomInt(0, 7), randomInt(0, 59), randomInt(0, 59));
  return d;
}

function generatePatientId() {
  return `PAT-${Date.now()}-${randomInt(1000, 9999)}`;
}

function generateBedNumber(ward, index) {
  const prefix = {
    'ICU': 'ICU',
    'General Ward': 'GEN',
    'Cardiology': 'CAR',
    'Emergency': 'EMR'
  };
  return `${prefix[ward]}-${String(index + 1).padStart(3, '0')}`;
}

// Main generator class
class SeedDataGenerator {
  constructor() {
    this.beds = [];
    this.patients = [];
    this.bedRequests = [];
    this.occupancyHistory = [];

    this.startDate = new Date('2025-10-04T00:00:00.000Z');
    this.endDate = new Date('2025-12-03T08:00:00.000Z');
    this.currentDate = new Date(this.startDate);

    this.wardOccupancy = {};
    this.bedIdMap = {};
    this.usedNames = new Set();

    this.initializeWards();
    this.generateBeds();
  }

  initializeWards() {
    Object.keys(WARDS).forEach(ward => {
      this.wardOccupancy[ward] = {
        occupied: [],
        available: [],
        cleaning: [],
        reserved: []
      };
    });
  }

  generateBeds() {
    let bedIndex = 0;
    Object.entries(WARDS).forEach(([ward, config]) => {
      for (let i = 0; i < config.capacity; i++) {
        const bedId = new ObjectId().toString();
        const bed = {
          _id: bedId,
          bedNumber: generateBedNumber(ward, i),
          ward: ward,
          status: 'available',
          equipmentType: randomElement(config.equipment),
          location: {
            floor: Math.floor(i / 10) + 1,
            section: String.fromCharCode(65 + Math.floor((i % 10) / 5)),
            roomNumber: `${Math.floor(i / 2) + 1}`
          },
          lastUpdated: this.startDate.toISOString(),
          createdAt: this.startDate.toISOString(),
          updatedAt: this.startDate.toISOString()
        };
        this.beds.push(bed);
        this.bedIdMap[bedId] = bed;
        this.wardOccupancy[ward].available.push(bedId);
        bedIndex++;
      }
    });
    console.log(`Generated ${this.beds.length} beds`);
  }

  getUniqueName() {
    let name;
    let attempts = 0;
    do {
      const gender = Math.random() < 0.5 ? 'male' : 'female';
      name = randomElement(INDIAN_NAMES[gender]);
      attempts++;
    } while (this.usedNames.has(name) && attempts < 100);

    if (this.usedNames.has(name)) {
      name = `${name} ${randomInt(1, 999)}`;
    }
    this.usedNames.add(name);
    return { name, gender: name.includes(INDIAN_NAMES.male.find(n => n === name)) ? 'Male' : 'Female' };
  }

  findAvailableBed(ward, equipmentType = null) {
    const available = this.wardOccupancy[ward].available;
    if (available.length === 0) return null;

    if (equipmentType) {
      const matchingBed = available.find(bedId =>
        this.bedIdMap[bedId].equipmentType === equipmentType
      );
      if (matchingBed) return matchingBed;
    }

    return available[0];
  }

  admitPatient(ward, admissionDate, requestSource = 'ER', isReservation = false) {
    const bedId = this.findAvailableBed(ward);
    if (!bedId) {
      console.log(`No available beds in ${ward} on ${admissionDate.toISOString()}`);
      return null;
    }

    const { name, gender } = this.getUniqueName();
    const patientId = generatePatientId();
    const bed = this.bedIdMap[bedId];

    // Calculate stay duration (minimum 2 days, up to 10 days)
    const stayHours = (randomInt(2, 10) * 24) + randomInt(0, 23);
    const expectedDischarge = new Date(admissionDate.getTime() + (stayHours * 60 * 60 * 1000));

    const patient = {
      _id: new ObjectId().toString(),
      patientId: patientId,
      name: name,
      age: randomInt(18, 85),
      gender: gender === 'Male' ? 'Male' : 'Female',
      contactNumber: generatePhone(),
      emergencyContact: {
        name: randomElement(INDIAN_NAMES[gender === 'Male' ? 'female' : 'male']),
        relation: randomElement(['Spouse', 'Parent', 'Sibling', 'Child']),
        phone: generatePhone()
      },
      department: ward,
      reasonForAdmission: randomElement(ADMISSION_REASONS[ward]),
      estimatedStay: stayHours,
      admissionDate: admissionDate.toISOString(),
      expectedDischarge: expectedDischarge.toISOString(),
      bedId: bedId,
      status: randomElement(['admitted', 'stable', 'recovering']),
      transferHistory: [],
      vitals: [],
      medications: [],
      createdAt: admissionDate.toISOString(),
      updatedAt: admissionDate.toISOString()
    };

    this.patients.push(patient);

    // Update bed status
    const bedStatus = isReservation ? 'reserved' : 'occupied';
    this.moveBed(bedId, ward, 'available', bedStatus);
    bed.status = bedStatus;
    bed.patientId = patient._id;
    bed.lastUpdated = admissionDate.toISOString();

    return patient;
  }

  dischargePatient(patientId, dischargeDate) {
    const patient = this.patients.find(p => p._id === patientId);
    if (!patient || patient.actualDischarge) return false;

    patient.actualDischarge = dischargeDate.toISOString();
    patient.status = 'discharged';
    patient.updatedAt = dischargeDate.toISOString();

    const bed = this.bedIdMap[patient.bedId];
    bed.status = 'cleaning';
    bed.patientId = null;
    bed.lastUpdated = dischargeDate.toISOString();
    bed.lastCleaned = dischargeDate.toISOString();

    this.moveBed(patient.bedId, bed.ward, 'occupied', 'cleaning');

    // Schedule bed to become available after 2-4 hours
    const cleaningDuration = randomInt(2, 4) * 60 * 60 * 1000;
    const availableDate = new Date(dischargeDate.getTime() + cleaningDuration);

    setTimeout(() => {
      if (bed.status === 'cleaning') {
        bed.status = 'available';
        bed.lastUpdated = availableDate.toISOString();
        this.moveBed(patient.bedId, bed.ward, 'cleaning', 'available');
      }
    }, 0); // Will be executed immediately but tracked for future

    return true;
  }

  transferPatient(patientId, fromWard, toWard, transferDate, reason) {
    const patient = this.patients.find(p => p._id === patientId);
    if (!patient || patient.actualDischarge) return false;

    const newBedId = this.findAvailableBed(toWard);
    if (!newBedId) return false;

    const oldBed = this.bedIdMap[patient.bedId];
    const newBed = this.bedIdMap[newBedId];

    patient.transferHistory.push({
      fromBed: oldBed.bedNumber,
      toBed: newBed.bedNumber,
      timestamp: transferDate.toISOString(),
      reason: reason
    });

    // Update old bed
    oldBed.status = 'cleaning';
    oldBed.patientId = null;
    oldBed.lastUpdated = transferDate.toISOString();
    this.moveBed(patient.bedId, fromWard, 'occupied', 'cleaning');

    // Update patient
    patient.bedId = newBedId;
    patient.department = toWard;
    patient.reasonForAdmission = randomElement(ADMISSION_REASONS[toWard]);
    patient.updatedAt = transferDate.toISOString();

    // Update new bed
    newBed.status = 'occupied';
    newBed.patientId = patient._id;
    newBed.lastUpdated = transferDate.toISOString();
    this.moveBed(newBedId, toWard, 'available', 'occupied');

    // Old bed becomes available after cleaning
    const cleaningDuration = randomInt(2, 4) * 60 * 60 * 1000;
    setTimeout(() => {
      if (oldBed.status === 'cleaning') {
        oldBed.status = 'available';
        this.moveBed(oldBed._id, fromWard, 'cleaning', 'available');
      }
    }, 0);

    return true;
  }

  moveBed(bedId, ward, fromStatus, toStatus) {
    const fromArray = this.wardOccupancy[ward][fromStatus];
    const toArray = this.wardOccupancy[ward][toStatus];

    const index = fromArray.indexOf(bedId);
    if (index > -1) {
      fromArray.splice(index, 1);
      toArray.push(bedId);
    }
  }

  getCurrentOccupancy(timestamp) {
    const occupancy = {
      timestamp: timestamp.toISOString(),
      totalBeds: this.beds.length,
      occupied: 0,
      available: 0,
      cleaning: 0,
      reserved: 0,
      maintenance: 0,
      occupancyRate: 0,
      wardStats: [],
      hourlyData: []
    };

    Object.entries(this.wardOccupancy).forEach(([ward, status]) => {
      const total = WARDS[ward].capacity;
      const occupied = status.occupied.length;
      const available = status.available.length;
      const cleaning = status.cleaning.length;
      const reserved = status.reserved.length;

      occupancy.occupied += occupied;
      occupancy.available += available;
      occupancy.cleaning += cleaning;
      occupancy.reserved += reserved;

      occupancy.wardStats.push({
        ward: ward,
        total: total,
        occupied: occupied,
        available: available,
        cleaning: cleaning,
        reserved: reserved,
        occupancyRate: parseFloat(((occupied / total) * 100).toFixed(2))
      });
    });

    occupancy.occupancyRate = parseFloat(((occupancy.occupied / occupancy.totalBeds) * 100).toFixed(2));

    return occupancy;
  }

  generateHourlyOccupancy(date) {
    const hourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourDate = new Date(date);
      hourDate.setHours(hour, 0, 0, 0);

      const hourOccupancy = {
        hour: hour,
        totalBeds: this.beds.length,
        occupied: 0,
        available: 0,
        cleaning: 0,
        reserved: 0,
        occupancyRate: 0,
        wardStats: []
      };

      Object.entries(this.wardOccupancy).forEach(([ward, status]) => {
        const total = WARDS[ward].capacity;
        const occupied = status.occupied.length;
        const available = status.available.length;
        const cleaning = status.cleaning.length;
        const reserved = status.reserved.length;

        hourOccupancy.occupied += occupied;
        hourOccupancy.available += available;
        hourOccupancy.cleaning += cleaning;
        hourOccupancy.reserved += reserved;

        hourOccupancy.wardStats.push({
          ward: ward,
          total: total,
          occupied: occupied,
          available: available,
          cleaning: cleaning,
          reserved: reserved,
          occupancyRate: parseFloat(((occupied / total) * 100).toFixed(2))
        });
      });

      hourOccupancy.occupancyRate = parseFloat(((hourOccupancy.occupied / hourOccupancy.totalBeds) * 100).toFixed(2));
      hourlyData.push(hourOccupancy);
    }

    return hourlyData;
  }

  generateBedRequest(patient, ward, requestDate, requestSource, priority, isReservation = false) {
    const request = {
      _id: new ObjectId().toString(),
      requestId: `REQ-${String(this.bedRequests.length + 1).padStart(6, '0')}`,
      createdBy: {
        userId: new ObjectId().toString(),
        username: requestSource === 'ER' ? 'erstaff' : 'manager',
        name: requestSource === 'ER' ? 'ER Staff' : 'ICU Manager'
      },
      patientDetails: {
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        contactNumber: patient.contactNumber,
        reasonForAdmission: patient.reasonForAdmission,
        requiredEquipment: this.bedIdMap[patient.bedId].equipmentType,
        estimatedStay: patient.estimatedStay
      },
      preferredWard: ward,
      eta: isReservation ? patient.admissionDate : new Date(requestDate.getTime() + 30 * 60 * 1000).toISOString(),
      status: 'approved',
      assignedBed: {
        bedId: patient.bedId,
        bedNumber: this.bedIdMap[patient.bedId].bedNumber,
        ward: ward
      },
      reviewedBy: {
        userId: new ObjectId().toString(),
        username: 'manager',
        name: 'ICU Manager',
        reviewedAt: new Date(requestDate.getTime() + 15 * 60 * 1000).toISOString()
      },
      priority: priority,
      fulfilledAt: patient.admissionDate,
      createdAt: requestDate.toISOString(),
      updatedAt: new Date(requestDate.getTime() + 15 * 60 * 1000).toISOString()
    };

    this.bedRequests.push(request);
    return request;
  }

  simulateDay(date) {
    console.log(`Simulating ${date.toDateString()}...`);

    // Determine if this should be a high-occupancy day (20% chance)
    const isHighOccupancyDay = Math.random() < 0.20;
    const targetHighOccupancyWard = isHighOccupancyDay ? randomElement(Object.keys(WARDS)) : null;

    // Clean beds first - any bed in cleaning for 2+ hours becomes available
    this.beds.forEach(bed => {
      if (bed.status === 'cleaning' && bed.lastCleaned) {
        const cleaningTime = new Date(bed.lastCleaned);
        const hoursSinceCleaning = (date - cleaningTime) / (1000 * 60 * 60);
        if (hoursSinceCleaning >= 2) {
          bed.status = 'available';
          bed.lastUpdated = date.toISOString();
          this.moveBed(bed._id, bed.ward, 'cleaning', 'available');
        }
      }
    });

    // Process discharges FIRST for patients whose expected discharge is today or earlier
    const dischargeDate = getDischargeTime(date);
    const patientsToDischarge = this.patients.filter(p =>
      !p.actualDischarge &&
      new Date(p.expectedDischarge) <= date
    );

    patientsToDischarge.forEach(patient => {
      // On high occupancy days, delay some discharges
      const dischargeProb = isHighOccupancyDay ? 0.6 : 0.9;
      if (Math.random() < dischargeProb) {
        this.dischargePatient(patient._id, dischargeDate);
      } else if (isHighOccupancyDay) {
        // Extend discharge by 1 day
        const newDischarge = new Date(patient.expectedDischarge);
        newDischarge.setDate(newDischarge.getDate() + 1);
        patient.expectedDischarge = newDischarge.toISOString();
      }
    });

    // Night admissions (10 PM previous day to 8 AM) - Emergency only
    const nightAdmissions = isHighOccupancyDay ? randomInt(1, 3) : randomInt(0, 2);
    for (let i = 0; i < nightAdmissions; i++) {
      if (this.wardOccupancy['Emergency'].available.length > 0) {
        const admissionTime = getAdmissionTimeInRange(date, true);
        const patient = this.admitPatient('Emergency', admissionTime, 'ER', false);
        if (patient) {
          this.generateBedRequest(patient, 'Emergency', admissionTime, 'ER', 5, false);
        }
      }
    }

    // Daytime admissions (8 AM to 10 PM) - Any ward
    const baseAdmissions = isHighOccupancyDay ? randomInt(8, 15) : randomInt(3, 8);
    const wards = Object.keys(WARDS);

    for (let i = 0; i < baseAdmissions; i++) {
      let ward;

      // On high occupancy days, bias towards the target ward
      if (isHighOccupancyDay && targetHighOccupancyWard && Math.random() < 0.5) {
        ward = targetHighOccupancyWard;
      } else {
        ward = randomElement(wards);
      }

      // On high occupancy days, admit even with fewer beds available
      const minAvailableBeds = isHighOccupancyDay ? 0 : 2;
      if (this.wardOccupancy[ward].available.length > minAvailableBeds) {
        const admissionTime = getAdmissionTimeInRange(date, false);
        const isReservation = Math.random() < 0.3; // 30% reservations
        const patient = this.admitPatient(ward, admissionTime, Math.random() < 0.7 ? 'ER' : 'Manager', isReservation);

        if (patient) {
          const priority = ward === 'ICU' ? randomInt(4, 5) : randomInt(2, 4);
          this.generateBedRequest(patient, ward, admissionTime, Math.random() < 0.7 ? 'ER' : 'Manager', priority, isReservation);
        }
      }
    }

    // Random transfers (1-3 per day, reduced)
    const transfers = randomInt(1, 3);
    const transferReasons = [
      'Clinical condition improved - step down',
      'Requires specialized care',
      'Condition deteriorated',
      'Bed optimization',
      'Patient request'
    ];

    for (let i = 0; i < transfers; i++) {
      const activePatients = this.patients.filter(p =>
        !p.actualDischarge &&
        new Date(p.admissionDate) < date &&
        (date - new Date(p.admissionDate)) > (24 * 60 * 60 * 1000) // At least 1 day old
      );

      if (activePatients.length > 5) {
        const patient = randomElement(activePatients);
        const currentWard = this.bedIdMap[patient.bedId].ward;
        const possibleWards = Object.keys(WARDS).filter(w => w !== currentWard && this.wardOccupancy[w].available.length > 1);

        if (possibleWards.length > 0) {
          const targetWard = randomElement(possibleWards);
          const transferTime = new Date(date);
          transferTime.setHours(randomInt(9, 17), randomInt(0, 59), 0);

          this.transferPatient(
            patient._id,
            currentWard,
            targetWard,
            transferTime,
            randomElement(transferReasons)
          );
        }
      }
    }

    // Generate hourly occupancy data for this day
    const hourlyData = this.generateHourlyOccupancy(date);

    // Generate daily occupancy snapshot
    const dailyOccupancy = this.getCurrentOccupancy(date);
    dailyOccupancy.hourlyData = hourlyData;
    this.occupancyHistory.push(dailyOccupancy);

    // Log if high occupancy achieved
    if (isHighOccupancyDay) {
      const overallOccupancy = dailyOccupancy.occupancyRate;
      dailyOccupancy.wardStats.forEach(ws => {
        if (ws.occupancyRate >= 90) {
          console.log(`  🔥 HIGH OCCUPANCY: ${ws.ward} at ${ws.occupancyRate.toFixed(1)}%`);
        }
      });
      if (overallOccupancy >= 90) {
        console.log(`  🔥 HIGH OCCUPANCY: Hospital-wide at ${overallOccupancy.toFixed(1)}%`);
      }
    }
  }

  adjustToFinalOccupancy() {
    console.log('\n========================================');
    console.log('FINAL OCCUPANCY ADJUSTMENT');
    console.log('========================================\n');

    const finalDate = new Date(this.endDate);
    const dec2Date = new Date('2025-12-02T00:00:00.000Z');

    // Step 1: Discharge ALL currently admitted patients
    console.log('Step 1: Discharging all current patients...');
    const allAdmittedPatients = this.patients.filter(p => !p.actualDischarge);
    allAdmittedPatients.forEach(patient => {
      const dischargeTime = getDischargeTime(dec2Date);
      this.dischargePatient(patient._id, dischargeTime);
    });

    // Step 2: Clean all beds immediately
    console.log('Step 2: Cleaning all beds...');
    this.beds.forEach(bed => {
      if (bed.status !== 'available') {
        bed.status = 'available';
        bed.patientId = null;
        bed.lastUpdated = new Date('2025-12-02T18:00:00.000Z').toISOString();
        bed.lastCleaned = new Date('2025-12-02T16:00:00.000Z').toISOString();
      }
    });

    // Step 3: Reset ward occupancy tracking
    console.log('Step 3: Resetting ward occupancy tracking...');
    Object.keys(WARDS).forEach(ward => {
      this.wardOccupancy[ward] = {
        occupied: [],
        available: [],
        cleaning: [],
        reserved: []
      };
    });

    // Rebuild available beds lists
    this.beds.forEach(bed => {
      this.wardOccupancy[bed.ward].available.push(bed._id);
    });

    // Step 4: Admit exact number of patients per ward
    console.log('Step 4: Admitting patients to match final occupancy...\n');

    Object.entries(FINAL_OCCUPANCY).forEach(([ward, targetCount]) => {
      console.log(`${ward}: Admitting ${targetCount} patients...`);

      for (let i = 0; i < targetCount; i++) {
        // Vary admission times over the last 3 days
        const daysBack = randomInt(1, 3);
        const admissionTime = new Date(finalDate.getTime() - (daysBack * 24 * 60 * 60 * 1000));

        // Emergency morning admissions between midnight and 8 AM
        if (ward === 'Emergency' && i >= targetCount - 2) {
          admissionTime.setTime(finalDate.getTime());
          admissionTime.setHours(randomInt(0, 7), randomInt(0, 59), 0);
        } else {
          admissionTime.setHours(randomInt(8, 20), randomInt(0, 59), 0);
        }

        const { name, gender } = this.getUniqueName();
        const bedId = this.wardOccupancy[ward].available[0];

        if (!bedId) {
          console.log(`  ERROR: No available bed in ${ward}!`);
          continue;
        }

        const bed = this.bedIdMap[bedId];
        const patientId = generatePatientId();

        const patient = {
          _id: new ObjectId().toString(),
          patientId: patientId,
          name: name,
          age: randomInt(18, 85),
          gender: gender === 'Male' ? 'Male' : 'Female',
          contactNumber: generatePhone(),
          emergencyContact: {
            name: randomElement(INDIAN_NAMES[gender === 'Male' ? 'female' : 'male']),
            relation: randomElement(['Spouse', 'Parent', 'Sibling', 'Child']),
            phone: generatePhone()
          },
          department: ward,
          reasonForAdmission: randomElement(ADMISSION_REASONS[ward]),
          estimatedStay: randomInt(72, 168), // 3-7 days
          admissionDate: admissionTime.toISOString(),
          expectedDischarge: new Date('2025-12-06T14:00:00.000Z').toISOString(), // After demo
          bedId: bedId,
          status: randomElement(['admitted', 'stable', 'recovering']),
          transferHistory: [],
          vitals: [],
          medications: [],
          createdAt: admissionTime.toISOString(),
          updatedAt: admissionTime.toISOString()
        };

        this.patients.push(patient);

        // Update bed
        bed.status = 'occupied';
        bed.patientId = patient._id;
        bed.lastUpdated = admissionTime.toISOString();

        // Update occupancy tracking
        this.moveBed(bedId, ward, 'available', 'occupied');

        // Create bed request
        this.generateBedRequest(
          patient,
          ward,
          admissionTime,
          ward === 'Emergency' ? 'ER' : 'Manager',
          ward === 'ICU' ? 4 : ward === 'Emergency' ? 5 : 3,
          false
        );
      }

      console.log(`  ✓ ${ward}: ${this.wardOccupancy[ward].occupied.length}/${WARDS[ward].capacity} occupied`);
    });

    console.log('\n========================================');
    console.log('FINAL OCCUPANCY ADJUSTMENT COMPLETE');
    console.log('========================================\n');
  }

  generate() {
    console.log('Starting seed data generation...');
    console.log(`Period: ${this.startDate.toISOString()} to ${this.endDate.toISOString()}`);

    // Simulate each day
    let currentDate = new Date(this.startDate);
    while (currentDate < this.endDate) {
      this.simulateDay(currentDate);
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Adjust to final occupancy
    this.adjustToFinalOccupancy();

    // Final occupancy snapshot
    const finalOccupancy = this.getCurrentOccupancy(this.endDate);
    finalOccupancy.hourlyData = this.generateHourlyOccupancy(this.endDate);
    this.occupancyHistory.push(finalOccupancy);

    console.log('\nGeneration complete!');
    console.log(`Total patients: ${this.patients.length}`);
    console.log(`Total bed requests: ${this.bedRequests.length}`);
    console.log(`Occupancy history records: ${this.occupancyHistory.length}`);

    console.log('\nFinal occupancy:');
    Object.entries(WARDS).forEach(([ward]) => {
      const occupied = this.wardOccupancy[ward].occupied.length;
      console.log(`  ${ward}: ${occupied}/${WARDS[ward].capacity}`);
    });

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        period: {
          start: this.startDate.toISOString(),
          end: this.endDate.toISOString()
        },
        wardCapacities: Object.fromEntries(
          Object.entries(WARDS).map(([k, v]) => [k, v.capacity])
        ),
        finalOccupancy: FINAL_OCCUPANCY,
        counts: {
          beds: this.beds.length,
          patients: this.patients.length,
          bedRequests: this.bedRequests.length,
          occupancyRecords: this.occupancyHistory.length
        }
      },
      beds: this.beds,
      patients: this.patients,
      bedRequests: this.bedRequests,
      occupancyHistory: this.occupancyHistory
    };
  }
}

// Generate and save
console.log('BedManager Comprehensive Seed Data Generator');
console.log('='.repeat(60));

const generator = new SeedDataGenerator();
const data = generator.generate();

const outputPath = __dirname + '/../../comprehensive_seed_data.json';
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

console.log(`\nSeed data saved to: ${outputPath}`);
console.log('\nYou can now import this data using the admin settings page.');
