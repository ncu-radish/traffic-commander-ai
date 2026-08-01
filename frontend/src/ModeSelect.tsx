import './ModeSelect.css';

interface ModeSelectProps {
  onSelect: (mode: 'school' | 'parent') => void;
}

export default function ModeSelect({ onSelect }: ModeSelectProps) {
  return (
    <div className="mode-select">
      <div className="mode-select__intro">
        <span className="mode-select__eyebrow">Traffic Commander AI</span>
        <h1>信義計畫區 交通決策系統</h1>
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
          <span className="mode-select__card-label">家長方</span>
          <span className="mode-select__card-desc">
            查看沿線壅塞與事故熱點，以及系統建議的上下學路線
          </span>
        </button>
      </div>
    </div>
  );
}
