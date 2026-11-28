import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Ray, Vector3 } from 'three';
import { hasFleetModel } from './src/models/fleetModel.js';
import { VESPER } from './src/models/vesperDesign.js';
import { VX9 } from './src/models/vx9Design.js';

const root = new URL('./public/models/fleet/', import.meta.url);
const files = (await readdir(root)).filter(file => file.endsWith('.glb'));
assert.equal(files.length, 21, 'Expected each specialist and concept vehicle to ship its own GLB');
const fingerprints = new Set();
const ids = [];
const expectedExterior = new Set([
  '2s38', 'archer', 'bmpt', 'centauro2', 'fv4005s1', 'm50ontos', 'sprutsd', 'strv103', 't14', 'xm8ags',
]);
const wheelCounts = { archer: 8, centauro2: 8 };
const expectedReferences = new Map([['xm8ags', 2], ['sprutsd', 8], ['t14', 10]]);
const vx9Revision = '2026-11-vx9-orthographic';
const rearTurretRevision = '2026-11-rear-turrets';

function checkRearTurret({ nodes, meshes, accessors }, pivot, id, revision = rearTurretRevision) {
  assert.equal(pivot?.extras?.turretExteriorRevision, revision, id);
  const exterior = pivot.children.map(index => nodes[index]).find(node => node.extras?.turretExterior === id);
  assert.ok(exterior?.extras?.turretDetailParts > 30, id + ' is missing its tailored turret');
  for (const { attributes, indices } of meshes[exterior.mesh].primitives) {
    const { count } = accessors[attributes.POSITION];
    assert.ok(Number.isInteger(count) && count > 0, id);
    for (const index of Object.values(attributes)) assert.equal(accessors[index].count, count, id);
    assert.equal(accessors[indices].count % 3, 0, id);
  }
}

function firstModelSurface(gltf, bytes, mesh, ray) {
  let first = { distance: Infinity };
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
  for (const primitive of gltf.meshes[mesh].primitives) {
    const pos = gltf.accessors[primitive.attributes.POSITION], idx = gltf.accessors[primitive.indices];
    const vertices = gltf.bufferViews[pos.bufferView].byteOffset + (pos.byteOffset ?? 0);
    const indices = gltf.bufferViews[idx.bufferView].byteOffset + (idx.byteOffset ?? 0);
    function vertex(index, out) {
      const p = vertices + 12 * bytes.readUInt16LE(indices + 2 * index);
      out.set(bytes.readFloatLE(p), bytes.readFloatLE(p + 4), bytes.readFloatLE(p + 8));
    }
    for (let i = 0; i < idx.count; i += 3) {
      vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
      if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
      const distance = hit.distanceTo(ray.origin);
      if (distance < first.distance) first = { distance, material: gltf.materials[primitive.material].name };
    }
  }
  return first;
}

function checkRecessedLights(gltf, bytes, mesh, { point: [x,y,z], sweep, pitch, rimHeight, skin }) {
  for (const side of [-1, 1]) {
    const yaw = side * sweep;
    const direction = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const vertical = new Vector3(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch));
    const center = new Vector3(side * x, y, z);
    function firstSurface(height) {
      const origin = center.clone().add(direction).addScaledVector(vertical, height);
      return firstModelSurface(gltf, bytes, mesh, new Ray(origin, direction.clone().negate()));
    }
    const lens = firstSurface(0), lip = firstSurface(rimHeight);
    assert.equal(lens.material, 'VX-9 illuminated strip', 'Headlamp must be visible through the housing');
    assert.equal(lip.material, skin, 'Lamp housing must use the surrounding armor');
    assert.ok(lens.distance > lip.distance + .035, 'Headlamp lens must sit behind the lip');
  }
}

