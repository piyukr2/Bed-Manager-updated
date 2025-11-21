import React from 'react';

function Dashboard({ stats }) {
  const summaryCards = [
    {
      key: 'total',
      title: 'Total Beds',
      value: stats.totalBeds ?? 0,
      description: 'Configured across all wards'
    },
    {
      key: 'occupied',
      title: 'Occupied',
      value: stats.occupied ?? 0,
      description: `${stats.totalBeds ? Math.round((stats.occupied / stats.totalBeds) * 100) : 0}% of capacity`,
    },
    {
      key: 'available',
      title: 'Available',
      value: stats.available ?? 0,
      description: 'Ready for admission'
    },
    {
      key: 'cleaning',
      title: 'Cleaning',
      value: stats.cleaning ?? 0,
      description: 'Awaiting service release'
    },
    {
      key: 'reserved',
      title: 'Reserved',
      value: stats.reserved ?? 0,
      description: 'Allocated for transfers'
    }
  ];

  const occupancyRate = stats.occupancyRate ?? 0;
  const occupancyWidth = Math.min(Math.max(occupancyRate, 0), 100);

  return (
    <div className="dashboard-container">
      <div className="stats-summary">
        {summaryCards.map((card) => (
          <div key={card.key} className={`stat-card stat-${card.key}`}>
            <div className="stat-title">{card.title}</div>
            <div className="stat-value">{card.value}</div>
            <div className="stat-description">{card.description}</div>
          </div>
        ))}
      </div>

      <div className="occupancy-overview">
        <div className="occupancy-header">
          <div>
            <h3>Current Occupancy</h3>
            <p>Live utilization of configured capacity</p>
          </div>
          <span className="occupancy-indicator">
            {stats.occupied}/{stats.totalBeds} beds
          </span>
        </div>

        <div className="occupancy-bar">
          <div
            className={`occupancy-progress ${occupancyRate >= 90 ? 'critical' : occupancyRate >= 80 ? 'warning' : 'normal'}`}
            style={{ width: `${occupancyWidth}%` }}
          />
        </div>

        <div className="occupancy-footer">
          <span className="occupancy-rate">
            {occupancyRate}% in use
          </span>
          <span className="occupancy-note">
            Targets: &lt; 80% routine, 80-90% caution, &gt; 90% escalation
          </span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
