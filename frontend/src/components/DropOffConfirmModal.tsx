import { useEffect, useRef } from 'react';
import type { StudentRecord } from '../state/studentStore';
import './DropOffConfirmModal.css';

interface DropOffConfirmModalProps {
  student: StudentRecord;
  /** 目前時間，取自時間軸位置（HH:MM）。 */
  currentTime: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 下車確認視窗。只負責呈現與收集決定，狀態更新一律回到
 * StudentContext.confirmDropOff，兩端才不會各自寫一份邏輯。
 */
export default function DropOffConfirmModal({
  student,
  currentTime,
  onCancel,
  onConfirm,
}: DropOffConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 開啟後把焦點移到主要動作，並支援 Esc 取消 —— 鍵盤操作也能完成流程。
  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="dropoff-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="dropoff-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dropoff-modal-title"
      >
        <h3 className="dropoff-modal__title" id="dropoff-modal-title">
          確認學生下車
        </h3>
        <p className="dropoff-modal__lead">確認後將通知家長，無法復原。</p>

        <dl className="dropoff-modal__grid">
          <dt>學生</dt>
          <dd>
            {student.name}
            <span className="dropoff-modal__grade">{student.grade}</span>
          </dd>

          <dt>下車站點</dt>
          <dd>{student.stopName}</dd>

          <dt>目前時間</dt>
          <dd className="num">{currentTime}</dd>
        </dl>

        <div className="dropoff-modal__actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onConfirm} ref={confirmRef}>
            確認下車
          </button>
        </div>
      </div>
    </div>
  );
}
