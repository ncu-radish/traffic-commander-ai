import { MapContainer, TileLayer, Polyline, Popup, CircleMarker, Tooltip } from 'react-leaflet';
import type { TrafficSegment, RoadSegment, LiveIncident } from '../types';
import './TrafficMap.css';

// Approximate coordinates for Xinyi District road segments
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

// Base station locations
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

function getSegmentColor(saturation: number): string {
  if (saturation >= 0.95) return '#ef4444';       // A級 - 紅色
  if (saturation >= 0.85) return '#f59e0b';       // B級 - 黃色
  if (saturation >= 0.70) return '#fb923c';       // 注意 - 橙色
  return '#22c55e';                                // 正常 - 綠色
}

function getSegmentWeight(saturation: number): number {
  if (saturation >= 0.95) return 7;
  if (saturation >= 0.85) return 5;
  return 4;
}

interface TrafficMapProps {
  trafficData: TrafficSegment[];
  roadNetwork: RoadSegment[];
  activeIncidents: LiveIncident[];
}

export default function TrafficMap({ trafficData, roadNetwork, activeIncidents }: TrafficMapProps) {
  // Build a lookup from segment ID to traffic data
  const trafficLookup = new Map<string, TrafficSegment>();
  trafficData.forEach((t) => trafficLookup.set(t.segmentId, t));

  // Get affected segments from active incidents
  const affectedSegmentIds = new Set(activeIncidents.map((i) => i.affectedSegment));

  return (
    <MapContainer
      center={[25.0400, 121.5600]}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* Render road segments */}
      {roadNetwork.map((segment) => {
        const coords = segmentCoordinates[segment.segmentId];
        if (!coords) return null;

        const traffic = trafficLookup.get(segment.segmentId);
        const saturation = traffic?.saturationScore ?? 0.5;
        const isAffected = affectedSegmentIds.has(segment.segmentId);

        return (
          <Polyline
            key={segment.segmentId}
            positions={coords}
            pathOptions={{
              color: isAffected ? '#ff0040' : getSegmentColor(saturation),
              weight: isAffected ? 8 : getSegmentWeight(saturation),
              opacity: 0.9,
              dashArray: isAffected ? '12 6' : undefined,
            }}
          >
            <Popup>
              <div className="map-popup">
                <h4>{segment.name}</h4>
                <p>方向：{segment.flowDirection}</p>
                {traffic && (
                  <>
                    <p>平均車速：{traffic.avgSpeed} km/h</p>
                    <p>車輛數：{traffic.vehicleCount}</p>
                    <p>飽和度：{(traffic.saturationScore * 100).toFixed(0)}%</p>
                    <p>狀態：{traffic.laneStatus}</p>
                  </>
                )}
                {isAffected && <p className="incident-tag">⚠️ 事故影響中</p>}
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Render base station markers */}
      {Object.entries(stationCoordinates).map(([bsId, pos]) => (
        <CircleMarker
          key={bsId}
          center={pos}
          radius={6}
          pathOptions={{
            color: '#00d4ff',
            fillColor: '#00d4ff',
            fillOpacity: 0.6,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            <span style={{ fontSize: '0.8rem' }}>{bsId}</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Render incident markers */}
      {activeIncidents.map((incident) => {
        const pos = stationCoordinates[incident.affectedSegment] ??
          segmentCoordinates[incident.affectedSegment]?.[1];
        if (!pos) return null;

        return (
          <CircleMarker
            key={incident.eventId}
            center={pos as [number, number]}
            radius={12}
            pathOptions={{
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 0.4,
              weight: 3,
            }}
          >
            <Popup>
              <div className="map-popup">
                <h4>🚨 {incident.type}</h4>
                <p>{incident.description}</p>
                <p>狀態：{incident.status} | 嚴重度：{incident.severity}</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
