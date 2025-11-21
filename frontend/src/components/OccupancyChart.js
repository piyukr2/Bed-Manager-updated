import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

function OccupancyChart({ stats }) {
  const data = [
    { name: 'Occupied', value: stats.occupied, color: '#ef4444' },
    { name: 'Available', value: stats.available, color: '#10b981' },
    { name: 'Cleaning', value: stats.cleaning, color: '#f59e0b' },
    { name: 'Reserved', value: stats.reserved, color: '#6366f1' },
  ];

  const renderCustomLabel = (props) => {
    const { x, y, width, height, value } = props;
    return (
      <text
        x={x + width + 10}
        y={y + height / 2}
        fill="var(--text-primary)"
        textAnchor="start"
        dominantBaseline="middle"
        fontSize="14"
        fontWeight="600"
      >
        {value}
      </text>
    );
  };

  return (
    <div className="occupancy-chart-container">
      <h3>Bed Distribution</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 15, right: 40, left: 10, bottom: 15 }}
          barSize={40}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="rgba(148, 163, 184, 0.15)" 
            horizontal={true}
            vertical={false}
          />
          <XAxis 
            type="number" 
            stroke="var(--text-quiet)"
            tick={{ fill: 'var(--text-quiet)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            width={90}
            stroke="var(--text-secondary)"
            tick={{ fill: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-soft)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
            labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
          />
          <Bar 
            dataKey="value" 
            radius={[0, 10, 10, 0]}
            animationDuration={800}
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                opacity={0.9}
              />
            ))}
            <LabelList content={renderCustomLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default OccupancyChart;