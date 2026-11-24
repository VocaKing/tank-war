// Procedural buildings, walls, bridges and props merged into a few draw calls per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbrTex, windowTexture, windowRoughTexture } from './textures.js';
import { OBB } from './terrain.js';
import { RNG } from '../util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function xf(g, x, y, z, ry = 0, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s); return g.applyMatrix4(_m); }
function boxUV(w, h, d, tile = 3, uo = 0) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); uv.setXY(i, uv.getX(i) * dims[f][0] / tile + uo, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
function clean(g) {
  const count = g.attributes.position.count;
  // Keep shared vertices on the repeated boxes, arches, cylinders and trim.
  if (!g.index) {
    const Indices = count > 65536 ? Uint32Array : Uint16Array;
    g.setIndex(new THREE.BufferAttribute(Indices.from({ length: count }, (_, i) => i), 1));
  }
  for (const key of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  return g;
}
function gableRoof(w, d, H, R, o, tile = 2.5) {
  const hw = w / 2 + o, hd = d / 2 + o, ey = H - o * R / (w / 2), ry = H + R;
  const slope = Math.hypot(hw, ry - ey);
  const pos = [], uv = [];
  const quad = (a, b, c, d2, ua) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d2); uv.push(...ua[0], ...ua[1], ...ua[2], ...ua[0], ...ua[2], ...ua[3]); };
  const L = (2 * hd) / tile, S = slope / tile;
  quad([hw, ey, hd], [hw, ey, -hd], [0, ry, -hd], [0, ry, hd], [[0, 0], [L, 0], [L, S], [0, S]]);
  quad([-hw, ey, -hd], [-hw, ey, hd], [0, ry, hd], [0, ry, -hd], [[0, 0], [L, 0], [L, S], [0, S]]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  // gable triangles (walls)
  const gp = [w / 2, H, d / 2, 0, H + R, d / 2, -w / 2, H, d / 2, -w / 2, H, -d / 2, 0, H + R, -d / 2, w / 2, H, -d / 2];
  const gu = [w / 2 / 3, 0, 0, R / 3, -w / 2 / 3, 0, w / 2 / 3, 0, 0, R / 3, -w / 2 / 3, 0];
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2)); gg.computeVertexNormals();
  return { roof: g, gables: gg };
}

// Planar arched glazing and a shallow extruded stone surround. Local +Z faces out.
function archedOpening(width, height, frame) {
  const r = width / 2, spring = height / 2 - r;
  const profile = (path, inset) => {
    const rad = r - inset;
    path.moveTo(-rad, -height / 2 + inset);
    path.lineTo(rad, -height / 2 + inset);
    path.lineTo(rad, spring);
    path.absarc(0, spring, rad, 0, Math.PI, false);
    path.closePath();
    return path;
  };
  const border = profile(new THREE.Shape(), 0);
  border.holes.push(profile(new THREE.Path(), frame));
  const molding = new THREE.ExtrudeGeometry(border, { depth: 0.085, bevelEnabled: false, curveSegments: 10 });
  const glazing = new THREE.ShapeGeometry(profile(new THREE.Shape(), frame), 10);
  const uv = glazing.attributes.uv, pos = glazing.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height + 0.5);
  return { molding, glazing };
}

const WEATHERED = ['stone', 'castle', 'brick', 'plaster', 'damaged', 'wood'];

function weatherMasonry(material, mapId) {
  const strength = mapId === 'desert' ? 0.22 : mapId === 'forest' ? 0.36 : 0.30;
  material.onBeforeCompile = shader => {
    shader.uniforms.wallWeathering = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float floorHeight; varying vec3 vWallExposure;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallExposure = vec3(position.x, position.y - floorHeight, position.z);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float wallWeathering; varying vec3 vWallExposure;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wallAcross = vWallExposure.x * 0.72 + vWallExposure.z * 0.68;
        float mottling = sin(wallAcross * 5.4 + sin(wallAcross * 1.33) * 1.8);
        float splashHeight = 0.9 + mottling * 0.22;
        float damp = 1.0 - smoothstep(0.04, splashHeight, vWallExposure.y);
        float streak = smoothstep(0.27, 0.9, mottling) * 0.11 * (1.0 - damp);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.88, 0.83, 0.67), damp * 0.68);
        diffuseColor.rgb *= 1.0 - wallWeathering * (damp + streak);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - damp * 0.14;');
  };
  material.customProgramCacheKey = () => 'structure-weathering';
}

export function buildingMaterials(mapId) {
  const tex = (n, rep = 1) => ({ map: pbrTex(n, 'diff'), normalMap: pbrTex(n, 'nor'), roughnessMap: pbrTex(n, 'arm'), aoMap: pbrTex(n, 'arm'), aoMapIntensity: 0.8 });
  const M = {
    stone: new THREE.MeshStandardMaterial({ ...tex('plastered_stone_wall'), roughness: 0.92, color: 0xf0e8dc }),
    castle: new THREE.MeshStandardMaterial({ ...tex('plastered_stone_wall'), roughness: 0.95, color: 0xa8a49c }),
    brick: new THREE.MeshStandardMaterial({ ...tex('red_brick_03'), roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ ...tex('clay_plaster'), roughness: 0.95, color: 0xe8d2ae }),
    damaged: new THREE.MeshStandardMaterial({ ...tex('damaged_plaster'), roughness: 0.95, color: 0xd9c4a0 }),
    roof: new THREE.MeshStandardMaterial({ ...tex('clay_roof_tiles_02'), roughness: 0.85, side: THREE.DoubleSide }),
    slate: new THREE.MeshStandardMaterial({ ...tex('clay_roof_tiles_02'), roughness: 0.8, color: 0x6c6a6a, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ ...tex('brown_planks_05'), roughness: 1.0, color: 0xc8b49a }),
    woodcut: new THREE.MeshStandardMaterial({ color: 0xaa8457, roughness: 0.92 }),
    woodgrain: new THREE.MeshStandardMaterial({ color: 0x795c3c, roughness: 1 }),
    window: new THREE.MeshPhysicalMaterial({ map: windowTexture(), roughnessMap: windowRoughTexture(), roughness: 1.0, metalness: 0.0, ior: 1.52, specularIntensity: 1.0, envMapIntensity: 1.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 }),
    paintwood: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), // colour comes from per-building trim tint
    hay: new THREE.MeshStandardMaterial({ color: 0xc4a45e, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 0.6, metalness: 0.6 }),
    rust: new THREE.MeshStandardMaterial({ ...tex('rusty_metal_02'), roughness: 0.85, metalness: 0.3, color: 0x7a6a5a }),
    canvasR: new THREE.MeshStandardMaterial({ color: 0x9b3b2b, roughness: 1, side: THREE.DoubleSide }),
    canvasB: new THREE.MeshStandardMaterial({ color: 0x3b5b8b, roughness: 1, side: THREE.DoubleSide }),
    sand: new THREE.MeshStandardMaterial({ color: 0xb8a582, roughness: 1 }),
    dome: new THREE.MeshStandardMaterial({ color: 0x3f8a8f, roughness: 0.45, metalness: 0.3 }),
    burnt: new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }),
    paintwhite: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.85 }),
  };
  for (const key of WEATHERED) weatherMasonry(M[key], mapId);
  return M;
}

