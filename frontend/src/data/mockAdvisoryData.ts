import type {
  AdvisoryReport,
  MultiLangAlert,
  ChatMessage,
  ReasoningStep,
} from '../types';

// ─── 5-step reasoning chain for TPE_2026_ACC_001 ────────────────────
export const sampleReasoningSteps: ReasoningStep[] = [
  {
    step: 1,
    title: '事件偵測與初步影響評估',
    description:
      '22:10 光復南路 (RD_TPE_002) 偵測到地下管線爆裂導致路面塌陷並引發三車連環追撞，車速由 5 km/h 驟降至 0 km/h，飽和度達 1.00，狀態由 Critical 轉為 Blocked。同時段大巨蛋散場人流正大量湧出（BS_TPE_DOME 22:00 仍有 22,000 人），捷運國父紀念館站 (BS_MRT_BL17) 已累積 28,500 人。',
    dataEvidence:
      'RD_TPE_002 @ 22:10: avgSpeed=2, saturation=1.00, laneStatus=Accident_Impact → 22:15: avgSpeed=0, laneStatus=Blocked; BS_MRT_BL17 @ 22:00: userCount=28,500',
    sopReference: 'SOP-TRAFFIC-001: 重大事故初期通報與封鎖程序',
  },
  {
    step: 2,
    title: '擴散效應分析 — 壅塞傳播預測',
    description:
      '光復南路封閉後，車流回堵至忠孝東路四段 (RD_TPE_001) 及基隆路一段 (RD_TPE_003)。RD_TPE_001 於 22:15 飽和度 1.00、車速 4 km/h，22:30 進入 Gridlock 狀態。基隆路一段 22:30 飽和度 1.00。延吉街 (RD_TPE_008) 因容量僅 600 vph，22:15 即進入 Gridlock。預計壅塞將在 15 分鐘內擴散至市民大道四段及敦化南路一段。',
    dataEvidence:
      'RD_TPE_001 @ 22:30: avgSpeed=3, saturation=1.00, laneStatus=Gridlock; RD_TPE_003 @ 22:30: saturation=1.00; RD_TPE_008 @ 22:15: saturation=1.00, laneStatus=Gridlock',
    sopReference: 'SOP-TRAFFIC-003: 壅塞擴散評估與警戒升級標準',
  },
  {
    step: 3,
    title: '替代路線可行性評估',
    description:
      '根據路網結構，RD_TPE_002 的替代路線為 RD_TPE_004（市民大道四段）、RD_TPE_005（仁愛路四段）、RD_TPE_006（敦化南路一段）及 RD_TPE_008（延吉街）。延吉街已 Gridlock，排除。市民大道四段 22:15 飽和度 0.85 但容量 2,500 vph 尚有緩衝空間，選為主要替代路線。仁愛路四段容量 4,000 vph、22:15 飽和度 0.72，可作為次要分流。敦化南路一段 22:15 飽和度 0.85，可承接部分車流。',
    dataEvidence:
      'RD_TPE_004 @ 22:15: saturation=0.85, capacity=2,500; RD_TPE_005 @ 22:15: saturation=0.72, capacity=4,000; RD_TPE_008 @ 22:15: saturation=1.00 (excluded)',
    sopReference: 'SOP-TRAFFIC-005: 替代路線選擇與分流原則',
  },
  {
    step: 4,
    title: '跨系統協調 — 人潮疏運與號誌調整',
    description:
      '捷運國父紀念館站 (BS_MRT_BL17) 22:15 已達 31,000 人，建議啟動人流管制。同時 BS_TPE_101 漫遊用戶比 45%，觸發多語言警報。號誌調整：市民大道四段東西向綠燈延長 30 秒以吸收分流車流；仁愛路四段東西向綠燈延長 20 秒。通知捷運系統加開疏運班次，公車動態調度繞行路線。',
    dataEvidence:
      'BS_MRT_BL17 @ 22:15: userCount=31,000; BS_TPE_101 @ 22:15: roamingPct=45%',
    sopReference: 'SOP-CROWD-002: 大型活動散場人潮疏運計畫',
  },
  {
    step: 5,
    title: '預估恢復時間 (ETE) 計算',
    description:
      '基礎清除時間為 60 分鐘（路面塌陷搶修 + 事故車輛移除）。壅塞懲罰依據目前飽和度計算：(1.00 − 0.50) × 60 = 30 分鐘。總 ETE = 60 + 30 = 90 分鐘，預計 23:40 前後可恢復正常通行。建議持續監控 RD_TPE_001 與 RD_TPE_003 飽和度下降趨勢作為解除警報依據。',
    dataEvidence:
      'baseClearance=60min, congestionPenalty=(1.00-0.50)*60=30min, totalETE=90min',
    sopReference: 'SOP-TRAFFIC-008: 恢復時間預估模型與解除警報條件',
  },
];

