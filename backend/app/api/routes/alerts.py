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
from app.services.sop_engine import check_all_sop_thresholds
from app.services.route_planner import plan_routes
from app.services.ete_calculator import calculate_ete
from app.services.traffic_snapshot import snapshot_at
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/check", response_model=AlertCheckResponse)
def check_sop_thresholds(timestamp: str, active_incident_ids: Optional[str] = None):
    """
    Check all SOP thresholds for a given timestamp.
    Returns triggered alerts for traffic, crowd, and roaming.

    active_incident_ids: 逗號分隔的 event_id 清單。前端的事件是「注入」才算生效
    （模擬情境），第 2/5 條只針對事故/號誌故障事件，若不傳這個參數則沿用舊行為
    （檢查資料裡全部的事件），傳了就只檢查已注入的那幾筆，避免還沒注入的事件
    就先跳警報。
    """
    traffic_df = repository.get_traffic_flow_df()
    crowd_df = repository.get_crowd_density_df()
    incidents = repository.get_live_incidents_raw()

    if active_incident_ids is not None:
        active_ids = {i for i in active_incident_ids.split(",") if i}
        incidents = [inc for inc in incidents if inc.get("event_id") in active_ids]

    return check_all_sop_thresholds(traffic_df, crowd_df, timestamp, incidents)


