import { useEffect, useMemo, useState } from 'react';
import type { TrafficSegment, CrowdDensity, RoadSegment } from '../types';
import './FortuneDraw.css';

const API_BASE = 'http://localhost:8000/api';

interface FortuneDrawProps {
  trafficData: TrafficSegment[];
  crowdData: CrowdDensity[];
  roadNetwork: RoadSegment[];
  /** 若提供（例如使用者已規劃路線），籤詩只看這幾個路段，不看全城最壅塞的那條。 */
  routeSegmentIds?: string[];
}

interface WeatherSnapshot {
  description: string;
  tempC: number;
  windSpeed: number;
  rain1h: number;
  isSevere: boolean;
}

type WeatherState = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; data: WeatherSnapshot };

/**
 * 五級制，由好到壞。「severe(凶)」刻意設計成很難單靠一項指標達到——
 * 一定要多個真實訊號疊加才會出現，見下方 classify() 的配分依據。
 */
type FortuneTier = 'excellent' | 'good' | 'neutral' | 'caution' | 'severe';
type Stage = 'drawing' | 'revealed' | 'interpreted';

interface FortuneVerse {
  tier: FortuneTier;
  label: string;
  seal: string;
  headline: string;
  lines: [string, string, string, string];
}

const VERSES: Record<FortuneTier, FortuneVerse[]> = {
  excellent: [
    {
      tier: 'excellent', label: '上上籤 · 大吉', seal: '吉', headline: '目前非常適合出行',
      lines: ['車行順暢如春水', '一路暢通到家門', '今日出行皆吉利', '不必改道自安心'],
    },
    {
      tier: 'excellent', label: '上上籤 · 大吉', seal: '吉', headline: '目前非常適合出行',
      lines: ['路況清朗風輕揚', '往來車馬皆順暢', '此時出行正是好', '不擇時辰亦無妨'],
    },
  ],
  good: [
    {
      tier: 'good', label: '上籤 · 順利', seal: '順', headline: '出行條件良好',
      lines: ['道路微忙不礙事', '往來車行仍算順', '依照原定行程走', '略留餘裕心自穩'],
    },
    {
      tier: 'good', label: '上籤 · 順利', seal: '順', headline: '出行條件良好',
      lines: ['車流雖增未成阻', '沿途風光可從容', '此去途中多順遂', '毋須過慮自輕鬆'],
    },
  ],
  neutral: [
    {
      tier: 'neutral', label: '中籤 · 平順', seal: '平', headline: '出行請保持留意',
      lines: ['路遇壅塞莫心焦', '繞道而行有其效', '耐心等候風波過', '平安順遂終可期'],
    },
    {
      tier: 'neutral', label: '中籤 · 平順', seal: '平', headline: '出行請保持留意',
      lines: ['車流漸重似陰天', '未至大礙且從容', '留意號誌多觀望', '緩行終能保平安'],
    },
  ],
  caution: [
    {
      tier: 'caution', label: '下籤 · 謹慎', seal: '慎', headline: '建議謹慎規劃行程',
      lines: ['數路交疊如亂線', '車馬紛紛費周章', '此時出行宜謹慎', '多繞一程也無妨'],
    },
    {
      tier: 'caution', label: '下籤 · 謹慎', seal: '慎', headline: '建議謹慎規劃行程',
      lines: ['風雨車潮兩相催', '路上諸事恐拖延', '不若暫緩半刻鐘', '待得風波稍平緩'],
    },
  ],
  severe: [
    {
      tier: 'severe', label: '下下籤 · 凶險', seal: '凶', headline: '目前極不建議出發',
      lines: ['此路壅塞如亂麻', '勸君暫且莫強行', '另尋他徑方為上', '稍安勿躁待疏通'],
    },
    {
      tier: 'severe', label: '下下籤 · 凶險', seal: '凶', headline: '目前極不建議出發',
      lines: ['前方車海動不得', '硬闖此路恐誤時', '不如改道求心安', '繞行片刻反是宜'],
    },
  ],
};

