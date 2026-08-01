import { useState, useEffect, useCallback } from 'react';
import TrafficMap from './components/TrafficMap';
import IncidentPanel from './components/IncidentPanel';
import RoutePlanner from './components/RoutePlanner';
import FortuneDraw from './components/FortuneDraw';
import type { LiveIncident, TrafficSegment, RoadSegment, CrowdDensity, AccidentHotspots } from './types';
import './UserView.css';

const API_BASE = 'http://localhost:8000/api';

interface UserViewProps {
  onBack: () => void;
}

/**
 * 使用者視角：地圖為主，事件注入 + 路線規劃 + 沿途路況籤詩為輔。
 * 與保險業者版（App.tsx）共用同一個後端，但不顯示完整的分析面板。
 */
export default function UserView({ onBack }: UserViewProps) {
  const [trafficFlowData, setTrafficFlowData] = useState<TrafficSegment[]>([]);
  const [crowdDensityData, setCrowdDensityData] = useState<CrowdDensity[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<RoadSegment[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [accidentHotspots, setAccidentHotspots] = useState<AccidentHotspots | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState('');
  const [activeIncidents, setActiveIncidents] = useState<LiveIncident[]>([]);
  const [routePath, setRoutePath] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trafficRes, crowdRes, networkRes, incidentsRes] = await Promise.all([
          fetch(`${API_BASE}/traffic/flow`),
          fetch(`${API_BASE}/traffic/crowd`),
          fetch(`${API_BASE}/traffic/network`),
          fetch(`${API_BASE}/traffic/incidents`),
        ]);
        const trafficData = await trafficRes.json();
        const crowdData = await crowdRes.json();
        const networkData = await networkRes.json();
        const incidentsData = await incidentsRes.json();

        setTrafficFlowData(trafficData);
        setCrowdDensityData(crowdData);
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

  // 事故熱點是獨立資料源，缺了不該讓整頁掛掉，所以獨立 fetch、獨立失敗處理。
  useEffect(() => {
    fetch(`${API_BASE}/traffic/accident-hotspots`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setAccidentHotspots)
      .catch(() => setAccidentHotspots(null));
  }, []);

  const currentTraffic = trafficFlowData.filter((d) => d.timestamp === currentTimestamp);
  const currentCrowd = crowdDensityData.filter((d) => d.timestamp === currentTimestamp);

  // 路線規劃好之後，地圖聚焦在「路線本身」+「跟路線路口交叉的路段」——
  // 跟 RoutePlanner 判斷事件是否影響路線用的是同一套「路口交叉」邏輯，維持一致。
  const focusSegmentIds = (() => {
    if (routePath.length === 0) return undefined;
    const byId = new Map(roadNetwork.map((s) => [s.segmentId, s]));
    const focus = new Set(routePath);
    for (const segId of routePath) {
      const seg = byId.get(segId);
      if (!seg) continue;
      for (const other of roadNetwork) {
        if (focus.has(other.segmentId)) continue;
        if (seg.intersections.includes(other.name) || other.intersections.includes(seg.name)) {
          focus.add(other.segmentId);
        }
      }
    }
    return Array.from(focus);
  })();

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
            accidentHotspots={accidentHotspots}
            focusSegmentIds={focusSegmentIds}
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

      <FortuneDraw trafficData={currentTraffic} crowdData={currentCrowd} roadNetwork={roadNetwork} routeSegmentIds={routePath} />
    </div>
  );
}
