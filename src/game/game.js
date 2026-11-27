// Match orchestration: world, teams, input, camera, spotting, capture, win conditions
import * as THREE from 'three';
import { World } from '../world/world.js';
import { setWindTime } from '../world/vegetation.js';
import { TANKS, TANK_BY_ID, sanitizeLoadout, npcLoadout, PEN_RNG } from './tankData.js';
import { BattlefieldPhysics } from './physics.js';
import { Tank } from './tank.js';
import { Ballistics } from './ballistics.js';
import { Spotting } from './spotting.js';
import { NavGrid } from './nav.js';
import { AIController } from './ai.js';
import { Effects } from './effects.js';
import { HUD } from '../ui/hud.js';
import { ArmorView } from './armorView.js';
import { sanitizeItems, DEFAULT_ITEMS } from './items.js';
import { setTrackLOD } from '../models/tankModel.js';
import { RNG, clamp, DEG } from '../util.js';
import { Post } from '../render/post.js';
import { ContactShadows } from '../render/contactShadows.js';
import { TrackMarks } from '../render/trackMarks.js';
import { Outline } from '../render/outline.js';
import { AimAssist } from './aimAssist.js';
import { TouchControls, isMobile } from '../ui/touchControls.js';
import { zoomFov, projectedSpreadRadius } from './combatMath.js';
import { createControl, updateControl, resetControlCredit } from './controlCapture.js';
import { skillKey } from './vehicleSkills.js';
function withinPathXZ(p, origin, dx, dz, radius) {
  const x = p.x - origin.x, z = p.z - origin.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0 ? clamp((x * dx + z * dz) / lengthSquared, 0, 1) : 0;
  const ex = x - dx * t, ez = z - dz * t;
  return ex * ex + ez * ez <= radius * radius;
}

const ALLY_NAMES = ['Sgt. Miller', 'Cpl. Novak', 'Lt. Hayes', 'Sgt. Dubois', 'Pvt. Kowalski', 'Cpt. Reyes', 'Sgt. Okafor', 'Lt. Varga'];
const ENEMY_NAMES = ['Lt. Weber', 'Sgt. Volkov', 'Cpt. Brandt', 'Sgt. Petrov', 'Uffz. Krüger', 'Lt. Orlov', 'Sgt. Haas', 'Cpl. Zaitsev'];


