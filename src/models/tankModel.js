// Procedural, real-scale (1 unit = 1 m) tank models built from code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { trackTexture, decalTexture } from '../world/textures.js';
import { tankCamoTexture as camoTexture } from './paint.js';
import { DEG, makeNoise2D, tileField, sampleField, RNG } from '../util.js';

import { V3, T, box, cylY, cylX, cylZ, sideExtrude, topExtrude, flipWinding, taper, lathe, superEllipse, clean, Parts } from './geom.js';
import { buildV2 } from './tanksV2.js';
import * as K from './kit.js';
import { TANKS } from '../game/tankData.js';

// ---------- Materials ----------
let NOISE_TEX = null;
function noiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const S = 256; const d = new Uint8Array(S * S * 4); const n = makeNoise2D(77); const n2 = makeNoise2D(91);
  const N = 128; const f1 = tileField(n, N, 4, 5), f2 = tileField(n2, N, 12, 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v1 = Math.min(1, Math.max(0, sampleField(f1, N, x / S, y / S) * 1.2 + 0.5)); const v2 = Math.min(1, Math.max(0, sampleField(f2, N, x / S, y / S) * 1.2 + 0.5)); const v3 = Math.random();
    const i = (y * S + x) * 4; d[i] = v1 * 255; d[i + 1] = v2 * 255; d[i + 2] = v3 * 255; d[i + 3] = 255;
  }
  NOISE_TEX = new THREE.DataTexture(d, S, S); NOISE_TEX.wrapS = NOISE_TEX.wrapT = THREE.RepeatWrapping; NOISE_TEX.magFilter = THREE.LinearFilter; NOISE_TEX.minFilter = THREE.LinearMipmapLinearFilter; NOISE_TEX.generateMipmaps = true; NOISE_TEX.needsUpdate = true;
  return NOISE_TEX;
}
// Triplanar camo paint with procedural cast/rolled-plate surface relief, mud build-up near the running gear,
// dust on upward faces and roughness variation. yOff converts part-local y to hull height (turret/gun parts).
function paintMaterial(paint, seed, yOff = 0, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map: camoTexture(paint, seed), roughness: paint.rough ?? 0.72, metalness: 0.04, envMapIntensity: 0.9 });
  const U = { uNoise: { value: noiseTexture() }, uYOff: { value: yOff }, uDirtY: { value: opts.dirtY ?? 0.9 }, uCast: { value: opts.cast ?? 0.5 }, uMud: { value: new THREE.Color(opts.mud || '#4a3d2c') }, uDust: { value: new THREE.Color(opts.dust || '#8f8166') }, uDustAmt: { value: opts.dustAmt ?? 1.0 }, uEngine: { value: opts.engine ?? 0 }, uHL: { value: opts.hl ?? 3 }, uDeckY: { value: opts.deckY ?? 99 }, uHeat: { value: opts.heat ?? 0 }, uGunLen: { value: opts.gunLen ?? 5 } };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObjPos; varying vec3 vObjN; uniform sampler2D uNoise; uniform float uYOff, uDirtY, uCast, uDustAmt, uEngine, uHL, uDeckY, uHeat, uGunLen; uniform vec3 uMud, uDust; float vChip; float vOil; float vGrit; float vHeat;
      vec3 triN(vec3 p, vec3 bw) { return texture2D(uNoise, p.zy).rgb * bw.x + texture2D(uNoise, p.xz).rgb * bw.y + texture2D(uNoise, p.xy).rgb * bw.z; }`)
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(normalize(vObjN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        vec3 pp = vObjPos * 0.22;
        vec4 tc = texture2D(map, pp.zy) * bw.x + texture2D(map, pp.xz) * bw.y + texture2D(map, pp.xy) * bw.z;
        diffuseColor *= tc;
        vec3 nA = triN(vObjPos * 0.35, bw); vec3 nB = triN(vObjPos * 1.6, bw);
        float yL = vObjPos.y + uYOff;
        float mud = smoothstep(uDirtY, uDirtY - 0.55, yL + (nA.r - 0.5) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMud * (0.75 + 0.5 * nB.g), clamp(mud * 0.85, 0.0, 0.85));
        float up = smoothstep(0.55, 0.95, normalize(vObjN).y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust, up * (0.06 + 0.16 * nA.g));
        diffuseColor.rgb *= 0.9 + 0.2 * nA.r;
        if (normalize(vObjN).y < -0.4) diffuseColor.rgb *= 0.72;
        // v4 weathering: vertical rain/oil streaks on side faces, paint chipping (bare primer/steel) and soot near the top
        vec3 nN = normalize(vObjN); float side = 1.0 - abs(nN.y);
        float streak = texture2D(uNoise, vec2((vObjPos.x + vObjPos.z) * 1.1, yL * 0.06)).g;
        diffuseColor.rgb *= 1.0 - side * smoothstep(0.6, 0.85, streak) * 0.14;
        float chip = triN(vObjPos * 5.5, bw).b * 0.6 + nB.g * 0.4;
        float chipM = smoothstep(0.78, 0.82, chip) * (0.4 + 0.6 * nA.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.21, 0.19), chipM * 0.75);
        // v6: dust haze that builds up from the lower hull (thrown up by the tracks), stronger on side faces
        float dustH = smoothstep(uDirtY + 0.75, uDirtY - 0.15, yL + (nA.g - 0.5) * 0.5) * side;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.85 + 0.3 * nB.r), clamp(dustH * (0.16 + 0.24 * nA.b) * uDustAmt, 0.0, 0.38));
        // fine mud splatter specks just above the mud line
        float spk = step(0.83, triN(vObjPos * 3.1, bw).g) * smoothstep(uDirtY + 0.6, uDirtY, yL);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMud * 0.8, spk * 0.7);
        // dust settles in horizontal recesses (upward faces)
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust, up * 0.08 * uDustAmt);
        vChip = chipM;
        // v9: soot from the exhausts on the engine-end plate, oil/fuel stains on the engine deck (hull material only: uEngine != 0)
        vOil = 0.0; vGrit = 0.0; vHeat = 0.0;
        if (uEngine != 0.0) {
          float zE = vObjPos.z * uEngine;
          float endFace = smoothstep(0.55, 0.85, nN.z * uEngine) * smoothstep(uHL * 0.8, uHL * 0.97, zE);
          float sootN = texture2D(uNoise, vec2(vObjPos.x * 0.9, yL * 0.25)).g;
          float soot = endFace * smoothstep(uDirtY - 0.2, uDeckY - 0.1, yL) * (0.45 + 0.55 * sootN);
          float deck = up * smoothstep(uHL * 0.25, uHL * 0.75, zE);
          float topSoot = deck * smoothstep(uHL * 0.8, uHL * 0.98, zE) * 0.7;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.04, 0.035), clamp(max(soot, topSoot) * 0.75, 0.0, 0.8));
          vOil = deck * smoothstep(0.62, 0.78, triN(vObjPos * 0.9, bw).r + nB.g * 0.25);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.32, 0.3, 0.27), vOil * 0.8);
          // anti-slip grit on walkways of the hull top
          vGrit = up * step(uDeckY - 0.25, yL);
        }
        // v9: barrel heat discolouration toward the muzzle on modern guns (burnt paint -> straw/blue-brown steel)
        if (uHeat > 0.0) {
          vHeat = uHeat * smoothstep(uGunLen * 0.62, uGunLen * 0.98, vObjPos.z) * (0.75 + 0.25 * nB.r);
          vec3 tint = mix(vec3(0.33, 0.25, 0.17), vec3(0.17, 0.17, 0.22), smoothstep(uGunLen * 0.85, uGunLen, vObjPos.z));
          diffuseColor.rgb = mix(diffuseColor.rgb, tint, vHeat * 0.7);
        }
        float vRough = 0.86 + 0.3 * nB.r + mud * 0.25 + dustH * 0.15 - chipM * 0.4 + uCast * 0.14 * (nB.b - 0.3);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.55, vChip * 0.8); metalnessFactor = mix(metalnessFactor, 0.6, vHeat * 0.5);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor * vRough, 0.3, 1.0); roughnessFactor = mix(roughnessFactor, 0.32, vOil * 0.8); roughnessFactor = mix(roughnessFactor, 0.97, vGrit * 0.6); roughnessFactor = mix(roughnessFactor, 0.45, vHeat * 0.6);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float hgt = (nA.r * uCast * 1.3 + nB.b * 0.12 + nB.r * 0.25 + triN(vObjPos * 4.0, bw).r * uCast * 0.5 + triN(vObjPos * 9.0, bw).g * uCast * 0.18 + mud * nB.g * 0.6 + vGrit * triN(vObjPos * 18.0, bw).b * 0.9) ;
          vec2 dHdxy = vec2(dFdx(hgt), dFdy(hgt)) * 0.9;
          vec3 vSigmaX = dFdx(-vViewPosition), vSigmaY = dFdy(-vViewPosition);
          vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); normal = normalize(abs(fDet) * normal - vGrad * 0.02);
        }`);
  };
  m.customProgramCacheKey = () => 'paint9';
  return m;
}
// v6: running-gear grime (road wheels, sprockets, idlers, track links). Mud is caked on in noisy patches using
// instance-space position so every wheel differs; steel stays metallic where clean, mud is matte dielectric.
function grimeMaterial(base, mudHex, amt = 0.55, key = 'grime') {
  const m = new THREE.MeshStandardMaterial(base);
  const U = { uNoise: { value: noiseTexture() }, uMud: { value: new THREE.Color(mudHex || '#4a3d2c') }, uAmt: { value: amt }, uLink: { value: key === 'grimeL' ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP; varying vec3 vGN; varying float vGR;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vGP = transformed * vec3(1.0, 0.45, 0.45) + instanceMatrix[3].xyz * 1.37; vGN = objectNormal; vGR = length(transformed.yz);
        #else
          vGP = transformed; vGN = objectNormal; vGR = 1.0;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP; varying vec3 vGN; varying float vGR; uniform sampler2D uNoise; uniform vec3 uMud; uniform float uAmt; uniform float uLink; float gMud;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gb = pow(abs(normalize(vGN)), vec3(4.0)); gb /= (gb.x + gb.y + gb.z + 1e-5);
        vec3 gp = vGP * 0.55;
        float gn = texture2D(uNoise, gp.zy).r * gb.x + texture2D(uNoise, gp.xz).r * gb.y + texture2D(uNoise, gp.xy).r * gb.z;
        float gf = texture2D(uNoise, gp.zy * 6.0).g * gb.x + texture2D(uNoise, gp.xz * 6.0).g * gb.y + texture2D(uNoise, gp.xy * 6.0).g * gb.z;
        // v9: soft film of dried mud that thickens toward the rim/tyre and into recesses, broken up by fine grain (no hard blotches)
        float rim = mix(1.0, smoothstep(0.45, 1.0, vGR), 1.0 - uLink);
        gMud = clamp((0.25 + 0.75 * smoothstep(0.25, 0.75, gn)) * (0.45 + 0.55 * rim) * uAmt * (0.85 + 0.3 * gf), 0.0, 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMud * (0.85 + 0.25 * gf), gMud * 0.85);
        // rubber (very dark vertex colour) stays matte dielectric
        float gRub = 1.0 - smoothstep(0.08, 0.14, max(vColor.r, max(vColor.g, vColor.b)));
        diffuseColor.rgb *= 0.92 + 0.16 * gf;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(mix(roughnessFactor * (0.85 + 0.3 * gf), 0.93, gRub), 0.97, gMud);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.0, max(gMud, gRub));')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { // v9: procedural micro-normal – rubber tread grain, cast-steel pitting and caked mud relief
          float hgt = gf * (0.3 + 0.7 * gMud) + gRub * texture2D(uNoise, gp.zy * 22.0).b * 0.4;
          vec2 dH = vec2(dFdx(hgt), dFdy(hgt)); vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          vec3 R1 = cross(sY, normal), R2 = cross(normal, sX); float fD = dot(sX, R1) * faceDirection;
          normal = normalize(abs(fD) * normal - sign(fD) * (dH.x * R1 + dH.y * R2) * 0.03);
        }`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}
const MATS = {};
function sharedMats() {
  if (MATS.metal) return MATS;
  MATS.metal = new THREE.MeshStandardMaterial({ color: 0x3b3a37, roughness: 0.55, metalness: 0.65 });
  MATS.rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1b, roughness: 0.95, metalness: 0.0 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.6, metalness: 0.3 });
  // v9: optics are coated glass – dielectric with a clear-coat sheen that picks up the HDRI sky, faint blue-green coating tint
  MATS.glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1820, roughness: 0.04, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.02, reflectivity: 0.9, envMapIntensity: 1.6, emissive: 0x03080c, sheen: 0.4, sheenColor: new THREE.Color(0x3a6a70) });
  MATS.wood = new THREE.MeshStandardMaterial({ color: 0x6a5134, roughness: 0.9 });
  MATS.canvas = new THREE.MeshStandardMaterial({ color: 0x5e5a43, roughness: 1.0 });
  // v9 burnt-out wreck: charred black paint, grey-white ash bloom, rust-brown heat-scaled steel, all rough; one shared material for every wreck
  MATS.burnt = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.97, metalness: 0.1 });
  MATS.burnt.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: noiseTexture() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP; varying vec3 vBN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP = position; vBN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP; varying vec3 vBN; uniform sampler2D uNoise; float bN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bb = pow(abs(normalize(vBN)), vec3(4.0)); bb /= (bb.x + bb.y + bb.z + 1e-5);
        vec3 q = vBP * 0.22; vec3 a = texture2D(uNoise, q.zy).rgb * bb.x + texture2D(uNoise, q.xz).rgb * bb.y + texture2D(uNoise, q.xy).rgb * bb.z;
        vec3 q2 = vBP * 3.1; float f = texture2D(uNoise, q2.zy).g * bb.x + texture2D(uNoise, q2.xz).g * bb.y + texture2D(uNoise, q2.xy).g * bb.z;
        bN = f;
        vec3 c = vec3(0.035, 0.032, 0.03);
        c = mix(c, vec3(0.13, 0.075, 0.045), smoothstep(0.45, 0.8, a.r * 0.8 + f * 0.2) * 0.35);            // rust / heat-scaled steel
        c = mix(c, vec3(0.42, 0.4, 0.37), smoothstep(0.55, 0.9, a.g) * 0.35 * smoothstep(0.3, 0.9, normalize(vBN).y + 0.4)); // ash on upper faces
        diffuseColor.rgb = c * (0.8 + 0.3 * f) * 0.85;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hg = bN * 0.6; vec2 dH = vec2(dFdx(hg), dFdy(hg)); vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          vec3 R1 = cross(sY, normal), R2 = cross(normal, sX); float fD = dot(sX, R1) * faceDirection; normal = normalize(abs(fD) * normal - sign(fD) * (dH.x * R1 + dH.y * R2) * 0.03); }`);
  };
  MATS.burnt.customProgramCacheKey = () => 'burnt9';
  MATS.track = new THREE.MeshStandardMaterial({ color: 0x55514b, roughness: 0.62, metalness: 0.6 });
  MATS.steel = new THREE.MeshStandardMaterial({ color: 0x6a6760, roughness: 0.4, metalness: 0.85 });
  MATS.tail = new THREE.MeshStandardMaterial({ color: 0x7a0c08, roughness: 0.2, metalness: 0.1, emissive: 0x2a0200 });
  MATS.amber = new THREE.MeshStandardMaterial({ color: 0x9a5a08, roughness: 0.2, metalness: 0.1, emissive: 0x2a1400 });
  // v9: shared cached canvas maps for bare metal parts – roughness variation (worn/greasy patches) + scratch/grit normal map
  const rgh = metalRoughTexture(), nrm = metalNormalTexture();
  for (const k of ['metal', 'steel', 'track', 'dark']) { MATS[k].roughnessMap = rgh; MATS[k].normalMap = nrm; MATS[k].normalScale = new THREE.Vector2(0.35, 0.35); }
  return MATS;
}
function metalRoughTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const n = makeNoise2D(5); const N = 64; const f = tileField(n, N, 4, 4), f2 = tileField(n, N, 16, 2, 9, 9);
  const img = g.createImageData(S, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 0.75 + sampleField(f, N, x / S, y / S) * 0.5 + sampleField(f2, N, x / S, y / S) * 0.25; const i = (y * S + x) * 4; const b = Math.max(70, Math.min(255, v * 200)); img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
}
function metalNormalTexture() { // height field (grit + fine scratches) -> tangent-space normal map
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const n = makeNoise2D(17); const N = 128; const f = tileField(n, N, 24, 2);
  const h = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = sampleField(f, N, x / S, y / S) * 0.6 + (Math.random() - 0.5) * 0.25;
  for (let k = 0; k < 90; k++) { let x = Math.random() * S, y = Math.random() * S; const a = Math.random() * Math.PI, l = 6 + Math.random() * 30; for (let j = 0; j < l; j++) { const xi = ((x + Math.cos(a) * j) | 0) & (S - 1), yi = ((y + Math.sin(a) * j) | 0) & (S - 1); h[yi * S + xi] -= 0.6; } }
  const img = g.createImageData(S, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const hx = h[y * S + ((x + 1) & (S - 1))] - h[y * S + ((x - 1) & (S - 1))], hy = h[((y + 1) & (S - 1)) * S + x] - h[((y - 1) & (S - 1)) * S + x]; const l = Math.hypot(hx, hy, 1); const i = (y * S + x) * 4; img.data[i] = (-hx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-hy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}
export function burntMaterial() { return sharedMats().burnt; }

// ---------- Running gear ----------
// Unit road wheel (radius 1, width 1 along x) – dual tyres with a central guide-horn gap.
// type: 'disc' (dished steel disc), 'spoked' (cast spokes), 'modern' (aluminium, lightening holes), 'steel' (all-steel, no rubber)
function wheelGeometry(paintHex, type = 'disc') {
  const col = new THREE.Color(paintHex); const rub = new THREE.Color(0x181817); const hub = new THREE.Color(paintHex).multiplyScalar(0.72); const dark = new THREE.Color(0x0e0e0e); const metal = new THREE.Color(0x4a4843);
  const parts = [];
  const paintC = (g, c) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const lx = (pts, seg = 16) => { const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg); g.rotateZ(-Math.PI / 2); return g; }; // axis -> +x
  const s = 1; const m = (pts) => pts;
  const tyre = type === 'steel' ? metal : rub;
  paintC(lx(m([[0.86, 0.06], [0.97, 0.07], [1.0, 0.12], [1.0, 0.42], [0.97, 0.47], [0.86, 0.48]])), tyre);
  paintC(lx(m([[0.86, 0.48], [0.8, 0.46], [type === 'modern' ? 0.62 : 0.5, 0.4], [0.24, 0.43], [0.2, 0.5], [0.0, 0.5]])), col);
  paintC(lx(m([[0.0, 0.06], [0.86, 0.06]])), hub);
  paintC(cylX(0.17, 0.08, 10, s * 0.52, 0, 0), hub); // hub cap
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; paintC(cylX(0.03, 0.04, 5, s * 0.5, Math.cos(a) * 0.3, Math.sin(a) * 0.3), metal); } // wheel nuts
  if (type === 'modern') for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; paintC(cylX(0.09, 0.03, 8, s * 0.43, Math.cos(a) * 0.55, Math.sin(a) * 0.55), dark); }
  if (type === 'spoked') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; paintC(T(new THREE.BoxGeometry(0.1, 0.1, 0.55), s * 0.44, Math.cos(a) * 0.5, Math.sin(a) * 0.5, a, 0, 0), col.clone().multiplyScalar(0.85)); paintC(cylX(0.08, 0.02, 8, s * 0.42, Math.cos(a + 0.4) * 0.56, Math.sin(a + 0.4) * 0.56), dark); }
  if (type === 'disc' || type === 'steel') for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; paintC(cylX(0.024, 0.03, 5, s * 0.47, Math.cos(a) * 0.72, Math.sin(a) * 0.72), metal); }
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
function sprocketGeometry(paintHex) {
  const col = new THREE.Color(paintHex).multiplyScalar(0.85); const parts = [];
  const add = (g) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
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
  K.castSeam(P, 'turret', tp, 0, 0.78, 0.84, 0.86, 0, 0.5, 0.12, 2); // casting parting line
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
  K.profileWelds(P, [[-3.0, 1.0], [2.95, 1.0], [2.8, 1.95], [-2.85, 1.95], [-3.0, 1.5]], 1.56, 1.0); K.weld(P, 'hull', [-0.92, 1.02, 3.13], [0.92, 1.02, 3.13]); K.weld(P, 'hull', [-0.92, 0.55, 2.62], [-0.92, 1.0, 3.12]); K.weld(P, 'hull', [0.92, 0.55, 2.62], [0.92, 1.0, 3.12]); // interlocked plate welds
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
  K.castSeam(P, 'turret', tp, 0, 0.78, 0.8, 0.86, 0, 0.5, 0.1, 2); // casting parting line
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
  const gl = 21.8 * DEG; for (let r = 0; r < 4; r++) for (let i = 0; i < 8; i++) { if (r === 3 && Math.abs(i - 3.5) < 1) continue; const t = 0.12 + r * 0.23; const z = 3.43 - t * 1.5, y = 0.92 + t * 0.58; P.add('hull', 'paint', box(0.27, 0.075, 0.3, -1.03 + i * 0.295, y + 0.05, z, gl)); P.add('hull', 'dark', box(0.05, 0.02, 0.05, -1.03 + i * 0.295 + 0.09, y + 0.09, z + 0.08, gl)); } // Kontakt-1 4S20 boxes, 4 rows
  P.add('hull', 'metal', box(2.2, 0.06, 0.12, 0, 1.05, 3.12, gl)); // splash guard
  for (const s of [-1, 1]) P.add('hull', 'metal', cylZ(0.08, 0.1, 10, s * 0.95, 1.05, 3.3));
  // turret dome
  const dome = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1.12, 0.72, 1.28);
  { const p = dome.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0.4) p.setZ(i, 0.4 + (p.getZ(i) - 0.4) * 0.85); } dome.computeVertexNormals(); }
  P.add('turret', 'paint', dome); P.add('turret', 'paint', cylY(1.12, 0.12, 32, 0, 0.0, 0, 1.15));
  K.castSeam(P, 'turret', superEllipse(1.02, 1.05, 1.16, 2.0, 24), 0.3, 0, 1, 1, 0, 0, 0.005); // dome parting line
  // ERA on turret arc
  for (let r = 0; r < 3; r++) for (let a = -72; a <= 72; a += 12) { if (Math.abs(a) < 13) continue; const ar = a * DEG; const rr = [1.13, 1.02, 0.86][r];
    P.add('turret', 'paint', box(0.25, 0.19, 0.09, Math.sin(ar) * rr * 1.08, 0.18 + r * 0.2, Math.cos(ar) * rr * 1.12 + 0.05, -0.25 - r * 0.3, ar)); }
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
  // v7: wide, low, slab-sided turret. Plan view: shallow-angled frontal cheeks (special armour arrays) out to ~3.6 m,
  // near-vertical flat sides, slightly narrower bustle. Side view: roof drops toward the front so the turret reads as a wedge.
  const tp = [[0.5, 2.1], [1.79, 1.62], [1.8, -1.15], [1.62, -2.35], [-1.62, -2.35], [-1.8, -1.15], [-1.79, 1.62], [-0.5, 2.1]];
  { const g = topExtrude(tp, 0.74, 0, 0.025, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); const t = Math.min(1, Math.max(0, (z + 0.2) / 2.3)); if (y > 0.3) p.setY(i, 0.3 + (y - 0.3) * (1 - 0.48 * t)); // roof slopes down to the front
      const sx = 1 - 0.03 * (y / 0.74); p.setX(i, p.getX(i) * sx); }
    g.computeVertexNormals(); P.add('turret', 'paint', g); }
  // cheek armour panel joints + bolted top plates over the special-armour cavities
  for (const s of [-1, 1]) { K.boltRow(P, 'turret', [s * 0.65, 0.58, 1.9], [s * 1.65, 0.62, 1.4], 6, 0.022, 'y', 'weld'); K.boltRow(P, 'turret', [s * 0.7, 0.5, 2.05], [s * 1.75, 0.55, 1.58], 6, 0.018, 'y', 'weld'); P.add('turret', 'dark', box(0.012, 0.6, 0.02, s * 1.81, 0.36, 0.2)); }
  P.add('turret', 'dark', box(0.75, 0.6, 0.2, 0, 0.36, 1.95)); P.add('turret', 'paint', box(0.62, 0.5, 0.35, 0, 0.38, 2.05));
  P.add('turret', 'paint', box(0.65, 0.42, 0.75, 0.95, 0.82, 1.15)); P.add('turret', 'glass', box(0.5, 0.25, 0.03, 0.95, 0.84, 1.53)); // GPS doghouse
  P.add('turret', 'paint', cylY(0.22, 0.35, 12, -0.55, 0.88, -0.6)); P.add('turret', 'paint', box(0.42, 0.35, 0.42, -0.55, 1.15, -0.6)); P.add('turret', 'glass', box(0.3, 0.18, 0.02, -0.55, 1.17, -0.38)); // CITV
  P.add('turret', 'paint', cylY(0.38, 0.22, 16, 0.75, 0.82, -0.4)); P.add('turret', 'metal', box(0.15, 0.2, 0.9, 0.75, 1.05, -0.2)); P.add('turret', 'dark', cylZ(0.025, 1.4, 6, 0.75, 1.07, 0.5)); // CWS + M2
  P.add('turret', 'paint', cylY(0.33, 0.06, 14, -0.85, 0.69, 0.3)); P.add('turret', 'dark', cylZ(0.018, 1.0, 6, -1.05, 1.0, 0.5)); P.add('turret', 'metal', box(0.06, 0.25, 0.06, -1.05, 0.86, 0.2));
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
export const TANK_BUILDERS = BUILDERS;
// v2 detail pass for the original five models (kit details: tools, tow cables, spare links, periscopes, MGs, stowage)
const R90 = Math.PI / 2;
const EXTRAS = {
  sherman(P, d, b) {
    for (const s of [-1, 1]) { K.towCable(P, 'hull', s * 1.2, 1.94, -2.3, 0.6); K.headlight(P, 'hull', s * 1.05, 1.15, 2.42); }
    K.tools(P, 'hull', 0.75, 1.93, -0.9, 1); K.jerrycans(P, 'hull', -0.75, 1.92, -2.55, 2, R90);
    for (const x of [-0.55, 0.55]) K.periscope(P, 'hull', x, 1.97, 1.42, 0, 0.8);
    K.stowageBox(P, 'hull', 0, 1.25, -3.08, 1.3, 0.35, 0.22);
    K.grabRail(P, 'turret', [-0.75, 0.6, -0.9], [-0.8, 0.6, 0.0], 0.0); K.grabRail(P, 'turret', [0.75, 0.6, -0.9], [0.8, 0.6, 0.0], 0.0);
    K.liftHooks(P, 'turret', [[-0.6, 0.78, 0.5], [0.6, 0.78, 0.5]]); K.hatch(P, 'turret', -0.42, 0.8, -0.2, 0.26);
    K.spareLinks(P, 'turret', 0.98, 0.32, -0.6, 3, 0.5, 0.15, R90, R90);
    Object.assign(b, { wheelType: 'disc', cast: 0.3, castTurret: 1.0 });
  },
  t34(P, d, b) {
    K.spareLinks(P, 'hull', 0.75, 1.33, 2.12, 3, 0.5, 0.17, 0, 0.5); K.spareLinks(P, 'hull', -0.95, 1.2, 2.35, 2, 0.5, 0.17, 0, 0.5);
    for (const s of [-1, 1]) K.towCable(P, 'hull', s * 1.3, 1.02, -2.6, 0.8);
    K.tools(P, 'hull', 1.25, 1.0, 1.6, 1); K.stowageBox(P, 'hull', -1.25, 1.18, 1.3, 0.4, 0.32, 0.8);
    K.periscope(P, 'turret', -0.42, 1.17, -0.45, 0, 0.7); K.hatch(P, 'turret', 0.42, 0.82, -0.3, 0.22);
    for (const s of [-1, 1]) K.grabRail(P, 'turret', [s * 0.98, 0.52, -0.7], [s * 0.98, 0.52, 0.3], 0.0);
    Object.assign(b, { wheelType: 'spoked', cast: 0.35, castTurret: 1.0 });
  },
  tiger(P, d, b) {
    for (const s of [-1, 1]) { K.towCable(P, 'hull', s * 1.575, 1.6, -2.4, 1.6); K.spareLinks(P, 'turret', s * 1.27, 0.45, 0.35, 3, 0.72, 0.13, s * R90, R90); K.periscope(P, 'hull', s * 0.8, 2.0, 2.3, 0, 0.8); }
    K.tools(P, 'hull', 0.9, 1.95, 1.4, 1); K.tools(P, 'hull', -0.9, 1.95, 1.4, -1);
    K.cupola(P, 'turret', -0.6, 0.83, -0.85, 0.33, 0.24, 7, 'ww2'); K.mg(P, 'turret', -0.6, 1.25, -0.85, 0, 'mg34');
    K.liftHooks(P, 'turret', [[-0.9, 0.86, 0.4], [0.9, 0.86, 0.4], [0, 0.86, -1.3]]);
    Object.assign(b, { wheelType: 'steel', cast: 0.3, castTurret: 0.35 });
  },
  t72(P, d, b) {
    K.tools(P, 'hull', -1.45, 1.07, 1.8, -1); K.towCable(P, 'hull', 1.15, 1.52, -2.9, -1.0);
    K.hatch(P, 'turret', -0.45, 0.78, -0.25, 0.27); K.periscope(P, 'turret', -0.2, 0.75, 0.2, 0, 0.7);
    for (const s of [-1, 1]) K.grabRail(P, 'turret', [s * 1.0, 0.5, -0.9], [s * 1.08, 0.45, -0.2], 0.0);
    K.liftHooks(P, 'turret', [[-0.9, 0.55, 0.6], [0.9, 0.55, 0.6]]);
    Object.assign(b, { wheelType: 'disc', cast: 0.3, castTurret: 0.9 });
  },
  m1a2(P, d, b) {
    K.towCable(P, 'hull', -0.9, 1.56, -3.6, -1.8); K.towCable(P, 'hull', 0.9, 1.56, -3.6, -1.8);
    K.hatch(P, 'turret', -0.85, 0.74, 0.3, 0.3); K.liftHooks(P, 'turret', [[-1.5, 0.72, 1.0], [1.5, 0.72, 1.0], [-1.4, 0.72, -2.0], [1.4, 0.72, -2.0]]);
    K.jerrycans(P, 'turret', 1.3, 0.75, -2.5, 3, 0); K.stowageBox(P, 'hull', 1.45, 1.6, -0.6, 0.45, 0.2, 0.8);
    Object.assign(b, { wheelType: 'modern', cast: 0.1, castTurret: 0.1 });
  },
};

