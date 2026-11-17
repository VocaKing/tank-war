// Shared geometry helpers for procedural tank models (1 unit = 1 m, +z = front, +y = up)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const V3 = THREE.Vector3;
export const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function T(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(new V3(x, y, z), _q, new V3(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => T(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
export const cylY = (r, h, seg, x, y, z, r2 = r) => T(new THREE.CylinderGeometry(r, r2, h, seg), x, y, z);
export const cylX = (r, len, seg, x, y, z, r2 = r) => T(new THREE.CylinderGeometry(r, r2, len, seg), x, y, z, 0, 0, Math.PI / 2);
export const cylZ = (r, len, seg, x, y, z, r2 = r, rx = 0) => T(new THREE.CylinderGeometry(r2, r, len, seg), x, y, z, Math.PI / 2 + rx, 0, 0);
// side profile [[z,y]...] extruded across x
export function sideExtrude(profile, width, x = 0, bevel = 0.02) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2 - bevel + x, 0, 0); return g;
}
// top-view polygon [[x,z]...] extruded vertically
export function topExtrude(poly, height, y0 = 0, bevel = 0.04, segs = 2) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, height - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, y0 + height - bevel, 0);
  return g;
}
export function flipWinding(g) {
  const p = g.attributes.position; const n = g.attributes.normal; const uv = g.attributes.uv;
  if (g.index) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } }
  else { for (let i = 0; i < p.count; i += 3) for (const a of [p, n, uv]) { if (!a) continue; for (let k = 0; k < a.itemSize; k++) { const t = a.array[i * a.itemSize + k]; a.array[i * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k]; a.array[(i + 2) * a.itemSize + k] = t; } } }
  g.computeVertexNormals();
}
export function taper(g, y0, y1, sx, sz = sx, cz = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); p.setX(i, p.getX(i) * (1 + (sx - 1) * t)); p.setZ(i, cz + (p.getZ(i) - cz) * (1 + (sz - 1) * t)); }
  g.computeVertexNormals(); return g;
}
export function lathe(profile, seg = 20) { // profile [[r, z]] -> revolve around z
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2); return g;
}
export function superEllipse(rx, rzF, rzR, n = 2.6, seg = 40, fn) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a);
    let x = Math.sign(c) * Math.abs(c) ** (2 / n) * rx; let z = Math.sign(s) * Math.abs(s) ** (2 / n) * (s > 0 ? rzF : rzR);
    if (fn) [x, z] = fn(x, z); pts.push([x, z]);
  }
  return pts;
}
export function clean(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}
export class Parts {
  constructor() { this.b = {}; }
  add(part, mat, g) { (this.b[part + '|' + mat] ||= []).push(clean(g)); }
  merged() { const out = {}; for (const [k, list] of Object.entries(this.b)) { const [part, mat] = k.split('|'); (out[part] ||= {})[mat] = mergeGeometries(list); } return out; }
}

