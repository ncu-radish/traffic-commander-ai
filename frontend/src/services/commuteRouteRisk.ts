import type {
  CommuteRoute,
  CommuteRouteAssessment,
  TrafficSegment,
  AccidentHotspots,
  RouteRiskLevel,
} from '../types';
import { saturationLevel, threshold } from '../theme/tokens';

/* ═══════════════════════════════════════════════════════════════
   上下學路線風險評估

   純函式，不碰 React、不碰後端。輸入「當下時間點的車流」與
   「事故熱點統計」，輸出三條路線的分級、事故件數與推薦結果。

   分級標準與地圖、SOP 第 1 條一致（沿用 theme/tokens 的門檻），
   所以路線上的顏色與路段本身的顏色說的是同一件事。
   ═══════════════════════════════════════════════════════════════ */

/**
 * 事故風險門檻，單位是「平均每路段事故件數」。
 *
 * 刻意用強度而不是路線總件數：路線越長總件數一定越高，
 * 若用總件數分級，會懲罰「多繞一兩段但走安全道路」的路線。
 * 門檻依本資料集的分布訂（單一路段 0–296 件）。
 */
export const ACCIDENT_THRESHOLD = {
  /** 平均每路段達此值視為高肇事廊道。 */
  high: 150,
  /** 平均每路段達此值視為中度肇事廊道。 */
  medium: 80,
} as const;

const RISK_RANK: Record<RouteRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

/**
 * 綜合壅塞級別與事故件數決定路線風險。
 * 兩者取較嚴重的一邊 —— 順暢但常肇事的路不算安全，
 * 沒事故但已癱瘓的路也不該推薦給趕上學的孩子。
 */
function toRisk(
  level: 'A' | 'B' | 'watch' | 'ok',
  accidentIntensity: number
): RouteRiskLevel {
  const byCongestion: RouteRiskLevel =
    level === 'A' ? 'HIGH' : level === 'B' ? 'MEDIUM' : 'LOW';

  const byAccident: RouteRiskLevel =
    accidentIntensity >= ACCIDENT_THRESHOLD.high
      ? 'HIGH'
      : accidentIntensity >= ACCIDENT_THRESHOLD.medium
        ? 'MEDIUM'
        : 'LOW';

  return RISK_RANK[byCongestion] >= RISK_RANK[byAccident]
    ? byCongestion
    : byAccident;
}

const LEVEL_TEXT: Record<'A' | 'B' | 'watch' | 'ok', string> = {
  A: 'A 級癱瘓',
  B: 'B 級壅擠',
  watch: '車流偏多',
  ok: '順暢',
};

/**
 * 評估單一路線。
 *
 * 只用「此時間點有讀數」的路段算飽和度；資料集不是每個路段每個時間點
 * 都有讀數，缺讀數時不能當成 0（那會把路線誤判成順暢），所以另外回報
 * measuredSegments 讓畫面說清楚樣本數。
 */
