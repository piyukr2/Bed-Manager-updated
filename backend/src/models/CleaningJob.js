const mongoose = require('mongoose');

const cleaningJobSchema = new mongoose.Schema({
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bed',
    required: true
  },
  bedNumber: {
    type: String,
    required: true
  },
  ward: {
    type: String,
    required: true
  },
  floor: {
    type: Number,
    required: true
  },
  section: {
    type: String,
    required: true
  },
  roomNumber: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed'],
    default: 'pending'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CleaningStaff',
    default: null
  },
  assignedToName: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
});

// Index for faster queries
cleaningJobSchema.index({ status: 1, createdAt: -1 });
cleaningJobSchema.index({ floor: 1, status: 1 });
cleaningJobSchema.index({ ward: 1, status: 1 });

module.exports = mongoose.model('CleaningJob', cleaningJobSchema);