// ─── Advisory report for TPE_2026_ACC_001 ───────────────────────────
export const sampleAdvisoryReport: AdvisoryReport = {
  eventId: 'TPE_2026_ACC_001',
  eventDescription:
    '光復南路與忠孝東路口南側發生地下管線爆裂導致路面塌陷，引發三車連環追撞，光復南路南下全線封鎖。',
  sopArticles: [
    'SOP-TRAFFIC-001: 重大事故初期通報與封鎖程序',
    'SOP-TRAFFIC-003: 壅塞擴散評估與警戒升級標準',
    'SOP-TRAFFIC-005: 替代路線選擇與分流原則',
    'SOP-CROWD-002: 大型活動散場人潮疏運計畫',
    'SOP-TRAFFIC-008: 恢復時間預估模型與解除警報條件',
  ],
  alertLevel: 'A',
  alertJustification:
    '光復南路全線封閉（saturation=1.00, Blocked），壅塞已擴散至忠孝東路四段（Gridlock）、基隆路一段（Critical）及延吉街（Gridlock），同時大巨蛋散場人潮超過 40,000 人持續湧出，符合 A 級警戒條件。',
  primaryRoute: '市民大道四段',
  secondaryRoutes: ['仁愛路四段', '敦化南路一段', '基隆路地下道'],
  excludedRoutes: [
    {
      route: '延吉街',
      reason: '容量僅 600 vph，22:15 已 Gridlock（saturation=1.00），無法承擔分流',
    },
    {
      route: '光復南路',
      reason: '事故封閉路段，完全無法通行',
    },
  ],
  signalAdjustments: [
    {
      road: '市民大道四段',
      adjustment: '東西向綠燈延長 30 秒',
      period: '22:15 – 23:40',
    },
    {
      road: '仁愛路四段',
      adjustment: '東西向綠燈延長 20 秒',
      period: '22:15 – 23:40',
    },
    {
      road: '敦化南路一段',
      adjustment: '南北向綠燈延長 15 秒',
      period: '22:20 – 23:00',
    },
  ],
  crossSystemActions: [
    '通知捷運板南線加開疏運班次（BL17 國父紀念館站、BL18 市政府站）',
    '公車動態調度：282、299、忠孝幹線繞行市民大道',
    '啟動多語言推播警報（BS_TPE_101 漫遊用戶比 45%）',
    '通知台電搶修信義區路燈號誌（TPE_2026_EVT_003 連動）',
    '協調消防局維持光復南路事故現場救援通道',
  ],
  eteMinutes: 90,
  eteBreakdown: {
    baseClearance: 60,
    congestionPenalty: 30,
  },
  reasoningChain: sampleReasoningSteps,
};

// ─── Multi-language alert triggered by BS_TPE_101 ──────────────────
export const sampleMultiLangAlert: MultiLangAlert = {
  triggered: true,
  triggerStation: 'BS_TPE_101',
  roamingPct: 0.40,
  messages: {
    zh: '【交通警報】光復南路因路面塌陷事故全線封閉，請改行市民大道或仁愛路。捷運國父紀念館站人潮擁擠，建議改由市政府站進出。',
    en: '[Traffic Alert] Guangfu S. Rd is fully closed due to a road collapse accident. Please detour via Civic Blvd or Ren\'ai Rd. Sun Yat-sen Memorial Hall MRT Station is overcrowded — consider using Taipei City Hall Station instead.',
    ja: '【交通警報】光復南路は路面陥没事故のため全面通行止めです。市民大道または仁愛路へう回してください。MRT国父記念館駅は混雑しています。市政府駅のご利用をお勧めします。',
    ko: '[교통 경보] 광푸남로는 도로 함몰 사고로 전면 통제 중입니다. 시민대도 또는 런아이로로 우회하세요. MRT 국부기념관역이 혼잡하오니 시정부역을 이용해 주세요.',
  },
};

