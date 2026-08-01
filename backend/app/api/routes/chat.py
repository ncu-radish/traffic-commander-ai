"""
Chat API routes — interactive strategic advisory with RAG-enhanced LLM.
"""
from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest, ChatResponse
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/chat", tags=["chat"])


def _extract_timestamp_from_message(message: str, available_timestamps: list) -> str | None:
    """
    Try to extract a timestamp reference from the user's actual question
    (not the frontend-injected context prefix) and match it to the closest
    available timestamp in the dataset.
    """
    import re

    # Strip the frontend context prefix like "[當前時間：2026-05-20 23:15，關注路段：...]"
    # The user's actual question starts after the ]\n
    actual_message = message
    if message.startswith("[") and "]\n" in message:
        actual_message = message.split("]\n", 1)[1]

    # Match patterns like "21:30", "21:00", "2026-05-20 21:30"
    time_patterns = [
        r"(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})",  # full datetime
        r"(\d{1,2}:\d{2})",  # just time HH:MM
    ]

    for pattern in time_patterns:
        match = re.search(pattern, actual_message)
        if match:
            time_str = match.group(1)
            # If it's just HH:MM, try to find matching timestamp
            if len(time_str) <= 5:
                # Pad hour if needed
                if len(time_str) == 4:
                    time_str = "0" + time_str
                matches = [ts for ts in available_timestamps if time_str in ts]
                if matches:
                    return matches[0]
            else:
                # Full datetime — find exact or closest match
                if time_str in available_timestamps:
                    return time_str
                matches = [ts for ts in available_timestamps if time_str in ts]
                if matches:
                    return matches[0]

    # If user didn't mention a specific time, check if the frontend context has one
    # and use it as the "current time" reference
    if message.startswith("[") and "]\n" in message:
        prefix = message.split("]\n", 1)[0]
        for pattern in time_patterns:
            match = re.search(pattern, prefix)
            if match:
                time_str = match.group(1)
                if len(time_str) <= 5:
                    if len(time_str) == 4:
                        time_str = "0" + time_str
                    matches = [ts for ts in available_timestamps if time_str in ts]
                    if matches:
                        return matches[0]
                else:
                    if time_str in available_timestamps:
                        return time_str
                    matches = [ts for ts in available_timestamps if time_str in ts]
                    if matches:
                        return matches[0]

    return None


def _snapshot_at(df, ts: str, id_col: str = "Segment_ID"):
    """
    Latest reading per entity (segment or station) at or before `ts`.

    The data feeds are sparse — most timestamps report only a handful of
    entities — so filtering on an exact timestamp would leave the rest looking
    unreported. Timestamps use a zero-padded "YYYY-MM-DD HH:MM" format, so
    plain string comparison orders them correctly.
    """
    if df.empty or ts is None:
        return df
    subset = df[df["Timestamp"] <= ts]
    if subset.empty:
        return subset
    return subset.sort_values("Timestamp").groupby(id_col, as_index=False).tail(1)


