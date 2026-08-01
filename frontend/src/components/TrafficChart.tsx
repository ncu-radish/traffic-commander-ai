import ReactECharts from 'echarts-for-react';
import type { TrafficSegment } from '../types';

interface TrafficChartProps {
  trafficData: TrafficSegment[];
  currentTimestamp: string;
}

// Key segments to track
const KEY_SEGMENTS = [
  { id: 'RD_TPE_001', name: '忠孝東路四段', color: '#00d4ff' },
  { id: 'RD_TPE_002', name: '光復南路', color: '#f59e0b' },
  { id: 'RD_TPE_003', name: '基隆路一段', color: '#22c55e' },
  { id: 'RD_TPE_004', name: '市民大道四段', color: '#a78bfa' },
  { id: 'RD_TPE_006', name: '敦化南路一段', color: '#fb923c' },
];

export default function TrafficChart({ trafficData, currentTimestamp }: TrafficChartProps) {
  // Get unique sorted timestamps
  const timestamps = [...new Set(trafficData.map((d) => d.timestamp))].sort();

  // Build series data for each key segment
  const series = KEY_SEGMENTS.map((seg) => {
    const segData = trafficData.filter((d) => d.segmentId === seg.id);
    const data = timestamps.map((ts) => {
      const found = segData.find((d) => d.timestamp === ts);
      return found ? found.saturationScore : null;
    });

    return {
      name: seg.name,
      type: 'line' as const,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      data,
      lineStyle: { color: seg.color, width: 2 },
      itemStyle: { color: seg.color },
      areaStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: seg.color + '30' },
            { offset: 1, color: seg.color + '05' },
          ],
        },
      },
    };
  });

  // SOP threshold lines
  const markLines = {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed' as const, width: 1 },
    data: [
      { yAxis: 0.85, lineStyle: { color: '#f59e0b80' }, label: { formatter: 'B級 0.85', color: '#f59e0b', fontSize: 10 } },
      { yAxis: 0.95, lineStyle: { color: '#ef444480' }, label: { formatter: 'A級 0.95', color: '#ef4444', fontSize: 10 } },
    ],
  };

  // Current time indicator
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
          .map((p) => `${p.marker} ${p.seriesName}: ${((p.value ?? 0) * 100).toFixed(0)}%`);
        return lines.join('<br/>');
      },
    },
    legend: {
      data: KEY_SEGMENTS.map((s) => s.name),
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 0,
      itemWidth: 16,
      itemHeight: 3,
    },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: timestamps.map((t) => t.split(' ')[1]),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: '#64748b', fontSize: 10, rotate: 45 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 1.1,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    series: series.map((s, idx) => ({
      ...s,
      markLine: idx === 0 ? markLines : undefined,
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
