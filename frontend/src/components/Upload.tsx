import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { createJob } from '../api';
import type { Quality } from '../api';

const ACCEPT = '.mp3,.wav,.flac,.ogg,.m4a,.aac,.aiff,.aif';

interface Props {
  onSubmitted: (jobId: string) => void;
}

export function Upload({ onSubmitted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<Quality>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (f) {
      setFile(f);
      setError(null);
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  };
  const onChange = (e: ChangeEvent<HTMLInputElement>) => pick(e.target.files?.[0]);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await createJob(file, quality);
      onSubmitted(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {file ? (
          <div className="file">
            {file.name} <span className="muted">({(file.size / 1048576).toFixed(1)} MB)</span>
          </div>
        ) : (
          <div>
            Drop a song here or click to choose a file
            <br />
            <small>MP3, WAV, FLAC, OGG, M4A</small>
          </div>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={onChange} />
      </div>
      <div className="row">
        <label>
          Quality{' '}
          <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} disabled={busy}>
            <option value="standard">Standard: htdemucs (recommended)</option>
            <option value="high">High: htdemucs_ft (about 4x slower)</option>
          </select>
        </label>
        <button className="primary" disabled={!file || busy} onClick={submit}>
          {busy ? 'Uploading…' : 'Separate'}
        </button>
      </div>
      <p className="hint">
        Everything runs on this computer. The first run downloads the model once (about 80 MB for Standard, 320 MB
        for High).
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
