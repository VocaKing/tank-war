// Procedural, real-scale (1 unit = 1 m) tank models built from code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { camoTexture, trackTexture, decalTexture } from '../world/textures.js';
import { DEG } from '../util.js';

const V3 = THREE.Vector3;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function T(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(new V3(x, y, z), _q, new V3(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => T(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const cylY = (r, h, seg, x, y, z, r2 = r) => T(new THREE.CylinderGeometry(r, r2, h, seg), x, y, z);
const cylX = (r, len, seg, x, y, z, r2 = r) => T(new THREE.CylinderGeometry(r, r2, len, seg), x, y, z, 0, 0, Math.PI / 2);
const cylZ = (r, len, seg, x, y, z, r2 = r, rx = 0) => T(new THREE.CylinderGeometry(r2, r, len, seg), x, y, z, Math.PI / 2 + rx, 0, 0);
// side profile [[z,y]...] extruded across x
function sideExtrude(profile, width, x = 0, bevel = 0.02) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2 - bevel + x, 0, 0); return g;
}
// top-view polygon [[x,z]...] extruded vertically
function topExtrude(poly, height, y0 = 0, bevel = 0.04, segs = 2) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, height - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, y0 + height - bevel, 0);
  return g;
}
function flipWinding(g) {
  const p = g.attributes.position; const n = g.attributes.normal; const uv = g.attributes.uv;
  if (g.index) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } }
  else { for (let i = 0; i < p.count; i += 3) for (const a of [p, n, uv]) { if (!a) continue; for (let k = 0; k < a.itemSize; k++) { const t = a.array[i * a.itemSize + k]; a.array[i * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k]; a.array[(i + 2) * a.itemSize + k] = t; } } }
  g.computeVertexNormals();
}
function taper(g, y0, y1, sx, sz = sx, cz = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); p.setX(i, p.getX(i) * (1 + (sx - 1) * t)); p.setZ(i, cz + (p.getZ(i) - cz) * (1 + (sz - 1) * t)); }
  g.computeVertexNormals(); return g;
}
function lathe(profile, seg = 20) { // profile [[r, z]] -> revolve around z
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2); return g;
}
function superEllipse(rx, rzF, rzR, n = 2.6, seg = 40, fn) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a);
    let x = Math.sign(c) * Math.abs(c) ** (2 / n) * rx; let z = Math.sign(s) * Math.abs(s) ** (2 / n) * (s > 0 ? rzF : rzR);
    if (fn) [x, z] = fn(x, z); pts.push([x, z]);
  }
  return pts;
}
function clean(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}
class Parts {
  constructor() { this.b = {}; }
  add(part, mat, g) { (this.b[part + '|' + mat] ||= []).push(clean(g)); }
  merged() { const out = {}; for (const [k, list] of Object.entries(this.b)) { const [part, mat] = k.split('|'); (out[part] ||= {})[mat] = mergeGeometries(list); } return out; }
}

