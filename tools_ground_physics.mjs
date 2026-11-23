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
  const report = await page.evaluate(async (base) => {
    const load = (file) => import(new URL('src/' + file, base).href);
    const { Tank } = await load('game/tank.js');
    const { TANKS } = await load('game/tankData.js');
    const { Game } = await load('game/game.js');
    const { World } = await load('world/world.js');
    const { Terrain, Grid2D, OBB } = await load('world/terrain.js');
    const { THREE } = await load('models/tankModel.js');
    const terrain = new Terrain(120, 1);
    const groundHeight = (_, z) => Math.min(8, Math.max(0, (z + 20) * 0.4));
    const spec = TANKS.find(t => t.id === 'sherman');
    const world = { terrain, groundHeight, playHalf: 100, colGrid: new Grid2D(120, 24),
      veg: { rockGrid: new Grid2D(120, 16), knock: () => false }, structureHit: World.prototype.structureHit };
    const game = Object.assign(Object.create(Game.prototype), { world, scene: new THREE.Scene(),
      cam: { dist: 12 }, tanks: [], player: null });
    const p = new Tank(game, spec, 0, 'Player', true);
    const a = new Tank(game, spec, 1, 'Opponent');
    game.player = p;
    game.tanks = [p, a];
    function simulate(speed, dt, start = -14, heading = 0, height = groundHeight) {
      world.groundHeight = height;
      p.speed = speed;
      p.placeAt(0, start, heading);
      let flew = false, landed = false, landedSpeed = 0, airtime = 0, gap = 0, airControl = true;
      for (let i = 0; i < 5 / dt; i++) {
        if (!flew || !p.airborne) {
          p.pos.z += Math.cos(heading) * speed * dt;
        } else {
          p.input.throttle = -1;
          p.input.steer = 1;
          const h = p.heading, speedBefore = p.speed;
          p.update(dt, i * dt);
          airControl &&= p.heading === h && p.speed === speedBefore;
        }
        p.updateGround(dt);
        if (p.airborne) {
          flew = true;
          airtime += dt;
          gap = Math.max(gap, p.pos.y - p.groundY);
        }
        if (flew && !p.airborne) { landed = true; landedSpeed = p.landingSpeed; break; }
      }
      return { flew, landed, landedSpeed, airtime, gap, airControl };
    }
    const ramp = [30, 60, 120].map(hz => ({ hz, ...simulate(14, 1 / hz) }));
    const slow = simulate(3, 1 / 60, -8);
    const reverse = simulate(-14, 1 / 60, -14, Math.PI);
    const flat = simulate(14, 1 / 60, -14, 0, () => 0);
    const overDrop = simulate(16, 1 / 60, -14, 0, (_, z) => -Math.max(0, z * 0.5));
    function driveSlope(speed, dt, grade, roughness) {
      const tile = 2;
      world.groundHeight = (x, z) => {
        const i = Math.floor(z / tile), frac = z / tile - i;
        const bump = (i % 2 === 0 ? 1 : -1) * (1 - 2 * frac) * roughness;
        return grade * z + 0.12 * x + bump;
      };
      p.speed = speed;
      p.placeAt(0, -30, 0);
      let hops = 0, maxStepNoise = 0, maxHeightOffset = 0;
      for (let i = 0; i < 4 / dt; i++) {
        const { y, z } = p.pos;
        const wasAirborne = p.airborne;
        p.pos.z += speed * dt;
        p.updateGround(dt);
        if (!wasAirborne && p.airborne) hops++;
        maxStepNoise = Math.max(maxStepNoise, Math.abs(p.pos.y - y - grade * (p.pos.z - z)));
        maxHeightOffset = Math.max(maxHeightOffset, Math.abs(p.pos.y - grade * p.pos.z));
      }
      return { speed, dt, grade, roughness, hops, maxStepNoise, maxHeightOffset };
    }
    const slopes = [30, 60, 120].flatMap(hz => [0.3, -0.3].flatMap(grade => [
      driveSlope(14, 1 / hz, grade, 0),
      driveSlope(14, 1 / hz, grade, 0.05),
      driveSlope(3, 1 / hz, grade, 0.05),
    ]));
    world.groundHeight = () => 0;
    p.placeAt(0, 0, 0);
    a.placeAt(0, spec.dims.L - 0.6, 0);
    game.resolveCollisions();
    const nose = a.pos.z - p.pos.z;
    p.placeAt(0, 0, 0);
    a.placeAt(spec.dims.W + 0.15, 0, 0);
    game.resolveCollisions();
    const stoppedSideGap = a.pos.x;
    a.placeAt(0, 0, 0);
    a.pos.y = 10;
    game.resolveCollisions();
    const elevated = [p.pos.x, p.pos.z, a.pos.x, a.pos.z];
    a.placeAt(0, 0, 0);
    game.resolveCollisions();
    const stackedSeparation = p.pos.distanceTo(a.pos);
    const wall = new OBB(0, -1.7, 8, 0.1, 0, -1, 9, 'wall');
    world.colGrid.insert(wall, wall.x, wall.z, wall.r);
    const pos = game.camPosFor(new THREE.Vector3(0, 0, 1), false);
    const focus = p.model.turret.getWorldPosition(new THREE.Vector3()); focus.y += 2.2;
    const interpolated = game.constrainCamera(focus, new THREE.Vector3(0, focus.y, -10), 0.42);
    const scope = game.camPosFor(new THREE.Vector3(0, 0, -1), true);
    const hits = [
      world.structureHit(0, 1, 0, 0, 1, -1.4),
      world.structureHit(0, 1, 0, 0, 1, -1.4, 0.42),
    ];
    return { ramp, reverse, flat, overDrop, slow, slopes, nose, width: spec.dims.W, length: spec.dims.L,
      stoppedSideGap, elevated, stackedSeparation, pos: pos.z, interpolated: interpolated.z, scope: scope.z, hits };
  }, base);
  for (const sample of [...report.ramp, report.reverse, report.overDrop]) {
    assert.ok(sample.flew && sample.landed && sample.airControl && sample.airtime > 0.15, JSON.stringify(sample));
    assert.ok(sample.landedSpeed > 0 && sample.gap > 0.1);
  }
  assert.ok(!report.slow.flew && !report.flat.flew);
  for (const sample of report.slopes) {
    assert.equal(sample.hops, 0, JSON.stringify(sample));
    assert.ok(sample.maxStepNoise < 0.035 && sample.maxHeightOffset < 0.18, JSON.stringify(sample));
  }
  assert.ok(report.nose >= report.length);
  assert.equal(report.stoppedSideGap, report.width + 0.15);
  assert.deepEqual(report.elevated, [0, 0, 0, 0]);
  assert.ok(report.stackedSeparation >= report.width);
  assert.ok(report.pos > -1.25 && report.pos < -0.5);
  assert.ok(report.interpolated > -1.25 && report.interpolated < -0.5);
  assert.ok(report.scope > -1.55 && report.scope < -0.5);
  assert.equal(report.hits[0], -1);
  assert.ok(report.hits[1] >= 0);
  assert.ok(Math.max(...report.ramp.map(r => r.airtime)) - Math.min(...report.ramp.map(r => r.airtime)) < 0.05);
  console.log('Stable slope travel, vehicle takeoff and landing, tank contact and camera collision checks passed.');
} finally { await browser.close(); }
