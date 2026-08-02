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
  | { status: 'ready'; triggered: boolean; messages: MultiLangMessagesDTO }
  | { status: 'error' };

/**
 * 事故/號誌故障（SOP第2/5條）的CMS簡訊——事故位置、改道指引、預計延誤時間、
 * 求援或避開提醒，都是後端算好的固定內容。第6條只決定要不要多語：事故周邊
 * 基地台有任一達Roaming門檻才會多語，否則只回傳中文，兩種情況都是真實內容。
 */
export function useMultiLangAlert() {
  const [state, setState] = useState<MultiLangState>({ status: 'idle' });

  const requestMultiLang = useCallback((eventId: string, timestamp?: string) => {
    setState({ status: 'loading' });
    fetch(`${API_BASE}/alerts/multilang`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, timestamp }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MultiLangAlertResponseDTO | null) => {
        if (!data || !data.messages) {
          setState({ status: 'error' });
          return;
        }
        setState({ status: 'ready', triggered: data.triggered, messages: data.messages });
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  return { state, requestMultiLang };
}