// ---------- Template + instance ----------
const templates = {};
// one track link (shoe + grouser + guide horns + pins + optional rubber pad); outer side is -y (see placement)
function linkGeometry(w, pitch, th, modern) {
  const parts = [];
  const add = (g, c) => { g = clean(g); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const steel = new THREE.Color(0x5b5750), dark = new THREE.Color(0x2c2a27), rub = new THREE.Color(0x151514), shiny = new THREE.Color(0x8a857c);
  add(box(w, th * 0.6, pitch * 0.82, 0, 0, 0), steel);
  add(box(w * 0.94, th * 0.5, pitch * 0.18, 0, -th * 0.45, 0), shiny); // grouser (outer, -y)
  if (modern) for (const s of [-1, 1]) add(box(w * 0.4, th * 0.45, pitch * 0.6, s * w * 0.26, -th * 0.42, pitch * 0.05), rub); // rubber pads
  for (const s of [-1, 1]) add(box(0.05, th * 1.6, pitch * 0.42, s * w * 0.07, th * 0.95, 0), steel); // guide horns (inner, +y)
  for (const z of [-1, 1]) add(cylX(th * 0.32, w * 1.04, 6, 0, 0, z * pitch * 0.43), dark); // pins / end connectors
  if (modern) for (const s of [-1, 1]) add(box(0.04, th * 0.7, pitch * 0.25, s * w * 0.52, 0, pitch * 0.42), dark); // end connectors (modern double-pin)
  // v6: cast-link detail – WWII skeleton links get chevron ribs + a dark lightening window, modern links a centre end-connector wedge
  if (!modern) { for (const s of [-1, 1]) add(box(w * 0.36, th * 0.3, pitch * 0.1, s * w * 0.22, -th * 0.42, pitch * 0.3, 0, s * 0.35, 0), steel); }
  else add(box(w * 0.16, th * 0.5, pitch * 0.2, 0, -th * 0.15, pitch * 0.42), dark);
  return mergeGeometries(parts);
}
// v4 finishing pass for every tank: rear fender tail-light clusters, rubber mud flaps, fender support brackets,
// track-tension adjuster at the idler and tow shackles on the rear plate.
function finishDetails(P, d, b, spec) {
  const hl = d.L / 2; const circ = [...b.wheels, ...b.sprockets, ...b.idlers, ...b.rollers];
  const fy = Math.max(...circ.map((c) => c.y + c.r)) + 0.075; const tx = d.W / 2 - d.trackW / 2; const rearZ = Math.min(...circ.map((c) => c.z - c.r)) - 0.1;
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
function getTemplate(spec) {
  if (templates[spec.id]) return templates[spec.id];
  const d = spec.dims; const b = (BUILDERS[spec.id] || buildV2)(d, spec); if (EXTRAS[spec.id]) EXTRAS[spec.id](b.P, d, b); finishDetails(b.P, d, b, spec);
  const mats = sharedMats();
  const seed = spec.id.length * 31 + 7; const dirtY = d.clearance + 0.75;
  const opts = { dirtY, cast: b.cast ?? 0.5, mud: spec.paint.mud, dust: spec.paint.dust, dustAmt: spec.paint.dustAmt };
  const paint = paintMaterial(spec.paint, seed, 0, { ...opts, engine: spec.engineZone === 'front' ? 1 : -1, hl: d.L / 2, deckY: d.hullH });
  const paintT = paintMaterial(spec.paint, seed, b.turretPos[1], { ...opts, cast: b.castTurret ?? opts.cast });
  const paintG = paintMaterial(spec.paint, seed, b.turretPos[1] + b.gunPos[1], { ...opts, cast: 0.15, heat: spec.era === 'WWII' ? 0 : 1, gunLen: d.gunLen });
  const geo = b.P.merged();
  const trackCircles = [...b.wheels.map((w) => ({ z: w.z, y: w.y, r: w.r })), ...b.sprockets, ...b.idlers, ...b.rollers.filter((r) => !r.free)];
  const pitch = d.trackPitch || (spec.era === 'WWII' ? 0.15 : 0.18);
  const track = trackGeometry(trackCircles, d.trackW, 0.075, pitch);
  const wheelGeo = wheelGeometry(spec.paint.base, b.wheelType || (b.wheels[0].spoked ? 'spoked' : spec.era === 'WWII' ? 'disc' : 'modern'));
  const sprocketGeo = sprocketGeometry(spec.paint.base);
  const wheelGeoLo = wheelGeometryLo(spec.paint.base);
  const wheelMat = grimeMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.2 }, spec.paint.mud, 0.5, 'grimeW');
  const nLinks = Math.round(track.length / pitch);
  const linkGeo = linkGeometry(d.trackW, track.length / nLinks, 0.06, spec.era !== 'WWII');
  const linkMat = grimeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.7 }, spec.paint.mud, 0.45, 'grimeL');
  templates[spec.id] = { b, geo, paint, paintT, paintG, mats, track, wheelGeo, wheelGeoLo, sprocketGeo, wheelMat, linkGeo, linkMat, nLinks, pitch };
  return templates[spec.id];
}

