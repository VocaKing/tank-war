// Instant camera soft-lock: the first visible red outline is the lock itself.
// A real camera ray hit is required; no dwell timer, manual-motion gate or through-wall tolerance.
// Small inputs can refine the local weak-spot anchor; an independent directional drag accumulator
// supplies resistance even when that anchor is updated. A deliberate flick or sustained pull breaks lock.
import * as THREE from 'three';
import { clamp, DEG } from '../util.js';
import { AimDrag, AIM_DRAG } from './aimDrag.js';

export const AIM_ASSIST = Object.freeze({
  ...AIM_DRAG, AUTO_ZOOM: 1.4, RELOCK_COOLDOWN: 0.30, OFFSET_RETURN_RATE: 14,
});
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
export class AimAssist {
  constructor(game, enabled = true) {
    this.g = game; this.enabled = enabled; this.target = null; this.part = 'hull'; this.local = new THREE.Vector3();
    this.off = { yaw: 0, pitch: 0 }; this.applied = { yaw: 0, pitch: 0 }; this.moved = false;
    this.focus = null; this.blocked = null; this.blockedUntil = 0; this.blockLeft = false;
    this.drag = new AimDrag(); this.lastBreak = null; this.stats = { locks: 0, breaks: 0 };
  }
  get locked() { return !!this.target; }
  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.release('off'); this.focus = null; this.blocked = null; }
  }
  pxPerRad() { return (innerHeight / 2) / Math.tan(this.g.camera.fov * DEG / 2); }
  offPx() { return Math.hypot(this.off.yaw * Math.cos(this.g.cam.pitch), this.off.pitch) * this.pxPerRad(); }
  dragFactor() { return this.target ? this.drag.factor() : 1; }
  breakProgress() { return this.target ? this.drag.fraction : 0; }
  look(dx, dy, k) {
    const normal = [-dx * k, -dy * k];
    if (!this.enabled || !this.target || this.g.lock || !this.validTarget(this.target)) return normal;
    this.moved = true;
    const { reason, factor } = this.drag.push(dx, dy, performance.now());
    if (reason) {
      // Transfer only offset not already applied by the previous camera update; the breaking event
      // itself uses full sensitivity, so it is neither swallowed nor counted twice.
      const result = [normal[0] + this.off.yaw - this.applied.yaw, normal[1] + this.off.pitch - this.applied.pitch];
      this.breakLock(reason); return result;
    }
    this.off.yaw -= dx * k * factor; this.off.pitch -= dy * k * factor;
    const mag = Math.hypot(this.off.yaw, this.off.pitch);
    if (mag > AIM_DRAG.MAX_OFFSET_RAD) {
      this.off.yaw *= AIM_DRAG.MAX_OFFSET_RAD / mag; this.off.pitch *= AIM_DRAG.MAX_OFFSET_RAD / mag;
    }
    return [0, 0];
  }
  anchorWorld(out = new THREE.Vector3()) {
    const m = this.target.model; out.copy(this.local); return (this.part === 'turret' ? m.turret : m.root).localToWorld(out);
  }
  setAnchor(t, worldP, part) {
    this.target = t; this.part = part === 'turret' && !t.turretGone ? 'turret' : 'hull';
    t.model.root.updateMatrixWorld(true); this.local.copy(worldP); (this.part === 'turret' ? t.model.turret : t.model.root).worldToLocal(this.local);
  }
  clearOffset() { this.off.yaw = this.off.pitch = this.applied.yaw = this.applied.pitch = 0; }
  release(reason) {
    if (this.target) this.lastRelease = reason;
    this.target = null; this.focus = null; this.clearOffset(); this.drag.reset(); this.moved = false;
  }
  breakLock(reason) {
    const t = this.target; if (!t) return;
    this.blocked = t; this.blockedUntil = this.g.time + AIM_ASSIST.RELOCK_COOLDOWN; this.blockLeft = false;
    this.stats.breaks++; this.lastBreak = reason; this.release(reason);
  }
  validTarget(t) {
    const g = this.g;
    return !!(t && t.alive && t.team !== g.player.team && t.spotted[g.player.team] && t.model.root.visible);
  }
  preCamera(dt = 0) {
    const g = this.g;
    if (this.target && (!this.enabled || !g.player.alive || g.ended || g.lock || g.debugAim || g.camOverride || !this.validTarget(this.target))) {
      this.release(g.lock ? 'gunlock' : 'lost');
    }
    if (!this.target) return;
    this.drag.decay(performance.now());
    if (!this.moved) {
      const k = Math.exp(-AIM_ASSIST.OFFSET_RETURN_RATE * dt);
      this.off.yaw *= k; this.off.pitch *= k;
    }
    const P = this.anchorWorld(_v), c = g.cam;
    const lo = c.sniper ? -0.35 : -0.9, hi = c.sniper ? 0.45 : 0.35;
    // Match the desired camera position rather than tracking a stale render transform.
    let yaw = c.yaw - this.applied.yaw, pitch = c.pitch - this.applied.pitch;
    for (let i = 0; i < 5; i++) {
      const pos = g.camPosFor(g.camDir(yaw + this.off.yaw, pitch + this.off.pitch), c.sniper);
      _d.copy(P).sub(pos); if (_d.lengthSq() < 1e-6) break; _d.normalize();
      yaw = Math.atan2(_d.x, _d.z); pitch = Math.asin(clamp(_d.y, -1, 1));
    }
    c.yaw = yaw + this.off.yaw; c.pitch = clamp(pitch + this.off.pitch, lo, hi);
    this.applied.yaw = this.off.yaw; this.applied.pitch = this.off.pitch;
  }
  postAim() {
    const g = this.g;
    if (!g.player.alive || g.ended || g.debugAim || g.camOverride) { this.release('inactive'); return false; }
    if (g.lock) {
      if (this.target) this.release('gunlock');
      this.focus = this.validTarget(g.lock) ? g.lock : null;
      return false;
    }
    if (!this.enabled) { if (this.target) this.release('off'); this.focus = null; return false; }
    const f = this.validTarget(g.aimTank) && g.aimHit ? g.aimTank : null;
    if (this.blocked && f !== this.blocked) this.blockLeft = true;
    if (this.target && !this.validTarget(this.target)) this.release('lost');
    if (this.target) {
      // Re-anchor on a chosen weak spot without clearing the independent drag pressure.
      if (this.moved && f === this.target) { this.setAnchor(f, g.aimPoint, g.aimHit.part); this.clearOffset(); }
      this.focus = this.target; this.moved = false; return false;
    }
    this.moved = false; this.focus = null;
    if (!f || (f === this.blocked && (!this.blockLeft || g.time < this.blockedUntil))) return false;
    this.setAnchor(f, g.aimPoint, g.aimHit.part); this.clearOffset(); this.drag.reset();
    this.focus = f; this.stats.locks++; this.blocked = null; return true;
  }
  outlineTarget() {
    const t = this.g.lock || (this.enabled ? this.target : null);
    return this.validTarget(t) ? t : null;
  }
}
