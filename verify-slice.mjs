import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const sections = ['Terrain', 'Buildings', 'Water', 'Hull', 'Turret', 'Gun', 'Foliage', 'Walls', 'Decks',
  'Grass', 'Pebbles', 'Horizon', 'RoadWheel', 'Sprocket', 'TrackLink'];
const art = new URL('ArtSource/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('NormandyMaterials.json', art), 'utf8'));
const specs = new Map(manifest.materials.map(spec => [spec.name.toLowerCase(), spec]));
assert.equal(specs.size, manifest.materials.length);
for (const spec of manifest.materials) {
  for (const surface of [spec, ...(spec.layers ?? [])]) {
    for (const name of ['diffuse', 'normal', 'roughMap', 'arm']) {
      if (surface[name]) await access(new URL(surface[name], art));
    }
  }
}
assert.equal(specs.get('normandyground').layers.length, 4);
assert.ok([...specs.values()].some(spec => spec.kind === 'leaf' && spec.masked));
assert.ok([...specs.values()].some(spec => spec.name.startsWith('Decal_') && spec.masked));

const packed = await readFile(new URL('Content/Prototype/Normandy.sfbin', import.meta.url));
assert.equal(packed.toString('ascii', 0, 4), 'SFM3');
const totalBytes = packed.readUInt32LE(4);
assert.ok(totalBytes <= 200 * 1024 * 1024);
const file = inflateSync(packed.subarray(8), { maxOutputLength: totalBytes });
assert.equal(file.length, totalBytes);
assert.equal(file.length, manifest.rawBytes);
assert.equal(file.readUInt32LE(0), sections.length);
const metadata = Array.from({ length: 11 }, (_, i) => file.readFloatLE(4 + i * 4));
assert.ok(metadata.every(Number.isFinite));
assert.ok(metadata[10] > 100 && metadata[10] < 600);
const grass = file.readUInt32LE(48), wheels = file.readUInt32LE(52), sprockets = file.readUInt32LE(56);
const samples = file.readUInt32LE(60), links = file.readUInt32LE(64);
const pathLength = file.readFloatLE(68), trackOffset = file.readFloatLE(72);
assert.equal(grass, manifest.grassInstances);
assert.ok(grass > 100000 && grass <= 300000);
assert.ok(wheels >= 12 && wheels <= 80 && sprockets === 2);
assert.ok(samples >= 40 && samples <= 2048 && links >= 65 && links <= 256);
assert.ok(pathLength > 1000 && pathLength < 2000 && trackOffset > 70 && trackOffset < 165);

let cursor = 76;
const readFloats = (n) => {
  const out = [];
  for (let i = 0; i < n; i++, cursor += 4) {
    const number = file.readFloatLE(cursor);
    assert.ok(Number.isFinite(number));
    out.push(number);
  }
  return out;
};
for (let i = 0; i < grass; i++) {
  const [x, y, , , sx, sy, sz] = readFloats(7);
  assert.ok(Math.abs(x) <= 24000 && Math.abs(y) <= 24000 && sx > 0 && sy > 0 && sz > 0);
}
for (let i = 0; i < wheels + sprockets; i++) {
  const [x, y, z, radius, width] = readFloats(5);
  assert.ok(Math.abs(x) < 400 && Math.abs(y) < 170 && z >= 0);
  assert.ok(radius > 0.05 && radius < 0.8 && width > 0.04 && width < 0.65);
}
const loop = Array.from({ length: samples }, () => readFloats(2));
for (let i = 0; i < samples; i++) {
  const a = loop[i], b = loop[(i + 1) % samples];
  const chord = Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert.ok(chord > 2 && chord < pathLength / samples + 0.1);
}

for (const section of sections) {
  const vertices = file.readUInt32LE(cursor), indices = file.readUInt32LE(cursor + 4), groups = file.readUInt32LE(cursor + 8);
  cursor += 12;
  assert.deepEqual({ vertices, triangles: indices / 3, materials: groups }, manifest.stats[section]);
  assert.ok(vertices > 0 && vertices <= 2000000 && indices > 0 && indices <= 6000000 && groups > 0 && groups <= 128);
  let drawIndices = 0;
  const names = new Set();
  for (let i = 0; i < groups; i++) {
    const len = file.readUInt32LE(cursor), count = file.readUInt32LE(cursor + 4);
    cursor += 8;
    assert.ok(len >= 1 && len <= 80 && count >= 3 && count % 3 === 0);
    const name = file.toString('ascii', cursor, cursor + len).toLowerCase();
    assert.ok(specs.has(name) || (name === 'collision' && ['Walls', 'Decks'].includes(section)), name);
    assert.ok(!names.has(name), name);
    names.add(name);
    cursor += len;
    drawIndices += count;
  }
  assert.equal(drawIndices, indices);
  assert.ok(cursor + vertices * 52 + indices * 4 <= file.length);
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  let grassBlend = 0, roadBlend = 0;
  for (let vertex = 0; vertex < vertices; vertex++, cursor += 52) {
    for (const offset of [0, 4, 8, 12, 16, 20, 24, 28, 40, 44, 48]) {
      const value = file.readFloatLE(cursor + offset);
      assert.ok(Number.isFinite(value), section);
      if (offset <= 4) {
        min[offset / 4] = Math.min(min[offset / 4], value);
        max[offset / 4] = Math.max(max[offset / 4], value);
      }
    }
    if (section === 'Terrain' || section === 'Horizon') {
      const blend = file.subarray(cursor + 32, cursor + 36);
      assert.ok(Math.abs(blend[0] + blend[1] + blend[2] + blend[3] - 255) <= 3, section);
      if (blend[0] > 200) grassBlend++;
      if (blend[3] > 200) roadBlend++;
    }
  }
  for (let i = 0; i < indices; i++, cursor += 4) assert.ok(file.readUInt32LE(cursor) < vertices);
  if (section === 'Terrain') {
    assert.deepEqual(max.map((bound, i) => bound - min[i]), [48000, 48000]);
    for (let i = 0; i < 2; i++) assert.ok(metadata[i] > min[i] && metadata[i] < max[i]);
    assert.ok(grassBlend > 1000 && roadBlend > 500);
  }
  if (section === 'Foliage') assert.ok(groups >= 8 && vertices > 500000);
  if (section === 'Buildings') assert.ok(groups >= 10);
}
assert.equal(cursor, file.length);
console.table(manifest.stats);
console.log(`Verified ${grass} grass placements, ${links * 2} links, ${wheels + sprockets} rolling assemblies, ${manifest.materials.length} materials.`);
