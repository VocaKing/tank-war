// Trees, bushes and rocks: card-based foliage, chunked InstancedMeshes with 2 LOD levels,
// wind sway, and knock-down when a tank drives through a tree.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leafTexture, needleTexture, frondTexture, pbrTex } from './textures.js';
import { Grid2D } from './terrain.js';
import { RNG } from '../util.js';

export const windUniform = { value: 0 };
export function setWindTime(t) { windUniform.value = t; }
// v5: shared sun uniforms for leaf/blade translucency (set by World)
export const sunU = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(3, 3, 3) } };
// two-sided foliage lighting: keep the (spherical / up) normals on back faces instead of flipping them, and add
// sub-surface translucency when looking towards the sun through leaves.
export function foliageShading(sh, base = 0.05, back = 0.45, tipExpr = '1.0') {
  Object.assign(sh.uniforms, sunU);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform vec3 uSunCol;')
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz); float tr = pow(max(dot(-normalize(vViewPosition), Lv), 0.0), 4.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * (${base.toFixed(3)} + ${back.toFixed(3)} * tr) * (${tipExpr}); }`);
}

function foliageMaterial(tex, color = 0xffffff, sway = 1) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hgt = max(0.0, position.y);
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float ph = ip.x * 0.07 + ip.z * 0.05;
        transformed.x += sin(uWind * 1.3 + ph + position.y * 0.3) * 0.012 * hgt * ${sway.toFixed(2)};
        transformed.z += cos(uWind * 1.1 + ph * 1.3) * 0.009 * hgt * ${sway.toFixed(2)};`);
    foliageShading(sh, 0.04, 0.5);
  };
  m.customProgramCacheKey = () => 'foliage5' + sway;
  return m;
}

// --- geometry helpers ---
function card(w, h, cx, cy, cz, yaw, pitch, center) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(pitch); g.rotateY(yaw); g.translate(cx, cy, cz);
  // spherical normals for soft volumetric shading
  const p = g.attributes.position, n = g.attributes.normal; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * 0.8, p.getZ(i) - center.z).normalize(); n.setXYZ(i, v.x, v.y + 0.25, v.z); }
  return g;
}
function trunk(r0, r1, h, seg = 7, bend = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 4, true); g.translate(0, h / 2, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h / 2);
  if (bend) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; p.setX(i, p.getX(i) + bend * t * t); } }
  return g;
}
function withGroups(trunkG, leafG) {
  const a = trunkG.index ? trunkG.toNonIndexed() : trunkG; const b = leafG.index ? leafG.toNonIndexed() : leafG;
  for (const g of [a, b]) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries([a, b], true);
}
function merge(list) { return mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; })); }

