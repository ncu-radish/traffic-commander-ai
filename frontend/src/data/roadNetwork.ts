/* ═══════════════════════════════════════════════════════════════
   信義計畫區 15 條路段的地圖幾何

   Leaflet 一律使用 [latitude, longitude]，所以下面每一組座標都是
   [緯度, 經度]（緯度約 25.03–25.05、經度約 121.54–121.57）。

   幾何是示意性的正交路網：每條路對應一條固定的緯度線（東西向）或
   經度線（南北向），路段則是這些線之間的區間。

   ▸ 節點必須真的共用
     road_network_geometry.json 的 intersections 宣告了哪些路段相交，
     這裡每一個宣告的路口都是兩條折線「完全相同的一個座標」，
     不是靠近而已。上下學路線因此可以純粹沿著相鄰節點走完，
     不需要任何憑空補的銜接線，也不會有起訖點直連的直線。

   ▸ 與舊版的差異（都只沿用舊資料裡已存在的網格值，未引入新座標）
     · 忠孝東路四段 西端由 121.5530 延伸到 121.5490
       —— 復興南路一段與敦化南路一段的 intersections 都列了忠孝東路四段，
          原本兩者卻都碰不到它。
     · 延吉街 由經度 121.5510 移到 121.5550
       —— 原本落在忠孝東路四段與仁愛路四段的西端之外，兩個宣告的
          路口都是斷開的。121.5550 位於敦化南路與光復南路之間，
          符合忠孝東路四段 intersections 的上游→下游順序。
     · 松高路 由緯度 25.0385 移到 25.0370
       —— 市府路 intersections 的順序是 仁愛路四段 → 松高路 → 松壽路，
          原本松高路（25.0385）卻在仁愛路（25.0380）以北，順序矛盾。
     · 光復南路 兩端延伸到 25.0470／25.0380、市民大道四段 中間節點
       改為 121.5530、敦化南路一段 北端延伸到 25.0470、
       仁愛路四段 東端延伸到 121.5660、市府路 南端延伸到 25.0340、
       敦化南路二段 北端改為 25.0380、基隆路地下道 由 121.5640 移到 121.5630
       —— 全部都是為了讓已宣告的路口真正共用同一個節點。
   ═══════════════════════════════════════════════════════════════ */

/* ── 路網格線 ────────────────────────────────────────────────── */

/** 東西向道路各自的緯度。 */
const LAT = {
  civicBlvd: 25.0470, // 市民大道四段
  zhengqiBridge: 25.0430, // 正氣橋（基隆路地下道北端）
  zhongxiaoE: 25.0418, // 忠孝東路四段
  renai: 25.0380, // 仁愛路四段
  songgao: 25.0370, // 松高路
  songshou: 25.0360, // 松壽路
  xinyi5: 25.0340, // 信義路五段
} as const;

/** 南北向道路各自的經度。 */
const LNG = {
  fuxingS: 121.5490, // 復興南路一段
  dunhuaS: 121.5530, // 敦化南路一段／二段
  yanji: 121.5550, // 延吉街
  guangfuS: 121.5575, // 光復南路
  keelung: 121.5630, // 基隆路一段／基隆路地下道
  cityHall: 121.5660, // 市府路
  songzhi: 121.5690, // 松智路
} as const;

/**
 * 路段 id → 折線 [緯度, 經度][]。
 *
 * 每條折線的節點順序都依 road_network_geometry.json 的
 * flow_direction 與 intersections（上游 → 下游）排列。
 */
