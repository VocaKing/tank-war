// Builds a complete battlefield scene from a map definition.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { MapBuilder } from './mapgen.js';
import { MAP_BY_ID } from './maps.js';
import { buildStructures } from './buildings.js';
import { Vegetation, windUniform, sunU } from './vegetation.js';
import { Grass } from './grass.js';
import { pbrTex, waterNormalTexture, setTexQuality } from './textures.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Grid2D } from './terrain.js';
import { DEG, ridged, smoothstep } from '../util.js';
import { heightFog } from '../render/atmos.js';

function terrainMaterial(def) {
  const L = def.layers;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true });
  const U = {
    tA: { value: pbrTex(L.A, 'diff') }, tB: { value: pbrTex(L.B, 'diff') }, tC: { value: pbrTex(L.C, 'diff') }, tD: { value: pbrTex(L.D, 'diff') },
    nA: { value: pbrTex(L.A, 'nor') }, nB: { value: pbrTex(L.B, 'nor') }, nC: { value: pbrTex(L.C, 'nor') }, nD: { value: pbrTex(L.D, 'nor') },
    aA: { value: pbrTex(L.A, 'arm') }, aB: { value: pbrTex(L.B, 'arm') }, aC: { value: pbrTex(L.C, 'arm') }, aD: { value: pbrTex(L.D, 'arm') },
    tintA: { value: new THREE.Vector3(...L.tintA) }, tintB: { value: new THREE.Vector3(...L.tintB) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; attribute vec4 roadk; attribute float padk; varying float vPad; varying vec4 vSplat; varying vec4 vRK; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vRK = roadk; vPad = padk; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tA, tB, tC, tD, nA, nB, nC, nD, aA, aB, aC, aD; uniform vec3 tintA, tintB; varying vec4 vSplat; varying vec4 vRK; varying float vPad; float tMudR = 0.0; float tPad = 0.0; vec2 tPadN = vec2(0.0); vec3 conC = vec3(0.0); vec2 tCobN = vec2(0.0); varying vec3 vWP; varying vec3 vWN; float tAO = 1.0;
      vec3 sampleL(sampler2D t, vec2 uv, float far) { vec3 a = texture2D(t, uv).rgb; vec3 b = texture2D(t, uv * 0.173).rgb; return mix(a, (a + b) * 0.5, far); }`)
      .replace('#include <map_fragment>', `
        float camD = length(vWP - cameraPosition); float far = smoothstep(25.0, 140.0, camD);
        vec2 uv = vWP.xz / 3.2; vec2 uvr = vWP.xz / 6.0; vec2 uvd = vWP.xz / 3.5;
        vec4 w = vSplat; w = max(w, 0.0);
        float br = texture2D(tC, vWP.xz / 41.0).r; float br2 = texture2D(tA, vWP.xz / 133.0).g;
        w.y *= 0.55 + br * 0.9; w.x *= 0.8 + br2 * 0.4;
        vec3 wn = normalize(vWN); float steep = smoothstep(0.28, 0.55, 1.0 - wn.y); w.z += steep * 2.5 * (1.0 - w.w); w.xy *= 1.0 - steep * 0.85;
        vec3 cA = sampleL(tA, uv, far) * tintA, cB = sampleL(tB, uv * 1.1, far) * tintB, cC = sampleL(tC, uvr, far), cD = sampleL(tD, uvd, far);
        vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        if (steep > 0.01) { cC = texture2D(tC, vWP.zy / 6.0).rgb * bw.x + cC * bw.y + texture2D(tC, vWP.xy / 6.0).rgb * bw.z; }
        vec3 rA = texture2D(aA, uv).rgb, rB = texture2D(aB, uv * 1.1).rgb, rC = texture2D(aC, uvr).rgb, rD = texture2D(aD, uvd).rgb;
        {
          float gl = dot(cD, vec3(0.333)); float dirt = vRK.x, cob = vRK.y, asp = vRK.z;
          if (vPad > 0.01) {
            vec2 sp = vWP.xz / vec2(5.0, 4.0); vec2 sid = floor(sp); vec2 sf = fract(sp); float hs = fract(sin(dot(sid, vec2(17.1, 113.7))) * 43758.5);
            vec2 je = min(sf, 1.0 - sf) * vec2(5.0, 4.0); float joint = smoothstep(0.008, 0.022, min(je.x, je.y));
            float stain = texture2D(tB, vWP.xz / 9.0).g; float grain = mix(gl, 0.42, 0.55);
            conC = vec3(0.47, 0.455, 0.42) * grain * (0.86 + hs * 0.22) * mix(0.72, 1.04, smoothstep(0.15, 0.65, stain));
            conC = mix(conC * 0.55, conC, mix(1.0, joint, 1.0 - far));
            tPadN = (sf - 0.5) * (1.0 - smoothstep(0.0, 0.06, min(je.x, je.y))) * 0.8 * (1.0 - far);
            tPad = smoothstep(0.25, 0.65, vPad * (0.7 + 0.6 * br)) * (1.0 - 0.5 * smoothstep(0.5, 0.85, texture2D(tA, vWP.xz / 13.0).g));
          }
          vec3 dirtC = gl * vec3(1.22, 0.96, 0.72) * 0.86;
          vec3 aspC = gl * vec3(0.33, 0.34, 0.36);
          vec3 cobC = cD;
          if (cob > 0.01) {
            vec2 cp = vWP.xz / vec2(0.24, 0.17); float row = floor(cp.y); cp.x += mod(row, 2.0) * 0.5;
            vec2 cid = floor(cp); vec2 cf = fract(cp) - 0.5; float hs = fract(sin(dot(cid, vec2(41.3, 289.1))) * 43758.5);
            vec2 ed = 0.5 - abs(cf); float e = min(ed.x * 0.24, ed.y * 0.17); float mortar = smoothstep(0.004, 0.018, e);
            vec3 stone = mix(vec3(0.85, 0.84, 0.82), vec3(1.08, 1.0, 0.88), hs) * gl;
            cobC = mix(stone * 0.28, stone, mortar);
            tCobN = cf * (1.0 - smoothstep(0.0, 0.05, e)) * 1.6 * (1.0 - far);
          }
          cD = mix(cD, dirtC, dirt); cD = mix(cD, mix(cobC, cD, far * 0.6), cob); cD = mix(cD, aspC, asp);
          w.w *= 0.75 + 0.5 * br;
          float mud = vRK.w * smoothstep(0.25, 0.6, br * 0.6 + br2 * 0.6);
          vec3 mudC = dot(cA, vec3(0.333)) * vec3(0.62, 0.5, 0.4);
          cA = mix(cA, mudC, mud); cB = mix(cB, mudC, mud * 0.9); tMudR = mud;
        }
        vec4 hgt = vec4(dot(cA, vec3(0.33)), dot(cB, vec3(0.33)), dot(cC, vec3(0.33)), dot(cD, vec3(0.33))) * 0.6 + w * 1.4;
        float hmax = max(max(hgt.x, hgt.y), max(hgt.z, hgt.w)) - 0.18;
        vec4 hb = max(hgt - hmax, 0.0) * step(0.001, w); w = hb / (hb.x + hb.y + hb.z + hb.w + 1e-4);
        vec3 col = cA * w.x + cB * w.y + cC * w.z + cD * w.w;
        float tRough = mix(0.72, 1.0, clamp(rA.g * w.x + rB.g * w.y + rC.g * w.z + rD.g * w.w, 0.0, 1.0)); tRough = mix(tRough, 0.42, tMudR * (w.x + w.y)); tRough = mix(tRough, 0.82, vRK.z * w.w); tRough = mix(tRough, 0.88, tPad); tAO = mix(rA.r * w.x + rB.r * w.y + rC.r * w.z + rD.r * w.w, 1.0, far * 0.8);
        col *= 0.82 + 0.36 * texture2D(tB, vWP.xz / 97.0).g;
        col *= mix(0.92, 1.06, smoothstep(0.2, 0.8, texture2D(tA, vWP.xz / 260.0).r));
        {
          vec2 pc = mat2(0.94, -0.34, 0.34, 0.94) * vWP.xz + (vec2(br, br2) - 0.5) * 30.0;
          vec2 cell = floor(pc / vec2(86.0, 64.0)); float hs = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 pt = hs < 0.33 ? vec3(1.04, 1.01, 0.88) : hs < 0.66 ? vec3(0.90, 1.0, 0.88) : vec3(1.0, 0.95, 0.9);
          col *= mix(vec3(1.0), pt, w.x * 0.85);
        }
        col = mix(col, conC, tPad);
        diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(tRough, 0.95, far * 0.5);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tAO; reflectedLight.indirectSpecular *= tAO * tAO; reflectedLight.directDiffuse *= mix(1.0, tAO, 0.5);')
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nm = (texture2D(nA, uv).xyz * w.x + texture2D(nB, uv * 1.1).xyz * w.y + texture2D(nC, uvr).xyz * w.z + texture2D(nD, uvd).xyz * w.w) * 2.0 - 1.0;
          nm.xy *= (1.0 - far * 0.7) * 0.9 * (1.0 - 0.6 * tMudR * (w.x + w.y)) * (1.0 - 0.5 * (vRK.x + vRK.z) * w.w);
          nm.xy += tCobN * vRK.y * w.w; nm.xy = mix(nm.xy, nm.xy * 0.35 + tPadN, tPad);
          vec3 T = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz; vec3 Bt = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          T = normalize(T - normal * dot(normal, T)); Bt = normalize(Bt - normal * dot(normal, Bt) - T * dot(T, Bt));
          normal = normalize(T * nm.x + Bt * nm.y + normal * nm.z);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain5c';
  return m;
}

function buildTerrainMeshes(mb, mat, step) {
  const t = mb.t; const tiles = 7; const per = Math.floor((t.n - 1) / tiles); const group = new THREE.Group(); group.name = 'terrain';
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const i0 = tx * per, j0 = ty * per, i1 = tx === tiles - 1 ? t.n - 1 : i0 + per, j1 = ty === tiles - 1 ? t.n - 1 : j0 + per;
    const nx = Math.floor((i1 - i0) / step) + 1, nz = Math.floor((j1 - j0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), spl = new Float32Array(nx * nz * 4), rk = new Float32Array(nx * nz * 4), idx = [];
    let v = 0; const RK = t.roadK, MUD = mb.mud, PAD = t.pad; const pd = new Float32Array(nx * nz);
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      const i = Math.min(i1, i0 + a * step), j = Math.min(j1, j0 + b * step), k = j * t.n + i;
      pos[v * 3] = t.i2x(i); pos[v * 3 + 1] = t.h[k]; pos[v * 3 + 2] = t.i2x(j);
      col[v * 3] = t.tint[k * 3]; col[v * 3 + 1] = t.tint[k * 3 + 1]; col[v * 3 + 2] = t.tint[k * 3 + 2];
      spl.set(mb.splat.subarray(k * 4, k * 4 + 4), v * 4); if (RK) { rk[v * 4] = RK[k * 3]; rk[v * 4 + 1] = RK[k * 3 + 1]; rk[v * 4 + 2] = RK[k * 3 + 2]; } if (MUD) rk[v * 4 + 3] = MUD[k]; if (PAD) pd[v] = PAD[k]; v++;
    }
    for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) { const p = b * nx + a; idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.BufferAttribute(spl, 4)); g.setAttribute('roadk', new THREE.BufferAttribute(rk, 4)); g.setAttribute('padk', new THREE.BufferAttribute(pd, 1));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = false; group.add(mesh);
  }
  return group;
}

