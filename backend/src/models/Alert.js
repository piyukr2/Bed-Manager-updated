const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['critical', 'warning', 'info', 'success', 'emergency'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  ward: String,
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bed'
  },
  acknowledged: {
    type: Boolean,
    default: false
  },
  acknowledgedBy: String,
  acknowledgedAt: Date,
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  }
}, {
  timestamps: true
});

// Auto-expire old alerts after 24 hours
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Alert', alertSchema);