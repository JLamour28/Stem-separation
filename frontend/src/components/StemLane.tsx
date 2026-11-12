import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { STEM_COLOR, STEM_LABEL } from '../api';
import type { StemName } from '../api';
import { computePeaks, drawPeaks } from '../audio/peaks';
import type { LaneState } from '../audio/engine';

const COLUMNS = 1600;
const HEIGHT = 96;

interface Props {
  stem: StemName;
  buffer: AudioBuffer;
  duration: number;
  lane: LaneState;
  audible: boolean;
  progress: number;
  downloadHref: string;
  onChange: (patch: Partial<LaneState>) => void;
  onSeek: (time: number) => void;
}

export function StemLane({ stem, buffer, duration, lane, audible, progress, downloadHref, onChange, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(() => computePeaks(buffer, COLUMNS), [buffer]);

  useEffect(() => {
    if (canvasRef.current) drawPeaks(canvasRef.current, peaks, STEM_COLOR[stem]);
  }, [peaks, stem]);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(Math.max(0, frac), 1) * duration);
  };

  const style = { '--lane-color': STEM_COLOR[stem] } as CSSProperties;

  return (
    <div className={`lane ${audible ? '' : 'lane-inactive'}`} style={style}>
      <div className="lane-controls">
        <div className="lane-header">
          <span className="lane-name">{STEM_LABEL[stem]}</span>
          <div className="lane-buttons">
            <button
              className={lane.muted ? 'on' : ''}
              title="Mute"
              aria-pressed={lane.muted}
              onClick={() => onChange({ muted: !lane.muted })}
            >
              M
            </button>
            <button
              className={lane.solo ? 'on' : ''}
              title="Solo"
              aria-pressed={lane.solo}
              onClick={() => onChange({ solo: !lane.solo })}
            >
              S
            </button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={lane.volume}
          aria-label={`${STEM_LABEL[stem]} volume`}
          title={`Volume ${Math.round(lane.volume * 100)}%`}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
        />
        <a className="lane-download" href={downloadHref} download>
          Download {STEM_LABEL[stem]}
        </a>
      </div>
      <div className="lane-wave" onClick={handleClick}>
        <canvas ref={canvasRef} width={COLUMNS} height={HEIGHT} />
        <div className="playhead" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
