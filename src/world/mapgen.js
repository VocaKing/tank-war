// Map generation toolkit: terrain shaping, roads, rivers, settlements, vegetation scatter
import { Terrain } from './terrain.js';
import { RNG, makeNoise2D, fbm, sampleSpline, smoothstep, clamp, lerp } from '../util.js';

export const OCC = { FREE: 0, ROAD: 1, WATER: 2, BUILDING: 3, RESERVED: 4, TREE: 5 };

export class MapBuilder {
  constructor(def, quality = 'high') {
    this.def = def; this.rng = new RNG(def.seed); this.noise = makeNoise2D(def.seed); this.noise2 = makeNoise2D(def.seed * 7 + 3);
    this.t = new Terrain(def.terrainHalf || 700, 2);
    this.roadDetail = new Float32Array(this.t.n * this.t.n * 3);
    this.roadSurface = new Int8Array(this.t.n * this.t.n);
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
    const surface = kind === 'asphalt' ? 1 : kind === 'dirt' ? -1 : 0;
    let bridgeStart = -1;
    pts.forEach(([x, z], i) => {
      const onWater = t.waterLevel(x, z) > -1e8 || t.occAt(x, z) === OCC.WATER;
      if (onWater) { const wl = t.waterLevel(x, z) > -1e8 ? t.waterLevel(x, z) : pts[i][2]; pts[i][2] = Math.max(pts[i][2], wl + 1.6); if (bridgeStart < 0) bridgeStart = i; }
      else if (bridgeStart >= 0) { if (!opts.noBridges) this.bridges.push({ pts: pts.slice(Math.max(0, bridgeStart - 4), Math.min(pts.length, i + 4)), width: width + 1 }); bridgeStart = -1; }
    });
    const lateral = new Float32Array(N);
    const along = new Float32Array(N);
    let distance = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, h] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const fx = (b[0] - a[0]) / length, fz = (b[1] - a[1]) / length;
      if (i > 0) distance += Math.hypot(x - a[0], z - a[1]);
      this.forCells(x, z, R, (k, cx, cz, d) => {
        if (d >= dist[k]) return;
        dist[k] = d; lvl[k] = h;
        lateral[k] = (cx - x) * fz - (cz - z) * fx;
        along[k] = distance + (cx - x) * fx + (cz - z) * fz;
      });
    }
    for (let k = 0; k < N; k++) {
      const d = dist[k]; if (d > R) continue; const h = lvl[k];
      const strength = 1 - smoothstep(half * 0.76, half + 1.7, d);
      const detail = k * 3;
      if (strength > this.roadDetail[detail + 2]) {
        this.roadDetail[detail] = lateral[k];
        this.roadDetail[detail + 1] = along[k];
        this.roadDetail[detail + 2] = strength;
        this.roadSurface[k] = surface;
      }
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
  // finalize: splat weights per grid vertex [A,B,rock,road] and tint
  finalize(maskBFn, tintFn) {
    const t = this.t; const n = t.n; let maxHeight = -Infinity; this.splat = new Float32Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; const x = t.i2x(i), z = t.i2x(j);
      maxHeight = Math.max(maxHeight, t.h[k]);
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
    t.maxHeight = maxHeight;
  }
}
