import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Home from './components/Home';
import Dashboard from './components/Dashboard';
import BedGrid from './components/BedGrid';
import WardView from './components/WardView';
import OccupancyChart from './components/OccupancyChart';
import AlertPanel from './components/AlertPanel';
import EmergencyAdmission from './components/EmergencyAdmission';
import Login from './components/Login';
import CriticalAlertModal from './components/CriticalAlertModal';
import FloorPlan from './components/FloorPlan';
import ERStaffDashboard from './components/ERStaffDashboard';
import ICUManagerDashboard from './components/ICUManagerDashboard';
import WardStaffDashboard from './components/WardStaffDashboard';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

let socket;

function App() {
  const [showHome, setShowHome] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [beds, setBeds] = useState([]);
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedWard, setSelectedWard] = useState('All');
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [criticalAlerts, setCriticalAlerts] = useState([]);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('bedmanager-theme');
    if (stored) return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });
  const connectionLabel = connectionStatus === 'connected'
    ? 'Connected'
    : connectionStatus === 'error'
    ? 'Connection issue'
    : 'Offline';
  const [bedViewMode, setBedViewMode] = useState('ward'); // 'ward', 'floor', or 'grid'

  // Axios interceptor to add auth token
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => axios.interceptors.request.eject(interceptor);
  }, [token]);

  // Apply theme preference
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bedmanager-theme', theme);
  }, [theme]);

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      setShowHome(false);
      setShowLogin(false);
      if (user.ward) {
        setSelectedWard(user.ward);
      }
    }
  }, []);

  // Initialize Socket.IO when user is logged in
  useEffect(() => {
    if (!currentUser) return;

    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnection: true,
      reconnectionAttempts: 10,
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      setConnectionStatus('connected');
      
      if (currentUser.ward) {
        socket.emit('join-ward', currentUser.ward);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('error');
    });

    // Listen for real-time updates
    socket.on('bed-updated', (bed) => {
      setBeds(prevBeds => prevBeds.map(b => b._id === bed._id ? bed : b));
      fetchStats();
    });

    socket.on('patient-admitted', (patient) => {
      addAlert({
        type: 'success',
        message: `Patient ${patient.name} admitted to ${patient.bedId?.bedNumber}`,
        timestamp: new Date()
      });
      fetchBeds();
      fetchPatients();
      fetchStats();
    });

    socket.on('patient-discharged', ({ patient, bed }) => {
      addAlert({
        type: 'info',
        message: `Patient ${patient.name} discharged from ${bed?.bedNumber}`,
        timestamp: new Date()
      });
      fetchBeds();
      fetchPatients();
      fetchStats();
    });

    socket.on('new-alert', (alert) => {
      addAlert({
        type: alert.type,
        message: alert.message,
        timestamp: alert.createdAt || new Date(),
        ward: alert.ward
      });
    });

    socket.on('critical-vitals', (data) => {
      addAlert({
        type: 'critical',
        message: `CRITICAL: ${data.patient} vitals alert in ${data.ward}`,
        timestamp: new Date()
      });
    });

    socket.on('data-initialized', ({ bedsCreated, patientsCreated }) => {
      addAlert({
        type: 'success',
        message: `System initialized: ${bedsCreated} beds, ${patientsCreated} patients`,
        timestamp: new Date()
      });
      fetchData();
    });

    return () => {
      if (socket) {
        if (currentUser.ward) {
          socket.emit('leave-ward', currentUser.ward);
        }
        socket.disconnect();
      }
    };
  }, [currentUser, token]);

  // Fetch all data when user is logged in
  useEffect(() => {
    if (currentUser) {
      fetchData();
      initializeSampleData();

      const interval = setInterval(fetchData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleGetStarted = () => {
    setShowHome(false);
    setShowLogin(true);
  };

  const handleBackToHome = () => {
    setShowLogin(false);
    setShowHome(true);
  };

  const handleLogin = async (credentials) => {
    try {
      console.log('Attempting login...', { username: credentials.username });
      const response = await axios.post(`${API_URL}/auth/login`, credentials);
      const { token: newToken, user } = response.data;
      
      console.log('Login successful!', user);
      
      setToken(newToken);
      setCurrentUser(user);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(user));
      
      setShowLogin(false);
      setShowHome(false);
      
      if (user.ward) {
        setSelectedWard(user.ward);
      }
      
      addAlert({
        type: 'success',
        message: `Welcome back, ${user.name}!`,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Login error details:', error);
      throw error;
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (socket) {
      socket.disconnect();
    }
    setShowHome(true);
    setShowLogin(false);
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleViewModeChange = (mode) => {
    setBedViewMode(mode);
  };

  const initializeSampleData = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds`);
      if (response.data.length === 0) {
        console.log('No beds found, initializing sample data...');
        await axios.post(`${API_URL}/initialize`);
        fetchData();
      }
    } catch (error) {
      console.error('Error initializing data:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchBeds(), fetchStats(), fetchPatients(), fetchAlerts()]);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        handleLogout();
        addAlert({
          type: 'error',
          message: 'Session expired. Please login again.',
          timestamp: new Date()
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchBeds = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds`);
      setBeds(response.data);
    } catch (error) {
      console.error('Error fetching beds:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds/stats`);
      setStats(response.data);
      if (response.data.alert) {
        addAlert(response.data.alert);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await axios.get(`${API_URL}/patients`);
      setPatients(response.data);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await axios.get(`${API_URL}/alerts?limit=10&acknowledged=false`);
      const formattedAlerts = response.data.map(alert => ({
        type: alert.type,
        message: alert.message,
        timestamp: alert.createdAt,
        ward: alert.ward,
        id: alert._id
      }));
      setAlerts(formattedAlerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const addAlert = useCallback((alert) => {
    const alertId = alert.id || alert._id || `${Date.now()}-${Math.random()}`;
    const alertPayload = { ...alert, id: alertId };

    setAlerts(prevAlerts => {
      const newAlerts = [alertPayload, ...prevAlerts].slice(0, 10);
      return newAlerts;
    });

    if (alertPayload.type === 'critical') {
      setCriticalAlerts(prev => [...prev, alertPayload]);
    }
  }, []);

  const updateBedStatus = async (bedId, newStatus) => {
    try {
      await axios.put(`${API_URL}/beds/${bedId}`, { status: newStatus });
      addAlert({
        type: 'info',
        message: `Bed status updated to ${newStatus}`,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error updating bed:', error);
      addAlert({
        type: 'error',
        message: error.response?.data?.error || 'Failed to update bed status',
        timestamp: new Date()
      });
    }
  };

  const handleEmergencyAdmission = async (patientData) => {
    try {
      const response = await axios.post(`${API_URL}/patients`, patientData);
      setShowEmergencyModal(false);
      addAlert({
        type: 'success',
        message: `Emergency patient ${response.data.patient.name} admitted to bed ${response.data.bed.bedNumber}. ${response.data.matchLevel}`,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error admitting patient:', error);
      addAlert({
        type: 'error',
        message: error.response?.data?.error || 'Failed to admit patient',
        timestamp: new Date()
      });
    }
  };

  const dischargePatient = async (patientId) => {
    if (!window.confirm('Are you sure you want to discharge this patient?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API_URL}/patients/${patientId}`);
      addAlert({
        type: 'success',
        message: `Patient ${response.data.patient.name} discharged successfully`,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error discharging patient:', error);
      addAlert({
        type: 'error',
        message: error.response?.data?.error || 'Failed to discharge patient',
        timestamp: new Date()
      });
    }
  };

  const handleDismissCriticalAlert = () => {
    setCriticalAlerts(prev => prev.slice(1));
  };

  // Show home page
  if (showHome) {
    return (
      <Home
        onGetStarted={handleGetStarted}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // Show login screen
  if (showLogin) {
    return (
      <Login
        onLogin={handleLogin}
        onBack={handleBackToHome}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // Loading state for authenticated user
  if (loading && beds.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading BedManager...</p>
        <p className="connection-status">Status: {connectionStatus}</p>
      </div>
    );
  }

  // Role-based dashboard routing
  const renderDashboard = () => {
    const filteredBeds = selectedWard === 'All'
      ? beds
      : beds.filter(bed => bed.ward === selectedWard);

    const wards = currentUser.role === 'admin'
      ? ['All', ...new Set(beds.map(bed => bed.ward))]
      : currentUser.ward
      ? [currentUser.ward]
      : ['All', ...new Set(beds.map(bed => bed.ward))];

    switch (currentUser.role) {
      case 'er_staff':
        return (
          <ERStaffDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
            socket={socket}
          />
        );

      case 'icu_manager':
        return (
          <ICUManagerDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
            socket={socket}
            beds={beds}
            stats={stats}
            patients={patients}
            alerts={alerts}
            onUpdateBed={updateBedStatus}
            onEmergencyAdmission={handleEmergencyAdmission}
            onDischargePatient={dischargePatient}
            selectedWard={selectedWard}
            setSelectedWard={setSelectedWard}
          />
        );

      case 'ward_staff':
        return (
          <WardStaffDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
            socket={socket}
          />
        );

      case 'admin':
        return (
          <AdminDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
            socket={socket}
          />
        );

      default:
        // Fallback to original dashboard for unknown roles
        return (
          <div className="App">
            <header className="app-header">
              <div className="header-content">
                <div className="brand-identity">
                  <div className="brand-mark">BM</div>
                  <div className="brand-copy">
                    <h1>BedManager Command Center</h1>
                    <p className="subtitle">Hospital occupancy and critical care overview</p>
                  </div>
                </div>
              </div>
              <div className="header-actions">
                <div className="user-info">
                  <span className="user-name">{currentUser.name}</span>
                  <span className="user-role">({currentUser.role.replace('_', ' ')})</span>
                </div>
                <button className="logout-btn" onClick={handleLogout}>
                  Logout
                </button>
                <button
                  className="theme-toggle"
                  onClick={toggleTheme}
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  <span className="theme-icon">
                    {theme === 'light' ? '🌙' : '☀️'}
                  </span>
                </button>
              </div>
            </header>
            <div className="main-content">
              <p>Dashboard for role '{currentUser.role}' is not configured.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      {renderDashboard()}
      <CriticalAlertModal
        alert={criticalAlerts[0]}
        onDismiss={handleDismissCriticalAlert}
      />
    </>
  );
}

export default App;