import { useEffect, useMemo, useState } from 'react';
import type { TrafficSegment, CrowdDensity, RoadSegment } from '../types';
import './FortuneDraw.css';

const API_BASE = 'http://localhost:8000/api';

interface FortuneDrawProps {
  trafficData: TrafficSegment[];
  crowdData: CrowdDensity[];
  roadNetwork: RoadSegment[];
}

interface WeatherSnapshot {
  description: string;
  tempC: number;
  windSpeed: number;
  rain1h: number;
  isSevere: boolean;
}

type WeatherState = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; data: WeatherSnapshot };

type FortuneTier = 'good' | 'fair' | 'bad';
type Stage = 'drawing' | 'revealed' | 'interpreted';

interface FortuneVerse {
  tier: FortuneTier;
  label: string;
  seal: string;
  headline: string;
  lines: [string, string, string, string];
}

const VERSES: Record<FortuneTier, FortuneVerse[]> = {
  good: [
    {
      tier: 'good',
      label: '上上籤 · 大吉',
      seal: '吉',
      headline: '目前適合出行',
      lines: ['車行順暢如春水', '一路暢通到家門', '今日出行皆吉利', '不必改道自安心'],
    },
    {
      tier: 'good',
      label: '上上籤 · 大吉',
      seal: '吉',
      headline: '目前適合出行',
      lines: ['路況清朗風輕揚', '往來車馬皆順暢', '此時出行正是好', '不擇時辰亦無妨'],
    },
  ],
  fair: [
    {
      tier: 'fair',
      label: '中平籤 · 小心',
      seal: '平',
      headline: '出行請保持謹慎',
      lines: ['路遇壅塞莫心焦', '繞道而行有其效', '耐心等候風波過', '平安順遂終可期'],
    },
    {
      tier: 'fair',
      label: '中平籤 · 小心',
      seal: '平',
      headline: '出行請保持謹慎',
      lines: ['車流漸重似陰天', '未至大礙且從容', '留意號誌多觀望', '緩行終能保平安'],
    },
  ],
  bad: [
    {
      tier: 'bad',
      label: '下下籤 · 慎行',
      seal: '凶',
      headline: '目前不建議立即出發',
      lines: ['此路壅塞如亂麻', '勸君暫且莫強行', '另尋他徑方為上', '稍安勿躁待疏通'],
    },
    {
      tier: 'bad',
      label: '下下籤 · 慎行',
      seal: '凶',
      headline: '目前不建議立即出發',
      lines: ['前方車海動不得', '硬闖此路恐誤時', '不如改道求心安', '繞行片刻反是宜'],
    },
  ],
};

function tierFromSaturation(score: number): FortuneTier {
  if (score >= 0.95) return 'bad';
  if (score >= 0.85) return 'fair';
  return 'good';
}

function statusLabel(tier: FortuneTier): string {
  if (tier === 'bad') return 'A 級・癱瘓';
  if (tier === 'fair') return 'B 級・壅擠';
  return '正常';
}

interface FortuneResult {
  verse: FortuneVerse;
  headline: TrafficSegment;
  congestedRoads: TrafficSegment[];
  crowdedSpots: CrowdDensity[];
  alternatives: string[];
  tags: string[];
  smoothnessIndex: number;
}

const ROAD_LIST_SIZE = 4;
const CROWD_LIST_SIZE = 3;
const DRAW_ANIMATION_MS = 900;

