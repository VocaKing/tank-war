import * as THREE from 'three';
import { RNG, smoothstep } from '../util.js';
import { OCC } from './mapgen.js';

const PALETTES = {
  village: [0x82735c, 0x989080, 0x706c60, 0xa69e83],
  forest: [0x65665a, 0x747b6c, 0x8a8275, 0x544539],
  desert: [0x9b7456, 0xc7a484, 0x89674d, 0xb29173],
};

function pebbleGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const edge = 0.91 + Math.sin(x * 6 + z * 4 + y * 3) * 0.09;
    p.setXYZ(i, x * edge, Math.max(-0.45, y * edge), z * edge);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function curbGeometry() {
  const section = new THREE.Shape();
  section.moveTo(-0.5, -0.5);
  section.lineTo(0.5, -0.5);
  section.lineTo(0.5, 0.20);
  section.lineTo(0.32, 0.5);
  section.lineTo(-0.32, 0.5);
  section.lineTo(-0.5, 0.20);
  section.closePath();
  return new THREE.ExtrudeGeometry(section, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

function stumpGeometry() {
  const points = [
    [0.0, 0.5], [0.10, 0.49], [0.13, 0.5], [0.15, 0.49], [0.23, 0.5],
    [0.27, 0.488], [0.30, 0.497], [0.37, 0.5], [0.39, 0.43], [0.44, 0.05],
    [0.54, -0.40], [0.52, -0.5], [0, -0.5],
  ];
  const geometry = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 10);
  const colors = [0xb99163, 0xb99163, 0x765334, 0xaa8258, 0xbe9c6e, 0x815737,
    0xbb9869, 0x795635, 0x55412d, 0x574532, 0x473d2a, 0x443625, 0x443625].map(c => new THREE.Color(c));
  const p = geometry.attributes.position, rgb = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    colors[points.length - 1 - i % points.length].toArray(rgb, i * 3);
    const root = 1 + 0.3 * Math.cos(i / points.length * 2.5) * Math.max(0, -p.getY(i));
    p.setXYZ(i, p.getX(i) * root, p.getY(i), p.getZ(i) * root);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function vesselGeometry() {
  const shape = [
    [0.13, -0.5], [0.28, -0.42], [0.48, -0.23], [0.5, 0.06], [0.43, 0.25],
    [0.30, 0.39], [0.31, 0.49], [0.21, 0.49], [0.22, 0.37], [0.33, 0.12], [0.13, -0.37], [0, -0.37],
  ];
  return new THREE.LatheGeometry(shape.map(([r, y]) => new THREE.Vector2(r, y)), 10);
}

const DETAIL_SHAPES = { curb: curbGeometry, stump: stumpGeometry, vessel: vesselGeometry };

function roadEdges(map, quality, add) {
  if (map.def.id === 'forest') return;
  const desert = map.def.id === 'desert';
  const palette = (desert ? [0xa58c6d, 0x8c755a, 0xb2916c, 0xc4ac86]
    : [0x827e70, 0x79776a, 0x938c7d, 0x887f6b]).map(c => new THREE.Color(c));
  const rng = new RNG(map.def.seed + 383);
  const interval = quality === 'high' ? 1.07 : 1.36;
  const t = map.t;
  for (const road of map.roads) {
    if (desert && road.kind !== 'asphalt') continue;
    let u = 0;
    for (let i = 1; i < road.pts.length; i++) {
      const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01) continue;
      const fx = (bx - ax) / length, fz = (bz - az) / length;
      const yaw = Math.atan2(fx, fz);
      for (; u < length; u += interval) {
        const x = ax + fx * u, z = az + fz * u;
        if (desert ? Math.max(Math.abs(x), Math.abs(z)) > 216 : Math.hypot(x - 190, z) > 150) continue;
        for (const side of [-1, 1]) {
          if (rng.next() < 0.055) continue;
          const offset = side * (road.width / 2 + (desert ? 0.26 : 0.21));
          const px = x + fz * offset, pz = z - fx * offset;
          // Skip junctions, foundations and wet ground. Keep the stones outside the usable road.
          const outX = px + fz * side * 1.16, outZ = pz - fx * side * 1.16;
          const occ = t.occAt(outX, outZ);
          if (occ !== OCC.FREE) continue;
          const h = t.height(px, pz);
          if (t.waterLevel(px, pz) > h - 0.06) continue;
          const ahead = t.height(px + fx * interval / 2, pz + fz * interval / 2);
          const behind = t.height(px - fx * interval / 2, pz - fz * interval / 2);
          if (Math.abs(ahead - behind) > interval * 0.22) continue;
          const height = rng.range(0.14, 0.21);
          add('curb', px, h + height * 0.06, pz, yaw + rng.range(-0.03, 0.03),
            desert ? 0.29 : 0.22, height, interval * rng.range(0.87, 0.98), rng.pick(palette),
            -Math.atan2(ahead - behind, interval));
        }
      }
      u -= length;
    }
  }
}

function yardDetails(map, quality, add) {
  const rng = new RNG(map.def.seed + 8812);
  const t = map.t, forest = map.def.id === 'forest';
  const palette = (forest ? [0xc1b2a0, 0xe0c49c, 0xf3e6d4, 0xd6d0bf]
    : [0x99674d, 0xad7151, 0x945b4c, 0x806a58]).map(c => new THREE.Color(c));
  const yards = map.props.filter(prop => prop.kind === (forest ? 'logs' : 'stall'));
  const placements = [];
  const clearance = forest ? 3.7 : 1.83;
  for (const prop of yards) {
    const count = forest ? (quality === 'high' ? 8 : 5) : (quality === 'high' ? 5 : 3);
    for (let i = 0; i < count; i++) {
      const angle = rng.range(0, Math.PI * 2), distance = forest ? rng.range(4.8, 20) : rng.range(1.75, 3.4);
      const x = prop.x + Math.sin(angle) * distance, z = prop.z + Math.cos(angle) * distance;
      const occupancy = t.occAt(x, z);
      if (occupancy !== OCC.FREE && (forest || occupancy !== OCC.RESERVED)) continue;
      if (yards.some(p => Math.hypot(x - p.x, z - p.z) < clearance)
        || placements.some(p => Math.hypot(x - p.x, z - p.z) < 0.8)) continue;
      const size = forest ? rng.range(0.37, 0.87) : rng.range(0.31, 0.54);
      const height = size * (forest ? rng.range(0.38, 0.60) : rng.range(0.7, 1));
      const y = t.height(x, z);
      if (map.slope(x, z) > 0.26 || t.waterLevel(x, z) > y - 0.06) continue;
      add(forest ? 'stump' : 'vessel', x, y + height * 0.39, z, angle, size, height, size, rng.pick(palette));
      placements.push({ x, z });
    }
  }
}

export class GroundDetails {
  constructor(scene, map, quality) {
    this.group = new THREE.Group();
    this.group.name = 'ground details';
    scene.add(this.group);
    this.radius = quality === 'high' ? 125 : quality === 'medium' ? 95 : 68;
    const spacing = quality === 'high' ? 8 : quality === 'medium' ? 11 : 17;
    const tiles = new Map();
    const random = new RNG(map.def.seed + 13251);
    const palette = PALETTES[map.def.id].map(color => new THREE.Color(color));
    const t = map.t;
    for (let z = -map.play; z < map.play; z += spacing) {
      for (let x = -map.play; x < map.play; x += spacing) {
        const cx = x + random.range(0, spacing), cz = z + random.range(0, spacing);
        const index = t.idx(t.x2i(cx), t.x2i(cz));
        const bank = t.maskB[index];
        const shoulder = map.roadDetail[index * 3 + 2] * (1 - t.road[index]);
        const stone = map.splat[index * 4 + 2];
        const chance = 0.13 + shoulder * 0.48 + stone * 0.25 + bank * 0.19;
        if (random.next() > chance) continue;
        const tx = Math.floor(cx / 64), tz = Math.floor(cz / 64);
        const key = tx + ':' + tz;
        const end = quality === 'high' ? 5 : quality === 'medium' ? 3 : 2;
        for (let i = 0, n = random.int(1, end); i < n; i++) {
          const px = cx + random.range(-2, 2), pz = cz + random.range(-2, 2);
          const occ = t.occAt(px, pz);
          if (occ !== OCC.FREE && occ !== OCC.TREE) continue;
          const height = t.height(px, pz);
          if (t.waterLevel(px, pz) > height - 0.02) continue;
          const size = random.range(0.06, 0.32) * (0.64 + smoothstep(0, 1, stone) * 0.7);
          if (!tiles.has(key)) tiles.set(key, { x: (tx + 0.5) * 64, z: (tz + 0.5) * 64, stones: [] });
          tiles.get(key).stones.push({
            x: px, z: pz, y: height + size * 0.19, size, height: random.range(0.38, 0.65),
            yaw: random.range(0, Math.PI * 2), color: random.pick(palette),
          });
        }
      }
    }
    this.resources = [];
    if (tiles.size) this.addPebbles(tiles);
    if (quality !== 'low') this.addScenery(map, quality);
  }
  addPebbles(tiles) {
    const geometry = pebbleGeometry();
    const material = new THREE.MeshStandardMaterial({ roughness: 0.97 });
    this.resources.push(geometry, material);
    const transform = new THREE.Object3D();
    for (const { x, z, stones } of tiles.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, stones.length);
      stones.forEach((stone, i) => {
        transform.position.set(stone.x, stone.y, stone.z);
        transform.rotation.set(0.12, stone.yaw, -0.14);
        transform.scale.set(stone.size, stone.size * stone.height, stone.size * 0.78);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
        mesh.setColorAt(i, stone.color);
      });
      this.addTile(mesh, x, z);
    }
  }
  addScenery(map, quality) {
    const shapes = new Map();
    const add = (kind, x, y, z, yaw, sx, sy, sz, color, pitch = 0) => {
      if (!shapes.has(kind)) shapes.set(kind, new Map());
      const cell = 64;
      const tx = Math.floor(x / cell), tz = Math.floor(z / cell), id = tx + ':' + tz;
      const tiles = shapes.get(kind);
      if (!tiles.has(id)) tiles.set(id, { x: (tx + 0.5) * cell, z: (tz + 0.5) * cell, entries: [] });
      tiles.get(id).entries.push({ x, y, z, yaw, pitch, sx, sy, sz, color });
    };
    roadEdges(map, quality, add);
    if (map.def.id !== 'village') yardDetails(map, quality, add);
    const transform = new THREE.Object3D();
    transform.rotation.order = 'YXZ';
    for (const [kind, tiles] of shapes) {
      const geometry = DETAIL_SHAPES[kind]();
      const material = new THREE.MeshStandardMaterial({ roughness: 0.94, vertexColors: !!geometry.attributes.color });
      this.resources.push(geometry, material);
      for (const { x, z, entries } of tiles.values()) {
        const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
        mesh.name = kind;
        for (let i = 0; i < entries.length; i++) {
          const detail = entries[i];
          transform.position.set(detail.x, detail.y, detail.z);
          transform.rotation.set(detail.pitch, detail.yaw, 0);
          transform.scale.set(detail.sx, detail.sy, detail.sz);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          mesh.setColorAt(i, detail.color);
        }
        this.addTile(mesh, x, z);
      }
    }
  }
  addTile(mesh, x, z) {
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.userData.center = { x, z };
    mesh.visible = false;
    this.group.add(mesh);
  }
  update(camera) {
    const limit = (this.radius + 46) ** 2;
    for (const mesh of this.group.children) {
      const { x, z } = mesh.userData.center;
      mesh.visible = (camera.x - x) ** 2 + (camera.z - z) ** 2 < limit;
    }
  }
  dispose() {
    this.group.removeFromParent();
    for (const resource of this.resources) resource.dispose();
    for (const mesh of this.group.children) mesh.dispose();
  }
}
