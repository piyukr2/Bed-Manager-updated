const express = require('express');
const mongoose = require('mongoose');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const os = require('os');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3000$/,
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:3000$/,
      /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:3000$/
    ];
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      }
      return allowed.test(origin);
    });
    
    if (isAllowed || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Atlas Configuration
const DB_PASSWORD = process.env.DB_PASSWORD || '<db_password>';
const MONGODB_URI = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace('<db_password>', DB_PASSWORD)
  : 'mongodb://localhost:27017/bedmanager';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Get local network IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

console.log('📄 Connecting to MongoDB...');

// User Schema for Role-Based Access
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

// Function to create default users
async function createDefaultUsers() {
  try {
    console.log('\n' + '='.repeat(50));
    console.log('👥 Checking Default Users...');
    console.log('='.repeat(50));
    
    const defaultUsers = [
      { username: 'anuradha', password: 'password123', name: 'Anuradha', role: 'icu_manager', ward: 'ICU', email: 'anuradha@hospital.com' },
      { username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', ward: null, email: 'admin@hospital.com' },
      { username: 'wardstaff', password: 'ward123', name: 'Ward Staff', role: 'ward_staff', ward: 'General Ward', email: 'wardstaff@hospital.com' },
      { username: 'erstaff', password: 'er123', name: 'ER Staff', role: 'er_staff', ward: 'Emergency', email: 'erstaff@hospital.com' }
    ];
    
    let created = 0;
    let existing = 0;
    
    for (const userData of defaultUsers) {
      try {
        const existingUser = await User.findOne({ username: userData.username });
        
        if (!existingUser) {
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          await User.create({ ...userData, password: hashedPassword });
          console.log(`✅ Created user: ${userData.username} (${userData.role}${userData.ward ? ' - ' + userData.ward : ''})`);
          created++;
        } else {
          console.log(`ℹ️  User exists: ${userData.username} (${existingUser.role}${existingUser.ward ? ' - ' + existingUser.ward : ''})`);
          existing++;
        }
      } catch (userError) {
        console.error(`❌ Error with user ${userData.username}:`, userError.message);
      }
    }
    
    console.log('='.repeat(50));
    console.log(`📊 Summary: ${created} created, ${existing} already existed`);
    console.log('='.repeat(50) + '\n');
    
    if (created > 0) {
      console.log('🎉 Default users are ready!');
      console.log('Login credentials:');
      console.log('  • anuradha / password123 (ICU Manager)');
      console.log('  • admin / admin123 (Administrator)');
      console.log('  • wardstaff / ward123 (Ward Staff)');
      console.log('  • erstaff / er123 (ER Staff)');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error creating default users:', error.message);
  }
}

// Function to create default cleaning staff
async function createDefaultCleaningStaff() {
  try {
    const CleaningStaff = require('./models/CleaningStaff');
    
    console.log('\n' + '='.repeat(50));
    console.log('🧹 Checking Cleaning Staff...');
    console.log('='.repeat(50));
    
    const existingCount = await CleaningStaff.countDocuments();
    
    if (existingCount >= 10) {
      console.log(`ℹ️  ${existingCount} cleaning staff members already exist`);
      console.log('='.repeat(50) + '\n');
      return;
    }
    
    const staffNames = [
      'Rajesh Kumar', 'Priya Sharma', 'Amit Patel', 'Sunita Devi',
      'Mohan Singh', 'Kavita Reddy', 'Ramesh Yadav', 'Anita Gupta',
      'Suresh Joshi', 'Meena Verma'
    ];
    
    let created = 0;
    
    for (let i = 0; i < 10; i++) {
      const staffId = `CS${String(i + 1).padStart(3, '0')}`;
      const existing = await CleaningStaff.findOne({ staffId });
      
      if (!existing) {
        await CleaningStaff.create({
          staffId,
          name: staffNames[i],
          status: 'available',
          activeJobsCount: 0,
          totalJobsCompleted: 0
        });
        console.log(`✅ Created cleaning staff: ${staffId} - ${staffNames[i]}`);
        created++;
      }
    }
    
    if (created > 0) {
      console.log('='.repeat(50));
      console.log(`📊 Summary: ${created} cleaning staff created`);
      console.log('='.repeat(50) + '\n');
      console.log('🎉 Cleaning staff are ready!');
      console.log('');
    } else {
      console.log('='.repeat(50) + '\n');
    }
    
  } catch (error) {
    console.error('❌ Error creating cleaning staff:', error.message);
  }
}

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
})
.then(async () => {
  console.log('✅ MongoDB connected successfully via Mongoose');
  console.log('📊 Database:', mongoose.connection.name);
  
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log("✅ Pinged your deployment. Successfully connected to MongoDB Atlas!");
  } catch (pingError) {
    console.log("⚠️  Could not ping database, but connection is active");
  }
  
  await createDefaultUsers();
  await createDefaultCleaningStaff();

  // Start scheduled jobs
  const { startReservationExpiryJob } = require('./jobs/reservationExpiry');
  startReservationExpiryJob(io);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('💡 Please check your .env file and database password');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected successfully');
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role, ward, email } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      password: hashedPassword,
      name,
      role,
      ward,
      email
    });

    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        ward: user.ward
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username, 
        role: user.role,
        ward: user.ward,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        ward: user.ward
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import routes - UPDATED PATHS
const bedRoutes = require('./routes/beds');
const patientRoutes = require('./routes/patients');
const alertRoutes = require('./routes/alerts');
const bedRequestRoutes = require('./routes/bedRequests');

