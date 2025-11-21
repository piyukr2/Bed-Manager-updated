import React, { useMemo, useState, useEffect } from 'react';

const STATUS_ICONS = {
  available: '🟢',
  occupied: '🔴',
  cleaning: '🧼',
  reserved: '🟡',
  maintenance: '🛠️'
};

const STATUS_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  reserved: 'Reserved',
  maintenance: 'Maintenance'
};

// Map floors to wards
const FLOOR_WARD_MAP = {
  0: { name: 'Ground Floor', ward: 'Emergency', icon: '🚑' },
  1: { name: '1st Floor', ward: 'ICU', icon: '🏥' },
  2: { name: '2nd Floor', ward: 'Cardiology', icon: '❤️' },
  3: { name: '3rd Floor', ward: 'General Ward', icon: '🛏️' }
};

function FloorPlan({ beds, canUpdateBeds, onUpdateBed }) {
  const [selectedBed, setSelectedBed] = useState(null);
  const floors = useMemo(() => {
    const uniqueFloors = new Set();
    beds.forEach(bed => {
      if (bed.location?.floor !== undefined && bed.location?.floor !== null) {
        uniqueFloors.add(bed.location.floor);
      }
    });
    return Array.from(uniqueFloors).sort((a, b) => a - b);
  }, [beds]);

  const [activeFloor, setActiveFloor] = useState(null);

  useEffect(() => {
    if (activeFloor === null && floors.length > 0) {
      setActiveFloor(floors[0]);
    }
    if (activeFloor !== null && !floors.includes(activeFloor)) {
      setActiveFloor(floors[0] !== undefined ? floors[0] : null);
    }
  }, [floors, activeFloor]);

  const bedsForFloor = useMemo(() => {
    if (activeFloor === null) return [];
    const filtered = beds.filter(bed => bed.location?.floor === activeFloor);
    // Sort beds by bed number
    return filtered.sort((a, b) => {
      return a.bedNumber.localeCompare(b.bedNumber, undefined, { numeric: true });
    });
  }, [beds, activeFloor]);

  const renderStatusBadge = (bed) => (
    <span className={`status-chip ${bed.status}`}>
      {bed.status.toUpperCase()}
    </span>
  );

  const handleBedClick = (bed) => {
    setSelectedBed(bed);
  };

  const handleStatusChange = async (newStatus) => {
    if (selectedBed) {
      await onUpdateBed(selectedBed._id, newStatus);
      setSelectedBed(null);
    }
  };

  return (
    <div className="floorplan-container">
      <div className="floorplan-header">
        <div>
          <h2>Floor-Based View</h2>
          <p className="header-caption">
            Visual layout by floor with ward assignments and live bed status
          </p>
        </div>
        <div className="floor-toggle-group">
          {floors.length === 0 ? (
            <span className="no-floor-data">No floor data available</span>
          ) : (
            floors.map(floor => {
              const floorInfo = FLOOR_WARD_MAP[floor] || { name: `Floor ${floor}`, ward: '', icon: '🏥' };
              return (
                <button
                  key={floor}
                  className={`floor-toggle ${activeFloor === floor ? 'active' : ''}`}
                  onClick={() => setActiveFloor(floor)}
                  title={`${floorInfo.name} - ${floorInfo.ward}`}
                >
                  <span className="floor-icon">{floorInfo.icon}</span>
                  <div className="floor-label-group">
                    <span className="floor-name">{floorInfo.name}</span>
                    <span className="floor-ward">{floorInfo.ward}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {activeFloor !== null ? (
        <div className="floorplan-content">
          <div className="floor-info-banner">
            {FLOOR_WARD_MAP[activeFloor] && (
              <>
                <span className="floor-banner-icon">{FLOOR_WARD_MAP[activeFloor].icon}</span>
                <div className="floor-banner-text">
                  <h3>{FLOOR_WARD_MAP[activeFloor].name}</h3>
                  <p>{FLOOR_WARD_MAP[activeFloor].ward} Ward - {bedsForFloor.length} beds total</p>
                </div>
              </>
            )}
          </div>
          
          
          <div className="floorplan-grid">
            {bedsForFloor.map(bed => (
              <div 
                key={bed._id} 
                className={`section-bed-card status-${bed.status}`}
                onClick={() => handleBedClick(bed)}
              >
                <div className="bed-card-topline">
                  <span className="bed-number">{bed.bedNumber}</span>
                  {renderStatusBadge(bed)}
                </div>
                <div className="bed-card-meta">
                  <span className="meta-item">
                    Room {bed.location?.roomNumber || '—'}
                  </span>
                  <span className="meta-item">
                    {bed.equipmentType || 'Standard'}
                  </span>
                </div>
                {bed.patientId ? (
                  <div className="bed-card-patient">
                    <span className="label">Patient</span>
                    <span className="value">{bed.patientId.name}</span>
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
        </div>
      ) : (
        <div className="no-floor-data">
          No floor information available for the current selection.
        </div>
      )}

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

export default FloorPlan;