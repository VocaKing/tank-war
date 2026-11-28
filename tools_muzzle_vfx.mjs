import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import { createServer } from 'vite';
import { MuzzleVfx, muzzleProfile } from './src/game/muzzleVfx.js';

const vite = await createServer({ appType: 'custom', server: { middlewareMode: true, ws: false } });
try {
  const { TANKS } = await vite.ssrLoadModule('/src/game/tankData.js');
  const profiles = TANKS.map(tank => muzzleProfile(tank, 100));
  assert.equal(new Set(profiles.map(({ width, length, vents, linger }) => JSON.stringify([width, length, vents, linger]))).size, TANKS.length);
  const get = id => TANKS.find(tank => tank.id === id);
  const aegis = muzzleProfile(get('aegis140'), 140);
  const abrams = muzzleProfile(get('m1a2'), 120);
  const archer = muzzleProfile(get('archer'), 155);
  assert.ok(aegis.tint[2] > aegis.tint[0] && abrams.tint[0] > abrams.tint[2]);
  assert.ok(archer.vents > abrams.vents);
  assert.ok(muzzleProfile(get('m50ontos'), 106, 'tube').size < muzzleProfile(get('m50ontos'), 106).size);

  for (const quality of ['low', 'medium', 'high']) {
    const scene = new Scene();
    const fx = new MuzzleVfx(scene, quality, [0.5, 0.5, 0.5], () => 0);
    const camera = new PerspectiveCamera(55, 1, 0.1, 300);
    camera.position.set(8, 5, 10);
    camera.lookAt(0, 2, 0);
    camera.updateMatrixWorld(true);
    const muzzle = new Vector3(0, 2, 0);
    const forward = new Vector3(0, 0, 1);
    fx.fire(muzzle, forward, abrams);
    assert.ok(fx.puffs.some(puff => puff.y < 0.5 && !puff.heat), 'Flash near ground should raise dust');
    assert.ok(fx.puffs.filter(puff => puff.heat > 0).length >= 10);
    fx.update(0.035, camera);
    assert.ok(fx.mesh.geometry.instanceCount >= 9);
    assert.ok(fx.puffs.some(puff => puff.heat > 0 && puff.z > 1.5), 'Forward jet missing');
    fx.update(0.26, camera);
    assert.ok(fx.puffs.every(puff => !puff.heat));
    assert.ok(fx.mesh.geometry.instanceCount > 0, 'Smoke should outlast the flash');
    for (let volley = 0; volley < 32; volley++) fx.fire(muzzle, forward, archer);
    assert.equal(fx.puffs.length, fx.capacity);
    fx.update(4, camera);
    assert.equal(fx.mesh.geometry.instanceCount, 0);
    fx.dispose();
    assert.equal(scene.children.length, 0);
  }
  console.log(`Verified ${TANKS.length} distinct muzzle profiles, directional jets, lingering smoke and bounded particle budgets.`);
} finally {
  await vite.close();
}
