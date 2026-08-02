import type { StudentRecord } from '../state/studentStore';
import './StudentRoster.css';

interface StudentRosterProps {
  students: StudentRecord[];
  /** 只有狀態為「已上車」的學生會呼叫這個。 */
  onRequestDropOff: (studentId: string) => void;
}

/**
 * 校方端學生名單。
 *
 * 「已上車」才顯示可按的「確認下車」；「已下車」改為停用按鈕並顯示
 * 實際下車時間，避免重複操作。
 */
export default function StudentRoster({ students, onRequestDropOff }: StudentRosterProps) {
  const onBoard = students.filter((s) => s.status === 'boarded').length;

  return (
    <section className="roster panel">
      <header className="panel__header">
        <span>校車學生</span>
        <span className="panel__header-action">
          <span className="badge badge-neutral">
            在車上 {onBoard}/{students.length}
          </span>
        </span>
      </header>

      <ul className="roster__list">
        {students.map((student) => {
          const isDroppedOff = student.status === 'droppedOff';

          return (
            <li className="roster__item" key={student.id} data-done={isDroppedOff}>
              <div className="roster__info">
                <span className="roster__name">
                  {student.name}
                  <span className="roster__grade">{student.grade}</span>
                </span>
                <span className="roster__stop">{student.stopName}</span>
                <span className="roster__status">
                  {isDroppedOff ? (
                    <>
                      <span className="badge badge-success">● 已下車</span>
                      <span className="num roster__time">{student.droppedOffAt}</span>
                    </>
                  ) : (
                    <span className="badge badge-info">◆ 已上車</span>
                  )}
                </span>
              </div>

              {isDroppedOff ? (
                <button className="btn btn-sm" disabled>
                  已下車
                </button>
              ) : (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onRequestDropOff(student.id)}
                >
                  確認下車
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
