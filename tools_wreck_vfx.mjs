import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArtilleryVfx } from './src/game/artilleryVfx.js';
import { CloudVfx } from './src/game/cloudVfx.js';
import { TankWreckVfx } from './src/game/tankWreckVfx.js';
import { RNG } from './src/util.js';

const scene = new THREE.Scene();
const tint = [0.58, 0.54, 0.46];
const origin = new THREE.Vector3(5, 2, 10);
const rng = new RNG(71);
Math.random = () => rng.next();

for (const quality of ['low', 'medium', 'high']) {
  const wreck = new TankWreckVfx(scene, quality, tint);
  const artillery = new ArtilleryVfx(scene, quality, tint);
  const sharedAtlas = wreck.mesh.material.uniforms.uCloud.value;
  assert.equal(artillery.mesh.material.uniforms.uCloud.value, sharedAtlas);
  let atlasReleased = false;
  sharedAtlas.addEventListener('dispose', () => { atlasReleased = true; });

  wreck.burst(origin, 0, false, 1);
  assert.equal(artillery.puffs.length, 0, 'wreck and artillery have separate particle budgets');
  wreck.update(2.8);
  const rim = wreck.puffs.filter(puff => puff.roll > 0);
  const stem = wreck.puffs.filter(puff => puff.rise > 0 && puff.vy < 16 && !puff.roll);
  const average = (list, sample) => list.reduce((sum, puff) => sum + sample(puff), 0) / list.length;
  const width = puff => Math.hypot(puff.cx - origin.x, puff.cz - origin.z) + puff.diameter / 2;
  assert.ok(average(rim, puff => puff.cy) > average(stem, puff => puff.cy) + 4, quality + ': lifted crown');
  assert.ok(average(rim, width) > average(stem, width) * 1.18, quality + ': flared crown');

  for (let i = 0; i < 14; i++) {
    const next = origin.clone();
    next.x += 10 * (i + 1);
    wreck.burst(next, 0.5, i % 4 === 0, 1.18);
  }
  wreck.update(2);
  assert.ok(wreck.mesh.geometry.instanceCount <= wreck.capacity);
  assert.ok(wreck.draw.every(puff => Number.isFinite(puff.cx + puff.cy + puff.cz)));
  assert.equal(new Set(wreck.puffs.filter(puff => puff.roll).map(puff => puff.x)).size, 15,
    quality + ': each wreck should retain a crown');
  wreck.update(15);
  assert.equal(wreck.puffs.length, 0);
  assert.equal(wreck.mesh.geometry.instanceCount, 0);
  assert.equal(wreck.mesh.visible, false);
  wreck.dispose();
  assert.equal(atlasReleased, false, 'artillery still uses the atlas');
  artillery.burst(origin, new THREE.Vector3(0, 1, 0), 'ground');
  artillery.update(1);
  assert.ok(artillery.mesh.geometry.instanceCount > 0);
  artillery.dispose();
  assert.equal(atlasReleased, true);
}

const clouds = new CloudVfx(scene, 4);
const billboard = { life: 8, initial: 4, size: 4, tint, fadeIn: 0.1 };
const stationary = new THREE.Vector3();
clouds.emit(new THREE.Vector3(0, 0, -20), stationary, billboard);
clouds.emit(new THREE.Vector3(11, 0, -20), stationary, billboard);
clouds.emit(new THREE.Vector3(30, 0, -20), stationary, billboard);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.updateMatrixWorld();
clouds.update(0.2, camera);
assert.deepEqual(clouds.draw.map(puff => puff.x), [0, 11], 'retain puffs overlapping the screen edge');
assert.equal(clouds.puffs.length, 3, 'keep simulating puffs outside the frustum');
camera.lookAt(30, 0, -20);
camera.updateMatrixWorld();
clouds.update(0.2, camera);
assert.ok(clouds.draw.some(puff => puff.x === 30 && puff.age === 0.4), 'puffs return at their current age');
clouds.dispose();

assert.equal(scene.children.length, 0);
console.log('Verified tank wreck shape, concurrent bursts, screen culling, atlas lifetime and artillery on all graphics tiers.');
