import './ModeSelect.css';

interface ModeSelectProps {
  onSelect: (mode: 'school' | 'parent') => void;
}

export default function ModeSelect({ onSelect }: ModeSelectProps) {
  return (
    <div className="mode-select">
      <div className="mode-select__intro">
        <img
          className="mode-select__logo"
          src="/favicon.svg"
          alt="牽牽標誌"
        />
        <span className="mode-select__eyebrow">智慧交通決策系統</span>
        <h1>牽牽</h1>
        <p>請選擇要進入的視角</p>
      </div>

      <div className="mode-select__cards">
        <button className="mode-select__card" onClick={() => onSelect('school')}>
          <span className="mode-select__card-label">校方</span>
          <span className="mode-select__card-desc">
            監控全區路況，掌握 SOP 分級警報、路線風險比較與 AI 策略諮詢
          </span>
        </button>

        <button className="mode-select__card mode-select__card--user" onClick={() => onSelect('parent')}>
          <span className="mode-select__card-label">家長</span>
          <span className="mode-select__card-desc">
            壅塞路段與時間軸、事故熱點、事件注入與路線規劃，以及系統建議的上下學路線
          </span>
        </button>
      </div>
    </div>
  );
}