export default function FortuneDraw({ trafficData, crowdData, roadNetwork }: FortuneDrawProps) {
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

  const draw = () => {
    if (trafficData.length === 0) return;

    const roadsByCongestion = [...trafficData].sort((a, b) => b.saturationScore - a.saturationScore);
    const headline = roadsByCongestion[0];
    const tier = tierFromSaturation(headline.saturationScore);
    const pool = VERSES[tier];
    const verse = pool[Math.floor(Math.random() * pool.length)];

    const congestedRoads = roadsByCongestion.slice(0, ROAD_LIST_SIZE);
    const crowdedSpots = [...crowdData].sort((a, b) => b.userCount - a.userCount).slice(0, CROWD_LIST_SIZE);

    const headlineNetwork = networkByName.get(headline.segmentId);
    const alternatives = (headlineNetwork?.alternatives ?? [])
      .map((id) => networkByName.get(id)?.name)
      .filter((n): n is string => Boolean(n));

    const heavilyCongestedCount = trafficData.filter((s) => s.saturationScore >= 0.85).length;
    const crowdSurge = crowdedSpots.find((s) => s.growthRate > 0.3 || s.userCount > 25000);
    const roamingSpike = crowdedSpots.find((s) => s.roamingUserPct >= 0.3);

    const tags: string[] = [];
    if (tier === 'bad') tags.push('重度壅塞');
    else if (tier === 'fair') tags.push('路段壅塞');
    if (heavilyCongestedCount >= 3) tags.push('多路段同時壅塞');
    if (crowdSurge) tags.push('人潮激增');
    if (roamingSpike) tags.push('漫遊比例偏高');
    if (tags.length === 0) tags.push('路況正常');

    const smoothnessIndex = Math.max(0, Math.min(100, Math.round((1 - headline.saturationScore) * 100)));

    setResult({ verse, headline, congestedRoads, crowdedSpots, alternatives, tags, smoothnessIndex });
    setStage('drawing');
    setIsOpen(true);
    window.setTimeout(() => setStage('revealed'), DRAW_ANIMATION_MS);

    setWeather({ status: 'loading' });
    fetch(`${API_BASE}/weather/current`)
      .then((res) => {
        if (!res.ok) throw new Error('weather unavailable');
        return res.json();
      })
      .then((payload) => {
        const w = payload.weather;
        setWeather({
          status: 'ready',
          data: {
            description: w?.weather?.[0]?.description ?? '未知',
            tempC: w?.main?.temp ?? 0,
            windSpeed: w?.wind?.speed ?? 0,
            rain1h: w?.rain?.['1h'] ?? 0,
            isSevere: Boolean(payload.is_severe),
          },
        });
      })
      .catch(() => setWeather({ status: 'unavailable' }));
  };

  const close = () => setIsOpen(false);

  return (
    <>
      <button className="fortune-trigger" onClick={draw} title="求一支路況籤">
        <span className="fortune-trigger-icon">🔮</span>
        求籤問路況
      </button>

      {isOpen && result && (
        <div className="fortune-overlay" onClick={close}>
          <div
            className={`fortune-card fortune-card--${result.verse.tier} fortune-card--${stage}`}
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

            {stage === 'revealed' && (
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

            {stage === 'interpreted' && (
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
                      <dt>全城壅塞路段數</dt>
                      <dd>{result.congestedRoads.filter((s) => s.saturationScore >= 0.85).length} / 15</dd>
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
                      OpenWeather API 目前無法連線（需設定有效金鑰），此區塊不顯示推測數值。
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
                          <dd>目前為劇烈天氣，行車風險上升</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">判定原因</h4>
                  <div className="fortune-tags">
                    {result.tags.map((tag) => (
                      <span key={tag} className={`fortune-tag fortune-tag--${result.verse.tier}`}>{tag}</span>
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
                      綜合 {result.congestedRoads.filter((s) => s.saturationScore >= 0.85).length} 個壅塞路段與
                      {result.crowdedSpots[0]?.locationName ?? '各站'}人流狀況，
                      系統判定本次出行條件為「{statusLabel(result.verse.tier)}」。
                    </p>
                  </div>
                </section>

                <section className="fortune-section">
                  <h4 className="fortune-section-title">出行建議</h4>
                  <ul className="fortune-suggestions">
                    {result.verse.tier === 'bad' && (
                      <>
                        <li>建議避開 {result.headline.roadName}{result.alternatives.length > 0 ? `，可考慮改道 ${result.alternatives[0]}` : ''}</li>
                        <li>如有大眾運輸選項，建議優先使用</li>
                      </>
                    )}
                    {result.verse.tier === 'fair' && (
                      <li>{result.headline.roadName} 略有壅塞，建議保持安全車距並留意號誌調整</li>
                    )}
                    {result.verse.tier === 'good' && <li>目前路況順暢，可依原計畫出行</li>}
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
