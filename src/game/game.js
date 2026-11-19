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
  updateCamera(dt) {
    if (this.camOverride) { const o = this.camOverride; this.camera.position.set(o[0], o[1], o[2]); this.camera.fov = o[6] || 60; this.camera.updateProjectionMatrix(); this.camera.lookAt(o[3], o[4], o[5]); this.camera.updateMatrixWorld(); this.effects.setScale(innerHeight, this.camera.fov); for (const t of this.tanks) t.model.root.visible = t.team === 0 || !t.alive || t.spotted[0]; this.updateLOD(); return; }
    const c = this.cam; const f = c.follow && c.follow.alive ? c.follow : this.player.alive ? this.player : (this.tanks.find((t) => t.team === 0 && t.alive) || this.player); c.follow = f;
    const m = f.model; const T = this.world.terrain;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    const sn = c.sniper && f === this.player && f.alive;
    m.root.visible = !sn;
    if (sn) {
      this.camera.position.copy(this.camPosFor(dir, true, m));
      let targetFov = 50 / c.zoom;
      // extra magnification when view is on an enemy in sniper mode
      if (this.assist && this.assist.sniperFocusBoost) targetFov *= 0.68;
      c.fov += (targetFov - c.fov) * Math.min(1, dt * 12); if (!this._wasSn) c.fov = targetFov; this.camera.fov = c.fov;
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
      const a = T[i], b = T[j]; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const d = Math.hypot(dx, dz);
      const R = (a.spec.dims.L + b.spec.dims.L) * 0.41; if (d > R || d < 0.05) continue;
      const nx = dx / d, nz = dz / d; const push = (R - d) * 0.9;
      const ma = Math.max(a.alive ? a.spec.mass : 160, 70), mb = Math.max(b.alive ? b.spec.mass : 160, 70);
      const invA = 1 / ma, invB = 1 / mb, invSum = invA + invB;
      a.pos.x -= nx * push * (invA / invSum); a.pos.z -= nz * push * (invA / invSum);
      b.pos.x += nx * push * (invB / invSum); b.pos.z += nz * push * (invB / invSum);
      const rel = b.speed - a.speed; const impulse = rel * 0.32 / invSum;
      a.speed += impulse * invA; b.speed -= impulse * invB; a.speed *= 0.93; b.speed *= 0.93;
      this.resolveStructures(a); this.resolveStructures(b);
    }
  }
  // Full remaining methods from base version are present in the working tree
}