export class Game {
  static ZOOMS = [2, 4, 8, 16];
  constructor(renderer, uiRoot, audio, opts) {
    this.renderer = renderer; this.audio = audio; this.opts = opts; this.rng = new RNG(opts.seed || ((Math.random() * 1e9) | 0));
    this.quality = opts.quality || 'high'; this.world = new World(renderer, opts.mapId, opts.quality); this.scene = this.world.scene;
    this.physics = new BattlefieldPhysics(opts.physicsEngine, this.world);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 6000);
    this.time = 0; this.timeLimit = 15 * 60; this.paused = false; this.ended = false; this.flying = [];
    this.effects = new Effects(this.scene, renderer, opts.mapId === 'desert' ? [0.78, 0.68, 0.52] : opts.mapId === 'forest' ? [0.45, 0.42, 0.36] : [0.58, 0.54, 0.46], this.quality);
    this.ballistics = new Ballistics(this); this.spotting = new Spotting(this); this.nav = new NavGrid(this.world);
    this.capture = [{ points: 0 }, { points: 0 }]; this.smokes = [];
    this.control = createControl();
    this.tanks = []; this.ai = [];
    this.spawnTeams(opts.tankId);
    this.player = this.tanks[0];
    this.contactShadows = new ContactShadows(this.world, this.tanks);
    this.trackMarks = new TrackMarks(this.world, this.tanks, this.quality);
    this.cam = { yaw: this.player.heading, pitch: -0.12, dist: 14, sniper: false, zoom: 4, fov: 60, follow: this.player };
    this.armorView = new ArmorView(this);
    this.assist = new AimAssist(this, opts.aimAssist !== false);
    this.keys = {}; this.mouseDown = false; this.aimPoint = this.player.input.aim.clone();
    this.cursorPoint = this.aimPoint.clone();
    this.hud = new HUD(uiRoot, this);
    this.bindInput();
    if (isMobile()) this.touch = new TouchControls(this);
    if (this.quality === 'high' && !opts.noPost && renderer.extensions.has('EXT_color_buffer_float')) {
      try { this.post = new Post(renderer, this.scene, this.camera); }
      catch (e) { console.warn('post-processing disabled', e); this.post = null; }
    }
    try { this.outline = new Outline(renderer, this.quality); } catch (e) { console.warn('outline disabled', e); this.outline = null; }
    this.resize();
    this.debug = this.makeDebug();
  }
  // tier matchmaking: the player's tier weighs 3, adjacent tiers 1; max 2 copies of a tank per team
  static matchmake(playerTankId, r) {
    const me = TANK_BY_ID[playerTankId]; const team = [playerTankId]; const count = { [playerTankId]: 1 };
    const pool = TANKS.filter((t) => Math.abs(t.tier - me.tier) <= 1).map((t) => ({ id: t.id, w: t.tier === me.tier ? 3 : 1 }));
    while (team.length < 7) {
      const cand = pool.filter((p) => (count[p.id] || 0) < 2); const tot = cand.reduce((a, p) => a + p.w, 0); let x = r.next() * tot; let pick = cand[0];
      for (const p of cand) { x -= p.w; if (x <= 0) { pick = p; break; } }
      team.push(pick.id); count[pick.id] = (count[pick.id] || 0) + 1;
    }
    return team;
  }
  spawnTeams(playerTankId) {
    const team0 = Game.matchmake(playerTankId, this.rng); const r = this.rng;
    // mirrored matchmaking: the enemy gets the same multiset of tanks (shuffled), so both teams are equal on paper
    const team1 = team0.slice().sort(() => r.next() - 0.5);
    this.lineup = { team0, team1 };
    const roles = ['assault', 'sniper', 'assault', 'defender', 'assault', 'sniper', 'assault'];
    const lanes = [1, 0, 2, 1, 0, 2, 1];
    for (let team = 0; team < 2; team++) {
      const base = this.world.bases[team], other = this.world.bases[1 - team];
      const dx = other.x - base.x, dz = other.z - base.z; const l = Math.hypot(dx, dz); const fx = dx / l, fz = dz / l; const px = -fz, pz = fx;
      const list = team ? team1 : team0; const names = (team ? ENEMY_NAMES : ALLY_NAMES).slice().sort(() => r.next() - 0.5);
      list.forEach((id, i) => {
        const isPlayer = team === 0 && i === 0;
        const stock = TANK_BY_ID[id];
        const spec = isPlayer && this.opts.fixedGunTest ? { ...stock, fixedGun: true } : stock;
        const lo = isPlayer ? sanitizeLoadout(spec, this.opts.loadout) : npcLoadout(spec, r); const items = isPlayer ? sanitizeItems(this.opts.items || DEFAULT_ITEMS) : (r.next() < 0.5 ? ['repair', 'extinguisher', 'medkit'] : r.next() < 0.5 ? ['repair', 'medkit', 'reload'] : ['repair', 'extinguisher', 'smoke']);
        const t = new Tank(this, spec, team, isPlayer ? 'You' : names[i], isPlayer, lo, items);
        let x = base.x + fx * (18 + (i % 3) * 16) + px * ((i - 3) * 22 + r.range(-6, 6)) + r.range(-8, 8), z = base.z + fz * (18 + (i % 3) * 16) + pz * ((i - 3) * 22 + r.range(-6, 6)) + r.range(-8, 8);
        const [ci, cj] = this.nav.nearestWalkable(...this.nav.toCell(x, z)); [x, z] = this.nav.center(ci, cj);
        t.placeAt(x, z, Math.atan2(fx, fz)); t.input.aim.set(x + fx * 300, t.pos.y + 2, z + fz * 300);
        this.tanks.push(t);
        if (!isPlayer) this.ai.push(new AIController(this, t, spec.casemate && spec.cls==='Tank Destroyer' ? 'sniper' : roles[i], lanes[i], 0.8 + r.next() * 0.5));
      });
    }
  }
  bindInput() {
    const c = this.renderer.domElement; this._h = {};
    const on = (tgt, ev, fn, o) => { tgt.addEventListener(ev, fn, o); (this._h[ev] ||= []).push([tgt, fn]); };
    on(window, 'keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); this.hud.scoreboard(true); }
      if (e.code === 'Escape') { this.setPaused(!this.paused); }
      this.keys[e.code] = true; this.audio.init(); this.audio.resume();
      const p = this.player; if (!p.alive || this.paused) return;
      if (e.code === 'Digit1') p.selectShell(0); if (e.code === 'Digit2') p.selectShell(1); if (e.code === 'Digit3') p.selectShell(2);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.toggleSniper();
      if (e.code === 'KeyX') { const on = this.armorView.toggle(); this.hud.message('Armor view ' + (on ? 'ON' : 'OFF') + ' (sniper mode)', on ? '#9fd39f' : '#c8c8c8'); }
      if (e.code === 'KeyE' && !e.repeat) this.toggleLock();
      if (e.code === 'KeyG' && !e.repeat) { const ok = skillKey(p.spec)==='G' ? p.vehicleSkill.activate() : p.tryAbility(); if (!ok) this.hud.message('技能未就绪或条件不足', '#c8c8c8'); }
      if (e.code === 'KeyK' && !e.repeat && skillKey(p.spec)==='K') { if (!p.vehicleSkill.activate()) this.hud.message('专属技能未就绪或条件不足','#c8c8c8'); }
      if (e.code === 'KeyB' && !e.repeat) {
        if (p.usesSpade?.()) p.toggleSpade();
        else if (p.spec.artillery?.autoDeploy) {
          if (p.autoArtilleryState === 'stowed' && Math.abs(p.speed) < 0.3) { p.autoArtilleryState = 'deploying'; p.autoArtilleryTimer = p.spec.artillery.deploySeconds || 1; }
          else if (p.autoArtilleryState === 'deployed') { p.autoArtilleryState = 'packing'; p.autoArtilleryTimer = p.spec.artillery.packSeconds || 1; p.pendingFire = false; }
        }
      }
      if (e.code === 'KeyV' && !e.repeat) p.cycleWeaponMode?.();
      if (e.code === 'KeyN' && !e.repeat) p.cycleArmorPackage?.();
      if (e.code === 'KeyH' && !e.repeat) p.toggleSuspension?.();
      const slot = { Digit4: 0, Digit5: 1, Digit6: 2, KeyR: p.equip.find('repair'), KeyF: p.equip.find('extinguisher') }[e.code];
      if (slot !== undefined && slot >= 0) this.useItem(slot);
    });
    on(window, 'keyup', (e) => { this.keys[e.code] = false; if (e.code === 'Tab') this.hud.scoreboard(false); });
    on(window, 'blur', () => { this.keys = {}; this.mouseDown = false; this.assist.clearLook(); });
    on(c, 'mousedown', (e) => {
      if (this.touch) return;
      this.audio.init(); this.audio.resume();
      if (this.paused || this.ended) return;
      if (document.pointerLockElement !== c) { c.requestPointerLock?.(); }
      if (e.button === 0) this.mouseDown = true; if (e.button === 2) this.toggleSniper();
    });
    on(window, 'mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mousemove', (e) => {
      if (this.paused) return; const locked = document.pointerLockElement === c; if (!locked && !this.mouseDown) return;
      this.mouseLook(e.movementX, e.movementY);
    });
    on(c, 'wheel', (e) => {
      e.preventDefault(); const up = e.deltaY < 0;
      if (this.cam.sniper) this.stepScopeZoom(up ? 1 : -1);
      else { this.cam.dist = clamp(this.cam.dist * (up ? 0.88 : 1.14), 7, 40); if (up && this.cam.dist <= 7.1) this.toggleSniper(); }
    }, { passive: false });
    on(document, 'pointerlockchange', () => { if (!document.pointerLockElement && !this.ended && this._wasLocked) this.setPaused(true); this._wasLocked = !!document.pointerLockElement; });
    on(window, 'resize', () => this.resize());
  }
  limitCameraPitch(pitch) { return clamp(pitch, this.cam.sniper ? -0.35 : -0.9, this.cam.sniper ? 0.45 : 0.35); }
  mouseLook(dx, dy) {
    const k = this.cam.sniper ? 0.0022 / this.cam.zoom * 2.2 : 0.0024;
    const [dyaw, dpitch] = this.assist.look(dx, dy, k);
    this.cam.yaw += dyaw; this.cam.pitch = this.limitCameraPitch(this.cam.pitch + dpitch);
  }
  defaultScopeZoom() { return Game.ZOOMS[this.assist.locked ? 1 : 0]; }
  stepScopeZoom(step, wrap = false) {
    const levels = Game.ZOOMS, cam = this.cam;
    const index = levels.indexOf(cam.zoom) + step;
    if (index < 0 && !wrap) { this.toggleSniper(); return; }
    cam.zoom = levels[wrap ? (index + levels.length) % levels.length : Math.min(index, levels.length - 1)];
    cam.autoZoom = false;
  }
  toggleSniper() {
    const P = this.cursorPoint; const valid = this.player.alive && Number.isFinite(P.x) && this.aimDist > 0;
    this.cam.sniper = !this.cam.sniper;
    this.cam.autoZoom = this.cam.sniper;
    if (this.cam.sniper) this.cam.zoom = this.defaultScopeZoom();
    else if (this.armorView) this.armorView.update();
    // keep the crosshair on the same world point: re-aim the new camera (scope or third-person) through P
    if (valid) this.alignCamTo(P); else this.cam.pitch = this.limitCameraPitch(this.cam.pitch);
    this._camInit = false;
  }
  camDir(yaw = this.cam.yaw, pitch = this.cam.pitch) { return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); }
  // camera position for a view direction (no smoothing): scope at the gunner's sight, or chase camera with collision
  camPosFor(dir, sniper, m = this.player.model, focus = null) {
    const pivot = focus ?? m.turret.getWorldPosition(new THREE.Vector3());
    if (sniper) {
      // Follow the view yaw so zooming keeps the same world-space aim point.
      pivot.y += m.gun.position.y + 0.55;
      const hz = Math.hypot(dir.x, dir.z) || 1;
      const pos = pivot.clone().add(new THREE.Vector3(dir.x / hz * m.gun.position.z, 0, dir.z / hz * m.gun.position.z));
      return this.constrainCamera(pivot, pos.addScaledVector(dir, 0.6), 0.16);
    }
    if (!focus) {
      pivot.y += 2.2;
    }
    const pos = pivot.clone().addScaledVector(dir, -this.cam.dist);
    pos.y = Math.max(pos.y, this.world.terrain.height(pos.x, pos.z) + 1.2);
    return this.constrainCamera(pivot, pos, 0.42);
  }
  constrainCamera(focus, pos, radius) {
    const { x: ax, y: ay, z: az } = focus;
    const { x: bx, y: by, z: bz } = pos;
    const world = this.world;
    const terrainHit = world.terrain.segmentHit(ax, ay - radius, az, bx, by - radius, bz, 0.65);
    const structureHit = world.structureHit(ax, ay, az, bx, by, bz, radius);
    let fraction = 1;
    if (terrainHit >= 0) fraction = terrainHit;
    if (structureHit >= 0) fraction = Math.min(fraction, structureHit);
    if (fraction < 1) {
      const length = focus.distanceTo(pos);
      if (length > 0) pos.lerpVectors(focus, pos, Math.max(0, fraction - 0.05 / length));
    }
    return pos;
  }
  // Predict the same chase pose the frame will render, including cover and smoothing.
  cameraPositionFor(dir, sniper, dt, model = this.player.model) {
    if (sniper || dt === undefined || !this._camInit) return this.camPosFor(dir, sniper, model);
    const focus = model.turret.getWorldPosition(new THREE.Vector3());
    focus.y += 2.2;
    const pos = this.camPosFor(dir, false, model, focus);
    const current = this.camera.position;
    const pullIn = pos.distanceToSquared(focus) < current.distanceToSquared(focus);
    const amount = Math.min(1, dt * (pullIn ? 30 : 10));
    if (amount === 1) return pos;
    return this.constrainCamera(focus, pos.lerp(current, 1 - amount), 0.42);
  }
  alignCamTo(point, dt, offsetYaw = 0, offsetPitch = 0) {
    const c = this.cam;
    const iterations = dt === undefined ? 6 : 3;
    for (let i = 0; i < iterations; i++) {
      const pos = this.cameraPositionFor(this.camDir(), c.sniper, dt);
      const dir = pos.subVectors(point, pos);
      if (dir.lengthSq() < 1e-6) break;
      c.yaw = Math.atan2(dir.x, dir.z) + offsetYaw;
      c.pitch = this.limitCameraPitch(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + offsetPitch);
    }
  }
  get lock() { return this.assist?.manual ? this.assist.target : null; }
  toggleLock() {
    const state = this.assist.toggleManual();
    if (state === 'released') this.hud.message('Target lock released', '#c8c8c8');
    if (state === 'locked') this.hud.message('Target locked: ' + this.lock.spec.short, '#ffd84a');
  }
  useItem(i, t = this.player) {
    const [ok, msg] = t.equip.use(i, this); if (t.isPlayer && msg) this.hud.message(msg, ok ? '#9fd39f' : '#c8c8c8'); return ok;
  }
  // smoke screen: 3 clouds in a line ~15 m ahead of the turret; each blocks line of sight while it lasts
  deploySmoke(t, dur) {
    const yaw = t.heading + t.turretYaw; const fx = Math.sin(yaw), fz = Math.cos(yaw), px = fz, pz = -fx;
    for (const k of [-1, 0, 1]) {
      const x = t.pos.x + fx * 15 + px * k * 8, z = t.pos.z + fz * 15 + pz * k * 8; const y = this.world.groundHeight(x, z) + 2.5;
      const c = { x, y, z, r: 7, until: this.time + dur }; this.smokes.push(c);
      for (let i = 0; i < 28; i++) this.effects.smoke.emit({ x: x + (Math.random() - 0.5) * 6, y: y - 1.5 + Math.random() * 3, z: z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.6, vy: 0.15, vz: (Math.random() - 0.5) * 0.6, life: dur * (0.8 + Math.random() * 0.25), s0: 5, s1: 11, r: 0.78, g: 0.79, b: 0.8, a: 0.9, drag: 0.6, grav: 0 });
    }
  }
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const c of this.smokes) {
      if (c.until < this.time) continue; const dx = bx - ax, dy = by - ay, dz = bz - az; const l2 = dx * dx + dy * dy + dz * dz;
      let u = l2 > 0 ? ((c.x - ax) * dx + (c.y - ay) * dy + (c.z - az) * dz) / l2 : 0; u = Math.max(0, Math.min(1, u));
      const ex = ax + dx * u - c.x, ey = ay + dy * u - c.y, ez = az + dz * u - c.z; if (ex * ex + ey * ey + ez * ez < c.r * c.r) return true;
    }
    return false;
  }
  setPaused(v) { if (this.ended) return; this.touch?.clear(); this.assist.clearLook(); this.paused = v; this.hud.setPaused(v); if (v && document.pointerLockElement) document.exitPointerLock(); }
  exit() { this.dispose(); this.opts.onExit && this.opts.onExit(); }
  resize() {
    this.viewportWidth = innerWidth;
    this.viewportHeight = innerHeight;
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.resize(this.viewportWidth, this.viewportHeight);
    if (this.outline) this.outline.resize();
    this.frameRequested = true;
  }
  onKill(attacker, victim, cause) {
    this.hud.kill(attacker, victim, cause);
    attacker?.vehicleSkill?.killed(victim);
    if (victim.isPlayer) { this.cam.sniper = false; const a = this.tanks.find((t) => t.team === 0 && t.alive); if (a) this.cam.follow = a; }
    this.checkEnd();
  }
  checkEnd() {
    if (this.ended) return;
    const a0 = this.tanks.some((t) => t.team === 0 && t.alive), a1 = this.tanks.some((t) => t.team === 1 && t.alive);
    if (!a1) this.end('win', 'All enemy tanks destroyed.'); else if (!a0) this.end('lose', 'Your platoon was wiped out.');
    else if (this.capture[1].points >= 100) this.end('win', 'Enemy base captured!'); else if (this.capture[0].points >= 100) this.end('lose', 'The enemy captured your base.');
    else if (!this.control.contested && this.control.points >= 100) {
      const won = this.control.team === this.player.team;
      this.end(won ? 'win' : 'lose', won ? '我方占领据点 C' : '敌方占领据点 C');
    }
    else if (this.time >= this.timeLimit) this.end('draw', 'Time expired.');
  }
  end(result, reason) { this.ended = true; this.result = result; this.hud.showEnd(result, reason); if (document.pointerLockElement) document.exitPointerLock(); this.audio.stopEngine(); }
  // ---------- per-frame ----------
  updatePlayerInput() {
    const p = this.player; const k = this.keys;
    if (!p.alive || this.ended) {
      p.input.throttle = 0; p.input.steer = 0; p.input.brake = true; p.input.driveHeld = true;
      return;
    }
    p.input.throttle = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    p.input.steer = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
    p.input.driveHeld = !!(k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.Space || this.touch?.driveHeld);
    if (this.touch) { p.input.throttle = clamp(p.input.throttle + this.touch.throttle, -1, 1); p.input.steer = clamp(p.input.steer + this.touch.steer, -1, 1); }
    p.input.brake = !!k.Space;
    if (p.input.brake) p.input.throttle = 0;
    p.input.aim.copy(this.aimPoint);
    if (p.spec.fixedGun && !this.debugAim && !this.lock) {
      const dir = this.camDir();
      const forward = (p.input.aim.x - p.pos.x) * dir.x + (p.input.aim.z - p.pos.z) * dir.z;
      // A chase camera can hit a wall behind the vehicle. Keep following
      // the sight direction there so the hull cannot turn away from the view.
      if (forward <= 0.1) {
        p.input.aim.copy(p.pos).addScaledVector(dir, 100);
        p.input.aim.y += p.model.turret.position.y + p.model.gun.position.y;
      }
    }
    if (this.mouseDown || this.touch?.firing) p.tryFire(this.time);
  }
  resetControlContribution(tank) {
    if (this.ended) return;
    const previous = this.control.team;
    resetControlCredit(this.control, tank, this.time);
    if (this.control.team !== previous) this.world.setControlTeam(this.control.team);
  }
  updateCapture(dt) {
    for (let i = 0; i < 2; i++) {
      const b = this.world.bases[i]; const cap = this.capture[i];
      const inside = (team) => this.tanks.filter((t) => t.alive && t.team === team && Math.hypot(t.pos.x - b.x, t.pos.z - b.z) < b.r);
      const att = inside(1 - i), def = inside(i);
      if (att.length && !def.length) {
        if (att.some((t) => this.time - t.lastDamagedAt < 0.05)) cap.points = Math.max(0, cap.points - 30);
        cap.points = Math.min(100, cap.points + dt * (100 / 90) * Math.min(3, att.length));
      } else if (!att.length) cap.points = Math.max(0, cap.points - dt * 6);
    }
    if (this.ended) return;
    const previousTeam = this.control.team;
    updateControl(this.control, this.world.controlPoint, this.tanks, dt, this.time);
    if (this.control.team !== previousTeam) this.world.setControlTeam(this.control.team);
  }
  traceAim(origin, direction, tanksOnly = false) {
    const range = 2000;
    const dx = direction.x * range, dz = direction.z * range;
    const end = origin.clone().addScaledVector(direction, range);
    const player = this.player;
    let tank = null, hit = null, best = 1;
    for (const candidate of this.tanks) {
      if (candidate === player || (candidate.alive && candidate.team !== player.team && !candidate.spotted[player.team])) continue;
      if (!withinPathXZ(candidate.pos, origin, dx, dz, 12)) continue;
      const impact = candidate.rayTest(origin, end);
      if (impact && impact.t < best) { best = impact.t; tank = candidate; hit = impact; }
    }
    // Preview rays can stop as soon as there is no possible vehicle to lock.
    if (tanksOnly && !tank) return null;
    const distance = range * best;
    const point = end.copy(origin).addScaledVector(direction, distance);
    const world = this.world;
    const terrain = world.terrain.segmentHit(origin.x, origin.y, origin.z, point.x, point.y, point.z, 2);
    const structure = world.structureHit(origin.x, origin.y, origin.z, point.x, point.y, point.z);
    let visible = 1;
    if (terrain >= 0) visible = Math.min(visible, terrain);
    if (structure >= 0) visible = Math.min(visible, structure);
    if (visible < 1) {
      if (tanksOnly) return null;
      return { tank: null, hit: null, point: point.lerpVectors(origin, point, visible), distance: distance * visible };
    }
    return { tank, hit, point, distance };
  }
  computeAim() {
    if (this.debugAim) {
      this.aimPoint.copy(this.debugAim); this.cursorPoint.copy(this.debugAim); this.aimTank = null; this.aimHit = null;
      return;
    }
    const ray = this.traceAim(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    this.aimTank = ray.tank;
    this.aimHit = ray.hit;
    this.cursorPoint.copy(ray.point);
    this.aimPoint.copy(ray.point);
    this.aimDist = ray.distance;
  }
  applyGunLock() {
    const target = this.lock;
    if (!target || this.debugAim || this.camOverride) return;
    if (this.aimTank !== target) this.assist.anchorWorld(this.aimPoint);
    const muzzle = this.player.muzzleNode.getWorldPosition(new THREE.Vector3());
    const flight = this.aimPoint.distanceTo(muzzle) / this.player.shell.velocity;
    this.aimPoint.addScaledVector(target.vel, flight);
    this.aimDist = this.aimPoint.distanceTo(muzzle);
  }
  updateReticle() {
    const p = this.player, hud = this.hud;
    if (!p.alive) { hud.setReticle(-100, -100, 0, '', ''); return; }
    const shot = p.previewLaunch(this.aimPoint);
    const predicted = this.ballistics.predict(p, shot.shell, shot.origin, shot.velocity, shot.shell.guided ? this.aimPoint : undefined);
    const { pos, dist, tank, hit, kind } = predicted;
    const cameraPoint = pos.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const depth = -cameraPoint.z;
    const radius = 2 * shot.shell.velocity * predicted.time * Math.sin(p.dispersion() * 0.5);
    this.reticleRadiusWorld = radius;
    this.reticleWorld = pos; this.reticleDist = dist;
    if (depth <= this.camera.near) { hud.setReticle(-100, -100, 0, '', ''); return; }
    const radPx = projectedSpreadRadius(radius, Math.hypot(cameraPoint.x, cameraPoint.y),
      depth, this.camera.projectionMatrix.elements[5], this.viewportHeight);
    const screen = cameraPoint.applyMatrix4(this.camera.projectionMatrix);
    const sx = (screen.x * 0.5 + 0.5) * this.viewportWidth, sy = (-screen.y * 0.5 + 0.5) * this.viewportHeight;
    if (!Number.isFinite(sx + sy + radPx)) { hud.setReticle(-100, -100, 0, '', ''); return; }
    let state = 'neutral', text = `${Math.round(dist)} m`;
    if (tank?.alive && tank.team !== p.team) {
      if (hit.wheel) text = `行走机构 · ${tank.spec.short} · ${Math.round(dist)} m`;
      else {
        const ev = this.ballistics.evaluate(tank, hit, shot.shell, dist, predicted.waterDist);
        if (ev.ricochet) { state = 'red'; text = 'RICOCHET'; }
        else if (ev.eff <= ev.pen * (1-PEN_RNG)) { state = 'green'; text = `PEN ${Math.round(ev.pen)} vs ${Math.round(ev.eff)} mm`; }
        else if (ev.eff <= ev.pen * (1+PEN_RNG)) { state = 'yellow'; text = `CHANCE ${Math.round(ev.pen)} vs ${Math.round(ev.eff)} mm`; }
        else { state = 'red'; text = `NO PEN ${Math.round(ev.pen)} vs ${Math.round(ev.eff)} mm`; }
        text += ` · ${tank.spec.short} ${hit.part} ${hit.face} · ${Math.round(ev.angle)}° · ${Math.round(dist)} m`;
      }
    } else if (this.aimTank?.alive && this.aimTank.team !== p.team && kind &&
      shot.origin.distanceTo(pos) + 0.5 < shot.origin.distanceTo(this.cursorPoint)) {
      const obstacle = { structure: '障碍物', ground: '地形', water: '水面', tank: '车辆' }[kind];
      text = `${obstacle}遮挡 · ${text}`;
    }
    if (p.afloat) { state = 'neutral'; text = '浮航中 · 主炮锁定'; }
    if (p.fireReloadLeft > 0 || p.afloat) state += ' reloading';
    if (this.lock) state += ' locked';
    hud.setReticle(sx, sy, radPx, state, text);
  }
  updateCamera(dt) {
    if (this.camOverride) { const o = this.camOverride; this.camera.position.set(o[0], o[1], o[2]); this.camera.fov = o[6] || 60; this.camera.updateProjectionMatrix(); this.camera.lookAt(o[3], o[4], o[5]); this.camera.updateMatrixWorld(); this.effects.setScale(innerHeight, this.camera.fov); for (const t of this.tanks) t.model.root.visible = t.team === 0 || !t.alive || t.spotted[0]; this.updateLOD(); return; }
    const c = this.cam; const f = c.follow && c.follow.alive ? c.follow : this.player.alive ? this.player : (this.tanks.find((t) => t.team === 0 && t.alive) || this.player); c.follow = f;
    const m = f.model;
    const previousFov = this.camera.fov;
    const dir = this.camDir();
    const sn = c.sniper && f === this.player && f.alive;
    m.root.visible = !sn;
    this.camera.position.copy(this.cameraPositionFor(dir, sn, dt, m));
    if (sn) {
      if (c.autoZoom) c.zoom = this.defaultScopeZoom();
      const fov = zoomFov(c.zoom);
      c.fov = this._wasSn ? THREE.MathUtils.lerp(c.fov, fov, Math.min(1, dt * 12)) : fov;
      this.camera.fov = c.fov;
    } else {
      this._camInit = true; c.fov = 60; this.camera.fov = 60;
    }
    this._wasSn = sn;
    if (this.camera.fov !== previousFov) this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camera.position.clone().add(dir));
    this.camera.updateMatrixWorld();
    this.effects.setScale(innerHeight, this.camera.fov);
    this.updateLOD();
  }
  // running-gear LOD: individual track links + detailed wheels only when the tank covers enough screen
  updateLOD() {
    this.world.updateTerrainLOD(this.camera);
    this.contactShadows.update(this.camera.position);
    const cp = this.camera.position; const k = this.camera.fov / 60; const near = this.quality === 'low' ? 22 : this.quality === 'high' ? 60 : 40;
    for (const t of this.tanks) { if (!t.model.links && !t.model.setRunningGearNear) continue; const d = t.pos.distanceTo(cp) * k; setTrackLOD(t.model, t.alive && d < near); }
  }
  buildEarthwork(tank) {
    const shape = this.world.addEarthwork(tank, this.tanks);
    if (!shape) return false;
    this.physics.addObstacle(shape);
    this.nav.penalize(shape.x, shape.z, 32);
    return true;
  }

  update(dt) {
    this.touch?.update();
    if (this.paused) return;
    dt = Math.min(dt, 0.05); this.time += dt; setWindTime(this.time);
    this.updatePlayerInput();
    for (const ai of this.ai) if (!this.freezeAI) ai.update(dt);
    this.smokes = this.smokes.filter((c) => c.until > this.time);
    for (const t of this.tanks) if (!t.isPlayer && t.alive && !this.freezeAI) this.npcItems(t);
    for (const t of this.tanks) t.update(dt, this.time);
    this.physics.advance(dt);
    for (const t of this.tanks) {
      t.updateAfterMotion(dt);
      if (!t.alive || t.airborne || t.afloat || Math.abs(t.speed) < 0.6) continue;
      const d = t.spec.dims, dir = Math.sign(t.speed);
      const fx = Math.sin(t.heading) * dir, fz = Math.cos(t.heading) * dir;
      const knocked = this.world.veg.knock(t.pos.x + fx * d.L * 0.42, t.pos.z + fz * d.L * 0.42, d.W / 2, fx, fz, t.speed);
      if (knocked) {
        // Wood breaking dissipates part of the vehicle's forward momentum.
        this.physics.brushImpact(t);
        if (t.isPlayer) this.audio.impact(t.pos, 'ground');
      }
    }
    this.ballistics.update(dt); this.spotting.update(dt, this.time);
    // render visibility: enemies only if spotted by our team
    for (const t of this.tanks) { if (t.team !== this.player.team && t.alive) t.model.root.visible = t.spotted[this.player.team]; }
    // Keep distant track dust available through the scope, where it still covers pixels.
    const dustRange = 230 * 60 / this.camera.fov;
    const dustRangeSquared = dustRange * dustRange;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const d = t.spec.dims, distanceSquared = t.pos.distanceToSquared(this.camera.position);
      if (t.landingSpeed > 1.5 && distanceSquared < dustRangeSquared) {
        this.effects.landingDust(t.pos, t.heading, d.W, t.landingSpeed, t.inWater);
      }
      if (!t.airborne && Math.abs(t.speed) > 1.5 && distanceSquared < dustRangeSquared) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const back = t.model.root.localToWorld(new THREE.Vector3(side * d.W * 0.4, 0.2, -d.L * 0.5));
        this.effects.trackDust(back, t.speed, t.inWater, dt);
      }
      if (distanceSquared < 120 * 120) {
        const outlet = t.model.root.localToWorld(new THREE.Vector3(0.6, d.hullH + 0.2, -d.L * 0.47));
        this.effects.exhaust(outlet, Math.abs(t.input.throttle));
      }
    }
    for (let i = this.flying.length - 1; i >= 0; i--) { const f = this.flying[i]; f.t += dt; if (f.rest) continue; f.v.y -= 9.81 * dt; f.obj.position.addScaledVector(f.v, dt); f.obj.rotation.x += f.w.x * dt; f.obj.rotation.z += f.w.z * dt;
      const gy = this.world.terrain.height(f.obj.position.x, f.obj.position.z); if (f.obj.position.y < gy && f.v.y < 0) { f.obj.position.y = gy; f.rest = true; } }
    this.updateCapture(dt); this.checkEnd();
    this.assist.preCamera(dt);
    this.updateCamera(dt);
    this.trackMarks.update(this.time, this.camera.position);
    this.computeAim(); this.assist.postAim(dt); this.applyGunLock();
    this.updateReticle();
    this.armorView.update();
    // player bush ghosting
    const pb = this.player.alive ? this.player.inBush : null; this.world.veg.setPlayerBush(pb && !this.cam.sniper ? pb : pb);
    this.world.update(dt, this.time, this.camera.position);
    this.effects.update(dt, (x, z) => this.world.terrain.height(x, z), this.camera);
    this.audio.setListener(this.camera.position);
    if (this.player.alive && !this.ended) this.audio.engine(Math.abs(this.player.input.throttle), this.player.speed); else this.audio.stopEngine();
    this.hud.update(dt, this.camera);
  }
  render() {
    this.frameRequested = false;
    this.world.updateShadowCenter(this.cam.follow.pos, this.time, this.tanks);
    if (this.post) this.post.render(); else this.renderer.render(this.scene, this.camera);
    if (this.outline && !this.camOverride) this.outline.render(this.assist.outlineTarget(), this.camera);
  }
  dispose() {
    this.touch?.dispose();
    for (const [ev, list] of Object.entries(this._h)) for (const [tgt, fn] of list) tgt.removeEventListener(ev, fn);
    this.armorView.dispose(); this.hud.destroy(); this.audio.stopEngine(); this.contactShadows.dispose(); this.trackMarks.dispose(); this.effects.dispose(); this.physics.free(); this.world.dispose(); if (this.post) this.post.dispose(); if (this.outline) this.outline.dispose();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  // NPCs use their consumables sensibly
  npcItems(t) {
    const E = t.equip; const tryUse = (id) => { const i = E.find(id); if (i >= 0 && E.slots[i].charges > 0 && E.slots[i].cd <= 0) return this.useItem(i, t); return false; };
    t._itemT = (t._itemT || 0) - 1 / 30; if (t._itemT > 0) return; t._itemT = 0.8 + Math.random() * 0.8; // human-like reaction delay
    if (t.burning > 0 && tryUse('extinguisher')) return;
    if ((t.modules.tracks < 1 || (t.modules.engine < 1 && t.modules.gun < 1) || (t.modules.gun < 1 && this.time - t.lastDamagedAt < 20)) && tryUse('repair')) return;
    if (t.crew.some((c) => !c.alive) && tryUse('medkit')) return;
    if (t.hp < t.maxHp * 0.35 && this.time - t.lastDamagedAt < 3 && tryUse('smoke')) return;
  }
  makeDebug() {
    return {
      teleport: (x, z, h = 0, speed = 0) => { this.player.placeAt(x, z, h, speed); },
      cam: (yaw, pitch, dist) => { this.cam.yaw = yaw; this.cam.pitch = pitch; if (dist) this.cam.dist = dist; this._camInit = false; },
      freeze: (v = true) => { this.freezeAI = v; for (const t of this.tanks) if (!t.isPlayer) { t.input.throttle = 0; t.input.steer = 0; } },
      place: (idx, x, z, h) => { this.tanks[idx].placeAt(x, z, h); },
      simulate: (sec, dt = 1 / 30) => { const t0 = performance.now(); const n = Math.round(sec / dt); for (let i = 0; i < n && !this.ended; i++) this.update(dt); return { ms: Math.round(performance.now() - t0), perFrame: +((performance.now() - t0) / n).toFixed(2), ended: this.ended, result: this.result }; },
      look: (dx, dy) => this.mouseLook(dx, dy),
      assist: () => { const a = this.assist; return { enabled: a.enabled, locked: !!a.target, target: a.target ? this.tanks.indexOf(a.target) : -1, focus: a.focus ? this.tanks.indexOf(a.focus) : -1, outline: this.outline && this.outline.lastDrawn ? this.tanks.indexOf(this.outline.lastDrawn) : -1, offPx: +a.offPx().toFixed(1), drag: +a.dragFactor().toFixed(3), lastBreak: a.lastBreak, stats: { ...a.stats }, yaw: this.cam.yaw, pitch: this.cam.pitch, aimTank: this.aimTank ? this.tanks.indexOf(this.aimTank) : -1 }; },
      fire: () => { this.player.reloadLeft = this.player.secondaryReloadLeft = 0; this.player.tubeReload?.timers.fill(0); return this.player.tryFire(this.time); },
      aim: (x, y, z) => { if (x === null) { this.debugAim = null; return; } this.debugAim = new THREE.Vector3(x, y, z); this.cursorPoint.copy(this.debugAim); this.aimPoint.copy(this.debugAim); this.player.input.aim.copy(this.debugAim); },
      tank: (i) => this.tanks[i],
      camAt: (a) => { this.camOverride = a; for (const id of ['h-markers', 'h-ret', 'h-cross']) { const e = document.getElementById(id); if (e) e.style.visibility = a ? 'hidden' : ''; } },
      pause: (v = true) => { this.debugPaused = v; },
      info: () => ({ time: this.time, alive: this.tanks.map((t) => [t.name, t.spec.id, t.team, t.alive, Math.round(t.hp), Math.round(t.pos.x), Math.round(t.pos.z), t.spotted, !!t.inBush]), stats: this.world.stats, genMs: Math.round(this.world.genTime) }),
    };
  }
}