const TIER_ORDER: FortuneTier[] = ['excellent', 'good', 'neutral', 'caution', 'severe'];

function statusLabel(tier: FortuneTier): string {
  switch (tier) {
    case 'severe': return 'A 級・癱瘓＋多重風險疊加';
    case 'caution': return 'B 級以上・多重風險';
    case 'neutral': return 'B 級・壅擠';
    case 'good': return '接近壅擠但尚可';
    default: return '正常';
  }
}

interface ClassifyResult {
  tier: FortuneTier;
  points: number;
  reasons: string[];
}

/**
 * 分級依據（滿分無上限，5級門檻見下）：
 *   主要路段飽和度   <70%:0 / 70-84%:+1 / 85-94%(B級):+2 / 95-98%(A級):+3 / ≥99%:+4
 *   全城壅塞路段數   ≥3條:+1，≥6條再 +1（累加，最多+2）
 *   人潮站點異常     成長率>30% 或人數>25,000（第3條門檻）:+1
 *   漫遊比例異常     任一站點 ≥30%（第6條門檻）:+1
 *   劇烈天氣         OpenWeather is_severe:+1；若同時飽和度≥85%，風險加乘再 +1
 * 總分對應等級：0-1 大吉 / 2-3 順利 / 4-5 平順 / 6-7 謹慎 / 8+ 凶險
 * 「凶」只有在路段幾乎全滿、且全城多處壅塞、還疊加人潮或天氣異常時才會出現——
 * 單一路段壅塞不會直接判凶。
 */
function classify(
  headlineSaturation: number,
  heavilyCongestedCount: number,
  crowdSurge: boolean,
  roamingSpike: boolean,
  weatherSevere: boolean | null,
): ClassifyResult {
  const reasons: string[] = [];
  let points = 0;

  const satPct = (headlineSaturation * 100).toFixed(0);
  if (headlineSaturation >= 0.99) {
    points += 4;
    reasons.push(`主要路段飽和度 ${satPct}%，近乎全面壅塞（+4）`);
  } else if (headlineSaturation >= 0.95) {
    points += 3;
    reasons.push(`主要路段飽和度 ${satPct}%，達 SOP 第1條 A 級（+3）`);
  } else if (headlineSaturation >= 0.85) {
    points += 2;
    reasons.push(`主要路段飽和度 ${satPct}%，達 SOP 第1條 B 級（+2）`);
  } else if (headlineSaturation >= 0.70) {
    points += 1;
    reasons.push(`主要路段飽和度 ${satPct}%，接近壅擠門檻（+1）`);
  } else {
    reasons.push(`主要路段飽和度 ${satPct}%，尚屬正常（+0）`);
  }

  if (heavilyCongestedCount >= 6) {
    points += 2;
    reasons.push(`全城 ${heavilyCongestedCount} 條路段同時達壅塞門檻，大範圍影響（+2）`);
  } else if (heavilyCongestedCount >= 3) {
    points += 1;
    reasons.push(`全城 ${heavilyCongestedCount} 條路段同時達壅塞門檻（+1）`);
  }

  if (crowdSurge) {
    points += 1;
    reasons.push('人潮站點成長率或人數達 SOP 第3條門檻（+1）');
  }
  if (roamingSpike) {
    points += 1;
    reasons.push('基地台漫遊比例達 SOP 第6條門檻（+1）');
  }
  if (weatherSevere) {
    points += 1;
    reasons.push('OpenWeather 判定為劇烈天氣（+1）');
    if (headlineSaturation >= 0.85) {
      points += 1;
      reasons.push('劇烈天氣疊加路段壅塞，風險加乘（+1）');
    }
  } else if (weatherSevere === null) {
    reasons.push('天氣資料暫時無法取得，不計入本次評分');
  }

  let tier: FortuneTier;
  if (points <= 1) tier = 'excellent';
  else if (points <= 3) tier = 'good';
  else if (points <= 5) tier = 'neutral';
  else if (points <= 7) tier = 'caution';
  else tier = 'severe';

  return { tier, points, reasons };
}

