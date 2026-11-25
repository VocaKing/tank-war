// Tank entity: vehicle state, gun laying, firing, and module & crew damage
import * as THREE from 'three';
import { createTankModel, updateRunningGear, burnModel } from '../models/tankModel.js';
import { DEG, clamp, lerp, approach, approachAngle, wrapAngle } from '../util.js';
import { armorZone, zoneLowerSideY } from './tankData.js';
import { intersectArmor } from './armorGeometry.js';
import { trackCenterOffset } from './vehicleDimensions.js';
import { Abilities } from './abilities.js';
import { Equipment } from './items.js';
import { findEraTile } from './eraMechanics.js';
import { updateConceptTimers, precisionMultiplier, fireConceptMRSI, updateConceptMRSI } from './conceptSystems.js';
import { advanceDispersion, impactDrop, incidence, sampleDispersionRadius } from './combatMath.js';

import { GRAVITY } from './physics.js';

export { GRAVITY };
let NEXT_ID = 1;
const TRACK_REPAIR_TIME = 9;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function ballisticAngle(v, R, dy, highArc = false) {
  const g = GRAVITY; const v2 = v * v; const disc = v2 * v2 - g * (g * R * R + 2 * dy * v2);
  if (disc < 0 || R < 0.01) return Math.atan2(dy, Math.max(R, 0.01));
  const root = Math.sqrt(disc);
  return Math.atan((v2 + (highArc ? root : -root)) / (g * R));
}

