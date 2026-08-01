import type { LiveIncident } from '../types';
import './IncidentPanel.css';

interface IncidentPanelProps {
  incidents: LiveIncident[];
  activeIncidents: LiveIncident[];
  onInjectIncident: (incident: LiveIncident) => void;
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
}: IncidentPanelProps) {
  const activeIds = new Set(activeIncidents.map((i) => i.eventId));

  if (incidents.length === 0) {
    return (
      <div className="panel">
        <div className="state">
          <span className="state__title">無待處理事件</span>
          <span>live_incidents.json 未載入或為空</span>
        </div>
      </div>
    );
  }

  return (
    <div className="incidents">
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
