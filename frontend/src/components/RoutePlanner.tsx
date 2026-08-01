import { useState, useEffect, useCallback } from 'react';
import type { RoadSegment, LiveIncident } from '../types';
import './RoutePlanner.css';

const API_BASE = 'http://localhost:8000/api';

interface RouteResult {
  path: string[];
  pathNames: string[];
  cost: number | null;
  reachable: boolean;
  reason?: string;
  avoidedSegments?: string[];
}

interface RoutePlannerProps {
  roadNetwork: RoadSegment[];
  activeIncidents: LiveIncident[];
  currentTimestamp: string;
  /** 讓地圖把目前規劃出的路徑畫出來。 */
  onRouteChange?: (segmentIds: string[]) => void;
}

/**
 * 使用者導航模擬：起訖點選路段、算一條盡量避開壅塞/封閉路段的模擬路徑。
 * 不是精確導航——路網座標是近似值，用途是示範「路網重規劃」的多跳版本。
 */
export default function RoutePlanner({ roadNetwork, activeIncidents, currentTimestamp, onRouteChange }: RoutePlannerProps) {
  const [startId, setStartId] = useState('');
  const [endId, setEndId] = useState('');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [changeAlert, setChangeAlert] = useState<{ blockedSegment: string; oldPath: string[] } | null>(null);

  const blockedIds = activeIncidents.map((i) => i.affectedSegment);

  const runPlan = useCallback(
    async (blocked: string[]) => {
      if (!startId || !endId) return null;
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/route/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: startId,
            end: endId,
            blockedSegments: blocked,
            timestamp: currentTimestamp || undefined,
          }),
        });
        const data: RouteResult = await res.json();
        return data;
      } catch {
        return { path: [], pathNames: [], cost: null, reachable: false, reason: '無法連線後端服務' };
      } finally {
        setLoading(false);
      }
    },
    [startId, endId, currentTimestamp],
  );

  const handlePlan = async () => {
    const result = await runPlan(blockedIds);
    setRoute(result);
    setChangeAlert(null);
    if (result?.reachable) onRouteChange?.(result.path);
  };

  // 事件注入後，如果新封閉的路段剛好在目前路線上，跳出改道提示。
  useEffect(() => {
    if (!route || !route.reachable) return;
    const newlyBlocked = blockedIds.find((id) => route.path.includes(id) && !(route.avoidedSegments ?? []).includes(id));
    if (newlyBlocked) {
      setChangeAlert({ blockedSegment: newlyBlocked, oldPath: route.path });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIncidents.length]);

  const acceptNewRoute = async () => {
    const result = await runPlan(blockedIds);
    setRoute(result);
    setChangeAlert(null);
    if (result?.reachable) onRouteChange?.(result.path);
  };

  const segmentName = (id: string) => roadNetwork.find((s) => s.segmentId === id)?.name ?? id;

  return (
    <div className="route-planner glass-panel">
      <div className="glass-panel-header">
        <span className="status-dot" />
        路線規劃（模擬試算）
      </div>

      <p className="route-planner__note">
        模擬您目前位置與目的地，非真實導航；路徑依路網相交關係與壅塞程度計算。
      </p>

      <div className="route-planner__row">
        <label>
          目前位置（模擬）
          <select value={startId} onChange={(e) => setStartId(e.target.value)}>
            <option value="">請選擇</option>
            {roadNetwork.map((s) => (
              <option key={s.segmentId} value={s.segmentId}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          目的地
          <select value={endId} onChange={(e) => setEndId(e.target.value)}>
            <option value="">請選擇</option>
            {roadNetwork.map((s) => (
              <option key={s.segmentId} value={s.segmentId}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>

      <button className="route-planner__btn" onClick={handlePlan} disabled={!startId || !endId || loading}>
        {loading ? '規劃中…' : '規劃路線'}
      </button>

      {route && !route.reachable && (
        <p className="route-planner__error">{route.reason ?? '無法規劃路線'}</p>
      )}

      {route && route.reachable && (
        <div className="route-planner__result">
          <div className="route-planner__path">
            {route.pathNames.map((name, i) => (
              <span key={i} className="route-planner__stop">
                {name}
                {i < route.pathNames.length - 1 && <span className="route-planner__arrow">→</span>}
              </span>
            ))}
          </div>
          <div className="route-planner__cost">模擬壅塞代價：{route.cost}</div>
        </div>
      )}

      {changeAlert && (
        <div className="route-planner__change-alert">
          <p>
            <strong>{segmentName(changeAlert.blockedSegment)}</strong> 剛發生事故，位於您目前的路線上。
          </p>
          <button className="route-planner__btn route-planner__btn--accent" onClick={acceptNewRoute}>
            採用新路線（避開此路段）
          </button>
        </div>
      )}
    </div>
  );
}
