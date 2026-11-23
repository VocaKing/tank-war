// Tank entity: vehicle state, gun laying, firing, and module & crew damage
import * as THREE from 'three';
import { createTankModel, updateRunningGear, burnModel } from '../models/tankModel.js';
import { DEG, clamp, lerp, approach, approachAngle, wrapAngle } from '../util.js';
import { armorZone, zoneLowerSideY } from './tankData.js';
import { trackCenterOffset } from './vehicleDimensions.js';
import { Abilities } from './abilities.js';
import { Equipment } from './items.js';
import { advanceDispersion, impactDrop, incidence } from './combatMath.js';

import { GRAVITY } from './physics.js';

export { GRAVITY };
let NEXT_ID = 1;
const TRACK_REPAIR_TIME = 9;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function ballisticAngle(v, R, dy) {
  const g = GRAVITY; const v2 = v * v; const disc = v2 * v2 - g * (g * R * R + 2 * dy * v2);
  if (disc < 0 || R < 0.01) return Math.atan2(dy, Math.max(R, 0.01)) + 0.0;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * R));
}

export class Tank {
  constructor(game, spec, team, name, isPlayer = false, loadout = null, items = null) {
    this.id = NEXT_ID++; this.game = game; this.spec = spec; this.team = team; this.name = name; this.isPlayer = isPlayer;
    this.abilities = new Abilities(this);
    this.abilities.resetForBattle();
    if (this.abilities.magazine) this.reloadLeft = 0;
    this.model = createTankModel(spec); game.scene.add(this.model.root);
    this.pos = new THREE.Vector3(); this.heading = 0; this.speed = 0; this.turnRate = 0; this.vel = new THREE.Vector3();
    this.airborne = false; this.afloat = false; this.landingSpeed = 0;
    this.quat = new THREE.Quaternion(); this.pitch = 0; this.roll = 0;
    this.hp = spec.hp; this.maxHp = spec.hp; this.alive = true;
    this.turretYaw = 0; this.gunPitch = 0; this.dispersionProgress = 0; this.yawRate = 0; this.recoil = 0;
    this.reloadLeft = 1.5; this.shellIdx = 0; this.ammo = (loadout || spec.defaultLoadout).slice(); if (!this.ammo[0]) this.shellIdx = Math.max(0, this.ammo.findIndex((n) => n > 0));
    this.modules = { engine: 1, tracks: 1, gun: 1, turret: 1 };
    this.secondaryRounds = spec.secondary?.rounds ?? 0;
    this.secondaryReloadLeft = 0;
    this.trackRepairs = [0, 0]; this.burning = 0;
    this.crew = spec.crew.map((role) => ({ role, alive: true }));
    this.input = { throttle: 0, steer: 0, brake: false, driveHeld: false, aim: new THREE.Vector3() };
    this.hullAiming = false;
    this.lastFired = -100; this.inBush = null; this.visibleUntil = [0, 0]; this.spotted = [false, false]; this.lastSeenPos = [null, null];
    this.stats = { damage: 0, kills: 0, shots: 0, hits: 0, pens: 0, received: 0 };
    this.lastAttacker = null; this.lastDamagedAt = -100; this.inWater = false; this.groundY = 0; this.moved = 0;
    this.hullBox = { x: spec.dims.W / 2, y0: 0.3, y1: spec.dims.hullH, z: spec.dims.L / 2 };
    const d = spec.dims; const tc = d.turretBoxZ || 0;
    this.turBox = { x: d.turretW / 2, y0: 0, y1: d.turretH, z0: tc - d.turretL / 2, z1: tc + d.turretL / 2 };
    this.inv = new THREE.Matrix4(); this.equip = new Equipment(this, items);
  }
  get shell() { return this.abilities.usingSecondary ? this.spec.secondary.shell : this.spec.shells[this.shellIdx]; }
  get fireReloadLeft() { return this.abilities.usingSecondary ? this.secondaryReloadLeft : this.reloadLeft; }
  get gunMount() { return this.abilities.usingSecondary ? this.model.secondaryGun : this.model.gun; }
  get muzzleNode() { return this.abilities.usingSecondary ? this.model.secondaryMuzzle : this.model.muzzle; }
  get previewShell() {
    const sh = this.shell;
    return this.abilities?.overpenLeft > 0 ? { ...sh, pen: Math.round(sh.pen * (this.abilities.overpen.mult || 1.35)) } : sh;
  }
  crewAlive(role) { const c = this.crew.find((m) => m.role === role); return c ? c.alive : true; }
  get viewRange() { return this.spec.viewRange * (this.crewAlive('Commander') ? 1 : 0.8) * (this.equip.active('optics') ? 1.1 : 1); }
  reloadTime() { const s = this.spec; let r = s.reload; if (!s.autoloader && !this.crewAlive('Loader')) r *= 1.4; if (this.modules.gun < 1) r *= 1.3; if (this.equip.active('reload')) r *= 0.7; return r; }
  aimTime() { let a = this.spec.aimTime; if (!this.crewAlive('Gunner')) a *= 1.5; return a; }
  // Balance values are cone radii in metres at 100 m.
  dispersion() {
    const radius = lerp(this.spec.dispersion, this.spec.maxDispersion, this.dispersionProgress);
    return Math.atan(radius / 100);
  }
  updateDispersion(dt) {
    if (this.spec.dispersion === this.spec.maxDispersion) {
      this.dispersionProgress = 0;
      return;
    }
    // The active stabilizer slows widening while keeping the configured maximum reachable.
    const stabilization = this.speed !== 0 && this.abilities.isStabilized ? 2 : 1;
    this.dispersionProgress = advanceDispersion(this.dispersionProgress, this.speed, dt, this.aimTime() * stabilization);
  }
  placeAt(x, z, heading, speed = 0) {
    const W = this.game.world, d = this.spec.dims;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    // Fit the spawn pose once. All motion after placement comes from the rigid body.
    const length = d.L * 0.42, width = trackCenterOffset(d);
    const front = W.groundHeight(x + fx * length, z + fz * length);
    const rear = W.groundHeight(x - fx * length, z - fz * length);
    const right = W.groundHeight(x + fz * width, z - fx * width);
    const left = W.groundHeight(x - fz * width, z + fx * width);
    this.groundY = W.groundHeight(x, z);
    this.pitch = -Math.atan2(front - rear, length * 2);
    this.roll = Math.atan2(right - left, width * 2);
    this.heading = heading;
    this.pos.set(x, Math.max(this.groundY, (front + rear) / 2, (right + left) / 2), z);
    this.quat.setFromEuler(_e.set(this.pitch, heading, this.roll, 'YXZ'));
    this.turretYaw = 0;
    this.hullAiming = false;
    this.turnRate = 0;
    this.afloat = false;
    this.airborne = false;
    this.landingSpeed = 0;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.game.physics?.place(this, speed);
    this.syncModel();
  }

