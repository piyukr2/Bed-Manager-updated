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
    type: Number 
  },
  section: { 
    type: String 
  },
  roomNumber: { 
    type: String 
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed'],
    default: 'pending'
  },
  assignedToStaffId: { 
    type: String 
  },
  assignedToName: { 
    type: String 
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
cleaningJobSchema.index({ bedId: 1 });
cleaningJobSchema.index({ ward: 1, status: 1 });
cleaningJobSchema.index({ status: 1 });

module.exports = mongoose.model('CleaningJob', cleaningJobSchema);