function buildFarTerrain(mb, mat) {
  const t = mb.t; const S = 3000, seg = 120; const step = (2 * S) / seg; const n = seg + 1; const def = mb.def;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), spl = new Float32Array(n * n * 4), idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -S + i * step, z = -S + j * step; const v = j * n + i; const inside = Math.abs(x) < t.half - 1 && Math.abs(z) < t.half - 1;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    let h;
    if (inside) h = t.height(x, z) - 25;
    else { const hb = t.height(Math.max(-t.half, Math.min(t.half, x)), Math.max(-t.half, Math.min(t.half, z))); const f = smoothstep(t.half, t.half + 900, edge); h = hb * (1 - f * 0.5) + f * (60 + 160 * ridged(mb.noise, x / 900, z / 900, 4)) - 0.6; }
    pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
    const fc = def.farColor; col.set([fc[0] * 2.2, fc[1] * 2.2, fc[2] * 2.2], v * 3); spl.set([1, 0, 0, 0], v * 4);
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const p = j * n + i; idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.BufferAttribute(spl, 4)); g.setAttribute('roadk', new THREE.BufferAttribute(new Float32Array(n * n * 4), 4)); g.setAttribute('padk', new THREE.BufferAttribute(new Float32Array(n * n), 1));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = false; mesh.name = 'farTerrain'; return mesh;
}

