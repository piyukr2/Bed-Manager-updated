import React from 'react';

function CriticalAlertModal({ alert, onDismiss }) {
  if (!alert) return null;

  const formattedTime = new Date(alert.timestamp).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div className="critical-alert-overlay" role="alertdialog" aria-modal="true">
      <div className="critical-alert-card">
        <div className="critical-alert-header">
          <div>
            <h2>Critical Alert</h2>
            <p>Acknowledge and coordinate rapid response.</p>
          </div>
          <button className="critical-alert-close" onClick={onDismiss} aria-label="Dismiss critical alert">
            ×
          </button>
        </div>

        <div className="critical-alert-body">
          <div className="critical-alert-message">
            {alert.message}
          </div>

          <div className="critical-alert-meta">
            {alert.ward && (
              <div className="meta-item">
                <span className="label">Ward</span>
                <span className="value">{alert.ward}</span>
              </div>
            )}
            <div className="meta-item">
              <span className="label">Reported</span>
              <span className="value">{formattedTime}</span>
            </div>
          </div>
        </div>

        <div className="critical-alert-actions">
          <button className="alert-action acknowledge" onClick={onDismiss}>
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}

export default CriticalAlertModal;

