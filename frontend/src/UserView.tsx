import { useState, useEffect, useCallback } from 'react';
import TrafficMap from './components/TrafficMap';
import IncidentPanel from './components/IncidentPanel';
import RoutePlanner from './components/RoutePlanner';
import type { LiveIncident, TrafficSegment, RoadSegment } from './types';
import './UserView.css';

const API_BASE = 'http://localhost:8000/api';

interface UserViewProps {
  onBack: () => void;
}

/**
 * 使用者視角：簡化版 Dashboard，地圖為主，事件注入 + 路線規劃為輔。
 * 與保險業者版（App.tsx）共用同一個後端，但不顯示完整的分析面板。
 */
export default function UserView({ onBack }: UserViewProps) {
  const [trafficFlowData, setTrafficFlowData] = useState<TrafficSegment[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<RoadSegment[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [currentTimestamp, setCurrentTimestamp] = useState('');
  const [activeIncidents, setActiveIncidents] = useState<LiveIncident[]>([]);
  const [routePath, setRoutePath] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trafficRes, networkRes, incidentsRes] = await Promise.all([
          fetch(`${API_BASE}/traffic/flow`),
          fetch(`${API_BASE}/traffic/network`),
          fetch(`${API_BASE}/traffic/incidents`),
        ]);
        const trafficData = await trafficRes.json();
        const networkData = await networkRes.json();
        const incidentsData = await incidentsRes.json();

        setTrafficFlowData(trafficData);
        setRoadNetwork(networkData);
        setLiveIncidents(incidentsData);

        const timestamps = [...new Set(trafficData.map((d: TrafficSegment) => d.timestamp))].sort() as string[];
        // 使用者版不提供時間軸拖拉，固定顯示最新一筆，維持「簡單」的訴求。
        if (timestamps.length > 0) setCurrentTimestamp(timestamps[timestamps.length - 1]);
      } catch (error) {
        console.error('UserView fetch error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const currentTraffic = trafficFlowData.filter((d) => d.timestamp === currentTimestamp);

  const handleInjectIncident = useCallback((incident: LiveIncident) => {
    setActiveIncidents((prev) => {
      if (prev.find((i) => i.eventId === incident.eventId)) return prev;
      return [...prev, incident];
    });
  }, []);

  if (isLoading) {
    return <div className="user-view user-view--loading">載入資料中…</div>;
  }

  return (
    <div className="user-view">
      <header className="user-view__header">
        <button className="user-view__back" onClick={onBack}>← 切換視角</button>
        <span className="user-view__title">信義計畫區 路況地圖</span>
        <span className="user-view__badge">使用者模式</span>
      </header>

      <div className="user-view__body">
        <div className="user-view__map">
          <TrafficMap
            trafficData={currentTraffic}
            roadNetwork={roadNetwork}
            activeIncidents={activeIncidents}
            routePathIds={routePath}
          />
        </div>

        <aside className="user-view__sidebar">
          <RoutePlanner
            roadNetwork={roadNetwork}
            activeIncidents={activeIncidents}
            currentTimestamp={currentTimestamp}
            onRouteChange={setRoutePath}
          />
          <IncidentPanel
            incidents={liveIncidents}
            activeIncidents={activeIncidents}
            onInjectIncident={handleInjectIncident}
          />
        </aside>
      </div>
    </div>
  );
}
