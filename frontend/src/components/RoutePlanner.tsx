import { useState, useEffect, useCallback, useRef } from 'react';
import type { RoadSegment, LiveIncident, CrowdDensity } from '../types';
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
  crowdData: CrowdDensity[];
  /** 讓地圖把目前規劃出的路徑畫出來。 */
  onRouteChange?: (segmentIds: string[]) => void;
  /** 使用者在地圖上點選位置後解析出的最近路段 id + 名稱；「定位」概念上是一個點，這只是拿最近的路段當路網圖的進入節點。 */
  pickedStart?: { segmentId: string; name: string } | null;
  /** 目前是否處於「點地圖設定位置」模式——用來切換按鈕文字、提示使用者去點地圖。 */
  pickingActive?: boolean;
  onRequestPick?: () => void;
}

/** SOP第3條的門檻：任一站點成長率>30%或人數>25,000，就有理由建議改搭大眾運輸。 */
function isCrowdSurging(c: CrowdDensity): boolean {
  return c.growthRate > 0.3 || c.userCount > 25000;
}

/**
 * 使用者導航模擬：起訖點選路段、算一條盡量避開壅塞/封閉路段的模擬路徑。
 * 不是精確導航——路網座標是近似值，用途是示範「路網重規劃」的多跳版本。
 */
export default function RoutePlanner({
  roadNetwork, activeIncidents, currentTimestamp, crowdData, onRouteChange,
  pickedStart, pickingActive, onRequestPick,
}: RoutePlannerProps) {
  const [startId, setStartId] = useState('');
  const [endId, setEndId] = useState('');

  useEffect(() => {
    if (pickedStart) setStartId(pickedStart.segmentId);
  }, [pickedStart]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkModal, setCheckModal] = useState<RouteCheckModal | null>(null);

  const routeRef = useRef<RouteResult | null>(null);
  routeRef.current = route;
  const checkedIncidentIdsRef = useRef<Set<string>>(new Set());

  /**
   * 「影響路線」不是只有事故路段本身在我的行駛路徑上，
   * 事故路段跟我路徑上某一段路「路口交叉」也算——現實中路口封閉會回堵、
   * 影響到經過同一路口的其他方向車流，不是只有真正在那條路上開的人受影響。
   */
  const incidentTouchesRoute = useCallback(
    (affectedSegmentId: string, path: string[]) => {
      if (path.includes(affectedSegmentId)) return true;
      const affected = roadNetwork.find((s) => s.segmentId === affectedSegmentId);
      if (!affected) return false;
      return path.some((segId) => {
        const seg = roadNetwork.find((s) => s.segmentId === segId);
        if (!seg) return false;
        return seg.intersections.includes(affected.name) || affected.intersections.includes(seg.name);
      });
    },
    [roadNetwork],
  );

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
    const affectedIncident = newIncidents.find((i) => incidentTouchesRoute(i.affectedSegment, current.path));

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

  // 路線沿途若有基地台人潮異常（SOP第3條門檻），提醒可以考慮改搭大眾運輸——
  // 不是另外做一套多模式路線演算法，只是把已經有的人流資料變成一句實用建議。
  const transitSuggestion = (() => {
    if (!route?.reachable) return null;
    const nearbyStationIds = new Set(
      route.path.flatMap((segId) => roadNetwork.find((s) => s.segmentId === segId)?.nearbyStations ?? []),
    );
    if (nearbyStationIds.size === 0) return null;
    const surging = crowdData.filter((c) => nearbyStationIds.has(c.bsId) && isCrowdSurging(c));
    if (surging.length === 0) return null;
    return surging[0];
  })();

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
          目前位置（點地圖上的一個點，取最近路段）
          <div className="route-planner__position-row">
            <span className="route-planner__position-value">
              {startId ? segmentName(startId) : '尚未設定位置'}
            </span>
            <button
              type="button"
              className={`route-planner__pick-btn${pickingActive ? ' route-planner__pick-btn--active' : ''}`}
              onClick={onRequestPick}
            >
              {pickingActive ? '請點擊地圖…' : '在地圖上點選位置'}
            </button>
          </div>
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

          {transitSuggestion && (
            <div className="route-planner__transit-tip">
              <strong>{transitSuggestion.locationName}</strong> 人潮異常
              （{transitSuggestion.userCount.toLocaleString()} 人，成長率 {(transitSuggestion.growthRate * 100).toFixed(0)}%），
              建議可考慮改搭大眾運輸，避開沿途人潮壅塞。
            </div>
          )}
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
