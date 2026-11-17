// Builds a complete battlefield scene from a map definition.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { MapBuilder } from './mapgen.js';
import { MAP_BY_ID } from './maps.js';
import { buildStructures } from './buildings.js';
import { Vegetation, windUniform } from './vegetation.js';
import { Grass } from './grass.js';
import { pbrTex, waterNormalTexture } from './textures.js';
import { Grid2D } from './terrain.js';
import { DEG, ridged, smoothstep } from '../util.js';

function terrainMaterial(def) {
  const L = def.layers;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true });
  const U = {
    tA: { value: pbrTex(L.A, 'diff') }, tB: { value: pbrTex(L.B, 'diff') }, tC: { value: pbrTex(L.C, 'diff') }, tD: { value: pbrTex(L.D, 'diff') },
    nA: { value: pbrTex(L.A, 'nor') }, nB: { value: pbrTex(L.B, 'nor') }, nC: { value: pbrTex(L.C, 'nor') }, nD: { value: pbrTex(L.D, 'nor') },
    tintA: { value: new THREE.Vector3(...L.tintA) }, tintB: { value: new THREE.Vector3(...L.tintB) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tA, tB, tC, tD, nA, nB, nC, nD; uniform vec3 tintA, tintB; varying vec4 vSplat; varying vec3 vWP;
      vec3 sampleL(sampler2D t, vec2 uv, float far) { vec3 a = texture2D(t, uv).rgb; vec3 b = texture2D(t, uv * 0.173).rgb; return mix(a, (a + b) * 0.5, far); }`)
      .replace('#include <map_fragment>', `
        float camD = length(vWP - cameraPosition); float far = smoothstep(25.0, 140.0, camD);
        vec2 uv = vWP.xz / 3.2; vec2 uvr = vWP.xz / 6.0; vec2 uvd = vWP.xz / 3.5;
        vec4 w = vSplat; w = max(w, 0.0);
        // macro breakup so layer borders are not smooth gradients
        float br = texture2D(tC, vWP.xz / 41.0).r; float br2 = texture2D(tA, vWP.xz / 133.0).g;
        w.y *= 0.55 + br * 0.9; w.x *= 0.8 + br2 * 0.4;
        vec3 cA = sampleL(tA, uv, far) * tintA, cB = sampleL(tB, uv * 1.1, far) * tintB, cC = sampleL(tC, uvr, far), cD = sampleL(tD, uvd, far);
        // height blending: each texture's luminance acts as its height map, giving natural interlocking transitions
        vec4 hgt = vec4(dot(cA, vec3(0.33)), dot(cB, vec3(0.33)), dot(cC, vec3(0.33)), dot(cD, vec3(0.33))) * 0.6 + w * 1.4;
        float hmax = max(max(hgt.x, hgt.y), max(hgt.z, hgt.w)) - 0.18;
        vec4 hb = max(hgt - hmax, 0.0) * step(0.001, w); w = hb / (hb.x + hb.y + hb.z + hb.w + 1e-4);
        vec3 col = cA * w.x + cB * w.y + cC * w.z + cD * w.w;
        col *= 0.82 + 0.36 * texture2D(tB, vWP.xz / 97.0).g;
        col *= mix(0.92, 1.06, smoothstep(0.2, 0.8, texture2D(tA, vWP.xz / 260.0).r));
        diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nm = (texture2D(nA, uv).xyz * w.x + texture2D(nB, uv * 1.1).xyz * w.y + texture2D(nC, uvr).xyz * w.z + texture2D(nD, uvd).xyz * w.w) * 2.0 - 1.0;
          nm.xy *= (1.0 - far * 0.7) * 0.9;
          vec3 T = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz; vec3 Bt = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          T = normalize(T - normal * dot(normal, T)); Bt = normalize(Bt - normal * dot(normal, Bt) - T * dot(T, Bt));
          normal = normalize(T * nm.x + Bt * nm.y + normal * nm.z);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain';
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

function waterMaterial() {
  const nt = waterNormalTexture(); nt.repeat.set(1, 1);
  const m = new THREE.MeshPhysicalMaterial({ color: 0x2c4a48, roughness: 0.06, metalness: 0.0, transmission: 0, transparent: true, opacity: 0.88, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.6, envMapIntensity: 1.2 });
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
    // sky + lighting
    const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky); this.sky = sky;
    const su = sky.material.uniforms; su.turbidity.value = def.turbidity; su.rayleigh.value = def.rayleigh; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.82;
    const phi = (90 - def.sun.elevation) * DEG, theta = def.sun.azimuth * DEG; this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    su.sunPosition.value.copy(this.sunDir);
    const pm = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); envScene.add(sky2);
    Object.assign(sky2.material.uniforms.turbidity, { value: def.turbidity }); sky2.material.uniforms.rayleigh.value = def.rayleigh; sky2.material.uniforms.sunPosition.value.copy(this.sunDir);
    sky2.material.uniforms.mieCoefficient.value = 0.006;
    this.envRT = pm.fromScene(envScene, 0, 0.1, 2000); scene.environment = this.envRT.texture; scene.environmentIntensity = 0.7;
    scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
    const sunCol = new THREE.Color().setHSL(0.1, 0.5, def.sun.elevation < 25 ? 0.78 : 0.92);
    const sun = new THREE.DirectionalLight(sunCol, def.sun.elevation < 25 ? 2.8 : 3.3); sun.castShadow = true;
    const sm = quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
    const S = 110; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 700 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    scene.add(sun); scene.add(sun.target); this.sun = sun;
    const hemi = new THREE.HemisphereLight(0xbfd4ff, new THREE.Color(...def.farColor).multiplyScalar(1.2), 0.7); scene.add(hemi);
    // terrain
    const tmat = terrainMaterial(def); this.terrainMat = tmat;
    this.terrainGroup = buildTerrainMeshes(mb, tmat, quality === 'low' ? 2 : 1); scene.add(this.terrainGroup);
    this.far = buildFarTerrain(mb, tmat); scene.add(this.far);
    this.waterMat = waterMaterial(); this.water = buildWater(mb, this.waterMat); scene.add(this.water);
    // structures and vegetation
    const st = buildStructures(mb, scene, mb.t); this.colliders = st.colliders;
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
  // ground height including bridges (terrain already raised under roads)
  groundHeight(x, z) { return this.terrain.height(x, z); }
  updateShadowCenter(target) {
    const s = this.sun; const snap = 2; const tx = Math.round(target.x / snap) * snap, tz = Math.round(target.z / snap) * snap; const ty = this.terrain.height(tx, tz);
    s.target.position.set(tx, ty, tz); s.position.set(tx + this.sunDir.x * 350, ty + this.sunDir.y * 350, tz + this.sunDir.z * 350); s.target.updateMatrixWorld();
  }
  update(dt, time, camPos) {
    this.veg.updateLOD(camPos); this.veg.update(dt); this.grass.update(camPos);
    const nm = this.waterMat.normalMap; nm.offset.x = time * 0.02; nm.offset.y = time * 0.013;
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
  dispose() { this.grass.dispose(); this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.envRT.dispose(); }
}
