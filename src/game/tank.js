// Tank entity: drivetrain + terrain-following physics, turret/gun laying, firing, module & crew damage
import * as THREE from 'three';
import { createTankModel, updateRunningGear, burnModel } from '../models/tankModel.js';
import { DEG, clamp, approach, approachAngle, wrapAngle } from '../util.js';
import { armorZone, zoneLowerSideY } from './tankData.js';
import { Abilities } from './abilities.js';
import { Equipment } from './items.js';

export const GRAVITY = 9.81;
let NEXT_ID = 1;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function ballisticAngle(v, R, dy) {
  const g = GRAVITY; const v2 = v * v; const disc = v2 * v2 - g * (g * R * R + 2 * dy * v2);
  if (disc < 0 || R < 0.01) return Math.atan2(dy, Math.max(R, 0.01)) + 0.0;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * R));
}

export class Tank {
  static MAX_BLOOM = 4.5;
  constructor(game, spec, team, name, isPlayer = false, loadout = null, items = null) {
    this.id = NEXT_ID++; this.game = game; this.spec = spec; this.team = team; this.name = name; this.isPlayer = isPlayer;
    this.abilities = new Abilities(this);
    this.abilities.resetForBattle();
    if (this.abilities.magazine) this.reloadLeft = 0;
    this.model = createTankModel(spec); game.scene.add(this.model.root);
    this.pos = new THREE.Vector3(); this.heading = 0; this.speed = 0; this.turnRate = 0; this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion(); this.pitch = 0; this.roll = 0; this.rock = 0; this.rockV = 0;
    this.hp = spec.hp; this.maxHp = spec.hp; this.alive = true;
    this.turretYaw = 0; this.gunPitch = 0; this.bloom = 3; this.yawRate = 0; this.recoil = 0;
    this.reloadLeft = 1.5; this.shellIdx = 0; this.ammo = (loadout || spec.defaultLoadout).slice(); if (!this.ammo[0]) this.shellIdx = Math.max(0, this.ammo.findIndex((n) => n > 0));
    this.modules = { engine: 1, tracks: 1, gun: 1, turret: 1 }; this.trackRepair = 0; this.burning = 0;
    this.crew = spec.crew.map((role) => ({ role, alive: true }));
    this.input = { throttle: 0, steer: 0, aim: new THREE.Vector3(0, 0, 0) };
    this.lastFired = -100; this.inBush = null; this.visibleUntil = [0, 0]; this.spotted = [false, false]; this.lastSeenPos = [null, null];
    this.stats = { damage: 0, kills: 0, shots: 0, hits: 0, pens: 0, received: 0 };
    this.lastAttacker = null; this.lastDamagedAt = -100; this.inWater = false; this.groundY = 0; this.moved = 0;
    this.hullBox = { x: spec.dims.W / 2, y0: 0.3, y1: spec.dims.hullH, z: spec.dims.L / 2 };
    const d = spec.dims; const tc = d.turretBoxZ || 0;
    this.turBox = { x: d.turretW / 2, y0: 0, y1: d.turretH, z0: tc - d.turretL / 2, z1: tc + d.turretL / 2 };
    this.inv = new THREE.Matrix4(); this.equip = new Equipment(this, items);
  }
  get shell() { return this.spec.shells[this.shellIdx]; }
  crewAlive(role) { const c = this.crew.find((m) => m.role === role); return c ? c.alive : true; }
  get viewRange() { return this.spec.viewRange * (this.crewAlive('Commander') ? 1 : 0.8) * (this.equip.active('optics') ? 1.1 : 1); }
  reloadTime() { const s = this.spec; let r = s.reload; if (!s.autoloader && !this.crewAlive('Loader')) r *= 1.4; if (this.modules.gun < 1) r *= 1.3; if (this.equip.active('reload')) r *= 0.7; return r; }
  aimTime() { let a = this.spec.aimTime; if (!this.crewAlive('Gunner')) a *= 1.5; return a; }
  // base dispersion: spec.dispersion = circle radius in metres at 100 m (fully aimed) -> radians
  baseDispersion() { let d = this.spec.dispersion / 100; if (this.modules.gun < 1) d *= 1.5; if (!this.crewAlive('Gunner')) d *= 1.3; return d; }
  // current dispersion-circle radius (radians); every shell lands inside this cone
  dispersion() { return this.baseDispersion() * this.bloom; }
  placeAt(x, z, heading) {
    this.pos.set(x, this.game.world.groundHeight(x, z), z); this.heading = heading; this.turretYaw = 0; this.updateGround(1, true); this.syncModel();
  }
  setHeading(h) { this.heading = h; }

