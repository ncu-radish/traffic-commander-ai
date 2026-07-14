import { motion } from 'framer-motion';
import type { TrafficSegment, CrowdDensity } from '../types';
import './MetricsBar.css';

interface MetricsBarProps {
  trafficData: TrafficSegment[];
  crowdData: CrowdDensity[];
}

export default function MetricsBar({ trafficData, crowdData }: MetricsBarProps) {
  // Calculate aggregate metrics
  const avgSaturation = trafficData.length > 0
    ? trafficData.reduce((sum, t) => sum + t.saturationScore, 0) / trafficData.length
    : 0;

  const criticalCount = trafficData.filter((t) => t.saturationScore >= 0.95).length;
  const congestedCount = trafficData.filter((t) => t.saturationScore >= 0.85 && t.saturationScore < 0.95).length;

  const totalPeople = crowdData.reduce((sum, c) => sum + c.userCount, 0);

  const maxCrowd = crowdData.length > 0
    ? crowdData.reduce((max, c) => c.userCount > max.userCount ? c : max, crowdData[0])
    : null;

  const roamingStations = crowdData.filter((c) => c.roamingUserPct >= 0.30);

  const avgSpeed = trafficData.length > 0
    ? trafficData.reduce((sum, t) => sum + t.avgSpeed, 0) / trafficData.length
    : 0;

  const metrics = [
    {
      label: '平均飽和度',
      value: `${(avgSaturation * 100).toFixed(0)}%`,
      color: avgSaturation >= 0.85 ? '#ef4444' : avgSaturation >= 0.70 ? '#f59e0b' : '#22c55e',
    },
    {
      label: 'A級癱瘓路段',
      value: criticalCount.toString(),
      color: criticalCount > 0 ? '#ef4444' : '#22c55e',
    },
    {
      label: 'B級壅擠路段',
      value: congestedCount.toString(),
      color: congestedCount > 0 ? '#f59e0b' : '#22c55e',
    },
    {
      label: '平均車速',
      value: `${avgSpeed.toFixed(0)} km/h`,
      color: avgSpeed < 15 ? '#ef4444' : avgSpeed < 25 ? '#f59e0b' : '#22c55e',
    },
    {
      label: '區域總人流',
      value: totalPeople >= 1000 ? `${(totalPeople / 1000).toFixed(1)}k` : totalPeople.toString(),
      color: '#00d4ff',
    },
    {
      label: '最大人流站點',
      value: maxCrowd ? maxCrowd.locationName : '—',
      subValue: maxCrowd ? `${maxCrowd.userCount.toLocaleString()} 人` : '',
      color: '#a78bfa',
    },
    {
      label: '多語通報觸發',
      value: roamingStations.length > 0 ? `${roamingStations.length} 站` : '未觸發',
      color: roamingStations.length > 0 ? '#f59e0b' : '#22c55e',
    },
  ];

  return (
    <div className="metrics-bar">
      {metrics.map((m, i) => (
        <motion.div
          key={m.label}
          className="metric-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <span className="metric-value" style={{ color: m.color }}>
            {m.value}
          </span>
          {'subValue' in m && m.subValue && (
            <span className="metric-sub">{m.subValue}</span>
          )}
          <span className="metric-label">{m.label}</span>
        </motion.div>
      ))}
    </div>
  );
}
