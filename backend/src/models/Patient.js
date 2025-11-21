const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  patientId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  age: {
    type: Number,
    required: true,
    min: 0,
    max: 150
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  contactNumber: String,
  emergencyContact: {
    name: String,
    relation: String,
    phone: String
  },
  department: {
    type: String,
    required: true
  },
  reasonForAdmission: {
    type: String,
    required: true
  },
  estimatedStay: {
    type: Number, // in hours
    default: 24
  },
  admissionDate: { 
    type: Date, 
    default: Date.now 
  },
  expectedDischarge: Date,
  actualDischarge: Date,
  bedId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bed' 
  },
  vitals: [{
    timestamp: Date,
    bloodPressure: String,
    heartRate: Number,
    temperature: Number,
    oxygenLevel: Number
  }],
  medications: [{
    name: String,
    dosage: String,
    frequency: String,
    startDate: Date,
    endDate: Date
  }],
  status: {
    type: String,
    enum: ['admitted', 'critical', 'stable', 'recovering', 'discharged'],
    default: 'admitted'
  },
  transferHistory: [{
    fromBed: String,
    toBed: String,
    timestamp: Date,
    reason: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Patient', patientSchema);