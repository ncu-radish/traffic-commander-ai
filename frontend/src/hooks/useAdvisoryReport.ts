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

  const requestAdvisory = useCallback((eventId: string, timestamp?: string) => {
    setOpen(true);
    setLoading(true);
    setReport(null);

    fetch(`${API_BASE}/advisory/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, timestamp }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AdvisoryReportDTO | null) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { report, loading, open, requestAdvisory, close };
}
