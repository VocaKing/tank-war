import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../..', import.meta.url));
const origin = 'http://127.0.0.1:5189';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], {
  cwd: root, stdio: 'ignore',
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60 && !ready && server.exitCode === null; i++) {
    try { ready = (await fetch(origin + '/tank-war/balance.html')).ok; } catch {}
    if (!ready) await delay(200);
  }
  if (!ready) throw Error('Could not start the Steel Front asset export server');
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  await page.goto(origin + '/tank-war/balance.html');
  const data = await page.evaluate(async () => {
    const base = '/tank-war/src';
    const { THREE, createTankModel } = await import(base + '/models/tankModel.js');
    const { TANK_BY_ID } = await import(base + '/game/tankData.js');
    const { MapBuilder } = await import(base + '/world/mapgen.js');
    const { MAP_BY_ID } = await import(base + '/world/maps.js');
    const { buildStructures } = await import(base + '/world/buildings.js');

    const def = MAP_BY_ID.village;
    const map = new MapBuilder(def, 'high');
    def.generate(map);
    const terrain = map.t;
    const x0 = 142, z0 = -67, extent = 180, step = 2;
    const y0 = terrain.height(x0, z0);
    const meter = (x, y, z) => [z * 100, x * 100, y * 100];
    const worldPoint = (x, y, z) => meter(x - x0, y - y0, z - z0);
    const inside = (x, z, margin = 0) => Math.abs(x - x0) < extent - margin && Math.abs(z - z0) < extent - margin;

    const section = () => ({ points: [], indices: [] });
    const packColor = c => [c.r, c.g, c.b].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255));
    const add = (out, position, normal, color) => {
      out.points.push(...position, ...normal, ...packColor(color));
      return out.points.length / 9 - 1;
    };
    const surface = section(), houses = section(), water = section(), hull = section(), turret = section(), gun = section();
    const leaves = section(), walls = section(), decks = section();
    const n = extent * 2 / step + 1;
    const palette = [0x79835a, 0x776751, 0x9c927e, 0xaa9881].map(x => new THREE.Color(x));
    const c = new THREE.Color(), normal = new THREE.Vector3();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 - extent + i * step, z = z0 - extent + j * step;
      const k = terrain.idx(terrain.x2i(x), terrain.x2i(z));
      const y = terrain.height(x, z);
      terrain.normal(x, z, normal);
      c.setRGB(0, 0, 0);
      for (let layer = 0; layer < 4; layer++) {
        const tint = palette[layer], weight = map.splat[k * 4 + layer];
        c.r += tint.r * weight; c.g += tint.g * weight; c.b += tint.b * weight;
      }
      const texture = 1 + map.noise2(x / 16, z / 16) * 0.17;
      add(surface, worldPoint(x, y, z), [normal.z, normal.x, normal.y], c.multiplyScalar(texture));
      if (i + 1 < n && j + 1 < n) {
        const p = j * n + i;
        surface.indices.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
        const level = terrain.waterLevel(x + step / 2, z + step / 2);
        if (level > terrain.height(x + step / 2, z + step / 2) + 0.08) {
          const start = water.points.length / 9;
          const blue = new THREE.Color(0x496e73);
          for (const [dx, dz] of [[0,0],[0,step],[step,0],[step,step]]) add(water, worldPoint(x + dx, level, z + dz), [0,0,1], blue);
          water.indices.push(start,start+1,start+2,start+2,start+1,start+3);
        }
      }
    }

    function append(out, mesh, transform, isWorld, fixedColor) {
      const g = mesh.geometry, index = g.index;
      const p = g.attributes.position, nrm = g.attributes.normal, tint = g.attributes.color;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
      const pTemp = new THREE.Vector3(), nTemp = new THREE.Vector3();
      const vertexIDs = new Map();
      const baseColor = fixedColor ?? mesh.material.color ?? new THREE.Color(0x786e52);
      const color = new THREE.Color();
      const vertex = (j) => {
        let id = vertexIDs.get(j);
        if (id !== undefined) return id;
        pTemp.fromBufferAttribute(p, j).applyMatrix4(transform);
        nTemp.fromBufferAttribute(nrm, j).applyNormalMatrix(normalMatrix);
        const len = nTemp.lengthSq();
        if (!Number.isFinite(len) || len < 1e-8) nTemp.set(0, 1, 0);
        color.copy(baseColor);
        if (tint) { color.r *= tint.getX(j); color.g *= tint.getY(j); color.b *= tint.getZ(j); }
        id = add(out, isWorld ? worldPoint(pTemp.x,pTemp.y,pTemp.z) : meter(pTemp.x,pTemp.y,pTemp.z), [nTemp.z,nTemp.x,nTemp.y], color);
        vertexIDs.set(j, id);
        return id;
      };
      for (let i = 0, count = index?.count ?? p.count; i < count; i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
        if (isWorld) {
          pTemp.fromBufferAttribute(p, a).applyMatrix4(transform);
          if (!inside(pTemp.x, pTemp.z, 3)) continue;
        }
        out.indices.push(vertex(a), vertex(b), vertex(c));
      }
    }

    const scene = new THREE.Scene();
    const st = buildStructures(map, scene, terrain);
    scene.updateMatrixWorld(true);
    const colors = {
      plastered_stone_wall: 0xa9a092, clay_roof_tiles_02: 0x885b46,
      brown_planks_05: 0x827059, red_brick_03: 0x9d6351,
    };
    for (const mesh of st.group.children) {
      const mapName = mesh.material.map?.image?.src ?? '';
      const key = Object.keys(colors).find(k => mapName.includes(k));
      const fallback = key ? mesh.material.color.clone().multiply(new THREE.Color(colors[key])) : null;
      append(houses, mesh, mesh.matrixWorld, true, fallback);
    }

    const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    for (const wall of st.colliders) {
      if (wall.kind === 'deck' || !inside(wall.x, wall.z, -wall.r)) continue;
      collider.position.set(wall.x, (wall.y0 + wall.y1) / 2, wall.z);
      collider.scale.set(wall.hx * 2, Math.max(0.1, wall.y1 - wall.y0), wall.hz * 2);
      collider.rotation.y = wall.rot;
      collider.updateMatrix();
      append(walls, collider, collider.matrix, true);
    }
    const gray = new THREE.Color(0x999999);
    for (const deck of st.decks) for (const seg of deck.segs) {
      const { ax, az, ux, uz, l, s0 } = seg;
      if (!inside(ax, az, -l) || !inside(ax + ux * l, az + uz * l, -l)) continue;
      const base = decks.points.length / 9;
      for (const d of [0, l]) for (const side of [-1, 1]) {
        const x = ax + ux * d + uz * side * deck.hw, z = az + uz * d - ux * side * deck.hw;
        add(decks, worldPoint(x, deck.deckY((s0 + d) / deck.len), z), [0, 0, 1], gray);
      }
      decks.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }

    const trunk = new THREE.CylinderGeometry(0.19, 0.31, 5.4, 7);
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const foliage = new THREE.Mesh(crown);
    const stem = new THREE.Mesh(trunk);
    const foliageColor = new THREE.Color(0x61724c), bark = new THREE.Color(0x695744);
    for (const tree of map.trees) {
      if (!inside(tree.x,tree.z,6)) continue;
      const scale = tree.scale;
      stem.position.set(tree.x, tree.y + 2.5 * scale, tree.z); stem.scale.setScalar(scale); stem.updateMatrix();
      append(leaves,stem,stem.matrix,true,bark);
      foliage.position.set(tree.x, tree.y + 7.8 * scale, tree.z);
      foliage.scale.set(4.1 * scale, 4.7 * scale, 3.6 * scale);
      foliage.rotation.y = tree.rot; foliage.updateMatrix();
      append(leaves,foliage,foliage.matrix,true,foliageColor);
    }
    for (const bush of map.bushes) {
      if (!inside(bush.x,bush.z,6)) continue;
      foliage.position.set(bush.x,bush.y + bush.h * 0.45,bush.z);
      foliage.scale.set(bush.r,bush.h * 0.64,bush.r * 0.84);
      foliage.rotation.y = bush.x + bush.z; foliage.updateMatrix();
      append(leaves,foliage,foliage.matrix,true,foliageColor);
    }

    const tank = createTankModel(TANK_BY_ID.sherman, { links: true });
    tank.root.updateMatrixWorld(true);
    const identity = new THREE.Matrix4(), instance = new THREE.Matrix4();
    function within(node, ancestor) {
      for (let o = node; o; o = o.parent) if (o === ancestor) return true;
      return false;
    }
    for (const mesh of tank.meshes) {
      if (!mesh.visible || mesh.userData.decal) continue;
      const part = within(mesh, tank.gun) ? tank.gun : within(mesh, tank.turret) ? tank.turret : tank.body;
      const result = part === tank.gun ? gun : part === tank.turret ? turret : hull;
      const relative = identity.copy(part.matrixWorld).invert().multiply(mesh.matrixWorld);
      const color = mesh.userData.matKey === 'paint' ? new THREE.Color(TANK_BY_ID.sherman.paint.base) : null;
      if (mesh.isInstancedMesh) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, instance);
          append(result, mesh, new THREE.Matrix4().multiplyMatrices(relative, instance), false, color);
        }
      } else append(result, mesh, relative, false, color);
    }
    const road = map.roads[0].pts;
    const spawn = road.findIndex(([x,z], i) => i > 0 && i + 1 < road.length && x > 95 && inside(x,z,20));
    if (spawn < 1) throw Error('No suitable Normandy road spawn');
    const [sx,sz] = road[spawn], [ex,ez] = road[spawn + 1];
    const yaw = Math.atan2(ex - sx, ez - sz) * 180 / Math.PI;
    return {
      metadata:[...worldPoint(sx,terrain.height(sx,sz) + 0.85,sz),yaw,
        ...meter(...tank.turret.position),...meter(...tank.gun.position),tank.muzzle.position.z * 100],
      sections:[surface,houses,water,hull,turret,gun,leaves,walls,decks],
    };
  });
  const header = Buffer.alloc(8 + data.metadata.length * 4);
  header.write('SFM2'); header.writeUInt32LE(data.sections.length, 4);
  data.metadata.forEach((v,i) => header.writeFloatLE(v,8+i*4));
  const sections = [header];
  for (const {points,indices} of data.sections) {
    const count = points.length / 9;
    if (!Number.isInteger(count) || count === 0 || count > 750000 || indices.length % 3
      || points.some(x => !Number.isFinite(x)) || indices.some(i => i < 0 || i >= count)) throw Error('Invalid prototype geometry');
    const bytes = Buffer.alloc(8 + count * 28 + indices.length * 4);
    bytes.writeUInt32LE(count,0); bytes.writeUInt32LE(indices.length,4);
    for (let v = 0; v < count; v++) {
      const off = 8 + v*28;
      for (let i = 0; i < 6; i++) bytes.writeFloatLE(points[v*9+i],off+i*4);
      bytes[off+24]=points[v*9+6]; bytes[off+25]=points[v*9+7]; bytes[off+26]=points[v*9+8]; bytes[off+27]=255;
    }
    indices.forEach((v,i) => bytes.writeUInt32LE(v,8+count*28+i*4));
    sections.push(bytes);
  }
  const out = Buffer.concat(sections);
  await mkdir(new URL('Content/Prototype/', import.meta.url), { recursive: true });
  await writeFile(new URL('Content/Prototype/Normandy.sfbin', import.meta.url), out);
  console.log('Exported',out.length,'bytes',data.sections.map(s=>s.indices.length/3),'triangles by section');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
