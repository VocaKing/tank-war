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
function clean(g) { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; }
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

export function buildingMaterials() {
  const tex = (n, rep = 1) => ({ map: pbrTex(n, 'diff'), normalMap: pbrTex(n, 'nor'), roughnessMap: pbrTex(n, 'arm'), aoMap: pbrTex(n, 'arm'), aoMapIntensity: 0.8 });
  const M = {
    stone: new THREE.MeshStandardMaterial({ ...tex('plastered_stone_wall'), roughness: 0.92, color: 0xf0e8dc }),
    castle: new THREE.MeshStandardMaterial({ ...tex('plastered_stone_wall'), roughness: 0.95, color: 0xa8a49c }),
    brick: new THREE.MeshStandardMaterial({ ...tex('red_brick_03'), roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ ...tex('clay_plaster'), roughness: 0.95, color: 0xe8d2ae }),
    damaged: new THREE.MeshStandardMaterial({ ...tex('damaged_plaster'), roughness: 0.95, color: 0xd9c4a0 }),
    // v5 #5 roof tuning: deeper tile relief (normalScale), full-strength AO in the tile overlaps, a touch less env sheen so
    // terracotta reads matte-fired; slate (cabins, barns) is a cooler blue-grey and slightly glossier, like weathered slate
    roof: new THREE.MeshStandardMaterial({ ...tex('clay_roof_tiles_02'), aoMapIntensity: 1.0, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.9, envMapIntensity: 0.75, color: 0xf2e6dc, side: THREE.DoubleSide }),
    slate: new THREE.MeshStandardMaterial({ ...tex('clay_roof_tiles_02'), aoMapIntensity: 1.0, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.72, envMapIntensity: 0.9, color: 0x5f646b, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ ...tex('brown_planks_05'), roughness: 1.0, color: 0xc8b49a }),
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
    leafG: new THREE.MeshStandardMaterial({ color: 0x3f6a2c, roughness: 0.95 }), // window-box greenery
    bloom: new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.8 }), // geraniums
    zinc: new THREE.MeshStandardMaterial({ color: 0x8a8e8f, roughness: 0.45, metalness: 0.7 }), // gutters + downpipes
    streak: new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 1, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), // scupper water stains
  };
  return M;
}

