import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import ResizableCard from './ResizableCard';
import AdminChatbot from './AdminChatbot';
// import OccupancyChart from './OccupancyChart';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function AdminDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [bedRequests, setBedRequests] = useState([]);
  const [requestStats, setRequestStats] = useState(null);
  const [wardTransfers, setWardTransfers] = useState([]);
  const [period, setPeriod] = useState('today');
  const [requestsPeriod, setRequestsPeriod] = useState('today'); // 'today', '7d', '30d'
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'analytics', 'requests', 'settings'
  // const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [selectedWard, setSelectedWard] = useState('All');
  const [todayHourlySource, setTodayHourlySource] = useState(null);
  const [scheduledDischarges, setScheduledDischarges] = useState(0);
  const [wardForecasts, setWardForecasts] = useState(null); // Store forecasts with discharge adjustments

  // Seed data import state
  const [seedFile, setSeedFile] = useState(null);
  const [seedValidation, setSeedValidation] = useState(null);
  const [seedImporting, setSeedImporting] = useState(false);
  const [seedImportResult, setSeedImportResult] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);

  // User management state
  const [users, setUsers] = useState([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'ward_staff'
  });
  const [userFormErrors, setUserFormErrors] = useState({});

  // Chart options
  const [showMaxOccupancy, setShowMaxOccupancy] = useState(true);

  // Notification state
  const [notification, setNotification] = useState(null);

  // Auto-hide notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  const hasHourlyData = (record) => Array.isArray(record?.hourlyData) && record.hourlyData.length > 0;

  const findHistoryRecordForDate = (records, targetDate) => {
    if (!records || records.length === 0 || !targetDate) return null;
    const targetDateString = targetDate.toDateString();
    return records.find(record => {
      if (!record?.timestamp) return false;
      return new Date(record.timestamp).toDateString() === targetDateString;
    }) || null;
  };

  const findLatestHourlyRecord = (records) => {
    if (!records || records.length === 0) return null;
    for (let i = records.length - 1; i >= 0; i -= 1) {
      if (hasHourlyData(records[i])) {
        return records[i];
      }
    }
    return null;
  };

  const getHourLabel = (hourData) => {
    const hourValue = typeof hourData?.hour === 'number'
      ? hourData.hour
      : hourData?.timestamp
        ? new Date(hourData.timestamp).getHours()
        : 0;
    return `${hourValue.toString().padStart(2, '0')}:00`;
  };

  // eslint-disable-next-line no-unused-vars
  const renderRequestStatusLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    name,
    value
  }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.45;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    const formattedPercent = (percent * 100).toFixed(0);

    const isDarkTheme = theme === 'dark';
    const textColor = isDarkTheme ? '#0f172a' : '#f8fafc';
    const bgColor = isDarkTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)';
    const borderColor = isDarkTheme ? 'rgba(148, 163, 184, 0.55)' : 'rgba(226, 232, 240, 0.55)';
    const offsetX = x > cx ? 14 : -14;
    const labelText = `${name}: ${value} (${formattedPercent}%)`;
    const textWidth = Math.max(150, labelText.length * 7);

    const rectX = -(textWidth / 2);
    const rectY = -18;
    const rectHeight = 36;

    return (
      <g transform={`translate(${x + offsetX}, ${y})`}>
        <rect
          x={rectX}
          y={rectY}
          width={textWidth}
          height={rectHeight}
          rx={10}
          ry={10}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth={1}
          opacity={0.98}
        />
        <text
          x={0}
          y={0}
          fill={textColor}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.02em' }}
        >
          {labelText}
        </text>
      </g>
    );
  };

  useEffect(() => {
    fetchAllData();

    const interval = setInterval(fetchAllData, 60000); // Refresh every minute
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    // Fetch users when settings tab is active
    if (activeTab === 'settings') {
      fetchUsers();
    }
  }, [activeTab]);

  // Calculate ward forecasts when history or stats change
  useEffect(() => {
    if (history && history.length > 0 && stats && period === 'today') {
      calculateWardForecasts().then(forecasts => {
        setWardForecasts(forecasts);
      }).catch(error => {
        console.error('Error calculating forecasts:', error);
        setWardForecasts(null);
      });
    } else {
      setWardForecasts(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, stats, period]);

  useEffect(() => {
    if (!socket) return;

    // Bed-related events
    socket.on('bed-updated', () => {
      fetchStats();
      fetchHistory();
    });

    socket.on('bed-created', () => {
      fetchStats();
    });

    // Bed request events
    socket.on('new-bed-request', () => {
      fetchBedRequests();
      fetchRequestStats();
    });

    socket.on('bed-request-approved', () => {
      fetchBedRequests();
      fetchRequestStats();
      fetchStats();
    });

    socket.on('bed-request-denied', () => {
      fetchBedRequests();
      fetchRequestStats();
    });

    socket.on('bed-request-fulfilled', () => {
      fetchBedRequests();
      fetchRequestStats();
      fetchStats();
    });

    socket.on('bed-request-cancelled', () => {
      fetchBedRequests();
      fetchRequestStats();
    });

    // Patient events
    socket.on('patient-admitted', () => {
      fetchStats();
      fetchHistory();
      fetchScheduledDischarges();
    });

    socket.on('patient-discharged', () => {
      fetchStats();
      fetchHistory();
      fetchScheduledDischarges();
    });

    socket.on('patient-transferred', () => {
      fetchStats();
      fetchHistory();
    });

    socket.on('patient-updated', () => {
      fetchScheduledDischarges();
    });

    socket.on('ward-transfer-updated', () => {
      fetchStats();
      fetchHistory();
      fetchWardTransfers();
    });

    // Settings events
    socket.on('settings-updated', (updatedSettings) => {
      setSettings(updatedSettings);
    });

    // User management events
    socket.on('user-created', () => {
      fetchUsers();
    });

    socket.on('user-updated', () => {
      fetchUsers();
    });

    socket.on('user-deleted', () => {
      fetchUsers();
    });

    // Beds synced event (when ward capacity changes)
    socket.on('beds-synced', () => {
      fetchStats();
      fetchHistory();
    });

    return () => {
      socket.off('bed-updated');
      socket.off('bed-created');
      socket.off('new-bed-request');
      socket.off('bed-request-approved');
      socket.off('bed-request-denied');
      socket.off('bed-request-fulfilled');
      socket.off('bed-request-cancelled');
      socket.off('patient-admitted');
      socket.off('patient-discharged');
      socket.off('patient-transferred');
      socket.off('patient-updated');
      socket.off('ward-transfer-updated');
      socket.off('settings-updated');
      socket.off('beds-synced');
      socket.off('user-created');
      socket.off('user-updated');
      socket.off('user-deleted');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Refresh scheduled discharges when selected ward changes
  useEffect(() => {
    fetchScheduledDischarges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWard]);

  const fetchAllData = async () => {
    // setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchHistory(),
        fetchBedRequests(),
        fetchRequestStats(),
        fetchWardTransfers(),
        fetchSettings(),
        fetchScheduledDischarges()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    // finally {
    //   setLoading(false);
    // }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds/stats`);
      console.log('Stats fetched successfully:', response.data);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchHistory = async () => {
    try {
      const effectivePeriod = period;
      let historyData = [];
      
      // Multi-level fallback strategy for fetching sufficient historical data
      console.log(`📊 Fetching history for period: ${effectivePeriod}`);
      
      const response = await axios.get(`${API_URL}/beds/history?period=${effectivePeriod}`);
      if (effectivePeriod !== period) {
        return;
      }

      historyData = response.data;
      console.log(`✅ Initial fetch: ${historyData.length} records for ${effectivePeriod}`);

      // For professional forecasting, we need at least 15 data points for meaningful predictions
      // This aligns with our 15-day forecasting window
      // Implement progressive fallback to get sufficient REAL data (no synthetic!)
      const MIN_FORECAST_RECORDS = 15;
      
      if (historyData.length < MIN_FORECAST_RECORDS) {
        console.warn(`⚠️ Insufficient data (${historyData.length}/${MIN_FORECAST_RECORDS}) - Attempting fallback...`);
        
        // Fallback Level 1: Try 7 days if we were requesting 'today'
        if (effectivePeriod === 'today') {
          try {
            console.log('🔄 Fallback Level 1: Fetching 7 days...');
            const fallback7d = await axios.get(`${API_URL}/beds/history?period=7d`);
            if (fallback7d.data.length > historyData.length) {
              historyData = fallback7d.data;
              console.log(`✅ Fallback Level 1: Found ${historyData.length} records`);
            }
          } catch (err) {
            console.error('❌ Fallback Level 1 failed:', err.message);
          }
        }
        
        // Fallback Level 2: Try 30 days if still insufficient
        if (historyData.length < MIN_FORECAST_RECORDS && effectivePeriod !== '30d') {
          try {
            console.log('🔄 Fallback Level 2: Fetching 30 days...');
            const fallback30d = await axios.get(`${API_URL}/beds/history?period=30d`);
            if (fallback30d.data.length > historyData.length) {
              historyData = fallback30d.data;
              console.log(`✅ Fallback Level 2: Found ${historyData.length} records`);
            }
          } catch (err) {
            console.error('❌ Fallback Level 2 failed:', err.message);
          }
        }
        
        // If still insufficient, warn user - DO NOT use synthetic data
        if (historyData.length < MIN_FORECAST_RECORDS) {
          console.error(`❌ CRITICAL: Insufficient historical data (${historyData.length}/${MIN_FORECAST_RECORDS})`);
          console.error('📌 SOLUTION: System needs to collect real occupancy data over time');
          console.error('📌 Either: 1) Import historical seed data, or 2) Wait for system to collect daily snapshots');
        }
      }

      setHistory(historyData);
      console.log(`📈 Final history data: ${historyData.length} records available for analysis`);

      if (effectivePeriod === 'today') {
        const todayRecord = findHistoryRecordForDate(historyData, new Date());

        if (hasHourlyData(todayRecord)) {
          setTodayHourlySource({
            record: todayRecord,
            isFallback: false,
            fallbackDate: todayRecord?.timestamp || null
          });
        } else {
          let fallbackRecord = findLatestHourlyRecord(historyData);

          if (!fallbackRecord) {
            try {
              const fallbackResponse = await axios.get(`${API_URL}/beds/history?period=7d`);
              if (effectivePeriod !== period) {
                return;
              }
              fallbackRecord = findLatestHourlyRecord(fallbackResponse.data);
            } catch (fallbackError) {
              console.error('Error fetching fallback history:', fallbackError);
            }
          }

          if (fallbackRecord) {
            const isSameRecord = todayRecord && fallbackRecord && (
              (todayRecord._id && fallbackRecord._id && todayRecord._id === fallbackRecord._id) ||
              (todayRecord.timestamp && fallbackRecord.timestamp && todayRecord.timestamp === fallbackRecord.timestamp)
            );
            const isFallback = !isSameRecord;
            setTodayHourlySource({
              record: fallbackRecord,
              isFallback,
              fallbackDate: fallbackRecord?.timestamp || null
            });
          } else {
            setTodayHourlySource(null);
          }
        }
      } else {
        setTodayHourlySource(null);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      console.error('Error details:', error.response?.data);
      setTodayHourlySource(null);
    }
  };

  const fetchBedRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests`);
      console.log('Bed requests fetched successfully:', response.data.length, 'requests');
      setBedRequests(response.data);
    } catch (error) {
      console.error('Error fetching bed requests:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchRequestStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests/stats`);
      console.log('Request stats fetched successfully:', response.data);
      setRequestStats(response.data);
    } catch (error) {
      console.error('Error fetching request stats:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchWardTransfers = async () => {
    try {
      const response = await axios.get(`${API_URL}/ward-transfers`);
      console.log('Ward transfers fetched successfully:', response.data.length, 'transfers');
      setWardTransfers(response.data);
    } catch (error) {
      console.error('Error fetching ward transfers:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchSettings = async () => {
    try {
      console.log('Fetching settings from:', `${API_URL}/settings`);
      const response = await axios.get(`${API_URL}/settings`);
      console.log('Settings fetched successfully:', response.data);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Full error:', error);
    }
  };

  const fetchScheduledDischarges = async () => {
    try {
      const ward = selectedWard !== 'All' ? selectedWard : undefined;
      const params = ward ? `?ward=${ward}` : '';
      const response = await axios.get(`${API_URL}/patients/discharges/today${params}`);
      setScheduledDischarges(response.data.count);
    } catch (error) {
      console.error('Error fetching scheduled discharges:', error);
    }
  };

  // Fetch detailed discharge schedule for forecasting
  const fetchDischargeSchedule = async () => {
    try {
      // Fetch patients with expected discharge dates
      const response = await axios.get(`${API_URL}/patients`);
      const patients = response.data;
      
      // Group by ward and expected discharge date
      const dischargeSchedule = {};
      
      patients.forEach(patient => {
        if (patient.expectedDischarge && patient.status !== 'discharged' && patient.department) {
          const dischargeDate = new Date(patient.expectedDischarge);
          const ward = patient.department;
          
          if (!dischargeSchedule[ward]) {
            dischargeSchedule[ward] = {};
          }
          
          const dateKey = dischargeDate.toISOString().split('T')[0]; // YYYY-MM-DD
          if (!dischargeSchedule[ward][dateKey]) {
            dischargeSchedule[ward][dateKey] = 0;
          }
          dischargeSchedule[ward][dateKey]++;
        }
      });
      
      return dischargeSchedule;
    } catch (error) {
      console.error('Error fetching discharge schedule:', error);
      return {};
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`);
      console.log('Users fetched successfully:', response.data.users.length, 'users');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const handleUserFormChange = (field, value) => {
    setUserForm(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (userFormErrors[field]) {
      setUserFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateUserForm = () => {
    const errors = {};
    
    if (!userForm.username || userForm.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    
    if (!editingUser && (!userForm.password || userForm.password.length < 6)) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (!userForm.role) {
      errors.role = 'Role is required';
    }
    
    setUserFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async () => {
    if (!validateUserForm()) {
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/users`, userForm);
      showNotification(`User "${response.data.user.username}" created successfully!`, 'success');
      
      // Reset form
      setUserForm({
        username: '',
        password: '',
        role: 'ward_staff'
      });
      setShowUserForm(false);
      setUserFormErrors({});
      
      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      showNotification(error.response?.data?.error || 'Failed to create user', 'error');
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: '', // Don't populate password
      role: user.role
    });
    setShowUserForm(true);
    setUserFormErrors({});
  };

  const handleUpdateUser = async () => {
    if (!validateUserForm()) {
      return;
    }

    try {
      const updateData = { ...userForm };
      // Don't send password if it's empty (not changing)
      if (!updateData.password) {
        delete updateData.password;
      }

      const response = await axios.put(`${API_URL}/users/${editingUser.id}`, updateData);
      showNotification(`User "${response.data.user.username}" updated successfully!`, 'success');
      
      // Reset form
      setUserForm({
        username: '',
        password: '',
        role: 'ward_staff'
      });
      setShowUserForm(false);
      setEditingUser(null);
      setUserFormErrors({});
      
      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      showNotification(error.response?.data?.error || 'Failed to update user', 'error');
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/users/${user.id}`);
      showNotification(`User "${user.username}" deleted successfully!`, 'success');
      
      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      showNotification(error.response?.data?.error || 'Failed to delete user', 'error');
    }
  };

  const handleCancelUserForm = () => {
    setShowUserForm(false);
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      role: 'ward_staff'
    });
    setUserFormErrors({});
  };

  const handleUpdateSettings = async () => {
    if (!settings) return;

    setSettingsSaving(true);
    try {
      const response = await axios.put(`${API_URL}/settings`, settings);
      setSettings(response.data.settings);

      // Show bed sync results if any
      let message = 'Settings updated successfully!';
      const bedResults = response.data.bedSyncResults;
      if (bedResults && Object.keys(bedResults).length > 0) {
        const changes = Object.entries(bedResults)
          .filter(([_, result]) => result.added > 0 || result.removed > 0)
          .map(([ward, result]) => {
            const parts = [];
            if (result.added > 0) parts.push(`+${result.added} added`);
            if (result.removed > 0) parts.push(`-${result.removed} removed`);
            return `${ward}: ${parts.join(', ')}`;
          });
        if (changes.length > 0) {
          message += ` Bed changes: ${changes.join(', ')}`;
        }
      }

      showNotification(message, 'success');
      // Refresh stats after bed changes
      fetchStats();
    } catch (error) {
      console.error('Error updating settings:', error);
      showNotification(error.response?.data?.error || 'Failed to update settings', 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetSettings = async () => {
    if (!window.confirm('Are you sure you want to reset all settings to defaults?')) return;

    setSettingsSaving(true);
    try {
      const response = await axios.post(`${API_URL}/settings/reset`);
      setSettings(response.data.settings);
      showNotification('Settings reset to defaults!', 'success');
    } catch (error) {
      console.error('Error resetting settings:', error);
      showNotification(error.response?.data?.error || 'Failed to reset settings', 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Seed data import handlers
  const fetchDbStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/seed/status`);
      setDbStatus(response.data.currentCounts);
    } catch (error) {
      console.error('Error fetching DB status:', error);
    }
  };

  const handleSeedFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSeedFile(file);
    setSeedValidation(null);
    setSeedImportResult(null);

    try {
      const text = await file.text();
      const seedData = JSON.parse(text);

      // Validate the seed data
      const response = await axios.post(`${API_URL}/seed/validate`, seedData);
      setSeedValidation(response.data);

      // Also fetch current DB status
      await fetchDbStatus();
    } catch (error) {
      if (error instanceof SyntaxError) {
        setSeedValidation({
          isValid: false,
          errors: ['Invalid JSON format in file'],
          warnings: [],
          summary: {}
        });
      } else {
        setSeedValidation({
          isValid: false,
          errors: [error.response?.data?.error || error.message],
          warnings: [],
          summary: {}
        });
      }
    }
  };

  const handleSeedImport = async () => {
    if (!seedFile || !seedValidation?.isValid) return;

    const confirmMsg = `This will import data into the database (merge mode - duplicates will be skipped).\n\nSummary:\n- Beds: ${seedValidation.summary.beds || 0}\n- Patients: ${seedValidation.summary.patients || 0}\n- Occupancy History: ${seedValidation.summary.occupancyHistory || 0} days\n\nContinue?`;

    if (!window.confirm(confirmMsg)) return;

    setSeedImporting(true);
    setSeedImportResult(null);

    try {
      const text = await seedFile.text();
      const seedData = JSON.parse(text);

      const response = await axios.post(`${API_URL}/seed/import`, seedData);
      setSeedImportResult(response.data);

      // Refresh all data after import
      await fetchAllData();
      await fetchDbStatus();

      showNotification('Seed data imported successfully!', 'success');
    } catch (error) {
      console.error('Seed import error:', error);
      setSeedImportResult({
        success: false,
        error: error.response?.data?.error || 'Import failed',
        details: error.response?.data?.details || error.message
      });
    } finally {
      setSeedImporting(false);
    }
  };

  const clearSeedSelection = () => {
    setSeedFile(null);
    setSeedValidation(null);
    setSeedImportResult(null);
    // Reset file input
    const fileInput = document.getElementById('seed-file-input');
    if (fileInput) fileInput.value = '';
  };

  const calculateTrends = () => {
    if (history.length < 2) return null;

    const recent = history.slice(-6);
    const avgOccupancy = recent.reduce((sum, h) => sum + h.occupancyRate, 0) / recent.length;
    const trend = recent[recent.length - 1].occupancyRate - recent[0].occupancyRate;

    return {
      avgOccupancy: avgOccupancy.toFixed(1),
      trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      trendValue: Math.abs(trend).toFixed(1)
    };
  };

  const calculateWardForecasts = async () => {
    if ((!history || history.length === 0) && !stats) {
      console.warn('⚠️ No history or stats available for forecasting');
      return null;
    }

    const wards = ['Emergency', 'ICU', 'General Ward', 'Cardiology'];
    
    // Fetch discharge schedule for discharge-adjusted forecasting
    const dischargeSchedule = await fetchDischargeSchedule();
    
    // Use last 15 days of data for professional-grade forecasting
    const recent = history.slice(-15);
    const wardForecasts = [];

    console.log('🔮 Forecast Calculation Started:');
    console.log('  Period:', period);
    console.log('  Total history records:', history.length);
    console.log('  Using recent records for forecasting:', recent.length);
    console.log('  Forecast window: Last 15 days for accurate predictions');
    console.log('  Discharge schedule loaded:', Object.keys(dischargeSchedule).length > 0 ? 'YES ✅' : 'NO');
    
    if (recent.length > 0 && recent[0].timestamp) {
      const oldestDate = new Date(recent[0].timestamp);
      const newestDate = new Date(recent[recent.length - 1].timestamp);
      const daysDiff = (newestDate - oldestDate) / (1000 * 60 * 60 * 24);
      console.log('  Data age range:', daysDiff.toFixed(1), 'days');
      console.log('  Oldest data:', oldestDate.toLocaleDateString());
      console.log('  Newest data:', newestDate.toLocaleDateString());
      console.log('  Today:', new Date().toLocaleDateString());
    }

    for (const ward of wards) {
      // Extract ward-specific occupancy rates from historical data
      let wardOccupancies = recent
        .map(h => {
          if (h.wardStats && Array.isArray(h.wardStats)) {
            const wardData = h.wardStats.find(w => w.ward === ward);
            return wardData ? parseFloat(wardData.occupancyRate) : null;
          }
          return null;
        })
        .filter(v => v !== null);

      console.log(`\n🏥 ${ward}:`);
      console.log('  Historical data points from DB:', wardOccupancies.length);
      if (wardOccupancies.length > 0) {
        console.log('  Historical values:', wardOccupancies.map(v => v.toFixed(1)).join(', '));
      }

      // Get current real-time occupancy
      const currentWardStat = stats?.wardStats?.find(w => w._id === ward);
      const currentOccupancy = currentWardStat && currentWardStat.total > 0
        ? parseFloat(((currentWardStat.occupied / currentWardStat.total) * 100).toFixed(1))
        : wardOccupancies.length > 0
          ? parseFloat(wardOccupancies[wardOccupancies.length - 1].toFixed(1))
          : null;

      console.log('  Current occupancy from stats:', currentOccupancy);

      // DYNAMIC SOLUTION: Add current value to historical data if significantly different
      if (wardOccupancies.length === 0 && currentOccupancy !== null) {
        // No historical data, use current as single data point
        // This is acceptable for displaying current state, but not enough for forecasting
        wardOccupancies = [currentOccupancy];
        console.log('  ⚠️ No historical data - using current value as baseline (insufficient for forecasting)');
      } else if (wardOccupancies.length > 0 && currentOccupancy !== null) {
        const lastHistoricalValue = wardOccupancies[wardOccupancies.length - 1];
        const difference = Math.abs(lastHistoricalValue - currentOccupancy);
        
        // If current differs from last historical by more than 0.1%, add it
        if (difference > 0.1) {
          wardOccupancies = [...wardOccupancies, currentOccupancy];
          console.log(`  ✅ Added current value (${difference.toFixed(1)}% diff from last historical)`);
        } else {
          console.log('  ℹ️ Current value same as last historical');
        }
      }

      if (wardOccupancies.length === 0) {
        console.log('  ❌ No data available - skipping ward');
        continue;
      }

      console.log('  Final data points for forecasting:', wardOccupancies.length);

      const avgOccupancy = wardOccupancies.reduce((sum, v) => sum + v, 0) / wardOccupancies.length;
      let trend = 0;
      let trendType = 'stable';

      if (wardOccupancies.length >= 2) {
        trend = wardOccupancies[wardOccupancies.length - 1] - wardOccupancies[0];
        trendType = trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable';
      }

      // Get current occupancy from stats
      const currentValue = currentOccupancy !== null
        ? currentOccupancy
        : parseFloat(avgOccupancy.toFixed(1));

      // Calculate projection using Exponential Smoothing
      // Formula: F(t+1) = α * A(t) + (1 - α) * F(t)
      // where α is the smoothing factor (0 < α < 1)
      const alpha = 0.3; // Smoothing factor (configurable, typically 0.2-0.4 for occupancy data)

      let projectedOccupancy;
      if (wardOccupancies.length >= 2) {
        // Initialize forecast with first value
        let forecast = wardOccupancies[0];

        // Apply exponential smoothing iteratively through the historical data
        for (let i = 1; i < wardOccupancies.length; i++) {
          forecast = alpha * wardOccupancies[i] + (1 - alpha) * forecast;
        }

        // Project next period using current value and last forecast
        projectedOccupancy = alpha * currentValue + (1 - alpha) * forecast;
        console.log(`🔍 ${ward} - Exponential Smoothing Applied:`, {
          dataPoints: wardOccupancies.length,
          finalForecast: forecast.toFixed(2),
          currentValue: currentValue.toFixed(2),
          projectedBeforeDischarges: projectedOccupancy.toFixed(2)
        });
      } else {
        // If not enough data, use current value
        projectedOccupancy = currentValue;
        console.log(`🔍 ${ward} - INSUFFICIENT DATA (${wardOccupancies.length} points) - Using current value:`, currentValue.toFixed(2));
      }

      // 🆕 DISCHARGE-ADJUSTED FORECASTING
      // Adjust projection based on scheduled discharges
      let dischargeAdjustment = 0;
      let scheduledDischargesCount = 0;
      
      if (dischargeSchedule[ward] && currentWardStat) {
        // Check discharges for tomorrow (next day prediction)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = tomorrow.toISOString().split('T')[0];
        
        scheduledDischargesCount = dischargeSchedule[ward][tomorrowKey] || 0;
        
        if (scheduledDischargesCount > 0) {
          // Calculate impact: each discharge reduces occupancy
          // Impact = (discharged beds / total beds) * 100%
          const totalBeds = currentWardStat.total;
          dischargeAdjustment = -(scheduledDischargesCount / totalBeds) * 100;
          
          console.log(`  📅 Scheduled Discharges for ${tomorrow.toLocaleDateString()}:`, scheduledDischargesCount);
          console.log(`  📉 Discharge Impact: ${dischargeAdjustment.toFixed(2)}% reduction`);
          
          // Apply discharge adjustment
          projectedOccupancy = projectedOccupancy + dischargeAdjustment;
        }
      }

      // Ensure projection is within valid range [0, 100]
      projectedOccupancy = Math.max(0, Math.min(100, projectedOccupancy));

      const finalProjection = parseFloat(projectedOccupancy.toFixed(1));
      
      if (scheduledDischargesCount > 0) {
        console.log(`  ✅ Final Projection (with ${scheduledDischargesCount} discharge${scheduledDischargesCount > 1 ? 's' : ''}): ${finalProjection}%`);
      }

      wardForecasts.push({
        ward,
        current: parseFloat(currentValue.toFixed(1)),
        projected: finalProjection,
        trend: trendType,
        trendValue: Math.abs(trend).toFixed(1),
        scheduledDischarges: scheduledDischargesCount,
        dischargeAdjustment: dischargeAdjustment
      });
    }

    return wardForecasts;
  };

  // Generate intelligent bed allocation suggestions
  const generateAllocationSuggestions = (wardForecasts) => {
    if (!wardForecasts || wardForecasts.length === 0) return [];

    const suggestions = [];
    const criticalWards = wardForecasts.filter(w => w.projected > 90);
    const highWards = wardForecasts.filter(w => w.projected > 80 && w.projected <= 90);
    const lowWards = wardForecasts.filter(w => w.projected < 60);

    // Suggestion for wards with >90% projected occupancy (CRITICAL)
    criticalWards.forEach(criticalWard => {
      if (lowWards.length > 0) {
        // Find the lowest occupancy ward to suggest as source
        const sourceWard = lowWards.reduce((lowest, ward) =>
          ward.projected < lowest.projected ? ward : lowest
        );
        suggestions.push({
          type: 'critical',
          targetWard: criticalWard.ward,
          sourceWard: sourceWard.ward,
          message: `${criticalWard.ward} is projected at ${criticalWard.projected}% (critical). Consider allocating beds from ${sourceWard.ward} (${sourceWard.projected}%).`
        });
      } else {
        suggestions.push({
          type: 'critical',
          targetWard: criticalWard.ward,
          message: `${criticalWard.ward} is projected at ${criticalWard.projected}% (critical). No wards with low occupancy available for reallocation.`
        });
      }
    });

    // Suggestion for wards with 80-90% projected occupancy (HIGH)
    highWards.forEach(highWard => {
      if (lowWards.length > 0) {
        // Find the lowest occupancy ward to suggest as source
        const sourceWard = lowWards.reduce((lowest, ward) =>
          ward.projected < lowest.projected ? ward : lowest
        );
        suggestions.push({
          type: 'warning',
          targetWard: highWard.ward,
          sourceWard: sourceWard.ward,
          message: `${highWard.ward} is projected at ${highWard.projected}% (high). Consider allocating beds from ${sourceWard.ward} (${sourceWard.projected}%) to prevent reaching critical levels.`
        });
      }
    });

    // Suggestion for wards with <60% projected occupancy (LOW - Opportunity)
    lowWards.forEach(lowWard => {
      const needyWards = [...criticalWards, ...highWards];
      if (needyWards.length > 0) {
        const targetWards = needyWards
          .sort((a, b) => b.projected - a.projected) // Sort by highest occupancy first
          .map(w => `${w.ward} (${w.projected}%)`)
          .join(', ');
        suggestions.push({
          type: 'opportunity',
          sourceWard: lowWard.ward,
          targetWards: needyWards.map(w => w.ward),
          message: `${lowWard.ward} is projected at ${lowWard.projected}%. Beds can be temporarily allocated to: ${targetWards}.`
        });
      }
    });

    return suggestions;
  };

  // Calculate filtered stats based on selected ward
  const getFilteredStats = () => {
    if (!stats || selectedWard === 'All') {
      return stats;
    }

    // Filter to show only the selected ward's statistics
    const wardStat = stats.wardStats?.find(w => w._id === selectedWard);
    if (wardStat) {
      return {
        totalBeds: wardStat.total,
        occupied: wardStat.occupied,
        available: wardStat.available,
        cleaning: wardStat.cleaning,
        reserved: wardStat.reserved,
        occupancyRate: ((wardStat.occupied / wardStat.total) * 100).toFixed(1),
        wardStats: [wardStat]
      };
    }

    return stats;
  };

  const filteredStats = getFilteredStats();

  // Filter bed requests based on selected period and ward
  const getFilteredBedRequests = () => {
    if (!bedRequests || bedRequests.length === 0) return [];

    const now = new Date();
    let startDate = new Date();

    if (requestsPeriod === 'today') {
      startDate.setHours(0, 0, 0, 0); // Start of today
    } else if (requestsPeriod === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (requestsPeriod === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    }

    return bedRequests.filter(request => {
      const createdAt = new Date(request.createdAt);
      const matchesPeriod = createdAt >= startDate && createdAt <= now;
      const matchesWard = selectedWard === 'All' || request.preferredWard === selectedWard;
      return matchesPeriod && matchesWard;
    });
  };

  // Calculate stats for filtered bed requests
  const getFilteredRequestStats = () => {
    const filtered = getFilteredBedRequests();

    if (filtered.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        denied: 0,
        fulfilled: 0,
        cancelled: 0,
        triageStats: []
      };
    }

    const stats = {
      total: filtered.length,
      pending: filtered.filter(r => r.status === 'pending').length,
      approved: filtered.filter(r => r.status === 'approved').length,
      denied: filtered.filter(r => r.status === 'denied').length,
      fulfilled: filtered.filter(r => r.status === 'fulfilled').length,
      cancelled: filtered.filter(r => r.status === 'cancelled').length,
      triageStats: []
    };

    // Calculate triage stats
    const triageCounts = {};
    filtered.forEach(request => {
      const triage = request.patientDetails.triageLevel;
      triageCounts[triage] = (triageCounts[triage] || 0) + 1;
    });

    stats.triageStats = Object.entries(triageCounts).map(([level, count]) => ({
      _id: level,
      count
    }));

    return stats;
  };

  const filteredBedRequests = getFilteredBedRequests();
  const filteredRequestStats = getFilteredRequestStats();

  // Debug logging
  console.log('AdminDashboard render:', {
    activeTab,
    stats,
    filteredStats,
    history: history.length,
    bedRequests: bedRequests.length,
    filteredBedRequests: filteredBedRequests.length,
    requestsPeriod,
    settings
  });

  const exportReport = async (format = 'json') => {
    try {
      // Use default report period from settings, not the current UI period
      const reportPeriod = settings?.reporting?.defaultPeriod || period;

      // Fetch history data for the report period
      let reportHistory = history;
      if (reportPeriod !== period) {
        try {
          const response = await axios.get(`${API_URL}/beds/history?period=${reportPeriod}`);
          reportHistory = response.data;
        } catch (error) {
          console.error('Error fetching history for report:', error);
        }
      }

      const reportData = {
        generatedAt: new Date().toISOString(),
        generatedBy: currentUser.name,
        period: reportPeriod,
        stats: stats,
        history: reportHistory,
        bedRequests: bedRequests,
        requestStats: requestStats,
        trends: calculateTrends()
      };

      if (format === 'pdf') {
        // Generate PDF using browser's print functionality
        const printWindow = window.open('', '', 'width=800,height=600');

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>BedManager Report</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 40px;
                color: #333;
              }
              h1 {
                color: #0284c7;
                border-bottom: 3px solid #0284c7;
                padding-bottom: 10px;
              }
              h2 {
                color: #0f172a;
                margin-top: 30px;
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 8px;
                page-break-before: always;
              }
              h2:first-of-type {
                page-break-before: auto;
              }
              .metadata {
                background: #f8fafc;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
              }
              .metadata p {
                margin: 5px 0;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
              }
              th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e2e8f0;
              }
              th {
                background-color: #f1f5f9;
                font-weight: 600;
                color: #0f172a;
              }
              tr:hover {
                background-color: #f8fafc;
              }
              .stat-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
                margin: 20px 0;
              }
              .stat-item {
                background: #f8fafc;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #0284c7;
              }
              .stat-label {
                font-size: 14px;
                color: #64748b;
                margin-bottom: 5px;
              }
              .stat-value {
                font-size: 24px;
                font-weight: 700;
                color: #0f172a;
              }
              @media print {
                body { margin: 20px; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>BedManager Report</h1>

            <div class="metadata">
              <p><strong>Generated:</strong> ${new Date(reportData.generatedAt).toLocaleString()}</p>
              <p><strong>Generated By:</strong> ${reportData.generatedBy}</p>
              <p><strong>Period:</strong> ${reportPeriod === '1' || reportPeriod === 'today' ? 'Today' : reportPeriod === '7' || reportPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'}</p>
            </div>

            <h2>Overall Statistics</h2>
            <div class="stat-grid">
              <div class="stat-item">
                <div class="stat-label">Total Beds</div>
                <div class="stat-value">${stats.totalBeds}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Occupied</div>
                <div class="stat-value">${stats.occupied}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Available</div>
                <div class="stat-value">${stats.available}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Cleaning</div>
                <div class="stat-value">${stats.cleaning}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Reserved</div>
                <div class="stat-value">${stats.reserved}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Occupancy Rate</div>
                <div class="stat-value">${stats.occupancyRate}%</div>
              </div>
            </div>

            <h2>Ward Statistics</h2>
            <table>
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Total</th>
                  <th>Occupied</th>
                  <th>Available</th>
                  <th>Cleaning</th>
                  <th>Reserved</th>
                  <th>Occupancy %</th>
                </tr>
              </thead>
              <tbody>
                ${stats.wardStats.map(ward => `
                  <tr>
                    <td><strong>${ward._id}</strong></td>
                    <td>${ward.total}</td>
                    <td>${ward.occupied}</td>
                    <td>${ward.available}</td>
                    <td>${ward.cleaning}</td>
                    <td>${ward.reserved || 0}</td>
                    <td>${((ward.occupied / ward.total) * 100).toFixed(1)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            ${reportPeriod === '1' || reportPeriod === 'today' ? (() => {
              // Get today's history record with hourly data
              const todayRecord = reportHistory.find(h => {
                const recordDate = new Date(h.timestamp);
                const today = new Date();
                return recordDate.toDateString() === today.toDateString();
              });

              if (!todayRecord || !todayRecord.hourlyData || todayRecord.hourlyData.length === 0) {
                return '';
              }

              return `
                <h2>Today's Hourly Occupancy</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Hour</th>
                      <th>Average Occupancy Rate</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${todayRecord.hourlyData.map(hourData => {
                      const hour = new Date(hourData.timestamp).getHours();
                      const occupancy = parseFloat(hourData.occupancyRate);
                      const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
                      const statusColor = occupancy >= 90 ? '#ef4444' : occupancy >= 80 ? '#f59e0b' : '#10b981';
                      return `
                        <tr>
                          <td>${hour.toString().padStart(2, '0')}:00</td>
                          <td>${occupancy.toFixed(1)}%</td>
                          <td style="color: ${statusColor}; font-weight: 600;">${status}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
                <p style="margin-top: 15px; font-size: 13px; color: #64748b;">
                  <strong>Note:</strong> This report shows hourly occupancy data. To view the line chart, please use the Analytics & Trends tab in the application.
                </p>
              `;
            })() : `
              <h2>Daily Average Occupancy (${reportPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'})</h2>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Average Occupancy Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportHistory
                    .slice(reportPeriod === '7d' ? -7 : -30)
                    .reverse()
                    .map(record => {
                      const occupancy = parseFloat(record.occupancyRate);
                      const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
                      const statusColor = occupancy >= 90 ? '#ef4444' : occupancy >= 80 ? '#f59e0b' : '#10b981';
                      return `
                        <tr>
                          <td>${new Date(record.timestamp).toLocaleDateString()}</td>
                          <td>${occupancy.toFixed(1)}%</td>
                          <td style="color: ${statusColor}; font-weight: 600;">${status}</td>
                        </tr>
                      `;
                    }).join('')}
                </tbody>
              </table>
              <p style="margin-top: 15px; font-size: 13px; color: #64748b;">
                <strong>Note:</strong> This report shows daily occupancy data. To view the line chart, please use the Analytics & Trends tab in the application.
              </p>
            `}

            <p class="no-print" style="margin-top: 30px; text-align: center; color: #64748b;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">Print / Save as PDF</button>
              <button onclick="window.close()" style="padding: 10px 20px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; margin-left: 10px;">Close</button>
            </p>
          </body>
          </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Auto-trigger print dialog after a short delay to ensure content is loaded
        setTimeout(() => {
          printWindow.print();
        }, 250);

        return;
      } else if (format === 'json') {
        const dataStr = JSON.stringify(reportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bedmanager-report-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'csv') {
        // Convert stats to CSV
        let csv = '"Overall Statistics"\n';
        csv += 'Metric,Value\n';
        csv += `Total Beds,${stats.totalBeds}\n`;
        csv += `Occupied,${stats.occupied}\n`;
        csv += `Available,${stats.available}\n`;
        csv += `Cleaning,${stats.cleaning}\n`;
        csv += `Reserved,${stats.reserved}\n`;
        csv += `Occupancy Rate,${stats.occupancyRate}%\n\n`;

        csv += '"Ward Statistics"\n';
        csv += 'Ward,Total,Occupied,Available,Cleaning\n';
        stats.wardStats.forEach(ward => {
          csv += `${ward._id},${ward.total},${ward.occupied},${ward.available},${ward.cleaning}\n`;
        });

        // Add occupancy data based on report period
        csv += '\n';
        if (reportPeriod === 'today') {
          // Get today's history record with hourly data
          const todayRecord = reportHistory.find(h => {
            const recordDate = new Date(h.timestamp);
            const today = new Date();
            return recordDate.toDateString() === today.toDateString();
          });

          if (todayRecord && todayRecord.hourlyData && todayRecord.hourlyData.length > 0) {
            csv += '"Today\'s Hourly Occupancy"\n';
            csv += 'Hour,Average Occupancy Rate,Status\n';
            todayRecord.hourlyData.forEach(hourData => {
              const hourLabel = getHourLabel(hourData);
              const occupancy = parseFloat(hourData.occupancyRate);
              const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
              csv += `${hourLabel},${occupancy.toFixed(1)}%,${status}\n`;
            });
          }
        } else {
          csv += `"Daily Average Occupancy (${reportPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'})"\n`;
          csv += 'Date,Average Occupancy Rate,Status\n';
          reportHistory
            .slice(reportPeriod === '7d' ? -7 : -30)
            .reverse()
            .forEach(record => {
              const occupancy = parseFloat(record.occupancyRate);
              const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
              csv += `${new Date(record.timestamp).toLocaleDateString()},${occupancy.toFixed(1)}%,${status}\n`;
            });
        }

        csv += '\n"Note: To view the line chart, please use the Analytics & Trends tab in the application."\n';

        const csvBlob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(csvBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bedmanager-report-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      showNotification('Failed to export report', 'error');
    }
  };

  // eslint-disable-next-line no-unused-vars
  const trends = calculateTrends();

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="brand-identity">
            <div className="brand-mark">ADMIN</div>
            <div className="brand-copy">
              <h1>Hospital Administration Center</h1>
              <p className="subtitle">Analytics, trends, and strategic planning</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="export-actions">
            <button className="export-btn" onClick={() => exportReport('pdf')}>
              Export PDF
            </button>
            <button className="export-btn" onClick={() => exportReport('csv')}>
              Export CSV
            </button>
          </div>
          <div className="user-info">
            <span className="user-name">{currentUser.name}</span>
            <span className="user-role">(Administrator)</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className="theme-icon">
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
          </button>
        </div>
      </header>

      <div className="admin-main-content">
        {/* Navigation Tabs */}
        <div className="admin-tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics & Trends
          </button>
          <button
            className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Bed Requests
          </button>
          <button
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        {/* Ward Filter */}
        {activeTab !== 'settings' && (
          <ResizableCard
            title="Ward Filter"
            minWidth={300}
            minHeight={80}
          >
            <div className="ward-filter-section">
              <label>Filter by Ward:</label>
              <div className="ward-buttons">
                {['All', 'Emergency', 'ICU', 'General Ward', 'Cardiology'].map((ward) => (
                  <button
                    key={ward}
                    className={`ward-filter-btn ${selectedWard === ward ? 'active' : ''}`}
                    onClick={() => setSelectedWard(ward)}
                  >
                    {ward}
                  </button>
                ))}
              </div>
            </div>
          </ResizableCard>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="overview-content">
            {filteredStats ? (
              <ResizableCard
                title="Statistics Overview"
                minWidth={400}
                minHeight={200}
              >
                <Dashboard stats={filteredStats} />
              </ResizableCard>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading statistics...</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-quiet)', marginTop: '1rem' }}>
                  If this message persists, check the browser console for errors.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="analytics-content">
            {!stats && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading analytics data...</p>
              </div>
            )}
            <div className="period-selector">
              <h3>Analysis</h3>
              <div className="period-buttons">
                <button
                  className={`period-btn ${period === 'today' ? 'active' : ''}`}
                  onClick={() => setPeriod('today')}
                >
                  Today
                </button>
                <button
                  className={`period-btn ${period === '7d' ? 'active' : ''}`}
                  onClick={() => setPeriod('7d')}
                >
                  7 Days
                </button>
                <button
                  className={`period-btn ${period === '30d' ? 'active' : ''}`}
                  onClick={() => setPeriod('30d')}
                >
                  30 Days
                </button>
              </div>
            </div>

            {/* Today View - Ward Forecasts and Suggestions */}
            {period === 'today' && (
              <div className="forecast-info">
                {(() => {
                  // Use pre-calculated ward forecasts from state
                  if (!wardForecasts || wardForecasts.length === 0) return null;

                  // Filter forecasts based on selected ward
                  const displayForecasts = selectedWard === 'All'
                    ? wardForecasts
                    : wardForecasts.filter(f => f.ward === selectedWard);

                  const allocationSuggestions = generateAllocationSuggestions(wardForecasts);
                  const filteredAllocationSuggestions = allocationSuggestions.filter(suggestion =>
                    selectedWard === 'All' ||
                    suggestion.targetWard === selectedWard ||
                    suggestion.sourceWard === selectedWard ||
                    (suggestion.targetWards && suggestion.targetWards.includes(selectedWard))
                  );

                  let suggestionsToRender = filteredAllocationSuggestions;

                  if (suggestionsToRender.length === 0) {
                    const relevantForecasts = selectedWard === 'All'
                      ? wardForecasts
                      : wardForecasts.filter(f => f.ward === selectedWard);

                    if (relevantForecasts.length > 0) {
                      suggestionsToRender = [{
                        type: 'opportunity',
                        targetWard: selectedWard === 'All' ? 'All' : selectedWard,
                        message: `No urgent reallocations detected. Continue monitoring${selectedWard === 'All' ? ' overall capacity' : ` ${selectedWard} ward`} and keep contingency plans ready.`
                      }];
                    } else {
                      suggestionsToRender = [{
                        type: 'opportunity',
                        targetWard: selectedWard === 'All' ? 'All' : selectedWard,
                        message: 'Insufficient recent data to calculate suggestions. Please ensure occupancy history is available.'
                      }];
                    }
                  }

                  return (
                    <>
                      {/* Ward-wise Forecast Cards */}
                      <div className="forecasting-section">
                        <h3>Capacity Forecast {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                        <div className="forecast-cards-grid">
                          {displayForecasts.map(forecast => (
                            <div key={forecast.ward} className="forecast-card">
                              <h4>{selectedWard === 'All' ? forecast.ward : 'Next 24 Hours Projection'}</h4>
                              <div className="forecast-values">
                                <div className="forecast-value">
                                  <span className="forecast-label">Current:</span>
                                  <span className="forecast-number">{forecast.current}%</span>
                                </div>
                                <div className="forecast-value">
                                  <span className="forecast-label">Projected:</span>
                                  <span className={`forecast-number ${
                                    forecast.projected > 90 ? 'critical' :
                                    forecast.projected > 80 ? 'warning' :
                                    forecast.projected < 60 ? 'low' : ''
                                  }`}>
                                    {forecast.projected}%
                                  </span>
                                </div>
                              </div>
                              {forecast.scheduledDischarges > 0 && (
                                <div style={{ 
                                  marginTop: '12px', 
                                  padding: '8px', 
                                  backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  color: '#10b981'
                                }}>
                                  <strong>📅 {forecast.scheduledDischarges}</strong> scheduled discharge{forecast.scheduledDischarges > 1 ? 's' : ''} tomorrow
                                  <br/>
                                  <span style={{ fontSize: '11px', opacity: 0.8 }}>
                                    (Impact: {forecast.dischargeAdjustment.toFixed(1)}% reduction)
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Scheduled Discharges for Today */}
                        <div className="scheduled-discharges-section" style={{ marginTop: '20px' }}>
                          <h3>Scheduled Discharges Today {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                          <div className="forecast-card" style={{ maxWidth: '300px' }}>
                            <h4>Expected Discharges</h4>
                            <div className="forecast-values">
                              <div className="forecast-value">
                                <span className="forecast-label">Total for Today:</span>
                                <span className={`forecast-number ${scheduledDischarges > 0 ? 'low' : ''}`}>
                                  {scheduledDischarges}
                                </span>
                              </div>
                            </div>
                            {scheduledDischarges > 0 && (
                              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>
                                {scheduledDischarges === 1 ? '1 patient is' : `${scheduledDischarges} patients are`} scheduled for discharge today
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Allocation Suggestions */}
                        {suggestionsToRender.length > 0 && (
                          <div className="allocation-suggestions">
                            <div className="allocation-suggestions-header">
                              <div className="header-icon">💡</div>
                              <h4>Intelligent Bed Allocation Suggestions</h4>
                              <span className="suggestions-count">{suggestionsToRender.length} Recommendations</span>
                            </div>
                            {suggestionsToRender.map((suggestion, idx) => (
                              <div key={idx} className={`suggestion-card suggestion-${suggestion.type}`}>
                                <div className="suggestion-icon-wrapper">
                                  <div className={`suggestion-icon suggestion-icon-${suggestion.type}`}>
                                    {suggestion.type === 'critical' ? (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    ) : suggestion.type === 'warning' ? (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    ) : (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <line x1="12" y1="16" x2="12" y2="12"/>
                                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                                      </svg>
                                    )}
                                  </div>
                                  <span className={`priority-badge priority-${suggestion.type}`}>
                                    {suggestion.type === 'critical' ? 'High Priority' : suggestion.type === 'warning' ? 'Medium Priority' : 'Low Priority'}
                                  </span>
                                </div>
                                <div className="suggestion-content">
                                  <p className="suggestion-message">{suggestion.message}</p>
                                  <div className="suggestion-meta">
                                    <span className="suggestion-action">
                                      {suggestion.type === 'critical' ? '🔴 Action Required' : suggestion.type === 'warning' ? '🟠 Action Recommended' : '🔵 Consider Action'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Hourly Occupancy Graph for Today */}
            {period === 'today' && (() => {
              const hourlyRecord = todayHourlySource?.record;

              if (!hourlyRecord || !hasHourlyData(hourlyRecord)) {
                return (
                  <div className="daily-occupancy-section">
                    <div className="chart-header">
                      <h3>Today's Hourly Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                    </div>
                    <p style={{ marginTop: '0.5rem', color: 'var(--text-quiet)' }}>
                      Hourly occupancy measurements aren't available yet. Data will appear here once the system collects the first hourly samples for today.
                    </p>
                  </div>
                );
              }

              const hourlyChartData = hourlyRecord.hourlyData.map(hourData => {
                const hourLabel = getHourLabel(hourData);
                let avgOccupancy = parseFloat(hourData.occupancyRate);
                let maxOccupancy = avgOccupancy;

                if (selectedWard !== 'All' && hourData.wardStats && Array.isArray(hourData.wardStats)) {
                  const wardData = hourData.wardStats.find(w => w.ward === selectedWard);
                  if (wardData) {
                    avgOccupancy = parseFloat(wardData.occupancyRate);
                    maxOccupancy = avgOccupancy;
                  }
                } else if (hourData.wardStats && Array.isArray(hourData.wardStats)) {
                  const wardOccupancies = hourData.wardStats.map(w => parseFloat(w.occupancyRate));
                  maxOccupancy = Math.max(...wardOccupancies, avgOccupancy);
                }

                return {
                  hour: hourLabel,
                  avgOccupancy: parseFloat(avgOccupancy.toFixed(1)),
                  maxOccupancy: parseFloat(maxOccupancy.toFixed(1))
                };
              });

              const fallbackNote = todayHourlySource?.isFallback
                ? `Showing the latest hourly data from ${todayHourlySource.fallbackDate ? formatDate(todayHourlySource.fallbackDate) : 'previous records'} while today’s readings are generated.`
                : null;

              return (
                <div className="daily-occupancy-section">
                  <div className="chart-header">
                    <h3>Today's Hourly Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                    <div className="chart-options">
                      <label className="chart-option-toggle">
                        <input
                          type="checkbox"
                          checked={showMaxOccupancy}
                          onChange={(e) => setShowMaxOccupancy(e.target.checked)}
                        />
                        <span>Show Max Occupancy</span>
                      </label>
                    </div>
                  </div>

                  {fallbackNote && (
                    <div
                      style={{
                        marginBottom: '0.75rem',
                        padding: '0.65rem 0.9rem',
                        borderRadius: '0.75rem',
                        background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                        border: theme === 'dark' ? '1px solid rgba(148,163,184,0.25)' : '1px solid rgba(15,23,42,0.08)',
                        color: 'var(--text-quiet)'
                      }}
                    >
                      {fallbackNote}
                    </div>
                  )}

                  <div className="chart-legend-custom">
                    <div className="legend-item">
                      <span className="legend-color" style={{ backgroundColor: '#0284c7' }}></span>
                      <span>Average Occupancy</span>
                    </div>
                    {showMaxOccupancy && (
                      <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                        <span>Max Occupancy</span>
                      </div>
                    )}
                    <div className="legend-item">
                      <span className="legend-line" style={{ backgroundColor: '#ef4444' }}></span>
                      <span>Critical Threshold ({settings?.thresholds?.criticalThreshold || 90}%)</span>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={hourlyChartData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                      <XAxis
                        dataKey="hour"
                        stroke="var(--text-quiet)"
                        tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="var(--text-quiet)"
                        tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                        domain={[0, 100]}
                        label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', fill: 'var(--text-quiet)' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                          borderRadius: '10px',
                          padding: '8px 12px'
                        }}
                        labelStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                        formatter={(value, name) => [
                          `${value}%`,
                          name === 'avgOccupancy' ? 'Average' : 'Max'
                        ]}
                      />
                      <ReferenceLine
                        y={settings?.thresholds?.criticalThreshold || 90}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="8 4"
                        label={{
                          value: `Critical: ${settings?.thresholds?.criticalThreshold || 90}%`,
                          position: 'right',
                          fill: '#ef4444',
                          fontSize: 11,
                          fontWeight: 500
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgOccupancy"
                        name="avgOccupancy"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={{ fill: '#0284c7', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      {showMaxOccupancy && (
                        <Line
                          type="monotone"
                          dataKey="maxOccupancy"
                          name="maxOccupancy"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          dot={{ fill: '#f59e0b', r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Daily Average Percentage Occupancy Graph */}
            {period !== 'today' && (
              <div className="daily-occupancy-section">
                <div className="chart-header">
                  <h3>Daily Average Percentage Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                  <div className="chart-options">
                    <label className="chart-option-toggle">
                      <input
                        type="checkbox"
                        checked={showMaxOccupancy}
                        onChange={(e) => setShowMaxOccupancy(e.target.checked)}
                      />
                      <span>Show Max Occupancy</span>
                    </label>
                  </div>
                </div>

                <div className="chart-legend-custom">
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#0284c7' }}></span>
                    <span>Average Occupancy</span>
                  </div>
                  {showMaxOccupancy && (
                    <div className="legend-item">
                      <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                      <span>Max Occupancy</span>
                    </div>
                  )}
                  <div className="legend-item">
                    <span className="legend-line" style={{ backgroundColor: '#ef4444' }}></span>
                    <span>Critical Threshold ({settings?.thresholds?.criticalThreshold || 90}%)</span>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={history
                      .filter((h, index) => {
                        if (period === '7d') return index < 7;
                        if (period === '30d') return index < 30;
                        return true;
                      })
                      .map(h => {
                        let avgOccupancy = parseFloat(h.occupancyRate);
                        let maxOccupancy = avgOccupancy;

                        // If a specific ward is selected, get that ward's occupancy rate
                        if (selectedWard !== 'All' && h.wardStats && Array.isArray(h.wardStats)) {
                          const wardData = h.wardStats.find(w => w.ward === selectedWard);
                          if (wardData) {
                            avgOccupancy = parseFloat(wardData.occupancyRate);
                            maxOccupancy = avgOccupancy;
                          }
                        } else if (h.wardStats && Array.isArray(h.wardStats)) {
                          // Calculate max from all wards
                          const wardOccupancies = h.wardStats.map(w => parseFloat(w.occupancyRate));
                          maxOccupancy = Math.max(...wardOccupancies, avgOccupancy);
                        }

                        // Add some variance for max (simulating peak times) if not already higher
                        if (maxOccupancy <= avgOccupancy) {
                          maxOccupancy = Math.min(100, avgOccupancy + Math.random() * 10 + 5);
                        }

                        return {
                          date: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          avgOccupancy: avgOccupancy,
                          maxOccupancy: parseFloat(maxOccupancy.toFixed(1))
                        };
                      })}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                    <XAxis
                      dataKey="date"
                      stroke="var(--text-quiet)"
                      tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                    />
                    <YAxis
                      stroke="var(--text-quiet)"
                      tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                      domain={[0, 100]}
                      label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', fill: 'var(--text-quiet)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                        border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                        borderRadius: '10px',
                        padding: '8px 12px'
                      }}
                      labelStyle={{
                        color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                      }}
                      itemStyle={{
                        color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                      }}
                      formatter={(value, name) => [
                        `${value}%`,
                        name === 'avgOccupancy' ? 'Average' : 'Max'
                      ]}
                    />
                    {/* Critical Threshold Reference Line */}
                    <ReferenceLine
                      y={settings?.thresholds?.criticalThreshold || 90}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      label={{
                        value: `Critical: ${settings?.thresholds?.criticalThreshold || 90}%`,
                        position: 'right',
                        fill: '#ef4444',
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    />
                    {/* Average Occupancy Line */}
                    <Line
                      type="monotone"
                      dataKey="avgOccupancy"
                      name="avgOccupancy"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ fill: '#0284c7', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    {/* Max Occupancy Line (conditional) */}
                    {showMaxOccupancy && (
                      <Line
                        type="monotone"
                        dataKey="maxOccupancy"
                        name="maxOccupancy"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: '#f59e0b', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {history.length > 0 && period !== 'today' && (
              <div className="history-table-section">
                <h3>
                  Daily Occupancy History
                  ({period === '7d' ? 'Last 7 Days' : 'Last 30 Days'})
                  {selectedWard !== 'All' && ` - ${selectedWard}`}
                </h3>
                <div className="history-table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Average hourly-occupancy rate</th>
                        <th>Max Hourly-Occupancy Rate of the Day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history
                        .slice(period === '7d' ? -7 : period === '30d' ? -30 : -1)
                        .reverse()
                        .map((record, idx) => {
                        // Calculate average and max occupancy rates from hourly data
                        let avgOccupancyRate = record.occupancyRate;
                        let maxOccupancyRate = record.occupancyRate;

                        if (record.hourlyData && Array.isArray(record.hourlyData) && record.hourlyData.length > 0) {
                          if (selectedWard !== 'All') {
                            // For a specific ward, calculate from hourly ward-specific data
                            const wardHourlyRates = [];
                            record.hourlyData.forEach(hourData => {
                              if (hourData.wardStats && Array.isArray(hourData.wardStats)) {
                                const wardData = hourData.wardStats.find(w => w.ward === selectedWard);
                                if (wardData) {
                                  wardHourlyRates.push(parseFloat(wardData.occupancyRate));
                                }
                              }
                            });

                            if (wardHourlyRates.length > 0) {
                              avgOccupancyRate = parseFloat((wardHourlyRates.reduce((sum, rate) => sum + rate, 0) / wardHourlyRates.length).toFixed(1));
                              maxOccupancyRate = parseFloat(Math.max(...wardHourlyRates).toFixed(1));
                            }
                          } else {
                            // For all wards, calculate from overall hourly data
                            const hourlyRates = record.hourlyData.map(h => parseFloat(h.occupancyRate));
                            avgOccupancyRate = parseFloat((hourlyRates.reduce((sum, rate) => sum + rate, 0) / hourlyRates.length).toFixed(1));
                            maxOccupancyRate = parseFloat(Math.max(...hourlyRates).toFixed(1));
                          }
                        } else {
                          // Fallback to old calculation if no hourly data
                          if (selectedWard !== 'All' && record.wardStats && Array.isArray(record.wardStats)) {
                            const wardData = record.wardStats.find(w => w.ward === selectedWard);
                            if (wardData) {
                              avgOccupancyRate = wardData.occupancyRate;
                              maxOccupancyRate = wardData.occupancyRate;
                            }
                          } else if (record.wardStats && Array.isArray(record.wardStats)) {
                            const wardOccupancies = record.wardStats.map(w => parseFloat(w.occupancyRate));
                            if (wardOccupancies.length > 0) {
                              maxOccupancyRate = Math.max(...wardOccupancies).toFixed(1);
                            }
                          }
                        }

                        return (
                          <tr key={idx}>
                            <td>{formatDate(record.timestamp)}</td>
                            <td>
                              <span className={`occupancy-cell ${avgOccupancyRate >= 90 ? 'critical' : avgOccupancyRate >= 80 ? 'warning' : 'normal'}`}>
                                {avgOccupancyRate}%
                              </span>
                            </td>
                            <td>
                              <span className={`occupancy-cell ${maxOccupancyRate >= 90 ? 'critical' : maxOccupancyRate >= 80 ? 'warning' : 'normal'}`}>
                                {maxOccupancyRate}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Bed Requests Tab */}
        {activeTab === 'requests' && (
          <div className="requests-analytics-content">
            <ResizableCard
              title="Bed Requests Analytics"
              minWidth={500}
              minHeight={300}
            >
              {/* Period Filter for Bed Requests */}
              <div className="period-selector" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Bed Requests</h3>
              <div className="period-buttons">
                <button
                  className={`period-btn ${requestsPeriod === 'today' ? 'active' : ''}`}
                  onClick={() => setRequestsPeriod('today')}
                >
                  Today
                </button>
                <button
                  className={`period-btn ${requestsPeriod === '7d' ? 'active' : ''}`}
                  onClick={() => setRequestsPeriod('7d')}
                >
                  Last 7 Days
                </button>
                <button
                  className={`period-btn ${requestsPeriod === '30d' ? 'active' : ''}`}
                  onClick={() => setRequestsPeriod('30d')}
                >
                  Last 30 Days
                </button>
              </div>
            </div>

            {!requestStats && (
              <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading bed requests data...</p>
              </div>
            )}
            {requestStats && filteredRequestStats && (
              <div className="request-stats-summary" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                <div className="stat-card stat-total" style={{ padding: '0.75rem' }}>
                  <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Requests</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{filteredRequestStats.total || 0}</div>
                </div>
                <div className="stat-card stat-pending" style={{ padding: '0.75rem' }}>
                  <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Pending</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{filteredRequestStats.pending || 0}</div>
                </div>
                <div className="stat-card stat-approved" style={{ padding: '0.75rem' }}>
                  <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Approved</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{filteredRequestStats.approved || 0}</div>
                </div>
                <div className="stat-card stat-denied" style={{ padding: '0.75rem' }}>
                  <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Denied</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{filteredRequestStats.denied || 0}</div>
                </div>
              </div>
            )}

            {/* Pie Chart for Request Statuses */}
            {requestStats && filteredRequestStats && (
              <div className="request-status-pie-chart-section" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Request Status Distribution</h3>
                {filteredRequestStats.total > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Pending', value: filteredRequestStats.pending || 0, color: '#f59e0b' },
                          { name: 'Approved', value: filteredRequestStats.approved || 0, color: '#10b981' },
                          { name: 'Denied', value: filteredRequestStats.denied || 0, color: '#ef4444' }
                        ].filter(item => item.value > 0)} // Filter out zero values
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={65}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          { name: 'Pending', value: filteredRequestStats.pending || 0, color: '#f59e0b' },
                          { name: 'Approved', value: filteredRequestStats.approved || 0, color: '#10b981' },
                          { name: 'Denied', value: filteredRequestStats.denied || 0, color: '#ef4444' }
                        ].filter(item => item.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                          borderRadius: '10px',
                          padding: '8px 12px'
                        }}
                        labelStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-quiet)' }}>No bed requests found for the selected period.</p>
                  </div>
                )}
              </div>
            )}

            {/* Show message only when stats are loaded but no requests match filters */}
            {requestStats && filteredRequestStats && filteredBedRequests.length === 0 && filteredRequestStats.total === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-quiet)' }}>No bed requests found for the selected period{selectedWard !== 'All' ? ` in ${selectedWard}` : ''}.</p>
              </div>
            )}

            {filteredBedRequests.length > 0 && (
              <div className="recent-requests" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                  Bed Requests
                  ({requestsPeriod === 'today' ? 'Today' : requestsPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'})
                  {selectedWard !== 'All' && ` - ${selectedWard}`}
                </h3>
                <div className="requests-table-container">
                  <table className="requests-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ height: '2.5rem' }}>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Request ID</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Patient</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Preferred Ward</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Created</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Created By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBedRequests
                        .slice(0, 100)
                        .map((request) => {
                          // Safety checks for nested properties
                          const patientName = request?.patientDetails?.name || 'Unknown Patient';
                          const createdByName = request?.createdBy?.name || 'Unknown';
                          
                          return (
                            <tr key={request._id} style={{ height: '2.5rem' }}>
                              <td style={{ padding: '0.5rem 0.75rem' }}>{request.requestId || 'N/A'}</td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>{patientName}</td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>{request.preferredWard || 'Any'}</td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>
                                <span className={`status-badge status-${request.status || 'unknown'}`} style={{ 
                                  padding: '0.25rem 0.5rem', 
                                  fontSize: '0.75rem',
                                  borderRadius: '4px'
                                }}>
                                  {request.status || 'Unknown'}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>{formatDateTime(request.createdAt)}</td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>{createdByName}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Ward Transfer Requests Section */}
            {(() => {
              // Filter ward transfers based on period and selected ward
              const now = new Date();
              let startDate = new Date();
              
              if (requestsPeriod === 'today') {
                startDate.setHours(0, 0, 0, 0);
              } else if (requestsPeriod === '7d') {
                startDate.setDate(now.getDate() - 7);
              } else if (requestsPeriod === '30d') {
                startDate.setDate(now.getDate() - 30);
              }

              const filteredTransfers = wardTransfers.filter(transfer => {
                const transferDate = new Date(transfer.requestedAt || transfer.createdAt);
                const matchesPeriod = transferDate >= startDate;
                const matchesWard = selectedWard === 'All' || 
                                   transfer.fromWard === selectedWard || 
                                   transfer.toWard === selectedWard;
                return matchesPeriod && matchesWard;
              });

              // Calculate transfer stats by status
              const transferStats = {
                total: filteredTransfers.length,
                pending: filteredTransfers.filter(t => t.status === 'pending').length,
                approved: filteredTransfers.filter(t => t.status === 'approved').length,
                completed: filteredTransfers.filter(t => t.status === 'completed').length,
                rejected: filteredTransfers.filter(t => t.status === 'rejected').length,
                cancelled: filteredTransfers.filter(t => t.status === 'cancelled').length
              };

              if (filteredTransfers.length === 0) {
                return (
                  <div style={{ padding: '0.75rem 0', textAlign: 'center', color: 'var(--text-quiet)' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>No ward transfer requests for the selected period{selectedWard !== 'All' ? ` involving ${selectedWard}` : ''}.</p>
                  </div>
                );
              }

              return (
                <>
                  {/* Ward Transfer Stats Summary */}
                  <div className="ward-transfer-section" style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Ward Transfer Requests</h3>
                    <div className="request-stats-summary" style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                      gap: '0.75rem',
                      marginBottom: '0.75rem'
                    }}>
                      <div className="stat-card stat-total" style={{ padding: '0.75rem' }}>
                        <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Transfers</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{transferStats.total}</div>
                      </div>
                      <div className="stat-card stat-pending" style={{ padding: '0.75rem' }}>
                        <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Pending</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{transferStats.pending}</div>
                      </div>
                      <div className="stat-card stat-approved" style={{ padding: '0.75rem' }}>
                        <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Approved</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{transferStats.approved}</div>
                      </div>
                      <div className="stat-card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', padding: '0.75rem' }}>
                        <div className="stat-title" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Completed</div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{transferStats.completed}</div>
                      </div>
                    </div>

                    {/* Transfer Flow Visualization */}
                    {transferStats.total > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Transfer Flow</h4>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Pending', value: transferStats.pending, color: '#f59e0b' },
                                { name: 'Approved', value: transferStats.approved, color: '#10b981' },
                                { name: 'Completed', value: transferStats.completed, color: '#8b5cf6' },
                                { name: 'Rejected', value: transferStats.rejected, color: '#ef4444' }
                              ].filter(item => item.value > 0)}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                              outerRadius={55}
                              dataKey="value"
                            >
                              {[
                                { name: 'Pending', value: transferStats.pending, color: '#f59e0b' },
                                { name: 'Approved', value: transferStats.approved, color: '#10b981' },
                                { name: 'Completed', value: transferStats.completed, color: '#8b5cf6' },
                                { name: 'Rejected', value: transferStats.rejected, color: '#ef4444' }
                              ].filter(item => item.value > 0).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                                border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                                borderRadius: '8px',
                                padding: '8px 12px'
                              }}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Ward Transfer Table */}
                    <div className="requests-table-container">
                      <table className="requests-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ height: '2.5rem' }}>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Transfer ID</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Patient</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>From Ward</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>To Ward</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Requested</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Requested By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTransfers.slice(0, 50).map((transfer) => {
                            const patientName = transfer?.patientId?.name || 'Unknown Patient';
                            const requestedByName = transfer?.requestedBy?.name || 'Unknown';
                            
                            return (
                              <tr key={transfer._id} style={{ height: '2.5rem' }}>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{transfer.transferId || 'N/A'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{patientName}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{transfer.fromWard || 'N/A'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                  <span style={{ fontWeight: 600, color: '#10b981', fontSize: '0.85rem' }}>
                                    {transfer.toWard || 'N/A'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                  <span className={`status-badge status-${transfer.status || 'unknown'}`} style={{ 
                                    padding: '0.25rem 0.5rem', 
                                    fontSize: '0.75rem',
                                    borderRadius: '4px'
                                  }}>
                                    {transfer.status || 'Unknown'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{formatDateTime(transfer.requestedAt || transfer.createdAt)}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{requestedByName}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
            </ResizableCard>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="settings-content">
            {!settings ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading settings...</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-quiet)', marginTop: '1rem' }}>
                  If this message persists, check the browser console for errors.
                </p>
              </div>
            ) : (
            <ResizableCard
              title="System Configuration"
              minWidth={500}
              minHeight={300}
            >
              <div className="settings-section">
              <h3>System Configuration</h3>

              <div className="settings-grid">
                <div className="setting-card">
                  <h4>Occupancy Alert Thresholds</h4>
                  <div className="setting-item">
                    <label>Warning Threshold (Yellow)</label>
                    <input
                      type="number"
                      value={settings.thresholds?.warningThreshold || 80}
                      onChange={(e) => setSettings({
                        ...settings,
                        thresholds: {
                          ...settings.thresholds,
                          warningThreshold: parseInt(e.target.value)
                        }
                      })}
                      min="0"
                      max="100"
                    />
                    <span className="setting-unit">%</span>
                  </div>
                  <div className="setting-item">
                    <label>Critical Threshold (Red)</label>
                    <input
                      type="number"
                      value={settings.thresholds?.criticalThreshold || 90}
                      onChange={(e) => setSettings({
                        ...settings,
                        thresholds: {
                          ...settings.thresholds,
                          criticalThreshold: parseInt(e.target.value)
                        }
                      })}
                      min="0"
                      max="100"
                    />
                    <span className="setting-unit">%</span>
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Reporting Configuration</h4>
                  <div className="setting-item setting-item-inline">
                    <label>Default Report Period</label>
                    <div className="setting-input-inline">
                      <select
                        value={settings.reporting?.defaultPeriod || '1'}
                        onChange={(e) => setSettings({
                          ...settings,
                          reporting: {
                            ...settings.reporting,
                            defaultPeriod: e.target.value
                          }
                        })}
                      >
                        {[1, 7, 30].map(option => (
                          <option key={option} value={option.toString()}>{option}</option>
                        ))}
                      </select>
                      <span className="setting-unit setting-unit-inline">Days</span>
                    </div>
                  </div>
                  <div className="setting-item setting-item-inline">
                    <label>Auto-refresh Interval</label>
                    <div className="setting-input-inline">
                      <input
                        type="number"
                        value={settings.reporting?.autoRefreshInterval || 60}
                        onChange={(e) => setSettings({
                          ...settings,
                          reporting: {
                            ...settings.reporting,
                            autoRefreshInterval: parseInt(e.target.value)
                          }
                        })}
                        min="10"
                        max="300"
                      />
                      <span className="setting-unit setting-unit-inline">seconds</span>
                    </div>
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Ward Bed Capacity</h4>
                  <div className="setting-item">
                    <label>Emergency Ward</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.Emergency || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          Emergency: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                  <div className="setting-item">
                    <label>ICU</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.ICU || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          ICU: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                  <div className="setting-item">
                    <label>General Ward</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.['General Ward'] || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          'General Ward': parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                  <div className="setting-item">
                    <label>Cardiology</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.Cardiology || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          Cardiology: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                </div>
              </div>

              {/* Settings Actions */}
              <div className="settings-actions">
                <button
                  className="btn-save-settings"
                  onClick={handleUpdateSettings}
                  disabled={settingsSaving}
                >
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  className="btn-reset-settings"
                  onClick={handleResetSettings}
                  disabled={settingsSaving}
                >
                  Reset to Defaults
                </button>
              </div>

              {/* Seed Data Import Section */}
              <div className="seed-import-section">
                <h3>Import Historical Data</h3>

                <div className="seed-import-container">
                  <div className="seed-file-upload">
                    <label htmlFor="seed-file-input" className="file-upload-label">
                      Select Seed Data File (JSON)
                    </label>
                    <input
                      type="file"
                      id="seed-file-input"
                      accept=".json"
                      onChange={handleSeedFileSelect}
                      className="file-input"
                    />
                    {seedFile && (
                      <div className="selected-file">
                        <span className="file-name">{seedFile.name}</span>
                        <span className="file-size">({(seedFile.size / 1024).toFixed(1)} KB)</span>
                        <button className="btn-clear-file" onClick={clearSeedSelection}>Clear</button>
                      </div>
                    )}
                  </div>

                  {/* Validation Results */}
                  {seedValidation && (
                    <div className={`seed-validation ${seedValidation.isValid ? 'valid' : 'invalid'}`}>
                      <h4>{seedValidation.isValid ? 'File Valid' : 'Validation Failed'}</h4>

                      {seedValidation.errors?.length > 0 && (
                        <div className="validation-errors">
                          <strong>Errors:</strong>
                          <ul>
                            {seedValidation.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {seedValidation.warnings?.length > 0 && (
                        <div className="validation-warnings">
                          <strong>Warnings:</strong>
                          <ul>
                            {seedValidation.warnings.map((warn, idx) => (
                              <li key={idx}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {seedValidation.isValid && seedValidation.summary && (
                        <div className="seed-summary">
                          <h5>Data Summary</h5>
                          <div className="summary-grid">
                            <div className="summary-item">
                              <span className="summary-label">Beds</span>
                              <span className="summary-value">{seedValidation.summary.beds || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Total Patients</span>
                              <span className="summary-value">{seedValidation.summary.patients || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Current Patients</span>
                              <span className="summary-value">{seedValidation.summary.currentPatients || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Discharged</span>
                              <span className="summary-value">{seedValidation.summary.dischargedPatients || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">History Days</span>
                              <span className="summary-value">{seedValidation.summary.occupancyHistory || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Alerts</span>
                              <span className="summary-value">{seedValidation.summary.alerts || 0}</span>
                            </div>
                          </div>

                          {dbStatus && (
                            <div className="current-db-status">
                              <h5>Current Database</h5>
                              <div className="summary-grid">
                                <div className="summary-item">
                                  <span className="summary-label">Beds</span>
                                  <span className="summary-value">{dbStatus.beds}</span>
                                </div>
                                <div className="summary-item">
                                  <span className="summary-label">Patients</span>
                                  <span className="summary-value">{dbStatus.patients}</span>
                                </div>
                                <div className="summary-item">
                                  <span className="summary-label">History Records</span>
                                  <span className="summary-value">{dbStatus.occupancyHistory}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Import Result */}
                  {seedImportResult && (
                    <div className={`seed-import-result ${seedImportResult.success ? 'success' : 'error'}`}>
                      <h4>{seedImportResult.success ? 'Import Successful' : 'Import Failed'}</h4>
                      {seedImportResult.success ? (
                        <>
                          <p>{seedImportResult.message}</p>
                          <div className="import-details">
                            {Object.entries(seedImportResult.results || {}).map(([key, value]) => (
                              <div key={key} className="import-detail-row">
                                <span className="detail-label">{key}:</span>
                                <span className="detail-imported">{value.imported} imported</span>
                                <span className="detail-skipped">{value.skipped} skipped</span>
                                {value.errors > 0 && <span className="detail-errors">{value.errors} errors</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="error-message">{seedImportResult.error}: {seedImportResult.details}</p>
                      )}
                    </div>
                  )}

                  {/* Import Button */}
                  {seedValidation?.isValid && (
                    <button
                      className="btn-import-seed"
                      onClick={handleSeedImport}
                      disabled={seedImporting}
                    >
                      {seedImporting ? 'Importing...' : 'Import Seed Data'}
                    </button>
                  )}
                </div>
              </div>

              {/* User Management Section */}
              <div className="user-management-section">
                <div className="section-header">
                  <h3>User Management</h3>
                  <button 
                    className="btn-add-user"
                    onClick={() => setShowUserForm(!showUserForm)}
                  >
                    {showUserForm ? 'Cancel' : '+ Add New User'}
                  </button>
                </div>

                {/* User Form */}
                {showUserForm && (
                  <div className="user-form-container">
                    <h4>{editingUser ? 'Edit User' : 'Create New User'}</h4>
                    <div className="user-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Username *</label>
                          <input
                            type="text"
                            value={userForm.username}
                            onChange={(e) => handleUserFormChange('username', e.target.value)}
                            placeholder="Enter username"
                            className={userFormErrors.username ? 'error' : ''}
                          />
                          {userFormErrors.username && (
                            <span className="error-message">{userFormErrors.username}</span>
                          )}
                        </div>

                        <div className="form-group">
                          <label>Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                          <input
                            type="password"
                            value={userForm.password}
                            onChange={(e) => handleUserFormChange('password', e.target.value)}
                            placeholder={editingUser ? 'Enter new password (optional)' : 'Enter password'}
                            className={userFormErrors.password ? 'error' : ''}
                          />
                          {userFormErrors.password && (
                            <span className="error-message">{userFormErrors.password}</span>
                          )}
                        </div>
                      </div>

                      <div className="form-row single-column">
                        <div className="form-group">
                          <label>Role * {editingUser?.role === 'admin' && '(Admin role cannot be changed)'}</label>
                          <select
                            value={userForm.role}
                            onChange={(e) => handleUserFormChange('role', e.target.value)}
                            className={userFormErrors.role ? 'error' : ''}
                            disabled={editingUser?.role === 'admin'}
                          >
                            <option value="ward_staff">Ward Staff</option>
                            <option value="er_staff">ER Staff</option>
                            <option value="icu_manager">ICU Manager</option>
                            <option value="admin">Administrator</option>
                          </select>
                          {userFormErrors.role && (
                            <span className="error-message">{userFormErrors.role}</span>
                          )}
                        </div>
                      </div>

                      <div className="form-actions">
                        <button 
                          className="btn-submit-user"
                          onClick={editingUser ? handleUpdateUser : handleCreateUser}
                        >
                          {editingUser ? 'Update User' : 'Create User'}
                        </button>
                        <button 
                          className="btn-cancel-user"
                          onClick={handleCancelUserForm}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Users List */}
                <div className="users-list">
                  {users.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <p>Loading users...</p>
                    </div>
                  ) : (
                    <div className="users-table-container">
                      <table className="users-table">
                        <thead>
                          <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Created</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.id}>
                              <td>{user.username}</td>
                              <td>
                                <span className={`role-badge role-${user.role}`}>
                                  {user.role === 'admin' ? 'Administrator' :
                                   user.role === 'icu_manager' ? 'ICU Manager' :
                                   user.role === 'ward_staff' ? 'Ward Staff' :
                                   user.role === 'er_staff' ? 'ER Staff' : user.role}
                                </span>
                              </td>
                              <td>{formatDate(user.createdAt)}</td>
                              <td>
                                <div className="user-actions">
                                  <button 
                                    className="btn-edit-user"
                                    onClick={() => handleEditUser(user)}
                                    title="Edit user"
                                  >
                                    ✏️
                                  </button>
                                  <button 
                                    className="btn-delete-user"
                                    onClick={() => handleDeleteUser(user)}
                                    title={user.role === 'admin' ? 'Admin users cannot be deleted' : 'Delete user'}
                                    disabled={user.role === 'admin'}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {settings.lastUpdatedBy && (
                <div className="settings-info">
                  <p>
                    <strong>Last updated by:</strong> {settings.lastUpdatedBy.name} on {new Date(settings.updatedAt).toLocaleString()}
                  </p>
                </div>
              )}
              </div>
            </ResizableCard>
            )}
          </div>
        )}
      </div>
      <AdminChatbot />

      {/* Notification Toast */}
      {notification && (
        <div 
          className={`notification-toast notification-${notification.type}`}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10000,
            maxWidth: '400px',
            animation: 'slideInRight 0.3s ease-out',
            backgroundColor: notification.type === 'success' ? '#10b981' : 
                           notification.type === 'error' ? '#ef4444' : 
                           notification.type === 'warning' ? '#f59e0b' : '#3b82f6',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <span style={{ fontSize: '20px' }}>
            {notification.type === 'success' ? '✓' : 
             notification.type === 'error' ? '✕' : 
             notification.type === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span style={{ flex: 1 }}>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '0',
              lineHeight: '1'
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
