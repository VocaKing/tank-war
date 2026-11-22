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
    if (!tiles.size) return;
    this.geometry = pebbleGeometry();
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.97 });
    const transform = new THREE.Object3D();
    for (const { x, z, stones } of tiles.values()) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, stones.length);
      stones.forEach((stone, i) => {
        transform.position.set(stone.x, stone.y, stone.z);
        transform.rotation.set(0.12, stone.yaw, -0.14);
        transform.scale.set(stone.size, stone.size * stone.height, stone.size * 0.78);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
        mesh.setColorAt(i, stone.color);
      });
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.userData.center = { x, z };
      mesh.visible = false;
      this.group.add(mesh);
    }
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
    this.geometry?.dispose();
    this.material?.dispose();
    for (const mesh of this.group.children) mesh.dispose();
  }
}