// ─── Chat messages: What-if scenario about BL17 reaching 40,000 ────
export const sampleChatMessages: ChatMessage[] = [
  {
    id: 'msg-001',
    role: 'system',
    content: '交通指揮 AI 助理已啟動。目前載入情境：2026-05-20 大巨蛋散場 + 光復南路塌陷事故。',
    timestamp: '2026-05-20 22:15',
  },
  {
    id: 'msg-002',
    role: 'user',
    content: '如果 BL17（國父紀念館站）人數突破 40,000 人，會發生什麼事？',
    timestamp: '2026-05-20 22:16',
  },
  {
    id: 'msg-003',
    role: 'assistant',
    content:
      '根據模擬分析，若 BS_MRT_BL17 人數達到 40,000 人（目前 22:15 為 31,000 人，成長率 +8%），預計將觸發以下連鎖效應：\n\n' +
      '1. **站體容量超載**：國父紀念館站設計容量約 25,000 人，40,000 人將達 160% 超載，須立即啟動進站管制。\n\n' +
      '2. **地面壅塞加劇**：滯留人群將外溢至忠孝東路四段 (RD_TPE_001)，該路段目前已處於 Gridlock 狀態（avgSpeed=3 km/h），人車混流將使車速降至 0。\n\n' +
      '3. **替代疏運需求暴增**：\n' +
      '   - 市政府站 (BS_MRT_BL18) 目前 22:00 已有 15,000 人，預計將被迫承接溢出人流\n' +
      '   - 市府轉運站 (BS_BUS_TERM) 22:00 有 11,000 人，需加開接駁車\n\n' +
      '4. **建議行動**：\n' +
      '   - 立即啟動 BL17 進站人流管制（單向開放出站）\n' +
      '   - 開放忠孝東路四段部分車道為行人專用\n' +
      '   - BL18 市政府站預備性啟動人流管制\n' +
      '   - 加開板南線列車班距縮短至 2 分鐘',
    timestamp: '2026-05-20 22:16',
    sopReferences: [
      'SOP-CROWD-001: 捷運站人流超載應變程序',
      'SOP-CROWD-002: 大型活動散場人潮疏運計畫',
    ],
  },
  {
    id: 'msg-004',
    role: 'user',
    content: '這個情境下，預估恢復正常需要多久？對仁愛路的影響呢？',
    timestamp: '2026-05-20 22:17',
  },
  {
    id: 'msg-005',
    role: 'assistant',
    content:
      '**恢復時間預估**：\n' +
      '若 BL17 達 40,000 人，結合光復南路塌陷事故（ETE 90 分鐘），整體恢復時間將延長至約 **120 分鐘**（至 00:15 左右）。\n\n' +
      '- 基礎清除時間：60 分鐘（路面搶修）\n' +
      '- 壅塞懲罰：30 分鐘（原有）\n' +
      '- 人潮超載額外懲罰：30 分鐘（BL17 消化 15,000 人差額，以每分鐘約 500 人出站速率計算）\n\n' +
      '**仁愛路四段 (RD_TPE_005) 影響評估**：\n' +
      '- 目前 22:15 飽和度 0.72、車速 28 km/h，狀態 Normal\n' +
      '- 若 BL17 人群外溢，部分人車混流將從光復南路與仁愛路交叉口湧入\n' +
      '- 預計飽和度將升至 0.85-0.90，車速降至 15-18 km/h\n' +
      '- 建議預防性將仁愛路四段東西向綠燈延長 15 秒，並於光復南路口設置臨時行人穿越管制',
    timestamp: '2026-05-20 22:17',
    sopReferences: [
      'SOP-TRAFFIC-008: 恢復時間預估模型與解除警報條件',
      'SOP-CROWD-003: 人車混流緊急管制措施',
    ],
  },
];
