import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Cloudy,
  Moon,
  Sun,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   天氣圖示 — OpenWeather icon 代碼 → Lucide 圖示

   為什麼用 Lucide 而不是 OpenWeather 官方圖檔：官方那組是高彩度插畫，
   貼進頂部長條會像 emoji 一樣變成色斑，與 Header 既有的「幾何線稿、
   低彩度」語彙衝突（同 .header__mark 的取捨）。Lucide 是統一線寬的
   線稿，且以 currentColor 上色，顏色能直接跟著 chip 的 --status 走，
   極端天氣轉 A 級紅不必另外配色。

   代碼取自 OpenWeather 官方定義：前兩碼是天氣群組，尾碼 d/n 是日夜。
   ═══════════════════════════════════════════════════════════════ */

interface WeatherIconProps {
  /** OpenWeather 的 icon 代碼，例如 '04d'。 */
  code: string;
  /** 邊長 px，預設對齊長條上的文字尺寸。 */
  size?: number;
}

/** [白天, 夜間]；兩者相同者代表該天氣不分日夜。 */
const ICON_BY_GROUP: Record<string, [LucideIcon, LucideIcon]> = {
  '01': [Sun, Moon], // 晴
  '02': [CloudSun, CloudMoon], // 少雲
  '03': [Cloud, Cloud], // 多雲
  '04': [Cloudy, Cloudy], // 陰
  '09': [CloudDrizzle, CloudDrizzle], // 陣雨
  '10': [CloudSunRain, CloudMoonRain], // 雨
  '11': [CloudLightning, CloudLightning], // 雷雨
  '13': [CloudSnow, CloudSnow], // 雪
  '50': [CloudFog, CloudFog], // 霧霾
};

export default function WeatherIcon({ code, size = 15 }: WeatherIconProps) {
  const pair = ICON_BY_GROUP[code.slice(0, 2)];
  // 未知代碼退回單朵雲，不留空白。
  const Icon = pair ? (code.endsWith('n') ? pair[1] : pair[0]) : Cloud;

  return (
    <Icon
      className="header__weather-icon"
      size={size}
      // 線寬略細於 Lucide 預設的 2，才配得上長條上的細字重。
      strokeWidth={1.6}
      aria-hidden="true"
    />
  );
}
