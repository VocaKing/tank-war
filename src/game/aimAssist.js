import * as THREE from 'three';
import { clamp, DEG } from '../util.js';

export const AIM_ASSIST = {
  FOCUS_TOL_PX: 14,
  ACQUIRE_TOL_PX: 22,
  RETAIN_TOL_PX: 40,
  TARGET_SWITCH_HYSTERESIS_PX: 10,
  ACQUIRE_TIME: 0.035,
  MANUAL_WINDOW: 1.5,
  EDGE_DRAG: 0.72,
  BREAK_PX: 44,
  RELOCK_COOLDOWN: 0.08,
};

const _point = new THREE.Vector3(), _direction = new THREE.Vector3();
const _candidateCenter = new THREE.Vector3(), _candidateDelta = new THREE.Vector3();

export class AimAssist {
  constructor(game, enabled = true) {
    this.g = game;
    this.enabled = enabled;
    this.target = null;
    this.manual = false;
    this.part = 'hull';
    this.local = new THREE.Vector3();
    this.offset = new THREE.Vector2();
    this.pending = new THREE.Vector2();
    this.moved = false;
    this.lastMouse = -Infinity;
    this.lastFactor = 1;
    this.focus = null;
    this.candidate = null;
    this.candidateTime = 0;
    this.candidateAimed = false;
    this.released = null;
    this.lastBreak = null;
    this.stats = { locks: 0, breaks: 0 };
  }

  get locked() { return !!this.target; }
  setEnabled(value) {
    this.enabled = value;
    if (!value && !this.manual) this.release('off');
  }
  pxPerRad() { return this.g.viewportHeight / (2 * Math.tan(this.g.camera.fov * DEG / 2)); }
  offPx() {
    return Math.hypot(this.offset.x * Math.cos(this.g.cam.pitch), this.offset.y) * this.pxPerRad();
  }
  dragFactor() { return this.lastFactor; }

  look(dx, dy, sensitivity) {
    const yaw = -dx * sensitivity, pitch = -dy * sensitivity;
    if (this.target && !this.g.camOverride && !this.g.debugAim) {
      // Coalesce high-polling-rate mouse events; target tracking is evaluated once per frame.
      this.pending.x += yaw;
      this.pending.y += pitch;
      return [0, 0];
    }
    if (yaw || this.g.limitCameraPitch(this.g.cam.pitch + pitch) !== this.g.cam.pitch) this.recordLook();
    return [yaw, pitch];
  }

  recordLook() {
    this.moved = true;
    this.lastMouse = this.g.time;
  }
  clearLook() {
    this.pending.set(0, 0);
    this.moved = false;
  }

  anchorWorld(out = new THREE.Vector3()) {
    const model = this.target.model;
    const anchor = this.part === 'turret' && !this.target.turretGone ? model.turret : model.body;
    return anchor.localToWorld(out.copy(this.local));
  }

  setAnchor(tank, point, part) {
    if (tank !== this.target) this.stats.locks++;
    this.target = tank;
    const model = tank.model;
    this.part = part === 'turret' && !tank.turretGone ? 'turret' : 'hull';
    const anchor = this.part === 'turret' ? model.turret : model.body;
    anchor.worldToLocal(this.local.copy(point));
    this.offset.set(0, 0);
    this.released = null;
  }

  release(reason) {
    if (this.target) {
      this.released = { tank: this.target, time: this.g.time, manual: this.manual, handoff: reason === 'edge' };
      this.lastBreak = reason;
      this.stats.breaks++;
    }
    this.target = null;
    this.manual = false;
    this.offset.set(0, 0);
    this.clearLook();
    this.candidate = null;
    this.candidateTime = 0;
    this.candidateAimed = false;
    this.lastMouse = -Infinity;
  }

  validTarget(tank) {
    return !!(tank?.alive && tank.team !== this.g.player.team && tank.spotted[this.g.player.team] && tank.model.root.visible);
  }

  targetVisible(dt) {
    if (!this.validTarget(this.target)) return false;
    const g = this.g, point = this.anchorWorld(_point), dir = g.camDir();
    const origin = dt === undefined ? g.camera.position : g.cameraPositionFor(dir, g.cam.sniper, dt);
    if (g.world?.losBlocked?.(origin.x, origin.y, origin.z, point.x, point.y, point.z)) return false;
    if (g.smokeBlocks?.(origin.x, origin.y, origin.z, point.x, point.y, point.z)) return false;
    return true;
  }

  toggleManual() {
    if (this.manual) { this.release('manual'); return 'released'; }
    const candidate = this.resolveAimCandidate();
    if (candidate) this.setAnchor(candidate.tank, candidate.point, candidate.part);
    if (!this.validTarget(this.target)) return null;
    this.manual = true;
    return 'locked';
  }

