import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ResizableCard from './ResizableCard';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function WardStaffDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [beds, setBeds] = useState([]);
  // const [patients, setPatients] = useState([]);
  const [reservedBeds, setReservedBeds] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [bedToDischarge, setBedToDischarge] = useState(null);
  const [selectedWard, setSelectedWard] = useState('All'); // Default to 'All' for ward staff
  const [selectedStatus, setSelectedStatus] = useState('all'); // Filter by bed status: 'all', 'available', 'occupied', 'cleaning', 'reserved', 'maintenance'
  const [searchQuery, setSearchQuery] = useState(''); // Search by bed number, patient name, location, equipment
  
  // Ward Transfer states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDetails, setTransferDetails] = useState({
    bedId: null,
    patientId: null,
    currentWard: '',
    targetWard: '',
    reason: ''
  });
  const [availableWards, setAvailableWards] = useState([]);
  
  // Discharge Date Editing states
  const [editingDischargeDate, setEditingDischargeDate] = useState(null);
  const [newDischargeDate, setNewDischargeDate] = useState('');

  const fetchData = async () => {
    try {
      // Build query params based on selected ward
      const wardParam = selectedWard === 'All' ? '' : `?ward=${selectedWard}`;
      
      const [bedsRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/beds${wardParam}`),
        axios.get(`${API_URL}/beds/stats`)
      ]);

      setBeds(bedsRes.data);
      setStats(statsRes.data);

      // Filter reserved beds that haven't been acknowledged yet
      const reserved = bedsRes.data.filter(bed =>
        bed.status === 'reserved' &&
        !bed.notes?.includes('Bed prepared and ready for patient admission')
      );
      setReservedBeds(reserved);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWard]); // Re-fetch when selected ward changes

  useEffect(() => {
    if (!socket) return;

    // Ward staff monitors all wards, so refresh on any bed/patient update
    socket.on('bed-updated', (bed) => {
      fetchData();
    });

    socket.on('patient-admitted', (patient) => {
      fetchData();
    });

    socket.on('patient-discharged', ({ patient, bed }) => {
      fetchData();
    });

    socket.on('bed-request-approved', () => {
      fetchData();
    });

    socket.on('bed-request-fulfilled', () => {
      fetchData();
    });

    socket.on('ward-transfer-updated', () => {
      fetchData();
    });

    socket.on('patient-transferred', () => {
      fetchData();
    });

    return () => {
      socket.off('bed-updated');
      socket.off('patient-admitted');
      socket.off('patient-discharged');
      socket.off('bed-request-approved');
      socket.off('bed-request-fulfilled');
      socket.off('ward-transfer-updated');
      socket.off('patient-transferred');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, selectedWard]);

  const handleBedStatusChange = async (bedId, newStatus, bed) => {
    // If changing from occupied to cleaning, show discharge confirmation modal
    if (bed && bed.status === 'occupied' && newStatus === 'cleaning' && bed.patientId) {
      setBedToDischarge({ bedId, bed });
      setShowDischargeModal(true);
      return;
    }

    // For other status changes, proceed directly
    setLoading(true);
    try {
      await axios.put(`${API_URL}/beds/${bedId}`, { status: newStatus });
      fetchData();
    } catch (error) {
      console.error('Error updating bed status:', error);
      alert(error.response?.data?.error || 'Failed to update bed status');
    } finally {
      setLoading(false);
    }
  };

  const confirmDischarge = async () => {
    if (!bedToDischarge) return;

    setLoading(true);
    try {
      // Discharge the patient
      await axios.delete(`${API_URL}/patients/${bedToDischarge.bed.patientId._id}`);
      
      // Mark bed as cleaning
      await axios.put(`${API_URL}/beds/${bedToDischarge.bedId}`, { status: 'cleaning' });
      
      setShowDischargeModal(false);
      setBedToDischarge(null);
      fetchData();
    } catch (error) {
      console.error('Error discharging patient:', error);
      alert(error.response?.data?.error || 'Failed to discharge patient');
    } finally {
      setLoading(false);
    }
  };

  // const handleDischargePatient = async (patientId) => {
  //   if (!window.confirm('Are you sure you want to discharge this patient?')) return;

  //   try {
  //     await axios.delete(`${API_URL}/patients/${patientId}`);
  //     fetchData();
  //   } catch (error) {
  //     console.error('Error discharging patient:', error);
  //     alert(error.response?.data?.error || 'Failed to discharge patient');
  //   }
  // };



  // Ward Transfer functions
  const handleRequestTransfer = async (bed) => {
    if (!bed.patientId) {
      return;
    }

    // Get available wards (excluding Emergency ward as per rule)
    try {
      const bedsRes = await axios.get(`${API_URL}/beds`);
      const wards = [...new Set(bedsRes.data.map(b => b.ward))].filter(ward => ward !== 'Emergency');
      setAvailableWards(wards);
      
      setTransferDetails({
        bedId: bed._id,
        patientId: bed.patientId._id,
        currentWard: bed.ward,
        targetWard: '',
        reason: ''
      });
      setSelectedBed(bed);
      setShowTransferModal(true);
    } catch (error) {
      console.error('Error fetching wards:', error);
    }
  };

  const submitTransferRequest = async (e) => {
    e.preventDefault();

    if (!transferDetails.targetWard) {
      alert('Please select a target ward');
      return;
    }

    if (transferDetails.targetWard === 'Emergency') {
      alert('Patients cannot be transferred TO Emergency ward');
      return;
    }

    if (transferDetails.currentWard === transferDetails.targetWard) {
      alert('Target ward must be different from current ward');
      return;
    }

    try {
      const requestData = {
        bedId: transferDetails.bedId,
        patientId: transferDetails.patientId,
        currentWard: transferDetails.currentWard,
        targetWard: transferDetails.targetWard,
        reason: transferDetails.reason || 'No specific reason provided',
        requestedBy: currentUser._id || currentUser.id
      };

      await axios.post(`${API_URL}/ward-transfer-requests`, requestData);

      setShowTransferModal(false);
      setTransferDetails({
        bedId: null,
        patientId: null,
        currentWard: '',
        targetWard: '',
        reason: ''
      });

      alert('✓ Ward transfer request submitted successfully! The ICU Manager will review it.');
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error submitting transfer request:', error);
      alert(error.response?.data?.error || 'Failed to submit transfer request');
    }
  };

  // Discharge Date Editing functions
  const handleEditDischargeDate = (patientId, currentDate) => {
    setEditingDischargeDate(patientId);
    // Format the date for input field (YYYY-MM-DDTHH:MM)
    const date = currentDate ? new Date(currentDate) : new Date();
    const formatted = date.toISOString().slice(0, 16);
    setNewDischargeDate(formatted);
  };

  const saveDischargeDate = async (patientId) => {
    if (!newDischargeDate) {
      alert('Please select a discharge date');
      return;
    }

    try {
      await axios.put(`${API_URL}/patients/${patientId}`, {
        expectedDischarge: newDischargeDate
      });

      setEditingDischargeDate(null);
      setNewDischargeDate('');
      fetchData(); // Refresh the data
    } catch (error) {
      console.error('Error updating discharge date:', error);
      alert(error.response?.data?.error || 'Failed to update discharge date');
    }
  };

  const cancelEditDischargeDate = () => {
    setEditingDischargeDate(null);
    setNewDischargeDate('');
  };

  const acknowledgeReservation = async (bedId) => {
    if (!window.confirm('Acknowledge that this bed is ready for the incoming patient?')) return;

    try {
      await axios.put(`${API_URL}/beds/${bedId}`, {
        notes: 'Bed prepared and ready for patient admission'
      });

      // Show success feedback
      alert('✓ Bed acknowledged! It has been marked as ready for patient admission.');

      fetchData();
    } catch (error) {
      console.error('Error acknowledging reservation:', error);
      alert(error.response?.data?.error || 'Failed to acknowledge reservation');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      available: '#10b981',
      occupied: '#3b82f6',
      cleaning: '#f59e0b',
      reserved: '#8b5cf6',
      maintenance: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  // Calculate filtered stats based on selected ward
  const getFilteredStats = () => {
    if (!stats) return null;

    if (selectedWard === 'All') {
      return stats;
    }

    // Filter beds for the selected ward
    const wardBeds = beds.filter(bed => bed.ward === selectedWard);
    const occupied = wardBeds.filter(bed => bed.status === 'occupied').length;
    const available = wardBeds.filter(bed => bed.status === 'available').length;
    const cleaning = wardBeds.filter(bed => bed.status === 'cleaning').length;
    const reserved = wardBeds.filter(bed => bed.status === 'reserved').length;
    const maintenance = wardBeds.filter(bed => bed.status === 'maintenance').length;
    const totalBeds = wardBeds.length;

    return {
      totalBeds,
      occupied,
      available,
      cleaning,
      reserved,
      maintenance
    };
  };

  const filteredStats = getFilteredStats();

  const getBedActions = (bed) => {
    const actions = [];

    switch (bed.status) {
      case 'occupied':
        // Discharge button - moves to cleaning
        actions.push({ label: 'Discharge', status: 'cleaning', color: '#f59e0b' });
        break;
      case 'cleaning':
        // Make Available button - completes the cleaning cycle
        actions.push({ label: 'Make Available', status: 'available', color: '#10b981' });
        break;
      case 'reserved':
        // Reserved can go to either Occupied or Available
        actions.push({ label: 'Mark Occupied', status: 'occupied', color: '#3b82f6' });
        actions.push({ label: 'Release Bed', status: 'available', color: '#10b981' });
        break;
      case 'available':
        // Available beds don't have status change buttons in Ward Operations
        // Only Bed Manager can reserve/occupy from available
        break;
      case 'maintenance':
        // Make Available button - completes the maintenance cycle (consistent with cleaning)
        actions.push({ label: 'Make Available', status: 'available', color: '#10b981' });
        break;
      default:
        break;
    }

    return actions;
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

  // Filter beds by search query
  const filterBedsBySearch = (bed) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    
    // Search by bed number
    if (bed.bedNumber.toLowerCase().includes(query)) return true;
    
    // Search by patient name
    if (bed.patientId?.name?.toLowerCase().includes(query)) return true;
    
    // Search by location (floor, section, room)
    const location = `floor ${bed.location.floor} ${bed.location.section} room ${bed.location.roomNumber}`.toLowerCase();
    if (location.includes(query)) return true;
    
    // Search by equipment type
    if (bed.equipmentType.toLowerCase().includes(query)) return true;
    
    // Search by ward
    if (bed.ward.toLowerCase().includes(query)) return true;
    
    return false;
  };

  // // Group beds by floor
  // const bedsByFloor = beds.reduce((acc, bed) => {
  //   const floor = bed.location.floor;
  //   if (!acc[floor]) acc[floor] = [];
  //   acc[floor].push(bed);
  //   return acc;
  // }, {});

  // // Group beds by ward
  // const bedsByWard = beds.reduce((acc, bed) => {
  //   const ward = bed.ward;
  //   if (!acc[ward]) acc[ward] = [];
  //   acc[ward].push(bed);
  //   return acc;
  // }, {});

  // // Get cleaning-related beds
  // const getCleaningBeds = (bedList) => {
  //   return bedList.filter(bed =>
  //     bed.status === 'cleaning' || bed.status === 'occupied'
  //   );
  // };

  return (
    <div className="ward-staff-dashboard">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="brand-identity">
            <div className="brand-mark">WS</div>
            <div className="brand-copy">
              <h1>Ward Operations Center</h1>
              <p className="subtitle">Bed state management and patient operations</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="user-info">
            <span className="user-name">{currentUser.name}</span>
            <span className="user-role">(Ward Staff - All Departments)</span>
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

      <div className="ward-main-content">
        {/* Ward Filter and Search */}
        <ResizableCard
          title="Department Filter & Search"
          minWidth={400}
          minHeight={150}
        >
          <div className="ward-filter-section">
            <div className="filter-row">
              <div className="ward-filter-group">
                <label>View Department:</label>
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
              
              <div className="search-group">
                <label>Search Beds:</label>
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search by bed number, patient, location, equipment..."
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
              </div>
            </div>
          </div>
        </ResizableCard>

        {/* Stats Summary */}
        {filteredStats && (
          <ResizableCard
            title="Bed Statistics"
            minWidth={500}
            minHeight={120}
          >
            <div className="stats-summary ward-stats">
            <div 
              className={`stat-card stat-total ${selectedStatus === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('all')}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-title">Total Beds</div>
              <div className="stat-value">{filteredStats.totalBeds || 0}</div>
              <div className="stat-description">{selectedWard === 'All' ? 'All wards' : `In ${selectedWard}`}</div>
            </div>
            <div 
              className={`stat-card stat-available ${selectedStatus === 'available' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('available')}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-title">Available</div>
              <div className="stat-value">{filteredStats.available || 0}</div>
              <div className="stat-description">Ready for admission</div>
            </div>
            <div 
              className={`stat-card stat-occupied ${selectedStatus === 'occupied' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('occupied')}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-title">Occupied</div>
              <div className="stat-value">{filteredStats.occupied || 0}</div>
              <div className="stat-description">With patients</div>
            </div>
            <div 
              className={`stat-card stat-cleaning ${selectedStatus === 'cleaning' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('cleaning')}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-title">Cleaning</div>
              <div className="stat-value">{filteredStats.cleaning || 0}</div>
              <div className="stat-description">Being serviced</div>
            </div>
            <div 
              className={`stat-card stat-reserved ${selectedStatus === 'reserved' ? 'active' : ''}`}
              onClick={() => setSelectedStatus('reserved')}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-title">Reserved</div>
              <div className="stat-value">{filteredStats.reserved || 0}</div>
              <div className="stat-description">Incoming patients</div>
            </div>
            </div>
          </ResizableCard>
        )}

        {reservedBeds.filter(bed => selectedWard === 'All' || bed.ward === selectedWard).length > 0 && (
          <ResizableCard
            title="Incoming Reservations"
            minWidth={400}
            minHeight={200}
          >
            <div className="reservations-section">
                <div className="section-header">
                  <h2>Incoming Reservations</h2>
                  <span className="badge">{reservedBeds.filter(bed => selectedWard === 'All' || bed.ward === selectedWard).length}</span>
                </div>
                <div className="reservations-list">
                  {reservedBeds.filter(bed => selectedWard === 'All' || bed.ward === selectedWard).map((bed) => (
                    <div key={bed._id} className="reservation-card">
                      <div className="reservation-info">
                        <h3>{bed.bedNumber}</h3>
                        <p className="bed-location">
                          Floor {bed.location.floor}, Section {bed.location.section}, Room {bed.location.roomNumber}
                        </p>
                        <p className="bed-equipment">Equipment: {bed.equipmentType}</p>
                        {bed.notes && <p className="bed-notes">{bed.notes}</p>}
                      </div>
                      <div className="reservation-actions">
                        <button
                          className="btn-acknowledge"
                          onClick={() => acknowledgeReservation(bed._id)}
                        >
                          ✓ Bed Ready
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </ResizableCard>
        )}

        <ResizableCard
          title="Bed Status Board"
          minWidth={600}
          minHeight={400}
        >
          <div className="bed-board-section">
              <div className="section-header">
                <h2>Bed Status Board</h2>
                <p>
                  {selectedStatus === 'all' 
                    ? `All beds in ${selectedWard === 'All' ? 'all wards' : selectedWard}`
                    : `${selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)} beds in ${selectedWard === 'All' ? 'all wards' : selectedWard}`
                  }
                  {searchQuery && <span> matching "{searchQuery}"</span>}
                </p>
              </div>

              {beds
                .filter(bed => selectedWard === 'All' || bed.ward === selectedWard)
                .filter(bed => selectedStatus === 'all' || bed.status === selectedStatus)
                .filter(bed => filterBedsBySearch(bed))
                .length === 0 ? (
                <div className="empty-state-small">
                  <p>No beds found for the selected filters{searchQuery ? ` matching "${searchQuery}"` : ''}.</p>
                </div>
              ) : (
              <div className="bed-board-grid">
                {beds
                  .filter(bed => selectedWard === 'All' || bed.ward === selectedWard)
                  .filter(bed => selectedStatus === 'all' || bed.status === selectedStatus)
                  .filter(bed => filterBedsBySearch(bed))
                  .sort((a, b) => {
                    // Sort by status priority: occupied, reserved, cleaning, maintenance, available
                    const statusPriority = { occupied: 1, reserved: 2, cleaning: 3, maintenance: 4, available: 5 };
                    return (statusPriority[a.status] || 999) - (statusPriority[b.status] || 999);
                  })
                  .map((bed) => (
                  <div key={bed._id} className="bed-card-compact">
                    <div className="bed-card-header" style={{ borderLeftColor: getStatusColor(bed.status) }}>
                      <h3>{bed.bedNumber}</h3>
                      <div className="bed-status-badges">
                        <span className="bed-ward-badge">{bed.ward}</span>
                        <span className={`bed-status-badge status-${bed.status}`}>
                          {bed.status}
                        </span>
                        {bed.status === 'reserved' && bed.notes?.includes('Bed prepared and ready for patient admission') && (
                          <span className="bed-acknowledged-badge" title="Bed prepared and acknowledged">
                            ✓ Ready
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bed-card-body">
                      <div className="bed-detail-row">
                        <span className="detail-label">Location:</span>
                        <span className="detail-value">
                          Floor {bed.location.floor}, {bed.location.section}-{bed.location.roomNumber}
                        </span>
                      </div>

                      <div className="bed-detail-row">
                        <span className="detail-label">Equipment:</span>
                        <span className="detail-value">{bed.equipmentType}</span>
                      </div>

                      {bed.patientId && (
                        <>
                          <div className="bed-detail-row">
                            <span className="detail-label">Patient:</span>
                            <span className="detail-value patient-name">{bed.patientId.name}</span>
                          </div>
                          <div className="bed-detail-row">
                            <span className="detail-label">Admitted:</span>
                            <span className="detail-value">
                              {formatDateTime(bed.patientId.admissionDate)}
                            </span>
                          </div>
                          <div className="bed-detail-row">
                            <span className="detail-label">Expected Discharge:</span>
                            {editingDischargeDate === bed.patientId._id ? (
                              <div className="discharge-edit-container">
                                <input
                                  type="datetime-local"
                                  value={newDischargeDate}
                                  onChange={(e) => setNewDischargeDate(e.target.value)}
                                  className="discharge-date-input"
                                />
                                <div className="discharge-edit-actions">
                                  <button
                                    className="btn-save-discharge"
                                    onClick={() => saveDischargeDate(bed.patientId._id)}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-cancel-discharge"
                                    onClick={cancelEditDischargeDate}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="detail-value discharge-date-display">
                                {formatDateTime(bed.patientId.expectedDischarge) || 'Not set'}
                                <button
                                  className="btn-edit-discharge"
                                  onClick={() => handleEditDischargeDate(bed.patientId._id, bed.patientId.expectedDischarge)}
                                  title="Edit discharge date"
                                >
                                  ✏️
                                </button>
                              </span>
                            )}
                          </div>
                        </>
                      )}

                      {bed.lastCleaned && bed.status === 'available' && (
                        <div className="bed-detail-row">
                          <span className="detail-label">Last Cleaned:</span>
                          <span className="detail-value">
                            {formatDateTime(bed.lastCleaned)}
                          </span>
                        </div>
                      )}

                      {bed.notes && (
                        <div className="bed-notes-compact">
                          <small>{bed.notes}</small>
                        </div>
                      )}
                    </div>

                    <div className="bed-card-actions">
                      {getBedActions(bed).length > 0 ? (
                        <>
                          {getBedActions(bed).map((action, idx) => (
                            <button
                              key={idx}
                              className="btn-action"
                              style={{ backgroundColor: action.color }}
                              onClick={() => handleBedStatusChange(bed._id, action.status, bed)}
                              disabled={loading}
                            >
                              {action.label}
                            </button>
                          ))}

                          {bed.status === 'occupied' && bed.patientId && (
                            <button
                              className="btn-transfer-request"
                              onClick={() => handleRequestTransfer(bed)}
                            >
                              Ward Transfer
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="available-bed-status">
                            <span style={{ color: '#10b981', fontWeight: '500' }}>✓ Ready for admission</span>
                          </div>

                          {bed.status === 'occupied' && bed.patientId && (
                            <button
                              className="btn-transfer-request"
                              onClick={() => handleRequestTransfer(bed)}
                            >
                              Request Ward Transfer
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )}
          </div>
        </ResizableCard>

      </div>



      {/* Discharge Confirmation Modal */}
      {showDischargeModal && bedToDischarge && (
        <div className="modal-overlay" onClick={() => setShowDischargeModal(false)}>
          <div className="modal-content discharge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Patient Discharge</h2>
              <button className="modal-close" onClick={() => setShowDischargeModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <p className="discharge-warning">
                ⚠️ This will discharge the patient and mark the bed for cleaning. This action cannot be undone.
              </p>
              
              <div className="discharge-details">
                <h4>Bed Information</h4>
                <div className="detail-row">
                  <span className="detail-label">Bed Number:</span>
                  <span className="detail-value">{bedToDischarge.bed.bedNumber}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Ward:</span>
                  <span className="detail-value">{bedToDischarge.bed.ward}</span>
                </div>
                {bedToDischarge.bed.patientId && (
                  <>
                    <h4 style={{ marginTop: '1rem' }}>Patient Information</h4>
                    <div className="detail-row">
                      <span className="detail-label">Patient Name:</span>
                      <span className="detail-value">{bedToDischarge.bed.patientId.name}</span>
                    </div>
                    {bedToDischarge.bed.patientId.admissionDate && (
                      <div className="detail-row">
                        <span className="detail-label">Admitted:</span>
                        <span className="detail-value">{formatDateTime(bedToDischarge.bed.patientId.admissionDate)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowDischargeModal(false);
                  setBedToDischarge(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={confirmDischarge}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Confirm Discharge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ward Transfer Request Modal */}
      {showTransferModal && selectedBed && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="bed-modal transfer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request Ward Transfer</h3>
              <button className="modal-close" onClick={() => setShowTransferModal(false)}>×</button>
            </div>

            <div className="modal-content">
              <div className="bed-details">
                <h4>Patient Information</h4>
                <div className="detail-row">
                  <span className="label">Patient:</span>
                  <span className="value">{selectedBed.patientId?.name}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Current Ward:</span>
                  <span className="value">{transferDetails.currentWard}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Bed:</span>
                  <span className="value">{selectedBed.bedNumber}</span>
                </div>
              </div>

              <form onSubmit={submitTransferRequest} className="transfer-form">
                <div className="bed-details">
                  <h4>Destination Ward</h4>
                  <div className="form-group">
                    <select
                      value={transferDetails.targetWard}
                      onChange={(e) => setTransferDetails({ ...transferDetails, targetWard: e.target.value })}
                      required
                      className="form-select"
                    >
                      <option value="">Select ward...</option>
                      {availableWards.map(ward => (
                        <option key={ward} value={ward}>{ward}</option>
                      ))}
                    </select>
                    <div className="transfer-note">
                      <small>⚠️ Note: Patients CANNOT be transferred TO Emergency ward</small>
                    </div>
                  </div>
                </div>

                <div className="bed-details">
                  <h4>Reason for Transfer</h4>
                  <div className="form-group">
                    <textarea
                      rows="3"
                      value={transferDetails.reason}
                      onChange={(e) => setTransferDetails({ ...transferDetails, reason: e.target.value })}
                      placeholder="Explain why this patient needs to be transferred..."
                      className="form-textarea"
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowTransferModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Submit Transfer Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WardStaffDashboard;
