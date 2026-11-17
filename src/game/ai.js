// NPC tank AI: roles (assault / sniper / defender), lane navigation with A*, bush-seeking,
// team-shared spotting, target selection with weak-spot & ammo choice, hull angling, retreat.
import * as THREE from 'three';
import { clamp, wrapAngle, DEG } from '../util.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3();

export class AIController {
  constructor(game, tank, role, laneIdx, skill = 1) {
    this.g = game; this.t = tank; this.role = role; this.laneIdx = laneIdx; this.skill = skill;
    const lane = game.world.lanes[laneIdx].map((p) => p.slice()); this.lane = tank.team === 0 ? lane : lane.reverse();
    this.wp = 1; this.path = []; this.pi = 0; this.repath = 0; this.goal = null; this.state = 'advance';
    this.target = null; this.reactUntil = 0; this.think = Math.random() * 0.3; this.hold = null; this.holdHeading = null;
    this.lastPos = tank.pos.clone(); this.stuckT = 0; this.reverseT = 0; this.revSteer = 1; this.aimErr = new THREE.Vector3(); this.bestRatio = 1; this.aimLocal = new THREE.Vector3();
    this.retreatUntil = 0; this.sniperIdle = 0; this.lastHp = tank.hp; this.reserved = null; this.idleScan = Math.random() * 6;
    this.angleOff = (tank.spec.id === 'tiger' || tank.spec.id === 'sherman') ? (Math.random() < 0.5 ? 1 : -1) * 25 * DEG : 0;
    this.enemyBase = game.world.bases[1 - tank.team]; this.ownBase = game.world.bases[tank.team];
    if (role === 'sniper' || role === 'defender') this.pickHold();
  }
  // --- helpers ---
  findBush(x, z, R, awayFrom) {
    const veg = this.g.world.veg; let best = null, bs = 1e9;
    for (const b of veg.bushGrid.query(x, z, R)) {
      if (b.r < 3.3 || b.claimed && b.claimed !== this) continue;
      const [i, j] = this.g.nav.toCell(b.x, b.z); if (!this.g.nav.walkable(i, j)) continue;
      let s = Math.hypot(b.x - x, b.z - z);
      if (awayFrom) s -= Math.hypot(b.x - awayFrom.x, b.z - awayFrom.z) * 0.8;
      if (s < bs) { bs = s; best = b; }
    }
    return best;
  }
  claim(b) { if (this.reserved) this.reserved.claimed = null; this.reserved = b; if (b) b.claimed = this; }
  pickHold() {
    const L = this.lane; let pt;
    if (this.role === 'defender') { const a = L[0], b = L[1]; pt = [a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25]; }
    else { const k = Math.max(1, Math.floor((L.length - 1) / 2)); const a = L[k - 1], b = L[k]; const f = 0.45 + Math.random() * 0.5; pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
    const b = this.findBush(pt[0], pt[1], 110);
    if (b) { this.claim(b); this.hold = [b.x, b.z]; } else this.hold = pt;
    this.holdHeading = Math.atan2(this.enemyBase.x - this.hold[0], this.enemyBase.z - this.hold[1]);
    this.setGoal(this.hold);
  }
  setGoal(p) { this.goal = p; this.path = this.g.nav.findPath(this.t.pos.x, this.t.pos.z, p[0], p[1]); this.pi = 0; this.repath = 8 + Math.random() * 4; }
  strategicGoal() {
    const t = this.t, g = this.g;
    // defend own base if being captured
    const cap = g.capture[t.team];
    if (cap.points > 5 && (this.role === 'defender' || Math.hypot(t.pos.x - this.ownBase.x, t.pos.z - this.ownBase.z) < 350)) {
      if (this.state !== 'defendBase') { this.state = 'defendBase'; this.claim(null); this.setGoal([this.ownBase.x + (Math.random() - 0.5) * 30, this.ownBase.z + (Math.random() - 0.5) * 30]); }
      return;
    } else if (this.state === 'defendBase') { this.state = 'advance'; if (this.hold) this.setGoal(this.hold); }
    if (this.state === 'retreat') { if (g.time > this.retreatUntil) { this.state = 'advance'; this.path = []; } return; }
    if (this.hold) {
      if (this.role === 'sniper' && this.sniperIdle > 75) { this.hold = null; this.claim(null); this.role = 'assault'; this.path = []; }
      else return;
    }
    if (!this.path.length || this.pi >= this.path.length) {
      if (this.wp < this.lane.length - 1) {
        const p = this.lane[this.wp];
        if (Math.hypot(t.pos.x - p[0], t.pos.z - p[1]) < 40) this.wp++;
        this.setGoal(this.lane[this.wp]);
      } else {
        const b = this.enemyBase; const a = Math.random() * 6.28, r = Math.random() * b.r * 0.6;
        this.state = 'capture'; this.setGoal([b.x + Math.cos(a) * r, b.z + Math.sin(a) * r]);
      }
    }
  }
  // --- tactical ---
  chooseTarget() {
    const t = this.t, g = this.g; let best = null, bs = -1e9;
    for (const e of g.tanks) {
      if (!e.alive || e.team === t.team || !e.spotted[t.team]) continue;
      const d = t.pos.distanceTo(e.pos); if (d > 900) continue;
      const eye = t.model.gun.getWorldPosition(_p);
      const los = !g.world.losBlocked(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + e.spec.dims.hullH * 0.7, e.pos.z) || !g.world.losBlocked(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + e.spec.dims.hullH + e.spec.dims.turretH * 0.6, e.pos.z);
      if (!los) continue;
      let s = 600 / (d + 50) + (1 - e.hp / e.maxHp) * 1.2 + (e === this.target ? 1.0 : 0) + (e.lastAttacker === t ? 0.3 : 0) + (t.lastAttacker === e ? 1.2 : 0);
      if (s > bs) { bs = s; best = e; }
    }
    if (best !== this.target) { this.target = best; this.reactUntil = g.time + (0.6 + Math.random() * 0.9) / this.skill; this.resampleError(); }
  }
  resampleError() { const s = (0.9 + Math.random() * 0.8) / this.skill / 1000; this.aimErr.set(this.g.rng.gauss() * s, this.g.rng.gauss() * s * 0.7, this.g.rng.gauss() * s); }
  planShot() {
    // evaluate candidate aim points & shells, pick best penetration ratio
    const t = this.t, e = this.target, g = this.g; const d = e.spec.dims;
    const muzzle = t.model.gun.getWorldPosition(new THREE.Vector3());
    const cands = [new THREE.Vector3(0, d.hullH * 0.62, 0), new THREE.Vector3(0, d.hullH + d.turretH * 0.5, d.turretZ), new THREE.Vector3(0, d.clearance + 0.75, d.L * 0.25), new THREE.Vector3(0, d.hullH * 0.62, -d.L * 0.3)];
    let best = { ratio: -1 }; let curBest = -1;
    for (const c of cands) {
      const w = e.model.root.localToWorld(c.clone());
      if (g.world.losBlocked(muzzle.x, muzzle.y, muzzle.z, w.x, w.y, w.z)) continue;
      const dir = w.clone().sub(muzzle); const dist = dir.length(); dir.normalize();
      const hit = e.rayTest(muzzle.clone().addScaledVector(dir, Math.max(0, dist - 8)), w.clone().addScaledVector(dir, 6));
      if (!hit) continue;
      for (let si = 0; si < t.spec.shells.length; si++) {
        if (t.ammo[si] <= 0) continue; const sh = t.spec.shells[si]; const ev = g.ballistics.evaluate(e, hit, sh, dist);
        let ratio = ev.ricochet ? 0.05 : ev.ratio; if (sh.type === 'HE') ratio = ev.ratio > 1 ? ratio : Math.min(0.7, sh.damage * 0.45 * (1 - ev.eff / (sh.caliber * 1.2)) / 150);
        const premium = sh.type === 'APCR' ? 0.15 : 0; const score = Math.min(ratio, 1.6) - premium + (ratio > 1 ? sh.damage / 2000 : 0);
        if (score > (best.score ?? -9)) best = { score, ratio, si, local: c, dist };
        if (si === t.shellIdx && ratio > curBest) curBest = ratio;
      }
    }
    if (best.ratio < 0) { this.bestRatio = 0; this.aimLocal.set(0, d.hullH * 0.62, 0); return; }
    this.bestRatio = best.ratio; this.aimLocal.copy(best.local);
    if (best.si !== t.shellIdx && curBest < 0.95 && best.ratio > curBest + 0.15) t.selectShell(best.si);
  }
  steerTo(x, z, speedF = 1) {
    const t = this.t; const des = Math.atan2(x - t.pos.x, z - t.pos.z); const diff = wrapAngle(des - t.heading); const dist = Math.hypot(x - t.pos.x, z - t.pos.z);
    t.input.steer = clamp(diff * 2.2, -1, 1); t.input.throttle = (Math.abs(diff) > 1.1 ? 0 : Math.abs(diff) > 0.5 ? 0.4 : 1) * speedF * (dist < 12 ? 0.5 : 1);
    return dist;
  }
  faceHeading(h) { const t = this.t; const diff = wrapAngle(h - t.heading); t.input.steer = Math.abs(diff) > 0.06 ? clamp(diff * 2, -1, 1) : 0; t.input.throttle = 0; }
  avoid() {
    const t = this.t; const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    for (const o of this.g.tanks) { if (o === t) continue; const dx = o.pos.x - t.pos.x, dz = o.pos.z - t.pos.z; const d = Math.hypot(dx, dz); if (d > 16) continue;
      const ahead = (dx * fx + dz * fz) / d; const lat = dx * fz - dz * fx;
      if (ahead > 0.5 && t.input.throttle > 0) { t.input.steer = clamp(t.input.steer + (lat > 0 ? -0.8 : 0.8), -1, 1); if (d < 9) t.input.throttle *= 0.2; } }
  }
  update(dt) {
    const t = this.t, g = this.g; if (!t.alive) { this.claim(null); return; }
    this.think -= dt; this.repath -= dt;
    if (t.hp < this.lastHp) { this.lastHp = t.hp; this.recentlyHit = g.time; }
    if (this.think <= 0) {
      this.think = 0.25 + Math.random() * 0.1;
      this.chooseTarget(); this.strategicGoal();
      if (this.target) this.planShot();
      if (this.hold && !this.target) this.sniperIdle += 0.3; else this.sniperIdle = 0;
      if (this.state !== 'retreat' && t.hp < t.maxHp * 0.3 && this.target && t.pos.distanceTo(this.target.pos) < 450 && !t.inBush) {
        const b = this.findBush(t.pos.x, t.pos.z, 140, this.target.pos); if (b) { this.state = 'retreat'; this.retreatUntil = g.time + 25; this.claim(b); this.setGoal([b.x, b.z]); }
      }
      if (this.repath <= 0 && this.goal && this.state !== 'hold') this.setGoal(this.goal);
    }
    // ---- movement ----
    const tgt = this.target; const dTgt = tgt ? t.pos.distanceTo(tgt.pos) : 1e9;
    let moving = true;
    if (this.reverseT > 0) { this.reverseT -= dt; t.input.throttle = -0.8; t.input.steer = this.revSteer; if (this.reverseT <= 0) this.setGoal(this.goal || [this.enemyBase.x, this.enemyBase.z]); }
    else {
      const atHold = this.hold && Math.hypot(t.pos.x - this.hold[0], t.pos.z - this.hold[1]) < 3.5;
      const engageStop = tgt && ((this.role === 'assault' && dTgt < 380 && this.bestRatio > 0.7) || this.state === 'capture' || atHold || (this.state === 'retreat' && t.inBush));
      if (atHold || engageStop) {
        moving = false;
        if (tgt) this.faceHeading(Math.atan2(tgt.pos.x - t.pos.x, tgt.pos.z - t.pos.z) + this.angleOff);
        else if (this.holdHeading !== null && atHold) this.faceHeading(this.holdHeading);
        else { t.input.throttle = 0; t.input.steer = 0; }
        if (this.state === 'capture' && !tgt) { const b = this.enemyBase; if (Math.hypot(t.pos.x - b.x, t.pos.z - b.z) > b.r * 0.7) { moving = true; this.steerTo(b.x, b.z, 0.6); } }
      } else if (this.path.length && this.pi < this.path.length) {
        const p = this.path[this.pi]; const last = this.pi === this.path.length - 1;
        const d = this.steerTo(p[0], p[1], tgt && dTgt < 500 && t.spec.stabilizer > 0.5 ? 0.6 : 1);
        if (d < (last ? 3 : 9)) this.pi++;
      } else { t.input.throttle = 0; t.input.steer = 0; moving = false; }
      if (moving) this.avoid();
    }
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 2.5) { const moved = t.pos.distanceTo(this.lastPos); if (moving && Math.abs(t.input.throttle) > 0.3 && moved < 1.5 && this.reverseT <= 0) { const h = t.heading; this.g.nav.penalize(t.pos.x + Math.sin(h) * 5, t.pos.z + Math.cos(h) * 5); this.g.nav.penalize(t.pos.x, t.pos.z, 4); this.reverseT = 1.8; this.revSteer = Math.random() < 0.5 ? -1 : 1; } this.lastPos.copy(t.pos); this.stuckT = 0; }
    // ---- gunnery ----
    if (tgt) {
      const flight = dTgt / t.shell.velocity; const w = tgt.model.root.localToWorld(_q.copy(this.aimLocal));
      w.addScaledVector(tgt.vel, flight * (0.7 + 0.3 * this.skill)); w.x += this.aimErr.x * dTgt; w.y += this.aimErr.y * dTgt; w.z += this.aimErr.z * dTgt;
      t.input.aim.copy(w);
      const ready = t.reloadLeft <= 0 && g.time > this.reactUntil && t.aimError < 0.004 + 0.002 / this.skill && t.bloom < (t.spec.stabilizer < 0.5 ? 2.6 : 1.7);
      const worth = this.bestRatio > 0.85 || (this.bestRatio > 0.55 && g.time - (this.recentlyHit || -99) < 6) || dTgt < 60;
      const concealOK = !t.inBush || this.bestRatio > 1.0 || dTgt < 250 || this.role !== 'sniper';
      if (ready && worth && concealOK && !this.allyInLine(tgt)) { if (t.tryFire(g.time)) this.resampleError(); }
    } else {
      this.idleScan += dt * 0.25; const base = this.enemyBase; const h = Math.atan2(base.x - t.pos.x, base.z - t.pos.z) + Math.sin(this.idleScan) * 0.6;
      t.input.aim.set(t.pos.x + Math.sin(h) * 300, t.pos.y + 2, t.pos.z + Math.cos(h) * 300);
      // keep a reasonable round loaded
      if (t.shellIdx !== 0 && t.ammo[0] > 0 && t.reloadLeft <= 0) t.selectShell(0);
    }
  }
  allyInLine(tgt) {
    const t = this.t; const a = t.pos, b = tgt.pos; const dx = b.x - a.x, dz = b.z - a.z; const l2 = dx * dx + dz * dz;
    for (const o of this.g.tanks) { if (o === t || o.team !== t.team || !o.alive) continue; const u = ((o.pos.x - a.x) * dx + (o.pos.z - a.z) * dz) / l2; if (u <= 0 || u >= 1) continue; const px = a.x + dx * u, pz = a.z + dz * u; if (Math.hypot(o.pos.x - px, o.pos.z - pz) < 4) return true; }
    return false;
  }
}
