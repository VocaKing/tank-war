import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../..', import.meta.url);
const art = new URL('ArtSource/', import.meta.url);
const content = new URL('Content/Prototype/', import.meta.url);
await mkdir(art, { recursive: true });
await mkdir(content, { recursive: true });
const origin = 'http://127.0.0.1:5189';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], {
  cwd: fileURLToPath(root), stdio: 'ignore',
});
const base64 = [];
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
  await page.exposeFunction('assetChunk', (data) => base64.push(Buffer.from(data, 'base64')));
  await page.exposeFunction('saveTexture', (name, data) => writeFile(new URL(name, art), Buffer.from(data, 'base64')));
  await page.goto(origin + '/tank-war/balance.html');
  const materials = await page.evaluate(async () => {
    const base = '/tank-war/src';
    const { THREE, createTankModel } = await import(base + '/models/tankModel.js');
    const { TANK_BY_ID } = await import(base + '/game/tankData.js');
    const { MapBuilder } = await import(base + '/world/mapgen.js');
    const { MAP_BY_ID } = await import(base + '/world/maps.js');
    const { buildStructures } = await import(base + '/world/buildings.js');
    const { Vegetation, windUniform } = await import(base + '/world/vegetation.js');
    const { Grass } = await import(base + '/world/grass.js');
    const { GroundDetails } = await import(base + '/world/groundDetails.js');
    const { setTexQuality, waterNormalTexture } = await import(base + '/world/textures.js');

    const def = MAP_BY_ID.village, map = new MapBuilder(def, 'high');
    def.generate(map);
    const terrain = map.t;
    const x0 = 142, z0 = -68, extent = 240, step = 2;
    const y0 = terrain.height(x0, z0);
    const meter = (x, y, z) => [z * 100, x * 100, y * 100];
    const worldPoint = (x, y, z) => meter(x - x0, y - y0, z - z0);
    const inside = (x, z, margin = 0) => Math.abs(x - x0) < extent - margin && Math.abs(z - z0) < extent - margin;
    const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
    const section = (name) => ({ name, points: [], groups: new Map() });
    const sections = ['Terrain', 'Buildings', 'Water', 'Hull', 'Turret', 'Gun', 'Foliage', 'Walls', 'Decks',
      'Grass', 'Pebbles', 'Horizon', 'RoadWheel', 'Sprocket', 'TrackLink'].map(section);
    const [surface, houses, water, hull, turret, gun, leaves, walls, decks, grass, pebbles, horizon, wheels, sprockets, links] = sections;
    const transforms = [];
    const textures = new Set();
    const catalog = new Map();
    const generated = new Map();
    function texture(source, name) {
      if (!source?.image) return null;
      const image = source.image;
      if (image instanceof HTMLCanvasElement) {
        if (!generated.has(image)) generated.set(image, { name: name + '.png', image });
        return generated.get(image).name;
      }
      const file = new URL(image.src).pathname.split('/').pop();
      if (!file.endsWith('.jpg')) throw Error('Missing source texture: ' + name);
      textures.add(file);
      return file;
    }
    function material(name, mat, extra = {}) {
      if (!catalog.has(name)) {
        catalog.set(name, {
          name, diffuse: texture(mat.map, name + '_Color'), normal: texture(mat.normalMap, name + '_Normal'),
          arm: mat.aoMap && mat.aoMap === mat.roughnessMap ? texture(mat.aoMap, name + '_ARM') : null,
          roughMap: mat.roughnessMap && mat.roughnessMap !== mat.aoMap ? texture(mat.roughnessMap, name + '_Rough') : null,
          roughness: mat.roughness ?? 0.9, metalness: mat.metalness ?? 0,
          masked: !!mat.alphaTest, cutoff: mat.alphaTest || 0.45,
          doubleSided: mat.side === THREE.DoubleSide, ...extra,
        });
      }
      return name;
    }
    function group(out, name) {
      if (!out.groups.has(name)) out.groups.set(name, []);
      return out.groups.get(name);
    }
    // Position and normal in UE axes, one authored UV, then colour, tint and road data.
    const add = (out, p, n, u, v, color, aux = [0, 0, 0, 0], road = [0, 0, 0]) => {
      out.points.push(...p, ...n, u, v, ...color, ...aux, ...road);
      return out.points.length / 19 - 1;
    };
    const white = [1 / 1.5, 1 / 1.5, 1 / 1.5, 1];
    const normal = new THREE.Vector3();

    setTexQuality('high');
    const loaded = new Promise(resolve => { THREE.DefaultLoadingManager.onLoad = resolve; });
    const scene = new THREE.Scene();
    const structures = buildStructures(map, scene, terrain);
    const veg = new Vegetation(scene, map, 'high');
    const groundDetails = new GroundDetails(scene, map, 'high');
    const grassfield = new Grass(scene, map, 'high', windUniform);
    const tank = createTankModel(TANK_BY_ID.sherman, { links: true });
    tank.root.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    await loaded;

    const layerNames = ['A', 'B', 'C', 'D'].map(k => def.layers[k]);
    const layers = layerNames.map((name) => {
      const files = { diffuse: name + '_diff_2k.jpg', normal: name + '_nor_2k.jpg', arm: name + '_arm.jpg' };
      Object.values(files).forEach(file => textures.add(file));
      return files;
    });
    catalog.set('NormandyGround', { name: 'NormandyGround', layers, tintA: def.layers.tintA, tintB: def.layers.tintB });
    const terrainMaterial = 'NormandyGround';
    const waterMat = material('NormandyWater', { normalMap: waterNormalTexture(), roughness: 0.12, metalness: 0.02 },
      { kind: 'water', doubleSided: true });
    function terrainVertex(out, x, z) {
      const i = clamp(terrain.x2i(x), 0, terrain.n - 1), j = clamp(terrain.x2i(z), 0, terrain.n - 1);
      const k = terrain.idx(i, j), y = terrain.height(x, z);
      terrain.normal(x, z, normal);
      const wet = 1 - clamp((Math.abs(y - terrain.water[k]) - 0.04) / 0.8, 0, 1);
      const rgba = Array.from(map.splat.subarray(k * 4, k * 4 + 4));
      const tint = [...terrain.tint.subarray(k * 3, k * 3 + 3)].map(c => c / 1.5);
      return add(out, worldPoint(x, y, z), [normal.z, normal.x, normal.y], x / 3.2, -z / 3.2,
        rgba, [...tint, wet], map.roadDetail.subarray(k * 3, k * 3 + 3));
    }
    function addTerrain(out, half, spacing, cut = 0) {
      const n = 2 * half / spacing + 1;
      const tri = group(out, terrainMaterial);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        terrainVertex(out, x0 - half + i * spacing, z0 - half + j * spacing);
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const x = x0 - half + i * spacing, z = z0 - half + j * spacing;
        const cx = x + spacing / 2, cz = z + spacing / 2;
        if (cut && Math.abs(cx - x0) < cut && Math.abs(cz - z0) < cut) continue;
        const p = j * n + i, q = p + 1, r = p + n, s = r + 1;
        const data = out.points;
        const twist = Math.abs(data[p * 19 + 2] + data[s * 19 + 2] - data[q * 19 + 2] - data[r * 19 + 2]);
        if (!cut && twist >= 12) {
          const center = data.length / 19;
          for (let k = 0; k < 19; k++) data.push((data[p * 19 + k] + data[q * 19 + k] + data[r * 19 + k] + data[s * 19 + k]) / 4);
          tri.push(p, r, center, r, s, center, s, q, center, q, p, center);
        } else if (cut && (
          ((x === x0 + cut || x + spacing === x0 - cut) && Math.abs(cz - z0) < cut) ||
          ((z === z0 + cut || z + spacing === z0 - cut) && Math.abs(cx - x0) < cut))) {
          // Match the two-metre inner surface along the transition to the distant terrain.
          // Build the edge in polygon order p -> r -> s -> q.
          const corners = [[p, x, z], [r, x, z + spacing], [s, x + spacing, z + spacing], [q, x + spacing, z]];
          const boundary = [];
          for (let k = 0; k < 4; k++) {
            const [index, ax, az] = corners[k], [, bx, bz] = corners[(k + 1) % 4];
            boundary.push(index);
            const seam = (ax === bx && Math.abs(ax - x0) === cut && Math.abs(cz - z0) < cut) ||
              (az === bz && Math.abs(az - z0) === cut && Math.abs(cx - x0) < cut);
            if (seam) for (let d = 2; d < spacing; d += 2) boundary.push(terrainVertex(out, ax + (bx - ax) * d / spacing, az + (bz - az) * d / spacing));
          }
          const middle = terrainVertex(out, cx, cz);
          for (let k = 0; k < boundary.length; k++) tri.push(boundary[k], boundary[(k + 1) % boundary.length], middle);
        } else tri.push(p, r, q, q, r, s);
        if (cut) continue;
        const level = terrain.waterLevel(cx, cz);
        if (level <= terrain.height(cx, cz) + 0.05) continue;
        const first = water.points.length / 19;
        for (const [dx, dz] of [[0,0], [0,spacing], [spacing,0], [spacing,spacing]]) {
          const column = Math.max(0, level - terrain.height(x + dx, z + dz));
          add(water, worldPoint(x + dx, level, z + dz), [0,0,1], (x + dx) / 4, -(z + dz) / 4, [clamp(column / 1.6, 0, 1), 0, 0, 1]);
        }
        group(water, waterMat).push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
      }
    }
    addTerrain(surface, extent, step);
    addTerrain(horizon, 840, 8, extent);

    const position = new THREE.Vector3(), nrm = new THREE.Vector3(), center = new THREE.Vector3();
    const origin = new THREE.Vector3(), ns = new THREE.Matrix3(), m = new THREE.Matrix4(), tint = new THREE.Color();
    const instanceColor = new THREE.Color(0xffffff);
    function append(out, geom, matrix, mat, name, options = {}) {
      const { instanceTint = null, world = true, start = 0, end = geom.index?.count ?? geom.attributes.position.count,
        weather = false, wind = false, planar = false, crop = false } = options;
      const p = geom.attributes.position, n = geom.attributes.normal, c = geom.attributes.color;
      const uv = geom.attributes.uv, floor = geom.attributes.floorHeight, idx = geom.index;
      ns.getNormalMatrix(matrix);
      origin.setFromMatrixPosition(matrix);
      const indices = group(out, name), ids = new Map();
      const base = mat.color ?? new THREE.Color(0xffffff);
      const vertex = (i) => {
        if (ids.has(i)) return ids.get(i);
        position.fromBufferAttribute(p, i).applyMatrix4(matrix);
        nrm.fromBufferAttribute(n, i).applyNormalMatrix(ns);
        if (!Number.isFinite(nrm.lengthSq()) || nrm.lengthSq() < 1e-8) nrm.set(0, 1, 0);
        tint.copy(base);
        if (c) { tint.r *= c.getX(i); tint.g *= c.getY(i); tint.b *= c.getZ(i); }
        if (instanceTint) tint.multiply(instanceTint);
        if (weather && floor) {
          const h = Math.max(0, p.getY(i) - floor.getX(i));
          const path = position.x * 0.72 + position.z * 0.68;
          const noise = Math.sin(path * 5.4 + Math.sin(path * 1.33) * 1.8);
          const fade = clamp((h - 0.04) / (0.86 + noise * 0.22), 0, 1);
          const damp = 1 - fade * fade * (3 - 2 * fade);
          tint.multiplyScalar(1 - 0.30 * damp);
          tint.r *= 1 - damp * 0.082; tint.g *= 1 - damp * 0.116; tint.b *= 1 - damp * 0.224;
        }
        let u = uv?.getX(i) ?? 0, v = 1 - (uv?.getY(i) ?? 0);
        if (planar) {
          u = (Math.abs(nrm.z) > Math.abs(nrm.x) ? position.x : position.z) / 2.2;
          v = -(Math.abs(nrm.y) < 0.65 ? position.y : position.z) / 2.2;
        }
        const sway = wind ? clamp((position.y - origin.y) / 16, 0, 1) : 0;
        const windSeed = world && wind ? ((origin.x * 0.018 + origin.z * 0.011) % 1 + 1) % 1 : 0;
        const id = add(out, (world ? worldPoint : meter)(position.x, position.y, position.z),
          [nrm.z, nrm.x, nrm.y], u, v, [tint.r / 1.5, tint.g / 1.5, tint.b / 1.5, 1], [sway, windSeed, 0, 0]);
        ids.set(i, id);
        return id;
      };
      for (let i = start; i < end; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
        if (crop) {
          center.fromBufferAttribute(p, a).applyMatrix4(matrix);
          if (!inside(center.x, center.z, -55)) continue;
        }
        indices.push(vertex(a), vertex(b), vertex(c));
      }
    }
    const structureNames = new Map(Object.entries(structures.materials).map(([key, mat]) => [mat, key]));
    for (const mesh of structures.group.children) {
      const key = structureNames.get(mesh.material);
      const name = material('Structure_' + key, mesh.material,
        { masked: !!mesh.material.transparent, cutoff: 0.42, kind: key === 'window' ? 'window' : 'surface' });
      append(houses, mesh.geometry, mesh.matrixWorld, mesh.material, name, { crop: true, weather: true });
    }
    for (const chunk of veg.chunks.values()) for (const [key, records] of Object.entries(chunk.items)) {
      const pair = chunk.meshes[key];
      records.forEach((rec, index) => {
        if (!inside(rec.x, rec.z, -125)) return;
        const mesh = pair[inside(rec.x, rec.z) ? 0 : 1];
        const mat = mesh.material;
        mesh.getColorAt(index, instanceColor);
        for (const { start, count, materialIndex } of mesh.geometry.groups) {
          const leaf = materialIndex === 1;
          const name = material((leaf ? 'Leaves_' : 'Bark_') + key, mat[materialIndex],
            { kind: leaf ? 'leaf' : 'surface' });
          append(leaves, mesh.geometry, rec.matrix, mat[materialIndex], name,
            { start, end: start + count, instanceTint: instanceColor, wind: leaf });
        }
      });
    }
    const rockName = material('NormandyRock', veg.rockMat);
    for (const { list, meshes } of veg.rockBatches) for (const rec of list) {
      if (!inside(rec.x, rec.z, -95)) continue;
      append(leaves, meshes[inside(rec.x, rec.z) ? 0 : 1].geometry, rec.matrix, veg.rockMat, rockName,
        { instanceTint: rec.color, planar: true });
    }
    const pebbleName = material('NormandyPebble', groundDetails.material);
    for (const mesh of groundDetails.group.children) {
      if (!inside(mesh.userData.center.x, mesh.userData.center.z, -50)) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        origin.setFromMatrixPosition(m);
        if (!inside(origin.x, origin.z)) continue;
        mesh.getColorAt(i, instanceColor);
        append(pebbles, mesh.geometry, m, mesh.material, pebbleName, { instanceTint: instanceColor });
      }
    }

    const grassName = material('NormandyGrass', grassfield.mesh.material, { kind: 'grass' });
    append(grass, grassfield.mesh.geometry, new THREE.Matrix4(), grassfield.mesh.material, grassName, { world: false });
    // Sample the same jitter grid as the web renderer, then keep each point once in its own tile.
    const tile = 80;
    const q = new THREE.Quaternion(), scale = new THREE.Vector3(), e = new THREE.Euler();
    for (let tz = -extent; tz < extent; tz += tile) for (let tx = -extent; tx < extent; tx += tile) {
      grassfield.update({ x: x0 + tx + tile / 2, z: z0 + tz + tile / 2 });
      for (let i = 0; i < grassfield.mesh.count; i++) {
        grassfield.mesh.getMatrixAt(i, m);
        m.decompose(origin, q, scale);
        const x = origin.x - x0, z = origin.z - z0;
        if (x < tx || x >= tx + tile || z < tz || z >= tz + tile) continue;
        const yaw = e.setFromQuaternion(q, 'YXZ').y;
        transforms.push(...worldPoint(origin.x, origin.y, origin.z), yaw * 180 / Math.PI, scale.z, scale.x, scale.y);
      }
    }

    const wallMaterial = { color: new THREE.Color(0xffffff) };
    const collider = new THREE.Object3D();
    const cube = new THREE.BoxGeometry(1, 1, 1);
    for (const wall of structures.colliders) {
      if (wall.kind === 'deck' || !inside(wall.x, wall.z, -wall.r)) continue;
      collider.position.set(wall.x, (wall.y0 + wall.y1) / 2, wall.z);
      collider.scale.set(wall.hx * 2, Math.max(0.1, wall.y1 - wall.y0), wall.hz * 2);
      collider.rotation.y = wall.rot;
      collider.updateMatrix();
      append(walls, cube, collider.matrix, wallMaterial, 'Collision');
    }
    for (const rock of veg.rocks) {
      if (rock.s < 2.4 || !inside(rock.x, rock.z)) continue;
      collider.position.set(rock.x, rock.y + rock.s * 0.03, rock.z);
      collider.scale.set(rock.s * 1.1, rock.s * 0.9, rock.s * 1.12);
      collider.rotation.y = rock.rot;
      collider.updateMatrix();
      append(walls, cube, collider.matrix, wallMaterial, 'Collision');
    }
    for (const deck of structures.decks) for (const seg of deck.segs) {
      const { ax, az, ux, uz, l, s0 } = seg;
      if (!inside(ax, az, -l) || !inside(ax + ux * l, az + uz * l, -l)) continue;
      const first = decks.points.length / 19;
      for (const d of [0, l]) for (const side of [-1, 1]) {
        const x = ax + ux * d + uz * side * deck.hw, z = az + uz * d - ux * side * deck.hw;
        add(decks, worldPoint(x, deck.deckY((s0 + d) / deck.len), z), [0, 0, 1], 0, 0, white);
      }
      group(decks, 'Collision').push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
    }

    function within(node, parent) {
      for (let n = node; n; n = n.parent) if (n === parent) return true;
      return false;
    }
    const relative = new THREE.Matrix4(), local = new THREE.Matrix4(), partInv = new THREE.Matrix4();
    const runningGear = [
      [wheels, tank.wheels, 'RoadWheel'], [sprockets, tank.sprockets, 'Sprocket'], [links, tank.links[0], 'TrackLink'],
    ];
    for (const [out, mesh, name] of runningGear) {
      const mat = material(name, mesh.material, { instanced: true });
      append(out, mesh.geometry, new THREE.Matrix4(), mesh.material, mat, { world: false });
    }
    for (const mesh of tank.meshes) {
      if (!mesh.visible || mesh === tank.wheels || mesh === tank.sprockets || tank.links.includes(mesh)) continue;
      const part = within(mesh, tank.gun) ? tank.gun : within(mesh, tank.turret) ? tank.turret : tank.body;
      const out = part === tank.gun ? gun : part === tank.turret ? turret : hull;
      const mat = mesh.material;
      const decal = mesh.userData.decal;
      const armorPaint = mesh.userData.matKey === 'paint';
      const key = decal ? 'Decal_' + mesh.id : armorPaint ? 'TankPaint' :
        mesh.userData.matKey ? 'Tank_' + mesh.userData.matKey : 'Gear_' + mat.id;
      const name = material(key, mat, { masked: !!decal || !!mat.alphaTest, cutoff: decal ? 0.4 : mat.alphaTest || 0.45,
        kind: armorPaint ? 'armor' : 'surface', normal: armorPaint ? 'rusty_metal_02_nor.jpg' : texture(mat.normalMap, key + '_Normal') });
      if (armorPaint) textures.add('rusty_metal_02_nor.jpg');
      relative.copy(partInv.copy(part.matrixWorld).invert()).multiply(mesh.matrixWorld);
      if (mesh.isInstancedMesh) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        append(out, mesh.geometry, local.multiplyMatrices(relative, m), mat, name, { world: false, planar: armorPaint });
      } else append(out, mesh.geometry, relative, mat, name, { world: false, planar: armorPaint });
    }

    const road = map.roads[0].pts;
    const spawn = road.findIndex(([x,z], i) => i > 0 && i + 1 < road.length && x > 95 && inside(x,z,20));
    if (spawn < 1) throw Error('No suitable Normandy road spawn');
    const [sx,sz] = road[spawn], [ex,ez] = road[spawn + 1];
    const yaw = Math.atan2(ex - sx, ez - sz) * 180 / Math.PI;
    const meta = [...worldPoint(sx,terrain.height(sx,sz) + 0.85,sz), yaw,
      ...meter(...tank.turret.position), ...meter(...tank.gun.position), tank.muzzle.position.z * 100];
    const encoder = new TextEncoder();
    const payload = [new ArrayBuffer(76)];
    const header = new DataView(payload[0]);
    header.setUint32(0, sections.length, true);
    meta.forEach((v, i) => header.setFloat32(4 + i * 4, v, true));
    header.setUint32(48, transforms.length / 7, true);
    header.setUint32(52, tank.wheelList.length, true);
    header.setUint32(56, tank.sprocketList.length, true);
    header.setUint32(60, tank.loop.length, true);
    header.setUint32(64, tank.nLinks, true);
    header.setFloat32(68, tank.loopLen * 100, true);
    header.setFloat32(72, Math.abs(tank.links[0].position.x) * 100, true);
    const packWheels = (list) => new Float32Array(list.flatMap(w => [...meter(w.x, w.y, w.z), w.r, w.w]));
    const trackLoop = new Float32Array(tank.loop.flatMap(([z, y]) => [z * 100, y * 100]));
    payload.push(new Float32Array(transforms).buffer,
      packWheels(tank.wheelList).buffer, packWheels(tank.sprocketList).buffer, trackLoop.buffer);
    const stats = {};
    for (const { name, points, groups } of sections) {
      const vertices = points.length / 19;
      const draws = [...groups].filter(([, indices]) => indices.length);
      const total = draws.reduce((sum, [, indices]) => sum + indices.length, 0);
      const headerBytes = 12 + draws.reduce((sum, [slot]) => sum + slot.length + 8, 0);
      const bytes = new ArrayBuffer(headerBytes + vertices * 52 + total * 4);
      const data = new DataView(bytes);
      data.setUint32(0, vertices, true); data.setUint32(4, total, true); data.setUint32(8, draws.length, true);
      let offset = 12;
      for (const [slot, indices] of draws) {
        const id = encoder.encode(slot);
        data.setUint32(offset, id.length, true);
        data.setUint32(offset + 4, indices.length, true);
        new Uint8Array(bytes, offset + 8, id.length).set(id);
        offset += 8 + id.length;
      }
      for (let i = 0; i < vertices; i++, offset += 52) {
        const p = i * 19;
        for (let k = 0; k < 8; k++) {
          if (!Number.isFinite(points[p + k])) throw Error('Non-finite value in ' + name);
          data.setFloat32(offset + k * 4, points[p + k], true);
        }
        for (let k = 8; k < 16; k++) data.setUint8(offset + 32 + k - 8, Math.round(clamp(points[p + k], 0, 1) * 255));
        for (let k = 16; k < 19; k++) data.setFloat32(offset + 40 + (k - 16) * 4, points[p + k], true);
      }
      for (const [, indices] of draws) for (const idx of indices) {
        if (idx >= vertices) throw Error('Invalid index in ' + name);
        data.setUint32(offset, idx, true);
        offset += 4;
      }
      stats[name] = { vertices, triangles: total / 3, materials: draws.length };
      payload.push(bytes);
    }
    const raw = new Blob(payload);
    const packed = await new Response(raw.stream().pipeThrough(new CompressionStream('deflate'))).blob();
    for (let offset = 0; offset < packed.size; offset += 524288) {
      const bytes = new Uint8Array(await packed.slice(offset, offset + 524288).arrayBuffer());
      let text = '';
      for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await window.assetChunk(btoa(text));
    }
    for (const { name, image } of generated.values()) await window.saveTexture(name, image.toDataURL().split(',')[1]);
    return { rawBytes: raw.size, stats, grassInstances: transforms.length / 7,
      textures: [...textures].sort(), materials: [...catalog.values()] };
  });

  const header = Buffer.alloc(8);
  header.write('SFM3');
  header.writeUInt32LE(materials.rawBytes, 4);
  await writeFile(new URL('Normandy.sfbin', content), Buffer.concat([header, ...base64]));
  for (const name of materials.textures) await copyFile(new URL('public/tex/' + name, root), new URL(name, art));
  await writeFile(new URL('NormandyMaterials.json', art), JSON.stringify(materials, null, 2) + '\n');
  console.table(materials.stats);
  console.log('Grass clumps:', materials.grassInstances, 'Uncompressed mesh payload:', materials.rawBytes);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
