import * as THREE from 'three';
import { clamp, DEG } from '../util.js';

export const AIM_ASSIST = {
  FOCUS_TOL_PX: 14,
  ACQUIRE_TOL_PX: 32,
  ACQUIRE_TIME: 0.06,
  MANUAL_WINDOW: 1.5,
  EDGE_DRAG: 0.62,
  BREAK_PX: 30,
  RELOCK_COOLDOWN: 0.12,
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
      // Coalesce device events so a high polling-rate mouse only probes once per frame.
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

  toggleManual() {
    if (this.manual) { this.release('manual'); return 'released'; }
    const candidate = this.resolveAimCandidate();
    if (candidate) this.setAnchor(candidate.tank, candidate.point, candidate.part);
    if (!this.validTarget(this.target)) return null;
    this.manual = true;
    return 'locked';
  }

  // Resolve a target from the exact camera ray first. If the reticle narrowly
  // misses the model silhouette, use a screen-space vehicle envelope and cast
  // one confirmation ray through that vehicle's centre. This avoids the old
  // all-or-nothing dependency on a single triangle intersection.
  screenCandidate() {
    const g = this.g, cam = g.camera, ppr = this.pxPerRad();
    cam.getWorldDirection(_direction);
    let best = null, sticky = null;
    for (const tank of g.tanks) {
      if (!this.validTarget(tank) || !this.manual && tank.vehicleSkill?.jammed) continue;
      const { W, hullH, turretH } = tank.spec.dims;
      _candidateCenter.set(0, (hullH + turretH) * 0.5, 0);
      tank.model.root.localToWorld(_candidateCenter);
      _candidateDelta.copy(_candidateCenter).sub(cam.position);
      const distance = _candidateDelta.length();
      if (distance < 1) continue;
      const cos = clamp(_candidateDelta.dot(_direction) / distance, -1, 1);
      if (cos <= 0) continue;
      const radius = Math.max(W, hullH + turretH) * 0.5;
      const px = (Math.acos(cos) - Math.atan(radius / distance)) * ppr;
      if (px > AIM_ASSIST.ACQUIRE_TOL_PX) continue;
      const item = { tank, point: _candidateCenter.clone(), px };
      if (!best || px < best.px) best = item;
      if (tank === this.target || tank === this.candidate) sticky = item;
    }
    // Retain the current candidate through small overlaps between silhouettes;
    // a clearly better or directly-hit target can still replace it immediately.
    if (sticky && best && sticky.tank !== best.tank && sticky.px <= best.px + 8) return sticky;
    return best;
  }

  resolveAimCandidate() {
    const g = this.g;
    if (g.aimTank && g.aimHit) {
      if (!this.validTarget(g.aimTank) || !this.manual && g.aimTank.vehicleSkill?.jammed) return null;
      return { tank: g.aimTank, point: g.cursorPoint, part: g.aimHit.part };
    }
    // Do not acquire a target through a friendly vehicle, wreck or other direct
    // ray hit. A nearby silhouette is only a fallback for a genuine near miss.
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
      return { tank: candidate.tank, point: ray.point, part: ray.hit?.part || 'hull' };
    }
    // A ray can pass through a small gap in detailed geometry. When the centre
    // line is otherwise unobstructed, anchor to the vehicle's geometric centre.
    return { tank: candidate.tank, point: candidate.point, part: 'hull' };
  }

  probe(yaw, pitch, dt) {
    const g = this.g;
    const dir = g.camDir(yaw, pitch);
    return g.traceAim(g.cameraPositionFor(dir, g.cam.sniper, dt), dir, true);
  }

  preCamera(dt) {
    const g = this.g, c = g.cam;
    const turn = this.pending.x, tilt = this.pending.y;
    this.pending.set(0, 0);
    this.lastFactor = 1;
    if (this.target && (!g.player.alive || g.ended || !this.validTarget(this.target) || !this.manual && this.target.vehicleSkill?.jammed)) this.release('lost');
    if (g.debugAim || g.camOverride) return;
    if (this.target) g.alignCamTo(this.anchorWorld(_point), dt, this.offset.x, this.offset.y);
    if (!turn && !tilt) return;

    const yaw = c.yaw + turn, pitch = g.limitCameraPitch(c.pitch + tilt);
    if (yaw === c.yaw && pitch === c.pitch) return;
    this.recordLook();
    if (this.target && this.resistExit(yaw, pitch, dt)) return;
    c.yaw = yaw;
    c.pitch = pitch;
  }

  resistExit(yaw, pitch, dt) {
    const c = this.g.cam;
    // Let the normal aim pass re-anchor or switch after applying the full movement.
    const probed=this.probe(yaw,pitch,dt)?.tank;
    if (this.validTarget(probed) && (this.manual || !probed.vehicleSkill?.jammed)) return false;

    let edgeYaw = c.yaw - this.offset.x, edgePitch = c.pitch - this.offset.y;
    const start = this.probe(c.yaw, c.pitch, dt);
    const onTarget = start?.tank === this.target;
    if (onTarget) {
      // Keep the entire part of the movement that is still on the target.
      let lo = 0, hi = 1, edge = start;
      for (let i = 0; i < 4; i++) {
        const mid = (lo + hi) / 2;
        const hit = this.probe(THREE.MathUtils.lerp(c.yaw, yaw, mid), THREE.MathUtils.lerp(c.pitch, pitch, mid), dt);
        if (hit?.tank === this.target) { lo = mid; edge = hit; }
        else hi = mid;
      }
      edgeYaw = THREE.MathUtils.lerp(c.yaw, yaw, lo);
      edgePitch = THREE.MathUtils.lerp(c.pitch, pitch, lo);
      this.setAnchor(this.target, edge.point, edge.hit.part);
    }

    const towardEdge = !onTarget &&
      Math.hypot((yaw - edgeYaw) * Math.cos(pitch), pitch - edgePitch) <=
      Math.hypot(this.offset.x * Math.cos(c.pitch), this.offset.y);
    this.lastFactor = towardEdge ? 1 : AIM_ASSIST.EDGE_DRAG;
    const fromYaw = onTarget ? edgeYaw : c.yaw;
    const fromPitch = onTarget ? edgePitch : c.pitch;
    const nextYaw = THREE.MathUtils.lerp(fromYaw, yaw, this.lastFactor);
    const nextPitch = THREE.MathUtils.lerp(fromPitch, pitch, this.lastFactor);
    this.offset.set(nextYaw - edgeYaw, nextPitch - edgePitch);
    if (this.offPx() > AIM_ASSIST.BREAK_PX) {
      this.release('edge');
      this.recordLook();
      this.lastFactor = 1;
      return false;
    }
    c.yaw = nextYaw;
    c.pitch = nextPitch;
    return true;
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
      const handoff = this.moved && released?.handoff && (this.enabled || released.manual) && tank !== released.tank &&
        g.time - released.time < AIM_ASSIST.MANUAL_WINDOW;
      const canAcquire = this.enabled && this.candidateAimed && this.candidateTime >= AIM_ASSIST.ACQUIRE_TIME &&
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
      const { W, hullH, turretH } = tank.spec.dims;
      _point.set(0, (hullH + turretH) * 0.5, 0);
      tank.model.root.localToWorld(_point).sub(cam.position);
      const distance = _point.length();
      if (distance < 1) continue;
      const cos = clamp(_point.dot(_direction) / distance, -1, 1);
      if (cos <= 0) continue;
      const radius = Math.max(W, hullH + turretH) * 0.5;
      const px = (Math.acos(cos) - Math.atan(radius / distance)) * ppr;
      if (px < bestPx) { bestPx = px; best = tank; }
    }
    return best;
  }

  outlineTarget() { return this.validTarget(this.focus) ? this.focus : null; }
}
