import ReactECharts from 'echarts-for-react';
import type { TrafficSegment } from '../types';
import { chart, level, series as palette, threshold, font } from '../theme/tokens';

interface TrafficChartProps {
  trafficData: TrafficSegment[];
  currentTimestamp: string;
}

/** Segments worth tracking over time; the two SOP trigger roads lead. */
const KEY_SEGMENTS = [
  { id: 'RD_TPE_001', name: '忠孝東路四段' },
  { id: 'RD_TPE_002', name: '光復南路' },
  { id: 'RD_TPE_003', name: '基隆路一段' },
  { id: 'RD_TPE_004', name: '市民大道四段' },
  { id: 'RD_TPE_006', name: '敦化南路一段' },
];

export default function TrafficChart({ trafficData, currentTimestamp }: TrafficChartProps) {
  const timestamps = [...new Set(trafficData.map((d) => d.timestamp))].sort();

  if (timestamps.length === 0) {
    return (
      <div className="state">
        <span className="state__title">無車流資料</span>
      </div>
    );
  }

  const clockLabels = timestamps.map((t) => t.split(' ')[1]);
  const currentIdx = timestamps.indexOf(currentTimestamp);

  const seriesData = KEY_SEGMENTS.map((seg, i) => {
    const color = palette[i % palette.length];
    const segData = trafficData.filter((d) => d.segmentId === seg.id);

    return {
      name: seg.name,
      type: 'line' as const,
      smooth: true,
      smoothMonotone: 'x' as const,
      symbol: 'circle',
      symbolSize: 3,
      showSymbol: false,
      // Gaps stay gaps — the data is sparse and interpolating would
      // invent readings that were never measured.
      connectNulls: false,
      data: timestamps.map((ts) => {
        const found = segData.find((d) => d.timestamp === ts);
        return found ? found.saturationScore : null;
      }),
      lineStyle: { color, width: 1.6 },
      itemStyle: { color },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2.4 } },
    };
  });

  /** SOP 第 1 條 門檻線（B 85%、A 95%），只畫虛線不標文字。 */
  const thresholdLines = {
    silent: true,
    symbol: 'none' as const,
    lineStyle: { type: 'dashed' as const, width: 1 },
    // 只留虛線，不標文字。兩條門檻只差 10%（繪圖區約 15px），
    // 任何標籤都會擠在一起或壓到曲線；級別的意義改由
    // tooltip 的 A/B 標記與地圖圖例承擔。
    label: { show: false },
    data: [
      {
        yAxis: threshold.saturationB,
        lineStyle: { color: level.b, opacity: 0.5 },
      },
      {
        yAxis: threshold.saturationA,
        lineStyle: { color: level.a, opacity: 0.55 },
      },
    ],
  };

  /** Vertical band marking where the timeline cursor sits. */
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
          .map((p) => {
            const v = (p.value ?? 0) * 100;
            const tag =
              (p.value ?? 0) >= threshold.saturationA
                ? ' A'
                : (p.value ?? 0) >= threshold.saturationB
                  ? ' B'
                  : '';
            return `<div style="display:flex;align-items:center;gap:6px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${p.color}"></span>
              <span style="flex:1">${p.seriesName}</span>
              <span style="font-variant-numeric:tabular-nums;font-weight:600">${v.toFixed(0)}%${tag}</span>
            </div>`;
          });

        if (rows.length === 0) return '';
        const head = `<div style="font-size:10px;color:${chart.axisLabel};margin-bottom:4px">${params[0].axisValue}</div>`;
        return head + rows.join('');
      },
    },
    legend: {
      data: KEY_SEGMENTS.map((s) => s.name),
      textStyle: { color: chart.legendLabel, fontSize: 10 },
      inactiveColor: '#4E5057',
      top: 2,
      itemWidth: 12,
      itemHeight: 2,
      itemGap: 10,
      icon: 'roundRect',
    },
    /**
     * top 要留兩行圖例的高度。五個路段名稱在半欄寬（約 370px）放不下
     * 一行，ECharts 會自動換行，若只留一行的空間，第二行就會壓到
     * 繪圖區與 A/B 級門檻標籤上。
     */
    grid: { left: 38, right: 12, top: 50, bottom: 26 },
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
      min: 0,
      max: 1,
      interval: 0.25,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chart.axisLabel,
        fontSize: 9,
        fontFamily: font.mono,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: chart.splitLine } },
    },
    series: seriesData.map((s, idx) => ({
      ...s,
      markLine: idx === 0 ? thresholdLines : undefined,
      markArea: idx === 0 ? cursorBand : undefined,
    })),
  };

  return (
    <ReactECharts
      option={option}
      // 圖例改留兩行後，把高度一併加高，繪圖區才不會被壓扁。
      style={{ height: 226 }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}
