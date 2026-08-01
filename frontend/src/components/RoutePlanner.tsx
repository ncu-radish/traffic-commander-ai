import { useState, useEffect, useCallback, useRef } from 'react';
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

type RouteCheckModal =
  | { status: 'affected'; blockedSegment: string; alternative: RouteResult }
  | { status: 'clear'; checkedSegment: string };

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
  const [checkModal, setCheckModal] = useState<RouteCheckModal | null>(null);

  const routeRef = useRef<RouteResult | null>(null);
  routeRef.current = route;
  const checkedIncidentIdsRef = useRef<Set<string>>(new Set());

  const runPlan = useCallback(
    async (blocked: string[]): Promise<RouteResult> => {
      if (!startId || !endId) return { path: [], pathNames: [], cost: null, reachable: false };
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
        return await res.json();
      } catch {
        return { path: [], pathNames: [], cost: null, reachable: false, reason: '無法連線後端服務' };
      }
    },
    [startId, endId, currentTimestamp],
  );

  const handlePlan = async () => {
    setLoading(true);
    const blockedIds = activeIncidents.map((i) => i.affectedSegment);
    const result = await runPlan(blockedIds);
    setLoading(false);
    setRoute(result);
    setCheckModal(null);
    checkedIncidentIdsRef.current = new Set(activeIncidents.map((i) => i.eventId));
    if (result.reachable) onRouteChange?.(result.path);
  };

  // 每次有「新的」事件被注入（不是重複觸發），只要目前有規劃中的路線，
  // 就跳出視窗告知檢查結果——不管有沒有影響都跳，讓使用者清楚知道系統真的檢查過了。
  useEffect(() => {
    const current = routeRef.current;
    if (!current || !current.reachable) return;

    const newIncidents = activeIncidents.filter((i) => !checkedIncidentIdsRef.current.has(i.eventId));
    if (newIncidents.length === 0) return;
    checkedIncidentIdsRef.current = new Set(activeIncidents.map((i) => i.eventId));

    const blockedIds = activeIncidents.map((i) => i.affectedSegment);
    const affectedIncident = newIncidents.find((i) => current.path.includes(i.affectedSegment));

    if (!affectedIncident) {
      setCheckModal({ status: 'clear', checkedSegment: newIncidents.map((i) => i.affectedSegment).join('、') });
      return;
    }

    let cancelled = false;
    runPlan(blockedIds).then((alternative) => {
      if (!cancelled) {
        setCheckModal({ status: 'affected', blockedSegment: affectedIncident.affectedSegment, alternative });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIncidents.length]);

  const closeModal = () => setCheckModal(null);

  const keepOldRoute = () => setCheckModal(null);

  const acceptNewRoute = () => {
    if (checkModal?.status !== 'affected' || !checkModal.alternative.reachable) return;
    setRoute(checkModal.alternative);
    onRouteChange?.(checkModal.alternative.path);
    setCheckModal(null);
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

      {checkModal && (
        <div className="route-check-overlay" onClick={closeModal}>
          <div className="route-check-modal" onClick={(e) => e.stopPropagation()}>
            {checkModal.status === 'clear' ? (
              <>
                <div className="route-check-modal__icon route-check-modal__icon--ok">✓</div>
                <h3>新事件不影響您的路線</h3>
                <p>
                  <strong>{segmentName(checkModal.checkedSegment)}</strong> 剛發生事件，但不在您目前規劃的路線上，可依原計畫通行。
                </p>
                <button className="route-planner__btn" onClick={closeModal}>知道了</button>
              </>
            ) : (
              <>
                <div className="route-check-modal__icon route-check-modal__icon--warn">⚠</div>
                <h3>新事件影響您的路線</h3>
                <p>
                  <strong>{segmentName(checkModal.blockedSegment)}</strong> 剛發生事故，位於您目前的路線上，請選擇：
                </p>

                <div className="route-planner__choice">
                  <div className="route-planner__choice-option">
                    <div className="route-planner__choice-label">維持原路線</div>
                    <div className="route-planner__choice-path">
                      {route?.pathNames.join(' → ')}（會經過事故路段）
                    </div>
                    <button className="route-planner__btn" onClick={keepOldRoute}>維持原路線</button>
                  </div>

                  <div className="route-planner__choice-option">
                    <div className="route-planner__choice-label">改道</div>
                    {checkModal.alternative.reachable ? (
                      <>
                        <div className="route-planner__choice-path">
                          {checkModal.alternative.pathNames.join(' → ')}
                        </div>
                        <button className="route-planner__btn route-planner__btn--accent" onClick={acceptNewRoute}>
                          採用新路線（避開此路段）
                        </button>
                      </>
                    ) : (
                      <div className="route-planner__choice-path">
                        {checkModal.alternative.reason ?? '避開後無可行路徑'}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
