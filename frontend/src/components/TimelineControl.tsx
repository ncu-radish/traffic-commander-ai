import './TimelineControl.css';

interface TimelineControlProps {
  timestamps: string[];
  currentTimestamp: string;
  isPlaying: boolean;
  onTimestampChange: (ts: string) => void;
  onPlayToggle: () => void;
  /**
   * Highest SOP level breached at each timestamp, keyed by timestamp.
   * Rendered as coloured ticks so an operator can see where in the
   * evening the incidents cluster before scrubbing there.
   */
  breaches?: Record<string, 'A' | 'B'>;
}

/** Roughly 8 labels regardless of sample count. */
const TARGET_LABELS = 8;

export default function TimelineControl({
  timestamps,
  currentTimestamp,
  isPlaying,
  onTimestampChange,
  onPlayToggle,
  breaches = {},
}: TimelineControlProps) {
  if (timestamps.length === 0) {
    return (
      <div className="timeline">
        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
          無可用時間軸資料
        </span>
      </div>
    );
  }

  const currentIndex = timestamps.indexOf(currentTimestamp);
  const lastIndex = timestamps.length - 1;
  const progress = lastIndex > 0 ? (Math.max(currentIndex, 0) / lastIndex) * 100 : 0;

  const labelStride = Math.max(1, Math.ceil(timestamps.length / TARGET_LABELS));
  const labels = timestamps.filter(
    (_, i) => i % labelStride === 0 || i === lastIndex
  );

  const [date, time] = currentTimestamp.split(' ');

  return (
    <div className="timeline">
      <button
        className="timeline__play"
        onClick={onPlayToggle}
        data-playing={isPlaying}
        aria-label={isPlaying ? '暫停時間軸' : '播放時間軸'}
        title={isPlaying ? '暫停' : '播放'}
      >
        {isPlaying ? '❙❙' : '▶'}
      </button>

      <div className="timeline__track-area">
        <div className="timeline__track">
          <div className="timeline__elapsed" style={{ width: `${progress}%` }} />

          <div className="timeline__ticks">
            {timestamps.map((ts, i) => {
              const level = breaches[ts];
              if (!level) return null;
              return (
                <span
                  key={ts}
                  className="timeline__tick"
                  data-level={level}
                  style={{ left: `${lastIndex > 0 ? (i / lastIndex) * 100 : 0}%` }}
                  title={`${ts} — ${level} 級`}
                />
              );
            })}
          </div>

          <input
            type="range"
            className="timeline__slider"
            min={0}
            max={lastIndex}
            value={currentIndex < 0 ? 0 : currentIndex}
            onChange={(e) => onTimestampChange(timestamps[Number(e.target.value)])}
            aria-label="時間軸位置"
          />

          <span className="timeline__handle" style={{ left: `${progress}%` }} />
        </div>

        <div className="timeline__labels">
          {labels.map((ts) => (
            <button
              key={ts}
              className="timeline__label"
              data-active={ts === currentTimestamp}
              onClick={() => onTimestampChange(ts)}
            >
              {ts.split(' ')[1]}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline__readout">
        <span className="num timeline__time">{time ?? '--:--'}</span>
        <span className="num timeline__date">{date}</span>
        <span className="num timeline__position">
          {currentIndex + 1}/{timestamps.length}
        </span>
      </div>
    </div>
  );
}