// v4: per-building colour variation via vertex colours (walls, shutters/doors, roof tiles), merged per material
const TINTABLE = { stone: 'wall', plaster: 'wall', damaged: 'wall', brick: 'brick', paintwood: 'trim', roof: 'roof', slate: 'roof', castle: 'stoneT' };
class Buckets {
  constructor() { this.b = {}; this.tint = null; }
  add(k, g) {
    const n = clean(g); const c = new Float32Array(n.attributes.position.count * 3); const t = (this.tint && this.tint[TINTABLE[k]]) || null;
    c.fill(1); if (!t && k === 'paintwood') for (let i = 0; i < c.length; i += 3) { c[i] = 0.076; c[i + 1] = 0.148; c[i + 2] = 0.099; } if (t) for (let i = 0; i < c.length; i += 3) { c[i] = t[0]; c[i + 1] = t[1]; c[i + 2] = t[2]; }
    n.setAttribute('color', new THREE.BufferAttribute(c, 3)); (this.b[k] ||= []).push(n);
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
  const M = buildingMaterials(); const B = new Buckets(); const colliders = []; const r = new RNG(mb.def.seed + 99);
  // v5 #5: detail pass has its own stream so the main layout (damage, tints, clutter) is identical on every quality
  const r2 = new RNG(mb.def.seed + 4099); const lowQ = mb.quality === 'low';
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
      if ((b.style === 'stone' || b.style === 'brick') && !broken && !b.ruined && r2.next() < 0.22 && !lowQ) { // geranium window box
        const by = -wh / 2 - fw - 0.2; put(boxUV(ww + 0.05, 0.2, 0.22, 1), 0, by, 0.2, 'paintwood');
        const fg = new THREE.SphereGeometry(0.5, 8, 4); fg.scale((ww + 0.05) / 1.0, 0.32, 0.24); put(fg, 0, by + 0.12, 0.2, 'leafG');
        for (let k = 0; k < 4; k++) { const fb = new THREE.SphereGeometry(0.075, 5, 3); put(fb, (k / 3 - 0.5) * ww * 0.8 + r2.range(-0.05, 0.05), by + 0.24 + r2.range(0, 0.05), 0.2 + r2.range(-0.05, 0.08), 'bloom'); }
      }
      if (b.style !== 'desert') put(boxUV(ww + 0.36, 0.18, 0.1, 1), 0, wh / 2 + fw + 0.09, 0.0, sm); // lintel
      else if (r.next() < 0.4) put(boxUV(ww + 0.2, 0.06, 0.4, 1), 0, wh / 2 + 0.25, 0.2, 'wood'); // sun shade
      if (b.style === 'stone' && !b.ruined && r.next() < 0.6) for (const s of [-1, 1]) { const sh = boxUV(0.5, wh + 0.1, 0.05, 1); const so = off + 0.03; if (axis === 'x') place(sh, b, sign * so, y, t + s * (ww / 2 + 0.27), Math.PI / 2); else place(sh, b, t + s * (ww / 2 + 0.27), y, sign * so, 0); B.add('paintwood', sh); }
    }
  };
  for (const b of mb.buildings) {
    B.tint = pickTint(r, b.style);
    const wm = wallMat(b); const fl = b.floors || 1; let H = fl * 3 + 0.4; let top = H;
    if (b.kind === 'tower') {
      H = fl * 4; const g = boxUV(b.w, H, b.d, 3); place(g, b, 0, H / 2, 0); B.add('castle', g);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (r.next() < 0.35) continue; const g2 = boxUV(1.4, 1.2 + r.range(0, 1.5), 1.4, 3); place(g2, b, Math.cos(a) * b.w / 2.1, H + 0.6, Math.sin(a) * b.d / 2.1); B.add('castle', g2); }
      for (let f = 0; f < fl; f++) for (const s of [-1, 1]) { const g3 = boxUV(0.6, 1.6, 0.12, 1); place(g3, b, s * 1.5, f * 4 + 2.5, b.d / 2 + 0.03); B.add('dark', g3); }
      colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + H + 1.5));
      continue;
    }
    if (b.kind === 'church') {
      H = 9; const g = boxUV(b.w, H, b.d, 3); place(g, b, 0, H / 2, 0); B.add('stone', g);
      const { roof, gables } = gableRoof(b.w, b.d, H, 5.5, 0.5); place(roof, b, 0, 0, 0); B.add('slate', roof); place(gables, b, 0, 0, 0); B.add('stone', gables);
      const tg = boxUV(5.5, 20, 5.5, 3); place(tg, b, 0, 10, -b.d / 2 - 2.5); B.add('stone', tg);
      const sp = new THREE.ConeGeometry(4.3, 10, 4); sp.rotateY(Math.PI / 4); place(sp, b, 0, 25, -b.d / 2 - 2.5); B.add('slate', sp);
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const wg = boxUV(1.1, 3.6, 0.12, 1); place(wg, b, s * (b.w / 2 + 0.03), 4.6, -9 + i * 4.4, Math.PI / 2); B.add('window', wg); }
      const dg = boxUV(2.2, 3.4, 0.2, 1); place(dg, b, 0, 1.7, -b.d / 2 - 5.3); B.add('dark', dg);
      colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + H + 5));
      const tc = Math.cos(b.rot), ts = Math.sin(b.rot); const tz = -b.d / 2 - 2.5;
      colliders.push(new OBB(b.x + tz * ts, b.z + tz * tc, 2.75, 2.75, b.rot, b.y - 2, b.y + 30));
      continue;
    }
    if (b.kind === 'mosque') {
      H = 10; const g = boxUV(b.w, H, b.d, 3); place(g, b, 0, H / 2, 0); B.add('plaster', g);
      const drum = new THREE.CylinderGeometry(7.5, 7.5, 2.5, 32); place(drum, b, 0, H + 1.25, 0); B.add('plaster', drum);
      const dome = new THREE.SphereGeometry(7.5, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2); place(dome, b, 0, H + 2.5, 0); B.add('dome', dome);
      const min = new THREE.CylinderGeometry(1.4, 1.8, 32, 16); place(min, b, b.w / 2 + 3, 16, b.d / 2 + 3); B.add('plaster', min);
      const bal = new THREE.CylinderGeometry(2.4, 2.0, 1.0, 16); place(bal, b, b.w / 2 + 3, 26, b.d / 2 + 3); B.add('plaster', bal);
      const cap = new THREE.ConeGeometry(1.6, 4, 16); place(cap, b, b.w / 2 + 3, 34, b.d / 2 + 3); B.add('dome', cap);
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const wg = boxUV(1.2, 2.6, 0.12, 1); place(wg, b, -8 + i * 4, 4.5, s * (b.d / 2 + 0.03)); B.add('window', wg); }
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
    // (v5 #5: downpipes now hang from the gutter ends, see the gable roof block)
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
        B.add(b.style === 'cabin' ? 'wood' : 'paintwood', fa); if (b.style !== 'cabin') B.add('zinc', gu);
        if (b.style !== 'cabin') { // v5 #5: downpipe at one end of each gutter: outlet + swan neck back to the wall, wall run, brackets, shoe
          const lat = (l, y2, a, g2, ry2 = 0, rx2 = 0, rz2 = 0) => { if (ridgeZ) place(g2, b, l, y2, a, ry2, rx2, rz2); else place(g2, b, a, y2, l, ry2 - Math.PI / 2, rx2, rz2); B.add('zinc', g2); };
          const al = sg * (dd / 2 - 0.3), gx = ex + sg * 0.06, wx = sg * (ww / 2 + 0.09), gy = ey - 0.16, ny = gy - 0.55;
          lat(gx, gy - 0.1, al, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6));
          const nl = Math.hypot(gx - wx, gy - 0.2 - ny); const ng = new THREE.CylinderGeometry(0.05, 0.05, nl, 6); lat((gx + wx) / 2, (gy - 0.2 + ny) / 2, al, ng, 0, 0, Math.atan2(wx - gx, gy - 0.2 - ny));
          const run = ny - 0.25; const dp = new THREE.CylinderGeometry(0.05, 0.05, run, 6); lat(wx, 0.25 + run / 2, al, dp);
          const sh = new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6); lat(wx + sg * 0.1, 0.2, al, sh, 0, 0, sg * 0.9);
          if (!lowQ) for (let yb = 1.2; yb < ny - 0.3; yb += 1.8) { const bk = boxUV(0.12, 0.05, 0.14, 1); lat(sg * (ww / 2 + 0.04), yb, al, bk); }
        } }
      if (!b.barn) { const cx = ridgeZ ? ww * 0.22 : dd * 0.3, cz = ridgeZ ? dd * 0.3 : ww * 0.22; const ch = boxUV(0.7, 2.0, 0.7, 1.5); place(ch, b, cx, H + R * 0.6 + 0.6, cz); B.add(wm === 'wood' ? 'stone' : wm, ch);
        const cap = boxUV(0.86, 0.1, 0.86, 1); place(cap, b, cx, H + R * 0.6 + 1.65, cz); B.add('castle', cap); for (const o of [-0.15, 0.15]) { const pot = new THREE.CylinderGeometry(0.09, 0.11, 0.35, 8); place(pot, b, cx + o, H + R * 0.6 + 1.85, cz); B.add('rust', pot); } }
      if (b.damage && r.next() < 0.6) { const hole = boxUV(r.range(1.2, 2.5), 0.1, r.range(1.2, 2.2), 1); place(hole, b, ridgeZ ? ww * 0.12 : 0, H + R * 0.55, ridgeZ ? 0 : ww * 0.12, ry, 0, ridgeZ ? Math.atan(R / (ww / 2)) : 0); B.add('dark', hole); }
    } else {
      // flat roof with parapet, rooftop clutter
      for (const [w2, d2, x2, z2] of [[b.w, 0.3, 0, b.d / 2 - 0.15], [b.w, 0.3, 0, -b.d / 2 + 0.15], [0.3, b.d, b.w / 2 - 0.15, 0], [0.3, b.d, -b.w / 2 + 0.15, 0]]) { const pg = boxUV(w2, 0.7, d2, 3); place(pg, b, x2, H + 0.35, z2); B.add(wm, pg); }
      const slab = boxUV(b.w - 0.2, 0.1, b.d - 0.2, 3); place(slab, b, 0, H + 0.05, 0); B.add('damaged', slab);
      // v5 #5: roof drains — wooden/clay scupper spouts through the parapet with a dark run-off streak down the wall
      for (let k = 0, nk = 1 + Math.floor(r2.next() * 2); k < nk; k++) { const sd = r2.next() < 0.5 ? 1 : -1; const xAx = r2.next() < 0.5; const along = (r2.next() - 0.5) * ((xAx ? b.d : b.w) - 2);
        const sp = boxUV(0.16, 0.12, 0.75, 1); const st = new THREE.PlaneGeometry(0.32, H * 0.7); const half = (xAx ? b.w : b.d) / 2;
        if (xAx) { place(sp, b, sd * (half + 0.3), H + 0.15, along, Math.PI / 2); place(st, b, sd * (half + 0.02), H - H * 0.35, along, sd * Math.PI / 2); }
        else { place(sp, b, along, H + 0.15, sd * (half + 0.3)); place(st, b, along, H - H * 0.35, sd * (half + 0.02), sd > 0 ? 0 : Math.PI); }
        B.add('wood', sp); if (!lowQ) B.add('streak', st); }
      if (r.next() < 0.5) { const tk = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12); place(tk, b, r.range(-b.w / 3, b.w / 3), H + 1.0, r.range(-b.d / 3, b.d / 3)); B.add('metal', tk); }
      if (fl >= 2 && r.next() < 0.4) { const sw = b.w * 0.45, sd = b.d * 0.45; const sg = boxUV(sw, 2.6, sd, 3); place(sg, b, b.w / 2 - sw / 2 - 0.3, H + 1.3, -b.d / 2 + sd / 2 + 0.3); B.add(wm, sg); top = H + 2.6; }
      if (r.next() < 0.35) { const aw = new THREE.PlaneGeometry(3, 1.6); aw.rotateX(-1.1); place(aw, b, 0, 2.6, b.d / 2 + 0.8); B.add(r.next() < 0.5 ? 'canvasR' : 'canvasB', aw); }
    }
    windowsOnWall(b, b.d, 'x', 1, fl, 0.4, b.door === 1); windowsOnWall(b, b.d, 'x', -1, fl, 0.4, b.door === -1);
    windowsOnWall(b, b.w, 'z', 1, fl, 0.4, false); windowsOnWall(b, b.w, 'z', -1, fl, 0.4, false);
    if (b.door) { const dw = b.barn ? 3.4 : 1.1, dh = b.barn ? 3.4 : 2.2; const dg = boxUV(dw, dh, 0.14, 1); place(dg, b, b.door * (b.w / 2 + 0.02), dh / 2 + 0.4, 0, Math.PI / 2); B.add(b.barn ? 'wood' : 'paintwood', dg);
      const fr = (w2, h2, ox, oy) => { const f = boxUV(w2, h2, 0.18, 1); place(f, b, b.door * (b.w / 2 + 0.05), oy, ox, Math.PI / 2); B.add(b.style === 'desert' ? 'wood' : 'castle', f); };
      fr(dw + 0.3, 0.16, 0, dh + 0.48); fr(0.15, dh, -dw / 2 - 0.07, dh / 2 + 0.4); fr(0.15, dh, dw / 2 + 0.07, dh / 2 + 0.4);
      if (!b.barn) { const st = boxUV(0.5, 0.2, 1.6, 1); place(st, b, b.door * (b.w / 2 + 0.25), 0.3, 0); B.add('castle', st); }
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
    const g = boxUV(w.thick, w.h + 1, w.len, 2.5); xf(g, w.x, y + (w.h - 1) / 2, w.z, w.rot); B.add(mat, g);
    colliders.push(new OBB(w.x, w.z, w.thick / 2, w.len / 2, w.rot, y - 1, y + w.h, 'wall'));
  }
  B.tint = null;
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
    if (p.kind === 'haybale') { const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16); xf(g, p.x, y + 0.72, p.z, p.rot, 0, Math.PI / 2); B.add('hay', g); }
    else if (p.kind === 'haystack') { const g = new THREE.SphereGeometry(2.6, 14, 8); g.scale(1, 1.3, 1); xf(g, p.x, y + 1.2, p.z); B.add('hay', g); colliders.push(new OBB(p.x, p.z, 2.2, 2.2, 0, y - 1, y + 4, 'prop')); }
    else if (p.kind === 'pole') { const g = new THREE.CylinderGeometry(0.11, 0.15, 8, 7); xf(g, p.x, y + 4, p.z); B.add('wood', g); const c = boxUV(1.8, 0.12, 0.12, 1); xf(c, p.x, y + 7.5, p.z, p.rot + Math.PI / 2); B.add('wood', c); }
    else if (p.kind === 'cart') { const g = boxUV(1.6, 0.5, 3, 1); xf(g, p.x, y + 1, p.z, p.rot); B.add('wood', g); for (const s of [-1, 1]) { const wg = new THREE.CylinderGeometry(0.6, 0.6, 0.1, 14); wg.rotateZ(Math.PI / 2); xf(wg, p.x + s * 0.85 * Math.cos(p.rot), y + 0.6, p.z - s * 0.85 * Math.sin(p.rot), p.rot); B.add('dark', wg); } colliders.push(new OBB(p.x, p.z, 0.85, 1.5, p.rot, y - 1, y + 1.4, 'prop')); }
    else if (p.kind === 'logs') { for (let i = 0; i < 9; i++) { const row = i < 4 ? 0 : i < 7 ? 1 : 2; const k = i < 4 ? i : i < 7 ? i - 4 : i - 7; const g = new THREE.CylinderGeometry(0.3, 0.3, 6, 10); g.rotateX(Math.PI / 2); xf(g, k * 0.62 - 1 + row * 0.31, 0.3 + row * 0.52, 0); xf(g, p.x, y, p.z, p.rot); B.add('wood', g); } colliders.push(new OBB(p.x, p.z, 1.4, 3, p.rot, y - 1, y + 1.4, 'prop')); }
    else if (p.kind === 'stall') { for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const g = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5); xf(g, a * 1.3, 1.2, c * 1.0); xf(g, p.x, y, p.z, p.rot); B.add('wood', g); } const aw = new THREE.PlaneGeometry(3, 2.4); aw.rotateX(-Math.PI / 2 + 0.15); xf(aw, p.x, y + 2.45, p.z, p.rot); B.add(r.next() < 0.5 ? 'canvasR' : 'canvasB', aw); const t = boxUV(2.4, 0.8, 1.6, 1); xf(t, p.x, y + 0.4, p.z, p.rot); B.add('wood', t); colliders.push(new OBB(p.x, p.z, 1.35, 1.05, p.rot, y - 1, y + 2.5, 'prop')); }
    else if (p.kind === 'wreck') { const g = boxUV(1.8, 0.9, 4.4, 1.5); xf(g, p.x, y + 0.75, p.z, p.rot, 0, 0.08); B.add('rust', g); const c = boxUV(1.6, 0.7, 2.0, 1.5); xf(c, 0, 1.5, -0.3); xf(c, p.x, y, p.z, p.rot); B.add('rust', c); colliders.push(new OBB(p.x, p.z, 0.95, 2.25, p.rot, y - 1, y + 1.9, 'prop')); }
    else if (p.kind === 'hedgehog') { for (let k = 0; k < 3; k++) { const g = boxUV(0.2, 0.2, 2.4, 1); xf(g, 0, 0.7, 0, k * Math.PI / 3, k === 1 ? 0.9 : -0.9, k === 2 ? 0.9 : 0); xf(g, p.x, y, p.z, p.rot); B.add('rust', g); } colliders.push(new OBB(p.x, p.z, 0.9, 0.9, p.rot, y - 1, y + 1.4, 'prop')); }
    else if (p.kind === 'crates' || p.kind === 'barrels' || p.kind === 'fence') {
      // v5 #5 yard clutter (see MapBuilder.yardProps). Crates/barrels collide as one 'prop' box; fences are decorative and Low skips them.
      const pr = new RNG(p.seed || 7); const put = (g, lx, ly, lz, ry = 0, rx = 0, rz = 0) => { xf(g, lx, ly, lz, ry, rx, rz); xf(g, p.x, y, p.z, p.rot); return g; };
      if (p.kind === 'crates') { let top = 0; const hb = [0, 0];
        for (let k = 0; k < Math.min(4, p.n); k++) { const ammo = pr.next() < 0.4; const cw = ammo ? 1.1 : pr.range(0.8, 1.1), ch = ammo ? 0.5 : cw, cd = ammo ? 0.55 : cw;
          const stack = k >= 2 && k < 4; const lx = stack ? (k - 2.5) * 0.8 : (k - 0.5) * 1.15, lz = stack ? 0 : pr.range(-0.15, 0.15), ly = stack ? Math.max(hb[0], hb[1]) : 0; if (!stack) hb[k] = ch;
          const cg = boxUV(cw, ch, cd, 0.9); put(cg, lx, ly + ch / 2, lz, pr.range(-0.25, 0.25)); B.add(ammo ? 'paintwood' : 'wood', cg); top = Math.max(top, ly + ch);
          if (!ammo) for (const sy of [0.08, ch - 0.08]) { const band = boxUV(cw + 0.02, 0.06, cd + 0.02, 1); put(band, lx, ly + sy, lz); B.add('dark', band); } }
        colliders.push(new OBB(p.x, p.z, 1.45, 0.75, p.rot, y - 1, y + top + 0.05, 'prop')); }
      else if (p.kind === 'barrels') {
        for (let k = 0; k < p.n; k++) { const a = k / p.n * 6.283 + pr.range(-0.3, 0.3), d = p.n > 1 ? 0.55 : 0; const lx = Math.sin(a) * d, lz = Math.cos(a) * d; const lying = k === 3;
          const bg = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12); if (lying) put(bg, lx * 1.9, 0.3, lz * 1.9, a, 0, Math.PI / 2); else put(bg, lx, 0.45, lz); B.add(pr.next() < 0.5 ? 'rust' : 'paintwood', bg);
          if (!lying) for (const hy of [0.18, 0.72]) { const ring = new THREE.TorusGeometry(0.305, 0.02, 4, 12); ring.rotateX(Math.PI / 2); put(ring, lx, hy, lz); B.add('metal', ring); } }
        colliders.push(new OBB(p.x, p.z, 1.0, 1.0, p.rot, y - 1, y + 0.95, 'prop')); }
      else if (!lowQ) { const n = Math.max(2, Math.round(p.len / 2.4)); const c = Math.cos(p.rot), s = Math.sin(p.rot); let prev = null;
        for (let k = 0; k <= n; k++) { const t = (k / n - 0.5) * p.len; const px = p.x + s * t, pz = p.z + c * t; const py = terrain.height(px, pz); if (pr.next() < 0.06) { prev = null; continue; }
          const pg = boxUV(0.14, 1.25, 0.14, 1); xf(pg, px, py + 0.55, pz, p.rot + pr.range(-0.2, 0.2), pr.range(-0.05, 0.05)); B.add('wood', pg);
          if (prev) for (const ry2 of [0.45, 0.95]) { const dx = px - prev[0], dz = pz - prev[1], dy = py - prev[2]; const L = Math.hypot(dx, dz); const rl = new THREE.CylinderGeometry(0.06, 0.07, L + 0.2, 5); rl.rotateX(Math.PI / 2);
            xf(rl, (px + prev[0]) / 2, (py + prev[2]) / 2 + ry2 + pr.range(-0.04, 0.04), (pz + prev[1]) / 2, Math.atan2(dx, dz), -Math.atan2(dy, L)); B.add('wood', rl); }
          prev = [px, pz, py]; } }
    }
    else if (p.kind === 'sandbags') { for (let i = 0; i < 10; i++) { const row = i < 6 ? 0 : 1; const k = row ? i - 6 : i; const g = new THREE.SphereGeometry(0.4, 8, 5); g.scale(1.1, 0.4, 0.6); xf(g, -2 + k * 0.8 + row * 0.4, 0.18 + row * 0.3, 0); xf(g, p.x, y, p.z, p.rot); B.add('sand', g); } colliders.push(new OBB(p.x, p.z, 2.3, 0.4, p.rot, y - 1, y + 0.75, 'prop')); }
  }
  const group = new THREE.Group(); group.name = 'structures';
  for (const [k, list] of Object.entries(B.b)) {
    if (!list.length) continue; const geo = mergeGeometries(list); geo.computeBoundingSphere();
    M[k].vertexColors = true; const mesh = new THREE.Mesh(geo, M[k]); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  scene.add(group);
  return { group, colliders, materials: M, decks };
}
