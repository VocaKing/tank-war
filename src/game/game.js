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
    Object.defineProperty(this, 'lastTankHit', { configurable: true, enumerable: true, get() { return this._lastTankHit; }, set(v) { this._lastTankHit = v; if (v && v.tank && v.tank.markHit) v.tank.markHit(!!v.penetrated); } });
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
        let x = base.x + fx * 22 + px * (i - 3) * 13 + r.range(-2, 2), z = base.z + fz * 22 + pz * (i - 3) * 13 + r.range(-2, 2);
        const [ci, cj] = this.nav.nearestWalkable(...this.nav.toCell(x, z)); [x, z] = this.nav.center(ci, cj);
        t.placeAt(x, z, Math.atan2(fx, fz)); t.input.aim.set(x + fx * 300, t.pos.y + 2, z + fz * 300);
        this.tanks.push(t);
        if (!isPlayer) this.ai.push(new AIController(this, t, roles[i], lanes[i], 0.8 + r.next() * 0.5));
      });
    }
  }
  resolveCollisions() {
    const T = this.tanks; const W = this.world;
    for (const t of T) {
      const d = t.spec.dims; const fx = Math.sin(t.heading), fz = Math.cos(t.heading); const r = d.W * 0.5;
      this.resolveStructures(t);
      for (const off of [-d.L * 0.3, 0, d.L * 0.3]) {
        const cx = t.pos.x + fx * off, cz = t.pos.z + fz * off;
        for (const rk of W.veg.rockGrid.query(cx, cz, r + 3)) { if (rk.s < 1.6) continue; const dx = cx - rk.x, dz = cz - rk.z; const dd = Math.hypot(dx, dz); const R = r + rk.s * 0.85; if (dd < R && dd > 0.01) { t.pos.x += dx / dd * (R - dd); t.pos.z += dz / dd * (R - dd); t.speed *= 0.95; } }
      }
      const H = W.playHalf - 4; if (Math.abs(t.pos.x) > H) { t.pos.x = Math.sign(t.pos.x) * H; t.speed *= 0.8; } if (Math.abs(t.pos.z) > H) { t.pos.z = Math.sign(t.pos.z) * H; t.speed *= 0.8; }
    }
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const R = (a.spec.dims.L + b.spec.dims.L) * 0.41;
      if (d > R || d < 0.05) continue;
      const nx = dx / d, nz = dz / d;
      const push = (R - d) * 0.9;
      const ma = Math.max(a.alive ? a.spec.mass : 160, 70);
      const mb = Math.max(b.alive ? b.spec.mass : 160, 70);
      const invA = 1 / ma, invB = 1 / mb, invSum = invA + invB;
      a.pos.x -= nx * push * (invA / invSum);
      a.pos.z -= nz * push * (invA / invSum);
      b.pos.x += nx * push * (invB / invSum);
      b.pos.z += nz * push * (invB / invSum);
      const rel = b.speed - a.speed;
      const impulse = rel * 0.32 / invSum;
      a.speed += impulse * invA;
      b.speed -= impulse * invB;
      a.speed *= 0.93; b.speed *= 0.93;
      this.resolveStructures(a); this.resolveStructures(b);
    }
  }
  update(dt) {
    if (this.paused || this.ended) return;
    dt = Math.min(dt, 0.05); this.time += dt;
    setWindTime(this.time);
    this.updatePlayerInput();
    for (const a of this.ai) a.update(dt);
    this.smokes = this.smokes.filter((s) => s.until > this.time);
    for (const t of this.tanks) t.update(dt, this.time);
    this.resolveCollisions();
    for (const t of this.tanks) t.updateGround(dt);
    for (const t of this.tanks) t.syncModel();
    this.ballistics.update(dt);
    this.spotting.update(dt);
    for (const t of this.tanks) {
      if (t.team === this.player.team) continue;
      if (!t.alive) { if (!t._deathTime) t._deathTime = this.time; t.model.root.visible = this.time - t._deathTime < 8; }
      else t.model.root.visible = t.spotted[this.player.team];
    }
    this.updateCapture(dt);
    this.checkEnd();
    this.computeAim();
    this.updateCamera(dt);
    this.updateReticle();
    this.world.update(dt, this.time, this.camera.position);
    this.effects.update(dt);
    this.audio.update(this.time);
    this.hud.update(this);
  }
  // ... other methods (bindInput, camera, reticle, etc.) remain as in previous version
}
