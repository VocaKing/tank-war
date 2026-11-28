// Tank entity: vehicle state, gun laying, firing, and module & crew damage
import * as THREE from 'three';
import { createTankModel, updateRunningGear, burnModel } from '../models/tankModel.js';
import { DEG, clamp, lerp, approach, approachAngle, wrapAngle } from '../util.js';
import { armorZone, zoneLowerSideY } from './tankData.js';
import { intersectArmor } from './armorGeometry.js';
import { trackCenterOffset } from './vehicleDimensions.js';
import { Abilities } from './abilities.js';
import { VehicleSkill } from './vehicleSkills.js';
import { TubeReload } from './tubeReload.js';
import { limitedYaw } from './fixedGunControl.js';
import { stabilizedMount, mountAngles, highArcMountYaw } from './mortarAim.js';
import { Equipment } from './items.js';
import { findEraTile } from './eraMechanics.js';
import { updateConceptTimers, precisionMultiplier, fireConceptMRSI, updateConceptMRSI } from './conceptSystems.js';
import { advanceDispersion, dispersionMotionActive, impactDrop, incidence, sampleDispersionRadius } from './combatMath.js';

import { GRAVITY } from './physics.js';

export { GRAVITY };
let NEXT_ID = 1;
const TRACK_REPAIR_TIME = 9;
const UP = new THREE.Vector3(0, 1, 0), AXIS_X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _aimPivot = new THREE.Vector3(), _aimMuzzle = new THREE.Vector3(), _aimMuzzleLocal = new THREE.Vector3();
const _aimAxisLocal = new THREE.Vector3(), _aimTarget = new THREE.Vector3(), _aimWorldTarget = new THREE.Vector3();
const _aimDirection = new THREE.Vector3(), _aimOffset = new THREE.Vector3(), _aimBearing = new THREE.Vector3();
const _aimTurretQ = new THREE.Quaternion(), _aimMuzzleQ = new THREE.Quaternion(), _aimYawQ = new THREE.Quaternion();

