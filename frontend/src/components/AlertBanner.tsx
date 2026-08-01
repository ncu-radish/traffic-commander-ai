import type { AlertBanner } from '../types';
import './AlertBanner.css';

interface AlertBannerProps {
  alert: AlertBanner;
  onDismiss: () => void;
}

export default function AlertBannerComponent({ alert, onDismiss }: AlertBannerProps) {
  const statusClass = alert.level === 'A' ? 'is-a' : 'is-b';

  return (
    <div
      className={`alert status-rail ${statusClass}`}
      role="alert"
      aria-live="polite"
    >
      <div className="alert__level num">{alert.level}</div>

      <div className="alert__body">
        <div className="alert__title">{alert.title}</div>
        <p className="alert__message">{alert.message}</p>
      </div>

      <div className="alert__aside">
        {alert.sopArticle && (
          <span className="badge alert__sop">{alert.sopArticle}</span>
        )}
        <button className="alert__close" onClick={onDismiss} aria-label="關閉警報">
          ✕
        </button>
      </div>
    </div>
  );
}
