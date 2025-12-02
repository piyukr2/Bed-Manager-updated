import React, { useState } from 'react';

const EQUIPMENT_TYPES_BY_WARD = {
  'ICU': ['ICU Monitor', 'Ventilator'],
  'General Ward': ['Standard'],
  'Cardiology': ['Cardiac Monitor', 'VAD'],
  'Emergency': ['Standard', 'Ventilator']
};

function EmergencyAdmission({ 
  isOpen, 
  onClose, 
  onSubmit,
  loading = false,
  title = "🚨 Emergency Admission",
  submitButtonText = "🚨 Submit Request",
  showBedReservation = true,
  availableBeds = [],
  onFetchBeds = null
}) {
  const [newRequest, setNewRequest] = useState({
    patientDetails: {
      name: '',
      age: '',
      gender: 'Male',
      contactNumber: '',
      reasonForAdmission: '',
      requiredEquipment: '',
      estimatedStay: 24
    },
    preferredWard: '',
    eta: ''
  });

  const [reserveBed, setReserveBed] = useState(false);
  const [selectedBedId, setSelectedBedId] = useState('');

  const handleChange = (field, value) => {
    setNewRequest(prev => ({
      ...prev,
      patientDetails: {
        ...prev.patientDetails,
        [field]: value
      }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (reserveBed && !selectedBedId) {
      alert('Select a bed to reserve or turn off reservation.');
      return;
    }
    
    // Pass the event and the request data to parent
    onSubmit(e, newRequest, reserveBed, selectedBedId);
    
    // Reset form after submission
    setNewRequest({
      patientDetails: {
        name: '',
        age: '',
        gender: 'Male',
        contactNumber: '',
        reasonForAdmission: '',
        requiredEquipment: '',
        estimatedStay: 24
      },
      preferredWard: '',
      eta: ''
    });
    setReserveBed(false);
    setSelectedBedId('');
  };

  const handleClose = () => {
    // Reset form when closing
    setNewRequest({
      patientDetails: {
        name: '',
        age: '',
        gender: 'Male',
        contactNumber: '',
        reasonForAdmission: '',
        requiredEquipment: '',
        estimatedStay: 24
      },
      preferredWard: '',
      eta: ''
    });
    setReserveBed(false);
    setSelectedBedId('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay emergency-overlay" onClick={handleClose}>
      <div className="modal-content emergency-modal sleek-design" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header emergency-header">
          <div className="header-content">
            <h2>{title}</h2>
            <p className="header-subtitle">Fill in patient admission details</p>
          </div>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="request-form sleek-form">
          {/* Patient Information Section */}
          <div className="form-section">
            <h3>Patient Information</h3>

            <div className="form-row">
              <div className="form-group">
                <label>Patient Name *</label>
                <input
                  type="text"
                  required
                  value={newRequest.patientDetails.name}
                  onChange={(e) => handleChange('name', e.target.value)}
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
                  onChange={(e) => handleChange('age', e.target.value)}
                  placeholder="Age"
                />
              </div>

              <div className="form-group">
                <label>Gender *</label>
                <select
                  required
                  value={newRequest.patientDetails.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
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
                onChange={(e) => handleChange('contactNumber', e.target.value)}
                placeholder="Contact number"
              />
            </div>
          </div>

          {/* Medical Details Section */}
          <div className="form-section">
            <h3>Medical Details</h3>

            <div className="form-row">
              <div className="form-group">
                <label>Preferred Ward *</label>
                <select
                  required
                  value={newRequest.preferredWard}
                  onChange={(e) => {
                    const ward = e.target.value;
                    const defaultEquipment = ward ? EQUIPMENT_TYPES_BY_WARD[ward]?.[0] || '' : '';
                    setNewRequest({ 
                      ...newRequest, 
                      preferredWard: ward,
                      patientDetails: {
                        ...newRequest.patientDetails,
                        requiredEquipment: defaultEquipment // Set default equipment for selected ward
                      }
                    });
                    if (reserveBed && onFetchBeds) {
                      onFetchBeds(ward);
                    }
                  }}
                >
                  <option value="">Select Ward</option>
                  <option value="ICU">ICU</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="General Ward">General Ward</option>
                </select>
              </div>

              <div className="form-group">
                <label>Required Equipment *</label>
                <select
                  required
                  value={newRequest.patientDetails.requiredEquipment}
                  onChange={(e) => handleChange('requiredEquipment', e.target.value)}
                  disabled={!newRequest.preferredWard}
                >
                  {!newRequest.preferredWard && (
                    <option value="">Select Ward First</option>
                  )}
                  {newRequest.preferredWard && EQUIPMENT_TYPES_BY_WARD[newRequest.preferredWard]?.map(equipment => (
                    <option key={equipment} value={equipment}>
                      {equipment}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label>Reason for Admission *</label>
              <textarea
                required
                rows="3"
                value={newRequest.patientDetails.reasonForAdmission}
                onChange={(e) => handleChange('reasonForAdmission', e.target.value)}
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
                  onChange={(e) => handleChange('estimatedStay', parseInt(e.target.value))}
                  placeholder="24"
                />
              </div>
            </div>

            {/* {showBedReservation && (
              <>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={reserveBed}
                      onChange={(e) => {
                        setReserveBed(e.target.checked);
                        if (e.target.checked && onFetchBeds) {
                          onFetchBeds(newRequest.preferredWard);
                        } else {
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
                          {bed.bedNumber} - {bed.ward} ({bed.location ? `Floor ${bed.location.floor}` : 'Location N/A'}, {bed.equipmentType})
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
              </>
            )} */}

            <div className="form-group">
              <label>Expected Time of Arrival</label>
              <input
                type="datetime-local"
                value={newRequest.eta}
                onChange={(e) => setNewRequest({ ...newRequest, eta: e.target.value })}
              />
            </div>

          </div>

          {/* Form Actions */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Processing...' : submitButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EmergencyAdmission;