import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ERStaffDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [availabilitySummary, setAvailabilitySummary] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState(null);
  const [reserveBed, setReserveBed] = useState(false);
  const [availableBeds, setAvailableBeds] = useState([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'pending', 'approved', 'closed'
  const [selectedWard, setSelectedWard] = useState('All'); // Ward filter
  const [searchQuery, setSearchQuery] = useState(''); // Search by bed number or patient name
  const [newRequest, setNewRequest] = useState({
    patientDetails: {
      name: '',
      age: '',
      gender: 'Male',
      contactNumber: '',
      triageLevel: 'Semi-Urgent',
      reasonForAdmission: '',
      requiredEquipment: 'Standard',
      estimatedStay: 24
    },
    preferredWard: 'ICU',
    eta: '',
    notes: ''
  });

  useEffect(() => {
    fetchRequests();
    fetchStats();
    fetchAvailabilitySummary();

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
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (e) {
        console.log('Audio not available');
      }
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
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (e) {
        console.log('Audio not available');
      }
    });

    socket.on('bed-request-fulfilled', (request) => {
      fetchRequests();
      fetchStats();
      fetchAvailabilitySummary();
    });

    socket.on('bed-request-expired', (request) => {
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
      socket.off('bed-request-expired');
      socket.off('bed-updated');
      socket.off('bed-request-deleted');
    };
  }, [socket]);

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
      const response = await axios.get(`${API_URL}/bed-requests/stats`);
      setStats(response.data);
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

  // Calculate filtered stats based on selected ward
  const getFilteredStats = () => {
    if (!stats || selectedWard === 'All') {
      return stats;
    }

    return {
      total: stats.byWard?.[selectedWard]?.total || 0,
      pending: stats.byWard?.[selectedWard]?.pending || 0,
      approved: stats.byWard?.[selectedWard]?.approved || 0,
      denied: stats.byWard?.[selectedWard]?.denied || 0,
      fulfilled: stats.byWard?.[selectedWard]?.fulfilled || 0,
      cancelled: stats.byWard?.[selectedWard]?.cancelled || 0
    };
  };

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

  const filteredStats = getFilteredStats();
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

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create bed request
      const response = await axios.post(`${API_URL}/bed-requests`, newRequest);
      const createdRequest = response.data.request;

      // If user wants to reserve a bed immediately, approve the request
      if (reserveBed && selectedBedId) {
        await axios.post(`${API_URL}/bed-requests/${createdRequest._id}/approve`, {
          bedId: selectedBedId,
          reservationTTL: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
        });
      }

      // Reset form
      setNewRequest({
        patientDetails: {
          name: '',
          age: '',
          gender: 'Male',
          contactNumber: '',
          triageLevel: 'Semi-Urgent',
          reasonForAdmission: '',
          requiredEquipment: 'Standard',
          estimatedStay: 24
        },
        preferredWard: 'ICU',
        eta: '',
        notes: ''
      });
      setReserveBed(false);
      setSelectedBedId('');
      setAvailableBeds([]);

      setShowCreateModal(false);
      fetchRequests();
      fetchStats();

      if (reserveBed && selectedBedId) {
        alert('✓ Bed request created and bed reserved successfully!');
      }
    } catch (error) {
      console.error('Error creating request:', error);
      alert(error.response?.data?.error || 'Failed to create bed request');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    // Find the request to check its status
    const request = requests.find(r => r._id === requestId);
    
    if (!request) return;

    // Different actions based on status
    const isTerminalState = ['cancelled', 'expired', 'denied', 'fulfilled'].includes(request.status);
    
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
        alert(error.response?.data?.error || 'Failed to delete request');
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
      alert(error.response?.data?.error || 'Failed to cancel request');
    }
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      pending: 'status-badge-pending',
      approved: 'status-badge-approved',
      denied: 'status-badge-denied',
      fulfilled: 'status-badge-fulfilled',
      cancelled: 'status-badge-cancelled',
      expired: 'status-badge-expired'
    };
    return classes[status] || 'status-badge-default';
  };

  const getTriageLevelClass = (level) => {
    const classes = {
      Critical: 'triage-critical',
      Urgent: 'triage-urgent',
      'Semi-Urgent': 'triage-semi-urgent',
      'Non-Urgent': 'triage-non-urgent'
    };
    return classes[level] || '';
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

        {/* Occupancy Rate - Above Availability Summary */}
        {filteredAvailability && (
          <div className="occupancy-rate-section">
            <h3>Occupancy Rate{selectedWard !== 'All' ? ` - ${selectedWard}` : ' (Hospital-wide)'}</h3>
            <div className="occupancy-rate-display">
              <span className={`occupancy-rate-value ${filteredAvailability.occupancyRate >= 90 ? 'critical' : filteredAvailability.occupancyRate >= 80 ? 'warning' : 'normal'}`}>
                {filteredAvailability.occupancyRate}%
              </span>
            </div>
          </div>
        )}

        {/* Availability Summary */}
        {filteredAvailability && (
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
        )}

        {/* Request Queue */}
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
              className={`tab ${activeTab === 'closed' ? 'active' : ''}`}
              onClick={() => setActiveTab('closed')}
            >
              Closed
              <span className="badge">
                {requests.filter(r => ['denied', 'cancelled', 'expired', 'fulfilled'].includes(r.status) && (selectedWard === 'All' || r.preferredWard === selectedWard)).length}
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
              <h3>No {activeTab === 'all' ? '' : activeTab === 'closed' ? 'Closed' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Requests</h3>
              <p>
                {searchQuery ? `No requests matching "${searchQuery}"` : 
                  activeTab === 'all' ? 'Click "New Bed Request" to create your first request' : 
                  activeTab === 'closed' ? 'No closed requests (denied, cancelled, expired, or fulfilled)' :
                  `No ${activeTab} requests found`}
              </p>
            </div>
          ) : (
            <div className="requests-list requests-list-compact">
              {requests
                .filter(r => {
                  if (activeTab === 'all') return true;
                  if (activeTab === 'closed') return ['denied', 'cancelled', 'expired', 'fulfilled'].includes(r.status);
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
                  const isTerminalState = ['cancelled', 'expired', 'denied', 'fulfilled'].includes(request.status);
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
                      <span className={`triage-badge-compact ${getTriageLevelClass(request.patientDetails.triageLevel)}`}>
                        {request.patientDetails.triageLevel}
                      </span>
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
      </div>

      {/* Create Request Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content emergency-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Bed Request</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateRequest} className="request-form">
              <div className="form-section">
                <h3>Patient Information</h3>

                <div className="form-row">
                  <div className="form-group">
                    <label>Patient Name *</label>
                    <input
                      type="text"
                      required
                      value={newRequest.patientDetails.name}
                      onChange={(e) => setNewRequest({
                        ...newRequest,
                        patientDetails: { ...newRequest.patientDetails, name: e.target.value }
                      })}
                      placeholder="Enter patient name"
                    />
                  </div>

                  <div className="form-group">
                    <label>Age *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      max="150"
                      value={newRequest.patientDetails.age}
                      onChange={(e) => setNewRequest({
                        ...newRequest,
                        patientDetails: { ...newRequest.patientDetails, age: e.target.value }
                      })}
                      placeholder="Age"
                    />
                  </div>

                  <div className="form-group">
                    <label>Gender *</label>
                    <select
                      required
                      value={newRequest.patientDetails.gender}
                      onChange={(e) => setNewRequest({
                        ...newRequest,
                        patientDetails: { ...newRequest.patientDetails, gender: e.target.value }
                      })}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="tel"
                    value={newRequest.patientDetails.contactNumber}
                    onChange={(e) => setNewRequest({
                      ...newRequest,
                      patientDetails: { ...newRequest.patientDetails, contactNumber: e.target.value }
                    })}
                    placeholder="Contact number"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Medical Details</h3>

                <div className="form-row">
                  <div className="form-group">
                    <label>Triage Level *</label>
                    <select
                      required
                      value={newRequest.patientDetails.triageLevel}
                      onChange={(e) => setNewRequest({
                        ...newRequest,
                        patientDetails: { ...newRequest.patientDetails, triageLevel: e.target.value }
                      })}
                      className={`triage-select ${getTriageLevelClass(newRequest.patientDetails.triageLevel)}`}
                    >
                      <option value="Critical">Critical</option>
                      <option value="Semi-Urgent">Semi-Urgent</option>
                      <option value="Non-Urgent">Non-Urgent</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Required Equipment *</label>
                    <select
                      required
                      value={newRequest.patientDetails.requiredEquipment}
                      onChange={(e) => setNewRequest({
                        ...newRequest,
                        patientDetails: { ...newRequest.patientDetails, requiredEquipment: e.target.value }
                      })}
                    >
                      <option value="Standard">Standard</option>
                      <option value="Ventilator">Ventilator</option>
                      <option value="ICU Monitor">ICU Monitor</option>
                      <option value="Cardiac Monitor">Cardiac Monitor</option>
                      <option value="Dialysis">Dialysis</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Reason for Admission *</label>
                  <textarea
                    required
                    rows="3"
                    value={newRequest.patientDetails.reasonForAdmission}
                    onChange={(e) => setNewRequest({
                      ...newRequest,
                      patientDetails: { ...newRequest.patientDetails, reasonForAdmission: e.target.value }
                    })}
                    placeholder="Describe the reason for admission"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Estimated Stay (hours)</label>
                    <input
                      type="number"
                      min="1"
                      value={newRequest.patientDetails.estimatedStay}
                      onChange={(e) => setNewRequest({
                        ...newRequest,
                        patientDetails: { ...newRequest.patientDetails, estimatedStay: parseInt(e.target.value) }
                      })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Preferred Ward</label>
                    <select
                      value={newRequest.preferredWard}
                      onChange={(e) => {
                        const ward = e.target.value;
                        setNewRequest({ ...newRequest, preferredWard: ward });
                        if (reserveBed) {
                          fetchAvailableBeds(ward);
                        }
                      }}
                    >
                      <option value="">Any Available</option>
                      <option value="ICU">ICU</option>
                      <option value="Emergency">Emergency</option>
                      <option value="Cardiology">Cardiology</option>
                      <option value="General Ward">General Ward</option>
                    </select>
                  </div>
                </div>

                {/* Bed Reservation Option */}
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={reserveBed}
                      onChange={(e) => {
                        setReserveBed(e.target.checked);
                        if (e.target.checked) {
                          fetchAvailableBeds(newRequest.preferredWard);
                        } else {
                          setAvailableBeds([]);
                          setSelectedBedId('');
                        }
                      }}
                    />
                    <span>Reserve a bed immediately (optional)</span>
                  </label>
                </div>

                {reserveBed && (
                  <div className="form-group">
                    <label>Select Bed to Reserve</label>
                    <select
                      value={selectedBedId}
                      onChange={(e) => setSelectedBedId(e.target.value)}
                      required={reserveBed}
                    >
                      <option value="">-- Select a bed --</option>
                      {availableBeds.map((bed) => (
                        <option key={bed._id} value={bed._id}>
                          {bed.bedNumber} - {bed.ward} (Floor {bed.location.floor}, {bed.equipmentType})
                        </option>
                      ))}
                    </select>
                    {availableBeds.length === 0 && (
                      <small className="form-help-text">
                        No available beds in {newRequest.preferredWard || 'selected ward'}
                      </small>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Expected Time of Arrival</label>
                  <input
                    type="datetime-local"
                    value={newRequest.eta}
                    onChange={(e) => setNewRequest({ ...newRequest, eta: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Additional Notes</label>
                  <textarea
                    rows="2"
                    value={newRequest.notes}
                    onChange={(e) => setNewRequest({ ...newRequest, notes: e.target.value })}
                    placeholder="Any additional information"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <span className="detail-label">Triage Level:</span>
                <span className={`triage-badge triage-${notification.request.patientDetails?.triageLevel?.toLowerCase()}`}>
                  {notification.request.patientDetails?.triageLevel}
                </span>
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
    </div>
  );
}

export default ERStaffDashboard;
