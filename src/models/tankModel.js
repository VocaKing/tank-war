// Procedural, real-scale (1 unit = 1 m) tank models built from code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { camoTexture, trackTexture, decalTexture } from '../world/textures.js';
import { makeNoise2D, tileField, sampleField } from '../util.js';
import { trackCenterOffset } from '../game/vehicleDimensions.js';

import { V3, T, box, cylY, cylX, cylZ, lathe, clean } from './geom.js';
import { buildV2 } from './tanksV2.js';
import { ORIGINAL_TANK_BUILDERS as BUILDERS } from './originalTankModels.js';
import { buildSpecialist } from './specialistModels.js';
import { createMausModel, loadMausModel } from './mausModel.js';
import { buildExpansionFallback, expansionGunClearance, hasExpansionModel } from './expansionFallback.js';
import { createExpansionModel, loadExpansionModel } from './expansionModel.js';
import { createFleetModel, hasFleetModel, loadFleetModel } from './fleetModel.js';
import * as K from './kit.js';
import { gunMount, hullPitchFloor, MAX_RECOIL } from './gunClearance.js';
export { THREE };

// ---------- Materials ----------
let NOISE_TEX = null;
function noiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const S = 256; const d = new Uint8Array(S * S * 4); const n = makeNoise2D(77); const n2 = makeNoise2D(91);
  const N = 128; const f1 = tileField(n, N, 4, 5), f2 = tileField(n2, N, 12, 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v1 = Math.min(1, Math.max(0, sampleField(f1, N, x / S, y / S) * 1.2 + 0.5)); const v2 = Math.min(1, Math.max(0, sampleField(f2, N, x / S, y / S) * 1.2 + 0.5));
    const hash = Math.imul((x + y * S) ^ 0x13941, 0x45d9f3b);
    const v3 = ((hash ^ (hash >>> 16)) & 255) / 255;
    const i = (y * S + x) * 4; d[i] = v1 * 255; d[i + 1] = v2 * 255; d[i + 2] = v3 * 255; d[i + 3] = 255;
  }
  NOISE_TEX = new THREE.DataTexture(d, S, S); NOISE_TEX.wrapS = NOISE_TEX.wrapT = THREE.RepeatWrapping; NOISE_TEX.magFilter = THREE.LinearFilter; NOISE_TEX.minFilter = THREE.LinearMipmapLinearFilter; NOISE_TEX.generateMipmaps = true; NOISE_TEX.needsUpdate = true;
  return NOISE_TEX;
}
// Triplanar camo paint with procedural cast/rolled-plate surface relief, mud build-up near the running gear,
// dust on upward faces and roughness variation. yOff converts part-local y to hull height (turret/gun parts).
function paintMaterial(paint, seed, yOff = 0, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map: camoTexture(paint, seed), roughness: 0.74, metalness: 0.2 });
  const U = {
    uNoise: { value: noiseTexture() }, uYOff: { value: yOff }, uDirtY: { value: opts.dirtY ?? 0.9 },
    uCast: { value: opts.cast ?? 0.5 }, uWeather: { value: opts.weather ?? 1 },
    uMud: { value: new THREE.Color(opts.mud || '#4a3d2c') }, uDust: { value: new THREE.Color(opts.dust || '#8f8166') },
  };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObjPos; varying vec3 vObjN; uniform sampler2D uNoise; uniform float uYOff, uDirtY, uCast, uWeather; uniform vec3 uMud, uDust;
      vec3 triN(vec3 p, vec3 bw) { return texture2D(uNoise, p.zy).rgb * bw.x + texture2D(uNoise, p.xz).rgb * bw.y + texture2D(uNoise, p.xy).rgb * bw.z; }`)
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(normalize(vObjN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        vec3 pp = vObjPos * 0.22;
        vec4 tc = texture2D(map, pp.zy) * bw.x + texture2D(map, pp.xz) * bw.y + texture2D(map, pp.xy) * bw.z;
        diffuseColor *= tc;
        vec3 nA = triN(vObjPos * 0.35, bw); vec3 nB = triN(vObjPos * 1.6, bw);
        float yL = vObjPos.y + uYOff;
        float mud = 1.0 - smoothstep(uDirtY - 0.55, uDirtY, yL + (nA.r - 0.5) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMud * (0.75 + 0.5 * nB.g), clamp(mud * 0.85, 0.0, 0.85) * uWeather);
        float up = smoothstep(0.55, 0.95, normalize(vObjN).y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust, up * (0.06 + 0.16 * nA.g) * uWeather);
        diffuseColor.rgb *= 1.0 + (nA.r - 0.5) * 0.2 * uWeather;
        if (normalize(vObjN).y < -0.4) diffuseColor.rgb *= 0.72;
        // v4 weathering: vertical rain/oil streaks on side faces, paint chipping (bare primer/steel) and soot near the top
        vec3 nN = normalize(vObjN); float side = 1.0 - abs(nN.y);
        vec2 dripUV = vec2((vObjPos.x - vObjPos.z) * 1.42, yL * 0.16);
        vec3 streak = texture2D(uNoise, dripUV).rgb;
        float rain = side * smoothstep(0.52, 0.74, streak.g) * (1.0 - mud);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.53, 0.48, 0.39), rain * 0.34 * uWeather);
        vec3 fine = triN(vObjPos * 5.5, bw);
        float wear = smoothstep(0.64, 0.80, fine.b * 0.57 + nB.g * 0.43) * (1.0 - mud * 0.80);
        vec3 primer = mix(diffuseColor.rgb * vec3(0.61, 0.51, 0.42), vec3(0.24, 0.22, 0.19), wear);
        diffuseColor.rgb = mix(diffuseColor.rgb, primer, wear * 0.82 * uWeather);
        float vRough = mix(0.98, 0.85 + 0.31 * nB.r + mud * 0.20 - wear * 0.46 + rain * 0.16, uWeather);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor * vRough, 0.3, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float hgt = nA.r * uCast + nB.b * 0.12 + nB.r * 0.25 + fine.g * 0.068 - wear * 0.044;
          vec2 dHdxy = vec2(dFdx(hgt), dFdy(hgt)) * (0.45 + 0.45 * uWeather);
          vec3 vSigmaX = dFdx(-vViewPosition), vSigmaY = dFdy(-vViewPosition);
          vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); normal = normalize(abs(fDet) * normal - vGrad * 0.02);
        }`);
  };
  m.customProgramCacheKey = () => 'tank-paint';
  return m;
}
const MATS = {};
function sharedMats() {
  if (MATS.metal) return MATS;
  MATS.metal = new THREE.MeshStandardMaterial({ color: 0x3b3a37, roughness: 0.55, metalness: 0.65 });
  MATS.rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1b, roughness: 0.95, metalness: 0.0 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.6, metalness: 0.3 });
  MATS.bore = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.96, metalness: 0.08, side: THREE.DoubleSide });
  MATS.glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.08, metalness: 0.9, emissive: 0x050a10 });
  MATS.lens = new THREE.MeshStandardMaterial({ color: 0xb3aca0, roughness: 0.34, metalness: 0.47 });
  MATS.wood = new THREE.MeshStandardMaterial({ color: 0x6a5134, roughness: 0.9 });
  MATS.canvas = new THREE.MeshStandardMaterial({ color: 0x5e5a43, roughness: 1.0 });
  MATS.burnt = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.95, metalness: 0.15 });
  MATS.track = new THREE.MeshStandardMaterial({ color: 0x55514b, roughness: 0.62, metalness: 0.6 });
  MATS.steel = new THREE.MeshStandardMaterial({ color: 0x6a6760, roughness: 0.4, metalness: 0.85 });
  MATS.tail = new THREE.MeshStandardMaterial({ color: 0x7a0c08, roughness: 0.2, metalness: 0.1, emissive: 0x2a0200 });
  MATS.amber = new THREE.MeshStandardMaterial({ color: 0x9a5a08, roughness: 0.2, metalness: 0.1, emissive: 0x2a1400 });
  return MATS;
}
export function burntMaterial() { return sharedMats().burnt; }

