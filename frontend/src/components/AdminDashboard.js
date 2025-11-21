import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import OccupancyChart from './OccupancyChart';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function AdminDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [bedRequests, setBedRequests] = useState([]);
  const [requestStats, setRequestStats] = useState(null);
  const [period, setPeriod] = useState('24h');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'analytics', 'requests', 'settings'
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [selectedWard, setSelectedWard] = useState('All');

  useEffect(() => {
    fetchAllData();

    const interval = setInterval(fetchAllData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [period]);

  useEffect(() => {
    if (!socket) return;

    // Bed-related events
    socket.on('bed-updated', () => {
      fetchStats();
      fetchHistory();
    });

    socket.on('bed-created', () => {
      fetchStats();
    });

    // Bed request events
    socket.on('new-bed-request', () => {
      fetchBedRequests();
      fetchRequestStats();
    });

    socket.on('bed-request-approved', () => {
      fetchBedRequests();
      fetchRequestStats();
      fetchStats();
    });

    socket.on('bed-request-denied', () => {
      fetchBedRequests();
      fetchRequestStats();
    });

    socket.on('bed-request-fulfilled', () => {
      fetchBedRequests();
      fetchRequestStats();
      fetchStats();
    });

    socket.on('bed-request-cancelled', () => {
      fetchBedRequests();
      fetchRequestStats();
    });

    socket.on('bed-request-expired', () => {
      fetchBedRequests();
      fetchRequestStats();
      fetchStats();
    });

    // Patient events
    socket.on('patient-admitted', () => {
      fetchStats();
      fetchHistory();
    });

    socket.on('patient-discharged', () => {
      fetchStats();
      fetchHistory();
    });

    // Settings events
    socket.on('settings-updated', (updatedSettings) => {
      setSettings(updatedSettings);
    });

    return () => {
      socket.off('bed-updated');
      socket.off('bed-created');
      socket.off('new-bed-request');
      socket.off('bed-request-approved');
      socket.off('bed-request-denied');
      socket.off('bed-request-fulfilled');
      socket.off('bed-request-cancelled');
      socket.off('bed-request-expired');
      socket.off('patient-admitted');
      socket.off('patient-discharged');
      socket.off('settings-updated');
    };
  }, [socket]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchHistory(),
        fetchBedRequests(),
        fetchRequestStats(),
        fetchSettings()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds/history?period=${period}`);
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const fetchBedRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests`);
      setBedRequests(response.data);
    } catch (error) {
      console.error('Error fetching bed requests:', error);
    }
  };

  const fetchRequestStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests/stats`);
      setRequestStats(response.data);
    } catch (error) {
      console.error('Error fetching request stats:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleUpdateSettings = async () => {
    if (!settings) return;

    setSettingsSaving(true);
    try {
      const response = await axios.put(`${API_URL}/settings`, settings);
      setSettings(response.data.settings);
      alert('Settings updated successfully!');
    } catch (error) {
      console.error('Error updating settings:', error);
      alert(error.response?.data?.error || 'Failed to update settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetSettings = async () => {
    if (!window.confirm('Are you sure you want to reset all settings to defaults?')) return;

    setSettingsSaving(true);
    try {
      const response = await axios.post(`${API_URL}/settings/reset`);
      setSettings(response.data.settings);
      alert('Settings reset to defaults!');
    } catch (error) {
      console.error('Error resetting settings:', error);
      alert(error.response?.data?.error || 'Failed to reset settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const calculateTrends = () => {
    if (history.length < 2) return null;

    const recent = history.slice(-6);
    const avgOccupancy = recent.reduce((sum, h) => sum + h.occupancyRate, 0) / recent.length;
    const trend = recent[recent.length - 1].occupancyRate - recent[0].occupancyRate;

    return {
      avgOccupancy: avgOccupancy.toFixed(1),
      trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      trendValue: Math.abs(trend).toFixed(1)
    };
  };

  // Calculate filtered stats based on selected ward
  const getFilteredStats = () => {
    if (!stats || selectedWard === 'All') {
      return stats;
    }

    // Filter to show only the selected ward's statistics
    const wardStat = stats.wardStats?.find(w => w._id === selectedWard);
    if (wardStat) {
      return {
        totalBeds: wardStat.total,
        occupied: wardStat.occupied,
        available: wardStat.available,
        cleaning: wardStat.cleaning,
        reserved: wardStat.reserved,
        occupancyRate: ((wardStat.occupied / wardStat.total) * 100).toFixed(1),
        wardStats: [wardStat]
      };
    }

    return stats;
  };

  const filteredStats = getFilteredStats();

  const exportReport = async (format = 'json') => {
    try {
      const reportData = {
        generatedAt: new Date().toISOString(),
        generatedBy: currentUser.name,
        period,
        stats: stats,
        history: history,
        bedRequests: bedRequests,
        requestStats: requestStats,
        trends: calculateTrends()
      };

      if (format === 'pdf') {
        // Generate PDF using browser's print functionality
        const printWindow = window.open('', '', 'width=800,height=600');

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>BedManager Report</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 40px;
                color: #333;
              }
              h1 {
                color: #0284c7;
                border-bottom: 3px solid #0284c7;
                padding-bottom: 10px;
              }
              h2 {
                color: #0f172a;
                margin-top: 30px;
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 8px;
              }
              .metadata {
                background: #f8fafc;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
              }
              .metadata p {
                margin: 5px 0;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
              }
              th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e2e8f0;
              }
              th {
                background-color: #f1f5f9;
                font-weight: 600;
                color: #0f172a;
              }
              tr:hover {
                background-color: #f8fafc;
              }
              .stat-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
                margin: 20px 0;
              }
              .stat-item {
                background: #f8fafc;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #0284c7;
              }
              .stat-label {
                font-size: 14px;
                color: #64748b;
                margin-bottom: 5px;
              }
              .stat-value {
                font-size: 24px;
                font-weight: 700;
                color: #0f172a;
              }
              @media print {
                body { margin: 20px; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>BedManager Report</h1>

            <div class="metadata">
              <p><strong>Generated:</strong> ${new Date(reportData.generatedAt).toLocaleString()}</p>
              <p><strong>Generated By:</strong> ${reportData.generatedBy}</p>
              <p><strong>Period:</strong> ${period === '24h' ? '24 Hours' : period === '7d' ? '7 Days' : '30 Days'}</p>
            </div>

            <h2>Overall Statistics</h2>
            <div class="stat-grid">
              <div class="stat-item">
                <div class="stat-label">Total Beds</div>
                <div class="stat-value">${stats.totalBeds}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Occupied</div>
                <div class="stat-value">${stats.occupied}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Available</div>
                <div class="stat-value">${stats.available}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Cleaning</div>
                <div class="stat-value">${stats.cleaning}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Reserved</div>
                <div class="stat-value">${stats.reserved}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Occupancy Rate</div>
                <div class="stat-value">${stats.occupancyRate}%</div>
              </div>
            </div>

            <h2>Ward Statistics</h2>
            <table>
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Total</th>
                  <th>Occupied</th>
                  <th>Available</th>
                  <th>Cleaning</th>
                  <th>Reserved</th>
                  <th>Occupancy %</th>
                </tr>
              </thead>
              <tbody>
                ${stats.wardStats.map(ward => `
                  <tr>
                    <td><strong>${ward._id}</strong></td>
                    <td>${ward.total}</td>
                    <td>${ward.occupied}</td>
                    <td>${ward.available}</td>
                    <td>${ward.cleaning}</td>
                    <td>${ward.reserved || 0}</td>
                    <td>${((ward.occupied / ward.total) * 100).toFixed(1)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <p class="no-print" style="margin-top: 30px; text-align: center; color: #64748b;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">Print / Save as PDF</button>
              <button onclick="window.close()" style="padding: 10px 20px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; margin-left: 10px;">Close</button>
            </p>
          </body>
          </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Auto-trigger print dialog after a short delay to ensure content is loaded
        setTimeout(() => {
          printWindow.print();
        }, 250);

        return;
      } else if (format === 'json') {
        const dataStr = JSON.stringify(reportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bedmanager-report-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'csv') {
        // Convert stats to CSV
        let csv = 'Metric,Value\n';
        csv += `Total Beds,${stats.totalBeds}\n`;
        csv += `Occupied,${stats.occupied}\n`;
        csv += `Available,${stats.available}\n`;
        csv += `Cleaning,${stats.cleaning}\n`;
        csv += `Reserved,${stats.reserved}\n`;
        csv += `Occupancy Rate,${stats.occupancyRate}%\n\n`;

        csv += 'Ward,Total,Occupied,Available,Cleaning\n';
        stats.wardStats.forEach(ward => {
          csv += `${ward._id},${ward.total},${ward.occupied},${ward.available},${ward.cleaning}\n`;
        });

        const csvBlob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(csvBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bedmanager-report-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report');
    }
  };

  const trends = calculateTrends();

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="brand-identity">
            <div className="brand-mark">ADMIN</div>
            <div className="brand-copy">
              <h1>Hospital Administration Center</h1>
              <p className="subtitle">Analytics, trends, and strategic planning</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="export-actions">
            <button className="export-btn" onClick={() => exportReport('pdf')}>
              Export PDF
            </button>
            <button className="export-btn" onClick={() => exportReport('csv')}>
              Export CSV
            </button>
          </div>
          <div className="user-info">
            <span className="user-name">{currentUser.name}</span>
            <span className="user-role">(Administrator)</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className="theme-icon">
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
          </button>
        </div>
      </header>

      <div className="admin-main-content">
        {/* Navigation Tabs */}
        <div className="admin-tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics & Trends
          </button>
          <button
            className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Bed Requests
          </button>
          <button
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        {/* Ward Filter */}
        <div className="ward-filter-section">
          <label>Filter by Ward:</label>
          <div className="ward-buttons">
            {['All', 'Emergency', 'ICU', 'General Ward', 'Cardiology'].map((ward) => (
              <button
                key={ward}
                className={`ward-filter-btn ${selectedWard === ward ? 'active' : ''}`}
                onClick={() => setSelectedWard(ward)}
              >
                {ward}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && filteredStats && (
          <div className="overview-content">
            <Dashboard stats={filteredStats} />
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="analytics-content">
            <div className="period-selector">
              <h3>Historical Analysis</h3>
              <div className="period-buttons">
                <button
                  className={`period-btn ${period === '24h' ? 'active' : ''}`}
                  onClick={() => setPeriod('24h')}
                >
                  24 Hours
                </button>
                <button
                  className={`period-btn ${period === '7d' ? 'active' : ''}`}
                  onClick={() => setPeriod('7d')}
                >
                  7 Days
                </button>
                <button
                  className={`period-btn ${period === '30d' ? 'active' : ''}`}
                  onClick={() => setPeriod('30d')}
                >
                  30 Days
                </button>
              </div>
            </div>

            {/* Daily Average Percentage Occupancy Graph */}
            <div className="daily-occupancy-section">
              <h3>Daily Average Percentage Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>

              {period === '24h' ? (
                <div className="current-occupancy-display">
                  <div className="occupancy-value-large">
                    {filteredStats ? filteredStats.occupancyRate : '0'}%
                  </div>
                  <div className="occupancy-label">
                    Current Daily Average Occupancy{selectedWard !== 'All' && ` - ${selectedWard}`}
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={history
                      .filter((h, index) => {
                        if (period === '7d') return index < 7;
                        if (period === '30d') return index < 30;
                        return true;
                      })
                      .map(h => {
                        let occupancyValue = parseFloat(h.occupancyRate);

                        // If a specific ward is selected, get that ward's occupancy rate
                        if (selectedWard !== 'All' && h.wardStats && Array.isArray(h.wardStats)) {
                          const wardData = h.wardStats.find(w => w.ward === selectedWard);
                          if (wardData) {
                            occupancyValue = parseFloat(wardData.occupancyRate);
                          }
                        }

                        return {
                          date: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          occupancy: occupancyValue
                        };
                      })}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                    <XAxis
                      dataKey="date"
                      stroke="var(--text-quiet)"
                      tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                    />
                    <YAxis
                      stroke="var(--text-quiet)"
                      tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                      domain={[0, 100]}
                      label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        padding: '8px 12px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="occupancy"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ fill: '#0284c7', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {history.length > 0 && (
              <div className="history-table-section">
                <h3>
                  Daily Occupancy History
                  ({period === '24h' ? 'Last 24 Hours' : period === '7d' ? 'Last 7 Days' : 'Last 30 Days'})
                  {selectedWard !== 'All' && ` - ${selectedWard}`}
                </h3>
                <div className="history-table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Occupancy Rate</th>
                        <th>Occupied</th>
                        <th>Available</th>
                        <th>Cleaning</th>
                        <th>Reserved</th>
                        <th>Peak Hour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history
                        .slice(period === '7d' ? -7 : period === '30d' ? -30 : -1)
                        .reverse()
                        .map((record, idx) => {
                        // Extract ward-specific data if a ward is selected
                        let displayData = {
                          occupancyRate: record.occupancyRate,
                          occupied: record.occupied,
                          available: record.available,
                          cleaning: record.cleaning,
                          reserved: record.reserved
                        };

                        if (selectedWard !== 'All' && record.wardStats && Array.isArray(record.wardStats)) {
                          const wardData = record.wardStats.find(w => w.ward === selectedWard);
                          if (wardData) {
                            displayData = {
                              occupancyRate: wardData.occupancyRate,
                              occupied: wardData.occupied,
                              available: wardData.available,
                              cleaning: wardData.cleaning,
                              reserved: wardData.reserved
                            };
                          }
                        }

                        return (
                          <tr key={idx}>
                            <td>{formatDate(record.timestamp)}</td>
                            <td>
                              <span className={`occupancy-cell ${displayData.occupancyRate >= 90 ? 'critical' : displayData.occupancyRate >= 80 ? 'warning' : 'normal'}`}>
                                {displayData.occupancyRate}%
                              </span>
                            </td>
                            <td>{displayData.occupied}</td>
                            <td>{displayData.available}</td>
                            <td>{displayData.cleaning}</td>
                            <td>{displayData.reserved}</td>
                            <td>{record.peakHour ? '⚠️ Yes' : 'No'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Forecasting Section */}
            <div className="forecasting-section">
              <h3>Capacity Forecast</h3>
              <div className="forecast-info">
                {trends && (
                  <div className="forecast-card">
                    <h4>Next 24 Hours Prediction</h4>
                    <p>
                      Based on current trends ({trends.trend}), occupancy is expected to{' '}
                      {trends.trend === 'increasing' && 'increase'}
                      {trends.trend === 'decreasing' && 'decrease'}
                      {trends.trend === 'stable' && 'remain stable'}.
                    </p>
                    {stats && (
                      <div className="forecast-values">
                        <div className="forecast-value">
                          <span className="forecast-label">Current:</span>
                          <span className="forecast-number">{stats.occupancyRate}%</span>
                        </div>
                        <div className="forecast-value">
                          <span className="forecast-label">Projected:</span>
                          <span className="forecast-number">
                            {trends.trend === 'increasing'
                              ? Math.min(100, stats.occupancyRate + parseFloat(trends.trendValue))
                              : trends.trend === 'decreasing'
                              ? Math.max(0, stats.occupancyRate - parseFloat(trends.trendValue))
                              : stats.occupancyRate}
                            %
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bed Requests Tab */}
        {activeTab === 'requests' && (
          <div className="requests-analytics-content">
            {requestStats && (
              <div className="request-stats-summary">
                <div className="stat-card stat-total">
                  <div className="stat-title">Total Requests</div>
                  <div className="stat-value">{requestStats.total || 0}</div>
                </div>
                <div className="stat-card stat-pending">
                  <div className="stat-title">Pending</div>
                  <div className="stat-value">{requestStats.pending || 0}</div>
                </div>
                <div className="stat-card stat-approved">
                  <div className="stat-title">Approved</div>
                  <div className="stat-value">{requestStats.approved || 0}</div>
                </div>
                <div className="stat-card stat-denied">
                  <div className="stat-title">Denied</div>
                  <div className="stat-value">{requestStats.denied || 0}</div>
                </div>
              </div>
            )}

            {/* Pie Chart for Request Statuses */}
            {requestStats && (
              <div className="request-status-pie-chart-section">
                <h3>Request Status Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Pending', value: requestStats.pending || 0, color: '#f59e0b' },
                        { name: 'Approved', value: requestStats.approved || 0, color: '#10b981' },
                        { name: 'Denied', value: requestStats.denied || 0, color: '#ef4444' }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[
                        { name: 'Pending', value: requestStats.pending || 0, color: '#f59e0b' },
                        { name: 'Approved', value: requestStats.approved || 0, color: '#10b981' },
                        { name: 'Denied', value: requestStats.denied || 0, color: '#ef4444' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        padding: '8px 12px'
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {requestStats && requestStats.triageStats && requestStats.triageStats.length > 0 && (
              <div className="triage-breakdown">
                <h3>Requests by Triage Level</h3>
                <div className="triage-stats-grid">
                  {requestStats.triageStats.map((triage) => (
                    <div key={triage._id} className="triage-stat-card">
                      <div className={`triage-badge triage-${triage._id.toLowerCase()}`}>
                        {triage._id}
                      </div>
                      <div className="triage-count">{triage.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bedRequests.length > 0 && (
              <div className="recent-requests">
                <h3>Recent Bed Requests {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                <div className="requests-table-container">
                  <table className="requests-table">
                    <thead>
                      <tr>
                        <th>Request ID</th>
                        <th>Patient</th>
                        <th>Triage</th>
                        <th>Ward</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Created By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bedRequests
                        .filter(request => selectedWard === 'All' || request.preferredWard === selectedWard)
                        .slice(0, 100)
                        .map((request) => (
                        <tr key={request._id}>
                          <td>{request.requestId}</td>
                          <td>{request.patientDetails.name}</td>
                          <td>
                            <span className={`triage-badge triage-${request.patientDetails.triageLevel.toLowerCase()}`}>
                              {request.patientDetails.triageLevel}
                            </span>
                          </td>
                          <td>{request.preferredWard || 'Any'}</td>
                          <td>
                            <span className={`status-badge status-${request.status}`}>
                              {request.status}
                            </span>
                          </td>
                          <td>{formatDateTime(request.createdAt)}</td>
                          <td>{request.createdBy.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && settings && (
          <div className="settings-content">
            <div className="settings-section">
              <h3>System Configuration</h3>
              <p className="settings-description">
                Configure occupancy thresholds, reporting parameters, and system policies.
              </p>

              <div className="settings-grid">
                <div className="setting-card">
                  <h4>Occupancy Alert Thresholds</h4>
                  <div className="setting-item">
                    <label>Warning Threshold (Yellow):</label>
                    <input
                      type="number"
                      value={settings.thresholds?.warningThreshold || 80}
                      onChange={(e) => setSettings({
                        ...settings,
                        thresholds: {
                          ...settings.thresholds,
                          warningThreshold: parseInt(e.target.value)
                        }
                      })}
                      min="0"
                      max="100"
                    />
                    <span className="setting-unit">%</span>
                  </div>
                  <div className="setting-item">
                    <label>Critical Threshold (Red):</label>
                    <input
                      type="number"
                      value={settings.thresholds?.criticalThreshold || 90}
                      onChange={(e) => setSettings({
                        ...settings,
                        thresholds: {
                          ...settings.thresholds,
                          criticalThreshold: parseInt(e.target.value)
                        }
                      })}
                      min="0"
                      max="100"
                    />
                    <span className="setting-unit">%</span>
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Reporting Configuration</h4>
                  <div className="setting-item">
                    <label>Default Report Period:</label>
                    <select
                      value={settings.reporting?.defaultPeriod || '24h'}
                      onChange={(e) => setSettings({
                        ...settings,
                        reporting: {
                          ...settings.reporting,
                          defaultPeriod: e.target.value
                        }
                      })}
                    >
                      <option value="24h">24 Hours</option>
                      <option value="7d">7 Days</option>
                      <option value="30d">30 Days</option>
                    </select>
                  </div>
                  <div className="setting-item">
                    <label>Auto-refresh Interval:</label>
                    <input
                      type="number"
                      value={settings.reporting?.autoRefreshInterval || 60}
                      onChange={(e) => setSettings({
                        ...settings,
                        reporting: {
                          ...settings.reporting,
                          autoRefreshInterval: parseInt(e.target.value)
                        }
                      })}
                      min="10"
                      max="300"
                    />
                    <span className="setting-unit">seconds</span>
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Bed Reservation Policies</h4>
                  <div className="setting-item">
                    <label>Default Reservation TTL:</label>
                    <input
                      type="number"
                      value={settings.reservationPolicies?.defaultReservationTTL || 2}
                      onChange={(e) => setSettings({
                        ...settings,
                        reservationPolicies: {
                          ...settings.reservationPolicies,
                          defaultReservationTTL: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="24"
                    />
                    <span className="setting-unit">hours</span>
                  </div>
                  <div className="setting-item">
                    <label>Auto-expire Reservations:</label>
                    <input
                      type="checkbox"
                      checked={settings.reservationPolicies?.autoExpireReservations !== false}
                      onChange={(e) => setSettings({
                        ...settings,
                        reservationPolicies: {
                          ...settings.reservationPolicies,
                          autoExpireReservations: e.target.checked
                        }
                      })}
                    />
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Ward Bed Capacity</h4>
                  <p className="setting-description-small">Configure the number of beds in each ward. Changes will be reflected across all dashboards.</p>
                  <div className="setting-item">
                    <label>Emergency Ward Beds:</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.Emergency || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          Emergency: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                  <div className="setting-item">
                    <label>ICU Beds:</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.ICU || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          ICU: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                  <div className="setting-item">
                    <label>General Ward Beds:</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.['General Ward'] || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          'General Ward': parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                  <div className="setting-item">
                    <label>Cardiology Beds:</label>
                    <input
                      type="number"
                      value={settings.wardCapacity?.Cardiology || 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        wardCapacity: {
                          ...settings.wardCapacity,
                          Cardiology: parseInt(e.target.value)
                        }
                      })}
                      min="1"
                      max="100"
                    />
                    <span className="setting-unit">beds</span>
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Data Export Options</h4>
                  <div className="setting-item">
                    <label>Include PHI in Exports:</label>
                    <input
                      type="checkbox"
                      checked={settings.exportOptions?.includePHI === true}
                      onChange={(e) => setSettings({
                        ...settings,
                        exportOptions: {
                          ...settings.exportOptions,
                          includePHI: e.target.checked
                        }
                      })}
                    />
                  </div>
                  <div className="setting-item">
                    <label>Export Format Preference:</label>
                    <select
                      value={settings.exportOptions?.defaultFormat || 'json'}
                      onChange={(e) => setSettings({
                        ...settings,
                        exportOptions: {
                          ...settings.exportOptions,
                          defaultFormat: e.target.value
                        }
                      })}
                    >
                      <option value="json">JSON</option>
                      <option value="csv">CSV</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="settings-actions">
                <button
                  className="btn-save-settings"
                  onClick={handleUpdateSettings}
                  disabled={settingsSaving}
                >
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  className="btn-reset-settings"
                  onClick={handleResetSettings}
                  disabled={settingsSaving}
                >
                  Reset to Defaults
                </button>
              </div>

              {settings.lastUpdatedBy && (
                <div className="settings-info">
                  <p>
                    <strong>Last updated by:</strong> {settings.lastUpdatedBy.name} on {new Date(settings.updatedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
