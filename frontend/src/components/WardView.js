import React, { useMemo, useState } from 'react';

const STATUS_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  reserved: 'Reserved',
  maintenance: 'Maintenance'
};

const STATUS_ICONS = {
  available: '🟢',
  occupied: '🔴',
  cleaning: '🧼',
  reserved: '🟡',
  maintenance: '🛠️'
};

const WARD_INFO = {
  'Emergency': { floor: 'Ground Floor', icon: '🚑', color: 'red' },
  'ICU': { floor: '1st Floor', icon: '🏥', color: 'blue' },
  'Cardiology': { floor: '2nd Floor', icon: '❤️', color: 'purple' },
  'General Ward': { floor: '3rd Floor', icon: '🛏️', color: 'green' }
};

function WardView({ beds, onUpdateBed, canUpdateBeds }) {
  const [selectedBed, setSelectedBed] = useState(null);
  const [activeWard, setActiveWard] = useState('All wards'); // Default to "All wards"
  const [expandedWards, setExpandedWards] = useState({}); // Track expanded wards

  // Group beds by ward
  const bedsByWard = useMemo(() => {
    const grouped = {};
    beds.forEach(bed => {
      const ward = bed.ward || 'Unassigned';
      if (!grouped[ward]) {
        grouped[ward] = [];
      }
      grouped[ward].push(bed);
    });
    
    // Sort beds within each ward
    Object.keys(grouped).forEach(ward => {
      grouped[ward].sort((a, b) => a.bedNumber.localeCompare(b.bedNumber, undefined, { numeric: true }));
    });
    
    return grouped;
  }, [beds]);

  const wards = useMemo(() => {
    return Object.keys(bedsByWard).sort((a, b) => {
      const order = ['Emergency', 'ICU', 'Cardiology', 'General Ward'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [bedsByWard]);

  const handleBedClick = (bed) => {
    setSelectedBed(bed);
  };

  const handleStatusChange = async (newStatus) => {
    if (selectedBed) {
      await onUpdateBed(selectedBed._id, newStatus);
      setSelectedBed(null);
    }
  };

  const toggleWardExpand = (ward) => {
    setExpandedWards(prev => ({
      ...prev,
      [ward]: !prev[ward]
    }));
  };

  const getWardStats = (bedsInWard) => {
    const stats = {
      total: bedsInWard.length,
      available: bedsInWard.filter(b => b.status === 'available').length,
      occupied: bedsInWard.filter(b => b.status === 'occupied').length,
      cleaning: bedsInWard.filter(b => b.status === 'cleaning').length,
      reserved: bedsInWard.filter(b => b.status === 'reserved').length,
      maintenance: bedsInWard.filter(b => b.status === 'maintenance').length,
    };
    stats.occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
    return stats;
  };

  return (
    <div className="ward-view-container">
      <div className="ward-view-header">
        <div>
          <h2>Ward-Based View</h2>
          <p className="header-caption">
            Beds organized by hospital wards with real-time status updates
          </p>
        </div>
        
        <div className="ward-quick-filter">
          {/* All wards button */}
          <button
            className={`ward-filter-btn ${activeWard === 'All wards' ? 'active' : ''}`}
            onClick={() => setActiveWard('All wards')}
          >
            <span className="ward-icon">🏥</span>
            <span className="ward-name">All wards</span>
            <span className="ward-count">{beds.length}</span>
          </button>
          
          {/* Individual ward buttons */}
          {wards.map(ward => {
            const stats = getWardStats(bedsByWard[ward]);
            const wardInfo = WARD_INFO[ward] || {};
            return (
              <button
                key={ward}
                className={`ward-filter-btn ${activeWard === ward ? 'active' : ''}`}
                onClick={() => setActiveWard(ward)}
                style={{ borderColor: `var(--${wardInfo.color || 'gray'})` }}
              >
                <span className="ward-icon">{wardInfo.icon || '🏥'}</span>
                <span className="ward-name">{ward}</span>
                <span className="ward-count">{stats.occupied}/{stats.total}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ward-sections">
        {wards
          .filter(ward => activeWard === 'All wards' || activeWard === ward)
          .map(ward => {
            const wardBeds = bedsByWard[ward];
            const stats = getWardStats(wardBeds);
            const wardInfo = WARD_INFO[ward] || {};
            
            return (
              <div key={ward} className={`ward-section ward-${wardInfo.color || 'gray'}`}>
                <div className="ward-section-header">
                  <div className="ward-header-left">
                    <span className="ward-icon-large">{wardInfo.icon || '🏥'}</span>
                    <div className="ward-title-group">
                      <h3>{ward}</h3>
                      <p className="ward-floor-info">{wardInfo.floor || 'Location TBD'}</p>
                    </div>
                  </div>
                  
                  <div className="ward-stats-mini">
                    <div className="mini-stat">
                      <span className="mini-stat-label">Total</span>
                      <span className="mini-stat-value">{stats.total}</span>
                    </div>
                    <div className="mini-stat stat-occupied">
                      <span className="mini-stat-label">Occupied</span>
                      <span className="mini-stat-value">{stats.occupied}</span>
                    </div>
                    <div className="mini-stat stat-available">
                      <span className="mini-stat-label">Available</span>
                      <span className="mini-stat-value">{stats.available}</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-label">Cleaning</span>
                      <span className="mini-stat-value">{stats.cleaning}</span>
                    </div>
                  </div>
                  
                  <div className={`ward-occupancy-indicator ${stats.occupancyRate >= 90 ? 'critical' : stats.occupancyRate >= 80 ? 'warning' : 'normal'}`}>
                    <span className="occupancy-percentage">{stats.occupancyRate}%</span>
                    <span className="occupancy-label">Occupied</span>
                  </div>
                </div>

                <div className="ward-beds-grid">
                  {wardBeds.slice(0, expandedWards[ward] ? wardBeds.length : 6).map(bed => (
                    <div
                      key={bed._id}
                      className={`ward-bed-card status-${bed.status}`}
                      onClick={() => handleBedClick(bed)}
                    >
                      <div className="bed-card-header">
                        <span className="bed-number">{bed.bedNumber}</span>
                        <span className={`status-chip ${bed.status}`}>
                          {STATUS_LABELS[bed.status] || bed.status}
                        </span>
                      </div>

                      {bed.location && (
                        <div className="bed-card-meta">
                          <span className="meta-item">
                            Room {bed.location.roomNumber}
                          </span>
                          {bed.equipmentType && bed.equipmentType !== 'Standard' && (
                            <span className="meta-item">{bed.equipmentType}</span>
                          )}
                        </div>
                      )}

                      {bed.patientId ? (
                        <div className="bed-card-patient">
                          <span className="label">Patient</span>
                          <span className="value">{bed.patientId.name || 'Assigned'}</span>
                        </div>
                      ) : (
                        <div className="bed-card-patient vacant">
                          <span className="label">Patient</span>
                          <span className="value">Not assigned</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {wardBeds.length > 6 && (
                  <div className="ward-expand-footer">
                    <button 
                      className="expand-btn"
                      onClick={() => toggleWardExpand(ward)}
                    >
                      {expandedWards[ward] ? (
                        <>
                          <span>Show Less</span>
                          <span className="expand-icon">↑</span>
                        </>
                      ) : (
                        <>
                          <span>Show {wardBeds.length - 6} More Beds</span>
                          <span className="expand-icon">↓</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Bed Detail Modal */}
      {selectedBed && (
        <div className="bed-modal-overlay" onClick={() => setSelectedBed(null)}>
          <div className="bed-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Bed Details and Management</h3>
              <button className="close-btn" onClick={() => setSelectedBed(null)} aria-label="Close bed details">
                ×
              </button>
            </div>

            <div className="modal-content">
              <div className="bed-details">
                <h4>Bed Information</h4>
                <div className="detail-row">
                  <span className="label">Bed Number</span>
                  <span className="value">{selectedBed.bedNumber}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Ward</span>
                  <span className="value">{selectedBed.ward}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Status</span>
                  <span className={`status-chip ${selectedBed.status}`}>
                    {STATUS_LABELS[selectedBed.status] || selectedBed.status}
                  </span>
                </div>
                {selectedBed.equipmentType && (
                  <div className="detail-row">
                    <span className="label">Equipment</span>
                    <span className="value">{selectedBed.equipmentType}</span>
                  </div>
                )}
                {selectedBed.location && (
                  <div className="detail-row">
                    <span className="label">Location</span>
                    <span className="value">
                      Floor {selectedBed.location.floor}, Section {selectedBed.location.section}, Room {selectedBed.location.roomNumber}
                    </span>
                  </div>
                )}
                {selectedBed.lastCleaned && (
                  <div className="detail-row">
                    <span className="label">Last Cleaned</span>
                    <span className="value">
                      {new Date(selectedBed.lastCleaned).toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedBed.patientId ? (
                  <div className="patient-details">
                    <h5>Patient Assignment</h5>
                    <div className="detail-row">
                      <span className="label">Name</span>
                      <span className="value">{selectedBed.patientId.name}</span>
                    </div>
                    {selectedBed.patientId.age && (
                      <div className="detail-row">
                        <span className="label">Age</span>
                        <span className="value">{selectedBed.patientId.age}</span>
                      </div>
                    )}
                    {selectedBed.patientId.gender && (
                      <div className="detail-row">
                        <span className="label">Gender</span>
                        <span className="value">{selectedBed.patientId.gender}</span>
                      </div>
                    )}
                    {selectedBed.patientId.patientId && (
                      <div className="detail-row">
                        <span className="label">Patient ID</span>
                        <span className="value">{selectedBed.patientId.patientId}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="patient-details unassigned">
                    No patient is currently assigned to this bed.
                  </div>
                )}
              </div>

              {canUpdateBeds && (
                <div className="status-buttons">
                  <h4>Update Bed Status</h4>
                  <div className="status-grid">
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <button
                        key={status}
                        className={`status-btn ${status}`}
                        onClick={() => handleStatusChange(status)}
                        disabled={selectedBed.status === status}
                      >
                        <span className={`status-dot status-${status}`} />
                        {STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WardView;
