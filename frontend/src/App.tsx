import { useState, useCallback, useEffect, useMemo } from 'react';
import Header from './components/Header';
import TrafficMap from './components/TrafficMap';
import TrafficChart from './components/TrafficChart';
import CrowdChart from './components/CrowdChart';
import IncidentPanel from './components/IncidentPanel';
import ChatPanel from './components/ChatPanel';
import AlertBannerComponent from './components/AlertBanner';
import MetricsBar from './components/MetricsBar';
import TimelineControl from './components/TimelineControl';
import CommuteRoutePanel from './components/CommuteRoutePanel';
import FortuneDraw from './components/FortuneDraw';
import RoutePlanner from './components/RoutePlanner';
import AdvisorySummaryModal from './components/AdvisorySummaryModal';
import StudentRoster from './components/StudentRoster';
import DropOffConfirmModal from './components/DropOffConfirmModal';
import type { LiveIncident, TrafficSegment, CrowdDensity, RoadSegment, AccidentHotspots } from './types';
import { useSopAlerts } from './hooks/useSopAlerts';
import { useAdvisoryReport } from './hooks/useAdvisoryReport';
import { API_BASE } from './config/api';
import { COMMUTE_ROUTES, COMMUTE_ORIGIN, COMMUTE_DESTINATION } from './data/commuteRoutes';
import { assessCommuteRoutes } from './services/commuteRouteRisk';
import { useStudents } from './state/studentStore';
import './App.css';

interface AppProps {
  /** 回到角色選擇。 */
  onBack?: () => void;
}

