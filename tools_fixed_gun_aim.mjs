import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173/tank-war/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage();
  await page.goto(new URL('balance.html', base).href);
  const result = await page.evaluate(async (base) => {
    const load = (file) => import(new URL('src/' + file, base).href);
    const { Tank } = await load('game/tank.js');
    const { TANK_BY_ID } = await load('game/tankData.js');
    const { Game } = await load('game/game.js');
    const { BattlefieldPhysics, initPhysics } = await load('game/physics.js');
    const engine = await initPhysics();
    const { Terrain } = await load('world/terrain.js');
    const { TouchControls } = await load('ui/touchControls.js');
    const { THREE } = await load('models/tankModel.js');

    const terrain = new Terrain(200, 2);
    const world = { terrain, playHalf: 200, colliders: [], decks: [], groundHeight: () => 0, veg: { knock: () => false, rocks: [] } };
    const game = Object.assign(Object.create(Game.prototype), {
      world, scene: new THREE.Scene(), keys: {}, time: 0, cam: { yaw: Math.PI / 2, pitch: 0 },
      aimPoint: new THREE.Vector3(), debugAim: true, hud: { root: document.body },
      renderer: { domElement: document.createElement('canvas') },
    });
    const spec = TANK_BY_ID.sherman;
    const fixed = new Tank(game, { ...spec, fixedGun: true }, 0, 'Fixed gun', true);
    const normal = new Tank(game, spec, 0, 'Turret', true);
    const dt = 1 / 60;
    const step = (n = 1) => {
      const tank = game.player;
      for (let i = 0; i < n; i++) {
        game.time += dt;
        game.updatePlayerInput();
        tank.update(dt, game.time);
        game.physics.advance(dt);
        tank.updateAfterMotion(dt);
      }
    };
    function start(tank, heading = 0, speed = 0) {
      game.physics?.free();
      for (const vehicle of [fixed, normal]) vehicle.vehicle = null;
      for (let z = 0; z < terrain.n; z++) for (let x = 0; x < terrain.n; x++) {
        terrain.h[terrain.idx(x, z)] = world.groundHeight(terrain.i2x(x), terrain.i2x(z));
      }
      game.physics = new BattlefieldPhysics(engine, world);
      game.player = tank;
      game.keys = {};
      game.touch = null;
      game.debugAim = true;
      tank.speed = tank.turnRate = 0;
      tank.modules.tracks = 1;
      tank.placeAt(0, 0, heading, speed);
      game.aimPoint.set(90, 2, 0);
    }

    fixed.model.turret.position.x = 0.23;
    fixed.model.gun.position.x = 0.31;
    start(fixed);
    step(25);
    const afterAim = fixed.heading;
    const beforeDrive = fixed.pos.z;
    game.keys.KeyW = true;
    step(70);
    const driving = { heading: fixed.heading, moved: fixed.pos.z - beforeDrive, yaw: fixed.turretYaw, rate: fixed.turnRate, auto: fixed.hullAiming };
    game.keys.KeyW = false;
    step();
    const afterRelease = { heading: fixed.heading, speed: fixed.speed };
    step(540);
    const settled = { heading: fixed.heading, error: fixed.fixedGunHeadingError(), elevation: fixed.gunPitch,
      yaw: fixed.model.turret.rotation.y, speed: fixed.speed, spread: fixed.dispersionProgress };

    start(fixed);
    game.keys = { KeyA: true, KeyD: true };
    step(70);
    const keysCancel = fixed.heading;
    game.keys = { Space: true };
    step(30);
    const brake = fixed.heading;
    game.keys = { KeyD: true };
    step(38);
    const right = fixed.heading;

    start(fixed);
    const touch = game.touch = new TouchControls(game);
    const stick = touch.root.querySelector('.touch-drive');
    stick.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    stick.setPointerCapture = () => {};
    stick.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 43, clientX: 50, clientY: 50 }));
    step(60);
    const touchCentered = { heading: fixed.heading, held: touch.driveHeld, steer: touch.steer, throttle: touch.throttle };
    stick.dispatchEvent(new PointerEvent('pointerup', { pointerId: 43 }));
    step(60);
    const touchReleased = { heading: fixed.heading, held: touch.driveHeld };
    touch.dispose();

    start(fixed, Math.PI - 0.1);
    game.aimPoint.set(-45, 2.15, -90);
    step(26);
    const shortest = fixed.heading;

    start(fixed);
    fixed.modules.tracks = 0;
    step(45);
    const broken = fixed.heading;
    fixed.modules.tracks = 1;
    fixed.airborne = true;
    fixed.vehicle.body.setTranslation({ x: 0, y: 4, z: 0 }, true);
    step(20);
    const airborne = { heading: fixed.heading, flying: fixed.airborne, yaw: fixed.turretYaw };
    step(150);
    const grounded = fixed.heading;

    start(fixed, 0, -6);
    step(8);
    const reversing = { heading: fixed.heading, speed: fixed.speed };

    world.groundHeight = (x, z) => 0.2 * x - 0.16 * z;
    start(fixed);
    game.aimPoint.set(110, 11, 85);
    step(360);
    const gun = fixed.model.gun;
    const aimVector = game.aimPoint.clone().sub(gun.getWorldPosition(new THREE.Vector3()));
    const shot = gun.getWorldDirection(new THREE.Vector3());
    const flight = Math.hypot(aimVector.x, aimVector.z) / (fixed.shell.velocity * Math.hypot(shot.x, shot.z));
    aimVector.y += 0.5 * 9.81 * flight ** 2;
    const slope = { aimAngle: shot.angleTo(aimVector), hullError: fixed.fixedGunHeadingError(), yaw: fixed.turretYaw };

    world.groundHeight = () => 0;
    start(fixed);
    game.debugAim = false;
    game.aimPoint.set(-5, 2, 0);
    step(160);
    const occluded = fixed.heading;

    start(normal);
    step(120);
    game.physics.free();
    return { afterAim, driving, afterRelease, settled, keysCancel, brake, right, touchCentered, touchReleased,
      shortest, broken, airborne, grounded, reversing, slope, occluded, normal: { heading: normal.heading, yaw: normal.turretYaw } };
  }, base);

  assert.ok(result.afterAim > 0.05);
  assert.ok(!result.driving.auto && Math.abs(result.driving.rate) < 0.01);
  assert.ok(Math.abs(result.driving.heading - result.afterAim) < 0.20, JSON.stringify(result));
  assert.equal(result.driving.yaw, 0);
  assert.ok(result.driving.moved > 0.5);
  assert.ok(result.afterRelease.heading > result.driving.heading && result.afterRelease.speed > 0);
  assert.ok(Math.abs(result.settled.error) < 1e-5 && result.settled.yaw === 0 && result.settled.spread === 0, JSON.stringify(result));
  assert.ok(Math.abs(result.keysCancel) < 1e-4);
  assert.ok(Math.abs(result.brake) < 1e-4);
  assert.ok(result.right < -0.1);
  assert.ok(Math.abs(result.touchCentered.heading) < 1e-4);
  assert.deepEqual({ held: result.touchCentered.held, steer: result.touchCentered.steer, throttle: result.touchCentered.throttle },
    { held: true, steer: 0, throttle: 0 });
  assert.equal(result.touchReleased.held, false);
  assert.ok(result.touchReleased.heading > 0.1);
  assert.ok(result.shortest < -Math.PI + 0.5);
  assert.ok(Math.abs(result.broken) < 1e-4);
  assert.ok(result.airborne.flying && Math.abs(result.airborne.heading) < 1e-4 && result.airborne.yaw === 0);
  assert.ok(result.grounded > 0.5);
  assert.ok(result.reversing.heading > 0 && result.reversing.speed < 0);
  assert.ok(result.slope.aimAngle < 0.002 && Math.abs(result.slope.hullError) < 1e-5 && result.slope.yaw === 0,
    JSON.stringify(result.slope));
  assert.ok(Math.abs(result.occluded - Math.PI / 2) < 0.02);
  assert.ok(Math.abs(result.normal.heading) < 1e-4);
  assert.ok(result.normal.yaw > 0.5);
  console.log('Fixed gun aim, drive priority, joystick release, ground constraints and normal turret checks passed.');
} finally {
  await browser.close();
}