export const waterTime = { value: 0 };
function heightTexture(t) {
  const n = t.n; const d = new Uint16Array(n * n); for (let k = 0; k < n * n; k++) d[k] = THREE.DataUtils.toHalfFloat(t.h[k]);
  const tex = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.HalfFloatType); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; return tex;
}
function waterMaterial(hTex, t, def) {
  const nt = waterNormalTexture();
  const fc = def.farColor, hz = (def.hdri && def.hdri.horizon) || [0.5, 0.55, 0.6];
  const WU = { uH: { value: hTex }, uHM: { value: new THREE.Vector2(1 / (t.res * t.n), (t.half / t.res + 0.5) / t.n) },
    uShallow: { value: new THREE.Color(...(def.waterShallow || [0.16, 0.2, 0.13])) }, uDeep: { value: new THREE.Color(...(def.waterDeep || [0.012, 0.04, 0.045])) },
    uBankT: { value: new THREE.Vector3(fc[0] / hz[0], fc[1] / hz[1], fc[2] / hz[2]).multiplyScalar(0.55) } };
  const m = new THREE.MeshPhysicalMaterial({ color: 0x1d3a3c, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.9, normalMap: nt, normalScale: new THREE.Vector2(1, 1), ior: 1.33, specularIntensity: 1, envMapIntensity: 1.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterTime; Object.assign(sh.uniforms, WU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPw; uniform float uT; uniform sampler2D uH; uniform vec2 uHM; uniform vec3 uShallow, uDeep, uBankT; float wDepth = 1.0; float wFoam = 0.0;`)
      .replace('#include <normal_fragment_maps>', `{
        vec2 p = vWPw.xz; float dist = length(vWPw - cameraPosition);
        vec3 n1 = texture2D(normalMap, p / 9.0 + vec2(uT * 0.021, uT * 0.013)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, p / 3.1 + vec2(-uT * 0.034, uT * 0.027)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, p / 31.0 + vec2(uT * 0.006, -uT * 0.009)).xyz * 2.0 - 1.0;
        float fade = 1.0 - smoothstep(40.0, 400.0, dist) * 0.7;
        vec2 s = (n1.xy * 0.55 + n2.xy * 0.35 * (1.0 - smoothstep(20.0, 120.0, dist)) + n3.xy * 0.5) * 0.32 * fade;
        s *= 1.0 - 0.7 * wFoam;
        normal = normalize((viewMatrix * vec4(s.x, 1.0, s.y, 0.0)).xyz);
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.75, wFoam);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { vec3 wN = inverseTransformDirection(normal, viewMatrix); vec3 rW = reflect(normalize(vWPw - cameraPosition), wN);
          float hzM = 1.0 - smoothstep(-0.02, 0.2, rW.y); reflectedLight.indirectSpecular *= mix(vec3(1.0), uBankT, hzM * 0.85);
          reflectedLight.directSpecular *= 1.0 - 0.8 * wFoam; reflectedLight.indirectSpecular *= 1.0 - 0.8 * wFoam; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 p = vWPw.xz; float dist = length(vWPw - cameraPosition);
        wDepth = vWPw.y - texture2D(uH, p * uHM.x + uHM.y).r; if (wDepth < 0.0) discard;
        { float fn = texture2D(normalMap, p / 2.6 + vec2(uT * 0.03, -uT * 0.02)).r + texture2D(normalMap, p / 7.0 - vec2(uT * 0.012, uT * 0.017)).g;
          float band = 0.5 + 0.5 * sin(wDepth * 22.0 - uT * 1.4 + fn * 3.0);
          float shore = 1.0 - smoothstep(0.03, 0.3, wDepth);
          wFoam = smoothstep(0.76, 1.05, fn * 0.6 + band * 0.4) * shore * smoothstep(0.0, 0.035, wDepth) * 0.75 * (1.0 - smoothstep(60.0, 220.0, dist)); } }
        { float ndv = abs(dot(normalize(cameraPosition - vWPw), vec3(0.0, 1.0, 0.0)));
          float dk = 1.0 - exp(-wDepth * 0.9);
          diffuseColor.rgb = mix(uShallow, uDeep, dk) * mix(1.1, 0.6, ndv);
          float a = mix(0.97, 0.82, ndv); a = mix(mix(0.3, 0.9, 1.0 - ndv), a, smoothstep(0.15, 1.8, wDepth));
          a *= smoothstep(0.0, 0.08, wDepth);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.78), wFoam); diffuseColor.a = max(a, wFoam * smoothstep(0.0, 0.05, wDepth)); }`);
  };
  m.customProgramCacheKey = () => 'water5d'; m.userData.WU = WU;
  return m;
}
function buildWater(mb, mat) {
  const group = new THREE.Group(); group.name = 'water';
  for (const rv of mb.rivers) {
    if (rv.dry) continue; const pts = rv.pts; const pos = [], uv = [], idx = []; const w = rv.width / 2 + 2.5; let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1;
      const nx = dz / l, nz = -dx / l; if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      pos.push(pts[i][0] + nx * w, pts[i][2], pts[i][1] + nz * w, pts[i][0] - nx * w, pts[i][2], pts[i][1] - nz * w);
      uv.push(acc / 12, 0, acc / 12, w * 2 / 12);
      if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.Mesh(g, mat); mesh.material.side = THREE.DoubleSide; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const lk of mb.lakes) { const g = new THREE.CircleGeometry(lk.r + 6, 48); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * lk.r / 6, uv.getY(i) * lk.r / 6); const mesh = new THREE.Mesh(g, mat); mesh.position.set(lk.x, lk.wl, lk.z); mesh.receiveShadow = true; group.add(mesh); }
  return group;
}

export class World {
  constructor(scene, mapId, quality = 'high') {
    this.scene = scene; this.quality = quality;
    const def = MAP_BY_ID[mapId] || MAP_BY_ID.kharkov;
    this.def = def;
    const mb = new MapBuilder(def, quality); this.mb = mb;
    this.terrain = mb.t; this.playHalf = mb.t.half;
    this.colliders = []; this.baseMarkers = []; this.capturePoints = [];
    setTexQuality(quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1);
    const mat = terrainMaterial(def);
    this.terrainMesh = buildTerrainMeshes(mb, mat, quality === 'low' ? 2 : 1); scene.add(this.terrainMesh);
    this.farTerrain = buildFarTerrain(mb, mat); scene.add(this.farTerrain);
    const hTex = heightTexture(mb.t);
    const wMat = waterMaterial(hTex, mb.t, def);
    this.water = buildWater(mb, wMat); scene.add(this.water);
    this.veg = new Vegetation(mb, quality); scene.add(this.veg.root);
    this.grass = new Grass(mb, quality); scene.add(this.grass.root);
    buildStructures(mb, this);
    // sun
    const sunDir = new THREE.Vector3(0.4, 0.55, 0.25).normalize(); this.sunDir = sunDir;
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2); sun.castShadow = true;
    sun.shadow.mapSize.set(quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024, quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 800; sun.shadow.camera.left = -120; sun.shadow.camera.right = 120; sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; scene.add(sun); scene.add(sun.target); this.sun = sun;
    this.shadowTexel = 240 / (sun.shadow.mapSize.x);
    // far sun for distant shadows
    if (quality !== 'low') {
      const fs = new THREE.DirectionalLight(0xfff4e0, 1.4); fs.castShadow = true;
      fs.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
      fs.shadow.camera.near = 1; fs.shadow.camera.far = 1400; fs.shadow.camera.left = -280; fs.shadow.camera.right = 280; fs.shadow.camera.top = 280; fs.shadow.camera.bottom = -280;
      fs.shadow.bias = -0.001; fs.shadow.normalBias = 0.04; scene.add(fs); scene.add(fs.target); this.farSun = fs; this._farFrame = 0; this._farAt = null;
      this.farTexel = 560 / fs.shadow.mapSize.x;
    }
    // base markers
    for (const b of mb.bases || []) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(6, 7.2, 32), new THREE.MeshBasicMaterial({ color: b.team === 0 ? 0x3a7a3a : 0x7a3a3a, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, mb.t.height(b.x, b.z) + 0.05, b.z); scene.add(ring);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 8, 4), new THREE.MeshStandardMaterial({ color: b.team === 0 ? 0x4a8a4a : 0x8a4a4a, side: THREE.DoubleSide }));
      flag.position.set(b.x, mb.t.height(b.x, b.z) + 4, b.z); scene.add(flag);
      this.baseMarkers.push({ ring, flag });
    }
  }
  updateShadowCenter(target) {
    const s = this.sun; const L = this.sunDir; const ty0 = this.terrain.height(target.x, target.z);
    if (!this._lr) { this._lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), L).normalize(); this._lu = new THREE.Vector3().crossVectors(L, this._lr).normalize(); }
    const P = new THREE.Vector3(target.x, ty0, target.z); const tx_ = this.shadowTexel;
    const a = Math.round(P.dot(this._lr) / tx_) * tx_, b = Math.round(P.dot(this._lu) / tx_) * tx_, c = P.dot(L);
    const C = this._lr.clone().multiplyScalar(a).addScaledVector(this._lu, b).addScaledVector(L, c);
    s.target.position.copy(C); s.position.copy(C).addScaledVector(L, 400); s.target.updateMatrixWorld();
    const f = this.farSun;
    if (f) {
      const ft = this.farTexel; const fa = Math.round(P.dot(this._lr) / ft) * ft, fb = Math.round(P.dot(this._lu) / ft) * ft;
      const moved = !this._farAt || Math.hypot(target.x - this._farAt.x, target.z - this._farAt.z) > 40;
      if (moved || ++this._farFrame >= 20) {
        this._farFrame = 0; this._farAt = { x: target.x, z: target.z };
        const FC = this._lr.clone().multiplyScalar(fa).addScaledVector(this._lu, fb).addScaledVector(L, c);
        f.target.position.copy(FC); f.position.copy(FC).addScaledVector(L, 700); f.target.updateMatrixWorld(); f.updateMatrixWorld(); f.shadow.needsUpdate = true;
      }
    }
  }
  update(dt, time, camPos) {
    this.veg.updateLOD(camPos); this.veg.update(dt); this.grass.update(camPos);
    waterTime.value = time;
    if ((this._flagFrame = (this._flagFrame || 0) + 1) % 3 === 0) for (const b of this.baseMarkers) { const p = b.flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.3; p.setZ(i, Math.sin(time * 4 + x * 2.2) * 0.12 * x); } p.needsUpdate = true; }
  }
  groundHeight(x, z) { return this.terrain.height(x, z); }
  deckAt(x, z) { return -1e9; }
}