// v4: per-building colour variation via vertex colours (walls, shutters/doors, roof tiles), merged per material
const TINTABLE = { stone: 'wall', plaster: 'wall', damaged: 'wall', brick: 'brick', paintwood: 'trim', roof: 'roof', slate: 'roof', castle: 'stoneT' };
class Buckets {
  constructor() { this.b = {}; this.tint = null; this.floor = null; }
  add(k, g) {
    const n = clean(g); const c = new Float32Array(n.attributes.position.count * 3); const t = (this.tint && this.tint[TINTABLE[k]]) || null;
    c.fill(1); if (!t && k === 'paintwood') for (let i = 0; i < c.length; i += 3) { c[i] = 0.076; c[i + 1] = 0.148; c[i + 2] = 0.099; } if (t) for (let i = 0; i < c.length; i += 3) { c[i] = t[0]; c[i + 1] = t[1]; c[i + 2] = t[2]; }
    n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (WEATHERED.includes(k)) {
      const position = n.attributes.position, floor = new Float32Array(position.count);
      if (this.floor === null) {
        for (let i = 0; i < floor.length; i++) floor[i] = position.getY(i) - 8;
      } else floor.fill(this.floor);
      n.setAttribute('floorHeight', new THREE.BufferAttribute(floor, 1));
    }
    (this.b[k] ||= []).push(n);
  }
}
const WALL_TINTS = [[1.05, 1.05, 1.02], [1.3, 1.24, 1.1], [1.28, 1.1, 0.82], [1.12, 1.12, 1.16], [1.25, 1.02, 0.96], [0.95, 0.9, 0.84], [1.35, 1.3, 1.2]];
// trim colours are authored in sRGB; vertex colours are linear, so convert
const TRIM_TINTS = [[0.31, 0.42, 0.35], [0.2, 0.3, 0.22], [0.5, 0.2, 0.16], [0.26, 0.36, 0.52], [0.36, 0.26, 0.18], [0.78, 0.74, 0.64], [0.22, 0.22, 0.24]].map((c) => c.map((v) => Math.pow(v, 2.2)));
function pickTint(r, style) {
  const w = WALL_TINTS[Math.floor(r.next() * WALL_TINTS.length)]; const j = 0.94 + r.next() * 0.1; const rf = 0.82 + r.next() * 0.3;
  return { wall: style === 'desert' ? [(1 + (w[0] - 1) * 0.35) * j, (1 + (w[1] - 1) * 0.35) * j * 0.98, (1 + (w[2] - 1) * 0.35) * j * 0.95] : w.map((v) => v * j), brick: [j, j * (0.95 + r.next() * 0.08), j], trim: TRIM_TINTS[Math.floor(r.next() * TRIM_TINTS.length)], roof: [rf, rf * (0.92 + r.next() * 0.1), rf * (0.9 + r.next() * 0.1)], stoneT: [j, j, j * 0.98] };
}

