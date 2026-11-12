/** Max absolute amplitude per column, taken across channels, for a waveform canvas. */
export function computePeaks(buffer: AudioBuffer, columns: number): Float32Array {
  const peaks = new Float32Array(columns);
  const length = buffer.length;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let c = 0; c < columns; c++) {
      const start = Math.floor((c * length) / columns);
      const end = Math.min(length, Math.floor(((c + 1) * length) / columns));
      let max = 0;
      for (let i = start; i < end; i++) {
        const v = data[i] < 0 ? -data[i] : data[i];
        if (v > max) max = v;
      }
      if (max > peaks[c]) peaks[c] = max;
    }
  }
  return peaks;
}

export function drawPeaks(canvas: HTMLCanvasElement, peaks: Float32Array, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  const mid = H / 2;
  const colW = W / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(1, Math.min(1, peaks[i]) * (H - 4));
    ctx.fillRect(i * colW, mid - h / 2, Math.max(1, colW), h);
  }
}
