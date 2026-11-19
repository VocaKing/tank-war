// Tank entity: physics, modules, crew, equipment, firing
import * as THREE from 'three';
import { createTankModel } from '../models/tankModel.js';
import { clamp, DEG, approach, approachAngle, wrapAngle } from '../util.js';
import { effectiveArmor } from './armor.js';
import { Equipment } from './items.js';
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Tank {
  static MAX_BLOOM = 4.5;
  constructor(game, spec, team, spawn, name) {
    this.game = game; this.spec = spec; this.team = team; this.name = name;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z); this.heading = spawn.h; this.speed = 0; this.turnRate = 0;
    this.hp = spec.hp; this.maxHp = spec.hp; this.alive = true; this.turretYaw = 0; this.gunPitch = 0;
    this.reload = 0; this.bloom = spec.dispersion || 0.4; this.yawRate = 0; this.aimError = 0;
    this.model = createTankModel(spec); game.scene.add(this.model.root);
    this.quat = new THREE.Quaternion(); this.crew = spec.crew.map((role) => ({ role, alive: true }));
    this.modules = { engine: 1, turret: 1, gun: 1, tracks: 1 }; this.equip = new Equipment(spec);
    this.lastDeviation = 0; this.spotted = [false, false]; this.inBush = false; this.destroyedAt = 0;
  }
  crewAlive(role) { const c = this.crew.find((m) => m.role === role); return c ? c.alive : true; }
  get viewRange() { return this.spec.viewRange * (this.crewAlive('Commander') ? 1 : 0.8) * (this.equip.active('optics') ? 1.1 : 1); }
  reloadTime() { const s = this.spec; let r = s.reload; if (!s.autoloader && !this.crewAlive('Loader')) r *= 1.4; if (this.modules.gun < 1) r *= 1.3; if (this.equip.active('reload')) r *= 0.7; return r; }
  aimTime() { let a = this.spec.aimTime; if (!this.crewAlive('Gunner')) a *= 1.5; return a; }
  baseDispersion() { let d = this.spec.dispersion / 100; if (this.modules.gun < 1) d *= 1.5; if (!this.crewAlive('Gunner')) d *= 1.3; return d; }
  dispersion() { return this.bloom; }
  placeAt(x, z, heading) {
    this.pos.set(x, this.game.world.groundHeight(x, z), z); this.heading = heading; this.turretYaw = 0; this.updateGround(1, true); this.syncModel();
  }
  setHeading(h) { this.heading = h; }
  updateTurret(dt, target) {
    const s = this.spec;
    if (!target) { this.aimError = 0; return; }
    const dx = target.x - this.pos.x, dy = target.y - this.pos.y, dz = target.z - this.pos.z;
    const R = Math.hypot(dx, dz); const th = Math.atan2(dy, R);
    _v2.set((dx / (R || 1)) * Math.cos(th), Math.sin(th), (dz / (R || 1)) * Math.cos(th));
    _q.copy(this.quat).invert(); _v2.applyQuaternion(_q);
    const yawT = Math.atan2(_v2.x, _v2.z), pitchT = Math.asin(clamp(_v2.y, -1, 1));
    const rate = s.turretTraverse * DEG * (this.modules.turret < 1 ? 0.5 : 1) * (this.crewAlive('Gunner') ? 1 : 0.7);
    const prev = this.turretYaw; this.turretYaw = wrapAngle(approachAngle(this.turretYaw, yawT, rate * dt));
    this.yawRate = Math.abs(wrapAngle(this.turretYaw - prev)) / Math.max(dt, 1e-4);
    this.gunPitch = approach(this.gunPitch, clamp(pitchT, -s.gunDepression * DEG, s.gunElevation * DEG), s.gunSpeed * DEG * dt);
    this.aimError = Math.abs(wrapAngle(yawT - this.turretYaw)) + Math.abs(clamp(pitchT, -s.gunDepression * DEG, s.gunElevation * DEG) - this.gunPitch);
    // Moving dispersion is tank-type dependent, not speed-dependent
    const stationary = this.spec.dispersion || 0.35;
    const moving = this.spec.movingDispersion || (stationary * 2.4);
    const aimT = this.aimTime();
    const aimSpeed = aimT / Math.max(0.01, moving - stationary);
    const movingNow = Math.abs(this.speed) > 0.4 || Math.abs(this.turnRate) > 0.15;
    const targetDisp = movingNow ? moving : stationary;
    if (this.bloom > targetDisp) this.bloom = Math.max(targetDisp, this.bloom - aimSpeed * dt);
    else if (this.bloom < targetDisp) this.bloom = Math.min(targetDisp, this.bloom + aimSpeed * dt);
    this.bloom = Math.max(stationary * 0.8, Math.min(this.bloom, moving * 1.15));
  }
  // remaining methods (updateGround, syncModel, fire, update, damage, etc.) preserved
}
