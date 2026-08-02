import type { CommuteRoute, CommuteWaypoint } from '../types';
import { HOME_POSITION, SCHOOL_POSITION } from './roadNetwork';
import { buildRoadGraph, snapToNode, findPath } from '../services/roadGraph';

/* ═══════════════════════════════════════════════════════════════
   上下學路線模擬 — 起訖點與三條候選路線

   情境：孩童從住家到學校的固定上下學行程。平台依即時路況與事故熱點
   比較三條路線，推薦風險最低者，避免孩子走進壅塞與易肇事路段。

   ▸ 路線怎麼產生
     不寫死座標。三條路線各自只給一組「允許通行的路段」（路廊），
     再由 roadGraph 在既有路段幾何上做最短路徑。折線因此完全由
     相鄰的路段節點組成，必然疊合在壅塞地圖畫出來的線上：
     沒有起訖點直連的直線，也沒有為了接起來而生成的座標。

   ▸ 起訖點
     住家與學校都用 snapToNode 吸附到最近的路網節點，
     所以端點一定落在路段上，而不是浮在路旁。

   ▸ 路廊怎麼選
     依 city_traffic_flow.csv 的飽和度峰值與 accident_hotspots.json
     的事故件數挑選：
       路段           峰值   事故件數
       忠孝東路四段   1.00    122
       基隆路一段     1.00    296
       敦化南路一段   0.99      0
       仁愛路四段     0.92    118
       松高路         0.92    154
       松壽路         0.92    132
       信義路五段     0.85    234
       松智路         0.88     60
       市府路         0.82     33
     路線 1 走忠孝東路／基隆路幹道，尖峰達 A 級且事故最密集；
     路線 2 沿市府路南下接信義路五段，轉彎最少但信義路五段事故最多；
     路線 3 由市府路轉松壽路再接松智路，避開基隆路與信義路五段，
     平均每路段事故件數為三條最低。

     住家位於仁愛路四段／敦化南路口，往南的唯一非 A 級出口是
     仁愛路四段，所以路線 2、3 都以它起頭，差別在後半段。

     三條路線都在同一個正交路網上，里程因此相近；差別在於行經
     哪些路段，而不是繞遠或走近路。

   ▸ 分級不寫死
     A 級／B 級／暢通由當下時間點的 saturationScore 依 SOP 第 1 條
     門檻算出，事故風險由 accident_hotspots.json 算出。拖動時間軸時
     評級與推薦結果會跟著變化，這正是「依路況即時提供替代路線」
     要展示的行為。
   ═══════════════════════════════════════════════════════════════ */

const graph = buildRoadGraph();
const home = snapToNode(graph, HOME_POSITION);
const school = snapToNode(graph, SCHOOL_POSITION);

/** 住家：仁愛路四段／敦化南路口。三條路線都從這裡出發。 */
export const COMMUTE_ORIGIN: CommuteWaypoint = {
  label: '住家',
  detail: '仁愛路四段／敦化南路口',
  position: home.position,
};

/** 學校：信義路五段／松智路口。 */
export const COMMUTE_DESTINATION: CommuteWaypoint = {
  label: '學校',
  detail: '信義國小（信義路五段／松智路口）',
  position: school.position,
};

/**
 * 三條路線共用的虛線週期：實線 13px + 空白 15px，總週期 28px。
 *
 * 為什麼需要錯開相位：住家往南唯一的非 A 級出口是仁愛路四段，所以
 * 路線 2 與路線 3 必然共用仁愛路四段與市府路北段（實測重疊 1532 m，
 * 各占自身 74%）。若兩條的實線落在同一位置，後畫的那條會把前一條
 * 完全蓋掉；錯開半個週期後，重疊路段上會看到兩色虛線交錯排列。
 *
 * 為什麼只需要兩個相位：真正需要分離的只有「路線 2 × 路線 3」這一組。
 * 路線 1 與路線 3 的路徑重疊為 0 m，可以安全共用同一個相位；路線 1
 * 與路線 2 雖有 302 m 重疊（信義路五段），但那段不是兩條的共同前綴，
 * 兩條到該處的路徑長度不同，相位本來就無法保證對齊，給它獨立相位
 * 也沒有幫助。
 *
 * 實線長度上限 = 週期 ÷ 相位數。兩個相位是 ÷2（此處 13 < 14，留 1px
 * 間隔），比三個相位的 ÷3 寬鬆，所以虛線能同時更長（11→13）也更密
 * （週期 36→28）。
 *
 * 維護注意：若之後改動 corridor，使得路線 1 與路線 3 也共用一段共同
 * 前綴，就必須改回三個相位，實線同時要縮到小於週期 ÷ 3。
 *
 * 另一個代價是虛線樣式不再能區分路線（三條同樣式），所以「不單靠顏色
 * 辨識」改由三個地方承擔：路線名稱與比較面板的文字、面板上的風險圖示
 * （▲ ◆ ●），以及點選路線後其餘兩條淡化的隔離檢視。
 */