// Solve turret azimuth from the actual muzzle socket and its world-space bore axis.
// The previous solver aimed from the trunnion and assumed every barrel was exactly
// coaxial with the gun pivot. That leaves a visible horizontal error on short-range
// shots and on imported models whose barrel/socket has a local transform.
function solveHorizontalYaw(tank, target, bearingDirection, pitch, initialYaw) {
  const m = tank.model, turret = m.turret, mount = tank.gunMount, muzzle = tank.muzzleNode;
  if (!turret || !mount || !muzzle) return initialYaw;

  // Rebuild the current hull pose before measuring the real muzzle transform.
  m.root.position.copy(tank.pos);
  m.root.quaternion.copy(tank.quat);
  const stance = tank.vehicleSkill?.id === 'siege' && tank.vehicleSkill.toggled
    ? (tank.spec.hydroSuspension?.lowOffset || 0) * tank.vehicleSkill.fraction
    : tank.suspensionOffset || 0;
  m.body.position.y = stance;
  turret.rotation.y = tank.turretYaw;
  mount.rotation.x = -pitch;
  if (m.barrel) m.barrel.position.z = -tank.recoil * m.maxRecoil;
  m.root.updateMatrixWorld(true);

  turret.getWorldPosition(_aimPivot);
  muzzle.getWorldPosition(_aimMuzzle);
  turret.worldToLocal(_aimMuzzleLocal.copy(_aimMuzzle));
  turret.getWorldQuaternion(_aimTurretQ);
  muzzle.getWorldQuaternion(_aimMuzzleQ);
  _aimAxisLocal.set(0, 0, 1).applyQuaternion(_aimMuzzleQ)
    .applyQuaternion(_aimTurretQ.invert()).normalize();

  if (bearingDirection && Math.hypot(bearingDirection.x, bearingDirection.z) > 1e-5) {
    _aimBearing.copy(bearingDirection).setY(0).normalize();
    _aimWorldTarget.copy(_aimPivot).addScaledVector(_aimBearing, 1000);
  } else {
    _aimWorldTarget.copy(target);
  }
  if (Math.hypot(_aimWorldTarget.x - _aimPivot.x, _aimWorldTarget.z - _aimPivot.z) < 0.75) return initialYaw;
  if (Math.hypot(_aimAxisLocal.x, _aimAxisLocal.z) < 1e-4) return initialYaw;

  const evaluate = yaw => {
    _aimYawQ.setFromAxisAngle(UP, yaw);
    _aimOffset.copy(_aimMuzzleLocal).applyQuaternion(_aimYawQ).applyQuaternion(tank.quat);
    _aimMuzzle.copy(_aimPivot).add(_aimOffset);
    _aimDirection.copy(_aimAxisLocal).applyQuaternion(_aimYawQ).applyQuaternion(tank.quat);
    _aimTarget.copy(_aimWorldTarget).sub(_aimMuzzle);
    return {
      cross: _aimDirection.x * _aimTarget.z - _aimDirection.z * _aimTarget.x,
      dot: _aimDirection.x * _aimTarget.x + _aimDirection.z * _aimTarget.z,
      range: Math.hypot(_aimTarget.x, _aimTarget.z),
      axis: Math.hypot(_aimDirection.x, _aimDirection.z),
    };
  };

  let yaw = initialYaw;
  for (let i = 0; i < 12; i++) {
    const e = evaluate(yaw);
    if (e.range < 0.75 || e.axis < 1e-4 || Math.abs(e.cross) < Math.max(1e-7, e.range * 1e-7)) break;
    const eps = 1e-4;
    const derivative = (evaluate(yaw + eps).cross - evaluate(yaw - eps).cross) / (2 * eps);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-7) break;
    const step = clamp(e.cross / derivative, -0.45, 0.45);
    yaw = wrapAngle(yaw - step);
    if (Math.abs(step) < 1e-7) break;
  }
  let final = evaluate(yaw);
  if (final.dot <= 0) {
    const opposite = wrapAngle(yaw + Math.PI);
    const other = evaluate(opposite);
    if (other.dot > final.dot) { yaw = opposite; final = other; }
  }
  return final.dot > 0 && Number.isFinite(yaw) ? yaw : initialYaw;
}

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
    this.vehicleSkill = new VehicleSkill(this);
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
    this.weaponModeIndex = 0; this.tubeReload = spec.id==='m50ontos' ? new TubeReload(spec.multiTube.offsets.length) : null; this.burstLeft = 0; this.burstTimer = 0; this.burstShellIdx = 0; this.burstOffsetIndex = 0;
    this.suspensionMode = 'normal'; this.suspensionOffset = 0;
    this.secondaryRounds = spec.secondary?.rounds ?? 0;
    this.secondaryReloadLeft = 0;
    this.trackRepairs = [0, 0]; this.burning = 0;
    this.crew = spec.crew.map((role) => ({ role, alive: true }));
    this.input = { throttle: 0, steer: 0, brake: false, driveHeld: false, aim: new THREE.Vector3(), aimBearing: null };
    this.hullAiming = false;
    this.lastFired = -100; this.inBush = null; this.visibleUntil = [0, 0]; this.spotted = [false, false]; this.lastSeenPos = [null, null];
    this.stats = { damage: 0, kills: 0, shots: 0, hits: 0, pens: 0, received: 0 };
    this.lastAttacker = null; this.lastDamagedAt = -100; this.inWater = false; this.groundY = 0; this.moved = 0;
    this.inv = new THREE.Matrix4(); this.equip = new Equipment(this, items);
  }
  get shell() { return this.abilities.usingSecondary ? this.spec.secondary.shell : this.spec.shells[this.shellIdx]; }
  get fireReloadLeft() { return this.abilities.usingSecondary ? this.secondaryReloadLeft : this.tubeReload ? Math.max(this.reloadLeft,this.tubeReload.readyIn(this.spec.multiTube.modes[this.weaponModeIndex].count,this.ammo[this.shellIdx])) : this.reloadLeft; }
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
  reloadTime() { const s = this.spec; let r = s.reload; if (!s.autoloader && !this.crewAlive('Loader')) r *= 1.4; if (this.modules.gun < 1) r *= 1.3; if (this.equip.active('reload')) r *= 0.7; return r * (this.vehicleSkill?.reloadMult ?? 1); }
  aimTime() { let a = this.spec.aimTime; if (!this.crewAlive('Gunner')) a *= 1.5; if (this.suppressedFor > 0) a *= this.spec.openTop ? 1.9 : 1.28; if (this.spec.turretElectronicsWeakness && this.modules.turret < 1) a *= this.spec.turretElectronicsWeakness; return a * (this.vehicleSkill?.aimMult ?? 1); }
  // Balance values are cone radii in metres at 100 m.
  dispersion() {
    const radius = lerp(this.spec.dispersion, this.spec.maxDispersion, this.dispersionProgress);
    return Math.atan(radius / 100) * precisionMultiplier(this) * (this.vehicleSkill?.dispersionMult ?? 1) * (this.game.time < (this.skillShockUntil || 0) ? this.skillShockMult || 1 : 1) * (this.suppressedFor > 0 ? (this.spec.openTop ? 1.55 : 1.2) : 1);
  }
  updateDispersion(dt) {
    if (this.spec.dispersion === this.spec.maxDispersion) {
      this.dispersionProgress = 0;
      return;
    }
    // Motion bloom is driven by the vehicle and gun, never by camera aim distance.
    // A stabilizer slows bloom while preserving the same configured maximum.
    const moving = dispersionMotionActive(this.speed, this.turnRate, this.yawRate);
    const stabilization = moving && this.abilities.isStabilized ? 2 : 1;
    this.dispersionProgress = advanceDispersion(this.dispersionProgress, moving, dt, this.aimTime() * stabilization);
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
    this.vehicleSkill?.update(dt);
    this.tubeReload?.update(dt);
    if (this.apsCooldown > 0) this.apsCooldown = Math.max(0, this.apsCooldown - dt);
    updateConceptTimers(this, dt);
    if (Math.abs(this.speed) > 0.5 || this.lastMoving === undefined) this.lastMoving = time;
    if (this.trackRepairs[0] > 0 || this.trackRepairs[1] > 0) {
      const previous = this.modules[this.mobilityModule];
      this.trackRepairs[0] = Math.max(0, this.trackRepairs[0] - dt * (this.vehicleSkill?.repairMult ?? 1));
      this.trackRepairs[1] = Math.max(0, this.trackRepairs[1] - dt * (this.vehicleSkill?.repairMult ?? 1));
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

  updateAfterMotion(dt, updateGun = true) {
    if (this.alive) {
      this.abilities.updateDozer(dt);
      this.vehicleSkill?.motion(dt);
      const half = trackCenterOffset(this.spec.dims);
      updateRunningGear(this.model,
        this.trackRepairs[0] > 0 ? 0 : (this.speed + this.turnRate * half) * dt,
        this.trackRepairs[1] > 0 ? 0 : (this.speed - this.turnRate * half) * dt);
      this.moved += Math.abs(this.speed) * dt;
      if (updateGun) this.updateTurret(dt);
      // Update after the gun servo so this frame's turret traverse contributes
      // to dispersion immediately rather than one frame late.
      this.updateDispersion(dt);
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
    const aim = _v.copy(this.input.aim).sub(this.pos).applyQuaternion(_q.copy(pose).invert()).sub(m.body.position).sub(m.turret.position);
    if (s.fixedGun) this.turretYaw = 0;
    if (!Number.isFinite(aim.x + aim.y + aim.z)) return;
    // Solve around the turret axis. The trunnion moves as the turret turns,
    // so aiming from its current position can oscillate at point-blank range.
    const range = Math.hypot(aim.x, aim.z);
    const mount = this.gunMount.position;
    const stabilize=stabilizedMount(s);
    let yaw = range > (stabilize?Math.max(.6,Math.abs(mount.x)+.25):1e-4)
      ? Math.atan2(aim.x, aim.z) - Math.asin(clamp(mount.x / range, -1, 1))
      : this.turretYaw;
    if(stabilize&&this.input.aimBearing){
      _v2.copy(this.input.aimBearing).applyQuaternion(_q.copy(pose).invert());
      if(Math.hypot(_v2.x,_v2.z)>1e-5)yaw=Math.atan2(_v2.x,_v2.z);
    }
    // Separate azimuth from the steep elevation vector for indirect-fire
    // vehicles. Chassis pitch/roll must not turn a nearly vertical barrel
    // direction into a different horizontal turret target.
    if(s.artillery?.highArc){
      if(this.input.aimBearing){
        const b=this.input.aimBearing;
        yaw=highArcMountYaw(b.x*100,b.z*100,this.heading,this.turretYaw);
      }else{
        _v2.copy(m.body.position).add(m.turret.position).applyQuaternion(pose).add(this.pos);
        yaw=highArcMountYaw(this.input.aim.x-_v2.x,this.input.aim.z-_v2.z,this.heading,this.turretYaw,mount.x);
      }
    }
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const rise = aim.y - mount.y;
    const forward = stabilize&&this.input.aimBearing ? Math.max(.01,range-mount.z) : aim.x * sin + aim.z * cos - mount.z;
    // Converge upwards no closer than the muzzle. Nearby surfaces above the
    // gun pivot would otherwise demand steep angles for tiny height changes.
    const aimRange = Math.max(forward, rise > 0 ? this.muzzleNode.position.z : 0.01);
    _v2.set(sin * aimRange, rise, cos * aimRange).applyQuaternion(pose);
    const { x: dx, y: dy, z: dz } = _v2;
    const horizontal = Math.hypot(dx, dz);
    const th = ballisticAngle(this.shell.velocity, horizontal, dy, !!s.artillery?.highArc);
    _v2.set(dx / (horizontal || 1) * Math.cos(th), Math.sin(th), dz / (horizontal || 1) * Math.cos(th));
    _q.copy(pose).invert(); _v2.applyQuaternion(_q);
    const angles=stabilize?mountAngles(_v2,yaw,s.gunElevation*DEG):null;
    const rawYawT=s.artillery?.highArc?yaw:angles?angles.yaw:Math.atan2(_v2.x,_v2.z),pitchT=angles?angles.pitch:Math.asin(clamp(_v2.y,-1,1));
    let yawT = rawYawT;
    const prev = this.turretYaw;
    let minPitch=this.model.gunPitchFloor(yawT,-s.gunDepression*DEG,s.gunElevation*DEG);
    let desiredPitch=clamp(pitchT,minPitch,s.gunElevation*DEG);
    let nextPitch=clamp(approach(this.gunPitch,desiredPitch,s.gunSpeed*DEG*dt),minPitch,s.gunElevation*DEG);
    if (!s.fixedGun) {
      const targetYaw = solveHorizontalYaw(this, this.input.aim, this.input.aimBearing, nextPitch, yawT);
      yawT = targetYaw;
      // A model's gun-clearance floor can depend on azimuth. Re-evaluate it
      // after the horizontal solution, without changing the ballistic pitch target.
      minPitch=this.model.gunPitchFloor(yawT,-s.gunDepression*DEG,s.gunElevation*DEG);
      desiredPitch=clamp(pitchT,minPitch,s.gunElevation*DEG);
      nextPitch=clamp(approach(this.gunPitch,desiredPitch,s.gunSpeed*DEG*dt),minPitch,s.gunElevation*DEG);
      this.turretYaw = s.fireArc ? limitedYaw(prev,yawT,s.fireArc*DEG,s.turretTraverse*DEG*(this.modules.turret<1?0.5:1)*(this.crewAlive('Gunner')?1:0.7)*dt)
        : wrapAngle(approachAngle(prev,yawT,s.turretTraverse*DEG*(this.modules.turret<1?0.5:1)*(this.crewAlive('Gunner')?1:0.7)*dt));
    }
    this.yawRate = Math.abs(wrapAngle(this.turretYaw - prev)) / Math.max(dt, 1e-4);
    this.gunPitch=nextPitch;
    this.aimError=Math.abs(wrapAngle(yawT-this.turretYaw))+Math.abs(desiredPitch-this.gunPitch);
  }
  syncModel() {
    const m = this.model; m.root.position.copy(this.pos); m.root.quaternion.copy(this.quat);
    const stance = this.vehicleSkill?.id==='siege' && this.vehicleSkill.toggled ? (this.spec.hydroSuspension?.lowOffset||0)*this.vehicleSkill.fraction : this.suspensionOffset||0;
    m.body.position.y = stance;
    // The casemate geometry is attached to the hull; never rotate it as a turret.
    if(this.spec.fixedGun)this.turretYaw=0;
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
  gunDirection() {
    // The muzzle socket carries the imported barrel's actual local axis; do not
    // infer bore direction from the gun pivot and silently ignore barrel offsets.
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.muzzleNode.getWorldQuaternion(_q)).normalize();
  }
  spreadDirection(dir) {
    const cone = Math.tan(this.dispersion());
    const radius = cone > 0 ? cone * sampleDispersionRadius(this.game.rng) : 0;
    this.lastDeviation = Math.atan(radius);
    if (!radius) return dir;
    const angle = this.game.rng.range(0, 2 * Math.PI);
    const tangent = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.95 ? UP : AXIS_X).normalize();
    const bitangent = new THREE.Vector3().crossVectors(dir, tangent);
    return dir.addScaledVector(tangent, radius * Math.cos(angle)).addScaledVector(bitangent, radius * Math.sin(angle)).normalize();
  }
  roundMuzzle(offset = null, index = 0) {
    const { muzzles, gun, muzzle } = this.model;
    const pos = new THREE.Vector3();
    if (muzzles?.length) return muzzles[index % muzzles.length].getWorldPosition(pos);
    return offset ? gun.localToWorld(pos.fromArray(offset)) : muzzle.getWorldPosition(pos);
  }
  roundSpec(shell, origin, aim) {
    if (!shell.airburst) return shell;
    const fuseTime = Math.max(0.05, (origin.distanceTo(aim) - (shell.fuseLeadDistance || 0)) / Math.max(1, shell.velocity));
    return { ...shell, fuseTime };
  }
  previewLaunch(aim) {
    const multi = !this.abilities.usingSecondary && (this.spec.multiTube || this.spec.burst || this.spec.mrsi);
    const muzzles = multi && (this.burstLeft > 0 ? this.spec.burst?.offsets : this.spec.multiTube?.offsets);
    const index = this.tubeReload ? (this.tubeReload.available(this.spec.multiTube.modes[this.weaponModeIndex].count,this.ammo[this.shellIdx])[0] ?? this.tubeReload.cursor) : multi && this.burstLeft > 0 ? this.burstOffsetIndex : 0;
    const muzzle = multi ? this.roundMuzzle(muzzles?.length ? muzzles[index % muzzles.length] : null, index)
      : this.muzzleNode.getWorldPosition(new THREE.Vector3());
    const origin = this.shotOrigin(muzzle);
    const shell = this.roundSpec(this.previewShell, origin, aim);
    const direction = this.gunDirection();
    const velocity = direction.clone().multiplyScalar(shell.velocity).add(this.vel);
    return { origin, shell, velocity };
  }
  tryFire(time) {
    if (!this.alive || this.afloat || this.fireReloadLeft > 0 || this.vehicleSkill?.canFire === false) return false;
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
    const origin = this.shotOrigin(this.muzzleNode.getWorldPosition(new THREE.Vector3()));
    const dir = this.spreadDirection(this.gunDirection());
    const vel = dir.clone().multiplyScalar(sh.velocity).add(this.vel);
    let fireShell = this.roundSpec(sh, origin, this.input.aim);
    if (this.abilities && this.abilities.overpenLeft > 0) {
      const mult = this.abilities.consumeOverpen();
      fireShell = { ...fireShell, pen: Math.round(sh.pen * mult) };
    }
    if (!secondary && this.vehicleSkill) fireShell = this.vehicleSkill.onShot(fireShell);
    g.ballistics.spawn(this, fireShell, origin, vel, sh.guided ? this.input.aim.clone() : undefined);
    this.lastFired = time; this.stats.shots++;
    if (secondary) {
      this.secondaryRounds--;
      this.secondaryReloadLeft = this.spec.secondary.reload * (this.modules.gun < 1 ? 1.3 : 1);
    } else {
      this.ammo[this.shellIdx]--;
      this.reloadLeft = this.vehicleSkill?.afterReload(this.reloadTime()) ?? this.reloadTime();
      this.abilities.onFire();
      this.recoil = 1;
      if (this.ammo[this.shellIdx] <= 0) {
        const next = this.ammo.findIndex(count => count > 0);
        if (next >= 0) this.shellIdx = next;
      }
    }
    g.physics?.recoil(this, this.gunMount.getWorldPosition(_v), dir, sh.caliber);
    g.effects.muzzle(origin, dir, sh.caliber, this.spec, sh.guided ? 'guided' : secondary ? 'secondary' : 'gun'); g.audio.gun(origin, sh.caliber, this.isPlayer, this.spec.id, {kind:sh.guided?'guided':secondary?'secondary':'gun'});
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
    const shell = this.spec.shells[shellIndex];
    const muzzle = this.shotOrigin(this.roundMuzzle(offset, muzzleIndex));
    const dir = this.spreadDirection(this.gunDirection());
    const velocity = dir.clone().multiplyScalar(shell.velocity).add(this.vel);
    let fireShell = this.roundSpec(shell, muzzle, this.input.aim);
    if (this.abilities?.overpenLeft > 0) {
      const mult = this.abilities.consumeOverpen();
      fireShell = { ...fireShell, pen: Math.round(fireShell.pen * mult) };
    }
    if (this.vehicleSkill) fireShell = this.vehicleSkill.onShot(fireShell);
    this.game.ballistics.spawn(this, fireShell, muzzle, velocity, shell.guided ? this.input.aim.clone() : undefined);
    return { muzzle, dir, caliber: shell.caliber };
  }
  fireBurstRound(time) {
    const cfg = this.spec.burst, index = this.burstShellIdx;
    if (!cfg || this.ammo[index] <= 0 || this.burstLeft <= 0 || this.vehicleSkill?.canFire === false) { this.burstLeft = 0; return; }
    const offsets = cfg.offsets || [];
    const shot = this.spawnRound(index, offsets.length ? offsets[this.burstOffsetIndex % offsets.length] : null, this.burstOffsetIndex);
    this.burstOffsetIndex++; this.ammo[index]--; this.stats.shots++; this.lastFired = time; this.recoil = 0.35;
    this.game.effects.muzzle(shot.muzzle, shot.dir, shot.caliber, this.spec, this.spec.shells[index].guided ? 'guided' : 'gun'); this.game.audio.gun(shot.muzzle, shot.caliber, this.isPlayer, this.spec.id, {kind:this.spec.shells[index].guided?'guided':'gun'});
    this.game.physics?.recoil(this, shot.muzzle, shot.dir, shot.caliber);
    this.burstLeft--;
    if (this.burstLeft > 0 && this.ammo[index] > 0) {
      this.reloadLeft = cfg.interval * (this.vehicleSkill?.burstIntervalMult ?? 1); this.burstTimer = this.reloadLeft;
    } else {
      this.burstLeft = 0; this.reloadLeft = this.reloadTime();
      if (this.ammo[index] <= 0) { const next = this.ammo.findIndex(n => n > 0); if (next >= 0) this.shellIdx = next; }
    }
  }
  tryFireSpecial(time) {
    const index = this.shellIdx, shell = this.spec.shells[index];
    if (this.tubeReload) return this.fireIndependentTubes(time);
    if (this.ammo[index]<=0) return false;
    if (this.spec.mrsi && this.ammo[index] >= 2) return fireConceptMRSI(this, time);
    const mode = this.spec.multiTube?.modes?.[this.weaponModeIndex] || { count: 1, reloadMult: 1 };
    const count = Math.min(mode.count || 1, this.ammo[index]);
    const offsets = this.spec.multiTube?.offsets || [];
    let first = null;
    for (let i = 0; i < count; i++) {
      const shot = this.spawnRound(index, offsets.length ? offsets[i % offsets.length] : null, i);
      if (!first) first = shot;
      this.game.audio.gun(shot.muzzle,shot.caliber,this.isPlayer,this.spec.id,{kind:shell.guided?'guided':'gun',salvoCount:count,offset:i*.009});
      this.game.effects.muzzle(shot.muzzle, shot.dir, shot.caliber, this.spec, shell.guided ? 'guided' : 'gun');
      this.game.physics?.recoil(this, shot.muzzle, shot.dir, shot.caliber);
    }
    this.ammo[index] -= count; this.reloadLeft = this.reloadTime() * (mode.reloadMult || 1);
    this.lastFired = time; this.stats.shots += count; this.abilities?.onFire(); this.recoil = 1;
    // Each fired round emits its own audio event.
    if (this.spec.burst && this.spec.burst.shellIndices.includes(index)) {
      this.burstLeft = Math.max(0, this.spec.burst.count - 1); this.burstShellIdx = index;
      this.burstTimer = this.spec.burst.interval * (this.vehicleSkill?.burstIntervalMult ?? 1); this.burstOffsetIndex = this.model.muzzles ? 1 : 0;
      if (this.burstLeft > 0) this.reloadLeft = this.burstTimer;
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
  fireIndependentTubes(time) {
    const index=this.shellIdx, mode=this.spec.multiTube.modes[this.weaponModeIndex];
    const tubes=this.tubeReload.available(mode.count,this.ammo[index]);
    if(!tubes.length||this.reloadLeft>0)return false;
    let first=null;
    for(const [order,i] of tubes.entries()){
      const shot=this.spawnRound(index,this.spec.multiTube.offsets[i],i);
      first??=shot;
      this.game.audio.gun(shot.muzzle,shot.caliber,this.isPlayer,this.spec.id,{kind:'tube',salvoCount:tubes.length,offset:order*.014});
      this.game.effects.muzzle(shot.muzzle, shot.dir, shot.caliber, this.spec, 'tube');
      this.game.physics?.recoil(this,shot.muzzle,shot.dir,shot.caliber);
    }
    this.tubeReload.fire(tubes,this.reloadTime()*(mode.reloadMult||1));
    this.ammo[index]-=tubes.length;this.reloadLeft=0.45;this.recoil=1;
    this.lastFired=time;this.stats.shots+=tubes.length;
    // Independent tubes emit individually.
    if(this.ammo[index]<=0){const next=this.ammo.findIndex(n=>n>0);if(next>=0){this.shellIdx=next;this.tubeReload.changeAmmo(this.reloadTime()*0.85);}}
    return true;
  }
  tryAbility() { return this.abilities ? this.abilities.tryActivate() : false; }
  selectShell(i) {
    this.abilities.usingSecondary = false;
    if (i === this.shellIdx || !this.spec.shells[i] || this.ammo[i] <= 0) return;
    this.shellIdx = i; this.reloadLeft = Math.max(this.reloadLeft, this.reloadTime() * (this.reloadLeft > 0 ? 1 : 0.85));
    this.tubeReload?.changeAmmo(this.reloadLeft);
  }
  // Segment hit on the armor geometry at its current pose.
  rayTest(a, b) {
    return intersectArmor(this.model, this.spec, a, b, this.turretGone, true);
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
    this.game.resetControlContribution?.(this);
    if (!['ammo','crew','fire','drown','explosion'].includes(cause)) { amount *= this.vehicleSkill?.damageMult ?? 1; this.vehicleSkill?.damaged(); }
    amount = Math.min(amount, this.hp); this.hp -= amount; this.stats.received += amount; this.lastDamagedAt = this.game.time;
    if (cause !== 'fire') this.game.hud?.recordDamage(this, amount);
    if (attacker && attacker !== this && attacker.team !== this.team) { attacker.stats.damage += amount; this.lastAttacker = attacker; }
    if (this.hp <= 0.5) this.destroy(attacker, cause);
  }
  destroy(attacker, cause = 'destroyed') {
    if (!this.alive) return;
    this.game.resetControlContribution?.(this);
    this.alive = false; this.hp = 0; this.burning = 0;
    const g = this.game; burnModel(this.model);
    if (cause === 'ammo') g.hud?.recordModuleLoss(this, '弹药架殉爆');
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
  damageModule(module) {
    if (this.modules[module] !== 1) return false;
    if ((this.vehicleSkill?.moduleMult ?? 1) < 1 && this.game.rng.next() > this.vehicleSkill.moduleMult) return false;
    this.modules[module] = 0.5;
    const label = {
      engine: '发动机受损',
      gun: '主炮受损',
      turret: this.spec.casemate ? '炮架受损' : '炮塔座圈卡住',
    }[module];
    this.game.hud?.recordModuleLoss(this, label);
    return true;
  }
  // apply a resolved hit (penetration or HE blast) with module & crew effects
  applyPenetration(hit, shellSpec, attacker, dmg, trackHit = false) {
    const g = this.game; const r = g.rng; const msgs = [];
    const L = this.spec.dims.L; const lz = hit.local.z;
    if (hit.part === 'hull') {
      if ((this.spec.engineZone === 'rear' && (lz < -L * 0.22 || hit.face === 'rear')) || (this.spec.engineZone === 'front' && (lz > L * 0.22 || hit.face === 'front'))) { if (this.damageModule('engine')) msgs.push('Engine damaged'); if (r.next() < 0.22) { this.burning = 7; msgs.push('Fire!'); } }
      const ar = this.spec.ammoRack;
      if (!ar.turretBustle && lz > ar.zMin && lz < ar.zMax && hit.local.y < ar.yMax && r.next() < ar.chance * (shellSpec.type === 'HEAT' ? 1.3 : 1)) { this.damage(this.hp + 1, attacker, 'ammo'); return ['AMMO RACK DETONATED']; }
      if (trackHit || hit.local.y < this.spec.dims.clearance + 0.5) {
        msgs.push(this.breakTracks(hit.sideSign || Math.sign(hit.local.x)));
      }
    } else {
      if (hit.face === 'front' && r.next() < 0.35 && this.damageModule('gun')) msgs.push('Gun damaged');
      if (!this.spec.casemate && (hit.face === 'side' || hit.face === 'rear') && r.next() < 0.3 && this.damageModule('turret')) msgs.push('Turret ring jammed');
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
    const part = this.mobilityModule === 'wheels' ? '侧车轮损毁' : '履带断裂';
    if (side <= 0) {
      if (!this.trackRepairs[0]) this.game.hud?.recordModuleLoss(this, '左' + part);
      this.trackRepairs[0] = TRACK_REPAIR_TIME;
    }
    if (side >= 0) {
      if (!this.trackRepairs[1]) this.game.hud?.recordModuleLoss(this, '右' + part);
      this.trackRepairs[1] = TRACK_REPAIR_TIME;
    }
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
