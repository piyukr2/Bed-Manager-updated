import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function WardStaffDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [beds, setBeds] = useState([]);
  const [patients, setPatients] = useState([]);
  const [reservedBeds, setReservedBeds] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedWard, setSelectedWard] = useState('All'); // Default to 'All' for ward staff
  const [selectedStatus, setSelectedStatus] = useState('all'); // Filter by bed status: 'all', 'available', 'occupied', 'cleaning', 'reserved', 'maintenance'
  const [searchQuery, setSearchQuery] = useState(''); // Search by bed number, patient name, location, equipment
  const [issueDetails, setIssueDetails] = useState({
    bedId: null,
    issueType: 'maintenance',
    description: ''
  });

  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
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

    socket.on('bed-request-approved', (request) => {
      fetchData();
    });

    socket.on('bed-request-expired', (request) => {
      fetchData();
    });

    socket.on('bed-request-fulfilled', (request) => {
      fetchData();
    });

    return () => {
      socket.off('bed-updated');
      socket.off('patient-admitted');
      socket.off('patient-discharged');
      socket.off('bed-request-approved');
      socket.off('bed-request-expired');
      socket.off('bed-request-fulfilled');
    };
  }, [socket, selectedWard]);

  const fetchData = async () => {
    try {
      // Build query params based on selected ward
      const wardParam = selectedWard === 'All' ? '' : `?ward=${selectedWard}`;
      
      const [bedsRes, patientsRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/beds${wardParam}`),
        axios.get(`${API_URL}/patients`),
        axios.get(`${API_URL}/beds/stats`)
      ]);

      setBeds(bedsRes.data);
      setPatients(patientsRes.data);
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

  const handleBedStatusChange = async (bedId, newStatus, bed) => {
    setLoading(true);
    try {
      // If changing from occupied to cleaning, discharge the patient first
      if (bed && bed.status === 'occupied' && newStatus === 'cleaning' && bed.patientId) {
        if (!window.confirm('This will discharge the patient and mark the bed for cleaning. Continue?')) {
          setLoading(false);
          return;
        }
        await axios.delete(`${API_URL}/patients/${bed.patientId._id}`);
      }

      await axios.put(`${API_URL}/beds/${bedId}`, { status: newStatus });
      fetchData();
    } catch (error) {
      console.error('Error updating bed status:', error);
      alert(error.response?.data?.error || 'Failed to update bed status');
    } finally {
      setLoading(false);
    }
  };

  const handleDischargePatient = async (patientId) => {
    if (!window.confirm('Are you sure you want to discharge this patient?')) return;

    try {
      await axios.delete(`${API_URL}/patients/${patientId}`);
      fetchData();
    } catch (error) {
      console.error('Error discharging patient:', error);
      alert(error.response?.data?.error || 'Failed to discharge patient');
    }
  };

  const handleReportIssue = async (bed) => {
    setIssueDetails({
      bedId: bed._id,
      issueType: 'maintenance',
      description: ''
    });
    setSelectedBed(bed);
    setShowIssueModal(true);
  };

  const submitIssue = async (e) => {
    e.preventDefault();

    try {
      // Mark bed as maintenance
      await axios.put(`${API_URL}/beds/${issueDetails.bedId}`, {
        status: 'maintenance',
        notes: `${issueDetails.issueType}: ${issueDetails.description}`
      });

      setShowIssueModal(false);
      fetchData();
    } catch (error) {
      console.error('Error reporting issue:', error);
      alert(error.response?.data?.error || 'Failed to report issue');
    }
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

  // Group beds by floor
  const bedsByFloor = beds.reduce((acc, bed) => {
    const floor = bed.location.floor;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(bed);
    return acc;
  }, {});

  // Group beds by ward
  const bedsByWard = beds.reduce((acc, bed) => {
    const ward = bed.ward;
    if (!acc[ward]) acc[ward] = [];
    acc[ward].push(bed);
    return acc;
  }, {});

  // Get cleaning-related beds
  const getCleaningBeds = (bedList) => {
    return bedList.filter(bed =>
      bed.status === 'cleaning' || bed.status === 'occupied'
    );
  };

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

        {/* Stats Summary */}
        {filteredStats && (
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
        )}

        {reservedBeds.filter(bed => selectedWard === 'All' || bed.ward === selectedWard).length > 0 && (
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
            )}

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
                          {bed.patientId.expectedDischarge && (
                            <div className="bed-detail-row">
                              <span className="detail-label">Expected Discharge:</span>
                              <span className="detail-value">
                                {formatDateTime(bed.patientId.expectedDischarge)}
                              </span>
                            </div>
                          )}
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

                          {bed.status !== 'maintenance' && (
                            <button
                              className="btn-report-issue"
                              onClick={() => handleReportIssue(bed)}
                            >
                              Report Issue
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="available-bed-status">
                            <span style={{ color: '#10b981', fontWeight: '500' }}>✓ Ready for admission</span>
                          </div>
                          {bed.status !== 'maintenance' && (
                            <button
                              className="btn-report-issue"
                              onClick={() => handleReportIssue(bed)}
                            >
                              Report Issue
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

      </div>

      {/* Issue Reporting Modal */}
      {showIssueModal && selectedBed && (
        <div className="modal-overlay" onClick={() => setShowIssueModal(false)}>
          <div className="modal-content issue-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Report Issue - {selectedBed.bedNumber}</h2>
              <button className="modal-close" onClick={() => setShowIssueModal(false)}>×</button>
            </div>

            <form onSubmit={submitIssue} className="issue-form">
              <div className="form-group">
                <label>Issue Type</label>
                <select
                  value={issueDetails.issueType}
                  onChange={(e) => setIssueDetails({ ...issueDetails, issueType: e.target.value })}
                  required
                >
                  <option value="maintenance">Maintenance Required</option>
                  <option value="equipment">Equipment Malfunction</option>
                  <option value="cleaning">Cleaning Issue</option>
                  <option value="blocked">Bed Blocked</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows="4"
                  value={issueDetails.description}
                  onChange={(e) => setIssueDetails({ ...issueDetails, description: e.target.value })}
                  placeholder="Describe the issue..."
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowIssueModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Report & Mark Maintenance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WardStaffDashboard;