export function createTankModel(spec, opts = {}) {
  const tpl = getTemplate(spec); const d = spec.dims; const { b, geo, mats } = tpl;
  const root = new THREE.Group(); root.name = spec.id;
  const body = new THREE.Group(); root.add(body); // body receives pitch/roll
  const meshes = [];
  const details = [];
  const mk = (g, k, parent, paintMat) => { const m = new THREE.Mesh(g, k === 'paint' || k === 'weld' ? paintMat : k === 'darkN' ? mats.dark : mats[k]); if (k === 'weld' || k === 'darkN') { details.push(m); m.visible = false; m.castShadow = false; } m.castShadow = true; m.receiveShadow = true; m.userData.matKey = k; parent.add(m); meshes.push(m); return m; };
  for (const [k, g] of Object.entries(geo.hull)) mk(g, k, body, tpl.paint);
  const turret = new THREE.Group(); turret.position.set(...b.turretPos); body.add(turret);
  for (const [k, g] of Object.entries(geo.turret)) mk(g, k, turret, tpl.paintT);
  const gun = new THREE.Group(); gun.position.set(...b.gunPos); turret.add(gun);
  for (const [k, g] of Object.entries(geo.gun || {})) mk(g, k, gun, tpl.paintG);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, d.gunLen); gun.add(muzzle);
  const sight = new THREE.Object3D(); sight.position.set(0.35, 0.25, 0.2); gun.add(sight);
  // tracks: textured ribbon (LOD far) + individual instanced links (LOD near)
  const tracks = [], links = [], trackTex = [];
  for (const s of [-1, 1]) {
    const tex = trackTexture().clone();
    const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.55, color: 0x9a948c, side: THREE.DoubleSide });
    const m = new THREE.Mesh(tpl.track.geo, tm); m.position.x = s * (d.W / 2 - d.trackW / 2); m.castShadow = true; m.receiveShadow = true; body.add(m); tracks.push(m); meshes.push(m); trackTex.push(tex);
    const li = new THREE.InstancedMesh(tpl.linkGeo, tpl.linkMat, tpl.nLinks); li.position.x = m.position.x; li.castShadow = true; li.receiveShadow = true; li.visible = false; li.frustumCulled = false; body.add(li); links.push(li); meshes.push(li);
  }
  // wheels: instanced (road wheels + idlers + return rollers) and sprockets
  const wl = [], wlIn = [];
  for (const s of [-1, 1]) {
    for (const w of b.wheels) (w.xo < 0 ? wlIn : wl).push({ x: s * (d.W / 2 - d.trackW / 2) + (w.xo || 0) * s, y: w.y, z: w.z, r: w.r, w: w.w ?? d.trackW * 0.8, side: s }); // v8: inner (hidden) layer of interleaved wheels always uses the low-poly wheel
    for (const w of b.idlers) wl.push({ x: s * (d.W / 2 - d.trackW / 2), y: w.y, z: w.z, r: w.r, w: d.trackW * 0.6, side: s });
    for (const w of b.rollers) wl.push({ x: s * (d.W / 2 - d.trackW / 2), y: w.y, z: w.z, r: w.r, w: d.trackW * 0.5, side: s });
  }
  const wheels = new THREE.InstancedMesh(tpl.wheelGeoLo, tpl.wheelMat, wl.length); wheels.castShadow = true; wheels.receiveShadow = true; body.add(wheels); meshes.push(wheels);
  let innerWheels = null; if (wlIn.length) { innerWheels = new THREE.InstancedMesh(tpl.wheelGeoLo, tpl.wheelMat, wlIn.length); innerWheels.castShadow = true; innerWheels.receiveShadow = true; body.add(innerWheels); meshes.push(innerWheels); }
  const sl = []; for (const s of [-1, 1]) for (const w of b.sprockets) sl.push({ x: s * (d.W / 2 - d.trackW / 2), y: w.y, z: w.z, r: w.r, w: d.trackW * 0.7, side: s });
  const sprockets = new THREE.InstancedMesh(tpl.sprocketGeo, tpl.wheelMat, sl.length); sprockets.castShadow = true; body.add(sprockets); meshes.push(sprockets);
  // decals
  for (const dc of b.decals) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dc.s, dc.s), new THREE.MeshStandardMaterial({ map: decalTexture(dc.kind, dc.text), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.position.set(...dc.pos); m.rotation.y = dc.ry; (dc.part === 'hull' ? body : turret).add(m); m.userData.decal = true; meshes.push(m);
  }
  const model = { root, body, turret, gun, muzzle, sight, tracks, trackTex, links, details, linksOn: false, loop: tpl.track.loop, loopLen: tpl.track.length, nLinks: tpl.nLinks, pitch: tpl.pitch, wheelGeo: tpl.wheelGeo, wheelGeoLo: tpl.wheelGeoLo, wheels, innerWheels, innerList: wlIn, sprockets, wheelList: wl, sprocketList: sl, meshes, trackLength: tpl.track.length, spin: 0, trackOffset: [0, 0] };
  updateRunningGear(model, 0, 0);
  if (opts.links) setTrackLOD(model, true);
  return model;
}
const _mat = new THREE.Matrix4(), _pos = new V3(), _scl = new V3(), _qq = new THREE.Quaternion(), _eu = new THREE.Euler();
// switch between individual links (near) and the scrolling textured ribbon (far)
export function setTrackLOD(model, near) {
  if (model.linksOn === near) return; model.linksOn = near;
  for (let i = 0; i < 2; i++) { model.links[i].visible = near; model.tracks[i].visible = !near; } for (const m of model.details || []) m.visible = near; // weld beads etc. only up close
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
  const tp = model.pitch || 0.17; model.trackOffset[0] -= distL / tp; model.trackOffset[1] -= distR / tp;
  model.trackTex[0].offset.x = model.trackOffset[0]; model.trackTex[1].offset.x = model.trackOffset[1];
  model.spinL = (model.spinL || 0) + distL; model.spinR = (model.spinR || 0) + distR;
  const set = (im, list) => { list.forEach((w, i) => { const dist = w.side < 0 ? model.spinL : model.spinR; _eu.set(dist / w.r, 0, 0); _qq.setFromEuler(_eu); _pos.set(w.x, w.y, w.z); _scl.set(w.w, w.r, w.r); _mat.compose(_pos, _qq, _scl); im.setMatrixAt(i, _mat); }); im.instanceMatrix.needsUpdate = true; };
  set(model.wheels, model.wheelList); set(model.sprockets, model.sprocketList); if (model.innerWheels) set(model.innerWheels, model.innerList);
  if (model.linksOn && (distL !== 0 || distR !== 0)) updateLinks(model);
}
// v9 suspension: the hull (body) heaves on a damped spring driven by vertical ground velocity + speed-scaled bumps, while
// the running gear (wheels, sprockets, tracks, links) is counter-offset so it stays planted -> visible suspension travel.
export function updateSuspension(model, dt, speed, groundY) {
  if (!dt || dt > 0.25) { model.susY0 = groundY; return; }
  const s = model.sus ||= { y: 0, v: 0, dist: 0 }; const gy0 = model.susY0 ?? groundY; model.susY0 = groundY;
  const vy = (groundY - gy0) / dt; s.dist += Math.abs(speed) * dt;
  const bump = Math.min(1, Math.abs(speed) / 12) * 0.012 * (Math.sin(s.dist * 2.1) * 0.6 + Math.sin(s.dist * 5.3 + 1.3) * 0.4);
  const target = Math.max(-0.05, Math.min(0.05, -vy * 0.012)) + bump;
  const k = 90, c = 11; s.v += ((target - s.y) * k - s.v * c) * dt; s.y += s.v * dt; s.y = Math.max(-0.06, Math.min(0.06, s.y));
  model.body.position.y = s.y;
  const off = -s.y; for (const m of [model.wheels, model.innerWheels, model.sprockets, ...model.tracks, ...model.links]) if (m) m.position.y = off;
}
export function burnModel(model) {
  const b = burntMaterial();
  for (const m of model.meshes) { if (m.userData.decal) { m.visible = false; continue; } if (m.userData.hitMark) continue; m.material = b; }
}
// ---------- v9 battle damage: pooled scorch / dent decals at shell impacts ----------
const MAX_MARKS = 8;
let MARK = null;
function markAssets() {
  if (MARK) return MARK;
  const S = 128; const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  // colour/alpha: soot halo, scorched ring, dark core (pen) / bright scraped steel (bounce)
  const scorch = (pen) => { const [c, g] = mk(); const cx = S / 2; const r = new RNG(pen ? 3 : 4);
    let gr = g.createRadialGradient(cx, cx, 0, cx, cx, cx); gr.addColorStop(0, pen ? 'rgba(8,7,6,1)' : 'rgba(150,145,135,0.95)'); gr.addColorStop(pen ? 0.18 : 0.12, pen ? 'rgba(12,10,9,1)' : 'rgba(95,90,82,0.9)'); gr.addColorStop(0.32, 'rgba(25,22,18,0.85)'); gr.addColorStop(0.6, 'rgba(30,26,22,0.45)'); gr.addColorStop(1, 'rgba(30,26,22,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 40; k++) { const a = r.next() * 6.283, d = cx * (0.25 + r.next() * 0.6); g.fillStyle = `rgba(20,18,15,${0.15 + r.next() * 0.3})`; g.beginPath(); g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1 + r.next() * 4, 0, 6.283); g.fill(); }
    if (pen) { g.fillStyle = 'rgba(0,0,0,1)'; g.beginPath(); g.arc(cx, cx, S * 0.07, 0, 6.283); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // dent normal map: shallow crater with a raised lip
  const [nc, ng] = mk(); const img = ng.createImageData(S, S); const H = (x, y) => { const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2); return d > 1 ? 0 : -Math.cos(Math.min(1, d / 0.55) * Math.PI / 2) * 0.0 - (d < 0.55 ? (1 - (d / 0.55) ** 2) : 0) * 1.0 + (d > 0.5 && d < 0.75 ? Math.sin((d - 0.5) / 0.25 * Math.PI) * 0.25 : 0); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const hx = (H(x + 1, y) - H(x - 1, y)) * 6, hy = (H(x, y + 1) - H(x, y - 1)) * 6; const l = Math.hypot(hx, hy, 1); const i = (y * S + x) * 4; img.data[i] = (-hx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (hy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
  ng.putImageData(img, 0, 0); const nt = new THREE.CanvasTexture(nc);
  const mat = (pen) => new THREE.MeshStandardMaterial({ map: scorch(pen), normalMap: nt, normalScale: new THREE.Vector2(1.2, 1.2), transparent: true, depthWrite: false, roughness: pen ? 0.95 : 0.5, metalness: pen ? 0.1 : 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  MARK = { geo: new THREE.PlaneGeometry(1, 1), pen: mat(true), bounce: mat(false), ray: new THREE.Raycaster(), q: new THREE.Quaternion(), pq: new THREE.Quaternion(), z: new V3(0, 0, 1), n: new V3(), nm: new THREE.Matrix3() };
  return MARK;
}
// ray: {wa, wb} world segment of the shell for this step (from Tank.rayTest); pen = penetrated
export function addHitMark(model, ray, pen) {
  if (!model || !ray || !ray.wa || !ray.wb) return null;
  const A = markAssets(); const dir = new V3().subVectors(ray.wb, ray.wa); const len = dir.length(); if (len < 1e-4) return null; dir.divideScalar(len);
  const from = ray.wa.clone().addScaledVector(dir, -1.5);
  A.ray.set(from, dir); A.ray.far = len + 3;
  const targets = model.meshes.filter((m) => !m.isInstancedMesh && m.visible && !m.userData.decal && !m.userData.hitMark && m.parent);
  const hit = A.ray.intersectObjects(targets, false)[0]; if (!hit || !hit.face) return null;
  const parent = hit.object.parent;
  A.nm.getNormalMatrix(hit.object.matrixWorld); A.n.copy(hit.face.normal).applyMatrix3(A.nm).normalize(); if (A.n.dot(dir) > 0) A.n.negate();
  model.hitMarks ||= []; let m;
  if (model.hitMarks.length < MAX_MARKS) { m = new THREE.Mesh(A.geo, pen ? A.pen : A.bounce); m.userData.hitMark = true; m.renderOrder = 2; model.hitMarks.push(m); model.meshes.push(m); }
  else { m = model.hitMarks.shift(); model.hitMarks.push(m); m.material = pen ? A.pen : A.bounce; }
  parent.add(m);
  const wp = hit.point.clone().addScaledVector(A.n, 0.012); m.position.copy(parent.worldToLocal(wp));
  A.q.setFromUnitVectors(A.z, A.n); A.q.multiply(new THREE.Quaternion().setFromAxisAngle(A.z, Math.random() * 6.283));
  parent.getWorldQuaternion(A.pq); m.quaternion.copy(A.pq.invert().multiply(A.q));
  const sz = pen ? 0.42 + Math.random() * 0.15 : 0.3 + Math.random() * 0.1; m.scale.set(sz, sz, 1);
  return m;
}
// debug hook for offline showroom / triangle audits (tools_tanks_show.mjs)
if (typeof window !== 'undefined') window.__TM = { THREE, TANKS, createTankModel, setTrackLOD, updateRunningGear, addHitMark, burnModel, updateSuspension };
