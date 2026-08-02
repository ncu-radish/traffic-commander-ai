import './Header.css';

interface HeaderProps {
  /**
   * 警報與事件計數。兩個都省略時整組計數器不顯示 ——
   * 家長端沒有事件注入介面，顯示 0/0 會誤導。
   */
  activeIncidentCount?: number;
  alertCount?: number;
  currentTimestamp?: string;
  onToggleAdvisory?: () => void;
  /** 回到角色選擇。有了它才能在校方端與家長端之間來回驗證同步結果。 */
  onBack?: () => void;
  /** 角色標籤，例如「家長方模式」。 */
  roleLabel?: string;
}

export default function Header({
  activeIncidentCount,
  alertCount,
  currentTimestamp,
  onToggleAdvisory,
  onBack,
  roleLabel,
}: HeaderProps) {
  const showCounters =
    activeIncidentCount !== undefined || alertCount !== undefined;
  return (
    <header className="header">
      <div className="header__brand">
        {onBack && (
          <button className="header__back" onClick={onBack}>
            ← 切換視角
          </button>
        )}
        <img
          className="header__logo"
          src="/favicon.svg"
          alt=""
          aria-hidden="true"
        />
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

        {roleLabel && <span className="badge badge-info">{roleLabel}</span>}

        {showCounters && (
          <div className="header__counters">
            <div
              className={`header__stat ${(alertCount ?? 0) > 0 ? 'is-b' : ''}`}
              title="作用中的 SOP 門檻警報"
            >
              <span className="dot" />
              <span className="num">{alertCount ?? 0}</span>
              <span className="header__stat-label">警報</span>
            </div>

            <div
              className={`header__stat ${(activeIncidentCount ?? 0) > 0 ? 'is-a' : ''}`}
              title="已注入且處理中的事件"
            >
              <span className="dot" />
              <span className="num">{activeIncidentCount ?? 0}</span>
              <span className="header__stat-label">事件</span>
            </div>
          </div>
        )}

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
