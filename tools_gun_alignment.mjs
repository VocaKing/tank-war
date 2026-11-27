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
    const [{ Tank }, { createTankModel, loadDetailedTankModel, THREE }, { TANKS }] = await Promise.all([
      import('/src/game/tank.js'), import('/src/models/tankModel.js'), import('/src/game/tankData.js'),
    ]);
    const ids = ['t72', 'm1a2', 'leo2a6', 'tiger', '2s38', 'leviathan160', 'strv103',
      'archer', 'pzh2000', 'tempest155', 'thunderclad155'];
    const out = [];
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    for (const id of ids) {
      const spec = TANKS.find(s => s.id === id);
      if (!spec) throw new Error('missing tank spec: ' + id);
      // Casemate/fixed-gun vehicles cannot traverse independently; their hull-aim
      // behavior is covered by the dedicated fixed-gun controller regression.
      if (spec.fixedGun) continue;
      await loadDetailedTankModel(spec);
      const model = createTankModel(spec, { links: false, battle: true });
      const tank = Object.assign(Object.create(Tank.prototype), {
        spec, model, pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
        heading: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, yawRate: 0,
        shellIdx: 0, abilities: { usingSecondary: false }, modules: { turret: 1, gun: 1 },
        crew: spec.crew.map(role => ({ role, alive: true })),
        input: { aim: new THREE.Vector3(), aimBearing: null },
        recoil: 0, spadeProgress: 0, autoArtilleryState: 'stowed', autoArtilleryTimer: 0,
        suspensionOffset: 0, turnRate: 0, inv: new THREE.Matrix4(), vehicleSkill: null,
      });
      const scenarios = [
        { name: 'world-point', pos: [0, 0, 0], heading: 0.17, pitch: 0.08, roll: -0.06,
          bearing: new THREE.Vector3(0.34, 0, 0.94), range: 180, useBearing: false },
        { name: 'translated-world-point', pos: [237, 0, -163], heading: 0.61, pitch: -0.09, roll: 0.12,
          bearing: new THREE.Vector3(-0.72, 0, 0.69), range: 180, useBearing: false },
        { name: 'translated-near-bearing', pos: [237, 0, -163], heading: 0.61, pitch: -0.09, roll: 0.12,
          bearing: new THREE.Vector3(-0.72, 0, 0.69), range: 9, useBearing: true },
      ];
      for (const scenario of scenarios) {
        tank.pos.set(...scenario.pos);
        tank.heading = scenario.heading; tank.pitch = scenario.pitch; tank.roll = scenario.roll;
        tank.quat.setFromEuler(new THREE.Euler(tank.pitch, tank.heading, tank.roll, 'YXZ'));
        tank.turretYaw = 0; tank.gunPitch = 0;
        tank.input.aimBearing = scenario.useBearing ? scenario.bearing.clone() : null;
        tank.syncModel();
        const pivot = model.turret.getWorldPosition(new THREE.Vector3());
        tank.input.aim.copy(pivot).addScaledVector(scenario.bearing, scenario.range);
        tank.input.aim.y += 1.5;
        for (let i = 0; i < 1800; i++) {
          tank.updateTurret(1 / 60);
          tank.syncModel();
        }
        const muzzle = tank.muzzleNode.getWorldPosition(new THREE.Vector3());
        const dir = tank.gunDirection();
        const targetBearing = scenario.useBearing
          ? Math.atan2(scenario.bearing.x, scenario.bearing.z)
          : Math.atan2(tank.input.aim.x - muzzle.x, tank.input.aim.z - muzzle.z);
        const barrelBearing = Math.atan2(dir.x, dir.z);
        const errorDeg = Math.abs(wrap(barrelBearing - targetBearing)) * 180 / Math.PI;
        out.push({
          id, scenario: scenario.name, imported: !!model.root.userData.importedFleet,
          errorDeg, turretYawDeg: tank.turretYaw * 180 / Math.PI,
          gunPitchDeg: tank.gunPitch * 180 / Math.PI,
        });
      }
      model.root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose();
      });
    }
    return out;
  });
  console.log('World-space muzzle alignment:', JSON.stringify(results));
  for (const row of results) {
    assert.ok(Number.isFinite(row.errorDeg), row.id + '/' + row.scenario + ' has non-finite horizontal error');
    assert.ok(row.errorDeg < 0.35,
      row.id + '/' + row.scenario + ' muzzle bore does not align horizontally: ' + JSON.stringify(row));
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