export function buildStructures(mb, scene, terrain) {
  const M = buildingMaterials(mb.def.id); const B = new Buckets(); const colliders = []; const r = new RNG(mb.def.seed + 99);
  const detailRng = new RNG(mb.def.seed + 571);
  const wallMat = (b) => (b.style === 'brick' ? 'brick' : b.style === 'desert' ? (b.ruined ? 'damaged' : 'plaster') : b.style === 'castle' ? 'castle' : b.style === 'cabin' ? 'wood' : 'stone');
  const place = (g, b, lx, ly, lz, ry = 0, rx = 0, rz = 0) => { xf(g, lx, ly, lz, ry, rx, rz); xf(g, b.x, b.y, b.z, b.rot); return g; };
  const windowsOnWall = (b, len, axis, sign, floors, H0, skipDoor) => {
    const n = Math.max(1, Math.floor(len / 3.4));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n); if (skipDoor && f === 0 && i === Math.floor(n / 2)) continue;
      const small = b.style === 'desert'; const ww = small ? 0.8 : 1.0, wh = small ? 1.0 : 1.3; const y = H0 + f * 3 + 1.6;
      const off = (axis === 'x' ? b.w / 2 : b.d / 2) + (b.style === 'cabin' ? 0.08 : 0.03);
      const put = (gg, dx, dy, dz, mat) => { if (axis === 'x') place(gg, b, sign * (off + dz), y + dy, t + dx, Math.PI / 2); else place(gg, b, t + dx, y + dy, sign * (off + dz), 0); B.add(mat, gg); };
      const broken = b.damage && r.next() < 0.3;
      put(boxUV(ww, wh, 0.06, 1), 0, 0, 0, broken ? 'dark' : 'window'); // recessed glazing
      const fm = b.style === 'desert' ? 'wood' : wallMat(b) === 'wood' ? 'paintwhite' : 'paintwood'; const fw = 0.07;
      put(boxUV(ww + fw * 2, fw, 0.1, 1), 0, wh / 2 + fw / 2, 0, fm); put(boxUV(ww + fw * 2, fw, 0.1, 1), 0, -wh / 2 - fw / 2, 0, fm);
      put(boxUV(fw, wh, 0.1, 1), -ww / 2 - fw / 2, 0, 0, fm); put(boxUV(fw, wh, 0.1, 1), ww / 2 + fw / 2, 0, 0, fm);
      if (!small && !broken) { put(boxUV(0.04, wh, 0.05, 1), 0, 0, 0.03, fm); put(boxUV(ww, 0.04, 0.05, 1), 0, wh * 0.18, 0.03, fm); }
      const sm = b.style === 'brick' ? 'stone' : wallMat(b) === 'wood' ? 'wood' : b.style === 'desert' ? 'plaster' : 'castle';
      put(boxUV(ww + 0.3, 0.08, 0.22, 1), 0, -wh / 2 - fw - 0.04, 0.06, sm); // sill
      if (b.style !== 'desert') put(boxUV(ww + 0.36, 0.18, 0.1, 1), 0, wh / 2 + fw + 0.09, 0.0, sm); // lintel
      else if (r.next() < 0.4) put(boxUV(ww + 0.2, 0.06, 0.4, 1), 0, wh / 2 + 0.25, 0.2, 'wood'); // sun shade
      if (b.style === 'stone' && !b.ruined && r.next() < 0.6) for (const s of [-1, 1]) { const sh = boxUV(0.5, wh + 0.1, 0.05, 1); const so = off + 0.03; if (axis === 'x') place(sh, b, sign * so, y, t + s * (ww / 2 + 0.27), Math.PI / 2); else place(sh, b, t + s * (ww / 2 + 0.27), y, sign * so, 0); B.add('paintwood', sh); }
    }
  };
  const addArch = (b, x, y, z, yaw, width, height, frame, fill, louvers = false) => {
    const { molding, glazing } = archedOpening(width, height, frame);
    B.add('castle', place(molding, b, x, y, z, yaw));
    B.add(fill, place(glazing, b, x, y, z, yaw));
    if (louvers && mb.quality !== 'low') {
      const depth = 0.052, insetWidth = width - frame * 2;
      for (let offset = -height / 2 + frame * 1.75; offset < height / 2 - width / 2; offset += 0.22) {
        B.add('wood', place(boxUV(insetWidth, 0.134, 0.14, 1),
          b, x + Math.sin(yaw) * depth, y + offset, z + Math.cos(yaw) * depth, yaw, -0.24));
      }
    }
  };
  for (const b of mb.buildings) {
    B.tint = pickTint(r, b.style);
    B.floor = b.y;
    const wm = wallMat(b); const fl = b.floors || 1; let H = fl * 3 + 0.4; let top = H;
    if (b.kind === 'tower') {
      H = fl * 4; const g = boxUV(b.w, H, b.d, 3); place(g, b, 0, H / 2, 0); B.add('castle', g);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (r.next() < 0.35) continue; const g2 = boxUV(1.4, 1.2 + r.range(0, 1.5), 1.4, 3); place(g2, b, Math.cos(a) * b.w / 2.1, H + 0.6, Math.sin(a) * b.d / 2.1); B.add('castle', g2); }
      for (let f = 0; f < fl; f++) for (const side of [-1, 1]) {
        addArch(b, side * 1.5, f * 4 + 2.5, b.d / 2 + 0.018, 0, 0.73, 1.67, 0.13, 'dark');
        addArch(b, side * (b.w / 2 + 0.018), f * 4 + 2.5, 0, side * Math.PI / 2, 0.73, 1.67, 0.13, 'dark');
      }
      for (const h of [0.40, H - 0.35]) B.add('castle', place(boxUV(b.w + 0.22, 0.28, b.d + 0.22, 2), b, 0, h, 0));
      colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + H + 1.5));
      continue;
    }
    if (b.kind === 'church') {
      H = 9; const g = boxUV(b.w, H, b.d, 3); place(g, b, 0, H / 2, 0); B.add('stone', g);
      const { roof, gables } = gableRoof(b.w, b.d, H, 5.5, 0.5); place(roof, b, 0, 0, 0); B.add('slate', roof); place(gables, b, 0, 0, 0); B.add('stone', gables);
      const tg = boxUV(5.5, 20, 5.5, 3); place(tg, b, 0, 10, -b.d / 2 - 2.5); B.add('stone', tg);
      const sp = new THREE.ConeGeometry(4.3, 10, 4); sp.rotateY(Math.PI / 4); place(sp, b, 0, 25, -b.d / 2 - 2.5); B.add('slate', sp);
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const z = -9 + i * 4.4;
        addArch(b, side * (b.w / 2 + 0.022), 4.6, z, side * Math.PI / 2, 1.34, 3.63, 0.16, 'window');
        B.add('castle', place(boxUV(0.76, 3.2, 0.86, 1.5), b, side * (b.w / 2 + 0.19), 1.6, z + 2.06));
        B.add('castle', place(boxUV(0.61, 0.14, 0.97, 1.5), b, side * (b.w / 2 + 0.22), 3.27, z + 2.06));
      }
      const steepleZ = -b.d / 2 - 2.5;
      for (const side of [-1, 1]) {
        addArch(b, side * 2.77, 16.1, steepleZ, side * Math.PI / 2, 1.24, 2.82, 0.18, 'dark', true);
        addArch(b, 0, 16.1, steepleZ + side * 2.77, side > 0 ? 0 : Math.PI, 1.24, 2.82, 0.18, 'dark', true);
      }
      B.add('castle', place(boxUV(5.82, 0.27, 5.82, 2), b, 0, 19.82, steepleZ));
      for (const y of [5.18, 13.97]) B.add('castle', place(boxUV(5.64, 0.17, 5.64, 2), b, 0, y, steepleZ));
      addArch(b, 0, 1.87, steepleZ - 2.77, Math.PI, 2.43, 3.62, 0.23, 'dark');
      colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + H + 5));
      const tc = Math.cos(b.rot), ts = Math.sin(b.rot); const tz = -b.d / 2 - 2.5;
      colliders.push(new OBB(b.x + tz * ts, b.z + tz * tc, 2.75, 2.75, b.rot, b.y - 2, b.y + 30));
      continue;
    }
    if (b.kind === 'mosque') {
      H = 10; const g = boxUV(b.w, H, b.d, 3); place(g, b, 0, H / 2, 0); B.add('plaster', g);
      const drum = new THREE.CylinderGeometry(7.5, 7.5, 2.5, 32); place(drum, b, 0, H + 1.25, 0); B.add('plaster', drum);
      const dome = new THREE.SphereGeometry(7.5, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2); place(dome, b, 0, H + 2.5, 0); B.add('dome', dome);
      if (mb.quality !== 'low') {
        // Shallow ribs following the shell and a moulded ring at the springline.
        const ring = new THREE.TorusGeometry(7.50, 0.103, 6, 40).rotateX(Math.PI / 2);
        B.add('castle', place(ring, b, 0, H + 2.51, 0));
        const points = Array.from({ length: 12 }, (_, i) => {
          const angle = i / 12 * (Math.PI / 2);
          return new THREE.Vector3(0, 7.54 * Math.sin(angle), 7.54 * Math.cos(angle));
        });
        const rib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.047, 4, false);
        for (let i = 0; i < 16; i++) B.add('dome', place(rib.clone(), b, 0, H + 2.5, 0, i * Math.PI / 8));
      }
      const min = new THREE.CylinderGeometry(1.4, 1.8, 32, 16); place(min, b, b.w / 2 + 3, 16, b.d / 2 + 3); B.add('plaster', min);
      const bal = new THREE.CylinderGeometry(2.4, 2.0, 1.0, 16); place(bal, b, b.w / 2 + 3, 26, b.d / 2 + 3); B.add('plaster', bal);
      const cap = new THREE.ConeGeometry(1.6, 4, 16); place(cap, b, b.w / 2 + 3, 34, b.d / 2 + 3); B.add('dome', cap);
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        addArch(b, -8 + i * 4, 4.5, side * (b.d / 2 + 0.022), side > 0 ? 0 : Math.PI, 1.51, 2.94, 0.17, 'window');
        B.add('plaster', place(boxUV(1.66, 0.11, 0.20, 1), b, -8 + i * 4, 2.97, side * (b.d / 2 + 0.046)));
      }
      const minX = b.w / 2 + 3, minZ = b.d / 2 + 3;
      for (const height of [25.55, 26.63, 27.37]) {
        const rail = new THREE.TorusGeometry(2.18, 0.082, 6, 32);
        rail.rotateX(Math.PI / 2);
        B.add('castle', place(rail, b, minX, height, minZ));
      }
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        B.add('plaster', place(boxUV(0.14, 0.82, 0.12, 1), b, minX + 2.18 * Math.sin(a), 27.0, minZ + 2.18 * Math.cos(a), a));
      }
      colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + H + 9));
      const c = Math.cos(b.rot), s2 = Math.sin(b.rot); colliders.push(new OBB(b.x + (b.w / 2 + 3) * c + (b.d / 2 + 3) * s2, b.z - (b.w / 2 + 3) * s2 + (b.d / 2 + 3) * c, 1.8, 1.8, 0, b.y - 2, b.y + 36));
      continue;
    }
    if (b.ruined) {
      // jagged broken walls + rubble, no roof
      const segW = 1.2; const th = 0.5;
      for (const [len, axis, sign] of [[b.w, 'z', 1], [b.w, 'z', -1], [b.d, 'x', 1], [b.d, 'x', -1]]) {
        const n = Math.ceil(len / segW);
        for (let i = 0; i < n; i++) { const t = -len / 2 + (i + 0.5) * (len / n); const hh = Math.max(0.6, H * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + sign * 2 + b.x))) * r.range(0.6, 1.05)); if (r.next() < 0.1) continue;
          const g = boxUV(len / n + 0.02, hh, th, 3, t / 3);
          if (axis === 'z') place(g, b, t, hh / 2, sign * (b.d / 2 - th / 2)); else place(g, b, sign * (b.w / 2 - th / 2), hh / 2, t, Math.PI / 2);
          B.add(wm, g); }
      }
      for (let i = 0; i < 26; i++) { const s = r.range(0.4, 1.4); const g = boxUV(s, s * 0.6, s * r.range(0.6, 1.4), 2); place(g, b, r.range(-b.w / 2 - 2, b.w / 2 + 2), s * 0.2, r.range(-b.d / 2 - 2, b.d / 2 + 2), r.range(0, 3), r.range(-0.4, 0.4), r.range(-0.4, 0.4)); B.add(wm, g); }
      const pile = new THREE.ConeGeometry(Math.min(b.w, b.d) * 0.45, 1.6, 9); place(pile, b, 0, 0.6, 0); B.add(wm, pile);
      colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + H * 0.6));
      continue;
    }
    // standard house / barn / desert block
    const g = boxUV(b.w, H, b.d, 3, r.range(0, 1)); place(g, b, 0, H / 2, 0); B.add(b.style === 'cabin' ? 'stone' : wm, g);
    b.damage = b.style !== 'cabin' && r.next() < (b.style === 'desert' ? 0.45 : 0.3);
    // plinth / base course, corner quoins, string course between floors
    if (b.style !== 'cabin') { const pg = boxUV(b.w + 0.12, 0.55, b.d + 0.12, 2); place(pg, b, 0, 0.27, 0); B.add(b.style === 'desert' ? 'damaged' : 'castle', pg); }
    if (b.style === 'stone' || b.style === 'brick') for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (let k = 0; k < Math.floor(H / 0.5); k++) { const q = boxUV(k % 2 ? 0.5 : 0.3, 0.24, k % 2 ? 0.3 : 0.5, 1); place(q, b, cx * (b.w / 2 - 0.1 + 0.04), 0.6 + k * 0.5, cz * (b.d / 2 - 0.1 + 0.04)); B.add('castle', q); }
    for (let f = 1; f < fl; f++) { const sc = boxUV(b.w + 0.1, 0.14, b.d + 0.1, 2); place(sc, b, 0, 0.4 + f * 3, 0); B.add(b.style === 'desert' ? 'plaster' : 'castle', sc); }
    // shell damage: holes punched through walls with scorched rims and rubble below
    if (b.damage) for (let k = 0; k < 1 + Math.floor(r.next() * 3); k++) {
      const side = Math.floor(r.next() * 4); const along = side < 2 ? b.d : b.w; const tpos = r.range(-along / 2 + 1.2, along / 2 - 1.2); const hy = r.range(1.0, H - 1.0); const hs = r.range(0.7, 1.5);
      const hole = new THREE.CircleGeometry(hs * 0.5, 9); const rim = new THREE.RingGeometry(hs * 0.5, hs * 0.95, 9); const off = (side < 2 ? b.w / 2 : b.d / 2) + 0.05; const sg = side % 2 ? -1 : 1;
      for (const [gg, mat, o] of [[hole, 'dark', 0.02], [rim, 'burnt', 0.01]]) { if (side < 2) place(gg, b, sg * (off + o), hy, tpos, sg * Math.PI / 2); else place(gg, b, tpos, hy, sg * (off + o), sg > 0 ? 0 : Math.PI); B.add(mat, gg); }
      for (let i = 0; i < 6; i++) { const s2 = r.range(0.2, 0.6); const rb = boxUV(s2, s2 * 0.6, s2, 1); const ox = side < 2 ? sg * (off + r.range(0.2, 1.5)) : tpos + r.range(-1, 1); const oz = side < 2 ? tpos + r.range(-1, 1) : sg * (off + r.range(0.2, 1.5)); place(rb, b, ox, s2 * 0.25, oz, r.range(0, 3), r.range(-0.5, 0.5)); B.add(wm === 'wood' ? 'stone' : wm, rb); }
    }
    // downpipe at a corner + gutter line for pitched roofs
    if (b.roof === 'gable' && b.style !== 'cabin') { const dp = new THREE.CylinderGeometry(0.06, 0.06, H, 6); place(dp, b, b.w / 2 + 0.08, H / 2, b.d / 2 - 0.25); B.add('metal', dp); }
    if (b.style === 'cabin') { const up = boxUV(b.w + 0.1, H - 0.9, b.d + 0.1, 2.5); place(up, b, 0, 0.9 + (H - 0.9) / 2, 0); B.add('wood', up); }
    if (b.roof === 'gable') {
      const ridgeZ = b.d >= b.w; const ww = ridgeZ ? b.w : b.d, dd = ridgeZ ? b.d : b.w; const R = ww * (b.style === 'cabin' ? 0.55 : 0.42);
      const { roof, gables } = gableRoof(ww, dd, H, R, 0.45); const ry = ridgeZ ? 0 : Math.PI / 2;
      place(roof, b, 0, 0, 0, ry); B.add(b.style === 'cabin' || b.barn ? 'slate' : 'roof', roof); place(gables, b, 0, 0, 0, ry); B.add(b.style === 'cabin' ? 'wood' : wm, gables);
      top = H + R;
      // ridge cap, eave fascia boards and gutters
      const rc = boxUV(0.32, 0.18, dd + 0.9, 1); place(rc, b, 0, H + R + 0.05, 0, ry); B.add(b.style === 'cabin' || b.barn ? 'slate' : 'roof', rc);
      for (const sg of [-1, 1]) { const ex = sg * (ww / 2 + 0.45); const ey = H - 0.45 * R / (ww / 2); const fa = boxUV(0.05, 0.22, dd + 0.9, 1); const gu = new THREE.CylinderGeometry(0.07, 0.07, dd + 0.9, 6); gu.rotateX(Math.PI / 2);
        if (ridgeZ) { place(fa, b, ex, ey - 0.08, 0); place(gu, b, ex + sg * 0.06, ey - 0.12, 0); } else { place(fa, b, 0, ey - 0.08, ex, Math.PI / 2); place(gu, b, 0, ey - 0.12, ex + sg * 0.06, Math.PI / 2); }
        B.add(b.style === 'cabin' ? 'wood' : 'paintwood', fa); if (b.style !== 'cabin') B.add('metal', gu); }
      // Model exposed eave tiles and verge boards so roof edges have depth.
      const tileMat = b.style === 'cabin' || b.barn ? 'slate' : 'roof';
      const slope = Math.atan2(R, ww / 2);
      const edge = ww / 2 + 0.45;
      const tiles = Math.ceil((dd + 0.7) / 0.54);
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          const halfSlopeX = side * edge / 2, vergeZ = end * (dd / 2 + 0.44);
          B.add('wood', place(boxUV(Math.hypot(edge, edge * Math.tan(slope)), 0.19, 0.08, 2),
            b, Math.cos(ry) * halfSlopeX + Math.sin(ry) * vergeZ,
            H + R - edge * Math.tan(slope) / 2,
            Math.cos(ry) * vergeZ - Math.sin(ry) * halfSlopeX, ry, 0, -side * slope));
        }
        for (let k = 0; k < tiles; k++) {
          const x = side * (edge - 0.16), z = ((k + 0.5) / tiles - 0.5) * (dd + 0.73);
          const ey = H + R - Math.abs(x) * Math.tan(slope);
          B.add(tileMat, place(boxUV(0.40, 0.085, (dd + 0.7) / tiles - 0.035, 0.5),
            b, x * Math.cos(ry) + z * Math.sin(ry), ey + 0.035 + detailRng.range(-0.015, 0.015),
            z * Math.cos(ry) - x * Math.sin(ry), ry, 0, -side * slope));
        }
      }
      if (!b.barn) { const cx = ridgeZ ? ww * 0.22 : dd * 0.3, cz = ridgeZ ? dd * 0.3 : ww * 0.22; const ch = boxUV(0.7, 2.0, 0.7, 1.5); place(ch, b, cx, H + R * 0.6 + 0.6, cz); B.add(wm === 'wood' ? 'stone' : wm, ch);
        const cap = boxUV(0.86, 0.1, 0.86, 1); place(cap, b, cx, H + R * 0.6 + 1.65, cz); B.add('castle', cap); for (const o of [-0.15, 0.15]) { const pot = new THREE.CylinderGeometry(0.09, 0.11, 0.35, 8); place(pot, b, cx + o, H + R * 0.6 + 1.85, cz); B.add('rust', pot); } }
      if (b.damage && r.next() < 0.6) { const hole = boxUV(r.range(1.2, 2.5), 0.1, r.range(1.2, 2.2), 1); place(hole, b, ridgeZ ? ww * 0.12 : 0, H + R * 0.55, ridgeZ ? 0 : ww * 0.12, ry, 0, ridgeZ ? Math.atan(R / (ww / 2)) : 0); B.add('dark', hole); }
    } else {
      // flat roof with parapet, rooftop clutter
      for (const [w2, d2, x2, z2] of [[b.w, 0.3, 0, b.d / 2 - 0.15], [b.w, 0.3, 0, -b.d / 2 + 0.15], [0.3, b.d, b.w / 2 - 0.15, 0], [0.3, b.d, -b.w / 2 + 0.15, 0]]) { const pg = boxUV(w2, 0.7, d2, 3); place(pg, b, x2, H + 0.35, z2); B.add(wm, pg);
        B.add('damaged', place(boxUV(w2 + 0.12, 0.095, d2 + 0.12, 1.4), b, x2, H + 0.68, z2)); }
      const slab = boxUV(b.w - 0.2, 0.1, b.d - 0.2, 3); place(slab, b, 0, H + 0.05, 0); B.add('damaged', slab);
      if (r.next() < 0.5) { const tk = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12); place(tk, b, r.range(-b.w / 3, b.w / 3), H + 1.0, r.range(-b.d / 3, b.d / 3)); B.add('metal', tk); }
      if (fl >= 2 && r.next() < 0.4) { const sw = b.w * 0.45, sd = b.d * 0.45; const sg = boxUV(sw, 2.6, sd, 3); place(sg, b, b.w / 2 - sw / 2 - 0.3, H + 1.3, -b.d / 2 + sd / 2 + 0.3); B.add(wm, sg); top = H + 2.6; }
      if (r.next() < 0.35) { const aw = new THREE.PlaneGeometry(3, 1.6); aw.rotateX(-1.1); place(aw, b, 0, 2.6, b.d / 2 + 0.8); B.add(r.next() < 0.5 ? 'canvasR' : 'canvasB', aw); }
    }
    windowsOnWall(b, b.d, 'x', 1, fl, 0.4, b.door === 1); windowsOnWall(b, b.d, 'x', -1, fl, 0.4, b.door === -1);
    windowsOnWall(b, b.w, 'z', 1, fl, 0.4, false); windowsOnWall(b, b.w, 'z', -1, fl, 0.4, false);
    if (b.door) { const dw = b.barn ? 3.4 : 1.1, dh = b.barn ? 3.4 : 2.2; const dg = boxUV(dw, dh, 0.14, 1); place(dg, b, b.door * (b.w / 2 + 0.02), dh / 2 + 0.4, 0, Math.PI / 2); B.add(b.barn ? 'wood' : 'paintwood', dg);
      const fr = (w2, h2, ox, oy) => { const f = boxUV(w2, h2, 0.18, 1); place(f, b, b.door * (b.w / 2 + 0.05), oy, ox, Math.PI / 2); B.add(b.style === 'desert' ? 'wood' : 'castle', f); };
      fr(dw + 0.3, 0.16, 0, dh + 0.48); fr(0.15, dh, -dw / 2 - 0.07, dh / 2 + 0.4); fr(0.15, dh, dw / 2 + 0.07, dh / 2 + 0.4);
      if (!b.barn) {
        const stepMat = b.style === 'desert' ? 'damaged' : 'castle';
        B.add(stepMat, place(boxUV(0.95, 0.16, 1.66, 1), b, b.door * (b.w / 2 + 0.42), 0.08, 0));
        B.add(stepMat, place(boxUV(0.68, 0.15, 1.56, 1), b, b.door * (b.w / 2 + 0.29), 0.23, 0));
        B.add(stepMat, place(boxUV(0.39, 0.09, 1.42, 1), b, b.door * (b.w / 2 + 0.15), 0.345, 0));
        if (mb.quality !== 'low') {
          const face = b.door * (b.w / 2 + 0.091);
          for (const y of [0.79, 1.97]) {
            B.add('dark', place(boxUV(0.036, 0.07, 0.28, 1), b, face, y, -b.door * 0.37));
          }
          B.add('metal', place(boxUV(0.038, 0.17, 0.12, 1), b, face, 1.4, b.door * 0.35));
          B.add('metal', place(boxUV(0.13, 0.035, 0.13, 1), b, face, 1.42, b.door * 0.31));
          for (const y of [0.88, 1.98]) {
            B.add('paintwood', place(boxUV(0.031, 0.095, dw - 0.08, 1), b, face, y, 0));
          }
        }
      }
      else for (let k = 0; k < 2; k++) { const br2 = boxUV(0.06, 0.12, dw * 1.05, 1); place(br2, b, b.door * (b.w / 2 + 0.1), 0.4 + dh * (0.3 + k * 0.4), 0, 0, 0, k ? 0.6 : -0.6); B.add('dark', br2); } }
    // garden fences / picket fences around village houses
    if ((b.style === 'stone' || b.style === 'brick') && !b.barn && r.next() < 0.55) {
      const fd = b.d / 2 + r.range(3, 6), fw2 = b.w / 2 + r.range(3, 6); const picket = r.next() < 0.5;
      for (const [x0, z0, x1, z1] of [[-fw2, fd, fw2, fd], [fw2, -fd, fw2, fd], [-fw2, -fd, -fw2, fd]]) {
        const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.floor(len / (picket ? 0.25 : 2.2)); const ang = Math.atan2(x1 - x0, z1 - z0);
        for (let k = 0; k <= n; k++) { if (r.next() < 0.07) continue; const tt = k / n; const px = x0 + (x1 - x0) * tt, pz = z0 + (z1 - z0) * tt; const ph = picket ? 0.95 : 1.15; const pg = boxUV(picket ? 0.08 : 0.12, ph, picket ? 0.03 : 0.12, 1); place(pg, b, px, ph / 2 - 0.05, pz, ang); B.add(picket ? 'paintwhite' : 'wood', pg); }
        for (const ry2 of picket ? [0.3, 0.75] : [0.45, 0.95]) { const rl = boxUV(0.05, 0.08, len, 1); place(rl, b, (x0 + x1) / 2, ry2, (z0 + z1) / 2, ang); B.add(picket ? 'paintwhite' : 'wood', rl); }
      }
    }
    // clutter: barrels and crates against a wall
    if (r.next() < 0.35) { const sg = r.next() < 0.5 ? -1 : 1; const z0 = r.range(-b.d / 2 + 1, b.d / 2 - 1);
      for (let k = 0; k < 2 + Math.floor(r.next() * 3); k++) { const x = sg * (b.w / 2 + 0.6 + (k > 2 ? 0.7 : 0)), z = z0 + (k % 3) * 0.75;
        if (r.next() < 0.5) { const br = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12); place(br, b, x, 0.45, z); B.add('rust', br); for (const hy of [0.15, 0.75]) { const ring = new THREE.TorusGeometry(0.305, 0.02, 4, 12); ring.rotateX(Math.PI / 2); place(ring, b, x, hy, z); B.add('metal', ring); } }
        else { const cs = r.range(0.55, 0.8); const cr = boxUV(cs, cs, cs, 0.8); place(cr, b, x, cs / 2, z, r.range(-0.3, 0.3)); B.add('wood', cr); } } }
    colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + top));
  }
  // walls
  for (const w of mb.walls) {
    const y = terrain.height(w.x, w.z); const mat = w.style === 'adobe' ? 'plaster' : w.style === 'castle' ? 'castle' : 'stone';
    B.floor = y;
    const g = boxUV(w.thick, w.h + 1, w.len, 2.5); xf(g, w.x, y + (w.h - 1) / 2, w.z, w.rot); B.add(mat, g);
    // Individual coping blocks give masonry a broken silhouette and mortar joints.
    const n = Math.max(1, Math.ceil(w.len / (w.style === 'adobe' ? 1.8 : 1.16)));
    const length = w.len / n;
    for (let i = 0; i < n; i++) {
      const offset = (i + 0.5) * length - w.len / 2;
      const cap = boxUV(w.thick + 0.15, 0.18, length * 0.97, 1.2, detailRng.next());
      B.add(mat, xf(cap, w.x + Math.sin(w.rot) * offset, y + w.h - 0.075, w.z + Math.cos(w.rot) * offset, w.rot));
    }
    colliders.push(new OBB(w.x, w.z, w.thick / 2, w.len / 2, w.rot, y - 1, y + w.h, 'wall'));
  }
  B.tint = null; B.floor = null;
  // bridges: drivable deck that follows a ramp/arch profile between the two banks (so tanks drive ON it),
  // segmented deck + parapets; the deck surface is exported for World.groundHeight
  const decks = [];
  for (const br of mb.bridges) {
    // thin the dense road points to ~3 m steps; the deck follows the road polyline
    const raw = br.pts; const pts = [raw[0]]; for (const q of raw) { const l = pts[pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 3) pts.push(q); }
    const last = raw[raw.length - 1]; if (pts[pts.length - 1] !== last) { if (pts.length > 1 && Math.hypot(last[0] - pts[pts.length - 1][0], last[1] - pts[pts.length - 1][1]) < 1.5) pts[pts.length - 1] = last; else pts.push(last); }
    if (pts.length < 2) continue;
    const segs = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) { const A = pts[i], Bq = pts[i + 1]; const l = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]); if (l < 0.05) continue; segs.push({ ax: A[0], az: A[1], ux: (Bq[0] - A[0]) / l, uz: (Bq[1] - A[1]) / l, l, s0: len }); len += l; }
    if (len < 2 || !segs.length) continue;
    const ha = terrain.height(pts[0][0], pts[0][1]), hb = terrain.height(last[0], last[1]);
    // short crossings: straight ramp between the banks plus an arch that clears the water/road below by 0.15 m.
    // long stretches (road running along the water, > 60 m): a causeway deck that follows the raised road surface.
    const causeway = len > 60;
    let bump = 0;
    if (!causeway) for (const sg of segs) for (const f of [0, 0.5]) { const u = (sg.s0 + sg.l * f) / len; if (u <= 0.03 || u >= 0.97) continue; const need = terrain.height(sg.ax + sg.ux * sg.l * f, sg.az + sg.uz * sg.l * f) + 0.15 - (ha + (hb - ha) * u); if (need > 0) bump = Math.max(bump, need / Math.sin(Math.PI * u)); }
    bump = Math.min(bump, 6);
    const ss = [0], hs0 = [terrain.height(segs[0].ax, segs[0].az)]; for (const sg of segs) { ss.push(sg.s0 + sg.l); hs0.push(terrain.height(sg.ax + sg.ux * sg.l, sg.az + sg.uz * sg.l)); }
    const hs = hs0.map((h, i) => Math.max(h, hs0[i - 1] ?? h, hs0[i + 1] ?? h)); // moving max: deck never dips into the road
    const deckY = causeway
      ? (u) => { const sv = Math.max(0, Math.min(len, u * len)); let i = 1; while (i < ss.length - 1 && ss[i] < sv) i++; const f = (sv - ss[i - 1]) / Math.max(1e-6, ss[i] - ss[i - 1]); return hs[i - 1] + (hs[i] - hs[i - 1]) * f + 0.04; }
      : (u) => ha + (hb - ha) * u + bump * Math.sin(Math.PI * Math.max(0, Math.min(1, u))) + 0.04;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const q of pts) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minZ = Math.min(minZ, q[1]); maxZ = Math.max(maxZ, q[1]); }
    const hw = br.width / 2; const deck = { segs, len, hw, deckY, causeway, box: [minX - hw - 2, maxX + hw + 2, minZ - hw - 2, maxZ + hw + 2] };
    decks.push(deck);
    for (const sg of segs) {
      const u0 = sg.s0 / len, u1 = (sg.s0 + sg.l) / len; const y0 = deckY(u0), y1 = deckY(u1); const rot = Math.atan2(sg.ux, sg.uz);
      const mx = sg.ax + sg.ux * sg.l / 2, mz = sg.az + sg.uz * sg.l / 2, my = (y0 + y1) / 2; const tilt = Math.atan2(y1 - y0, sg.l); const sl = Math.hypot(sg.l, y1 - y0) + 0.3;
      const seg = boxUV(br.width, 0.9, sl, 2.5); seg.translate(0, -0.45, 0); seg.rotateX(-tilt); xf(seg, mx, my, mz, rot); B.add('castle', seg);
      colliders.push(new OBB(mx, mz, hw, sg.l / 2, rot, Math.min(y0, y1) - 0.9, Math.min(y0, y1) - 0.05, 'deck'));
      if (!causeway) for (const sd of [-1, 1]) {
        const ox = sd * (hw + 0.25); const px = mx + ox * Math.cos(rot), pz = mz - ox * Math.sin(rot);
        const pg = boxUV(0.5, 1.0, sl, 2.5); pg.translate(0, 0.45, 0); pg.rotateX(-tilt); xf(pg, px, my, pz, rot); B.add('castle', pg);
        if (mb.quality !== 'low') {
          const blocks = Math.ceil(sg.l / 1.35);
          for (let i = 0; i < blocks; i++) {
            const position = (i + 0.5) / blocks - 0.5;
            const cap = boxUV(0.61, 0.115, sg.l / blocks * 0.98, 1.1).rotateX(-tilt);
            B.add('stone', xf(cap, px + sg.ux * sg.l * position, my + 0.916 + (y1 - y0) * position,
              pz + sg.uz * sg.l * position, rot));
          }
        }
        const lowT = Math.min(terrain.height(px, pz), my - 1);
        const sw = boxUV(0.5, my - lowT, sl, 2.5); xf(sw, px, (my + lowT) / 2 - 0.45, pz, rot); B.add('castle', sw);
        colliders.push(new OBB(px, pz, 0.25, sg.l / 2 + 0.1, rot, lowT - 1, Math.max(y0, y1) + 0.95, 'wall'));
      }
    }
  }
  B.tint = null;
  // props
  for (const p of mb.props) {
    const y = p.y;
    B.floor = y;
    const prop = (key, g, x, h, z, ry = 0, rx = 0, rz = 0) => {
      xf(g, x, h, z, ry, rx, rz);
      B.add(key, xf(g, p.x, y, p.z, p.rot));
    };
    if (p.kind === 'haybale') { const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16); xf(g, p.x, y + 0.72, p.z, p.rot, 0, Math.PI / 2); B.add('hay', g); }
    else if (p.kind === 'haystack') { const g = new THREE.SphereGeometry(2.6, 14, 8); g.scale(1, 1.3, 1); xf(g, p.x, y + 1.2, p.z); B.add('hay', g); colliders.push(new OBB(p.x, p.z, 2.2, 2.2, 0, y - 1, y + 4, 'prop')); }
    else if (p.kind === 'pole') { const g = new THREE.CylinderGeometry(0.11, 0.15, 8, 7); xf(g, p.x, y + 4, p.z); B.add('wood', g); const c = boxUV(1.8, 0.12, 0.12, 1); xf(c, p.x, y + 7.5, p.z, p.rot + Math.PI / 2); B.add('wood', c); }
    else if (p.kind === 'cart') {
      for (let i = -3; i <= 3; i++) prop('wood', boxUV(0.22, 0.10, 2.9, 1), i * 0.225, 0.86, 0);
      for (const side of [-1, 1]) {
        for (const h of [0.99, 1.19]) prop('wood', boxUV(0.085, 0.17, 2.9, 1), side * 0.77, h, 0);
        for (const z of [-1.3, 0, 1.3]) prop('wood', boxUV(0.085, 0.52, 0.09, 0.6), side * 0.8, 1.02, z);
        const wheel = new THREE.TorusGeometry(0.54, 0.055, 5, 20);
        prop('metal', wheel, side * 0.87, 0.60, 0, Math.PI / 2);
        prop('wood', new THREE.CylinderGeometry(0.11, 0.12, 0.2, 10), side * 0.87, 0.60, 0, 0, 0, Math.PI / 2);
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          prop('wood', boxUV(0.065, 0.51, 0.065, 0.65), side * 0.87, 0.60 + Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0, a);
        }
      }
      prop('metal', new THREE.CylinderGeometry(0.05, 0.05, 1.78, 8), 0, 0.60, 0, 0, 0, Math.PI / 2);
      colliders.push(new OBB(p.x, p.z, 0.85, 1.5, p.rot, y - 1, y + 1.4, 'prop'));
    }
    else if (p.kind === 'logs') {
      for (let i = 0; i < 9; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : 2, k = i < 4 ? i : i < 7 ? i - 4 : i - 7;
        const rad = detailRng.range(0.26, 0.33), len = detailRng.range(5.1, 6), z = detailRng.range(-0.1, 0.1);
        const x = k * 0.62 - 1 + row * 0.31, h = 0.3 + row * 0.52;
        prop('wood', new THREE.CylinderGeometry(rad * 0.90, rad, len, 12, 1, true), x, h, z, 0, Math.PI / 2);
        for (const face of [-1, 1]) {
          const end = z + face * len / 2;
          prop('woodcut', new THREE.CircleGeometry(rad * (face > 0 ? 0.90 : 1), 12), x, h, end, face < 0 ? Math.PI : 0);
          for (const scale of [0.38, 0.62, 0.81]) prop('woodgrain', new THREE.RingGeometry(rad * scale, rad * scale + 0.009, 12), x + 0.012, h, end + face * 0.002, face < 0 ? Math.PI : 0);
        }
      }
      colliders.push(new OBB(p.x, p.z, 1.4, 3, p.rot, y - 1, y + 1.4, 'prop'));
    }
    else if (p.kind === 'stall') {
      for (const x of [-1.27, 1.27]) for (const z of [-1, 1]) prop('wood', boxUV(0.10, 2.4, 0.10, 1), x, 1.2, z);
      for (const z of [-1, 1]) prop('wood', boxUV(2.65, 0.09, 0.1, 1), 0, 2.32, z);
      const awning = new THREE.PlaneGeometry(2.8, 2.22, 16, 7);
      const pos = awning.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getY(i);
        pos.setXYZ(i, x, z * 0.11 + 0.055 * Math.cos(x * 20) - 0.16 * (1 - (z / 1.11) ** 2), -z);
      }
      awning.computeVertexNormals();
      prop(r.next() < 0.5 ? 'canvasR' : 'canvasB', awning, 0, 2.52, 0);
      prop('wood', boxUV(2.4, 0.12, 1.50, 1), 0, 0.87, 0);
      for (const x of [-1.03, 1.03]) for (const z of [-0.6, 0.6]) prop('wood', boxUV(0.13, 0.81, 0.13, 1), x, 0.405, z);
      for (const x of [-0.85, 0.42]) {
        prop('wood', boxUV(0.61, 0.23, 0.50, 0.8), x, 1.04, 0.14);
        for (const edge of [-1, 1]) prop('woodcut', boxUV(0.61, 0.055, 0.06, 1), x, 1.17, 0.14 + 0.24 * edge);
      }
      colliders.push(new OBB(p.x, p.z, 1.35, 1.05, p.rot, y - 1, y + 2.5, 'prop'));
    }
    else if (p.kind === 'wreck') {
      prop('rust', boxUV(1.67, 0.28, 4.25, 1.5), 0, 0.50, 0);
      prop('rust', boxUV(1.55, 0.46, 1.48, 1.5), 0, 0.97, 1.28, 0, -0.08);
      prop('dark', boxUV(1.42, 0.16, 0.035, 1), 0, 0.96, 2.03);
      prop('rust', boxUV(1.62, 0.075, 1.53, 1.5), 0, 1.79, -0.32, 0, 0.05);
      for (const side of [-1, 1]) {
        for (const z of [-1.09, 0.44]) prop('rust', boxUV(0.067, 0.75, 0.085, 0.7), side * 0.77, 1.40, z, 0, z > 0 ? -0.22 : 0);
        prop('rust', boxUV(0.11, 0.31, 1.65, 1.5), side * 0.80, 0.92, -0.25);
        for (const z of [-1.44, 1.45]) {
          prop('dark', new THREE.CylinderGeometry(0.45, 0.45, 0.19, 16), side * 0.825, 0.43, z, 0, 0, Math.PI / 2);
          prop('rust', new THREE.CylinderGeometry(0.20, 0.20, 0.22, 10), side * 0.825, 0.43, z, 0, 0, Math.PI / 2);
        }
      }
      colliders.push(new OBB(p.x, p.z, 0.95, 2.25, p.rot, y - 1, y + 1.9, 'prop'));
    }
    else if (p.kind === 'hedgehog') { for (let k = 0; k < 3; k++) { const g = boxUV(0.2, 0.2, 2.4, 1); xf(g, 0, 0.7, 0, k * Math.PI / 3, k === 1 ? 0.9 : -0.9, k === 2 ? 0.9 : 0); xf(g, p.x, y, p.z, p.rot); B.add('rust', g); } colliders.push(new OBB(p.x, p.z, 0.9, 0.9, p.rot, y - 1, y + 1.4, 'prop')); }
    else if (p.kind === 'sandbags') { for (let i = 0; i < 10; i++) { const row = i < 6 ? 0 : 1; const k = row ? i - 6 : i; const g = new THREE.SphereGeometry(0.4, 8, 5); g.scale(1.1, 0.4, 0.6); xf(g, -2 + k * 0.8 + row * 0.4, 0.18 + row * 0.3, 0); xf(g, p.x, y, p.z, p.rot); B.add('sand', g); } colliders.push(new OBB(p.x, p.z, 2.3, 0.4, p.rot, y - 1, y + 0.75, 'prop')); }
  }
  const group = new THREE.Group(); group.name = 'structures';
  const cell = 192;
  for (const [key, list] of Object.entries(B.b)) {
    const material = M[key];
    material.vertexColors = true;
    const cells = new Map();
    const split = list.reduce((count, part) => count + part.index.count, 0) > 66_000;
    for (const part of list) {
      const pos = part.attributes.position;
      // Split busy materials so buildings outside both the camera and light
      // frustums never enter those passes. Keep sparse materials batched.
      const id = split ? Math.floor(pos.getX(0) / cell) + ':' + Math.floor(pos.getZ(0) / cell) : '';
      if (!cells.has(id)) cells.set(id, []);
      cells.get(id).push(part);
    }
    for (const parts of cells.values()) {
      const geometry = mergeGeometries(parts);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  scene.add(group);
  return { group, colliders, materials: M, decks };
}
