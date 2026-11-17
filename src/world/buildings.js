// Procedural buildings, walls, bridges and props merged into a few draw calls per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbrTex, windowTexture } from './textures.js';
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
  const tex = (n, rep = 1) => ({ map: pbrTex(n, 'diff'), normalMap: pbrTex(n, 'nor') });
  const M = {
    stone: new THREE.MeshStandardMaterial({ ...tex('plastered_stone_wall'), roughness: 0.92, color: 0xf0e8dc }),
    castle: new THREE.MeshStandardMaterial({ ...tex('plastered_stone_wall'), roughness: 0.95, color: 0xa8a49c }),
    brick: new THREE.MeshStandardMaterial({ ...tex('red_brick_03'), roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ ...tex('clay_plaster'), roughness: 0.95, color: 0xe8d2ae }),
    damaged: new THREE.MeshStandardMaterial({ ...tex('damaged_plaster'), roughness: 0.95, color: 0xd9c4a0 }),
    roof: new THREE.MeshStandardMaterial({ ...tex('clay_roof_tiles_02'), roughness: 0.85, side: THREE.DoubleSide }),
    slate: new THREE.MeshStandardMaterial({ ...tex('clay_roof_tiles_02'), roughness: 0.8, color: 0x6c6a6a, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ ...tex('bark_brown_02'), roughness: 0.95, color: 0xb59a7c }),
    window: new THREE.MeshStandardMaterial({ map: windowTexture(), roughness: 0.35, metalness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 }),
    paintwood: new THREE.MeshStandardMaterial({ color: 0x4f6a5a, roughness: 0.8 }),
    hay: new THREE.MeshStandardMaterial({ color: 0xc4a45e, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 0.6, metalness: 0.6 }),
    rust: new THREE.MeshStandardMaterial({ ...tex('rusty_metal_02'), roughness: 0.85, metalness: 0.3, color: 0x7a6a5a }),
    canvasR: new THREE.MeshStandardMaterial({ color: 0x9b3b2b, roughness: 1, side: THREE.DoubleSide }),
    canvasB: new THREE.MeshStandardMaterial({ color: 0x3b5b8b, roughness: 1, side: THREE.DoubleSide }),
    sand: new THREE.MeshStandardMaterial({ color: 0xb8a582, roughness: 1 }),
    dome: new THREE.MeshStandardMaterial({ color: 0x3f8a8f, roughness: 0.45, metalness: 0.3 }),
  };
  return M;
}

class Buckets { constructor() { this.b = {}; } add(k, g) { (this.b[k] ||= []).push(clean(g)); } }

