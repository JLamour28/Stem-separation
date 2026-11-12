import { useState } from 'react';
import type { JobInfo } from './api';
import { Upload } from './components/Upload';
import { Progress } from './components/Progress';
import { StemPlayer } from './components/StemPlayer';

type View = { kind: 'upload' } | { kind: 'progress'; jobId: string } | { kind: 'player'; job: JobInfo };

export function App() {
  const [view, setView] = useState<View>({ kind: 'upload' });

  return (
    <div className="app">
      <header>
        <h1>Stem Separator</h1>
        <p>Split any song into drums, bass, melody and vocals. Runs locally on your computer with Demucs.</p>
      </header>
      {view.kind === 'upload' && <Upload onSubmitted={(jobId) => setView({ kind: 'progress', jobId })} />}
      {view.kind === 'progress' && (
        <Progress
          jobId={view.jobId}
          onDone={(job) => setView({ kind: 'player', job })}
          onBack={() => setView({ kind: 'upload' })}
        />
      )}
      {view.kind === 'player' && <StemPlayer job={view.job} onReset={() => setView({ kind: 'upload' })} />}
    </div>
  );
}
