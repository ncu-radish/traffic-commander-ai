"""
Advisory API routes — full SOP processing pipeline for incident response.

Workflow:
1. Receive incident event (by ID or raw data)
2. SOP engine determines which articles are triggered
3. Route planner computes alternative routes (Article 2)
4. ETE calculator estimates recovery time (Article 7)
5. LLM generates natural language advisory report
6. Return structured AdvisoryReport
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from app.models.schemas import (
    AdvisoryRequest,
    AdvisoryReport,
    ReasoningStep,
    ChatRequest,
)
from app.data.repository import repository
from app.services.sop_engine import check_article_2, check_article_5
from app.services.route_planner import plan_routes
from app.services.ete_calculator import calculate_ete
from app.services.traffic_snapshot import snapshot_at
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/advisory", tags=["advisory"])


@router.post("/generate", response_model=AdvisoryReport)
def generate_advisory(
    request: AdvisoryRequest,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    Generate a full advisory report for a given incident.
    Runs the complete SOP processing pipeline.
    """
    # Step 1: Resolve the incident
    incidents_raw = repository.get_live_incidents_raw()
    incident = None

    if request.event_id:
        for inc in incidents_raw:
            if inc.get("event_id") == request.event_id:
                incident = inc
                break
    elif request.event_data:
        incident = request.event_data

    if not incident:
        return AdvisoryReport(
            event_id=request.event_id or "unknown",
            event_description="找不到對應的事件",
            alert_level="normal",
            alert_justification="事件 ID 不存在或未提供事件資料",
        )

    event_id = incident.get("event_id", "unknown")
    event_desc = incident.get("description", "")
    affected_segment = incident.get("affected_segment", "")
    severity = incident.get("severity", "Medium")
    timestamp = request.timestamp or incident.get("timestamp", "")

    # Step 2: SOP article detection
    sop_articles = []
    reasoning_chain = []
    cross_system_actions = []

    art2 = check_article_2(incident)
    art5 = check_article_5(incident)

    step_num = 1

    # Data collection step
    reasoning_chain.append(ReasoningStep(
        step=step_num,
        title="資料收集與事件識別",
        description=f"接收事件 {event_id}：{event_desc}",
        data_evidence=f"affected_segment={affected_segment}, severity={severity}, status={incident.get('status')}",
    ))
    step_num += 1

    if art2:
        sop_articles.append("SOP 第 2 條")
        reasoning_chain.append(ReasoningStep(
            step=step_num,
            title="SOP 第 2 條觸發判定",
            description=art2.description,
            data_evidence=f"status={incident.get('status')}, severity={severity}, affected_segment={affected_segment}",
            sop_reference="SOP 第 2 條：車輛事故與道路封鎖應變",
        ))
        step_num += 1

    if art5:
        sop_articles.append("SOP 第 5 條")
        reasoning_chain.append(ReasoningStep(
            step=step_num,
            title="SOP 第 5 條觸發判定",
            description=art5.description,
            sop_reference="SOP 第 5 條：號誌故障應變",
        ))
        step_num += 1
        cross_system_actions.append("通報台電搶修號誌設備")
        cross_system_actions.append("派遣人工交管警員")

    # Step 3: Route planning (if Article 2 triggered)
    route_plan = None
    if art2 and affected_segment.startswith("RD_"):
        road_network = repository.get_road_network_raw()
        # As-of snapshot rather than an exact-timestamp filter: the feed is
        # sparse, so most timestamps don't have a reading for every segment,
        # which would leave candidates missing and silently break the
        # "lowest saturation wins" tie-break.
        traffic_df = repository.get_traffic_flow_df()
        ts_traffic = snapshot_at(traffic_df, timestamp)
        traffic_records = ts_traffic.to_dict("records") if not ts_traffic.empty else []

        route_plan = plan_routes(
            affected_segment,
            road_network,
            traffic_records,
            incident_location=incident.get("location"),
        )

        reasoning_chain.append(ReasoningStep(
            step=step_num,
            title="替代路線規劃",
            description=f"主要疏散路線：{route_plan.primary_route_name or '無'}，"
                        f"次要路線：{', '.join(route_plan.secondary_routes) if route_plan.secondary_routes else '無'}",
            data_evidence=f"排除路線：{len(route_plan.excluded_routes)} 條",
            sop_reference="SOP 第 2 條：替代路線選擇規則",
        ))
        step_num += 1

    # Step 4: ETE calculation (Article 7)
    # Pull the affected segment's reading as of the incident time. The feed is
    # sparse, so an exact-timestamp filter often misses; fall back to the latest
    # reading at or before the incident time to get real saturation/speed/count
    # figures for the classification evidence (SOP Article 1).
    avg_saturation = 0.5
    seg_evidence: Optional[Dict[str, Any]] = None
    if affected_segment.startswith("RD_"):
        traffic_df = repository.get_traffic_flow_df()
        ts_traffic = snapshot_at(traffic_df, timestamp)
        seg_data = ts_traffic[ts_traffic["Segment_ID"] == affected_segment]
        if not seg_data.empty:
            row = seg_data.iloc[-1]
            avg_saturation = float(row["Saturation_Score"])
            seg_evidence = {
                "road_name": row.get("Road_Name", affected_segment),
                "saturation": avg_saturation,
                "avg_speed": float(row.get("Avg_Speed", 0)),
                "vehicle_count": int(row.get("Vehicle_Count", 0)),
                "data_timestamp": row.get("Timestamp", timestamp),
            }

    ete = calculate_ete(severity, avg_saturation)
    sop_articles.append("SOP 第 7 條")

    reasoning_chain.append(ReasoningStep(
        step=step_num,
        title="ETE 預估恢復時間計算",
        description=f"ETE = {ete.ete_minutes} 分鐘 "
                    f"(基礎清除 {ete.base_clearance} + 壅擠懲罰 {ete.congestion_penalty})",
        data_evidence=f"severity={severity}, avg_saturation={avg_saturation:.2f}",
        sop_reference="SOP 第 7 條：ETE 計算公式",
    ))
    step_num += 1

    # Step 5: Check crowd impacts
    crowd_df = repository.get_crowd_density_df()
    if timestamp and not crowd_df.empty:
        from app.services.sop_engine import check_article_3, check_article_4
        crowd_alerts = check_article_3(crowd_df, timestamp)
        if crowd_alerts:
            sop_articles.append("SOP 第 3 條")
            cross_system_actions.append("通知捷運 BL17 站啟動過站不停")
            cross_system_actions.append("通知客運業者派遣接駁巴士")

        dome_alerts = check_article_4(crowd_df, timestamp)
        if dome_alerts:
            sop_articles.append("SOP 第 4 條")
            cross_system_actions.append("大巨蛋散場機制已啟動，連結接駁分流")

    # Determine alert level
    alert_level = "A" if art2 else ("B" if art5 else "normal")

    # Build a data-backed classification justification. SOP Article 1 grades by
    # saturation (>= 0.95 = A, >= 0.85 = B); cite the affected segment's figures
    # so the level is evidence-based rather than derived from event type alone.
    justification_parts = [
        f"事件 {event_id} 觸發了 {', '.join(sorted(set(sop_articles)))}。",
        f"嚴重程度：{severity}，影響路段：{affected_segment}。",
    ]
    if seg_evidence:
        sat = seg_evidence["saturation"]
        if sat >= 0.95:
            sat_band = "≥ 0.95，符合 SOP 第 1 條 A 級（癱瘓）"
        elif sat >= 0.85:
            sat_band = "≥ 0.85，符合 SOP 第 1 條 B 級（壅擠）"
        else:
            sat_band = "< 0.85，未達 SOP 第 1 條壅擠門檻"
        justification_parts.append(
            f"車流佐證：{seg_evidence['road_name']} 飽和度 {sat:.2f}（{sat_band}），"
            f"車速 {seg_evidence['avg_speed']:.0f} km/h，車輛數 {seg_evidence['vehicle_count']}"
            f"（數據時間 {seg_evidence['data_timestamp']}）。"
        )
        reasoning_chain.append(ReasoningStep(
            step=step_num,
            title="交通分級判定（數據佐證）",
            description=(
                f"事件依 SOP 第 2/5 條判定為 {alert_level} 級；"
                f"並以事故路段車流數據佐證分級。"
            ),
            data_evidence=(
                f"saturation={sat:.2f}, avg_speed={seg_evidence['avg_speed']:.0f}, "
                f"vehicle_count={seg_evidence['vehicle_count']}, "
                f"data_timestamp={seg_evidence['data_timestamp']}"
            ),
            sop_reference="SOP 第 1 條：車流飽和度分級門檻",
        ))
        step_num += 1
    alert_justification = "".join(justification_parts)

    # Step 6: LLM summary generation
    llm_summary = None
    try:
        summary_prompt = (
            f"請根據以下交通事件分析結果，產出一份簡潔的交控中心建議書摘要。\n\n"
            f"事件：{event_desc}\n"
            f"觸發 SOP：{', '.join(sop_articles)}\n"
            f"警報等級：{alert_level}\n"
            f"主要疏散路線：{route_plan.primary_route_name if route_plan else '不適用'}\n"
            f"ETE 預估恢復：{ete.ete_minutes} 分鐘\n"
            f"跨系統協調：{'; '.join(cross_system_actions) if cross_system_actions else '無'}\n\n"
            f"請用中文撰寫，語氣正式但簡潔。"
        )
        llm_response = llm_service.generate_chat_response(
            ChatRequest(message=summary_prompt)
        )
        llm_summary = llm_response.reply
    except Exception:
        llm_summary = None

    return AdvisoryReport(
        event_id=event_id,
        event_description=event_desc,
        sop_articles=list(set(sop_articles)),
        alert_level=alert_level,
        alert_justification=alert_justification,
        route_plan=route_plan,
        ete=ete,
        cross_system_actions=cross_system_actions,
        reasoning_chain=reasoning_chain,
        llm_summary=llm_summary,
    )
