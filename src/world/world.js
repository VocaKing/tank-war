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
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tA, tB, tC, tD, nA, nB, nC, nD, aA, aB, aC, aD; uniform vec3 tintA, tintB; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN; float tAO = 1.0;
      vec3 sampleL(sampler2D t, vec2 uv, float far) { vec3 a = texture2D(t, uv).rgb; vec3 b = texture2D(t, uv * 0.173).rgb; return mix(a, (a + b) * 0.5, far); }`)
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
        vec3 rA = texture2D(aA, uv).rgb, rB = texture2D(aB, uv * 1.1).rgb, rC = texture2D(aC, uvr).rgb, rD = texture2D(aD, uvd).rgb;
        // height blending: each texture's luminance acts as its height map, giving natural interlocking transitions
        vec4 hgt = vec4(dot(cA, vec3(0.33)), dot(cB, vec3(0.33)), dot(cC, vec3(0.33)), dot(cD, vec3(0.33))) * 0.6 + w * 1.4;
        float hmax = max(max(hgt.x, hgt.y), max(hgt.z, hgt.w)) - 0.18;
        vec4 hb = max(hgt - hmax, 0.0) * step(0.001, w); w = hb / (hb.x + hb.y + hb.z + hb.w + 1e-4);
        vec3 col = cA * w.x + cB * w.y + cC * w.z + cD * w.w;
        float tRough = mix(0.72, 1.0, clamp(rA.g * w.x + rB.g * w.y + rC.g * w.z + rD.g * w.w, 0.0, 1.0)); tAO = mix(rA.r * w.x + rB.r * w.y + rC.r * w.z + rD.r * w.w, 1.0, far * 0.8);
        col *= 0.82 + 0.36 * texture2D(tB, vWP.xz / 97.0).g;
        col *= mix(0.92, 1.06, smoothstep(0.2, 0.8, texture2D(tA, vWP.xz / 260.0).r));
        // v4 patchwork: large irregular parcels (fields / meadows / dry patches) tint the ground layer differently
        {
          vec2 pc = mat2(0.94, -0.34, 0.34, 0.94) * vWP.xz + (vec2(br, br2) - 0.5) * 30.0;
          vec2 cell = floor(pc / vec2(86.0, 64.0)); float hs = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 pt = hs < 0.33 ? vec3(1.04, 1.01, 0.88) : hs < 0.66 ? vec3(0.90, 1.0, 0.88) : vec3(1.0, 0.95, 0.9);
          col *= mix(vec3(1.0), pt, w.x * 0.85);
        }
        diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(tRough, 0.95, far * 0.5);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tAO; reflectedLight.indirectSpecular *= tAO * tAO; reflectedLight.directDiffuse *= mix(1.0, tAO, 0.5);')
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nm = (texture2D(nA, uv).xyz * w.x + texture2D(nB, uv * 1.1).xyz * w.y + texture2D(nC, uvr).xyz * w.z + texture2D(nD, uvd).xyz * w.w) * 2.0 - 1.0;
          nm.xy *= (1.0 - far * 0.7) * 0.9;
          vec3 T = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz; vec3 Bt = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          T = normalize(T - normal * dot(normal, T)); Bt = normalize(Bt - normal * dot(normal, Bt) - T * dot(T, Bt));
          normal = normalize(T * nm.x + Bt * nm.y + normal * nm.z);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain5';
  return m;
}

function buildTerrainMeshes(mb, mat, step) {
  const t = mb.t; const tiles = 7; const per = Math.floor((t.n - 1) / tiles); const group = new THREE.Group(); group.name = 'terrain';
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const i0 = tx * per, j0 = ty * per, i1 = tx === tiles - 1 ? t.n - 1 : i0 + per, j1 = ty === tiles - 1 ? t.n - 1 : j0 + per;
    const nx = Math.floor((i1 - i0) / step) + 1, nz = Math.floor((j1 - j0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), spl = new Float32Array(nx * nz * 4), idx = [];
    let v = 0;
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      const i = Math.min(i1, i0 + a * step), j = Math.min(j1, j0 + b * step), k = j * t.n + i;
      pos[v * 3] = t.i2x(i); pos[v * 3 + 1] = t.h[k]; pos[v * 3 + 2] = t.i2x(j);
      col[v * 3] = t.tint[k * 3]; col[v * 3 + 1] = t.tint[k * 3 + 1]; col[v * 3 + 2] = t.tint[k * 3 + 2];
      spl.set(mb.splat.subarray(k * 4, k * 4 + 4), v * 4); v++;
    }
    for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) { const p = b * nx + a; idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
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
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = false; mesh.name = 'farTerrain'; return mesh;
}

export const waterTime = { value: 0 };
function waterMaterial() {
  const nt = waterNormalTexture();
  const m = new THREE.MeshPhysicalMaterial({ color: 0x1d3a3c, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.9, normalMap: nt, normalScale: new THREE.Vector2(1, 1), ior: 1.33, specularIntensity: 1, envMapIntensity: 1.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw; uniform float uT;')
      .replace('#include <normal_fragment_maps>', `{
        vec2 p = vWPw.xz; float dist = length(vWPw - cameraPosition);
        vec3 n1 = texture2D(normalMap, p / 9.0 + vec2(uT * 0.021, uT * 0.013)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, p / 3.1 + vec2(-uT * 0.034, uT * 0.027)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, p / 31.0 + vec2(uT * 0.006, -uT * 0.009)).xyz * 2.0 - 1.0;
        float fade = 1.0 - smoothstep(40.0, 400.0, dist) * 0.7;
        vec2 s = (n1.xy * 0.55 + n2.xy * 0.35 * (1.0 - smoothstep(20.0, 120.0, dist)) + n3.xy * 0.5) * 0.32 * fade;
        normal = normalize((viewMatrix * vec4(s.x, 1.0, s.y, 0.0)).xyz);
      }`)
      // view-dependent body colour: looking straight down you see the dark, slightly green depth; grazing angles are mirror-like (Fresnel via IBL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float ndv = abs(dot(normalize(cameraPosition - vWPw), vec3(0.0, 1.0, 0.0))); diffuseColor.rgb *= mix(1.25, 0.65, ndv); diffuseColor.a = mix(0.97, 0.82, ndv); }`);
  };
  m.customProgramCacheKey = () => 'water5';
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
    // force normals up (ribbon might be wound either way)
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.Mesh(g, mat); mesh.material.side = THREE.DoubleSide; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const lk of mb.lakes) { const g = new THREE.CircleGeometry(lk.r + 6, 48); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * lk.r / 6, uv.getY(i) * lk.r / 6); const mesh = new THREE.Mesh(g, mat); mesh.position.set(lk.x, lk.wl, lk.z); mesh.receiveShadow = true; group.add(mesh); }
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
    const fogDen = H ? H.fogDensity : def.fog.density;
    scene.fog = new THREE.FogExp2(H ? new THREE.Color().setRGB(...H.horizon) : def.fog.color, fogDen);
    const sunCol = new THREE.Color().setHSL(0.1, 0.5, def.sun.elevation < 25 ? 0.78 : 0.92);
    const sun = new THREE.DirectionalLight(sunCol, def.sun.elevation < 25 ? 2.8 : 3.3); sun.castShadow = true;
    if (H) { const e = H.sunE; const m = Math.max(...e); sun.color.setRGB(e[0] / m, e[1] / m, e[2] / m); sun.intensity = m; }
    const sm = quality === 'low' ? 1024 : quality === 'high' ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm);
    const S = quality === 'high' ? 95 : 110; this.shadowS = S; this.shadowTexel = (2 * S) / sm;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 800 });
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = this.shadowTexel * 1.6; if (H && H.overcast) sun.shadow.radius = 6; else sun.shadow.radius = 2;
    scene.add(sun); scene.add(sun.target); this.sun = sun;
    // v5: far shadows beyond the near frustum (Medium/High). Same direction as the sun, zero intensity: it only
    // provides a wide, low-res shadow map that atmos.js blends in where the near map ends. Throttled re-render.
    if (quality !== 'low') {
      const fs = new THREE.DirectionalLight(0xffffff, 0); fs.castShadow = true; const fm = quality === 'high' ? 2048 : 1024; const FS = 380;
      fs.shadow.mapSize.set(fm, fm); Object.assign(fs.shadow.camera, { left: -FS, right: FS, top: FS, bottom: -FS, near: 10, far: 1400 });
      this.farTexel = (2 * FS) / fm; fs.shadow.bias = -0.0006; fs.shadow.normalBias = this.farTexel * 1.4; fs.shadow.radius = 1; fs.shadow.autoUpdate = false; fs.shadow.needsUpdate = true;
      scene.add(fs); scene.add(fs.target); this.farSun = fs; this._farFrame = 0; this._farAt = null;
    }
    // v5: exponential height fog (atmos.js) -- haze settles in low ground; base = 30th-percentile terrain height
    { const hf = (H && H.heightFog) || [0.03, 0.5]; const hs = []; const th = mb.t.h; for (let i = 0; i < th.length; i += 97) hs.push(th[i]); hs.sort((a, b) => a - b);
      heightFog.x = quality === 'low' ? hf[0] * 0.8 : hf[0]; heightFog.y = hs[Math.floor(hs.length * 0.3)]; heightFog.z = hf[1]; scene.fog.density *= hf[2] || 1.2; }
    sunU.uSunDir.value.copy(this.sunDir); sunU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
    const hemi = new THREE.HemisphereLight(0xbfd4ff, new THREE.Color(...def.farColor).multiplyScalar(1.2), 0.7); scene.add(hemi); this.hemi = hemi;
    this.hdrLoaded = !H; this.exposure = H ? H.exposure : null;
    if (H) this._loadHdri(renderer, H, quality);
    // terrain
    const tmat = terrainMaterial(def); this.terrainMat = tmat;
    this.terrainGroup = buildTerrainMeshes(mb, tmat, quality === 'low' ? 2 : 1); scene.add(this.terrainGroup);
    this.far = buildFarTerrain(mb, tmat); scene.add(this.far);
    this.waterMat = waterMaterial(); this.water = buildWater(mb, this.waterMat); scene.add(this.water);
    // structures and vegetation
    const st = buildStructures(mb, scene, mb.t); this.colliders = st.colliders; this.decks = st.decks || [];
    this.colGrid = new Grid2D(mb.t.half, 24); for (const c of this.colliders) this.colGrid.insert(c, c.x, c.z, c.r);
    this.veg = new Vegetation(scene, mb, quality);
    this.grass = new Grass(scene, mb, quality, windUniform);
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
      this.baseMarkers.push({ ring, flag });
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
      this.sky.visible = false; this.hemi.intensity = 0.0;
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
  updateShadowCenter(target) {
    // stable shadows: snap the shadow centre to whole shadow-map texels in light space (no shimmering when moving)
    const s = this.sun; const L = this.sunDir; const ty0 = this.terrain.height(target.x, target.z);
    if (!this._lr) { this._lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), L).normalize(); this._lu = new THREE.Vector3().crossVectors(L, this._lr).normalize(); }
    const P = new THREE.Vector3(target.x, ty0, target.z); const tx_ = this.shadowTexel;
    const a = Math.round(P.dot(this._lr) / tx_) * tx_, b = Math.round(P.dot(this._lu) / tx_) * tx_, c = P.dot(L);
    const C = this._lr.clone().multiplyScalar(a).addScaledVector(this._lu, b).addScaledVector(L, c);
    s.target.position.copy(C); s.position.copy(C).addScaledVector(L, 400); s.target.updateMatrixWorld();
    const f = this.farSun;
    if (f) { // far map: re-render every 10 frames, or immediately after a big move; texel-snapped like the near map
      const ft = this.farTexel; const fa = Math.round(P.dot(this._lr) / ft) * ft, fb = Math.round(P.dot(this._lu) / ft) * ft;
      const moved = !this._farAt || Math.hypot(target.x - this._farAt.x, target.z - this._farAt.z) > 40;
      if (moved || ++this._farFrame >= 10) {
        this._farFrame = 0; this._farAt = { x: target.x, z: target.z };
        const FC = this._lr.clone().multiplyScalar(fa).addScaledVector(this._lu, fb).addScaledVector(L, c);
        f.target.position.copy(FC); f.position.copy(FC).addScaledVector(L, 700); f.target.updateMatrixWorld(); f.updateMatrixWorld(); f.shadow.needsUpdate = true;
      }
    }
  }
  update(dt, time, camPos) {
    this.veg.updateLOD(camPos); this.veg.update(dt); this.grass.update(camPos);
    waterTime.value = time;
    for (const b of this.baseMarkers) { const p = b.flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.3; p.setZ(i, Math.sin(time * 4 + x * 2.2) * 0.12 * x); } p.needsUpdate = true; }
  }
  // line of sight blocked by terrain or structures? (eye -> target)
  losBlocked(ax, ay, az, bx, by, bz) {
    if (this.terrain.segmentHit(ax, ay, az, bx, by, bz, 4) >= 0) return true;
    for (const c of this.colGrid.querySegment(ax, az, bx, bz)) if (c.kind !== 'prop' && c.segment(ax, ay, az, bx, by, bz) >= 0) return true;
    return false;
  }
  // first structure hit along segment (t in 0..1) or -1
  structureHit(ax, ay, az, bx, by, bz) {
    let best = -1; for (const c of this.colGrid.querySegment(ax, az, bx, bz)) { const t = c.segment(ax, ay, az, bx, by, bz); if (t >= 0 && (best < 0 || t < best)) best = t; }
    return best;
  }
  dispose() { this.disposed = true; heightFog.x = 0; if (this.bgTex) this.bgTex.dispose(); this.grass.dispose(); this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.envRT.dispose(); }
}
