/**
 * Design tokens for canvas/JS consumers.
 *
 * ECharts and Leaflet paint outside the CSS cascade, so they cannot read
 * `var(--level-a)`. This module mirrors the CSS custom properties in
 * `src/styles/variables.css` and is the single source of truth for those
 * consumers.
 *
 * Keep in sync with variables.css. Do not hardcode hex in components.
 */

/** Matte-black surface ramp. */
export const surface = {
  base: '#121214',
  sunken: '#0E0E10',
  panel: '#1C1D21',
  raised: '#222328',
  input: '#191A1E',
} as const;

/** Hairlines. Layering comes from lightness, never colour. */
export const line = {
  faint: '#23242A',
  base: '#2A2B30',
  strong: '#35363D',
} as const;

export const text = {
  primary: '#E8E8EA',
  secondary: '#9A9CA3',
  muted: '#6E7076',
  disabled: '#4E5057',
} as const;

/**
 * Traffic-signal semantics, desaturated so they read as instrument
 * readouts rather than neon.
 */
export const level = {
  /** A 級 — paralysed. Dimmed fire-hydrant red. */
  a: '#B54A3F',
  /** B 級 — congested. Amber / ochre. */
  b: '#C08B3E',
  /** Elevated but below B threshold. */
  watch: '#9A7B4F',
  /** Normal / cleared. Moss. */
  ok: '#4C8C6B',
} as const;

/** Cool grey-blue. Punctuation only — links, primary action, lead series. */
export const accent = {
  base: '#6C8CA8',
  bright: '#86A6C2',
  dim: '#4E6B84',
} as const;

/** Road geometry on the map. */
export const road = {
  default: '#3A3C42',
  arterial: '#4A4D55',
  /** Recommended primary evacuation route. */
  primaryRoute: '#6C8CA8',
  /** Secondary diversion — thinner, dashed. */
  secondaryRoute: '#54606D',
  /** Segment under incident. */
  blocked: '#B54A3F',
} as const;

/**
 * Categorical series palette for time-series charts.
 * Muted, distinguishable, no two adjacent hues fighting for attention.
 */
export const series = [
  '#86A6C2', // cool blue — lead
  '#C08B3E', // amber
  '#4C8C6B', // moss
  '#9B8AA6', // dusty violet
  '#B08A6A', // clay
] as const;

/** Shared ECharts fragments so every chart inherits the same chrome. */
export const chart = {
  bg: 'transparent',
  axisLine: line.faint,
  splitLine: 'rgba(255, 255, 255, 0.035)',
  axisLabel: text.muted,
  legendLabel: text.secondary,
  tooltip: {
    backgroundColor: surface.panel,
    borderColor: line.base,
    borderWidth: 1,
    textStyle: { color: text.primary, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 28px rgba(0,0,0,0.55); border-radius: 10px;',
  },
  /** Marks the timeline cursor on a chart. */
  cursorBand: 'rgba(108, 140, 168, 0.10)',
} as const;

/**
 * SOP thresholds. Drawn as reference lines so the judge can see the
 * rule, not just the curve.
 */
export const threshold = {
  /** SOP 第 1 條 — B 級 壅擠. */
  saturationB: 0.85,
  /** SOP 第 1 條 — A 級 癱瘓. */
  saturationA: 0.95,
  /** SOP 第 3 條 — BL17 headcount. */
  crowdBL17: 25000,
  /** SOP 第 6 條 — roaming ratio triggering multilingual alerts. */
  roaming: 0.3,
} as const;

/**
 * Map a saturation score to its SOP level colour.
 * Single source of truth for polylines, dots and metric cards.
 */
export function saturationColor(saturation: number): string {
  if (saturation >= threshold.saturationA) return level.a;
  if (saturation >= threshold.saturationB) return level.b;
  if (saturation >= 0.7) return level.watch;
  return level.ok;
}

/** SOP level label for a saturation score. */
export function saturationLevel(saturation: number): 'A' | 'B' | 'watch' | 'ok' {
  if (saturation >= threshold.saturationA) return 'A';
  if (saturation >= threshold.saturationB) return 'B';
  if (saturation >= 0.7) return 'watch';
  return 'ok';
}

/** Stroke weight scales with severity so A-level reads first. */
export function saturationWeight(saturation: number): number {
  if (saturation >= threshold.saturationA) return 5;
  if (saturation >= threshold.saturationB) return 4;
  return 3;
}

export const radius = {
  sm: 6,
  base: 10,
  lg: 12,
} as const;

export const font = {
  sans:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', " +
    "'PingFang TC', 'Microsoft JhengHei', sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
} as const;
