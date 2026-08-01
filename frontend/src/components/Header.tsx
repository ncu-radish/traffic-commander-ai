import './Header.css';

interface HeaderProps {
  activeIncidentCount: number;
  alertCount: number;
  currentTimestamp?: string;
  onToggleAdvisory?: () => void;
}

export default function Header({
  activeIncidentCount,
  alertCount,
  currentTimestamp,
  onToggleAdvisory,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__mark" aria-hidden="true" />
        <div className="header__titles">
          <h1 className="header__title">交通指揮官 AI</h1>
          <span className="header__subtitle">Traffic Commander Agent</span>
        </div>
      </div>

      <div className="header__context">
        <span className="header__org">中華電信</span>
        <span className="header__sep" aria-hidden="true" />
        <span>信義計畫區</span>
      </div>

      <div className="header__status">
        {currentTimestamp && (
          <div className="header__clock" title="模擬時間軸位置">
            <span className="header__clock-label">SIM</span>
            <span className="num header__clock-time">
              {currentTimestamp.split(' ')[1] ?? '--:--'}
            </span>
          </div>
        )}

        <div className="header__counters">
          <div
            className={`header__stat ${alertCount > 0 ? 'is-b' : ''}`}
            title="作用中的 SOP 門檻警報"
          >
            <span className="dot" />
            <span className="num">{alertCount}</span>
            <span className="header__stat-label">警報</span>
          </div>

          <div
            className={`header__stat ${activeIncidentCount > 0 ? 'is-a' : ''}`}
            title="已注入且處理中的事件"
          >
            <span className="dot" />
            <span className="num">{activeIncidentCount}</span>
            <span className="header__stat-label">事件</span>
          </div>
        </div>

        <div className="header__health" title="後端連線正常">
          <span className="status-dot" />
          <span className="header__health-label">系統運行中</span>
        </div>

        {onToggleAdvisory && (
          <button
            className="btn btn-sm advisory-toggle"
            onClick={onToggleAdvisory}
            aria-label="切換策略諮詢面板"
          >
            諮詢
          </button>
        )}
      </div>
    </header>
  );
}