function checkVX9Layout(gltf, bytes, body, turret, gun, muzzle, chassis, turretShell) {
  const clamped = (actual, expected, tolerance = .0001) => assert.ok(Math.abs(actual - expected) <= tolerance,
    `VX-9 datum differs from the drawing: ${actual} vs ${expected}`);
  assert.deepEqual(turret.translation, [0,VX9.hullRoof,VX9.turretZ]);
  assert.deepEqual(gun.translation, [0,VX9.trunnionY,VX9.trunnionZ]);
  assert.deepEqual(muzzle.translation, [0,0,VX9.barrelLength]);
  clamped(VX9.hullLength/2+turret.translation[2]+gun.translation[2]+muzzle.translation[2],10.70);

  const skin = gltf.meshes[chassis].primitives.find(p => gltf.materials[p.material].name === 'VX-9 medium gray armor');
  const bounds = gltf.accessors[skin.attributes.POSITION];
  clamped(bounds.max[2] - bounds.min[2], VX9.hullLength);
  clamped(bounds.max[0] - bounds.min[0], VX9.hullWidth, .01);
  const roof = firstModelSurface(gltf, bytes, turretShell, new Ray(new Vector3(0,2,0), new Vector3(0,-1,0)));
  clamped(2 - roof.distance + turret.translation[1], VX9.turretRoof, .01);
  for (const side of [-1,1]) {
    const track = body.children.map(i => gltf.nodes[i]).find(n => n.name === 'track_' + Number(side > 0));
    assert.equal(track.extras.poses.length,100);
    for (const pose of track.extras.poses) clamped(pose[0],side*VX9.trackX);
    const [x,y,z] = VX9.rearIntake;
    const grille = firstModelSurface(gltf, bytes, chassis, new Ray(new Vector3(side*(x+1),y,z),new Vector3(-side,0,0)));
    assert.ok(grille.distance > 1.005 && grille.distance < 1.09, 'Side intake must be recessed inside the armor envelope');
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
    const revision = id === 'aegis140' ? vx9Revision : id === VESPER.id ? VESPER.revision : '2026-11-concept-detail-v3';
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
  const gun = child(turret, 'gun');
  const barrel = child(gun, 'recoiling-barrel');
  const muzzle = child(barrel, 'muzzle');
  if (id === 'aegis140') {
    checkRearTurret(gltf, turret, id, vx9Revision);
    const chassis = child(body, 'VX-9 chassis').mesh;
    const turretShell = child(turret, 'VX-9 turret').mesh;
    assert.ok(materials.some(m => m.name === 'VX-9 illuminated strip' && m.emissiveFactor));
    const bytes = asset.subarray(28 + size);
    checkVX9Layout(gltf, bytes, body, turret, gun, muzzle, chassis, turretShell);
    checkRecessedLights(gltf, bytes, chassis, {
      point: VX9.lamp, sweep: VX9.lampSweep, pitch: VX9.lampTilt, rimHeight: .082, skin: 'VX-9 light gray armor',
    });
    checkRecessedLights(gltf, bytes, turretShell, {
      point: VX9.turretLamp, sweep: VX9.turretLampSweep, pitch: VX9.turretLampTilt,
      rimHeight: .058, skin: 'VX-9 graphite armor',
    });
  }
  if (id === VESPER.id) {
    assert.equal(model.extras.referenceSource,VESPER.source);
    assert.deepEqual(turret.translation,[0,VESPER.hullRoof,VESPER.turretZ]);
    assert.deepEqual(gun.translation,[0,VESPER.gunY,VESPER.gunZ]);
    assert.deepEqual(muzzle.translation,[0,0,VESPER.barrelLength]);
    const shell = gltf.meshes[child(body,'Vesper chassis').mesh];
    const skin = shell.primitives.find(p=>materials[p.material].name==='Vesper-48 slate armor');
    const {min,max}=gltf.accessors[skin.attributes.POSITION];
    assert.ok(Math.abs(max[2]-min[2]-VESPER.hullLength)<.001);
    assert.ok(Math.abs(max[0]-min[0]-VESPER.hullWidth)<.015);
    for (const side of [0,1]) {
      const anchors=child(body,'track_'+side).extras.poses;
      assert.equal(anchors.length,100);
      assert.ok(anchors.every(p=>p[0]===(side===0?-1:1)*VESPER.trackX));
    }
    const data=asset.subarray(28+size), chassis=child(body,'Vesper chassis').mesh;
    for (const x of VESPER.lightsX) {
      const origin=new Vector3(x,VESPER.lightsY-.038,VESPER.lightsZ+1);
      const light=firstModelSurface(gltf,data,chassis,new Ray(origin,new Vector3(0,0,-1)));
      assert.equal(light.material,'Vesper-48 warm searchlight lens','Front lamp must clear the armor at its lower edge');
    }
    assert.ok(materials.some(m=>m.name==='Vesper-48 warm searchlight lens'&&m.emissiveFactor));
  }
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
