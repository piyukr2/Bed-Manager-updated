const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Bed = require('../models/Bed');
require('dotenv').config();

const alertTypes = ['critical', 'warning', 'info', 'success', 'emergency'];
const wards = ['Emergency', 'ICU', 'General Ward', 'Cardiology'];

const alertMessages = {
  critical: [
    'Critical occupancy level reached',
    'Emergency capacity exceeded',
    'ICU at maximum capacity',
    'Immediate bed allocation required'
  ],
  warning: [
    'High occupancy level detected',
    'Low bed availability in ward',
    'Equipment maintenance required',
    'Staff shortage alert',
    'Patient transfer pending'
  ],
  info: [
    'New patient admission processed',
    'Bed cleaning completed',
    'Equipment status updated',
    'Ward capacity updated',
    'System maintenance scheduled'
  ],
  success: [
    'Patient successfully discharged',
    'Bed allocation completed',
    'Emergency admission processed',
    'Ward capacity normalized',
    'Equipment maintenance completed'
  ],
  emergency: [
    'Emergency admission required',
    'Critical patient incoming',
    'Immediate response needed',
    'Emergency protocol activated',
    'Urgent bed preparation required'
  ]
};

async function generateAlerts(count = 25) {
  try {
    // Build MongoDB URI with password from environment
    const dbPassword = process.env.DB_PASSWORD;
    let mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bedmanager';
    
    // Replace password placeholder if exists
    if (mongoURI.includes('<db_password>') && dbPassword) {
      mongoURI = mongoURI.replace('<db_password>', dbPassword);
    }
    
    await mongoose.connect(mongoURI);
    console.log('📦 Connected to MongoDB');

    // Get some bed IDs for reference
    const beds = await Bed.find().limit(10);
    const bedIds = beds.map(bed => bed._id);

    // Clear existing alerts (optional)
    // await Alert.deleteMany({});
    // console.log('🗑️  Cleared existing alerts');

    const alerts = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const type = alertTypes[Math.floor(Math.random() * alertTypes.length)];
      const ward = wards[Math.floor(Math.random() * wards.length)];
      const messages = alertMessages[type];
      const message = messages[Math.floor(Math.random() * messages.length)];
      
      // Create alerts with current time - let Mongoose handle timestamps
      // Don't set createdAt manually to ensure it's current
      const alert = {
        type,
        message: `${message}`,
        ward,
        bedId: bedIds.length > 0 ? bedIds[Math.floor(Math.random() * bedIds.length)] : null,
        acknowledged: Math.random() > 0.7, // 70% unacknowledged
        priority: type === 'critical' || type === 'emergency' ? 5 : type === 'warning' ? 3 : 1
      };

      if (alert.acknowledged) {
        alert.acknowledgedBy = `Staff${Math.floor(Math.random() * 10) + 1}`;
        alert.acknowledgedAt = new Date(); // Current time for acknowledgement
      }

      alerts.push(alert);
    }

    // Insert alerts
    const result = await Alert.insertMany(alerts);
    console.log(`✅ Inserted ${result.length} test alerts`);
    
    // Verify insertion with a count
    const insertedCount = await Alert.countDocuments();
    console.log(`📊 Count in database: ${insertedCount}`);

    // Show summary
    const summary = await Alert.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          acknowledged: { $sum: { $cond: ['$acknowledged', 1, 0] } }
        }
      }
    ]);

    console.log('\n📊 Alert Summary:');
    summary.forEach(item => {
      console.log(`  ${item._id}: ${item.count} total (${item.count - item.acknowledged} unacknowledged)`);
    });

    console.log('\n🎉 Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating alerts:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const count = process.argv[2] ? parseInt(process.argv[2]) : 25;
  generateAlerts(count);
}

module.exports = generateAlerts;
