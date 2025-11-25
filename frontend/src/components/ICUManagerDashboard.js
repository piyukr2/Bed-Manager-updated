import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import OccupancyChart from './OccupancyChart';
import AlertPanel from './AlertPanel';
import ResizableCard from './ResizableCard';
// import BedGrid from './BedGrid';
import WardView from './WardView';
// import FloorPlan from './FloorPlan';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ICUManagerDashboard({
  currentUser,
  onLogout,
  theme,
  onToggleTheme,
  socket,
  beds,
  stats,
  patients,
  alerts,
  onUpdateBed,
  onEmergencyAdmission,
  onDischargePatient,
  selectedWard,
  setSelectedWard
}) {
  const [bedRequests, setBedRequests] = useState([]);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [recommendedBeds, setRecommendedBeds] = useState([]);
  // const [bedViewMode, setBedViewMode] = useState('ward');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'requests'
  const [showNewRequestAlert, setShowNewRequestAlert] = useState(false);
  const [newRequestNotification, setNewRequestNotification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [availableBeds, setAvailableBeds] = useState([]);
  const [reserveBed, setReserveBed] = useState(false);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [requestToDeny, setRequestToDeny] = useState(null);
  const [newRequest, setNewRequest] = useState({
    patientDetails: {
      name: '',
      age: '',
      gender: 'Male',
      contactNumber: '',
      triageLevel: 'Urgent',
      reasonForAdmission: '',
      requiredEquipment: 'ICU Monitor',
      estimatedStay: 24
    },
    preferredWard: 'ICU',
    eta: '',
    notes: ''
  });
  const [settings, setSettings] = useState(null);

  // Clear all resizable card dimensions on component mount (page refresh)
  useEffect(() => {
    const resizableKeys = [
      'icu-alerts-width',
      'icu-ward-filter-dimensions',
      'icu-stats-dimensions',
      'icu-capacity-graph-dimensions',
      'icu-beds-view-dimensions',
      'icu-requests-container-dimensions'
    ];
    
    resizableKeys.forEach(key => {
      localStorage.removeItem(key);
    });
  }, []);

  // Set default ward to 'All' on mount to show all 60 beds
  useEffect(() => {
    if (setSelectedWard) {
      setSelectedWard('All');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchBedRequests();
    fetchSettings();

    const interval = setInterval(fetchBedRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('new-bed-request', (request) => {
      fetchBedRequests();
      // Show popup notification
      setNewRequestNotification(request);
      setShowNewRequestAlert(true);
      // Play notification sound (optional)
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (e) {
        console.log('Audio not available');
      }
    });

    socket.on('bed-request-cancelled', (request) => {
      fetchBedRequests();
    });

    socket.on('bed-request-expired', (request) => {
      fetchBedRequests();
    });

    socket.on('bed-request-fulfilled', (request) => {
      fetchBedRequests();
    });

    return () => {
      socket.off('new-bed-request');
      socket.off('bed-request-cancelled');
      socket.off('bed-request-expired');
      socket.off('bed-request-fulfilled');
    };
  }, [socket]);

  const fetchBedRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests?status=pending`);
      setBedRequests(response.data);
    } catch (error) {
      console.error('Error fetching bed requests:', error);
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

  const handleRequestClick = async (request) => {
    setSelectedRequest(request);
    setShowRequestModal(true);

    // Fetch recommended beds
    try {
      const response = await axios.post(`${API_URL}/beds/recommend`, {
        ward: request.preferredWard,
        equipmentType: request.patientDetails.requiredEquipment,
        urgency: request.patientDetails.triageLevel === 'Urgent' ? 'high' : 'normal'
      });

      if (response.data.bed) {
        setRecommendedBeds([response.data.bed]);
      } else if (response.data.alternatives) {
        setRecommendedBeds([
          ...(response.data.alternatives.cleaning || []),
          ...(response.data.alternatives.reserved || [])
        ]);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      // Show alternatives from the error response if available
      if (error.response?.data?.alternatives) {
        setRecommendedBeds([
          ...(error.response.data.alternatives.cleaning || []),
          ...(error.response.data.alternatives.reserved || [])
        ]);
      } else {
        setRecommendedBeds([]);
      }
    }
  };

  const handleApproveRequest = async (requestId, bedId) => {
    try {
      const ttlMinutes = settings?.reservationPolicies?.defaultReservationTTL || 120;
      await axios.post(`${API_URL}/bed-requests/${requestId}/approve`, {
        bedId,
        reservationTTL: new Date(Date.now() + ttlMinutes * 60 * 1000)
      });

      setShowRequestModal(false);
      setSelectedRequest(null);
      fetchBedRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleDenyRequest = (requestId) => {
    setRequestToDeny(requestId);
    setShowDenyModal(true);
    setDenyReason('');
  };

  const confirmDenyRequest = async () => {
    if (!denyReason.trim()) {
      alert('Please enter a reason for denial');
      return;
    }

    try {
      await axios.post(`${API_URL}/bed-requests/${requestToDeny}/deny`, {
        reason: denyReason
      });

      setShowDenyModal(false);
      setShowRequestModal(false);
      setSelectedRequest(null);
      setRequestToDeny(null);
      setDenyReason('');
      fetchBedRequests();
    } catch (error) {
      console.error('Error denying request:', error);
      alert(error.response?.data?.error || 'Failed to deny request');
    }
  };

  const filteredBeds = selectedWard === 'All'
    ? beds
    : beds.filter(bed => bed.ward === selectedWard);

  // ICU Manager should see all wards by default
  const wards = ['All', 'Emergency', 'ICU', 'General Ward', 'Cardiology'];

  // Calculate filtered stats based on selected ward
  const getFilteredStats = () => {
    if (!stats || selectedWard === 'All') {
      return stats;
    }

    // Filter stats for the selected ward
    const wardBeds = beds.filter(bed => bed.ward === selectedWard);
    const occupied = wardBeds.filter(bed => bed.status === 'occupied').length;
    const available = wardBeds.filter(bed => bed.status === 'available').length;
    const cleaning = wardBeds.filter(bed => bed.status === 'cleaning').length;
    const reserved = wardBeds.filter(bed => bed.status === 'reserved').length;
    const totalBeds = wardBeds.length;
    const occupancyRate = totalBeds > 0 ? ((occupied / totalBeds) * 100).toFixed(1) : 0;

    return {
      totalBeds,
      occupied,
      available,
      cleaning,
      reserved,
      occupancyRate,
      wardStats: stats.wardStats || []
    };
  };

  const filteredStats = getFilteredStats();

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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

  const handleCreateEmergencyAdmission = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create bed request
      const response = await axios.post(`${API_URL}/bed-requests`, newRequest);
      const createdRequest = response.data.request;

      // If user wants to reserve a bed immediately, approve the request
      if (reserveBed && selectedBedId) {
        const ttlMinutes = settings?.reservationPolicies?.defaultReservationTTL || 120;
        await axios.post(`${API_URL}/bed-requests/${createdRequest._id}/approve`, {
          bedId: selectedBedId,
          reservationTTL: new Date(Date.now() + ttlMinutes * 60 * 1000)
        });
      }

      // Reset form
      setNewRequest({
        patientDetails: {
          name: '',
          age: '',
          gender: 'Male',
          contactNumber: '',
          triageLevel: 'Urgent',
          reasonForAdmission: '',
          requiredEquipment: 'ICU Monitor',
          estimatedStay: 24
        },
        preferredWard: 'ICU',
        eta: '',
        notes: ''
      });
      setReserveBed(false);
      setSelectedBedId('');
      setAvailableBeds([]);

      setShowEmergencyModal(false);
      fetchBedRequests();

      if (reserveBed && selectedBedId) {
        alert('✓ Emergency admission created and bed reserved successfully!');
      }
    } catch (error) {
      console.error('Error creating emergency admission:', error);
      alert(error.response?.data?.error || 'Failed to create emergency admission');
    } finally {
      setLoading(false);
    }
  };

  const getTriageLevelClass = (level) => {
    const classes = {
      Urgent: 'triage-urgent',
      'Not Urgent': 'triage-non-urgent'
    };
    return classes[level] || '';
  };

  return (
    <div className="icu-manager-dashboard">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="brand-identity">
            <div className="brand-mark">BM</div>
            <div className="brand-copy">
              <h1>Bed Manager Command Center</h1>
              <p className="subtitle">Bed allocation, transfers, and capacity management</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="emergency-btn"
            onClick={() => setShowEmergencyModal(true)}
          >
            Emergency Admission
          </button>
          <div className="user-info">
            <span className="user-name">{currentUser.name}</span>
            <span className="user-role">(Bed Manager)</span>
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

      <div className="icu-main-content">
        {/* Navigation Tabs */}
        <div className="icu-tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Occupancy Overview
          </button>
          <button
            className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Bed Requests
            {bedRequests.length > 0 && (
              <span className="badge">{bedRequests.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'overview' ? (
          <>
            <div className="bed-manager-layout">
              {/* Left Side - Alerts and Notifications - Resizable */}
              <ResizableCard
                minWidth={250}
                maxWidth={800}
                minHeight={400}
                enableWidth={true}
                enableHeight={true}
                storageKey="icu-alerts-width"
                className="bed-manager-sidebar"
              >
                <AlertPanel alerts={alerts} />
              </ResizableCard>

              {/* Right Side - Main Content */}
              <div className="bed-manager-main">
                {/* Ward Filter Section - Resizable */}
                <ResizableCard
                  minWidth={400}
                  minHeight={80}
                  enableWidth={true}
                  enableHeight={true}
                  storageKey="icu-ward-filter-dimensions"
                  className="ward-filter-section-horizontal"
                >
                  <label className="ward-filter-label">Filter by Ward:</label>
                  <div className="ward-buttons-horizontal">
                    {wards.map((ward) => (
                      <button
                        key={ward}
                        className={`ward-filter-btn ${selectedWard === ward ? 'active' : ''}`}
                        onClick={() => setSelectedWard(ward)}
                      >
                        {ward}
                      </button>
                    ))}
                  </div>
                </ResizableCard>

                {/* Stats Section - Below Ward Filter - Resizable */}
                {filteredStats && (
                  <ResizableCard
                    minWidth={400}
                    minHeight={150}
                    enableWidth={true}
                    enableHeight={true}
                    storageKey="icu-stats-dimensions"
                    className="stats-section-below-filter"
                  >
                    <Dashboard stats={filteredStats} />
                  </ResizableCard>
                )}

                {/* Bed Capacity Graph - Resizable */}
                {filteredStats && (
                  <ResizableCard
                    minWidth={400}
                    minHeight={250}
                    enableWidth={true}
                    enableHeight={true}
                    storageKey="icu-capacity-graph-dimensions"
                    className="bed-capacity-graph-section"
                  >
                    <div className="graph-header">
                      <div>
                        <h3>Hospital Bed Capacity Overview</h3>
                        <p className="graph-subtitle">Real-time ward occupancy across all departments</p>
                      </div>
                      <div className="capacity-legend-inline">
                        <div className="legend-item">
                          <span className="legend-dot occupied"></span>
                          <span>Occupied</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-dot available"></span>
                          <span>Available</span>
                        </div>
                        <div className="legend-item capacity-total">
                          <span className="capacity-icon">🏥</span>
                          <span>{stats.totalBeds} Total Beds</span>
                        </div>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart
                        data={(() => {
                          const wardNames = ['Emergency', 'ICU', 'General Ward', 'Cardiology'];
                          return wardNames.map(wardName => {
                            const wardData = stats.wardStats?.find(w => w._id === wardName);
                            const occupied = wardData?.occupied || 0;
                            const available = wardData?.available || 0;
                            const cleaning = wardData?.cleaning || 0;
                            const reserved = wardData?.reserved || 0;
                            const total = occupied + available + cleaning + reserved;
                            const occupancyRate = total > 0 ? ((occupied / total) * 100).toFixed(0) : 0;
                            
                            return {
                              name: wardName,
                              total,
                              occupied,
                              available,
                              cleaning,
                              reserved,
                              occupancyRate
                            };
                          });
                        })()}
                        margin={{ top: 30, right: 40, left: 20, bottom: 30 }}
                        barGap={8}
                        barCategoryGap="25%"
                      >
                        <defs>
                          <linearGradient id="occupiedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9}/>
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={1}/>
                          </linearGradient>
                          <linearGradient id="availableGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.9}/>
                            <stop offset="100%" stopColor="#059669" stopOpacity={1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="var(--border-soft)" 
                          vertical={false}
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={{ stroke: 'var(--border-soft)', strokeWidth: 1 }}
                          tickLine={false}
                          tick={{ 
                            fill: 'var(--text-primary)', 
                            fontSize: 13,
                            fontWeight: 500
                          }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ 
                            fill: 'var(--text-quiet)', 
                            fontSize: 12
                          }}
                          label={{ 
                            value: 'Number of Beds', 
                            angle: -90, 
                            position: 'insideLeft',
                            style: { 
                              fill: 'var(--text-quiet)',
                              fontSize: 13,
                              fontWeight: 500
                            }
                          }}
                          domain={[0, 15]}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(148, 163, 184, 0.1)', radius: 8 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="custom-tooltip">
                                  <div className="tooltip-header">{data.name}</div>
                                  <div className="tooltip-body">
                                    <div className="tooltip-row">
                                      <span className="tooltip-label">
                                        <span className="tooltip-dot occupied"></span>
                                        Occupied:
                                      </span>
                                      <span className="tooltip-value">{data.occupied} beds</span>
                                    </div>
                                    <div className="tooltip-row">
                                      <span className="tooltip-label">
                                        <span className="tooltip-dot available"></span>
                                        Available:
                                      </span>
                                      <span className="tooltip-value">{data.available} beds</span>
                                    </div>
                                    {data.cleaning > 0 && (
                                      <div className="tooltip-row">
                                        <span className="tooltip-label">
                                          <span className="tooltip-dot cleaning"></span>
                                          Cleaning:
                                        </span>
                                        <span className="tooltip-value">{data.cleaning} beds</span>
                                      </div>
                                    )}
                                    {data.reserved > 0 && (
                                      <div className="tooltip-row">
                                        <span className="tooltip-label">
                                          <span className="tooltip-dot reserved"></span>
                                          Reserved:
                                        </span>
                                        <span className="tooltip-value">{data.reserved} beds</span>
                                      </div>
                                    )}
                                    <div className="tooltip-divider"></div>
                                    <div className="tooltip-row">
                                      <span className="tooltip-label">Total Capacity:</span>
                                      <span className="tooltip-value">{data.total} beds</span>
                                    </div>
                                    <div className="tooltip-row">
                                      <span className="tooltip-label">Occupancy Rate:</span>
                                      <span className="tooltip-value occupancy-rate">{data.occupancyRate}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="occupied" 
                          stackId="a" 
                          fill="url(#occupiedGradient)" 
                          name="Occupied"
                          radius={[0, 0, 0, 0]}
                          animationDuration={800}
                          animationBegin={0}
                        />
                        <Bar 
                          dataKey="available" 
                          stackId="a" 
                          fill="url(#availableGradient)" 
                          name="Available"
                          radius={[8, 8, 0, 0]}
                          animationDuration={800}
                          animationBegin={200}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ResizableCard>
                )}

                {/* Current Occupancy and Bed Distribution - Below Stats
                {filteredStats && (
                  <div className="occupancy-chart-section-below-filter">
                    <OccupancyChart stats={filteredStats} />
                  </div>
                )} */}

                {/* Main Dashboard - Bed Views - All beds displayed - Resizable */}
                <ResizableCard
                  minWidth={400}
                  minHeight={300}
                  enableWidth={true}
                  enableHeight={true}
                  storageKey="icu-beds-view-dimensions"
                  className="dashboard-main-beds"
                >
                  <div className="beds-section-header">
                    <h2>All Hospital Beds {selectedWard !== 'All' && `- ${selectedWard}`}</h2>
                    <p className="beds-count">{filteredBeds.length} beds</p>
                  </div>
                  <WardView
                    beds={filteredBeds}
                    onUpdateBed={onUpdateBed}
                    canUpdateBeds={true}
                  />
                </ResizableCard>
              </div>
            </div>
          </>
        ) : (
          /* Bed Requests Tab */
          <ResizableCard
            minWidth={600}
            minHeight={400}
            enableWidth={true}
            enableHeight={true}
            storageKey="icu-requests-container-dimensions"
            className="requests-container"
          >
            <div className="requests-header">
              <h2>Pending Bed Requests</h2>
              <p>Review and assign beds to incoming patient requests from ER</p>
            </div>

            {bedRequests.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✓</div>
                <h3>No Pending Requests</h3>
                <p>All bed requests have been processed</p>
              </div>
            ) : (
              <div className="requests-grid">
                {bedRequests.map((request) => (
                  <div key={request._id} className="request-card-large">
                    <div className="request-card-header">
                      <div>
                        <span className="request-id-large">{request.requestId}</span>
                        <span className={`triage-badge ${getTriageLevelClass(request.patientDetails.triageLevel)}`}>
                          {request.patientDetails.triageLevel}
                        </span>
                      </div>
                      <div className="request-meta">
                        <small>Requested by {request.createdBy.name}</small>
                        <small>{formatDateTime(request.createdAt)}</small>
                      </div>
                    </div>

                    <div className="request-card-body">
                      <div className="info-section">
                        <h4>Patient Details</h4>
                        <div className="info-grid">
                          <div className="info-item">
                            <span className="info-label">Name:</span>
                            <span className="info-value">{request.patientDetails.name}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Age/Gender:</span>
                            <span className="info-value">{request.patientDetails.age} / {request.patientDetails.gender}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Contact:</span>
                            <span className="info-value">{request.patientDetails.contactNumber || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="info-section">
                        <h4>Medical Requirements</h4>
                        <div className="info-grid">
                          <div className="info-item">
                            <span className="info-label">Reason:</span>
                            <span className="info-value">{request.patientDetails.reasonForAdmission}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Equipment:</span>
                            <span className="info-value">{request.patientDetails.requiredEquipment}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Preferred Ward:</span>
                            <span className="info-value">{request.preferredWard || 'Any'}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Est. Stay:</span>
                            <span className="info-value">{request.patientDetails.estimatedStay || 24}h</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">ETA:</span>
                            <span className="info-value">{formatDateTime(request.eta)}</span>
                          </div>
                        </div>
                      </div>

                      {request.notes && (
                        <div className="info-section">
                          <h4>Notes</h4>
                          <p className="request-notes">{request.notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="request-card-actions">
                      <button
                        className="btn-view-details"
                        onClick={() => handleRequestClick(request)}
                      >
                        View & Assign Bed
                      </button>
                      <button
                        className="btn-deny"
                        onClick={() => handleDenyRequest(request._id)}
                      >
                        Deny Request
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ResizableCard>
        )}
      </div>

      {/* Emergency Admission Modal - Same as ER Staff Dashboard */}
      {showEmergencyModal && (
        <div className="modal-overlay" onClick={() => setShowEmergencyModal(false)}>
          <div className="modal-content emergency-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🚨 Emergency Admission</h2>
              <button className="modal-close" onClick={() => setShowEmergencyModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateEmergencyAdmission} className="request-form">
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
                      <option value="Urgent">Urgent</option>
                      <option value="Not Urgent">Not Urgent</option>
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
                  onClick={() => setShowEmergencyModal(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : '🚨 Create Emergency Admission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Details & Bed Assignment Modal */}
      {showRequestModal && selectedRequest && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-content assign-bed-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assign Bed - {selectedRequest.requestId}</h2>
              <button className="modal-close" onClick={() => setShowRequestModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="patient-summary">
                <h3>{selectedRequest.patientDetails.name}</h3>
                <span className={`triage-badge ${getTriageLevelClass(selectedRequest.patientDetails.triageLevel)}`}>
                  {selectedRequest.patientDetails.triageLevel}
                </span>
                <p>{selectedRequest.patientDetails.reasonForAdmission}</p>
                <div className="requirements">
                  <span className="requirement-tag">Equipment: {selectedRequest.patientDetails.requiredEquipment}</span>
                  <span className="requirement-tag">Ward: {selectedRequest.preferredWard || 'Any'}</span>
                </div>
              </div>

              <div className="recommended-beds-section">
                <h3>Recommended Beds {selectedRequest.preferredWard && `for ${selectedRequest.preferredWard} Ward`}</h3>
                {recommendedBeds.length === 0 ? (
                  <p className="no-recommendations">No available beds match the requirements. Consider manual assignment.</p>
                ) : (
                  <>
                    {/* Show warning if any recommended bed is from a different ward */}
                    {selectedRequest.preferredWard && recommendedBeds.some(bed => bed.ward !== selectedRequest.preferredWard) && (
                      <div className="ward-mismatch-warning">
                        ⚠️ Warning: Some beds are from different wards than requested ({selectedRequest.preferredWard})
                      </div>
                    )}
                    <div className="recommended-beds-list">
                      {recommendedBeds.map((bed) => {
                        const isWardMismatch = selectedRequest.preferredWard &&
                                             selectedRequest.preferredWard !== 'Any' &&
                                             bed.ward !== selectedRequest.preferredWard;
                        return (
                          <div
                            key={bed._id}
                            className={`recommended-bed-card ${isWardMismatch ? 'ward-mismatch' : ''}`}
                          >
                            <div className="bed-card-info">
                              <h4>{bed.bedNumber}</h4>
                              <span className={`bed-ward ${isWardMismatch ? 'highlight-mismatch' : ''}`}>
                                {bed.ward}
                                {isWardMismatch && ' ⚠️'}
                              </span>
                              <span className="bed-equipment">{bed.equipmentType}</span>
                              <span className={`bed-status-label status-${bed.status}`}>{bed.status}</span>
                              {bed.location && (
                                <span className="bed-location">
                                  Floor {bed.location.floor}, Section {bed.location.section}
                                </span>
                              )}
                            </div>
                            {bed.status === 'available' && (
                              <button
                                className="btn-assign"
                                onClick={() => handleApproveRequest(selectedRequest._id, bed._id)}
                              >
                                Assign Bed
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowRequestModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDenyRequest(selectedRequest._id)}
              >
                Deny Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Notification Popup */}
      {showNewRequestAlert && newRequestNotification && (
        <div className="notification-overlay">
          <div className="notification-popup">
            <div className="notification-header">
              <div className="notification-icon">🚨</div>
              <div className="notification-title">
                <h3>New Bed Request</h3>
                <span className="notification-time">Just now</span>
              </div>
              <button
                className="notification-close"
                onClick={() => setShowNewRequestAlert(false)}
              >
                ×
              </button>
            </div>

            <div className="notification-body">
              <div className="notification-detail">
                <span className="detail-label">Request ID:</span>
                <span className="detail-value">{newRequestNotification.requestId}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Patient:</span>
                <span className="detail-value">{newRequestNotification.patientDetails?.name}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Triage Level:</span>
                <span className={`triage-badge triage-${newRequestNotification.patientDetails?.triageLevel?.toLowerCase()}`}>
                  {newRequestNotification.patientDetails?.triageLevel}
                </span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Ward Preference:</span>
                <span className="detail-value">{newRequestNotification.preferredWard || 'Any'}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Requested by:</span>
                <span className="detail-value">{newRequestNotification.createdBy?.name}</span>
              </div>
              {newRequestNotification.patientDetails?.reasonForAdmission && (
                <div className="notification-detail-full">
                  <span className="detail-label">Reason:</span>
                  <p className="detail-description">{newRequestNotification.patientDetails.reasonForAdmission}</p>
                </div>
              )}
            </div>

            <div className="notification-actions">
              <button
                className="btn-notification-dismiss"
                onClick={() => setShowNewRequestAlert(false)}
              >
                Dismiss
              </button>
              <button
                className="btn-notification-view"
                onClick={() => {
                  setShowNewRequestAlert(false);
                  setActiveTab('requests');
                  setTimeout(() => {
                    handleRequestClick(newRequestNotification);
                  }, 100);
                }}
              >
                View & Assign Bed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deny Request Modal */}
      {showDenyModal && (
        <div className="modal-overlay" onClick={() => setShowDenyModal(false)}>
          <div className="modal-content deny-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Deny Bed Request</h2>
              <button className="modal-close" onClick={() => setShowDenyModal(false)}>×</button>
            </div>

            <div className="modal-body">
             
              
              <div className="form-group">
                <textarea
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Enter the reason for denial (e.g., No available beds, Patient redirected to another facility, etc.)"
                  rows="4"
                  autoFocus
                  className="deny-reason-textarea"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDenyModal(false);
                  setDenyReason('');
                  setRequestToDeny(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={confirmDenyRequest}
                disabled={!denyReason.trim()}
              >
                Confirm Denial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ICUManagerDashboard;
