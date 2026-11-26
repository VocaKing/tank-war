// Heightfield terrain (2 m grid, real-world metres) + spatial helpers
import * as THREE from 'three';

export class Terrain {
  constructor(half = 700, res = 2) {
    this.half = half; this.res = res; this.n = Math.round((2 * half) / res) + 1;
    const N = this.n * this.n;
    this.maxHeight = Infinity;
    this.h = new Float32Array(N); this.road = new Float32Array(N); this.water = new Float32Array(N).fill(-1e9);
    this.maskB = new Float32Array(N); this.tint = new Float32Array(N * 3).fill(1); this.occ = new Uint8Array(N);
  }
  i2x(i) { return -this.half + i * this.res; }
  x2i(x) { return Math.round((x + this.half) / this.res); }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n; }
  idx(i, j) { return j * this.n + i; }
  height(x, z) {
    const n = this.n, fx = (x + this.half) / this.res, fz = (z + this.half) / this.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; if (j < 0) j = 0; if (i > n - 2) i = n - 2; if (j > n - 2) j = n - 2;
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const h = this.h, k = j * n + i;
    const a = h[k] + (h[k + 1] - h[k]) * tx, b = h[k + n] + (h[k + n + 1] - h[k + n]) * tx;
    return a + (b - a) * tz;
  }
  normal(x, z, out = new THREE.Vector3()) {
    const e = this.res; const hx = this.height(x + e, z) - this.height(x - e, z), hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  waterLevel(x, z) {
    const i = this.x2i(x), j = this.x2i(z); if (!this.inside(i, j)) return -1e9; return this.water[this.idx(i, j)];
  }
  occAt(x, z) { const i = this.x2i(x), j = this.x2i(z); if (!this.inside(i, j)) return 255; return this.occ[this.idx(i, j)]; }
  // first t in [0,1] along segment a->b where it dips below terrain (-1 if none)
  segmentHit(ax, ay, az, bx, by, bz, step = 3) {
    if (ay >= this.maxHeight && by >= this.maxHeight) return -1;
    const dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz); const n = Math.max(1, Math.ceil(len / step));
    let prevT = 0, prevD = ay - this.height(ax, az);
    if (prevD < 0) return 0;
    for (let k = 1; k <= n; k++) {
      const t = k / n; const x = ax + dx * t, y = ay + dy * t, z = az + dz * t; const d = y - this.height(x, z);
      if (d < 0) { const tt = prevT + (t - prevT) * (prevD / (prevD - d)); return tt; }
      prevT = t; prevD = d;
    }
    return -1;
  }
}

// Uniform grid for broad-phase queries
export class Grid2D {
  constructor(half, cell) { this.half = half; this.cell = cell; this.n = Math.ceil((2 * half) / cell); this.cells = new Array(this.n * this.n); }
  key(x, z) { const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell); if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1; return j * this.n + i; }
  insert(obj, x, z, r) {
    const c = this.cell, h = this.half;
    const i0 = Math.max(0, Math.floor((x - r + h) / c)), i1 = Math.min(this.n - 1, Math.floor((x + r + h) / c));
    const j0 = Math.max(0, Math.floor((z - r + h) / c)), j1 = Math.min(this.n - 1, Math.floor((z + r + h) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * this.n + i; (this.cells[k] ||= []).push(obj); }
  }
  query(x, z, r, out = [], stamp) {
    const c = this.cell, h = this.half;
    const i0 = Math.max(0, Math.floor((x - r + h) / c)), i1 = Math.min(this.n - 1, Math.floor((x + r + h) / c));
    const j0 = Math.max(0, Math.floor((z - r + h) / c)), j1 = Math.min(this.n - 1, Math.floor((z + r + h) / c));
    const s = stamp ?? (Grid2D._stamp = (Grid2D._stamp || 0) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const l = this.cells[j * this.n + i]; if (!l) continue; for (const o of l) { if (o._qs === s) continue; o._qs = s; out.push(o); } }
    return out;
  }
  // cells traversed by a segment (coarse; samples every half cell)
  querySegment(ax, az, bx, bz, out = []) {
    const s = (Grid2D._stamp = (Grid2D._stamp || 0) + 1); const len = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    let previousI, previousJ;
    for (let k = 0; k <= n; k++) { const t = k / n; const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const c = this.cell, h = this.half; const ci = Math.floor((x + h) / c), cj = Math.floor((z + h) / c);
      if (ci === previousI && cj === previousJ) continue;
      previousI = ci; previousJ = cj;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue; const key = j * this.n + i; const l = this.cells[key]; if (!l) continue; for (const o of l) { if (o._qs === s) continue; o._qs = s; out.push(o); } }
    }
    return out;
  }
}

// Oriented box collider (building / wall / rock). Ray-segment slab test in local frame.
export class OBB {
  constructor(x, z, hx, hz, rot, y0, y1, kind = 'building') { this.x = x; this.z = z; this.hx = hx; this.hz = hz; this.rot = rot; this.c = Math.cos(rot); this.s = Math.sin(rot); this.y0 = y0; this.y1 = y1; this.kind = kind; this.r = Math.hypot(hx, hz); }
  toLocal(x, z) { const dx = x - this.x, dz = z - this.z; return [dx * this.c - dz * this.s, dx * this.s + dz * this.c]; }
  // returns t of first hit in [0,1] or -1
  segment(ax, ay, az, bx, by, bz, padding = 0) {
    const dx = ax - this.x, dz = az - this.z, ex = bx - this.x, ez = bz - this.z;
    const lax = dx * this.c - dz * this.s, laz = dx * this.s + dz * this.c;
    const lbx = ex * this.c - ez * this.s, lbz = ex * this.s + ez * this.c;
    const hx = this.hx + padding, hz = this.hz + padding;
    let t0 = 0, t1 = 1;
    const slab = (a, b, lo, hi) => { const d = b - a; if (Math.abs(d) < 1e-9) return a >= lo && a <= hi; let ta = (lo - a) / d, tb = (hi - a) / d; if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); return t0 <= t1; };
    if (!slab(lax, lbx, -hx, hx)) return -1; if (!slab(laz, lbz, -hz, hz)) return -1; if (!slab(ay, by, this.y0 - padding, this.y1 + padding)) return -1;
    return t0;
  }
  // push circle (x,z,r) out; returns [nx,nz,depth] or null
  circle(x, z, r) {
    const [lx, lz] = this.toLocal(x, z);
    const cx = Math.max(-this.hx, Math.min(this.hx, lx)), cz = Math.max(-this.hz, Math.min(this.hz, lz));
    let dx = lx - cx, dz = lz - cz; let d = Math.hypot(dx, dz);
    if (d > r) return null;
    if (d < 1e-6) { // centre inside: push along smallest axis
      const px = this.hx - Math.abs(lx), pz = this.hz - Math.abs(lz);
      if (px < pz) { dx = Math.sign(lx) || 1; dz = 0; d = -px; } else { dx = 0; dz = Math.sign(lz) || 1; d = -pz; }
      const wx = dx * this.c + dz * this.s, wz = -dx * this.s + dz * this.c; return [wx, wz, r - d];
    }
    dx /= d; dz /= d; const wx = dx * this.c + dz * this.s, wz = -dx * this.s + dz * this.c; return [wx, wz, r - d];
  }
}