// ---------- Running gear ----------
// Unit road wheel (radius 1, width 1 along x); most builders use paired wheel discs, while 'single' is for German interleaved wheels.
// type: 'disc' (dished steel disc), 'spoked' (cast spokes), 'modern' (aluminium, lightening holes), 'steel' (all-steel, no rubber)
function wheelGeometry(paintHex, type = 'disc', id = '') {
  const col = new THREE.Color(paintHex); const rub = new THREE.Color(0x181817); const hub = new THREE.Color(paintHex).multiplyScalar(0.72); const dark = new THREE.Color(0x0e0e0e); const metal = new THREE.Color(0x4a4843);
  const parts = [];
  const tyre = type === 'steel' ? metal : rub;
  const paintC = (g, c) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const lx = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg).rotateZ(-Math.PI / 2);
  // Single-disc road wheels for interleaved German running gear. Unlike the
  // paired road-wheel units used by Soviet and many post-war tanks, Tiger I
  // and Panther each place individual wheels in staggered rows across the track.
  if (type === 'single') {
    paintC(cylX(1.0, 0.42, 32, 0, 0, 0), tyre);
    if (id !== 'tiger') paintC(cylX(0.78, 0.43, 32, 0, 0, 0), col);
    for (const side of [-1, 1]) {
      if (id === 'tiger') {
        const dish = lx([[0.86, 0.211], [0.82, 0.239], [0.78, 0.222], [0.72, 0.213], [0.38, 0.213], [0.33, 0.234], [0, 0.235]]);
        paintC(dish.rotateY(side < 0 ? Math.PI : 0), hub);
      }
      paintC(cylX(0.27, 0.055, 18, side * 0.22, 0, 0), hub);
      paintC(cylX(0.13, 0.06, 14, side * 0.255, 0, 0), col);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        paintC(cylX(0.025, 0.035, 6, side * 0.26, Math.cos(a) * 0.56, Math.sin(a) * 0.56), metal);
      }
    }
    return mergeGeometries(parts);
  }
  const s = 1; const m = (pts) => pts;
  paintC(lx(m([[0.86, 0.06], [0.97, 0.07], [1.0, 0.12], [1.0, 0.42], [0.97, 0.47], [0.86, 0.48]])), tyre);
  // Distinct raised rims and inset web. Spoked wheels use an open annular web.
  paintC(lx([[0.86,0.48],[0.82,0.50],[0.76,0.50],[0.73,0.44],[0.70,0.43]]),col);
  if(type==='spoked'){
    paintC(lx([[0.70,0.43],[0.70,0.18],[0.78,0.18]]),col);
    paintC(lx([[0,0.50],[0.20,0.50],[0.26,0.43],[0.26,0.13],[0,0.13]]),hub);
  }else{
    const inset=type==='modern'?0.62:0.50;
    paintC(lx([[0.70,0.43],[inset,0.34],[0.29,0.34],[0.24,0.43],[0.20,0.50],[0,0.50]]),col);
    paintC(lx([[0.67,0.437],[0.65,0.447],[0.63,0.437]]),col);
  }
  if(type!=='spoked') paintC(lx([[0,0.06],[0.86,0.06]]),hub);
  paintC(cylX(0.17, 0.08, 10, s * 0.52, 0, 0), hub); // hub cap
  const nuts=({sherman:8,tiger:8,panther:8,t34:6,is2:6,pershing:8,centurion:8,leo1:8,leo2a6:8,t72:8,t90m:8,m1a2:8,chally2:8,merkava4:8,type99a:8})[id]||6;
  for(let i=0;i<nuts;i++){const a=i/nuts*Math.PI*2;paintC(cylX(0.03,0.045,6,0.48,Math.cos(a)*0.27,Math.sin(a)*0.27),metal);} // wheel nuts
  if (type === 'modern') for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; paintC(cylX(0.09, 0.03, 8, s * 0.43, Math.cos(a) * 0.55, Math.sin(a) * 0.55), dark); }
  if(type==='spoked') for(let i=0;i<6;i++){const a=i/6*Math.PI*2;paintC(T(new THREE.BoxGeometry(0.20,0.52,0.13),0.35,Math.cos(a)*0.48,Math.sin(a)*0.48,a,0,0),col);}
  if (type === 'disc' || type === 'steel') for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; paintC(cylX(0.024, 0.03, 5, s * 0.47, Math.cos(a) * 0.72, Math.sin(a) * 0.72), metal); }
  if (id === 't34') for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 2 * Math.PI;
    paintC(box(0.064, 0.20, 0.063, 0.37, Math.cos(a) * 0.56, Math.sin(a) * 0.56, a), col);
  }
  // IS-2 cast road wheels have a distinctive star-indented face rather than a plain disc.
  if (id === 'is2') for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    paintC(box(0.028, 0.18, 0.052, 0.48, Math.cos(a) * 0.56, Math.sin(a) * 0.56, a), dark);
  }
  // mirror for the inner tyre
  const half = parts.length; const mir = new THREE.Matrix4().makeScale(-1, 1, 1);
  for (let k = 0; k < half; k++) { const g = parts[k].clone(); g.applyMatrix4(mir); const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color; for (let t = 0; t < p.count; t += 3) for (const a of [p, n, c]) for (let q = 0; q < a.itemSize; q++) { const i0 = t * a.itemSize + q, i2 = (t + 2) * a.itemSize + q; const tmp = a.array[i0]; a.array[i0] = a.array[i2]; a.array[i2] = tmp; } parts.push(g); }
  return mergeGeometries(parts);
}
function wheelGeometryLo(paintHex) {
  const col = new THREE.Color(paintHex), rub = new THREE.Color(0x181817); const parts = [];
  const add = (g, c) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  add(new THREE.CylinderGeometry(1, 1, 0.96, 12, 1, true).rotateZ(Math.PI / 2), rub); add(cylX(0.86, 1.0, 12, 0, 0, 0), col);
  return mergeGeometries(parts);
}
function sprocketGeometry(paintHex, id = '') {
  const col = new THREE.Color(paintHex).multiplyScalar(0.85); const parts = [];
  const add = (g) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  if (id === 'is2' || id === 'm6a1') {
    // Distinct 14-tooth drive rims on the rear sprocket.
    add(cylX(0.74, 0.72, 24, 0, 0, 0));
    add(cylX(0.38, 1.00, 16, 0, 0, 0));
    for (const side of [-1, 1]) {
      add(cylX(0.84, 0.10, 28, side * 0.34, 0, 0));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        add(T(new THREE.BoxGeometry(0.12, 0.22, 0.18), side * 0.34, Math.cos(a) * 0.94, Math.sin(a) * 0.94, a, 0, 0));
      }
    }
    return mergeGeometries(parts);
  }
  add(cylX(0.9, 1.0, 20, 0, 0, 0)); add(cylX(0.4, 1.3, 10, 0, 0, 0)); add(cylX(0.62, 1.1, 18, 0, 0, 0));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; add(cylX(0.05, 1.36, 6, 0, Math.cos(a) * 0.28, Math.sin(a) * 0.28)); }
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
  return { geo: g, length: total, loop, nrm };
}

