// v6 focus + aim assist ("soft lock").
//
// FOCUS: the spotted, alive enemy under the crosshair (camera-ray hit), or — if the ray misses every tank — the
//   spotted enemy whose bounding sphere passes within FOCUS_TOL_PX screen pixels of the crosshair. Unspotted tanks
//   (bush concealment, out of view range, no LOS) are never candidates: their models are hidden and skipped here.
//   The focused enemy gets the red silhouette outline (render/outline.js).
// LOCK: after the player has *manually* placed focus on an enemy (mouse moved within MANUAL_WINDOW s and focus held
//   for ACQUIRE_TIME s) the camera tracks that tank: each frame the view is re-aimed through an anchor point stored
//   in the target's local space (turret-local if it was on the turret, hull-local otherwise), so the weak spot the
//   player chose stays under the crosshair while both tanks move. Small mouse moves that stay on the tank re-anchor.
// DRAG: while locked, mouse input is scaled by drag(offPx) = DRAG_MIN … 1 (smoothstep over BREAK_PX) where offPx is
//   how far the crosshair has been pushed off the anchor (screen px). The lock breaks when offPx > BREAK_PX or the raw
//   mouse speed exceeds FAST_BREAK_PX within FAST_WINDOW_MS (a deliberate flick, applied at full sensitivity).
// After a manual break the same target cannot re-lock for RELOCK_COOLDOWN s unless the crosshair first leaves it
//   and the player re-aims onto it. The lock also ends if the target dies or is no longer spotted.
// E (gun lock) still works as before: it lays the GUN on the target's centre with lead. While it is active the
//   soft lock is suspended (no camera tracking/drag); the outline then shows the E-locked target.
import * as THREE from 'three';
import { clamp, DEG } from '../util.js';