  // Screen-space target envelope. Acquisition and retention use the same geometry
  // but different tolerances, creating hysteresis and preventing target flicker.
  screenCandidateAt(yaw, pitch, dt, tolerancePx, onlyTank = null) {
    const g = this.g, dir = g.camDir(yaw, pitch);
    const origin = dt === undefined ? g.camera.position : g.cameraPositionFor(dir, g.cam.sniper, dt);
    const ppr = this.pxPerRad();
    let best = null, sticky = null;
    for (const tank of g.tanks) {
      if (onlyTank && tank !== onlyTank) continue;
      if (!this.validTarget(tank) || (!this.manual && tank.vehicleSkill?.jammed)) continue;
      const d = tank.spec.dims;
      _candidateCenter.set(0, (d.hullH + d.turretH) * 0.5, 0);
      tank.model.root.localToWorld(_candidateCenter);
      _candidateDelta.copy(_candidateCenter).sub(origin);
      const distance = _candidateDelta.length();
      if (distance < 1) continue;
      const cos = clamp(_candidateDelta.dot(dir) / distance, -1, 1);
      if (cos <= 0) continue;
      const radius = Math.hypot(d.L * 0.5, d.W * 0.5, (d.hullH + d.turretH) * 0.5);
      const gapPx = (Math.acos(cos) - Math.atan(radius / distance)) * ppr;
      if (gapPx > tolerancePx) continue;
      if (g.world?.losBlocked?.(origin.x, origin.y, origin.z,
        _candidateCenter.x, _candidateCenter.y, _candidateCenter.z)) continue;
      if (g.smokeBlocks?.(origin.x, origin.y, origin.z,
        _candidateCenter.x, _candidateCenter.y, _candidateCenter.z)) continue;
      const item = { tank, point: _candidateCenter.clone(), part: 'hull', gapPx: Math.max(0, gapPx) };
      if (!best || item.gapPx < best.gapPx) best = item;
      if (tank === this.target || tank === this.candidate) sticky = item;
    }
    if (sticky && best && sticky.tank !== best.tank &&
      sticky.gapPx <= best.gapPx + AIM_ASSIST.TARGET_SWITCH_HYSTERESIS_PX) return sticky;
    return best;
  }

  screenCandidate() {
    return this.screenCandidateAt(this.g.cam.yaw, this.g.cam.pitch, undefined, AIM_ASSIST.ACQUIRE_TOL_PX);
  }

  resolveAimCandidate() {
    const g = this.g;
    if (g.aimTank && g.aimHit) {
      if (!this.validTarget(g.aimTank) || (!this.manual && g.aimTank.vehicleSkill?.jammed)) return null;
      return { tank: g.aimTank, point: g.cursorPoint, part: g.aimHit.part, direct: true };
    }
    // A friendly tank or another direct hit blocks fallback acquisition.
    if (g.aimTank) return null;
    const candidate = this.screenCandidate();
    if (!candidate) return null;
    const origin = g.camera.position;
    const direction = candidate.point.clone().sub(origin);
    const distance = direction.length();
    if (distance < 1) return null;
    direction.multiplyScalar(1 / distance);
    const ray = g.traceAim(origin, direction, true);
    if (ray?.tank && ray.tank !== candidate.tank) return null;
    if (g.world?.losBlocked?.(origin.x, origin.y, origin.z,
      candidate.point.x, candidate.point.y, candidate.point.z)) return null;
    if (g.smokeBlocks?.(origin.x, origin.y, origin.z,
      candidate.point.x, candidate.point.y, candidate.point.z)) return null;
    if (ray?.tank === candidate.tank) {
      return { tank: candidate.tank, point: ray.point, part: ray.hit?.part || 'hull', direct: false };
    }
    return { tank: candidate.tank, point: candidate.point, part: 'hull', direct: false };
  }

  probe(yaw, pitch, dt) {
    const g = this.g, dir = g.camDir(yaw, pitch);
    return g.traceAim(g.cameraPositionFor(dir, g.cam.sniper, dt), dir, true);
  }

