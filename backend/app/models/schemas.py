from pydantic import BaseModel
from typing import List, Optional, Dict, Any


# --- Chat Models ---

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


class ChatResponse(BaseModel):
    reply: str
    sop_references: Optional[List[str]] = None
    reasoning_steps: Optional[List[dict]] = None


# --- ETE Models ---

class ETEResult(BaseModel):
    ete_minutes: float
    base_clearance: float
    congestion_penalty: float
    severity: str
    avg_saturation: float


# --- Route Planning Models ---

class ExcludedRoute(BaseModel):
    route: str
    reason: str


class SignalAdjustment(BaseModel):
    road: str
    adjustment: str
    period: str


class RoutePlanResult(BaseModel):
    primary_route: Optional[str] = None
    primary_route_name: Optional[str] = None
    secondary_routes: List[str] = []
    excluded_routes: List[ExcludedRoute] = []
    signal_adjustments: List[SignalAdjustment] = []


# --- SOP Alert Models ---

class SOPAlert(BaseModel):
    article: str
    level: str  # 'A', 'B', 'normal'
    title: str
    description: str
    triggered_by: str
    data_evidence: Dict[str, Any] = {}
    actions: List[str] = []


class AlertCheckResponse(BaseModel):
    timestamp: str
    alerts: List[SOPAlert] = []
    crowd_alerts: List[SOPAlert] = []
    roaming_alerts: List[SOPAlert] = []


# --- Advisory Report Models ---

class ReasoningStep(BaseModel):
    step: int
    title: str
    description: str
    data_evidence: Optional[str] = None
    sop_reference: Optional[str] = None


class AdvisoryReport(BaseModel):
    event_id: str
    event_description: str
    sop_articles: List[str] = []
    alert_level: str
    alert_justification: str
    route_plan: Optional[RoutePlanResult] = None
    ete: Optional[ETEResult] = None
    cross_system_actions: List[str] = []
    reasoning_chain: List[ReasoningStep] = []
    llm_summary: Optional[str] = None


class AdvisoryRequest(BaseModel):
    event_id: Optional[str] = None
    event_data: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None


# --- Multi-Language Alert Models ---

class MultiLangMessages(BaseModel):
    zh: str
    en: Optional[str] = None
    ja: Optional[str] = None
    ko: Optional[str] = None


class MultiLangAlertResponse(BaseModel):
    triggered: bool
    trigger_stations: List[str] = []
    roaming_details: Dict[str, float] = {}
    messages: Optional[MultiLangMessages] = None
    sop_reference: str = "SOP 第 6 條"


class MultiLangAlertRequest(BaseModel):
    timestamp: Optional[str] = None
    context: Optional[str] = None  # Additional context for LLM
