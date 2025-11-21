const mongoose = require('mongoose');

const bedSchema = new mongoose.Schema({
  bedNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  ward: { 
    type: String, 
    required: true,
    index: true 
  },
  status: { 
    type: String, 
    enum: ['available', 'occupied', 'cleaning', 'reserved', 'maintenance'],
    default: 'available',
    index: true
  },
  equipmentType: {
    type: String,
    enum: ['Standard', 'Ventilator', 'ICU Monitor', 'Cardiac Monitor', 'Dialysis'],
    default: 'Standard'
  },
  patientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Patient' 
  },
  location: {
    floor: Number,
    section: String,
    roomNumber: String
  },
  lastCleaned: Date,
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  },
  notes: String,
  maintenanceSchedule: {
    nextMaintenance: Date,
    lastMaintenance: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
bedSchema.index({ ward: 1, status: 1 });

module.exports = mongoose.model('Bed', bedSchema);