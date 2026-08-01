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
import re
from typing import List, Dict, Any, Optional, Tuple
from app.models.schemas import RoutePlanResult, ExcludedRoute, SignalAdjustment


def _road_name_aliases(name: str) -> List[str]:
    """
    Return matchable forms of a road name.
    e.g. "忠孝東路四段" -> ["忠孝東路四段", "忠孝東路"]
    Incident location strings often omit the 段 suffix
    ("光復南路與忠孝東路口南側"), so the stripped form is needed.
    """
    aliases = [name]
    stripped = re.sub(r"[一二三四五六七八九十\d]+段$", "", name)
    if stripped and stripped != name:
        aliases.append(stripped)
    return aliases


def _locate_accident_index(
    incident_location: Optional[str],
    intersections: List[str],
) -> Optional[int]:
    """
    Find which intersection the accident sits at, by matching the incident
    location text against the ordered intersection list.

    Returns the index in `intersections`, or None if it cannot be determined.
    Intersections at index <= returned value are upstream of the accident
    (traffic can still be diverted there); later ones are downstream.
    """
    if not incident_location:
        return None

    for idx, cross in enumerate(intersections):
        for alias in _road_name_aliases(cross):
            if alias in incident_location:
                return idx
    return None


def plan_routes(
    affected_segment_id: str,
    road_network: List[Dict[str, Any]],
    traffic_data: List[Dict[str, Any]],
    incident_location: Optional[str] = None,
) -> RoutePlanResult:
    """
    Plan alternative routes for a blocked/closed road segment.

    Args:
        affected_segment_id: The segment_id of the affected road
        road_network: Full road network (snake_case keys)
        traffic_data: Current traffic flow data (pandas-style dicts with original CSV column names)
        incident_location: Free-text incident location, used to pin down which
            intersection the accident sits at so upstream/downstream can be
            resolved exactly instead of guessed.
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

    # Pin the accident to a specific intersection so upstream/downstream is
    # decided by SOP's ordering rather than a midpoint guess.
    accident_idx = _locate_accident_index(incident_location, intersections)

    primary_candidates: List[Tuple[str, str, float]] = []
    secondary_candidates: List[Tuple[str, str, float]] = []
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

        # Rule 3: Must DIRECTLY intersect the affected segment.
        # "Directly intersect" means one road appears in the other's
        # intersections list. Sharing a third road is NOT an intersection:
        # 敦化南路一段 and 光復南路 both cross 忠孝東路四段, yet they never
        # meet each other, so 敦化南路 must not qualify here.
        alt_intersections = alt_seg.get("intersections", [])
        crosses_affected = (
            alt_name in intersections or affected_name in alt_intersections
        )

        if not crosses_affected:
            excluded.append(ExcludedRoute(
                route=f"{alt_id} ({alt_name})",
                reason=(
                    f"與事故路段無直接交叉路口（未出現於 {affected_name} 之 "
                    f"intersections，亦未將 {affected_name} 列為交叉路段）"
                )
            ))
            continue

        saturation = saturation_map.get(alt_id, 0.5)

        # Rule 4: Upstream or downstream of the accident.
        # `intersections` is ordered upstream → downstream, so the crossing
        # road's position in that list decides it.
        if alt_name not in intersections:
            # It crosses the affected road but the affected road's own list
            # doesn't place it, so its position can't be verified.
            # Conservatively list as secondary rather than assume upstream.
            secondary_candidates.append((alt_id, alt_name, saturation))
            continue

        cross_idx = intersections.index(alt_name)

        if accident_idx is not None:
            # Crossings at or before the accident intersection are upstream.
            is_upstream = cross_idx <= accident_idx
        else:
            # Accident point unknown — fall back to the midpoint heuristic.
            is_upstream = cross_idx < len(intersections) / 2

        if is_upstream:
            primary_candidates.append((alt_id, alt_name, saturation))
        else:
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
