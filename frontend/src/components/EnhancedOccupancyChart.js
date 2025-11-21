import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { predictOccupancy, calculateTrend } from '../utils/predictions';

function EnhancedOccupancyChart({ stats, beds }) {
  const [chartType, setChartType] = useState('pie');
  const [selectedWard, setSelectedWard] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  
  const COLORS = {
    occupied: '#ef4444',
    available: '#10b981',
    cleaning: '#f59e0b',
    reserved: '#6366f1'
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/beds/history?period=24h');
        const data = await response.json();
        setHistoricalData(data);
        if (data.length > 0) {
          const predicted = predictOccupancy(data);
          setPredictions(predicted);
        }
      } catch (error) {
        console.error('Error fetching history:', error);
      }
    };
    
    fetchHistory();
    const interval = setInterval(fetchHistory, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Rest of your component code...
  const pieData = [
    { name: 'Occupied', value: stats.occupied, color: COLORS.occupied },
    { name: 'Available', value: stats.available, color: COLORS.available },
    { name: 'Cleaning', value: stats.cleaning, color: COLORS.cleaning },
    { name: 'Reserved', value: stats.reserved, color: COLORS.reserved },
  ];

  const wardData = stats.wardStats?.map(ward => ({
    name: ward._id,
    occupied: ward.occupied,
    available: ward.available,
    total: ward.total,
    occupancyRate: ((ward.occupied / ward.total) * 100).toFixed(1)
  })) || [];

  const timeSeriesData = [
    { time: '00:00', occupancy: 75 },
    { time: '04:00', occupancy: 72 },
    { time: '08:00', occupancy: 85 },
    { time: '12:00', occupancy: 88 },
    { time: '16:00', occupancy: 92 },
    { time: '20:00', occupancy: stats.occupancyRate },
  ];

  const radarData = wardData.map(ward => ({
    ward: ward.name,
    occupancy: parseFloat(ward.occupancyRate),
    efficiency: Math.random() * 100,
    satisfaction: Math.random() * 100
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="label">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: <strong>{entry.value}</strong>
              {entry.name === 'occupancyRate' && '%'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="enhanced-occupancy-chart">
      <div className="chart-controls">
        <button onClick={() => setChartType('pie')} className={chartType === 'pie' ? 'active' : ''}>
          Pie Chart
        </button>
        <button onClick={() => setChartType('bar')} className={chartType === 'bar' ? 'active' : ''}>
          Bar Chart
        </button>
        <button onClick={() => setChartType('line')} className={chartType === 'line' ? 'active' : ''}>
          Trend
        </button>
        <button onClick={() => setChartType('area')} className={chartType === 'area' ? 'active' : ''}>
          Area Chart
        </button>
        <button onClick={() => setChartType('radar')} className={chartType === 'radar' ? 'active' : ''}>
          Radar
        </button>
      </div>

      {chartType === 'pie' && (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}

      {chartType === 'bar' && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={wardData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="occupied" fill={COLORS.occupied} />
            <Bar dataKey="available" fill={COLORS.available} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chartType === 'line' && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="occupancy" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {chartType === 'area' && (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area type="monotone" dataKey="occupancy" stroke="#8884d8" fill="#8884d8" />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {chartType === 'radar' && wardData.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="ward" />
            <PolarRadiusAxis />
            <Radar name="Occupancy" dataKey="occupancy" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      )}

      <div className="predictions-panel">
        <h3>📊 Predictions & Insights</h3>
        {predictions.length > 0 ? (
          <div className="predictions-list">
            <h4>Next 6 Hours Forecast:</h4>
            <ul>
              {predictions.map((pred, idx) => (
                <li key={idx}>
                  <strong>{pred.time}:</strong> {pred.predicted}% occupancy
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="no-predictions">
            <p>⏳ Collecting data for predictions...</p>
            <p>Predictions will be available after collecting hourly data</p>
          </div>
        )}
        
        <div className="insights">
          <h4>💡 Insights:</h4>
          <p>• Highest occupancy typically at 4-8 PM</p>
          <p>• Trend: {stats.occupancyRate > 80 ? 'Increasing ↗️' : 'Stable →'}</p>
          <p>• Optimal: 75-85% occupancy</p>
        </div>
      </div>
    </div>
  );
}

export default EnhancedOccupancyChart;
