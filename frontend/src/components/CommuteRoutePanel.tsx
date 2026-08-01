import type { CommuteRouteAssessment, CommuteWaypoint } from '../types';
import { RISK_META, LEVEL_TEXT } from '../services/commuteRouteRisk';
import { level } from '../theme/tokens';
import './CommuteRoutePanel.css';

/* ═══════════════════════════════════════════════════════════════
   上下學路線比較

   同一份評估結果同時給校方端與家長方使用，所以兩邊看到的
   路線、分級與推薦結果必然一致。

   每條路線都標出：對應地圖上的線條顏色與虛線樣式、風險等級、
   SOP 第 1 條級別、最高飽和度、沿線事故件數、判定理由。
   狀態不只用顏色區分，都另有圖示與文字。
   ═══════════════════════════════════════════════════════════════ */

/** 面板上的色塊要跟地圖線條同色，所以共用同一組 token。 */
const ROUTE_COLOR: Record<'a' | 'b' | 'ok', string> = {
  a: level.a,
  b: level.b,
  ok: level.ok,
};

interface CommuteRoutePanelProps {
  assessments: CommuteRouteAssessment[];
  origin: CommuteWaypoint;
  destination: CommuteWaypoint;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  /** 路線是否已顯示在地圖上；與地圖右上角的開關是同一個狀態。 */
  visible: boolean;
  onToggleVisible: () => void;
}

export default function CommuteRoutePanel({
  assessments,
  origin,
  destination,
  selectedRouteId,
  onSelectRoute,
  visible,
  onToggleVisible,
}: CommuteRoutePanelProps) {
  const recommended = assessments.find((a) => a.recommended);

  // 未啟用時只留一個入口，不預先把三條路線的細節攤在畫面上。
  if (!visible) {
    return (
      <section className="commute panel">
        <header className="panel__header">
          <span>上下學路線模擬</span>
        </header>
        <div className="state">
          <span className="state__title">尚未載入模擬路線</span>
          <span>
            以 {origin.detail} 至 {destination.detail} 為例，
            比較三條路線的即時壅塞與事故風險。
          </span>
          <button className="btn btn-sm btn-primary" onClick={onToggleVisible}>
            顯示模擬路線
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="commute panel">
      <header className="panel__header">
        <span>上下學路線比較</span>
        <span className="panel__header-action">
          {selectedRouteId && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => onSelectRoute(null)}
            >
              顯示全部
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={onToggleVisible}>
            隱藏
          </button>
        </span>
      </header>

      {/* 起訖點 */}
      <div className="commute__od">
        <div className="commute__od-row">
          <span className="commute__od-dot commute__od-dot--from" aria-hidden="true" />
          <span className="commute__od-label">{origin.label}</span>
          <span className="commute__od-detail">{origin.detail}</span>
        </div>
        <div className="commute__od-row">
          <span className="commute__od-dot commute__od-dot--to" aria-hidden="true" />
          <span className="commute__od-label">{destination.label}</span>
          <span className="commute__od-detail">{destination.detail}</span>
        </div>
      </div>

      {/* 推薦結論 */}
      {recommended && (
        <div className={`commute__verdict ${RISK_META[recommended.risk].tone}`}>
          <span className="commute__verdict-tag">建議路線</span>
          <span className="commute__verdict-name">{recommended.route.name}</span>
          <p className="commute__verdict-note">
            系統比較三條路線的即時飽和度與歷年事故熱點後，選出風險最低者。
            路況變化時建議會自動更新。
          </p>
        </div>
      )}

      <ul className="commute__list">
        {assessments.map((assessment) => {
          const { route, risk, level, recommended: isBest } = assessment;
          const meta = RISK_META[risk];
          const isSelected = selectedRouteId === route.id;

          return (
            <li key={route.id}>
              <button
                className={`commute__item ${meta.tone}`}
                data-selected={isSelected}
                data-recommended={isBest}
                onClick={() => onSelectRoute(isSelected ? null : route.id)}
                aria-pressed={isSelected}
              >
                <div className="commute__item-top">
                  {/* 色塊的顏色與虛線樣式跟地圖上的線條一致，
                      讓人一眼對上是哪一條。 */}
                  <span
                    className="commute__swatch"
                    style={{
                      background: `repeating-linear-gradient(90deg, ${
                        ROUTE_COLOR[route.colorKey]
                      } 0 7px, transparent 7px 12px)`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="commute__item-name">{route.name}</span>
                  <span className={`badge ${meta.badge}`}>
                    {meta.icon} {meta.label}
                  </span>
                </div>

                <p className="commute__item-summary">{route.summary}</p>

                <div className="commute__stats">
                  <div className="commute__stat">
                    <span className="commute__stat-label">壅塞</span>
                    <span className="commute__stat-value">
                      {/* 「完全不含路網路段」與「有路段但此刻沒讀數」
                          是兩件事，要分開講。 */}
                      {assessment.totalSegments === 0 ? (
                        '完全暢通'
                      ) : assessment.measuredSegments === 0 ? (
                        '無讀數'
                      ) : (
                        <>
                          {LEVEL_TEXT[level]}
                          <span className="num commute__stat-sub">
                            {' '}
                            {(assessment.maxSaturation * 100).toFixed(0)}%
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="commute__stat">
                    <span className="commute__stat-label">沿線事故</span>
                    <span className="commute__stat-value num">
                      {assessment.accidentTotal} 件
                      <span className="commute__stat-sub">
                        {' '}
                        ⌀{assessment.accidentIntensity.toFixed(0)}
                      </span>
                    </span>
                  </div>

                  <div className="commute__stat">
                    <span className="commute__stat-label">平均車速</span>
                    <span className="commute__stat-value num">
                      {assessment.avgSpeed !== null ? `${assessment.avgSpeed} km/h` : '無讀數'}
                    </span>
                  </div>
                </div>

                <ul className="commute__reasons">
                  {assessment.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>

                {isBest && <span className="commute__flag">✓ 建議走這條</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="commute__foot">
        事故件數為 data.taipei 事故斑點圖三年合併統計，⌀ 為平均每路段件數（風險分級依此）；
        壅塞級別依 SOP 第 1 條門檻，隨時間軸位置即時重算。
      </footer>
    </section>
  );
}
