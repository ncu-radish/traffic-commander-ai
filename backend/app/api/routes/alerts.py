"""
Alerts API routes — SOP threshold checking and multi-language alert generation.
"""
from fastapi import APIRouter
from typing import Optional
from app.models.schemas import (
    AlertCheckResponse,
    MultiLangAlertRequest,
    MultiLangAlertResponse,
    MultiLangMessages,
)
from app.data.repository import repository
from app.services.sop_engine import check_all_sop_thresholds, check_article_2, check_article_5
from app.services.route_planner import plan_routes
from app.services.ete_calculator import calculate_ete
from app.services.traffic_snapshot import snapshot_at

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
def generate_multilang_alert(request: MultiLangAlertRequest):
    """
    Public CMS/SMS message. 第 6 條只負責「觸發判定」：Roaming >= 30% 才需要
    多語，未觸發時只有中文。訊息本身要嘛是某個事故的內容（SOP第2條b項格式：
    事故位置/改道指引/預計延誤時間/求援提醒），要嘛——沒有對應事故時（例如
    單純人潮聚集）——是同樣四要點改寫成的人潮疏導通知。id 可以是事件
    event_id（SOP2/5的事故）或基地台 BS_ID（SOP6單獨觸發、沒有對應事故時）。

    四語版本全部是Python字串樣板直接產生，刻意不經過LLM翻譯：這是公共安全
    通報，人數/百分比/延誤分鐘數必須跟中文原文完全一致。實測發現本機小型
    LLM（llama3.2:1b）翻譯時會把「16,000人」翻成「8万人」這種捏造數字的
    錯誤，對公共安全簡訊而言不可接受，所以四語都是同一組真實數字直接套版，
    不會有翻譯出錯的風險。
    """
    if not request.event_id:
        return MultiLangAlertResponse(triggered=False, trigger_stations=[], roaming_details={}, messages=None)

    incidents_raw = repository.get_live_incidents_raw()
    incident = next((i for i in incidents_raw if i.get("event_id") == request.event_id), None)

    if incident:
        result = _build_incident_messages(incident, request.timestamp)
    elif request.event_id.startswith("BS_"):
        result = _build_crowd_messages(request.event_id, request.timestamp)
    else:
        return MultiLangAlertResponse(triggered=False, trigger_stations=[], roaming_details={}, messages=None)

    if result is None:
        return MultiLangAlertResponse(triggered=False, trigger_stations=[], roaming_details={}, messages=None)

    messages, trigger_stations, roaming_details = result

    if not trigger_stations:
        # 未觸發僅中文——中文簡訊仍然是真實內容，不是佔位訊息。
        return MultiLangAlertResponse(
            triggered=False,
            trigger_stations=[],
            roaming_details={},
            messages=MultiLangMessages(zh=messages["zh"], en="", ja=None, ko=None),
        )

    return MultiLangAlertResponse(
        triggered=True,
        trigger_stations=trigger_stations,
        roaming_details=roaming_details,
        messages=MultiLangMessages(**messages),
    )


