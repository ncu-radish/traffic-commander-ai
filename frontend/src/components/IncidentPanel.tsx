import { useState } from 'react';
import type { LiveIncident } from '../types';
import './IncidentPanel.css';

interface IncidentPanelProps {
  incidents: LiveIncident[];
  activeIncidents: LiveIncident[];
  onInjectIncident: (incident: LiveIncident) => void;
  /** 自訂 JSON 注入：帶回解析後的事件（camelCase）與原始 snake_case 資料。 */
  onInjectJson?: (incident: LiveIncident, raw: Record<string, unknown>) => void;
}

/** 將使用者貼入的 snake_case 事件 JSON 轉為前端 LiveIncident。 */
function rawToIncident(raw: Record<string, any>): LiveIncident {
  return {
    eventId: raw.event_id ?? `CUSTOM_${Date.now()}`,
    type: raw.type ?? 'Unknown',
    location: raw.location ?? '',
    affectedSegment: raw.affected_segment ?? '',
    affectedRoad: raw.affected_road,
    status: raw.status ?? '',
    severity: raw.severity ?? 'Medium',
    description: raw.description ?? '',
    timestamp: raw.timestamp ?? '',
  };
}

/** Incident type → SOP article that governs the response. */
const typeMeta: Record<string, { label: string; sop: string }> = {
  Road_Collapse_Accident: { label: '路面塌陷', sop: 'SOP 第 2 條' },
  Crowd_Surge_Injury: { label: '人群推擠', sop: 'SOP 第 3 條' },
  Power_Failure: { label: '號誌故障', sop: 'SOP 第 5 條' },
};

const severityMeta: Record<string, { cls: string; badge: string }> = {
  Critical: { cls: 'is-a', badge: 'badge-danger' },
  High: { cls: 'is-a', badge: 'badge-danger' },
  Medium: { cls: 'is-b', badge: 'badge-warning' },
};

export default function IncidentPanel({
  incidents,
  activeIncidents,
  onInjectIncident,
  onInjectJson,
}: IncidentPanelProps) {
  const activeIds = new Set(activeIncidents.map((i) => i.eventId));
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleJsonInject = () => {
    if (!onInjectJson) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError('JSON 格式錯誤，無法解析');
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (items.length === 0) {
      setJsonError('未包含任何事件');
      return;
    }
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        setJsonError('事件格式不正確（需為物件或物件陣列）');
        return;
      }
      const raw = item as Record<string, unknown>;
      onInjectJson(rawToIncident(raw as Record<string, any>), raw);
    }
    setJsonError(null);
    setJsonText('');
    setShowJson(false);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const jsonBox = (
    <div className="incident-json">
      <button
        className="btn btn-sm btn-ghost incident-json__toggle"
        onClick={() => setShowJson((v) => !v)}
      >
        {showJson ? '收合 JSON 注入' : '＋ 注入自訂 live_incidents.json'}
      </button>
      {showJson && (
        <div className="incident-json__body">
          <textarea
            className="incident-json__textarea"
            placeholder='貼入事件 JSON（單一物件或陣列），例如：&#10;{"event_id":"CUSTOM_001","type":"Road_Collapse_Accident","affected_segment":"RD_TPE_002","status":"Closed","severity":"Critical","location":"...","description":"...","timestamp":"2026-05-20 22:10"}'
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={6}
          />
          <div className="incident-json__actions">
            <label className="btn btn-sm btn-ghost incident-json__file">
              上傳檔案
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <button
              className="btn btn-sm btn-danger"
              onClick={handleJsonInject}
              disabled={!jsonText.trim()}
            >
              注入
            </button>
          </div>
          {jsonError && <p className="incident-json__error">{jsonError}</p>}
        </div>
      )}
    </div>
  );

  if (incidents.length === 0) {
    return (
      <div className="incidents">
        {jsonBox}
        <div className="panel">
          <div className="state">
            <span className="state__title">無待處理事件</span>
            <span>live_incidents.json 未載入或為空，可用上方 JSON 注入自訂事件</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="incidents">
      {jsonBox}
      {incidents.map((incident) => {
        const isActive = activeIds.has(incident.eventId);
        const meta = typeMeta[incident.type] ?? {
          label: incident.type,
          sop: '—',
        };
        const sev = severityMeta[incident.severity] ?? {
          cls: '',
          badge: 'badge-neutral',
        };

        return (
          <article
            key={incident.eventId}
            className={`incident panel status-rail ${sev.cls} ${
              isActive ? 'incident--active' : 'panel--interactive'
            }`}
          >
            <header className="incident__top">
              <span className="incident__type">{meta.label}</span>
              <span className={`badge ${sev.badge}`}>{incident.severity}</span>
            </header>

            <p className="incident__location">{incident.location}</p>
            <p className="incident__desc">{incident.description}</p>

            <div className="incident__meta">
              <span className="badge badge-neutral">{meta.sop}</span>
              <span className="incident__seg num">{incident.affectedSegment}</span>
            </div>

            <footer className="incident__foot">
              <time className="incident__time num">
                {incident.timestamp.split(' ')[1] ?? incident.timestamp}
              </time>
              <button
                className={`btn btn-sm ${isActive ? 'btn-ghost' : 'btn-danger'}`}
                onClick={() => onInjectIncident(incident)}
                disabled={isActive}
              >
                {isActive ? '已注入' : '注入事件'}
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
