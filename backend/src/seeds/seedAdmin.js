const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

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

// Admin user configuration - CHANGE THESE VALUES AS NEEDED
const ADMIN_CONFIG = {
  username: 'admin',        // Change to your desired username
  password: 'admin123',     // Change to your desired password
  name: 'Admin User',       // Change to your desired name
  role: 'admin',
  ward: null,
  email: 'admin@hospital.com' // Change to your desired email (optional)
};

async function seedAdmin() {
  try {
    // Connect to MongoDB
    console.log('\n' + '='.repeat(60));
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('='.repeat(60));

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: ADMIN_CONFIG.username });
    
    if (existingAdmin) {
      console.log('\n⚠️  Admin user already exists!');
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      console.log('\n💡 To update, delete the existing user first or change the username in this file.');
    } else {
      // Hash password
      console.log('\n🔐 Hashing password...');
      const hashedPassword = await bcrypt.hash(ADMIN_CONFIG.password, 10);
      
      // Create admin user
      console.log('👤 Creating admin user...');
      const adminUser = await User.create({
        username: ADMIN_CONFIG.username,
        password: hashedPassword,
        name: ADMIN_CONFIG.name,
        role: ADMIN_CONFIG.role,
        ward: ADMIN_CONFIG.ward,
        email: ADMIN_CONFIG.email
      });

      console.log('\n' + '='.repeat(60));
      console.log('✅ Admin User Created Successfully!');
      console.log('='.repeat(60));
      console.log('\n📋 Admin Details:');
      console.log(`   Username: ${adminUser.username}`);
      console.log(`   Password: ${ADMIN_CONFIG.password} (saved as hash)`);
      console.log(`   Name: ${adminUser.name}`);
      console.log(`   Role: ${adminUser.role}`);
      console.log(`   Email: ${adminUser.email || 'Not provided'}`);
      console.log(`   Created: ${adminUser.createdAt}`);
      console.log('\n🔑 Login Credentials:');
      console.log(`   Username: ${adminUser.username}`);
      console.log(`   Password: ${ADMIN_CONFIG.password}`);
      console.log('='.repeat(60));
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    console.log('\n✨ Seed process completed!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error seeding admin user:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedAdmin();
