import './TimelineControl.css';

interface TimelineControlProps {
  timestamps: string[];
  currentTimestamp: string;
  isPlaying: boolean;
  onTimestampChange: (ts: string) => void;
  onPlayToggle: () => void;
}

export default function TimelineControl({
  timestamps,
  currentTimestamp,
  isPlaying,
  onTimestampChange,
  onPlayToggle,
}: TimelineControlProps) {
  const currentIndex = timestamps.indexOf(currentTimestamp);
  const progress = timestamps.length > 1 ? (currentIndex / (timestamps.length - 1)) * 100 : 0;

  return (
    <div className="timeline-control glass-panel">
      <button
        className={`timeline-play-btn ${isPlaying ? 'playing' : ''}`}
        onClick={onPlayToggle}
        title={isPlaying ? '暫停' : '播放'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="timeline-track-wrapper">
        <div className="timeline-track">
          <div className="timeline-progress" style={{ width: `${progress}%` }} />
          <input
            type="range"
            min={0}
            max={timestamps.length - 1}
            value={currentIndex}
            onChange={(e) => onTimestampChange(timestamps[Number(e.target.value)])}
            className="timeline-slider"
          />
        </div>

        <div className="timeline-labels">
          {timestamps.filter((_, i) => i % Math.max(1, Math.floor(timestamps.length / 8)) === 0 || i === timestamps.length - 1).map((ts) => (
            <span
              key={ts}
              className={`timeline-label ${ts === currentTimestamp ? 'active' : ''}`}
              onClick={() => onTimestampChange(ts)}
            >
              {ts.split(' ')[1]}
            </span>
          ))}
        </div>
      </div>

      <div className="timeline-current">
        <span className="timeline-current-time">{currentTimestamp.split(' ')[1]}</span>
        <span className="timeline-current-date">{currentTimestamp.split(' ')[0]}</span>
      </div>
    </div>
  );
}