def _build_route_plan_context(
    message: str,
    road_network: list,
    traffic_df,
    incidents: list,
    resolved_ts,
) -> str:
    """
    Run the SOP Article 2 route selection algorithm and format the result.

    The guideline requires route replanning to be a program computation with the
    LLM only writing the guidance text, so the primary/secondary/excluded
    decision is made here rather than left to the model's own reasoning.
    """
    from app.services.route_planner import plan_routes

    by_id = {r["segment_id"]: r for r in road_network}

    # Which segments need a plan: incidents that meet SOP Article 2, plus any
    # road segment the operator named in the question.
    targets: dict = {}  # segment_id -> incident location (or None)

    for inc in incidents or []:
        seg_id = inc.get("affected_segment", "")
        if not seg_id.startswith("RD_") or seg_id not in by_id:
            continue
        if inc.get("status") in {"Closed", "Blocked", "Restricted"} and inc.get(
            "severity"
        ) in {"High", "Critical"}:
            targets[seg_id] = inc.get("location")

    for seg in road_network:
        if seg["name"] in message or seg["segment_id"] in message:
            if seg.get("alternatives"):
                targets.setdefault(seg["segment_id"], None)

    if not targets:
        return ""

    use_ts = resolved_ts if resolved_ts else (
        traffic_df["Timestamp"].max() if not traffic_df.empty else None
    )
    # Use the as-of snapshot so every candidate has a real saturation value;
    # an exact-timestamp filter would leave most of them missing and the
    # "lowest saturation wins" tie-break would fall back to a default.
    traffic_records = (
        _snapshot_at(traffic_df, use_ts).to_dict("records")
        if use_ts is not None and not traffic_df.empty
        else []
    )

    sat_lookup = {
        r["Segment_ID"]: float(r["Saturation_Score"]) for r in traffic_records
    }

    blocks = []
    for seg_id, location in targets.items():
        plan = plan_routes(
            seg_id,
            road_network,
            traffic_records,
            incident_location=location,
        )

        seg_name = by_id[seg_id]["name"]
        lines = [
            f"[系統計算之疏散路徑 — {seg_name} ({seg_id}) 封閉，依 SOP 第 2 條 a 項，"
            f"飽和度基準 {use_ts}]"
        ]
        if location:
            lines.append(f"  事故位置：{location}")

        if plan.primary_route:
            primary_sat = sat_lookup.get(plan.primary_route)
            sat_text = f"，飽和度 {primary_sat:.2f}" if primary_sat is not None else ""
            lines.append(
                f"  主疏散：{plan.primary_route_name} ({plan.primary_route}){sat_text}"
            )
            # SOP Article 2a: a congested primary route is still kept, but the
            # report must flag the congestion and recommend transit in parallel.
            if primary_sat is not None and primary_sat >= 0.85:
                lines.append(
                    f"    註：主疏散路段已壅塞（{primary_sat:.2f} >= 0.85），依 SOP 第 2 條 a 項"
                    f"仍維持該路徑並啟動長綠燈時制，報告須註明壅塞並建議併行大眾運輸。"
                )
        else:
            lines.append(
                "  主疏散：無符合條件之路段（該路段之 alternatives 均未通過 SOP 第 2 條 a 項"
                "三項篩選，詳見下方排除理由；此為資料本身之結果，非計算失敗）"
            )

        if plan.secondary_routes:
            lines.append(f"  次要疏散（相交路口位於下游）：{', '.join(plan.secondary_routes)}")

        if plan.excluded_routes:
            lines.append("  排除路段：")
            for ex in plan.excluded_routes:
                lines.append(f"    - {ex.route}：{ex.reason}")

        if plan.signal_adjustments:
            lines.append("  號誌調整：")
            for sig in plan.signal_adjustments:
                lines.append(f"    - {sig.road}：{sig.adjustment}（{sig.period}）")

        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


