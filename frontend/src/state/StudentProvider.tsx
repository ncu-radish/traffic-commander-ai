import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  INITIAL_STUDENTS,
  StudentContext,
  dropOffEventId,
  dropOffNotificationId,
  toClockTime,
} from './studentStore';
import type {
  ParentNotification,
  StudentRecord,
  StudentStatus,
  StudentTimelineEvent,
} from './studentStore';

/**
 * 校車學生狀態的唯一寫入點。
 *
 * 掛在 Root 的 mode 判斷之外，所以校方端與家長端共用同一份狀態，
 * 切換角色後結果仍然在。型別與示範名單在 studentStore.ts。
 */
export function StudentProvider({ children }: { children: ReactNode }) {
  const [students, setStudents] = useState<StudentRecord[]>(INITIAL_STUDENTS);
  const [timelineEvents, setTimelineEvents] = useState<StudentTimelineEvent[]>([]);
  const [notifications, setNotifications] = useState<ParentNotification[]>([]);

  const confirmDropOff = useCallback(
    (studentId: string, timestamp: string) => {
      const target = students.find((s) => s.id === studentId);
      // 已下車的學生不可再次操作 —— UI 會停用按鈕，這裡再擋一次。
      if (!target || target.status === 'droppedOff') return;

      const clockTime = toClockTime(timestamp);
      const eventId = dropOffEventId(studentId);
      const notificationId = dropOffNotificationId(studentId);

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, status: 'droppedOff' as StudentStatus, droppedOffAt: clockTime }
            : s
        )
      );

      // 每位學生只會有一筆下車事件與一則通知。用 id 去重，
      // 這樣 StrictMode 下 updater 被呼叫兩次也不會寫進重複資料。
      setTimelineEvents((prev) =>
        prev.some((e) => e.id === eventId)
          ? prev
          : [
              ...prev,
              {
                id: eventId,
                timestamp,
                label: `${clockTime} ${target.name} 已下車 · ${target.stopName}`,
              },
            ]
      );

      setNotifications((prev) =>
        prev.some((n) => n.id === notificationId)
          ? prev
          : [
              ...prev,
              {
                id: notificationId,
                title: '孩子已下車',
                body: `${target.name}已於 ${clockTime} 在 ${target.stopName}下車。`,
              },
            ]
      );
    },
    [students]
  );

  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications((items) => items.filter((n) => n.id !== notificationId));
  }, []);

  const value = useMemo(
    () => ({ students, timelineEvents, notifications, confirmDropOff, dismissNotification }),
    [students, timelineEvents, notifications, confirmDropOff, dismissNotification]
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}
