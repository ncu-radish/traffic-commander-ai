import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';

interface TrendSummaryDTO {
  summary: string | null;
  traffic_facts: string[];
  crowd_facts: string[];
}

type TrendSummaryState =
  | { status: 'loading' }
  | { status: 'ready'; summary: string | null }
  | { status: 'error' };

/**
 * 車流飽和度趨勢／人流密度趨勢兩張圖表的LLM摘要。事實（尖峰、首尾值、
 * 是否達門檻）由後端算好；LLM只負責把事實寫成一段話。不用手動按鈕，
 * 掛載時直接抓一次。
 */
export function useTrendSummary() {
  const [state, setState] = useState<TrendSummaryState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/advisory/trend-summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TrendSummaryDTO | null) => {
        if (cancelled) return;
        if (!data) {
          setState({ status: 'error' });
          return;
        }
        setState({ status: 'ready', summary: data.summary });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
