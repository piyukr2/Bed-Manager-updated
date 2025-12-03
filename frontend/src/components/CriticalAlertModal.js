import React, { useEffect, useCallback } from 'react';

function CriticalAlertModal({ alert, onDismiss }) {
  // Create a stable dismiss handler that passes the alert ID
  const handleDismiss = useCallback(() => {
    if (alert && alert.id) {
      onDismiss(alert.id);
    } else {
      onDismiss();
    }
  }, [alert, onDismiss]);

  useEffect(() => {
    if (!alert) return;

    // Play alert sound based on severity
    const playAlertSound = (isCritical) => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        const playTone = (frequency, startTime, duration, volume = 0.2) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, startTime);
          
          gainNode.gain.setValueAtTime(0, startTime);
          gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
          gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
          
          oscillator.start(startTime);
          oscillator.stop(startTime + duration);
        };
        
        const now = audioContext.currentTime;
        
        if (isCritical) {
          // Critical: Urgent repeating alert sound
          playTone(880, now, 0.2, 0.25);       // A5
          playTone(880, now + 0.25, 0.2, 0.25); // A5
          playTone(880, now + 0.5, 0.3, 0.3);  // A5 (longer)
        } else {
          // Warning: Two-tone notification
          playTone(659.25, now, 0.2, 0.2);     // E5
          playTone(783.99, now + 0.25, 0.25, 0.22); // G5
        }
      } catch (error) {
        console.log('Audio not available:', error);
      }
    };

    playAlertSound(alert.severity === 'critical');

    // Auto-dismiss warning alerts after 10 seconds
    if (alert.severity === 'warning') {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [alert, handleDismiss]);

  if (!alert) return null;

  const isCritical = alert.severity === 'critical';
  const formattedTime = alert.timestamp 
    ? new Date(alert.timestamp).toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

  return (
    <div className={`critical-alert-overlay ${isCritical ? 'critical' : 'warning'}`} role="alertdialog" aria-modal="true">
      <div className={`critical-alert-card ${isCritical ? 'critical' : 'warning'}`}>
        <div className="critical-alert-header">
          <div className="critical-alert-icon">
            {isCritical ? '🚨' : '⚠️'}
          </div>
          <div className="critical-alert-title">
            <h2>{isCritical ? 'CRITICAL OCCUPANCY ALERT' : 'High Occupancy Warning'}</h2>
            <p>{isCritical ? 'Immediate action required' : 'Monitor capacity closely'}</p>
          </div>
          <button className="critical-alert-close" onClick={handleDismiss} aria-label="Dismiss alert">
            ×
          </button>
        </div>

        <div className="critical-alert-body">
          {alert.occupancyRate !== undefined ? (
            <>
              <div className="critical-alert-message">
                <h3>{alert.wardName || alert.ward || 'Hospital'} Occupancy</h3>
                <div className="critical-alert-percentage">
                  <span className="percentage-value">{alert.occupancyRate}%</span>
                  <span className="percentage-label">Occupied</span>
                </div>
              </div>

              <div className="critical-alert-details">
                <div className="detail-row">
                  <span className="detail-label">Total Beds:</span>
                  <span className="detail-value">{alert.totalBeds || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Occupied:</span>
                  <span className="detail-value occupied">{alert.occupied || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Available:</span>
                  <span className="detail-value available">{alert.available || 0}</span>
                </div>
                {alert.cleaning > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">In Cleaning:</span>
                    <span className="detail-value cleaning">{alert.cleaning}</span>
                  </div>
                )}
              </div>

              <div className={`critical-alert-threshold ${isCritical ? 'critical' : 'warning'}`}>
                {isCritical ? (
                  <>
                    <strong>⚠️ Critical Threshold Reached:</strong> Occupancy has exceeded {alert.threshold}%
                    <p>Immediate action required. Consider patient transfer or additional resource allocation.</p>
                  </>
                ) : (
                  <>
                    <strong>⚠️ Warning Threshold Reached:</strong> Occupancy has exceeded {alert.threshold}%
                    <p>Monitor closely and prepare for capacity management.</p>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="critical-alert-actions">
          <button className="alert-action acknowledge" onClick={handleDismiss}>
            {isCritical ? 'Acknowledge' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CriticalAlertModal;

