const mongoose = require('mongoose');

const occupancyHistorySchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  totalBeds: Number,
  occupied: Number,
  available: Number,
  cleaning: Number,
  reserved: Number,
  maintenance: Number,
  occupancyRate: Number,
  wardStats: [{
    ward: String,
    total: Number,
    occupied: Number,
    available: Number,
    occupancyRate: Number
  }],
  peakHour: Boolean // Flag to indicate if this is a peak occupancy hour
}, {
  timestamps: true
});

// Create index for time-series queries
occupancyHistorySchema.index({ timestamp: -1 });

module.exports = mongoose.model('OccupancyHistory', occupancyHistorySchema);