// Rebuild the three rear-turret exteriors in the existing web assets.
// Positions are relative to the turret pivot in metres, with +Z forward.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, Float32BufferAttribute,
  Quaternion, ShapeUtils, Vector2, Vector3 } from 'three';

const revision = '2026-11-rear-turrets';
const vertical = new Vector3(0, 1, 0);

function mirrored(half) {
  return [...half, ...half.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
}

function ring(plan, width, length, height, shift = 0, rake = 0) {
  return plan.map(([x, z]) => [x * width, height + z * rake, z * length + shift]);
}

function loft(rings, smooth = false) {
  const positions = [], indices = [];
  const size = rings[0].length;
  for (const row of rings) for (const point of row) positions.push(...point);
  for (let i = 1; i < rings.length; i++) for (let j = 0; j < size; j++) {
    const a = (i - 1) * size + j, b = (i - 1) * size + (j + 1) % size;
    indices.push(a, b, b + size, a, b + size, a + size);
  }
  for (const [side, row] of [rings[0], rings.at(-1)].entries()) {
    const start = positions.length / 3;
    for (const point of row) positions.push(...point);
    const triangles = ShapeUtils.triangulateShape(row.map(([x, , z]) => new Vector2(x, z)), []);
    for (const [a, b, c] of triangles) {
      const [ax, , az] = row[a], [bx, , bz] = row[b], [cx, , cz] = row[c];
      const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
      indices.push(start + a, start + (up === Boolean(side) ? b : c), start + (up === Boolean(side) ? c : b));
    }
  }
  const g = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  const result = smooth ? g : g.toNonIndexed();
  result.computeVertexNormals();
  return result;
}

// Chamfer and taper a panel around its own centre, preserving a narrow bevel.
function plate(plan, low, high, inset = 0.13, rake = 0) {
  let cx = 0, cz = 0;
  for (const [x, z] of plan) { cx += x / plan.length; cz += z / plan.length; }
  const lift = (y, scale) => plan.map(([x, z]) =>
    [cx + (x - cx) * scale, y + (z - cz) * rake, cz + (z - cz) * scale]);
  const edge = Math.min(0.045, (high - low) / 3);
  return loft([lift(low, 1 - inset), lift(low + edge, 1), lift(high - edge, 1), lift(high, 1 - inset)]);
}

function plateOutline(x, z, w, l, chamfer) {
  const dx = w / 2, dz = l / 2, c = chamfer;
  return [[x - dx + c, z + dz], [x + dx - c, z + dz], [x + dx, z + dz - c],
    [x + dx, z - dz + c], [x + dx - c, z - dz], [x - dx + c, z - dz],
    [x - dx, z - dz + c], [x - dx, z + dz - c]];
}

class Turret {
  parts = [];
  add(material, geometry, tint = 1) { this.parts.push({ material, geometry, tint }); }
  plate(material, plan, low, high, inset, rake, tint) {
    this.add(material, plate(plan, low, high, inset, rake), tint);
  }
  box(material, [x, y, z], [w, h, l], yaw = 0, tint = 1) {
    this.add(material, new BoxGeometry(w, h, l).rotateY(yaw).translate(x, y, z), tint);
  }
  round(material, centre, radius, depth, {
    direction = vertical, top = radius, segments = 16, tint = 1,
  } = {}) {
    const rotation = new Quaternion().setFromUnitVectors(vertical, direction);
    this.add(material, new CylinderGeometry(top, radius, depth, segments).applyQuaternion(rotation)
      .translate(...centre), tint);
  }
  rail(material, start, end, radius = 0.018, segments = 7) {
    const a = new Vector3(...start), b = new Vector3(...end), direction = b.clone().sub(a);
    this.round(material, a.lerp(b, 0.5).toArray(), radius, direction.length(),
      { direction: direction.normalize(), segments });
  }
  grip(x, y, z, width = 0.19) {
    const a = x - width / 2, b = x + width / 2;
    this.rail('steel', [a, y, z], [a, y + 0.055, z], 0.015);
    this.rail('steel', [b, y, z], [b, y + 0.055, z], 0.015);
    this.rail('steel', [a, y + 0.055, z], [b, y + 0.055, z], 0.015);
  }
  whip(x, y, z, height, bend) {
    this.round('dark', [x, y + 0.027, z], 0.069, 0.054);
    this.round('steel', [x, y + 0.083, z], 0.037, 0.097, { top: 0.023 });
    this.rail('dark', [x, y + 0.125, z], [x + bend, y + height, z - 0.13], 0.009, 5);
    this.rail('steel', [x + bend * 0.46, y + height * 0.52, z - 0.063],
      [x + bend, y + height, z - 0.13], 0.005, 5);
  }
  hatch(x, y, z, radius) {
    this.round('dark', [x, y + 0.023, z], radius + 0.031, 0.052, { segments: 22 });
    this.round('paint', [x, y + 0.071, z], radius, 0.072, { top: radius * 0.91, segments: 22 });
    this.grip(x, y + 0.106, z + radius * 0.14);
    for (const side of [-1, 1]) {
      this.box('fitting', [x + side * radius * 0.58, y + 0.077, z - radius * 0.84], [0.102, 0.076, 0.15]);
      this.rail('steel', [x + side * radius * 0.58 - 0.06, y + 0.105, z - radius * 0.84],
        [x + side * radius * 0.58 + 0.06, y + 0.105, z - radius * 0.84], 0.026);
    }
  }
  optic(x, y, z, w, h, l, yaw = 0) {
    const roof = plateOutline(0, 0, w, l, Math.min(0.048, w * 0.17));
    const depth = (l / 2) + 0.004;
    this.add('fitting', plate(roof, 0, h, 0.20).rotateY(yaw).translate(x, y, z));
    const face = (offsetX, offsetY, offsetZ) =>
      [x + offsetX * Math.cos(yaw) + offsetZ * Math.sin(yaw), y + offsetY,
        z - offsetX * Math.sin(yaw) + offsetZ * Math.cos(yaw)];
    this.box('dark', face(0, h * 0.52, depth - 0.005), [w * 0.83, h * 0.61, 0.026], yaw);
    this.box('glass', face(-w * 0.093, h * 0.53, depth + 0.008), [w * 0.50, h * 0.42, 0.019], yaw);
    this.box('glass', face(w * 0.279, h * 0.52, depth + 0.006), [w * 0.135, h * 0.32, 0.015], yaw, 0.68);
    this.box('steel', face(0, h * 0.83, depth + 0.014), [w * 0.84, h * 0.12, 0.042], yaw);
  }
}

function atlas() {
  const t = new Turret();
  const outline = mirrored([[0, 1.43], [0.57, 1.43], [1.10, 1.23], [1.46, 0.79],
    [1.51, 0.22], [1.39, -0.42], [1.12, -1.03], [0.65, -1.40], [0, -1.52]]);
  const cast = new CatmullRomCurve3(outline.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
  const plan = cast.getPoints(40).slice(0, -1).map(({ x, z }) => [x, z]);
  t.add('dark', loft([ring(plan, 0.74, 0.84, 0.013), ring(plan, 0.85, 0.93, 0.108)], true));
  t.add('paint', loft([
    ring(plan, 0.81, 0.89, 0.070), ring(plan, 0.95, 0.96, 0.175, 0, 0.012),
    ring(plan, 1, 1, 0.408, 0.014, 0.008), ring(plan, 0.94, 0.89, 0.699, -0.078, -0.02),
    ring(plan, 0.81, 0.77, 0.906, -0.108, -0.068),
    ring(plan, 0.64, 0.63, 1.012, -0.141, -0.068),
    ring(plan, 0.50, 0.55, 1.035, -0.163, -0.068),
  ], true));
  // A raised offset hatch and an optical cupola break up the crown.
  t.round('paint', [-0.50, 1.041, -0.27], 0.35, 0.17, { top: 0.30, segments: 24 });
  for (const yaw of [-1.22, -0.61, 0, 0.61, 1.22]) {
    const x = -0.50 + Math.sin(yaw) * 0.282, z = -0.27 + Math.cos(yaw) * 0.282;
    t.box('dark', [x, 1.115, z], [0.129, 0.077, 0.035], yaw);
    t.box('glass', [x + Math.sin(yaw) * 0.022, 1.119, z + Math.cos(yaw) * 0.022], [0.094, 0.036, 0.012], yaw);
  }
  t.hatch(-0.50, 1.12, -0.27, 0.275);
  t.hatch(0.51, 0.998, -0.08, 0.295);
  t.optic(0.49, 0.906, 0.52, 0.35, 0.184, 0.32, 0.16);
  t.whip(-0.53, 0.973, -0.93, 0.95, -0.11);
  t.whip(0.57, 0.938, -0.89, 0.68, 0.045);
  for (const s of [-1, 1]) {
    const shoulder = s === 1
      ? [[0.64, 1.46], [1.02, 1.39], [1.34, 1.14], [1.42, 0.72], [1.29, 0.51], [0.82, 0.76]]
      : [[-0.82, 0.76], [-1.29, 0.51], [-1.42, 0.72], [-1.34, 1.14], [-1.02, 1.39], [-0.64, 1.46]];
    t.plate('paint', shoulder, 0.26, 0.68, 0.22, -0.14, 0.89);
    const outward = new Vector3(s, 0, 0);
    t.round('dark', [s * 1.438, 0.557, -0.17], 0.231, 0.094, { direction: outward, segments: 20 });
    t.round('fitting', [s * 1.493, 0.557, -0.17], 0.202, 0.063, { direction: outward, top: 0.177, segments: 20 });
    t.rail('steel', [s * 1.531, 0.51, -0.24], [s * 1.531, 0.60, -0.102], 0.022);
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI * i / 3;
      t.round('steel', [s * 1.523, 0.557 + Math.sin(angle) * 0.164, -0.17 + Math.cos(angle) * 0.164],
        0.017, 0.018, { direction: outward, segments: 6 });
    }
    const bars = [[s * 1.41, 0.23, 0.81], [s * 1.52, 0.26, 0.41], [s * 1.56, 0.28, -0.07],
      [s * 1.47, 0.31, -0.52], [s * 1.29, 0.37, -0.88]];
    for (let i = 1; i < bars.length; i++) t.rail('steel', bars[i - 1], bars[i], 0.027);
    for (const [x, y, z] of bars.slice(1, -1)) t.box('dark', [x * 0.98, y - 0.002, z], [0.110, 0.097, 0.16], 0, 0.86);
  }
  // The open basket follows the curved rear shoulder.
  const basket = [[-1.19, -1.16], [-1.12, -1.56], [-0.73, -1.86], [-0.36, -1.98],
    [0.36, -1.98], [0.73, -1.86], [1.12, -1.56], [1.19, -1.16]];
  for (const [i, [x, z]] of basket.entries()) {
    t.rail('steel', [x, 0.49, z], [x, 0.81, z], 0.022);
    t.rail('steel', [x, 0.51, z], [x * 0.84, 0.43, z + 0.41], 0.018);
    if (!i) continue;
    const [px, pz] = basket[i - 1];
    for (const y of [0.50, 0.63, 0.81]) t.rail('steel', [px, y, pz], [x, y, z], 0.022);
    for (const k of [0.28, 0.58, 0.81])
      t.rail('dark', [px + (x - px) * k, 0.50, pz + (z - pz) * k],
        [px + (x - px) * k, 0.80, pz + (z - pz) * k], 0.010);
  }
  t.round('canvas', [0.02, 0.635, -1.63], 0.143, 1.23, { direction: new Vector3(1, 0, 0), segments: 14 });
  for (const x of [-0.37, 0.37]) t.round('dark', [x, 0.634, -1.63], 0.15, 0.039, { direction: new Vector3(1, 0, 0) });
  return t;
}

function basilisk() {
  const t = new Turret();
  const plan = mirrored([[0, 1.43], [0.58, 1.53], [0.93, 1.67], [1.39, 1.03], [1.56, 0.35],
    [1.38, -0.56], [1.21, -1.19], [0.74, -1.71], [0, -1.74]]);
  t.add('dark', loft([ring(plan, 0.79, 0.85, 0.02), ring(plan, 0.89, 0.93, 0.24)]));
  t.add('paint', loft([
    ring(plan, 0.89, 0.91, 0.20, -0.01, -0.023), ring(plan, 0.98, 1, 0.45, 0.01, -0.053),
    ring(plan, 0.87, 0.94, 0.68, -0.07, -0.088), ring(plan, 0.72, 0.86, 0.82, -0.12, -0.084),
    ring(plan, 0.67, 0.81, 0.84, -0.13, -0.084),
  ]));
  for (const side of [-1, 1]) {
    const panel = (points, y0, y1, inset, slope, mat = 'paint', tint = 1) => {
      const outline = points.map(([x, z]) => [x * side, z]);
      if (side < 0) outline.reverse();
      t.plate(mat, outline, y0, y1, inset, slope, tint);
    };
    // Split forward wedge and swept external cheeks with a shadow gap between layers.
    panel([[0.54, 1.55], [0.97, 1.76], [1.43, 1.37], [1.72, 0.49], [1.48, -0.04], [0.88, 0.31]],
      0.27, 0.465, 0.18, -0.10, 'paint', 0.68);
    panel([[0.56, 1.54], [0.96, 1.71], [1.41, 1.34], [1.68, 0.50], [1.43, 0.03], [0.89, 0.34]],
      0.46, 0.55, 0.06, -0.10, 'dark');
    panel([[0.55, 1.60], [0.95, 1.77], [1.43, 1.36], [1.69, 0.53], [1.40, 0.20], [0.83, 0.47]],
      0.54, 0.72, 0.24, -0.10);
    panel([[0.90, 0.36], [1.58, 0.27], [1.52, -0.62], [1.34, -1.16], [1.04, -0.88]],
      0.39, 0.66, 0.20, -0.083, 'fitting', 0.88);
    t.rail('steel', [side * 1.52, 0.57, 0.26], [side * 1.39, 0.67, -0.80], 0.021);
    for (let i = 0; i < 5; i++) {
      const z = 0.24 - i * 0.20, x = side * (1.577 - i * 0.031), y = 0.512 + i * 0.019;
      t.rail('dark', [x, y - 0.066, z - 0.054], [x - side * 0.018, y + 0.061, z + 0.058], 0.035);
      t.rail('steel', [x + side * 0.012, y + 0.001, z - 0.092],
        [x - side * 0.008, y + 0.093, z + 0.022], 0.015);
    }
    const rimAxis = new Vector3(side * 0.87, 0, 0.49).normalize();
    for (const [x, z] of [[1.44, 1.24], [1.58, 0.98], [1.67, 0.68]]) {
      t.round('steel', [side * x, 0.47, z], 0.034, 0.027, { direction: rimAxis, segments: 8 });
    }
    t.grip(side * 0.85, 0.882, -0.48, 0.23);
  }
  t.plate('fitting', plateOutline(0.36, -0.02, 0.70, 0.67, 0.17), 0.81, 0.91, 0.10, -0.085);
  t.grip(0.36, 0.91, 0.05, 0.25);
  t.hatch(-0.44, 0.893, -0.44, 0.30);
  t.optic(-0.53, 0.763, 0.75, 0.37, 0.206, 0.35, -0.22);
  t.optic(0.49, 0.746, 0.66, 0.32, 0.126, 0.31, 0.26);
  t.whip(0.59, 0.953, -1.01, 0.77, 0.11);
  t.plate('dark', plateOutline(0, -1.71, 1.34, 0.56, 0.15), 0.42, 0.80, 0.15, 0.16);
  for (const side of [-1, 1]) {
    t.plate('paint', plateOutline(side * 0.41, -1.65, 0.69, 0.70, 0.13), 0.65, 0.845, 0.17, 0.17);
    t.grip(side * 0.42, 0.84, -1.74, 0.20);
    for (let i = 0; i < 5; i++) {
      const x = side * (0.19 + i * 0.097);
      t.rail('steel', [x, 0.51, -2.001], [x + side * 0.026, 0.723, -1.956], 0.019);
    }
    t.box('mark', [side * 0.71, 0.588, -1.955], [0.103, 0.049, 0.012], side * 0.51);
  }
  return t;
}

const expansion = {
  paint: 'Armor · painted plate', fitting: 'Fittings · painted alloy', dark: 'Recess · shadowed steel',
  steel: 'Weld and forged hardware', glass: 'Optics · anti-reflective coating',
};
const designs = {
  atlas: [atlas, { ...expansion, canvas: 'Canvas · weathered' }],
  basilisk: [basilisk, { ...expansion, mark: 'Hatch release marking' }],

};

function parseGlb(file) {
  const length = file.readUInt32LE(12);
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  return { gltf: JSON.parse(file.subarray(20, 20 + length)), bytes: file.subarray(28 + length) };
}

function serializeGlb(gltf, bytes) {
  const metadata = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.concat([metadata, Buffer.alloc((4 - metadata.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(20), binary = Buffer.alloc(8);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + bytes.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write('JSON', 16);
  binary.writeUInt32LE(bytes.length);
  binary.write('BIN\0', 4);
  return Buffer.concat([header, json, binary, bytes]);
}

// Keep the hull and the animated nodes byte-for-byte, including their compressed data.
// Remove only discarded turret nodes and the buffers that became unreachable.
function compactAsset(gltf, bytes) {
  assert.ok(!gltf.animations?.length && !gltf.skins?.length);
  const accessors = new Set(), nodes = new Set(), meshes = new Set(), views = new Set();
  function visit(i) {
    if (nodes.has(i)) return;
    nodes.add(i);
    const node = gltf.nodes[i];
    if (node.mesh !== undefined) meshes.add(node.mesh);
    for (const index of Object.values(node.extensions?.EXT_mesh_gpu_instancing?.attributes ?? {})) accessors.add(index);
    for (const index of node.children ?? []) visit(index);
  }
  for (const scene of gltf.scenes) for (const index of scene.nodes) visit(index);
  for (const index of meshes) for (const part of gltf.meshes[index].primitives) {
    for (const attribute of Object.values(part.attributes)) accessors.add(attribute);
    assert.ok(!part.targets?.length);
    if (part.indices !== undefined) accessors.add(part.indices);
  }
  for (const index of accessors) {
    const a = gltf.accessors[index];
    assert.ok(!a.sparse);
    views.add(a.bufferView);
  }
  for (const image of gltf.images) if (image.bufferView !== undefined) views.add(image.bufferView);
  function retain(table, use) {
    const indices = new Map();
    gltf[table] = gltf[table].filter((_, index) => {
      if (use.has(index)) indices.set(index, indices.size);
      return use.has(index);
    });
    return index => indices.get(index);
  }
  const nodeId = retain('nodes', nodes), meshId = retain('meshes', meshes),
    accessorId = retain('accessors', accessors), viewId = retain('bufferViews', views);
  for (const scene of gltf.scenes) scene.nodes = scene.nodes.map(nodeId);
  for (const node of gltf.nodes) {
    if (node.children) node.children = node.children.map(nodeId);
    if (node.mesh !== undefined) node.mesh = meshId(node.mesh);
    const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    if (attributes) for (const key of Object.keys(attributes)) attributes[key] = accessorId(attributes[key]);
  }
  for (const mesh of gltf.meshes) for (const part of mesh.primitives) {
    for (const key of Object.keys(part.attributes)) part.attributes[key] = accessorId(part.attributes[key]);
    if (part.indices !== undefined) part.indices = accessorId(part.indices);
  }
  for (const a of gltf.accessors) a.bufferView = viewId(a.bufferView);
  for (const image of gltf.images) if (image.bufferView !== undefined) image.bufferView = viewId(image.bufferView);
  const chunks = [];
  let size = 0;
  const copy = item => {
    if (item.buffer !== 0) return;
    const start = item.byteOffset || 0;
    assert.ok(start + item.byteLength <= bytes.length);
    item.byteOffset = size;
    const chunk = bytes.subarray(start, start + item.byteLength);
    const padding = Buffer.alloc((4 - chunk.length % 4) % 4);
    chunks.push(chunk, padding);
    size += chunk.length + padding.length;
  };
  for (const view of gltf.bufferViews) {
    copy(view);
    if (view.extensions?.EXT_meshopt_compression) copy(view.extensions.EXT_meshopt_compression);
  }
  gltf.buffers[0].byteLength = size;
  return Buffer.concat(chunks, size);
}

function appendParts(gltf, existing, parts, palette, name) {
  const batches = new Map();
  for (const { material, geometry, tint } of parts) {
    const index = gltf.materials.findIndex(m => m.name === palette[material]);
    assert.ok(index >= 0, palette[material]);
    let batch = batches.get(index);
    if (!batch) {
      batch = { positions: [], normals: [], uv: [], color: [], indices: [], vertices: new Map() };
      batches.set(index, batch);
    }
    const pos = geometry.getAttribute('position'), norm = geometry.getAttribute('normal');
    const remap = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = norm.getX(i), ny = norm.getY(i), nz = norm.getZ(i);
      const shade = Math.round(255 * tint * (0.972 + 0.028 * Math.sin(3.5 * x + 2.7 * y - 4 * z)));
      const key = [x, y, z, nx, ny, nz, shade].map(value => Math.round(value * 1e6)).join(',');
      if (batch.vertices.has(key)) {
        remap[i] = batch.vertices.get(key);
        continue;
      }
      remap[i] = batch.positions.length / 3;
      batch.vertices.set(key, remap[i]);
      batch.positions.push(x, y, z);
      batch.normals.push(nx, ny, nz);
      // Project the existing weathered paint maps at a consistent surface scale.
      const deck = Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz));
      const wing = Math.abs(nx) > Math.abs(nz);
      batch.uv.push((deck || !wing ? x : z) * 0.42 + 0.50, (deck ? z : y) * 0.42 + 0.37);
      batch.color.push(shade, shade, shade, 255);
    }
    if (geometry.index) for (const i of geometry.index.array) batch.indices.push(remap[i]);
    else batch.indices.push(...remap);
    geometry.dispose();
  }
  const chunks = [existing];
  let offset = existing.length;
  function push(array, type, componentType, target, normalized) {
    const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = Buffer.alloc((4 - buffer.length % 4) % 4);
    const bufferView = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length, target });
    chunks.push(buffer, padding);
    offset += buffer.length + padding.length;
    const count = array.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type]);
    assert.ok(Number.isInteger(count) && count > 0);
    const accessor = { bufferView, type, componentType, count };
    if (normalized) accessor.normalized = true;
    return gltf.accessors.push(accessor) - 1;
  }
  const primitives = [];
  for (const [material, batch] of batches) {
    assert.ok(batch.positions.length / 3 < 65536);
    const position = push(new Float32Array(batch.positions), 'VEC3', 5126, 34962);
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < batch.positions.length; i++) {
      const axis = i % 3, value = batch.positions[i];
      bounds.min[axis] = Math.min(bounds.min[axis], value);
      bounds.max[axis] = Math.max(bounds.max[axis], value);
    }
    Object.assign(gltf.accessors[position], bounds);
    const attributes = {
      POSITION: position,
      NORMAL: push(new Float32Array(batch.normals), 'VEC3', 5126, 34962),
      TEXCOORD_0: push(new Float32Array(batch.uv), 'VEC2', 5126, 34962),
      COLOR_0: push(new Uint8Array(batch.color), 'VEC4', 5121, 34962, true),
    };
    const indices = push(new Uint16Array(batch.indices), 'SCALAR', 5123, 34963);
    primitives.push({ material, attributes, indices });
  }
  const mesh = gltf.meshes.push({ name, primitives }) - 1;
  return { mesh, bytes: Buffer.concat(chunks, offset) };
}

