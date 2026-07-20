"""
Route Planner — implements SOP Article 2 alternative route selection algorithm.

Selection rules (from emergency_traffic_sop.txt):
1. Pick from the affected segment's `alternatives`
2. Filter: capacity_vph >= 1000
3. Filter: Must directly intersect with the accident segment
4. Filter: Intersection point must be UPSTREAM of the accident
5. Among passing candidates, pick the one with LOWEST Saturation_Score
6. Downstream intersecting roads = secondary evacuation only
7. If primary route is congested (>=0.85), keep it but activate extended green
"""
from typing import List, Dict, Any, Optional
from app.models.schemas import RoutePlanResult, ExcludedRoute, SignalAdjustment


def plan_routes(
    affected_segment_id: str,
    road_network: List[Dict[str, Any]],
    traffic_data: List[Dict[str, Any]],
) -> RoutePlanResult:
    """
    Plan alternative routes for a blocked/closed road segment.
    
    Args:
        affected_segment_id: The segment_id of the affected road
        road_network: Full road network (snake_case keys)
        traffic_data: Current traffic flow data (pandas-style dicts with original CSV column names)
    """
    # Build lookup maps
    network_map: Dict[str, Dict] = {}
    for seg in road_network:
        network_map[seg["segment_id"]] = seg

    saturation_map: Dict[str, float] = {}
    for row in traffic_data:
        sid = row.get("Segment_ID", row.get("segmentId", ""))
        sat = row.get("Saturation_Score", row.get("saturationScore", 0.5))
        saturation_map[sid] = float(sat)

    affected = network_map.get(affected_segment_id)
    if not affected:
        return RoutePlanResult()

    alternatives = affected.get("alternatives", [])
    intersections = affected.get("intersections", [])  # ordered upstream → downstream
    affected_name = affected.get("name", affected_segment_id)

    primary_candidates = []
    secondary_candidates = []
    excluded: List[ExcludedRoute] = []

    for alt_id in alternatives:
        alt_seg = network_map.get(alt_id)
        if not alt_seg:
            excluded.append(ExcludedRoute(route=alt_id, reason="路段不存在於路網中"))
            continue

        alt_name = alt_seg.get("name", alt_id)

        # Rule 2: capacity >= 1000
        if alt_seg.get("capacity_vph", 0) < 1000:
            excluded.append(ExcludedRoute(
                route=f"{alt_id} ({alt_name})",
                reason=f"容量不足 (capacity_vph={alt_seg.get('capacity_vph')}，需≥1000)"
            ))
            continue

        # Rule 3: Must intersect with the affected segment
        alt_intersections = alt_seg.get("intersections", [])
        # Check if they share an intersection point (road name appears in the other's intersections)
        shared = set(alt_intersections) & set(intersections)
        # Also check if the affected road name appears in alt's intersections, or vice versa
        if affected_name in alt_intersections:
            shared.add(affected_name)
        if alt_name in intersections:
            shared.add(alt_name)

        if not shared:
            excluded.append(ExcludedRoute(
                route=f"{alt_id} ({alt_name})",
                reason="與事故路段無直接交叉路口"
            ))
            continue

        # Rule 4: Determine upstream/downstream
        # intersections list is ordered upstream → downstream
        # Find the earliest shared intersection in the affected road's intersection list
        is_upstream = False
        is_downstream = False
        for shared_road in shared:
            if shared_road in intersections:
                idx = intersections.index(shared_road)
                midpoint = len(intersections) / 2
                if idx < midpoint:
                    is_upstream = True
                else:
                    is_downstream = True
            elif shared_road == affected_name:
                # This alt road crosses the affected road itself
                is_upstream = True

        saturation = saturation_map.get(alt_id, 0.5)

        if is_upstream:
            primary_candidates.append((alt_id, alt_name, saturation))
        if is_downstream and not is_upstream:
            secondary_candidates.append((alt_id, alt_name, saturation))

    # Rule 5: Pick lowest saturation among primary candidates
    result = RoutePlanResult(excluded_routes=excluded)

    if primary_candidates:
        primary_candidates.sort(key=lambda x: x[2])
        best = primary_candidates[0]
        result.primary_route = best[0]
        result.primary_route_name = best[1]

        # Rule 7: If primary is congested, add signal adjustment note
        if best[2] >= 0.85:
            result.signal_adjustments.append(SignalAdjustment(
                road=best[1],
                adjustment="延長綠燈時相 +25%",
                period="事故處理期間"
            ))

    # Secondary routes
    result.secondary_routes = [f"{s[0]} ({s[1]})" for s in secondary_candidates]

    # Add extended green for affected road's alternatives that pass
    for alt_id, alt_name, sat in primary_candidates[1:]:  # non-primary upstream candidates
        result.signal_adjustments.append(SignalAdjustment(
            road=alt_name,
            adjustment="延長綠燈時相 +15%",
            period="事故處理期間"
        ))

    return result
