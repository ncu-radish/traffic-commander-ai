import ReactECharts from 'echarts-for-react';
import type { CrowdDensity } from '../types';

interface CrowdChartProps {
  crowdData: CrowdDensity[];
  currentTimestamp: string;
}

const KEY_STATIONS = [
  { id: 'BS_TPE_DOME', name: '大巨蛋', color: '#f43f5e' },
  { id: 'BS_MRT_BL17', name: 'BL17 國父紀念館站', color: '#00d4ff' },
  { id: 'BS_MRT_BL18', name: 'BL18 市政府站', color: '#22c55e' },
  { id: 'BS_XY_VIESHOW', name: '信義威秀', color: '#a78bfa' },
  { id: 'BS_TPE_101', name: '台北101', color: '#f59e0b' },
];

export default function CrowdChart({ crowdData, currentTimestamp }: CrowdChartProps) {
  const timestamps = [...new Set(crowdData.map((d) => d.timestamp))].sort();

  const series = KEY_STATIONS.map((station) => {
    const stationData = crowdData.filter((d) => d.bsId === station.id);
    const data = timestamps.map((ts) => {
      const found = stationData.find((d) => d.timestamp === ts);
      return found ? found.userCount : null;
    });

    return {
      name: station.name,
      type: 'line' as const,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      data,
      lineStyle: { color: station.color, width: 2 },
      itemStyle: { color: station.color },
      areaStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: station.color + '25' },
            { offset: 1, color: station.color + '05' },
          ],
        },
      },
    };
  });

  // SOP Article 3 threshold line for BL17
  const markLines = {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed' as const, width: 1 },
    data: [
      {
        yAxis: 25000,
        lineStyle: { color: '#ef444480' },
        label: { formatter: 'SOP§3 25,000', color: '#ef4444', fontSize: 10 },
      },
    ],
  };

  const currentIdx = timestamps.indexOf(currentTimestamp);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15, 22, 41, 0.95)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: Array<{ seriesName: string; value: number | null; marker: string }>) => {
        const lines = params
          .filter((p) => p.value !== null)
          .map((p) => `${p.marker} ${p.seriesName}: ${(p.value ?? 0).toLocaleString()} 人`);
        return lines.join('<br/>');
      },
    },
    legend: {
      data: KEY_STATIONS.map((s) => s.name),
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 0,
      itemWidth: 16,
      itemHeight: 3,
    },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: timestamps.map((t) => t.split(' ')[1]),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: '#64748b', fontSize: 10, rotate: 45 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v,
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    series: series.map((s, idx) => ({
      ...s,
      markLine: idx === 1 ? markLines : undefined, // BL17 is index 1
      markArea: currentIdx >= 0 && idx === 0
        ? {
            silent: true,
            data: [[
              { xAxis: timestamps[currentIdx]?.split(' ')[1], itemStyle: { color: 'rgba(0,212,255,0.08)' } },
              { xAxis: timestamps[Math.min(currentIdx + 1, timestamps.length - 1)]?.split(' ')[1] },
            ]],
          }
        : undefined,
    })),
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 280 }}
      opts={{ renderer: 'canvas' }}
    />
  );
}