  update(dt, time) {
    if (!this.alive) return;
    this.equip.update(dt);
    if (Math.abs(this.speed) > 0.5 || this.lastMoving === undefined) this.lastMoving = time;
    if (this.trackRepairs[0] > 0 || this.trackRepairs[1] > 0) {
      const previous = this.modules.tracks;
      this.trackRepairs[0] = Math.max(0, this.trackRepairs[0] - dt);
      this.trackRepairs[1] = Math.max(0, this.trackRepairs[1] - dt);
      this.updateTrackCondition();
      if (this.isPlayer && this.modules.tracks > previous) {
        this.game.hud.message(this.modules.tracks === 1 ? 'Tracks repaired' : 'One track repaired', '#9fd39f');
      }
    }
    if (this.burning > 0) {
      this.burning -= dt;
      this.damage(this.maxHp * 0.012 * dt, this.lastAttacker, 'fire');
      if (!this.alive) return;
    }
    if (this.reloadLeft > 0) this.reloadLeft = Math.max(0, this.reloadLeft - dt);
    if (this.secondaryReloadLeft > 0) this.secondaryReloadLeft = Math.max(0, this.secondaryReloadLeft - dt);
    if (this.model.moveBlade) {
      this.model.moveBlade(this.abilities.dozerActive, dt);
    } else if (this.model.blade) {
      this.model.blade.position.y = approach(this.model.blade.position.y, this.abilities.dozerActive ? 0.48 : 1.22, dt * 2.5);
      this.model.blade.rotation.x = approach(this.model.blade.rotation.x, this.abilities.dozerActive ? 0.13 : -0.35, dt * 1.5);
    }
    if (this.model.trim) this.model.trim.rotation.x = approach(this.model.trim.rotation.x, this.afloat ? -0.45 : 0.45, dt * 2);
    this.abilities.update(dt);
    this.recoil = Math.max(0, this.recoil - dt * 1.2);
  }

