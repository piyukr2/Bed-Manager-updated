import React, { useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const STATUS_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  reserved: 'Reserved',
  maintenance: 'Maintenance'
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

const STATUS_ICONS = {
  available: '🟢',
  occupied: '🔴',
  cleaning: '🧼',
  reserved: '🟡',
  maintenance: '🛠️'
};

function BedGrid({ beds, onUpdateBed, selectedWard, canUpdateBeds }) {
  const [selectedBed, setSelectedBed] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [loadingQR, setLoadingQR] = useState(false);

  const handleBedClick = (bed) => {
    setSelectedBed(bed);
  };

  const handleStatusChange = async (newStatus) => {
    if (selectedBed) {
      await onUpdateBed(selectedBed._id, newStatus);
      setSelectedBed(null);
    }
  };

  const generateQRCode = async () => {
    setLoadingQR(true);
    try {
      const response = await fetch(`${API_URL.replace('/api', '')}/api/network-info`);
      const data = await response.json();
      const accessUrl = data.frontendURL || window.location.origin;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(accessUrl)}`;

      setQrData({
        qrImageUrl: qrUrl,
        accessUrl,
        localIP: data.localIP,
        note: data.note
      });
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert('Failed to generate QR code. Please check your network connection.');
    } finally {
      setLoadingQR(false);
    }
  };

  const downloadQRCode = async () => {
    if (!qrData) return;
    try {
      const response = await fetch(qrData.qrImageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bedmanager-qr-${qrData.localIP}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      alert('Failed to download QR code');
    }
  };

  return (
    <div className="bed-grid-container">
      <div className="bed-grid-header">
        <div className="header-left">
          <h2>Bed Inventory — {selectedWard}</h2>
          <p className="header-caption">
            Select a bed to review assignment details or update operational status.
          </p>
        </div>

        <div className="header-right">
          <div className="bed-legend">
            {STATUS_OPTIONS.map((status) => (
              <span key={status} className="legend-item">
                <span className={`legend-dot status-${status}`} />
                {STATUS_LABELS[status]}
              </span>
            ))}
          </div>

          <button
            onClick={generateQRCode}
            className="qr-btn"
            disabled={loadingQR}
          >
            {loadingQR ? 'Generating QR...' : 'Mobile Access QR'}
          </button>
        </div>
      </div>

      {beds.length === 0 ? (
        <div className="no-beds">
          <p>No beds found for the selected ward.</p>
        </div>
      ) : (
        <div className="bed-grid">
          {beds.map((bed) => (
            <div
              key={bed._id}
              className={`bed-item status-${bed.status}`}
              onClick={() => handleBedClick(bed)}
            >
              <div className="bed-card-header">
                <span className="bed-number">{bed.bedNumber}</span>
                <div className="bed-status-visual">
                  <span className={`status-icon status-${bed.status}`}>
                    {STATUS_ICONS[bed.status] || '⏺'}
                  </span>
                  <span className="status-label">
                    {STATUS_LABELS[bed.status] || bed.status}
                  </span>
                </div>
              </div>

              <div className="bed-card-body">
                <div className="bed-ward">{bed.ward}</div>

                {bed.location && (
                  <div className="bed-location">
                    Floor {bed.location.floor} · Section {bed.location.section} · Room {bed.location.roomNumber}
                  </div>
                )}

                {bed.equipmentType && bed.equipmentType !== 'Standard' && (
                  <div className="equipment-chip">{bed.equipmentType}</div>
                )}

                {bed.patientId ? (
                  <div className="patient-allocation">
                    <span className="label">Patient</span>
                    <span className="value">{bed.patientId.name || 'Assigned'}</span>
                  </div>
                ) : (
                  <div className="patient-allocation vacant">
                    <span className="label">Patient</span>
                    <span className="value">Not assigned</span>
                  </div>
                )}

                {bed.notes && (
                  <div className="bed-notes">
                    <span className="label">Notes</span>
                    <span className="value">{bed.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
                    {STATUS_OPTIONS.map((status) => (
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

      {showQRModal && qrData && (
        <div className="bed-modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mobile Access QR Code</h3>
              <button className="close-btn" onClick={() => setShowQRModal(false)} aria-label="Close QR code">
                ×
              </button>
            </div>

            <div className="modal-content qr-content">
              <p className="qr-instruction">
                Scan the QR code from a trusted hospital device to open the dashboard on mobile.
              </p>

              <div className="qr-code-display">
                <img src={qrData.qrImageUrl} alt="BedManager QR Code" />
              </div>

              <div className="qr-info">
                <p className="site-url">
                  <strong>Access URL:</strong> <code>{qrData.accessUrl}</code>
                </p>
                <p className="site-url">
                  <strong>Server IP:</strong> {qrData.localIP}
                </p>
              </div>

              <div className="qr-instructions">
                <p>Usage guidance</p>
                <ol>
                  <li>Ensure the device is on the secure hospital network.</li>
                  <li>Open the camera or QR scanner application.</li>
                  <li>Scan the QR code displayed above.</li>
                  <li>Follow the prompt to open BedManager in the browser.</li>
                </ol>
              </div>

              {qrData.note && (
                <p className="qr-note">
                  {qrData.note}
                </p>
              )}

              <button className="download-qr-btn" onClick={downloadQRCode}>
                Download QR Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BedGrid;