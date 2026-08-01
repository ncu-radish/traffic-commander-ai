import './ModeSelect.css';

interface ModeSelectProps {
  onSelect: (mode: 'insurer' | 'user') => void;
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
        <button className="mode-select__card" onClick={() => onSelect('insurer')}>
          <span className="mode-select__card-label">保險業者</span>
          <span className="mode-select__card-desc">
            完整決策儀表板：即時路況圖表、SOP自動告警、AI建議書、對話式諮詢
          </span>
        </button>

        <button className="mode-select__card mode-select__card--user" onClick={() => onSelect('user')}>
          <span className="mode-select__card-label">使用者</span>
          <span className="mode-select__card-desc">
            簡化地圖視角：事件注入、模擬路線規劃，繞開封閉路段
          </span>
        </button>
      </div>
    </div>
  );
}
