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
import FortuneDraw from './components/FortuneDraw';
import type { LiveIncident, AlertBanner, TrafficSegment, CrowdDensity, RoadSegment, AccidentHotspots } from './types';
import './App.css';

const API_BASE = 'http://localhost:8000/api';

function App() {
  const [trafficFlowData, setTrafficFlowData] = useState<TrafficSegment[]>([]);
  const [crowdDensityData, setCrowdDensityData] = useState<CrowdDensity[]>([]);
  const [roadNetwork, setRoadNetwork] = useState<RoadSegment[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);

  const [currentTimestamp, setCurrentTimestamp] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<LiveIncident[]>([]);
  const [alerts, setAlerts] = useState<AlertBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Segment selected on the map — drives focus in the advisory column.
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  // Advisory column is a drawer below 1180px.
  const [advisoryOpen, setAdvisoryOpen] = useState(false);

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

  // Check SOP thresholds and generate alerts
  useEffect(() => {
    const newAlerts: AlertBanner[] = [];

    // SOP Article 1: Check saturation on trigger segments (RD_TPE_001, RD_TPE_002)
    const triggerSegments = currentTraffic.filter(
      (s) => s.segmentId === 'RD_TPE_001' || s.segmentId === 'RD_TPE_002'
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

    // SOP Article 3: Check BL17 crowd threshold
    const bl17 = currentCrowd.find((c) => c.bsId === 'BS_MRT_BL17');
    if (bl17 && (bl17.growthRate > 0.30 || bl17.userCount > 25000)) {
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

    // SOP Article 6: Check roaming threshold (any station >= 30%)
    const roamingStations = currentCrowd.filter((c) => c.roamingUserPct >= 0.30);
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

    setAlerts(newAlerts);
  }, [currentTraffic, currentCrowd, currentTimestamp]);

  // Inject incident handler
  const handleInjectIncident = useCallback((incident: LiveIncident) => {
    setActiveIncidents((prev) => {
      if (prev.find((i) => i.eventId === incident.eventId)) return prev;
      return [...prev, incident];
    });
  }, []);

  const handleDismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, dismissed: true } : a))
    );
  }, []);

  // Clicking a segment on the map focuses the advisory column.
  const handleSelectSegment = useCallback((segmentId: string) => {
    setFocusedSegmentId(segmentId);
    setAdvisoryOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="boot">
        <div className="spinner spinner--lg" />
        <span className="boot__label">載入監測資料中</span>
      </div>
    );
  }

  const visibleAlerts = alerts.filter((a) => !a.dismissed);

  return (
    <div className="app">
      <Header
        activeIncidentCount={activeIncidents.length}
        alertCount={visibleAlerts.length}
        currentTimestamp={currentTimestamp}
        onToggleAdvisory={() => setAdvisoryOpen((o) => !o)}
      />

      <div className="alert-stack">
        {visibleAlerts.map((alert) => (
          <AlertBannerComponent
            key={alert.id}
            alert={alert}
            onDismiss={() => handleDismissAlert(alert.id)}
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

            <div className="rail-label">
              即時指標
              <span className="rail-label__count">{currentTraffic.length} 路段</span>
            </div>
            <MetricsBar trafficData={currentTraffic} crowdData={currentCrowd} />

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
        />
      </div>

      <FortuneDraw trafficData={currentTraffic} crowdData={currentCrowd} roadNetwork={roadNetwork} />
    </div>
  );
}

export default App;
