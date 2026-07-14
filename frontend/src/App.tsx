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
import type { LiveIncident, AlertBanner } from './types';
import { trafficFlowData, crowdDensityData, roadNetwork, liveIncidents, availableTimestamps } from './data/mockTrafficData';
import './App.css';

function App() {
  const [currentTimestamp, setCurrentTimestamp] = useState(availableTimestamps[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<LiveIncident[]>([]);
  const [alerts, setAlerts] = useState<AlertBanner[]>([]);

  // Filter data by current timestamp
  const currentTraffic = useMemo(
    () => trafficFlowData.filter((d) => d.timestamp === currentTimestamp),
    [currentTimestamp]
  );

  const currentCrowd = useMemo(
    () => crowdDensityData.filter((d) => d.timestamp === currentTimestamp),
    [currentTimestamp]
  );

  // Auto-play timeline
  useEffect(() => {
    if (!isPlaying) return;
    const currentIndex = availableTimestamps.indexOf(currentTimestamp);
    if (currentIndex >= availableTimestamps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentTimestamp(availableTimestamps[currentIndex + 1]);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isPlaying, currentTimestamp]);

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
          title: `🚨 A 級癱瘓警報 — ${seg.roadName}`,
          message: `飽和度 ${(seg.saturationScore * 100).toFixed(0)}%，已達 A 級癱瘓門檻。啟動替代路徑引導與長綠燈時制。`,
          timestamp: currentTimestamp,
          sopArticle: 'SOP 第 1 條',
          dismissed: false,
        });
      } else if (seg.saturationScore >= 0.85) {
        newAlerts.push({
          id: `alert-B-${seg.segmentId}-${currentTimestamp}`,
          level: 'B',
          title: `⚠️ B 級壅擠警報 — ${seg.roadName}`,
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
        title: '🚇 捷運分流警報 — 國父紀念館站',
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
        title: `🌐 多語化通報觸發 — ${station.locationName}`,
        message: `漫遊比率 ${(station.roamingUserPct * 100).toFixed(0)}%，已達 SOP 第 6 條門檻。需產出多國語言告警。`,
        timestamp: currentTimestamp,
        sopArticle: 'SOP 第 6 條',
        dismissed: false,
      });
    });

    if (newAlerts.length > 0) {
      setAlerts(newAlerts);
    } else {
      setAlerts([]);
    }
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

  return (
    <div className="app">
      <Header activeIncidentCount={activeIncidents.length} alertCount={alerts.filter((a) => !a.dismissed).length} />

      {/* Alert Banners */}
      <div className="alert-container">
        {alerts
          .filter((a) => !a.dismissed)
          .map((alert) => (
            <AlertBannerComponent key={alert.id} alert={alert} onDismiss={() => handleDismissAlert(alert.id)} />
          ))}
      </div>

      <div className="dashboard-layout">
        {/* Left Column: Map + Charts */}
        <main className="main-content">
          <MetricsBar trafficData={currentTraffic} crowdData={currentCrowd} />

          <TimelineControl
            timestamps={availableTimestamps}
            currentTimestamp={currentTimestamp}
            isPlaying={isPlaying}
            onTimestampChange={setCurrentTimestamp}
            onPlayToggle={() => setIsPlaying((p) => !p)}
          />

          <div className="map-container glass-panel">
            <div className="glass-panel-header">
              <span className="status-dot" />
              即時路網地圖
            </div>
            <TrafficMap
              trafficData={currentTraffic}
              roadNetwork={roadNetwork}
              activeIncidents={activeIncidents}
            />
          </div>

          <div className="charts-grid">
            <div className="glass-panel">
              <div className="glass-panel-header">
                <span className="status-dot" />
                車流飽和度趨勢
              </div>
              <TrafficChart
                trafficData={trafficFlowData}
                currentTimestamp={currentTimestamp}
              />
            </div>
            <div className="glass-panel">
              <div className="glass-panel-header">
                <span className="status-dot" />
                人流密度趨勢
              </div>
              <CrowdChart
                crowdData={crowdDensityData}
                currentTimestamp={currentTimestamp}
              />
            </div>
          </div>
        </main>

        {/* Right Column: Incidents + Chat */}
        <aside className="sidebar">
          <IncidentPanel
            incidents={liveIncidents}
            activeIncidents={activeIncidents}
            onInjectIncident={handleInjectIncident}
          />
          <ChatPanel />
        </aside>
      </div>
    </div>
  );
}

export default App;
