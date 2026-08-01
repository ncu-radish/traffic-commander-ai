"""
多跳路線規劃（使用者導航模擬用）— 與 SOP 第2條的 route_planner.py 是分開的東西。

route_planner.py 的 plan_routes() 是 SOP 第2條規定的「事故路段 -> 直接相鄰替代道路」
單跳邏輯，答案要跟條文精確對應，不能用最短路徑演算法隨便算。

這裡做的是「使用者從任意路段 A 想到任意路段 B，中間可能要繞好幾條路」的一般性路線
規劃，把整個路網當成圖，用 networkx 的 Dijkstra 算最短（且盡量避開壅塞/封閉）路徑。
這是一個示範性的模擬工具，不是精確導航——路網座標是近似值，不是真實地理座標。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import networkx as nx

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"


def _load_segments() -> List[Dict[str, Any]]:
    with open(DATA_DIR / "road_network_geometry.json", encoding="utf-8") as f:
        return json.load(f)


def build_graph(saturation_by_segment: Dict[str, float], blocked_segments: Optional[Set[str]] = None) -> nx.Graph:
    """把路網轉成圖：每個路段是一個節點，若兩路段互為 intersections（相交）則連一條邊。
    邊的權重 = 1 + 飽和度*5，飽和度越高代價越高，最短路徑演算法會盡量繞開。
    封閉路段直接不放進圖裡（而不是算完再過濾），演算法自然就不會選到。
    """
    blocked = blocked_segments or set()
    segments = _load_segments()
    by_name = {s["name"]: s for s in segments}

    graph = nx.Graph()
    for seg in segments:
        if seg["segment_id"] in blocked:
            continue
        graph.add_node(seg["segment_id"], name=seg["name"])

    for seg in segments:
        if seg["segment_id"] in blocked:
            continue
        for inter_name in seg.get("intersections", []):
            inter_seg = by_name.get(inter_name)
            if inter_seg is None or inter_seg["segment_id"] in blocked:
                continue
            saturation = saturation_by_segment.get(seg["segment_id"], 0.5)
            weight = 1 + saturation * 5
            graph.add_edge(seg["segment_id"], inter_seg["segment_id"], weight=weight)

    return graph


def plan_route(
    start_id: str,
    end_id: str,
    saturation_by_segment: Dict[str, float],
    blocked_segments: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    blocked = blocked_segments or set()
    graph = build_graph(saturation_by_segment, blocked)

    if start_id in blocked or end_id in blocked:
        return {"path": [], "cost": None, "reachable": False, "reason": "起點或終點本身已封閉"}
    if start_id not in graph or end_id not in graph:
        return {"path": [], "cost": None, "reachable": False, "reason": "起點或終點不存在於路網資料中"}

    try:
        path = nx.shortest_path(graph, start_id, end_id, weight="weight")
        cost = nx.shortest_path_length(graph, start_id, end_id, weight="weight")
        names = [graph.nodes[n]["name"] for n in path]
        return {
            "path": path,
            "pathNames": names,
            "cost": round(cost, 2),
            "reachable": True,
            "avoidedSegments": sorted(blocked),
        }
    except nx.NetworkXNoPath:
        return {"path": [], "cost": None, "reachable": False, "reason": "在避開封閉路段的情況下無可行路徑"}
