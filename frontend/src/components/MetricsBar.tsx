import type { TrafficSegment, CrowdDensity } from '../types';
import { threshold, saturationLevel } from '../theme/tokens';
import './MetricsBar.css';

interface MetricsBarProps {
  trafficData: TrafficSegment[];
  crowdData: CrowdDensity[];
}

/** Maps an SOP level to the status class that drives --status. */
const levelClass: Record<string, string> = {
  A: 'is-a',
  B: 'is-b',
  watch: 'is-b',
  ok: 'is-ok',
};

export default function MetricsBar({ trafficData, crowdData }: MetricsBarProps) {
  if (trafficData.length === 0 && crowdData.length === 0) {
    return (
      <div className="panel">
        <div className="state">
          <span className="state__title">此時間點無監測資料</span>
          <span>請移動時間軸至有資料的時段</span>
        </div>
      </div>
    );
  }

  const avgSaturation =
    trafficData.length > 0
      ? trafficData.reduce((sum, t) => sum + t.saturationScore, 0) / trafficData.length
      : 0;

  const avgSpeed =
    trafficData.length > 0
      ? trafficData.reduce((sum, t) => sum + t.avgSpeed, 0) / trafficData.length
      : 0;

  const criticalCount = trafficData.filter(
    (t) => t.saturationScore >= threshold.saturationA
  ).length;

  const congestedCount = trafficData.filter(
    (t) =>
      t.saturationScore >= threshold.saturationB &&
      t.saturationScore < threshold.saturationA
  ).length;

  const totalPeople = crowdData.reduce((sum, c) => sum + c.userCount, 0);

  const maxCrowd =
    crowdData.length > 0
      ? crowdData.reduce((max, c) => (c.userCount > max.userCount ? c : max), crowdData[0])
      : null;

  const roamingStations = crowdData.filter(
    (c) => c.roamingUserPct >= threshold.roaming
  );

  // Speed thresholds are advisory context, not SOP-defined.
  const speedClass = avgSpeed < 15 ? 'is-a' : avgSpeed < 25 ? 'is-b' : 'is-ok';

  return (
    <div className="metrics">
      {/* ─── Primary tiles ─────────────────────────────────────── */}
      <div className="metrics__grid">
        <Tile
          label="平均飽和度"
          value={`${(avgSaturation * 100).toFixed(0)}%`}
          statusClass={levelClass[saturationLevel(avgSaturation)]}
          hint={`門檻 B ${threshold.saturationB * 100}% / A ${threshold.saturationA * 100}%`}
        />
        <Tile
          label="平均車速"
          value={avgSpeed.toFixed(0)}
          unit="km/h"
          statusClass={speedClass}
        />
        <Tile
          label="A 級癱瘓"
          value={criticalCount}
          unit="路段"
          statusClass={criticalCount > 0 ? 'is-a' : 'is-ok'}
          hint="SOP 第 1 條：飽和度 ≥ 95%"
        />
        <Tile
          label="B 級壅擠"
          value={congestedCount}
          unit="路段"
          statusClass={congestedCount > 0 ? 'is-b' : 'is-ok'}
          hint="SOP 第 1 條：飽和度 85–95%"
        />
      </div>

      {/* ─── Detail rows ───────────────────────────────────────── */}
      <div className="panel metrics__rows">
        <Row label="區域總人流" value={totalPeople.toLocaleString()} unit="人" />

        <Row
          label="最大人流站點"
          value={maxCrowd?.locationName ?? '—'}
          sub={maxCrowd ? `${maxCrowd.userCount.toLocaleString()} 人` : undefined}
          textual
        />

        <Row
          label="多語通報"
          value={
            roamingStations.length > 0
              ? `${roamingStations.length} 站觸發`
              : '未觸發'
          }
          statusClass={roamingStations.length > 0 ? 'is-b' : 'is-ok'}
          sub={
            roamingStations.length > 0
              ? roamingStations
                  .map((s) => `${s.locationName} ${(s.roamingUserPct * 100).toFixed(0)}%`)
                  .join('・')
              : `所有站點漫遊率 < ${threshold.roaming * 100}%（SOP 第 6 條）`
          }
          textual
        />
      </div>

      <div className="metrics__source">
        <span className="badge badge-source" title="資料來源檔案">
          city_traffic_flow.csv
        </span>
        <span className="badge badge-source" title="資料來源檔案">
          signaling_crowd_density.csv
        </span>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

interface TileProps {
  label: string;
  value: string | number;
  unit?: string;
  statusClass?: string;
  hint?: string;
}

function Tile({ label, value, unit, statusClass = '', hint }: TileProps) {
  return (
    <div
      className={`metric-tile panel panel--interactive status-rail ${statusClass}`}
      title={hint}
    >
      <div className="metric-tile__value">
        <span className="num">{value}</span>
        {unit && <span className="metric-tile__unit">{unit}</span>}
      </div>
      <span className="metric-tile__label">{label}</span>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  statusClass?: string;
  textual?: boolean;
}

function Row({ label, value, unit, sub, statusClass = '', textual }: RowProps) {
  return (
    <div className={`metric-row ${statusClass}`}>
      <div className="metric-row__main">
        <span className="metric-row__label">{label}</span>
        <span className="metric-row__value">
          <span className={textual ? '' : 'num'}>{value}</span>
          {unit && <span className="metric-row__unit">{unit}</span>}
        </span>
      </div>
      {sub && <span className="metric-row__sub">{sub}</span>}
    </div>
  );
}
