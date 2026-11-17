// Projectile simulation: gravity ballistics, terrain/structure/water/tank intersection,
// armour penetration with slope, normalisation, ricochet, overmatch, HEAT/ERA and HE blast.
import * as THREE from 'three';
import { SHELL_TYPES, penAtRange, PEN_RNG } from './tankData.js';
import { GRAVITY } from './tank.js';
import { clamp } from '../util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Ballistics {
  constructor(game) { this.game = game; this.shells = []; }
  spawn(owner, spec, pos, vel) {
    const s = { owner, spec, type: SHELL_TYPES[spec.type], pos: pos.clone(), vel: vel.clone(), dist: 0, life: 0, noDamage: false, ricochets: 0 };
    this.shells.push(s); this.game.effects.addTracer(s); return s;
  }
  // predict outcome vs a tank at a hit (used by HUD indicator and AI)
  evaluate(tank, hit, spec, dist) {
    const type = SHELL_TYPES[spec.type]; const a = tank.armorAt(hit, spec, type); const pen = penAtRange(spec, dist);
    return { ...a, pen, ratio: pen / a.eff };
  }
  update(dt) {
    const g = this.game, W = g.world;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]; s.life += dt;
      const speed = s.vel.length(); const steps = Math.max(1, Math.ceil((speed * dt) / 30)); const h = dt / steps; let done = false;
      for (let k = 0; k < steps && !done; k++) {
        _a.copy(s.pos); s.vel.y -= GRAVITY * h; _b.copy(s.pos).addScaledVector(s.vel, h);
        let bestT = 2, kind = null, hitTank = null, hitInfo = null;
        const tt = W.terrain.segmentHit(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, 1.5); if (tt >= 0 && tt < bestT) { bestT = tt; kind = 'ground'; }
        const ts = W.structureHit(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z); if (ts >= 0 && ts < bestT) { bestT = ts; kind = 'structure'; }
        const wl = W.terrain.waterLevel(_b.x, _b.z); if (wl > -1e8 && _b.y < wl && _a.y >= wl) { const tw = (_a.y - wl) / (_a.y - _b.y); if (tw < bestT) { bestT = tw; kind = 'water'; } }
        for (const t of g.tanks) {
          if (t === s.owner && s.life < 0.3) continue;
          const cx = t.pos.x, cz = t.pos.z; const R = t.spec.dims.L * 0.65 + 1;
          // distance from tank centre to segment (2D) broad-phase
          const dx = _b.x - _a.x, dz = _b.z - _a.z; const l2 = dx * dx + dz * dz; let u = l2 > 0 ? ((cx - _a.x) * dx + (cz - _a.z) * dz) / l2 : 0; u = clamp(u, 0, 1);
          if (Math.hypot(_a.x + dx * u - cx, _a.z + dz * u - cz) > R) continue;
          const hit = t.rayTest(_a, _b); if (hit && hit.t < bestT) { bestT = hit.t; kind = 'tank'; hitTank = t; hitInfo = hit; }
        }
        if (kind) {
          const p = new THREE.Vector3().lerpVectors(_a, _b, bestT); s.dist += _a.distanceTo(p);
          done = this.onImpact(s, kind, p, hitTank, hitInfo);
          if (!done) { s.pos.copy(p); }
        } else { s.dist += _a.distanceTo(_b); s.pos.copy(_b); }
      }
      if (!done && (s.life > 8 || s.pos.y < -200 || Math.abs(s.pos.x) > 1500 || Math.abs(s.pos.z) > 1500)) done = true;
      if (done) { g.effects.removeTracer(s); this.shells.splice(i, 1); }
      else if (s.tracer) { const v = s.vel; const len = Math.min(18, v.length() * 0.012); s.tracer.position.copy(s.pos).addScaledVector(v, -0.5 * len / v.length()); s.tracer.scale.set(1, 1, len); s.tracer.lookAt(_b.copy(s.pos).add(v)); }
    }
  }
  heBlast(s, p) {
    const g = this.game; const R = s.spec.caliber / 22;
    for (const t of g.tanks) { if (!t.alive) continue; const d = t.pos.distanceTo(p) - t.spec.dims.W * 0.5; if (d > R) continue;
      const top = t.spec.armor.hull.top[0]; const dmg = s.spec.damage * 0.25 * (1 - Math.max(0, d) / R) * clamp(1 - top / (s.spec.caliber * 0.8), 0, 1);
      if (dmg > 1) { t.damage(dmg, s.owner, 'he'); if (s.owner?.isPlayer) g.hud.hitMarker('splash', Math.round(dmg)); if (t.isPlayer) g.hud.damageFrom(s.owner, Math.round(dmg)); }
      if (d < R * 0.5 && g.rng.next() < 0.35 && t.alive) t.breakTracks(); }
  }
  // returns true if the shell is consumed
  onImpact(s, kind, p, tank, hit) {
    const g = this.game; const he = !!s.type.he; g.lastImpact = { kind, p: p.clone(), owner: s.owner, tank: tank || null };
    if (kind === 'ground') { g.effects.impactGround(p, s.spec.caliber, he); g.audio.impact(p, he ? 'explosion' : 'ground'); if (he && !s.noDamage) this.heBlast(s, p); return true; }
    if (kind === 'structure') { g.effects.impactStructure(p); g.audio.impact(p, he ? 'explosion' : 'ground'); if (he && !s.noDamage) this.heBlast(s, p); return true; }
    if (kind === 'water') { g.effects.impactWater(p); g.audio.impact(p, 'ground'); return true; }
    // tank impact
    const ev = this.evaluate(tank, hit, s.spec, s.dist);
    const shooter = s.owner; const toPlayer = tank.isPlayer, fromPlayer = shooter && shooter.isPlayer;
    if (s.noDamage) { g.effects.sparks(p, 12); return true; }
    if (shooter && tank.alive && shooter.team !== tank.team) shooter.stats.hits++;
    const dirN = s.vel.clone().normalize();
    if (!tank.alive) { g.effects.sparks(p, 20); g.audio.impact(p, 'metal'); return true; }
    if (ev.ricochet && s.ricochets < 1) {
      const n = ev.normalW; const v = s.vel; v.addScaledVector(n, -2 * v.dot(n)).multiplyScalar(0.55); s.pos.copy(p).addScaledVector(n, 0.08); s.ricochets++; s.noDamage = true; s.life = Math.max(s.life, 6.5);
      g.effects.sparks(p, 30, [1, 0.85, 0.5], v.clone().normalize()); g.audio.impact(p, 'ricochet');
      if (fromPlayer) g.hud.hitMarker('ricochet'); if (toPlayer) g.hud.damageFrom(shooter, 0, 'Ricochet');
      return false;
    }
    const roll = ev.pen * g.rng.range(1 - PEN_RNG, 1 + PEN_RNG);
    if (roll >= ev.eff) {
      const mult = s.type.he ? 1.0 : 1.0; const dmg = s.spec.damage * mult * g.rng.range(0.85, 1.15);
      g.effects.penetration(p); g.audio.impact(p, 'metal');
      const msgs = tank.applyPenetration(hit, s.spec, shooter, dmg);
      if (shooter && shooter.team !== tank.team) shooter.stats.pens++;
      if (fromPlayer) g.hud.hitMarker('pen', Math.round(dmg), msgs, tank); if (toPlayer) g.hud.damageFrom(shooter, Math.round(dmg), msgs.join(', '));
      if (he) this.heBlast(s, p);
      return true;
    }
    // non-penetration
    g.effects.sparks(p, 22); g.audio.impact(p, 'metal');
    let dmg = 0;
    if (he) { dmg = s.spec.damage * 0.45 * clamp(1 - ev.eff / (s.spec.caliber * 1.2), 0, 1); if (dmg > 1) tank.damage(dmg, shooter, 'he'); g.effects.impactGround(p, s.spec.caliber, true);
      // HE/HESH blast wrecks external modules even without penetrating
      if (tank.alive && g.rng.next() < 0.4) { const m = ['gun', 'turret', 'engine'][Math.floor(g.rng.next() * 3)]; if (tank.modules[m] === 1) { tank.modules[m] = 0.5; if (toPlayer) g.hud.message(m[0].toUpperCase() + m.slice(1) + ' damaged by HE blast', '#ffb060'); } } }
    if (ev.tracks && g.rng.next() < 0.45) { tank.breakTracks(); if (toPlayer) g.hud.message('Tracks destroyed! Repairing…', '#ffb060'); }
    if (fromPlayer) g.hud.hitMarker(dmg > 1 ? 'blast' : 'nonpen', Math.round(dmg)); if (toPlayer) g.hud.damageFrom(shooter, Math.round(dmg), dmg > 1 ? 'HE blast' : 'Hit – not penetrated');
    return true;
  }
}
