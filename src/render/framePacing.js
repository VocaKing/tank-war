// Bounded simulation steps and conservative dynamic resolution.
// Never change gameplay speed to hide a rendering bottleneck.
export function simulationSteps(seconds) {
  const dt = Math.max(0, Math.min(0.1, Number.isFinite(seconds) ? seconds : 0));
  if (!dt) return [];
  const count = Math.max(1, Math.ceil(dt * 30 - 1e-9));
  return Array(count).fill(dt / count);
}
export const smoothingAlpha = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
export class FramePacing {
  constructor(maxRatio, minRatio = 0.65) {
    this.max = maxRatio; this.min = Math.min(maxRatio, minRatio); this.ratio = maxRatio;
    this.resetWindow(); this.goodWindows = 0;
  }
  resetWindow() { this.elapsed = 0; this.frames = 0; this.slow = 0; }
  sample(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) { this.resetWindow(); this.goodWindows = 0; return null; }
    this.elapsed += dt; this.frames++; if (dt > 0.025) this.slow++;
    if (this.elapsed < 2) return null;
    const average = this.elapsed / this.frames, slow = this.slow / this.frames;
    this.resetWindow();
    const old = this.ratio;
    if (average > 0.022 && slow > 0.25) {
      this.goodWindows = 0;
      this.ratio = Math.max(this.min, Math.round((this.ratio - 0.15) * 100) / 100);
    } else if (average < 0.0185 && slow < 0.04) {
      if (++this.goodWindows >= 5) { this.ratio = Math.min(this.max, Math.round((this.ratio + 0.05) * 100) / 100); this.goodWindows = 0; }
    } else this.goodWindows = 0;
    return old === this.ratio ? null : this.ratio;
  }
}
