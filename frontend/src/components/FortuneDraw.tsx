import { useState } from 'react';
import type { TrafficSegment, CrowdDensity } from '../types';
import './FortuneDraw.css';

interface FortuneDrawProps {
  trafficData: TrafficSegment[];
  crowdData: CrowdDensity[];
}

type FortuneTier = 'good' | 'fair' | 'bad';

interface FortuneVerse {
  tier: FortuneTier;
  label: string;
  seal: string;
  lines: [string, string, string, string];
}

const VERSES: Record<FortuneTier, FortuneVerse[]> = {
  good: [
    {
      tier: 'good',
      label: '上上籤 · 大吉',
      seal: '吉',
      lines: ['車行順暢如春水', '一路暢通到家門', '今日出行皆吉利', '不必改道自安心'],
    },
    {
      tier: 'good',
      label: '上上籤 · 大吉',
      seal: '吉',
      lines: ['路況清朗風輕揚', '往來車馬皆順暢', '此時出行正是好', '不擇時辰亦無妨'],
    },
  ],
  fair: [
    {
      tier: 'fair',
      label: '中平籤 · 小心',
      seal: '平',
      lines: ['路遇壅塞莫心焦', '繞道而行有其效', '耐心等候風波過', '平安順遂終可期'],
    },
    {
      tier: 'fair',
      label: '中平籤 · 小心',
      seal: '平',
      lines: ['車流漸重似陰天', '未至大礙且從容', '留意號誌多觀望', '緩行終能保平安'],
    },
  ],
  bad: [
    {
      tier: 'bad',
      label: '下下籤 · 慎行',
      seal: '凶',
      lines: ['此路壅塞如亂麻', '勸君暫且莫強行', '另尋他徑方為上', '稍安勿躁待疏通'],
    },
    {
      tier: 'bad',
      label: '下下籤 · 慎行',
      seal: '凶',
      lines: ['前方車海動不得', '硬闖此路恐誤時', '不如改道求心安', '繞行片刻反是宜'],
    },
  ],
};

function tierFromSaturation(score: number): FortuneTier {
  if (score >= 0.95) return 'bad';
  if (score >= 0.85) return 'fair';
  return 'good';
}

function tierFromCrowd(c: CrowdDensity): FortuneTier {
  if (c.roamingUserPct >= 0.30 || c.growthRate > 0.30 || c.userCount > 25000) return 'bad';
  if (c.growthRate > 0.10) return 'fair';
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
}

const ROAD_LIST_SIZE = 4;
const CROWD_LIST_SIZE = 3;

export default function FortuneDraw({ trafficData, crowdData }: FortuneDrawProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<FortuneResult | null>(null);

  const draw = () => {
    if (trafficData.length === 0) return;

    const roadsByCongestion = [...trafficData].sort((a, b) => b.saturationScore - a.saturationScore);
    const headline = roadsByCongestion[0];
    const tier = tierFromSaturation(headline.saturationScore);
    const pool = VERSES[tier];
    const verse = pool[Math.floor(Math.random() * pool.length)];

    const crowdedSpots = [...crowdData]
      .sort((a, b) => b.userCount - a.userCount)
      .slice(0, CROWD_LIST_SIZE);

    setResult({
      verse,
      headline,
      congestedRoads: roadsByCongestion.slice(0, ROAD_LIST_SIZE),
      crowdedSpots,
    });
    setIsOpen(true);
  };

  return (
    <>
      <button className="fortune-trigger" onClick={draw} title="求一支路況籤">
        <span className="fortune-trigger-icon">🔮</span>
        求籤問路況
      </button>

      {isOpen && result && (
        <div className="fortune-overlay" onClick={() => setIsOpen(false)}>
          <div className={`fortune-card fortune-card--${result.verse.tier}`} onClick={(e) => e.stopPropagation()}>
            <div className="fortune-card-corner fortune-card-corner--tl" />
            <div className="fortune-card-corner fortune-card-corner--tr" />
            <div className="fortune-card-corner fortune-card-corner--bl" />
            <div className="fortune-card-corner fortune-card-corner--br" />

            <div className="fortune-seal">{result.verse.seal}</div>
            <div className="fortune-title">路況籤詩</div>
            <div className="fortune-label">{result.verse.label}</div>

            <div className="fortune-poem">
              {result.verse.lines.map((line, i) => (
                <span key={i} className="fortune-poem-line">{line}</span>
              ))}
            </div>

            <div className="fortune-divider">— 籤 解：全城壅塞路段 —</div>

            <div className="fortune-list">
              {result.congestedRoads.map((seg) => {
                const t = tierFromSaturation(seg.saturationScore);
                return (
                  <div className="fortune-list-row" key={seg.segmentId}>
                    <span className="fortune-list-name">{seg.roadName}</span>
                    <span className="fortune-list-meta">
                      {(seg.saturationScore * 100).toFixed(0)}%
                      <span className={`fortune-reading-pill fortune-reading-pill--${t}`}>
                        {statusLabel(t)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="fortune-divider">— 籤 解：人潮聚集地點 —</div>

            <div className="fortune-list">
              {result.crowdedSpots.length === 0 && (
                <div className="fortune-list-empty">目前無人流資料</div>
              )}
              {result.crowdedSpots.map((spot) => {
                const t = tierFromCrowd(spot);
                return (
                  <div className="fortune-list-row" key={spot.bsId}>
                    <span className="fortune-list-name">{spot.locationName}</span>
                    <span className="fortune-list-meta">
                      {spot.userCount.toLocaleString()} 人
                      <span className={`fortune-reading-pill fortune-reading-pill--${t}`}>
                        漫遊 {(spot.roamingUserPct * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <button className="fortune-close" onClick={() => setIsOpen(false)}>收下籤詩</button>
          </div>
        </div>
      )}
    </>
  );
}
