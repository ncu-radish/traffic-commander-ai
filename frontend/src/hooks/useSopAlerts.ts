import { useState, useEffect, useCallback } from 'react';
import type { LiveIncident, AlertBanner, AlertLevel } from '../types';

const API_BASE = 'http://localhost:8000/api';

interface SOPAlertDTO {
  article: string;
  level: string;
  title: string;
  description: string;
  triggered_by: string;
  data_evidence: Record<string, unknown>;
  actions: string[];
}

interface AlertCheckResponseDTO {
  timestamp: string;
  alerts: SOPAlertDTO[];
  crowd_alerts: SOPAlertDTO[];
  roaming_alerts: SOPAlertDTO[];
}

function toBanner(a: SOPAlertDTO, timestamp: string): AlertBanner {
  return {
    id: `${a.article}-${a.triggered_by}-${timestamp}`,
    level: (a.level as AlertLevel) || 'normal',
    title: a.title,
    message: a.description,
    timestamp,
    sopArticle: a.article,
    dismissed: false,
  };
}

/**
 * 統一呼叫後端 /api/alerts/check（涵蓋SOP第1-6條，含之前前端漏掉的第4條大巨蛋
 * 散場、第5條號誌故障），取代校方版/家長版各自手寫、只涵蓋部分條文的門檻判定，
 * 單一事實來源。第2/5條（事故/號誌故障）只評估目前已注入（activeIncidents）
 * 的事件，不會因為資料裡還沒注入的事件就提早跳警報。
 *
 * 有些注入事件（例如人潮推擠類型）不一定對應到任何SOP條文的自動判定，但「注入
 * 事件」這個動作本身就該讓人看到警示，所以沒被後端涵蓋到的事件另外補一則通用
 * 通報，其餘一律以後端傳回的正式SOP條文內容為準。
 */
export function useSopAlerts(currentTimestamp: string, activeIncidents: LiveIncident[]) {
  const [alerts, setAlerts] = useState<AlertBanner[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentTimestamp) return;
    let cancelled = false;

    const activeIds = activeIncidents.map((i) => i.eventId).join(',');
    const url = `${API_BASE}/alerts/check?timestamp=${encodeURIComponent(currentTimestamp)}&active_incident_ids=${encodeURIComponent(activeIds)}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AlertCheckResponseDTO | null) => {
        if (cancelled || !data) return;

        const sopAlerts = [...data.alerts, ...data.crowd_alerts, ...data.roaming_alerts];
        const banners = sopAlerts.map((a) => toBanner(a, data.timestamp));

        const coveredEventIds = new Set(sopAlerts.map((a) => a.triggered_by));
        for (const incident of activeIncidents) {
          if (coveredEventIds.has(incident.eventId)) continue;
          banners.push({
            id: `incident-${incident.eventId}`,
            level: incident.severity === 'Critical' || incident.severity === 'High' ? 'A' : 'B',
            title: `事件通報 — ${incident.location}`,
            message: incident.description,
            timestamp: incident.timestamp,
            dismissed: false,
          });
        }

        setAlerts(banners);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTimestamp, activeIncidents]);

  const dismissAlert = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id));

  return { visibleAlerts, dismissAlert };
}
