// Shared geometry helpers for procedural tank models (1 unit = 1 m, +z = front, +y = up)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const V3 = THREE.Vector3;
export const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function T(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(new V3(x, y, z), _q, new V3(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
// Local X runs across the plate, Y runs up it, and Z points outwards.
export function glacis(y0, z0, y1, z1) {
  const length = Math.hypot(y1 - y0, z1 - z0);
  const up = [(y1 - y0) / length, (z1 - z0) / length];
  const pitch = Math.atan2(up[1], up[0]);
  const point = (x, u, depth = 0) => [x, y0 + u * up[0] - depth * up[1], z0 + u * up[1] + depth * up[0]];
  return { length, up, point, pitch, place: (geometry, x, u, depth = 0) => T(geometry, ...point(x, u, depth), pitch) };
}
// Keep thin plate, track and hardware shapes inexpensive; large cast fittings
// and equipment housings get genuinely radiused edges instead of sharp cubes.
export function box(w,h,d,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  w=Math.abs(w);h=Math.abs(h);d=Math.abs(d);
  const min=Math.min(w,h,d),max=Math.max(w,h,d);
  const g=min>=0.10 && max>=0.24
    ? new RoundedBoxGeometry(w,h,d,1,Math.min(0.028,min*0.12))
    : new THREE.BoxGeometry(w,h,d);
  return T(g,x,y,z,rx,ry,rz);
}
// Cast armor: custom loft between a series of horizontal sections.
// Indexed walls share vertices for continuous curvature; the roof remains a
// separate flat panel. The supplied outline controls front/rear asymmetry.
export function castLoft(poly,h,sx,sz,cz=0,y0=0){
  let p=poly.slice();
  let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];}
  if(area<0)p.reverse();
  const n=p.length,positions=[],uv=[],idx=[];
  const rings=[[0,0.92,0.92],[0.07,0.99,0.99],[0.22,1,1],[0.48,1+(sx-1)*0.32,1+(sz-1)*0.32],[0.72,1+(sx-1)*0.67,1+(sz-1)*0.67],[0.88,sx+0.035,sz+0.035],[0.97,sx+0.012,sz+0.012],[1,sx,sz]];
  for(let j=0;j<rings.length;j++){const [v,a,b]=rings[j];for(let i=0;i<n;i++){const [x,z]=p[i];positions.push(x*a,y0+v*h,cz+(z-cz)*b);uv.push(i/n,v);}}
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;idx.push(a,c,b,b,c,d);}
  for(const top of [false,true]){
    const ring=top?rings.length-1:0,offset=positions.length/3;
    const outline=[];
    for(let i=0;i<n;i++){const k=(ring*n+i)*3;const x=positions[k],z=positions[k+2];positions.push(x,positions[k+1],z);uv.push(x,z);outline.push(new THREE.Vector2(x,z));}
    for(let [a,b,c] of THREE.ShapeUtils.triangulateShape(outline,[])){
      const A=outline[a],B=outline[b],C=outline[c];
      const cross=(B.x-A.x)*(C.y-A.y)-(B.y-A.y)*(C.x-A.x);
      if((top&&cross>0)||(!top&&cross<0))[b,c]=[c,b];
      idx.push(offset+a,offset+b,offset+c);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();return g;
}
export const cylY = (r, h, seg, x, y, z, r2 = r) => T(new THREE.CylinderGeometry(r, r2, h, seg), x, y, z);
export const cylX = (r, len, seg, x, y, z, r2 = r) => T(new THREE.CylinderGeometry(r, r2, len, seg), x, y, z, 0, 0, Math.PI / 2);
export const cylZ = (r, len, seg, x, y, z, r2 = r, rx = 0) => T(new THREE.CylinderGeometry(r2, r, len, seg), x, y, z, Math.PI / 2 + rx, 0, 0);
// side profile [[z,y]...] extruded across x
export function sideExtrude(profile, width, x = 0, bevel = 0.02) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 });
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
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), Math.max(32,seg));
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
  add(part, mat, g) {
    const piece = clean(g);
    (this.b[part + '|' + mat] ||= []).push(piece);
    return piece;
  }
  merged() { const out = {}; for (const [k, list] of Object.entries(this.b)) { const [part, mat] = k.split('|'); (out[part] ||= {})[mat] = mergeGeometries(list); } return out; }
}

