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
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from app.models.schemas import (
    AdvisoryRequest,
    AdvisoryReport,
    ReasoningStep,
    ChatRequest,
    TrendSummaryResponse,
)
from app.data.repository import repository
from app.services.sop_engine import check_article_2, check_article_5
from app.services.route_planner import plan_routes
from app.services.ete_calculator import calculate_ete
from app.services.traffic_snapshot import snapshot_at
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/advisory", tags=["advisory"])


_TREND_SEGMENTS = {
    "RD_TPE_001": "忠孝東路四段",
    "RD_TPE_002": "光復南路",
    "RD_TPE_003": "基隆路一段",
    "RD_TPE_004": "市民大道四段",
    "RD_TPE_006": "敦化南路一段",
}
_TREND_STATIONS = {
    "BS_TPE_DOME": "大巨蛋",
    "BS_MRT_BL17": "BL17 國父紀念館",
    "BS_MRT_BL18": "BL18 市政府",
    "BS_XY_VIESHOW": "信義威秀",
    "BS_TPE_101": "台北101",
}


@router.get("/trend-summary", response_model=TrendSummaryResponse)
def generate_trend_summary(
    timestamp: Optional[str] = None,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    車流飽和度趨勢 / 人流密度趨勢兩張圖表的 LLM 摘要。
    讀的是「timestamp 當下」的 as-of snapshot（不是整段時間的首尾/尖峰），
    所以時間軸移動到哪，摘要就反映當下哪裡壅塞——不是固定不變的總覽。
    事實（各路段/場站當下數值、是否達門檻）在這裡用 Python 算好，LLM 只
    負責把已經算好的事實寫成一句話，避免像多語簡訊那次一樣讓 LLM 自己編數字。
    """
    traffic_facts: list[str] = []
    traffic_df = repository.get_traffic_flow_df()
    if not traffic_df.empty:
        ts_traffic = snapshot_at(traffic_df, timestamp) if timestamp else traffic_df
        for seg_id, seg_name in _TREND_SEGMENTS.items():
            row = ts_traffic[ts_traffic["Segment_ID"] == seg_id]
            if row.empty:
                continue
            sat = float(row.iloc[-1]["Saturation_Score"])
            fact = f"{seg_name}：目前飽和度 {sat:.2f}"
            if sat >= 0.95:
                fact += "（已達 A 級門檻）"
            elif sat >= 0.85:
                fact += "（已達 B 級門檻）"
            traffic_facts.append(fact)

    crowd_facts: list[str] = []
    crowd_df = repository.get_crowd_density_df()
    if not crowd_df.empty:
        ts_crowd = snapshot_at(crowd_df, timestamp, id_col="BS_ID") if timestamp else crowd_df
        for bs_id, st_name in _TREND_STATIONS.items():
            row = ts_crowd[ts_crowd["BS_ID"] == bs_id]
            if row.empty:
                continue
            count = int(row.iloc[-1]["User_Count"])
            crowd_facts.append(f"{st_name}：目前人數 {count:,} 人")

    # 本地小模型即使給了完整清單也常常把路段跟場站搞混、加因果臆測、或
    # 自己加標題。縮小輸入只給「最極端的一條路段+一個場站」與門檻計數，
    # 大幅降低模型能自由發揮、產生混淆內容的空間。
    summary = None
    peak_seg_fact = max(
        traffic_facts,
        key=lambda f: float(f.split("目前飽和度 ")[1][:4]),
        default=None,
    )
    peak_station_fact = max(
        crowd_facts,
        key=lambda f: int(f.split("目前人數 ")[1].split(" 人")[0].replace(",", "")),
        default=None,
    )
    congested_count = sum(1 for f in traffic_facts if "已達" in f)

    # 解決方法不讓LLM自己想——直接沿用SOP第1條已經定義好的A/B級標準動作
    # （app/services/sop_engine.py check_article_1），跟事故建議書用的是
    # 同一套文字，確保「趨勢摘要」講的因應措施跟系統其他地方一致。
    action_fact = None
    if peak_seg_fact:
        peak_sat_value = float(peak_seg_fact.split("目前飽和度 ")[1][:4])
        if peak_sat_value >= 0.95:
            action_fact = "建議措施：啟動替代路徑引導（SOP第2條）、延長綠燈時相25%、派遣交通警察至關鍵路口"
        elif peak_sat_value >= 0.85:
            action_fact = "建議措施：延長綠燈時相25%、準備派遣交通警察"

    if peak_seg_fact or peak_station_fact:
        lines = []
        if peak_seg_fact:
            lines.append(f"目前車流飽和度最高的路段：{peak_seg_fact}")
        if congested_count:
            lines.append(f"目前共有 {congested_count} 條路段達到壅擠門檻")
        if peak_station_fact:
            lines.append(f"目前人流密度最高的場站：{peak_station_fact}")
        if action_fact:
            lines.append(action_fact)

        # 這顆本地小模型測下來即使給了明確指示，還是偶爾會編出清單裡沒有的
        # 數字（例如自己加一個「500多輛」、把場站說成別的名字）。與其只靠
        # prompt教它，這裡直接驗證：LLM輸出裡出現的每一個數字都必須能在
        # 給它的事實清單裡找到，抓到不在清單裡的數字就整句丟掉、改用
        # 事實清單直接拼成的保底句子，確保顯示的內容一定跟真實數據一致。
        fallback_summary = "；".join(lines) + "。"
        allowed_numbers = set(re.findall(r"\d+(?:\.\d+)?", "\n".join(lines).replace(",", "")))

        summary = fallback_summary
        try:
            prompt = (
                "請把以下已經算好的數據寫成一段簡短中文摘要（不超過70字，"
                "純文字、不要標題、不要條列、不要markdown符號、全部使用"
                "繁體中文、不可以夾雜任何英文單字）。"
                "只能使用下面列出的數字，不可以自己編造數字，也不可以推測"
                "路段與場站之間有因果關係。如果有列出「建議措施」，請照抄"
                "納入摘要最後，不可以自己改寫成別的建議。\n\n" + "\n".join(lines)
            )
            llm_response = llm_service.generate_chat_response(
                ChatRequest(message=prompt)
            )
            # 安全網：即使叮嚀了還是可能夾雜markdown標題或條列符號，這裡濾掉。
            raw_lines = [
                ln.strip().lstrip("#-*• ")
                for ln in llm_response.reply.splitlines()
                if ln.strip() and not ln.strip().startswith("#")
            ]
            llm_summary = " ".join(raw_lines) if raw_lines else None
            if llm_summary:
                reply_numbers = set(re.findall(r"\d+(?:\.\d+)?", llm_summary.replace(",", "")))
                if reply_numbers.issubset(allowed_numbers):
                    summary = llm_summary
        except Exception:
            pass

    return TrendSummaryResponse(
        summary=summary,
        traffic_facts=traffic_facts,
        crowd_facts=crowd_facts,
    )


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
    cross_system_actions = []  # 本次事故（第2/5條）直接觸發的協調動作
    concurrent_conditions = []  # 同一時間點另外偵測到、跟本次事故無因果關係的狀況

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
    # 第3/4條的觸發條件只看「當下時間點」的人流資料，跟本次事故（第2/5條，
    # 看的是incident本身）完全是兩條獨立規則。剛好同一時間點都成立時，
    # 不能算進 cross_system_actions（那是「本次事故要求的協調」），
    # 只能算「同時偵測到的其他狀況」，報告要誠實區分開，不能暗示因果關係。
    crowd_df = repository.get_crowd_density_df()
    if timestamp and not crowd_df.empty:
        from app.services.sop_engine import check_article_3, check_article_4
        crowd_alerts = check_article_3(crowd_df, timestamp)
        if crowd_alerts:
            sop_articles.append("SOP 第 3 條")
            concurrent_conditions.append("（同時偵測，非本次事故觸發）通知捷運 BL17 站啟動過站不停")
            concurrent_conditions.append("（同時偵測，非本次事故觸發）通知客運業者派遣接駁巴士")
            reasoning_chain.append(ReasoningStep(
                step=step_num,
                title="同時偵測：SOP 第 3 條門檻（與本次事故無因果關係）",
                description=(
                    "此判定只看事故發生當下時間點的 BL17 站人流資料，"
                    "跟本次事故的地點/成因無關，只是剛好同一時間點成立。"
                ),
                sop_reference="SOP 第 3 條：捷運與接駁分流",
            ))
            step_num += 1

        dome_alerts = check_article_4(crowd_df, timestamp)
        if dome_alerts:
            sop_articles.append("SOP 第 4 條")
            concurrent_conditions.append("（同時偵測，非本次事故觸發）大巨蛋散場機制已啟動，連結接駁分流")
            reasoning_chain.append(ReasoningStep(
                step=step_num,
                title="同時偵測：SOP 第 4 條門檻（與本次事故無因果關係）",
                description=(
                    "此判定只看事故發生當下時間點的大巨蛋人流資料，"
                    "跟本次事故的地點/成因無關，只是剛好同一時間點成立。"
                ),
                sop_reference="SOP 第 4 條：大巨蛋散場啟動",
            ))
            step_num += 1

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
            f"本次事故要求之跨系統協調：{'; '.join(cross_system_actions) if cross_system_actions else '無'}\n"
            f"同一時間點另外偵測到、與本次事故無關的狀況：{'; '.join(concurrent_conditions) if concurrent_conditions else '無'}\n\n"
            f"請用中文撰寫，語氣正式但簡潔。若有「同一時間點另外偵測到」的狀況，"
            f"請明確說明那是另外偵測到的，不是本次事故造成的，避免暗示因果關係。"
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
        concurrent_conditions=concurrent_conditions,
        reasoning_chain=reasoning_chain,
        llm_summary=llm_summary,
    )
