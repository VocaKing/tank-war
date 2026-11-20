// Match orchestration: world, teams, input, camera, spotting, capture, win conditions
import * as THREE from 'three';
import { World } from '../world/world.js';
import { setWindTime } from '../world/vegetation.js';
import { TANKS, TANK_BY_ID, sanitizeLoadout, npcLoadout } from './tankData.js';
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
import { RNG, clamp, DEG, wrapAngle } from '../util.js';
import { Post } from '../render/post.js';
import { Outline } from '../render/outline.js';
import { AimAssist } from './aimAssist.js';
const _sd = new THREE.Vector3(), _sd2 = new THREE.Vector3();
function _segDist(p, a, b) { _sd.subVectors(b, a); const l2 = _sd.lengthSq(); const t = l2 > 0 ? Math.max(0, Math.min(1, _sd2.subVectors(p, a).dot(_sd) / l2)) : 0; return _sd2.copy(a).addScaledVector(_sd, t).distanceTo(p); }

const ALLY_NAMES = ['Sgt. Miller', 'Cpl. Novak', 'Lt. Hayes', 'Sgt. Dubois', 'Pvt. Kowalski', 'Cpt. Reyes', 'Sgt. Okafor', 'Lt. Varga'];
const ENEMY_NAMES = ['Lt. Weber', 'Sgt. Volkov', 'Cpt. Brandt', 'Sgt. Petrov', 'Uffz. Krüger', 'Lt. Orlov', 'Sgt. Haas', 'Cpl. Zaitsev'];

