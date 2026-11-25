import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const vite = await createServer({ appType: 'custom', server: { middlewareMode: true, ws: false } });
try {
  const { Game } = await vite.ssrLoadModule('/src/game/game.js');
  const { World } = await vite.ssrLoadModule('/src/world/world.js');

  const vehicle = (team = 0) => ({ team, pos: { x: 0, z: 0 }, alive: true, lastDamagedAt: -100 });
  function battlefield(tanks) {
    return Object.assign(Object.create(Game.prototype), {
      tanks, time: 0, ended: false, capture: [{ points: 0 }, { points: 0 }],
      control: { team: null, points: 0, occupied: false, contested: false },
      world: {
        bases: [{ x: -200, z: 0, r: 35 }, { x: 200, z: 0, r: 35 }],
        controlPoint: { x: 0, z: 0, r: 38 },
        setControlTeam(team) { this.markerTeam = team; },
      },
    });
  }
  const dt = 1 / 60;
  for (const [index, strength] of [1, 1.8, 2.4, 2.8, 3, 3.2, 3.4].entries()) {
    for (const team of [0, 1]) {
      const game = battlefield(Array.from({ length: index + 1 }, () => vehicle(team)));
      const time = 150 / strength;
      const ticks = Math.floor((time - 0.001) / dt);
      for (let i = 0; i < ticks; i++) game.updateCapture(dt);
      assert.ok(game.control.points < 100, 'the point must not be taken early');
      assert.equal(game.control.team, team);
      assert.equal(game.world.markerTeam, team);
      game.updateCapture(2 * dt);
      assert.equal(game.control.points, 100, 'the point must be taken at the expected rate');
    }
  }

  const ally = vehicle();
  const enemy = vehicle(1);
  const game = battlefield([
    ally, { ...vehicle(), airborne: true }, { ...vehicle(), afloat: true }, { ...vehicle(), alive: false },
  ]);
  game.updateCapture(30);
  assert.equal(game.control.points, 20, 'only the grounded, living occupant contributes');
  game.tanks.push(enemy);
  game.updateCapture(30);
  assert.equal(game.control.contested, true);
  assert.equal(game.control.points, 20, 'opposing tanks pause capture');
  ally.pos.x = 50;
  game.updateCapture(45);
  assert.equal(game.control.team, 1);
  assert.equal(game.control.points, 10, 'the enemy first clears the old progress');
  enemy.pos.x = 50;
  game.updateCapture(2.5);
  assert.equal(game.control.team, null);
  assert.equal(game.control.points, 0, 'the empty point returns to neutral');

  const world = Object.assign(Object.create(World.prototype), {
    sun: new THREE.DirectionalLight(),
    sunDir: new THREE.Vector3(0.6, 0.7, 0.4).normalize(),
    terrain: { height: () => 0 },
    shadowInterval: 1 / 30, shadowS: 88, shadowTexel: 176 / 3072,
    shadowMotionLimit: 176 / 3072, shadowUpdatedAt: -Infinity,
    shadowFocus: new THREE.Vector3(), shadowVehiclePoses: new WeakMap(),
  });
  const caster = { model: { root: new THREE.Group() }, spec: { dims: { L: 6, W: 3, gunLen: 4 } } };
  const focus = new THREE.Vector3();
  const { root } = caster.model;
  const shadow = world.sun.shadow;
  const refresh = (time) => {
    shadow.needsUpdate = false; // The renderer consumes this flag after drawing the map.
    world.updateShadowCenter(focus, time, [caster]);
    return shadow.needsUpdate;
  };

  assert.equal(refresh(0), true);
  assert.equal(refresh(dt), false, 'a stationary caster uses the cached shadow');
  for (const [index, speed] of [40, 45, 50].entries()) {
    root.position.x += speed / 3.6 * dt;
    assert.equal(refresh((index + 1) * dt), true, 'a nearby moving tank updates the shadow in the current frame');
  }
  root.rotation.y += Math.PI / 4;
  assert.equal(refresh(4 * dt), true, 'turning moves the hull silhouette');
  root.visible = false;
  assert.equal(refresh(5 * dt), true, 'hiding a vehicle clears its cached shadow');
  assert.equal(refresh(6 * dt), false, 'a hidden vehicle does not force extra refreshes');
  root.visible = true;
  root.position.x = 500;
  assert.equal(refresh(8 * dt), true, 'the normal periodic refresh still runs');
  root.position.x += 1;
  assert.equal(refresh(9 * dt), false, 'a vehicle outside the shadow map does not trigger an extra refresh');

  console.log('Verified diminishing control-point capture and motion-aware vehicle shadows.');
} finally {
  await vite.close();
}