// Socket.IO Connection
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log('👤 Client connected:', socket.id);
  connectedClients.set(socket.id, { connectedAt: new Date() });
  
  io.emit('client-count', connectedClients.size);
  
  socket.on('disconnect', () => {
    console.log('👤 Client disconnected:', socket.id);
    connectedClients.delete(socket.id);
    io.emit('client-count', connectedClients.size);
  });
  
  socket.on('join-ward', (ward) => {
    socket.join(`ward-${ward}`);
    console.log(`👥 User ${socket.id} joined ward: ${ward}`);
  });
  
  socket.on('leave-ward', (ward) => {
    socket.leave(`ward-${ward}`);
    console.log(`👥 User ${socket.id} left ward: ${ward}`);
  });

  socket.on('subscribe-bed', (bedId) => {
    socket.join(`bed-${bedId}`);
    console.log(`🛏️  User subscribed to bed: ${bedId}`);
  });
  
  socket.on('unsubscribe-bed', (bedId) => {
    socket.leave(`bed-${bedId}`);
    console.log(`🛏️  User unsubscribed from bed: ${bedId}`);
  });
});

// Make io accessible to routes
app.set('io', io);

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Apply authentication to protected routes
app.use('/api/beds', authenticateToken, bedRoutes);
app.use('/api/patients', authenticateToken, patientRoutes);
app.use('/api/alerts', authenticateToken, alertRoutes);
app.use('/api/bed-requests', authenticateToken, bedRequestRoutes);

// System settings routes
const systemSettingsRoutes = require('./routes/systemSettings');
app.use('/api/settings', authenticateToken, systemSettingsRoutes);

// Cleaning management routes
const cleaningJobRoutes = require('./routes/cleaningJobs');
const cleaningStaffRoutes = require('./routes/cleaningStaff');
app.use('/api/cleaning-jobs', authenticateToken, cleaningJobRoutes);
app.use('/api/cleaning-staff', authenticateToken, cleaningStaffRoutes);

