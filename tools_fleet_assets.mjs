import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { hasFleetModel } from './src/models/fleetModel.js';

const root = new URL('./public/models/fleet/', import.meta.url);
const files = (await readdir(root)).filter(file => file.endsWith('.glb'));
assert.equal(files.length, 20, 'Expected each specialist and concept vehicle to ship its own GLB');
const fingerprints = new Set();
const ids = [];
const wheelCounts = { archer: 8, centauro2: 8 };

for (const file of files) {
  const id = file.slice(0, -4);
  const asset = await readFile(new URL(file, root));
  const size = asset.readUInt32LE(12);
  const { nodes, scenes } = JSON.parse(asset.subarray(20, 20 + size));
  assert.ok(hasFleetModel(id), id + ' is missing its game binding');
  const model = nodes[scenes[0].nodes[0]];
  assert.equal(model.name, id);
  assert.equal(model.extras.fleetModelId, id);
  const child = (node, name) => node?.children?.map(i => nodes[i]).find(n => n.name === name);
  const body = child(model, 'body');
  const turret = child(body, 'turret');
  const gun = child(turret, 'gun');
  const barrel = child(gun, 'recoiling-barrel');
  const muzzle = child(barrel, 'muzzle');
  assert.ok(muzzle?.translation[2] > 0, id + ' has an invalid recoil or muzzle hierarchy');
  assert.ok(child(gun, 'sight'), id + ' has no sight anchor');
  const muzzles = nodes.filter(n => /^muzzle(?:_\d+)?$/.test(n.name)).length;
  assert.equal(muzzles, id === 'm50ontos' ? 6 : id === 'bmpt' ? 2 : 1, id);
  if (wheelCounts[id]) assert.equal(nodes.filter(n => n.extras?.radius).length, wheelCounts[id], id);
  else for (const side of [0, 1]) assert.ok(child(body, 'track_' + side)?.extras.poses.length >= 8, id);
  // Exclude metadata when checking that two bindings do not ship the same geometry.
  const fingerprint = createHash('sha256').update(asset.subarray(28 + size)).digest('hex');
  assert.ok(!fingerprints.has(fingerprint), id + ' ships geometry already bound to another vehicle');
  fingerprints.add(fingerprint);
  ids.push(id);
}

if (process.argv[2]) {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => callback.name === 'loop' ? 0 : raf(callback);
    });
    await page.goto(process.argv[2]);
    await page.waitForFunction(() => window.__ready);
    for (const id of ids) {
      await page.evaluate(id => window.__menu.select(id), id);
      await page.waitForFunction(id => window.__menu.garage.current?.root.userData.fleetModelId === id, id);
      const actual = await page.evaluate(() => {
        const { current } = window.__menu.garage;
        const model = current.root;
        const wheels = [];
        model.traverse(node => { if (node.userData.radius) wheels.push(node.position.toArray()); });
        const track = current.meshes.find(node => node.isInstancedMesh);
        const previous = track?.instanceMatrix.array[14];
        current.moveRunningGear(.21, .21);
        return {
          id: model.name, meshes: current.meshes.length, wheels: wheels.length,
          muzzles: current.muzzles.length, movedTrack: track?.instanceMatrix.array[14] !== previous,
          pitchFloor: current.gunPitchFloor(0, -.08, .3),
        };
      });
      assert.equal(actual.id, id);
      assert.ok(actual.meshes > 8, id);
      assert.equal(actual.wheels, wheelCounts[id] || 0, id);
      assert.equal(actual.muzzles, id === 'm50ontos' ? 6 : id === 'bmpt' ? 2 : 1, id);
      if (!wheelCounts[id]) assert.ok(actual.movedTrack, id + ' has frozen track shoes');
      if (id === 'strv103') assert.ok(actual.pitchFloor <= 0, id + ' forces its barrel above level');
      if (wheelCounts[id]) assert.ok(!actual.movedTrack, id + ' unexpectedly renders track shoes');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
console.log('Verified ' + ids.length + ' independent fleet assets and all named joints.');
