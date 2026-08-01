"""
使用者導航模擬 API — 多跳路線規劃（與 SOP 第2條的 advisory 路徑規劃分開）。
給「使用者視角」的地圖用：輸入起訖路段、目前已知的封閉路段，回傳一條盡量避開
壅塞/封閉路段的模擬路徑。不是精確導航，路網座標是近似值。
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from app.data.repository import repository
from app.services.multi_hop_router import plan_route

router = APIRouter(prefix="/route", tags=["route"])


class RoutePlanRequest(BaseModel):
    start: str
    end: str
    blockedSegments: Optional[List[str]] = None
    timestamp: Optional[str] = None


@router.post("/plan")
def plan_user_route(request: RoutePlanRequest):
    traffic_flow = repository.get_traffic_flow()
    candidates = (
        [r for r in traffic_flow if r["timestamp"] <= request.timestamp]
        if request.timestamp
        else traffic_flow
    )

    # 取每個路段在指定時間點（或最新）之前最近一筆的飽和度
    latest_row_by_segment: dict[str, dict] = {}
    for row in candidates:
        seg_id = row["segmentId"]
        existing = latest_row_by_segment.get(seg_id)
        if existing is None or row["timestamp"] >= existing["timestamp"]:
            latest_row_by_segment[seg_id] = row
    saturation_by_segment = {
        seg_id: row["saturationScore"] for seg_id, row in latest_row_by_segment.items()
    }

    blocked = set(request.blockedSegments or [])
    result = plan_route(request.start, request.end, saturation_by_segment, blocked)
    return result