export function assessCommuteRoute(
  route: CommuteRoute,
  traffic: TrafficSegment[],
  hotspots: AccidentHotspots | null
): Omit<CommuteRouteAssessment, 'recommended'> {
  const byId = new Map(traffic.map((t) => [t.segmentId, t]));

  let maxSaturation = 0;
  let worstSegmentName: string | null = null;
  let speedSum = 0;
  let measuredSegments = 0;

  for (const segmentId of route.segmentIds) {
    const reading = byId.get(segmentId);
    if (!reading) continue;
    measuredSegments += 1;
    speedSum += reading.avgSpeed;
    if (reading.saturationScore > maxSaturation) {
      maxSaturation = reading.saturationScore;
      worstSegmentName = reading.roadName;
    }
  }

  const accidentSegments = route.segmentIds
    .map((segmentId) => {
      const hotspot = hotspots?.segments?.[segmentId];
      if (!hotspot || hotspot.total === 0) return null;
      return { name: hotspot.name, total: hotspot.total };
    })
    .filter((s): s is { name: string; total: number } => s !== null)
    .sort((a, b) => b.total - a.total);

  const accidentTotal = accidentSegments.reduce((sum, s) => sum + s.total, 0);
  // 路線 3 不行經任何路網路段，segmentIds 為空 —— 這裡要避免除以零。
  const accidentIntensity =
    route.segmentIds.length > 0 ? accidentTotal / route.segmentIds.length : 0;

  const level = measuredSegments > 0 ? saturationLevel(maxSaturation) : 'ok';
  const risk = toRisk(level, accidentIntensity);

  /**
   * 保險分支：路廊完全繞開主辦方路網時沒有讀數可談，理由要另外寫清楚。
   * 目前三條路線都行經路網路段，所以不會走到這裡。
   */
  const offNetwork = route.segmentIds.length === 0;

  const reasons: string[] = [];

  if (offNetwork) {
    reasons.push('全程未行經主辦方路網涵蓋的 15 條幹道，無壅塞讀數');
    reasons.push('無事故熱點紀錄，為三條路線中風險最低者');

    return {
      route,
      level: 'ok',
      maxSaturation: 0,
      worstSegmentName: null,
      avgSpeed: null,
      measuredSegments: 0,
      totalSegments: 0,
      accidentTotal: 0,
      accidentIntensity: 0,
      accidentSegments: [],
      risk: 'LOW',
      reasons,
    };
  }

  if (measuredSegments === 0) {
    reasons.push('此時間點路線上無車流讀數，僅依事故熱點評估');
  } else if (level === 'A') {
    reasons.push(
      `${worstSegmentName} 飽和度 ${(maxSaturation * 100).toFixed(0)}%，已達 A 級癱瘓門檻（SOP 第 1 條）`
    );
  } else if (level === 'B') {
    reasons.push(
      `${worstSegmentName} 飽和度 ${(maxSaturation * 100).toFixed(0)}%，已達 B 級壅擠門檻（SOP 第 1 條）`
    );
  } else {
    reasons.push(
      `路線最高飽和度 ${(maxSaturation * 100).toFixed(0)}%，未達 B 級門檻 ${(threshold.saturationB * 100).toFixed(0)}%`
    );
  }

  if (accidentTotal === 0) {
    reasons.push('行經路段皆非事故熱點');
  } else {
    const top = accidentSegments[0];
    reasons.push(
      `沿線事故合計 ${accidentTotal} 件（平均每路段 ${accidentIntensity.toFixed(0)} 件），最高為 ${top.name} ${top.total} 件`
    );
  }

  return {
    route,
    level,
    maxSaturation,
    worstSegmentName,
    avgSpeed: measuredSegments > 0 ? Math.round(speedSum / measuredSegments) : null,
    measuredSegments,
    totalSegments: route.segmentIds.length,
    accidentTotal,
    accidentIntensity,
    accidentSegments,
    risk,
    reasons,
  };
}

/**
 * 評估全部候選路線並挑出推薦路線。
 *
 * 排序依據：風險等級 → 事故件數 → 最高飽和度。
 * 三者都是越小越好，所以第一名就是推薦路線。
 */
export function assessCommuteRoutes(
  routes: CommuteRoute[],
  traffic: TrafficSegment[],
  hotspots: AccidentHotspots | null
): CommuteRouteAssessment[] {
  const assessed = routes.map((route) => assessCommuteRoute(route, traffic, hotspots));

  let bestIndex = 0;
  assessed.forEach((candidate, index) => {
    const best = assessed[bestIndex];
    const better =
      RISK_RANK[candidate.risk] < RISK_RANK[best.risk] ||
      (RISK_RANK[candidate.risk] === RISK_RANK[best.risk] &&
        (candidate.accidentIntensity < best.accidentIntensity ||
          (candidate.accidentIntensity === best.accidentIntensity &&
            candidate.maxSaturation < best.maxSaturation)));
    if (better) bestIndex = index;
  });

  return assessed.map((candidate, index) => ({
    ...candidate,
    recommended: index === bestIndex,
  }));
}

/** 風險等級對應的顯示文字與樣式 class，畫面與地圖圖例共用。 */
export const RISK_META: Record<
  RouteRiskLevel,
  { label: string; icon: string; tone: string; badge: string }
> = {
  HIGH: { label: '高風險', icon: '▲', tone: 'is-a', badge: 'badge-danger' },
  MEDIUM: { label: '中風險', icon: '◆', tone: 'is-b', badge: 'badge-warning' },
  LOW: { label: '低風險', icon: '●', tone: 'is-ok', badge: 'badge-success' },
};

export { LEVEL_TEXT };
