import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--base', '/'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:5173/'); if (r.ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Vite server did not start');
  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto('http://127.0.0.1:5173/tests/muzzle.html');
  const results = await page.evaluate(async () => {
    const [{ Tank, ballisticAngle }, { createTankModel, THREE }, { TANKS }, { loadFleetModel, hasFleetModel }] = await Promise.all([
      import('/src/game/tank.js'), import('/src/models/tankModel.js'), import('/src/game/tankData.js'),
      import('/src/models/fleetModel.js'),
    ]);
    const ids = ['t72', 'm1a2', 'leo2a6', 'tiger', '2s38', 'leviathan160', 'strv103', 'archer', 'pzh2000', 'thunderclad155', 'tempest155'];
    const out = [];
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    for (const id of ids) {
      const spec = TANKS.find(s => s.id === id);
      if (!spec) throw new Error('missing tank spec: ' + id);
      if (hasFleetModel(id)) await loadFleetModel(spec);
      const model = createTankModel(spec, { links: false });
      const heading = spec.artillery?.highArc ? 0.73 : 0;
      const hullPitch = spec.artillery?.highArc ? 0.12 : 0;
      const hullRoll = spec.artillery?.highArc ? -0.08 : 0;
      const bearing = heading + (spec.artillery?.highArc ? 0.42 : Math.atan2(60, 300));
      const aim = new THREE.Vector3(Math.sin(bearing) * 300, 2.2, Math.cos(bearing) * 300);
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(hullPitch, heading, hullRoll, 'YXZ'));
      const tank = Object.assign(Object.create(Tank.prototype), {
        spec, model, pos: new THREE.Vector3(0, 0, 0), quat,
        heading, pitch: hullPitch, roll: hullRoll, turretYaw: 0, gunPitch: 0, yawRate: 0,
        shellIdx: 0, abilities: { usingSecondary: false }, modules: { turret: 1, gun: 1 },
        crew: spec.crew.map(role => ({ role, alive: true })),
        input: { aim, aimBearing: null },
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
      model.root.updateMatrixWorld(true);
      const barrelDir = new THREE.Vector3(0, 0, 1).applyQuaternion(model.barrel.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const target = tank.input.aim;
      const targetBearing = Math.atan2(target.x - muzzle.x, target.z - muzzle.z);
      const barrelBearing = Math.atan2(dir.x, dir.z);
      const bearingError = Math.abs(wrap(barrelBearing - targetBearing));
      const visualBearing = Math.atan2(barrelDir.x, barrelDir.z);
      const visualBearingError = Math.abs(wrap(visualBearing - targetBearing));
      const axisErrorDeg = Math.acos(Math.max(-1, Math.min(1, barrelDir.dot(dir)))) * 180 / Math.PI;
      const horizontal = Math.hypot(target.x - muzzle.x, target.z - muzzle.z);
      const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      const flightTime = horizontal / Math.max(1, tank.shell.velocity * Math.cos(pitch));
      const ballisticY = muzzle.y + tank.shell.velocity * Math.sin(pitch) * flightTime - 0.5 * 9.81 * flightTime * flightTime;
      const verticalMissM = ballisticY - target.y;
      const expectedPitch = ballisticAngle(tank.shell.velocity, horizontal, target.y - muzzle.y, !!spec.artillery?.highArc);
      const row = {
        id, fixedGun: !!spec.fixedGun, highArc: !!spec.artillery?.highArc,
        importedFleet: !!model.root.userData.importedFleet,
        mountX: tank.gunMount.position.x, mountZ: tank.gunMount.position.z,
        axisErrorDeg, visualBearingErrorDeg: visualBearingError * 180 / Math.PI,
        aimError: tank.aimError, bearingErrorDeg: bearingError * 180 / Math.PI,
        pitchErrorDeg: Math.abs(pitch - expectedPitch) * 180 / Math.PI, verticalMissM,
        turretYawDeg: tank.turretYaw * 180 / Math.PI, gunPitchDeg: tank.gunPitch * 180 / Math.PI,
      };
      out.push(row);
      model.root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose();
      });
    }
    return out;
  });
  console.log('Gun alignment convergence:', JSON.stringify(results));
  for (const row of results) {
    assert.ok(Number.isFinite(row.aimError), row.id + ' has non-finite aim error');
    if (!row.fixedGun) {
      assert.ok(row.axisErrorDeg < 0.35,
        row.id + ' visual barrel axis differs from the controlled gun axis: ' + JSON.stringify(row));
      assert.ok(row.visualBearingErrorDeg < 0.35,
        row.id + ' visible barrel does not point at the horizontal target bearing: ' + JSON.stringify(row));
    }
    if (!row.fixedGun) assert.ok(row.bearingErrorDeg < 0.35,
      row.id + ' barrel azimuth does not converge to the target: ' + JSON.stringify(row));
    if (!row.fixedGun && !row.highArc) {
      assert.ok(row.aimError < 0.02,
        row.id + ' turret/pitch servo does not settle: ' + JSON.stringify(row));
      assert.ok(Math.abs(row.verticalMissM) < 1.5,
        row.id + ' shell trajectory misses the crosshair target vertically: ' + JSON.stringify(row));
    }
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
