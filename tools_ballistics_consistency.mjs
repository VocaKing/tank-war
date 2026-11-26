import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createServer } from 'vite';
import { projectedSpreadRadius } from './src/game/combatMath.js';

const vite = await createServer({ appType: 'custom', server: { middlewareMode: true, ws: false } });
try {
  const { Ballistics } = await vite.ssrLoadModule('/src/game/ballistics.js');
  const origin = new Vector3(0, 1.5, 0);
  const velocity = new Vector3(0, 3, 750);
  const targetZ = 470;
  const spec = { type: 'AP', velocity: 750, caliber: 75 };
  const noop = () => {};
  const noHit = () => -1;
  const shooter = { team: 0, spec: { cls: 'Medium' } };
  const tank = {
    team: 1, alive: true, spotted: [true], pos: new Vector3(0, 0, targetZ),
    spec: { dims: { W: 3, L: 6 } },
    rayTest(a, b) {
      if (a.z > targetZ || b.z < targetZ) return null;
      return { t: (targetZ - a.z) / (b.z - a.z) };
    },
  };
  const game = {
    tanks: [tank],
    world: { terrain: { segmentHit: noHit, waterLevel: () => -1e9 }, structureHit: noHit },
    effects: { addTracer: noop, removeTracer: noop },
  };
  const ballistics = new Ballistics(game);
  const preview = () => ballistics.predict(shooter, spec, origin, velocity);
  const aim = preview();
  assert.equal(aim.kind, 'tank');
  const time = targetZ / velocity.z;
  assert.ok(Math.abs(aim.pos.y - (origin.y + velocity.y * time - 0.5 * 9.81 * time ** 2)) < 0.002);

  for (const dt of [1 / 20, 1 / 60, 1 / 144]) {
    let real;
    ballistics.onImpact = (shell, kind, pos, actualTank) => { real = { kind, pos, actualTank }; return true; };
    ballistics.spawn(shooter, spec, origin, velocity);
    for (let i = 0; i < Math.ceil(2 / dt) && !real; i++) ballistics.update(dt);
    assert.equal(real?.actualTank, tank);
    assert.equal(real?.kind, aim.kind);
    assert.ok(real.pos.distanceTo(aim.pos) < 0.002, 'The shot must land at the indicated centre');
  }

  game.world.structureHit = (ax, ay, az, bx, by, bz) => {
    const wallZ = targetZ - 2;
    return az <= wallZ && bz >= wallZ ? (wallZ - az) / (bz - az) : -1;
  };
  assert.equal(preview().kind, 'structure', 'Cover must intercept the predicted shot before the target');
  ballistics.spawn(shooter, spec, origin, velocity);
  let block;
  ballistics.onImpact = (shell, kind, pos) => { block = { kind, pos }; return true; };
  while (ballistics.shells.length) ballistics.update(1 / 60);
  assert.equal(block.kind, 'structure');
  assert.ok(block.pos.distanceTo(preview().pos) < 0.002);

  const radius = projectedSpreadRadius(0.5, 1, 50, 2, 900);
  assert.equal(projectedSpreadRadius(0.5, 1, 50, 8, 900), radius * 4);
  assert.ok(projectedSpreadRadius(0.5, 1, 40, 2, 900) > radius);
  console.log('Verified matching ballistic impacts across frame rates, intervening cover and scope projection.');
} finally {
  await vite.close();
}
