import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrackMarks } from './src/render/trackMarks.js';

let flooded = false;
const world = {
  def: { id: 'forest' },
  scene: new THREE.Scene(),
  terrain: { height: () => 0, occAt: () => 0, waterLevel: () => flooded ? 1 : -Infinity },
  deckAt: () => -Infinity,
};
const tank = {
  alive: true, isPlayer: false, pos: new THREE.Vector3(), heading: 0,
  spec: { dims: { W: 3, trackW: 0.6 } }, model: { root: { visible: true } },
};
const marks = new TrackMarks(world, [tank], 'low');
const step = (time, z) => { tank.pos.z = z; marks.update(time, tank.pos); };
step(0, 0);
step(0.1, 1);
assert.equal(marks.geometry.drawRange.count, 12);
const p = marks.positions.array;
assert.ok((p[8] - p[2]) * (p[3] - p[0]) > 0, 'Ground-facing winding must look up');

step(0.2, 30);
assert.equal(marks.count, 2, 'Teleport should break the trail');
flooded = true;
step(0.3, 31);
assert.equal(marks.count, 2, 'Submerged terrain should have no new marks');
flooded = false;
tank.model.root.visible = false;
step(0.4, 32);
assert.equal(marks.count, 2, 'Hidden enemy should have no new marks');
step(40, 32);
assert.equal(marks.mesh.visible, false);

tank.model.root.visible = true;
for (let i = 0; i <= marks.capacity; i++) step(41 + i * 0.02, 32 + i * 0.75);
assert.equal(marks.count, marks.capacity);
assert.equal(marks.geometry.drawRange.count, marks.capacity * 6);
assert.ok(marks.head >= 0 && marks.head < marks.capacity);
marks.dispose();
assert.equal(world.scene.children.length, 0);
console.log('Track mark geometry, visibility, retirement and buffer bounds passed.');