// Database status endpoint
app.get('/api/db-status', async (req, res) => {
  try {
    const status = {
      mongoose: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      },
      clients: {
        connected: connectedClients.size
      }
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.db.admin().command({ ping: 1 });
        status.mongoose.ping = 'success';
      } catch (pingError) {
        status.mongoose.ping = 'failed';
      }
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Network info endpoint
app.get('/api/network-info', (req, res) => {
  const localIP = getLocalIPAddress();
  const port = process.env.PORT || 5000;
  const frontendPort = 3000;
  
  res.json({
    localIP,
    backendURL: `http://${localIP}:${port}`,
    frontendURL: `http://${localIP}:${frontendPort}`,
    qrURL: `http://${localIP}:${frontendPort}`,
    note: 'Use these URLs to access from mobile devices on the same network'
  });
});

// Test connection endpoint
app.get('/api/test-connection', (req, res) => {
  const localIP = getLocalIPAddress();
  res.json({
    message: 'Connection successful!',
    timestamp: new Date(),
    serverIP: localIP,
    clientIP: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin || 'No origin header'
  });
});

// Initialize sample data - UPDATED MODEL PATHS
app.post('/api/initialize', async (req, res) => {
  try {
    const Bed = require('./models/Bed');
    const Patient = require('./models/Patient');
    
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await createDefaultUsers();
    }
    
    const existingBeds = await Bed.countDocuments();
    if (existingBeds > 0) {
      return res.json({ 
        message: 'Data already exists', 
        bedsCount: existingBeds,
        usersCount: await User.countDocuments(),
        note: 'Use /api/reset to clear and reinitialize'
      });
    }
    
    // Ward to floor mapping: Emergency (Ground/0), ICU (1), Cardiology (2), General Ward (3)
    const wards = ['Emergency', 'ICU', 'Cardiology', 'General Ward'];
    const floors = [0, 1, 2, 3]; // Ground floor = 0
    const beds = [];
    
    for (let i = 1; i <= 60; i++) {
      const wardIndex = Math.floor((i - 1) / 15);
      const ward = wards[wardIndex];
      
      let equipmentType = 'Standard';
      if (ward === 'ICU') {
        equipmentType = i % 3 === 0 ? 'Ventilator' : 'ICU Monitor';
      } else if (ward === 'Cardiology') {
        equipmentType = 'Cardiac Monitor';
      } else if (ward === 'Emergency') {
        equipmentType = i % 2 === 0 ? 'Ventilator' : 'Standard';
      }
      
      let status = 'available';
      if (i <= 35) status = 'occupied';
      else if (i <= 38) status = 'cleaning';
      else if (i <= 40) status = 'reserved';
      
      const bedNumber = `BED-${String(i).padStart(3, '0')}`;
      const existingBed = await Bed.findOne({ bedNumber });
      
      if (!existingBed) {
        beds.push({
          bedNumber,
          ward,
          status: status,
          equipmentType,
          location: {
            floor: floors[wardIndex],
            section: String.fromCharCode(65 + Math.floor((i - 1) % 15 / 5)),
            roomNumber: `R${String(Math.floor((i - 1) % 5) + 1).padStart(2, '0')}`
          },
          lastCleaned: status === 'available' ? new Date() : null
        });
      }
    }
    
    const createdBeds = beds.length > 0 ? await Bed.insertMany(beds) : [];
    
    const occupiedBeds = createdBeds.filter(b => b.status === 'occupied');
    const samplePatients = [];
    
    for (let i = 0; i < Math.min(10, occupiedBeds.length); i++) {
      const bed = occupiedBeds[i];
      const admissionDate = new Date();
      admissionDate.setHours(admissionDate.getHours() - Math.floor(Math.random() * 48));
      
      const patientId = `PAT-${String(i + 1).padStart(4, '0')}`;
      
      const existingPatient = await Patient.findOne({ patientId });
      
      if (!existingPatient) {
        samplePatients.push({
          patientId,
          name: `Patient ${i + 1}`,
          age: 20 + Math.floor(Math.random() * 60),
          gender: i % 2 === 0 ? 'Male' : 'Female',
          department: bed.ward === 'ICU' ? 'Critical Care' : bed.ward,
          reasonForAdmission: 'Sample admission for testing',
          estimatedStay: 24 + Math.floor(Math.random() * 72),
          admissionDate: admissionDate,
          bedId: bed._id,
          status: 'admitted'
        });
      }
    }
    
    if (samplePatients.length > 0) {
      await Patient.insertMany(samplePatients);
    }
    
    // Populate 30 days of historical occupancy data with ward-wise breakdown
    console.log('📊 Generating 30 days of historical occupancy data...');
    const OccupancyHistory = require('./models/OccupancyHistory');

    const historicalData = [];
    const now = new Date();
    const totalBedsCount = 60; // 15 beds per ward x 4 wards
    const bedsPerWard = 15;
    // Reuse the wards array from above

    for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
      const timestamp = new Date(now);
      timestamp.setDate(timestamp.getDate() - daysAgo);
      timestamp.setHours(12, 0, 0, 0); // Set to noon for each day

      const dayOfWeek = timestamp.getDay(); // 0 = Sunday, 6 = Saturday

      // Generate ward-wise data
      const wardStats = [];
      let totalOccupied = 0;
      let totalAvailable = 0;
      let totalCleaning = 0;
      let totalReserved = 0;

      wards.forEach((wardName) => {
        // Base occupancy with weekly cycle (varies by ward)
        let baseOccupancy = 0.70 + (Math.sin((daysAgo / 7) * Math.PI) * 0.10);

        // Ward-specific adjustments
        if (wardName === 'ICU') {
          baseOccupancy += 0.10; // ICU tends to be busier
        } else if (wardName === 'Emergency') {
          baseOccupancy += 0.05; // Emergency also busy
        } else if (wardName === 'General Ward') {
          baseOccupancy -= 0.05; // General ward slightly less busy
        }

        // Weekend effect (lower occupancy on weekends)
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          baseOccupancy -= 0.08;
        }

        // Monday spike (admissions from weekend)
        if (dayOfWeek === 1) {
          baseOccupancy += 0.12;
        }

        // Random events (hospital surges, seasonal patterns)
        const randomEvent = Math.random();
        if (randomEvent > 0.92) {
          baseOccupancy += 0.15 + (Math.random() * 0.10);
        } else if (randomEvent < 0.05) {
          baseOccupancy -= 0.10 + (Math.random() * 0.08);
        }

        // Add daily random variation
        const dailyVariation = (Math.random() - 0.5) * 0.15;

        // Seasonal trend
        const monthEffect = Math.sin((daysAgo / 30) * Math.PI) * 0.05;

        const occupancyRate = Math.max(0.45, Math.min(0.98, baseOccupancy + dailyVariation + monthEffect));

        const occupied = Math.floor(bedsPerWard * occupancyRate);
        const cleaningRate = 0.03 + (Math.random() * 0.04);
        const cleaning = Math.floor(bedsPerWard * cleaningRate);
        const reservedRate = 0.02 + (Math.random() * 0.05);
        const reserved = Math.floor(bedsPerWard * reservedRate);
        const available = Math.max(0, bedsPerWard - occupied - cleaning - reserved);

        wardStats.push({
          ward: wardName,
          total: bedsPerWard,
          occupied,
          available,
          cleaning,
          reserved,
          occupancyRate: parseFloat((occupancyRate * 100).toFixed(1))
        });

        totalOccupied += occupied;
        totalAvailable += available;
        totalCleaning += cleaning;
        totalReserved += reserved;
      });

      const overallOccupancyRate = parseFloat(((totalOccupied / totalBedsCount) * 100).toFixed(1));

      historicalData.push({
        timestamp,
        totalBeds: totalBedsCount,
        occupied: totalOccupied,
        available: totalAvailable,
        cleaning: totalCleaning,
        reserved: totalReserved,
        occupancyRate: overallOccupancyRate,
        wardStats,
        peakHour: overallOccupancyRate >= 85
      });
    }

    if (historicalData.length > 0) {
      await OccupancyHistory.insertMany(historicalData);
      console.log(`✅ Created ${historicalData.length} historical occupancy records with ward-wise data`);
    }

    io.emit('data-initialized', {
      bedsCreated: beds.length,
      patientsCreated: samplePatients.length,
      historicalRecords: historicalData.length
    });

    res.json({
      message: 'Sample data initialized successfully',
      bedsCreated: beds.length,
      patientsCreated: samplePatients.length,
      historicalRecords: historicalData.length,
      usersCount: await User.countDocuments(),
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Initialization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset database - UPDATED MODEL PATHS
app.post('/api/reset', async (req, res) => {
  try {
    const Bed = require('./models/Bed');
    const Patient = require('./models/Patient');
    const OccupancyHistory = require('./models/OccupancyHistory');
    const Alert = require('./models/Alert');
    
    await Bed.deleteMany({});
    await Patient.deleteMany({});
    await OccupancyHistory.deleteMany({});
    await Alert.deleteMany({});
    
    io.emit('data-reset', { timestamp: new Date() });
    
    res.json({ 
      message: 'Database reset successfully',
      note: 'Call /api/initialize to create sample data'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create users endpoint
app.post('/api/create-users', async (req, res) => {
  try {
    console.log('\n👥 Manual user creation triggered...\n');
    
    const defaultUsers = [
      { username: 'anuradha', password: 'password123', name: 'Anuradha', role: 'icu_manager', ward: 'ICU', email: 'anuradha@hospital.com' },
      { username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', ward: null, email: 'admin@hospital.com' },
      { username: 'wardstaff', password: 'ward123', name: 'Ward Staff', role: 'ward_staff', ward: 'General Ward', email: 'wardstaff@hospital.com' },
      { username: 'erstaff', password: 'er123', name: 'ER Staff', role: 'er_staff', ward: 'Emergency', email: 'erstaff@hospital.com' }
    ];
    
    const results = [];
    let created = 0;
    let existing = 0;
    
    for (const userData of defaultUsers) {
      try {
        const existingUser = await User.findOne({ username: userData.username });
        if (!existingUser) {
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          const newUser = await User.create({ ...userData, password: hashedPassword });
          results.push({
            username: userData.username,
            status: 'created',
            role: userData.role,
            ward: userData.ward
          });
          created++;
          console.log(`✅ Created user: ${userData.username}`);
        } else {
          results.push({
            username: userData.username,
            status: 'already_exists',
            role: existingUser.role,
            ward: existingUser.ward
          });
          existing++;
          console.log(`ℹ️  User already exists: ${userData.username}`);
        }
      } catch (userError) {
        results.push({
          username: userData.username,
          status: 'error',
          error: userError.message
        });
        console.error(`❌ Error creating user ${userData.username}:`, userError.message);
      }
    }
    
    console.log(`\n📊 Summary: ${created} created, ${existing} already existed\n`);
    
    res.json({
      message: 'User creation process completed',
      created,
      existing,
      total: defaultUsers.length,
      results,
      credentials: created > 0 ? {
        note: 'Login credentials for new users:',
        users: [
          'anuradha / password123 (ICU Manager)',
          'admin / admin123 (Administrator)', 
          'wardstaff / ward123 (Ward Staff)',
          'erstaff / er123 (ER Staff)'
        ]
      } : null
    });
  } catch (error) {
    console.error('Error creating users:', error);
    res.status(500).json({ error: error.message });
  }
});

// List users endpoint
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json({
      count: users.length,
      users: users.map(u => ({
        id: u._id,
        username: u.username,
        name: u.name,
        role: u.role,
        ward: u.ward,
        email: u.email,
        createdAt: u.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'BedManager API v2.0 - Enhanced with Role-Based Access',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      dbStatus: '/api/db-status',
      networkInfo: '/api/network-info',
      testConnection: '/api/test-connection',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      createUsers: 'POST /api/create-users',
      listUsers: 'GET /api/users',
      beds: '/api/beds',
      patients: '/api/patients',
      alerts: '/api/alerts',
      initialize: 'POST /api/initialize',
      reset: 'POST /api/reset'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  const localIP = getLocalIPAddress();
  console.log('\n' + '='.repeat(50));
  console.log('🏥 BedManager Server v2.0 Started');
  console.log('='.repeat(50));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📱 Network URL: http://${localIP}:${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📱 Mobile Access: http://${localIP}:3000`);
  console.log(`⚡ Socket.IO enabled for real-time updates`);
  console.log(`🗄️  Database: MongoDB Atlas`);
  console.log(`🔐 Role-based access control enabled`);
  console.log(`👥 Default users auto-created on startup`);
  console.log('='.repeat(50));
  console.log('\n💡 Tip: Access http://localhost:5000 for API endpoints');
  console.log(`💡 Mobile Tip: Visit http://${localIP}:5000/api/network-info`);
  console.log('');
});

module.exports = { app, server, io };