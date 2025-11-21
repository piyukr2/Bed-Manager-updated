import React, { useState, useEffect } from 'react';

const ALERT_LABELS = {
  critical: 'Critical',
  warning: 'Warning',
  success: 'Resolved',
  info: 'Information',
  error: 'Error'
};

const ALERTS_PER_PAGE = 10;

function AlertPanel({ alerts }) {
  const [displayedCount, setDisplayedCount] = useState(ALERTS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(false);

  // Reset displayed count when alerts change significantly
  useEffect(() => {
    if (alerts.length < displayedCount) {
      setDisplayedCount(Math.min(ALERTS_PER_PAGE, alerts.length));
    }
  }, [alerts.length, displayedCount]);

  const displayedAlerts = alerts.slice(0, displayedCount);
  const hasMore = displayedCount < alerts.length;
  const remainingCount = alerts.length - displayedCount;

  const handleLoadMore = () => {
    setIsLoading(true);
    // Simulate a small delay for smooth UX
    setTimeout(() => {
      setDisplayedCount(prev => Math.min(prev + ALERTS_PER_PAGE, alerts.length));
      setIsLoading(false);
    }, 300);
  };

  const handleShowLess = () => {
    setDisplayedCount(ALERTS_PER_PAGE);
    // Scroll to top of alerts container
    const container = document.querySelector('.alerts-container');
    if (container) {
      container.scrollTop = 0;
    }
  };

  return (
    <div className="alert-panel">
      <div className="panel-header">
        <div>
          <h3>Alerts & Notifications</h3>
          <span className="panel-subtext">
            {alerts.length} Active Alert{alerts.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="alerts-container">
        {alerts.length === 0 ? (
          <div className="no-alerts">
            <p>No active alerts</p>
            <span>All monitored systems are within established thresholds.</span>
          </div>
        ) : (
          <>
            {displayedAlerts.map((alert, index) => (
              <div key={alert.id || index} className={`alert alert-${alert.type}`}>
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
            ))}

            {/* Load More / Show Less Buttons */}
            {(hasMore || displayedCount > ALERTS_PER_PAGE) && (
              <div className="alerts-pagination">
                {hasMore && (
                  <button 
                    className="load-more-btn" 
                    onClick={handleLoadMore}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner-small"></span>
                        Loading...
                      </>
                    ) : (
                      <>
                        Load More ({remainingCount} more alert{remainingCount === 1 ? '' : 's'})
                      </>
                    )}
                  </button>
                )}
                {displayedCount > ALERTS_PER_PAGE && (
                  <button 
                    className="show-less-btn" 
                    onClick={handleShowLess}
                  >
                    Show Less
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AlertPanel;