import { createContext, useContext } from 'react';
import { DROP_OFF_STOPS } from '../data/commuteStops';

/* ═══════════════════════════════════════════════════════════════
   校車學生狀態 — 型別、示範名單與 Context

   Provider 本體在 StudentProvider.tsx。分成兩個檔案是因為同一個檔案
   同時匯出元件與非元件會讓 fast refresh 失效（oxlint
   react(only-export-components)）。

   為什麼需要共用 Context：Root.tsx 以 mode 互斥掛載 <App />（校方）與
   <UserView />（家長），切換角色會把整個子樹 unmount。狀態若留在任一
   端，切過去就沒了。Provider 掛在 mode 判斷之外，兩端才能看到同一份
   學生狀態、下車時間、時間軸事件與通知。

   後端沒有學生 API，這裡的名單是前端的示範資料；下車時間不寫死，
   一律取自時間軸當前位置，所以畫面上的時間與時間軸讀數一致。
   ═══════════════════════════════════════════════════════════════ */

export type StudentStatus = 'boarded' | 'droppedOff';

export interface StudentRecord {
  id: string;
  name: string;
  /** 班級，名單上用來區分同名學生。 */
  grade: string;
  /**
   * 下車站點。站名取自既有路網的路口（road_network_geometry.json 的
   * 路段名稱兩兩相交），所以站點與地圖上畫出來的路段是同一組路。
   */
  stopName: string;
  status: StudentStatus;
  /** 實際下車時間 HH:MM，取自確認當下的時間軸位置；未下車為 null。 */
  droppedOffAt: string | null;
}

/**
 * 時間軸事件。形狀刻意保持最小，TimelineControl 不必依賴這個模組。
 */
export interface StudentTimelineEvent {
  id: string;
  /** 與 TimelineControl 的 timestamps 同格式：'YYYY-MM-DD HH:MM'。 */
  timestamp: string;
  label: string;
}

/** 家長端的提示卡片。 */
export interface ParentNotification {
  id: string;
  title: string;
  body: string;
}

/**
 * 示範名單。三位學生，全部從「已上車」開始，下車狀態由老師在校方端
 * 確認後產生。
 *
 * 站點不寫死路名，而是取 DROP_OFF_STOPS 的第 n 站 —— 那份清單直接
 * 由地圖上的建議路線節點推導，所以名單顯示的下車站點必然落在地圖畫
 * 出來的模擬路線上。索引取 1、3、5 讓三站沿路線分散開。
 */
const STOP_INDEX = [1, 3, 5] as const;

const stopNameAt = (index: number, fallback: string) =>
  DROP_OFF_STOPS[index]?.name ?? fallback;

export const INITIAL_STUDENTS: StudentRecord[] = [
  {
    id: 'STU_001',
    name: '王小明',
    grade: '三年 A 班',
    stopName: stopNameAt(STOP_INDEX[0], '市府路／松壽路口'),
    status: 'boarded',
    droppedOffAt: null,
  },
  {
    id: 'STU_002',
    name: '陳彥廷',
    grade: '四年 A 班',
    stopName: stopNameAt(STOP_INDEX[1], '仁愛路四段／市府路口'),
    status: 'boarded',
    droppedOffAt: null,
  },
  {
    id: 'STU_003',
    name: '林佳蓉',
    grade: '三年 B 班',
    stopName: stopNameAt(STOP_INDEX[2], '仁愛路四段／光復南路口'),
    status: 'boarded',
    droppedOffAt: null,
  },
];

/**
 * 家長端登入後綁定的孩子。校方端（App.tsx）是校車名單，看得到全部學生；
 * 家長只該看到自己的孩子，所以家長端一律以這個 id 過濾名單、時間軸事件
 * 與通知。要換示範對象只改這一行。
 */
export const PARENT_CHILD_ID = 'STU_001';

/**
 * 下車事件與通知的 id 慣例。寫成函式是為了讓產生端（StudentProvider）
 * 與過濾端（家長端）共用同一組規則，不必各自拼字串。
 */
export const dropOffEventId = (studentId: string) => `evt-dropoff-${studentId}`;
export const dropOffNotificationId = (studentId: string) =>
  `notif-dropoff-${studentId}`;

export interface StudentContextValue {
  students: StudentRecord[];
  timelineEvents: StudentTimelineEvent[];
  notifications: ParentNotification[];
  /**
   * 老師確認下車。一次完成狀態、下車時間、時間軸事件與家長通知，
   * 確保兩端看到的是同一個結果。
   *
   * @param timestamp 時間軸當前位置，格式 'YYYY-MM-DD HH:MM'
   */
  confirmDropOff: (studentId: string, timestamp: string) => void;
  dismissNotification: (notificationId: string) => void;
}

export const StudentContext = createContext<StudentContextValue | null>(null);

/** 從時間軸的時間戳取出 HH:MM，取不到就退回本機時間。 */
export function toClockTime(timestamp: string): string {
  const time = timestamp.split(' ')[1];
  if (time && /^\d{2}:\d{2}/.test(time)) return time.slice(0, 5);
  return new Date().toTimeString().slice(0, 5);
}

export function useStudents(): StudentContextValue {
  const ctx = useContext(StudentContext);
  if (!ctx) throw new Error('useStudents 必須在 <StudentProvider> 內使用');
  return ctx;
}
