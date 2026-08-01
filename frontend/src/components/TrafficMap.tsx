import { MapContainer, TileLayer, Polyline, Popup, CircleMarker, Marker, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { TrafficSegment, RoadSegment, LiveIncident, AccidentHotspots } from '../types';
import { road, saturationColor, saturationWeight, threshold } from '../theme/tokens';
import './TrafficMap.css';

/* ── Approximate geometry for Xinyi District segments ──────────── */
const segmentCoordinates: Record<string, [number, number][]> = {
  RD_TPE_001: [[25.0418, 121.5530], [25.0418, 121.5575], [25.0418, 121.5630]], // 忠孝東路四段
  RD_TPE_002: [[25.0445, 121.5575], [25.0418, 121.5575], [25.0395, 121.5575]], // 光復南路
  RD_TPE_003: [[25.0418, 121.5630], [25.0385, 121.5630], [25.0340, 121.5630]], // 基隆路一段
  RD_TPE_004: [[25.0470, 121.5490], [25.0470, 121.5550], [25.0470, 121.5575]], // 市民大道四段
  RD_TPE_005: [[25.0380, 121.5530], [25.0380, 121.5575], [25.0380, 121.5620]], // 仁愛路四段
  RD_TPE_006: [[25.0445, 121.5530], [25.0418, 121.5530], [25.0380, 121.5530]], // 敦化南路一段
  RD_TPE_007: [[25.0385, 121.5630], [25.0385, 121.5660], [25.0385, 121.5690]], // 松高路
  RD_TPE_008: [[25.0418, 121.5510], [25.0380, 121.5510]],                       // 延吉街
  RD_TPE_009: [[25.0430, 121.5640], [25.0418, 121.5640]],                       // 基隆路地下道
  RD_TPE_010: [[25.0380, 121.5660], [25.0370, 121.5660], [25.0355, 121.5660]], // 市府路
  RD_TPE_011: [[25.0360, 121.5630], [25.0360, 121.5660], [25.0360, 121.5690]], // 松壽路
  RD_TPE_012: [[25.0375, 121.5530], [25.0340, 121.5530]],                       // 敦化南路二段
  RD_TPE_013: [[25.0340, 121.5630], [25.0340, 121.5660], [25.0340, 121.5690]], // 信義路五段
  RD_TPE_014: [[25.0385, 121.5690], [25.0360, 121.5690], [25.0340, 121.5690]], // 松智路
  RD_TPE_015: [[25.0470, 121.5490], [25.0418, 121.5490]],                       // 復興南路一段
};

const stationCoordinates: Record<string, [number, number]> = {
  BS_TPE_DOME: [25.0430, 121.5570],
  BS_MRT_BL17: [25.0410, 121.5565],
  BS_MRT_BL16: [25.0420, 121.5520],
  BS_MRT_BL18: [25.0385, 121.5650],
  BS_SS_PARK: [25.0445, 121.5600],
  BS_BUS_TERM: [25.0380, 121.5655],
  BS_XY_VIESHOW: [25.0365, 121.5650],
  BS_XY_ATT: [25.0358, 121.5680],
  BS_TPE_101: [25.0339, 121.5645],
};

/**
 * Slow-pulsing locator for an incident. A divIcon rather than a
 * CircleMarker because the ring needs a CSS animation, and Leaflet
 * vector layers can't be keyframed reliably across browsers.
 */
const incidentIcon = L.divIcon({
  className: 'incident-marker',
  html: '<span class="incident-marker__ring"></span><span class="incident-marker__core"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface TrafficMapProps {
  trafficData: TrafficSegment[];
  roadNetwork: RoadSegment[];
  activeIncidents: LiveIncident[];
  /** Segment highlighted from outside the map (e.g. advisory panel). */
  selectedSegmentId?: string | null;
  /** Raised when an operator clicks a segment. */
  onSelectSegment?: (segmentId: string) => void;
  /** Primary evacuation route from the backend route planner. */
  primaryRouteId?: string | null;
  /** Secondary diversion routes. */
  secondaryRouteIds?: string[];
  /** data.taipei 114年事故斑點圖，依路段比對後的統計。缺資料時該圖層直接不畫。 */
  accidentHotspots?: AccidentHotspots | null;
  /** 使用者導航模擬（RoutePlanner）算出的多跳路徑，與 primary/secondary（SOP2單跳）分開畫。 */
  routePathIds?: string[];
  /**
   * 有值時只保留這些路段（含事故熱點）的完整顯示，其餘路段淡出——
   * 選好路線後聚焦在跟這趟行程有關的路況，不用整張圖的雜訊。
   * 沒有值（尚未規劃路線）時維持顯示全部15條路段。
   */
  focusSegmentIds?: string[];
  /** 開啟「點地圖設定位置」模式時才會監聽地圖點擊；回傳離點擊處最近的路段當定位依據。 */
  onMapClick?: (nearestSegmentId: string, segmentName: string, lat: number, lng: number) => void;
  /** 使用者點選的實際座標點——用一個點標記畫出來，不是整條路，呼應「定位是一個點」。 */
  userPositionPoint?: [number, number] | null;
}

/** 依事故數決定熱點圈的半徑，數量越多圈越大，而非固定大小的裝飾用圖示。 */
function hotspotRadius(total: number): number {
  return 5 + Math.min(14, Math.sqrt(total) * 2.2);
}

function segmentMidpoint(coords: [number, number][]): [number, number] {
  return coords[Math.floor(coords.length / 2)];
}

/** 點到線段的最短距離（近似平面幾何，範圍小，直接用經緯度差當座標夠用）。 */
function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 點擊地圖上任一點，找出離它最近的路段——「定位」用這條路段當路網圖的起點。 */
function nearestSegmentToPoint(lat: number, lng: number): { segmentId: string; distance: number } | null {
  let best: { segmentId: string; distance: number } | null = null;
  for (const [segmentId, coords] of Object.entries(segmentCoordinates)) {
    for (let i = 0; i < coords.length - 1; i++) {
      const [ay, ax] = coords[i];
      const [by, bx] = coords[i + 1];
      const d = pointToSegmentDist(lng, lat, ax, ay, bx, by);
      if (!best || d < best.distance) best = { segmentId, distance: d };
    }
  }
  return best;
}

interface MapClickCaptureProps {
  onPick: (lat: number, lng: number) => void;
}

/** 純粹的事件監聽元件，本身不畫任何東西——react-leaflet 的 useMapEvents 只能在 MapContainer 內部使用。 */
function MapClickCapture({ onPick }: MapClickCaptureProps) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function TrafficMap({
  trafficData,
  roadNetwork,
  activeIncidents,
  selectedSegmentId,
  onSelectSegment,
  primaryRouteId,
  secondaryRouteIds = [],
  accidentHotspots,
  routePathIds = [],
  focusSegmentIds,
  onMapClick,
  userPositionPoint,
}: TrafficMapProps) {
  const trafficLookup = new Map<string, TrafficSegment>();
  trafficData.forEach((t) => trafficLookup.set(t.segmentId, t));

  const handleMapClick = (lat: number, lng: number) => {
    const nearest = nearestSegmentToPoint(lat, lng);
    if (!nearest) return;
    const seg = roadNetwork.find((s) => s.segmentId === nearest.segmentId);
    onMapClick?.(nearest.segmentId, seg?.name ?? nearest.segmentId, lat, lng);
  };

  const affectedSegmentIds = new Set(activeIncidents.map((i) => i.affectedSegment));
  const hasFocus = Boolean(focusSegmentIds && focusSegmentIds.length > 0);
  const focusSet = new Set(focusSegmentIds ?? []);
  const secondarySet = new Set(secondaryRouteIds);
  const routePathSet = new Set(routePathIds);

  const hasRoutePlan = Boolean(primaryRouteId) || secondaryRouteIds.length > 0;

  return (
    <>
      <MapContainer
        center={[25.0400, 121.5600]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        {/* Basemap and labels are separate layers so the matte filter
            can flatten the terrain without muddying the type. */}
        <TileLayer
          className="tile-base"
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        <TileLayer
          className="tile-labels"
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        />

        {onMapClick && <MapClickCapture onPick={handleMapClick} />}

        {userPositionPoint && (
          <CircleMarker
            center={userPositionPoint}
            radius={7}
            pathOptions={{ color: '#fff', fillColor: road.primaryRoute, fillOpacity: 1, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
              <span>您的位置</span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* ── Road segments ──────────────────────────────────── */}
        {roadNetwork.map((segment) => {
          const coords = segmentCoordinates[segment.segmentId];
          if (!coords) return null;

          const traffic = trafficLookup.get(segment.segmentId);
          const isAffected = affectedSegmentIds.has(segment.segmentId);
          const isSelected = selectedSegmentId === segment.segmentId;
          const isPrimary = primaryRouteId === segment.segmentId;
          const isSecondary = secondarySet.has(segment.segmentId);
          const isOnUserRoute = routePathSet.has(segment.segmentId);

          // No reading for this timestamp: draw as inert geometry
          // rather than implying a measured value.
          const hasReading = traffic !== undefined;
          const saturation = traffic?.saturationScore ?? 0;

          let color: string = road.default;
          let weight = 2.5;
          let dashArray: string | undefined;
          let opacity = 0.5;

          if (hasReading) {
            color = saturationColor(saturation);
            weight = saturationWeight(saturation);
            opacity = 0.9;
          }

          if (isOnUserRoute) {
            color = road.primaryRoute;
            weight = 5;
            dashArray = '2 5';
            opacity = 1;
          }

          if (isPrimary) {
            color = road.primaryRoute;
            weight = 6;
            opacity = 1;
          } else if (isSecondary) {
            color = road.secondaryRoute;
            weight = 3.5;
            dashArray = '7 6';
            opacity = 0.95;
          }

          if (isAffected) {
            color = road.blocked;
            weight = 6;
            dashArray = '3 7';
            opacity = 1;
          }

          // 路線規劃完成後，只留下跟這趟行程有關的路段（路線本身、事故、SOP2疏散建議），
          // 其餘路段淡出但不完全消失，仍看得出路網骨架。
          const isRelevantToFocus = isOnUserRoute || isAffected || isPrimary || isSecondary || focusSet.has(segment.segmentId);
          if (hasFocus && !isRelevantToFocus) {
            opacity = 0.08;
            weight = Math.min(weight, 1.5);
          }

          return (
            <Polyline
              key={segment.segmentId}
              positions={coords}
              pathOptions={{
                color,
                weight: isSelected ? weight + 2 : weight,
                opacity,
                dashArray,
                lineCap: 'round',
                className: isSelected ? 'segment--selected' : undefined,
              }}
              eventHandlers={{
                click: () => onSelectSegment?.(segment.segmentId),
              }}
            >
              <Popup className="map-popup-wrap">
                <div className="map-popup">
                  <header className="map-popup__head">
                    <span className="map-popup__name">{segment.name}</span>
                    <span className="map-popup__id num">{segment.segmentId}</span>
                  </header>

                  <dl className="map-popup__grid">
                    <dt>方向</dt>
                    <dd>{segment.flowDirection}</dd>

                    <dt>容量</dt>
                    <dd className="num">
                      {segment.capacityVph.toLocaleString()} vph
                      {segment.capacityVph < 1000 && (
                        <span className="map-popup__flag"> 未達 1000</span>
                      )}
                    </dd>

                    {hasReading ? (
                      <>
                        <dt>車速</dt>
                        <dd className="num">{traffic.avgSpeed} km/h</dd>
                        <dt>車輛數</dt>
                        <dd className="num">{traffic.vehicleCount.toLocaleString()}</dd>
                        <dt>飽和度</dt>
                        <dd
                          className="num map-popup__sat"
                          style={{ color: saturationColor(saturation) }}
                        >
                          {(saturation * 100).toFixed(0)}%
                          {saturation >= threshold.saturationA
                            ? ' · A 級'
                            : saturation >= threshold.saturationB
                              ? ' · B 級'
                              : ''}
                        </dd>
                        <dt>狀態</dt>
                        <dd>{traffic.laneStatus}</dd>
                      </>
                    ) : null}
                    {(() => {
                      const hotspot = accidentHotspots?.segments[segment.segmentId];
                      if (!hotspot || hotspot.total === 0) return null;
                      return (
                        <>
                          <dt>事故熱點</dt>
                          <dd className="num" style={{ color: road.blocked }}>
                            {hotspot.total} 件（{accidentHotspots?.year}）
                          </dd>
                        </>
                      );
                    })()}
                    {!hasReading && (
                      <>
                        <dt>讀數</dt>
                        <dd className="map-popup__muted">此時間點無資料</dd>
                      </>
                    )}
                  </dl>

                  {isAffected && (
                    <p className="map-popup__alert">事故影響中 · 已封閉</p>
                  )}
                  {isPrimary && (
                    <p className="map-popup__route">主疏散路徑</p>
                  )}
                  {isSecondary && (
                    <p className="map-popup__route map-popup__route--secondary">
                      次要替代路徑
                    </p>
                  )}
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* ── Accident hotspots (data.taipei 114年事故斑點圖) ─── */}
        {accidentHotspots &&
          Object.entries(accidentHotspots.segments).map(([segId, hotspot]) => {
            if (hotspot.total === 0) return null;
            if (hasFocus && !focusSet.has(segId)) return null;
            const coords = segmentCoordinates[segId];
            if (!coords) return null;
            return (
              <CircleMarker
                key={`hotspot-${segId}`}
                center={segmentMidpoint(coords)}
                radius={hotspotRadius(hotspot.total)}
                pathOptions={{
                  color: road.blocked,
                  fillColor: road.blocked,
                  fillOpacity: 0.18,
                  weight: 1.5,
                  opacity: 0.65,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <span>
                    {hotspot.name} · {hotspot.total} 件事故（{accidentHotspots.year}）
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })}

        {/* ── Base stations ──────────────────────────────────── */}
        {Object.entries(stationCoordinates).map(([bsId, pos]) => (
          <CircleMarker
            key={bsId}
            center={pos}
            radius={3}
            pathOptions={{
              color: 'rgba(134, 166, 194, 0.55)',
              fillColor: 'rgba(134, 166, 194, 0.35)',
              fillOpacity: 1,
              weight: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="num">{bsId}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* ── Incident locators ──────────────────────────────── */}
        {activeIncidents.map((incident) => {
          const pos =
            stationCoordinates[incident.affectedSegment] ??
            segmentCoordinates[incident.affectedSegment]?.[1];
          if (!pos) return null;

          return (
            <Marker
              key={incident.eventId}
              position={pos as [number, number]}
              icon={incidentIcon}
              eventHandlers={{
                click: () => onSelectSegment?.(incident.affectedSegment),
              }}
            >
              <Popup className="map-popup-wrap">
                <div className="map-popup">
                  <header className="map-popup__head">
                    <span className="map-popup__name">{incident.location}</span>
                    <span className="map-popup__id num">{incident.eventId}</span>
                  </header>
                  <p className="map-popup__desc">{incident.description}</p>
                  <dl className="map-popup__grid">
                    <dt>狀態</dt>
                    <dd>{incident.status}</dd>
                    <dt>嚴重度</dt>
                    <dd>{incident.severity}</dd>
                    <dt>影響路段</dt>
                    <dd className="num">{incident.affectedSegment}</dd>
                  </dl>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Legend ───────────────────────────────────────────── */}
      <div className="map-legend">
        <div className="map-legend__group">
          <span className="map-legend__title">飽和度</span>
          <LegendLine color={saturationColor(0.99)} label="A 級 ≥95%" />
          <LegendLine color={saturationColor(0.9)} label="B 級 85–95%" />
          <LegendLine color={saturationColor(0.75)} label="注意 70–85%" />
          <LegendLine color={saturationColor(0.3)} label="正常 <70%" />
        </div>

        {hasRoutePlan && (
          <div className="map-legend__group">
            <span className="map-legend__title">疏導</span>
            <LegendLine color={road.primaryRoute} label="主疏散" width={4} />
            <LegendLine
              color={road.secondaryRoute}
              label="次要替代"
              width={2}
              dashed
            />
          </div>
        )}

        {activeIncidents.length > 0 && (
          <div className="map-legend__group">
            <span className="map-legend__title">事件</span>
            <LegendLine color={road.blocked} label="封閉路段" dashed />
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Legend row ──────────────────────────────────────────────── */

interface LegendLineProps {
  color: string;
  label: string;
  width?: number;
  dashed?: boolean;
}

function LegendLine({ color, label, width = 3, dashed }: LegendLineProps) {
  return (
    <div className="map-legend__row">
      <span
        className="map-legend__swatch"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 9px)`
            : color,
          height: width,
        }}
      />
      <span className="map-legend__label">{label}</span>
    </div>
  );
}
