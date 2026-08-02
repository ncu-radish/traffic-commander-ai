import { useState, useCallback } from 'react';
import { API_BASE } from '../config/api';

export interface AdvisoryReportDTO {
  event_id: string;
  event_description: string;
  sop_articles: string[];
  alert_level: string;
  alert_justification: string;
  route_plan: {
    primary_route: string | null;
    primary_route_name: string | null;
    secondary_routes: string[];
    excluded_routes: { route: string; reason: string }[];
    signal_adjustments: { road: string; adjustment: string; period: string }[];
  } | null;
  ete: {
    ete_minutes: number;
    base_clearance: number;
    congestion_penalty: number;
    severity: string;
    avg_saturation: number;
  } | null;
  cross_system_actions: string[];
  reasoning_chain: {
    step: number;
    title: string;
    description: string;
    data_evidence?: string;
    sop_reference?: string;
  }[];
  llm_summary: string | null;
}

/**
 * 事件注入時呼叫 /api/advisory/generate 產出完整建議書（SOP條文判定、路線規劃、
 * ETE、LLM生成的自然語言摘要），跳出彈窗給操作者看——guideline要求的「趨勢異常
 * 自動彈窗，摘要由LLM生成」，之前完全沒有前端在呼叫這支後端 API。
 */
export function useAdvisoryReport() {
  const [report, setReport] = useState<AdvisoryReportDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // 端到端延遲（毫秒）：從事件注入呼叫到畫面拿到重規劃結果。
  // guideline 模組 2 要求「60 秒內完成端到端重規劃」，這裡量測並顯示佐證。
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const requestAdvisory = useCallback(
    (eventId: string, timestamp?: string, eventData?: Record<string, unknown>) => {
    setOpen(true);
    setLoading(true);
    setReport(null);
    setElapsedMs(null);

    const startedAt = performance.now();

    // 自訂注入的事件不在 live_incidents.json 裡，後端無法用 event_id 查到，
    // 因此改傳原始 snake_case event_data 讓後端直接處理。
    const body = eventData
      ? { event_data: eventData, timestamp }
      : { event_id: eventId, timestamp };

    fetch(`${API_BASE}/advisory/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AdvisoryReportDTO | null) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => {
        setElapsedMs(performance.now() - startedAt);
        setLoading(false);
      });
    },
    []
  );

  const close = useCallback(() => setOpen(false), []);

  return { report, loading, open, elapsedMs, requestAdvisory, close };
}