const DASH_PATTERN = '13 15';

/**
 * 兩個相位。實線區間分別是 [0,13) 與 [14,27)，互不重疊。
 * 路線 2 用 A，路線 1 與路線 3 用 B（兩者重疊 0 m，可共用）。
 */
const DASH_PHASE_A = '0';
const DASH_PHASE_B = '14';

/**
 * 路線的固定資料。path 與 segmentIds 不在這裡寫死，
 * 而是由 corridor 在路網圖上算出來。
 */
interface CommuteCorridor extends Omit<CommuteRoute, 'path' | 'segmentIds'> {
  /** 這條路線允許通行的路段。最短路徑只會在這些路段之間走。 */
  corridor: readonly string[];
}

const CORRIDORS: CommuteCorridor[] = [
  {
    id: 'ROUTE_LEVEL_A',
    name: '路線 1 · 主幹道（A 級路段）',
    shortName: '路線 1 · A 級',
    summary:
      '敦化南路一段 → 忠孝東路四段 → 基隆路一段 → 信義路五段。幹道走廊，但忠孝東路四段與基隆路一段的飽和度峰值都是 1.00，尖峰時會被判為 A 級癱瘓，也是事故熱點最密集的一段。',
    // 紅色。與路線 3 重疊 0 m，共用相位 B。
    colorKey: 'a',
    dashArray: DASH_PATTERN,
    dashOffset: DASH_PHASE_B,
    corridor: ['RD_TPE_006', 'RD_TPE_001', 'RD_TPE_003', 'RD_TPE_013'],
  },
  {
    id: 'ROUTE_LEVEL_B',
    name: '路線 2 · 信義路五段（B 級路段）',
    shortName: '路線 2 · B 級',
    summary:
      '仁愛路四段 → 市府路 → 信義路五段。避開忠孝東路與基隆路，全程只經三段、轉彎最少，飽和度峰值 0.92 不會達 A 級；但信義路五段是 101 商圈的主要出入幹道，事故 234 件為沿線最高。與路線 3 共用仁愛路四段與市府路北段，在松壽路口才分開：本路線繼續沿市府路南下。',
    // 琥珀色，相位 A —— 與路線 3 錯開半個週期。
    colorKey: 'b',
    dashArray: DASH_PATTERN,
    dashOffset: DASH_PHASE_A,
    corridor: ['RD_TPE_005', 'RD_TPE_010', 'RD_TPE_013'],
  },
  {
    id: 'ROUTE_CLEAR',
    name: '路線 3 · 市府路／松壽路（低風險）',
    shortName: '路線 3 · 低風險',
    summary:
      '仁愛路四段 → 市府路 → 松壽路 → 松智路。同樣避開 A 級幹道，並繞開基隆路一段與信義路五段這兩段事故最密集的路廊；平均每路段事故 86 件，為三條路線中最低，其中市府路峰值 0.82 未達 B 級門檻。與路線 2 共用仁愛路四段與市府路北段，在松壽路口向東轉出。',
    // 苔綠色，相位 B —— 與路線 2 錯開半個週期。
    colorKey: 'ok',
    dashArray: DASH_PATTERN,
    dashOffset: DASH_PHASE_B,
    corridor: ['RD_TPE_005', 'RD_TPE_010', 'RD_TPE_011', 'RD_TPE_014'],
  },
];

/**
 * 把每條路廊算成實際折線。
 *
 * 算不出路徑代表路網幾何在該路廊上是斷開的 —— 這是資料層面的錯誤，
 * 但不該讓整個儀表板掛掉，所以記錄下來並略過該條路線。
 */
export const COMMUTE_ROUTES: CommuteRoute[] = CORRIDORS.flatMap(
  ({ corridor, ...meta }) => {
    const result = findPath(graph, home.key, school.key, corridor);
    if (!result) {
      console.error(
        `[commuteRoutes] ${meta.id} 無法在路廊 ${corridor.join(', ')} 上連通起訖點，已略過`
      );
      return [];
    }
    return [{ ...meta, path: result.path, segmentIds: result.segmentIds }];
  }
);
