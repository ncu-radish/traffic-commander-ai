import { motion } from 'framer-motion';
import type { AlertBanner } from '../types';
import './AlertBanner.css';

interface AlertBannerProps {
  alert: AlertBanner;
  onDismiss: () => void;
}

export default function AlertBannerComponent({ alert, onDismiss }: AlertBannerProps) {
  const levelClass = alert.level === 'A' ? 'alert-banner-critical' : 'alert-banner-warning';

  return (
    <motion.div
      className={`alert-banner ${levelClass}`}
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
    >
      <div className="alert-banner-content">
        <div className="alert-banner-title">{alert.title}</div>
        <div className="alert-banner-message">{alert.message}</div>
        {alert.sopArticle && (
          <span className="badge badge-info alert-sop">{alert.sopArticle}</span>
        )}
      </div>
      <button className="alert-dismiss-btn" onClick={onDismiss} title="關閉">
        ✕
      </button>
    </motion.div>
  );
}
