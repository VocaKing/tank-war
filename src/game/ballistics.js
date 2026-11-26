// Projectile simulation: gravity ballistics, terrain/structure/water/tank intersection,
// armour penetration with slope, normalisation, ricochet, overmatch, HEAT/ERA and HE blast.
import * as THREE from 'three';
import { SHELL_TYPES, penAtRange, PEN_RNG } from './tankData.js';
import { GRAVITY } from './physics.js';
import { clamp } from '../util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _blastLocal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const desired = new THREE.Vector3();
const MAX_STEP = 1 / 30;

function shellState(owner, spec, pos, vel, target) {
  return { owner, spec, type: SHELL_TYPES[spec.type], pos: pos.clone(), vel: vel.clone(),
    target, dist: 0, life: 0, noDamage: false, ricochets: 0 };
}

function stepSize(s, dt) {
  return Math.min(dt, MAX_STEP, 30 / Math.max(1, s.vel.length()));
}

function projectStep(s, dt) {
  const guided = s.spec.guided && s.target;
  if (guided) {
    desired.subVectors(s.target, s.pos).normalize().multiplyScalar(s.vel.length());
    s.vel.lerp(desired, clamp(dt * 1.6, 0, 1));
  }
  _a.copy(s.pos);
  _b.copy(s.pos).addScaledVector(s.vel, dt);
  if (!guided) _b.y -= 0.5 * GRAVITY * dt * dt;
  return guided;
}

function flightLimit(s) {
  return s.owner?.spec?.artillery?.maxFlightSeconds || (s.owner?.spec?.cls === 'Artillery' ? 42 : 8);
}

function outOfBounds(s) {
  return s.pos.y < -200 || Math.abs(s.pos.x) > 1500 || Math.abs(s.pos.z) > 1500;
}

function enterWater(s, p) {
  s.wet = true;
  s.waterDist = 0;
  s.wl = p.y;
  s.vel.multiplyScalar(0.8);
  s.pos.copy(p).y -= 0.02;
}

function depthBelowWater(terrain, position, entryLevel) {
  const level = terrain.waterLevel(position.x, position.z);
  return (level < -1e8 ? entryLevel : level) - position.y;
}
// Water never makes a tank immune: a shell that enters water keeps flying and loses penetration per metre of water
// it travels through (kinetic rounds −12 %/m, HEAT jets −30 %/m), down to a floor of 35 % / 25 %.
export function waterPenFactor(type, metres) { return type.heat ? Math.max(0.25, 1 - 0.3 * metres) : Math.max(0.35, 1 - 0.12 * metres); }