function spruceGeo(lod, r) {
  const H = 19; const t = trunk(0.38, 0.08, H * 0.97, lod ? 5 : 8); const cards = []; const C = new THREE.Vector3(0, H * 0.5, 0);
  const layers = lod ? 7 : 16;
  for (let i = 0; i < layers; i++) {
    const f = i / layers; const y = H * (0.18 + f * 0.8); const rad = (1 - f) * 3.6 + 0.5; const n = lod ? 3 : Math.max(3, Math.round(7 - f * 3));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + i * 0.7 + r.range(-0.2, 0.2); const s = rad * 1.25 + 0.6;
      cards.push(card(s, s * 0.9, Math.cos(a) * rad * 0.45, y - s * 0.12, Math.sin(a) * rad * 0.45, -a + Math.PI / 2, -0.55, new THREE.Vector3(0, y, 0))); }
  }
  cards.push(card(1.8, 2.4, 0, H * 0.98, 0, 0, 0, C)); cards.push(card(1.8, 2.4, 0, H * 0.98, 0, Math.PI / 2, 0, C));
  return withGroups(t, merge(cards));
}
function broadleafGeo(lod, r, kind) {
  const isBirch = kind === 'birch', isOak = kind === 'oak';
  const H = isBirch ? 15 : isOak ? 13 : 14; const trunkH = H * (isBirch ? 0.75 : 0.5);
  const t = [trunk(isBirch ? 0.2 : 0.45, isBirch ? 0.1 : 0.25, trunkH, lod ? 5 : 8)];
  const cards = []; const crownC = new THREE.Vector3(0, trunkH + (H - trunkH) * 0.45, 0);
  const rx = isBirch ? 2.6 : isOak ? 5.2 : 4.2, ry = (H - trunkH) * 0.55;
  const clusters = lod ? 5 : isBirch ? 11 : 14;
  for (let c = 0; c < clusters; c++) {
    const a = r.range(0, Math.PI * 2), e = r.range(-0.6, 1.0); const d = r.range(0.35, 1);
    const cx = Math.cos(a) * rx * d * Math.cos(e), cy = crownC.y + Math.sin(e) * ry * d, cz = Math.sin(a) * rx * d * Math.cos(e);
    if (!lod && c % 3 === 0) { const br = new THREE.CylinderGeometry(0.06, 0.12, Math.hypot(cx, cz) + 0.5, 4); br.translate(0, (Math.hypot(cx, cz) + 0.5) / 2, 0); br.rotateZ(-Math.atan2(Math.hypot(cx, cz), cy - trunkH) * 0.9); br.rotateY(-a); br.translate(0, trunkH * 0.85, 0); t.push(br); }
    const per = lod ? 3 : 5; const s = isBirch ? 2.6 : 3.6;
    for (let k = 0; k < per; k++) cards.push(card(s * r.range(0.8, 1.2), s * r.range(0.8, 1.2), cx + r.range(-0.6, 0.6), cy + r.range(-0.5, 0.5), cz + r.range(-0.6, 0.6), r.range(0, Math.PI), r.range(-0.8, 0.8), crownC));
  }
  return withGroups(merge(t), merge(cards));
}
function palmGeo(lod, r) {
  const H = 11; const bend = 1.4; const t = trunk(0.28, 0.2, H, lod ? 5 : 8, bend);
  const fr = []; const n = lod ? 7 : 12; const top = new THREE.Vector3(bend, H, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.15, 0.15); const L = r.range(4.2, 5.4); const droop = r.range(0.25, 0.7);
    const segs = lod ? 2 : 4; const pos = [], uv = [], idx = [];
    for (let s = 0; s <= segs; s++) { const u = s / segs; const x = u * L, y = 0.6 * u - droop * u * u * L * 0.45; for (const w of [-1, 1]) { pos.push(x, y, w * 0.8 * (1 - u * 0.5)); uv.push(u, (w + 1) / 2); } }
    for (let s = 0; s < segs; s++) { const k = s * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    g.rotateX(r.range(-0.3, 0.3)); g.rotateY(a); g.translate(top.x, top.y, top.z); fr.push(g);
  }
  return withGroups(t, merge(fr));
}
function bushGeo(lod, r) {
  // solid irregular core (blocks line of sight visually) + leaf cards
  let core = new THREE.IcosahedronGeometry(1, lod ? 2 : 3); core.deleteAttribute('uv'); core.deleteAttribute('normal'); core = mergeVertices(core); const p = core.attributes.position;
  const uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 0.8 + 0.12 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3) + 0.06 * Math.sin(x * 13 + y * 11); p.setXYZ(i, x * n * 0.92, Math.max(-0.1, y) * n * 0.82 + 0.12, z * n * 0.92); uvs[i * 2] = (Math.atan2(z, x) / Math.PI + 1) * 2; uvs[i * 2 + 1] = y * 2; }
  core.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); core.computeVertexNormals();
  const cards = []; const C = new THREE.Vector3(0, 0.45, 0); const n = lod ? 10 : 36;
  for (let k = 0; k < n; k++) { const a = r.range(0, Math.PI * 2), e = r.range(0, 1.3); const cx = Math.cos(a) * Math.cos(e) * 0.88, cy = 0.12 + Math.sin(e) * 0.78, cz = Math.sin(a) * Math.cos(e) * 0.88; const s = r.range(0.8, 1.2);
    cards.push(card(s, s, cx, cy, cz, r.range(0, Math.PI), r.range(-0.9, 0.9), C)); }
  return withGroups(core, merge(cards));
}
// v4: several boulder shapes (layered noise, flattened base, strata facets) instead of one shared rock
function rockGeo(r, v = 0) {
  const g = new THREE.IcosahedronGeometry(1, 3); const p = g.attributes.position;
  const f = [[3.1, 2.7, 3.3, 1.2, 0.7], [2.2, 3.6, 1.8, 1.0, 0.9], [4.0, 1.9, 2.6, 1.45, 0.55], [1.6, 2.2, 4.4, 1.1, 0.8]][v % 4]; const ph = v * 1.7 + 0.3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let n = 0.78 + 0.22 * Math.sin(x * f[0] + ph) * Math.sin(y * f[1] + 2 + ph) * Math.sin(z * f[2] + ph) + 0.1 * Math.sin(x * 9 + z * 7 + ph) + 0.05 * Math.sin(x * 17 - y * 13 + z * 11);
    const strata = Math.round(y * 5) / 5; n *= 1 + (strata - y) * 0.12; // stepped bedding planes
    let yy = y * n * f[4]; if (yy < -0.25) yy = -0.25 - (yy + 0.25) * 0.15; // flattened, ground-hugging base
    p.setXYZ(i, x * n * f[3], yy, z * n);
  }
  g.computeVertexNormals(); return g;
}

