// Builds a complete battlefield scene from a map definition.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { MapBuilder } from './mapgen.js';
import { MAP_BY_ID } from './maps.js';
import { buildStructures } from './buildings.js';
import { Vegetation, windUniform, sunU } from './vegetation.js';
import { Grass } from './grass.js';
import { GroundDetails } from './groundDetails.js';
import { coarseTerrainIndices, updateTerrainLOD } from './terrainLod.js';
import { pbrTex, waterNormalTexture, setTexQuality } from './textures.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Grid2D, OBB } from './terrain.js';
import { DEG, ridged, smoothstep } from '../util.js';

function terrainMaterial(def, quality) {
  const L = def.layers;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true });
  if (quality === 'low') m.defines = { TERRAIN_LOW: 1 };
  const U = {
    tA: { value: pbrTex(L.A, 'diff') }, tB: { value: pbrTex(L.B, 'diff') }, tC: { value: pbrTex(L.C, 'diff') }, tD: { value: pbrTex(L.D, 'diff') },
    nA: { value: pbrTex(L.A, 'nor') }, nD: { value: pbrTex(L.D, 'nor') },
    ...(quality !== 'low' ? {
      nB: { value: pbrTex(L.B, 'nor') }, nC: { value: pbrTex(L.C, 'nor') },
      aA: { value: pbrTex(L.A, 'arm') }, aB: { value: pbrTex(L.B, 'arm') },
      aC: { value: pbrTex(L.C, 'arm') }, aD: { value: pbrTex(L.D, 'arm') },
    } : {}),
    terrainDetail: { value: def.id === 'desert' ? 1 : def.id === 'forest' ? 2 : 0 },
    tintA: { value: new THREE.Vector3(...L.tintA) }, tintB: { value: new THREE.Vector3(...L.tintB) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; attribute vec3 roadDetail; attribute vec2 terrainLight; varying vec2 vTerrainLight; varying vec3 vRoad; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vRoad = roadDetail; vTerrainLight = terrainLight; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tA, tB, tC, tD, nA, nB, nC, nD, aA, aB, aC, aD; uniform vec3 tintA, tintB; uniform int terrainDetail; varying vec2 vTerrainLight; varying vec3 vRoad; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN; float tAO = 1.0;
      vec3 sampleL(sampler2D t, vec2 uv, float far) {
        vec3 a = texture2D(t, uv).rgb;
        #ifdef TERRAIN_LOW
          return a;
        #else
          vec3 b = texture2D(t, uv * 0.173).rgb;
          return mix(a, (a + b) * 0.5, far);
        #endif
      }`)
      .replace('#include <map_fragment>', `
        float camD = length(vWP - cameraPosition); float far = smoothstep(25.0, 140.0, camD);
        vec2 uv = vWP.xz / 3.2; vec2 uvr = vWP.xz / 6.0; vec2 uvd = vWP.xz / 3.5;
        vec4 w = vSplat; w = max(w, 0.0);
        // macro breakup so layer borders are not smooth gradients
        float br = texture2D(tC, vWP.xz / 41.0).r; float br2 = texture2D(tA, vWP.xz / 133.0).g;
        w.y *= 0.55 + br * 0.9; w.x *= 0.8 + br2 * 0.4;
        // v5: steep slopes expose bedrock regardless of the painted splat
        vec3 wn = normalize(vWN); float steep = smoothstep(0.28, 0.55, 1.0 - wn.y); w.z += steep * 2.5 * (1.0 - w.w); w.xy *= 1.0 - steep * 0.85;
        vec3 cA = sampleL(tA, uv, far) * tintA, cB = sampleL(tB, uv * 1.1, far) * tintB, cC = sampleL(tC, uvr, far), cD = sampleL(tD, uvd, far);
        vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        if (steep > 0.01) { cC = texture2D(tC, vWP.zy / 6.0).rgb * bw.x + cC * bw.y + texture2D(tC, vWP.xy / 6.0).rgb * bw.z; }
        #ifndef TERRAIN_LOW
          vec3 rA = texture2D(aA, uv).rgb, rB = texture2D(aB, uv * 1.1).rgb, rC = texture2D(aC, uvr).rgb, rD = texture2D(aD, uvd).rgb;
        #endif
        // height blending: each texture's luminance acts as its height map, giving natural interlocking transitions
        vec4 hgt = vec4(dot(cA, vec3(0.33)), dot(cB, vec3(0.33)), dot(cC, vec3(0.33)), dot(cD, vec3(0.33))) * 0.6 + w * 1.4;
        float hmax = max(max(hgt.x, hgt.y), max(hgt.z, hgt.w)) - 0.18;
        vec4 hb = max(hgt - hmax, 0.0) * step(0.001, w); w = hb / (hb.x + hb.y + hb.z + hb.w + 1e-4);
        vec3 col = cA * w.x + cB * w.y + cC * w.z + cD * w.w;
        #ifdef TERRAIN_LOW
          float tRough = dot(w, vec4(0.92, 0.95, 0.88, 0.91));
        #else
          float tRough = mix(0.72, 1.0, clamp(rA.g * w.x + rB.g * w.y + rC.g * w.z + rD.g * w.w, 0.0, 1.0));
          tAO = mix(rA.r * w.x + rB.r * w.y + rC.r * w.z + rD.r * w.w, 1.0, far * 0.8);
        #endif
        col *= 0.82 + 0.36 * texture2D(tB, vWP.xz / 97.0).g;
        col *= mix(0.92, 1.06, smoothstep(0.2, 0.8, texture2D(tA, vWP.xz / 260.0).r));
        // v4 patchwork: large irregular parcels (fields / meadows / dry patches) tint the ground layer differently
        {
          vec2 pc = mat2(0.94, -0.34, 0.34, 0.94) * vWP.xz + (vec2(br, br2) - 0.5) * 30.0;
          vec2 cell = floor(pc / vec2(86.0, 64.0)); float hs = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 pt = hs < 0.33 ? vec3(1.07, 1.02, 0.80) : hs < 0.66 ? vec3(0.90, 1.0, 0.88) : vec3(1.0, 0.95, 0.9);
          col *= mix(vec3(1.0), pt, w.x * 0.85);
        }
        // Wheel ruts follow the road spline in metres. Fine material detail is
        // blended out in the distance to keep the ground stable when moving.
        float roadFade = vRoad.z * w.w * (1.0 - smoothstep(55.0, 155.0, camD));
        float shoulder = abs(vRoad.x);
        float track = 1.0 - smoothstep(0.23, 0.59, abs(shoulder - 0.97) + (br - 0.5) * 0.19);
        float disturbed = texture2D(tD, vec2(vRoad.x * 0.54, vRoad.y * 0.27)).r;
        col *= mix(1.0, 0.71 + 0.19 * disturbed, roadFade * track);
        float ripple = sin(18.0 * (vWP.x * 0.72 + vWP.z * 0.69) + br * 6.0 + br2 * 2.2);
        float fine = (1.0 - smoothstep(12.0, 48.0, camD)) * (1.0 - steep) * (1.0 - w.w);
        if (terrainDetail == 0) {
          vec2 fields = mat2(0.94, -0.34, 0.34, 0.94) * vWP.xz;
          vec2 cell = fields / vec2(86.0, 64.0);
          vec2 edge = min(fract(cell), 1.0 - fract(cell));
          float parcel = fract(sin(dot(floor(cell), vec2(23.17, 54.82))) * 16453.3);
          float rows = sin(mix(fields.x, fields.y, step(0.5, parcel)) * 8.7 + br * 0.5);
          float tilled = smoothstep(0.04, 0.14, min(edge.x, edge.y)) * smoothstep(0.45, 0.75, parcel);
          col *= 1.0 + fine * w.x * tilled * (0.07 * rows - 0.08);
        }
        if (terrainDetail == 1) col *= 1.0 + fine * w.x * ripple * 0.055;
        if (terrainDetail == 2) col *= 1.0 - fine * w.x * 0.23 * smoothstep(0.52, 0.82, br * 0.65 + br2 * 0.6);
        col *= mix(vec3(1.0), vec3(0.76, 0.79, 0.68), vTerrainLight.y * 0.74);
        tRough = mix(tRough, 0.66, vTerrainLight.y * 0.58);
        diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(tRough, 0.95, far * 0.5);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tAO; reflectedLight.indirectSpecular *= tAO * tAO; reflectedLight.directDiffuse *= mix(1.0, tAO, 0.5) * vTerrainLight.x; reflectedLight.directSpecular *= vTerrainLight.x;')
      .replace('#include <normal_fragment_maps>', `
        {
          #ifdef TERRAIN_LOW
            vec3 nm = mix(texture2D(nA, uv).xyz, texture2D(nD, uvd).xyz, w.w) * 2.0 - 1.0;
          #else
            vec3 nm = (texture2D(nA, uv).xyz * w.x + texture2D(nB, uv * 1.1).xyz * w.y + texture2D(nC, uvr).xyz * w.z + texture2D(nD, uvd).xyz * w.w) * 2.0 - 1.0;
          #endif
          nm.xy *= (1.0 - far * 0.7) * 0.9;
          nm.xy += vec2(0.69, 0.72) * fine * w.x * ripple * (terrainDetail == 1 ? 0.12 : 0.0);
          vec3 T = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz; vec3 Bt = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          T = normalize(T - normal * dot(normal, T)); Bt = normalize(Bt - normal * dot(normal, Bt) - T * dot(T, Bt));
          normal = normalize(T * nm.x + Bt * nm.y + normal * nm.z);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain7-' + quality;
  return m;
}

// Shade terrain beneath opposing ridges with the same sun direction as the
// directional light. A coarse field avoids a second terrain shadow pass.
function bakeTerrainSun(terrain, direction, overcast) {
  const side = Math.ceil(terrain.half * 2 / 8) + 1;
  const spacing = terrain.half * 2 / (side - 1);
  const exposure = new Float32Array(side * side);
  const horizontal = Math.hypot(direction.x, direction.z) || 1;
  const ux = direction.x / horizontal, uz = direction.z / horizontal;
  const slope = direction.y / horizontal;
  const strength = overcast ? 0.22 : 0.55;
  const distances = [10, 16, 24, 36, 54, 81, 121, 180];
  for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) {
    const x = col * spacing - terrain.half, z = row * spacing - terrain.half;
    const y = terrain.height(x, z);
    let horizon = -Infinity;
    for (const d of distances) horizon = Math.max(horizon, (terrain.height(x + ux * d, z + uz * d) - y) / d);
    exposure[row * side + col] = 1 - strength * smoothstep(slope - 0.035, slope + 0.085, horizon);
  }
  return (x, z) => {
    const gx = Math.max(0, Math.min(side - 1, (x + terrain.half) / spacing));
    const gz = Math.max(0, Math.min(side - 1, (z + terrain.half) / spacing));
    const ix = Math.min(side - 2, Math.floor(gx)), iz = Math.min(side - 2, Math.floor(gz));
    const f = gx - ix, g = gz - iz;
    const a = iz * side + ix, b = a + side;
    return (exposure[a] * (1 - f) + exposure[a + 1] * f) * (1 - g)
      + (exposure[b] * (1 - f) + exposure[b + 1] * f) * g;
  };
}

function buildTerrainMeshes(mb, mat, step, refine, exposure) {
  const t = mb.t; const tiles = 7; const per = Math.floor((t.n - 1) / tiles); const group = new THREE.Group(); group.name = 'terrain';
  const lodTiles = [], indexCache = new Map();
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const i0 = tx * per, j0 = ty * per, i1 = tx === tiles - 1 ? t.n - 1 : i0 + per, j1 = ty === tiles - 1 ? t.n - 1 : j0 + per;
    const nx = Math.ceil((i1 - i0) / step) + 1, nz = Math.ceil((j1 - j0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), spl = new Float32Array(nx * nz * 4), idx = [];
    const normal = new Float32Array(nx * nz * 3), road = new Float32Array(nx * nz * 3), light = new Float32Array(nx * nz * 2);
    let maxY = -Infinity;
    let v = 0;
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      const i = Math.min(i1, i0 + a * step), j = Math.min(j1, j0 + b * step), k = j * t.n + i;
      pos[v * 3] = t.i2x(i); pos[v * 3 + 1] = t.h[k]; pos[v * 3 + 2] = t.i2x(j);
      maxY = Math.max(maxY, t.h[k]);
      light[v * 2] = exposure(pos[v * 3], pos[v * 3 + 2]);
      light[v * 2 + 1] = 1 - smoothstep(0.04, 0.84, Math.abs(t.h[k] - t.water[k]));
      col[v * 3] = t.tint[k * 3]; col[v * 3 + 1] = t.tint[k * 3 + 1]; col[v * 3 + 2] = t.tint[k * 3 + 2];
      const il = Math.max(0, i - 1), ir = Math.min(t.n - 1, i + 1);
      const jl = Math.max(0, j - 1), jr = Math.min(t.n - 1, j + 1);
      const gx = (t.h[j * t.n + il] - t.h[j * t.n + ir]) / ((ir - il) * t.res);
      const gz = (t.h[jl * t.n + i] - t.h[jr * t.n + i]) / ((jr - jl) * t.res);
      const scale = 1 / Math.hypot(gx, 1, gz);
      normal.set([gx * scale, scale, gz * scale], v * 3);
      road[v * 3] = mb.roadDetail[k * 3];
      road[v * 3 + 1] = mb.roadDetail[k * 3 + 1];
      road[v * 3 + 2] = mb.roadDetail[k * 3 + 2];
      spl.set(mb.splat.subarray(k * 4, k * 4 + 4), v * 4); v++;
    }
    const centers = [], centerColors = [], centerSplats = [], centerRoads = [], centerNormals = [], centerLights = [];
    const average = (source, stride, corners, dest) => {
      for (let k = 0; k < stride; k++) dest.push(corners.reduce((sum, i) => sum + source[i * stride + k], 0) / 4);
    };
    for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) {
      const p = b * nx + a, q = p + 1, r = p + nx, s = r + 1;
      // A bilinear cell with a twisted diagonal needs an extra vertex to
      // stay close to the heightfield sampled by vehicles and projectiles.
      const twist = Math.abs(pos[p * 3 + 1] + pos[s * 3 + 1] - pos[q * 3 + 1] - pos[r * 3 + 1]);
      if (!refine || twist < 0.12) { idx.push(p, r, q, q, r, s); continue; }
      const center = v + centers.length / 3;
      const corners = [p, q, r, s];
      average(pos, 3, corners, centers);
      average(col, 3, corners, centerColors);
      average(spl, 4, corners, centerSplats);
      average(road, 3, corners, centerRoads);
      average(normal, 3, corners, centerNormals);
      average(light, 2, corners, centerLights);
      idx.push(p, r, center, r, s, center, s, q, center, q, p, center);
    }
    const append = (base, extra) => {
      if (!extra.length) return base;
      const all = new Float32Array(base.length + extra.length);
      all.set(base); all.set(extra, base.length);
      return all;
    };
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(append(pos, centers), 3)); g.setAttribute('color', new THREE.BufferAttribute(append(col, centerColors), 3)); g.setAttribute('splat', new THREE.BufferAttribute(append(spl, centerSplats), 4));
    g.setAttribute('normal', new THREE.BufferAttribute(append(normal, centerNormals), 3));
    g.setAttribute('roadDetail', new THREE.BufferAttribute(append(road, centerRoads), 3));
    g.setAttribute('terrainLight', new THREE.BufferAttribute(append(light, centerLights), 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; group.add(mesh);
    if (nx <= 2 || nz <= 2) continue;
    const coarse = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(g.attributes)) coarse.setAttribute(name, attribute);
    const indexKey = nx + ':' + nz;
    if (!indexCache.has(indexKey)) indexCache.set(indexKey, coarseTerrainIndices(nx, nz, 4));
    const indices = indexCache.get(indexKey);
    coarse.setIndex(indices);
    coarse.boundingSphere = g.boundingSphere.clone();
    const distant = new THREE.Mesh(coarse, mat);
    distant.receiveShadow = true; distant.visible = false; group.add(distant);
    lodTiles.push({ near: mesh, far: distant, minX: t.i2x(i0), maxX: t.i2x(i1), minZ: t.i2x(j0), maxZ: t.i2x(j1), maxY });
  }
  group.userData.lodTiles = lodTiles;
  return group;
}

function buildFarTerrain(mb) {
  const t = mb.t; const S = 3000, seg = 120; const step = (2 * S) / seg; const n = seg + 1; const def = mb.def;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -S + i * step, z = -S + j * step; const v = j * n + i; const inside = Math.abs(x) < t.half - 1 && Math.abs(z) < t.half - 1;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    let h;
    if (inside) h = t.height(x, z) - 25;
    else { const hb = t.height(Math.max(-t.half, Math.min(t.half, x)), Math.max(-t.half, Math.min(t.half, z))); const f = smoothstep(t.half, t.half + 900, edge); h = hb * (1 - f * 0.5) + f * (60 + 160 * ridged(mb.noise, x / 900, z / 900, 4)) - 0.6; }
    pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
    const fc = def.farColor; col.set([fc[0] * 2.2, fc[1] * 2.2, fc[2] * 2.2], v * 3); uv.set([x / 18, z / 18], v * 2);
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const p = j * n + i; idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: pbrTex(def.layers.A, 'diff'), vertexColors: true, roughness: 0.98 });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'farTerrain'; return mesh;
}

export const waterTime = { value: 0 };
function waterMaterial() {
  const nt = waterNormalTexture();
  const m = new THREE.MeshPhysicalMaterial({ color: 0x1d3a3c, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.9, normalMap: nt, normalScale: new THREE.Vector2(1, 1), ior: 1.33, specularIntensity: 1, envMapIntensity: 1.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float waterDepth; attribute vec2 waterFlow; varying vec2 vWaterFlow; varying float vWaterDepth; varying vec3 vWPw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPw = (modelMatrix * vec4(transformed, 1.0)).xyz; vWaterDepth = waterDepth; vWaterFlow = waterFlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw; varying float vWaterDepth; varying vec2 vWaterFlow; uniform float uT;')
      .replace('#include <normal_fragment_maps>', `{
        vec2 p = vWPw.xz; float dist = length(vWPw - cameraPosition);
        vec3 n1 = texture2D(normalMap, p / 9.0 - vWaterFlow * (uT * 0.021)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, p / 3.1 - (vWaterFlow * 0.038 + vec2(-0.007, 0.005)) * uT).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, p / 31.0 + vec2(uT * 0.006, -uT * 0.009)).xyz * 2.0 - 1.0;
        float fade = 1.0 - smoothstep(40.0, 400.0, dist) * 0.7;
        vec2 s = (n1.xy * 0.55 + n2.xy * 0.35 * (1.0 - smoothstep(20.0, 120.0, dist)) + n3.xy * 0.5) * 0.32 * fade;
        normal = normalize((viewMatrix * vec4(s.x, 1.0, s.y, 0.0)).xyz);
      }`)
      // view-dependent body colour: looking straight down you see the dark, slightly green depth; grazing angles are mirror-like (Fresnel via IBL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float ndv = abs(dot(normalize(cameraPosition - vWPw), vec3(0.0, 1.0, 0.0)));
          float deep = smoothstep(0.04, 1.9, vWaterDepth);
          float caustic = sin(vWPw.x * 2.1 + cos(vWPw.z * 2.6 + uT * 0.24))
                       * sin(vWPw.z * 1.9 - vWPw.x * 1.2 - uT * 0.34);
          float shallow = (1.0 - deep) * ndv;
          diffuseColor.rgb *= mix(1.25, 0.65, ndv);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.16, 0.105) * (1.0 + caustic * 0.09), shallow * 0.72);
          float shore = (1.0 - smoothstep(0.12, 0.34, abs(vWaterDepth - 0.11))) * smoothstep(0.33, 0.84, caustic);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.25, 0.20), shore * 0.34);
          diffuseColor.a = mix(0.96, mix(0.62, 0.86, deep), ndv);
        }`);
  };
  m.customProgramCacheKey = () => 'water7';
  return m;
}
function buildWater(mb, mat) {
  const group = new THREE.Group(); group.name = 'water';
  for (const rv of mb.rivers) {
    if (rv.dry) continue;
    const pts = rv.pts, pos = [], uv = [], depth = [], flow = [], idx = [];
    const half = rv.width / 2 + 2.5, lanes = 9;
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, h] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
      if (i > 0) along += Math.hypot(x - a[0], z - a[1]);
      for (let j = 0; j < lanes; j++) {
        const offset = (1 - 2 * j / (lanes - 1)) * half;
        const px = x + dz / length * offset, pz = z - dx / length * offset;
        pos.push(px, h, pz);
        uv.push(along / 12, (half - offset) / 12);
        depth.push(h - mb.t.height(px, pz));
        flow.push(dx / length, dz / length);
        if (i < pts.length - 1 && j < lanes - 1) {
          const k = i * lanes + j;
          idx.push(k, k + lanes, k + 1, k + 1, k + lanes, k + lanes + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(depth, 1));
    geometry.setAttribute('waterFlow', new THREE.Float32BufferAttribute(flow, 2));
    geometry.setIndex(idx);
    const normal = new Float32Array(pos.length);
    for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.material.side = THREE.DoubleSide; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const lk of mb.lakes) {
    const geometry = new THREE.RingGeometry(0, lk.r + 6, 64, 16);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position, uv = geometry.attributes.uv;
    const depth = new Float32Array(position.count), flow = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      depth[i] = lk.wl - mb.t.height(lk.x + position.getX(i), lk.z + position.getZ(i));
      flow[i * 2] = -position.getZ(i) / (lk.r + 6) * 0.14;
      flow[i * 2 + 1] = position.getX(i) / (lk.r + 6) * 0.14;
      uv.setXY(i, uv.getX(i) * lk.r / 6, uv.getY(i) * lk.r / 6);
    }
    geometry.setAttribute('waterDepth', new THREE.BufferAttribute(depth, 1));
    geometry.setAttribute('waterFlow', new THREE.BufferAttribute(flow, 2));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(lk.x, lk.wl, lk.z); mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}

export class World {
  constructor(renderer, mapId, quality = 'high') {
    const def = MAP_BY_ID[mapId]; this.def = def; this.quality = quality;
    const t0 = performance.now();
    const mb = new MapBuilder(def, quality); def.generate(mb); this.mb = mb; this.terrain = mb.t;
    this.genTime = performance.now() - t0;
    const scene = new THREE.Scene(); this.scene = scene;
    // sky + lighting (v5: Poly Haven HDRI sky + image-based lighting, physically matched sun)
    setTexQuality(quality);
    const H = def.hdri;
    const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky); this.sky = sky;
    const su = sky.material.uniforms; su.turbidity.value = def.turbidity; su.rayleigh.value = def.rayleigh; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.82;
    const phi = (90 - def.sun.elevation) * DEG, theta = def.sun.azimuth * DEG; this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    if (H) this.sunDir.set(...H.sunDir).normalize();
    su.sunPosition.value.copy(this.sunDir);
    const pm = new THREE.PMREMGenerator(renderer); this.pm = pm; const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); envScene.add(sky2);
    Object.assign(sky2.material.uniforms.turbidity, { value: def.turbidity }); sky2.material.uniforms.rayleigh.value = def.rayleigh; sky2.material.uniforms.sunPosition.value.copy(this.sunDir);
    sky2.material.uniforms.mieCoefficient.value = 0.006;
    this.envRT = pm.fromScene(envScene, 0, 0.1, 2000); scene.environment = this.envRT.texture; scene.environmentIntensity = 0.7;
    sky2.geometry.dispose(); sky2.material.dispose();
    const fogDen = H ? H.fogDensity : def.fog.density;
    scene.fog = new THREE.FogExp2(H ? new THREE.Color().setRGB(...H.horizon) : def.fog.color, fogDen);
    const sunCol = new THREE.Color().setHSL(0.1, 0.5, def.sun.elevation < 25 ? 0.78 : 0.92);
    const sun = new THREE.DirectionalLight(sunCol, def.sun.elevation < 25 ? 2.8 : 3.3); sun.castShadow = true;
    if (H) { const e = H.sunE; const m = Math.max(...e); sun.color.setRGB(e[0] / m, e[1] / m, e[2] / m); sun.intensity = m; }
    const sm = Math.min(renderer.capabilities.maxTextureSize, quality === 'high' ? 3072 : quality === 'medium' ? 1536 : 1024);
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    this.shadowInterval = quality === 'high' ? 1 / 30 : 1 / 24;
    this.shadowUpdatedAt = -Infinity;
    this.shadowFocus = new THREE.Vector3();
    const S = quality === 'high' ? 88 : 102; this.shadowS = S; this.shadowTexel = (2 * S) / sm;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 800 });
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = this.shadowTexel * 1.6; if (H && H.overcast) sun.shadow.radius = 6; else sun.shadow.radius = 2;
    scene.add(sun); scene.add(sun.target); this.sun = sun;
    sunU.uSunDir.value.copy(this.sunDir); sunU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
    const hemi = new THREE.HemisphereLight(0xbfd4ff, new THREE.Color(...def.farColor).multiplyScalar(1.2), 0.7); scene.add(hemi); this.hemi = hemi;
    this.hdrLoaded = !H; this.exposure = H ? H.exposure : null;
    if (H) this._loadHdri(renderer, H, quality);
    // terrain
    const tmat = terrainMaterial(def, quality); this.terrainMat = tmat;
    const exposure = bakeTerrainSun(mb.t, this.sunDir, H?.overcast);
    this.terrainDetailDistance = quality === 'high' ? 160 : quality === 'medium' ? 112 : 80;
    this.terrainGroup = buildTerrainMeshes(mb, tmat, quality === 'low' ? 2 : 1, quality === 'high', exposure); scene.add(this.terrainGroup);
    this.far = buildFarTerrain(mb); scene.add(this.far);
    this.waterMat = waterMaterial(); this.water = buildWater(mb, this.waterMat); scene.add(this.water);
    // structures and vegetation
    const st = buildStructures(mb, scene, mb.t); this.colliders = st.colliders; this.decks = st.decks || [];
    this.structureMaterials = st.materials;
    this.colGrid = new Grid2D(mb.t.half, 24); for (const c of this.colliders) this.colGrid.insert(c, c.x, c.z, c.r);
    this.veg = new Vegetation(scene, mb, quality);
    this.grass = new Grass(scene, mb, quality, windUniform);
    this.groundDetails = new GroundDetails(scene, mb, quality);
    this.bases = mb.bases; this.lanes = mb.lanes; this.playHalf = mb.play;
    this.stats = { trees: mb.trees.length, bushes: mb.bushes.length, buildings: mb.buildings.length, rocks: mb.rocks.length, walls: mb.walls.length, bridges: mb.bridges.length };
    // base flags
    this.baseMarkers = [];
    for (let i = 0; i < this.bases.length; i++) {
      const b = this.bases[i]; const y = this.terrain.height(b.x, b.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.r - 1.2, b.r, 96), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x3fa34d : 0xc0392b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, y + 0.4, b.z); ring.renderOrder = 2; scene.add(ring);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7, roughness: 0.4 })); pole.position.set(b.x, y + 6, b.z); pole.castShadow = true; scene.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 8, 4), new THREE.MeshStandardMaterial({ color: i === 0 ? 0x3fa34d : 0xc0392b, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(b.x + 1.3, y + 11, b.z); scene.add(flag);
      this.baseMarkers.push({ ring, pole, flag });
    }
  }
  _loadHdri(renderer, H, quality) {
    const res = quality === 'low' ? '1k' : '2k';
    new RGBELoader().setDataType(THREE.FloatType).load(`./tex/${H.file}_${res}.hdr`, (tex) => {
      if (this.disposed) { tex.dispose(); return; }
      // clamp the sun disc: its energy is carried by the DirectionalLight (measured from this HDRI), so IBL must not count it twice
      const d = tex.image.data; for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; if (l > 40) { const k = 40 / l; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } }
      // below the horizon puresky maps are a flat fill; tint it with the ground so the lower hemisphere bounces the right colour
      const W = tex.image.width, Hh = tex.image.height, fc = this.def.farColor;
      for (let y = Math.floor(Hh * 0.52); y < Hh; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const g = 0.35 * (0.6 + 0.4 * (d[i] + d[i + 1] + d[i + 2]) / 3); d[i] = fc[0] * g * 2.0; d[i + 1] = fc[1] * g * 2.0; d[i + 2] = fc[2] * g * 2.0; }
      tex.needsUpdate = true; tex.mapping = THREE.EquirectangularReflectionMapping;
      const rt = this.pm.fromEquirectangular(tex); if (this.envRT) this.envRT.dispose(); this.envRT = rt;
      this.scene.environment = rt.texture; this.scene.environmentIntensity = 1.0;
      this.scene.background = tex; this.scene.backgroundIntensity = 1.0; this.bgTex = tex;
      this.sky.visible = false;
      // The pure-sky probe has no photographed ground bounce. A modest
      // hemisphere fill keeps the underside of eaves and tree crowns legible.
      this.hemi.color.setRGB(...H.horizon);
      this.hemi.intensity = H.overcast ? 0.24 : 0.17;
      this.hdrLoaded = true;
    });
  }
  // ground height including bridges (terrain already raised under roads)
  groundHeight(x, z) { const t = this.terrain.height(x, z); const d = this.deckAt(x, z); return d > t ? d : t; }
  // bridge deck surface height at (x,z) or -Infinity when not over a deck
  deckAt(x, z) {
    let best = -Infinity;
    for (const d of this.decks) {
      const bx = d.box; if (x < bx[0] || x > bx[1] || z < bx[2] || z > bx[3]) continue;
      for (const sg of d.segs) {
        const dx = x - sg.ax, dz = z - sg.az; const along = dx * sg.ux + dz * sg.uz; if (along < -0.3 || along > sg.l + 0.3) continue;
        if (Math.abs(dx * sg.uz - dz * sg.ux) > d.hw + 0.3) continue;
        const y = d.deckY(Math.max(0, Math.min(d.len, sg.s0 + along)) / d.len); if (y > best) best = y;
      }
    }
    return best;
  }
  updateTerrainLOD(camera) { updateTerrainLOD(this.terrainGroup.userData.lodTiles, camera, this.terrainDetailDistance); }
  updateShadowCenter(target, time = 0) {
    // Shadow maps need fewer updates than the visible pose. Refresh at once
    // after a teleport or camera handoff so a stale map never follows it.
    if (time - this.shadowUpdatedAt < this.shadowInterval
      && this.shadowFocus.distanceToSquared(target) < 12 * 12) return;
    this.shadowUpdatedAt = time;
    this.shadowFocus.copy(target);
    // stable shadows: snap the shadow centre to whole shadow-map texels in light space (no shimmering when moving)
    const s = this.sun; const L = this.sunDir; const ty0 = this.terrain.height(target.x, target.z);
    if (!this._lr) { this._lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), L).normalize(); this._lu = new THREE.Vector3().crossVectors(L, this._lr).normalize(); }
    const P = new THREE.Vector3(target.x, ty0, target.z); const tx_ = this.shadowTexel;
    const a = Math.round(P.dot(this._lr) / tx_) * tx_, b = Math.round(P.dot(this._lu) / tx_) * tx_, c = P.dot(L);
    const C = this._lr.clone().multiplyScalar(a).addScaledVector(this._lu, b).addScaledVector(L, c);
    s.target.position.copy(C); s.position.copy(C).addScaledVector(L, 400); s.target.updateMatrixWorld();
    s.shadow.needsUpdate = true;
  }
  update(dt, time, camPos) {
    this.veg.updateLOD(camPos); this.veg.update(dt); this.grass.update(camPos); this.groundDetails.update(camPos);
    waterTime.value = time;
    for (const b of this.baseMarkers) { const p = b.flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.3; p.setZ(i, Math.sin(time * 4 + x * 2.2) * 0.12 * x); } p.needsUpdate = true; }
  }
  addEarthwork(tank, vehicles) {
    const yaw = tank.heading, dx = Math.sin(yaw), dz = Math.cos(yaw);
    const reach = tank.spec.dims.L / 2 + 1.9;
    const x = tank.pos.x + reach * dx, z = tank.pos.z + reach * dz;
    const hx = 2.45, hz = 0.68, radius = Math.hypot(hx, hz);
    if (Math.abs(x) + radius > this.playHalf - 4 || Math.abs(z) + radius > this.playHalf - 4) return null;
    const samples = [[x, z]];
    for (const u of [-hx, hx]) for (const v of [-hz, hz]) samples.push([x + dz * u + dx * v, z - dx * u + dz * v]);
    const heights = samples.map(([sx, sz]) => this.terrain.height(sx, sz));
    if (samples.some(([sx, sz], i) => this.terrain.waterLevel(sx, sz) > heights[i] - 0.04
      || this.deckAt(sx, sz) > heights[i])) return null;
    const y0 = Math.min(...heights) - 0.08;
    if (Math.max(...heights) - y0 > 0.38) return null;
    if (this.colGrid.query(x, z, radius).some(c => c.circle(x, z, radius))) return null;
    if (this.veg.rockGrid.query(x, z, radius).some(r => Math.hypot(r.x - x, r.z - z) < r.s + radius)) return null;
    if (this.veg.treeGrid.query(x, z, radius).some(r => r.alive && Math.hypot(r.x - x, r.z - z) < radius)) return null;
    if (vehicles.some(other => other !== tank &&
      Math.hypot(other.pos.x - x, other.pos.z - z) < radius + Math.hypot(other.spec.dims.W, other.spec.dims.L) / 2)) return null;

    const height = 1.62, y1 = y0 + height;
    const shape = new OBB(x, z, hx, hz, yaw, y0, y1, 'earthwork');
    this.earthworkMaterial ??= new THREE.MeshStandardMaterial({
      color: new THREE.Color(...this.def.farColor).multiplyScalar(0.66), roughness: 1,
      map: pbrTex(this.def.layers.A, 'diff'),
    });
    const geometry = new THREE.BoxGeometry(hx * 2, height, hz * 2);
    const mesh = new THREE.Mesh(geometry, this.earthworkMaterial);
    mesh.position.set(x, (y0 + y1) / 2, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push(shape);
    this.colGrid.insert(shape, x, z, radius);
    this.sun.shadow.needsUpdate = true;
    return shape;
  }
  // line of sight blocked by terrain or structures? (eye -> target)
  losBlocked(ax, ay, az, bx, by, bz) {
    if (this.terrain.segmentHit(ax, ay, az, bx, by, bz, 4) >= 0) return true;
    for (const c of this.colGrid.querySegment(ax, az, bx, bz)) if (c.kind !== 'prop' && c.segment(ax, ay, az, bx, by, bz) >= 0) return true;
    return false;
  }
  // first structure hit along segment (t in 0..1) or -1
  structureHit(ax, ay, az, bx, by, bz, padding = 0) {
    let best = -1; for (const c of this.colGrid.querySegment(ax, az, bx, bz)) { const t = c.segment(ax, ay, az, bx, by, bz, padding); if (t >= 0 && (best < 0 || t < best)) best = t; }
    return best;
  }
  dispose() {
    this.disposed = true;
    this.bgTex?.dispose();
    this.earthworkMaterial?.dispose();
    this.grass.dispose(); this.groundDetails.dispose();
    const geometries = new Set();
    this.scene.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) geometries.add(o.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of [
      this.sky.material, this.terrainMat, this.far.material, this.waterMat,
      ...Object.values(this.structureMaterials), ...Object.values(this.veg.mats).flat(),
      ...Object.values(this.veg.ghostMats).flat(), this.veg.rockMat,
    ]) material.dispose();
    for (const { ring, pole, flag } of this.baseMarkers) {
      ring.material.dispose(); pole.material.dispose(); flag.material.dispose();
    }
    this.sun.shadow.dispose(); this.envRT.dispose(); this.pm.dispose();
  }
}
