import { SEGMENT_COORDINATES, SEGMENT_NAMES } from './roadNetwork';
import { COMMUTE_ROUTES } from './commuteRoutes';

/* ═══════════════════════════════════════════════════════════════
   校車停靠站

   站點不另外寫死，而是直接取自地圖上那條建議路線（路線 3）的節點，
   站名由該節點相交的路段名稱組出來。所以名單上的下車站點必然落在
   地圖畫出來的模擬路線上，兩邊不會各說一套。

   方向是放學：校車自學校出發，沿建議路線反向行駛回住家方向，
   學生在沿線站點下車。因此站序是路線節點的反序，並去掉起點（學校）。
   ═══════════════════════════════════════════════════════════════ */

const keyOf = ([lat, lng]: [number, number]) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/** 節點 → 經過該節點的路段 id。 */
const segmentsByNode = new Map<string, string[]>();
for (const [segmentId, coords] of Object.entries(SEGMENT_COORDINATES)) {
  for (const point of coords) {
    const k = keyOf(point);
    const ids = segmentsByNode.get(k);
    if (ids) {
      if (!ids.includes(segmentId)) ids.push(segmentId);
    } else {
      segmentsByNode.set(k, [segmentId]);
    }
  }
}

export interface CommuteStop {
  position: [number, number];
  /** 路口名稱，例如「市府路／松壽路口」。 */
  name: string;
}

/**
 * 把路線節點命名成路口。
 * 路線行經的那條路排在前面、交會的路排在後面，讀起來就是
 * 「行駛路線／交叉路口」。
 */
function nameNode(position: [number, number], routeSegmentIds: string[]): string {
  const ids = segmentsByNode.get(keyOf(position)) ?? [];
  const onRoute: string[] = [];
  const crossing: string[] = [];
  for (const id of ids) {
    const name = SEGMENT_NAMES[id];
    if (!name) continue;
    (routeSegmentIds.includes(id) ? onRoute : crossing).push(name);
  }
  const ordered = [...onRoute, ...crossing];
  if (ordered.length >= 2) return `${ordered[0]}／${ordered[1]}口`;
  return ordered[0] ?? '未知路段';
}

/**
 * 放學校車的停靠站，依行駛順序排列（學校 → 住家方向）。
 * 空陣列代表路線沒算出來，呼叫方要能容忍。
 */
export const DROP_OFF_STOPS: CommuteStop[] = (() => {
  const route = COMMUTE_ROUTES.find((r) => r.id === 'ROUTE_CLEAR');
  if (!route) return [];
  // 反序 = 放學方向；去掉第一個（學校，是上車地點而非下車站）。
  return [...route.path]
    .reverse()
    .slice(1)
    .map((position) => ({ position, name: nameNode(position, route.segmentIds) }));
})();
