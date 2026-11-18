// Navigation grid (6 m cells) with A* + path smoothing for NPC tanks
import { MinHeap } from '../util.js';
import { OCC } from '../world/mapgen.js';

export class NavGrid {
  constructor(world, cell = 6) {
    const T = world.terrain; this.world = world; this.cell = cell; this.half = world.playHalf; this.n = Math.floor((2 * this.half) / cell);
    const n = this.n; this.cost = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -this.half + (i + 0.5) * cell, z = -this.half + (j + 0.5) * cell; let c = 1, blocked = false;
      // sample occupancy within cell
      let trees = 0, road = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const o = T.occAt(x + a * cell * 0.4, z + b * cell * 0.4); if (o === OCC.BUILDING) blocked = true; if (o === OCC.TREE) trees++; if (o === OCC.ROAD) road++; }
      const onDeck = world.deckAt && world.deckAt(x, z) > T.height(x, z) - 0.3;
      let slope; if (onDeck) { blocked = false; const e = 2; slope = Math.max(Math.abs(world.groundHeight(x + e, z) - world.groundHeight(x - e, z)), Math.abs(world.groundHeight(x, z + e) - world.groundHeight(x, z - e))) / (2 * e); }
      else { const nm = T.normal(x, z); slope = Math.sqrt(1 - nm.y * nm.y) / nm.y; }
      if (slope > 0.56) blocked = true;
      const wl = T.waterLevel(x, z); const depth = onDeck ? 0 : wl - T.height(x, z); if (depth > 1.25) blocked = true; else if (depth > 0) c += 4 * depth;
      if (onDeck) c = Math.min(c, 0.8);
      if (Math.abs(x) > this.half - 12 || Math.abs(z) > this.half - 12) c += 6;
      c += slope * slope * 14 + trees * 0.35 - road * 0.07;
      this.cost[j * n + i] = blocked ? Infinity : Math.max(0.4, c);
    }
    // walls (compound / field walls) are solid colliders but are not in the terrain occupancy map: rasterise them so A*
    // routes around them (heavy cost, not Infinity, so a wall that the 6 m grid over-covers can't seal off a gap).
    // Bridge parapets only mark cells OFF the deck (deck cells stay cheap) so paths can't cut onto a ramp over the parapet.
    if (world.colliders) for (const c of world.colliders) {
      if (c.kind !== 'wall') continue; const parapet = world.deckAt && world.deckAt(c.x, c.z) > -1e8;
      if (!parapet && c.y1 < T.height(c.x, c.z) + 0.3) continue;
      const len = Math.max(c.hx, c.hz), ax = c.hx >= c.hz; const ux = ax ? c.c : c.s, uz = ax ? -c.s : c.c; const seen = new Set();
      for (let u = -len; u <= len + 1e-6; u += 1) { const [i, j] = this.toCell(c.x + ux * u, c.z + uz * u); const k = j * n + i; if (seen.has(k)) continue; seen.add(k); if (parapet) { const [cx, cz] = this.center(i, j); if (world.deckAt(cx, cz) > -1e8) continue; } if (this.cost[k] < Infinity) this.cost[k] += 30; }
    }
    // rocks: only very large boulders fully block. Medium rocks raise cost so tanks prefer to go around but can still pass.
    // Small stones are almost free to drive over.
    if (world.veg) for (const rk of world.veg.rocks) {
      const [i, j] = this.toCell(rk.x, rk.z); const k = j * n + i;
      if (this.cost[k] === Infinity) continue;
      if (rk.s >= 2.8) this.cost[k] = Infinity;
      else if (rk.s >= 1.4) this.cost[k] += 8 + (rk.s - 1.4) * 6;
      else if (rk.s >= 0.8) this.cost[k] += 2.5;
    }
  }
  penalize(x, z, amount = 12) { const [i, j] = this.toCell(x, z); const k = j * this.n + i; if (this.cost[k] < Infinity) this.cost[k] = Math.min(this.cost[k] + amount, 60); } // capped: unbounded growth walled off whole spawn areas
  toCell(x, z) { return [Math.max(0, Math.min(this.n - 1, Math.floor((x + this.half) / this.cell))), Math.max(0, Math.min(this.n - 1, Math.floor((z + this.half) / this.cell)))]; }
  center(i, j) { return [-this.half + (i + 0.5) * this.cell, -this.half + (j + 0.5) * this.cell]; }
  walkable(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n && this.cost[j * this.n + i] < Infinity; }
  nearestWalkable(i, j) {
    if (this.walkable(i, j)) return [i, j];
    for (let r = 1; r < 12; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (Math.max(Math.abs(a), Math.abs(b)) === r && this.walkable(i + a, j + b)) return [i + a, j + b];
    return [i, j];
  }
  findPath(sx, sz, gx, gz, maxIter = 30000) {
    const n = this.n; let [si, sj] = this.toCell(sx, sz); let [gi, gj] = this.toCell(gx, gz);
    const startBlocked = !this.walkable(si, sj), goalBlocked = !this.walkable(gi, gj);
    [si, sj] = this.nearestWalkable(si, sj); [gi, gj] = this.nearestWalkable(gi, gj);
    const start = sj * n + si, goal = gj * n + gi; if (start === goal) return [[gx, gz]];
    const g = new Float32Array(n * n).fill(Infinity); const came = new Int32Array(n * n).fill(-1); const closed = new Uint8Array(n * n);
    const h = (k) => { const i = k % n, j = (k / n) | 0; const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * 0.45; };
    const open = new MinHeap(); g[start] = 0; open.push(start, h(start));
    let best = start, bestH = h(start), it = 0;
    while (open.size && it++ < maxIter) {
      const cur = open.pop(); if (closed[cur]) continue; closed[cur] = 1; if (cur === goal) { best = cur; break; }
      const ci = cur % n, cj = (cur / n) | 0; const hc = h(cur); if (hc < bestH) { bestH = hc; best = cur; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni; const c = this.cost[nk]; if (c === Infinity || closed[nk]) continue;
        if (di && dj && (this.cost[cj * n + ni] === Infinity || this.cost[nj * n + ci] === Infinity)) continue;
        const ng = g[cur] + c * (di && dj ? Math.SQRT2 : 1); if (ng < g[nk]) { g[nk] = ng; came[nk] = cur; open.push(nk, ng + h(nk)); }
      }
    }
    const cells = []; let k = best; while (k !== -1) { cells.push(k); k = came[k]; } cells.reverse();
    // smooth: greedy line-of-walk
    const pts = cells.map((c) => this.center(c % n, (c / n) | 0)); const out = [];
    let a = 0; while (a < pts.length - 1) { let b = Math.min(pts.length - 1, a + 25); while (b > a + 1 && !this.lineClear(pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
    // goal inside a blocked cell (e.g. a lane waypoint against a wall/cliff): end at the nearest walkable cell instead,
    // otherwise the tank pushes into the obstacle forever trying to get within 3 m of an unreachable point
    if (best === goal) out.push(goalBlocked ? this.center(gi, gj) : [gx, gz]);
    // tank standing in a blocked cell (pushed onto a steep slope / cliff foot): first get back to the walkable cell A* started from
    if (startBlocked) out.unshift(this.center(si, sj));
    return out;
  }
  lineClear(p, q) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]); const steps = Math.ceil(d / (this.cell * 0.5)); let sum = 0;
    for (let s = 0; s <= steps; s++) { const t = s / steps; const [i, j] = this.toCell(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t); const c = this.cost[j * this.n + i]; if (c === Infinity || c > 4) return false; sum += c; }
    return sum / (steps + 1) < 2.5;
  }
}
