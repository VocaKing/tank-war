// Map generation toolkit: terrain shaping, roads, rivers, settlements, vegetation scatter
import { Terrain } from './terrain.js';
import { RNG, makeNoise2D, fbm, sampleSpline, smoothstep, clamp, lerp } from '../util.js';

export const OCC = { FREE: 0, ROAD: 1, WATER: 2, BUILDING: 3, RESERVED: 4, TREE: 5 };

export class MapBuilder {
  constructor(def, quality = 'high') {
    this.def = def; this.rng = new RNG(def.seed); this.noise = makeNoise2D(def.seed); this.noise2 = makeNoise2D(def.seed * 7 + 3);
    this.t = new Terrain(def.terrainHalf || 700, 2);
    this.play = def.playHalf || 600;
    this.buildings = []; this.walls = []; this.trees = []; this.bushes = []; this.rocks = []; this.props = []; this.rivers = []; this.lakes = []; this.bridges = []; this.roads = [];
    this.bases = []; this.lanes = []; this.quality = quality;
  }
  fbm(x, z, s, o = 5) { return fbm(this.noise, x / s, z / s, o); }
  setHeights(fn) { const t = this.t; for (let j = 0; j < t.n; j++) for (let i = 0; i < t.n; i++) t.h[j * t.n + i] = fn(t.i2x(i), t.i2x(j)); }
  forCells(x, z, r, fn) {
    const t = this.t; const i0 = Math.max(0, t.x2i(x - r)), i1 = Math.min(t.n - 1, t.x2i(x + r)), j0 = Math.max(0, t.x2i(z - r)), j1 = Math.min(t.n - 1, t.x2i(z + r));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = t.i2x(i), cz = t.i2x(j); fn(j * t.n + i, cx, cz, Math.hypot(cx - x, cz - z)); }
  }
  avgHeight(x, z, r) { let s = 0, n = 0; this.forCells(x, z, r, (k, cx, cz, d) => { if (d <= r) { s += this.t.h[k]; n++; } }); return n ? s / n : this.t.height(x, z); }
  flatten(x, z, r, blend = 20, target) {
    const h0 = target ?? this.avgHeight(x, z, r);
    this.forCells(x, z, r + blend, (k, cx, cz, d) => { const w = 1 - smoothstep(r, r + blend, d); this.t.h[k] = lerp(this.t.h[k], h0, w); });
    return h0;
  }
  flattenRect(x, z, hw, hd, rot, blend = 6, target) {
    const c = Math.cos(rot), s = Math.sin(rot); const R = Math.hypot(hw, hd) + blend;
    const h0 = target ?? this.avgHeight(x, z, Math.min(hw, hd));
    this.forCells(x, z, R, (k, cx, cz) => { const dx = cx - x, dz = cz - z; const lx = Math.abs(dx * c - dz * s) - hw, lz = Math.abs(dx * s + dz * c) - hd; const d = Math.max(lx, lz, 0); const w = 1 - smoothstep(0, blend, d); this.t.h[k] = lerp(this.t.h[k], h0, w); });
    return h0;
  }
  // polyline helper: dense pts with smoothed terrain height
  _dense(points, smoothR = 12) {
    const pts = sampleSpline(points, 2);
    const hs = pts.map(([x, z]) => this.t.height(x, z));
    const sm = hs.map((_, i) => { let s = 0, n = 0; for (let k = -smoothR; k <= smoothR; k++) { const v = hs[clamp(i + k, 0, hs.length - 1)]; s += v; n++; } return s / n; });
    return pts.map(([x, z], i) => [x, z, sm[i]]);
  }
  river(points, width = 14, depth = 2.2, opts = {}) {
    const pts = this._dense(points, 20);
    // water surface: monotone non-increasing downstream, below local banks
    let wl = Infinity; const half = width / 2;
    for (const p of pts) { const bank = Math.min(this.t.height(p[0] + half, p[1]), this.t.height(p[0] - half, p[1]), this.t.height(p[0], p[1] + half), this.t.height(p[0], p[1] - half), p[2]); wl = Math.min(wl, bank - 0.9); p[2] = wl; }
    const t = this.t; const N = t.n * t.n; const dist = new Float32Array(N).fill(1e9), lvl = new Float32Array(N);
    const R = half + 12;
    for (const [x, z, w] of pts) this.forCells(x, z, R, (k, cx, cz, d) => { if (d < dist[k]) { dist[k] = d; lvl[k] = w; } });
    for (let k = 0; k < N; k++) {
      const d = dist[k]; if (d > R) continue; const w = lvl[k];
      if (d < half) { const bed = w - depth * (1 - (d / half) ** 2) - 0.25; t.h[k] = Math.min(t.h[k], bed); if (!opts.dry) t.water[k] = w; t.occ[k] = OCC.WATER; t.maskB[k] = Math.max(t.maskB[k], 0.85); }
      else { const f = smoothstep(half, R, d); const bankH = w + 0.4 + (d - half) * 0.35; t.h[k] = Math.min(t.h[k], lerp(bankH, t.h[k], f)); if (!opts.dry && d < half + 2) t.water[k] = w; t.maskB[k] = Math.max(t.maskB[k], (1 - f) * 0.7); }
    }
    this.rivers.push({ pts, width, dry: !!opts.dry });
    return pts;
  }
  lake(x, z, r, depth = 2) {
    const wl = this.avgHeight(x, z, r) - 0.6;
    this.forCells(x, z, r + 14, (k, cx, cz, d) => { const rr = r * (1 + 0.15 * this.noise(cx / 30, cz / 30));
      if (d < rr) { this.t.h[k] = Math.min(this.t.h[k], wl - depth * (1 - (d / rr) ** 2) - 0.2); this.t.water[k] = wl; this.t.occ[k] = OCC.WATER; this.t.maskB[k] = 0.9; }
      else if (d < rr + 14) { const f = smoothstep(rr, rr + 14, d); this.t.h[k] = Math.min(this.t.h[k], lerp(wl + 0.3, this.t.h[k], f)); if (d < rr + 2) this.t.water[k] = wl; } });
    this.lakes.push({ x, z, r: r * 1.2, wl });
  }
  ford(x, z, r) { // raise river bed to a shallow, crossable ford (~0.9 m deep)
    this.forCells(x, z, r, (k, cx, cz, d) => { if (d < r && this.t.water[k] > -1e8) { const tgt = this.t.water[k] - 0.85 - 0.3 * (d / r); if (this.t.h[k] < tgt) this.t.h[k] = tgt; if (this.t.occ[k] === OCC.WATER) this.t.occ[k] = OCC.FREE; } });
    this.fords = this.fords || []; this.fords.push({ x, z, r });
  }
  // place buildings along roads inside a radius
  settle(cx, cz, R, opts) {
    const r = this.rng; const placed = [];
    for (const rd of this.roads) {
      let acc = 0;
      for (let i = 1; i < rd.pts.length - 1; i++) {
        const [x, z] = rd.pts[i]; acc += 2; if (Math.hypot(x - cx, z - cz) > R || acc < (opts.spacing || 16)) continue;
        const dx = rd.pts[i + 1][0] - rd.pts[i - 1][0], dz = rd.pts[i + 1][1] - rd.pts[i - 1][1]; const l = Math.hypot(dx, dz) || 1;
        const nx = dz / l, nz = -dx / l; const rot = Math.atan2(dx, dz);
        for (const side of [-1, 1]) {
          if (r.next() > (opts.density ?? 0.85)) continue;
          const w = r.range(opts.w[0], opts.w[1]), d = r.range(opts.d[0], opts.d[1]);
          const off = rd.width / 2 + w / 2 + r.range(2, 5);
          const bx = x + nx * off * side, bz = z + nz * off * side;
          if (!this.footFree(bx, bz, w / 2 + 2, d / 2 + 2, rot)) continue;
          const b = this.building({ x: bx, z: bz, w, d, rot, door: -side, ...opts.make(r) }); placed.push(b); acc = 0;
        }
      }
    }
    return placed;
  }
  footFree(x, z, hw, hd, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) { const lx = a * hw, lz = b * hd; const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; const o = this.t.occAt(wx, wz); if (o !== OCC.FREE && o !== OCC.TREE) return false; }
    return true;
  }
  road(points, width = 6, kind = 'gravel', opts = {}) {
    const pts = this._dense(points, opts.smooth ?? 10);
    const t = this.t; const N = t.n * t.n; const dist = new Float32Array(N).fill(1e9), lvl = new Float32Array(N);
    const half = width / 2, R = half + 7;
    let bridgeStart = -1;
    pts.forEach(([x, z], i) => {
      const onWater = t.waterLevel(x, z) > -1e8 || t.occAt(x, z) === OCC.WATER;
      if (onWater) { const wl = t.waterLevel(x, z) > -1e8 ? t.waterLevel(x, z) : pts[i][2]; pts[i][2] = Math.max(pts[i][2], wl + 1.6); if (bridgeStart < 0) bridgeStart = i; }
      else if (bridgeStart >= 0) { if (!opts.noBridges) this.bridges.push({ pts: pts.slice(Math.max(0, bridgeStart - 4), Math.min(pts.length, i + 4)), width: width + 1 }); bridgeStart = -1; }
    });
    for (const [x, z, h] of pts) this.forCells(x, z, R, (k, cx, cz, d) => { if (d < dist[k]) { dist[k] = d; lvl[k] = h; } });
    // v5: per-cell road surface weights [dirt, cobble, asphalt] (gravel = remainder); the strongest road wins
    if (!t.roadK) t.roadK = new Float32Array(N * 3);
    const kc = kind === 'dirt' ? 0 : kind === 'cobble' ? 1 : kind === 'asphalt' ? 2 : -1;
    for (let k = 0; k < N; k++) {
      const d = dist[k]; if (d > R) continue; const h = lvl[k];
      { const wgt = d < half ? 1 - smoothstep(half * 0.7, half, d) * 0.6 : (1 - smoothstep(half, R, d)) * 0.25;
        if (wgt >= t.road[k] - 1e-4) { t.roadK[k * 3] = kc === 0 ? 1 : 0; t.roadK[k * 3 + 1] = kc === 1 ? 1 : 0; t.roadK[k * 3 + 2] = kc === 2 ? 1 : 0; } }
      if (d < half) { t.h[k] = h; t.road[k] = Math.max(t.road[k], 1 - smoothstep(half * 0.7, half, d) * 0.6); if (t.occ[k] === OCC.WATER) t.water[k] = -1e9; t.occ[k] = OCC.ROAD; }
      else { const f = smoothstep(half, R, d); t.h[k] = lerp(h, t.h[k], f); t.road[k] = Math.max(t.road[k], (1 - f) * 0.25); }
    }
    this.roads.push({ pts, width, kind });
    return pts;
  }
  occupyRect(x, z, hw, hd, rot, val = OCC.BUILDING, pad = 1) {
    const c = Math.cos(rot), s = Math.sin(rot);
    this.forCells(x, z, Math.hypot(hw, hd) + pad, (k, cx, cz) => { const dx = cx - x, dz = cz - z; if (Math.abs(dx * c - dz * s) <= hw + pad && Math.abs(dx * s + dz * c) <= hd + pad) this.t.occ[k] = val; });
  }
  isFree(x, z, pad = 0) {
    if (Math.abs(x) > this.t.half - 5 || Math.abs(z) > this.t.half - 5) return false;
    if (pad <= 0) return this.t.occAt(x, z) === OCC.FREE;
    for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) if (this.t.occAt(x + dx, z + dz) !== OCC.FREE) return false;
    return true;
  }
  slope(x, z) { const n = this.t.normal(x, z); return Math.sqrt(1 - n.y * n.y) / n.y; }
  building(b) { // {x,z,w,d,h,rot,style,...}
    const ground = b.flatten === false ? this.t.height(b.x, b.z) : this.flattenRect(b.x, b.z, b.w / 2 + 1, b.d / 2 + 1, b.rot, 5);
    b.y = ground; this.occupyRect(b.x, b.z, b.w / 2, b.d / 2, b.rot, OCC.BUILDING, 1.5); this.buildings.push(b); return b;
  }
  wall(x1, z1, x2, z2, h = 1.2, style = 'stone', thick = 0.6) {
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 1) return;
    const rot = Math.atan2(x2 - x1, z2 - z1); const x = (x1 + x2) / 2, z = (z1 + z2) / 2;
    this.walls.push({ x, z, len, rot, h, style, thick }); this.occupyRect(x, z, thick / 2, len / 2, rot, OCC.BUILDING, 0.5);
  }
  bush(x, z, r, h, type = 'bush') { this.bushes.push({ x, z, r, h, type, y: this.t.height(x, z) }); this.forCells(x, z, r * 0.5, (k) => { if (this.t.occ[k] === OCC.FREE) this.t.occ[k] = OCC.TREE; }); }
  tree(x, z, type, scale = 1) { this.trees.push({ x, z, type, scale, rot: this.rng.range(0, Math.PI * 2), y: this.t.height(x, z) }); const k = this.t.idx(this.t.x2i(x), this.t.x2i(z)); if (this.t.occ[k] === OCC.FREE) this.t.occ[k] = OCC.TREE; }
  rock(x, z, s) { this.rocks.push({ x, z, s, rot: this.rng.range(0, 6.28), tilt: this.rng.range(-0.3, 0.3), y: this.t.height(x, z) }); }
  prop(kind, x, z, rot = 0, extra = {}) { this.props.push({ kind, x, z, rot, y: this.t.height(x, z), ...extra }); }
  // v5 #5: yard clutter (crate stacks, barrel groups, split-rail fence runs) around a yard centre. Uses its OWN rng so the
  // main generation stream (trees, rocks, bushes) is unchanged. Crates/barrels get 'prop' colliders in buildStructures and
  // reserve their cells so trees/rocks avoid them; fences are decorative (no collider, skipped on Low).
  yardProps(x, z, rad, seed, kinds = ['crates', 'barrels', 'fence']) {
    const r = new RNG((this.def.seed || 1) * 7919 + seed); const n = 2 + Math.floor(r.next() * 3);
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length]; const a = r.range(0, 6.283), d = r.range(rad * 0.55, rad); const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d; const rot = r.range(0, 3.14);
      if (kind === 'fence') { const len = r.range(8, 16); if (!this.isFree(px, pz, 2)) continue; this.prop('fence', px, pz, rot, { len, seed: r.int(0, 1e6) }); continue; }
      if (!this.isFree(px, pz, 2.2)) continue;
      this.prop(kind, px, pz, rot, { n: 2 + Math.floor(r.next() * 3), seed: r.int(0, 1e6) }); this.occupyRect(px, pz, 1.6, 1.6, rot, OCC.RESERVED, 0.5);
    }
  }
  // scatter by density function; spacing ~ cell
  scatter(cell, densityFn, placeFn, half = this.t.half - 10) {
    const r = this.rng;
    for (let z = -half; z < half; z += cell) for (let x = -half; x < half; x += cell) {
      const px = x + r.range(0, cell), pz = z + r.range(0, cell); const d = densityFn(px, pz); if (d <= 0 || r.next() > d) continue; placeFn(px, pz);
    }
  }
  hedgerow(points, opts = {}) {
    const pts = sampleSpline(points, opts.step || 6); const r = this.rng;
    for (const [x, z] of pts) {
      const px = x + r.range(-1, 1), pz = z + r.range(-1, 1);
      if (!this.isFree(px, pz)) continue;
      if (opts.treeChance && r.next() < opts.treeChance) this.tree(px, pz, opts.treeType || 'oak', r.range(0.7, 1.15));
      else this.bush(px, pz, r.range(3.6, 5.2), r.range(2.9, 3.9), opts.bushType || 'bush');
    }
  }
  // v5: pave every road cell within r of (x,z) as cobblestone (village streets / square)
  paveArea(x, z, r, kind = 1) {
    const t = this.t; if (!t.roadK) return; const n = t.n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; if (t.road[k] <= 0) continue; const d = Math.hypot(t.i2x(i) - x, t.i2x(j) - z); if (d > r) continue;
      const f = 1 - smoothstep(r * 0.85, r, d); t.roadK[k * 3] *= 1 - f; t.roadK[k * 3 + 1] = Math.max(t.roadK[k * 3 + 1], kind === 1 ? f : 0); t.roadK[k * 3 + 2] = Math.max(t.roadK[k * 3 + 2], kind === 2 ? f : 0); }
  }
  // v5: concrete hard-standing (farm yards, sawmill yard, market square, compounds) -> t.pad (0..1 per cell)
  concrete(x, z, hw, hd, rot = 0, blend = 1.5) {
    const t = this.t; if (!t.pad) t.pad = new Float32Array(t.n * t.n); const c = Math.cos(rot), s = Math.sin(rot);
    this.forCells(x, z, Math.hypot(hw, hd) + blend + 1, (k, cx, cz) => { const dx = cx - x, dz = cz - z; const lx = Math.abs(dx * c - dz * s) - hw, lz = Math.abs(dx * s + dz * c) - hd;
      const v = 1 - smoothstep(0, blend, Math.max(lx, lz)); if (v > t.pad[k] && t.water[k] < -1e8) t.pad[k] = v; });
  }
  // v5: wet mud along river banks and in road shoulders -> this.mud (0..1 per cell)
  _mud() {
    const t = this.t; const n = t.n; const N = n * n; const m = new Float32Array(N);
    for (const rv of this.rivers) { if (rv.dry) continue; const R = rv.width / 2 + 9; for (const [x, z] of rv.pts) this.forCells(x, z, R, (k, cx, cz, d) => { const v = 1 - smoothstep(rv.width / 2 - 1, R, d); if (v > m[k]) m[k] = v; }); }
    for (const lk of this.lakes) this.forCells(lk.x, lk.z, lk.r + 10, (k, cx, cz, d) => { const v = 1 - smoothstep(lk.r - 1, lk.r + 10, d); if (v > m[k]) m[k] = v; });
    for (let k = 0; k < N; k++) { const rd = t.road[k]; if (rd > 0.02 && rd < 0.5) m[k] = Math.max(m[k], 0.55 * (1 - Math.abs(rd - 0.22) / 0.22)); }
    return m;
  }
  // finalize: splat weights per grid vertex [A,B,rock,road] and tint
  // v5 QA: solid rocks (s >= 1.6 collide + block nav) must never sit on a road / road shoulder or a bridge approach.
  // Rock RNG is already consumed, so dropping them here doesn't shift any later placement (High and Low differ in
  // tree density -> different RNG streams, so this has to be a geometric rule, not a seed fix).
  _clearRoadRocks() {
    const t = this.t, appr = 22; const segs = [];
    for (const b of this.bridges) { const P = b.pts; if (P.length < 2) continue;
      const ext = (a, c) => { const dx = a[0] - c[0], dz = a[1] - c[1], l = Math.hypot(dx, dz) || 1; return [a[0] + dx / l * appr, a[1] + dz / l * appr]; };
      const Q = [ext(P[0], P[1]), ...P, ext(P[P.length - 1], P[P.length - 2])];
      for (let i = 0; i + 1 < Q.length; i++) segs.push([Q[i][0], Q[i][1], Q[i + 1][0], Q[i + 1][1], b.width / 2]); }
    const segD = (x, z, s) => { const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1; const u = clamp(((x - s[0]) * dx + (z - s[1]) * dz) / l2, 0, 1); return Math.hypot(x - s[0] - dx * u, z - s[1] - dz * u); };
    const before = this.rocks.length;
    this.rocks = this.rocks.filter((rk) => {
      if (rk.s < 1.6) return true; const rr = rk.s * 0.85 + 2.5;
      for (const s of segs) if (segD(rk.x, rk.z, s) < s[4] + rr + 2) return false;
      let hit = false; this.forCells(rk.x, rk.z, rr, (k, cx, cz, d) => { if (d <= rr && (t.road[k] > 0.05 || t.occ[k] === OCC.ROAD)) hit = true; }); return !hit;
    });
    this.rocksCleared = before - this.rocks.length;
  }
  finalize(maskBFn, tintFn) {
    this._clearRoadRocks();
    const t = this.t; const n = t.n; this.splat = new Float32Array(n * n * 4);
    this.mud = this._mud(); if (!t.roadK) t.roadK = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; const x = t.i2x(i), z = t.i2x(j);
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const gx = (t.h[j * n + i1] - t.h[j * n + i0]) / ((i1 - i0) * t.res), gz = (t.h[j1 * n + i] - t.h[j0 * n + i]) / ((j1 - j0) * t.res);
      const slope = Math.hypot(gx, gz);
      const rock = smoothstep(0.55, 0.95, slope + this.noise2(x / 18, z / 18) * 0.15);
      const road = t.road[k];
      const b = clamp(Math.max(t.maskB[k], maskBFn ? maskBFn(x, z, slope) : 0), 0, 1);
      let wr = road, wk = rock * (1 - wr), wb = b * (1 - wr - wk), wa = Math.max(0, 1 - wr - wk - wb);
      const s = wa + wb + wk + wr || 1; this.splat.set([wa / s, wb / s, wk / s, wr / s], k * 4);
      if (tintFn) { const c = tintFn(x, z, slope); t.tint[k * 3] = c[0]; t.tint[k * 3 + 1] = c[1]; t.tint[k * 3 + 2] = c[2]; }
    }
  }
}
