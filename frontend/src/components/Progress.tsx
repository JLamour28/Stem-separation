import { useEffect, useRef, useState } from 'react';
import { cancelJob, getJob } from '../api';
import type { JobInfo } from '../api';

interface Props {
  jobId: string;
  onDone: (job: JobInfo) => void;
  onBack: () => void;
}

function stageText(job: JobInfo): string {
  switch (job.status) {
    case 'queued':
      return job.queue_position ? `Waiting in queue (${job.queue_position} ahead)…` : 'Waiting in queue…';
    case 'loading_model':
      return 'Loading the separation model (downloaded on first use)…';
    case 'running':
      return `Separating… ${Math.round(job.progress * 100)}%`;
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return 'Failed';
  }
}

export function Progress({ jobId, onDone, onBack }: Props) {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const j = await getJob(jobId);
        if (!active) return;
        setJob(j);
        setError(null);
        if (j.status === 'done') {
          onDoneRef.current(j);
          return;
        }
        if (j.status === 'error' || j.status === 'cancelled') return;
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
      timer = window.setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId]);

  const active = !!job && (job.status === 'queued' || job.status === 'loading_model' || job.status === 'running');
  const indeterminate = !job || job.status === 'queued' || job.status === 'loading_model';
  const pct = job ? Math.round(job.progress * 100) : 0;

  const cancel = async () => {
    setCancelling(true);
    try {
      await cancelJob(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCancelling(false);
    }
  };

  return (
    <div className="card">
      <h2 className="title">{job?.source_name ?? 'Starting…'}</h2>
      <p className="stage">{job ? stageText(job) : 'Contacting server…'}</p>
      <div className={`progress-bar ${indeterminate ? 'indeterminate' : ''}`}>
        <div style={{ width: indeterminate ? '30%' : `${pct}%` }} />
      </div>
      {job?.elapsed_sec != null && <p className="hint">Elapsed: {Math.round(job.elapsed_sec)} s</p>}
      {job?.status === 'error' && <p className="error">{job.error}</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        {active && (
          <button onClick={() => void cancel()} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
        {job && !active && <button onClick={onBack}>Back</button>}
      </div>
    </div>
  );
}