export const AIM_ASSIST = {
  FOCUS_TOL_PX: 14,      // screen-space tolerance for focus when the ray just misses
  ACQUIRE_TIME: 0.18,    // s of continuous focus before the lock engages
  MANUAL_WINDOW: 1.5,    // the player must have moved the mouse within this many s (focus must be "manual")
  DRAG_MIN: 0.42,        // mouse sensitivity multiplier right at the anchor (≈ 35-50 %)
  BREAK_PX: 110,         // crosshair pushed this far (screen px) off the anchor → lock breaks
  FAST_BREAK_PX: 140,    // raw mouse travel (device px) within FAST_WINDOW_MS that breaks the lock instantly
  FAST_WINDOW_MS: 90,
  RELOCK_COOLDOWN: 1.2,  // s before the same target can be re-locked after a manual break
};

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class AimAssist {
  constructor(game, enabled = true) {
    this.g = game; this.enabled = enabled; this.target = null; this.part = 'hull'; this.local = new THREE.Vector3();
    this.off = { yaw: 0, pitch: 0 }; this.moved = false; this.lastMouse = -1e9; this.focus = null; this.focusT = 0;
    this.blocked = null; this.blockedUntil = 0; this.blockLeft = false; this.raw = []; this.lastBreak = null; this.stats = { locks: 0, breaks: 0 };
  }
  get locked() { return !!this.target; }
  setEnabled(v) { this.enabled = v; if (!v) this.release('off'); }
  pxPerRad() { const c = this.g.camera; return (innerHeight / 2) / Math.tan(c.fov * DEG / 2); }
  offPx() { return Math.hypot(this.off.yaw * Math.cos(this.g.cam.pitch), this.off.pitch) * this.pxPerRad(); }
  dragFactor() { return AIM_ASSIST.DRAG_MIN + (1 - AIM_ASSIST.DRAG_MIN) * smooth(0, AIM_ASSIST.BREAK_PX, this.offPx()); }
  // mouse look entry point: returns the [dyaw, dpitch] the camera should actually apply (0,0 while locked: the offset
  // is folded into the tracking instead)
  look(dx, dy, k) {
    const now = performance.now(); this.lastMouse = this.g.time; this.moved = true;
    if (!this.target) return [-dx * k, -dy * k];
    this.raw.push([now, Math.hypot(dx, dy)]); while (this.raw.length && now - this.raw[0][0] > AIM_ASSIST.FAST_WINDOW_MS) this.raw.shift();
    const travel = this.raw.reduce((a, r) => a + r[1], 0);
    if (travel > AIM_ASSIST.FAST_BREAK_PX) { this.breakLock('flick'); return [-dx * k, -dy * k]; }
    const f = this.dragFactor(); this.off.yaw -= dx * k * f; this.off.pitch -= dy * k * f; this.lastFactor = f;
    if (this.offPx() > AIM_ASSIST.BREAK_PX) this.breakLock('drag');
    return [0, 0];
  }
  anchorWorld(out = new THREE.Vector3()) {
    const m = this.target.model; out.copy(this.local); return (this.part === 'turret' ? m.turret : m.root).localToWorld(out);
  }
  setAnchor(t, worldP, part) {
    this.target = t; this.part = part === 'turret' && !t.turretGone ? 'turret' : 'hull';
    t.model.root.updateMatrixWorld(true); this.local.copy(worldP); (this.part === 'turret' ? t.model.turret : t.model.root).worldToLocal(this.local);
  }
  release(reason) { if (this.target) this.lastRelease = reason; this.target = null; this.off.yaw = this.off.pitch = 0; this.raw.length = 0; }
  breakLock(reason) {
    const t = this.target; if (!t) return;
    // keep the view exactly where the player pushed it
    this.blocked = t; this.blockedUntil = this.g.time + AIM_ASSIST.RELOCK_COOLDOWN; this.blockLeft = false;
    this.stats.breaks++; this.lastBreak = reason; this.release(reason); this.focusT = 0;
  }
  validTarget(t) { const g = this.g; return t && t.alive && t.team !== g.player.team && t.spotted[g.player.team] && t.model.root.visible; }
  // before the camera update: steer cam.yaw/pitch so the view passes through the anchor (+ the player's drag offset)
  preCamera() {
    const g = this.g; const p = g.player;
    if (this.target && (!this.enabled || !p.alive || g.ended || !this.validTarget(this.target))) this.release(this.target && !this.target.alive ? 'dead' : 'lost');
    if (!this.target || g.lock || g.debugAim || g.camOverride) return;
    const P = this.anchorWorld(_v); const c = g.cam; const lo = c.sniper ? -0.35 : -0.9, hi = c.sniper ? 0.45 : 0.35;
    // 2 fixed-point iterations of camPosFor (the chase camera position depends on the view direction)
    let yaw = c.yaw - this.off.yaw, pitch = c.pitch - this.off.pitch;
    for (let i = 0; i < 2; i++) {
      const pos = g.camPosFor(g.camDir(yaw + this.off.yaw, pitch + this.off.pitch), c.sniper); _d.copy(P).sub(pos); if (_d.lengthSq() < 1e-6) break; _d.normalize();
      yaw = Math.atan2(_d.x, _d.z); pitch = Math.asin(clamp(_d.y, -1, 1));
    }
    c.yaw = yaw + this.off.yaw; c.pitch = clamp(pitch + this.off.pitch, lo, hi);
  }
  // after computeAim: update focus, (re)anchor and acquisition
  postAim(dt) {
    const g = this.g; let f = null;
    if (g.player.alive && !g.debugAim) {
      if (g.lock && this.validTarget(g.lock)) f = g.lock;
      else if (this.validTarget(g.aimTank)) f = g.aimTank;
      else f = this.toleranceFocus();
    }
    if (this.target && !g.lock) f = this.target;
    if (f !== this.focus) { this.focusT = 0; if (this.blocked && f !== this.blocked) this.blockLeft = true; }
    this.focus = f; this.focusT += dt;
    if (g.lock && this.target) this.release('gunlock');
    if (!this.enabled || g.lock) { this.moved = false; return; }
    if (this.target) {
      // a small mouse move that keeps the crosshair on the tank picks a new weak spot
      if (this.moved && g.aimTank === this.target && g.aimHit) { this.setAnchor(this.target, g.aimPoint, g.aimHit.part); this.off.yaw = this.off.pitch = 0; }
    } else if (f && f !== g.lock && this.focusT >= AIM_ASSIST.ACQUIRE_TIME && g.time - this.lastMouse < AIM_ASSIST.MANUAL_WINDOW) {
      const blocked = f === this.blocked && g.time < this.blockedUntil && !this.blockLeft;
      if (!blocked) {
        if (g.aimTank === f && g.aimHit) this.setAnchor(f, g.aimPoint, g.aimHit.part);
        else this.setAnchor(f, f.model.root.localToWorld(new THREE.Vector3(0, f.spec.dims.hullH * 0.62, 0)), 'hull');
        this.off.yaw = this.off.pitch = 0; this.blocked = null; this.stats.locks++;
      }
    }
    this.moved = false;
  }
  toleranceFocus() {
    const g = this.g; const cam = g.camera; const o = cam.position; cam.getWorldDirection(_d); const ppr = this.pxPerRad(); let best = null, bestPx = AIM_ASSIST.FOCUS_TOL_PX;
    for (const t of g.tanks) {
      if (!this.validTarget(t)) continue; const d = t.spec.dims;
      _v.set(0, (d.hullH + d.turretH) * 0.5, 0); t.model.root.localToWorld(_v); _v.sub(o); const dist = _v.length(); if (dist < 1) continue;
      const cosA = clamp(_v.dot(_d) / dist, -1, 1); if (cosA <= 0) continue;
      const rad = Math.max(d.W, d.hullH + d.turretH) * 0.5; // conservative: the narrow dimension
      const px = (Math.acos(cosA) - Math.atan(rad / dist)) * ppr; if (px < bestPx) { bestPx = px; best = t; }
    }
    return best;
  }
  // the enemy that should carry the red outline (null = none)
  outlineTarget() { const t = this.focus; return this.validTarget(t) ? t : null; }
}
