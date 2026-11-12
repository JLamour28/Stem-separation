export type StemName = 'drums' | 'bass' | 'melody' | 'vocals';
export type JobStatus = 'queued' | 'loading_model' | 'running' | 'done' | 'error' | 'cancelled';
export type Quality = 'standard' | 'high';

export const STEM_ORDER: StemName[] = ['drums', 'bass', 'melody', 'vocals'];
export const STEM_LABEL: Record<StemName, string> = {
  drums: 'Drums',
  bass: 'Bass',
  melody: 'Melody',
  vocals: 'Vocals',
};
// Lane colours follow DJ.Studio: drums green, bass yellow, melody red, vocals blue.
export const STEM_COLOR: Record<StemName, string> = {
  drums: '#2ecc71',
  bass: '#f1c40f',
  melody: '#e74c3c',
  vocals: '#3498db',
};

export interface JobInfo {
  id: string;
  status: JobStatus;
  progress: number;
  stage: string;
  error: string | null;
  source_name: string;
  quality: Quality;
  model: string;
  cached: boolean;
  stems: StemName[];
  duration: number | null;
  elapsed_sec: number | null;
  seconds_taken: number | null;
  queue_position?: number;
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body && body.detail) {
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    }
  } catch {
    // keep the status text
  }
  throw new Error(message);
}

export async function createJob(file: File, quality: Quality): Promise<{ job_id: string; cached: boolean }> {
  const form = new FormData();
  form.append('file', file);
  form.append('quality', quality);
  const res = await check(await fetch('/api/jobs', { method: 'POST', body: form }));
  return res.json();
}

export async function getJob(id: string): Promise<JobInfo> {
  const res = await check(await fetch(`/api/jobs/${id}`));
  return res.json();
}

export async function cancelJob(id: string): Promise<void> {
  await check(await fetch(`/api/jobs/${id}`, { method: 'DELETE' }));
}

export const stemUrl = (id: string, stem: StemName): string => `/api/jobs/${id}/stems/${stem}.wav`;

export type DownloadKind = 'all.zip' | 'instrumental.wav' | 'acapella.wav';
export const downloadUrl = (id: string, kind: DownloadKind): string => `/api/jobs/${id}/download/${kind}`;
