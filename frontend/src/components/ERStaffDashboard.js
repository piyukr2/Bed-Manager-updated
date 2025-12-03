import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EmergencyAdmission from './EmergencyAdmission';
import ResizableCard from './ResizableCard';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ERStaffDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [requests, setRequests] = useState([]);
  // const [stats, setStats] = useState(null);
  const [availabilitySummary, setAvailabilitySummary] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState(null);
  const [availableBeds, setAvailableBeds] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'pending', 'approved'
  const [selectedWard, setSelectedWard] = useState('All'); // Ward filter
  const [searchQuery, setSearchQuery] = useState(''); // Search by bed number or patient name
  // eslint-disable-next-line no-unused-vars
  const [settings, setSettings] = useState(null);
  const [errorNotification, setErrorNotification] = useState({ show: false, message: '', type: 'error' });

  // Simple notification function for errors
  const showErrorNotification = (type, message) => {
    setErrorNotification({ show: true, message, type });
    setTimeout(() => {
      setErrorNotification({ show: false, message: '', type: 'error' });
    }, 5000);
  };

  // Play notification sound function
  const playNotificationSound = () => {
    try {
      // Create an AudioContext for better browser support
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create a more pleasant notification sound with multiple tones
      const playTone = (frequency, startTime, duration, volume = 0.15) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);
        
        // Smooth fade in and out for better sound quality
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(volume * 0.8, startTime + duration - 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      // Create a pleasant three-tone ascending notification (like a modern app notification)
      const now = audioContext.currentTime;
      playTone(523.25, now, 0.15, 0.12);        // C5 - first note
      playTone(659.25, now + 0.12, 0.15, 0.14); // E5 - second note
      playTone(783.99, now + 0.24, 0.25, 0.16); // G5 - third note (longer, slightly louder)

    } catch (error) {
      console.log('Audio notification not available:', error);
      // Fallback: try to play mp3 if it exists
      try {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (e) {
        console.log('Audio fallback failed');
      }
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchStats();
    fetchAvailabilitySummary();
    fetchSettings();

    const interval = setInterval(() => {
      fetchRequests();
      fetchStats();
      fetchAvailabilitySummary();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Refetch data when ward filter changes
  useEffect(() => {
    fetchAvailabilitySummary();
  }, [selectedWard]);

  useEffect(() => {
    if (!socket) return;

    socket.on('bed-request-approved', (request) => {
      fetchRequests();
      fetchStats();
      fetchAvailabilitySummary();

      // Show approval notification
      setNotification({
        type: 'approved',
        request: request
      });
      setShowNotification(true);

      // Play notification sound
      playNotificationSound();
    });

    socket.on('bed-request-denied', (request) => {
      fetchRequests();
      fetchStats();

      // Show denial notification
      setNotification({
        type: 'denied',
        request: request
      });
      setShowNotification(true);

      // Play notification sound
      playNotificationSound();
    });

    socket.on('bed-request-fulfilled', (request) => {
      fetchRequests();
      fetchStats();
      fetchAvailabilitySummary();
    });

    socket.on('bed-updated', () => {
      fetchAvailabilitySummary();
    });

    // Listen for deletions (real-time sync across all users)
    socket.on('bed-request-deleted', (data) => {
      console.log('Bed request deleted:', data);
      // Remove from local state immediately
      setRequests(prevRequests => prevRequests.filter(r => r._id !== data.requestId));
      fetchStats(); // Update tab counts
    });

    return () => {
      socket.off('bed-request-approved');
      socket.off('bed-request-denied');
      socket.off('bed-request-fulfilled');
      socket.off('bed-updated');
      socket.off('bed-request-deleted');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests`);
      setRequests(response.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const fetchStats = async () => {
    try {
      await axios.get(`${API_URL}/bed-requests/stats`);
      // setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchAvailabilitySummary = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds/stats`);
      setAvailabilitySummary(response.data);
    } catch (error) {
      console.error('Error fetching availability:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  // // Calculate filtered stats based on selected ward
  // const getFilteredStats = () => {
  //   if (!stats || selectedWard === 'All') {
  //     return stats;
  //   }

  //   return {
  //     total: stats.byWard?.[selectedWard]?.total || 0,
  //     pending: stats.byWard?.[selectedWard]?.pending || 0,
  //     approved: stats.byWard?.[selectedWard]?.approved || 0,
  //     denied: stats.byWard?.[selectedWard]?.denied || 0,
  //     fulfilled: stats.byWard?.[selectedWard]?.fulfilled || 0,
  //     cancelled: stats.byWard?.[selectedWard]?.cancelled || 0
  //   };
  // };

  // Calculate filtered availability based on selected ward
  const getFilteredAvailability = () => {
    if (!availabilitySummary) return null;

    if (selectedWard === 'All') {
      return availabilitySummary;
    }

    // Filter availability by ward
    const wardStats = availabilitySummary.wardStats?.find(w => w._id === selectedWard);
    if (wardStats) {
      return {
        totalBeds: wardStats.total,
        occupied: wardStats.occupied,
        available: wardStats.available,
        cleaning: wardStats.cleaning,
        reserved: wardStats.reserved,
        occupancyRate: ((wardStats.occupied / wardStats.total) * 100).toFixed(1)
      };
    }

    return null;
  };

  // const filteredStats = getFilteredStats();
  const filteredAvailability = getFilteredAvailability();

  const fetchAvailableBeds = async (ward) => {
    try {
      const response = await axios.get(`${API_URL}/beds`);
      const available = response.data.filter(bed =>
        bed.status === 'available' && (!ward || bed.ward === ward)
      );
      setAvailableBeds(available);
    } catch (error) {
      console.error('Error fetching available beds:', error);
      setAvailableBeds([]);
    }
  };

  const handleCreateRequest = async (e, newRequest, reserveBed, selectedBedId) => {
    setLoading(true);

    try {
      // Create bed request with the newRequest data
      const response = await axios.post(`${API_URL}/bed-requests`, newRequest);
      const createdRequest = response.data.request;

      // If user wants to reserve a bed immediately, approve the request
      if (reserveBed && selectedBedId) {
        await axios.post(`${API_URL}/bed-requests/${createdRequest._id}/approve`, {
          bedId: selectedBedId
        });
      }

      setAvailableBeds([]);
      setShowCreateModal(false);
      fetchRequests();
      fetchStats();
    } catch (error) {
      console.error('Error creating request:', error);
      showErrorNotification('error', error.response?.data?.error || 'Failed to create bed request');
    } finally {
      setLoading(false);
    }
  };


  const handleCancelRequest = async (requestId) => {
    // Find the request to check its status
    const request = requests.find(r => r._id === requestId);
    
    if (!request) return;

    // Different actions based on status
  const isTerminalState = request.status === 'denied';
    
    if (isTerminalState) {
      // For terminal states, soft delete from database
      if (!window.confirm(`Remove this ${request.status} request permanently?`)) return;
      
      try {
        // Call DELETE endpoint - this will soft delete in DB and broadcast via socket
        await axios.delete(`${API_URL}/bed-requests/${requestId}`);
        
        // Socket listener will handle removal from local state
        // But we can also do it here for immediate feedback
        setRequests(prevRequests => prevRequests.filter(r => r._id !== requestId));
        fetchStats(); // Update counts
      } catch (error) {
        console.error('Error deleting request:', error);
        showErrorNotification('error', error.response?.data?.error || 'Failed to delete request');
      }
      return;
    }

    // For pending/approved requests, cancel via API first
    const confirmMessage = request.status === 'pending' 
      ? 'Cancel this pending bed request? This will change its status to cancelled.'
      : 'Cancel this approved bed request? The reserved bed will be released.';
    
    if (!window.confirm(confirmMessage)) return;

    try {
      // First cancel the request
      await axios.post(`${API_URL}/bed-requests/${requestId}/cancel`, {
        reason: 'Cancelled by ER staff'
      });
      
      // Refresh data to show new cancelled status
      fetchRequests();
      fetchStats();
      fetchAvailabilitySummary();
    } catch (error) {
      console.error('Error cancelling request:', error);
      showErrorNotification('error', error.response?.data?.error || 'Failed to cancel request');
    }
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      pending: 'status-badge-pending',
      approved: 'status-badge-approved',
  denied: 'status-badge-denied',
  fulfilled: 'status-badge-fulfilled',
  cancelled: 'status-badge-cancelled'
    };
    return classes[status] || 'status-badge-default';
  };

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="er-staff-dashboard">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="brand-identity">
            <div className="brand-mark">AD</div>
            <div className="brand-copy">
              <h1>Admissions - Bed Request Center</h1>
              <p className="subtitle">Request and track bed assignments for incoming patients</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="emergency-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + New Bed Request
          </button>
          <div className="user-info">
            <span className="user-name">{currentUser.name}</span>
            <span className="user-role">(Admissions)</span>
            {currentUser.ward && <span className="user-ward">- {currentUser.ward}</span>}
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

      <div className="er-main-content">
        {/* Ward Filter */}
        <ResizableCard
          title="Ward Filter"
          minWidth={300}
          minHeight={100}
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

        {/* Availability Summary */}
        {filteredAvailability && (
          <ResizableCard
            title="Current Bed Availability"
            minWidth={400}
            minHeight={150}
          >
            <div className="availability-summary">
              <h3>Current Bed Availability{selectedWard !== 'All' ? ` - ${selectedWard}` : ' (Hospital-wide)'}</h3>
              <div className="availability-grid">
                <div className="availability-item">
                  <span className="availability-label">Total Beds:</span>
                  <span className="availability-value total">{filteredAvailability.totalBeds}</span>
                </div>
                <div className="availability-item">
                  <span className="availability-label">Available Beds:</span>
                  <span className="availability-value available">{filteredAvailability.available}</span>
                </div>
                <div className="availability-item">
                  <span className="availability-label">Occupied:</span>
                  <span className="availability-value occupied">{filteredAvailability.occupied}</span>
                </div>
                <div className="availability-item">
                  <span className="availability-label">Under Cleaning:</span>
                  <span className="availability-value cleaning">{filteredAvailability.cleaning}</span>
                </div>
                <div className="availability-item">
                  <span className="availability-label">Reserved:</span>
                  <span className="availability-value reserved">{filteredAvailability.reserved}</span>
                </div>
              </div>
            </div>
          </ResizableCard>
        )}

        {/* Request Queue */}
        <ResizableCard
          title="My Bed Requests"
          minWidth={500}
          minHeight={300}
        >
          <div className="requests-section">
          <div className="section-header">
            <h2>My Bed Requests</h2>
            <p>Track status of all your bed requests</p>
          </div>

          {/* Status Filter Tabs */}
          <div className="status-tabs">
            <button
              className={`tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Requests
              <span className="badge">
                {requests.filter(r => selectedWard === 'All' || r.preferredWard === selectedWard).length}
              </span>
            </button>
            <button
              className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Pending
              <span className="badge">
                {requests.filter(r => r.status === 'pending' && (selectedWard === 'All' || r.preferredWard === selectedWard)).length}
              </span>
            </button>
            <button
              className={`tab ${activeTab === 'approved' ? 'active' : ''}`}
              onClick={() => setActiveTab('approved')}
            >
              Approved
              <span className="badge">
                {requests.filter(r => r.status === 'approved' && (selectedWard === 'All' || r.preferredWard === selectedWard)).length}
              </span>
            </button>
            <button
              className={`tab ${activeTab === 'denied' ? 'active' : ''}`}
              onClick={() => setActiveTab('denied')}
            >
              Denied
              <span className="badge">
                {requests.filter(r => r.status === 'denied' && (selectedWard === 'All' || r.preferredWard === selectedWard)).length}
              </span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="search-bar-section">
            <input
              type="text"
              className="search-input"
              placeholder="Search by patient name, bed number, or request ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {requests
            .filter(r => activeTab === 'all' || r.status === activeTab)
            .filter(r => selectedWard === 'All' || r.preferredWard === selectedWard)
            .filter(r => {
              if (!searchQuery) return true;
              const query = searchQuery.toLowerCase();
              return (
                r.requestId?.toLowerCase().includes(query) ||
                r.patientDetails?.name?.toLowerCase().includes(query) ||
                r.assignedBed?.bedNumber?.toLowerCase().includes(query)
              );
            })
            .length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No {activeTab === 'all' ? '' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Requests</h3>
              <p>
                {searchQuery ? `No requests matching "${searchQuery}"` :
                  activeTab === 'all' ? 'Click "New Bed Request" to create your first request' :
                  `No ${activeTab} requests found`}
              </p>
            </div>
          ) : (
            <div className="requests-list requests-list-compact">
              {requests
                .filter(r => {
                  if (activeTab === 'all') return true;
                  return r.status === activeTab;
                })
                .filter(r => selectedWard === 'All' || r.preferredWard === selectedWard)
                .filter(r => {
                  if (!searchQuery) return true;
                  const query = searchQuery.toLowerCase();
                  return (
                    r.requestId?.toLowerCase().includes(query) ||
                    r.patientDetails?.name?.toLowerCase().includes(query) ||
                    r.assignedBed?.bedNumber?.toLowerCase().includes(query)
                  );
                })
                .map((request) => {
                  const isTerminalState = request.status === 'denied';
                  return (
                <div key={request._id} className="request-card request-card-compact">
                  {/* Close/Remove button */}
                  <button
                    className="request-close-btn"
                    onClick={() => handleCancelRequest(request._id)}
                    title={isTerminalState ? 'Remove from view' : 
                          request.status === 'pending' ? 'Cancel this request' : 
                          'Cancel and release bed'}
                  >
                    ✕
                  </button>
                  
                  <div className="request-header-compact">
                    <div className="request-main-info">
                      <span className="request-id-compact">{request.requestId}</span>
                      <span className="patient-name-compact">{request.patientDetails.name}</span>
                      <span className="request-reason-chip">{request.patientDetails.reasonForAdmission}</span>
                    </div>
                    <span className={`status-badge-compact ${getStatusBadgeClass(request.status)}`}>
                      {request.status}
                    </span>
                  </div>

                  <div className="request-body-compact">
                    <div className="request-info-grid">
                      <div className="info-item-compact">
                        <span className="label-compact">Age/Gender:</span>
                        <span className="value-compact">{request.patientDetails.age} / {request.patientDetails.gender}</span>
                      </div>
                      <div className="info-item-compact">
                        <span className="label-compact">Ward:</span>
                        <span className="value-compact">{request.preferredWard || 'Any'}</span>
                      </div>
                      <div className="info-item-compact">
                        <span className="label-compact">Equipment:</span>
                        <span className="value-compact">{request.patientDetails.requiredEquipment}</span>
                      </div>
                      <div className="info-item-compact">
                        <span className="label-compact">ETA:</span>
                        <span className="value-compact">{formatDateTime(request.eta)}</span>
                      </div>
                    </div>

                    {request.assignedBed && (
                      <div className="assigned-bed-compact">
                        <span className="bed-icon">🛏️</span>
                        <strong>{request.assignedBed.bedNumber}</strong>
                        <span className="ward-label-compact">({request.assignedBed.ward})</span>
                      </div>
                    )}

                    {request.denialReason && (
                      <div className="denial-reason-compact">
                        <strong>Denied:</strong> {request.denialReason}
                      </div>
                    )}
                  </div>

                  <div className="request-footer-compact">
                    <span className="request-time-compact">
                      {formatDateTime(request.createdAt)}
                    </span>
                  </div>
                </div>
              );
              })}
            </div>
          )}
          </div>
        </ResizableCard>
      </div>

      {/* Create Request Modal */}
      <EmergencyAdmission
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setAvailableBeds([]);
        }}
        onSubmit={handleCreateRequest}
        loading={loading}
        title="New Bed Request"
        submitButtonText="Create Request"
        showBedReservation={true}
        availableBeds={availableBeds}
        onFetchBeds={fetchAvailableBeds}
      />

      {/* Request Status Notification Popup */}
      {showNotification && notification && (
        <div className="notification-overlay">
          <div className="notification-popup">
            <div className={`notification-header ${notification.type === 'approved' ? 'notification-approved' : 'notification-denied'}`}>
              <div className="notification-icon">
                {notification.type === 'approved' ? '✅' : '❌'}
              </div>
              <div className="notification-title">
                <h3>
                  {notification.type === 'approved' ? 'Request Approved!' : 'Request Denied'}
                </h3>
                <span className="notification-time">Just now</span>
              </div>
              <button
                className="notification-close"
                onClick={() => setShowNotification(false)}
              >
                ×
              </button>
            </div>

            <div className="notification-body">
              <div className="notification-detail">
                <span className="detail-label">Request ID:</span>
                <span className="detail-value">{notification.request.requestId}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Patient:</span>
                <span className="detail-value">{notification.request.patientDetails?.name}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Reason:</span>
                <span className="detail-value">{notification.request.patientDetails?.reasonForAdmission}</span>
              </div>

              {notification.type === 'approved' && notification.request.assignedBed && (
                <>
                  <div className="notification-detail">
                    <span className="detail-label">Assigned Bed:</span>
                    <span className="detail-value bed-number-highlight">
                      {notification.request.assignedBed.bedNumber}
                    </span>
                  </div>
                  <div className="notification-detail">
                    <span className="detail-label">Ward:</span>
                    <span className="detail-value">{notification.request.assignedBed.ward}</span>
                  </div>
                  {notification.request.reviewedBy && (
                    <div className="notification-detail">
                      <span className="detail-label">Approved by:</span>
                      <span className="detail-value">{notification.request.reviewedBy.name}</span>
                    </div>
                  )}
                </>
              )}

              {notification.type === 'denied' && (
                <>
                  {notification.request.denialReason && (
                    <div className="notification-detail-full">
                      <span className="detail-label">Reason:</span>
                      <p className="detail-description denial-reason">{notification.request.denialReason}</p>
                    </div>
                  )}
                  {notification.request.reviewedBy && (
                    <div className="notification-detail">
                      <span className="detail-label">Reviewed by:</span>
                      <span className="detail-value">{notification.request.reviewedBy.name}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="notification-actions">
              <button
                className="btn-notification-dismiss"
                onClick={() => setShowNotification(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Notification Toast */}
      {errorNotification.show && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: errorNotification.type === 'success' ? '#4CAF50' : '#f44336',
          color: 'white',
          padding: '16px',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          zIndex: 9999,
          minWidth: '300px'
        }}>
          {errorNotification.message}
        </div>
      )}
    </div>
  );
}

export default ERStaffDashboard;
