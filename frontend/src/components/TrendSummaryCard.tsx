import { useTrendSummary } from '../hooks/useTrendSummary';
import './TrendSummaryCard.css';

export default function TrendSummaryCard() {
  const state = useTrendSummary();

  return (
    <div className="chart-card trend-summary-card">
      <div className="chart-card__header">趨勢摘要</div>
      <div className="chart-card__body trend-summary-card__body">
        {state.status === 'loading' && (
          <span className="trend-summary-card__hint">AI 綜合分析中...</span>
        )}
        {state.status === 'error' && (
          <span className="trend-summary-card__hint">摘要暫時無法產生</span>
        )}
        {state.status === 'ready' && (
          <p className="trend-summary-card__text">
            {state.summary ?? '目前無足夠資料可供摘要'}
          </p>
        )}
      </div>
    </div>
  );
}