@router.post("/multilang", response_model=MultiLangAlertResponse)
def generate_multilang_alert(
    request: MultiLangAlertRequest,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    Public CMS/SMS message. 第 6 條只負責「觸發判定」：Roaming >= 30% 才需要
    多語（LLM 只翻譯固定文字，不新增資訊），未觸發時只有中文。訊息本身要嘛是
    某個事故的內容（SOP第2條b項格式：事故位置/改道指引/預計延誤時間/求援提醒），
    要嘛——沒有對應事故時（例如單純人潮聚集）——是同樣四要點改寫成的人潮疏導
    通知（現場位置/疏導動向/人潮狀況/求援提醒）。id 可以是事件 event_id
    （SOP2/5的事故）或基地台 BS_ID（SOP6單獨觸發、沒有對應事故時）。
    """
    if not request.event_id:
        return MultiLangAlertResponse(triggered=False, trigger_stations=[], roaming_details={}, messages=None)

    incidents_raw = repository.get_live_incidents_raw()
    incident = next((i for i in incidents_raw if i.get("event_id") == request.event_id), None)

    if incident:
        result = _build_incident_message(incident, request.timestamp)
    elif request.event_id.startswith("BS_"):
        result = _build_crowd_message(request.event_id, request.timestamp)
    else:
        return MultiLangAlertResponse(triggered=False, trigger_stations=[], roaming_details={}, messages=None)

    if result is None:
        return MultiLangAlertResponse(triggered=False, trigger_stations=[], roaming_details={}, messages=None)

    zh_message, trigger_stations, roaming_details = result

    if not trigger_stations:
        # 未觸發僅中文——中文簡訊仍然是真實內容，不是佔位訊息。
        return MultiLangAlertResponse(
            triggered=False,
            trigger_stations=[],
            roaming_details={},
            messages=MultiLangMessages(zh=zh_message, en="", ja=None, ko=None),
        )

    en, ja, ko = _translate_cms_message(llm_service, zh_message)

    return MultiLangAlertResponse(
        triggered=True,
        trigger_stations=trigger_stations,
        roaming_details=roaming_details,
        messages=MultiLangMessages(zh=zh_message, en=en, ja=ja, ko=ko),
    )


def _build_incident_message(incident: dict, requested_ts: Optional[str]):
    """SOP第2條b項格式：事故位置、改道指引、預計延誤時間、求援或避開提醒。"""
    ts = requested_ts or incident.get("timestamp", "")
    affected_segment = incident.get("affected_segment", "")
    location = incident.get("location") or affected_segment
    severity = incident.get("severity", "Medium")

    road_network = repository.get_road_network_raw()
    traffic_df = repository.get_traffic_flow_df()
    ts_traffic = snapshot_at(traffic_df, ts)
    traffic_records = ts_traffic.to_dict("records") if not ts_traffic.empty else []

    plan = plan_routes(
        affected_segment, road_network, traffic_records,
        incident_location=incident.get("location"),
    )
    detour_clause = (
        f"請改道{plan.primary_route_name}" if plan.primary_route_name
        else "尚無符合條件之替代路線，請依現場指揮通行"
    )

    seg_data = (
        ts_traffic[ts_traffic["Segment_ID"] == affected_segment]
        if not ts_traffic.empty else ts_traffic
    )
    avg_saturation = float(seg_data["Saturation_Score"].mean()) if not seg_data.empty else 0.5
    ete = calculate_ete(severity, avg_saturation)

    zh_message = (
        f"【交通事故通報】{location}封閉，{detour_clause}，"
        f"預計延誤 {ete.ete_minutes:.0f} 分鐘。請提前避開該路段；"
        f"如遇緊急狀況請撥打 110 或 119 求援。"
    )

    # 觸發判定：事故路段周邊基地台（nearby_stations）是否有任一達 SOP 第 6 條門檻。
    seg_info = next((s for s in road_network if s.get("segment_id") == affected_segment), None)
    nearby_station_ids = seg_info.get("nearby_stations", []) if seg_info else []

    crowd_df = repository.get_crowd_density_df()
    crowd_snapshot = snapshot_at(crowd_df, ts, id_col="BS_ID")

    trigger_stations: list = []
    roaming_details: dict = {}
    if not crowd_snapshot.empty and nearby_station_ids:
        nearby = crowd_snapshot[crowd_snapshot["BS_ID"].isin(nearby_station_ids)]
        for _, row in nearby.iterrows():
            roaming = float(row["Roaming_User_Pct"])
            if roaming >= 0.30:
                trigger_stations.append(row["BS_ID"])
                roaming_details[row["BS_ID"]] = roaming

    return zh_message, trigger_stations, roaming_details


def _build_crowd_message(station_id: str, requested_ts: Optional[str]):
    """
    沒有對應事故的單純人潮聚集（SOP6自己觸發）。訊息要點改寫成人潮疏導版本：
    現場位置、疏導動向、人潮/漫遊狀況、求援提醒——跟事故版本同一套四要點，
    只是換成「人」而非「路」的疏導內容。
    """
    crowd_df = repository.get_crowd_density_df()
    ts = requested_ts or (crowd_df["Timestamp"].max() if not crowd_df.empty else "")
    crowd_snapshot = snapshot_at(crowd_df, ts, id_col="BS_ID")
    if crowd_snapshot.empty:
        return None

    row_match = crowd_snapshot[crowd_snapshot["BS_ID"] == station_id]
    if row_match.empty:
        return None
    row = row_match.iloc[0]

    roaming = float(row["Roaming_User_Pct"])
    location_name = row["Location_Name"]
    user_count = int(row["User_Count"])

    zh_message = (
        f"【人潮疏導通知】{location_name}目前人數 {user_count:,}，"
        f"境外/外地旅客比例達 {roaming*100:.0f}%，請配合現場疏導動線通行，"
        f"避免長時間停留；如需協助請洽現場工作人員或撥打 1999 市民熱線。"
    )

    if roaming < 0.30:
        return zh_message, [], {}

    return zh_message, [station_id], {station_id: roaming}


def _translate_cms_message(llm_service: LLMService, zh_message: str):
    from app.models.schemas import ChatRequest
    llm_request = ChatRequest(
        message=(
            "請將以下交通/人潮CMS看板簡訊，忠實翻譯成英文、日文、韓文，"
            "不要新增原文沒有的資訊、不要省略任何一個要點。"
            "風格需簡短，適合電子看板與手機簡訊顯示，避免專業術語。\n\n"
            f"原文（中文）：{zh_message}\n\n"
            "請用 [EN]、[JA]、[KO] 標記分別輸出三個語言版本，每種語言各一段，不要輸出其他內容。"
        )
    )
    llm_response = llm_service.generate_chat_response(llm_request)
    en = _extract_lang(llm_response.reply, "[EN]", "[JA]") or "Traffic alert: please refer to the Chinese notice for details."
    ja = _extract_lang(llm_response.reply, "[JA]", "[KO]")
    ko = _extract_lang(llm_response.reply, "[KO]", None)
    return en, ja, ko


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
