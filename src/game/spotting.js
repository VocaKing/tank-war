// Team spotting: view range, line of sight, and bush concealment.
// A tank whose hull centre is inside a bush is invisible to every other tank unless it fired
// within the last REVEAL_TIME seconds. Spotted enemies are shared with the whole team.
export const REVEAL_TIME = 5.0;
const LINGER = 1.2;

export class Spotting {
  constructor(game) { this.game = game; this.timer = 0; }
  isConcealed(t, time) { return !!t.inBush && time - t.lastFired > REVEAL_TIME; }
  canSee(obs, tgt, time) {
    if (!obs.alive) return false;
    if (this.isConcealed(tgt, time)) return false;
    const d = obs.pos.distanceTo(tgt.pos);
    let range = obs.viewRange * (Math.abs(tgt.speed) > 1 ? 1.0 : 0.88);
    if (time - tgt.lastFired < REVEAL_TIME) range *= 1.35; // muzzle flash / smoke
    if (d > range) return false;
    if (d < 25) return true;
    const W = this.game.world; const od = obs.spec.dims; const td = tgt.spec.dims;
    const ex = obs.pos.x, ey = obs.pos.y + od.hullH + od.turretH + 0.3, ez = obs.pos.z;
    const pts = [[0, td.hullH + td.turretH * 0.8], [0, td.hullH * 0.6]];
    for (const [, h] of pts) if (!W.losBlocked(ex, ey, ez, tgt.pos.x, tgt.pos.y + h, tgt.pos.z)) return true;
    return false;
  }
  update(dt, time) {
    this.timer -= dt; const g = this.game;
    // bush state for everyone every frame (cheap grid lookup)
    for (const t of g.tanks) t.inBush = t.alive ? g.world.veg.bushAt(t.pos.x, t.pos.z) : null;
    if (this.timer > 0) return; this.timer = 0.2;
    for (const tgt of g.tanks) {
      if (!tgt.alive) continue;
      for (let team = 0; team < 2; team++) {
        if (team === tgt.team) { tgt.visibleUntil[team] = time + 10; continue; }
        let seen = false;
        for (const obs of g.tanks) if (obs.team === team && obs.alive && this.canSee(obs, tgt, time)) { seen = true; break; }
        if (seen) { tgt.visibleUntil[team] = time + LINGER; tgt.lastSeenPos[team] = tgt.pos.clone(); tgt.lastSeenTime = time; }
        else if (this.isConcealed(tgt, time)) tgt.visibleUntil[team] = Math.min(tgt.visibleUntil[team], time); // vanish immediately in a bush
      }
    }
    for (const t of g.tanks) for (let team = 0; team < 2; team++) t.spotted[team] = t.alive ? time < t.visibleUntil[team] : true;
  }
}
