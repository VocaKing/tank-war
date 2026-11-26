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
const expectedExterior = new Set([
  '2s38', 'archer', 'bmpt', 'centauro2', 'fv4005s1', 'm50ontos', 'sprutsd', 'strv103', 't14', 'xm8ags',
]);
const wheelCounts = { archer: 8, centauro2: 8 };
const expectedReferences = new Map([['xm8ags', 2], ['sprutsd', 8], ['t14', 10]]);
const rearTurretRevision = '2026-11-rear-turrets';

function checkRearTurret({ nodes, meshes, accessors }, pivot, id) {
  assert.equal(pivot?.extras?.turretExteriorRevision, rearTurretRevision, id);
  const exterior = pivot.children.map(index => nodes[index]).find(node => node.extras?.turretExterior === id);
  assert.ok(exterior?.extras?.turretDetailParts > 30, id + ' is missing its tailored turret');
  for (const { attributes, indices } of meshes[exterior.mesh].primitives) {
    const { count } = accessors[attributes.POSITION];
    assert.ok(Number.isInteger(count) && count > 0, id);
    for (const index of Object.values(attributes)) assert.equal(accessors[index].count, count, id);
    assert.equal(accessors[indices].count % 3, 0, id);
  }
}

for (const file of files) {
  const id = file.slice(0, -4);
  const asset = await readFile(new URL(file, root));
  const size = asset.readUInt32LE(12);
  const gltf = JSON.parse(asset.subarray(20, 20 + size));
  const { nodes, scenes, materials } = gltf;
  assert.ok(hasFleetModel(id), id + ' is missing its game binding');
  const model = nodes[scenes[0].nodes[0]];
  assert.equal(model.name, id);
  assert.equal(model.extras.fleetModelId, id);
  if (expectedExterior.has(id)) {
    assert.equal(model.extras.fleetModelRevision, '2026-11-exterior-detail', id + ' is missing the revised model');
    assert.ok(model.extras.exteriorDetailParts > 16, id + ' is missing layered exterior fittings');
  } else {
    const revision = id === 'aegis140' ? rearTurretRevision : '2026-11-concept-detail-v3';
    assert.equal(model.extras.fleetModelRevision, revision, id + ' is missing the revised concept model');
    assert.ok(model.extras.exteriorDetailParts > 22, id + ' is missing its new hull and turret fittings');
    for (const suffix of ['track', 'rubber']) {
      assert.ok(materials.some(m => m.name.toLowerCase().endsWith('_' + suffix) && m.normalTexture),
        id + ' is missing its ' + suffix + ' surface relief');
    }
  }
  if (expectedReferences.has(id)) {
    assert.equal(model.extras.referenceImage, expectedReferences.get(id), id + ' has the wrong reference image');
  }
  const child = (node, name) => node?.children?.map(i => nodes[i]).find(n => n.name === name);
  const body = child(model, 'body');
  const turret = child(body, 'turret');
  if (id === 'aegis140') checkRearTurret(gltf, turret, id);
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

for (const id of ['atlas', 'basilisk']) {
  const asset = await readFile(new URL(`../armour-expansion/${id}.glb`, root));
  const gltf = JSON.parse(asset.subarray(20, 20 + asset.readUInt32LE(12)));
  checkRearTurret(gltf, gltf.nodes.find(node => node.name === 'TURRET_PIVOT'), id);
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
      window.requestAnimationFrame = callback => callback.name === 'loop' || callback.toString().includes('toneMappingExposure') ? 0 : raf(callback);
    });
    await page.goto(process.argv[2]);
    await page.waitForFunction(() => window.__ready);
    for (const id of ids) {
      await page.evaluate(id => window.__menu.select(id), id);
      await page.waitForFunction(id => window.__menu.garage.current?.root.userData.fleetModelId === id, id);
      const actual = await page.evaluate(id => {
        const { current } = window.__menu.garage;
        const model = current.root;
        const wheels = [];
        model.traverse(node => { if (node.userData.radius) wheels.push(node.position.toArray()); });
        const track = current.meshes.find(node => node.isInstancedMesh);
        const previous = track?.instanceMatrix.array[14];
        current.moveRunningGear(.21, .21);
        const rubber = current.meshes.find(({ material }) => material.name === id + '_Rubber');
        let rubberBrightness;
        if (rubber) {
          const sample = document.createElement('canvas');
          sample.width = sample.height = 8;
          const context = sample.getContext('2d');
          context.drawImage(rubber.material.map.image, 0, 0, 8, 8);
          const values = context.getImageData(0, 0, 8, 8).data;
          rubberBrightness = values.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0) / (8 * 8 * 3);
        }
        return {
          id: model.name, meshes: current.meshes.length, wheels: wheels.length,
          muzzles: current.muzzles.length, movedTrack: track?.instanceMatrix.array[14] !== previous,
          pitchFloor: current.gunPitchFloor(0, -.08, .3),
          rubberBrightness,
        };
      }, id);
      assert.equal(actual.id, id);
      assert.ok(actual.meshes > 8, id);
      assert.equal(actual.wheels, wheelCounts[id] || 0, id);
      assert.equal(actual.muzzles, id === 'm50ontos' ? 6 : id === 'bmpt' ? 2 : 1, id);
      if (!wheelCounts[id]) assert.ok(actual.movedTrack, id + ' has frozen track shoes');
      if (id === 'strv103') assert.ok(actual.pitchFloor <= 0, id + ' forces its barrel above level');
      if (wheelCounts[id]) assert.ok(!actual.movedTrack, id + ' unexpectedly renders track shoes');
      if (!expectedExterior.has(id)) {
        assert.ok(actual.rubberBrightness > 20 && actual.rubberBrightness < 100,
          id + ' has an incorrect rubber albedo');
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
console.log('Verified ' + ids.length + ' independent fleet assets and all named joints.');
