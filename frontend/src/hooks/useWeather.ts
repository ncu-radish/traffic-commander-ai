import { useEffect, useState } from 'react';
import { API_BASE } from '../config/api';

/* ═══════════════════════════════════════════════════════════════
   即時天氣 — 供頂部長條顯示

   後端已有 GET /api/weather/current（app/api/routes/weather.py），
   回傳 OpenWeather 原始 JSON 加上後端算好的 is_severe。這裡不改後端，
   所以正規化放在前端：頂部長條只要「天氣描述 + 溫度 + 是否極端」，
   其餘巢狀欄位一律收斂成 WeatherSnapshot，元件就不必碰上游結構。

   注意：這是「實際當下」的天氣，與儀表板的模擬時間軸無關（時間軸是
   資料集的歷史時間），所以 UI 上以 tooltip 標明，避免誤讀。
   ═══════════════════════════════════════════════════════════════ */

/** 後端 /weather/current 的形狀；欄位全部視為選填，缺值不該讓畫面掛掉。 */
interface CurrentWeatherResponse {
  weather?: {
    weather?: { main?: string; description?: string; icon?: string }[];
    main?: { temp?: number; feels_like?: number; humidity?: number };
    wind?: { speed?: number };
    rain?: { '1h'?: number };
  };
  is_severe?: boolean;
}

export interface WeatherSnapshot {
  /** 中文天氣描述（後端帶 lang=zh_tw 查詢）。 */
  description: string;
  /** 英文主類型，例如 Rain / Thunderstorm，做為描述缺值時的退路。 */
  main: string;
  /**
   * OpenWeather 的 icon 代碼（01d~50n），交給 WeatherIcon 選圖示。
   * 用它而不是 main，因為它已含日/夜資訊，也把「少雲/多雲/陰」分了級。
   */
  iconCode: string;
  tempC: number | null;
  feelsLikeC: number | null;
  humidity: number | null;
  /** 風速 m/s。 */
  windSpeed: number | null;
  /** 1 小時累積雨量 mm；OpenWeather 無雨時不回這個欄位，補 0。 */
  rain1h: number;
  /** 由後端 is_severe_weather() 判定（雷雨 / 時雨量 >50mm / 風速 >17.2m/s）。 */
  isSevere: boolean;
}

/** OpenWeather 免費方案的觀測值約每 10 分鐘更新，重取頻率跟著它。 */
const REFRESH_MS = 10 * 60 * 1000;

function normalize(payload: CurrentWeatherResponse): WeatherSnapshot {
  const raw = payload.weather ?? {};
  const condition = raw.weather?.[0] ?? {};
  return {
    description: condition.description ?? condition.main ?? '',
    main: condition.main ?? '',
    iconCode: condition.icon ?? '',
    tempC: raw.main?.temp ?? null,
    feelsLikeC: raw.main?.feels_like ?? null,
    humidity: raw.main?.humidity ?? null,
    windSpeed: raw.wind?.speed ?? null,
    rain1h: raw.rain?.['1h'] ?? 0,
    isSevere: payload.is_severe ?? false,
  };
}

export interface UseWeatherResult {
  weather: WeatherSnapshot | null;
  /** 只在第一次載入為 true，之後的背景重取不讓畫面閃動。 */
  loading: boolean;
  /** 取不到時的原因，顯示在 tooltip 裡，方便現場排查（多半是 API key 或後端沒起）。 */
  error: string | null;
}

/**
 * 取得即時天氣，並以 REFRESH_MS 定期重取。
 *
 * 失敗時保留上一次成功的資料（weather 不清空）並記下 error，
 * 短暫的網路抖動就不會讓頂部長條的天氣忽然消失。
 */
export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/weather/current`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`天氣服務回應 ${res.status}`);
        const data: CurrentWeatherResponse = await res.json();
        if (cancelled) return;
        setWeather(normalize(data));
        setError(null);
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : '無法取得天氣資料');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  return { weather, loading, error };
}