export const TANK_BUILDERS = BUILDERS;

// ---------- Template + instance ----------
const templates = {};
// one track link (shoe + grouser + guide horns + pins + optional rubber pad); outer side is -y (see placement)
function linkGeometry(w, pitch, th, id) {
  const rubberPad=['sherman','m6a1','pershing','centurion','leo1','leo2a6','m1a2','chally2','merkava4','type99a'].includes(id);
  const eastern=['t34','is2','t72','t90m'].includes(id);
  const parts = [];
  const add = (g, c) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const steel = new THREE.Color(0x5b5750), dark = new THREE.Color(0x2c2a27), rub = new THREE.Color(0x151514);
  const shiny = new THREE.Color(id === 't34' || id === 'tiger' ? 0x645e54 : 0x8a857c);
  if (id === 'm6a1') {
    for (const side of [-1, 1]) {
      add(box(w * 0.47, th * 0.6, pitch * 0.82, side * w * 0.26, 0, 0), steel);
      add(box(w * 0.43, th * 0.50, pitch * 0.16, side * w * 0.26, -th * 0.45, 0), shiny);
    }
  } else if (id === 't34') {
    add(box(w, th * 0.6, pitch * 0.86, 0, 0, 0), steel);
    for (const side of [-1, 1]) {
      add(box(w * 0.42, th * 0.47, pitch * 0.14, side * w * 0.25, -th * 0.43, 0, 0, side * 0.22), shiny);
      for (const x of [0.18, 0.37]) add(box(w * 0.063, th * 0.4, pitch * 0.68, side * w * x, -th * 0.39, 0), shiny);
    }
  } else {
    add(box(w, th * 0.6, pitch * 0.82, 0, 0, 0), steel);
    add(box(w * 0.94, th * 0.5, pitch * 0.18, 0, -th * 0.45, 0), shiny); // grouser (outer, -y)
  }
  if (rubberPad) for (const s of [-1,1]) {
    add(box(w*0.38,th*0.55,pitch*0.62,s*w*0.25,-th*0.45,0),rub);
    add(box(w*0.39,th*0.18,pitch*0.68,s*w*0.25,-th*0.22,0),steel);
  } else if (id !== 't34') {
    // Raised steel chevrons/crossbars rather than rubber pads.
    for(const s of [-1,1]) add(T(new THREE.BoxGeometry(w*0.43,th*0.40,pitch*0.13),s*w*0.24,-th*0.40,-pitch*0.09,0,s*(eastern?0.28:0.13),0),shiny);
  }
  for(const x of eastern?[0]:[-w*0.08,w*0.08]){
    const horn=new THREE.CylinderGeometry(0.022,0.05,th*1.5,4);
    add(T(horn,x,th*0.9,0,0,Math.PI/4,0),steel);
  }
  for (const z of [-1, 1]) add(cylX(th * 0.32, w * 1.04, 6, 0, 0, z * pitch * 0.43), dark); // pins / end connectors
  for (const s of [-1, 1]) add(box(0.04, th * 0.7, pitch * 0.25, s * w * 0.52, 0, pitch * 0.42), dark);
  return mergeGeometries(parts);
}
// v4 finishing pass for every tank: rear fender tail-light clusters, rubber mud flaps, fender support brackets,
// track-tension adjuster at the idler and tow shackles on the rear plate.
function finishDetails(P, d, b, spec) {
  const hl = d.L / 2; const circ = [...b.wheels, ...b.sprockets, ...b.idlers, ...b.rollers];
  const fy = Math.max(...circ.map((c) => c.y + c.r)) + 0.075; const tx = trackCenterOffset(d); const rearZ = Math.min(...circ.map((c) => c.z - c.r)) - 0.1;
  const modern = spec.era !== 'WWII'; const sponson = ['sherman', 'tiger', 't34'].includes(spec.id);
  for (const s of [-1, 1]) {
    // tail light cluster on the rear fender end
    if (!sponson) {
    const lx = s * (d.W / 2 - 0.16), lz = -hl + 0.16;
    P.add('hull', 'paint', box(0.2, 0.12, 0.1, lx, fy + 0.07, lz)); P.add('hull', 'tail', box(0.07, 0.06, 0.02, lx - s * 0.045, fy + 0.08, lz - 0.055)); P.add('hull', 'amber', box(0.07, 0.06, 0.02, lx + s * 0.045, fy + 0.08, lz - 0.055));
    P.add('hull', 'metal', box(0.24, 0.02, 0.05, lx, fy + 0.14, lz - 0.03));
    }
    // rubber mud flap hanging from the fender behind the idler
    P.add('hull', 'rubber', box(d.trackW * 0.92, 0.32, 0.018, s * tx, fy - 0.17, Math.min(rearZ, -hl + 0.02) - 0.01, 0.12, 0));
    // fender support brackets
    if (!sponson) for (const fz of [-hl * 0.55, 0, hl * 0.55]) P.add('hull', 'paint', box(0.03, 0.08, 0.05, s * (d.W / 2 - 0.02), fy - 0.06, fz));
    // track tension adjuster at the idler
    for (const idl of b.idlers) { P.add('hull', 'metal', cylZ(0.035, 0.3, 8, s * (tx - d.trackW * 0.5 - 0.05), idl.y + 0.02, idl.z + 0.26)); P.add('hull', 'metal', T(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6), s * (tx - d.trackW * 0.5 - 0.05), idl.y + 0.02, idl.z + 0.43, Math.PI / 2, 0, 0)); }
    // rear tow shackles
    P.add('hull', 'metal', T(new THREE.TorusGeometry(0.07, 0.022, 6, 12), s * (d.W * 0.26), d.clearance + 0.32, -hl + 0.04, 0, 0, Math.PI / 2));
  }
  if (modern) { // rear infantry phone box + towing pintle
    P.add('hull', 'paint', box(0.22, 0.26, 0.12, d.W * 0.36, d.clearance + 0.62, -hl + 0.02)); P.add('hull', 'dark', box(0.16, 0.18, 0.01, d.W * 0.36, d.clearance + 0.62, -hl - 0.045));
  }
  P.add('hull', 'metal', box(0.16, 0.12, 0.18, 0, d.clearance + 0.3, -hl + 0.02)); P.add('hull', 'metal', cylY(0.03, 0.18, 8, 0, d.clearance + 0.3, -hl - 0.06));
}
// Fine roof fittings: sample actual painted surfaces so details follow each hull form.
function refineRoofDetails(P, spec) {
  if (spec.id === 'tiger') return;
  const modern = ['m1a2','chally2','leo2a6','merkava4','type99a','t90m','t72'].includes(spec.id);
  const rounded = ['sherman','t34','is2','pershing','centurion','t72','t90m'].includes(spec.id);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0,-1,0);
  for (const part of ['hull','turret']) {
    const surfaces = P.b[part + '|paint'];
    if (!surfaces || !surfaces.length) continue;
    const g = mergeGeometries(surfaces);
    if (!g) continue;
    g.computeBoundingBox();
    const bounds = g.boundingBox;
    const mat = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(g,mat);
    const width = bounds.max.x - bounds.min.x, length = bounds.max.z - bounds.min.z;
    const roof = (x,z) => {
      ray.set(new THREE.Vector3(x,bounds.max.y+1,z),down);
      const hit = ray.intersectObject(mesh,false)[0];
      return hit && hit.face && hit.face.normal.y > 0.8 ? hit.point.y : null;
    };
    // Low-profile fasteners along deck or turret roof edges, adapted to actual surfaces.
    for (const side of [-1,1]) {
      const x = (bounds.min.x+bounds.max.x)/2 + side*width*(part==='hull'?0.34:rounded?0.23:0.32);
      const count = part==='hull' ? (modern?8:5) : (modern?5:3);
      for(let i=0;i<count;i++){
        const z=bounds.min.z+length*(0.20+0.60*(i+0.5)/count);
        const y=roof(x,z);
        if(y===null) continue;
        const radius=modern?0.019:0.024;
        P.add(part,'paint',cylY(radius*1.4,0.012,8,x,y+0.006,z));
        P.add(part,'metal',cylY(radius,0.014,6,x,y+0.016,z));
      }
    }
    g.dispose(); mat.dispose();
  }
}
function getTemplate(spec) {
  if (templates[spec.id]) return templates[spec.id];
  const d = spec.dims;
  const expansion = hasExpansionModel(spec.id);
  const specialist = hasFleetModel(spec.id) || spec.conceptFleet || spec.dozer || spec.secondary || spec.rearDriver || spec.amphibious;
  const builder = expansion ? buildExpansionFallback : specialist ? buildSpecialist : BUILDERS[spec.id] || buildV2;
  const b = builder(d, spec);
  if (!expansion && !BUILDERS[spec.id]) {
    finishDetails(b.P, d, b, spec);
    refineRoofDetails(b.P, spec);
  }
  b.muzzleInfo = K.hollowMuzzle(b.P);
  gunMount(b.P, b, spec, lathe);
  const gunPitchFloor = expansion ? expansionGunClearance(spec) : (yaw, min, max) => hullPitchFloor(b, yaw, min, max);
  const mats = sharedMats();
  const seed = [...spec.id].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 7);
  const dirtY = d.clearance + 0.75;
  const appearance = b.paint ? { ...spec.paint, ...b.paint } : spec.paint;
  const opts = { dirtY, cast: b.cast ?? 0.5, weather: b.weather, mud: appearance.mud, dust: appearance.dust };
  const paint = paintMaterial(appearance, seed, 0, opts);
  const paintT = paintMaterial(appearance, seed, b.turretPos[1], { ...opts, cast: b.castTurret ?? opts.cast });
  const paintG = paintMaterial(appearance, seed, b.turretPos[1] + b.gunPos[1], { ...opts, cast: 0.15 });
  const geo = b.P.merged();
  const attachments = {};
  if (spec.secondary) {
    attachments.secondary = cylZ(0.041, spec.secondary.length, 14, 0, 0, spec.secondary.length / 2, 0.068);
  }
  if (spec.dozer) {
    const width = d.W;
    attachments.blade = mergeGeometries([
      box(width + 0.34, 0.81, 0.23), box(width + 0.39, 0.14, 0.36, 0, -0.36, 0.08),
      ...[-1, 1].flatMap(side => [
        box(0.13, 0.79, 0.54, side * width * 0.47, 0, 0.05, 0, side * -0.23),
        box(0.16, 0.16, 0.86, side * width * 0.32, -0.13, -0.37),
      ]),
    ]);
  }
  if (spec.amphibious) attachments.trim = box(d.W * 0.82, 0.07, 0.78, 0, 0, 0.36);
  const trackCircles = [...b.wheels.map((w) => ({ z: w.z, y: w.y, r: w.r })), ...b.sprockets, ...b.idlers, ...b.rollers.filter((r) => !r.free)];
  const pitch = d.trackPitch || b.trackPitch || (spec.era === 'WWII' ? 0.15 : 0.18);
  const track = trackGeometry(trackCircles, d.trackW, 0.075, pitch);
  const wheelGeo = wheelGeometry(appearance.base, b.wheelType || (b.wheels[0].spoked ? 'spoked' : spec.era === 'WWII' ? 'disc' : 'modern'), spec.id);
  const sprocketGeo = sprocketGeometry(appearance.base, spec.id);
  const wheelGeoLo = wheelGeometryLo(appearance.base);
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.25 });
  const nLinks = Math.round(track.length / pitch);
  const linkGeo = linkGeometry(d.trackW, track.length / nLinks, 0.06, spec.id);
  const linkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.45 });
  templates[spec.id] = { b, geo, paint, paintT, paintG, mats, track, wheelGeo, wheelGeoLo, sprocketGeo, wheelMat, linkGeo, linkMat, nLinks, pitch, attachments, gunPitchFloor };
  return templates[spec.id];
}