export const SEGMENT_COORDINATES: Record<string, [number, number][]> = {
  /** 忠孝東路四段 · 東西向 · 復興南路 → 敦化南路 → 延吉街 → 光復南路 → 基隆路 */
  RD_TPE_001: [
    [LAT.zhongxiaoE, LNG.fuxingS],
    [LAT.zhongxiaoE, LNG.dunhuaS],
    [LAT.zhongxiaoE, LNG.yanji],
    [LAT.zhongxiaoE, LNG.guangfuS],
    [LAT.zhongxiaoE, LNG.keelung],
  ],

  /** 光復南路 · 南北向 · 市民大道 → 忠孝東路 → 仁愛路 */
  RD_TPE_002: [
    [LAT.civicBlvd, LNG.guangfuS],
    [LAT.zhongxiaoE, LNG.guangfuS],
    [LAT.renai, LNG.guangfuS],
  ],

  /** 基隆路一段 · 南北向 · 忠孝東路 → 仁愛路 → 松高路 → 松壽路 → 信義路五段 */
  RD_TPE_003: [
    [LAT.zhongxiaoE, LNG.keelung],
    [LAT.renai, LNG.keelung],
    [LAT.songgao, LNG.keelung],
    [LAT.songshou, LNG.keelung],
    [LAT.xinyi5, LNG.keelung],
  ],

  /** 市民大道四段 · 東西向 · 復興南路 → 敦化南路 → 光復南路 */
  RD_TPE_004: [
    [LAT.civicBlvd, LNG.fuxingS],
    [LAT.civicBlvd, LNG.dunhuaS],
    [LAT.civicBlvd, LNG.guangfuS],
  ],

  /** 仁愛路四段 · 東西向 · 敦化南路 → 延吉街 → 光復南路 → 基隆路 → 市府路 */
  RD_TPE_005: [
    [LAT.renai, LNG.dunhuaS],
    [LAT.renai, LNG.yanji],
    [LAT.renai, LNG.guangfuS],
    [LAT.renai, LNG.keelung],
    [LAT.renai, LNG.cityHall],
  ],

  /** 敦化南路一段 · 南北向 · 市民大道 → 忠孝東路 → 仁愛路 */
  RD_TPE_006: [
    [LAT.civicBlvd, LNG.dunhuaS],
    [LAT.zhongxiaoE, LNG.dunhuaS],
    [LAT.renai, LNG.dunhuaS],
  ],

  /** 松高路 · 東西向 · 基隆路 → 市府路 → 松智路 */
  RD_TPE_007: [
    [LAT.songgao, LNG.keelung],
    [LAT.songgao, LNG.cityHall],
    [LAT.songgao, LNG.songzhi],
  ],

  /** 延吉街 · 南北向 · 忠孝東路 → 仁愛路 */
  RD_TPE_008: [
    [LAT.zhongxiaoE, LNG.yanji],
    [LAT.renai, LNG.yanji],
  ],

  /** 基隆路地下道 · 南北向 · 忠孝東路 → 正氣橋（正氣橋非資料集路段，為自由端） */
  RD_TPE_009: [
    [LAT.zhongxiaoE, LNG.keelung],
    [LAT.zhengqiBridge, LNG.keelung],
  ],

  /** 市府路 · 南北向 · 仁愛路 → 松高路 → 松壽路 → 信義路五段 */
  RD_TPE_010: [
    [LAT.renai, LNG.cityHall],
    [LAT.songgao, LNG.cityHall],
    [LAT.songshou, LNG.cityHall],
    [LAT.xinyi5, LNG.cityHall],
  ],

  /** 松壽路 · 東西向 · 基隆路 → 市府路 → 松智路 */
  RD_TPE_011: [
    [LAT.songshou, LNG.keelung],
    [LAT.songshou, LNG.cityHall],
    [LAT.songshou, LNG.songzhi],
  ],

  /**
   * 敦化南路二段 · 南北向 · 仁愛路 → 信義路
   * 資料集寫的下游是信義路五段，但信義路五段的範圍在基隆路以東，
   * 兩者不可能相交，因此南端停在信義路的緯度線上，為自由端。
   */
  RD_TPE_012: [
    [LAT.renai, LNG.dunhuaS],
    [LAT.xinyi5, LNG.dunhuaS],
  ],

  /** 信義路五段 · 東西向 · 基隆路 → 市府路 → 松智路 */
  RD_TPE_013: [
    [LAT.xinyi5, LNG.keelung],
    [LAT.xinyi5, LNG.cityHall],
    [LAT.xinyi5, LNG.songzhi],
  ],

  /** 松智路 · 南北向 · 松高路 → 松壽路 → 信義路五段 */
  RD_TPE_014: [
    [LAT.songgao, LNG.songzhi],
    [LAT.songshou, LNG.songzhi],
    [LAT.xinyi5, LNG.songzhi],
  ],

  /** 復興南路一段 · 南北向 · 市民大道 → 忠孝東路 */
  RD_TPE_015: [
    [LAT.civicBlvd, LNG.fuxingS],
    [LAT.zhongxiaoE, LNG.fuxingS],
  ],
};

/**
 * 路段 id → 路名，與 road_network_geometry.json 的 name 欄位一致。
 * 用來把路網節點組成路口名稱（例如校車站點），不必等後端資料回來。
 */
export const SEGMENT_NAMES: Record<string, string> = {
  RD_TPE_001: '忠孝東路四段',
  RD_TPE_002: '光復南路',
  RD_TPE_003: '基隆路一段',
  RD_TPE_004: '市民大道四段',
  RD_TPE_005: '仁愛路四段',
  RD_TPE_006: '敦化南路一段',
  RD_TPE_007: '松高路',
  RD_TPE_008: '延吉街',
  RD_TPE_009: '基隆路地下道',
  RD_TPE_010: '市府路',
  RD_TPE_011: '松壽路',
  RD_TPE_012: '敦化南路二段',
  RD_TPE_013: '信義路五段',
  RD_TPE_014: '松智路',
  RD_TPE_015: '復興南路一段',
};

/** 上下學路線的起點：仁愛路四段／敦化南路口。 */
export const HOME_POSITION: [number, number] = [LAT.renai, LNG.dunhuaS];

/** 上下學路線的終點：信義路五段／松智路口。 */
export const SCHOOL_POSITION: [number, number] = [LAT.xinyi5, LNG.songzhi];
