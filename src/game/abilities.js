const SCAN_DURATION = 10;
const ABILITY_DEFAULTS = {
  scan: { range: 400, maxTargets: 3, cooldown: 24 },
  selfDestruct: { radius: 18 },
  stabilize: { duration: 7, cooldown: 22 },
  overspeed: { mult: 1.4, duration: 8, cooldown: 30 },
  overpen: { shots: 2, mult: 1.35, cooldown: 25 },
};

export function describeTankAbilities(spec) {
  const abilities = [];
  const { scan, selfDestruct, stabilize, overspeed, overpen, magazine } = spec;
  if (scan) {
    const defaults = ABILITY_DEFAULTS.scan;
    abilities.push({
      type: 'active', name: '战场扫描',
      effect: `标记 ${scan.range || defaults.range} 米内最近的未发现敌车，最多 ${scan.maxTargets || defaults.maxTargets} 辆，持续 ${SCAN_DURATION} 秒。`,
      timing: `冷却最长 ${scan.cooldown || defaults.cooldown} 秒，发现目标越少，冷却越短`,
    });
  }
  if (selfDestruct) {
    abilities.push({
      type: 'active', name: '自爆',
      effect: `摧毁自己和 ${selfDestruct.radius || ABILITY_DEFAULTS.selfDestruct.radius} 米内的所有车辆，包括友军。`,
    });
  }
  if (stabilize) {
    const defaults = ABILITY_DEFAULTS.stabilize;
    abilities.push({
      type: 'active', name: '火炮稳定',
      effect: `在 ${stabilize.duration || defaults.duration} 秒内减慢车辆移动时散布扩大的速度。`,
      timing: `冷却 ${stabilize.cooldown || defaults.cooldown} 秒`,
    });
  }
  if (overspeed) {
    const defaults = ABILITY_DEFAULTS.overspeed;
    abilities.push({
      type: 'active', name: '超速机动',
      effect: `在 ${overspeed.duration || defaults.duration} 秒内将行驶限速提高到原来的 ${overspeed.mult || defaults.mult} 倍。`,
      timing: `冷却 ${overspeed.cooldown || defaults.cooldown} 秒`,
    });
  }
  if (overpen) {
    const defaults = ABILITY_DEFAULTS.overpen;
    abilities.push({
      type: 'active', name: '穿深强化',
      effect: `接下来 ${overpen.shots || defaults.shots} 发炮弹的穿深提高到原来的 ${overpen.mult || defaults.mult} 倍。`,
      timing: `强化炮弹打完后冷却 ${overpen.cooldown || defaults.cooldown} 秒`,
    });
  }
  if (magazine) {
    abilities.push({
      type: 'passive', name: '弹夹装填',
      effect: `每个弹夹 ${magazine.size} 发，夹内每发间隔 ${magazine.intraReload} 秒，打空后自动装填 ${magazine.fullReload} 秒。`,
    });
  } else if (spec.autoloader) {
    abilities.push({
      type: 'passive', name: '自动装弹',
      effect: '火炮自动装填，无需装填手。',
    });
  }
  if (spec.ammoRack?.turretBustle) {
    abilities.push({
      type: 'passive', name: '弹药舱泄压板',
      effect: '炮塔后部被击穿时，泄压板将弹药爆燃向外排出，各类炮弹保留原数量的 40%（向下取整）。',
    });
  }
  return abilities;
}

// Each tank has at most one special ability in the battle controls.
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
    return this.isOverspeed ? (this.overspeed.mult || ABILITY_DEFAULTS.overspeed.mult) : 1;
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
    if (this.overpenLeft === 0) this.overpenCd = this.overpen.cooldown || ABILITY_DEFAULTS.overpen.cooldown;
    return this.overpen.mult || ABILITY_DEFAULTS.overpen.mult;
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
    const defaults = ABILITY_DEFAULTS.scan;
    const max = this.scan.maxTargets || defaults.maxTargets;
    const range = this.scan.range || defaults.range;
    let found = 0;
    for (const e of enemies) {
      if (found >= max) break;
      if (e.pos.distanceTo(t.pos) > range) break;
      e.spotted[t.team] = true;
      if (!e.visibleUntil) e.visibleUntil = [0, 0];
      e.visibleUntil[t.team] = g.time + SCAN_DURATION;
      this.scanRevealed.push({ tank: e, until: e.visibleUntil[t.team] });
      found++;
    }
    const refund = found === 0 ? 0.85 : (1 - found / max) * 0.5;
    this.scanCd = (this.scan.cooldown || defaults.cooldown) * (1 - refund);
    if (t.isPlayer) g.hud.message(found ? `SCAN: ${found} revealed` : 'SCAN: nothing found', found ? '#9fd39f' : '#c8c8c8');
    return found > 0;
  }
  trySelfDestruct() {
    if (!this.selfDestruct) return false;
    const t = this.tank;
    const g = t.game;
    const r = this.selfDestruct.radius || ABILITY_DEFAULTS.selfDestruct.radius;
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
    this.stabUntil = t.game.time + (this.stabilize.duration || ABILITY_DEFAULTS.stabilize.duration);
    this.stabCd = this.stabilize.cooldown || ABILITY_DEFAULTS.stabilize.cooldown;
    if (t.isPlayer) t.game.hud.message('STABILIZE active', '#9fd39f');
    return true;
  }
  tryOverspeed() {
    if (!this.overspeed || this.speedCd > 0) return false;
    const t = this.tank;
    this.speedUntil = t.game.time + (this.overspeed.duration || ABILITY_DEFAULTS.overspeed.duration);
    this.speedCd = this.overspeed.cooldown || ABILITY_DEFAULTS.overspeed.cooldown;
    if (t.isPlayer) t.game.hud.message('OVERSPEED active', '#9fd39f');
    return true;
  }
  tryOverpen() {
    if (!this.overpen || this.overpenCd > 0 || this.overpenLeft > 0) return false;
    this.overpenLeft = this.overpen.shots || ABILITY_DEFAULTS.overpen.shots;
    if (this.tank.isPlayer) this.tank.game.hud.message(`OVERPEN ready (${this.overpenLeft} shots)`, '#ffd34d');
    return true;
  }
}