  updateAfterMotion(dt) {
    if (this.alive) {
      this.abilities.updateDozer(dt);
      const half = trackCenterOffset(this.spec.dims);
      updateRunningGear(this.model,
        this.trackRepairs[0] > 0 ? 0 : (this.speed + this.turnRate * half) * dt,
        this.trackRepairs[1] > 0 ? 0 : (this.speed - this.turnRate * half) * dt);
      this.moved += Math.abs(this.speed) * dt;
      this.updateDispersion(dt);
      this.updateTurret(dt);
    }
    this.syncModel();
  }
  fixedGunHeadingError() {
    const aim = this.input.aim;
    const dx = aim.x - this.pos.x, dz = aim.z - this.pos.z;
    const range = Math.hypot(dx, dz);
    if (!Number.isFinite(range + aim.y) || range < 0.1) return 0;
    const { turret, gun } = this.model;
    const mountX = turret.position.x + gun.position.x;
    const tilt = this.pitch;
    // A fixed gun can elevate in the hull's forward plane. Align that
    // plane with the sight, accounting for the mount offset and side slope.
    const sinRoll = Math.sin(this.roll);
    const rightX = Math.cos(this.roll), rightZ = sinRoll * Math.sin(tilt);
    const rightY = sinRoll * Math.cos(tilt);
    const dy = aim.y - this.pos.y;
    const drop = rightY === 0 ? 0 : impactDrop(range * range, dy - turret.position.y - gun.position.y, this.shell.velocity, GRAVITY);
    const lateral = (mountX - (dy + drop) * rightY) / (range * Math.hypot(rightX, rightZ));
    if (Math.abs(lateral) >= 1) return 0;
    const heading = Math.atan2(dx, dz) + Math.atan2(rightZ, rightX) - Math.asin(lateral);
    return wrapAngle(heading - this.heading);
  }
  updateTurret(dt) {
    const s = this.spec, m = this.model;
    const pose = this.quat;
    const aim = _v.copy(this.input.aim).sub(this.pos).applyQuaternion(_q.copy(pose).invert()).sub(m.turret.position);
    if (s.fixedGun) this.turretYaw = 0;
    if (!Number.isFinite(aim.x + aim.y + aim.z)) return;
    // Solve around the turret axis. The trunnion moves as the turret turns,
    // so aiming from its current position can oscillate at point-blank range.
    const range = Math.hypot(aim.x, aim.z);
    const mount = this.gunMount.position;
    const yaw = range > 1e-4
      ? Math.atan2(aim.x, aim.z) - Math.asin(clamp(mount.x / range, -1, 1))
      : this.turretYaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const rise = aim.y - mount.y;
    const forward = aim.x * sin + aim.z * cos - mount.z;
    // Converge upwards no closer than the muzzle. Nearby surfaces above the
    // gun pivot would otherwise demand steep angles for tiny height changes.
    const aimRange = Math.max(forward, rise > 0 ? this.muzzleNode.position.z : 0.01);
    _v2.set(sin * aimRange, rise, cos * aimRange).applyQuaternion(pose);
    const { x: dx, y: dy, z: dz } = _v2;
    const horizontal = Math.hypot(dx, dz);
    const th = ballisticAngle(this.shell.velocity, horizontal, dy);
    _v2.set(dx / (horizontal || 1) * Math.cos(th), Math.sin(th), dz / (horizontal || 1) * Math.cos(th));
    _q.copy(pose).invert(); _v2.applyQuaternion(_q);
    const yawT = Math.atan2(_v2.x, _v2.z), pitchT = Math.asin(clamp(_v2.y, -1, 1));
    const prev = this.turretYaw;
    if (!s.fixedGun) {
      const rate = s.turretTraverse * DEG * (this.modules.turret < 1 ? 0.5 : 1) * (this.crewAlive('Gunner') ? 1 : 0.7);
      this.turretYaw = wrapAngle(approachAngle(prev, yawT, rate * dt));
    }
    this.yawRate = Math.abs(wrapAngle(this.turretYaw - prev)) / Math.max(dt, 1e-4);
    const minPitch=this.model.gunPitchFloor(this.turretYaw,-s.gunDepression*DEG,s.gunElevation*DEG);
    const desiredPitch=clamp(pitchT,minPitch,s.gunElevation*DEG);
    this.gunPitch=clamp(approach(this.gunPitch,desiredPitch,s.gunSpeed*DEG*dt),minPitch,s.gunElevation*DEG);
    this.aimError=Math.abs(wrapAngle(yawT-this.turretYaw))+Math.abs(desiredPitch-this.gunPitch);
  }
  syncModel() {
    const m = this.model; m.root.position.copy(this.pos); m.root.quaternion.copy(this.quat);
    m.turret.rotation.y = this.turretYaw; m.gun.rotation.x = -this.gunPitch; m.barrel.position.z = -this.recoil * m.maxRecoil;
    if (m.secondaryGun) m.secondaryGun.rotation.x = -this.gunPitch;
    m.root.updateMatrixWorld(true); this.inv.copy(m.root.matrixWorld).invert();
  }
  shotOrigin(muzzle) {
    const pivot = this.gunMount.getWorldPosition(new THREE.Vector3());
    const reach = pivot.distanceTo(muzzle);
    const structure = this.game.world?.structureHit?.(pivot.x, pivot.y, pivot.z, muzzle.x, muzzle.y, muzzle.z) ?? -1;
    let first = structure >= 0 ? structure : 1;
    for (const t of this.game.tanks) {
      if (t === this) continue;
      const d = t.spec.dims;
      const radius = reach + Math.hypot(d.W / 2, d.hullH + d.turretH, d.L / 2);
      if (t.pos.distanceToSquared(pivot) > radius * radius) continue;
      const hit = t.rayTest(pivot, muzzle);
      if (hit) first = Math.min(first, hit.t);
    }
    // The visual barrel can overlap an adjacent vehicle. Launch just before
    // its first plate so the normal hit test sees the entry surface.
    return first < 1 && reach > 0 ? pivot.lerp(muzzle, Math.max(0, first - 0.05 / reach)) : muzzle;
  }
  tryFire(time) {
    const secondary = this.abilities.usingSecondary;
    const rounds = secondary ? this.secondaryRounds : this.ammo[this.shellIdx];
    if (!this.alive || this.afloat || this.fireReloadLeft > 0 || rounds <= 0) return false;
    const g = this.game; const sh = this.shell;
    const muzzle = this.muzzleNode.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.gunMount.getWorldQuaternion(_q)).normalize();
    // dispersion: 2D gaussian (sigma = R/2.2, centre-weighted) clamped to the dispersion circle of radius R
    const disp = this.dispersion(); const up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const a = new THREE.Vector3().crossVectors(dir, up).normalize(), b = new THREE.Vector3().crossVectors(dir, a).normalize();
    let gx = g.rng.gauss() / 2.2, gy = g.rng.gauss() / 2.2; const gl = Math.hypot(gx, gy); if (gl > 1) { gx /= gl; gy /= gl; }
    // Sample a disk on the tangent plane: its boundary is exactly tan(disp).
    const radius = Math.tan(disp);
    dir.addScaledVector(a, gx * radius).addScaledVector(b, gy * radius).normalize();
    this.lastDeviation = Math.atan(Math.hypot(gx, gy) * radius);
    const vel = dir.clone().multiplyScalar(sh.velocity).add(this.vel);
    let fireShell = sh;
    if (this.abilities && this.abilities.overpenLeft > 0) {
      const mult = this.abilities.consumeOverpen();
      fireShell = { ...sh, pen: Math.round(sh.pen * mult) };
    }
    const origin = this.shotOrigin(muzzle);
    g.ballistics.spawn(this, fireShell, origin, vel);
    this.lastFired = time; this.stats.shots++;
    if (secondary) {
      this.secondaryRounds--;
      this.secondaryReloadLeft = this.spec.secondary.reload * (this.modules.gun < 1 ? 1.3 : 1);
    } else {
      this.ammo[this.shellIdx]--;
      this.reloadLeft = this.reloadTime();
      this.abilities.onFire();
      this.recoil = 1;
      if (this.ammo[this.shellIdx] <= 0) {
        const next = this.ammo.findIndex(count => count > 0);
        if (next >= 0) this.shellIdx = next;
      }
    }
    g.physics?.recoil(this, this.gunMount.getWorldPosition(_v), dir, sh.caliber);
    g.effects.muzzle(origin, dir, sh.caliber); g.audio.gun(origin, sh.caliber, this.isPlayer);
    return true;
  }
  tryAbility() { return this.abilities ? this.abilities.tryActivate() : false; }
  selectShell(i) {
    this.abilities.usingSecondary = false;
    if (i === this.shellIdx || !this.spec.shells[i] || this.ammo[i] <= 0) return;
    this.shellIdx = i; this.reloadLeft = Math.max(this.reloadLeft, this.reloadTime() * (this.reloadLeft > 0 ? 1 : 0.85));
  }
  // ----- hit testing -----
  // segment (world) vs hull and turret boxes; returns {t, part, face, local, n}
  rayTest(a, b) {
    const la = _v.copy(a).applyMatrix4(this.inv), lb = _v2.copy(b).applyMatrix4(this.inv);
    let best = null;
    const hb = this.hullBox; const h = slab(la, lb, -hb.x, hb.x, hb.y0, hb.y1, -hb.z, hb.z);
    if (h) best = { t: h.t, part: 'hull', axis: h.axis, sign: h.sign };
    // turret local
    const tp = this.model.turret.position; const c = Math.cos(this.turretYaw), s = Math.sin(this.turretYaw);
    const ta = new THREE.Vector3(la.x - tp.x, la.y - tp.y, la.z - tp.z), tb = new THREE.Vector3(lb.x - tp.x, lb.y - tp.y, lb.z - tp.z);
    const rot = (p) => { const x = p.x * c - p.z * s, z = p.x * s + p.z * c; p.x = x; p.z = z; return p; }; rot(ta); rot(tb);
    const tbx = this.turBox; const t2 = this.turretGone ? null : slab(ta, tb, -tbx.x, tbx.x, tbx.y0, tbx.y1, tbx.z0, tbx.z1);
    if (t2 && (!best || t2.t < best.t)) best = { t: t2.t, part: 'turret', axis: t2.axis, sign: t2.sign };
    if (!best) return null;
    const A = best.part === 'hull' ? la : ta, B = best.part === 'hull' ? lb : tb;
    best.local = new THREE.Vector3().lerpVectors(A, B, best.t); best.ldir = new THREE.Vector3().subVectors(B, A).normalize();
    best.face = best.axis === 1 ? (best.sign > 0 ? 'top' : 'bottom') : best.axis === 2 ? (best.sign > 0 ? 'front' : 'rear') : 'side'; best.sideSign = best.axis === 0 ? best.sign : 0;
    return best;
  }
  // effective armour for a hit (from rayTest) and a shell; dist = shell travel
  armorAt(hit, shellSpec, typeInfo) {
    const A = this.spec.armor; const [arm, zone] = armorZone(this.spec, hit.part, hit.face, hit.local); const tmm = arm[0], slope = arm[1] * DEG;
    let n;
    if (hit.face === 'front') n = new THREE.Vector3(0, Math.sin(slope), Math.cos(slope));
    else if (hit.face === 'rear') n = new THREE.Vector3(0, Math.sin(slope), -Math.cos(slope));
    else if (hit.face === 'side') n = new THREE.Vector3(hit.sideSign * Math.cos(slope), Math.sin(slope), 0);
    else n = new THREE.Vector3(0, hit.face === 'top' ? 1 : -1, 0);
    // A ray's angle to the plate normal includes both armour slope and tank orientation.
    // Use the geometric path length exactly, before ERA/skirts and track modifiers.
    const cosA = -hit.ldir.dot(n);
    const { angle, los } = incidence(cosA, tmm);
    if (cosA < 0) n.negate();
    let eff = los;
    const front = hit.face === 'front', hullSide = hit.part === 'hull' && hit.face === 'side';
    if (typeInfo.heat) { eff *= A.heatMult || 1; if (A.era && front) eff += A.era; if (A.skirt && hullSide) eff += A.skirt; }
    else if (!typeInfo.he && A.eraKE && front) eff += A.eraKE;
    let tracks = false;
    if (hullSide && hit.local.y < zoneLowerSideY(this.spec.dims)) { tracks = true; eff += 20; }
    const overmatch = shellSpec.caliber > tmm * 3;
    const ricochet = !typeInfo.he && angle > typeInfo.ricochet && !overmatch;
    // world normal (for ricochet reflection)
    const nw = n.clone(); if (hit.part === 'turret') nw.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.turretYaw); nw.applyQuaternion(this.quat);
    return { eff, los, angle, ricochet, tracks, nominal: tmm, zone, normalW: nw };
  }
  // ----- damage -----
  damage(amount, attacker, cause) {
    if (!this.alive || amount <= 0) return;
    amount = Math.min(amount, this.hp); this.hp -= amount; this.stats.received += amount; this.lastDamagedAt = this.game.time;
    if (attacker && attacker !== this && attacker.team !== this.team) { attacker.stats.damage += amount; this.lastAttacker = attacker; }
    if (this.hp <= 0.5) this.destroy(attacker, cause);
  }
  destroy(attacker, cause = 'destroyed') {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.burning = 0;
    const g = this.game; burnModel(this.model);
    const p = this.pos.clone(); p.y += this.spec.dims.hullH;
    g.effects.explosion(p, true); g.audio.impact(p, 'explosion');
    g.effects.addBurner(this.model.root, new THREE.Vector3(0, this.spec.dims.hullH + 0.3, -this.spec.dims.L * 0.25), 45, 1);
    if (cause === 'ammo' && !this.spec.casemate) {
      // turret blown off
      const t = this.model.turret; const wp = t.getWorldPosition(new THREE.Vector3()); const wq = t.getWorldQuaternion(new THREE.Quaternion());
      this.turretGone = true; g.scene.attach(t); t.position.copy(wp); t.quaternion.copy(wq);
      g.flying.push({ obj: t, v: new THREE.Vector3((Math.random() - 0.5) * 6, 14 + Math.random() * 8, (Math.random() - 0.5) * 6), w: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4), t: 0 });
    }
    if (attacker && attacker !== this && attacker.team !== this.team) attacker.stats.kills++;
    g.onKill(attacker, this, cause);
  }
  // apply a resolved hit (penetration or HE blast) with module & crew effects
  applyPenetration(hit, shellSpec, attacker, dmg, trackHit = false) {
    const g = this.game; const r = g.rng; const msgs = [];
    const L = this.spec.dims.L; const lz = hit.local.z;
    if (hit.part === 'hull') {
      if ((this.spec.engineZone === 'rear' && (lz < -L * 0.22 || hit.face === 'rear')) || (this.spec.engineZone === 'front' && (lz > L * 0.22 || hit.face === 'front'))) { if (this.modules.engine === 1) msgs.push('Engine damaged'); this.modules.engine = 0.5; if (r.next() < 0.22) { this.burning = 7; msgs.push('Fire!'); } }
      const ar = this.spec.ammoRack;
      if (!ar.turretBustle && lz > ar.zMin && lz < ar.zMax && hit.local.y < ar.yMax && r.next() < ar.chance * (shellSpec.type === 'HEAT' ? 1.3 : 1)) { this.damage(this.hp + 1, attacker, 'ammo'); return ['AMMO RACK DETONATED']; }
      if (trackHit || hit.local.y < this.spec.dims.clearance + 0.5) {
        msgs.push(this.breakTracks(hit.sideSign || Math.sign(hit.local.x)));
      }
    } else {
      if (hit.face === 'front' && r.next() < 0.35) { if (this.modules.gun === 1) msgs.push('Gun damaged'); this.modules.gun = 0.5; }
      if (!this.spec.casemate && (hit.face === 'side' || hit.face === 'rear') && r.next() < 0.3) { if (this.modules.turret === 1) msgs.push('Turret ring jammed'); this.modules.turret = 0.5; }
      if (this.spec.ammoRack.turretBustle && hit.face === 'rear') { this.ammo = this.ammo.map((n) => Math.floor(n * 0.4)); msgs.push('Bustle ammo cooked off – blow-out panels vented'); }
    }
    for (const c of this.crew) if (c.alive && r.next() < (shellSpec.type === 'APFSDS' ? 0.16 : shellSpec.type === 'HEAT' ? 0.22 : 0.2)) { c.alive = false; msgs.push(c.role + ' knocked out'); }
    if (this.crew.every((c) => !c.alive)) { this.damage(this.hp + 1, attacker, 'crew'); return msgs.concat(['Crew knocked out']); }
    this.damage(dmg, attacker, 'pen');
    return msgs;
  }
  get brokenTrackSide() {
    if (this.modules.tracks !== 0.5) return 0;
    return this.trackRepairs[0] > 0 ? -1 : 1;
  }
  updateTrackCondition() {
    this.modules.tracks = (Number(this.trackRepairs[0] === 0) + Number(this.trackRepairs[1] === 0)) / 2;
  }
  breakTracks(side = 0) {
    if (side <= 0) this.trackRepairs[0] = TRACK_REPAIR_TIME;
    if (side >= 0) this.trackRepairs[1] = TRACK_REPAIR_TIME;
    this.updateTrackCondition();
    if (side < 0) return 'Left track broken';
    if (side > 0) return 'Right track broken';
    return 'Both tracks broken';
  }
  repairTracks() {
    this.trackRepairs.fill(0);
    this.updateTrackCondition();
  }
}

// slab test: returns {t, axis, sign} where sign is outward direction of entered face
function slab(a, b, x0, x1, y0, y1, z0, z1) {
  let tmin = 0, tmax = 1, axis = -1, sign = 0;
  const A = [a.x, a.y, a.z], B = [b.x, b.y, b.z], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    const d = B[i] - A[i];
    if (Math.abs(d) < 1e-9) { if (A[i] < lo[i] || A[i] > hi[i]) return null; continue; }
    let t0 = (lo[i] - A[i]) / d, t1 = (hi[i] - A[i]) / d, s = -1; if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; s = 1; }
    if (t0 > tmin) { tmin = t0; axis = i; sign = s; } if (t1 < tmax) tmax = t1; if (tmin > tmax) return null;
  }
  if (axis < 0) return null; // started inside
  return { t: tmin, axis, sign };
}
