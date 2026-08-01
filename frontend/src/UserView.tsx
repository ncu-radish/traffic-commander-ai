import { useState, useEffect, useCallback, useMemo } from 'react';
import TrafficMap from './components/TrafficMap';
import IncidentPanel from './components/IncidentPanel';
import RoutePlanner from './components/RoutePlanner';
import FortuneDraw from './components/FortuneDraw';
import AlertBannerComponent from './components/AlertBanner';
import TimelineControl from './components/TimelineControl';
import type { LiveIncident, TrafficSegment, RoadSegment, CrowdDensity, AccidentHotspots, AlertBanner } from './types';
import { saturationColor, saturationLevel } from './theme/tokens';
import './UserView.css';

const API_BASE = 'http://localhost:8000/api';

interface UserViewProps {
  onBack: () => void;
}

/**
 * 家長視角：地圖為主，壅塞路段 + 時間軸 + 事件注入 + 路線規劃 + 沿途路況籤詩為輔。
 * 與校方版（App.tsx）共用同一個後端，但不顯示完整的分析面板（圖表、AI對話諮詢）。
 */
export default function UserView({ onBack }: UserViewProps) {
  const [trafficFlowData, setTrafficFlowData] = useState<TrafficSegment[]>([]);
  const [crowdDensityData, setCrowdDensityData] = useState<CrowdDensity[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<RoadSegment[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [accidentHotspots, setAccidentHotspots] = useState<AccidentHotspots | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState('');
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<LiveIncident[]>([]);
  const [routePath, setRoutePath] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pickingActive, setPickingActive] = useState(false);
  const [pickedStart, setPickedStart] = useState<{ segmentId: string; name: string } | null>(null);
  const [userPositionPoint, setUserPositionPoint] = useState<[number, number] | null>(null);

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
        setAvailableTimestamps(timestamps);
        // 預設停在最新一筆，但家長可以自己拖時間軸回顧之前的路況。
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

  const currentTraffic = useMemo(
    () => trafficFlowData.filter((d) => d.timestamp === currentTimestamp),
    [trafficFlowData, currentTimestamp],
  );
  const currentCrowd = useMemo(
    () => crowdDensityData.filter((d) => d.timestamp === currentTimestamp),
    [crowdDensityData, currentTimestamp],
  );

  // 播放中的時間軸自動往下一格走，跟校方版（App.tsx）同一套邏輯。
  useEffect(() => {
    if (!isPlaying || availableTimestamps.length === 0) return;
    const currentIndex = availableTimestamps.indexOf(currentTimestamp);
    if (currentIndex >= availableTimestamps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentTimestamp(availableTimestamps[currentIndex + 1]);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isPlaying, currentTimestamp, availableTimestamps]);

  // 時間軸上每個時間點最高觸發到哪個SOP第1條等級，畫成彩色刻度，
  // 讓家長不用整段拖過去，一眼看出哪個時段路況比較差。
  const timelineBreaches = useMemo(() => {
    const map: Record<string, 'A' | 'B'> = {};
    for (const row of trafficFlowData) {
      if (row.segmentId !== 'RD_TPE_001' && row.segmentId !== 'RD_TPE_002') continue;
      if (row.saturationScore >= 0.95) {
        map[row.timestamp] = 'A';
      } else if (row.saturationScore >= 0.85 && map[row.timestamp] !== 'A') {
        map[row.timestamp] = 'B';
      }
    }
    return map;
  }, [trafficFlowData]);

  // SOP門檻警示——跟校方版（App.tsx）用同一套判定，會隨時間軸捲動重新觸發。
  // 之前只有 App.tsx 有這個橫幅，家長版沒有。
  const [alerts, setAlerts] = useState<AlertBanner[]>([]);

  useEffect(() => {
    const newAlerts: AlertBanner[] = [];

    const triggerSegments = currentTraffic.filter(
      (s) => s.segmentId === 'RD_TPE_001' || s.segmentId === 'RD_TPE_002',
    );
    triggerSegments.forEach((seg) => {
      if (seg.saturationScore >= 0.95) {
        newAlerts.push({
          id: `alert-A-${seg.segmentId}-${currentTimestamp}`,
          level: 'A',
          title: `A 級癱瘓警報 — ${seg.roadName}`,
          message: `飽和度 ${(seg.saturationScore * 100).toFixed(0)}%，已達 A 級癱瘓門檻。啟動替代路徑引導與長綠燈時制。`,
          timestamp: currentTimestamp,
          sopArticle: 'SOP 第 1 條',
          dismissed: false,
        });
      } else if (seg.saturationScore >= 0.85) {
        newAlerts.push({
          id: `alert-B-${seg.segmentId}-${currentTimestamp}`,
          level: 'B',
          title: `B 級壅擠警報 — ${seg.roadName}`,
          message: `飽和度 ${(seg.saturationScore * 100).toFixed(0)}%，已達 B 級壅擠門檻。建議啟動長綠燈時制。`,
          timestamp: currentTimestamp,
          sopArticle: 'SOP 第 1 條',
          dismissed: false,
        });
      }
    });

    const bl17 = currentCrowd.find((c) => c.bsId === 'BS_MRT_BL17');
    if (bl17 && (bl17.growthRate > 0.3 || bl17.userCount > 25000)) {
      newAlerts.push({
        id: `alert-crowd-BL17-${currentTimestamp}`,
        level: 'A',
        title: '捷運分流警報 — 國父紀念館站',
        message: `人數 ${bl17.userCount.toLocaleString()}，成長率 ${(bl17.growthRate * 100).toFixed(0)}%。建議啟動過站不停與接駁分流。`,
        timestamp: currentTimestamp,
        sopArticle: 'SOP 第 3 條',
        dismissed: false,
      });
    }

    const roamingStations = currentCrowd.filter((c) => c.roamingUserPct >= 0.3);
    roamingStations.forEach((station) => {
      newAlerts.push({
        id: `alert-roaming-${station.bsId}-${currentTimestamp}`,
        level: 'B',
        title: `多語化通報觸發 — ${station.locationName}`,
        message: `漫遊比率 ${(station.roamingUserPct * 100).toFixed(0)}%，已達 SOP 第 6 條門檻。需產出多國語言告警。`,
        timestamp: currentTimestamp,
        sopArticle: 'SOP 第 6 條',
        dismissed: false,
      });
    });

    // 保留使用者手動注入事件產生的警報（不隨門檻重算被清掉）。
    setAlerts((prev) => [...newAlerts, ...prev.filter((a) => a.id.startsWith('alert-incident-'))]);
  }, [currentTraffic, currentCrowd, currentTimestamp]);

  const handleDismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, dismissed: true } : a)));
  }, []);

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
    // 事件注入當下就要有明確警報——不能只靠飽和度門檻，那是綁在固定的最新一筆資料上，
    // 不會因為你剛剛注入了事件而重算。
    setAlerts((prev) => [
      {
        id: `alert-incident-${incident.eventId}`,
        level: incident.severity === 'Critical' || incident.severity === 'High' ? 'A' : 'B',
        title: `事件通報 — ${incident.location}`,
        message: incident.description,
        timestamp: incident.timestamp,
        dismissed: false,
      },
      ...prev,
    ]);
  }, []);

  const handleMapClick = useCallback((segmentId: string, name: string, lat: number, lng: number) => {
    setPickedStart({ segmentId, name });
    setUserPositionPoint([lat, lng]);
    setPickingActive(false);
  }, []);

  if (isLoading) {
    return <div className="user-view user-view--loading">載入資料中…</div>;
  }

  const visibleAlerts = alerts.filter((a) => !a.dismissed);

  return (
    <div className="user-view">
      <header className="user-view__header">
        <button className="user-view__back" onClick={onBack}>← 切換視角</button>
        <span className="user-view__title">信義計畫區 路況地圖</span>
        <span className="user-view__badge">家長模式</span>
      </header>

      <div className="alert-stack">
        {visibleAlerts.map((alert) => (
          <AlertBannerComponent
            key={alert.id}
            alert={alert}
            onDismiss={() => handleDismissAlert(alert.id)}
          />
        ))}
      </div>

      <div className="user-view__body">
        <div className="user-view__map">
          <TrafficMap
            trafficData={currentTraffic}
            roadNetwork={roadNetwork}
            activeIncidents={activeIncidents}
            routePathIds={routePath}
            accidentHotspots={accidentHotspots}
            focusSegmentIds={focusSegmentIds}
            onMapClick={pickingActive ? handleMapClick : undefined}
            userPositionPoint={userPositionPoint}
          />
        </div>

        <aside className="user-view__sidebar">
          <CongestedSegmentsPanel trafficData={currentTraffic} />
          <RoutePlanner
            roadNetwork={roadNetwork}
            activeIncidents={activeIncidents}
            currentTimestamp={currentTimestamp}
            crowdData={currentCrowd}
            onRouteChange={setRoutePath}
            pickedStart={pickedStart}
            pickingActive={pickingActive}
            onRequestPick={() => setPickingActive(true)}
          />
          <IncidentPanel
            incidents={liveIncidents}
            activeIncidents={activeIncidents}
            onInjectIncident={handleInjectIncident}
          />
        </aside>
      </div>

      <div className="user-view__timeline">
        <TimelineControl
          timestamps={availableTimestamps}
          currentTimestamp={currentTimestamp}
          isPlaying={isPlaying}
          onTimestampChange={setCurrentTimestamp}
          onPlayToggle={() => setIsPlaying((p) => !p)}
          breaches={timelineBreaches}
        />
      </div>

      <FortuneDraw trafficData={currentTraffic} crowdData={currentCrowd} roadNetwork={roadNetwork} routeSegmentIds={routePath} />
    </div>
  );
}

/** 壅塞路段列表——依飽和度排序，家長一眼看出哪幾條路現在塞，不用逐條點地圖確認。 */
function CongestedSegmentsPanel({ trafficData }: { trafficData: TrafficSegment[] }) {
  const sorted = [...trafficData].sort((a, b) => b.saturationScore - a.saturationScore);

  return (
    <div className="glass-panel congestion-panel">
      <div className="glass-panel-header">
        <span className="status-dot" />
        壅塞路段
      </div>
      {sorted.length === 0 ? (
        <p className="congestion-panel__empty">此時間點無路況資料</p>
      ) : (
        <ul className="congestion-panel__list">
          {sorted.map((seg) => (
            <li key={seg.segmentId} className="congestion-panel__item">
              <span className="congestion-panel__name">{seg.roadName}</span>
              <span
                className={`congestion-panel__badge congestion-panel__badge--${saturationLevel(seg.saturationScore)}`}
                style={{ color: saturationColor(seg.saturationScore) }}
              >
                {(seg.saturationScore * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
