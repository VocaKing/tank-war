import assert from 'node:assert/strict';
import { coarseTerrainIndices, updateTerrainLOD } from './src/world/terrainLod.js';
import { renderPixelRatio } from './src/render/pixelRatio.js';

for (const [width, height] of [[101, 101], [51, 51], [23, 21], [3, 9]]) {
  const indices = coarseTerrainIndices(width, height, 4);
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3);
    const x = n => n % width, z = n => Math.floor(n / width);
    const normal = (z(b) - z(a)) * (x(c) - x(a)) - (x(b) - x(a)) * (z(c) - z(a));
    assert.ok(normal > 0, 'Triangles must be nondegenerate and face up');
    for (const [u, v] of [[a,b], [b,c], [c,a]]) {
      const key = u < v ? u + ':' + v : v + ':' + u;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const border = new Set();
  for (let x = 0; x < width - 1; x++) {
    const i = x + (height - 1) * width;
    border.add(x + ':' + (x + 1)); border.add(i + ':' + (i + 1));
  }
  for (let z = 0; z < height - 1; z++) {
    const i = z * width, j = i + width - 1;
    border.add(i + ':' + (i + width)); border.add(j + ':' + (j + width));
  }
  assert.deepEqual(new Set([...edges].filter(([, count]) => count === 1).map(([edge]) => edge)), border);
  assert.ok([...edges.values()].every(count => count <= 2));
}

const tile = { minX: 240, maxX: 440, minZ: -100, maxZ: 100, maxY: 30, near: { visible: true }, far: { visible: false } };
const camera = { position: { x: 0, y: 10, z: 0 }, projectionMatrix: { elements: Array(6).fill(Math.sqrt(3)) } };
updateTerrainLOD([tile], camera, 110);
assert.equal(tile.far.visible, true);
camera.projectionMatrix.elements[5] *= 4;
updateTerrainLOD([tile], camera, 110);
assert.equal(tile.near.visible, true);
assert.equal(tile.far.visible, false);

assert.equal(renderPixelRatio('high', 1920, 1080, 1, false), 1);
assert.ok(renderPixelRatio('high', 3840, 2160, 2, false) < 1);
assert.equal(renderPixelRatio('low', 390, 844, 3, true), 0.85);
console.log('Terrain boundary, scope LOD, and render resolution checks passed.');