const TYPES = {
  spruce: { geo: spruceGeo, tex: () => needleTexture(), bark: 0x8a7a6a, leafColor: 0xb8c4a8, radius: 0.5, sway: 0.6 },
  oak: { geo: (l, r) => broadleafGeo(l, r, 'oak'), tex: () => leafTexture('oak'), bark: 0x9a8a78, leafColor: 0xffffff, radius: 0.6, sway: 1 },
  broadleaf: { geo: (l, r) => broadleafGeo(l, r, 'broadleaf'), tex: () => leafTexture('broadleaf'), bark: 0x9a8a78, leafColor: 0xffffff, radius: 0.5, sway: 1 },
  birch: { geo: (l, r) => broadleafGeo(l, r, 'birch'), tex: () => leafTexture('birch'), bark: 0xe8e2d8, leafColor: 0xffffff, radius: 0.3, sway: 1.3 },
  palm: { geo: palmGeo, tex: () => frondTexture(), bark: 0xb09a80, leafColor: 0xffffff, radius: 0.35, sway: 1.4 },
  bush: { geo: bushGeo, tex: () => leafTexture('bush'), core: 0x27361c, leafColor: 0xffffff, sway: 0.5 },
  dry: { geo: bushGeo, tex: () => leafTexture('dry'), core: 0x4f4a32, leafColor: 0xe0d8c0, sway: 0.4 },
};

