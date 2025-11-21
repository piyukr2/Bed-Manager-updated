const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  // Singleton pattern - only one document should exist
  singleton: {
    type: String,
    default: 'settings',
    unique: true,
    required: true
  },

  // Occupancy Alert Thresholds
  thresholds: {
    warningThreshold: {
      type: Number,
      default: 80,
      min: 0,
      max: 100
    },
    criticalThreshold: {
      type: Number,
      default: 90,
      min: 0,
      max: 100
    }
  },

  // Reporting Configuration
  reporting: {
    defaultPeriod: {
      type: String,
      enum: ['24h', '7d', '30d'],
      default: '24h'
    },
    autoRefreshInterval: {
      type: Number,
      default: 60, // seconds
      min: 10,
      max: 300
    }
  },

  // Bed Reservation Policies
  reservationPolicies: {
    defaultReservationTTL: {
      type: Number,
      default: 2, // hours
      min: 1,
      max: 24
    },
    autoExpireReservations: {
      type: Boolean,
      default: true
    }
  },

  // Data Export Options
  exportOptions: {
    includePHI: {
      type: Boolean,
      default: false
    },
    defaultFormat: {
      type: String,
      enum: ['json', 'csv', 'pdf'],
      default: 'json'
    }
  },

  // Last updated info
  lastUpdatedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    name: String
  }
}, {
  timestamps: true
});

// Create default settings if none exist
systemSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ singleton: 'settings' });

  if (!settings) {
    settings = await this.create({ singleton: 'settings' });
  }

  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