  preCamera(dt) {
    const g = this.g, c = g.cam;
    const turn = this.pending.x, tilt = this.pending.y;
    this.pending.set(0, 0);
    this.lastFactor = 1;
    if (this.target && (!g.player.alive || g.ended || !this.validTarget(this.target) ||
      (!this.manual && this.target.vehicleSkill?.jammed) || !this.targetVisible(dt))) this.release('lost');
    if (g.debugAim || g.camOverride) return;
    if (this.target) g.alignCamTo(this.anchorWorld(_point), dt, this.offset.x, this.offset.y);
    if (!turn && !tilt) return;

    const yaw = c.yaw + turn, pitch = g.limitCameraPitch(c.pitch + tilt);
    this.recordLook();
    if (this.target && this.resistExit(yaw, pitch, dt)) return;
    c.yaw = yaw;
    c.pitch = pitch;
  }

  // Blitz-like lock behavior: track the current vehicle while the reticle remains
  // on it, switch when the reticle reaches another vehicle, and release over empty
  // space. A small edge drag prevents jitter without doing repeated binary raycasts.
  resistExit(yaw, pitch, dt) {
    const g = this.g, c = g.cam;
    const hit = this.probe(yaw, pitch, dt);
    if (hit?.tank) {
      if (hit.tank === this.target && this.validTarget(hit.tank) &&
        (this.manual || !hit.tank.vehicleSkill?.jammed)) return false;
      this.release('edge');
      this.recordLook();
      return false;
    }

    const retained = this.screenCandidateAt(yaw, pitch, dt, AIM_ASSIST.RETAIN_TOL_PX, this.target);
    if (retained?.tank === this.target) {
      if (retained.gapPx <= AIM_ASSIST.ACQUIRE_TOL_PX) return false;
      this.lastFactor = AIM_ASSIST.EDGE_DRAG;
      const appliedYaw = turn * this.lastFactor;
      const appliedPitch = (pitch - c.pitch) * this.lastFactor;
      c.yaw += appliedYaw;
      c.pitch += appliedPitch;
      this.offset.x += appliedYaw;
      this.offset.y += appliedPitch;
      if (this.offPx() > AIM_ASSIST.BREAK_PX) {
        this.release('edge');
        this.recordLook();
        return false;
      }
      return true;
    }

    this.release('edge');
    this.recordLook();
    return false;
  }

  postAim(dt) {
    const g = this.g;
    if (!g.player.alive || g.ended || g.debugAim || g.camOverride) {
      this.focus = null;
      this.clearLook();
      return;
    }
    const resolved = this.resolveAimCandidate();
    const tank = resolved?.tank || null;
    if (tank !== this.candidate) {
      this.candidate = tank;
      this.candidateTime = 0;
      this.candidateAimed = false;
    }
    if (tank) {
      this.candidateAimed ||= this.moved;
      this.candidateTime += dt;
    } else {
      this.candidateTime = 0;
      this.candidateAimed = false;
    }
    if (tank && this.target && this.moved) {
      this.setAnchor(tank, resolved.point, resolved.part);
    } else if (tank && !this.target) {
      const released = this.released;
      const handoff = this.moved && released?.handoff && (this.enabled || released.manual) &&
        tank !== released.tank && g.time - released.time < AIM_ASSIST.MANUAL_WINDOW;
      const canAcquire = this.enabled && this.candidateAimed &&
        (resolved.direct || this.candidateTime >= AIM_ASSIST.ACQUIRE_TIME) &&
        g.time - this.lastMouse < AIM_ASSIST.MANUAL_WINDOW &&
        !(released?.tank === tank && g.time - released.time < AIM_ASSIST.RELOCK_COOLDOWN);
      if (handoff || canAcquire) {
        this.manual = !!(handoff && released.manual);
        this.setAnchor(tank, resolved.point, resolved.part);
      }
    }
    this.focus = this.target || tank || this.toleranceFocus();
    this.moved = false;
  }

  toleranceFocus() {
    const g = this.g, cam = g.camera, ppr = this.pxPerRad();
    cam.getWorldDirection(_direction);
    let best = null, bestPx = AIM_ASSIST.FOCUS_TOL_PX;
    for (const tank of g.tanks) {
      if (!this.validTarget(tank) || tank.vehicleSkill?.jammed) continue;
      const d = tank.spec.dims;
      _point.set(0, (d.hullH + d.turretH) * 0.5, 0);
      tank.model.root.localToWorld(_point).sub(cam.position);
      const distance = _point.length();
      if (distance < 1) continue;
      const cos = clamp(_point.dot(_direction) / distance, -1, 1);
      if (cos <= 0) continue;
      const radius = Math.hypot(d.L * 0.5, d.W * 0.5, (d.hullH + d.turretH) * 0.5);
      const gapPx = (Math.acos(cos) - Math.atan(radius / distance)) * ppr;
      if (gapPx < bestPx) { bestPx = gapPx; best = tank; }
    }
    return best;
  }

  outlineTarget() { return this.validTarget(this.focus) ? this.focus : null; }
}