export function buildStructures(mb, scene, terrain) {
  const M = buildingMaterials(); const B = new Buckets(); const colliders = []; const r = new RNG(mb.def.seed + 99);
  const wallMat = (b) => (b.style === 'brick' ? 'brick' : b.style === 'desert' ? (b.ruined ? 'damaged' : 'plaster') : b.style === 'castle' ? 'castle' : b.style === 'cabin' ? 'wood' : 'stone');
  const place = (g, b, lx, ly, lz, ry = 0, rx = 0, rz = 0) => { xf(g, lx, ly, lz, ry, rx, rz); xf(g, b.x, b.y, b.z, b.rot); return g; };
  const windowsOnWall = (b, len, axis, sign, floors, H0, skipDoor) => {
    const n = Math.max(1, Math.floor(len / 3.4));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n); if (skipDoor && f === 0 && i === Math.floor(n / 2)) continue;
      const small = b.style === 'desert'; const ww = small ? 0.8 : 1.0, wh = small ? 1.0 : 1.3; const y = H0 + f * 3 + 1.6;
      const g = boxUV(ww, wh, 0.12, 1); const off = (axis === 'x' ? b.w / 2 : b.d / 2) + 0.03;
      if (axis === 'x') place(g, b, sign * off, y, t, Math.PI / 2); else place(g, b, t, y, sign * off, 0);
      B.add('window', g);
      if (b.style === 'stone' && !b.ruined && r.next() < 0.6) for (const s of [-1, 1]) { const sh = boxUV(0.5, wh + 0.1, 0.05, 1); const so = off + 0.03; if (axis === 'x') place(sh, b, sign * so, y, t + s * (ww / 2 + 0.27), Math.PI / 2); else place(sh, b, t + s * (ww / 2 + 0.27), y, sign * so, 0); B.add('paintwood', sh); }
    }
  };
  for (const b of mb.buildings) {
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
    if (b.style === 'cabin') { const up = boxUV(b.w + 0.1, H - 0.9, b.d + 0.1, 2.5); place(up, b, 0, 0.9 + (H - 0.9) / 2, 0); B.add('wood', up); }
    if (b.roof === 'gable') {
      const ridgeZ = b.d >= b.w; const ww = ridgeZ ? b.w : b.d, dd = ridgeZ ? b.d : b.w; const R = ww * (b.style === 'cabin' ? 0.55 : 0.42);
      const { roof, gables } = gableRoof(ww, dd, H, R, 0.45); const ry = ridgeZ ? 0 : Math.PI / 2;
      place(roof, b, 0, 0, 0, ry); B.add(b.style === 'cabin' || b.barn ? 'slate' : 'roof', roof); place(gables, b, 0, 0, 0, ry); B.add(b.style === 'cabin' ? 'wood' : wm, gables);
      top = H + R;
      if (!b.barn) { const ch = boxUV(0.7, 2.0, 0.7, 1.5); place(ch, b, ridgeZ ? ww * 0.22 : dd * 0.3, H + R * 0.6 + 0.6, ridgeZ ? dd * 0.3 : ww * 0.22); B.add(wm === 'wood' ? 'stone' : wm, ch); }
    } else {
      // flat roof with parapet, rooftop clutter
      for (const [w2, d2, x2, z2] of [[b.w, 0.3, 0, b.d / 2 - 0.15], [b.w, 0.3, 0, -b.d / 2 + 0.15], [0.3, b.d, b.w / 2 - 0.15, 0], [0.3, b.d, -b.w / 2 + 0.15, 0]]) { const pg = boxUV(w2, 0.7, d2, 3); place(pg, b, x2, H + 0.35, z2); B.add(wm, pg); }
      const slab = boxUV(b.w - 0.2, 0.1, b.d - 0.2, 3); place(slab, b, 0, H + 0.05, 0); B.add('damaged', slab);
      if (r.next() < 0.5) { const tk = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12); place(tk, b, r.range(-b.w / 3, b.w / 3), H + 1.0, r.range(-b.d / 3, b.d / 3)); B.add('metal', tk); }
      if (fl >= 2 && r.next() < 0.4) { const sw = b.w * 0.45, sd = b.d * 0.45; const sg = boxUV(sw, 2.6, sd, 3); place(sg, b, b.w / 2 - sw / 2 - 0.3, H + 1.3, -b.d / 2 + sd / 2 + 0.3); B.add(wm, sg); top = H + 2.6; }
      if (r.next() < 0.35) { const aw = new THREE.PlaneGeometry(3, 1.6); aw.rotateX(-1.1); place(aw, b, 0, 2.6, b.d / 2 + 0.8); B.add(r.next() < 0.5 ? 'canvasR' : 'canvasB', aw); }
    }
    windowsOnWall(b, b.d, 'x', 1, fl, 0.4, b.door === 1); windowsOnWall(b, b.d, 'x', -1, fl, 0.4, b.door === -1);
    windowsOnWall(b, b.w, 'z', 1, fl, 0.4, false); windowsOnWall(b, b.w, 'z', -1, fl, 0.4, false);
    if (b.door) { const dg = boxUV(b.barn ? 3.4 : 1.1, b.barn ? 3.4 : 2.2, 0.14, 1); place(dg, b, b.door * (b.w / 2 + 0.04), (b.barn ? 1.7 : 1.1) + 0.4, 0, Math.PI / 2); B.add('dark', dg); }
    colliders.push(new OBB(b.x, b.z, b.w / 2, b.d / 2, b.rot, b.y - 2, b.y + top));
  }
  // walls
  for (const w of mb.walls) {
    const y = terrain.height(w.x, w.z); const mat = w.style === 'adobe' ? 'plaster' : w.style === 'castle' ? 'castle' : 'stone';
    const g = boxUV(w.thick, w.h + 1, w.len, 2.5); xf(g, w.x, y + (w.h - 1) / 2, w.z, w.rot); B.add(mat, g);
    colliders.push(new OBB(w.x, w.z, w.thick / 2, w.len / 2, w.rot, y - 1, y + w.h, 'wall'));
  }
  // bridges: stone deck + parapets reaching down to water
  for (const br of mb.bridges) {
    const p = br.pts; const a = p[0], b2 = p[p.length - 1];
    const len = Math.hypot(b2[0] - a[0], b2[1] - a[1]); const rot = Math.atan2(b2[0] - a[0], b2[1] - a[1]);
    const cx = (a[0] + b2[0]) / 2, cz = (a[1] + b2[1]) / 2; const top = Math.max(...p.map((q) => terrain.height(q[0], q[1])));
    const deck = boxUV(br.width, 1.0, len, 2.5); xf(deck, cx, top - 0.45, cz, rot); B.add('castle', deck);
    for (const s of [-1, 1]) { const pg = boxUV(0.5, 4.5, len, 2.5); const ox = s * (br.width / 2 + 0.25); xf(pg, cx + ox * Math.cos(rot), top - 1.3, cz - ox * Math.sin(rot), rot); B.add('castle', pg);
      colliders.push(new OBB(cx + ox * Math.cos(rot), cz - ox * Math.sin(rot), 0.25, len / 2, rot, top - 4, top + 0.9, 'wall')); }
  }
  // props
  for (const p of mb.props) {
    const y = p.y;
    if (p.kind === 'haybale') { const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16); xf(g, p.x, y + 0.72, p.z, p.rot, 0, Math.PI / 2); B.add('hay', g); }
    else if (p.kind === 'haystack') { const g = new THREE.SphereGeometry(2.6, 14, 8); g.scale(1, 1.3, 1); xf(g, p.x, y + 1.2, p.z); B.add('hay', g); }
    else if (p.kind === 'pole') { const g = new THREE.CylinderGeometry(0.11, 0.15, 8, 7); xf(g, p.x, y + 4, p.z); B.add('wood', g); const c = boxUV(1.8, 0.12, 0.12, 1); xf(c, p.x, y + 7.5, p.z, p.rot + Math.PI / 2); B.add('wood', c); }
    else if (p.kind === 'cart') { const g = boxUV(1.6, 0.5, 3, 1); xf(g, p.x, y + 1, p.z, p.rot); B.add('wood', g); for (const s of [-1, 1]) { const wg = new THREE.CylinderGeometry(0.6, 0.6, 0.1, 14); wg.rotateZ(Math.PI / 2); xf(wg, p.x + s * 0.85 * Math.cos(p.rot), y + 0.6, p.z - s * 0.85 * Math.sin(p.rot), p.rot); B.add('dark', wg); } }
    else if (p.kind === 'logs') { for (let i = 0; i < 9; i++) { const row = i < 4 ? 0 : i < 7 ? 1 : 2; const k = i < 4 ? i : i < 7 ? i - 4 : i - 7; const g = new THREE.CylinderGeometry(0.3, 0.3, 6, 10); g.rotateX(Math.PI / 2); xf(g, k * 0.62 - 1 + row * 0.31, 0.3 + row * 0.52, 0); xf(g, p.x, y, p.z, p.rot); B.add('wood', g); } }
    else if (p.kind === 'stall') { for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const g = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5); xf(g, a * 1.3, 1.2, c * 1.0); xf(g, p.x, y, p.z, p.rot); B.add('wood', g); } const aw = new THREE.PlaneGeometry(3, 2.4); aw.rotateX(-Math.PI / 2 + 0.15); xf(aw, p.x, y + 2.45, p.z, p.rot); B.add(r.next() < 0.5 ? 'canvasR' : 'canvasB', aw); const t = boxUV(2.4, 0.8, 1.6, 1); xf(t, p.x, y + 0.4, p.z, p.rot); B.add('wood', t); }
    else if (p.kind === 'wreck') { const g = boxUV(1.8, 0.9, 4.4, 1.5); xf(g, p.x, y + 0.75, p.z, p.rot, 0, 0.08); B.add('rust', g); const c = boxUV(1.6, 0.7, 2.0, 1.5); xf(c, 0, 1.5, -0.3); xf(c, p.x, y, p.z, p.rot); B.add('rust', c); colliders.push(new OBB(p.x, p.z, 0.95, 2.25, p.rot, y - 1, y + 1.9, 'prop')); }
    else if (p.kind === 'hedgehog') { for (let k = 0; k < 3; k++) { const g = boxUV(0.2, 0.2, 2.4, 1); xf(g, 0, 0.7, 0, k * Math.PI / 3, k === 1 ? 0.9 : -0.9, k === 2 ? 0.9 : 0); xf(g, p.x, y, p.z, p.rot); B.add('rust', g); } }
    else if (p.kind === 'sandbags') { for (let i = 0; i < 10; i++) { const row = i < 6 ? 0 : 1; const k = row ? i - 6 : i; const g = new THREE.SphereGeometry(0.4, 8, 5); g.scale(1.1, 0.4, 0.6); xf(g, -2 + k * 0.8 + row * 0.4, 0.18 + row * 0.3, 0); xf(g, p.x, y, p.z, p.rot); B.add('sand', g); } }
  }
  const group = new THREE.Group(); group.name = 'structures';
  for (const [k, list] of Object.entries(B.b)) {
    if (!list.length) continue; const geo = mergeGeometries(list); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, M[k]); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  scene.add(group);
  return { group, colliders, materials: M };
}
