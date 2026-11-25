// Detail kit: reusable, real-scale tank details (hatches, cupolas, MGs, periscopes, tools, cables, spare links,
// exhausts, stowage, smoke dischargers, ERA, skirts, bolts...). Everything is added into a Parts collector
// and merged per material, so detail costs draw calls only once per material.
import * as THREE from 'three';
import { T, box, cylY, cylX, cylZ, lathe } from './geom.js';

const TAU = Math.PI * 2;
// rotate (x,z) offsets around a vertical axis
const rot = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

export function bolts(P, part, mat, pts, r = 0.018, h = 0.025, axis = 'y') {
  for (const [x, y, z] of pts) P.add(part, mat, axis === 'y' ? cylY(r, h, 6, x, y, z) : axis === 'x' ? cylX(r, h, 6, x, y, z) : cylZ(r, h, 6, x, y, z));
}
export function boltRow(P, part, a, b, n, r = 0.017, axis = 'y', mat = 'paint') {
  const pts = []; for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  bolts(P, part, mat, pts, r, 0.022, axis);
}
// round hatch with hinge + handle (lies on a horizontal plane at y)
export function hatch(P, part, x, y, z, r = 0.3, opts = {}) {
  const ry = opts.ry || 0;
  P.add(part, 'paint', cylY(r + 0.04, 0.05, 32, x, y, z)); // ring
  P.add(part, 'paint', cylY(r, 0.055, 32, x, y + 0.04, z)); // lid
  P.add(part, 'paint', cylY(r * 0.55, 0.02, 16, x, y + 0.085, z)); // dome
  const [hx, hz] = rot(0, -r * 0.95, ry); P.add(part, 'metal', T(new THREE.CylinderGeometry(0.035, 0.035, r * 0.9, 8), x + hx, y + 0.07, z + hz, 0, ry, Math.PI / 2)); // hinge
  const [gx, gz] = rot(0, r * 0.55, ry); P.add(part, 'metal', T(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), x + gx, y + 0.09, z + gz, 0, ry, 0)); // handle
  // Recessed seam and shaped hinge ears, not painted-on lines.
  P.add(part, 'dark', T(new THREE.TorusGeometry(r+0.008,0.008,6,32),x,y+0.018,z,Math.PI/2,0,0));
  for(const side of [-1,1]) {
    const [ex,ez]=rot(side*r*0.44,-r*0.95,ry);
    P.add(part,'paint',box(0.055,0.04,0.085,x+ex,y+0.055,z+ez,0,ry));
  }
  if (opts.periscope) periscope(P, part, x + rot(0, r * 0.1, ry)[0], y + 0.1, z + rot(0, r * 0.1, ry)[1], ry);
}
// rectangular hatch
export function hatchRect(P, part, x, y, z, w, d, ry = 0, rx = 0) {
  P.add(part, 'paint', box(w + 0.06, 0.04, d + 0.06, x, y, z, rx, ry));
  P.add(part, 'paint', box(w, 0.06, d, x, y + 0.03, z, rx, ry));
  const [hx, hz] = rot(0, -d / 2, ry); P.add(part, 'metal', T(new THREE.CylinderGeometry(0.03, 0.03, w * 0.8, 8), x + hx, y + 0.06, z + hz, rx, ry, Math.PI / 2));
}
export function periscope(P, part, x, y, z, ry = 0, s = 1) {
  P.add(part, 'paint', box(0.14 * s, 0.1 * s, 0.2 * s, x, y + 0.05 * s, z, 0, ry));
  P.add(part, 'paint', box(0.16 * s, 0.03 * s, 0.24 * s, x, y + 0.11 * s, z, 0, ry));
  const [gx, gz] = rot(0, 0.1 * s, ry); P.add(part, 'glass', box(0.11 * s, 0.06 * s, 0.012, x + gx, y + 0.06 * s, z + gz, -0.25, ry));
}
// commander cupola: ring with vision blocks + hatch on top. style 'ww2' | 'modern'
export function cupola(P, part, x, y, z, r = 0.34, h = 0.28, n = 7, style = 'ww2') {
  P.add(part, 'paint', cylY(r, h, 24, x, y + h / 2, z, r * 1.02));
  P.add(part, 'paint', cylY(r * 1.06, 0.05, 24, x, y + h, z));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU; const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
    if (style === 'ww2') { P.add(part, 'glass', box(0.12, 0.08, 0.025, cx, y + h * 0.62, cz, 0, -a + Math.PI / 2)); P.add(part, 'paint', box(0.16, 0.025, 0.06, cx + Math.cos(a) * 0.03, y + h * 0.88, cz + Math.sin(a) * 0.03, 0, -a + Math.PI / 2)); }
    else { P.add(part, 'paint', box(0.14, 0.1, 0.12, cx, y + h * 0.7, cz, 0, -a + Math.PI / 2)); P.add(part, 'glass', box(0.1, 0.05, 0.015, cx + Math.cos(a) * 0.06, y + h * 0.7, cz + Math.sin(a) * 0.06, 0, -a + Math.PI / 2)); }
  }
  hatch(P, part, x, y + h + 0.02, z, r * 0.78, { ry: Math.PI });
}
// machine gun: style 'm2' (heavy, ammo can), 'mg34', 'dshk', 'pkt', 'mag'. dir = yaw (0 = forward +z)
export function mg(P, part, x, y, z, yaw = 0, style = 'm2', pitch = 0) {
  const L = style === 'm2' ? 1.65 : style === 'dshk' ? 1.6 : style === 'mag' ? 1.25 : style === 'dt' ? 1.0 : 1.2;
  const fwd = (d) => [x + Math.sin(yaw) * Math.cos(pitch) * d, y + Math.sin(pitch) * d, z + Math.cos(yaw) * Math.cos(pitch) * d];
  const add = (g, d, mat = 'dark') => { const [px, py, pz] = fwd(d); P.add(part, mat, T(g, px, py, pz, -pitch, yaw, 0)); };
  add(new THREE.BoxGeometry(0.11, 0.13, 0.45), 0.05); // receiver
  add(new THREE.CylinderGeometry(style === 'm2' ? 0.03 : 0.02, style === 'm2' ? 0.03 : 0.02, L * 0.55, 8).rotateX(Math.PI / 2), 0.28 + L * 0.27); // barrel / jacket
  add(new THREE.CylinderGeometry(0.012, 0.012, L * 0.2, 6).rotateX(Math.PI / 2), 0.28 + L * 0.6);
  if (style === 'dshk') add(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10).rotateX(Math.PI / 2), 0.28 + L * 0.62);
  add(new THREE.BoxGeometry(0.06, 0.08, 0.1), -0.2); // grips
  const [ax, ay, az] = fwd(0.05); const [sx, sz] = rot(0.1, 0, yaw);
  P.add(part, 'paint', T(new THREE.BoxGeometry(0.1, 0.16, 0.26), ax + sx, ay - 0.04, az + sz, 0, yaw, 0)); // ammo can
  P.add(part, 'metal', cylY(0.03, 0.22, 8, x, y - 0.15, z)); // pintle
}
// smoke grenade dischargers: n tubes in a fan on one side
export function smokeDischargers(P, part, x, y, z, yaw, n = 4, spread = 0.13, len = 0.24, r = 0.04) {
  P.add(part, 'paint', T(new THREE.BoxGeometry(0.12, 0.06, spread * n), x, y - 0.05, z, 0, yaw, 0));
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * spread; const [ox, oz] = rot(0, o, yaw); P.add(part, 'metal', T(new THREE.CylinderGeometry(r, r * 1.05, len, 10), x + ox, y + 0.02, z + oz, 0.5, yaw + Math.PI / 2 - 0.3, 0)); }
}
// pioneer tools along a deck/fender at height y, running from z0 forward, at x
export function tools(P, part, x, y, z0, side = 1) {
  // shovel
  P.add(part, 'wood', cylZ(0.022, 0.75, 6, x, y + 0.025, z0)); P.add(part, 'metal', box(0.2, 0.02, 0.26, x, y + 0.02, z0 + 0.48));
  // axe
  P.add(part, 'wood', cylZ(0.02, 0.7, 6, x + side * 0.16, y + 0.02, z0 + 0.1)); P.add(part, 'metal', box(0.03, 0.12, 0.12, x + side * 0.16, y + 0.04, z0 + 0.48));
  // crowbar + sledge
  P.add(part, 'metal', cylZ(0.016, 1.3, 6, x - side * 0.14, y + 0.018, z0 - 0.75)); P.add(part, 'wood', cylZ(0.02, 0.8, 6, x + side * 0.03, y + 0.02, z0 - 0.95)); P.add(part, 'metal', box(0.07, 0.07, 0.18, x + side * 0.03, y + 0.03, z0 - 1.38));
  for (const dz of [0.2, -0.3, -0.9]) P.add(part, 'metal', box(0.4, 0.035, 0.025, x, y + 0.035, z0 + dz)); // clamps
}
// tow cable along the hull side/deck: from z0 to z1 at (x,y), with eye loops; braided look via segmented tube
export function towCable(P, part, x, y, z0, z1, sag = 0.0, r = 0.022) {
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(x + Math.sin(t * 17) * 0.004, y - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t)); }
  P.add(part, 'metal', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 6, false));
  for (const z of [z0, z1]) P.add(part, 'metal', T(new THREE.TorusGeometry(0.06, r * 1.2, 5, 10), x, y, z + Math.sign(z - (z0 + z1) / 2) * 0.05, 0, Math.PI / 2, 0));
  for (const t of [0.25, 0.75]) P.add(part, 'metal', box(0.06, 0.06, 0.04, x, y, z0 + (z1 - z0) * t));
}
// spare track links (row), plate in a plane with yaw/pitch
export function spareLinks(P, part, x, y, z, n, w, pitch = 0.17, ry = 0, rx = 0, mat = 'track') {
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * pitch * 1.02;
    const g = new THREE.BoxGeometry(w, 0.04, pitch * 0.9); g.translate(0, 0, o); const gr = new THREE.BoxGeometry(w * 0.85, 0.035, 0.03); gr.translate(0, 0.035, o);
    const h = new THREE.BoxGeometry(0.06, 0.06, pitch * 0.5); h.translate(0, -0.04, o);
    for (const gg of [g, gr, h]) P.add(part, mat, T(gg, x, y, z, rx, ry, 0));
  }
  P.add(part, 'metal', T(new THREE.BoxGeometry(w * 1.05, 0.03, 0.03), x, y + 0.02, z, rx, ry, 0)); // retaining bar
}
// exhaust: muffler + pipe with guard
export function exhaust(P, part, x, y, z, style = 'ww2', r = 0.11, len = 0.55) {
  if (style === 'ww2') {
    P.add(part, 'metal', cylY(r, len, 12, x, y, z)); P.add(part, 'dark', cylY(r * 0.55, 0.04, 10, x, y + len / 2 + 0.01, z));
    P.add(part, 'paint', T(new THREE.CylinderGeometry(r * 1.45, r * 1.45, len * 0.85, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1), x, y - 0.02, z));
  } else { // modern grille louvres
    P.add(part, 'dark', box(len, r * 2, 0.06, x, y, z)); for (let i = 0; i < 6; i++) P.add(part, 'paint', box(len, 0.025, 0.07, x, y - r + (i + 0.5) * (r * 2 / 6), z + 0.01, 0.4));
  }
}
export function stowageBox(P, part, x, y, z, w, h, d, ry = 0) {
  P.add(part, 'paint', box(w, h, d, x, y, z, 0, ry));
  P.add(part, 'paint', box(w + 0.03, 0.03, d + 0.03, x, y + h / 2 - 0.04, z, 0, ry)); // lid lip
  // Separate lid seam and hinge cylinders.
  for (const side of [-1,1]) {
    const [sx,sz]=rot(side*w*0.3,-d/2,ry);
    P.add(part,'metal',T(new THREE.CylinderGeometry(0.018,0.018,0.10,8),x+sx,y+h/2-0.035,z+sz,0,ry,Math.PI/2));
  }
  const [lx, lz] = rot(0, d / 2 + 0.01, ry); P.add(part, 'metal', box(0.06, 0.08, 0.02, x + lx, y + h / 2 - 0.08, z + lz, 0, ry)); // latch
}
export function headlight(P, part, x, y, z, guard = true, lens = 'glass') {
  P.add(part, 'metal', cylZ(0.085, 0.12, 12, x, y, z)); P.add(part,lens,cylZ(0.07,0.015,24,x,y,z+0.065));
  P.add(part,'metal',T(new THREE.TorusGeometry(0.074,0.009,6,24),x,y,z+0.07,0,0,0));
  if (guard) for (const a of [-0.6, 0, 0.6]) P.add(part, 'metal', T(new THREE.TorusGeometry(0.11, 0.01, 4, 10, Math.PI), x, y, z + 0.02, 0, 0, a * 0.2));
  P.add(part, 'metal', box(0.04, 0.12, 0.04, x, y - 0.1, z - 0.04));
}
export function liftHooks(P, part, pts) { for (const [x, y, z, ry = 0] of pts) P.add(part, 'paint', T(new THREE.TorusGeometry(0.06, 0.02, 5, 10, Math.PI), x, y + 0.01, z, 0, ry + Math.PI / 2, 0)); }
export function grabRail(P, part, a, b, h = 0.07, r = 0.012) {
  const dx = b[0] - a[0], dz = b[2] - a[2]; const L = Math.hypot(dx, dz); const yaw = Math.atan2(dx, dz);
  P.add(part, 'metal', T(new THREE.CylinderGeometry(r, r, L, 5).rotateX(Math.PI / 2), (a[0] + b[0]) / 2, a[1] + h, (a[2] + b[2]) / 2, 0, yaw, 0));
  for (const p of [a, b]) P.add(part, 'metal', cylY(r, h, 5, p[0], p[1] + h / 2, p[2]));
}
export function antenna(P, part, x, y, z, h = 2.2) { P.add(part, 'dark', cylY(0.05, 0.12, 8, x, y + 0.06, z)); P.add(part, 'metal', cylY(0.006, h, 4, x, y + h / 2, z, 0.012)); }
export function jerrycans(P, part, x, y, z, n = 2, ry = 0) {
  for (let i = 0; i < n; i++) { const [ox, oz] = rot((i - (n - 1) / 2) * 0.19, 0, ry); P.add(part,'paint',box(0.17,0.42,0.34,x+ox,y+0.21,z+oz,0,ry));
    const [cx,cz]=rot(0,0.108,ry);
    P.add(part,'metal',cylY(0.035,0.035,10,x+ox+cx,y+0.44,z+oz+cz));
    // Open handle with two feet, pressed reinforcing ribs on broad faces.
    for(const dz of [-0.085,0.025]){
      const [hx,hz]=rot(0,dz,ry);
      P.add(part,'paint',box(0.045,0.06,0.028,x+ox+hx,y+0.445,z+oz+hz,0,ry));
    }
    const [hx,hz]=rot(0,-0.03,ry);
    P.add(part,'paint',box(0.045,0.025,0.14,x+ox+hx,y+0.475,z+oz+hz,0,ry));
    for(const side of [-1,1]) for(const a of [-0.58,0.58]){
      const [rx,rz]=rot(side*0.088,0,ry);
      P.add(part,'paint',box(0.012,0.30,0.023,x+ox+rx,y+0.21,z+oz+rz,a,ry));
    } }
}
// grid of ERA bricks covering a quad: origin o, u/v axis vectors (unit) and sizes; normal = cross(u, v)
export function eraGrid(P, part, o, u, v, nu, nv, su, sv, t = 0.07, gap = 0.02, mat = 'paint') {
  const U = new THREE.Vector3(...u).normalize(), Vv = new THREE.Vector3(...v).normalize(); const N = new THREE.Vector3().crossVectors(U, Vv).normalize();
  const m = new THREE.Matrix4().makeBasis(Vv, N, U); // right-handed basis (no mirroring): box x->v, y->normal, z->u
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const g = new THREE.BoxGeometry(sv - gap, t, su - gap); g.applyMatrix4(m);
    const c = new THREE.Vector3(...o).addScaledVector(U, (i + 0.5) * su).addScaledVector(Vv, (j + 0.5) * sv).addScaledVector(N, t / 2);
    g.translate(c.x, c.y, c.z); P.add(part, mat, g);
    const b = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 6); b.applyMatrix4(m); const bc = c.clone().addScaledVector(N, t / 2); b.translate(bc.x, bc.y, bc.z); P.add(part, 'metal', b);
  }
}
// side skirt made of n panels (hull side at x), from z0..z1, top y, height h
export function skirt(P, x, y, z0, z1, h, n = 5, t = 0.04, tilt = 0, mat = 'paint') {
  const L = (z1 - z0) / n;
  for (let i = 0; i < n; i++) { const zc = z0 + (i + 0.5) * L; P.add('hull', mat, box(t, h, L - 0.02, x, y - h / 2, zc, 0, 0, tilt)); boltRow(P, 'hull', [x + Math.sign(x) * t * 0.6, y - 0.06, zc - L * 0.4], [x + Math.sign(x) * t * 0.6, y - 0.06, zc + L * 0.4], 4, 0.016, 'x'); }
  P.add('hull', 'paint', box(t * 1.2, 0.05, z1 - z0, x, y + 0.01, (z0 + z1) / 2));
}
// slat (bar) armour cage: vertical frame on a plane
export function slatCage(P, part, x0, x1, y0, y1, z, nBars = 9) {
  for (const x of [x0, x1]) P.add(part, 'metal', box(0.04, y1 - y0, 0.04, x, (y0 + y1) / 2, z));
  for (const y of [y0, y1]) P.add(part, 'metal', box(Math.abs(x1 - x0), 0.04, 0.04, (x0 + x1) / 2, y, z));
  for (let i = 1; i < nBars; i++) { const x = x0 + (x1 - x0) * (i / nBars); P.add(part, 'metal', box(0.015, y1 - y0, 0.06, x, (y0 + y1) / 2, z)); }
}
// gun barrel profile helper: returns lathe geometry along +z from z=0 (mantlet face) to length
// opts: r0 (breech/root radius), r1 (muzzle radius), evac {z, r, len}, brake {type:'double'|'single'|'mono', r, len}, sleeve true (thermal sleeve bands), mrs
function removeBarrelCapAtZ(geometry,z) {
  const p=geometry.attributes.position,keep=[];
  for(let i=0;i<p.count;i+=3){
    const cap=Math.abs(p.getZ(i)-z)<1e-4&&Math.abs(p.getZ(i+1)-z)<1e-4&&Math.abs(p.getZ(i+2)-z)<1e-4;
    if(!cap)keep.push(i,i+1,i+2);
  }
  if(keep.length===p.count)return geometry;
  const out=new THREE.BufferGeometry();
  for(const [name,a] of Object.entries(geometry.attributes)){
    const arr=new Float32Array(keep.length*a.itemSize);
    for(let j=0;j<keep.length;j++)for(let k=0;k<a.itemSize;k++)arr[j*a.itemSize+k]=a.array[keep[j]*a.itemSize+k];
    out.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize,a.normalized));
  }
  out.computeBoundingBox();out.computeBoundingSphere();geometry.dispose();return out;
}
export function barrel(P, part, len, opts = {}) {
  const r0 = opts.r0 ?? 0.12, r1 = opts.r1 ?? 0.08; const pr = [[0.001, -0.25], [r0 * 1.2, -0.25], [r0 * 1.2, 0.15], [r0, 0.25]];
  const brakeLen = opts.brake ? opts.brake.len : 0; const end = len - brakeLen;
  const ev = opts.evac;
  if (ev) { pr.push([r0 * 0.92 + (r1 - r0 * 0.92) * (ev.z - ev.len / 2) / end, ev.z - ev.len / 2 - 0.04], [ev.r, ev.z - ev.len / 2 + 0.06], [ev.r, ev.z + ev.len / 2 - 0.1], [r0 * 0.9 + (r1 - r0 * 0.9) * (ev.z + ev.len / 2) / end, ev.z + ev.len / 2]); }
  pr.push([r1, end]);
  if (!opts.brake) pr.push([r1 * 1.08, len], [r1 * 0.72, len], [0.001, len]);
  else pr.push([r1 * 1.08, end + 0.01], [r1 * 0.72, end + 0.01], [0.001, end + 0.01]);
  P.add(part, opts.mat || 'paint', lathe(pr, 32));
  if(opts.brake){
    const key=part+'|'+(opts.mat||'paint'),list=P.b[key],last=list.length-1;
    list[last]=removeBarrelCapAtZ(list[last],end+0.01);
  }
  if (opts.sleeve) { const n = opts.sleeve; for (let i = 1; i < n; i++) { const z = 0.4 + (end - 0.6) * (i / n); if (ev && Math.abs(z - ev.z) < ev.len / 2 + 0.1) continue; const rr = r0 + (r1 - r0) * (z / end); P.add(part, 'metal', cylZ(rr * 1.18, 0.05, 16, 0, 0, z)); } }
  if (opts.brake) {
    const b = opts.brake; const z0 = end; const rb = b.r;
    if (b.type === 'double') {
      P.add(part, 'paint', lathe([[0.001, z0], [rb, z0], [rb, z0 + b.len * 0.35], [rb * 0.82, z0 + b.len * 0.35], [rb * 0.82, z0 + b.len * 0.55], [rb, z0 + b.len * 0.55], [rb, z0 + b.len], [rb * 0.72, z0 + b.len], [0.001, z0 + b.len]], 32));
      for (const f of [0.45, 0.8]) for (const side of [-1, 1]) P.add(part, 'dark', box(0.03, rb * 1.3, b.len * 0.18, side * rb * 0.98, 0, z0 + b.len * f));
    } else if (b.type === 'single') {
      const hole = Math.min(0.065, rb * 0.58), outerX = rb * 1.1, outerY = rb * 0.75; P.muzzleBoreRadius = Math.min(P.muzzleBoreRadius ?? Infinity, hole * 0.9);
      const barY = Math.max(0.018, outerY - hole), barX = Math.max(0.018, outerX - hole);
      P.add(part, 'paint', box(outerX * 2, barY, b.len, 0, hole + barY / 2, z0 + b.len / 2));
      P.add(part, 'paint', box(outerX * 2, barY, b.len, 0, -hole - barY / 2, z0 + b.len / 2));
      P.add(part, 'paint', box(barX, hole * 2, b.len, hole + barX / 2, 0, z0 + b.len / 2));
      P.add(part, 'paint', box(barX, hole * 2, b.len, -hole - barX / 2, 0, z0 + b.len / 2));
      for (const side of [-1, 1]) P.add(part, 'dark', box(0.02, rb * 1.1, b.len * 0.6, side * rb * 1.11, 0, z0 + b.len / 2));
    } else {
      const bore = Math.min(0.065, rb * 0.62);
      P.add(part, 'paint', lathe([[bore, z0], [rb, z0], [rb, z0 + b.len], [bore, z0 + b.len]], 32));
      for (const f of [0.25, 0.45, 0.65, 0.85]) for (const side of [-1, 1]) P.add(part, 'dark', box(0.035, 0.055, 0.08, side * rb * 0.9, 0, z0 + b.len * f));
    }
  }
  if (opts.mrs) { P.add(part, 'metal', box(0.07, 0.07, 0.1, 0, r1 * 1.4, len - 0.12)); }
}

