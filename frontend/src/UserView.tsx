import { useState, useEffect, useCallback, useMemo } from 'react';
import TrafficMap from './components/TrafficMap';
import IncidentPanel from './components/IncidentPanel';
import RoutePlanner from './components/RoutePlanner';
import FortuneDraw from './components/FortuneDraw';
import AlertBannerComponent from './components/AlertBanner';
import TimelineControl from './components/TimelineControl';
import AdvisorySummaryModal from './components/AdvisorySummaryModal';
import type { LiveIncident, TrafficSegment, RoadSegment, CrowdDensity, AccidentHotspots } from './types';
import { saturationColor, saturationLevel } from './theme/tokens';
import { useSopAlerts } from './hooks/useSopAlerts';
import { useAdvisoryReport } from './hooks/useAdvisoryReport';
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

  // SOP門檻警示——統一呼叫後端 /api/alerts/check，涵蓋全部7條SOP（含之前漏掉的
  // 第4條大巨蛋散場、第5條號誌故障），跟校方版共用同一支 hook、同一套判定依據。
  const { visibleAlerts, dismissAlert } = useSopAlerts(currentTimestamp, activeIncidents);

  // 事件注入時自動產出 AI 預警摘要（SOP判定 + 路線規劃 + ETE + LLM生成摘要）並跳出彈窗。
  const {
    report: advisoryReport,
    loading: advisoryLoading,
    open: advisoryModalOpen,
    requestAdvisory,
    close: closeAdvisory,
  } = useAdvisoryReport();

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
    // 注入後 activeIncidents 變化會讓 useSopAlerts 自動重新查詢——
    // 事件對應到SOP第2/5條的話會拿到正式條文內容，其餘由 hook 自己補一則通用警報。
    requestAdvisory(incident.eventId, incident.timestamp);
  }, [requestAdvisory]);

  const handleMapClick = useCallback((segmentId: string, name: string, lat: number, lng: number) => {
    setPickedStart({ segmentId, name });
    setUserPositionPoint([lat, lng]);
    setPickingActive(false);
  }, []);

  if (isLoading) {
    return <div className="user-view user-view--loading">載入資料中…</div>;
  }

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
            onDismiss={() => dismissAlert(alert.id)}
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

      <AdvisorySummaryModal
        open={advisoryModalOpen}
        loading={advisoryLoading}
        report={advisoryReport}
        onClose={closeAdvisory}
      />
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
