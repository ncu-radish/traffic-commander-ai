import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import TrafficMap from './components/TrafficMap';
import IncidentPanel from './components/IncidentPanel';
import TrafficChart from './components/TrafficChart';
import CrowdChart from './components/CrowdChart';
import TimelineControl from './components/TimelineControl';
import FortuneDraw from './components/FortuneDraw';
import AlertBannerComponent from './components/AlertBanner';
import AdvisorySummaryModal from './components/AdvisorySummaryModal';
import ParentStudentPanel from './components/ParentStudentPanel';
import type { LiveIncident, TrafficSegment, RoadSegment, CrowdDensity, AccidentHotspots } from './types';
import { saturationColor, saturationLevel } from './theme/tokens';
import { useSopAlerts } from './hooks/useSopAlerts';
import { useAdvisoryReport } from './hooks/useAdvisoryReport';
import { API_BASE } from './config/api';
import { COMMUTE_ROUTES, COMMUTE_ORIGIN, COMMUTE_DESTINATION } from './data/commuteRoutes';
import { assessCommuteRoutes } from './services/commuteRouteRisk';
import { useStudents } from './state/studentStore';
import './UserView.css';

interface UserViewProps {
  onBack: () => void;
}

/**
 * 家長視角：地圖為主，壅塞路段 + 時間軸 + 事件注入 + 路線規劃 + 沿途路況籤詩，
 * 加上與校方端共用的上下學路線模擬（畫在地圖上；路線比較面板只放校方端）、
 * 校車學生狀態與下車通知、以及跟校方端同樣的兩張趨勢圖。
 * 與校方版（App.tsx）共用同一個後端，但不顯示完整的分析面板（AI對話諮詢）。
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
  const [isLoading, setIsLoading] = useState(true);
  // 點選路段後的高亮，跟校方端同一套互動。
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  // 上下學路線模擬：地圖上的路線與開關，與校方端同一套資料與評估函式。
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showCommuteRoutes, setShowCommuteRoutes] = useState(false);

  /**
   * 學生狀態與通知，與校方端同一份 StudentContext。
   * 老師在校方端確認下車後，這裡的狀態、下車時間、時間軸事件與
   * 通知卡片會是同一個結果，切換角色也不會消失。
   */
  const { students, timelineEvents, notifications, dismissNotification } = useStudents();

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
        // 與校方端一致：從第一個時間點開始，交由底部時間軸拖拉或播放。
        setAvailableTimestamps(timestamps);
        if (timestamps.length > 0) setCurrentTimestamp(timestamps[0]);
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

  /**
   * 上下學路線評估。與校方端 (App.tsx) 共用同一份 COMMUTE_ROUTES
   * 與同一個 assessCommuteRoutes()，所以兩端地圖上的三條路線、
   * 分級與推薦結果完全一致。
   */
  const commuteAssessments = useMemo(
    () => assessCommuteRoutes(COMMUTE_ROUTES, currentTraffic, accidentHotspots),
    [currentTraffic, accidentHotspots],
  );

  const handleInjectIncident = useCallback((incident: LiveIncident) => {
    setActiveIncidents((prev) => {
      if (prev.find((i) => i.eventId === incident.eventId)) return prev;
      return [...prev, incident];
    });
    // 注入後 activeIncidents 變化會讓 useSopAlerts 自動重新查詢——
    // 事件對應到SOP第2/5條的話會拿到正式條文內容，其餘由 hook 自己補一則通用警報。
    requestAdvisory(incident.eventId, incident.timestamp);
  }, [requestAdvisory]);

  if (isLoading) {
    return <div className="user-view user-view--loading">載入資料中…</div>;
  }

  return (
    <div className="user-view">
      {/* 與校方端同一個 Header 元件，最上方那一行樣式完全一致。
          家長端也有事件注入，所以照樣帶警報/事件計數器。 */}
      <Header
        activeIncidentCount={activeIncidents.length}
        alertCount={visibleAlerts.length}
        currentTimestamp={currentTimestamp}
        onBack={onBack}
        roleLabel="家長模式"
      />

      <div className="alert-stack">
        {visibleAlerts.map((alert) => (
          <AlertBannerComponent
            key={alert.id}
            alert={alert}
            onDismiss={() => dismissAlert(alert.id)}
            publicView
          />
        ))}
      </div>

      <div className="user-view__body">
        <div className="user-view__map">
          <TrafficMap
            trafficData={currentTraffic}
            roadNetwork={roadNetwork}
            activeIncidents={activeIncidents}
            accidentHotspots={accidentHotspots}
            selectedSegmentId={focusedSegmentId}
            onSelectSegment={setFocusedSegmentId}
            commuteRoutes={commuteAssessments}
            commuteOrigin={COMMUTE_ORIGIN}
            commuteDestination={COMMUTE_DESTINATION}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            commuteRoutesVisible={showCommuteRoutes}
            onToggleCommuteRoutes={() => setShowCommuteRoutes((v) => !v)}
          />
        </div>

        <aside className="user-view__sidebar">
          <ParentStudentPanel
            students={students}
            notifications={notifications}
            onDismissNotification={dismissNotification}
          />
          <CongestedSegmentsPanel trafficData={currentTraffic} />
          <IncidentPanel
            incidents={liveIncidents}
            activeIncidents={activeIncidents}
            onInjectIncident={handleInjectIncident}
          />

          {/* 與校方端同一組 .chart-card 外框與同兩個圖表元件，
              尺寸、間距、顏色、hover 與 tooltip 全部沿用，這裡只是
              改成一上一下排列。 */}
          <div className="chart-card">
            <div className="chart-card__header">車流飽和度趨勢</div>
            <div className="chart-card__body">
              <TrafficChart
                trafficData={trafficFlowData}
                currentTimestamp={currentTimestamp}
              />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card__header">人流密度趨勢</div>
            <div className="chart-card__body">
              <CrowdChart
                crowdData={crowdDensityData}
                currentTimestamp={currentTimestamp}
              />
            </div>
          </div>
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
          events={timelineEvents}
        />
      </div>

      <FortuneDraw trafficData={currentTraffic} crowdData={currentCrowd} roadNetwork={roadNetwork} />

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
