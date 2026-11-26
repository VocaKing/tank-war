// Directional mouse resistance, independent of aim point, camera zoom and render FPS.
export const AIM_DRAG = Object.freeze({
  DRAG_MIN: 0.18, DRAG_MAX: 0.35,
  BREAK_PX: 190, FAST_BREAK_PX: 82, FAST_WINDOW_MS: 100,
  PRESSURE_DECAY_MS: 450, MAX_OFFSET_RAD: 0.045,
});
export class AimDrag {
  constructor() { this.reset(); }
  reset() { this.x = this.y = 0; this.last = null; this.raw = []; }
  decay(now) {
    if (this.last !== null) {
      const k = Math.exp(-Math.max(0, now - this.last) / AIM_DRAG.PRESSURE_DECAY_MS);
      this.x *= k; this.y *= k;
    }
    this.last = now;
    while (this.raw.length && now - this.raw[0][0] > AIM_DRAG.FAST_WINDOW_MS) this.raw.shift();
  }
  get pressure() { return Math.hypot(this.x, this.y); }
  get fraction() { return Math.min(1, this.pressure / AIM_DRAG.BREAK_PX); }
  factor() {
    const u = this.fraction, s = u * u * (3 - 2 * u);
    return AIM_DRAG.DRAG_MIN + (AIM_DRAG.DRAG_MAX - AIM_DRAG.DRAG_MIN) * s;
  }
  push(dx, dy, now) {
    this.decay(now); this.x += dx; this.y += dy; this.raw.push([now, dx, dy]);
    let x = 0, y = 0;
    for (const r of this.raw) { x += r[1]; y += r[2]; }
    const reason = Math.hypot(x, y) >= AIM_DRAG.FAST_BREAK_PX ? 'flick' : this.pressure >= AIM_DRAG.BREAK_PX ? 'drag' : null;
    return { reason, factor: this.factor() };
  }
}
