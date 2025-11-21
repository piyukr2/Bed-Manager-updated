import React from 'react';

const ALERT_LABELS = {
  critical: 'Critical',
  warning: 'Warning',
  success: 'Resolved',
  info: 'Information',
  error: 'Error'
};

function AlertPanel({ alerts }) {
  return (
    <div className="alert-panel">
      <div className="panel-header">
        <h3>Alerts & Notifications</h3>
        <span className="panel-subtext">
          Last {alerts.length} event{alerts.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="alerts-container">
        {alerts.length === 0 ? (
          <div className="no-alerts">
            <p>No active alerts</p>
            <span>All monitored systems are within established thresholds.</span>
          </div>
        ) : (
          alerts.map((alert, index) => (
            <div key={index} className={`alert alert-${alert.type}`}>
              <div className="alert-header">
                <span className={`alert-severity ${alert.type}`}>
                  {ALERT_LABELS[alert.type] || 'Information'}
                </span>
                <span className="alert-time">
                  {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="alert-message">{alert.message}</p>
              {alert.ward && (
                <span className="alert-meta">Ward: {alert.ward}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AlertPanel;