def _build_realtime_context(message: str) -> str:
    """
    Build a concise summary of traffic/crowd data relevant to the question.
    If the user mentions a specific time, show data for that timestamp.
    Otherwise show the latest data.
    """
    try:
        from app.data.repository import repository
        import pandas as pd

        parts = []
        resolved_ts = None  # Will hold the timestamp we resolved for traffic data

        # Get traffic data
        traffic_df = repository.get_traffic_flow_df()
        if not traffic_df.empty:
            all_timestamps = sorted(traffic_df["Timestamp"].unique().tolist())

            # Determine which timestamp to focus on
            target_ts = _extract_timestamp_from_message(message, all_timestamps)
            latest_ts = traffic_df["Timestamp"].max()
            resolved_ts = target_ts if target_ts else latest_ts

            # The feed is sparse: a given timestamp usually carries only a few
            # segments. Reading a single timestamp would report most of the
            # network as missing, so take each segment's latest reading at or
            # before the reference time instead.
            snapshot = _snapshot_at(traffic_df, resolved_ts)
            label = "車流狀態" if target_ts else "即時車流狀態"

            high_sat = snapshot[snapshot["Saturation_Score"] >= 0.80].sort_values(
                "Saturation_Score", ascending=False
            )
            if not high_sat.empty:
                lines = [f"[{label} - 基準 {resolved_ts}] 飽和度 >= 80% 路段："]
                for _, row in high_sat.iterrows():
                    sat = row["Saturation_Score"]
                    level = "A 級 (癱瘓)" if sat >= 0.95 else "B 級 (壅擠)"
                    stale = "" if row["Timestamp"] == resolved_ts else f"，數據時間 {row['Timestamp']}"
                    lines.append(
                        f"  - {row['Road_Name']} ({row['Segment_ID']}): "
                        f"飽和度 {sat:.2f} [{level}], "
                        f"車速 {row['Avg_Speed']:.0f} km/h, "
                        f"車輛數 {int(row['Vehicle_Count'])}, "
                        f"狀態 {row['Lane_Status']}{stale}"
                    )
                parts.append("\n".join(lines))
            else:
                parts.append(
                    f"[{label} - 基準 {resolved_ts}] 已回報之路段飽和度均 < 0.80"
                )

        # Get crowd data
        crowd_df = repository.get_crowd_density_df()
        if not crowd_df.empty:
            # Use the same reference time as traffic for consistency.
            # Apply snapshot logic so all stations have a reading.
            crowd_snapshot = _snapshot_at(crowd_df, resolved_ts, id_col="BS_ID")

            if not crowd_snapshot.empty:
                notable = crowd_snapshot[
                    (crowd_snapshot["Growth_Rate"] > 0.20) | (crowd_snapshot["User_Count"] > 20000)
                ]
                if not notable.empty:
                    lines = [f"[人流數據 - 基準 {resolved_ts}] 需關注站點："]
                    for _, row in notable.iterrows():
                        lines.append(
                            f"  - {row['Location_Name']} ({row['BS_ID']}): "
                            f"人數 {int(row['User_Count']):,}, "
                            f"成長率 {row['Growth_Rate']:.0%}, "
                            f"漫遊率 {row['Roaming_User_Pct']:.0%}"
                        )
                    parts.append("\n".join(lines))

                # Always show roaming data for Article 6 detection
                roaming_high = crowd_snapshot[crowd_snapshot["Roaming_User_Pct"] >= 0.30]
                if not roaming_high.empty:
                    lines = [f"[漫遊率警報 - 基準 {resolved_ts}] Roaming >= 30% (觸發 SOP 第 6 條)："]
                    for _, row in roaming_high.iterrows():
                        lines.append(
                            f"  - {row['Location_Name']} ({row['BS_ID']}): 漫遊率 {row['Roaming_User_Pct']:.0%}"
                        )
                    parts.append("\n".join(lines))
                else:
                    lines = [f"[漫遊率 - 基準 {resolved_ts}] 所有站點 Roaming_User_Pct < 30%，SOP 第 6 條未觸發"]
                    for _, row in crowd_snapshot.iterrows():
                        lines.append(
                            f"  - {row['Location_Name']} ({row['BS_ID']}): 漫遊率 {row['Roaming_User_Pct']:.0%}"
                        )
                    parts.append("\n".join(lines))

        # Get active incidents
        incidents = repository.get_live_incidents_raw()
        if incidents:
            lines = ["[突發事件]"]
            for inc in incidents:
                lines.append(
                    f"  - [{inc.get('severity')}] {inc.get('location')} "
                    f"(affected: {inc.get('affected_segment')}): "
                    f"{inc.get('description')} "
                    f"[status={inc.get('status')}, type={inc.get('type')}]"
                )
            parts.append("\n".join(lines))

        # Get road network data — inject structure for affected segments and related roads
        road_network = repository.get_road_network_raw()
        if road_network:
            # Build a lookup by segment_id and by name
            by_id = {r["segment_id"]: r for r in road_network}
            by_name = {r["name"]: r for r in road_network}

            # Determine which segments are relevant to the question
            relevant_ids: set = set()

            # Add incident-affected segments
            if incidents:
                for inc in incidents:
                    seg_id = inc.get("affected_segment", "")
                    if seg_id and seg_id in by_id:
                        relevant_ids.add(seg_id)

            # Add segments mentioned in the user message
            for seg in road_network:
                if seg["name"] in message or seg["segment_id"] in message:
                    relevant_ids.add(seg["segment_id"])

            # Also add alternatives of relevant segments
            alt_ids: set = set()
            for seg_id in relevant_ids:
                seg_data = by_id.get(seg_id, {})
                for alt_id in seg_data.get("alternatives", []):
                    alt_ids.add(alt_id)
            relevant_ids.update(alt_ids)

            # If no specific segments detected, include all (it's only ~15 entries)
            if not relevant_ids:
                relevant_ids = set(by_id.keys())

            # Format road network data
            lines = ["[路網結構資料]"]
            for seg_id in sorted(relevant_ids):
                seg = by_id.get(seg_id)
                if not seg:
                    continue
                lines.append(
                    f"  - {seg['name']} ({seg['segment_id']}): "
                    f"capacity={seg['capacity_vph']} vph, "
                    f"flow_direction={seg['flow_direction']}, "
                    f"intersections={seg['intersections']}, "
                    f"alternatives={seg['alternatives']}"
                )
            parts.append("\n".join(lines))

            # Add saturation data for alternative segments (for route planning)
            if relevant_ids and not traffic_df.empty:
                use_ts = resolved_ts if resolved_ts else traffic_df["Timestamp"].max()
                alt_snapshot = _snapshot_at(traffic_df, use_ts)
                alt_traffic = alt_snapshot[alt_snapshot["Segment_ID"].isin(relevant_ids)]
                if not alt_traffic.empty:
                    lines = [f"[替代路段飽和度 - 基準 {use_ts}]"]
                    for _, row in alt_traffic.sort_values("Saturation_Score", ascending=False).iterrows():
                        stale = "" if row["Timestamp"] == use_ts else f"（數據時間 {row['Timestamp']}）"
                        lines.append(
                            f"  - {row['Road_Name']} ({row['Segment_ID']}): "
                            f"飽和度 {row['Saturation_Score']:.2f}, "
                            f"車速 {row['Avg_Speed']:.0f} km/h{stale}"
                        )
                    parts.append("\n".join(lines))

            # Route replanning is a deterministic computation, not an LLM
            # judgement call. Run the SOP Article 2 algorithm here and hand the
            # LLM the finished result so it only has to explain it.
            plan_ctx = _build_route_plan_context(
                message, road_network, traffic_df, incidents, resolved_ts
            )
            if plan_ctx:
                parts.append(plan_ctx)

        return "\n\n".join(parts) if parts else ""
    except Exception as e:
        return f"[數據載入錯誤: {str(e)}]"


@router.post("/", response_model=ChatResponse)
def chat_with_agent(
    request: ChatRequest,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    Send a message to the Traffic Commander AI and get a response.
    Automatically retrieves relevant SOP clauses via RAG before answering.
    Injects real-time data so the LLM can ground its answers in facts.
    """
    # RAG: Retrieve relevant SOP context
    sop_context = []
    try:
        from app.services.rag import sop_retriever
        sop_context = sop_retriever.query(request.message, top_k=5)

        # If query returned nothing useful, provide all chunks for comprehensive coverage
        if not sop_context:
            sop_context = sop_retriever.get_all_chunks()
    except Exception:
        pass  # Gracefully degrade if RAG is not available

    # Inject real-time data context so LLM can reference actual numbers
    realtime_ctx = _build_realtime_context(request.message)
    if realtime_ctx:
        sop_context.append(realtime_ctx)

    response = llm_service.generate_chat_response(request, sop_context=sop_context)
    return response
