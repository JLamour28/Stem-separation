import { STEM_ORDER } from '../api';
import type { StemName } from '../api';

export interface LaneState {
  muted: boolean;
  solo: boolean;
  volume: number;
}
export type LaneStates = Record<StemName, LaneState>;

export function defaultLanes(): LaneStates {
  const lanes = {} as LaneStates;
  for (const stem of STEM_ORDER) lanes[stem] = { muted: false, solo: false, volume: 1 };
  return lanes;
}

/** Gain for one lane: silent when muted, or when another lane is soloed and this one is not. */
export function laneGain(lanes: LaneStates, stem: StemName): number {
  const anySolo = STEM_ORDER.some((s) => lanes[s].solo);
  const lane = lanes[stem];
  return lane.muted || (anySolo && !lane.solo) ? 0 : lane.volume;
}

/**
 * Plays the four stems sample-locked through one AudioContext.
 * Each stem: AudioBufferSourceNode -> GainNode (mute/solo/volume) -> master -> speakers.
 */
export class StemEngine {
  readonly ctx: AudioContext;
  readonly duration: number;
  private readonly master: GainNode;
  private readonly buffers: Record<StemName, AudioBuffer>;
  private readonly gains: Record<StemName, GainNode>;
  private sources: Partial<Record<StemName, AudioBufferSourceNode>> = {};
  private lanes: LaneStates = defaultLanes();
  private startedAt = 0;
  private offset = 0;
  private playing = false;

  private constructor(ctx: AudioContext, buffers: Record<StemName, AudioBuffer>) {
    this.ctx = ctx;
    this.buffers = buffers;
    this.duration = Math.max(...STEM_ORDER.map((s) => buffers[s].duration));
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.gains = {} as Record<StemName, GainNode>;
    for (const stem of STEM_ORDER) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.gains[stem] = g;
    }
  }

  static async load(
    urls: Record<StemName, string>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<StemEngine> {
    const ctx = new AudioContext();
    try {
      let done = 0;
      const total = STEM_ORDER.length;
      const entries = await Promise.all(
        STEM_ORDER.map(async (stem) => {
          const res = await fetch(urls[stem]);
          if (!res.ok) throw new Error(`Failed to load ${stem}: ${res.status} ${res.statusText}`);
          const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
          done += 1;
          onProgress?.(done, total);
          return [stem, buffer] as const;
        }),
      );
      const buffers = Object.fromEntries(entries) as Record<StemName, AudioBuffer>;
      return new StemEngine(ctx, buffers);
    } catch (err) {
      void ctx.close();
      throw err;
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    if (!this.playing) return this.offset;
    const t = this.offset + (this.ctx.currentTime - this.startedAt);
    return Math.min(Math.max(t, this.offset), this.duration);
  }

  getBuffer(stem: StemName): AudioBuffer {
    return this.buffers[stem];
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.offset >= this.duration) this.offset = 0;
    // Start every stem at the same context time and offset so they stay sample-aligned.
    const when = this.ctx.currentTime + 0.05;
    for (const stem of STEM_ORDER) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[stem];
      src.connect(this.gains[stem]);
      src.start(when, Math.min(this.offset, src.buffer.duration));
      this.sources[stem] = src;
    }
    this.startedAt = when;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.stopSources();
    this.playing = false;
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
  }

  async seek(time: number): Promise<void> {
    const wasPlaying = this.playing;
    this.stopSources();
    this.playing = false;
    this.offset = Math.min(Math.max(0, time), this.duration);
    if (wasPlaying) await this.play();
  }

  /** Call every animation frame. Returns true when playback reached the end and was stopped. */
  tick(): boolean {
    if (this.playing && this.currentTime >= this.duration) {
      this.stop();
      return true;
    }
    return false;
  }

  setLanes(lanes: LaneStates): void {
    this.lanes = lanes;
    for (const stem of STEM_ORDER) {
      this.gains[stem].gain.setTargetAtTime(laneGain(this.lanes, stem), this.ctx.currentTime, 0.01);
    }
  }

  private stopSources(): void {
    for (const stem of STEM_ORDER) {
      const src = this.sources[stem];
      if (!src) continue;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
      delete this.sources[stem];
    }
  }

  dispose(): void {
    this.stopSources();
    void this.ctx.close();
  }
}
