import ReactECharts from 'echarts-for-react';
import type { CrowdDensity } from '../types';
import { chart, level, series as palette, threshold, font } from '../theme/tokens';

interface CrowdChartProps {
  crowdData: CrowdDensity[];
  currentTimestamp: string;
}

/** BL17 sits at index 1 so the SOP 第 3 條 threshold attaches to it. */
const KEY_STATIONS = [
  { id: 'BS_TPE_DOME', name: '大巨蛋' },
  { id: 'BS_MRT_BL17', name: 'BL17 國父紀念館' },
  { id: 'BS_MRT_BL18', name: 'BL18 市政府' },
  { id: 'BS_XY_VIESHOW', name: '信義威秀' },
  { id: 'BS_TPE_101', name: '台北 101' },
];

const BL17_INDEX = 1;

export default function CrowdChart({ crowdData, currentTimestamp }: CrowdChartProps) {
  const timestamps = [...new Set(crowdData.map((d) => d.timestamp))].sort();

  if (timestamps.length === 0) {
    return (
      <div className="state">
        <span className="state__title">無人流資料</span>
      </div>
    );
  }

  const clockLabels = timestamps.map((t) => t.split(' ')[1]);
  const currentIdx = timestamps.indexOf(currentTimestamp);

  const seriesData = KEY_STATIONS.map((station, i) => {
    const color = palette[i % palette.length];
    const stationData = crowdData.filter((d) => d.bsId === station.id);

    return {
      name: station.name,
      type: 'line' as const,
      smooth: true,
      smoothMonotone: 'x' as const,
      symbol: 'circle',
      symbolSize: 3,
      showSymbol: false,
      // Signalling samples are irregular; don't bridge missing points.
      connectNulls: false,
      data: timestamps.map((ts) => {
        const found = stationData.find((d) => d.timestamp === ts);
        return found ? found.userCount : null;
      }),
      lineStyle: { color, width: 1.6 },
      itemStyle: { color },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2.4 } },
    };
  });

  /** SOP 第 3 條 — BL17 headcount trigger. */
  const thresholdLine = {
    silent: true,
    symbol: 'none' as const,
    lineStyle: { type: 'dashed' as const, width: 1, color: level.a, opacity: 0.5 },
    label: {
      formatter: 'SOP§3 25k',
      color: level.a,
      fontSize: 9,
      fontFamily: font.mono,
      position: 'insideEndTop' as const,
    },
    data: [{ yAxis: threshold.crowdBL17 }],
  };

  const cursorBand =
    currentIdx >= 0
      ? {
          silent: true,
          data: [
            [
              {
                xAxis: clockLabels[currentIdx],
                itemStyle: { color: chart.cursorBand },
              },
              {
                xAxis: clockLabels[Math.min(currentIdx + 1, clockLabels.length - 1)],
              },
            ],
          ],
        }
      : undefined;

  const option = {
    backgroundColor: chart.bg,
    animationDuration: 300,
    textStyle: { fontFamily: font.sans },
    tooltip: {
      trigger: 'axis' as const,
      ...chart.tooltip,
      axisPointer: {
        type: 'line' as const,
        lineStyle: { color: chart.axisLine, width: 1 },
      },
      formatter: (params: Array<{ seriesName: string; value: number | null; color: string; axisValue: string }>) => {
        const rows = params
          .filter((p) => p.value !== null && p.value !== undefined)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map(
            (p) => `<div style="display:flex;align-items:center;gap:6px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${p.color}"></span>
              <span style="flex:1">${p.seriesName}</span>
              <span style="font-variant-numeric:tabular-nums;font-weight:600">${(p.value ?? 0).toLocaleString()}</span>
            </div>`
          );

        if (rows.length === 0) return '';
        const head = `<div style="font-size:10px;color:${chart.axisLabel};margin-bottom:4px">${params[0].axisValue}</div>`;
        return head + rows.join('');
      },
    },
    legend: {
      data: KEY_STATIONS.map((s) => s.name),
      textStyle: { color: chart.legendLabel, fontSize: 10 },
      inactiveColor: '#4E5057',
      top: 0,
      itemWidth: 12,
      itemHeight: 2,
      itemGap: 10,
      icon: 'roundRect',
    },
    grid: { left: 38, right: 12, top: 28, bottom: 26 },
    xAxis: {
      type: 'category' as const,
      data: clockLabels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: chart.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: chart.axisLabel,
        fontSize: 9,
        fontFamily: font.mono,
        interval: Math.max(0, Math.floor(clockLabels.length / 7) - 1),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chart.axisLabel,
        fontSize: 9,
        fontFamily: font.mono,
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`),
      },
      splitLine: { lineStyle: { color: chart.splitLine } },
    },
    series: seriesData.map((s, idx) => ({
      ...s,
      markLine: idx === BL17_INDEX ? thresholdLine : undefined,
      markArea: idx === 0 ? cursorBand : undefined,
    })),
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 190 }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}
