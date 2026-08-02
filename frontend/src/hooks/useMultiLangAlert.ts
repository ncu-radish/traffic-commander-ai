import { useState, useCallback } from 'react';
import { API_BASE } from '../config/api';

export interface MultiLangMessagesDTO {
  zh: string;
  en: string;
  ja: string | null;
  ko: string | null;
}

interface MultiLangAlertResponseDTO {
  triggered: boolean;
  trigger_stations: string[];
  roaming_details: Record<string, number>;
  messages: MultiLangMessagesDTO | null;
}

type MultiLangState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; messages: MultiLangMessagesDTO }
  | { status: 'not-triggered' }
  | { status: 'error' };

/**
 * SOP第6條——後端 /api/alerts/multilang 早就能產出中英日韓四語簡訊，但一直
 * 沒有前端在呼叫。這支 hook 讓 AlertBanner 上加一個「產出多語簡訊」按鈕就能用。
 */
export function useMultiLangAlert() {
  const [state, setState] = useState<MultiLangState>({ status: 'idle' });

  const requestMultiLang = useCallback((timestamp?: string) => {
    setState({ status: 'loading' });
    fetch(`${API_BASE}/alerts/multilang`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MultiLangAlertResponseDTO | null) => {
        if (!data || !data.triggered || !data.messages) {
          setState({ status: 'not-triggered' });
          return;
        }
        setState({ status: 'ready', messages: data.messages });
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  return { state, requestMultiLang };
}