export class Vegetation {
  constructor(scene, mb, quality = 'high') {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'vegetation'; scene.add(this.group);
    this.chunkSize = 175; this.lodDist = quality === 'low' ? 160 : quality === 'medium' ? 210 : 260; this.half = mb.t.half;
    const r = new RNG(mb.def.seed + 5);
    const barkTex = pbrTex('bark_brown_02', 'diff'); const barkN = pbrTex('bark_brown_02', 'nor');
    this.mats = {};
    for (const [k, T] of Object.entries(TYPES)) {
      const leaf = foliageMaterial(T.tex(), T.leafColor, T.sway);
      const stem = T.core !== undefined ? new THREE.MeshStandardMaterial({ map: leafTexture(k === 'dry' ? 'dry' : 'bush', true), color: 0xcfd8c8, roughness: 1 }) : new THREE.MeshStandardMaterial({ map: barkTex, normalMap: barkN, color: T.bark, roughness: 0.95 });
      this.mats[k] = [stem, leaf];
    }
    this.geos = {}; for (const k of Object.keys(TYPES)) this.geos[k] = [TYPES[k].geo(0, r), TYPES[k].geo(1, r)];
    this.rockMat = new THREE.MeshStandardMaterial({ map: pbrTex('aerial_rocks_02', 'diff'), normalMap: pbrTex('aerial_rocks_02', 'nor'), roughnessMap: pbrTex('aerial_rocks_02', 'arm'), aoMap: pbrTex('aerial_rocks_02', 'arm'), roughness: 1.0, color: mb.def.id === 'desert' ? 0xd2b48c : 0xaaa49a });
    this.rockGeos = [0, 1, 2, 3].map((v) => rockGeo(r, v));
    // records
    this.trees = mb.trees.map((t, i) => ({ ...t, id: i, alive: true, fall: 0 }));
    this.bushes = mb.bushes.map((b, i) => ({ ...b, id: i }));
    this.rocks = mb.rocks;
    this.treeGrid = new Grid2D(this.half, 12); for (const t of this.trees) this.treeGrid.insert(t, t.x, t.z, 1);
    this.bushGrid = new Grid2D(this.half, 16); for (const b of this.bushes) this.bushGrid.insert(b, b.x, b.z, b.r);
    this.rockGrid = new Grid2D(this.half, 16); for (const k of this.rocks) this.rockGrid.insert(k, k.x, k.z, k.s * 1.2);
    this.chunks = new Map(); this.falling = [];
    const add = (rec, type, mat) => {
      const cx = Math.floor((rec.x + this.half) / this.chunkSize), cz = Math.floor((rec.z + this.half) / this.chunkSize); const key = cx + ',' + cz;
      if (!this.chunks.has(key)) this.chunks.set(key, { cx: (cx + 0.5) * this.chunkSize - this.half, cz: (cz + 0.5) * this.chunkSize - this.half, items: {} });
      const ch = this.chunks.get(key); (ch.items[type] ||= []).push(rec); rec.chunk = ch; rec.type = type; rec.matrix = mat;
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (const t of this.trees) { e.set(0, t.rot, 0); q.setFromEuler(e); m4.compose(v.set(t.x, t.y - 0.3, t.z), q, s.set(t.scale, t.scale * (0.9 + (t.id % 7) * 0.03), t.scale)); add(t, t.type, m4.clone()); }
    for (const b of this.bushes) { e.set(0, (b.id * 2.39) % 6.28, 0); q.setFromEuler(e); m4.compose(v.set(b.x, b.y - 0.25, b.z), q, s.set(b.r, b.h, b.r * (0.85 + (b.id % 5) * 0.06))); add(b, b.type, m4.clone()); }
    for (const [key, ch] of this.chunks) {
      ch.meshes = {};
      for (const [type, list] of Object.entries(ch.items)) {
        const tc = new THREE.Color(); const pair = [0, 1].map((lod) => { const im = new THREE.InstancedMesh(this.geos[type][lod], this.mats[type], list.length); list.forEach((rec, i) => { im.setMatrixAt(i, rec.matrix); rec['idx'] = i; const h = ((rec.x * 0.731 + rec.z * 0.377) % 1 + 1) % 1, h2 = ((rec.x * 0.173 - rec.z * 0.911) % 1 + 1) % 1; tc.setRGB(0.84 + h * 0.26 + h2 * 0.06, 0.86 + h * 0.22, 0.82 + h2 * 0.2); im.setColorAt(i, tc); }); im.castShadow = lod === 0; im.receiveShadow = lod === 0; im.computeBoundingSphere(); this.group.add(im); return im; });
        ch.meshes[type] = pair; void key;
      }
    }
    // rocks: single instanced mesh
    if (this.rocks.length) {
      const col = new THREE.Color(); this.rockMeshes = [];
      for (let vv = 0; vv < 4; vv++) {
        const list = this.rocks.filter((k, i) => i % 4 === vv); if (!list.length) continue;
        const im = new THREE.InstancedMesh(this.rockGeos[vv], this.rockMat, list.length);
        list.forEach((k, i) => { e.set(k.tilt, k.rot, k.tilt * 0.5); q.setFromEuler(e); m4.compose(v.set(k.x, k.y - k.s * 0.25, k.z), q, s.set(k.s, k.s, k.s)); im.setMatrixAt(i, m4); const h = ((k.x * 12.9898 + k.z * 78.233) % 1 + 1) % 1; col.setRGB(0.82 + h * 0.3, 0.8 + h * 0.28, 0.78 + h * 0.26); im.setColorAt(i, col); });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.group.add(im); this.rockMeshes.push(im);
      }
      this.rockMesh = this.rockMeshes[0];
    }
    // ghost bush for the one the player sits in (see-through from inside)
    this.ghostBush = null;
    this.ghostMats = {};
  }
  updateLOD(camPos) {
    for (const ch of this.chunks.values()) {
      const d = Math.hypot(ch.cx - camPos.x, ch.cz - camPos.z) - this.chunkSize * 0.7; const near = d < this.lodDist * (ch.near === true ? 1.08 : ch.near === false ? 0.92 : 1);
      if (ch.near === near) continue; ch.near = near;
      for (const pair of Object.values(ch.meshes)) { pair[0].visible = near; pair[1].visible = !near; }
    }
  }
  bushAt(x, z, pad = 0) {
    const l = this.bushGrid.query(x, z, 8); let best = null, bd = 1e9;
    for (const b of l) { const d = Math.hypot(b.x - x, b.z - z); if (d < b.r * 0.92 + pad && d < bd) { bd = d; best = b; } }
    return best;
  }
  // tanks knock down trees they drive into
  knock(x, z, radius, dirX, dirZ, speed) {
    if (Math.abs(speed) < 0.6) return 0; let n = 0;
    for (const t of this.treeGrid.query(x, z, radius + 1)) {
      if (!t.alive) continue; const d = Math.hypot(t.x - x, t.z - z); if (d > radius + TYPES[t.type].radius * t.scale) continue;
      t.alive = false; t.fallAxis = new THREE.Vector3(dirZ, 0, -dirX).normalize(); t.fall = 0; this.falling.push(t); n++;
    }
    return n;
  }
  update(dt) {
    if (!this.falling.length) return;
    const q = new THREE.Quaternion(), m = new THREE.Matrix4(), base = new THREE.Matrix4();
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const t = this.falling[i]; t.fall = Math.min(1, t.fall + dt * (0.4 + t.fall * 2.2)); const ang = t.fall * t.fall * 1.45;
      q.setFromAxisAngle(t.fallAxis, -ang); m.makeRotationFromQuaternion(q);
      base.copy(t.matrix); const pos = new THREE.Vector3().setFromMatrixPosition(base); base.setPosition(0, 0, 0);
      const out = new THREE.Matrix4().multiplyMatrices(m, base); out.setPosition(pos);
      for (const im of t.chunk.meshes[t.type]) { im.setMatrixAt(t.idx, out); im.instanceMatrix.needsUpdate = true; }
      if (t.fall >= 1) this.falling.splice(i, 1);
    }
  }
  // hide the instance the player is inside and show a translucent copy
  setPlayerBush(b) {
    if (this.playerBush === b) return;
    const setScale = (rec, show) => { for (const im of rec.chunk.meshes[rec.type]) { if (show) im.setMatrixAt(rec.idx, rec.matrix); else im.setMatrixAt(rec.idx, new THREE.Matrix4().makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true; } };
    if (this.playerBush) setScale(this.playerBush, true);
    if (this.ghostBush) { this.group.remove(this.ghostBush); this.ghostBush = null; }
    this.playerBush = b;
    if (b) {
      setScale(b, false);
      if (!this.ghostMats[b.type]) this.ghostMats[b.type] = this.mats[b.type].map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.28; c.depthWrite = false; c.alphaTest = 0.3; return c; });
      const mesh = new THREE.Mesh(this.geos[b.type][0], this.ghostMats[b.type]); mesh.matrixAutoUpdate = false; mesh.matrix.copy(b.matrix); this.group.add(mesh); this.ghostBush = mesh;
    }
  }
}
