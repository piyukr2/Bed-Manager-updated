import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './CleaningDashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

const CleaningDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingJobs, setPendingJobs] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [cleaningStaff, setCleaningStaff] = useState([]);
  const [pendingStats, setPendingStats] = useState({ byFloor: [], byWard: [] });
  const [activeStats, setActiveStats] = useState({ byFloor: [], byWard: [] });
  const [selectedJob, setSelectedJob] = useState(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [notification, setNotification] = useState(null);
  const [socket, setSocket] = useState(null);

  const token = localStorage.getItem('token');

  // Check authentication on mount
  useEffect(() => {
    if (token) {
      setIsAuthenticated(true);
    }
  }, [token]);

  // Fetch functions - must be defined before conditional returns
  const fetchPendingJobs = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/cleaning-jobs?status=pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setPendingJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching pending jobs:', error);
      setPendingJobs([]);
    }
  }, [token]);

  const fetchActiveJobs = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/cleaning-jobs?status=active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setActiveJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching active jobs:', error);
      setActiveJobs([]);
    }
  }, [token]);

  const fetchStats = useCallback(async (status) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/cleaning-jobs/stats?status=${status}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (status === 'pending') {
        setPendingStats(data || { byFloor: [], byWard: [] });
      } else {
        setActiveStats(data || { byFloor: [], byWard: [] });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      if (status === 'pending') {
        setPendingStats({ byFloor: [], byWard: [] });
      } else {
        setActiveStats({ byFloor: [], byWard: [] });
      }
    }
  }, [token]);

  const fetchCleaningStaff = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/cleaning-staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setCleaningStaff(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching cleaning staff:', error);
      setCleaningStaff([]);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    fetchPendingJobs();
    fetchActiveJobs();
    fetchStats('pending');
    fetchStats('active');
    fetchCleaningStaff();

    // Setup socket connection
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to cleaning dashboard socket');
      console.log('Socket ID:', newSocket.id);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    newSocket.on('newCleaningJob', (job) => {
      console.log('🧹 New cleaning job received:', job);
      setNotification({
        type: 'new',
        job
      });
      fetchPendingJobs();
      fetchStats('pending');
    });

    newSocket.on('jobStarted', () => {
      fetchPendingJobs();
      fetchActiveJobs();
      fetchStats('pending');
      fetchStats('active');
    });

    newSocket.on('jobAssigned', () => {
      fetchActiveJobs();
      fetchCleaningStaff();
    });

    newSocket.on('jobCompleted', () => {
      fetchActiveJobs();
      fetchStats('active');
      fetchCleaningStaff();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, token, fetchPendingJobs, fetchActiveJobs, fetchStats, fetchCleaningStaff]);

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username: loginUsername,
        password: loginPassword
      });
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoginError(error.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    if (socket) {
      socket.disconnect();
    }
  };

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="cleaning-login-container">
        <div className="cleaning-login-card">
          <div className="cleaning-login-header">
            <div className="cleaning-icon-large">🧹</div>
            <h1>Cleaning Staff Admin</h1>
            <p>Login to manage cleaning operations</p>
          </div>
          <form onSubmit={handleLogin} className="cleaning-login-form">
            {loginError && (
              <div className="error-message">
                ❌ {loginError}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            <button type="submit" className="cleaning-login-btn">
              Login
            </button>
            <div className="quick-login-hint">
              <p>Quick login: Use any admin credentials</p>
              <p className="hint-text">admin / admin123</p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const handleStartJob = async (job) => {
    setSelectedJob(job);
    setShowStaffModal(true);
  };

  const handleAssignStaff = async (staffId) => {
    try {
      console.log('Starting job:', selectedJob._id);
      // Start the job first
      const startResponse = await fetch(`${API_URL}/cleaning-jobs/${selectedJob._id}/start`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || 'Failed to start job');
      }

      console.log('Job started, assigning staff:', staffId);
      // Then assign staff
      const assignResponse = await fetch(`${API_URL}/cleaning-jobs/${selectedJob._id}/assign`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ staffId })
      });

      if (!assignResponse.ok) {
        const errorData = await assignResponse.json();
        throw new Error(errorData.error || 'Failed to assign staff');
      }

      console.log('Staff assigned successfully');
      setShowStaffModal(false);
      setSelectedJob(null);
      fetchPendingJobs();
      fetchActiveJobs();
      fetchStats('pending');
      fetchStats('active');
      fetchCleaningStaff();
    } catch (error) {
      console.error('Error assigning staff:', error);
      alert('Failed to assign staff: ' + error.message);
    }
  };

  const handleCompleteJob = async (jobId) => {
    if (!window.confirm('Mark this cleaning job as completed?')) return;

    try {
      await fetch(`${API_URL}/cleaning-jobs/${jobId}/complete`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      fetchActiveJobs();
      fetchStats('active');
      fetchCleaningStaff();
    } catch (error) {
      console.error('Error completing job:', error);
      alert('Failed to complete job');
    }
  };

  const getFloorName = (floor) => {
    const floorNames = { 0: 'Ground', 1: '1st', 2: '2nd', 3: '3rd' };
    return floorNames[floor] || `${floor}th`;
  };

  return (
    <div className="cleaning-dashboard">
      {/* Notification */}
      {notification && (
        <div className="cleaning-notification">
          <div className="notification-content">
            <div className="notification-icon">🧹</div>
            <div className="notification-text">
              <strong>New Cleaning Job!</strong>
              <p>{notification.job.bedNumber} - {notification.job.ward} ({getFloorName(notification.job.floor)} Floor)</p>
            </div>
            <button 
              className="notification-close"
              onClick={() => setNotification(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="cleaning-header">
        <div>
          <h1>🧹 Cleaning Staff Dashboard</h1>
          <p>Manage hospital cleaning operations</p>
        </div>
        <div className="header-right">
          <div className="header-stats">
            <div className="stat-box pending-stat">
              <span className="stat-number">{pendingJobs.length}</span>
              <span className="stat-label">Pending</span>
            </div>
            <div className="stat-box active-stat">
              <span className="stat-number">{activeJobs.length}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-box staff-stat">
              <span className="stat-number">{cleaningStaff.filter(s => s.status === 'available').length}</span>
              <span className="stat-label">Available Staff</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="cleaning-tabs">
        <button
          className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          📋 Pending Jobs
        </button>
        <button
          className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          🔄 Active Jobs
        </button>
        <button
          className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          👥 Staff
        </button>
      </div>

      {/* Content */}
      <div className="cleaning-content">
        {activeTab === 'pending' && (
          <div className="jobs-section">
            {/* Stats */}
            <div className="stats-grid">
              <div className="stats-card">
                <h3>By Floor</h3>
                <div className="stats-list">
                  {pendingStats.byFloor.map(stat => (
                    <div key={stat.floor} className="stat-item">
                      <span>{getFloorName(stat.floor)} Floor</span>
                      <span className="stat-count">{stat.count}</span>
                    </div>
                  ))}
                  {pendingStats.byFloor.length === 0 && (
                    <p className="no-data">No pending jobs</p>
                  )}
                </div>
              </div>
              <div className="stats-card">
                <h3>By Ward</h3>
                <div className="stats-list">
                  {pendingStats.byWard.map(stat => (
                    <div key={stat.ward} className="stat-item">
                      <span>{stat.ward}</span>
                      <span className="stat-count">{stat.count}</span>
                    </div>
                  ))}
                  {pendingStats.byWard.length === 0 && (
                    <p className="no-data">No pending jobs</p>
                  )}
                </div>
              </div>
            </div>

            {/* Job List */}
            <div className="jobs-list">
              <h2>Pending Cleaning Jobs</h2>
              {pendingJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✨</div>
                  <h3>All Clean!</h3>
                  <p>No pending cleaning jobs at the moment</p>
                </div>
              ) : (
                <div className="jobs-grid">
                  {pendingJobs.map(job => (
                    <div key={job._id} className="job-card pending-job">
                      <div className="job-header">
                        <h3>{job.bedNumber}</h3>
                        <span className="job-status pending">Pending</span>
                      </div>
                      <div className="job-details">
                        <div className="job-detail-row">
                          <span className="detail-label">Ward:</span>
                          <span className="detail-value">{job.ward}</span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Floor:</span>
                          <span className="detail-value">{getFloorName(job.floor)}</span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Room:</span>
                          <span className="detail-value">{job.roomNumber}</span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Created:</span>
                          <span className="detail-value">{new Date(job.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <button
                        className="start-job-btn"
                        onClick={() => handleStartJob(job)}
                      >
                        Start Job
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'active' && (
          <div className="jobs-section">
            {/* Stats */}
            <div className="stats-grid">
              <div className="stats-card">
                <h3>By Floor</h3>
                <div className="stats-list">
                  {activeStats.byFloor.map(stat => (
                    <div key={stat.floor} className="stat-item">
                      <span>{getFloorName(stat.floor)} Floor</span>
                      <span className="stat-count">{stat.count}</span>
                    </div>
                  ))}
                  {activeStats.byFloor.length === 0 && (
                    <p className="no-data">No active jobs</p>
                  )}
                </div>
              </div>
              <div className="stats-card">
                <h3>By Ward</h3>
                <div className="stats-list">
                  {activeStats.byWard.map(stat => (
                    <div key={stat.ward} className="stat-item">
                      <span>{stat.ward}</span>
                      <span className="stat-count">{stat.count}</span>
                    </div>
                  ))}
                  {activeStats.byWard.length === 0 && (
                    <p className="no-data">No active jobs</p>
                  )}
                </div>
              </div>
            </div>

            {/* Job List */}
            <div className="jobs-list">
              <h2>Active Cleaning Jobs</h2>
              {activeJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">💤</div>
                  <h3>No Active Jobs</h3>
                  <p>All staff are currently idle</p>
                </div>
              ) : (
                <div className="jobs-grid">
                  {activeJobs.map(job => (
                    <div key={job._id} className="job-card active-job">
                      <div className="job-header">
                        <h3>{job.bedNumber}</h3>
                        <span className="job-status active">Active</span>
                      </div>
                      <div className="job-details">
                        <div className="job-detail-row">
                          <span className="detail-label">Ward:</span>
                          <span className="detail-value">{job.ward}</span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Floor:</span>
                          <span className="detail-value">{getFloorName(job.floor)}</span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Room:</span>
                          <span className="detail-value">{job.roomNumber}</span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Assigned to:</span>
                          <span className="detail-value assigned-staff">
                            {job.assignedToName || 'Unassigned'}
                          </span>
                        </div>
                        <div className="job-detail-row">
                          <span className="detail-label">Started:</span>
                          <span className="detail-value">{new Date(job.startedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <button
                        className="complete-job-btn"
                        onClick={() => handleCompleteJob(job._id)}
                      >
                        Complete Job
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="staff-section">
            <h2>Cleaning Staff</h2>
            <div className="staff-grid">
              {cleaningStaff.map(staff => (
                <div key={staff._id} className={`staff-card ${staff.status}`}>
                  <div className="staff-header">
                    <h3>{staff.name}</h3>
                    <span className={`staff-status ${staff.status}`}>
                      {staff.status === 'available' ? '✅ Available' : '🔴 Busy'}
                    </span>
                  </div>
                  <div className="staff-details">
                    <div className="staff-detail-row">
                      <span className="detail-label">Staff ID:</span>
                      <span className="detail-value">{staff.staffId}</span>
                    </div>
                    <div className="staff-detail-row">
                      <span className="detail-label">Active Jobs:</span>
                      <span className="detail-value">{staff.activeJobsCount}</span>
                    </div>
                    <div className="staff-detail-row">
                      <span className="detail-label">Total Completed:</span>
                      <span className="detail-value">{staff.totalJobsCompleted}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Staff Assignment Modal */}
      {showStaffModal && selectedJob && (
        <div className="modal-overlay" onClick={() => setShowStaffModal(false)}>
          <div className="staff-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Staff to {selectedJob.bedNumber}</h3>
              <button
                className="close-btn"
                onClick={() => setShowStaffModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="staff-selection-grid">
                {cleaningStaff.map(staff => (
                  <button
                    key={staff._id}
                    className={`staff-select-btn ${staff.status}`}
                    onClick={() => handleAssignStaff(staff._id)}
                    disabled={staff.status === 'busy' && staff.activeJobsCount >= 3}
                  >
                    <div className="staff-select-info">
                      <strong>{staff.name}</strong>
                      <span className="staff-id">{staff.staffId}</span>
                    </div>
                    <div className="staff-select-status">
                      <span className={`status-badge ${staff.status}`}>
                        {staff.status === 'available' ? 'Available' : `${staff.activeJobsCount} active`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CleaningDashboard;