  update(dt, time) {
    if (!this.alive) return;
    const s = this.spec, d = s.dims, W = this.game.world, T = W.terrain;
    this.equip.update(dt); if (Math.abs(this.speed) > 0.5 || this.lastMoving === undefined) this.lastMoving = time;
    if (this.trackRepair > 0) { this.trackRepair -= dt; if (this.trackRepair <= 0) { this.modules.tracks = 1; if (this.isPlayer) this.game.hud.message('Tracks repaired', '#9fd39f'); } }
    if (this.burning > 0) { this.burning -= dt; this.damage(this.maxHp * 0.012 * dt, this.lastAttacker, 'fire'); if (!this.alive) return; }
    const mobile = this.modules.tracks > 0;
    const driver = this.crewAlive('Driver') ? 1 : 0.65;
    const thr = clamp(this.input.throttle, -1, 1), steer = clamp(this.input.steer, -1, 1);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hf = W.groundHeight(this.pos.x + fx * d.L * 0.4, this.pos.z + fz * d.L * 0.4), hb = W.groundHeight(this.pos.x - fx * d.L * 0.4, this.pos.z - fz * d.L * 0.4);
    const grade = (hf - hb) / (d.L * 0.8);
    const ptw = s.power / s.mass; const dir = Math.abs(this.speed) > 0.2 ? Math.sign(this.speed) : Math.sign(thr);
    const uphill = grade * dir;
    const slopeF = uphill > 0 ? clamp(1 - uphill * 1.35 * clamp(18 / ptw, 0.6, 1.5), uphill < 0.58 ? 0.15 : 0, 1) : 1 + Math.min(0.25, -uphill * 0.8);
    const wl = T.waterLevel(this.pos.x, this.pos.z); const depth = wl - this.groundY; this.inWater = depth > 0.15;
    const waterF = depth > 0 ? clamp(1 - depth * 0.38, 0.2, 1) : 1;
    const ri = T.x2i(this.pos.x), rj = T.x2i(this.pos.z); const onRoad = T.inside(ri, rj) ? T.road[T.idx(ri, rj)] : 0;
    const terrF = 0.78 + 0.22 * Math.min(1, onRoad * 1.5);
    const od = this.equip.active('overdrive'); const lf = this.equip.factor;
    const vmax = ((thr >= 0 ? s.maxSpeed : s.reverseSpeed) / 3.6) * (this.modules.engine < 1 ? 0.5 : 1) * driver * lf * (od ? 1.2 : 1) * (this.abilities ? this.abilities.speedMult : 1);
    let target = mobile ? thr * vmax * slopeF * waterF * terrF : 0;
    if (uphill > 0.75) target = Math.min(target, 0) - 0.5; // too steep: slide back
    const light = s.cls === 'Light' ? 2.4 : 1; const accel = clamp(ptw * 0.075, 0.6, 2.2) * light * (this.modules.engine < 1 ? 0.5 : 1) * lf * (od ? 1.35 : 1);
    const braking = Math.sign(target) !== Math.sign(this.speed) || Math.abs(target) < Math.abs(this.speed);
    this.speed = approach(this.speed, target, (braking ? (mobile ? 3.0 : 6) : accel) * dt);
    const vmaxF = (s.maxSpeed / 3.6) * lf;
    const turnMax = s.hullTraverse * DEG * driver * (mobile ? 1 : 0) * (1 - 0.45 * Math.min(1, Math.abs(this.speed) / vmaxF)) * (this.inWater ? 0.6 : 1);
    const turnTarget = steer * turnMax * (this.speed < -0.3 ? -1 : 1);
    this.turnRate = approach(this.turnRate, turnTarget, turnMax * 3 * dt + 0.001);
    if (Math.abs(steer) > 0.1 && Math.abs(thr) < 0.1) this.speed *= Math.pow(0.6, dt);
    this.heading = wrapAngle(this.heading + this.turnRate * dt);
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += nfx * this.speed * dt; this.pos.z += nfz * this.speed * dt;
    // knock trees
    const kn = W.veg.knock(this.pos.x + nfx * d.L * 0.42, this.pos.z + nfz * d.L * 0.42, d.W * 0.5, nfx * Math.sign(this.speed), nfz * Math.sign(this.speed), this.speed);
    if (kn) { this.speed *= 0.82; if (this.isPlayer) this.game.audio.impact(this.pos, 'ground'); }
    this.vel.set((this.pos.x - ox) / Math.max(dt, 1e-4), 0, (this.pos.z - oz) / Math.max(dt, 1e-4));
    // running gear animation
    const half = d.W / 2; updateRunningGear(this.model, (this.speed + this.turnRate * half) * dt, (this.speed - this.turnRate * half) * dt);
    this.moved += Math.abs(this.speed) * dt;
    this.updateTurret(dt);
    if (this.reloadLeft > 0) this.reloadLeft = Math.max(0, this.reloadLeft - dt);
    if (this.abilities) this.abilities.update(dt);
    this.recoil = Math.max(0, this.recoil - dt * 1.2);
    // hull rocking spring (firing / braking)
    const decel = (this.speed - (this._lastSpeed ?? this.speed)) / Math.max(dt, 1e-4); this._lastSpeed = this.speed;
    this.rockV += (-this.rock * 60 - this.rockV * 7 + decel * 0.004) * dt; this.rock += this.rockV * dt;
  }
  updateTurret(dt) {
    const s = this.spec; const aim = this.input.aim; const gunW = this.model.gun.getWorldPosition(_v);
    const dx = aim.x - gunW.x, dy = aim.y - gunW.y, dz = aim.z - gunW.z; const R = Math.hypot(dx, dz);
    if (!Number.isFinite(dx + dy + dz)) return; // ignore an invalid aim point instead of poisoning the turret state
    const th = ballisticAngle(this.shell.velocity, R, dy);
    _v2.set((dx / (R || 1)) * Math.cos(th), Math.sin(th), (dz / (R || 1)) * Math.cos(th));
    _q.copy(this.quat).invert(); _v2.applyQuaternion(_q);
    const yawT = Math.atan2(_v2.x, _v2.z), pitchT = Math.asin(clamp(_v2.y, -1, 1));
    const rate = s.turretTraverse * DEG * (this.modules.turret < 1 ? 0.5 : 1) * (this.crewAlive('Gunner') ? 1 : 0.7);
    const prev = this.turretYaw; this.turretYaw = wrapAngle(approachAngle(this.turretYaw, yawT, rate * dt));
    this.yawRate = Math.abs(wrapAngle(this.turretYaw - prev)) / Math.max(dt, 1e-4);
    this.gunPitch = approach(this.gunPitch, clamp(pitchT, -s.gunDepression * DEG, s.gunElevation * DEG), s.gunSpeed * DEG * dt);
    this.aimError = Math.abs(wrapAngle(yawT - this.turretYaw)) + Math.abs(clamp(pitchT, -s.gunDepression * DEG, s.gunElevation * DEG) - this.gunPitch);
    const stab = s.stabilizer; const aimT = this.aimTime();
    // aim bloom: hull speed, hull rotation and turret traverse widen the circle (stabilisers damp it); it then
    // shrinks back exponentially (≈95 % converged after aimTime seconds) while the tank holds still
    const disturb = 1 + Math.abs(this.speed) * 0.15 * stab + Math.abs(this.turnRate) * 1.5 * stab + this.yawRate * 2.0 * stab;
    if (disturb > this.bloom) this.bloom += (disturb - this.bloom) * Math.min(1, dt * 8);
    this.bloom = 1 + (this.bloom - 1) * Math.exp((-dt * 3.0) / aimT); this.bloom = Math.min(this.bloom, Tank.MAX_BLOOM);
    if (this.abilities && this.abilities.isStabilized) this.bloom = Math.min(this.bloom, 1.05);
  }
  updateGround(dt, snap = false) {
    const d = this.spec.dims, W = this.game.world; const T = { height: (x, z) => W.groundHeight(x, z) }; const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    const lx = d.L * 0.4, wx = d.W * 0.4;
    const hf = T.height(this.pos.x + fx * lx, this.pos.z + fz * lx), hb = T.height(this.pos.x - fx * lx, this.pos.z - fz * lx);
    const hl = T.height(this.pos.x + rx * wx, this.pos.z + rz * wx), hr = T.height(this.pos.x - rx * wx, this.pos.z - rz * wx);
    const hc = T.height(this.pos.x, this.pos.z);
    const pitchT = -Math.atan2(hf - hb, lx * 2), rollT = Math.atan2(hl - hr, wx * 2);
    const yT = Math.max((hf + hb) / 2, (hl + hr) / 2, hc) - 0.02 + (this._rockLift || 0); this._rockLift = 0;
    const k = snap ? 1 : Math.min(1, dt * 9);
    this.pitch += (pitchT - this.pitch) * k; this.roll += (rollT - this.roll) * k; this.groundY = yT;
    if (snap || yT > this.pos.y) this.pos.y = yT; else this.pos.y += (yT - this.pos.y) * Math.min(1, dt * 14);
    _e.set(this.pitch + this.rock, this.heading, this.roll, 'YXZ'); this.quat.setFromEuler(_e);
  }
  syncModel() {
    const m = this.model; m.root.position.copy(this.pos); m.root.quaternion.copy(this.quat);
    m.turret.rotation.y = this.turretYaw; m.gun.rotation.x = -this.gunPitch; m.gun.position.z = (m.gun.userData.z0 ??= m.gun.position.z) - this.recoil * 0.45;
    m.root.updateMatrixWorld(true); this.inv.copy(m.root.matrixWorld).invert();
  }
  tryFire(time) {
    if (!this.alive || this.reloadLeft > 0 || this.ammo[this.shellIdx] <= 0) return false;
    const g = this.game; const sh = this.shell; const m = this.model;
    const muzzle = m.muzzle.getWorldPosition(new THREE.Vector3()); const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(m.gun.getWorldQuaternion(_q)).normalize();
    // dispersion: 2D gaussian (sigma = R/2.2, centre-weighted) clamped to the dispersion circle of radius R
    const disp = this.dispersion(); const up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const a = new THREE.Vector3().crossVectors(dir, up).normalize(), b = new THREE.Vector3().crossVectors(dir, a).normalize();
    let gx = g.rng.gauss() / 2.2, gy = g.rng.gauss() / 2.2; const gl = Math.hypot(gx, gy); if (gl > 1) { gx /= gl; gy /= gl; }
    this.lastDeviation = Math.hypot(gx, gy) * disp;
    dir.addScaledVector(a, Math.tan(gx * disp)).addScaledVector(b, Math.tan(gy * disp)).normalize();
    const vel = dir.clone().multiplyScalar(sh.velocity).add(this.vel);
    let fireShell = sh;
    if (this.abilities && this.abilities.overpenLeft > 0) {
      const mult = this.abilities.consumeOverpen();
      fireShell = { ...sh, pen: Math.round(sh.pen * mult) };
    }
    g.ballistics.spawn(this, fireShell, muzzle, vel);
    this.ammo[this.shellIdx]--; this.reloadLeft = this.reloadTime(); this.lastFired = time; this.stats.shots++;
    if (this.abilities) this.abilities.onFire();
    this.bloom = Math.min(Tank.MAX_BLOOM, this.bloom + 1.2 + 1.0 * this.spec.stabilizer); this.recoil = 1;
    this.rockV -= (sh.caliber / 100) * 1.4 * (40 / this.spec.mass) * Math.cos(this.turretYaw);
    g.effects.muzzle(muzzle, dir, sh.caliber); g.audio.gun(muzzle, sh.caliber, this.isPlayer);
    if (this.ammo[this.shellIdx] <= 0) { const nxt = this.ammo.findIndex((n) => n > 0); if (nxt >= 0) this.shellIdx = nxt; }
    return true;
  }
  tryAbility() { return this.abilities ? this.abilities.tryActivate() : false; }
  selectShell(i) {
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
    const cosA = -hit.ldir.dot(n); let angle = Math.acos(clamp(cosA, -1, 1)) / DEG; if (cosA <= 0) angle = 89.5;
    const normAngle = Math.max(0, angle - (typeInfo.normalize || 0));
    let eff = tmm / Math.max(0.05, Math.cos(normAngle * DEG));
    const front = hit.face === 'front', hullSide = hit.part === 'hull' && hit.face === 'side';
    if (typeInfo.heat) { eff *= A.heatMult || 1; if (A.era && front) eff += A.era; if (A.skirt && hullSide) eff += A.skirt; }
    else if (!typeInfo.he && A.eraKE && front) eff += A.eraKE;
    let tracks = false;
    if (hullSide && hit.local.y < zoneLowerSideY(this.spec.dims)) { tracks = true; eff += 20; }
    const overmatch = shellSpec.caliber > tmm * 3;
    const ricochet = !typeInfo.he && angle > typeInfo.ricochet && !overmatch;
    // world normal (for ricochet reflection)
    const nw = n.clone(); if (hit.part === 'turret') nw.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.turretYaw); nw.applyQuaternion(this.quat);
    return { eff, angle, ricochet, tracks, nominal: tmm, zone, normalW: nw };
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
    this.alive = false; this.hp = 0; this.speed = 0; this.burning = 0;
    const g = this.game; burnModel(this.model);
    const p = this.pos.clone(); p.y += this.spec.dims.hullH;
    g.effects.explosion(p, true); g.audio.impact(p, 'explosion');
    g.effects.addBurner(this.model.root, new THREE.Vector3(0, this.spec.dims.hullH + 0.3, -this.spec.dims.L * 0.25), 45, 1);
    if (cause === 'ammo') {
      // turret blown off
      const t = this.model.turret; const wp = t.getWorldPosition(new THREE.Vector3()); const wq = t.getWorldQuaternion(new THREE.Quaternion());
      this.turretGone = true; g.scene.attach(t); t.position.copy(wp); t.quaternion.copy(wq);
      g.flying.push({ obj: t, v: new THREE.Vector3((Math.random() - 0.5) * 6, 14 + Math.random() * 8, (Math.random() - 0.5) * 6), w: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4), t: 0 });
    }
    if (attacker && attacker !== this && attacker.team !== this.team) attacker.stats.kills++;
    g.onKill(attacker, this, cause);
  }
  // apply a resolved hit (penetration or HE blast) with module & crew effects
  applyPenetration(hit, shellSpec, attacker, dmg) {
    const g = this.game; const r = g.rng; const msgs = [];
    const L = this.spec.dims.L; const lz = hit.local.z;
    if (hit.part === 'hull') {
      if ((this.spec.engineZone === 'rear' && (lz < -L * 0.22 || hit.face === 'rear')) || (this.spec.engineZone === 'front' && (lz > L * 0.22 || hit.face === 'front'))) { if (this.modules.engine === 1) msgs.push('Engine damaged'); this.modules.engine = 0.5; if (r.next() < 0.22) { this.burning = 7; msgs.push('Fire!'); } }
      const ar = this.spec.ammoRack;
      if (!ar.turretBustle && lz > ar.zMin && lz < ar.zMax && hit.local.y < ar.yMax && r.next() < ar.chance * (shellSpec.type === 'HEAT' ? 1.3 : 1)) { this.damage(this.hp + 1, attacker, 'ammo'); return ['AMMO RACK DETONATED']; }
      if (hit.tracks || hit.local.y < this.spec.dims.clearance + 0.5) { this.breakTracks(); msgs.push('Tracks destroyed'); }
    } else {
      if (hit.face === 'front' && r.next() < 0.35) { if (this.modules.gun === 1) msgs.push('Gun damaged'); this.modules.gun = 0.5; }
      if ((hit.face === 'side' || hit.face === 'rear') && r.next() < 0.3) { if (this.modules.turret === 1) msgs.push('Turret ring jammed'); this.modules.turret = 0.5; }
      if (this.spec.ammoRack.turretBustle && hit.face === 'rear') { this.ammo = this.ammo.map((n) => Math.floor(n * 0.4)); msgs.push('Bustle ammo cooked off – blow-out panels vented'); }
    }
    for (const c of this.crew) if (c.alive && r.next() < (shellSpec.type === 'APFSDS' ? 0.16 : shellSpec.type === 'HEAT' ? 0.22 : 0.2)) { c.alive = false; msgs.push(c.role + ' knocked out'); }
    if (this.crew.every((c) => !c.alive)) { this.damage(this.hp + 1, attacker, 'crew'); return msgs.concat(['Crew knocked out']); }
    this.damage(dmg, attacker, 'pen');
    return msgs;
  }
  breakTracks() { this.modules.tracks = 0; this.trackRepair = 9; this.speed *= 0.2; }
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
