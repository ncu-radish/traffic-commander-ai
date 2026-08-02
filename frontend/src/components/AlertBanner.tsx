import { useEffect } from 'react';
import type { AlertBanner } from '../types';
import { useMultiLangAlert } from '../hooks/useMultiLangAlert';
import './AlertBanner.css';

interface AlertBannerProps {
  alert: AlertBanner;
  onDismiss: () => void;
  /**
   * 家長/公眾視角：不需要看到「觸發判定」這種內部話術（第幾條、為什麼觸發），
   * 只要看到實際要公告的通知內容本身，而且要自動產生，不需要按鈕。
   * 校方視角維持原本：顯示SOP判定過程，操作者按按鈕才產生。
   */
  publicView?: boolean;
}

const LANG_LABELS: Record<'zh' | 'en' | 'ja' | 'ko', string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

export default function AlertBannerComponent({ alert, onDismiss, publicView }: AlertBannerProps) {
  const statusClass = alert.level === 'A' ? 'is-a' : 'is-b';
  const canProduceCmsMessage = Boolean(alert.eventId);
  const { state: multilang, requestMultiLang } = useMultiLangAlert();

  // 一偵測到可以產生公告內容的警報就直接自動產生，兩種視角都一樣，
  // 不需要操作者手動按按鈕才觸發。
  useEffect(() => {
    if (canProduceCmsMessage && multilang.status === 'idle') {
      requestMultiLang(alert.eventId!, alert.timestamp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canProduceCmsMessage, alert.eventId, alert.timestamp]);

  if (publicView && canProduceCmsMessage) {
    return (
      <div className={`alert status-rail ${statusClass}`} role="alert" aria-live="polite">
        <div className="alert__level num">{alert.level}</div>
        <div className="alert__body">
          {multilang.status === 'ready' ? (
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
          ) : multilang.status === 'error' ? (
            <p className="alert__message">通知產生失敗，請稍後再試。</p>
          ) : (
            <p className="alert__message">通知產生中…</p>
          )}
        </div>
        <div className="alert__aside">
          <button className="alert__close" onClick={onDismiss} aria-label="關閉通知">
            ✕
          </button>
        </div>
      </div>
    );
  }

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
        {alert.sopArticle && !publicView && (
          <span className="badge alert__sop">{alert.sopArticle}</span>
        )}
        <button className="alert__close" onClick={onDismiss} aria-label="關閉警報">
          ✕
        </button>
      </div>
    </div>
  );
}