export class Ballistics {
  constructor(game) { this.game = game; this.shells = []; }
  spawn(owner, spec, pos, vel, target) {
    const s = shellState(owner, spec, pos, vel, target);
    this.shells.push(s); this.game.effects.addTracer(s); return s;
  }
  // Predict the same penetration and water loss used by live impacts.
  evaluate(tank, hit, spec, dist, waterDist = 0) {
    const type = SHELL_TYPES[spec.type], a = tank.armorAt(hit, spec, type);
    const waterF = waterPenFactor(type, waterDist), pen = penAtRange(spec, dist) * waterF;
    return { ...a, pen, waterF, ratio: pen / a.eff };
  }
  firstImpact(s, tanks, h) {
    const W = this.game.world, a = _a, b = _b;
    let fraction = Infinity, kind = null, tank = null, hit = null;
    const terrain = W.terrain.segmentHit(a.x, a.y, a.z, b.x, b.y, b.z, 1.5);
    if (terrain >= 0) { fraction = terrain; kind = 'ground'; }
    const structure = W.structureHit(a.x, a.y, a.z, b.x, b.y, b.z);
    if (structure >= 0 && structure < fraction) { fraction = structure; kind = 'structure'; }
    if (!s.wet && b.y < a.y) {
      const level = W.terrain.waterLevel(b.x, b.z);
      if (level > -1e8 && b.y < level && a.y >= level) {
        const water = (a.y - level) / (a.y - b.y);
        if (water < fraction) { fraction = water; kind = 'water'; }
      }
    }
    const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
    for (const t of tanks) {
      if (t === s.owner && s.life + h < 0.3) continue;
      const { W: width, L: length } = t.spec.dims;
      const radius = Math.max(width, length) * 0.65 + 1;
      const x = t.pos.x - a.x, z = t.pos.z - a.z;
      const u = lengthSquared > 0 ? clamp((x * dx + z * dz) / lengthSquared, 0, Math.min(1, fraction)) : 0;
      if ((dx * u - x) ** 2 + (dz * u - z) ** 2 > radius * radius) continue;
      const impact = t.rayTest(a, b);
      if (!impact || impact.t >= fraction || (t === s.owner && s.life + h * impact.t < 0.3)) continue;
      fraction = impact.t;
      kind = 'tank'; tank = t; hit = impact;
    }
    return kind ? { fraction, kind, tank, hit } : null;
  }
  travel(s, dt, guided, impact) {
    const fraction = impact?.fraction ?? 1;
    if (!guided) s.vel.y -= GRAVITY * dt * fraction;
    s.life += dt * fraction;
    s.pos.lerpVectors(_a, _b, fraction);
    const distance = _a.distanceTo(s.pos);
    s.dist += distance;
    if (!s.wet) return true;
    const terrain = this.game.world.terrain;
    const start = depthBelowWater(terrain, _a, s.wl);
    const end = depthBelowWater(terrain, s.pos, s.wl);
    if (start >= 0 && end >= 0) s.waterDist += distance;
    else if (start > 0 || end > 0) s.waterDist += distance * Math.max(start, end) / Math.abs(start - end);
    return s.waterDist <= 15;
  }
  predict(owner, spec, pos, vel, target) {
    const s = shellState(owner, spec, pos, vel, target);
    const visible = this.game.tanks.filter(t => t !== owner && (t.team === owner.team || t.spotted[owner.team] || !t.alive));
    const stop = Math.min(flightLimit(s), spec.fuseTime || Infinity, owner.spec.cls === 'Artillery' ? 12 : 8);
    while (s.life < stop - 1e-9 && !outOfBounds(s)) {
      const h = stepSize(s, stop - s.life);
      const guided = projectStep(s, h);
      const impact = this.firstImpact(s, visible, h);
      if (!this.travel(s, h, guided, impact)) break;
      if (!impact) continue;
      if (impact.kind === 'water' && !s.type.he) { enterWater(s, s.pos); continue; }
      return { ...impact, pos: s.pos, dist: s.dist, time: s.life, waterDist: s.waterDist };
    }
    return { kind: null, pos: s.pos, dist: s.dist, time: s.life, waterDist: s.waterDist };
  }
  intercept(s, endFraction) {
    const g = this.game;
    const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z;
    const l2 = dx * dx + dy * dy + dz * dz;
    for (const t of g.tanks) {
      if (!t.alive || t.team === s.owner?.team || !t.spec.aps) continue;
      const u = l2 > 1e-9 ? clamp(((t.pos.x-_a.x)*dx + (t.pos.y+t.spec.dims.hullH*0.62-_a.y)*dy + (t.pos.z-_a.z)*dz) / l2, 0, endFraction) : 0;
      const closest = new THREE.Vector3().lerpVectors(_a, _b, u);
      if (t.tryAPS(s, closest)) {
        g.effects.explosion(closest, false); g.audio.impact(closest, 'explosion');
        return true;
      }
    }
    return false;
  }
  update(dt) {
    const g = this.game;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i], end = Math.min(s.life + dt, s.spec.fuseTime || Infinity, flightLimit(s));
      let done = false;
      while (!done && s.life < end - 1e-9) {
        const h = stepSize(s, end - s.life);
        const guided = projectStep(s, h);
        const impact = this.firstImpact(s, g.tanks, h);
        if (this.intercept(s, impact?.fraction ?? 1) || !this.travel(s, h, guided, impact)) { done = true; break; }
        if (impact) {
          done = this.onImpact(s, impact.kind, s.pos.clone(), impact.tank, impact.hit);
        }
      }
      if (!done && s.spec.fuseTime && s.life >= s.spec.fuseTime - 1e-9) {
        if (!s.noDamage) this.heBlast(s, s.pos);
        g.effects.explosion(s.pos, false); g.audio.impact(s.pos, 'explosion');
        done = true;
      }
      if (!done && (s.life >= flightLimit(s) - 1e-9 || outOfBounds(s))) done = true;
      if (done) { g.effects.removeTracer(s); this.shells.splice(i, 1); }
      else if (s.tracer) { const v = s.vel; const len = Math.min(18, v.length() * 0.012); s.tracer.position.copy(s.pos).addScaledVector(v, -0.5 * len / v.length()); s.tracer.scale.set(1, 1, len); s.tracer.lookAt(_b.copy(s.pos).add(v)); }
    }
  }
  heBlast(s, p) {
    const g = this.game; const R = s.spec.blastRadius || s.spec.caliber / 22;
    for (const t of g.tanks) { if (!t.alive) continue; const d = t.pos.distanceTo(p) - t.spec.dims.W * 0.5; if (d > R) continue;
      const top = (t.armorProfile || t.spec.armor).hull.top[0]; const dmg = s.spec.damage * 0.25 * (1 - Math.max(0, d) / R) * clamp(1 - top / (s.spec.caliber * 0.8), 0, 1);
      if (dmg > 1) { t.damage(dmg, s.owner, 'he'); if (t.spec.openTop) t.suppressedFor = Math.max(t.suppressedFor || 0, 1.4); if (s.owner?.isPlayer) g.hud.hitMarker('splash', Math.round(dmg)); if (t.isPlayer) g.hud.damageFrom(s.owner, Math.round(dmg)); }
      if (d < R * 0.5 && g.rng.next() < 0.35 && t.alive) {
        const x = _blastLocal.copy(p).applyMatrix4(t.inv).x;
        t.breakTracks(Math.abs(x) < t.spec.dims.trackW / 2 ? 0 : Math.sign(x));
      }
    }
  }
  artilleryImpact(s, p, surface, normal) {
    const g = this.game;
    if (surface === 'ground') normal = g.world.terrain.normal(p.x, p.z);
    else if (surface === 'water') normal = UP;
    else if (!normal) normal = s.vel.clone().normalize().negate();
    g.effects.artilleryImpact(p, normal, surface);
    g.audio.impact(p, 'explosion');
  }
  // returns true if the shell is consumed
  onImpact(s, kind, p, tank, hit) {
    const g = this.game; const he = !!s.type.he; g.lastImpact = { kind, p: p.clone(), owner: s.owner, tank: tank || null };
    const artillery = s.owner?.spec?.cls === 'Artillery' && !s.noDamage;
    if (kind === 'ground' || kind === 'structure') {
      if (artillery) this.artilleryImpact(s, p, kind);
      else {
        if (kind === 'ground') g.effects.impactGround(p, s.spec.caliber, he);
        else g.effects.impactStructure(p);
        g.audio.impact(p, he ? 'explosion' : 'ground');
      }
      if (he && !s.noDamage) this.heBlast(s, p);
      return true;
    }
    if (kind === 'water') {
      g.effects.impactWater(p);
      if (artillery && he) this.artilleryImpact(s, p, kind);
      else g.audio.impact(p, 'ground');
      if (he) { if (!s.noDamage) this.heBlast(s, p); return true; } // HE bursts on the surface (still splashes a tank in the water)
      enterWater(s, p); return false;
    }
    // tank impact
    const shooter = s.owner; const toPlayer = tank.isPlayer, fromPlayer = shooter && shooter.isPlayer;
    if (s.noDamage) { g.effects.sparks(p, 12); return true; }
    if (shooter && tank.alive && shooter.team !== tank.team) shooter.stats.hits++;
    if (hit.wheel) {
      if (artillery) this.artilleryImpact(s, p, kind, hit.normalW);
      else { g.effects.sparks(p, 22); g.audio.impact(p, 'metal'); }
      const damaged = tank.alive && g.rng.next() < 0.45 ? tank.breakTracks(hit.sideSign) : null;
      if (fromPlayer && tank.alive) g.hud.hitMarker('mobility', 0, damaged ? [damaged] : [], tank);
      if (toPlayer && damaged) g.hud.damageFrom(shooter, 0, damaged);
      if (he) this.heBlast(s, p);
      return true;
    }
    const ev = this.evaluate(tank, hit, s.spec, s.dist, s.waterDist);
    tank.consumeERA?.(hit, s.spec, s.type);
    if (tank.alive && ev.ricochet && s.ricochets < 1) {
      const n = ev.normalW; const v = s.vel; v.addScaledVector(n, -2 * v.dot(n)).multiplyScalar(0.55); s.pos.copy(p).addScaledVector(n, 0.08); s.ricochets++; s.noDamage = true; s.life = Math.max(s.life, 6.5);
      g.effects.sparks(p, 30, [1, 0.85, 0.5], v.clone().normalize()); g.audio.impact(p, 'ricochet');
      if (fromPlayer) g.hud.hitMarker('ricochet'); if (toPlayer) g.hud.damageFrom(shooter, 0, 'Ricochet');
      return false;
    }
    if (artillery) this.artilleryImpact(s, p, kind, ev.normalW);
    if (!tank.alive) {
      if (!artillery) { g.effects.sparks(p, 20); g.audio.impact(p, 'metal'); }
      return true;
    }
    const roll = ev.pen * g.rng.range(1 - PEN_RNG, 1 + PEN_RNG);
    g.lastTankHit = { pen: ev.pen, eff: ev.eff, waterF: ev.waterF || 1, waterDist: s.waterDist || 0, penetrated: roll >= ev.eff, tank };
    if (roll >= ev.eff) {
      const mult = s.type.he ? 1.0 : 1.0; const dmg = s.spec.damage * mult * g.rng.range(0.85, 1.15);
      if (!artillery) { g.effects.penetration(p); g.audio.impact(p, 'metal'); }
      const msgs = tank.applyPenetration(hit, s.spec, shooter, dmg, ev.tracks);
      if (shooter && shooter.team !== tank.team) shooter.stats.pens++;
      if (fromPlayer) g.hud.hitMarker('pen', Math.round(dmg), msgs, tank); if (toPlayer) g.hud.damageFrom(shooter, Math.round(dmg), msgs.join(', '));
      if (he) this.heBlast(s, p);
      return true;
    }
    // non-penetration
    if (!artillery) { g.effects.sparks(p, 22); g.audio.impact(p, 'metal'); }
    let dmg = 0;
    if (he) { dmg = s.spec.damage * 0.45 * clamp(1 - ev.eff / (s.spec.caliber * 1.2), 0, 1); if (dmg > 1) tank.damage(dmg, shooter, 'he');
      if (!artillery) g.effects.impactGround(p, s.spec.caliber, true);
      // HE/HESH blast wrecks external modules even without penetrating
      if (tank.alive && g.rng.next() < 0.4) { const m = ['gun', 'turret', 'engine'][Math.floor(g.rng.next() * 3)]; if (tank.damageModule(m) && toPlayer) g.hud.message(m[0].toUpperCase() + m.slice(1) + ' damaged by HE blast', '#ffb060'); } }
    if (tank.alive && ev.tracks && g.rng.next() < 0.45) {
      const message = tank.breakTracks(hit.sideSign);
      if (toPlayer) g.hud.message(message + ' · Repairing…', '#ffb060');
    }
    if (fromPlayer) g.hud.hitMarker(dmg > 1 ? 'blast' : 'nonpen', Math.round(dmg)); if (toPlayer) g.hud.damageFrom(shooter, Math.round(dmg), dmg > 1 ? 'HE blast' : 'Hit – not penetrated');
    return true;
  }
}
