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

// 時間軸每跳一格（自動播放時每2秒一格）就重打一次LLM會太密集，這裡debounce
// 一下：時間軸停下來900ms後才真的送出請求，快速拖曳/連續播放時只打最後一次。
const DEBOUNCE_MS = 900;

/**
 * 車流飽和度趨勢／人流密度趨勢兩張圖表的LLM摘要。事實（當下各路段/場站
 * 是否達門檻）由後端算好；LLM只負責把事實寫成一句話。不用手動按鈕，
 * 時間軸移動到哪就自動反映當下哪裡壅塞。
 */
export function useTrendSummary(currentTimestamp: string) {
  const [state, setState] = useState<TrendSummaryState>({ status: 'loading' });

  useEffect(() => {
    if (!currentTimestamp) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      setState({ status: 'loading' });
      const url = `${API_BASE}/advisory/trend-summary?timestamp=${encodeURIComponent(currentTimestamp)}`;
      fetch(url)
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
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentTimestamp]);

  return state;
}
