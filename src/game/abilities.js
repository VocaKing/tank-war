// Special abilities. Exactly one per tank (defined on spec). Models are untouched.
export class Abilities {
  constructor(tank) {
    this.tank = tank;
    const s = tank.spec;
    this.magazine = s.magazine || null;
    this.scan = s.scan || null;
    this.selfDestruct = s.selfDestruct || null;
    this.stabilize = s.stabilize || null;
    this.overspeed = s.overspeed || null;
    this.overpen = s.overpen || null;
    this.magLeft = this.magazine ? this.magazine.size : 0;
    this.scanCd = 0;
    this.stabCd = 0;
    this.speedCd = 0;
    this.overpenCd = 0;
    this.stabUntil = 0;
    this.speedUntil = 0;
    this.overpenLeft = 0;
    this.scanRevealed = [];
    this.resetForBattle();
  }
  // All active abilities are ready at match start — never spawn on cooldown
  resetForBattle() {
    this.scanCd = 0;
    this.stabCd = 0;
    this.speedCd = 0;
    this.overpenCd = 0;
    this.stabUntil = 0;
    this.speedUntil = 0;
    this.overpenLeft = 0;
    this.scanRevealed = [];
    if (this.magazine) this.magLeft = this.magazine.size;
  }
  get kind() {
    if (this.magazine) return 'magazine';
    if (this.scan) return 'scan';
    if (this.selfDestruct) return 'selfDestruct';
    if (this.stabilize) return 'stabilize';
    if (this.overspeed) return 'overspeed';
    if (this.overpen) return 'overpen';
    return null;
  }
  get ready() {
    const k = this.kind;
    if (!k) return false;
    if (k === 'magazine') return true;
    if (k === 'scan') return this.scanCd <= 0;
    if (k === 'selfDestruct') return true;
    if (k === 'stabilize') return this.stabCd <= 0;
    if (k === 'overspeed') return this.speedCd <= 0;
    if (k === 'overpen') return this.overpenCd <= 0 && this.overpenLeft <= 0;
    return false;
  }
  get cooldownLeft() {
    return Math.max(this.scanCd, this.stabCd, this.speedCd, this.overpenCd);
  }
  get speedMult() {
    return this.isOverspeed ? (this.overspeed.mult || 1.4) : 1;
  }
  get isStabilized() { return this.tank.game.time < this.stabUntil; }
  get isOverspeed() { return this.tank.game.time < this.speedUntil; }
  update(dt) {
    if (this.scanCd > 0) this.scanCd -= dt;
    if (this.stabCd > 0) this.stabCd -= dt;
    if (this.speedCd > 0) this.speedCd -= dt;
    if (this.overpenCd > 0) this.overpenCd -= dt;
    const now = this.tank.game.time;
    this.scanRevealed = this.scanRevealed.filter((r) => now < r.until);
  }
  // Called after a successful shot. Handles magazine intra-reload and overpen consumption.
  onFire() {
    const t = this.tank;
    if (this.magazine) {
      this.magLeft--;
      if (this.magLeft <= 0) {
        t.reloadLeft = this.magazine.fullReload;
        this.magLeft = this.magazine.size;
      } else {
        t.reloadLeft = this.magazine.intraReload;
      }
    }
  }
  consumeOverpen() {
    if (this.overpenLeft <= 0) return 1;
    this.overpenLeft--;
    if (this.overpenLeft === 0) this.overpenCd = this.overpen.cooldown || 25;
    return this.overpen.mult || 1.35;
  }
  tryActivate() {
    const t = this.tank;
    const g = t.game;
    const k = this.kind;
    if (!k || !t.alive) return false;
    if (k === 'scan') return this.tryScan();
    if (k === 'selfDestruct') return this.trySelfDestruct();
    if (k === 'stabilize') return this.tryStabilize();
    if (k === 'overspeed') return this.tryOverspeed();
    if (k === 'overpen') return this.tryOverpen();
    return false;
  }
  tryScan() {
    if (!this.scan || this.scanCd > 0) return false;
    const t = this.tank;
    const g = t.game;
    const enemies = g.tanks.filter((e) => e.alive && e.team !== t.team && !e.spotted[t.team]);
    enemies.sort((a, b) => a.pos.distanceTo(t.pos) - b.pos.distanceTo(t.pos));
    let found = 0;
    for (const e of enemies) {
      if (found >= (this.scan.maxTargets || 3)) break;
      if (e.pos.distanceTo(t.pos) > (this.scan.range || 400)) break;
      e.spotted[t.team] = true;
      if (!e.visibleUntil) e.visibleUntil = [0, 0];
      e.visibleUntil[t.team] = g.time + 10;
      this.scanRevealed.push({ tank: e, until: g.time + 10 });
      found++;
    }
    const max = this.scan.maxTargets || 3;
    const refund = found === 0 ? 0.85 : (1 - found / max) * 0.5;
    this.scanCd = (this.scan.cooldown || 24) * (1 - refund);
    if (t.isPlayer) g.hud.message(found ? `SCAN: ${found} revealed` : 'SCAN: nothing found', found ? '#9fd39f' : '#c8c8c8');
    return found > 0;
  }
  trySelfDestruct() {
    if (!this.selfDestruct) return false;
    const t = this.tank;
    const g = t.game;
    const r = this.selfDestruct.radius || 18;
    for (const o of g.tanks) {
      if (!o.alive) continue;
      if (o.pos.distanceTo(t.pos) <= r) {
        o.hp = 0;
        o.destroy(t, 'explosion');
      }
    }
    if (t.alive) t.destroy(t, 'explosion');
    if (t.isPlayer) g.hud.message('SELF-DESTRUCT', '#ff6050', true);
    return true;
  }
  tryStabilize() {
    if (!this.stabilize || this.stabCd > 0) return false;
    const t = this.tank;
    this.stabUntil = t.game.time + (this.stabilize.duration || 7);
    this.stabCd = this.stabilize.cooldown || 22;
    if (t.isPlayer) t.game.hud.message('STABILIZE active', '#9fd39f');
    return true;
  }
  tryOverspeed() {
    if (!this.overspeed || this.speedCd > 0) return false;
    const t = this.tank;
    this.speedUntil = t.game.time + (this.overspeed.duration || 8);
    this.speedCd = this.overspeed.cooldown || 30;
    if (t.isPlayer) t.game.hud.message('OVERSPEED active', '#9fd39f');
    return true;
  }
  tryOverpen() {
    if (!this.overpen || this.overpenCd > 0 || this.overpenLeft > 0) return false;
    this.overpenLeft = this.overpen.shots || 2;
    if (this.tank.isPlayer) this.tank.game.hud.message(`OVERPEN ready (${this.overpenLeft} shots)`, '#ffd34d');
    return true;
  }
}
