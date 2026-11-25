import assert from 'node:assert/strict';
import * as THREE from 'three';
import { intersectArmor } from './src/game/armorGeometry.js';
import { DEG, incidence } from './src/game/combatMath.js';

const dims = { L: 6, W: 3, hullH: 2, clearance: .4, turretH: .9, turretL: 1.8 };
const root = new THREE.Group(), body = new THREE.Group(), turret = new THREE.Group();
const material = new THREE.MeshBasicMaterial();
const plate = new THREE.BoxGeometry(.70, .90, .20);
root.add(body);
body.add(turret);
root.position.set(4, 2, 7);
root.rotation.set(-.28, .78, .16);
body.position.y = .21;
const panels = [15, 74].map((slope, i) => {
  const mesh = new THREE.Mesh(plate, material);
  mesh.position.set(i === 0 ? -.75 : .75, 1, 1);
  mesh.rotation.x = slope * DEG;
  mesh.userData.matKey = 'paint';
  body.add(mesh);
  return mesh;
});
const upperPanel = new THREE.Mesh(plate, material);
upperPanel.userData.matKey = 'paint';
turret.add(upperPanel);
turret.position.set(0, 2.4, 0);
turret.rotation.y = .38;
const model = { root, body, turret, meshes: [...panels, upperPanel] };
root.updateMatrixWorld(true);

function strike(mesh, reference, dir, gone) {
  const point = mesh.localToWorld(new THREE.Vector3(0, 0, .10));
  const ray = dir.transformDirection(reference.matrixWorld);
  return intersectArmor(model, { dims }, point.clone().addScaledVector(ray, 2),
    point.clone().addScaledVector(ray, -.025), gone);
}
for (const [i, expected] of [15, 74].entries()) {
  const hit = strike(panels[i], body, new THREE.Vector3(0, 0, 1));
  assert.equal(hit?.part, 'hull');
  assert.equal(hit.face, 'front');
  const result = incidence(hit.dirW.dot(hit.normalW), 80);
  assert.ok(Math.abs(result.angle - expected) < 1e-3);
  assert.ok(Math.abs(result.los - 80 / Math.cos(expected * DEG)) < 1e-3);
}
const upper = strike(upperPanel, body, new THREE.Vector3(0, 0, 1));
assert.equal(upper?.part, 'turret');
assert.ok(Math.abs(incidence(upper.dirW.dot(upper.normalW), 80).angle - .38 / DEG) < 1e-3);
assert.equal(strike(upperPanel, body, new THREE.Vector3(0, 0, 1), true), null);

const from = body.localToWorld(new THREE.Vector3(0, 1, 2));
const to = body.localToWorld(new THREE.Vector3(0, 1, 0));
assert.equal(intersectArmor(model, { dims }, from, to), null, 'A gap between two plates must stay empty');
plate.dispose();
material.dispose();
console.log('Verified geometric impacts, varying LOS, gaps and turret transforms.');
