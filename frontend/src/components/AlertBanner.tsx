import type { AlertBanner } from '../types';
import { useMultiLangAlert } from '../hooks/useMultiLangAlert';
import './AlertBanner.css';

interface AlertBannerProps {
  alert: AlertBanner;
  onDismiss: () => void;
}

const LANG_LABELS: Record<'zh' | 'en' | 'ja' | 'ko', string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

export default function AlertBannerComponent({ alert, onDismiss }: AlertBannerProps) {
  const statusClass = alert.level === 'A' ? 'is-a' : 'is-b';
  const canProduceCmsMessage = Boolean(alert.eventId);
  const { state: multilang, requestMultiLang } = useMultiLangAlert();

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

        {canProduceCmsMessage && multilang.status === 'idle' && (
          <button
            className="alert__multilang-btn"
            onClick={() => requestMultiLang(alert.eventId!, alert.timestamp)}
          >
            產出民眾簡訊
          </button>
        )}
        {canProduceCmsMessage && multilang.status === 'loading' && (
          <p className="alert__multilang-note">產生中…</p>
        )}
        {canProduceCmsMessage && multilang.status === 'error' && (
          <p className="alert__multilang-note">簡訊產生失敗，請確認 LLM 服務已啟動。</p>
        )}
        {canProduceCmsMessage && multilang.status === 'ready' && (
          <>
            {!multilang.triggered && (
              <p className="alert__multilang-note">周邊未達 SOP 第 6 條漫遊門檻，僅產出中文。</p>
            )}
            <dl className="alert__multilang-list">
              {(Object.keys(LANG_LABELS) as (keyof typeof LANG_LABELS)[]).map((lang) => {
                const text = multilang.messages[lang];
                if (!text) return null;
                return (
                  <div className="alert__multilang-item" key={lang}>
                    <dt>{LANG_LABELS[lang]}</dt>
                    <dd>{text}</dd>
                  </div>
                );
              })}
            </dl>
          </>
        )}
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
