// Special abilities: magazine, scan, self-destruct, stabilize, overspeed
export class Abilities {
  constructor(tank) {
    this.tank = tank;
    this.magazine = tank.spec.magazine || null;
    this.scan = tank.spec.scan || null;
    this.selfDestruct = tank.spec.selfDestruct || null;
    this.stabilize = tank.spec.stabilize || null;
    this.overspeed = tank.spec.overspeed || null;
    this.magLeft = this.magazine ? this.magazine.size : 0;
    this.scanCd = 0; this.stabCd = 0; this.speedCd = 0;
    this.scanRevealed = [];
    this.stabUntil = 0; this.speedUntil = 0;
  }
  canFire() {
    if (this.magazine) return this.magLeft > 0;
    return this.tank.reload <= 0;
  }
  onFire() {
    if (!this.magazine) return;
    this.magLeft--;
    if (this.magLeft <= 0) {
      this.tank.reload = this.magazine.fullReload;
      this.magLeft = this.magazine.size;
    } else {
      this.tank.reload = this.magazine.intraReload;
    }
  }
  trySelfDestruct() {
    if (!this.selfDestruct) return false;
    const g = this.tank.game;
    const r = this.selfDestruct.radius;
    for (const t of g.tanks) {
      if (!t.alive) continue;
      if (t.pos.distanceTo(this.tank.pos) <= r) {
        t.hp = 0; t.alive = false; t.destroyedAt = g.time;
      }
    }
    this.tank.hp = 0; this.tank.alive = false; this.tank.destroyedAt = g.time;
    return true;
  }
  tryStabilize() {
    if (!this.stabilize || this.stabCd > 0) return false;
    this.stabUntil = this.tank.game.time + this.stabilize.duration;
    this.stabCd = this.stabilize.cooldown;
    return true;
  }
  tryOverspeed() {
    if (!this.overspeed || this.speedCd > 0) return false;
    this.speedUntil = this.tank.game.time + this.overspeed.duration;
    this.speedCd = this.overspeed.cooldown;
    return true;
  }
  get isStabilized() { return this.tank.game.time < this.stabUntil; }
  get isOverspeed() { return this.tank.game.time < this.speedUntil; }
  update(dt) {
    if (this.scanCd > 0) this.scanCd -= dt;
    if (this.stabCd > 0) this.stabCd -= dt;
    if (this.speedCd > 0) this.speedCd -= dt;
    const now = this.tank.game.time;
    this.scanRevealed = this.scanRevealed.filter((r) => now < r.until);
  }
  tryScan() {
    if (!this.scan || this.scanCd > 0) return 0;
    const g = this.tank.game;
    const enemies = g.tanks.filter((t) => t.alive && t.team !== this.tank.team && !t.spotted[this.tank.team]);
    enemies.sort((a, b) => a.pos.distanceTo(this.tank.pos) - b.pos.distanceTo(this.tank.pos));
    let found = 0;
    for (const e of enemies) {
      if (found >= this.scan.maxTargets) break;
      if (e.pos.distanceTo(this.tank.pos) > this.scan.range) break;
      e.spotted[this.tank.team] = true;
      e.visibleUntil = e.visibleUntil || [0, 0];
      e.visibleUntil[this.tank.team] = g.time + 10;
      this.scanRevealed.push({ tank: e, until: g.time + 10 });
      found++;
    }
    const refund = found === 0 ? 0.85 : (1 - found / this.scan.maxTargets) * 0.5;
    this.scanCd = this.scan.cooldown * (1 - refund);
    return found;
  }
}
