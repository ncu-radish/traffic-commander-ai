import type { AdvisoryReportDTO } from '../hooks/useAdvisoryReport';
import './AdvisorySummaryModal.css';

interface AdvisorySummaryModalProps {
  open: boolean;
  loading: boolean;
  report: AdvisoryReportDTO | null;
  /** 端到端重規劃延遲（毫秒），用於顯示 60 秒 SLA 佐證。 */
  elapsedMs?: number | null;
  onClose: () => void;
}

/**
 * 事件注入後自動跳出的預警摘要——用共通的 route-check-overlay/route-check-modal
 * 視覺框架（AdvisorySummaryModal.css，z-index同量級），不用另外重新解決一次
 * 「彈窗被地圖蓋掉」的問題。
 */
export default function AdvisorySummaryModal({
  open,
  loading,
  report,
  elapsedMs,
  onClose,
}: AdvisorySummaryModalProps) {
  if (!open) return null;

  const levelClass =
    report?.alert_level === 'A' ? 'route-check-modal__icon--warn' : 'route-check-modal__icon--ok';

  return (
    <div className="route-check-overlay" onClick={onClose}>
      <div
        className="route-check-modal advisory-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <>
            <div className="route-check-modal__icon route-check-modal__icon--warn">⋯</div>
            <h3>AI 正在產生預警摘要…</h3>
            <p>正在依 SOP 判定觸發條文、規劃路線並請 LLM 撰寫摘要，請稍候。</p>
          </>
        )}

        {!loading && !report && (
          <>
            <div className="route-check-modal__icon route-check-modal__icon--warn">⚠</div>
            <h3>無法產生預警摘要</h3>
            <p>後端建議書服務目前無法連線，請確認 LLM 服務（Ollama/AWS）已啟動。</p>
            <button className="route-planner__btn" onClick={onClose}>知道了</button>
          </>
        )}

        {!loading && report && (
          <div className="advisory-modal__body">
            <div className={`route-check-modal__icon ${levelClass}`}>
              {report.alert_level === 'normal' ? '✓' : report.alert_level}
            </div>
            <h3>{report.event_description || '事件預警摘要'}</h3>

            <div className="advisory-modal__tags">
              {report.sop_articles.map((a) => (
                <span key={a} className="badge badge-neutral">{a}</span>
              ))}
            </div>

            {typeof elapsedMs === 'number' && (
              <div
                className={`advisory-modal__sla ${
                  elapsedMs <= 60000 ? 'advisory-modal__sla--ok' : 'advisory-modal__sla--warn'
                }`}
              >
                <span className="advisory-modal__sla-value">
                  端到端重規劃完成：{(elapsedMs / 1000).toFixed(1)} 秒
                </span>
                <span className="advisory-modal__sla-note">
                  {elapsedMs <= 60000 ? '✓ 符合 60 秒 SLA' : '⚠ 超過 60 秒 SLA'}
                </span>
              </div>
            )}

            <section className="advisory-modal__section">
              <h4>AI 摘要</h4>
              <p className="advisory-modal__summary">
                {report.llm_summary ?? report.alert_justification}
              </p>
            </section>

            {report.route_plan?.primary_route_name && (
              <section className="advisory-modal__section">
                <h4>主要疏散路線</h4>
                <p>
                  {report.route_plan.primary_route_name}
                  {report.route_plan.secondary_routes.length > 0 && (
                    <> ・次要：{report.route_plan.secondary_routes.join('、')}</>
                  )}
                </p>
              </section>
            )}

            {report.route_plan?.excluded_routes && report.route_plan.excluded_routes.length > 0 && (
              <section className="advisory-modal__section">
                <h4>排除路段與理由</h4>
                <ul className="advisory-modal__excluded">
                  {report.route_plan.excluded_routes.map((ex, i) => (
                    <li key={i}>
                      <span className="advisory-modal__excluded-route">{ex.route}</span>
                      <span className="advisory-modal__excluded-reason">{ex.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.route_plan?.signal_adjustments && report.route_plan.signal_adjustments.length > 0 && (
              <section className="advisory-modal__section">
                <h4>號誌配時調整</h4>
                <table className="advisory-modal__table">
                  <thead>
                    <tr>
                      <th>路段</th>
                      <th>調整</th>
                      <th>時段</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.route_plan.signal_adjustments.map((s, i) => (
                      <tr key={i}>
                        <td>{s.road}</td>
                        <td>{s.adjustment}</td>
                        <td>{s.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {report.ete && (
              <section className="advisory-modal__section">
                <h4>預計恢復時間（ETE）</h4>
                <p>
                  {report.ete.ete_minutes} 分鐘（基礎清除 {report.ete.base_clearance} +
                  壅擠懲罰 {report.ete.congestion_penalty}）
                </p>
              </section>
            )}

            {report.cross_system_actions.length > 0 && (
              <section className="advisory-modal__section">
                <h4>跨系統協調</h4>
                <ul className="route-check-modal__advisory-list">
                  {report.cross_system_actions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </section>
            )}

            {report.reasoning_chain.length > 0 && (
              <section className="advisory-modal__section">
                <h4>AI 推理過程</h4>
                <ol className="advisory-modal__steps">
                  {report.reasoning_chain.map((step) => (
                    <li key={step.step} className="advisory-modal__step">
                      <div className="advisory-modal__step-head">
                        <span className="advisory-modal__step-num">{step.step}</span>
                        <span className="advisory-modal__step-title">{step.title}</span>
                      </div>
                      <p className="advisory-modal__step-desc">{step.description}</p>
                      {step.data_evidence && (
                        <code className="advisory-modal__step-evidence">{step.data_evidence}</code>
                      )}
                      {step.sop_reference && (
                        <span className="badge badge-neutral">{step.sop_reference}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <button className="route-planner__btn" onClick={onClose}>知道了</button>
          </div>
        )}
      </div>
    </div>
  );
}