// ---------- Materials ----------
function paintMaterial(paint, seed) {
  const m = new THREE.MeshStandardMaterial({ map: camoTexture(paint, seed), roughness: 0.78, metalness: 0.22 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(normalize(vObjN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        vec3 pp = vObjPos * 0.22;
        vec4 tc = texture2D(map, pp.zy) * bw.x + texture2D(map, pp.xz) * bw.y + texture2D(map, pp.xy) * bw.z;
        diffuseColor *= tc;`);
  };
  m.customProgramCacheKey = () => 'paint';
  return m;
}
const MATS = {};
function sharedMats() {
  if (MATS.metal) return MATS;
  MATS.metal = new THREE.MeshStandardMaterial({ color: 0x3b3a37, roughness: 0.55, metalness: 0.65 });
  MATS.rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1b, roughness: 0.95, metalness: 0.0 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.6, metalness: 0.3 });
  MATS.glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.08, metalness: 0.9, emissive: 0x050a10 });
  MATS.wood = new THREE.MeshStandardMaterial({ color: 0x6a5134, roughness: 0.9 });
  MATS.canvas = new THREE.MeshStandardMaterial({ color: 0x5e5a43, roughness: 1.0 });
  MATS.burnt = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.95, metalness: 0.15 });
  return MATS;
}
export function burntMaterial() { return sharedMats().burnt; }

// ---------- Running gear ----------
function wheelGeometry(paintHex, spoked = false) {
  const col = new THREE.Color(paintHex); const rub = new THREE.Color(0x1d1d1c); const hub = new THREE.Color(paintHex).multiplyScalar(0.7);
  const parts = [];
  const paintC = (g, c) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  paintC(cylX(1, 1, 24, 0, 0, 0), rub);
  paintC(cylX(0.84, 1.06, 24, 0, 0, 0), col);
  paintC(cylX(0.32, 1.2, 12, 0, 0, 0), hub);
  for (let i = 0; i < (spoked ? 8 : 6); i++) {
    const a = (i / (spoked ? 8 : 6)) * Math.PI * 2;
    if (spoked) paintC(T(new THREE.BoxGeometry(1.1, 0.12, 0.5), 0, Math.cos(a) * 0.55, Math.sin(a) * 0.55, a, 0, 0), col.clone().multiplyScalar(0.82));
    else paintC(cylX(0.06, 1.22, 6, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5), hub);
  }
  return mergeGeometries(parts);
}
function sprocketGeometry(paintHex) {
  const col = new THREE.Color(paintHex).multiplyScalar(0.85); const parts = [];
  const add = (g) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  add(cylX(0.9, 1.0, 20, 0, 0, 0)); add(cylX(0.4, 1.3, 10, 0, 0, 0));
  for (let i = 0; i < 13; i++) { const a = (i / 13) * Math.PI * 2; add(T(new THREE.BoxGeometry(0.9, 0.22, 0.2), 0, Math.cos(a) * 0.95, Math.sin(a) * 0.95, a, 0, 0)); }
  return mergeGeometries(parts);
}
function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// track loop around wheel circles (side view z,y); returns geometry centered on x=0, width w
function trackGeometry(circles, w, th = 0.08, pitch = 0.17) {
  const pts = [];
  for (const c of circles) for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([c.z + Math.cos(a) * (c.r + th / 2), c.y + Math.sin(a) * (c.r + th / 2)]); }
  const hull = convexHull(pts);
  // resample loop evenly
  const loop = []; let total = 0; const segs = [];
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); total += l; }
  const N = Math.max(40, Math.round(total / 0.08)); let si = 0, acc = 0;
  for (let k = 0; k < N; k++) {
    const d = (k / N) * total; while (si < segs.length - 1 && acc + segs[si][2] < d) { acc += segs[si][2]; si++; }
    const [a, b, l] = segs[si]; const t = l > 0 ? (d - acc) / l : 0; loop.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, d]);
  }
  const pos = [], uv = [], idx = [];
  const ring = (k) => { const p = loop[k % N]; return p; };
  // compute outward normal per point (loop is CCW in z,y)
  const nrm = loop.map((p, k) => { const a = loop[(k - 1 + N) % N], b = loop[(k + 1) % N]; let tz = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tz, ty) || 1; return [ty / l, -tz / l]; });
  const vi = (k, side, out) => { const p = ring(k); const n = nrm[k % N]; const o = out ? th / 2 : -th / 2; pos.push(side * w / 2, p[1] + n[1] * o, p[0] + n[0] * o); uv.push(p[2] / pitch * (k === N ? 1 : 1) + (k === N ? total / pitch - p[2] / pitch : 0), (side + 1) / 2); return pos.length / 3 - 1; };
  // four surfaces: outer, inner, left, right
  const surf = (sA, oA, sB, oB, flip) => {
    const base = pos.length / 3;
    for (let k = 0; k <= N; k++) { const kk = k % N; const p = loop[kk]; const n = nrm[kk]; const d = k === N ? total : p[2];
      for (const [s, o] of [[sA, oA], [sB, oB]]) { const off = o ? th / 2 : -th / 2; pos.push(s * w / 2, p[1] + n[1] * off, p[0] + n[0] * off); uv.push(d / pitch, (s + 1) / 2); } }
    for (let k = 0; k < N; k++) { const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3; if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  };
  surf(-1, true, 1, true, false); surf(-1, false, 1, false, true); surf(-1, false, -1, true, false); surf(1, false, 1, true, true);
  void vi;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, length: total };
}

// ---------- Per-tank builders ----------
// Each returns {P (Parts), wheels:[{z,y,r,w,xo}], sprockets:[{z,y,r}], trackCircles, turretPos:[x,y,z], gunPos:[x,y,z] (turret local), decals:[...]}
function buildSherman(d) {
  const P = new Parts(); const hw = d.W / 2;
  P.add('hull', 'paint', sideExtrude([[-2.9, 1.15], [2.0, 1.15], [2.35, 0.95], [1.3, 1.92], [-2.6, 1.92], [-2.88, 1.72]], 2.62));
  P.add('hull', 'paint', sideExtrude([[-2.75, 0.48], [2.1, 0.45], [2.45, 0.56], [2.62, 0.78], [2.5, 1.0], [2.0, 1.2], [-2.75, 1.2]], 1.85));
  // final-drive bolts flange, spare track links on glacis, headlights, bow MG, hatches
  P.add('hull', 'metal', box(1.9, 0.06, 0.06, 0, 0.97, 2.42, 0.6));
  for (let i = 0; i < 6; i++) P.add('hull', 'metal', box(0.33, 0.05, 0.16, -0.95 + i * 0.38, 1.38, 1.92, 47 * DEG));
  P.add('hull', 'paint', cylZ(0.08, 0.2, 10, 0.55, 1.62, 1.66)); P.add('hull', 'dark', cylZ(0.025, 0.5, 6, 0.55, 1.64, 1.9));
  for (const s of [-1, 1]) { P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 1.05, 1.12, 2.3)); P.add('hull', 'glass', cylZ(0.06, 0.02, 10, s * 1.05, 1.12, 2.37)); }
  for (const x of [-0.55, 0.55]) { P.add('hull', 'paint', cylY(0.3, 0.05, 14, x, 1.95, 1.0)); P.add('hull', 'dark', box(0.12, 0.08, 0.05, x, 1.99, 1.3)); }
  // engine deck grilles, rear exhausts deflector, tools, fenders
  for (let i = 0; i < 7; i++) P.add('hull', 'dark', box(1.7, 0.02, 0.06, 0, 1.93, -1.2 - i * 0.18));
  P.add('hull', 'paint', box(1.9, 0.3, 0.1, 0, 1.35, -2.96, -0.35));
  P.add('hull', 'wood', box(0.05, 0.05, 1.2, -1.15, 1.95, -0.4)); P.add('hull', 'metal', box(0.18, 0.04, 0.3, -1.15, 1.95, 0.3));
  for (const s of [-1, 1]) P.add('hull', 'paint', box(0.36, 0.03, 5.6, s * 1.31, 1.17, -0.1));
  // HVSS bogies
  for (const z of [-1.8, -0.35, 1.1]) for (const s of [-1, 1]) { P.add('hull', 'paint', box(0.35, 0.4, 1.05, s * (hw - 0.32), 0.55, z)); P.add('hull', 'metal', cylZ(0.07, 0.7, 8, s * (hw - 0.32), 0.82, z, 0.07, 0.4)); }
  // turret (cast, T23)
  const tp = superEllipse(0.98, 1.0, 1.25, 2.4, 44, (x, z) => [x * (z > 0.4 ? 1 - (z - 0.4) * 0.25 : 1), z]);
  P.add('turret', 'paint', taper(topExtrude(tp, 0.78, 0, 0.12, 3), 0, 0.78, 0.84, 0.86));
  P.add('turret', 'paint', box(1.25, 0.56, 0.32, 0, 0.4, 1.05)); P.add('turret', 'paint', cylX(0.29, 1.24, 16, 0, 0.4, 1.12));
  P.add('turret', 'paint', cylY(0.33, 0.22, 16, 0.42, 0.88, -0.25)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.add('turret', 'glass', box(0.1, 0.07, 0.03, 0.42 + Math.cos(a) * 0.33, 0.9, -0.25 + Math.sin(a) * 0.33, 0, -a + Math.PI / 2)); }
  P.add('turret', 'paint', box(0.5, 0.05, 0.6, -0.42, 0.8, -0.2)); P.add('turret', 'dark', cylY(0.1, 0.12, 8, -0.1, 0.82, -0.7));
  P.add('turret', 'metal', cylY(0.012, 1.8, 4, -0.6, 1.6, -0.8)); // antenna
  P.add('turret', 'dark', cylZ(0.022, 1.1, 6, 0.42, 1.12, 0.1)); P.add('turret', 'metal', box(0.12, 0.2, 0.25, 0.42, 1.05, -0.3)); // .50 cal
  P.add('turret', 'metal', box(0.08, 0.12, 0.2, 0.32, 0.82, 0.62)); // periscope
  // gun 76 mm M1A2
  P.add('gun', 'paint', lathe([[0.001, -0.3], [0.13, -0.3], [0.13, 0.2], [0.09, 0.3], [0.068, 0.4], [0.058, 3.9], [0.07, 3.92], [0.085, 3.95], [0.085, 4.2], [0.04, 4.2], [0.001, 4.2]], 18));
  P.add('gun', 'dark', box(0.03, 0.06, 0.2, 0.0, 0, 4.08));
  return {
    P, wheels: [-2.0, -1.6, -0.55, -0.15, 0.9, 1.3].map((z) => ({ z, y: 0.31, r: 0.26, w: 0.5 })),
    sprockets: [{ z: 2.5, y: 0.95, r: 0.33 }], idlers: [{ z: -2.62, y: 0.6, r: 0.3 }], rollers: [-1.9, -0.4, 1.05].map((z) => ({ z, y: 1.03, r: 0.09 })),
    turretPos: [0, 1.92, d.turretZ], gunPos: [0, 0.4, 1.0],
    decals: [{ kind: 'usstar', part: 'hull', pos: [1.32, 1.55, -1.2], ry: Math.PI / 2, s: 0.7 }, { kind: 'usstar', part: 'hull', pos: [-1.32, 1.55, -1.2], ry: -Math.PI / 2, s: 0.7 }, { kind: 'usstar', part: 'turret', pos: [0.9, 0.42, -0.35], ry: Math.PI / 2, s: 0.5 }, { kind: 'usstar', part: 'turret', pos: [-0.9, 0.42, -0.35], ry: -Math.PI / 2, s: 0.5 }],
  };
}
function buildTiger(d) {
  const P = new Parts(); const hw = d.W / 2;
  // superstructure (overhangs tracks) and lower hull
  P.add('hull', 'paint', sideExtrude([[-3.0, 1.0], [2.95, 1.0], [2.8, 1.95], [-2.85, 1.95], [-3.0, 1.5]], 3.12, 0, 0.03));
  P.add('hull', 'paint', sideExtrude([[-3.05, 0.55], [2.6, 0.5], [3.15, 0.9], [3.1, 1.02], [-3.1, 1.02]], 1.85, 0, 0.03));
  P.add('hull', 'paint', box(3.12, 0.06, 0.4, 0, 1.0, 3.12)); // front mudguards
  for (const s of [-1, 1]) { P.add('hull', 'metal', cylZ(0.1, 0.25, 10, s * 1.0, 0.95, 3.1)); P.add('hull', 'metal', box(0.8, 0.05, 0.06, s * 0.9, 1.9, 2.85)); }
  P.add('hull', 'dark', box(0.32, 0.08, 0.04, 0.6, 1.62, 2.88, -9 * DEG)); P.add('hull', 'paint', cylZ(0.11, 0.12, 12, -0.75, 1.55, 2.9)); P.add('hull', 'dark', cylZ(0.03, 0.3, 6, -0.75, 1.55, 3.0));
  P.add('hull', 'metal', cylZ(0.09, 0.18, 10, -0.35, 1.8, 2.93)); // headlight
  for (const x of [-0.8, 0.8]) P.add('hull', 'paint', cylY(0.3, 0.06, 14, x, 1.97, 1.95));
  // engine deck, Feifel air filters, exhausts with guards, tow cable, jack
  P.add('hull', 'dark', box(1.6, 0.03, 1.1, 0, 1.96, -1.95)); for (let i = 0; i < 5; i++) P.add('hull', 'paint', box(1.6, 0.05, 0.05, 0, 1.98, -1.5 - i * 0.22));
  for (const s of [-1, 1]) { P.add('hull', 'metal', cylY(0.11, 0.55, 12, s * 0.5, 1.45, -3.15)); P.add('hull', 'metal', box(0.32, 0.5, 0.04, s * 0.5, 1.45, -3.28)); P.add('hull', 'paint', cylX(0.22, 0.4, 14, s * 1.15, 1.5, -3.1)); }
  P.add('hull', 'metal', box(0.04, 0.04, 4.8, 1.45, 1.97, -0.2)); P.add('hull', 'wood', box(0.12, 0.12, 0.9, -1.4, 1.97, -0.9));
  // turret horseshoe
  const tp = [];
  for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); tp.push([Math.cos(a) * 1.25, -0.2 - Math.sin(a) * 1.25]); }
  tp.push([-1.25, 1.1], [1.25, 1.1]); tp.reverse();
  P.add('turret', 'paint', topExtrude(tp.map(([x, z]) => [x, z]), 0.82, 0, 0.03, 1));
  P.add('turret', 'paint', box(2.4, 0.06, 2.6, 0, 0.83, -0.25));
  P.add('turret', 'paint', box(1.75, 0.78, 0.32, 0, 0.42, 1.25)); P.add('turret', 'paint', cylX(0.38, 1.74, 16, 0, 0.42, 1.38));
  P.add('turret', 'paint', cylZ(0.17, 0.35, 14, 0, 0.42, 1.6)); P.add('turret', 'dark', box(0.12, 0.08, 0.05, 0.42, 0.64, 1.42));
  P.add('turret', 'paint', cylY(0.34, 0.32, 18, -0.6, 0.98, -0.85)); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; P.add('turret', 'dark', box(0.08, 0.06, 0.03, -0.6 + Math.cos(a) * 0.345, 1.0, -0.85 + Math.sin(a) * 0.345, 0, -a + Math.PI / 2)); }
  P.add('turret', 'paint', box(1.7, 0.45, 0.55, 0, 0.42, -1.72)); // Rommelkiste
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.add('turret', 'metal', cylZ(0.05, 0.25, 8, s * 1.25, 0.65, 0.75 - i * 0.15, 0.05, -0.6));
  P.add('turret', 'paint', box(0.6, 0.06, 0.7, 0.55, 0.87, -0.3)); P.add('turret', 'dark', cylY(0.12, 0.1, 8, 0.0, 0.88, 0.25));
  P.add('turret', 'metal', cylY(0.012, 2.0, 4, -1.2, 1.7, -2.0));
  P.add('gun', 'paint', lathe([[0.001, -0.25], [0.18, -0.25], [0.18, 0.35], [0.1, 0.45], [0.09, 1.2], [0.08, 2.6], [0.075, 4.6], [0.135, 4.62], [0.135, 4.75], [0.09, 4.77], [0.09, 4.82], [0.135, 4.84], [0.135, 5.0], [0.045, 5.0], [0.001, 5.0]], 18));
  const wheels = []; for (let i = 0; i < 8; i++) wheels.push({ z: -2.25 + i * 0.6, y: 0.45, r: 0.4, w: 0.18, xo: i % 2 ? 0.2 : -0.12 });
  for (let i = 0; i < 8; i++) wheels.push({ z: -2.25 + i * 0.6, y: 0.45, r: 0.4, w: 0.18, xo: i % 2 ? -0.12 : 0.2 });
  return {
    P, wheels, sprockets: [{ z: 2.75, y: 0.8, r: 0.42 }], idlers: [{ z: -2.88, y: 0.7, r: 0.3 }], rollers: [],
    turretPos: [0, 1.95, d.turretZ], gunPos: [0, 0.42, 1.25],
    decals: [{ kind: 'cross', part: 'hull', pos: [1.565, 1.5, -0.6], ry: Math.PI / 2, s: 0.55 }, { kind: 'cross', part: 'hull', pos: [-1.565, 1.5, -0.6], ry: -Math.PI / 2, s: 0.55 }, { kind: 'text', text: '131', part: 'turret', pos: [1.26, 0.45, -0.4], ry: Math.PI / 2, s: 0.75 }, { kind: 'text', text: '131', part: 'turret', pos: [-1.26, 0.45, -0.4], ry: -Math.PI / 2, s: 0.75 }],
  };
}
function buildT34(d) {
  const P = new Parts(); const hw = d.W / 2;
  // upper hull with 40° side slopes (tapered extrude), lower hull
  P.add('hull', 'paint', taper(sideExtrude([[-2.9, 0.95], [2.6, 0.95], [2.8, 0.92], [1.5, 1.65], [-2.35, 1.65], [-2.95, 1.25]], 3.0, 0, 0.02), 0.95, 1.65, 0.8, 1));
  P.add('hull', 'paint', sideExtrude([[-2.9, 0.42], [2.4, 0.4], [3.0, 0.65], [2.8, 0.97], [-2.95, 0.97]], 1.95));
  for (const s of [-1, 1]) { P.add('hull', 'paint', box(0.52, 0.03, 0.6, s * 1.25, 1.0, 2.75, 0.3)); P.add('hull', 'metal', box(0.04, 0.04, 0.45, s * 1.3, 0.85, 2.98)); }
  P.add('hull', 'paint', cylZ(0.12, 0.14, 12, 0.6, 1.3, 2.4, 0.12, -0.5)); P.add('hull', 'dark', cylZ(0.025, 0.5, 6, 0.6, 1.33, 2.55, 0.025, -0.5)); // ball MG
  P.add('hull', 'paint', box(0.55, 0.4, 0.06, -0.55, 1.35, 2.32, -60 * DEG)); P.add('hull', 'glass', box(0.12, 0.04, 0.03, -0.45, 1.45, 2.27, -60 * DEG)); // driver hatch
  P.add('hull', 'metal', cylZ(0.1, 0.12, 10, -1.05, 1.15, 2.6, 0.1, -0.5));
  // external fuel tanks, engine deck, exhausts, spare tracks
  for (const s of [-1, 1]) for (const z of [-1.0, -2.0]) P.add('hull', 'paint', cylZ(0.2, 0.8, 14, s * 1.28, 1.25, z));
  P.add('hull', 'dark', box(1.2, 0.03, 1.1, 0, 1.67, -1.4)); for (const s of [-1, 1]) P.add('hull', 'metal', cylZ(0.08, 0.3, 10, s * 0.55, 1.15, -3.0, 0.08, 0.6));
  P.add('hull', 'metal', box(1.5, 0.05, 0.4, 0, 1.6, -2.6, 0.45));
  P.add('hull', 'wood', cylX(0.1, 2.0, 8, 0, 1.4, -3.05));
  // turret (cast)
  const tp = superEllipse(1.07, 1.25, 1.2, 2.2, 40, (x, z) => [x * (z > 0.3 ? 1 - (z - 0.3) * 0.22 : 1), z]);
  P.add('turret', 'paint', taper(topExtrude(tp, 0.78, 0, 0.1, 2), 0, 0.78, 0.8, 0.86));
  P.add('turret', 'paint', taper(box(1.2, 0.6, 0.35, 0, 0.38, 1.15), 0.08, 0.68, 0.9, 1)); P.add('turret', 'paint', cylX(0.3, 0.9, 14, 0, 0.38, 1.25));
  P.add('turret', 'paint', cylY(0.33, 0.25, 16, -0.42, 0.9, -0.45)); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P.add('turret', 'glass', box(0.08, 0.06, 0.03, -0.42 + Math.cos(a) * 0.335, 0.93, -0.45 + Math.sin(a) * 0.335, 0, -a + Math.PI / 2)); }
  P.add('turret', 'paint', cylY(0.23, 0.05, 12, 0.42, 0.8, -0.3)); for (const x of [-0.2, 0.55]) P.add('turret', 'metal', box(0.1, 0.12, 0.18, x, 0.84, 0.45));
  for (const s of [-1, 1]) P.add('turret', 'metal', cylZ(0.018, 0.8, 4, s * 0.95, 0.55, -0.2));
  P.add('turret', 'dark', cylY(0.09, 0.14, 8, 0.0, 0.84, -0.95));
  P.add('turret', 'metal', cylY(0.012, 1.6, 4, 0.8, 1.5, -0.7));
  P.add('gun', 'paint', lathe([[0.001, -0.25], [0.16, -0.25], [0.16, 0.3], [0.1, 0.35], [0.085, 0.6], [0.07, 4.4], [0.078, 4.45], [0.078, 4.65], [0.045, 4.65], [0.001, 4.65]], 18));
  return {
    P, wheels: [-2.05, -1.07, -0.09, 0.89, 1.87].map((z) => ({ z, y: 0.44, r: 0.41, w: 0.36, spoked: true })),
    sprockets: [{ z: -2.75, y: 0.55, r: 0.37 }], idlers: [{ z: 2.72, y: 0.58, r: 0.34 }], rollers: [],
    turretPos: [0, 1.65, d.turretZ], gunPos: [0, 0.38, 1.0],
    decals: [{ kind: 'redstar', part: 'turret', pos: [0.95, 0.4, -0.15], ry: Math.PI / 2 + 0.2, s: 0.45 }, { kind: 'redstar', part: 'turret', pos: [-0.95, 0.4, -0.15], ry: -Math.PI / 2 - 0.2, s: 0.45 }, { kind: 'text', text: '24', part: 'turret', pos: [0.93, 0.42, -0.75], ry: Math.PI / 2 + 0.25, s: 0.5 }],
  };
}
function buildT72(d) {
  const P = new Parts(); const hw = d.W / 2;
  P.add('hull', 'paint', sideExtrude([[-3.35, 0.5], [3.1, 0.5], [3.45, 0.62], [3.43, 0.92], [1.93, 1.5], [-3.32, 1.5], [-3.45, 1.2]], 2.3, 0, 0.02));
  for (const s of [-1, 1]) { P.add('hull', 'paint', box(0.66, 0.04, 6.4, s * 1.48, 1.05, -0.05)); P.add('hull', 'rubber', box(0.04, 0.32, 1.9, s * 1.79, 0.86, 2.2)); P.add('hull', 'rubber', box(0.04, 0.28, 0.4, s * 1.79, 0.86, -3.05)); }
  // fender stowage & fuel boxes (right), toolbox, unditching log, fuel drums
  for (let i = 0; i < 4; i++) P.add('hull', 'paint', box(0.55, 0.42, 0.9, 1.43, 1.28, 1.2 - i * 1.0));
  for (let i = 0; i < 3; i++) P.add('hull', 'paint', box(0.55, 0.36, 0.95, -1.43, 1.25, -0.3 - i * 1.0));
  P.add('hull', 'wood', cylX(0.14, 2.6, 10, 0, 1.6, -3.3)); for (const s of [-1, 1]) P.add('hull', 'paint', cylX(0.29, 0.92, 16, s * 0.62, 1.15, -3.55));
  P.add('hull', 'dark', box(2.0, 0.02, 1.5, 0, 1.51, -2.2)); for (let i = 0; i < 8; i++) P.add('hull', 'paint', box(2.0, 0.035, 0.05, 0, 1.53, -1.55 - i * 0.18));
  P.add('hull', 'paint', box(0.6, 0.06, 0.45, 0, 1.52, 1.75)); P.add('hull', 'glass', box(0.12, 0.05, 0.03, 0, 1.53, 2.0));
  // Kontakt-1 ERA on glacis (rotated to plate slope 68°)
  const gl = 21.8 * DEG; for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { const t = 0.2 + r * 0.32; const z = 3.43 - t * 1.5, y = 0.92 + t * 0.58; P.add('hull', 'paint', box(0.3, 0.08, 0.26, -1.0 + i * 0.33, y + 0.05, z, gl)); }
  P.add('hull', 'metal', box(2.2, 0.06, 0.12, 0, 1.05, 3.12, gl)); // splash guard
  for (const s of [-1, 1]) P.add('hull', 'metal', cylZ(0.08, 0.1, 10, s * 0.95, 1.05, 3.3));
  // turret dome
  const dome = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1.12, 0.72, 1.28);
  { const p = dome.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0.4) p.setZ(i, 0.4 + (p.getZ(i) - 0.4) * 0.85); } dome.computeVertexNormals(); }
  P.add('turret', 'paint', dome); P.add('turret', 'paint', cylY(1.12, 0.12, 32, 0, 0.0, 0, 1.15));
  // ERA on turret arc
  for (let r = 0; r < 2; r++) for (let a = -70; a <= 70; a += 14) { if (Math.abs(a) < 12) continue; const ar = a * DEG; const rr = r ? 0.96 : 1.12;
    P.add('turret', 'paint', box(0.27, 0.2, 0.09, Math.sin(ar) * rr * 1.08, 0.2 + r * 0.25, Math.cos(ar) * rr * 1.12 + 0.05, -0.25 - r * 0.3, ar)); }
  for (let i = 0; i < 6; i++) P.add('turret', 'paint', box(0.27, 0.08, 0.22, -0.6 + i * 0.24 + (i > 2 ? 0.2 : -0.2), 0.68, 0.55, 0.15));
  P.add('turret', 'paint', box(0.6, 0.48, 0.3, 0, 0.32, 1.25)); // mantlet
  P.add('turret', 'paint', cylY(0.32, 0.2, 16, 0.45, 0.76, -0.2)); P.add('turret', 'metal', box(0.12, 0.16, 0.7, 0.45, 1.0, 0.0)); P.add('turret', 'dark', cylZ(0.022, 1.2, 6, 0.45, 1.0, 0.5)); // NSVT
  P.add('turret', 'paint', cylY(0.28, 0.1, 14, -0.45, 0.72, -0.25)); P.add('turret', 'metal', box(0.3, 0.3, 0.32, -0.55, 0.78, 0.38)); P.add('turret', 'glass', box(0.22, 0.14, 0.02, -0.55, 0.8, 0.55));
  P.add('turret', 'metal', box(0.3, 0.3, 0.3, 0.72, 0.45, 0.95)); P.add('turret', 'glass', cylZ(0.12, 0.02, 14, 0.72, 0.45, 1.11)); // Luna IR light
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.add('turret', 'metal', cylZ(0.045, 0.3, 8, s * (0.8 + i * 0.07), 0.42 + i * 0.03, 0.75 - i * 0.12, 0.045, -0.4));
  P.add('turret', 'metal', cylZ(0.09, 1.3, 10, 0, 0.5, -1.35)); // snorkel tube
  P.add('turret', 'metal', cylY(0.012, 2.0, 4, -0.7, 1.6, -0.8));
  P.add('gun', 'paint', lathe([[0.001, -0.3], [0.2, -0.3], [0.2, 0.15], [0.12, 0.25], [0.11, 3.4], [0.14, 3.45], [0.14, 3.95], [0.1, 4.0], [0.095, 5.95], [0.1, 6.0], [0.05, 6.0], [0.001, 6.0]], 18));
  for (const z of [1.2, 2.2, 4.6, 5.3]) P.add('gun', 'paint', cylZ(0.123, 0.06, 18, 0, 0, z));
  return {
    P, wheels: [-2.55, -1.62, -0.69, 0.24, 1.17, 2.1].map((z) => ({ z, y: 0.4, r: 0.375, w: 0.46 })),
    sprockets: [{ z: -3.15, y: 0.62, r: 0.33 }], idlers: [{ z: 2.95, y: 0.56, r: 0.31 }], rollers: [-1.6, 0.0, 1.5].map((z) => ({ z, y: 0.98, r: 0.075 })),
    turretPos: [0, 1.5, d.turretZ], gunPos: [0, 0.34, 1.05],
    decals: [{ kind: 'text', text: '214', part: 'turret', pos: [-0.85, 0.42, -0.6], ry: -Math.PI / 2 - 0.5, s: 0.5 }, { kind: 'text', text: '214', part: 'turret', pos: [0.85, 0.42, -0.6], ry: Math.PI / 2 + 0.5, s: 0.5 }],
  };
}
function buildAbrams(d) {
  const P = new Parts(); const hw = d.W / 2;
  P.add('hull', 'paint', sideExtrude([[-3.9, 0.55], [3.6, 0.55], [3.98, 0.72], [4.0, 1.02], [1.5, 1.52], [-3.75, 1.52], [-3.98, 1.4]], 3.3, 0, 0.02));
  // side skirts (front sections thicker) and rear grille
  for (const s of [-1, 1]) {
    P.add('hull', 'paint', box(0.07, 0.62, 5.4, s * 1.8, 0.92, -1.0)); P.add('hull', 'paint', box(0.14, 0.7, 2.2, s * 1.78, 0.9, 2.6));
    P.add('hull', 'paint', box(0.14, 0.2, 0.6, s * 1.78, 0.62, 3.75, -0.5));
    for (let i = 0; i < 6; i++) P.add('hull', 'dark', box(0.08, 0.02, 0.02, s * 1.84, 1.1 - i * 0.0, -3.3 + i * 0.9));
    P.add('hull', 'metal', box(0.25, 0.15, 0.1, s * 1.3, 1.25, 4.0)); P.add('hull', 'glass', box(0.18, 0.08, 0.02, s * 1.3, 1.25, 4.06));
    P.add('hull', 'metal', cylY(0.06, 0.3, 8, s * 1.55, 1.5, -3.85));
  }
  P.add('hull', 'dark', box(2.6, 0.55, 0.05, 0, 1.1, -3.98)); for (let i = 0; i < 6; i++) P.add('hull', 'metal', box(2.6, 0.03, 0.06, 0, 0.88 + i * 0.09, -4.0));
  P.add('hull', 'dark', box(2.8, 0.02, 2.0, 0, 1.53, -2.6)); for (let i = 0; i < 10; i++) P.add('hull', 'paint', box(2.8, 0.03, 0.06, 0, 1.55, -1.7 - i * 0.19));
  P.add('hull', 'paint', box(0.7, 0.05, 0.5, 0, 1.43, 2.1, 0.2)); for (let i = 0; i < 3; i++) P.add('hull', 'glass', box(0.12, 0.05, 0.03, -0.18 + i * 0.18, 1.45, 2.38, 0.2));
  // turret: angular faceted wedge with bustle
  const tp = [[0.95, 2.05], [1.72, 0.55], [1.72, -1.2], [1.55, -2.3], [-1.55, -2.3], [-1.72, -1.2], [-1.72, 0.55], [-0.95, 2.05]];
  P.add('turret', 'paint', taper(topExtrude(tp, 0.72, 0, 0.03, 1), 0, 0.72, 0.95, 0.97));
  P.add('turret', 'dark', box(0.75, 0.6, 0.2, 0, 0.36, 1.95)); P.add('turret', 'paint', box(0.62, 0.5, 0.35, 0, 0.38, 2.05));
  P.add('turret', 'paint', box(0.65, 0.42, 0.75, 0.95, 0.9, 1.15)); P.add('turret', 'glass', box(0.5, 0.25, 0.03, 0.95, 0.92, 1.53)); // GPS doghouse
  P.add('turret', 'paint', cylY(0.22, 0.35, 12, -0.55, 0.88, -0.6)); P.add('turret', 'paint', box(0.42, 0.35, 0.42, -0.55, 1.15, -0.6)); P.add('turret', 'glass', box(0.3, 0.18, 0.02, -0.55, 1.17, -0.38)); // CITV
  P.add('turret', 'paint', cylY(0.38, 0.22, 16, 0.75, 0.82, -0.4)); P.add('turret', 'metal', box(0.15, 0.2, 0.9, 0.75, 1.05, -0.2)); P.add('turret', 'dark', cylZ(0.025, 1.4, 6, 0.75, 1.07, 0.5)); // CWS + M2
  P.add('turret', 'paint', cylY(0.33, 0.06, 14, -0.85, 0.74, 0.3)); P.add('turret', 'dark', cylZ(0.018, 1.0, 6, -1.05, 1.0, 0.5)); P.add('turret', 'metal', box(0.06, 0.25, 0.06, -1.05, 0.86, 0.2));
  // bustle rack
  for (const y of [0.75, 1.05]) { P.add('turret', 'metal', box(3.0, 0.04, 0.04, 0, y, -2.75)); for (const s of [-1, 1]) P.add('turret', 'metal', box(0.04, 0.04, 0.5, s * 1.5, y, -2.52)); }
  for (let i = 0; i < 9; i++) P.add('turret', 'metal', box(0.03, 0.34, 0.03, -1.5 + i * 0.375, 0.9, -2.75));
  P.add('turret', 'canvas', box(2.6, 0.25, 0.42, 0, 0.88, -2.52));
  for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) P.add('turret', 'metal', cylZ(0.04, 0.22, 8, s * (1.55 + 0.0), 0.5 + (i % 2) * 0.1, 0.8 - Math.floor(i / 2) * 0.1, 0.04, -0.5)); P.add('turret', 'metal', cylY(0.012, 2.2, 4, s * 1.2, 1.8, -2.0)); }
  P.add('turret', 'metal', cylY(0.02, 0.5, 4, 0.0, 0.98, -1.4)); P.add('turret', 'metal', box(0.04, 0.04, 0.2, 0, 1.24, -1.4));
  P.add('gun', 'paint', lathe([[0.001, -0.3], [0.16, -0.3], [0.16, 0.25], [0.125, 0.3], [0.12, 2.6], [0.155, 2.65], [0.155, 3.25], [0.115, 3.3], [0.105, 5.25], [0.11, 5.3], [0.06, 5.3], [0.001, 5.3]], 18));
  for (const z of [1.2, 1.9, 3.9, 4.6]) P.add('gun', 'paint', cylZ(0.128, 0.05, 18, 0, 0, z));
  P.add('gun', 'metal', box(0.08, 0.08, 0.12, 0, 0.14, 5.2));
  return {
    P, wheels: [-2.75, -1.88, -1.01, -0.14, 0.73, 1.6, 2.47].map((z) => ({ z, y: 0.37, r: 0.32, w: 0.52 })),
    sprockets: [{ z: -3.55, y: 0.62, r: 0.34 }], idlers: [{ z: 3.45, y: 0.62, r: 0.32 }], rollers: [-1.4, 1.2].map((z) => ({ z, y: 0.98, r: 0.08 })),
    turretPos: [0, 1.52, d.turretZ], gunPos: [0, 0.38, 1.95], decals: [],
  };
}
const BUILDERS = { sherman: buildSherman, tiger: buildTiger, t34: buildT34, t72: buildT72, m1a2: buildAbrams };

// ---------- Template + instance ----------
const templates = {};
function getTemplate(spec) {
  if (templates[spec.id]) return templates[spec.id];
  const d = spec.dims; const b = BUILDERS[spec.id](d);
  const mats = sharedMats();
  const paint = paintMaterial(spec.paint, spec.id.length * 31 + 7);
  const geo = b.P.merged();
  const trackCircles = [...b.wheels.map((w) => ({ z: w.z, y: w.y, r: w.r })), ...b.sprockets, ...b.idlers, ...b.rollers];
  const track = trackGeometry(trackCircles, d.trackW, 0.075, 0.17);
  const wheelGeo = wheelGeometry(spec.paint.base, b.wheels[0].spoked);
  const sprocketGeo = sprocketGeometry(spec.paint.base);
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.25 });
  templates[spec.id] = { b, geo, paint, mats, track, wheelGeo, sprocketGeo, wheelMat };
  return templates[spec.id];
}

export function createTankModel(spec, opts = {}) {
  const tpl = getTemplate(spec); const d = spec.dims; const { b, geo, paint, mats } = tpl;
  const root = new THREE.Group(); root.name = spec.id;
  const body = new THREE.Group(); root.add(body); // body receives pitch/roll
  const matFor = (k) => (k === 'paint' ? paint : mats[k]);
  const meshes = [];
  const mk = (g, k, parent) => { const m = new THREE.Mesh(g, matFor(k)); m.castShadow = true; m.receiveShadow = true; m.userData.matKey = k; parent.add(m); meshes.push(m); return m; };
  for (const [k, g] of Object.entries(geo.hull)) mk(g, k, body);
  const turret = new THREE.Group(); turret.position.set(...b.turretPos); body.add(turret);
  for (const [k, g] of Object.entries(geo.turret)) mk(g, k, turret);
  const gun = new THREE.Group(); gun.position.set(...b.gunPos); turret.add(gun);
  for (const [k, g] of Object.entries(geo.gun)) mk(g, k, gun);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, d.gunLen); gun.add(muzzle);
  const sight = new THREE.Object3D(); sight.position.set(0.35, 0.25, 0.2); gun.add(sight);
  // tracks (each side gets own material so its texture can scroll independently)
  const tracks = [];
  for (const s of [-1, 1]) {
    const tex = trackTexture().clone(); tex.repeat.set(1, 1);
    const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.55, color: 0x9a948c, side: THREE.DoubleSide });
    const m = new THREE.Mesh(tpl.track.geo, tm); m.position.x = s * (d.W / 2 - d.trackW / 2); m.castShadow = true; m.receiveShadow = true; body.add(m); tracks.push(m); meshes.push(m);
  }
  // wheels: instanced (road wheels + idlers + return rollers) and sprockets
  const wl = [];
  for (const s of [-1, 1]) {
    for (const w of b.wheels) wl.push({ x: s * (d.W / 2 - d.trackW / 2) + (w.xo || 0) * s, y: w.y, z: w.z, r: w.r, w: w.w ?? d.trackW * 0.8, side: s });
    for (const w of b.idlers) wl.push({ x: s * (d.W / 2 - d.trackW / 2), y: w.y, z: w.z, r: w.r, w: d.trackW * 0.6, side: s });
    for (const w of b.rollers) wl.push({ x: s * (d.W / 2 - d.trackW / 2), y: w.y, z: w.z, r: w.r, w: d.trackW * 0.5, side: s });
  }
  const wheels = new THREE.InstancedMesh(tpl.wheelGeo, tpl.wheelMat, wl.length); wheels.castShadow = true; wheels.receiveShadow = true; body.add(wheels); meshes.push(wheels);
  const sl = []; for (const s of [-1, 1]) for (const w of b.sprockets) sl.push({ x: s * (d.W / 2 - d.trackW / 2), y: w.y, z: w.z, r: w.r, w: d.trackW * 0.7, side: s });
  const sprockets = new THREE.InstancedMesh(tpl.sprocketGeo, tpl.wheelMat, sl.length); sprockets.castShadow = true; body.add(sprockets); meshes.push(sprockets);
  // decals
  for (const dc of b.decals) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dc.s, dc.s), new THREE.MeshStandardMaterial({ map: decalTexture(dc.kind, dc.text), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.position.set(...dc.pos); m.rotation.y = dc.ry; (dc.part === 'hull' ? body : turret).add(m); m.userData.decal = true; meshes.push(m);
  }
  const model = { root, body, turret, gun, muzzle, sight, tracks, wheels, sprockets, wheelList: wl, sprocketList: sl, meshes, trackLength: tpl.track.length, spin: 0, trackOffset: [0, 0] };
  updateRunningGear(model, 0, 0);
  return model;
}
const _mat = new THREE.Matrix4(), _pos = new V3(), _scl = new V3(), _qq = new THREE.Quaternion(), _eu = new THREE.Euler();
// distL / distR: distance travelled by each track this frame (m)
export function updateRunningGear(model, distL, distR) {
  model.trackOffset[0] -= distL / 0.17; model.trackOffset[1] -= distR / 0.17;
  model.tracks[0].material.map.offset.x = model.trackOffset[0]; model.tracks[1].material.map.offset.x = model.trackOffset[1];
  model.spinL = (model.spinL || 0) + distL; model.spinR = (model.spinR || 0) + distR;
  const set = (im, list) => { list.forEach((w, i) => { const dist = w.side < 0 ? model.spinL : model.spinR; _eu.set(dist / w.r, 0, 0); _qq.setFromEuler(_eu); _pos.set(w.x, w.y, w.z); _scl.set(w.w, w.r, w.r); _mat.compose(_pos, _qq, _scl); im.setMatrixAt(i, _mat); }); im.instanceMatrix.needsUpdate = true; };
  set(model.wheels, model.wheelList); set(model.sprockets, model.sprocketList);
}
export function burnModel(model) {
  const b = burntMaterial();
  for (const m of model.meshes) { if (m.userData.decal) { m.visible = false; continue; } m.material = b; }
}