function App({ onBack }: AppProps) {
  const [trafficFlowData, setTrafficFlowData] = useState<TrafficSegment[]>([]);
  const [crowdDensityData, setCrowdDensityData] = useState<CrowdDensity[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<RoadSegment[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);

  const [currentTimestamp, setCurrentTimestamp] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<LiveIncident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Segment selected on the map — drives focus in the advisory column.
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  // Advisory column is a drawer below 1180px.
  const [advisoryOpen, setAdvisoryOpen] = useState(false);
  // 上下學路線模擬：被選取的路線，null 代表三條全顯示。
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // 路線預設不顯示，按下地圖上的按鈕（或面板入口）才畫出來。
  const [showCommuteRoutes, setShowCommuteRoutes] = useState(false);

  const [routePath, setRoutePath] = useState<string[]>([]);
  const [pickingActive, setPickingActive] = useState(false);
  const [pickedStart, setPickedStart] = useState<{ segmentId: string; name: string } | null>(null);
  const [userPositionPoint, setUserPositionPoint] = useState<[number, number] | null>(null);

  /**
   * 校車學生名單。狀態放在 StudentContext（掛在 Root），
   * 所以切到家長端再切回來，下車結果仍然在。
   */
  const { students, timelineEvents, confirmDropOff } = useStudents();
  /** 等待確認下車的學生 id；null 代表沒有開啟確認視窗。 */
  const [pendingDropOffId, setPendingDropOffId] = useState<string | null>(null);
  const pendingStudent = students.find((s) => s.id === pendingDropOffId) ?? null;

  // 台北市開放資料：114年道路交通事故斑點圖，依路段比對後的統計。
  // 獨立 fetch、獨立失敗處理，缺這份資料不該讓整個 Dashboard 掛掉。
  const [accidentHotspots, setAccidentHotspots] = useState<AccidentHotspots | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/traffic/accident-hotspots`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAccidentHotspots(data))
      .catch(() => setAccidentHotspots(null));
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trafficRes, crowdRes, networkRes, incidentsRes] = await Promise.all([
          fetch(`${API_BASE}/traffic/flow`),
          fetch(`${API_BASE}/traffic/crowd`),
          fetch(`${API_BASE}/traffic/network`),
          fetch(`${API_BASE}/traffic/incidents`)
        ]);

        const trafficData = await trafficRes.json();
        const crowdData = await crowdRes.json();
        const networkData = await networkRes.json();
        const incidentsData = await incidentsRes.json();

        setTrafficFlowData(trafficData);
        setCrowdDensityData(crowdData);
        setRoadNetwork(networkData);
        setLiveIncidents(incidentsData);

        // Extract and sort unique timestamps
        const timestamps = [...new Set(trafficData.map((d: TrafficSegment) => d.timestamp))].sort() as string[];
        setAvailableTimestamps(timestamps);
        if (timestamps.length > 0) {
          setCurrentTimestamp(timestamps[0]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoadError('無法連線至後端服務，請確認 API 已啟動於 localhost:8000');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter data by current timestamp
  const currentTraffic = useMemo(
    () => trafficFlowData.filter((d) => d.timestamp === currentTimestamp),
    [trafficFlowData, currentTimestamp]
  );

  const currentCrowd = useMemo(
    () => crowdDensityData.filter((d) => d.timestamp === currentTimestamp),
    [crowdDensityData, currentTimestamp]
  );

  /**
   * 上下學路線評估。輸入是「當下時間點的車流」與事故熱點，所以拖動
   * 時間軸時三條路線的分級與推薦結果會即時重算。
   * 家長方用同一份資料與同一個函式，兩邊地圖上的路線必然一致。
   */
  const commuteAssessments = useMemo(
    () => assessCommuteRoutes(COMMUTE_ROUTES, currentTraffic, accidentHotspots),
    [currentTraffic, accidentHotspots]
  );

  /**
   * Highest SOP 第 1 條 level breached at each timestamp, for the
   * timeline ticks. Lets an operator see where the evening degrades
   * before scrubbing there.
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

  // Auto-play timeline
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

  // SOP門檻警示——統一呼叫後端 /api/alerts/check，涵蓋全部7條SOP（含之前漏掉的
  // 第4條大巨蛋散場、第5條號誌故障），跟家長版共用同一支 hook、同一套判定依據。
  const { visibleAlerts, dismissAlert } = useSopAlerts(currentTimestamp, activeIncidents);

  // 事件注入時自動產出 AI 預警摘要（SOP判定 + 路線規劃 + ETE + LLM生成摘要）並跳出彈窗。
  const {
    report: advisoryReport,
    loading: advisoryLoading,
    open: advisoryModalOpen,
    requestAdvisory,
    close: closeAdvisory,
  } = useAdvisoryReport();

  // Inject incident handler
  const handleInjectIncident = useCallback((incident: LiveIncident) => {
    setActiveIncidents((prev) => {
      if (prev.find((i) => i.eventId === incident.eventId)) return prev;
      return [...prev, incident];
    });
    requestAdvisory(incident.eventId, incident.timestamp);
  }, [requestAdvisory]);

  // Clicking a segment on the map focuses the advisory column.
  const handleSelectSegment = useCallback((segmentId: string) => {
    setFocusedSegmentId(segmentId);
    setAdvisoryOpen(true);
  }, []);

  const handleMapClick = useCallback((segmentId: string, name: string, lat: number, lng: number) => {
    setPickedStart({ segmentId, name });
    setUserPositionPoint([lat, lng]);
    setPickingActive(false);
  }, []);

  /**
   * 老師確認下車。下車時間取時間軸當前位置，所以記錄下來的時間
   * 與畫面上的時間軸讀數一致，事件也會落在對應的時間刻度上。
   */
  const handleConfirmDropOff = useCallback(() => {
    if (!pendingDropOffId) return;
    confirmDropOff(pendingDropOffId, currentTimestamp);
    setPendingDropOffId(null);
  }, [pendingDropOffId, confirmDropOff, currentTimestamp]);

  if (isLoading) {
    return (
      <div className="boot">
        <div className="spinner spinner--lg" />
        <span className="boot__label">載入監測資料中</span>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        activeIncidentCount={activeIncidents.length}
        alertCount={visibleAlerts.length}
        currentTimestamp={currentTimestamp}
        onToggleAdvisory={() => setAdvisoryOpen((o) => !o)}
        onBack={onBack}
      />

      <div className="alert-stack">
        {visibleAlerts.map((alert) => (
          <AlertBannerComponent
            key={alert.id}
            alert={alert}
            onDismiss={() => dismissAlert(alert.id)}
          />
        ))}
      </div>

      <div className="workspace">
        {/* ─── Left rail: data monitoring ─────────────────────── */}
        <section className="col col--data" aria-label="數據監測">
          <div className="col__scroll">
            {loadError && (
              <div className="state state--error">
                <span className="state__title">連線失敗</span>
                <span>{loadError}</span>
              </div>
            )}

            {/* 上下學路線模擬。與家長方共用同一份路線資料與同一個評估
                函式；家長方只在地圖上看路線，不放這塊比較面板。
                面板自己有標頭，這裡不再另外加 rail-label。 */}
            <CommuteRoutePanel
              assessments={commuteAssessments}
              origin={COMMUTE_ORIGIN}
              destination={COMMUTE_DESTINATION}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              visible={showCommuteRoutes}
              onToggleVisible={() => setShowCommuteRoutes((v) => !v)}
            />

            {/* 校車學生名單。面板自己有標頭，不再另外加 rail-label。 */}
            <StudentRoster students={students} onRequestDropOff={setPendingDropOffId} />

            <div className="rail-label">
              即時指標
              <span className="rail-label__count">{currentTraffic.length} 路段</span>
            </div>
            <MetricsBar trafficData={currentTraffic} crowdData={currentCrowd} />

            <div className="rail-label">路線規劃</div>
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

            <div className="rail-label">
              事件注入
              <span className="rail-label__count">
                {activeIncidents.length}/{liveIncidents.length}
              </span>
            </div>
            <IncidentPanel
              incidents={liveIncidents}
              activeIncidents={activeIncidents}
              onInjectIncident={handleInjectIncident}
            />
          </div>
        </section>

        {/* ─── Centre: map as primary anchor ──────────────────── */}
        <section className="col col--map" aria-label="路網地圖">
          <div className="map-frame">
            <div className="map-caption">
              <span className="status-dot" />
              信義計畫區 · 即時路網
            </div>
            <TrafficMap
              trafficData={currentTraffic}
              roadNetwork={roadNetwork}
              accidentHotspots={accidentHotspots}
              activeIncidents={activeIncidents}
              selectedSegmentId={focusedSegmentId}
              onSelectSegment={handleSelectSegment}
              routePathIds={routePath}
              onMapClick={pickingActive ? handleMapClick : undefined}
              userPositionPoint={userPositionPoint}
              commuteRoutes={commuteAssessments}
              commuteOrigin={COMMUTE_ORIGIN}
              commuteDestination={COMMUTE_DESTINATION}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              commuteRoutesVisible={showCommuteRoutes}
              onToggleCommuteRoutes={() => setShowCommuteRoutes((v) => !v)}
            />
          </div>

          <div className="chart-row">
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
          </div>
        </section>

        {/* ─── Right rail: AI advisory ────────────────────────── */}
        <section
          className="col col--advisory"
          data-open={advisoryOpen}
          aria-label="策略諮詢"
        >
          <ChatPanel
            focusedSegmentId={focusedSegmentId}
            currentTimestamp={currentTimestamp}
          />
        </section>
      </div>

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

      <AdvisorySummaryModal
        open={advisoryModalOpen}
        loading={advisoryLoading}
        report={advisoryReport}
        onClose={closeAdvisory}
      />

      {pendingStudent && (
        <DropOffConfirmModal
          student={pendingStudent}
          currentTime={currentTimestamp.split(' ')[1] ?? '--:--'}
          onCancel={() => setPendingDropOffId(null)}
          onConfirm={handleConfirmDropOff}
        />
      )}
    </div>
  );
}

export default App;