export class Game {
  static ZOOMS = [2, 4, 8, 16];
  constructor(renderer, uiRoot, audio, opts) {
    this.renderer = renderer; this.audio = audio; this.opts = opts; this.rng = new RNG(opts.seed || ((Math.random() * 1e9) | 0));
    this.quality = opts.quality || 'high'; this.world = new World(renderer, opts.mapId, opts.quality); this.scene = this.world.scene;
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 6000);
    this.time = 0; this.timeLimit = 15 * 60; this.paused = false; this.ended = false; this.flying = [];
    this.effects = new Effects(this.scene, renderer, opts.mapId === 'desert' ? [0.78, 0.68, 0.52] : opts.mapId === 'forest' ? [0.45, 0.42, 0.36] : [0.58, 0.54, 0.46]);
    this.ballistics = new Ballistics(this); this.spotting = new Spotting(this); this.nav = new NavGrid(this.world);
    this.capture = [{ points: 0 }, { points: 0 }]; this.smokes = [];
    this.tanks = []; this.ai = [];
    this.spawnTeams(opts.tankId);
    this.player = this.tanks[0];
    this.cam = { yaw: this.player.heading, pitch: -0.12, dist: 14, sniper: false, zoom: 4, fov: 60, follow: this.player };
    this.armorView = new ArmorView(this); this.lock = null;
    this.assist = new AimAssist(this, opts.aimAssist !== false);
    this.keys = {}; this.mouseDown = false; this.aimPoint = new THREE.Vector3();
    this.hud = new HUD(uiRoot, this);
    this.bindInput();
    if (this.quality === 'high' && !opts.noPost) { try { this.post = new Post(renderer, this.scene, this.camera); } catch (e) { console.warn('post-processing disabled', e); this.post = null; } }
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
        const spec = TANK_BY_ID[id]; const lo = isPlayer ? sanitizeLoadout(spec, this.opts.loadout) : npcLoadout(spec, r); const items = isPlayer ? sanitizeItems(this.opts.items || DEFAULT_ITEMS) : (r.next() < 0.5 ? ['repair', 'extinguisher', 'medkit'] : r.next() < 0.5 ? ['repair', 'medkit', 'reload'] : ['repair', 'extinguisher', 'smoke']);
        const t = new Tank(this, spec, team, isPlayer ? 'You' : names[i], isPlayer, lo, items);
        let x = base.x + fx * (18 + (i % 3) * 16) + px * ((i - 3) * 22 + r.range(-6, 6)) + r.range(-8, 8), z = base.z + fz * (18 + (i % 3) * 16) + pz * ((i - 3) * 22 + r.range(-6, 6)) + r.range(-8, 8);
        const [ci, cj] = this.nav.nearestWalkable(...this.nav.toCell(x, z)); [x, z] = this.nav.center(ci, cj);
        t.placeAt(x, z, Math.atan2(fx, fz)); t.input.aim.set(x + fx * 300, t.pos.y + 2, z + fz * 300);
        this.tanks.push(t);
        if (!isPlayer) this.ai.push(new AIController(this, t, roles[i], lanes[i], 0.8 + r.next() * 0.5));
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
      if (e.code === 'KeyE') this.toggleLock();
      if (e.code === 'KeyG') { if (p.tryAbility && p.tryAbility()) { /* ok */ } else if (p.abilities && p.abilities.kind) this.hud.message(p.abilities.kind + ' not ready', '#c8c8c8'); }
      const slot = { Digit4: 0, Digit5: 1, Digit6: 2, KeyR: p.equip.find('repair'), KeyF: p.equip.find('extinguisher') }[e.code];
      if (slot !== undefined && slot >= 0) this.useItem(slot);
    });
    on(window, 'keyup', (e) => { this.keys[e.code] = false; if (e.code === 'Tab') this.hud.scoreboard(false); });
    on(c, 'mousedown', (e) => {
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
      if (this.cam.sniper) { const Z = Game.ZOOMS; let i = Z.indexOf(this.cam.zoom); i = clamp(i + (up ? 1 : -1), -1, Z.length - 1); if (i < 0) this.toggleSniper(); else this.cam.zoom = Z[i]; }
      else { this.cam.dist = clamp(this.cam.dist * (up ? 0.88 : 1.14), 7, 40); if (up && this.cam.dist <= 7.1) this.toggleSniper(); }
    }, { passive: false });
    on(document, 'pointerlockchange', () => { if (!document.pointerLockElement && !this.ended && this._wasLocked) this.setPaused(true); this._wasLocked = !!document.pointerLockElement; });
    on(window, 'resize', () => this.resize());
  }
  // mouse look (also used by the headless tests): the aim assist may absorb / dampen the movement while locked
  mouseLook(dx, dy) {
    const k = this.cam.sniper ? 0.0022 / this.cam.zoom * 2.2 : 0.0024;
    const [dyaw, dpitch] = this.assist.look(dx, dy, k);
    this.cam.yaw += dyaw; this.cam.pitch = clamp(this.cam.pitch + dpitch, this.cam.sniper ? -0.35 : -0.9, this.cam.sniper ? 0.45 : 0.35);
  }
  toggleSniper() {
    const P = this.aimPoint.clone(); const valid = this.player.alive && Number.isFinite(P.x) && this.aimDist > 0;
    this.cam.sniper = !this.cam.sniper;
    if (this.cam.sniper) this.cam.zoom = Game.ZOOMS[1];
    else if (this.armorView) this.armorView.update();
    // keep the crosshair on the same world point: re-aim the new camera (scope or third-person) through P
    if (valid) this.alignCamTo(P); else this.cam.pitch = clamp(this.cam.pitch, this.cam.sniper ? -0.35 : -0.9, this.cam.sniper ? 0.45 : 0.35);
    this._camInit = false;
  }
  camDir(yaw = this.cam.yaw, pitch = this.cam.pitch) { return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); }
  // camera position for a view direction (no smoothing): scope at the gunner's sight, or chase camera with collision
  camPosFor(dir, sniper, m = this.player.model) {
    const T = this.world.terrain;
    // scope: gunner's sight above the gun trunnion, placed along the VIEW yaw (not the lagging turret yaw) so the
    // scope position depends only on the view direction and entering the scope keeps the exact aim point
    if (sniper) { const gp = m.turret.getWorldPosition(new THREE.Vector3()); const hz = Math.hypot(dir.x, dir.z) || 1; gp.y += m.gun.position.y + 0.55; gp.x += (dir.x / hz) * m.gun.position.z; gp.z += (dir.z / hz) * m.gun.position.z; gp.addScaledVector(dir, 0.6); return gp; }
    const c = this.cam; const focus = m.turret.getWorldPosition(new THREE.Vector3()); focus.y += 2.2;
    let pos = focus.clone().addScaledVector(dir, -c.dist);
    const W = this.world; let tHit = 1;
    const tt = T.segmentHit(focus.x, focus.y, focus.z, pos.x, pos.y, pos.z, 1); if (tt >= 0) tHit = Math.min(tHit, tt);
    const ts = W.structureHit(focus.x, focus.y, focus.z, pos.x, pos.y, pos.z); if (ts >= 0) tHit = Math.min(tHit, ts);
    if (tHit < 1) pos = focus.clone().addScaledVector(dir, -Math.max(2.5, c.dist * tHit - 0.6));
    const gh = T.height(pos.x, pos.z) + 1.2; if (pos.y < gh) pos.y = gh;
    return pos;
  }
  alignCamTo(P) {
    const c = this.cam; const lo = c.sniper ? -0.35 : -0.9, hi = c.sniper ? 0.45 : 0.35;
    for (let i = 0; i < 6; i++) {
      const pos = this.camPosFor(this.camDir(), c.sniper); const d = P.clone().sub(pos); if (d.lengthSq() < 1e-6) break; d.normalize();
      c.yaw = Math.atan2(d.x, d.z); c.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), lo, hi);
    }
  }
  // gun lock: keep the gun laid on the centre of mass of the enemy under the crosshair (with lead)
  toggleLock() {
    if (this.lock) { this.lock = null; this.hud.message('Target lock released', '#c8c8c8'); return; }
    const t = this.assist.target || this.aimTank; if (t && t.alive && t.team !== this.player.team && t.spotted[this.player.team]) { this.lock = t; this.hud.message('Target locked: ' + t.spec.short, '#ffd84a'); }
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
  setPaused(v) { if (this.ended) return; this.paused = v; this.hud.setPaused(v); if (v && document.pointerLockElement) document.exitPointerLock(); }
  exit() { this.dispose(); this.opts.onExit && this.opts.onExit(); }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); if (this.post) this.post.resize(innerWidth, innerHeight); if (this.outline) this.outline.resize(); }
  onKill(attacker, victim, cause) {
    this.hud.kill(attacker, victim, cause);
    if (victim.isPlayer) { this.cam.sniper = false; const a = this.tanks.find((t) => t.team === 0 && t.alive); if (a) this.cam.follow = a; }
    this.checkEnd();
  }
  checkEnd() {
    if (this.ended) return;
    const a0 = this.tanks.some((t) => t.team === 0 && t.alive), a1 = this.tanks.some((t) => t.team === 1 && t.alive);
    if (!a1) this.end('win', 'All enemy tanks destroyed.'); else if (!a0) this.end('lose', 'Your platoon was wiped out.');
    else if (this.capture[1].points >= 100) this.end('win', 'Enemy base captured!'); else if (this.capture[0].points >= 100) this.end('lose', 'The enemy captured your base.');
    else if (this.time >= this.timeLimit) this.end('draw', 'Time expired.');
  }
  end(result, reason) { this.ended = true; this.result = result; this.hud.showEnd(result, reason); if (document.pointerLockElement) document.exitPointerLock(); this.audio.stopEngine(); }
  // ---------- per-frame ----------
  updatePlayerInput() {
    const p = this.player; const k = this.keys;
    if (!p.alive || this.ended) { p.input.throttle = 0; p.input.steer = 0; return; }
    p.input.throttle = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); p.input.steer = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
    if (k.Space) { p.input.throttle = 0; p.speed *= 0.9; }
    p.input.aim.copy(this.aimPoint);
    if (this.mouseDown) p.tryFire(this.time);
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
  }
  // tank footprint (oriented rectangle) vs structure OBBs: separating-axis test, minimal push-out
  static rectPush(px, pz, hx, hz, h, c) {
    const tax = [Math.cos(h), -Math.sin(h)], taz = [Math.sin(h), Math.cos(h)];
    const oax = [c.c, -c.s], oaz = [c.s, c.c];
    const dx = px - c.x, dz = pz - c.z; let best = null;
    for (const n of [oax, oaz, tax, taz]) {
      const d = dx * n[0] + dz * n[1];
      const rA = Math.abs(hx * (tax[0] * n[0] + tax[1] * n[1])) + Math.abs(hz * (taz[0] * n[0] + taz[1] * n[1]));
      const rB = Math.abs(c.hx * (oax[0] * n[0] + oax[1] * n[1])) + Math.abs(c.hz * (oaz[0] * n[0] + oaz[1] * n[1]));
      const ov = rA + rB - Math.abs(d); if (ov <= 0) return null;
      if (!best || ov < best[2]) best = [n[0] * (d < 0 ? -1 : 1), n[1] * (d < 0 ? -1 : 1), ov];
    }
    return best;
  }
  resolveStructures(t) {
    const W = this.world; const d = t.spec.dims; const hx = d.W / 2 + 0.05, hz = d.L / 2 + 0.05; let hitAny = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const c of W.colGrid.query(t.pos.x, t.pos.z, hz + 2)) {
        if (c.kind === 'deck') continue;
        if (c.y1 < t.pos.y + 0.3 || c.y0 > t.pos.y + d.hullH) continue; // e.g. under a bridge deck / below a parapet top
        const res = Game.rectPush(t.pos.x, t.pos.z, hx, hz, t.heading, c); if (!res) continue;
        t.pos.x += res[0] * (res[2] + 0.002); t.pos.z += res[1] * (res[2] + 0.002); moved = true; hitAny = true;
        // kill the velocity component driving into the obstacle
        const fx = Math.sin(t.heading), fz = Math.cos(t.heading); const into = -(fx * res[0] + fz * res[1]) * Math.sign(t.speed || 1);
        if (into > 0.3) t.speed *= 0.6; else t.speed *= 0.95;
      }
      if (!moved) break;
    }
    return hitAny;
  }
  resolveCollisions() {
    const T = this.tanks; const W = this.world;
    for (const t of T) {
      const d = t.spec.dims; const fx = Math.sin(t.heading), fz = Math.cos(t.heading); const r = d.W * 0.5;
      this.resolveStructures(t);
      for (const off of [-d.L * 0.3, 0, d.L * 0.3]) {
        const cx = t.pos.x + fx * off, cz = t.pos.z + fz * off;
        for (const rk of W.veg.rockGrid.query(cx, cz, r + 3)) {
          const dx = cx - rk.x, dz = cz - rk.z; const dd = Math.hypot(dx, dz); const R = r + rk.s * 0.7;
          if (dd >= R || dd < 0.01) continue;
          if (rk.s < 2.4) { const lift = rk.s * 0.55 * (1 - dd / R); if (lift > (t._rockLift || 0)) t._rockLift = lift; t.speed *= 0.985; }
          else { t.pos.x += dx / dd * (R - dd); t.pos.z += dz / dd * (R - dd); t.speed *= 0.9; }
        }
      }
      const H = W.playHalf - 4; if (Math.abs(t.pos.x) > H) { t.pos.x = Math.sign(t.pos.x) * H; t.speed *= 0.8; } if (Math.abs(t.pos.z) > H) { t.pos.z = Math.sign(t.pos.z) * H; t.speed *= 0.8; }
    }
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j]; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const d = Math.hypot(dx, dz);
      const R = (a.spec.dims.L + b.spec.dims.L) * 0.36; if (d > R || d < 0.01) continue;
      const push = (R - d); const ma = a.alive ? a.spec.mass : 200, mb = b.alive ? b.spec.mass : 200; const wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.pos.x -= dx / d * push * wa; a.pos.z -= dz / d * push * wa; b.pos.x += dx / d * push * wb; b.pos.z += dz / d * push * wb; a.speed *= 0.9; b.speed *= 0.9;
      // tank-tank pushes must never shove a tank into a building
      this.resolveStructures(a); this.resolveStructures(b);
    }
  }
  computeAim() {
    if (this.debugAim) { this.aimPoint.copy(this.debugAim); this.aimTank = null; this.aimHit = null; return; }
    if (this.lock) {
      const t = this.lock; if (!t.alive || !t.spotted[this.player.team] || !this.player.alive) { this.lock = null; }
      else {
        const c = t.model.root.localToWorld(new THREE.Vector3(0, t.spec.dims.hullH * 0.62, 0)); const mz = this.player.model.muzzle.getWorldPosition(new THREE.Vector3());
        const tof = c.distanceTo(mz) / this.player.shell.velocity; c.addScaledVector(t.vel, tof);
        this.aimPoint.copy(c); this.aimTank = t; this.aimDist = c.distanceTo(mz); return;
      }
    }
    // ray from camera centre: terrain, structures, visible tanks
    const cam = this.camera; const o = cam.position; const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const far = 2000; const e = o.clone().addScaledVector(dir, far); let best = 1;
    const W = this.world; const tt = W.terrain.segmentHit(o.x, o.y, o.z, e.x, e.y, e.z, 2); if (tt >= 0) best = tt;
    const ts = W.structureHit(o.x, o.y, o.z, e.x, e.y, e.z); if (ts >= 0 && ts < best) best = ts;
    this.aimTank = null; this.aimHit = null;
    for (const t of this.tanks) { if (t === this.player) continue; if (t.team !== 0 && !t.spotted[0] && t.alive) continue; const h = t.rayTest(o, e); if (h && h.t < best) { best = h.t; this.aimTank = t; this.aimHit = h; } }
    this.aimPoint.copy(o).addScaledVector(dir, far * best);
    this.aimDist = far * best;
  }
  updateReticle() {
    // simulate actual gun trajectory to find where the shell would land
    const p = this.player; const hud = this.hud; if (!p.alive) { hud.setReticle(-100, -100, 0, '', ''); return; }
    const m = p.model; const pos = m.muzzle.getWorldPosition(new THREE.Vector3()); const q = m.gun.getWorldQuaternion(new THREE.Quaternion());
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(p.shell.velocity); const W = this.world; const a = new THREE.Vector3(), b = new THREE.Vector3();
    let hitP = null, hitTank = null, hitInfo = null, dist = 0; const h = 0.02;
    for (let i = 0; i < 200 && !hitP; i++) {
      a.copy(pos); v.y -= 9.81 * h; b.copy(pos).addScaledVector(v, h);
      let best = 2; const tt = W.terrain.segmentHit(a.x, a.y, a.z, b.x, b.y, b.z, 2); if (tt >= 0) best = tt;
      const ts = W.structureHit(a.x, a.y, a.z, b.x, b.y, b.z); if (ts >= 0 && ts < best) best = ts;
      let stepTank = null, stepInfo = null;
      for (const t of this.tanks) { if (t === p) continue; if (t.team !== 0 && !t.spotted[0] && t.alive) continue; if (_segDist(t.pos, a, b) > 12) continue; const hh = t.rayTest(a, b); if (hh && hh.t < best) { best = hh.t; stepTank = t; stepInfo = hh; } }
      if (best <= 1) { hitP = a.clone().lerp(b, best); dist += a.distanceTo(hitP); hitTank = stepTank; hitInfo = stepInfo; }
      else { dist += a.distanceTo(b); pos.copy(b); }
    }
    if (!hitP) hitP = pos;
    // centre on the gun's aim point: where the barrel is pointing, projected to screen
    const cv = this.renderer.domElement.getBoundingClientRect();
    const muzzle = m.muzzle.getWorldPosition(new THREE.Vector3());
    const gdir = new THREE.Vector3(0, 0, 1).applyQuaternion(m.gun.getWorldQuaternion(new THREE.Quaternion()));
    const aimAt = muzzle.clone().addScaledVector(gdir, Math.max(dist, 20));
    const sp = aimAt.project(this.camera);
    const sx = (sp.x * 0.5 + 0.5) * cv.width, sy = (-sp.y * 0.5 + 0.5) * cv.height;
    const focus = aimAt;
    // radius from current dispersion; divide by tan(fov/2) so zoom enlarges the circle in proportion
    const cone = p.dispersion(); const rW = Math.tan(cone) * Math.max(dist, 1);
    const dc = Math.max(0.5, this.camera.position.distanceTo(focus));
    const radPx = (rW / dc) / Math.tan(this.camera.fov * DEG / 2) * (cv.height / 2);
    this.reticleRadiusWorld = rW;
    this.reticleWorld = hitP.clone(); this.reticleDist = dist;
    if (!Number.isFinite(sx)) { hud.setReticle(-100, -100, 0, '', ''); return; }
    let state = 'neutral', text = `${Math.round(dist)} m`;
    if (hitTank && hitInfo && hitTank.alive && hitTank.team !== p.team) {
      const ev = this.ballistics.evaluate(hitTank, hitInfo, p.shell, dist);
      if (ev.ricochet) { state = 'red'; text = `RICOCHET · ${ev.angle.toFixed(0)}°`; }
      else if (ev.ratio > 1.08) { state = 'green'; text = `PEN ${Math.round(ev.pen)} vs ${Math.round(ev.eff)} mm`; }
      else if (ev.ratio > 0.92) { state = 'yellow'; text = `CHANCE ${Math.round(ev.pen)} vs ${Math.round(ev.eff)} mm`; }
      else { state = 'red'; text = `NO PEN ${Math.round(ev.pen)} vs ${Math.round(ev.eff)} mm`; }
      text += ` · ${hitTank.spec.short} ${hitInfo.part} ${hitInfo.face} · ${Math.round(dist)} m`;
    }
    if (p.reloadLeft > 0) state += ' reloading';
    if (this.lock) state += ' locked';
    hud.setReticle(sx, sy, radPx, state, text);
  }
  updateCamera(dt) {
    if (this.camOverride) { const o = this.camOverride; this.camera.position.set(o[0], o[1], o[2]); this.camera.fov = o[6] || 60; this.camera.updateProjectionMatrix(); this.camera.lookAt(o[3], o[4], o[5]); this.camera.updateMatrixWorld(); this.effects.setScale(innerHeight, this.camera.fov); for (const t of this.tanks) t.model.root.visible = t.team === 0 || !t.alive || t.spotted[0]; this.updateLOD(); return; }
    const c = this.cam; const f = c.follow && c.follow.alive ? c.follow : this.player.alive ? this.player : (this.tanks.find((t) => t.team === 0 && t.alive) || this.player); c.follow = f;
    const m = f.model; const T = this.world.terrain;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    const sn = c.sniper && f === this.player && f.alive;
    m.root.visible = !sn;
    if (sn) {
      this.camera.position.copy(this.camPosFor(dir, true, m)); c.fov += (50 / c.zoom - c.fov) * Math.min(1, dt * 12); if (!this._wasSn) c.fov = 50 / c.zoom; this.camera.fov = c.fov;
    } else {
      const focus = m.turret.getWorldPosition(new THREE.Vector3()); focus.y += 2.2; const pos = this.camPosFor(dir, false, m);
      const pullIn = pos.distanceTo(focus) < this.camera.position.distanceTo(focus);
      this.camera.position.lerp(pos, Math.min(1, dt * (pullIn ? 30 : 10) + (this._camInit ? 0 : 1))); this._camInit = true; c.fov = 60; this.camera.fov = 60;
    }
    this._wasSn = sn;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camera.position.clone().add(dir));
    this.camera.updateMatrixWorld();
    this.effects.setScale(innerHeight, this.camera.fov);
    this.updateLOD();
  }
  // running-gear LOD: individual track links + detailed wheels only when the tank covers enough screen
  updateLOD() {
    const cp = this.camera.position; const k = this.camera.fov / 60; const near = this.quality === 'low' ? 22 : this.quality === 'high' ? 60 : 40;
    for (const t of this.tanks) { if (!t.model.links) continue; const d = t.pos.distanceTo(cp) * k; setTrackLOD(t.model, t.alive && d < near); }
  }
  update(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05); this.time += dt; setWindTime(this.time);
    this.updatePlayerInput();
    for (const ai of this.ai) if (!this.freezeAI) ai.update(dt);
    this.smokes = this.smokes.filter((c) => c.until > this.time);
    for (const t of this.tanks) if (!t.isPlayer && t.alive && !this.freezeAI) this.npcItems(t);
    for (const t of this.tanks) t.update(dt, this.time);
    this.resolveCollisions();
    for (const t of this.tanks) { if (t.alive) t.updateGround(dt); t.syncModel(); }
    this.ballistics.update(dt); this.spotting.update(dt, this.time);
    // render visibility: enemies only if spotted by our team
    for (const t of this.tanks) { if (t.team !== this.player.team && t.alive) t.model.root.visible = t.spotted[this.player.team]; }
    // emitters (dust, exhaust)
    for (const t of this.tanks) {
      if (!t.alive) continue; const d = t.spec.dims; if (Math.abs(t.speed) > 1.5) { const back = t.model.root.localToWorld(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * d.W * 0.4, 0.2, -d.L * 0.5)); this.effects.trackDust(back, t.speed, t.inWater); }
      if (t.pos.distanceTo(this.camera.position) < 120) this.effects.exhaust(t.model.root.localToWorld(new THREE.Vector3(0.6, d.hullH + 0.2, -d.L * 0.47)), Math.abs(t.input.throttle));
    }
    for (let i = this.flying.length - 1; i >= 0; i--) { const f = this.flying[i]; f.t += dt; if (f.rest) continue; f.v.y -= 9.81 * dt; f.obj.position.addScaledVector(f.v, dt); f.obj.rotation.x += f.w.x * dt; f.obj.rotation.z += f.w.z * dt;
      const gy = this.world.terrain.height(f.obj.position.x, f.obj.position.z); if (f.obj.position.y < gy && f.v.y < 0) { f.obj.position.y = gy; f.rest = true; } }
    this.updateCapture(dt); this.checkEnd();
    this.assist.preCamera();
    this.updateCamera(dt);
    this.computeAim(); this.assist.postAim(dt);
    this.updateReticle();
    this.armorView.update();
    // player bush ghosting
    const pb = this.player.alive ? this.player.inBush : null; this.world.veg.setPlayerBush(pb && !this.cam.sniper ? pb : pb);
    this.world.updateShadowCenter(this.cam.follow.pos); this.world.update(dt, this.time, this.camera.position);
    this.effects.update(dt, (x, z) => this.world.terrain.height(x, z));
    this.audio.setListener(this.camera.position);
    if (this.player.alive && !this.ended) this.audio.engine(Math.abs(this.player.input.throttle), this.player.speed); else this.audio.stopEngine();
    this.hud.update(dt, this.camera);
  }
  render() {
    if (this.post) this.post.render(); else this.renderer.render(this.scene, this.camera);
    if (this.outline && !this.camOverride) this.outline.render(this.assist.outlineTarget(), this.camera);
  }
  dispose() {
    for (const [ev, list] of Object.entries(this._h)) for (const [tgt, fn] of list) tgt.removeEventListener(ev, fn);
    this.armorView.dispose(); this.hud.destroy(); this.audio.stopEngine(); this.world.dispose(); if (this.post) this.post.dispose(); if (this.outline) this.outline.dispose();
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
      teleport: (x, z, h = 0) => { this.player.placeAt(x, z, h); },
      cam: (yaw, pitch, dist) => { this.cam.yaw = yaw; this.cam.pitch = pitch; if (dist) this.cam.dist = dist; this._camInit = false; },
      freeze: (v = true) => { this.freezeAI = v; for (const t of this.tanks) if (!t.isPlayer) { t.input.throttle = 0; t.input.steer = 0; } },
      place: (idx, x, z, h) => { this.tanks[idx].placeAt(x, z, h); },
      simulate: (sec, dt = 1 / 30) => { const t0 = performance.now(); const n = Math.round(sec / dt); for (let i = 0; i < n && !this.ended; i++) this.update(dt); return { ms: Math.round(performance.now() - t0), perFrame: +((performance.now() - t0) / n).toFixed(2), ended: this.ended, result: this.result }; },
      look: (dx, dy) => this.mouseLook(dx, dy),
      assist: () => { const a = this.assist; return { enabled: a.enabled, locked: !!a.target, target: a.target ? this.tanks.indexOf(a.target) : -1, focus: a.focus ? this.tanks.indexOf(a.focus) : -1, outline: this.outline && this.outline.lastDrawn ? this.tanks.indexOf(this.outline.lastDrawn) : -1, offPx: +a.offPx().toFixed(1), drag: +a.dragFactor().toFixed(3), lastBreak: a.lastBreak, stats: { ...a.stats }, yaw: this.cam.yaw, pitch: this.cam.pitch, aimTank: this.aimTank ? this.tanks.indexOf(this.aimTank) : -1 }; },
      fire: () => { this.player.reloadLeft = 0; return this.player.tryFire(this.time); },
      aim: (x, y, z) => { if (x === null) { this.debugAim = null; return; } this.debugAim = new THREE.Vector3(x, y, z); this.aimPoint.set(x, y, z); this.player.input.aim.set(x, y, z); },
      tank: (i) => this.tanks[i],
      camAt: (a) => { this.camOverride = a; for (const id of ['h-markers', 'h-ret', 'h-cross']) { const e = document.getElementById(id); if (e) e.style.visibility = a ? 'hidden' : ''; } },
      pause: (v = true) => { this.debugPaused = v; },
      info: () => ({ time: this.time, alive: this.tanks.map((t) => [t.name, t.spec.id, t.team, t.alive, Math.round(t.hp), Math.round(t.pos.x), Math.round(t.pos.z), t.spotted, !!t.inBush]), stats: this.world.stats, genMs: Math.round(this.world.genTime) }),
    };
  }
}
void wrapAngle;
