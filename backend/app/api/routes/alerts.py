"""
Alerts API routes — SOP threshold checking and multi-language alert generation.
"""
from fastapi import APIRouter, Depends
from typing import Optional
from app.models.schemas import (
    AlertCheckResponse,
    MultiLangAlertRequest,
    MultiLangAlertResponse,
    MultiLangMessages,
)
from app.data.repository import repository
from app.services.sop_engine import check_all_sop_thresholds, check_article_6
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/check", response_model=AlertCheckResponse)
def check_sop_thresholds(timestamp: str):
    """
    Check all SOP thresholds for a given timestamp.
    Returns triggered alerts for traffic, crowd, and roaming.
    """
    traffic_df = repository.get_traffic_flow_df()
    crowd_df = repository.get_crowd_density_df()
    incidents = repository.get_live_incidents_raw()

    return check_all_sop_thresholds(traffic_df, crowd_df, timestamp, incidents)


@router.post("/multilang", response_model=MultiLangAlertResponse)
def generate_multilang_alert(
    request: MultiLangAlertRequest,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    Generate multi-language alert messages (SOP Article 6).
    Checks roaming threshold and uses LLM to generate translated alerts.
    """
    crowd_df = repository.get_crowd_density_df()

    # Determine timestamp
    if request.timestamp:
        ts = request.timestamp
    else:
        # Use the latest available timestamp
        ts = crowd_df["Timestamp"].max() if not crowd_df.empty else ""

    # Check Article 6
    roaming_alerts = check_article_6(crowd_df, ts)

    if not roaming_alerts:
        return MultiLangAlertResponse(
            triggered=False,
            trigger_stations=[],
            roaming_details={},
            messages=None,
        )

    # Collect trigger details
    trigger_stations = [a.triggered_by for a in roaming_alerts]
    roaming_details = {
        a.triggered_by: a.data_evidence.get("roaming_user_pct", 0)
        for a in roaming_alerts
    }

    # Build context for LLM
    context_parts = [
        f"時間: {ts}",
        f"觸發站點: {', '.join(trigger_stations)}",
    ]
    for alert in roaming_alerts:
        ev = alert.data_evidence
        context_parts.append(
            f"- {ev.get('location_name', '')}: 漫遊比率 {ev.get('roaming_user_pct', 0)*100:.0f}%, "
            f"人數 {ev.get('user_count', 0):,}"
        )
    if request.context:
        context_parts.append(f"額外背景: {request.context}")

    context_str = "\n".join(context_parts)

    # Use LLM to generate multi-language messages
    from app.models.schemas import ChatRequest
    llm_request = ChatRequest(
        message=f"請根據以下資訊，產出符合 SOP 第 6 條的多語化告警簡訊。"
                f"簡訊需簡短、適合 CMS 電子看板與手機推播，避免使用專業術語。"
                f"請分別產出中文、英文、日文、韓文四個版本。"
                f"格式：每種語言各一行，以 [ZH], [EN], [JA], [KO] 標記。\n\n{context_str}"
    )
    llm_response = llm_service.generate_chat_response(llm_request)

    # Parse LLM response into language blocks
    messages = _parse_multilang(llm_response.reply, context_str)

    return MultiLangAlertResponse(
        triggered=True,
        trigger_stations=trigger_stations,
        roaming_details=roaming_details,
        messages=messages,
    )


def _parse_multilang(llm_text: str, fallback_context: str) -> MultiLangMessages:
    """Parse LLM output into language-specific messages."""
    zh = _extract_lang(llm_text, "[ZH]", "[EN]")
    en = _extract_lang(llm_text, "[EN]", "[JA]")
    ja = _extract_lang(llm_text, "[JA]", "[KO]")
    ko = _extract_lang(llm_text, "[KO]", None)

    # Fallback if parsing fails
    if not zh:
        zh = f"【交通警報】信義計畫區交通管制中，請改道行駛。{fallback_context[:50]}"
    if not en:
        en = "Traffic alert: Xinyi District traffic control in effect. Please use alternative routes."

    return MultiLangMessages(zh=zh, en=en, ja=ja, ko=ko)


def _extract_lang(text: str, start_tag: str, end_tag: Optional[str]) -> Optional[str]:
    """Extract text between language tags."""
    start_idx = text.find(start_tag)
    if start_idx == -1:
        return None
    start_idx += len(start_tag)
    if end_tag:
        end_idx = text.find(end_tag, start_idx)
        if end_idx == -1:
            return text[start_idx:].strip()
        return text[start_idx:end_idx].strip()
    return text[start_idx:].strip()
