import { useCallback, useEffect, useState } from 'react';
import { STEM_ORDER, downloadUrl, stemUrl } from '../api';
import type { JobInfo, StemName } from '../api';
import { StemEngine, defaultLanes, laneGain } from '../audio/engine';
import type { LaneState, LaneStates } from '../audio/engine';
import { StemLane } from './StemLane';
import { Transport } from './Transport';

interface Props {
  job: JobInfo;
  onReset: () => void;
}

export function StemPlayer({ job, onReset }: Props) {
  const [engine, setEngine] = useState<StemEngine | null>(null);
  const [loadMsg, setLoadMsg] = useState('Decoding stems… 0/4');
  const [error, setError] = useState<string | null>(null);
  const [lanes, setLanes] = useState<LaneStates>(defaultLanes);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: StemEngine | null = null;
    const urls = Object.fromEntries(STEM_ORDER.map((s) => [s, stemUrl(job.id, s)])) as Record<StemName, string>;
    StemEngine.load(urls, (done, total) => {
      if (!cancelled) setLoadMsg(`Decoding stems… ${done}/${total}`);
    })
      .then((eng) => {
        if (cancelled) {
          eng.dispose();
          return;
        }
        created = eng;
        setEngine(eng);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      created?.dispose();
      setEngine(null);
    };
  }, [job.id]);

  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    const loop = () => {
      if (engine.tick()) setPlaying(false);
      setTime(engine.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  useEffect(() => {
    engine?.setLanes(lanes);
  }, [engine, lanes]);

  const togglePlay = useCallback(async () => {
    if (!engine) return;
    if (engine.isPlaying) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play();
      setPlaying(true);
    }
  }, [engine]);

  // Space bar toggles playback, except while typing in or operating a form control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      void togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  const updateLane = (stem: StemName, patch: Partial<LaneState>) =>
    setLanes((prev) => ({ ...prev, [stem]: { ...prev[stem], ...patch } }));
  const stop = () => {
    engine?.stop();
    setPlaying(false);
    setTime(0);
  };
  const seek = (t: number) => {
    void engine?.seek(t);
  };

  const took = job.seconds_taken != null ? `separated in ${Math.round(job.seconds_taken)} s` : null;

  return (
    <div>
      <div className="player-header">
        <div>
          <h2 className="title">{job.source_name}</h2>
          <p className="hint">
            {job.quality === 'high' ? 'High quality' : 'Standard quality'} · {job.model}
            {took ? ` · ${took}` : ''}
            {job.cached ? ' · from cache' : ''}
          </p>
        </div>
        <button onClick={onReset}>Separate another song</button>
      </div>

      {error && <p className="error">{error}</p>}
      {!engine && !error && <p className="stage">{loadMsg}</p>}

      {engine && (
        <>
          <Transport
            playing={playing}
            time={time}
            duration={engine.duration}
            onToggle={() => void togglePlay()}
            onStop={stop}
          />
          {STEM_ORDER.map((stem) => (
            <StemLane
              key={stem}
              stem={stem}
              buffer={engine.getBuffer(stem)}
              duration={engine.duration}
              lane={lanes[stem]}
              audible={laneGain(lanes, stem) > 0}
              progress={engine.duration > 0 ? time / engine.duration : 0}
              downloadHref={stemUrl(job.id, stem)}
              onChange={(patch) => updateLane(stem, patch)}
              onSeek={seek}
            />
          ))}
          <div className="exports">
            <a className="button" href={downloadUrl(job.id, 'all.zip')} download>
              Download all stems (zip)
            </a>
            <a className="button" href={downloadUrl(job.id, 'instrumental.wav')} download>
              Save as instrumental
            </a>
            <a className="button" href={downloadUrl(job.id, 'acapella.wav')} download>
              Save as acapella
            </a>
          </div>
        </>
      )}
    </div>
  );
}
