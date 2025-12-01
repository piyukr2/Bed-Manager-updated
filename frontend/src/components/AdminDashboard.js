import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import ResizableCard from './ResizableCard';
// import OccupancyChart from './OccupancyChart';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function AdminDashboard({ currentUser, onLogout, theme, onToggleTheme, socket }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [bedRequests, setBedRequests] = useState([]);
  const [requestStats, setRequestStats] = useState(null);
  const [period, setPeriod] = useState('today');
  const [requestsPeriod, setRequestsPeriod] = useState('today'); // 'today', '7d', '30d'
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'analytics', 'requests', 'settings'
  // const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [selectedWard, setSelectedWard] = useState('All');
  const [todayHourlySource, setTodayHourlySource] = useState(null);

  // Seed data import state
  const [seedFile, setSeedFile] = useState(null);
  const [seedValidation, setSeedValidation] = useState(null);
  const [seedImporting, setSeedImporting] = useState(false);
  const [seedImportResult, setSeedImportResult] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);

  // Chart options
  const [showMaxOccupancy, setShowMaxOccupancy] = useState(true);

  const hasHourlyData = (record) => Array.isArray(record?.hourlyData) && record.hourlyData.length > 0;

  const findHistoryRecordForDate = (records, targetDate) => {
    if (!records || records.length === 0 || !targetDate) return null;
    const targetDateString = targetDate.toDateString();
    return records.find(record => {
      if (!record?.timestamp) return false;
      return new Date(record.timestamp).toDateString() === targetDateString;
    }) || null;
  };

  const findLatestHourlyRecord = (records) => {
    if (!records || records.length === 0) return null;
    for (let i = records.length - 1; i >= 0; i -= 1) {
      if (hasHourlyData(records[i])) {
        return records[i];
      }
    }
    return null;
  };

  const getHourLabel = (hourData) => {
    const hourValue = typeof hourData?.hour === 'number'
      ? hourData.hour
      : hourData?.timestamp
        ? new Date(hourData.timestamp).getHours()
        : 0;
    return `${hourValue.toString().padStart(2, '0')}:00`;
  };

  // eslint-disable-next-line no-unused-vars
  const renderRequestStatusLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    name,
    value
  }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.45;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    const formattedPercent = (percent * 100).toFixed(0);

    const isDarkTheme = theme === 'dark';
    const textColor = isDarkTheme ? '#0f172a' : '#f8fafc';
    const bgColor = isDarkTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)';
    const borderColor = isDarkTheme ? 'rgba(148, 163, 184, 0.55)' : 'rgba(226, 232, 240, 0.55)';
    const offsetX = x > cx ? 14 : -14;
    const labelText = `${name}: ${value} (${formattedPercent}%)`;
    const textWidth = Math.max(150, labelText.length * 7);

    const rectX = -(textWidth / 2);
    const rectY = -18;
    const rectHeight = 36;

    return (
      <g transform={`translate(${x + offsetX}, ${y})`}>
        <rect
          x={rectX}
          y={rectY}
          width={textWidth}
          height={rectHeight}
          rx={10}
          ry={10}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth={1}
          opacity={0.98}
        />
        <text
          x={0}
          y={0}
          fill={textColor}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.02em' }}
        >
          {labelText}
        </text>
      </g>
    );
  };

  useEffect(() => {
    fetchAllData();

    const interval = setInterval(fetchAllData, 60000); // Refresh every minute
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Beds synced event (when ward capacity changes)
    socket.on('beds-synced', () => {
      fetchStats();
      fetchHistory();
    });

    return () => {
      socket.off('bed-updated');
      socket.off('bed-created');
      socket.off('new-bed-request');
      socket.off('bed-request-approved');
      socket.off('bed-request-denied');
      socket.off('bed-request-fulfilled');
      socket.off('bed-request-cancelled');
      socket.off('patient-admitted');
      socket.off('patient-discharged');
      socket.off('settings-updated');
      socket.off('beds-synced');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const fetchAllData = async () => {
    // setLoading(true);
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
    }
    // finally {
    //   setLoading(false);
    // }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/beds/stats`);
      console.log('Stats fetched successfully:', response.data);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchHistory = async () => {
    try {
      const effectivePeriod = period;
      const response = await axios.get(`${API_URL}/beds/history?period=${effectivePeriod}`);
      if (effectivePeriod !== period) {
        return;
      }

      const historyData = response.data;
      console.log('History fetched successfully:', historyData.length, 'records');
      setHistory(historyData);

      if (effectivePeriod === 'today') {
        const todayRecord = findHistoryRecordForDate(historyData, new Date());

        if (hasHourlyData(todayRecord)) {
          setTodayHourlySource({
            record: todayRecord,
            isFallback: false,
            fallbackDate: todayRecord?.timestamp || null
          });
        } else {
          let fallbackRecord = findLatestHourlyRecord(historyData);

          if (!fallbackRecord) {
            try {
              const fallbackResponse = await axios.get(`${API_URL}/beds/history?period=7d`);
              if (effectivePeriod !== period) {
                return;
              }
              fallbackRecord = findLatestHourlyRecord(fallbackResponse.data);
            } catch (fallbackError) {
              console.error('Error fetching fallback history:', fallbackError);
            }
          }

          if (fallbackRecord) {
            const isSameRecord = todayRecord && fallbackRecord && (
              (todayRecord._id && fallbackRecord._id && todayRecord._id === fallbackRecord._id) ||
              (todayRecord.timestamp && fallbackRecord.timestamp && todayRecord.timestamp === fallbackRecord.timestamp)
            );
            const isFallback = !isSameRecord;
            setTodayHourlySource({
              record: fallbackRecord,
              isFallback,
              fallbackDate: fallbackRecord?.timestamp || null
            });
          } else {
            setTodayHourlySource(null);
          }
        }
      } else {
        setTodayHourlySource(null);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      console.error('Error details:', error.response?.data);
      setTodayHourlySource(null);
    }
  };

  const fetchBedRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests`);
      console.log('Bed requests fetched successfully:', response.data.length, 'requests');
      setBedRequests(response.data);
    } catch (error) {
      console.error('Error fetching bed requests:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchRequestStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/bed-requests/stats`);
      console.log('Request stats fetched successfully:', response.data);
      setRequestStats(response.data);
    } catch (error) {
      console.error('Error fetching request stats:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchSettings = async () => {
    try {
      console.log('Fetching settings from:', `${API_URL}/settings`);
      const response = await axios.get(`${API_URL}/settings`);
      console.log('Settings fetched successfully:', response.data);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Full error:', error);
    }
  };

  const handleUpdateSettings = async () => {
    if (!settings) return;

    setSettingsSaving(true);
    try {
      const response = await axios.put(`${API_URL}/settings`, settings);
      setSettings(response.data.settings);

      // Show bed sync results if any
      let message = 'Settings updated successfully!';
      const bedResults = response.data.bedSyncResults;
      if (bedResults && Object.keys(bedResults).length > 0) {
        const changes = Object.entries(bedResults)
          .filter(([_, result]) => result.added > 0 || result.removed > 0)
          .map(([ward, result]) => {
            const parts = [];
            if (result.added > 0) parts.push(`+${result.added} added`);
            if (result.removed > 0) parts.push(`-${result.removed} removed`);
            return `${ward}: ${parts.join(', ')}`;
          });
        if (changes.length > 0) {
          message += `\n\nBed changes:\n${changes.join('\n')}`;
        }
      }

      alert(message);
      // Refresh stats after bed changes
      fetchStats();
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

  // Seed data import handlers
  const fetchDbStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/seed/status`);
      setDbStatus(response.data.currentCounts);
    } catch (error) {
      console.error('Error fetching DB status:', error);
    }
  };

  const handleSeedFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSeedFile(file);
    setSeedValidation(null);
    setSeedImportResult(null);

    try {
      const text = await file.text();
      const seedData = JSON.parse(text);

      // Validate the seed data
      const response = await axios.post(`${API_URL}/seed/validate`, seedData);
      setSeedValidation(response.data);

      // Also fetch current DB status
      await fetchDbStatus();
    } catch (error) {
      if (error instanceof SyntaxError) {
        setSeedValidation({
          isValid: false,
          errors: ['Invalid JSON format in file'],
          warnings: [],
          summary: {}
        });
      } else {
        setSeedValidation({
          isValid: false,
          errors: [error.response?.data?.error || error.message],
          warnings: [],
          summary: {}
        });
      }
    }
  };

  const handleSeedImport = async () => {
    if (!seedFile || !seedValidation?.isValid) return;

    const confirmMsg = `This will import data into the database (merge mode - duplicates will be skipped).\n\nSummary:\n- Beds: ${seedValidation.summary.beds || 0}\n- Patients: ${seedValidation.summary.patients || 0}\n- Occupancy History: ${seedValidation.summary.occupancyHistory || 0} days\n\nContinue?`;

    if (!window.confirm(confirmMsg)) return;

    setSeedImporting(true);
    setSeedImportResult(null);

    try {
      const text = await seedFile.text();
      const seedData = JSON.parse(text);

      const response = await axios.post(`${API_URL}/seed/import`, seedData);
      setSeedImportResult(response.data);

      // Refresh all data after import
      await fetchAllData();
      await fetchDbStatus();

      alert('Seed data imported successfully!');
    } catch (error) {
      console.error('Seed import error:', error);
      setSeedImportResult({
        success: false,
        error: error.response?.data?.error || 'Import failed',
        details: error.response?.data?.details || error.message
      });
    } finally {
      setSeedImporting(false);
    }
  };

  const clearSeedSelection = () => {
    setSeedFile(null);
    setSeedValidation(null);
    setSeedImportResult(null);
    // Reset file input
    const fileInput = document.getElementById('seed-file-input');
    if (fileInput) fileInput.value = '';
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

  const calculateWardForecasts = () => {
    if ((!history || history.length === 0) && !stats) return null;

    const wards = ['Emergency', 'ICU', 'General Ward', 'Cardiology'];
    const recent = history.slice(-6);
    const wardForecasts = [];

    for (const ward of wards) {
      // Calculate trend for this ward
      let wardOccupancies = recent
        .map(h => {
          if (h.wardStats && Array.isArray(h.wardStats)) {
            const wardData = h.wardStats.find(w => w.ward === ward);
            return wardData ? parseFloat(wardData.occupancyRate) : null;
          }
          return null;
        })
        .filter(v => v !== null);

      const currentWardStat = stats?.wardStats?.find(w => w._id === ward);
      const currentOccupancy = currentWardStat && currentWardStat.total > 0
        ? parseFloat(((currentWardStat.occupied / currentWardStat.total) * 100).toFixed(1))
        : wardOccupancies.length > 0
          ? parseFloat(wardOccupancies[wardOccupancies.length - 1].toFixed(1))
          : null;

      if (wardOccupancies.length === 0 && currentOccupancy !== null) {
        wardOccupancies = [currentOccupancy];
      } else if (wardOccupancies.length > 0 && currentOccupancy !== null) {
        const lastValue = wardOccupancies[wardOccupancies.length - 1];
        if (Math.abs(lastValue - currentOccupancy) > 0.1) {
          wardOccupancies = [...wardOccupancies, currentOccupancy];
        }
      }

      if (wardOccupancies.length === 0) continue;

      const avgOccupancy = wardOccupancies.reduce((sum, v) => sum + v, 0) / wardOccupancies.length;
      let trend = 0;
      let trendType = 'stable';

      if (wardOccupancies.length >= 2) {
        trend = wardOccupancies[wardOccupancies.length - 1] - wardOccupancies[0];
        trendType = trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable';
      }

      // Get current occupancy from stats
      const currentValue = currentOccupancy !== null
        ? currentOccupancy
        : parseFloat(avgOccupancy.toFixed(1));

      // Calculate projection
      let projectedOccupancy;
      if (trendType === 'increasing') {
        projectedOccupancy = Math.min(100, currentValue + Math.abs(trend));
      } else if (trendType === 'decreasing') {
        projectedOccupancy = Math.max(0, currentValue - Math.abs(trend));
      } else {
        projectedOccupancy = currentValue;
      }

      wardForecasts.push({
        ward,
        current: parseFloat(currentValue.toFixed(1)),
        projected: parseFloat(projectedOccupancy.toFixed(1)),
        trend: trendType,
        trendValue: Math.abs(trend).toFixed(1)
      });
    }

    return wardForecasts;
  };

  // Generate intelligent bed allocation suggestions
  const generateAllocationSuggestions = (wardForecasts) => {
    if (!wardForecasts || wardForecasts.length === 0) return [];

    const suggestions = [];
    const criticalWards = wardForecasts.filter(w => w.projected > 90);
    const highWards = wardForecasts.filter(w => w.projected > 80 && w.projected <= 90);
    const lowWards = wardForecasts.filter(w => w.projected < 60);

    // Suggestion for wards with >90% projected occupancy (CRITICAL)
    criticalWards.forEach(criticalWard => {
      if (lowWards.length > 0) {
        // Find the lowest occupancy ward to suggest as source
        const sourceWard = lowWards.reduce((lowest, ward) =>
          ward.projected < lowest.projected ? ward : lowest
        );
        suggestions.push({
          type: 'critical',
          targetWard: criticalWard.ward,
          sourceWard: sourceWard.ward,
          message: `${criticalWard.ward} is projected at ${criticalWard.projected}% (critical). Consider allocating beds from ${sourceWard.ward} (${sourceWard.projected}%).`
        });
      } else {
        suggestions.push({
          type: 'critical',
          targetWard: criticalWard.ward,
          message: `${criticalWard.ward} is projected at ${criticalWard.projected}% (critical). No wards with low occupancy available for reallocation.`
        });
      }
    });

    // Suggestion for wards with 80-90% projected occupancy (HIGH)
    highWards.forEach(highWard => {
      if (lowWards.length > 0) {
        // Find the lowest occupancy ward to suggest as source
        const sourceWard = lowWards.reduce((lowest, ward) =>
          ward.projected < lowest.projected ? ward : lowest
        );
        suggestions.push({
          type: 'warning',
          targetWard: highWard.ward,
          sourceWard: sourceWard.ward,
          message: `${highWard.ward} is projected at ${highWard.projected}% (high). Consider allocating beds from ${sourceWard.ward} (${sourceWard.projected}%) to prevent reaching critical levels.`
        });
      }
    });

    // Suggestion for wards with <60% projected occupancy (LOW - Opportunity)
    lowWards.forEach(lowWard => {
      const needyWards = [...criticalWards, ...highWards];
      if (needyWards.length > 0) {
        const targetWards = needyWards
          .sort((a, b) => b.projected - a.projected) // Sort by highest occupancy first
          .map(w => `${w.ward} (${w.projected}%)`)
          .join(', ');
        suggestions.push({
          type: 'opportunity',
          sourceWard: lowWard.ward,
          targetWards: needyWards.map(w => w.ward),
          message: `${lowWard.ward} is projected at ${lowWard.projected}%. Beds can be temporarily allocated to: ${targetWards}.`
        });
      }
    });

    return suggestions;
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

  // Filter bed requests based on selected period and ward
  const getFilteredBedRequests = () => {
    if (!bedRequests || bedRequests.length === 0) return [];

    const now = new Date();
    let startDate = new Date();

    if (requestsPeriod === 'today') {
      startDate.setHours(0, 0, 0, 0); // Start of today
    } else if (requestsPeriod === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (requestsPeriod === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    }

    return bedRequests.filter(request => {
      const createdAt = new Date(request.createdAt);
      const matchesPeriod = createdAt >= startDate && createdAt <= now;
      const matchesWard = selectedWard === 'All' || request.preferredWard === selectedWard;
      return matchesPeriod && matchesWard;
    });
  };

  // Calculate stats for filtered bed requests
  const getFilteredRequestStats = () => {
    const filtered = getFilteredBedRequests();

    if (filtered.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        denied: 0,
        fulfilled: 0,
        cancelled: 0,
        triageStats: []
      };
    }

    const stats = {
      total: filtered.length,
      pending: filtered.filter(r => r.status === 'pending').length,
      approved: filtered.filter(r => r.status === 'approved').length,
      denied: filtered.filter(r => r.status === 'denied').length,
      fulfilled: filtered.filter(r => r.status === 'fulfilled').length,
      cancelled: filtered.filter(r => r.status === 'cancelled').length,
      triageStats: []
    };

    // Calculate triage stats
    const triageCounts = {};
    filtered.forEach(request => {
      const triage = request.patientDetails.triageLevel;
      triageCounts[triage] = (triageCounts[triage] || 0) + 1;
    });

    stats.triageStats = Object.entries(triageCounts).map(([level, count]) => ({
      _id: level,
      count
    }));

    return stats;
  };

  const filteredBedRequests = getFilteredBedRequests();
  const filteredRequestStats = getFilteredRequestStats();

  // Debug logging
  console.log('AdminDashboard render:', {
    activeTab,
    stats,
    filteredStats,
    history: history.length,
    bedRequests: bedRequests.length,
    filteredBedRequests: filteredBedRequests.length,
    requestsPeriod,
    settings
  });

  const exportReport = async (format = 'json') => {
    try {
      // Use default report period from settings, not the current UI period
      const reportPeriod = settings?.reporting?.defaultPeriod || period;

      // Fetch history data for the report period
      let reportHistory = history;
      if (reportPeriod !== period) {
        try {
          const response = await axios.get(`${API_URL}/beds/history?period=${reportPeriod}`);
          reportHistory = response.data;
        } catch (error) {
          console.error('Error fetching history for report:', error);
        }
      }

      const reportData = {
        generatedAt: new Date().toISOString(),
        generatedBy: currentUser.name,
        period: reportPeriod,
        stats: stats,
        history: reportHistory,
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
                page-break-before: always;
              }
              h2:first-of-type {
                page-break-before: auto;
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
              <p><strong>Period:</strong> ${reportPeriod === '1' || reportPeriod === 'today' ? 'Today' : reportPeriod === '7' || reportPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'}</p>
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

            ${reportPeriod === '1' || reportPeriod === 'today' ? (() => {
              // Get today's history record with hourly data
              const todayRecord = reportHistory.find(h => {
                const recordDate = new Date(h.timestamp);
                const today = new Date();
                return recordDate.toDateString() === today.toDateString();
              });

              if (!todayRecord || !todayRecord.hourlyData || todayRecord.hourlyData.length === 0) {
                return '';
              }

              return `
                <h2>Today's Hourly Occupancy</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Hour</th>
                      <th>Average Occupancy Rate</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${todayRecord.hourlyData.map(hourData => {
                      const hour = new Date(hourData.timestamp).getHours();
                      const occupancy = parseFloat(hourData.occupancyRate);
                      const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
                      const statusColor = occupancy >= 90 ? '#ef4444' : occupancy >= 80 ? '#f59e0b' : '#10b981';
                      return `
                        <tr>
                          <td>${hour.toString().padStart(2, '0')}:00</td>
                          <td>${occupancy.toFixed(1)}%</td>
                          <td style="color: ${statusColor}; font-weight: 600;">${status}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
                <p style="margin-top: 15px; font-size: 13px; color: #64748b;">
                  <strong>Note:</strong> This report shows hourly occupancy data. To view the line chart, please use the Analytics & Trends tab in the application.
                </p>
              `;
            })() : `
              <h2>Daily Average Occupancy (${reportPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'})</h2>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Average Occupancy Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportHistory
                    .slice(reportPeriod === '7d' ? -7 : -30)
                    .reverse()
                    .map(record => {
                      const occupancy = parseFloat(record.occupancyRate);
                      const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
                      const statusColor = occupancy >= 90 ? '#ef4444' : occupancy >= 80 ? '#f59e0b' : '#10b981';
                      return `
                        <tr>
                          <td>${new Date(record.timestamp).toLocaleDateString()}</td>
                          <td>${occupancy.toFixed(1)}%</td>
                          <td style="color: ${statusColor}; font-weight: 600;">${status}</td>
                        </tr>
                      `;
                    }).join('')}
                </tbody>
              </table>
              <p style="margin-top: 15px; font-size: 13px; color: #64748b;">
                <strong>Note:</strong> This report shows daily occupancy data. To view the line chart, please use the Analytics & Trends tab in the application.
              </p>
            `}

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
        let csv = '"Overall Statistics"\n';
        csv += 'Metric,Value\n';
        csv += `Total Beds,${stats.totalBeds}\n`;
        csv += `Occupied,${stats.occupied}\n`;
        csv += `Available,${stats.available}\n`;
        csv += `Cleaning,${stats.cleaning}\n`;
        csv += `Reserved,${stats.reserved}\n`;
        csv += `Occupancy Rate,${stats.occupancyRate}%\n\n`;

        csv += '"Ward Statistics"\n';
        csv += 'Ward,Total,Occupied,Available,Cleaning\n';
        stats.wardStats.forEach(ward => {
          csv += `${ward._id},${ward.total},${ward.occupied},${ward.available},${ward.cleaning}\n`;
        });

        // Add occupancy data based on report period
        csv += '\n';
        if (reportPeriod === 'today') {
          // Get today's history record with hourly data
          const todayRecord = reportHistory.find(h => {
            const recordDate = new Date(h.timestamp);
            const today = new Date();
            return recordDate.toDateString() === today.toDateString();
          });

          if (todayRecord && todayRecord.hourlyData && todayRecord.hourlyData.length > 0) {
            csv += '"Today\'s Hourly Occupancy"\n';
            csv += 'Hour,Average Occupancy Rate,Status\n';
            todayRecord.hourlyData.forEach(hourData => {
              const hourLabel = getHourLabel(hourData);
              const occupancy = parseFloat(hourData.occupancyRate);
              const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
              csv += `${hourLabel},${occupancy.toFixed(1)}%,${status}\n`;
            });
          }
        } else {
          csv += `"Daily Average Occupancy (${reportPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'})"\n`;
          csv += 'Date,Average Occupancy Rate,Status\n';
          reportHistory
            .slice(reportPeriod === '7d' ? -7 : -30)
            .reverse()
            .forEach(record => {
              const occupancy = parseFloat(record.occupancyRate);
              const status = occupancy >= 90 ? 'Critical' : occupancy >= 80 ? 'Warning' : 'Normal';
              csv += `${new Date(record.timestamp).toLocaleDateString()},${occupancy.toFixed(1)}%,${status}\n`;
            });
        }

        csv += '\n"Note: To view the line chart, please use the Analytics & Trends tab in the application."\n';

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

  // eslint-disable-next-line no-unused-vars
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
        {activeTab !== 'settings' && (
          <ResizableCard
            title="Ward Filter"
            minWidth={300}
            minHeight={80}
          >
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
          </ResizableCard>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="overview-content">
            {filteredStats ? (
              <ResizableCard
                title="Statistics Overview"
                minWidth={400}
                minHeight={200}
              >
                <Dashboard stats={filteredStats} />
              </ResizableCard>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading statistics...</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-quiet)', marginTop: '1rem' }}>
                  If this message persists, check the browser console for errors.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="analytics-content">
            {!stats && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading analytics data...</p>
              </div>
            )}
            <div className="period-selector">
              <h3>Analysis</h3>
              <div className="period-buttons">
                <button
                  className={`period-btn ${period === 'today' ? 'active' : ''}`}
                  onClick={() => setPeriod('today')}
                >
                  Today
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

            {/* Today View - Ward Forecasts and Suggestions */}
            {period === 'today' && (
              <div className="forecast-info">
                {(() => {
                  const wardForecasts = calculateWardForecasts();
                  if (!wardForecasts || wardForecasts.length === 0) return null;

                  // Filter forecasts based on selected ward
                  const displayForecasts = selectedWard === 'All'
                    ? wardForecasts
                    : wardForecasts.filter(f => f.ward === selectedWard);

                  const allocationSuggestions = generateAllocationSuggestions(wardForecasts);
                  const filteredAllocationSuggestions = allocationSuggestions.filter(suggestion =>
                    selectedWard === 'All' ||
                    suggestion.targetWard === selectedWard ||
                    suggestion.sourceWard === selectedWard ||
                    (suggestion.targetWards && suggestion.targetWards.includes(selectedWard))
                  );

                  let suggestionsToRender = filteredAllocationSuggestions;

                  if (suggestionsToRender.length === 0) {
                    const relevantForecasts = selectedWard === 'All'
                      ? wardForecasts
                      : wardForecasts.filter(f => f.ward === selectedWard);

                    if (relevantForecasts.length > 0) {
                      suggestionsToRender = [{
                        type: 'opportunity',
                        targetWard: selectedWard === 'All' ? 'All' : selectedWard,
                        message: `No urgent reallocations detected. Continue monitoring${selectedWard === 'All' ? ' overall capacity' : ` ${selectedWard} ward`} and keep contingency plans ready.`
                      }];
                    } else {
                      suggestionsToRender = [{
                        type: 'opportunity',
                        targetWard: selectedWard === 'All' ? 'All' : selectedWard,
                        message: 'Insufficient recent data to calculate suggestions. Please ensure occupancy history is available.'
                      }];
                    }
                  }

                  return (
                    <>
                      {/* Ward-wise Forecast Cards */}
                      <div className="forecasting-section">
                        <h3>Capacity Forecast {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                        <div className="forecast-cards-grid">
                          {displayForecasts.map(forecast => (
                            <div key={forecast.ward} className="forecast-card">
                              <h4>{selectedWard === 'All' ? forecast.ward : 'Next 24 Hours Projection'}</h4>
                              <div className="forecast-values">
                                <div className="forecast-value">
                                  <span className="forecast-label">Current:</span>
                                  <span className="forecast-number">{forecast.current}%</span>
                                </div>
                                <div className="forecast-value">
                                  <span className="forecast-label">Projected:</span>
                                  <span className={`forecast-number ${
                                    forecast.projected > 90 ? 'critical' :
                                    forecast.projected > 80 ? 'warning' :
                                    forecast.projected < 60 ? 'low' : ''
                                  }`}>
                                    {forecast.projected}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Allocation Suggestions */}
                        {suggestionsToRender.length > 0 && (
                          <div className="allocation-suggestions">
                            <div className="allocation-suggestions-header">
                              <div className="header-icon">💡</div>
                              <h4>Intelligent Bed Allocation Suggestions</h4>
                              <span className="suggestions-count">{suggestionsToRender.length} Recommendations</span>
                            </div>
                            {suggestionsToRender.map((suggestion, idx) => (
                              <div key={idx} className={`suggestion-card suggestion-${suggestion.type}`}>
                                <div className="suggestion-icon-wrapper">
                                  <div className={`suggestion-icon suggestion-icon-${suggestion.type}`}>
                                    {suggestion.type === 'critical' ? (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    ) : suggestion.type === 'warning' ? (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    ) : (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <line x1="12" y1="16" x2="12" y2="12"/>
                                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                                      </svg>
                                    )}
                                  </div>
                                  <span className={`priority-badge priority-${suggestion.type}`}>
                                    {suggestion.type === 'critical' ? 'High Priority' : suggestion.type === 'warning' ? 'Medium Priority' : 'Low Priority'}
                                  </span>
                                </div>
                                <div className="suggestion-content">
                                  <p className="suggestion-message">{suggestion.message}</p>
                                  <div className="suggestion-meta">
                                    <span className="suggestion-action">
                                      {suggestion.type === 'critical' ? '🔴 Action Required' : suggestion.type === 'warning' ? '🟠 Action Recommended' : '🔵 Consider Action'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Hourly Occupancy Graph for Today */}
            {period === 'today' && (() => {
              const hourlyRecord = todayHourlySource?.record;

              if (!hourlyRecord || !hasHourlyData(hourlyRecord)) {
                return (
                  <div className="daily-occupancy-section">
                    <div className="chart-header">
                      <h3>Today's Hourly Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                    </div>
                    <p style={{ marginTop: '0.5rem', color: 'var(--text-quiet)' }}>
                      Hourly occupancy measurements aren't available yet. Data will appear here once the system collects the first hourly samples for today.
                    </p>
                  </div>
                );
              }

              const hourlyChartData = hourlyRecord.hourlyData.map(hourData => {
                const hourLabel = getHourLabel(hourData);
                let avgOccupancy = parseFloat(hourData.occupancyRate);
                let maxOccupancy = avgOccupancy;

                if (selectedWard !== 'All' && hourData.wardStats && Array.isArray(hourData.wardStats)) {
                  const wardData = hourData.wardStats.find(w => w.ward === selectedWard);
                  if (wardData) {
                    avgOccupancy = parseFloat(wardData.occupancyRate);
                    maxOccupancy = avgOccupancy;
                  }
                } else if (hourData.wardStats && Array.isArray(hourData.wardStats)) {
                  const wardOccupancies = hourData.wardStats.map(w => parseFloat(w.occupancyRate));
                  maxOccupancy = Math.max(...wardOccupancies, avgOccupancy);
                }

                return {
                  hour: hourLabel,
                  avgOccupancy: parseFloat(avgOccupancy.toFixed(1)),
                  maxOccupancy: parseFloat(maxOccupancy.toFixed(1))
                };
              });

              const fallbackNote = todayHourlySource?.isFallback
                ? `Showing the latest hourly data from ${todayHourlySource.fallbackDate ? formatDate(todayHourlySource.fallbackDate) : 'previous records'} while today’s readings are generated.`
                : null;

              return (
                <div className="daily-occupancy-section">
                  <div className="chart-header">
                    <h3>Today's Hourly Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                    <div className="chart-options">
                      <label className="chart-option-toggle">
                        <input
                          type="checkbox"
                          checked={showMaxOccupancy}
                          onChange={(e) => setShowMaxOccupancy(e.target.checked)}
                        />
                        <span>Show Max Occupancy</span>
                      </label>
                    </div>
                  </div>

                  {fallbackNote && (
                    <div
                      style={{
                        marginBottom: '0.75rem',
                        padding: '0.65rem 0.9rem',
                        borderRadius: '0.75rem',
                        background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                        border: theme === 'dark' ? '1px solid rgba(148,163,184,0.25)' : '1px solid rgba(15,23,42,0.08)',
                        color: 'var(--text-quiet)'
                      }}
                    >
                      {fallbackNote}
                    </div>
                  )}

                  <div className="chart-legend-custom">
                    <div className="legend-item">
                      <span className="legend-color" style={{ backgroundColor: '#0284c7' }}></span>
                      <span>Average Occupancy</span>
                    </div>
                    {showMaxOccupancy && (
                      <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                        <span>Max Occupancy</span>
                      </div>
                    )}
                    <div className="legend-item">
                      <span className="legend-line" style={{ backgroundColor: '#ef4444' }}></span>
                      <span>Critical Threshold ({settings?.thresholds?.criticalThreshold || 90}%)</span>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={hourlyChartData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                      <XAxis
                        dataKey="hour"
                        stroke="var(--text-quiet)"
                        tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="var(--text-quiet)"
                        tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
                        domain={[0, 100]}
                        label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', fill: 'var(--text-quiet)' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                          borderRadius: '10px',
                          padding: '8px 12px'
                        }}
                        labelStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                        formatter={(value, name) => [
                          `${value}%`,
                          name === 'avgOccupancy' ? 'Average' : 'Max'
                        ]}
                      />
                      <ReferenceLine
                        y={settings?.thresholds?.criticalThreshold || 90}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="8 4"
                        label={{
                          value: `Critical: ${settings?.thresholds?.criticalThreshold || 90}%`,
                          position: 'right',
                          fill: '#ef4444',
                          fontSize: 11,
                          fontWeight: 500
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgOccupancy"
                        name="avgOccupancy"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={{ fill: '#0284c7', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      {showMaxOccupancy && (
                        <Line
                          type="monotone"
                          dataKey="maxOccupancy"
                          name="maxOccupancy"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          dot={{ fill: '#f59e0b', r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Daily Average Percentage Occupancy Graph */}
            {period !== 'today' && (
              <div className="daily-occupancy-section">
                <div className="chart-header">
                  <h3>Daily Average Percentage Occupancy {selectedWard !== 'All' && `- ${selectedWard}`}</h3>
                  <div className="chart-options">
                    <label className="chart-option-toggle">
                      <input
                        type="checkbox"
                        checked={showMaxOccupancy}
                        onChange={(e) => setShowMaxOccupancy(e.target.checked)}
                      />
                      <span>Show Max Occupancy</span>
                    </label>
                  </div>
                </div>

                <div className="chart-legend-custom">
                  <div className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: '#0284c7' }}></span>
                    <span>Average Occupancy</span>
                  </div>
                  {showMaxOccupancy && (
                    <div className="legend-item">
                      <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                      <span>Max Occupancy</span>
                    </div>
                  )}
                  <div className="legend-item">
                    <span className="legend-line" style={{ backgroundColor: '#ef4444' }}></span>
                    <span>Critical Threshold ({settings?.thresholds?.criticalThreshold || 90}%)</span>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={history
                      .filter((h, index) => {
                        if (period === '7d') return index < 7;
                        if (period === '30d') return index < 30;
                        return true;
                      })
                      .map(h => {
                        let avgOccupancy = parseFloat(h.occupancyRate);
                        let maxOccupancy = avgOccupancy;

                        // If a specific ward is selected, get that ward's occupancy rate
                        if (selectedWard !== 'All' && h.wardStats && Array.isArray(h.wardStats)) {
                          const wardData = h.wardStats.find(w => w.ward === selectedWard);
                          if (wardData) {
                            avgOccupancy = parseFloat(wardData.occupancyRate);
                            maxOccupancy = avgOccupancy;
                          }
                        } else if (h.wardStats && Array.isArray(h.wardStats)) {
                          // Calculate max from all wards
                          const wardOccupancies = h.wardStats.map(w => parseFloat(w.occupancyRate));
                          maxOccupancy = Math.max(...wardOccupancies, avgOccupancy);
                        }

                        // Add some variance for max (simulating peak times) if not already higher
                        if (maxOccupancy <= avgOccupancy) {
                          maxOccupancy = Math.min(100, avgOccupancy + Math.random() * 10 + 5);
                        }

                        return {
                          date: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          avgOccupancy: avgOccupancy,
                          maxOccupancy: parseFloat(maxOccupancy.toFixed(1))
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
                      label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', fill: 'var(--text-quiet)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                        border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                        borderRadius: '10px',
                        padding: '8px 12px'
                      }}
                      labelStyle={{
                        color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                      }}
                      itemStyle={{
                        color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                      }}
                      formatter={(value, name) => [
                        `${value}%`,
                        name === 'avgOccupancy' ? 'Average' : 'Max'
                      ]}
                    />
                    {/* Critical Threshold Reference Line */}
                    <ReferenceLine
                      y={settings?.thresholds?.criticalThreshold || 90}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      label={{
                        value: `Critical: ${settings?.thresholds?.criticalThreshold || 90}%`,
                        position: 'right',
                        fill: '#ef4444',
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    />
                    {/* Average Occupancy Line */}
                    <Line
                      type="monotone"
                      dataKey="avgOccupancy"
                      name="avgOccupancy"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ fill: '#0284c7', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    {/* Max Occupancy Line (conditional) */}
                    {showMaxOccupancy && (
                      <Line
                        type="monotone"
                        dataKey="maxOccupancy"
                        name="maxOccupancy"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: '#f59e0b', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {history.length > 0 && period !== 'today' && (
              <div className="history-table-section">
                <h3>
                  Daily Occupancy History
                  ({period === '7d' ? 'Last 7 Days' : 'Last 30 Days'})
                  {selectedWard !== 'All' && ` - ${selectedWard}`}
                </h3>
                <div className="history-table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Average hourly-occupancy rate</th>
                        <th>Max Hourly-Occupancy Rate of the Day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history
                        .slice(period === '7d' ? -7 : period === '30d' ? -30 : -1)
                        .reverse()
                        .map((record, idx) => {
                        // Calculate average and max occupancy rates from hourly data
                        let avgOccupancyRate = record.occupancyRate;
                        let maxOccupancyRate = record.occupancyRate;

                        if (record.hourlyData && Array.isArray(record.hourlyData) && record.hourlyData.length > 0) {
                          if (selectedWard !== 'All') {
                            // For a specific ward, calculate from hourly ward-specific data
                            const wardHourlyRates = [];
                            record.hourlyData.forEach(hourData => {
                              if (hourData.wardStats && Array.isArray(hourData.wardStats)) {
                                const wardData = hourData.wardStats.find(w => w.ward === selectedWard);
                                if (wardData) {
                                  wardHourlyRates.push(parseFloat(wardData.occupancyRate));
                                }
                              }
                            });

                            if (wardHourlyRates.length > 0) {
                              avgOccupancyRate = parseFloat((wardHourlyRates.reduce((sum, rate) => sum + rate, 0) / wardHourlyRates.length).toFixed(1));
                              maxOccupancyRate = parseFloat(Math.max(...wardHourlyRates).toFixed(1));
                            }
                          } else {
                            // For all wards, calculate from overall hourly data
                            const hourlyRates = record.hourlyData.map(h => parseFloat(h.occupancyRate));
                            avgOccupancyRate = parseFloat((hourlyRates.reduce((sum, rate) => sum + rate, 0) / hourlyRates.length).toFixed(1));
                            maxOccupancyRate = parseFloat(Math.max(...hourlyRates).toFixed(1));
                          }
                        } else {
                          // Fallback to old calculation if no hourly data
                          if (selectedWard !== 'All' && record.wardStats && Array.isArray(record.wardStats)) {
                            const wardData = record.wardStats.find(w => w.ward === selectedWard);
                            if (wardData) {
                              avgOccupancyRate = wardData.occupancyRate;
                              maxOccupancyRate = wardData.occupancyRate;
                            }
                          } else if (record.wardStats && Array.isArray(record.wardStats)) {
                            const wardOccupancies = record.wardStats.map(w => parseFloat(w.occupancyRate));
                            if (wardOccupancies.length > 0) {
                              maxOccupancyRate = Math.max(...wardOccupancies).toFixed(1);
                            }
                          }
                        }

                        return (
                          <tr key={idx}>
                            <td>{formatDate(record.timestamp)}</td>
                            <td>
                              <span className={`occupancy-cell ${avgOccupancyRate >= 90 ? 'critical' : avgOccupancyRate >= 80 ? 'warning' : 'normal'}`}>
                                {avgOccupancyRate}%
                              </span>
                            </td>
                            <td>
                              <span className={`occupancy-cell ${maxOccupancyRate >= 90 ? 'critical' : maxOccupancyRate >= 80 ? 'warning' : 'normal'}`}>
                                {maxOccupancyRate}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Bed Requests Tab */}
        {activeTab === 'requests' && (
          <div className="requests-analytics-content">
            <ResizableCard
              title="Bed Requests Analytics"
              minWidth={500}
              minHeight={300}
            >
              {/* Period Filter for Bed Requests */}
              <div className="period-selector">
              <h3>Bed Requests</h3>
              <div className="period-buttons">
                <button
                  className={`period-btn ${requestsPeriod === 'today' ? 'active' : ''}`}
                  onClick={() => setRequestsPeriod('today')}
                >
                  Today
                </button>
                <button
                  className={`period-btn ${requestsPeriod === '7d' ? 'active' : ''}`}
                  onClick={() => setRequestsPeriod('7d')}
                >
                  Last 7 Days
                </button>
                <button
                  className={`period-btn ${requestsPeriod === '30d' ? 'active' : ''}`}
                  onClick={() => setRequestsPeriod('30d')}
                >
                  Last 30 Days
                </button>
              </div>
            </div>

            {!requestStats && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading bed requests data...</p>
              </div>
            )}
            {requestStats && (
              <div className="request-stats-summary">
                <div className="stat-card stat-total">
                  <div className="stat-title">Total Requests</div>
                  <div className="stat-value">{filteredRequestStats.total || 0}</div>
                </div>
                <div className="stat-card stat-pending">
                  <div className="stat-title">Pending</div>
                  <div className="stat-value">{filteredRequestStats.pending || 0}</div>
                </div>
                <div className="stat-card stat-approved">
                  <div className="stat-title">Approved</div>
                  <div className="stat-value">{filteredRequestStats.approved || 0}</div>
                </div>
                <div className="stat-card stat-denied">
                  <div className="stat-title">Denied</div>
                  <div className="stat-value">{filteredRequestStats.denied || 0}</div>
                </div>
              </div>
            )}

            {/* Pie Chart for Request Statuses */}
            {requestStats && (
              <div className="request-status-pie-chart-section">
                <h3>Request Status Distribution</h3>
                {filteredRequestStats.total > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Pending', value: filteredRequestStats.pending || 0, color: '#f59e0b' },
                          { name: 'Approved', value: filteredRequestStats.approved || 0, color: '#10b981' },
                          { name: 'Denied', value: filteredRequestStats.denied || 0, color: '#ef4444' }
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
                          { name: 'Pending', value: filteredRequestStats.pending || 0, color: '#f59e0b' },
                          { name: 'Approved', value: filteredRequestStats.approved || 0, color: '#10b981' },
                          { name: 'Denied', value: filteredRequestStats.denied || 0, color: '#ef4444' }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#475569' : '#e2e8f0'}`,
                          borderRadius: '10px',
                          padding: '8px 12px'
                        }}
                        labelStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{
                          color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <p>No bed requests found for the selected period.</p>
                  </div>
                )}
              </div>
            )}

            {filteredBedRequests.length === 0 && requestStats && filteredRequestStats.total > 0 && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>No bed requests found for the selected period.</p>
              </div>
            )}

            {filteredBedRequests.length > 0 && (
              <div className="recent-requests">
                <h3>
                  Bed Requests
                  ({requestsPeriod === 'today' ? 'Today' : requestsPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'})
                  {selectedWard !== 'All' && ` - ${selectedWard}`}
                </h3>
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
                      {filteredBedRequests
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

            {filteredRequestStats.triageStats && filteredRequestStats.triageStats.length > 0 && (
              <div className="triage-breakdown">
                <h3>Requests by Triage Level</h3>
                <div className="triage-stats-grid">
                  {filteredRequestStats.triageStats.map((triage) => (
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
            </ResizableCard>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="settings-content">
            {!settings ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>Loading settings...</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-quiet)', marginTop: '1rem' }}>
                  If this message persists, check the browser console for errors.
                </p>
              </div>
            ) : (
            <ResizableCard
              title="System Configuration"
              minWidth={500}
              minHeight={300}
            >
              <div className="settings-section">
              <h3>System Configuration</h3>

              <div className="settings-grid">
                <div className="setting-card">
                  <h4>Occupancy Alert Thresholds</h4>
                  <div className="setting-item">
                    <label>Warning Threshold (Yellow)</label>
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
                    <label>Critical Threshold (Red)</label>
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
                  <div className="setting-item setting-item-inline">
                    <label>Default Report Period</label>
                    <div className="setting-input-inline">
                      <select
                        value={settings.reporting?.defaultPeriod || '1'}
                        onChange={(e) => setSettings({
                          ...settings,
                          reporting: {
                            ...settings.reporting,
                            defaultPeriod: e.target.value
                          }
                        })}
                      >
                        {[1, 7, 30].map(option => (
                          <option key={option} value={option.toString()}>{option}</option>
                        ))}
                      </select>
                      <span className="setting-unit setting-unit-inline">Days</span>
                    </div>
                  </div>
                  <div className="setting-item setting-item-inline">
                    <label>Auto-refresh Interval</label>
                    <div className="setting-input-inline">
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
                      <span className="setting-unit setting-unit-inline">seconds</span>
                    </div>
                  </div>
                </div>

                <div className="setting-card">
                  <h4>Ward Bed Capacity</h4>
                  <div className="setting-item">
                    <label>Emergency Ward</label>
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
                    <label>ICU</label>
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
                    <label>General Ward</label>
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
                    <label>Cardiology</label>
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
              </div>

              {/* Seed Data Import Section */}
              <div className="seed-import-section">
                <h3>Import Historical Data</h3>

                <div className="seed-import-container">
                  <div className="seed-file-upload">
                    <label htmlFor="seed-file-input" className="file-upload-label">
                      Select Seed Data File (JSON)
                    </label>
                    <input
                      type="file"
                      id="seed-file-input"
                      accept=".json"
                      onChange={handleSeedFileSelect}
                      className="file-input"
                    />
                    {seedFile && (
                      <div className="selected-file">
                        <span className="file-name">{seedFile.name}</span>
                        <span className="file-size">({(seedFile.size / 1024).toFixed(1)} KB)</span>
                        <button className="btn-clear-file" onClick={clearSeedSelection}>Clear</button>
                      </div>
                    )}
                  </div>

                  {/* Validation Results */}
                  {seedValidation && (
                    <div className={`seed-validation ${seedValidation.isValid ? 'valid' : 'invalid'}`}>
                      <h4>{seedValidation.isValid ? 'File Valid' : 'Validation Failed'}</h4>

                      {seedValidation.errors?.length > 0 && (
                        <div className="validation-errors">
                          <strong>Errors:</strong>
                          <ul>
                            {seedValidation.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {seedValidation.warnings?.length > 0 && (
                        <div className="validation-warnings">
                          <strong>Warnings:</strong>
                          <ul>
                            {seedValidation.warnings.map((warn, idx) => (
                              <li key={idx}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {seedValidation.isValid && seedValidation.summary && (
                        <div className="seed-summary">
                          <h5>Data Summary</h5>
                          <div className="summary-grid">
                            <div className="summary-item">
                              <span className="summary-label">Beds</span>
                              <span className="summary-value">{seedValidation.summary.beds || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Total Patients</span>
                              <span className="summary-value">{seedValidation.summary.patients || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Current Patients</span>
                              <span className="summary-value">{seedValidation.summary.currentPatients || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Discharged</span>
                              <span className="summary-value">{seedValidation.summary.dischargedPatients || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">History Days</span>
                              <span className="summary-value">{seedValidation.summary.occupancyHistory || 0}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Alerts</span>
                              <span className="summary-value">{seedValidation.summary.alerts || 0}</span>
                            </div>
                          </div>

                          {dbStatus && (
                            <div className="current-db-status">
                              <h5>Current Database</h5>
                              <div className="summary-grid">
                                <div className="summary-item">
                                  <span className="summary-label">Beds</span>
                                  <span className="summary-value">{dbStatus.beds}</span>
                                </div>
                                <div className="summary-item">
                                  <span className="summary-label">Patients</span>
                                  <span className="summary-value">{dbStatus.patients}</span>
                                </div>
                                <div className="summary-item">
                                  <span className="summary-label">History Records</span>
                                  <span className="summary-value">{dbStatus.occupancyHistory}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Import Result */}
                  {seedImportResult && (
                    <div className={`seed-import-result ${seedImportResult.success ? 'success' : 'error'}`}>
                      <h4>{seedImportResult.success ? 'Import Successful' : 'Import Failed'}</h4>
                      {seedImportResult.success ? (
                        <>
                          <p>{seedImportResult.message}</p>
                          <div className="import-details">
                            {Object.entries(seedImportResult.results || {}).map(([key, value]) => (
                              <div key={key} className="import-detail-row">
                                <span className="detail-label">{key}:</span>
                                <span className="detail-imported">{value.imported} imported</span>
                                <span className="detail-skipped">{value.skipped} skipped</span>
                                {value.errors > 0 && <span className="detail-errors">{value.errors} errors</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="error-message">{seedImportResult.error}: {seedImportResult.details}</p>
                      )}
                    </div>
                  )}

                  {/* Import Button */}
                  {seedValidation?.isValid && (
                    <button
                      className="btn-import-seed"
                      onClick={handleSeedImport}
                      disabled={seedImporting}
                    >
                      {seedImporting ? 'Importing...' : 'Import Seed Data'}
                    </button>
                  )}
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
            </ResizableCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
