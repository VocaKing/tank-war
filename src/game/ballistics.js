// Projectile simulation: gravity ballistics, terrain/structure/water/tank intersection,
// armour penetration with slope, normalisation, ricochet, overmatch, HEAT/ERA and HE blast.
import * as THREE from 'three';
import { SHELL_TYPES, penAtRange, PEN_RNG } from './tankData.js';
import { GRAVITY } from './tank.js';
import { clamp } from '../util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// Water never makes a tank immune: a shell that enters water keeps flying and loses penetration per metre of water
// it travels through (kinetic rounds −12 %/m, HEAT jets −30 %/m), down to a floor of 35 % / 25 %.
export function waterPenFactor(type, metres) { return type.heat ? Math.max(0.25, 1 - 0.3 * metres) : Math.max(0.35, 1 - 0.12 * metres); }

export class Ballistics {
  constructor(game) { this.game = game; this.shells = []; }
  spawn(owner, spec, pos, vel) {
    const s = { owner, spec, type: SHELL_TYPES[spec.type], pos: pos.clone(), vel: vel.clone(), target: spec.guided ? owner.input.aim.clone() : null, dist: 0, life: 0, noDamage: false, ricochets: 0 };
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
      const s = this.shells[i], lifeStart = s.life; s.life += dt;
      const speed = s.vel.length(); const steps = Math.max(1, Math.ceil((speed * dt) / 30)); const h = dt / steps; let done = false;
      for (let k = 0; k < steps && !done; k++) {
        _a.copy(s.pos);
        if (s.spec.guided && s.target) {
          const speed = s.vel.length(), desired = s.target.clone().sub(s.pos).normalize().multiplyScalar(speed);
          s.vel.lerp(desired, clamp(dt * 1.6, 0, 1));
        } else s.vel.y -= GRAVITY * h;
        _b.copy(s.pos).addScaledVector(s.vel, h);
        // Hard-kill APS checks the incoming segment before ordinary armour collision.
        for (const t of g.tanks) {
          if (!t.alive || t.team === s.owner?.team || !t.spec.aps) continue;
          const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z;
          const l2 = dx*dx + dy*dy + dz*dz;
          const u = l2 > 1e-9 ? clamp(((t.pos.x-_a.x)*dx + (t.pos.y+t.spec.dims.hullH*0.62-_a.y)*dy + (t.pos.z-_a.z)*dz) / l2, 0, 1) : 0;
          const closest = _a.clone().addScaledVector(new THREE.Vector3(dx,dy,dz), u);
          if (t.tryAPS(s, closest)) {
            g.effects.explosion(closest, false); g.audio.impact(closest, 'explosion');
            done = true; break;
          }
        }
        if (done) break;
        let bestT = 2, kind = null, hitTank = null, hitInfo = null;
        const tt = W.terrain.segmentHit(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, 1.5); if (tt >= 0 && tt < bestT) { bestT = tt; kind = 'ground'; }
        const ts = W.structureHit(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z); if (ts >= 0 && ts < bestT) { bestT = ts; kind = 'structure'; }
        const wl = W.terrain.waterLevel(_b.x, _b.z); if (!s.wet && wl > -1e8 && _b.y < wl && _a.y >= wl) { const tw = (_a.y - wl) / (_a.y - _b.y); if (tw < bestT) { bestT = tw; kind = 'water'; } }
        for (const t of g.tanks) {
          if (t === s.owner && s.life < 0.3) continue;
          const cx = t.pos.x, cz = t.pos.z; const R = t.spec.dims.L * 0.65 + 1;
          // distance from tank centre to segment (2D) broad-phase
          const dx = _b.x - _a.x, dz = _b.z - _a.z; const l2 = dx * dx + dz * dz; let u = l2 > 0 ? ((cx - _a.x) * dx + (cz - _a.z) * dz) / l2 : 0; u = clamp(u, 0, 1);
          if (Math.hypot(_a.x + dx * u - cx, _a.z + dz * u - cz) > R) continue;
          const hit = t.rayTest(_a, _b); if (hit && hit.t < bestT) { bestT = hit.t; kind = 'tank'; hitTank = t; hitInfo = hit; }
        }
        // shells travelling under water keep going but lose penetration with every metre of water (see waterPenFactor)
        if (s.wet) { const tEnd = kind ? bestT : 1; let wla = W.terrain.waterLevel(_a.x, _a.z), wlb = W.terrain.waterLevel(_b.x, _b.z); if (wla < -1e8) wla = s.wl; if (wlb < -1e8) wlb = s.wl; // near the bank use the surface level where the shell entered
          { const da = _a.y - wla, yb = _a.y + (_b.y - _a.y) * tEnd, db = yb - wlb;
            const frac = da <= 0 && db <= 0 ? 1 : da > 0 && db > 0 ? 0 : da <= 0 ? da / (da - db) : db / (db - da);
            s.waterDist += _a.distanceTo(_b) * tEnd * Math.max(0, Math.min(1, frac)); if (s.waterDist > 15) { done = true; break; } } }
        const stepLife = lifeStart + k * h;
        const fuseFrac = Number.isFinite(s.spec.fuseTime) ? (s.spec.fuseTime - stepLife) / h : Infinity;
        if (fuseFrac >= 0 && fuseFrac <= 1 && fuseFrac < bestT) {
          const p = new THREE.Vector3().lerpVectors(_a, _b, fuseFrac); s.dist += _a.distanceTo(p);
          g.effects.impactGround(p, s.spec.caliber, true); g.audio.impact(p, 'explosion'); this.heBlast(s, p);
          done = true;
        } else if (kind) {
          const p = new THREE.Vector3().lerpVectors(_a, _b, bestT); s.dist += _a.distanceTo(p);
          done = this.onImpact(s, kind, p, hitTank, hitInfo);
          if (!done) { s.pos.copy(p); if (kind === 'water') s.pos.y -= 0.02; }
        } else { s.dist += _a.distanceTo(_b); s.pos.copy(_b); }
      }
      if (!done && (s.life > (s.owner?.spec.artillery?.maxFlightSeconds || (s.spec.guided ? 12 : 8)) || s.pos.y < -200 || Math.abs(s.pos.x) > 1500 || Math.abs(s.pos.z) > 1500)) done = true;
      if (done) { g.effects.removeTracer(s); this.shells.splice(i, 1); }
      else if (s.tracer) { const v = s.vel; const len = Math.min(18, v.length() * 0.012); s.tracer.position.copy(s.pos).addScaledVector(v, -0.5 * len / v.length()); s.tracer.scale.set(1, 1, len); s.tracer.lookAt(_b.copy(s.pos).add(v)); }
    }
  }
  heBlast(s, p) {
    const g = this.game; const R = s.spec.blastRadius || s.spec.caliber / 22;
    for (const t of g.tanks) { if (!t.alive) continue; const d = t.pos.distanceTo(p) - t.spec.dims.W * 0.5; if (d > R) continue;
      const top = (t.armorProfile || t.spec.armor).hull.top[0]; const exposure = t.spec.openTop ? 1.55 : 1; const dmg = s.spec.damage * 0.25 * exposure * (1 - Math.max(0, d) / R) * clamp(1 - top / (s.spec.caliber * 0.8), 0, 1);
      if (dmg > 1) { t.damage(dmg, s.owner, 'he'); if (s.owner?.isPlayer) g.hud.hitMarker('splash', Math.round(dmg)); if (t.isPlayer) g.hud.damageFrom(s.owner, Math.round(dmg)); }
      if (d < R * 0.5 && g.rng.next() < 0.35 && t.alive) t.breakTracks(); }
  }
  // returns true if the shell is consumed
  onImpact(s, kind, p, tank, hit) {
    const g = this.game; const he = !!(s.type.he || s.type.hesh); g.lastImpact = { kind, p: p.clone(), owner: s.owner, tank: tank || null };
    if (kind === 'ground') { g.effects.impactGround(p, s.spec.caliber, he); g.audio.impact(p, he ? 'explosion' : 'ground'); if (he && !s.noDamage) this.heBlast(s, p); return true; }
    if (kind === 'structure') { g.effects.impactStructure(p); g.audio.impact(p, he ? 'explosion' : 'ground'); if (he && !s.noDamage) this.heBlast(s, p); return true; }
    if (kind === 'water') {
      g.effects.impactWater(p); g.audio.impact(p, 'ground');
      if (he) { if (!s.noDamage) this.heBlast(s, p); return true; } // HE bursts on the surface (still splashes a tank in the water)
      s.wet = true; s.waterDist = 0; s.wl = p.y; s.vel.multiplyScalar(0.8); s.pos.copy(p); s.pos.y -= 0.02; return false;
    }
    // tank impact
    const ev = this.evaluate(tank, hit, s.spec, s.dist);
    if (s.wet && s.waterDist > 0) { ev.waterF = waterPenFactor(s.type, s.waterDist); ev.pen *= ev.waterF; ev.ratio = ev.pen / ev.eff; }
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
    g.lastTankHit = { pen: ev.pen, eff: ev.eff, waterF: ev.waterF || 1, waterDist: s.waterDist || 0, penetrated: roll >= ev.eff, tank };
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
    if (ev.tracks && g.rng.next() < 0.45) { tank.breakTracks(); if (toPlayer) g.hud.message(tank.mobilityLabel + ' destroyed! Repairing…', '#ffb060'); }
    if (fromPlayer) g.hud.hitMarker(dmg > 1 ? 'blast' : 'nonpen', Math.round(dmg)); if (toPlayer) g.hud.damageFrom(shooter, Math.round(dmg), dmg > 1 ? 'HE blast' : 'Hit – not penetrated');
    return true;
  }
}
