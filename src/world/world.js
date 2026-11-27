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
import { sharedMediaUrl } from '../media.js';

function terrainMaterial(def, quality) {
  const L = def.layers;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true });
  m.defines = { ...m.defines, TERRAIN_BIOME: def.id === 'desert' ? 1 : def.id === 'forest' ? 2 : 0 };
  if (quality === 'low') m.defines.TERRAIN_LOW = 1;
  const U = {
    tA: { value: pbrTex(L.A, 'diff') }, tB: { value: pbrTex(L.B, 'diff') }, tC: { value: pbrTex(L.C, 'diff') }, tD: { value: pbrTex(L.D, 'diff') },
    nA: { value: pbrTex(L.A, 'nor') }, nD: { value: pbrTex(L.D, 'nor') },
    ...(quality !== 'low' ? {
      nB: { value: pbrTex(L.B, 'nor') }, nC: { value: pbrTex(L.C, 'nor') },
      aA: { value: pbrTex(L.A, 'arm') }, aB: { value: pbrTex(L.B, 'arm') },
      aC: { value: pbrTex(L.C, 'arm') }, aD: { value: pbrTex(L.D, 'arm') },
    } : {}),
    tintA: { value: new THREE.Vector3(...L.tintA) }, tintB: { value: new THREE.Vector3(...L.tintB) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; attribute vec4 roadDetail; attribute vec2 terrainLight; varying vec2 vTerrainLight; varying vec4 vRoad; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vRoad = roadDetail; vTerrainLight = terrainLight; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tA, tB, tC, tD, nA, nB, nC, nD, aA, aB, aC, aD; uniform vec3 tintA, tintB; varying vec2 vTerrainLight; varying vec4 vRoad; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN; float tAO = 1.0;
      const int terrainDetail = TERRAIN_BIOME;
      vec3 sampleL(sampler2D t, vec2 uv, float far) {
        vec3 a = texture2D(t, uv).rgb;
        #ifdef TERRAIN_LOW
          return a;
        #else
          vec3 b = texture2D(t, uv * 0.173).rgb;
          return mix(a, (a + b) * 0.5, far);
        #endif
      }
      float fieldHash(vec2 p) {
        vec3 q = fract(p.xyx * vec3(0.1031, 0.0997, 0.0973));
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }`)
      .replace('#include <map_fragment>', `
        float camD = length(vWP - cameraPosition); float far = smoothstep(25.0, 140.0, camD);
        vec2 uv = vWP.xz / 3.2; vec2 uvr = vWP.xz / 6.0; vec2 uvd = vWP.xz / 3.5;
        vec4 w = vSplat; w = max(w, 0.0);
        // macro breakup so layer borders are not smooth gradients
        float br = texture2D(tC, vWP.xz / 41.0).r; float br2 = texture2D(tA, vWP.xz / 133.0).g;
        w.y *= 0.55 + br * 0.9; w.x *= 0.8 + br2 * 0.4;
        // v5: steep slopes expose bedrock regardless of the painted splat
        vec3 wn = normalize(vWN);
        float incline = 1.0 - wn.y;
        float steep = smoothstep(0.15, 0.45, incline);
        w.z += steep * 2.5 * (1.0 - w.w); w.xy *= 1.0 - steep * 0.85;
        vec3 cA = sampleL(tA, uv, far) * tintA, cB = sampleL(tB, uv * 1.1, far) * tintB, cC = sampleL(tC, uvr, far), cD = sampleL(tD, uvd, far);
        float strataPhase = (vWP.y + br * 1.7 + vWP.x * 0.025) * 5.4;
        float stratum = sin(strataPhase) * (1.0 - smoothstep(0.5, 2.9, fwidth(strataPhase)));
        if (steep > 0.01) {
          vec3 bw = wn * wn; bw *= bw; bw /= (bw.x + bw.y + bw.z);
          vec3 triplanar = texture2D(tC, vWP.zy / 6.0).rgb * bw.x + cC * bw.y + texture2D(tC, vWP.xy / 6.0).rgb * bw.z;
          cC = mix(cC, triplanar, smoothstep(0.0, 0.21, steep));
        }
        vec3 bandTint = terrainDetail == 1 ? vec3(1.13, 0.87, 0.68) : vec3(1.09, 1.06, 0.96);
        cC *= mix(vec3(1.0), bandTint * (0.91 + 0.16 * stratum), smoothstep(0.04, 0.28, incline));
        // Weight the material by coverage at each vertex so the road keeps
        // its material as it blends into the shoulder.
        float roadKind = clamp(vRoad.w / max(vRoad.z, 0.001), -1.0, 1.0);
        float dirt = max(0.0, -roadKind), asphalt = max(0.0, roadKind);
        cD = mix(cD, cD * vec3(0.78, 0.60, 0.44), dirt * 0.72);
        cD = mix(cD, cD * vec3(0.55, 0.58, 0.62), asphalt * 0.82);
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
        col *= 0.82 + 0.20 * br + 0.22 * br2;
        // Fade relief according to its screen-space footprint to keep it
        // stable when moving and visible through the gun optics.
        float footprint = length(fwidth(vWP.xz));
        float fine = (1.0 - smoothstep(0.08, 0.36, footprint)) * (1.0 - smoothstep(90.0, 185.0, camD));
        float roadFade = smoothstep(0.29, 0.74, vRoad.z) * w.w * (1.0 - smoothstep(70.0, 185.0, camD));
        float shoulder = abs(vRoad.x);
        float rutCenter = 1.02 + 0.11 * sin(vRoad.y * 0.33) + (br - 0.4) * 0.29;
        float rutOffset = shoulder - rutCenter;
        float track = 1.0 - smoothstep(0.21, 0.56, abs(rutOffset));
        float disturbed = texture2D(tD, vec2(vRoad.x * 0.73, vRoad.y * 0.36)).r;
        float fineSediment = smoothstep(0.30, 0.57, disturbed * 0.44 + br * 0.56);
        float compacted = roadFade * track * mix(1.0, 0.32, asphalt);
        float looseEdge = smoothstep(1.45, 2.8, shoulder) * roadFade;
        col *= mix(1.0, 0.74 + 0.25 * disturbed, compacted);
        col = mix(col, col * vec3(1.16, 1.11, 1.02), looseEdge * fineSediment * 0.8);
        float wetRut = compacted * fineSediment * (terrainDetail == 2 ? 0.55 : terrainDetail == 0 ? 0.18 : 0.0);
        col *= mix(vec3(1.0), vec3(0.52, 0.48, 0.45), wetRut);
        tRough = mix(tRough, 0.47, wetRut);
        #ifndef TERRAIN_LOW
          // Follow the road centreline through bends and soften the shoulders with sand drift.
          float paved = asphalt * roadFade;
          float warp = disturbed * 0.8 + br * 0.55;
          float longitudinal = vRoad.x * 1.22 + warp;
          float transverse = vRoad.y * 0.29 + sin(longitudinal * 4.6) * 0.14 + warp;
          vec2 jointWidth = fwidth(vec2(longitudinal, transverse));
          if (paved > 0.015) {
            vec2 joint = abs(fract(vec2(longitudinal, transverse)) - 0.5);
            float fractures = 1.0 - min(smoothstep(0.010, 0.023 + jointWidth.x, joint.x),
                                        smoothstep(0.007, 0.019 + jointWidth.y, joint.y));
            float worn = paved * fine * smoothstep(0.36, 0.71, disturbed);
            col *= 1.0 - worn * fractures * 0.44;
            float drift = paved * smoothstep(1.25, 3.1, shoulder + disturbed * 1.35);
            drift *= smoothstep(0.34, 0.65, br + 0.16 * disturbed);
            col = mix(col, cA * vec3(0.88, 0.85, 0.80), drift * 0.51);
            tRough = mix(tRough, 0.97, drift);
          }
        #endif
        float ripple = 0.0, furrowRelief = 0.0;
        vec2 furrowDir = vec2(0.0);
        float naturalDetail = fine * (1.0 - steep) * (1.0 - w.w);
        if (terrainDetail == 0) {
          vec2 fields = vWP.xz + (vec2(br, br2) - 0.4) * 7.0;
          vec2 parcelUV = fields / 110.0;
          float parcel = fieldHash(floor(parcelUV));
          vec2 edge = min(fract(parcelUV), 1.0 - fract(parcelUV));
          float interior = smoothstep(0.013, 0.071, min(edge.x, edge.y));
          vec3 crop = parcel < 0.31 ? vec3(1.22, 1.11, 0.72) : vec3(0.92, 1.06, 0.83);
          col *= mix(vec3(1.0), crop, w.x * interior * 0.66);
          furrowDir = parcel < 0.57 ? vec2(0.997, 0.078) : vec2(-0.078, 0.997);
          float rows = dot(vWP.xz, furrowDir) * 9.4 + br * 1.8;
          furrowRelief = naturalDetail * smoothstep(0.33, 0.63, parcel) * interior * w.x;
          col *= 1.0 + furrowRelief * (0.14 * sin(rows) - 0.065);
          furrowRelief *= cos(rows);
        }
        if (terrainDetail == 1) {
          float windRows = dot(vWP.xz, vec2(0.8, 0.6)) * mix(11.0, 14.0, br2) + br * 6.8;
          float ripples = naturalDetail * w.x * smoothstep(0.14, 0.48, br2);
          col *= 1.0 + ripples * (0.095 * sin(windRows) + 0.027 * sin(2.0 * windRows));
          ripple = cos(windRows) * ripples;
          col = mix(col, col * vec3(1.20, 1.08, 0.87), looseEdge * 0.52);
        }
        if (terrainDetail == 2) {
          float humus = smoothstep(0.28, 0.61, br * 0.7 + br2 * 0.53) * w.x;
          float moss = smoothstep(0.4, 0.77, br2 + br * 0.26) * w.y;
          col *= mix(vec3(1.0), vec3(0.72, 0.69, 0.63), humus * (1.0 - w.w) * 0.75);
          col *= mix(vec3(1.0), vec3(0.91, 1.18, 0.72), moss * (1.0 - steep) * 0.78);
        }
        #ifndef TERRAIN_LOW
          // Reuse the existing gravel map for fine aggregate tint and roughness.
          if (fine > 0.003) {
            float grain = (texture2D(tD, vWP.xz * 0.77).r - 0.32) * fine;
            col *= 1.0 + grain * mix(0.32, 0.63, w.z + w.w);
            tRough = clamp(tRough + grain * 0.19, 0.35, 1.0);
          }
        #endif
        float bankWet = vTerrainLight.y * mix(0.45, 1.0, smoothstep(0.15, 0.65, br * 0.8 + br2 * 0.3));
        vec3 wetTint = terrainDetail == 1 ? vec3(0.88, 0.75, 0.64) : vec3(0.59, 0.65, 0.52);
        col *= mix(vec3(1.0), wetTint, bankWet);
        tRough = mix(tRough, terrainDetail == 1 ? 0.89 : 0.55, bankWet * 0.85);
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
          nm.xy += vec2(0.8, 0.6) * ripple * 0.24 + furrowDir * furrowRelief * 0.23;
          vec3 worldX = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
          vec3 worldZ = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          vec3 tangent = worldX - normal * dot(normal, worldX);
          vec3 T = normalize(dot(tangent, tangent) > 0.01 ? tangent : cross(normal, worldZ));
          vec3 Bt = normalize(cross(T, normal));
          normal = normalize(T * nm.x + Bt * nm.y + normal * nm.z);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain9-' + def.id + '-' + quality;
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
    const normal = new Float32Array(nx * nz * 3), road = new Float32Array(nx * nz * 4), light = new Float32Array(nx * nz * 2);
    let maxY = -Infinity;
    let v = 0;
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      const i = Math.min(i1, i0 + a * step), j = Math.min(j1, j0 + b * step), k = j * t.n + i;
      pos[v * 3] = t.i2x(i); pos[v * 3 + 1] = t.h[k]; pos[v * 3 + 2] = t.i2x(j);
      maxY = Math.max(maxY, t.h[k]);
      light[v * 2] = exposure(pos[v * 3], pos[v * 3 + 2]);
      light[v * 2 + 1] = 1 - smoothstep(0.03, 1.18, Math.abs(t.h[k] - t.water[k]));
      col[v * 3] = t.tint[k * 3]; col[v * 3 + 1] = t.tint[k * 3 + 1]; col[v * 3 + 2] = t.tint[k * 3 + 2];
      const il = Math.max(0, i - 1), ir = Math.min(t.n - 1, i + 1);
      const jl = Math.max(0, j - 1), jr = Math.min(t.n - 1, j + 1);
      const gx = (t.h[j * t.n + il] - t.h[j * t.n + ir]) / ((ir - il) * t.res);
      const gz = (t.h[jl * t.n + i] - t.h[jr * t.n + i]) / ((jr - jl) * t.res);
      const scale = 1 / Math.hypot(gx, 1, gz);
      normal.set([gx * scale, scale, gz * scale], v * 3);
      road[v * 4] = mb.roadDetail[k * 3];
      road[v * 4 + 1] = mb.roadDetail[k * 3 + 1];
      road[v * 4 + 2] = mb.roadDetail[k * 3 + 2];
      road[v * 4 + 3] = mb.roadSurface[k] * mb.roadDetail[k * 3 + 2];
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
      average(road, 4, corners, centerRoads);
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
    g.setAttribute('roadDetail', new THREE.BufferAttribute(append(road, centerRoads), 4));
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
function waterMaterial(quality) {
  const nt = waterNormalTexture();
  const detail = quality !== 'low';
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x1d3a3c, roughness: 0.05, transparent: true, opacity: 0.9,
    normalMap: nt, ior: 1.33, side: THREE.DoubleSide, forceSinglePass: true,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float waterDepth;
      attribute vec2 waterFlow;
      varying float vWaterDepth;
      varying vec2 vWaterFlow;
      varying vec2 vWaterUV;
      varying vec3 vWPw;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWaterDepth = waterDepth;
      vWaterFlow = waterFlow;
      vWaterUV = uv;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vWaterDepth;
      varying vec2 vWaterFlow;
      varying vec2 vWaterUV;
      varying vec3 vWPw;
      uniform float uT;`)
      .replace('#include <normal_fragment_maps>', `{
        vec2 p = vWPw.xz; float dist = length(vWPw - cameraPosition);
        vec3 n1 = texture2D(normalMap, p / 9.0 - vWaterFlow * (uT * 0.021)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, p / 31.0 + vec2(uT * 0.006, -uT * 0.009)).xyz * 2.0 - 1.0;
        vec2 slope = n1.xy * 0.55 + n3.xy * 0.5;
        ${detail ? `
          vec3 n2 = texture2D(normalMap, p / 3.1 - (vWaterFlow * 0.038 + vec2(-0.007, 0.005)) * uT).xyz * 2.0 - 1.0;
          slope += n2.xy * 0.42 * (1.0 - smoothstep(20.0, 120.0, dist));` : ''}
        float fade = 1.0 - smoothstep(40.0, 400.0, dist) * 0.7;
        vec2 s = slope * 0.34 * fade;
        normal = normalize((viewMatrix * vec4(s.x, 1.0, s.y, 0.0)).xyz);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float ndv = abs(dot(normalize(cameraPosition - vWPw), vec3(0.0, 1.0, 0.0)));
          float deep = smoothstep(0.08, 1.9, vWaterDepth);
          float submerged = smoothstep(-0.03, 0.18, vWaterDepth);
          float current = clamp(length(vWaterFlow), 0.0, 1.0);
          float stream = vWaterUV.x * 9.0 - uT * mix(0.16, 0.73, current);
          float across = vWaterUV.y * 22.0;
          float ribbons = 0.5 + 0.5 * sin(across + sin(stream * 0.52) * 1.4);
          float breaks = 0.5 + 0.5 * sin(stream + across * 0.4);
          float foam = submerged * (1.0 - smoothstep(0.14, 0.48, vWaterDepth))
                     * smoothstep(0.56, 0.92, ribbons * breaks) * mix(0.32, 1.0, current);
          vec3 shallows = vec3(0.12, 0.16, 0.105);
          ${detail ? `
            float crestA = sin(vWPw.x * 2.1 + cos(vWPw.z * 2.6 + uT * 0.24));
            float crestB = sin(vWPw.z * 1.9 - vWPw.x * 1.2 - uT * 0.34);
            float caustic = pow(1.0 - abs(crestA * crestB), 4.0);
            shallows *= 0.90 + caustic * 0.28;
            float drift = smoothstep(0.82, 0.99, ribbons) * smoothstep(0.68, 0.98, breaks);
            foam += drift * (1.0 - deep) * current * 0.18 * submerged;` : ''}
          diffuseColor.rgb *= mix(1.25, 0.66, ndv);
          diffuseColor.rgb = mix(diffuseColor.rgb, shallows, (1.0 - deep) * ndv * 0.78);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.43, 0.39), foam * 0.65);
          diffuseColor.a = mix(0.95, mix(0.52, 0.86, deep), ndv) * submerged;
        }`);
  };
  m.customProgramCacheKey = () => detail ? 'detailed-inland-water' : 'low-inland-water';
  return m;
}
function buildWater(mb, mat) {
  const group = new THREE.Group(); group.name = 'water';
  for (const rv of mb.rivers) {
    if (rv.dry) continue;
    const pts = rv.pts, pos = [], uv = [], depth = [], flow = [], idx = [];
    const half = rv.width / 2 + 2.5;
    const lanes = mb.quality === 'high' ? 13 : 9;
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
    mesh.receiveShadow = true; group.add(mesh);
  }
  for (const lk of mb.lakes) {
    const segments = mb.quality === 'high' ? 80 : mb.quality === 'medium' ? 64 : 48;
    const geometry = new THREE.RingGeometry(0, lk.r + 6, segments, segments / 4);
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
    this.shadowVehiclePoses = new WeakMap();
    const S = quality === 'high' ? 88 : 102; this.shadowS = S; this.shadowTexel = (2 * S) / sm;
    // Limit cached vehicle shadow drift to one texel, with a tighter bound on coarse maps.
    this.shadowMotionLimit = Math.min(0.12, this.shadowTexel);
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
    this.waterMat = waterMaterial(quality); this.water = buildWater(mb, this.waterMat); scene.add(this.water);
    // structures and vegetation
    const st = buildStructures(mb, scene, mb.t); this.colliders = st.colliders; this.decks = st.decks || [];
    this.structureMaterials = st.materials;
    this.colGrid = new Grid2D(mb.t.half, 24); for (const c of this.colliders) this.colGrid.insert(c, c.x, c.z, c.r);
    this.veg = new Vegetation(scene, mb, quality);
    this.grass = new Grass(scene, mb, quality, windUniform);
    this.groundDetails = new GroundDetails(scene, mb, quality);
    this.bases = mb.bases; this.lanes = mb.lanes; this.playHalf = mb.play;
    this.controlPoint = def.controlPoint;
    this.stats = { trees: mb.trees.length, bushes: mb.bushes.length, buildings: mb.buildings.length, rocks: mb.rocks.length, walls: mb.walls.length, bridges: mb.bridges.length };
    // base flags
    this.baseMarkers = [];
    for (const [i, b] of [...this.bases, this.controlPoint].entries()) {
      const central = b === this.controlPoint;
      const y = this.groundHeight(b.x, b.z), color = central ? 0xe0b458 : i === 0 ? 0x3fa34d : 0xc0392b;
      const geometry = new THREE.RingGeometry(b.r - (central ? 1.7 : 1.2), b.r, 96);
      geometry.rotateX(-Math.PI / 2);
      if (central) {
        const p = geometry.attributes.position;
        for (let v = 0; v < p.count; v++) {
          p.setY(v, this.groundHeight(b.x + p.getX(v), b.z + p.getZ(v)) - y);
        }
      }
      const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: central ? 0.76 : 0.55, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(b.x, y + 0.4, b.z); ring.renderOrder = 2; scene.add(ring);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7, roughness: 0.4 })); pole.position.set(b.x, y + 6, b.z); pole.castShadow = true; scene.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 8, 4), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(b.x + 1.3, y + 11, b.z); scene.add(flag);
      this.baseMarkers.push({ ring, pole, flag });
      if (central) this.controlMarker = { ring, flag };
    }
  }
  // Team indexes remain stable; only the physical sides are exchanged.
  // Reverse routes once so AI team 0 always travels from its own base.
  assignSpawnSides(swapped) {
    if(this.sidesAssigned)return;
    this.sidesAssigned=true;this.sidesSwapped=swapped;
    if(!swapped)return;
    this.bases=this.bases.slice().reverse();
    this.lanes=this.lanes.map(lane=>lane.slice().reverse());
    const first=this.baseMarkers[0],second=this.baseMarkers[1];
    for(const [marker,color] of [[first,0xc0392b],[second,0x3fa34d]]){marker.ring.material.color.setHex(color);marker.flag.material.color.setHex(color);}
    this.baseMarkers=[second,first,...this.baseMarkers.slice(2)];
  }
  setControlTeam(team) {
    const color = team === 0 ? 0x3fa34d : team === 1 ? 0xc0392b : 0xe0b458;
    this.controlMarker.ring.material.color.setHex(color);
    this.controlMarker.flag.material.color.setHex(color);
  }
  _loadHdri(renderer, H, quality) {
    const res = quality === 'low' ? '1k' : '2k';
    new RGBELoader().setDataType(THREE.FloatType).load(sharedMediaUrl(`tex/${H.file}_${res}.hdr`), (tex) => {
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
  vehicleShadowsMoved(tanks) {
    const center = this.sun.target.position;
    const lightX = center.dot(this._lr), lightY = center.dot(this._lu);
    const limit = this.shadowMotionLimit;
    const onMap = (point, extent) => Math.abs(point.dot(this._lr) - lightX) <= extent
      && Math.abs(point.dot(this._lu) - lightY) <= extent;
    for (const tank of tanks) {
      const { root } = tank.model;
      const previous = this.shadowVehiclePoses.get(root);
      if (!root.visible && !previous?.visible) continue;
      const radius = Math.hypot(tank.spec.dims.L, tank.spec.dims.W) / 2;
      const extent = this.shadowS + radius + tank.spec.dims.gunLen;
      if (!onMap(root.position, extent) && !(previous && onMap(previous.position, extent))) continue;
      if (!previous || previous.visible !== root.visible
        || root.position.distanceToSquared(previous.position) >= limit * limit
        || root.quaternion.angleTo(previous.quaternion) * radius >= limit) return true;
    }
    return false;
  }
  updateShadowCenter(target, time = 0, tanks = []) {
    const s = this.sun;
    // Reuse the map while the visible casters are still aligned with it.
    if (!s.shadow.needsUpdate && time - this.shadowUpdatedAt < this.shadowInterval
      && this.shadowFocus.distanceToSquared(target) < 12 * 12 && !this.vehicleShadowsMoved(tanks)) return;
    this.shadowUpdatedAt = time;
    this.shadowFocus.copy(target);
    for (const { model: { root } } of tanks) {
      const pose = this.shadowVehiclePoses.get(root) ?? {
        position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), visible: false,
      };
      pose.position.copy(root.position);
      pose.quaternion.copy(root.quaternion);
      pose.visible = root.visible;
      this.shadowVehiclePoses.set(root, pose);
    }
    // stable shadows: snap the shadow centre to whole shadow-map texels in light space (no shimmering when moving)
    const L = this.sunDir; const ty0 = this.terrain.height(target.x, target.z);
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
