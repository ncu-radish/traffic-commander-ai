import { SEGMENT_COORDINATES } from '../data/roadNetwork';

/* ═══════════════════════════════════════════════════════════════
   路網圖

   把 15 條路段的折線拆成「節點 + 相鄰邊」，路線規劃只在這張圖上走。
   因此任何算出來的路線都必然是既有路段座標的子集合 ——
   不會有起訖點直連的直線，也不會有為了接起來而生成的座標。

   座標一律是 Leaflet 的 [latitude, longitude]。
   ═══════════════════════════════════════════════════════════════ */

/** 節點識別字。同一個路口在不同路段上是同一組座標，字串化後就會相等。 */
export type NodeKey = string;

interface Edge {
  to: NodeKey;
  /** 這條邊屬於哪個路段，用來限制路廊與回推行經路段。 */
  segmentId: string;
  /** 邊長（公尺），作為最短路徑的權重。 */
  weight: number;
}

export interface RoadGraph {
  adjacency: Map<NodeKey, Edge[]>;
  positions: Map<NodeKey, [number, number]>;
}

/** 座標小數位固定，確保共用路口會產生同一個 key。 */
function toKey([lat, lng]: [number, number]): NodeKey {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 兩點距離（公尺）。範圍只有幾公里，用等距圓柱投影就夠精確，
 * 重點是經度差要乘上 cos(緯度)，否則東西向會被高估約 10%。
 */
export function distanceMeters(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2));
  return Math.hypot(dLat, dLng) * EARTH_RADIUS_M;
}

/**
 * 建圖。折線上每一組相鄰座標就是一條邊，雙向都加 ——
 * 這裡要的是「線疊在畫出來的路段上」，不是模擬單行道的合法行進方向。
 */
export function buildRoadGraph(
  segments: Record<string, [number, number][]> = SEGMENT_COORDINATES
): RoadGraph {
  const adjacency = new Map<NodeKey, Edge[]>();
  const positions = new Map<NodeKey, [number, number]>();

  const link = (from: NodeKey, to: NodeKey, segmentId: string, weight: number) => {
    const list = adjacency.get(from);
    const edge: Edge = { to, segmentId, weight };
    if (list) list.push(edge);
    else adjacency.set(from, [edge]);
  };

  for (const [segmentId, coords] of Object.entries(segments)) {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const ka = toKey(a);
      const kb = toKey(b);
      positions.set(ka, a);
      positions.set(kb, b);
      const weight = distanceMeters(a, b);
      link(ka, kb, segmentId, weight);
      link(kb, ka, segmentId, weight);
    }
  }

  return { adjacency, positions };
}

/** 離指定座標最近的路網節點。起訖點用它吸附，確保端點就落在路段上。 */
export function snapToNode(
  graph: RoadGraph,
  target: [number, number]
): { key: NodeKey; position: [number, number]; distance: number } {
  let best: { key: NodeKey; position: [number, number]; distance: number } | null = null;
  for (const [key, position] of graph.positions) {
    const distance = distanceMeters(position, target);
    if (!best || distance < best.distance) best = { key, position, distance };
  }
  if (!best) throw new Error('路網圖沒有任何節點');
  return best;
}

export interface RoadPath {
  /** 依序經過的節點座標，全部取自路段折線。 */
  path: [number, number][];
  /** 實際行經的路段 id，依經過順序、不重複。 */
  segmentIds: string[];
  /** 路徑總長（公尺）。 */
  lengthMeters: number;
}

/**
 * 兩節點間的最短路徑（Dijkstra）。
 *
 * allowedSegmentIds 有值時只走這些路段的邊，用來指定路廊 ——
 * 這是「A 級走幹道、B 級走次幹道」的實作方式：限制可用路段，
 * 而不是把座標寫死。走不到就回傳 null，由呼叫方決定怎麼處理。
 */
export function findPath(
  graph: RoadGraph,
  from: NodeKey,
  to: NodeKey,
  allowedSegmentIds?: readonly string[]
): RoadPath | null {
  const allowed = allowedSegmentIds ? new Set(allowedSegmentIds) : null;

  const best = new Map<NodeKey, number>([[from, 0]]);
  const cameFrom = new Map<NodeKey, { node: NodeKey; segmentId: string }>();
  const settled = new Set<NodeKey>();
  /** 節點數只有數十個，線性取最小值比維護堆積更好讀，成本可忽略。 */
  const frontier = new Set<NodeKey>([from]);

  while (frontier.size > 0) {
    let current: NodeKey | null = null;
    let currentCost = Infinity;
    for (const key of frontier) {
      const cost = best.get(key) ?? Infinity;
      if (cost < currentCost) {
        currentCost = cost;
        current = key;
      }
    }
    if (current === null) break;

    frontier.delete(current);
    settled.add(current);
    if (current === to) break;

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (allowed && !allowed.has(edge.segmentId)) continue;
      if (settled.has(edge.to)) continue;
      const cost = currentCost + edge.weight;
      if (cost < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, cost);
        cameFrom.set(edge.to, { node: current, segmentId: edge.segmentId });
        frontier.add(edge.to);
      }
    }
  }

  if (!settled.has(to) || !best.has(to)) return null;

  const path: [number, number][] = [];
  const segmentsReversed: string[] = [];
  let cursor: NodeKey | undefined = to;
  while (cursor !== undefined) {
    const position = graph.positions.get(cursor);
    if (!position) break;
    path.push(position);
    const step = cameFrom.get(cursor);
    if (!step) break;
    segmentsReversed.push(step.segmentId);
    cursor = step.node;
  }
  path.reverse();
  segmentsReversed.reverse();

  // 連續重複的路段收斂成一次，保留經過順序。
  const segmentIds: string[] = [];
  for (const id of segmentsReversed) {
    if (segmentIds[segmentIds.length - 1] !== id) segmentIds.push(id);
  }

  return { path, segmentIds, lengthMeters: best.get(to) ?? 0 };
}
