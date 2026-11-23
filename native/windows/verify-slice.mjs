import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const names = ['Terrain', 'Buildings', 'Water', 'Hull', 'Turret', 'Gun', 'Foliage', 'Walls', 'Decks'];
const file = await readFile(new URL('Content/Prototype/Normandy.sfbin', import.meta.url));
assert.ok(file.length > 52 && file.length <= 64 * 1024 * 1024);
assert.equal(file.toString('ascii', 0, 4), 'SFM2');
assert.equal(file.readUInt32LE(4), names.length);
const metadata = Array.from({ length: 11 }, (_, i) => file.readFloatLE(8 + i * 4));
assert.ok(metadata.every(Number.isFinite));
assert.ok(metadata[10] > 100 && metadata[10] < 600, 'barrel length is in centimetres');

let cursor = 52;
const report = [];
for (const name of names) {
  const vertices = file.readUInt32LE(cursor), indices = file.readUInt32LE(cursor + 4);
  cursor += 8;
  assert.ok(vertices > 0 && vertices <= 750_000);
  assert.ok(indices >= 3 && indices <= 2_250_000 && indices % 3 === 0);
  assert.ok(cursor + vertices * 28 + indices * 4 <= file.length);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < vertices; vertex++, cursor += 28) {
    for (let axis = 0; axis < 3; axis++) {
      const position = file.readFloatLE(cursor + axis * 4), normal = file.readFloatLE(cursor + 12 + axis * 4);
      assert.ok(Number.isFinite(position) && Number.isFinite(normal), name);
      min[axis] = Math.min(min[axis], position);
      max[axis] = Math.max(max[axis], position);
    }
    assert.equal(file[cursor + 27], 255, name);
  }
  for (let index = 0; index < indices; index++, cursor += 4) {
    assert.ok(file.readUInt32LE(cursor) < vertices, name);
  }
  report.push({ name, vertices, triangles: indices / 3 });
  if (name === 'Terrain') {
    assert.ok(max[0] - min[0] >= 35_000 && max[1] - min[1] >= 35_000);
    for (let axis = 0; axis < 2; axis++) assert.ok(metadata[axis] > min[axis] && metadata[axis] < max[axis]);
  }
}
assert.equal(cursor, file.length);
console.table(report);
console.log('Normandy asset payload verified.');