def _build_incident_messages(incident: dict, requested_ts: Optional[str]):
    """
    事故類型決定訊息格式，不是每種事件都適用「改道」：
    - SOP第2條（道路封閉）：事故位置、改道指引、預計延誤時間、求援提醒。
    - SOP第5條（號誌故障）：SOP條文自己就規定了固定格式——「<路段>號誌故障，
      請依現場指揮通行」，本來就不是靠改道處理，講「改道」反而是錯的資訊。
    """
    ts = requested_ts or incident.get("timestamp", "")
    affected_segment = incident.get("affected_segment", "")
    location = incident.get("location") or affected_segment

    if check_article_5(incident) and not check_article_2(incident):
        seg_info_5 = next(
            (s for s in repository.get_road_network_raw() if s.get("segment_id") == affected_segment),
            None,
        )
        # SOP第5條的CMS格式是「<路段>號誌故障」，用路段名稱而非事故位置
        # 自由文字——location本身可能已經包含「號誌故障」字樣，兩個接在一起會重複。
        road_name = seg_info_5.get("name") if seg_info_5 else location
        messages = {
            "zh": (
                f"【號誌故障通報】{road_name}號誌故障，請依現場指揮通行，"
                f"行經時請放慢車速並保持耐心；如遇緊急狀況請撥打 110 或 119 求援。"
            ),
            "en": (
                f"[Signal Failure Notice] Traffic signal malfunction at {road_name}. "
                f"Please follow on-site traffic control, slow down, and stay patient. "
                f"For emergencies, call 110 or 119."
            ),
            "ja": (
                f"【信号機故障のお知らせ】{road_name}の信号機が故障しています。"
                f"現場の交通整理員の指示に従い、徐行してください。"
                f"緊急時は110または119へご連絡ください。"
            ),
            "ko": (
                f"[신호 고장 안내] {road_name} 구간의 신호등이 고장났습니다. "
                f"현장 교통 통제에 따라 서행하며 통행해 주시기 바랍니다. "
                f"긴급 상황 시 110 또는 119로 연락하세요."
            ),
        }
        nearby_station_ids = seg_info_5.get("nearby_stations", []) if seg_info_5 else []
        return messages, *_check_article6_trigger(nearby_station_ids, ts)

    severity = incident.get("severity", "Medium")

    road_network = repository.get_road_network_raw()
    traffic_df = repository.get_traffic_flow_df()
    ts_traffic = snapshot_at(traffic_df, ts)
    traffic_records = ts_traffic.to_dict("records") if not ts_traffic.empty else []

    plan = plan_routes(
        affected_segment, road_network, traffic_records,
        incident_location=incident.get("location"),
    )

    if plan.primary_route_name:
        detour = {
            "zh": f"請改道{plan.primary_route_name}",
            "en": f"please detour via {plan.primary_route_name}",
            "ja": f"{plan.primary_route_name}へ迂回してください",
            "ko": f"{plan.primary_route_name}(으)로 우회해 주시기 바랍니다",
        }
    else:
        detour = {
            "zh": "尚無符合條件之替代路線，請依現場指揮通行",
            "en": "no qualifying alternate route is currently available; please follow on-site traffic control",
            "ja": "現時点で適切な迂回路がありません。現場の指示に従ってください",
            "ko": "현재 적합한 우회로가 없습니다. 현장 지시에 따라 통행해 주세요",
        }

    seg_data = (
        ts_traffic[ts_traffic["Segment_ID"] == affected_segment]
        if not ts_traffic.empty else ts_traffic
    )
    avg_saturation = float(seg_data["Saturation_Score"].mean()) if not seg_data.empty else 0.5
    ete = calculate_ete(severity, avg_saturation)
    ete_min = f"{ete.ete_minutes:.0f}"

    messages = {
        "zh": (
            f"【交通事故通報】{location}封閉，{detour['zh']}，"
            f"預計延誤 {ete_min} 分鐘。請提前避開該路段；"
            f"如遇緊急狀況請撥打 110 或 119 求援。"
        ),
        "en": (
            f"[Traffic Accident Notice] {location} is closed; {detour['en']}. "
            f"Estimated delay: {ete_min} minutes. Please avoid this area in advance. "
            f"For emergencies, call 110 or 119."
        ),
        "ja": (
            f"【交通事故のお知らせ】{location}が閉鎖されています。{detour['ja']}。"
            f"予想遅延時間：{ete_min}分。事前の迂回をお勧めします。"
            f"緊急時は110または119へご連絡ください。"
        ),
        "ko": (
            f"[교통사고 안내] {location} 구간이 폐쇄되었습니다. {detour['ko']}. "
            f"예상 지연 시간: {ete_min}분. 사전에 우회하시기 바랍니다. "
            f"긴급 상황 시 110 또는 119로 연락하세요."
        ),
    }

    # 觸發判定：事故路段周邊基地台（nearby_stations）是否有任一達 SOP 第 6 條門檻。
    seg_info = next((s for s in road_network if s.get("segment_id") == affected_segment), None)
    nearby_station_ids = seg_info.get("nearby_stations", []) if seg_info else []

    trigger_stations, roaming_details = _check_article6_trigger(nearby_station_ids, ts)
    return messages, trigger_stations, roaming_details


def _check_article6_trigger(nearby_station_ids: list, ts: str):
    """SOP第6條觸發判定：給定的基地台清單裡，是否有任一達 Roaming >= 30%。"""
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

    return trigger_stations, roaming_details


def _build_crowd_messages(station_id: str, requested_ts: Optional[str]):
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
    pct = f"{roaming * 100:.0f}"

    messages = {
        "zh": (
            f"【人潮疏導通知】{location_name}目前人數 {user_count:,}，"
            f"境外/外地旅客比例達 {pct}%，請配合現場疏導動線通行，"
            f"避免長時間停留；如需協助請洽現場工作人員或撥打 1999 市民熱線。"
        ),
        "en": (
            f"[Crowd Advisory] {location_name} currently has {user_count:,} people, "
            f"with {pct}% being international/out-of-town visitors. "
            f"Please follow on-site crowd guidance and avoid prolonged stays. "
            f"For assistance, contact on-site staff or call the 1999 Citizen Hotline."
        ),
        "ja": (
            f"【人混みのお知らせ】{location_name}には現在{user_count:,}人がおり、"
            f"そのうち{pct}%が海外・遠方からの旅行者です。"
            f"現場の誘導に従い、長時間の滞在は避けてください。"
            f"サポートが必要な場合は現場スタッフにご連絡いただくか、"
            f"1999市民ホットラインへお電話ください。"
        ),
        "ko": (
            f"[인파 안내] {location_name}에는 현재 {user_count:,}명이 있으며, "
            f"이 중 {pct}%가 해외/타지역 방문객입니다. "
            f"현장 안내에 따라 장시간 체류를 피해 주시기 바랍니다. "
            f"도움이 필요하시면 현장 직원에게 문의하시거나 "
            f"1999 시민 핫라인으로 연락해 주세요."
        ),
    }

    if roaming < 0.30:
        return messages, [], {}

    return messages, [station_id], {station_id: roaming}
