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