export function hasDetailedTankModel(id) {
  return id === 'mauseng' || hasExpansionModel(id) || hasFleetModel(id);
}

export function loadDetailedTankModel(spec) {
  if (hasFleetModel(spec.id)) return loadFleetModel(spec);
  return spec.id === 'mauseng' ? loadMausModel() : loadExpansionModel(spec);
}

export function createTankModel(spec, opts = {}) {
  const fleet = createFleetModel(spec, opts);
  if (fleet) return fleet;
  if (spec.id === 'mauseng') {
    const imported = createMausModel(!!opts.links);
    if (imported) {
      imported.maxRecoil = MAX_RECOIL;
      imported.gunPitchFloor = getTemplate(spec).gunPitchFloor;
      return imported;
    }
  }
  if (hasExpansionModel(spec.id)) {
    const imported = createExpansionModel(spec, !!opts.links);
    if (imported) return imported;
  }
  const tpl = getTemplate(spec); const d = spec.dims; const { b, geo, mats } = tpl;
  const root = new THREE.Group(); root.name = spec.id;
  const body = new THREE.Group(); root.add(body); // body receives pitch/roll
  const meshes = [];
  const mk = (g, k, parent, paintMat) => {
    // Fittings can share the armor finish and keep their own surface classification.
    const material = k === 'paint' || k === 'paintDetail' ? paintMat : mats[k];
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.matKey = k;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  for (const [k, g] of Object.entries(geo.hull)) mk(g, k, body, tpl.paint);
  const turret = new THREE.Group(); turret.position.set(...b.turretPos); body.add(turret);
  for (const [k, g] of Object.entries(geo.turret)) mk(g, k, turret, tpl.paintT);
  const gun = new THREE.Group(); gun.position.set(...b.gunPos); turret.add(gun);
  for (const [k, g] of Object.entries(geo.gun || {})) mk(g, k, gun, tpl.paintG);
  const barrel = new THREE.Group(); barrel.name='recoiling-barrel'; gun.add(barrel);
  for (const [k,g] of Object.entries(geo.barrel || {})) mk(g,k,barrel,tpl.paintG);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, b.barrelLength); barrel.add(muzzle);
  let secondaryGun, secondaryMuzzle, blade, trim;
  if (spec.secondary) {
    secondaryGun = new THREE.Group();
    secondaryGun.position.copy(gun.position);
    secondaryGun.position.x += spec.secondary.offset;
    turret.add(secondaryGun);
    mk(tpl.attachments.secondary, 'metal', secondaryGun);
    secondaryMuzzle = new THREE.Object3D();
    secondaryMuzzle.position.z = spec.secondary.length;
    secondaryGun.add(secondaryMuzzle);
  }
  if (spec.dozer) {
    blade = mk(tpl.attachments.blade, 'metal', body);
    blade.position.set(0, 1.22, d.L / 2 + 0.51);
    blade.rotation.x = -0.35;
  }
  if (spec.amphibious) {
    trim = mk(tpl.attachments.trim, 'paint', body, tpl.paint);
    trim.position.set(0, d.hullH * 0.71, d.L * 0.37);
    trim.rotation.x = 0.45;
  }
  const sight = new THREE.Object3D(); sight.position.set(0.35, 0.25, 0.2); gun.add(sight);
  // tracks: textured ribbon (LOD far) + individual instanced links (LOD near)
  const trackX = trackCenterOffset(d);
  const tracks = [], links = [], trackTex = [];
  for (const s of [-1, 1]) {
    const tex = trackTexture().clone();
    const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.55, color: 0x9a948c, side: THREE.DoubleSide });
    const m = new THREE.Mesh(tpl.track.geo, tm); m.position.x = s * trackX; m.userData.armorTrack = true; m.castShadow = true; m.receiveShadow = true; body.add(m); tracks.push(m); meshes.push(m); trackTex.push(tex);
    const li = new THREE.InstancedMesh(tpl.linkGeo, tpl.linkMat, tpl.nLinks); li.position.x = m.position.x; li.castShadow = true; li.receiveShadow = true; li.visible = false; li.frustumCulled = false; body.add(li); links.push(li); meshes.push(li);
  }
  // wheels: instanced (road wheels + idlers + return rollers) and sprockets
  const wl = [];
  for (const s of [-1, 1]) {
    for (const w of b.wheels) wl.push({ x: s * (trackX + (w.xo || 0)), y: w.y, z: w.z, r: w.r, w: w.w ?? d.trackW * 0.8, side: s });
    for (const w of b.idlers) wl.push({ x: s * trackX, y: w.y, z: w.z, r: w.r, w: d.trackW * 0.6, side: s });
    for (const w of b.rollers) wl.push({ x: s * trackX, y: w.y, z: w.z, r: w.r, w: d.trackW * 0.5, side: s });
  }
  const wheels = new THREE.InstancedMesh(tpl.wheelGeoLo, tpl.wheelMat, wl.length); wheels.castShadow = true; wheels.receiveShadow = true; body.add(wheels); meshes.push(wheels);
  const sl = []; for (const s of [-1, 1]) for (const w of b.sprockets) sl.push({ x: s * trackX, y: w.y, z: w.z, r: w.r, w: d.trackW * 0.7, side: s });
  const sprockets = new THREE.InstancedMesh(tpl.sprocketGeo, tpl.wheelMat, sl.length); sprockets.castShadow = true; body.add(sprockets); meshes.push(sprockets);
  // decals
  for (const dc of b.decals) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dc.s, dc.s), new THREE.MeshStandardMaterial({ map: decalTexture(dc.kind, dc.text), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.position.set(...dc.pos); m.rotation.set(dc.rx ?? 0, dc.ry, 0, 'YXZ'); (dc.part === 'hull' ? body : turret).add(m); m.userData.decal = true; meshes.push(m);
  }
  const model = { root, body, turret, gun, barrel, muzzle, sight, secondaryGun, secondaryMuzzle, blade, trim, gunClearance:b.gunClearance, gunMountNoCollar:!!b.gunMountNoCollar, roadWheelStationsPerSide:b.wheels.length, roadWheelDiscsPerSide:b.wheels.length * (b.wheelType === 'single' ? 1 : 2), roadWheelDiameter:b.roadWheelDiameter ?? (b.wheels[0]?.r ?? 0) * 2, frontIdlerDiameter:b.frontIdlerDiameter, driveSprocketTeethPerSide:b.driveSprocketTeeth, auxiliaryFuelTanks:b.auxiliaryFuelTanks, headlights:b.headlights, rearDTMountX:b.rearDTMountX, roadWheelStarIndentations:b.roadWheelStarIndentations, turretLeftWallAngleFromVertical:b.turretLeftWallAngleFromVertical, turretRightWallAngleFromVertical:b.turretRightWallAngleFromVertical, trackLinksPerSide:tpl.nLinks, glacisAngleFromVertical:b.glacisAngleFromVertical, idlersPerSide:b.idlers.length, returnRollersPerSide:b.rollers.length, driveSprocketsPerSide:b.sprockets.length, muzzleInfo:b.muzzleInfo, gunPitchFloor:tpl.gunPitchFloor, maxRecoil:MAX_RECOIL, tracks, trackTex, links, linksOn: false, loop: tpl.track.loop, loopLen: tpl.track.length, nLinks: tpl.nLinks, pitch: tpl.pitch, wheelGeo: tpl.wheelGeo, wheelGeoLo: tpl.wheelGeoLo, wheels, sprockets, wheelList: wl, sprocketList: sl, meshes, trackLength: tpl.track.length, spin: 0, trackOffset: [0, 0] };
  updateRunningGear(model, 0, 0);
  if (opts.links) setTrackLOD(model, true);
  return model;
}
const _mat = new THREE.Matrix4(), _pos = new V3(), _scl = new V3(), _qq = new THREE.Quaternion(), _eu = new THREE.Euler();
// switch between individual links (near) and the scrolling textured ribbon (far)
export function setTrackLOD(model, near) {
  if (model.linksOn === near) return; model.linksOn = near;
  if (model.setRunningGearNear) {
    model.setRunningGearNear(near);
    return;
  }
  for (let i = 0; i < 2; i++) { model.links[i].visible = near; model.tracks[i].visible = !near; }
  model.wheels.geometry = near ? model.wheelGeo : model.wheelGeoLo;
  if (near) updateLinks(model);
}
function updateLinks(model) {
  const loop = model.loop, N = loop.length, total = model.loopLen, step = total / N, n = model.nLinks, p = total / n;
  for (let side = 0; side < 2; side++) {
    const im = model.links[side]; const spin = side === 0 ? model.spinL || 0 : model.spinR || 0;
    for (let i = 0; i < n; i++) {
      let sd = (i * p - spin) % total; if (sd < 0) sd += total;
      const k = Math.floor(sd / step) % N, f = sd / step - Math.floor(sd / step); const a = loop[k], b = loop[(k + 1) % N];
      const z = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; const tz = b[0] - a[0], ty = b[1] - a[1];
      _mat.makeRotationX(Math.atan2(-ty, tz)); _mat.setPosition(0, y, z); im.setMatrixAt(i, _mat);
    }
    im.instanceMatrix.needsUpdate = true;
  }
}
// distL / distR: distance travelled by each track this frame (m)
export function updateRunningGear(model, distL, distR) {
  if (model.moveRunningGear) {
    model.moveRunningGear(distL, distR);
    return;
  }
  const tp = model.pitch || 0.17; model.trackOffset[0] -= distL / tp; model.trackOffset[1] -= distR / tp;
  model.trackTex[0].offset.x = model.trackOffset[0]; model.trackTex[1].offset.x = model.trackOffset[1];
  model.spinL = (model.spinL || 0) + distL; model.spinR = (model.spinR || 0) + distR;
  const set = (im, list) => { list.forEach((w, i) => { const dist = w.side < 0 ? model.spinL : model.spinR; _eu.set(dist / w.r, 0, 0); _qq.setFromEuler(_eu); _pos.set(w.x, w.y, w.z); _scl.set(w.w, w.r, w.r); _mat.compose(_pos, _qq, _scl); im.setMatrixAt(i, _mat); }); im.instanceMatrix.needsUpdate = true; };
  set(model.wheels, model.wheelList); set(model.sprockets, model.sprocketList);
  if (model.linksOn && (distL !== 0 || distR !== 0)) updateLinks(model);
}
export function burnModel(model) {
  const b = burntMaterial();
  for (const m of model.meshes) { if (m.userData.decal) { m.visible = false; continue; } m.material = b; }
}
