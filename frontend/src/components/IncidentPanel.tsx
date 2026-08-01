import { motion } from 'framer-motion';
import type { LiveIncident } from '../types';
import './IncidentPanel.css';

interface IncidentPanelProps {
  incidents: LiveIncident[];
  activeIncidents: LiveIncident[];
  onInjectIncident: (incident: LiveIncident) => void;
}

const typeLabels: Record<string, { label: string; icon: string }> = {
  Road_Collapse_Accident: { label: '路面塌陷', icon: '🕳️' },
  Crowd_Surge_Injury: { label: '人群推擠', icon: '🏃' },
  Power_Failure: { label: '號誌故障', icon: '⚡' },
};

const severityClass: Record<string, string> = {
  Critical: 'badge-danger',
  High: 'badge-warning',
  Medium: 'badge-info',
};

export default function IncidentPanel({ incidents, activeIncidents, onInjectIncident }: IncidentPanelProps) {
  const activeIds = new Set(activeIncidents.map((i) => i.eventId));

  return (
    <div className="incident-panel glass-panel">
      <div className="glass-panel-header">
        <span>🚨</span>
        突發事件注入器
      </div>

      <div className="incident-list">
        {incidents.map((incident, i) => {
          const isActive = activeIds.has(incident.eventId);
          const typeInfo = typeLabels[incident.type] || { label: incident.type, icon: '⚠️' };

          return (
            <motion.div
              key={incident.eventId}
              className={`incident-card ${isActive ? 'active' : ''}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="incident-header">
                <span className="incident-icon">{typeInfo.icon}</span>
                <span className="incident-type">{typeInfo.label}</span>
                <span className={`badge ${severityClass[incident.severity] || 'badge-neutral'}`}>
                  {incident.severity}
                </span>
              </div>

              <p className="incident-location">{incident.location}</p>
              <p className="incident-desc">{incident.description}</p>

              <div className="incident-footer">
                <span className="incident-time">🕐 {incident.timestamp}</span>
                <button
                  className={`btn ${isActive ? 'btn-ghost' : 'btn-danger'} btn-sm`}
                  onClick={() => onInjectIncident(incident)}
                  disabled={isActive}
                >
                  {isActive ? '✓ 已注入' : '注入事件'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
