import { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import TrafficMap from './components/TrafficMap';
import TrafficChart from './components/TrafficChart';
import CrowdChart from './components/CrowdChart';
import TimelineControl from './components/TimelineControl';
import FortuneDraw from './components/FortuneDraw';
import ParentStudentPanel from './components/ParentStudentPanel';
import type { LiveIncident, TrafficSegment, RoadSegment, CrowdDensity, AccidentHotspots } from './types';
import { API_BASE } from './config/api';
import { COMMUTE_ROUTES, COMMUTE_ORIGIN, COMMUTE_DESTINATION } from './data/commuteRoutes';
import { assessCommuteRoutes } from './services/commuteRouteRisk';
import { useStudents } from './state/studentStore';
// 地圖外框 (.map-frame / .map-caption) 與底部時間軸托盤 (.timeline-tray)
// 直接沿用校方端的樣式，讓兩端的壅塞地圖與時間軸長得一模一樣，
// 不另外複製一份 CSS。
import './App.css';
import './UserView.css';

interface UserViewProps {
  onBack: () => void;
}

/**
 * 家長方沒有事件注入介面，所以事故標記恆為空。
 * 提到模組層級當常數，避免每次 render 產生新陣列。
 */
const NO_ACTIVE_INCIDENTS: LiveIncident[] = [];

/**
 * 家長方視角：壅塞地圖 + 交通時間軸為主，與校方端（App.tsx）
 * 共用同一個後端與同一組地圖／時間軸設定，但不顯示完整的分析面板。
 *
 * 右側欄目前刻意留白：原本的路線規劃（模擬試算）與事件注入已移除，
 * 但欄位寬度保留，地圖維持原本尺寸而不變成滿版。
 */
export default function UserView({ onBack }: UserViewProps) {
  const [trafficFlowData, setTrafficFlowData] = useState<TrafficSegment[]>([]);
  const [crowdDensityData, setCrowdDensityData] = useState<CrowdDensity[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<RoadSegment[]>([]);
  const [accidentHotspots, setAccidentHotspots] = useState<AccidentHotspots | null>(null);
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);
  const [currentTimestamp, setCurrentTimestamp] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // 點選路段後的高亮，跟校方端同一套互動。
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  // 上下學路線模擬：地圖上的路線與開關，與校方端同一套。
  // 家長方只在地圖上看路線，右側不放比較面板。
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
        const [trafficRes, crowdRes, networkRes] = await Promise.all([
          fetch(`${API_BASE}/traffic/flow`),
          fetch(`${API_BASE}/traffic/crowd`),
          fetch(`${API_BASE}/traffic/network`),
        ]);
        const trafficData = await trafficRes.json();
        const crowdData = await crowdRes.json();
        const networkData = await networkRes.json();

        setTrafficFlowData(trafficData);
        setCrowdDensityData(crowdData);
        setRoadNetwork(networkData);

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

  const currentTraffic = trafficFlowData.filter((d) => d.timestamp === currentTimestamp);
  const currentCrowd = crowdDensityData.filter((d) => d.timestamp === currentTimestamp);

  /**
   * 上下學路線評估。與校方端 (App.tsx) 共用同一份 COMMUTE_ROUTES
   * 與同一個 assessCommuteRoutes()，所以兩端地圖上的三條路線、
   * 分級與推薦結果完全一致。
   */
  const commuteAssessments = useMemo(
    () => assessCommuteRoutes(COMMUTE_ROUTES, currentTraffic, accidentHotspots),
    [currentTraffic, accidentHotspots]
  );

  /**
   * 每個時間點觸發到的最高 SOP 第 1 條級別，用來畫時間軸上的刻度。
   * 與校方端 (App.tsx) 使用同一套判定，兩端刻度位置完全一致。
   */
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

  // 時間軸自動播放，行為與校方端相同：播到最後一格自動停。
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

  if (isLoading) {
    return <div className="user-view user-view--loading">載入資料中…</div>;
  }

  return (
    <div className="user-view">
      {/* 與校方端同一個 Header 元件，所以最上方那一行的樣式完全一致。
          家長端沒有事件注入，計數器省略不傳；改帶角色標籤。 */}
      <Header
        currentTimestamp={currentTimestamp}
        onBack={onBack}
        roleLabel="家長方模式"
      />

      <div className="user-view__body">
        {/* 與校方端同一個地圖外框（.map-frame + .map-caption）。 */}
        <div className="user-view__map map-frame">
          <div className="map-caption">
            <span className="status-dot" />
            信義計畫區 · 即時路網
          </div>

          {/* 兩端看的是同一張壅塞地圖：全部 15 條路段依飽和度上色
              （A 級／B 級／注意／正常）、事故熱點圈、基地台點位、
              飽和度圖例完全相同，並支援點選路段高亮。 */}
          <TrafficMap
            trafficData={currentTraffic}
            roadNetwork={roadNetwork}
            accidentHotspots={accidentHotspots}
            activeIncidents={NO_ACTIVE_INCIDENTS}
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

        {/* 右側欄放學生狀態與下車通知。通知是版面的一部分，
            所以不會浮在地圖上遮住路況。
            上下學路線的比較面板仍只放在校方端。 */}
        <aside className="user-view__sidebar" aria-label="孩子狀態與趨勢圖">
          <ParentStudentPanel
            students={students}
            notifications={notifications}
            onDismissNotification={dismissNotification}
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

      {/* 底部時間軸，與校方端同一個 TimelineControl 元件與同一組 props。 */}
      <div className="timeline-tray">
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
    </div>
  );
}
