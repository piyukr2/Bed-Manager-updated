const mongoose = require('mongoose');

const bedRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    index: true
  },
  createdBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    name: String
  },
  patientDetails: {
    name: { type: String, required: true },
    age: { type: Number, required: true, min: 0, max: 150 },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    contactNumber: String,
    triageLevel: {
      type: String,
      enum: ['Critical', 'Urgent', 'Semi-Urgent', 'Non-Urgent'],
      required: true
    },
    reasonForAdmission: { type: String, required: true },
    requiredEquipment: {
      type: String,
      enum: ['Standard', 'Ventilator', 'ICU Monitor', 'Cardiac Monitor', 'Dialysis'],
      default: 'Standard'
    },
    estimatedStay: Number // in hours
  },
  preferredWard: String,
  eta: Date, // Expected time of arrival
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'fulfilled', 'cancelled', 'expired'],
    default: 'pending',
    index: true
  },
  assignedBed: {
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    bedNumber: String,
    ward: String
  },
  reviewedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    name: String,
    reviewedAt: Date
  },
  denialReason: String,
  notes: String,
  priority: {
    type: Number,
    default: 3, // 1=lowest, 5=highest
    min: 1,
    max: 5
  },
  reservationTTL: Date, // Time-to-live for bed reservation
  fulfilledAt: Date,
  cancelledAt: Date,
  cancelledBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    reason: String
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String
  }
}, {
  timestamps: true
});

// Index for faster queries
bedRequestSchema.index({ status: 1, createdAt: -1 });
bedRequestSchema.index({ 'createdBy.userId': 1 });
bedRequestSchema.index({ 'assignedBed.bedId': 1 });

// Auto-generate requestId before save
bedRequestSchema.pre('save', async function(next) {
  if (!this.requestId) {
    const count = await mongoose.model('BedRequest').countDocuments();
    this.requestId = `REQ-${String(count + 1).padStart(6, '0')}`;
  }

  // Set priority based on triage level
  if (this.patientDetails.triageLevel === 'Critical') {
    this.priority = 5;
  } else if (this.patientDetails.triageLevel === 'Urgent' || this.patientDetails.triageLevel === 'Semi-Urgent') {
    this.priority = 3;
  } else {
    this.priority = 2;
  }

  next();
});

module.exports = mongoose.model('BedRequest', bedRequestSchema);
