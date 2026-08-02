"""
SOP Engine — Programmatic threshold detection for all 7 SOP articles.

This module does NOT call LLM. It performs deterministic rule-based checks
and returns structured alert/action data that can then be fed to LLM for
natural language generation.
"""
import pandas as pd
from typing import List, Dict, Any, Optional
from app.models.schemas import SOPAlert, AlertCheckResponse


# --- SOP Article 1: Traffic Congestion Level Classification ---

TRIGGER_SEGMENTS = ["RD_TPE_001", "RD_TPE_002"]

def check_article_1(traffic_df: pd.DataFrame, timestamp: str) -> List[SOPAlert]:
    """
    SOP Article 1: Check saturation on trigger segments.
    B-level: 0.85 <= saturation < 0.95
    A-level: saturation >= 0.95
    """
    alerts = []
    ts_data = traffic_df[traffic_df["Timestamp"] == timestamp]

    for _, row in ts_data.iterrows():
        seg_id = row["Segment_ID"]
        if seg_id not in TRIGGER_SEGMENTS:
            continue

        sat = float(row["Saturation_Score"])
        road_name = row["Road_Name"]

        if sat >= 0.95:
            alerts.append(SOPAlert(
                article="SOP 第 1 條",
                level="A",
                title=f"A 級癱瘓警報 — {road_name}",
                description=f"{road_name} 飽和度達 {sat*100:.0f}%，已達 A 級癱瘓門檻。需啟動替代路徑引導與長綠燈時制。",
                triggered_by=seg_id,
                data_evidence={"segment_id": seg_id, "road_name": road_name, "saturation_score": sat, "timestamp": timestamp},
                actions=[
                    "通知交控中心",
                    "啟動替代路徑引導（SOP 第 2 條）",
                    f"啟動 {road_name} 替代路線延長綠燈時相 +25%",
                    "派遣交通警察至關鍵路口",
                ],
            ))
        elif sat >= 0.85:
            alerts.append(SOPAlert(
                article="SOP 第 1 條",
                level="B",
                title=f"B 級壅擠警報 — {road_name}",
                description=f"{road_name} 飽和度達 {sat*100:.0f}%，已達 B 級壅擠門檻。建議啟動長綠燈時制。",
                triggered_by=seg_id,
                data_evidence={"segment_id": seg_id, "road_name": road_name, "saturation_score": sat, "timestamp": timestamp},
                actions=[
                    "通知交控中心",
                    f"啟動 {road_name} 替代路線延長綠燈時相 +25%",
                    "準備派遣交通警察",
                ],
            ))

    return alerts


# --- SOP Article 2: Vehicle Accident & Road Blockage ---

def check_article_2(incident: Dict[str, Any]) -> Optional[SOPAlert]:
    """
    SOP Article 2: Check if incident qualifies for road blockage response.
    Trigger: status in {Closed, Blocked, Restricted} AND severity in {High, Critical}
             AND affected_segment starts with RD_
    """
    status = incident.get("status", "")
    severity = incident.get("severity", "")
    affected = incident.get("affected_segment", "")

    if (status in {"Closed", "Blocked", "Restricted"}
        and severity in {"High", "Critical"}
        and affected.startswith("RD_")):
        return SOPAlert(
            article="SOP 第 2 條",
            level="A",
            title=f"道路封閉應變 — {incident.get('location', '')}",
            description=incident.get("description", ""),
            triggered_by=incident.get("event_id", ""),
            data_evidence=incident,
            actions=[
                "啟動替代路線規劃",
                "CMS 電子看板顯示改道資訊",
                "計算 ETE 預估恢復時間",
            ],
        )
    return None


# --- SOP Article 3: MRT & Shuttle Diversion ---

def check_article_3(crowd_df: pd.DataFrame, timestamp: str) -> List[SOPAlert]:
    """
    SOP Article 3: MRT crowd diversion.
    Trigger: BS_MRT_BL17 Growth_Rate > 0.30 OR User_Count > 25000
    """
    alerts = []
    ts_data = crowd_df[
        (crowd_df["Timestamp"] == timestamp) &
        (crowd_df["BS_ID"] == "BS_MRT_BL17")
    ]

    for _, row in ts_data.iterrows():
        growth = float(row["Growth_Rate"])
        user_count = int(row["User_Count"])

        if growth > 0.30 or user_count > 25000:
            alerts.append(SOPAlert(
                article="SOP 第 3 條",
                level="A",
                title="捷運分流警報 — 國父紀念館站",
                description=f"BL17 站人數 {user_count:,}，成長率 {growth*100:.0f}%。需啟動過站不停與接駁分流。",
                triggered_by="BS_MRT_BL17",
                data_evidence={
                    "bs_id": "BS_MRT_BL17",
                    "user_count": user_count,
                    "growth_rate": growth,
                    "timestamp": timestamp,
                },
                actions=[
                    "建議捷運 BL17 站過站不停",
                    "通知客運業者啟動接駁巴士",
                    "引導人群步行至 BL18 市政府站",
                    "加強出口動線管制",
                ],
            ))

    return alerts


