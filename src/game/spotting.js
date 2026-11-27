// Team spotting with a camouflage model (v3).
// Every tank has a base camouflage value (smaller / lower tanks hide better, moving halves it). A bush adds BUSH_CAMO,
// a camouflage net adds 12 % when standing still. Firing cuts camouflage to 25 % for REVEAL_TIME seconds.
// A viewer spots a target within  viewRange × (1 − camo)  (with line of sight; smoke blocks it), and ALWAYS within
// MIN_SPOT metres — so a tank in a bush is still seen up close even if it never fires.
export const REVEAL_TIME = 5.0;
export const MIN_SPOT = 50;
export const BUSH_CAMO = 0.45;
const LINGER = 1.2;

export function baseCamo(spec) { const d = spec.dims; const h = d.hullH + d.turretH; return Math.max(0.08, Math.min(0.32, 0.3 - (h - 2.6) * 0.18 - (d.L * d.W - 18) * 0.004)); }

export class Spotting {
  constructor(game) { this.game = game; this.timer = 0; }
  isConcealed(t, time) { return !!t.inBush && time - t.lastFired > REVEAL_TIME; }
  camo(t, time) {
    let c = baseCamo(t.spec); if (Math.abs(t.speed) > 1) c *= 0.5;
    if (t.inBush) c += BUSH_CAMO;
    if (t.equip && t.equip.has('camonet') && time - (t.lastMoving ?? time) > 3) c += 0.12;
    c *= t.vehicleSkill?.camoMult ?? 1;
    if (time - t.lastFired < REVEAL_TIME) c *= t.vehicleSkill?.fireCamoFactor ?? 0.25;
    return Math.min(0.9, c);
  }
  spotRange(obs, tgt, time) { return Math.max(MIN_SPOT, obs.viewRange * (1 - this.camo(tgt, time))); }
  canSee(obs, tgt, time) {
    if (!obs.alive) return false;
    const d = obs.pos.distanceTo(tgt.pos);
    if (d < 15) return true;
    if (d > this.spotRange(obs, tgt, time)) return false;
    const W = this.game.world; const od = obs.spec.dims; const td = tgt.spec.dims;
    const ex = obs.pos.x, ey = obs.pos.y + od.hullH + od.turretH + 0.3, ez = obs.pos.z;
    const pts = [td.hullH + td.turretH * 0.8, td.hullH * 0.6];
    for (const h of pts) if (!W.losBlocked(ex, ey, ez, tgt.pos.x, tgt.pos.y + h, tgt.pos.z) && !this.game.smokeBlocks(ex, ey, ez, tgt.pos.x, tgt.pos.y + h, tgt.pos.z)) return true;
    return false;
  }
  update(dt, time) {
    this.timer -= dt; const g = this.game;
    // bush state for everyone every frame (cheap grid lookup)
    for (const t of g.tanks) { t.inBush = t.alive ? g.world.veg.bushAt(t.pos.x, t.pos.z) : null; t.camo = t.alive ? this.camo(t, time) : 0; }
    if (this.timer > 0) return; this.timer = 0.2;
    for (const tgt of g.tanks) {
      if (!tgt.alive) continue;
      for (let team = 0; team < 2; team++) {
        if (team === tgt.team) { tgt.visibleUntil[team] = time + 10; continue; }
        let seen = false;
        for (const obs of g.tanks) if (obs.team === team && obs.alive && this.canSee(obs, tgt, time)) { seen = true; if (obs.vehicleSkill?.id === 'tracking') { (tgt.skillTrackUntil ??= [0,0])[team] = time + 20 + obs.vehicleSkill.cfg.duration; } }
        if (seen) { tgt.visibleUntil[team] = time + LINGER; tgt.lastSeenPos[team] = tgt.pos.clone(); tgt.lastSeenTime = time; }
      }
    }
    for (const t of g.tanks) for (let team = 0; team < 2; team++) t.spotted[team] = t.alive ? time < t.visibleUntil[team] : true;
  }
}
