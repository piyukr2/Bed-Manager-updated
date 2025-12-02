/**
 * Database Cleanup Script
 * Clears all data from MongoDB cluster while keeping default users
 */

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

// MongoDB Atlas Configuration
const DB_PASSWORD = process.env.DB_PASSWORD || '<db_password>';
const MONGODB_URI = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace('<db_password>', DB_PASSWORD)
  : 'mongodb://localhost:27017/bedmanager';

// Import models
const Bed = require('../models/Bed');
const Patient = require('../models/Patient');
const BedRequest = require('../models/BedRequest');
const WardTransfer = require('../models/WardTransfer');
const Alert = require('../models/Alert');
const OccupancyHistory = require('../models/OccupancyHistory');
const SystemSettings = require('../models/SystemSettings');

// User Schema (same as in server.js)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'icu_manager', 'ward_staff', 'er_staff'],
    required: true 
  },
  ward: { type: String },
  email: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Create readline interface for confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function clearDatabase() {
  try {
    // Connect to MongoDB
    console.log('\n' + '='.repeat(70));
    console.log('🔌 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database:', mongoose.connection.name);
    console.log('='.repeat(70));

    // Get current counts
    console.log('\n📊 CURRENT DATABASE STATUS:');
    console.log('='.repeat(70));
    
    const counts = {
      users: await User.countDocuments(),
      beds: await Bed.countDocuments(),
      patients: await Patient.countDocuments(),
      bedRequests: await BedRequest.countDocuments(),
      wardTransfers: await WardTransfer.countDocuments(),
      alerts: await Alert.countDocuments(),
      occupancyHistory: await OccupancyHistory.countDocuments(),
      systemSettings: await SystemSettings.countDocuments()
    };

    console.log(`👥 Users:              ${counts.users}`);
    console.log(`🛏️  Beds:               ${counts.beds}`);
    console.log(`🏥 Patients:           ${counts.patients}`);
    console.log(`📋 Bed Requests:       ${counts.bedRequests}`);
    console.log(`🔄 Ward Transfers:     ${counts.wardTransfers}`);
    console.log(`🚨 Alerts:             ${counts.alerts}`);
    console.log(`📈 Occupancy History:  ${counts.occupancyHistory}`);
    console.log(`⚙️  System Settings:    ${counts.systemSettings}`);
    console.log('='.repeat(70));

    const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
    console.log(`📊 TOTAL RECORDS: ${totalRecords}`);
    console.log('='.repeat(70));

    // Show what will be deleted
    console.log('\n⚠️  WARNING: The following data will be PERMANENTLY DELETED:');
    console.log('='.repeat(70));
    console.log('✅ ALL Users (will be recreated automatically on server restart)');
    console.log('✅ ALL Beds');
    console.log('✅ ALL Patients');
    console.log('✅ ALL Bed Requests');
    console.log('✅ ALL Ward Transfers');
    console.log('✅ ALL Alerts');
    console.log('✅ ALL Occupancy History');
    console.log('✅ ALL System Settings');
    console.log('='.repeat(70));

    console.log('\n📌 NOTE: Default users will be auto-created on next server start:');
    console.log('   • admin / admin123 (Administrator)');
    console.log('   • anuradha / password123 (ICU Manager)');
    console.log('   • wardstaff / ward123 (Ward Staff)');
    console.log('   • erstaff / er123 (ER Staff)');
    console.log('='.repeat(70));

    // Ask for confirmation
    console.log('\n🚨 THIS ACTION CANNOT BE UNDONE! 🚨\n');
    const answer = await askQuestion('Type "DELETE ALL DATA" to confirm (or anything else to cancel): ');

    if (answer.trim() !== 'DELETE ALL DATA') {
      console.log('\n❌ Operation cancelled. No data was deleted.');
      await mongoose.connection.close();
      rl.close();
      process.exit(0);
    }

    // Perform deletion
    console.log('\n🗑️  Starting deletion process...');
    console.log('='.repeat(70));

    const deletionResults = {};

    // Delete Users
    process.stdout.write('Deleting Users... ');
    const usersResult = await User.deleteMany({});
    deletionResults.users = usersResult.deletedCount;
    console.log(`✅ Deleted ${usersResult.deletedCount} users`);

    // Delete Beds
    process.stdout.write('Deleting Beds... ');
    const bedsResult = await Bed.deleteMany({});
    deletionResults.beds = bedsResult.deletedCount;
    console.log(`✅ Deleted ${bedsResult.deletedCount} beds`);

    // Delete Patients
    process.stdout.write('Deleting Patients... ');
    const patientsResult = await Patient.deleteMany({});
    deletionResults.patients = patientsResult.deletedCount;
    console.log(`✅ Deleted ${patientsResult.deletedCount} patients`);

    // Delete Bed Requests
    process.stdout.write('Deleting Bed Requests... ');
    const requestsResult = await BedRequest.deleteMany({});
    deletionResults.bedRequests = requestsResult.deletedCount;
    console.log(`✅ Deleted ${requestsResult.deletedCount} bed requests`);

    // Delete Ward Transfers
    process.stdout.write('Deleting Ward Transfers... ');
    const transfersResult = await WardTransfer.deleteMany({});
    deletionResults.wardTransfers = transfersResult.deletedCount;
    console.log(`✅ Deleted ${transfersResult.deletedCount} ward transfers`);

    // Delete Alerts
    process.stdout.write('Deleting Alerts... ');
    const alertsResult = await Alert.deleteMany({});
    deletionResults.alerts = alertsResult.deletedCount;
    console.log(`✅ Deleted ${alertsResult.deletedCount} alerts`);

    // Delete Occupancy History
    process.stdout.write('Deleting Occupancy History... ');
    const historyResult = await OccupancyHistory.deleteMany({});
    deletionResults.occupancyHistory = historyResult.deletedCount;
    console.log(`✅ Deleted ${historyResult.deletedCount} occupancy records`);

    // Delete System Settings
    process.stdout.write('Deleting System Settings... ');
    const settingsResult = await SystemSettings.deleteMany({});
    deletionResults.systemSettings = settingsResult.deletedCount;
    console.log(`✅ Deleted ${settingsResult.deletedCount} system settings`);

    console.log('='.repeat(70));

    // Summary
    const totalDeleted = Object.values(deletionResults).reduce((sum, count) => sum + count, 0);
    console.log('\n✅ DATABASE CLEANUP COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log(`📊 TOTAL RECORDS DELETED: ${totalDeleted}`);
    console.log('='.repeat(70));

    console.log('\n📋 Deletion Summary:');
    Object.entries(deletionResults).forEach(([collection, count]) => {
      console.log(`   • ${collection}: ${count}`);
    });

    console.log('\n✨ Your database is now clean!');
    console.log('\n📌 NEXT STEPS:');
    console.log('   1. Start your backend server: npm start');
    console.log('   2. Default users will be created automatically');
    console.log('   3. You can now seed new data or start fresh');
    console.log('='.repeat(70));

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed\n');
    rl.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR during cleanup:', error);
    await mongoose.connection.close();
    rl.close();
    process.exit(1);
  }
}

// Run the cleanup function
clearDatabase();
