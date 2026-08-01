import { motion } from 'framer-motion';
import './Header.css';

interface HeaderProps {
  activeIncidentCount: number;
  alertCount: number;
}

export default function Header({ activeIncidentCount, alertCount }: HeaderProps) {
  return (
    <motion.header
      className="header"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="header-left">
        <div className="header-logo">
          <span className="logo-icon">🛡️</span>
          <div>
            <h1 className="header-title">交通指揮官 AI</h1>
            <p className="header-subtitle">Traffic Commander Agent</p>
          </div>
        </div>
      </div>

      <div className="header-center">
        <span className="header-badge badge badge-info">
          中華電信 × 信義計畫區
        </span>
      </div>

      <div className="header-right">
        {alertCount > 0 && (
          <motion.div
            className="header-alert-count"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            <span className="pulse-dot danger" />
            {alertCount} 則警報
          </motion.div>
        )}
        {activeIncidentCount > 0 && (
          <div className="header-incident-count">
            🚨 {activeIncidentCount} 起事件處理中
          </div>
        )}
        <div className="header-status">
          <span className="status-dot" />
          系統運行中
        </div>
      </div>
    </motion.header>
  );
}