// Convert the terminal face of each assembled gun into a real open muzzle.
// The inner liner and recessed dark chamber make the bore visible from front and
// oblique views; the outer cap triangles are removed rather than painted black.
export function hollowMuzzle(P, opts = {}) {
  const entries=Object.entries(P.b).filter(([key])=>key.startsWith('barrel|'));
  if(!entries.length)return null;
  const parts=entries.flatMap(([,list])=>list);
  if(!parts.length)return null;
  let muzzleZ=-Infinity;
  for(const g of parts){g.computeBoundingBox();muzzleZ=Math.max(muzzleZ,g.boundingBox.max.z);}
  let outer=0,removed=0;
  for(const [,list] of entries)for(let gi=0;gi<list.length;gi++){
    const g=list[gi],p=g.attributes.position,near=[];
    for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-muzzleZ)<1e-4)near.push(Math.hypot(p.getX(i),p.getY(i)));
    if(near.length)outer=Math.max(outer,...near);
    const keep=[];
    for(let i=0;i<p.count;i+=3){
      const cap=Math.abs(p.getZ(i)-muzzleZ)<1e-4&&Math.abs(p.getZ(i+1)-muzzleZ)<1e-4&&Math.abs(p.getZ(i+2)-muzzleZ)<1e-4;
      if(cap){removed++;continue;}
      keep.push(i,i+1,i+2);
    }
    if(keep.length!==p.count){
      const out=new THREE.BufferGeometry();
      for(const [name,a] of Object.entries(g.attributes)){
        const arr=new Float32Array(keep.length*a.itemSize);
        for(let j=0;j<keep.length;j++)for(let k=0;k<a.itemSize;k++)arr[j*a.itemSize+k]=a.array[keep[j]*a.itemSize+k];
        out.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize,a.normalized));
      }
      out.computeBoundingBox();out.computeBoundingSphere();
      list[gi]=out;
      g.dispose();
    }
  }
  if(!(outer>0.035))return {muzzleZ,outer,bore:0,removed};
  const bore=Math.max(0.028,Math.min(opts.boreRadius??P.muzzleBoreRadius??0.067,outer*0.68));
  const depth=Math.max(0.55,Math.min(0.85,outer*6));
  const wall=new THREE.CylinderGeometry(bore,bore,depth,32,1,true).rotateX(Math.PI/2);
  wall.translate(0,0,muzzleZ-depth/2);
  P.add('barrel','bore',wall);
  const chamber=new THREE.CircleGeometry(bore*0.97,32);
  chamber.translate(0,0,muzzleZ-depth+0.018);
  P.add('barrel','bore',chamber);
  const lip=Math.max(0.006,Math.min(0.012,(outer-bore)*0.3));
  const rim=new THREE.TorusGeometry((outer+bore)/2,lip,8,36);
  rim.translate(0,0,muzzleZ-lip);
  P.add('barrel','metal',rim);
  return {muzzleZ,outer,bore,depth,removed};
}

// road-wheel arm / hub pieces on the hull side between wheel and hull (torsion bar style)
export function suspensionArms(P, x, wheels, yHull, side, mat = 'metal') {
  for (const w of wheels) { const zx = w.z + 0.18 * side * 0; P.add('hull', mat, T(new THREE.BoxGeometry(0.08, 0.1, 0.42), x, (w.y + yHull) / 2, zx + 0.12, 0.6, 0, 0)); P.add('hull', mat, cylX(0.07, 0.14, 8, x - side * 0.04, yHull, zx + 0.3)); }
}
