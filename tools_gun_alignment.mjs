import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ appType: 'custom', server: { middlewareMode: true, ws: false } });
try {
  const [{ Tank }, { createTankModel, THREE }, { TANKS }] = await Promise.all([
    vite.ssrLoadModule('/src/game/tank.js'),
    vite.ssrLoadModule('/src/models/tankModel.js'),
    vite.ssrLoadModule('/src/game/tankData.js'),
  ]);
  const ids = ['t72','m1a2','leo2a6','tiger','2s38','leviathan160','strv103'];
  const results = [];
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  for (const id of ids) {
    const spec = TANKS.find(s => s.id === id);
    assert.ok(spec, 'missing tank spec: ' + id);
    const model = createTankModel(spec, { links: false });
    const tank = Object.assign(Object.create(Tank.prototype), {
      spec, model, pos: new THREE.Vector3(0, 0, 0), quat: new THREE.Quaternion(),
      heading: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, yawRate: 0,
      shellIdx: 0, abilities: { usingSecondary: false }, modules: { turret: 1, gun: 1 },
      crew: spec.crew.map(role => ({ role, alive: true })),
      input: { aim: new THREE.Vector3(spec.fixedGun ? 0 : 60, 2.2, 300), aimBearing: null },
      recoil: 0, spadeProgress: 0, autoArtilleryState: 'stowed', autoArtilleryTimer: 0,
      suspensionOffset: 0, turnRate: 0, inv: new THREE.Matrix4(), vehicleSkill: null,
    });
    tank.syncModel();
    for (let i = 0; i < 1800; i++) {
      tank.updateTurret(1 / 60);
      tank.syncModel();
    }
    const muzzle = tank.muzzleNode.getWorldPosition(new THREE.Vector3());
    const dir = tank.gunDirection();
    const target = tank.input.aim;
    const targetBearing = Math.atan2(target.x - muzzle.x, target.z - muzzle.z);
    const barrelBearing = Math.atan2(dir.x, dir.z);
    const bearingError = Math.abs(wrap(barrelBearing - targetBearing));
    const result = { id, fixedGun: !!spec.fixedGun, highArc: !!spec.artillery?.highArc,
      aimError: tank.aimError, bearingErrorDeg: bearingError * 180 / Math.PI,
      turretYawDeg: tank.turretYaw * 180 / Math.PI, gunPitchDeg: tank.gunPitch * 180 / Math.PI };
    results.push(result);
    assert.ok(Number.isFinite(tank.aimError), id + ' has non-finite aim error');
    assert.ok(bearingError < 0.35 * Math.PI / 180,
      id + ' barrel azimuth does not converge to the target: ' + JSON.stringify(result));
    if (!spec.fixedGun) assert.ok(tank.aimError < 0.02,
      id + ' turret/pitch servo does not settle: ' + JSON.stringify(result));
    model.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose(); });
  }
  console.log('Gun alignment convergence:', JSON.stringify(results));
} finally {
  await vite.close();
}
