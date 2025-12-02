import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import AlertPanel from './AlertPanel';
import ResizableCard from './ResizableCard';
// import BedGrid from './BedGrid';
import WardView from './WardView';
// import FloorPlan from './FloorPlan';
import EmergencyAdmission from './EmergencyAdmission';
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
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'requests', or 'transfers'
  const [showNewRequestAlert, setShowNewRequestAlert] = useState(false);
  const [newRequestNotification, setNewRequestNotification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [availableBeds, setAvailableBeds] = useState([]);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [requestToDeny, setRequestToDeny] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [settings, setSettings] = useState(null);
  
  // Ward Transfer Requests state
  const [transferRequests, setTransferRequests] = useState([]);
  const [showNewTransferAlert, setShowNewTransferAlert] = useState(false);
  const [newTransferNotification, setNewTransferNotification] = useState(null);
  const [showTransferDenyModal, setShowTransferDenyModal] = useState(false);
  const [transferDenyReason, setTransferDenyReason] = useState('');
  const [transferToDeny, setTransferToDeny] = useState(null);
  const [showTransferSuccessModal, setShowTransferSuccessModal] = useState(false);
  const [transferSuccessMessage, setTransferSuccessMessage] = useState('');
  const [transferSuccessType, setTransferSuccessType] = useState(''); // 'approved' or 'denied'

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

  // Set default ward to 'All' on mount to show all 60 beds
  useEffect(() => {
    if (setSelectedWard) {
      setSelectedWard('All');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchBedRequests();
    fetchTransferRequests();
    fetchSettings();

    const interval = setInterval(() => {
      fetchBedRequests();
      fetchTransferRequests();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNewBedRequest = (request) => {
      fetchBedRequests();
      // Show popup notification
      setNewRequestNotification(request);
      setShowNewRequestAlert(true);
      // Play notification sound
      playNotificationSound();
    };

    const handleNewTransferRequest = (transfer) => {
      fetchTransferRequests();
      // Show popup notification for ward transfer
      setNewTransferNotification(transfer);
      setShowNewTransferAlert(true);
      // Play notification sound
      playNotificationSound();
    };

    socket.on('new-bed-request', handleNewBedRequest);
    socket.on('new-ward-transfer', handleNewTransferRequest);

    socket.on('bed-request-cancelled', () => {
      fetchBedRequests();
    });

    socket.on('bed-request-fulfilled', () => {
      fetchBedRequests();
    });

    socket.on('ward-transfer-updated', () => {
      fetchTransferRequests();
    });

    return () => {
      socket.off('new-bed-request', handleNewBedRequest);
      socket.off('new-ward-transfer', handleNewTransferRequest);
      socket.off('bed-request-cancelled');
      socket.off('bed-request-fulfilled');
      socket.off('ward-transfer-updated');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchTransferRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/ward-transfer-requests?status=pending`);
      setTransferRequests(response.data);
    } catch (error) {
      console.error('Error fetching transfer requests:', error);
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
        urgency: 'normal'
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
      await axios.post(`${API_URL}/bed-requests/${requestId}/approve`, {
        bedId
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

  // Ward Transfer Request Functions
  const handleApproveTransfer = async (transferId) => {
    try {
      const response = await axios.post(`${API_URL}/ward-transfer-requests/${transferId}/approve`, {
        reviewedBy: currentUser._id
      });
      
      // Refresh transfer requests from server
      fetchTransferRequests();
      
      // Extract transfer details from response
      const { newBed, oldBed, transfer } = response.data;
      
      // Show success modal with detailed information
      setTransferSuccessType('approved');
      setTransferSuccessMessage(
        `Ward transfer approved successfully! Patient has been moved from ${oldBed.bedNumber} (${transfer.currentWard}) to ${newBed.bedNumber} (${transfer.targetWard}).`
      );
      setShowTransferSuccessModal(true);
    } catch (error) {
      console.error('Error approving transfer:', error);
      alert(error.response?.data?.error || 'Failed to approve transfer');
    }
  };

  const handleDenyTransfer = async (transferId) => {
    setTransferToDeny(transferId);
    setShowTransferDenyModal(true);
  };

  const confirmDenyTransfer = async () => {
    if (!transferDenyReason.trim()) {
      alert('Please provide a reason for denial');
      return;
    }

    try {
      await axios.post(`${API_URL}/ward-transfer-requests/${transferToDeny}/deny`, {
        reason: transferDenyReason.trim(),
        reviewedBy: currentUser._id
      });
      
      // Refresh transfer requests from server
      fetchTransferRequests();
      
      // Close deny modal
      setShowTransferDenyModal(false);
      setTransferDenyReason('');
      setTransferToDeny(null);
      
      // Show success modal
      setTransferSuccessType('denied');
      setTransferSuccessMessage('Ward transfer request has been denied. The requesting staff will be notified.');
      setShowTransferSuccessModal(true);
    } catch (error) {
      console.error('Error denying transfer:', error);
      alert(error.response?.data?.error || 'Failed to deny transfer');
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

  // Memoized chart data to ensure updates when stats change
  const chartData = React.useMemo(() => {
    const wardNames = ['Emergency', 'ICU', 'General Ward', 'Cardiology'];
    
    const chartResult = wardNames.map(wardName => {
      // Try to get data from stats first
      const wardData = stats?.wardStats?.find(w => w._id === wardName);
      
      // Fallback: calculate from beds array if stats is not available or incomplete
      if (!wardData || (!wardData.reserved && beds)) {
        const wardBeds = beds.filter(bed => bed.ward === wardName);
        const occupied = wardBeds.filter(bed => bed.status === 'occupied').length;
        const available = wardBeds.filter(bed => bed.status === 'available').length;
        const cleaning = wardBeds.filter(bed => bed.status === 'cleaning').length;
        const reserved = wardBeds.filter(bed => bed.status === 'reserved').length;
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
      }
      
      // Use stats data
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
    
    return chartResult;
  }, [stats, beds]);

  const handleCreateEmergencyAdmission = async (e, newRequest, reserveBed, selectedBedId) => {
    setLoading(true);

    try {
      // Add authorization header explicitly
      const token = localStorage.getItem('token');
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      // Create bed request payload
      const requestPayload = {
        patientDetails: newRequest.patientDetails,
        preferredWard: newRequest.preferredWard,
        eta: newRequest.eta
      };
      
      // Create bed request
      const response = await axios.post(`${API_URL}/bed-requests`, requestPayload, config);
      const createdRequest = response.data.request;

      // If user wants to reserve a bed immediately, approve the request
      if (reserveBed && selectedBedId) {
        await axios.post(`${API_URL}/bed-requests/${createdRequest._id}/approve`, {
          bedId: selectedBedId
        }, config);
      }

      setAvailableBeds([]);
      setShowEmergencyModal(false);
      fetchBedRequests();

      // if (reserveBed && selectedBedId) {
      //   alert('✓ Emergency admission created and bed reserved successfully!');
      // } else {
      //   alert('✓ Emergency admission request created successfully!');
      // }
    } catch (error) {
      console.error('Error creating emergency admission:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to create emergency admission';
      alert(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
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
          {/* <button
            className="theme-toggle"
            onClick={playNotificationSound}
            title="Test notification sound"
            style={{ marginRight: '10px' }}
          >
            🔔
          </button> */}
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
          <button
            className={`tab ${activeTab === 'transfers' ? 'active' : ''}`}
            onClick={() => setActiveTab('transfers')}
          >
            Ward Transfer Requests
            {transferRequests.length > 0 && (
              <span className="badge">{transferRequests.length}</span>
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
                          <span className="legend-dot" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}></span>
                          <span>Reserved</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-dot" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}></span>
                          <span>Cleaning</span>
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
                        key={JSON.stringify(chartData)}
                        data={chartData}
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
                          <linearGradient id="reservedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/>
                            <stop offset="100%" stopColor="#2563eb" stopOpacity={1}/>
                          </linearGradient>
                          <linearGradient id="cleaningGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9}/>
                            <stop offset="100%" stopColor="#d97706" stopOpacity={1}/>
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
                          dataKey="reserved" 
                          stackId="a" 
                          fill="url(#reservedGradient)" 
                          name="Reserved"
                          radius={[0, 0, 0, 0]}
                          animationDuration={800}
                          animationBegin={100}
                          minPointSize={2}
                        />
                        <Bar 
                          dataKey="cleaning" 
                          stackId="a" 
                          fill="url(#cleaningGradient)" 
                          name="Cleaning"
                          radius={[0, 0, 0, 0]}
                          animationDuration={800}
                          animationBegin={150}
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
        ) : activeTab === 'requests' ? (
          /* Bed Requests Tab */
          <ResizableCard
            minWidth={600}
            minHeight={400}
            enableWidth={true}
            enableHeight={true}
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
                        {/* <span className="request-reason-badge">
                          {request.patientDetails.reasonForAdmission}
                        </span> */}
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
        ) : (
          /* Ward Transfer Requests Tab */
          <ResizableCard
            minWidth={600}
            minHeight={400}
            enableWidth={true}
            enableHeight={true}
            className="requests-container"
          >
            <div className="requests-header">
              <h2>Pending Ward Transfer Requests</h2>
              <p>Review and approve patient transfer requests between wards</p>
            </div>

            {transferRequests.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✓</div>
                <h3>No Pending Transfer Requests</h3>
                <p>All ward transfer requests have been processed</p>
              </div>
            ) : (
              <div className="requests-grid">
                {transferRequests.map(request => (
                  <div key={request._id} className="request-card-large">
                    <div className="request-card-header">
                      <div>
                        <span className="request-id-large">TRF-{request._id?.slice(-6).toUpperCase()}</span>
                      </div>
                      <div className="request-meta">
                        <small>Requested by {request.requestedBy?.name || 'Ward Staff'}</small>
                        <small>{formatDateTime(request.createdAt)}</small>
                      </div>
                    </div>

                    <div className="request-card-body">
                      <div className="info-section">
                        <h4>Patient Details</h4>
                        <div className="info-grid">
                          <div className="info-item">
                            <span className="info-label">Name:</span>
                            <span className="info-value">{request.patientId?.name || 'Unknown Patient'}</span>
                          </div>
                          {request.patientId?.mrn && (
                            <div className="info-item">
                              <span className="info-label">MRN:</span>
                              <span className="info-value">{request.patientId.mrn}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="info-section">
                        <h4>Transfer Details</h4>
                        <div className="info-grid">
                          <div className="info-item">
                            <span className="info-label">From Ward:</span>
                            <span className="info-value">{request.currentWard}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">To Ward:</span>
                            <span className="info-value" style={{ fontWeight: '600', color: '#3b82f6' }}>{request.targetWard}</span>
                          </div>
                          <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                            <span className="info-label">Reason:</span>
                            <span className="info-value">{request.reason || 'No specific reason provided'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {request.status === 'pending' && (
                      <div className="request-card-actions">
                        <button
                          className="btn-view-details"
                          onClick={() => handleApproveTransfer(request._id)}
                        >
                          Approve Transfer
                        </button>
                        <button
                          className="btn-deny"
                          onClick={() => handleDenyTransfer(request._id)}
                        >
                          Deny Request
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ResizableCard>
        )}
      </div>

      {/* Emergency Admission Modal - Same as ER Staff Dashboard */}
      {showEmergencyModal && (
        <EmergencyAdmission
          isOpen={showEmergencyModal}
          onClose={() => {
            setShowEmergencyModal(false);
            setAvailableBeds([]);
          }}
          onSubmit={handleCreateEmergencyAdmission}
          loading={loading}
          title="🚨 Emergency Admission"
          submitButtonText="🚨 Create Emergency Admission"
          showBedReservation={true}
          availableBeds={availableBeds}
          onFetchBeds={fetchAvailableBeds}
        />
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
                <h2>Name : {selectedRequest.patientDetails.name}</h2>
                <p>Reason: {selectedRequest.patientDetails.reasonForAdmission}</p>
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
                <span className="detail-label">Reason:</span>
                <span className="detail-value">{newRequestNotification.patientDetails?.reasonForAdmission}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Ward Preference:</span>
                <span className="detail-value">{newRequestNotification.preferredWard || 'Any'}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Requested by:</span>
                <span className="detail-value">{newRequestNotification.createdBy?.name}</span>
              </div>
              {newRequestNotification.patientDetails?.requiredEquipment && (
                <div className="notification-detail-full">
                  <span className="detail-label">Equipment:</span>
                  <p className="detail-description">{newRequestNotification.patientDetails.requiredEquipment}</p>
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

      {/* New Ward Transfer Request Notification Popup */}
      {showNewTransferAlert && newTransferNotification && (
        <div className="notification-overlay">
          <div className="notification-popup">
            <div className="notification-header">
              <div className="notification-icon">🔄</div>
              <div className="notification-title">
                <h3>New Ward Transfer Request</h3>
                <span className="notification-time">Just now</span>
              </div>
              <button
                className="notification-close"
                onClick={() => setShowNewTransferAlert(false)}
              >
                ×
              </button>
            </div>

            <div className="notification-body">
              <div className="notification-detail">
                <span className="detail-label">Transfer ID:</span>
                <span className="detail-value">TRF-{newTransferNotification._id?.slice(-6).toUpperCase()}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Patient:</span>
                <span className="detail-value">{newTransferNotification.patientId?.name || 'Unknown'}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">From Ward:</span>
                <span className="detail-value">{newTransferNotification.currentWard}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">To Ward:</span>
                <span className="detail-value" style={{ fontWeight: '600', color: '#3b82f6' }}>{newTransferNotification.targetWard}</span>
              </div>
              <div className="notification-detail">
                <span className="detail-label">Requested by:</span>
                <span className="detail-value">{newTransferNotification.requestedBy?.name || 'Ward Staff'}</span>
              </div>
              {newTransferNotification.reason && (
                <div className="notification-detail-full">
                  <span className="detail-label">Reason:</span>
                  <p className="detail-description">{newTransferNotification.reason}</p>
                </div>
              )}
            </div>

            <div className="notification-actions">
              <button
                className="btn-notification-dismiss"
                onClick={() => setShowNewTransferAlert(false)}
              >
                Dismiss
              </button>
              <button
                className="btn-notification-view"
                onClick={() => {
                  setShowNewTransferAlert(false);
                  setActiveTab('transfers');
                }}
              >
                View Transfer Requests
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ward Transfer Deny Modal */}
      {showTransferDenyModal && (
        <div className="modal-overlay" onClick={() => setShowTransferDenyModal(false)}>
          <div className="modal-content deny-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Deny Ward Transfer Request</h2>
              <button className="modal-close" onClick={() => setShowTransferDenyModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <textarea
                  value={transferDenyReason}
                  onChange={(e) => setTransferDenyReason(e.target.value)}
                  placeholder="Enter the reason for denial (e.g., No available beds in target ward, Patient condition not stable for transfer, etc.)"
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
                  setShowTransferDenyModal(false);
                  setTransferDenyReason('');
                  setTransferToDeny(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={confirmDenyTransfer}
                disabled={!transferDenyReason.trim()}
              >
                Confirm Denial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ward Transfer Success/Completion Modal */}
      {showTransferSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowTransferSuccessModal(false)}>
          <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className={`success-icon ${transferSuccessType === 'approved' ? 'approved' : 'denied'}`}>
                {transferSuccessType === 'approved' ? '✓' : '✕'}
              </div>
              <h2>{transferSuccessType === 'approved' ? 'Transfer Approved' : 'Transfer Denied'}</h2>
              <button className="modal-close" onClick={() => setShowTransferSuccessModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <p className="success-message">{transferSuccessMessage}</p>
            </div>

            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => setShowTransferSuccessModal(false)}
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

export default ICUManagerDashboard;
