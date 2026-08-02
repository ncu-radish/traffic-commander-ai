import { useWeather } from '../hooks/useWeather';
import WeatherIcon from './WeatherIcon';
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

  /**
   * 天氣直接在 Header 內取，不從兩端各自傳 props 進來。
   * Root 以 mode 互斥掛載校方端與家長端，同一時間只有一個 Header，
   * 所以不會重複請求；而且天氣是與畫面狀態無關的環境資訊，
   * 放這裡兩端就都有，不必在 App.tsx / UserView.tsx 各接一次。
   */
  const { weather, loading: weatherLoading, error: weatherError } = useWeather();

  /** tooltip 補上體感、濕度、風速、雨量，長條上只留最關鍵的兩個數字。 */
  const weatherTitle = weather
    ? [
        // 地點寫死「信義計畫區」：後端查的是固定座標（25.0408, 121.5654），
        // 而 OpenWeather 回的 name 是網格羅馬拼音（Xianeibu），顯示出來像壞掉。
        '信義計畫區即時天氣',
        weather.feelsLikeC !== null ? `體感 ${Math.round(weather.feelsLikeC)}°C` : null,
        weather.humidity !== null ? `濕度 ${weather.humidity}%` : null,
        weather.windSpeed !== null ? `風速 ${weather.windSpeed} m/s` : null,
        weather.rain1h > 0 ? `時雨量 ${weather.rain1h} mm` : null,
        weather.isSevere ? '判定為極端天氣（SOP 應變參考）' : null,
        '資料來源 OpenWeather',
      ]
        .filter(Boolean)
        .join(' · ')
    : (weatherError ?? '天氣資料載入中');

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
          <h1 className="header__title">牽牽</h1>
          <span className="header__subtitle">智慧交通決策系統</span>
        </div>
      </div>

      <div className="header__context">
        <span className="header__org">中華電信</span>
        <span className="header__sep" aria-hidden="true" />
        <span>信義計畫區</span>
      </div>

      <div className="header__status">
        {/* 天氣：與 SIM 時鐘同一套 chip 造型，極端天氣時整顆轉成 A 級色。 */}
        <div
          className={`header__weather ${weather?.isSevere ? 'is-a' : ''}`}
          title={weatherTitle}
        >
          {weather ? (
            <>
              {/* 圖示取代文字標籤；沒有天氣資料時才退回「天氣」二字，
                  因為那時沒有天氣狀況可畫。 */}
              <WeatherIcon code={weather.iconCode} />
              <span className="header__weather-cond">
                {weather.description || weather.main || '—'}
              </span>
              <span className="num header__weather-temp">
                {weather.tempC !== null ? `${Math.round(weather.tempC)}°C` : '--'}
              </span>
            </>
          ) : (
            <>
              <span className="header__weather-label">天氣</span>
              <span className="header__weather-temp header__weather-temp--empty">
                {weatherLoading ? '···' : '--'}
              </span>
            </>
          )}
        </div>

        {weather?.isSevere && (
          <span className="badge badge-danger" title="極端天氣，請一併檢視 SOP 應變條款">
            極端天氣
          </span>
        )}

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