# --- SOP Article 4: Taipei Dome Dismissal ---

def check_article_4(crowd_df: pd.DataFrame, timestamp: str) -> List[SOPAlert]:
    """
    SOP Article 4: Dome dismissal detection.
    Trigger: BS_TPE_DOME historical peak >= 30000 AND current Growth_Rate <= -0.20
    """
    alerts = []
    dome_data = crowd_df[crowd_df["BS_ID"] == "BS_TPE_DOME"]

    if dome_data.empty:
        return alerts

    historical_peak = dome_data["User_Count"].max()
    ts_data = dome_data[dome_data["Timestamp"] == timestamp]

    for _, row in ts_data.iterrows():
        growth = float(row["Growth_Rate"])
        user_count = int(row["User_Count"])

        if historical_peak >= 30000 and growth <= -0.20:
            alerts.append(SOPAlert(
                article="SOP 第 4 條",
                level="B",
                title="大巨蛋散場機制啟動",
                description=f"大巨蛋歷史尖峰 {historical_peak:,} 人，目前人數 {user_count:,}，成長率 {growth*100:.0f}%（負值表散場中）。",
                triggered_by="BS_TPE_DOME",
                data_evidence={
                    "bs_id": "BS_TPE_DOME",
                    "historical_peak": historical_peak,
                    "current_user_count": user_count,
                    "growth_rate": growth,
                    "timestamp": timestamp,
                },
                actions=[
                    "標記散場機制已啟動",
                    "主動連結 SOP 第 3 條接駁機制",
                    "加強周邊道路車流引導",
                ],
            ))

    return alerts


# --- SOP Article 5: Signal Failure Response ---

def check_article_5(incident: Dict[str, Any]) -> Optional[SOPAlert]:
    """
    SOP Article 5: Signal failure handling.
    Trigger: type = "Power_Failure" OR description contains 號誌失效/故障
    """
    inc_type = incident.get("type", "")
    desc = incident.get("description", "")

    if inc_type == "Power_Failure" or "號誌" in desc:
        return SOPAlert(
            article="SOP 第 5 條",
            level="B",
            title=f"號誌故障應變 — {incident.get('location', '')}",
            description=desc,
            triggered_by=incident.get("event_id", ""),
            data_evidence=incident,
            actions=[
                "派遣人工交管（每路口 2 名警員）",
                "CMS 顯示：「路段號誌故障，依現場交通指揮方向行駛」",
                "通報台電搶修",
            ],
        )
    return None


# --- SOP Article 6: Multi-Language Alert Trigger ---

def check_article_6(crowd_df: pd.DataFrame, timestamp: str) -> List[SOPAlert]:
    """
    SOP Article 6: Roaming user threshold detection.
    Trigger: Any station Roaming_User_Pct >= 0.30 (30%)
    """
    alerts = []
    ts_data = crowd_df[crowd_df["Timestamp"] == timestamp]

    for _, row in ts_data.iterrows():
        roaming = float(row["Roaming_User_Pct"])
        if roaming >= 0.30:
            alerts.append(SOPAlert(
                article="SOP 第 6 條",
                level="B",
                title=f"境外人潮異常聚集 — {row['Location_Name']}",
                description=f"{row['Location_Name']} 目前人數 {int(row['User_Count']):,}，其中漫遊（境外/外地門號）比率達 {roaming*100:.0f}%，顯示大量國際或外地旅客聚集。依 SOP 第 6 條，建議產出多語言告警並加強現場疏導。",
                triggered_by=row["BS_ID"],
                data_evidence={
                    "bs_id": row["BS_ID"],
                    "location_name": row["Location_Name"],
                    "roaming_user_pct": roaming,
                    "user_count": int(row["User_Count"]),
                    "timestamp": timestamp,
                },
                actions=[
                    "產出中文、英文告警文字",
                    "產出日文、韓文告警文字（加分）",
                    "推播至 CMS 電子看板與手機簡訊",
                ],
            ))

    return alerts


# --- Unified Check ---

def check_all_sop_thresholds(
    traffic_df: pd.DataFrame,
    crowd_df: pd.DataFrame,
    timestamp: str,
    incidents: Optional[List[Dict[str, Any]]] = None,
) -> AlertCheckResponse:
    """
    Run all SOP threshold checks for a given timestamp.
    Returns a structured AlertCheckResponse.
    """
    traffic_alerts = check_article_1(traffic_df, timestamp)

    crowd_alerts = check_article_3(crowd_df, timestamp)
    crowd_alerts.extend(check_article_4(crowd_df, timestamp))

    roaming_alerts = check_article_6(crowd_df, timestamp)

    # Process incidents if provided
    if incidents:
        for inc in incidents:
            art2 = check_article_2(inc)
            if art2:
                traffic_alerts.append(art2)
            art5 = check_article_5(inc)
            if art5:
                traffic_alerts.append(art5)

    return AlertCheckResponse(
        timestamp=timestamp,
        alerts=traffic_alerts,
        crowd_alerts=crowd_alerts,
        roaming_alerts=roaming_alerts,
    )