export class Tank {
  constructor(game, spec, team, name, isPlayer = false, loadout = null, items = null) {
    this.id = NEXT_ID++; this.game = game; this.spec = spec; this.team = team; this.name = name; this.isPlayer = isPlayer;
    this.abilities = new Abilities(this);
    this.abilities.resetForBattle();
    if (this.abilities.magazine) this.reloadLeft = 0;
    this.model = createTankModel(spec, { battle: true }); game.scene.add(this.model.root);
    this.pos = new THREE.Vector3(); this.heading = 0; this.speed = 0; this.turnRate = 0; this.vel = new THREE.Vector3();
    this.airborne = false; this.afloat = false; this.landingSpeed = 0;
    this.quat = new THREE.Quaternion(); this.pitch = 0; this.roll = 0;
    this.hp = spec.hp; this.maxHp = spec.hp; this.alive = true;
    this.turretYaw = 0; this.gunPitch = 0; this.dispersionProgress = 0; this.yawRate = 0; this.recoil = 0;
    this.reloadLeft = 1.5; this.shellIdx = 0; this.ammo = (loadout || spec.defaultLoadout).slice(); if (!this.ammo[0]) this.shellIdx = Math.max(0, this.ammo.findIndex((n) => n > 0));
    this.modules = { engine: 1, tracks: 1, wheels: 1, gun: 1, turret: 1 };
    this.armorProfile = spec.armor; this.armorPackageIndex = 0; this.activeMass = spec.mass; this.activeMaxSpeed = spec.maxSpeed;
    this.apsCharges = spec.aps?.charges || 0; this.apsCooldown = 0; this.apsRechargeTime = 0; this.eraSpent = new Set();
    this.stationarySeconds = 0; this.suppressedFor = 0; this.mrsiQueue = null;
    this.spadeProgress = 0; this.spadeState = 'stowed'; this.pendingFire = false;
    this.autoArtilleryState = 'stowed'; this.autoArtilleryTimer = 0; this.autoArtilleryShots = 0;
    this.weaponModeIndex = 0; this.burstLeft = 0; this.burstTimer = 0; this.burstShellIdx = 0; this.burstOffsetIndex = 0;
    this.suspensionMode = 'normal'; this.suspensionOffset = 0;
    this.secondaryRounds = spec.secondary?.rounds ?? 0;
    this.secondaryReloadLeft = 0;
    this.trackRepairs = [0, 0]; this.burning = 0;
    this.crew = spec.crew.map((role) => ({ role, alive: true }));
    this.input = { throttle: 0, steer: 0, brake: false, driveHeld: false, aim: new THREE.Vector3() };
    this.hullAiming = false;
    this.lastFired = -100; this.inBush = null; this.visibleUntil = [0, 0]; this.spotted = [false, false]; this.lastSeenPos = [null, null];
    this.stats = { damage: 0, kills: 0, shots: 0, hits: 0, pens: 0, received: 0 };
    this.lastAttacker = null; this.lastDamagedAt = -100; this.inWater = false; this.groundY = 0; this.moved = 0;
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
  get mobilityModule() { return this.spec.runningGear === 'wheels' ? 'wheels' : 'tracks'; }
  get mobilityLabel() { return this.mobilityModule === 'wheels' ? 'WHEELS' : 'TRACKS'; }
  usesSpade() { return !!(this.spec.artillery?.spade || this.spec.recoilBrace); }
  get viewRange() { return this.spec.viewRange * (this.crewAlive('Commander') ? 1 : 0.8) * (this.equip.active('optics') ? 1.1 : 1); }
  reloadTime() { const s = this.spec; let r = s.reload; if (!s.autoloader && !this.crewAlive('Loader')) r *= 1.4; if (this.modules.gun < 1) r *= 1.3; if (this.equip.active('reload')) r *= 0.7; return r; }
  aimTime() { let a = this.spec.aimTime; if (!this.crewAlive('Gunner')) a *= 1.5; if (this.suppressedFor > 0) a *= this.spec.openTop ? 1.9 : 1.28; if (this.spec.turretElectronicsWeakness && this.modules.turret < 1) a *= this.spec.turretElectronicsWeakness; return a; }
  // Balance values are cone radii in metres at 100 m.
  dispersion() {
    const radius = lerp(this.spec.dispersion, this.spec.maxDispersion, this.dispersionProgress);
    return Math.atan(radius / 100) * precisionMultiplier(this) * (this.suppressedFor > 0 ? (this.spec.openTop ? 1.55 : 1.2) : 1);
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
    if (this.apsCooldown > 0) this.apsCooldown = Math.max(0, this.apsCooldown - dt);
    updateConceptTimers(this, dt);
    if (Math.abs(this.speed) > 0.5 || this.lastMoving === undefined) this.lastMoving = time;
    if (this.trackRepairs[0] > 0 || this.trackRepairs[1] > 0) {
      const previous = this.modules[this.mobilityModule];
      this.trackRepairs[0] = Math.max(0, this.trackRepairs[0] - dt);
      this.trackRepairs[1] = Math.max(0, this.trackRepairs[1] - dt);
      this.updateTrackCondition();
      if (this.isPlayer && this.modules[this.mobilityModule] > previous) {
        this.game.hud.message(this.mobilityLabel + ' repaired', '#9fd39f');
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
    this.recoil = Math.max(0, this.recoil - dt * (this.spec.artillery?.recoilRecovery || this.spec.recoilBrace?.recoilRecovery || 1.2));
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
      if (this.usesSpade()) this.updateSpade(dt, this.game.time);
      if (this.spec.artillery?.autoDeploy) this.updateAutoArtillery(dt, this.game.time);
      if (this.burstLeft > 0) { this.burstTimer -= dt; if (this.burstTimer <= 0 && this.reloadLeft <= 0) this.fireBurstRound(this.game.time); }
      if (this.mrsiQueue) updateConceptMRSI(this, dt, this.game.time);
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
    const th = ballisticAngle(this.shell.velocity, horizontal, dy, !!s.artillery?.highArc);
    _v2.set(dx / (horizontal || 1) * Math.cos(th), Math.sin(th), dz / (horizontal || 1) * Math.cos(th));
    _q.copy(pose).invert(); _v2.applyQuaternion(_q);
    const rawYawT = Math.atan2(_v2.x, _v2.z), pitchT = Math.asin(clamp(_v2.y, -1, 1));
    const yawT = s.fireArc ? clamp(wrapAngle(rawYawT), -s.fireArc * DEG, s.fireArc * DEG) : rawYawT;
    const prev = this.turretYaw;
    if (!s.fixedGun) {
      const rate = s.turretTraverse * DEG * (this.modules.turret < 1 ? 0.5 : 1) * (this.crewAlive('Gunner') ? 1 : 0.7);
      this.turretYaw = wrapAngle(approachAngle(prev, yawT, rate * dt));
    }
    this.yawRate = Math.abs(wrapAngle(this.turretYaw - prev)) / Math.max(dt, 1e-4);
    const minPitch=this.model.gunPitchFloor(this.turretYaw,-s.gunDepression*DEG,s.gunElevation*DEG);
    const desiredPitch=clamp(pitchT,minPitch,s.gunElevation*DEG);
    this.gunPitch=clamp(approach(this.gunPitch,desiredPitch,s.gunSpeed*DEG*dt),minPitch,s.gunElevation*DEG);
    this.aimError=Math.abs(wrapAngle(rawYawT-this.turretYaw))+Math.abs(desiredPitch-this.gunPitch);
  }
  syncModel() {
    const m = this.model; m.root.position.copy(this.pos); m.root.quaternion.copy(this.quat);
    m.body.position.y = this.suspensionOffset || 0;
    m.turret.rotation.y = this.turretYaw; m.gun.rotation.x = -this.gunPitch; m.barrel.position.z = -this.recoil * m.maxRecoil;
    let support = this.spadeProgress;
    if (this.spec.artillery?.autoDeploy) {
      const state = this.autoArtilleryState;
      const timer = this.autoArtilleryTimer;
      if (state === 'deployed') support = 1;
      else if (state === 'deploying') support = 1 - timer / this.spec.artillery.deploySeconds;
      else if (state === 'packing') support = timer / this.spec.artillery.packSeconds;
    }
    const supportAngle = (1 - clamp(support, 0, 1)) * Math.PI / 2;
    if (m.spade) m.spade.rotation.x = supportAngle;
    if (m.stabilizers) for (const leg of m.stabilizers) leg.rotation.x = supportAngle;
    m.steerWheels?.(clamp(this.turnRate * .34, -.46, .46));
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
    if (!this.alive || this.afloat || this.fireReloadLeft > 0) return false;
    if (!this.abilities.usingSecondary && this.usesSpade() && this.spadeState !== 'deployed') {
      if (!this.setSpade(true)) return false;
      this.pendingFire = true;
      if (this.isPlayer) this.game.hud.message('Deploying firing brace · shot queued', '#ffcf78');
      return false;
    }
    if (!this.abilities.usingSecondary && this.spec.artillery?.autoDeploy && this.autoArtilleryState !== 'deployed') {
      this.pendingFire = true;
      if (this.isPlayer && Math.abs(this.speed) > 0.3) this.game.hud.message('Stop to deploy the automated gun system', '#ffbd70');
      return false;
    }
    if (!this.abilities.usingSecondary && this.spec.fireArc && Math.abs(this.turretYaw) > this.spec.fireArc * DEG + 0.01) return false;
    if (!this.abilities.usingSecondary && (this.spec.mrsi || this.spec.multiTube || this.spec.burst)) return this.tryFireSpecial(time);
    const secondary = this.abilities.usingSecondary;
    const rounds = secondary ? this.secondaryRounds : this.ammo[this.shellIdx];
    if (!this.alive || this.afloat || this.fireReloadLeft > 0 || rounds <= 0) return false;
    const g = this.game; const sh = this.shell;
    const muzzle = this.muzzleNode.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.gunMount.getWorldQuaternion(_q)).normalize();
    // The disk on the gun's tangent plane projects to the HUD's angular spread.
    const radius = Math.tan(this.dispersion());
    const offset = radius > 0 ? radius * sampleDispersionRadius(g.rng) : 0;
    if (offset > 0) {
      const angle = g.rng.range(0, 2 * Math.PI);
      const up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tangent = new THREE.Vector3().crossVectors(dir, up).normalize();
      const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();
      dir.addScaledVector(tangent, offset * Math.cos(angle)).addScaledVector(bitangent, offset * Math.sin(angle)).normalize();
    }
    this.lastDeviation = Math.atan(offset);
    const vel = dir.clone().multiplyScalar(sh.velocity).add(this.vel);
    let fireShell = sh;
    if (this.abilities && this.abilities.overpenLeft > 0) {
      const mult = this.abilities.consumeOverpen();
      fireShell = { ...sh, pen: Math.round(sh.pen * mult) };
    }
    const origin = this.shotOrigin(muzzle);
    const projectile = g.ballistics.spawn(this, fireShell, origin, vel);
    if (sh.guided) projectile.target = this.input.aim.clone();
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
    if (!secondary && this.spec.artillery?.autoDeploy) {
      this.autoArtilleryShots++;
      if (this.autoArtilleryShots >= this.spec.artillery.fireMissionRounds) {
        this.autoArtilleryState = 'packing'; this.autoArtilleryTimer = this.spec.artillery.packSeconds || 1; this.pendingFire = false;
      }
    }
    return true;
  }
  setSpade(deploy) {
    if (!this.usesSpade()) return false;
    if (deploy) {
      if (Math.abs(this.speed) > 0.35 || Math.abs(this.turnRate) > 0.035) {
        if (this.isPlayer) this.game.hud.message('Stop before deploying the firing brace', '#ffbd70');
        return false;
      }
      if (this.spadeState === 'stowed' || this.spadeState === 'retracting') this.spadeState = 'deploying';
    } else if (this.spadeState !== 'stowed') {
      this.spadeState = 'retracting'; this.pendingFire = false;
    }
    return true;
  }
  toggleSpade() {
    if (!this.usesSpade()) return false;
    return this.setSpade(this.spadeState === 'stowed' || this.spadeState === 'retracting');
  }
  updateSpade(dt, time) {
    const cfg = this.spec.artillery?.spade ? this.spec.artillery : this.spec.recoilBrace;
    if (!cfg) return;
    if (this.spadeState === 'deploying') {
      this.spadeProgress = Math.min(1, this.spadeProgress + dt / Math.max(0.1, cfg.spadeDeploySeconds || 1));
      if (this.spadeProgress >= 1) this.spadeState = 'deployed';
    } else if (this.spadeState === 'retracting') {
      this.spadeProgress = Math.max(0, this.spadeProgress - dt / Math.max(0.1, cfg.spadeRetractSeconds || 1));
      if (this.spadeProgress <= 0) this.spadeState = 'stowed';
    }
    if (this.pendingFire && this.spadeState === 'deployed' && this.reloadLeft <= 0 &&
        Math.abs(this.speed) < 0.3 && Math.abs(this.turnRate) < 0.025 && this.aimError < 0.05) {
      this.pendingFire = false; this.tryFire(time);
    }
  }
  updateAutoArtillery(dt, time) {
    const cfg = this.spec.artillery;
    if (this.autoArtilleryState === 'deploying' || this.autoArtilleryState === 'packing') {
      this.autoArtilleryTimer -= dt;
      if (this.autoArtilleryTimer <= 0) {
        if (this.autoArtilleryState === 'deploying') this.autoArtilleryState = 'deployed';
        else { this.autoArtilleryState = 'stowed'; this.autoArtilleryShots = 0; }
      }
    }
    if (this.autoArtilleryState === 'stowed' && this.pendingFire &&
        Math.abs(this.speed) < 0.3 && Math.abs(this.turnRate) < 0.025) {
      this.autoArtilleryState = 'deploying'; this.autoArtilleryTimer = cfg.deploySeconds || 1;
    }
    if (this.autoArtilleryState === 'deployed' && this.pendingFire && this.reloadLeft <= 0 &&
        Math.abs(this.speed) < 0.3 && Math.abs(this.turnRate) < 0.025 && this.aimError < 0.05) {
      this.pendingFire = false; this.tryFire(time);
    }
  }
  cycleWeaponMode() {
    const modes = this.spec.multiTube?.modes;
    if (!modes || modes.length < 2) return false;
    this.weaponModeIndex = (this.weaponModeIndex + 1) % modes.length;
    if (this.isPlayer) this.game.hud.message('WEAPON MODE · ' + modes[this.weaponModeIndex].name, '#9fd39f');
    return true;
  }
  cycleArmorPackage() {
    const packages = this.spec.armorPackages;
    if (!packages || packages.length < 2) return false;
    this.armorPackageIndex = (this.armorPackageIndex + 1) % packages.length;
    const p = packages[this.armorPackageIndex], A = JSON.parse(JSON.stringify(this.spec.armor));
    A.hull.front[0] += p.front; A.hull.side[0] += p.side;
    A.turret.front[0] += p.front * 0.65; A.turret.side[0] += p.side * 0.65;
    A.heatMult = p.heatMult;
    this.armorProfile = A; this.activeMass = p.mass; this.activeMaxSpeed = this.spec.maxSpeed * p.speedMult;
    if (this.isPlayer) this.game.hud.message('ARMOUR PACKAGE · ' + p.name, '#9fd39f');
    return true;
  }
  toggleSuspension() {
    const h = this.spec.hydroSuspension;
    if (!h) return false;
    const modes = ['normal', 'low', 'high'];
    this.suspensionMode = modes[(modes.indexOf(this.suspensionMode) + 1) % modes.length];
    this.suspensionOffset = this.suspensionMode === 'low' ? h.lowOffset : this.suspensionMode === 'high' ? h.highOffset : 0;
    if (this.isPlayer) this.game.hud.message('HYDROPNEUMATIC SUSPENSION · ' + this.suspensionMode.toUpperCase(), '#9fd39f');
    return true;
  }
  tryAPS(projectile, point) {
    const cfg = this.spec.aps;
    if (!cfg || this.apsCharges <= 0 || this.apsCooldown > 0 || !projectile || projectile.owner?.team === this.team) return false;
    if (!(projectile.type?.heat || projectile.spec?.guided || projectile.spec?.apsThreat)) return false;
    const centre = this.pos.clone(); centre.y += this.spec.dims.hullH * 0.62;
    if (point.distanceTo(centre) > cfg.radius) return false;
    this.apsCharges--; this.apsCooldown = cfg.cooldown; this.apsRechargeTime = 0;
    if (this.isPlayer) this.game.hud.message('ACTIVE PROTECTION · THREAT INTERCEPTED · ' + this.apsCharges + ' CHARGES', '#7edcff');
    return true;
  }
  spawnRound(shellIndex, offset = null, muzzleIndex = 0) {
    const shell = this.spec.shells[shellIndex], model = this.model;
    const markers = model.muzzles;
    const muzzle = markers ? markers[muzzleIndex % markers.length].getWorldPosition(new THREE.Vector3())
      : offset ? model.gun.localToWorld(new THREE.Vector3(...offset)) : model.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(model.gun.getWorldQuaternion(_q)).normalize();
    const up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(dir, up).normalize();
    const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();
    const radius = Math.tan(this.dispersion());
    let gx = this.game.rng.gauss() / 2.2, gy = this.game.rng.gauss() / 2.2;
    const gl = Math.hypot(gx, gy); if (gl > 1) { gx /= gl; gy /= gl; }
    dir.addScaledVector(tangent, gx * radius).addScaledVector(bitangent, gy * radius).normalize();
    let fireShell = shell;
    if (shell.airburst) {
      const range = muzzle.distanceTo(this.input.aim);
      fireShell = { ...shell, fuseTime: Math.max(0.05, (range - (shell.fuseLeadDistance || 0)) / Math.max(1, shell.velocity)) };
    }
    const velocity = dir.clone().multiplyScalar(shell.velocity).add(this.vel);
    if (this.abilities?.overpenLeft > 0) {
      const mult = this.abilities.consumeOverpen();
      fireShell = { ...fireShell, pen: Math.round(fireShell.pen * mult) };
    }
    const projectile = this.game.ballistics.spawn(this, fireShell, muzzle, velocity);
    if (shell.guided) projectile.target = this.input.aim.clone();
    return { muzzle, dir, caliber: shell.caliber };
  }
  fireBurstRound(time) {
    const cfg = this.spec.burst, index = this.burstShellIdx;
    if (!cfg || this.ammo[index] <= 0 || this.burstLeft <= 0) { this.burstLeft = 0; return; }
    const offsets = cfg.offsets || [];
    const shot = this.spawnRound(index, offsets.length ? offsets[this.burstOffsetIndex % offsets.length] : null, this.burstOffsetIndex);
    this.burstOffsetIndex++; this.ammo[index]--; this.stats.shots++; this.lastFired = time; this.recoil = 0.35;
    this.game.effects.muzzle(shot.muzzle, shot.dir, shot.caliber); this.game.audio.gun(shot.muzzle, shot.caliber, this.isPlayer);
    this.game.physics?.recoil(this, shot.muzzle, shot.dir, shot.caliber);
    this.burstLeft--;
    if (this.burstLeft > 0 && this.ammo[index] > 0) {
      this.reloadLeft = cfg.interval; this.burstTimer = cfg.interval;
    } else {
      this.burstLeft = 0; this.reloadLeft = this.reloadTime();
      if (this.ammo[index] <= 0) { const next = this.ammo.findIndex(n => n > 0); if (next >= 0) this.shellIdx = next; }
    }
  }
  tryFireSpecial(time) {
    const index = this.shellIdx, shell = this.spec.shells[index];
    if (this.spec.mrsi && this.ammo[index] >= 2) return fireConceptMRSI(this, time);
    const mode = this.spec.multiTube?.modes?.[this.weaponModeIndex] || { count: 1, reloadMult: 1 };
    const count = Math.min(mode.count || 1, this.ammo[index]);
    const offsets = this.spec.multiTube?.offsets || [];
    let first = null;
    for (let i = 0; i < count; i++) {
      const shot = this.spawnRound(index, offsets.length ? offsets[i % offsets.length] : null, i);
      if (!first) first = shot;
      this.game.effects.muzzle(shot.muzzle, shot.dir, shot.caliber);
      this.game.physics?.recoil(this, shot.muzzle, shot.dir, shot.caliber);
    }
    this.ammo[index] -= count; this.reloadLeft = this.reloadTime() * (mode.reloadMult || 1);
    this.lastFired = time; this.stats.shots += count; this.abilities?.onFire(); this.recoil = 1;
    if (first) this.game.audio.gun(first.muzzle, first.caliber, this.isPlayer);
    if (this.spec.burst && this.spec.burst.shellIndices.includes(index)) {
      this.burstLeft = Math.max(0, this.spec.burst.count - 1); this.burstShellIdx = index;
      this.burstTimer = this.spec.burst.interval; this.burstOffsetIndex = this.model.muzzles ? 1 : 0;
      if (this.burstLeft > 0) this.reloadLeft = this.spec.burst.interval;
    }
    if (this.spec.artillery?.autoDeploy) {
      this.autoArtilleryShots++;
      if (this.autoArtilleryShots >= this.spec.artillery.fireMissionRounds) {
        this.autoArtilleryState = 'packing'; this.autoArtilleryTimer = this.spec.artillery.packSeconds || 1;
        this.pendingFire = false;
      }
    }
    if (this.ammo[index] <= 0) { const next = this.ammo.findIndex(n => n > 0); if (next >= 0) this.shellIdx = next; }
    return true;
  }
  tryAbility() { return this.abilities ? this.abilities.tryActivate() : false; }
  selectShell(i) {
    this.abilities.usingSecondary = false;
    if (i === this.shellIdx || !this.spec.shells[i] || this.ammo[i] <= 0) return;
    this.shellIdx = i; this.reloadLeft = Math.max(this.reloadLeft, this.reloadTime() * (this.reloadLeft > 0 ? 1 : 0.85));
  }
  // Segment hit on the armor geometry at its current pose.
  rayTest(a, b) {
    return intersectArmor(this.model, this.spec, a, b, this.turretGone);
  }
  armorAt(hit, shellSpec, typeInfo) {
    const armorSpec = this.armorProfile ? { ...this.spec, armor: this.armorProfile } : this.spec;
    const A = armorSpec.armor;
    const [arm, zone] = armorZone(armorSpec, hit.part, hit.face, hit.local, hit.mantlet);
    const tmm = arm[0];
    const cosA = -hit.dirW.dot(hit.normalW);
    const { angle, los } = incidence(cosA, tmm);
    const normalW = hit.normalW.clone().multiplyScalar(cosA < 0 ? -1 : 1);
    let eff = los;
    const front = hit.face === 'front', hullSide = hit.part === 'hull' && hit.face === 'side';
    if (typeInfo.heat) { eff *= A.heatMult || 1; if (A.era && front) eff += A.era; if (A.eraSide && (hullSide || hit.part === 'turret' && hit.face === 'side')) eff += A.eraSide; if (A.skirt && hullSide) eff += A.skirt; }
    else if (!typeInfo.he && A.eraKE && (front || hullSide || hit.part === 'turret' && hit.face === 'side')) eff += A.eraKE;
    const tile = findEraTile(this.spec, hit);
    if (tile && !this.eraSpent.has(tile.key)) {
      if (typeInfo.heat) eff += tile.group.heat || 0;
      else if (!typeInfo.he && !typeInfo.hesh) eff += tile.group.ke || 0;
    }
    if (typeInfo.heat && this.spec.slatArmor && hit.face === 'rear') eff += this.spec.slatArmor.rearHeatBonus || 0;
    const tracks = hit.gear || (hullSide && hit.local.y < zoneLowerSideY(this.spec.dims));
    if (tracks) eff += 20;
    const overmatch = shellSpec.caliber > tmm * 3;
    const ricochet = !typeInfo.he && angle > typeInfo.ricochet && !overmatch;
    return { eff, los, angle, ricochet, tracks, nominal: tmm, zone, normalW };
  }
  // ----- damage -----
  consumeERA(hit, shellSpec, typeInfo) {
    const tile = findEraTile(this.spec, hit);
    if (!tile || this.eraSpent.has(tile.key)) return false;
    if (!typeInfo.heat && (typeInfo.he || typeInfo.hesh || !(tile.group.ke > 0))) return false;
    this.eraSpent.add(tile.key);
    return true;
  }
  damage(amount, attacker, cause) {
    if (!this.alive || amount <= 0) return;
    amount = Math.min(amount, this.hp); this.hp -= amount; this.stats.received += amount; this.lastDamagedAt = this.game.time;
    if (this.game.player && this.team !== this.game.player.team) this.game.hud?.recordEnemyDamage(this, amount, cause !== 'fire');
    if (attacker && attacker !== this && attacker.team !== this.team) { attacker.stats.damage += amount; this.lastAttacker = attacker; }
    if (this.hp <= 0.5) this.destroy(attacker, cause);
  }
  destroy(attacker, cause = 'destroyed') {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.burning = 0;
    const g = this.game; burnModel(this.model);
    const d = this.spec.dims;
    const p = this.model.body.localToWorld(new THREE.Vector3(0, d.hullH, 0));
    const groundY = g.world.groundHeight(p.x, p.z);
    const waterY = g.world.terrain.waterLevel(p.x, p.z);
    const water = waterY > groundY + 0.02;
    if (water) p.y = Math.max(p.y, waterY + 0.25);
    g.effects.wreckBlast(p, Math.max(groundY, waterY), water, d.W, cause === 'ammo');
    g.audio.impact(p, 'wreck');
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
    for (const c of this.crew) {
      let crewChance = shellSpec.type === 'APFSDS' ? 0.16 : shellSpec.type === 'HEAT' ? 0.22 : 0.2;
      if (this.spec.openTop) crewChance *= 1.65;
      if (this.spec.unmannedTurret && hit.part === 'turret') crewChance = 0.015;
      else if (this.spec.crewCapsule && hit.part === 'hull') crewChance *= 0.72;
      if (c.alive && r.next() < crewChance) { c.alive = false; msgs.push(c.role + ' knocked out'); }
    }
    if (this.crew.every((c) => !c.alive)) { this.damage(this.hp + 1, attacker, 'crew'); return msgs.concat(['Crew knocked out']); }
    this.damage(dmg, attacker, 'pen');
    return msgs;
  }
  get brokenTrackSide() {
    if (this.modules[this.mobilityModule] !== 0.5) return 0;
    return this.trackRepairs[0] > 0 ? -1 : 1;
  }
  updateTrackCondition() {
    this.modules[this.mobilityModule] = (Number(this.trackRepairs[0] === 0) + Number(this.trackRepairs[1] === 0)) / 2;
  }
  breakTracks(side = 0) {
    if (side <= 0) this.trackRepairs[0] = TRACK_REPAIR_TIME;
    if (side >= 0) this.trackRepairs[1] = TRACK_REPAIR_TIME;
    this.updateTrackCondition();
    if (side < 0) return 'Left ' + this.mobilityLabel.toLowerCase() + ' damaged';
    if (side > 0) return 'Right ' + this.mobilityLabel.toLowerCase() + ' damaged';
    return this.mobilityLabel + ' damaged';
  }
  repairTracks() {
    this.trackRepairs.fill(0);
    this.updateTrackCondition();
  }
}
