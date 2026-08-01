export interface TrafficSegment {
  timestamp: string;
  segmentId: string;
  roadName: string;
  avgSpeed: number;
  vehicleCount: number;
  saturationScore: number;
  laneStatus: string;
}

export interface CrowdDensity {
  timestamp: string;
  bsId: string;
  locationName: string;
  userCount: number;
  stayTimeAvg: number;
  growthRate: number;
  roamingUserPct: number;
}

export interface RoadSegment {
  segmentId: string;
  name: string;
  flowDirection: string;
  intersections: string[];
  capacityVph: number;
  alternatives: string[];
  nearbyStations: string[];
}

export interface LiveIncident {
  eventId: string;
  type: string;
  location: string;
  affectedSegment: string;
  affectedRoad?: string;
  status: string;
  severity: string;
  description: string;
  timestamp: string;
}

export type AlertLevel = 'normal' | 'B' | 'A';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sopReferences?: string[];
}

export interface AdvisoryReport {
  eventId: string;
  eventDescription: string;
  sopArticles: string[];
  alertLevel: AlertLevel;
  alertJustification: string;
  primaryRoute: string;
  secondaryRoutes: string[];
  excludedRoutes: { route: string; reason: string }[];
  signalAdjustments: { road: string; adjustment: string; period: string }[];
  crossSystemActions: string[];
  eteMinutes: number;
  eteBreakdown: { baseClearance: number; congestionPenalty: number };
  reasoningChain: ReasoningStep[];
}

export interface ReasoningStep {
  step: number;
  title: string;
  description: string;
  dataEvidence?: string;
  sopReference?: string;
}

export interface MultiLangAlert {
  triggered: boolean;
  triggerStation: string;
  roamingPct: number;
  messages: {
    zh: string;
    en: string;
    ja: string;
    ko: string;
  };
}

export interface DashboardState {
  currentTimestamp: string;
  availableTimestamps: string[];
  isPlaying: boolean;
  playbackSpeed: number;
  activeIncidents: LiveIncident[];
  alerts: AlertBanner[];
}

export interface AlertBanner {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: string;
  sopArticle?: string;
  dismissed: boolean;
}

export interface AccidentHotspotSegment {
  name: string;
  total: number;
  a1Fatal: number;
  a2Injury: number;
}

export interface AccidentHotspots {
  source: string;
  year: string;
  method: string;
  matchedTotal: number;
  segments: Record<string, AccidentHotspotSegment>;
}

/* ═══════════════════════════════════════════════════════════════
   上下學路線模擬 (Commute route simulation)

   固定一組起訖點，提供三條沿真實路段行走的候選路線；
   分級不是寫死的，而是用當下時間點的車流飽和度 + 事故熱點資料算出來。
   ═══════════════════════════════════════════════════════════════ */

export type RouteRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** 起訖點。 */
export interface CommuteWaypoint {
  label: string;
  detail: string;
  position: [number, number];
}

export interface CommuteRoute {
  id: string;
  name: string;
  /** 圖例用的短名稱。 */
  shortName: string;
  /** 一句話說明這條路線的性格（主幹道／次幹道／低風險替代）。 */
  summary: string;
  /**
   * 這條路線的固定顏色，對應 theme/tokens 的 level 配色。
   * 綁在「路線身分」而不是計算出的風險等級 —— 否則兩條路線風險相同時
   * 顏色會撞在一起，就分不出是哪一條。
   */
  colorKey: 'a' | 'b' | 'ok';
  /** 線條虛實樣式。除了顏色再多一層區分，不單靠顏色辨識。 */
  dashArray?: string;
  /**
   * 實際畫在地圖上的折線。座標都取自 TrafficMap 的路段幾何，
   * 兩段路段端點不相接處會補一小段路口銜接，讓線貼合道路而不斷開。
   */
  path: [number, number][];
  /** 這條路線行經的路段 id，用來計算飽和度與事故風險。 */
  segmentIds: string[];
}

/** 依即時資料評估後的路線。 */
export interface CommuteRouteAssessment {
  route: CommuteRoute;
  /** 路線上最壅塞路段的 SOP 第 1 條級別。 */
  level: 'A' | 'B' | 'watch' | 'ok';
  maxSaturation: number;
  worstSegmentName: string | null;
  avgSpeed: number | null;
  /** 此時間點有車流讀數的路段數 / 總路段數。 */
  measuredSegments: number;
  totalSegments: number;
  /** 事故熱點件數合計（三年合併統計）。 */
  accidentTotal: number;
  /**
   * 平均每路段事故件數。
   * 分級用強度而非總件數，否則路線越長就一定越危險，
   * 對「繞遠一點但走安全道路」的路線不公平。
   */
  accidentIntensity: number;
  accidentSegments: { name: string; total: number }[];
  risk: RouteRiskLevel;
  /** 綜合壅塞與事故後，系統推薦的路線。 */
  recommended: boolean;
  /** 判定理由，直接顯示給指揮官／家長看。 */
  reasons: string[];
}
