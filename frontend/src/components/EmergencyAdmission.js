import React, { useState } from 'react';

const EQUIPMENT_TYPES = [
  'Standard',
  'Ventilator',
  'ICU Monitor',
  'Cardiac Monitor',
  'Dialysis'
];

function EmergencyAdmission({ onClose, onSubmit, wards }) {
  const [formData, setFormData] = useState({
    patientId: `PAT-${Date.now()}`,
    name: '',
    age: '',
    gender: '',
    department: 'Emergency',
    reasonForAdmission: '',
    estimatedStay: 24,
    ward: 'ICU',
    equipmentType: 'Standard'
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="emergency-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚨 Emergency Admission</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="admission-form">
          <div className="form-group">
            <label>Patient ID</label>
            <input
              type="text"
              name="patientId"
              value={formData.patientId}
              onChange={handleChange}
              readOnly
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Patient Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Enter patient name"
              />
            </div>

            <div className="form-group">
              <label>Age *</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                required
                min="0"
                max="120"
                placeholder="Age"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Gender *</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Department</label>
              <select
                name="department"
                value={formData.department}
                onChange={handleChange}
              >
                <option value="Emergency">Emergency</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Neurology">Neurology</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="General">General</option>
                <option value="Critical Care">Critical Care</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Preferred Ward *</label>
              <select
                name="ward"
                value={formData.ward}
                onChange={handleChange}
                required
              >
                <option value="">Select ward</option>
                {wards.map(ward => (
                  <option key={ward} value={ward}>{ward}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Required Equipment *</label>
              <select
                name="equipmentType"
                value={formData.equipmentType}
                onChange={handleChange}
                required
              >
                {EQUIPMENT_TYPES.map(equipment => (
                  <option key={equipment} value={equipment}>
                    {equipment}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Reason for Admission *</label>
            <textarea
              name="reasonForAdmission"
              value={formData.reasonForAdmission}
              onChange={handleChange}
              required
              rows="3"
              placeholder="Enter reason for admission (e.g., Respiratory distress, Cardiac arrest, Trauma, etc.)"
            />
          </div>

          <div className="form-group">
            <label>Estimated Stay (hours)</label>
            <input
              type="number"
              name="estimatedStay"
              value={formData.estimatedStay}
              onChange={handleChange}
              min="1"
              placeholder="24"
            />
            <small className="form-hint">
              Expected duration of hospital stay in hours
            </small>
          </div>

          <div className="admission-info">
            <p className="info-text">
              ℹ️ The system will automatically find the best available bed based on:
            </p>
            <ul className="info-list">
              <li>1. Preferred ward + Required equipment (Perfect match)</li>
              <li>2. Required equipment in any ward (Equipment priority)</li>
              <li>3. Preferred ward with any equipment (Ward priority)</li>
              <li>4. Any available bed (Last resort)</li>
            </ul>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              🚨 Admit Patient
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EmergencyAdmission;