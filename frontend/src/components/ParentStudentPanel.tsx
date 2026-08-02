import type { ParentNotification, StudentRecord } from '../state/studentStore';
import './ParentStudentPanel.css';

interface ParentStudentPanelProps {
  students: StudentRecord[];
  notifications: ParentNotification[];
  onDismissNotification: (notificationId: string) => void;
}

/**
 * 家長端的學生狀態與通知。
 *
 * 放在家長端既有的右側欄（原本留白），所以提示卡片不會蓋到地圖。
 * 資料與校方端同一份 StudentContext，老師確認下車後這裡立即同步。
 */
export default function ParentStudentPanel({
  students,
  notifications,
  onDismissNotification,
}: ParentStudentPanelProps) {
  return (
    <>
      {/* 通知放在最上面：小型卡片，可個別關閉。 */}
      {notifications.length > 0 && (
        <div className="parent-notices" role="status" aria-live="polite">
          {notifications.map((notice) => (
            <article className="parent-notice" key={notice.id}>
              <span className="parent-notice__icon" aria-hidden="true">
                ●
              </span>
              <div className="parent-notice__text">
                <span className="parent-notice__title">{notice.title}</span>
                <p className="parent-notice__body">{notice.body}</p>
              </div>
              <button
                className="parent-notice__close"
                onClick={() => onDismissNotification(notice.id)}
                aria-label={`關閉通知：${notice.title}`}
              >
                ✕
              </button>
            </article>
          ))}
        </div>
      )}

      <section className="parent-students panel">
        <header className="panel__header">
          <span>我的孩子</span>
        </header>

        <ul className="parent-students__list">
          {students.map((student) => {
            const isDroppedOff = student.status === 'droppedOff';
            return (
              <li className="parent-students__item" key={student.id}>
                <div className="parent-students__info">
                  <span className="parent-students__name">
                    {student.name}
                    <span className="parent-students__grade">{student.grade}</span>
                  </span>
                  <span className="parent-students__stop">{student.stopName}</span>
                </div>

                <div className="parent-students__state">
                  {isDroppedOff ? (
                    <>
                      <span className="badge badge-success">● 已下車</span>
                      <span className="num parent-students__time">
                        {student.droppedOffAt}
                      </span>
                    </>
                  ) : (
                    <span className="badge badge-info">◆ 已上車</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