interface FortuneResult {
  verse: FortuneVerse;
  classification: ClassifyResult;
  headline: TrafficSegment;
  congestedRoads: TrafficSegment[];
  citywideCongestedCount: number;
  isRouteScoped: boolean;
  crowdedSpots: CrowdDensity[];
  alternatives: string[];
  smoothnessIndex: number;
}

const ROAD_LIST_SIZE = 4;
const CROWD_LIST_SIZE = 3;
const DRAW_ANIMATION_MS = 900;
const WEATHER_TIMEOUT_MS = 2500;

async function fetchWeather(): Promise<WeatherState> {
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), WEATHER_TIMEOUT_MS));
  try {
    const res = await Promise.race([fetch(`${API_BASE}/weather/current`), timeout]);
    if (!res || !res.ok) return { status: 'unavailable' };
    const payload = await res.json();
    const w = payload.weather;
    return {
      status: 'ready',
      data: {
        description: w?.weather?.[0]?.description ?? '未知',
        tempC: w?.main?.temp ?? 0,
        windSpeed: w?.wind?.speed ?? 0,
        rain1h: w?.rain?.['1h'] ?? 0,
        isSevere: Boolean(payload.is_severe),
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export default function FortuneDraw({ trafficData, crowdData, roadNetwork, routeSegmentIds = [] }: FortuneDrawProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('drawing');
  const [result, setResult] = useState<FortuneResult | null>(null);
  const [weather, setWeather] = useState<WeatherState>({ status: 'loading' });

  const networkByName = useMemo(() => {
    const map = new Map<string, RoadSegment>();
    roadNetwork.forEach((r) => map.set(r.segmentId, r));
    return map;
  }, [roadNetwork]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const scopedTraffic = routeSegmentIds.length > 0
    ? trafficData.filter((s) => routeSegmentIds.includes(s.segmentId))
    : trafficData;

  const draw = async () => {
    if (scopedTraffic.length === 0) return;

    setStage('drawing');
    setIsOpen(true);
    setWeather({ status: 'loading' });

    const minDelay = new Promise((resolve) => window.setTimeout(resolve, DRAW_ANIMATION_MS));
    const [weatherState] = await Promise.all([fetchWeather(), minDelay]);
    setWeather(weatherState);

    const roadsByCongestion = [...scopedTraffic].sort((a, b) => b.saturationScore - a.saturationScore);
    const headline = roadsByCongestion[0];
    const congestedRoads = roadsByCongestion.slice(0, ROAD_LIST_SIZE);
    const crowdedSpots = [...crowdData].sort((a, b) => b.userCount - a.userCount).slice(0, CROWD_LIST_SIZE);

    const headlineNetwork = networkByName.get(headline.segmentId);
    const alternatives = (headlineNetwork?.alternatives ?? [])
      .map((id) => networkByName.get(id)?.name)
      .filter((n): n is string => Boolean(n));

    const heavilyCongestedCount = trafficData.filter((s) => s.saturationScore >= 0.85).length;
    const crowdSurge = Boolean(crowdedSpots.find((s) => s.growthRate > 0.3 || s.userCount > 25000));
    const roamingSpike = Boolean(crowdedSpots.find((s) => s.roamingUserPct >= 0.3));
    const weatherSevere = weatherState.status === 'ready' ? weatherState.data.isSevere : null;

    const classification = classify(headline.saturationScore, heavilyCongestedCount, crowdSurge, roamingSpike, weatherSevere);
    const pool = VERSES[classification.tier];
    const verse = pool[Math.floor(Math.random() * pool.length)];

    const smoothnessIndex = Math.max(0, Math.min(100, Math.round((1 - headline.saturationScore) * 100)));

    setResult({
      verse, classification, headline, congestedRoads, crowdedSpots, alternatives, smoothnessIndex,
      citywideCongestedCount: heavilyCongestedCount,
      isRouteScoped: routeSegmentIds.length > 0,
    });
    setStage('revealed');
  };

  const close = () => setIsOpen(false);

  return (
    <>
      <button className="fortune-trigger" onClick={draw} title="求一支路況籤">
        <span className="fortune-trigger-icon">🔮</span>
        {routeSegmentIds.length > 0 ? '求籤問沿途路況' : '求籤問路況'}
      </button>

      {isOpen && (
        <div className="fortune-overlay" onClick={close}>
          <div
            className={`fortune-card fortune-card--${result?.verse.tier ?? 'neutral'} fortune-card--${stage}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="fortune-dismiss" onClick={close} aria-label="關閉">✕</button>
            <div className="fortune-band" aria-hidden="true" />

            {stage === 'drawing' && (
              <div className="fortune-stage fortune-stage--drawing">
                <div className="fortune-shaker">
                  <span className="fortune-shaker-stick" />
                  <span className="fortune-shaker-stick" />
                  <span className="fortune-shaker-stick" />
                </div>
                <div className="fortune-drawing-label">誠心祈求，籤詩正在搖出…</div>
              </div>
            )}

            {stage === 'revealed' && result && (
              <div className="fortune-stage fortune-stage--revealed">
                <div className="fortune-eyebrow">路況籤詩</div>
                <div className={`fortune-seal fortune-seal--big fortune-seal--${result.verse.tier}`}>
                  {result.verse.seal}
                </div>
                <div className="fortune-label">{result.verse.label}</div>
                <button className="fortune-primary-btn" onClick={() => setStage('interpreted')}>
                  解籤
                </button>
              </div>
            )}

            {stage === 'interpreted' && result && (
              <div className="fortune-stage fortune-stage--interpreted">
                <div className="fortune-eyebrow">解籤 · 今日路況分析</div>

                <div className="fortune-verdict">
                  <div className={`fortune-seal fortune-seal--small fortune-seal--${result.verse.tier}`}>
                    {result.verse.seal}
                  </div>
                  <div className="fortune-verdict-text">
                    <div className="fortune-verdict-headline">{result.verse.headline}</div>
                    <p className="fortune-verdict-body">
                      {result.headline.roadName} 目前飽和度 {(result.headline.saturationScore * 100).toFixed(0)}%，
                      均速 {result.headline.avgSpeed.toFixed(0)} km/h，車道狀態「{result.headline.laneStatus}」。
                    </p>
                  </div>
                </div>

                <div className="fortune-poem fortune-poem--compact">
                  {result.verse.lines.map((line, i) => (
                    <span key={i} className="fortune-poem-line">{line}</span>
                  ))}
                </div>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">即時路況分析</h4>
                  <dl className="fortune-fact-grid">
                    <div className="fortune-fact">
                      <dt>主要壅塞路段</dt>
                      <dd>{result.headline.roadName}</dd>
                    </div>
                    <div className="fortune-fact">
                      <dt>飽和度</dt>
                      <dd>{(result.headline.saturationScore * 100).toFixed(0)}%</dd>
                    </div>
                    <div className="fortune-fact">
                      <dt>平均車速</dt>
                      <dd>{result.headline.avgSpeed.toFixed(0)} km/h</dd>
                    </div>
                    <div className="fortune-fact">
                      <dt>{result.isRouteScoped ? '沿途壅塞路段數' : '全城壅塞路段數'}</dt>
                      <dd>
                        {result.isRouteScoped
                          ? `${result.congestedRoads.filter((s) => s.saturationScore >= 0.85).length} / ${result.congestedRoads.length}`
                          : `${result.citywideCongestedCount} / 15`}
                      </dd>
                    </div>
                    <div className="fortune-fact fortune-fact--wide">
                      <dt>可考慮改道路段</dt>
                      <dd>{result.alternatives.length > 0 ? result.alternatives.join('、') : '—'}</dd>
                    </div>
                  </dl>
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">人流狀況分析</h4>
                  <dl className="fortune-fact-grid">
                    {result.crowdedSpots.map((spot) => (
                      <div className="fortune-fact" key={spot.bsId}>
                        <dt>{spot.locationName}</dt>
                        <dd>{spot.userCount.toLocaleString()} 人・漫遊 {(spot.roamingUserPct * 100).toFixed(0)}%</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">
                    天氣狀況分析
                    {weather.status === 'unavailable' && (
                      <span className="fortune-section-badge">暫時無法取得</span>
                    )}
                  </h4>
                  {weather.status === 'loading' && (
                    <p className="fortune-placeholder-note">查詢即時天氣中…</p>
                  )}
                  {weather.status === 'unavailable' && (
                    <p className="fortune-placeholder-note">
                      OpenWeather API 目前無法連線（需設定有效金鑰），此區塊不顯示推測數值，也不計入分級評分。
                    </p>
                  )}
                  {weather.status === 'ready' && (
                    <dl className="fortune-fact-grid">
                      <div className="fortune-fact">
                        <dt>天氣狀況</dt>
                        <dd>{weather.data.description}</dd>
                      </div>
                      <div className="fortune-fact">
                        <dt>氣溫</dt>
                        <dd>{weather.data.tempC.toFixed(1)}°C</dd>
                      </div>
                      <div className="fortune-fact">
                        <dt>風速</dt>
                        <dd>{weather.data.windSpeed.toFixed(1)} m/s</dd>
                      </div>
                      <div className="fortune-fact">
                        <dt>1小時降雨量</dt>
                        <dd>{weather.data.rain1h.toFixed(1)} mm</dd>
                      </div>
                      {weather.data.isSevere && (
                        <div className="fortune-fact fortune-fact--wide">
                          <dt>提醒</dt>
                          <dd>目前為劇烈天氣，已計入本次分級評分</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">
                    判定原因
                    <span className="fortune-section-badge">{result.classification.points} 分 → {result.verse.label}</span>
                  </h4>
                  <ul className="fortune-suggestions">
                    {result.classification.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <div className="fortune-tags" style={{ marginTop: 'var(--space-3)' }}>
                    {TIER_ORDER.map((t) => (
                      <span
                        key={t}
                        className={`fortune-tag fortune-tag--${t}`}
                        style={{ opacity: t === result.verse.tier ? 1 : 0.35, fontWeight: t === result.verse.tier ? 700 : 500 }}
                      >
                        {VERSES[t][0].label.split(' · ')[1]}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">綜合評估</h4>
                  <div className="fortune-score-row">
                    <div className={`fortune-score-box fortune-score-box--${result.verse.tier}`}>
                      <div className="fortune-score-num">{result.smoothnessIndex}</div>
                      <div className="fortune-score-cap">路況順暢指數<br />依飽和度換算</div>
                    </div>
                    <p className="fortune-score-note">
                      綜合 {result.congestedRoads.filter((s) => s.saturationScore >= 0.85).length} 個壅塞路段、人潮與天氣狀況，
                      系統判定本次出行條件為「{statusLabel(result.verse.tier)}」（{result.classification.points} 分）。
                    </p>
                  </div>
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">出行建議</h4>
                  <ul className="fortune-suggestions">
                    {(result.verse.tier === 'severe' || result.verse.tier === 'caution') && (
                      <>
                        <li>建議避開 {result.headline.roadName}{result.alternatives.length > 0 ? `，可考慮改道 ${result.alternatives[0]}` : ''}</li>
                        <li>如有大眾運輸選項，建議優先使用</li>
                      </>
                    )}
                    {result.verse.tier === 'neutral' && (
                      <li>{result.headline.roadName} 略有壅塞，建議保持安全車距並留意號誌調整</li>
                    )}
                    {(result.verse.tier === 'excellent' || result.verse.tier === 'good') && (
                      <li>目前路況{result.verse.tier === 'excellent' ? '順暢' : '尚可'}，可依原計畫出行</li>
                    )}
                    <li>本結果依 {result.headline.timestamp} 資料自動判定，實際路況請以現場為準</li>
                  </ul>
                </section>

                <div className="fortune-band fortune-band--bottom" aria-hidden="true" />
                <button className="fortune-close" onClick={() => setStage('revealed')}>返回籤面</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
