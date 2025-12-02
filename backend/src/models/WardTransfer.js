const mongoose = require('mongoose');

const wardTransferSchema = new mongoose.Schema({
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bed',
    required: true
  },
  newBedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bed'
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  currentWard: {
    type: String,
    required: true
  },
  targetWard: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: false,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'completed'],
    default: 'pending'
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  denyReason: {
    type: String
  },
  completedAt: {
    type: Date
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
wardTransferSchema.index({ status: 1 });
wardTransferSchema.index({ currentWard: 1 });
wardTransferSchema.index({ targetWard: 1 });
wardTransferSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WardTransfer', wardTransferSchema);