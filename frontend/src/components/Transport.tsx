interface Props {
  playing: boolean;
  time: number;
  duration: number;
  onToggle: () => void;
  onStop: () => void;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Transport({ playing, time, duration, onToggle, onStop }: Props) {
  return (
    <div className="transport">
      <button className="primary" onClick={onToggle}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button onClick={onStop}>Stop</button>
      <span className="time">
        {formatTime(time)} / {formatTime(duration)}
      </span>
    </div>
  );
}