function appendTurret(gltf, existing, id) {
  const [build, palette] = designs[id];
  const turret = gltf.nodes.find(n => n.name === 'TURRET_PIVOT');
  const gun = turret.children.find(i => /^(gun|GUN_PIVOT)$/.test(gltf.nodes[i].name));
  assert.notEqual(gun, undefined, id);
  const parts = build().parts;
  const { mesh, bytes } = appendParts(gltf, existing, parts, palette, id + ' shaped turret');
  const exterior = gltf.nodes.push({ name: id + ' turret exterior', mesh,
    extras: { turretExterior: id, turretDetailParts: parts.length } }) - 1;
  turret.children = [gun, exterior];
  turret.extras = { ...turret.extras, turretExteriorRevision: revision };
  return compactAsset(gltf, bytes);
}

export { Turret as ModelParts, appendParts, parseGlb, serializeGlb, compactAsset, loft, ring, mirrored, plate, plateOutline };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const id of ['atlas', 'basilisk']) {
    const file = new URL(`public/models/armour-expansion/${id}.glb`, import.meta.url);
    const input = await readFile(file);
    const { gltf, bytes } = parseGlb(input);
    const output = appendTurret(gltf, bytes, id);
    const glb = serializeGlb(gltf, output);
    await writeFile(file, glb);
    console.log(id, input.length, '→', glb.length, 'bytes');
  }
}
