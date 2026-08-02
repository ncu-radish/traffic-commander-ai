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

/**
 * Rice-white surface ramp. This drives everything EXCEPT the map: the
 * map (tiles + all its overlays) intentionally stays on the old dark
 * matte palette — see the hardcoded dark values further down in
 * `road`, which are independent of these tokens on purpose.
 */
export const surface = {
  base: '#F7F2E6',
  sunken: '#EEE6D2',
  panel: '#FFFDF7',
  raised: '#F1E9D9',
  input: '#FBF7EC',
} as const;

/** Hairlines. Layering comes from lightness, never colour. */
export const line = {
  faint: '#E7DEC7',
  base: '#D9CDAD',
  strong: '#C2B48C',
} as const;

export const text = {
  primary: '#2A241B',
  secondary: '#5B5240',
  muted: '#837962',
  disabled: '#ACA189',
} as const;

/**
 * Traffic-signal semantics. A/B are reserved colours — no other UI
 * element may reuse them (see variables.css for the CSS-side note).
 * Vivid enough to read on both the light chrome and the dark map.
 */
export const level = {
  /** A 級 — paralysed. 橘紅 orange-red. */
  a: '#E24E1B',
  /** B 級 — congested. 向日葵黃 sunflower yellow. */
  b: '#E8A800',
  /** Elevated but below B threshold. */
  watch: '#B4832E',
  /** Normal / cleared. Teal-green, kept clear of 家長's avocado green. */
  ok: '#2E8B6E',
} as const;

/** Neutral slate-blue. Punctuation only — deliberately muted so it
 * never competes with the two reserved role colours (school/parent). */
export const accent = {
  base: '#4E6E8C',
  bright: '#6E93B4',
  dim: '#3C5771',
} as const;

/**
 * Road geometry on the map. Fixed dark-map-safe values, independent
 * of `accent`/`surface` above — the map keeps its own dark theme even
 * though the rest of the app is now rice-white.
 */
export const road = {
  default: '#3A3C42',
  arterial: '#4A4D55',
  /** Recommended primary evacuation route. */
  primaryRoute: '#6C8CA8',
  /** Secondary diversion — thinner, dashed. */
  secondaryRoute: '#54606D',
  /** Segment under incident. */
  blocked: '#E24E1B',
} as const;

/**
 * Categorical series palette for time-series charts.
 * Muted, distinguishable, no two adjacent hues fighting for attention.
 */
export const series = [
  '#4E6E8C', // slate blue — lead
  '#2E8B6E', // teal-green
  '#9B8AA6', // dusty violet
  '#B08A6A', // clay
  '#6E93B4', // accent bright
] as const;

/** Shared ECharts fragments so every chart inherits the same chrome. */
export const chart = {
  bg: 'transparent',
  axisLine: line.faint,
  splitLine: 'rgba(42, 36, 27, 0.05)',
  axisLabel: text.muted,
  legendLabel: text.secondary,
  tooltip: {
    backgroundColor: surface.panel,
    borderColor: line.base,
    borderWidth: 1,
    textStyle: { color: text.primary, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 28px rgba(42,36,27,0.18); border-radius: 10px;',
  },
  /** Marks the timeline cursor on a chart. */
  cursorBand: 'rgba(78, 110, 140, 0.10)',
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
