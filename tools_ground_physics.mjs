import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BattlefieldPhysics, initPhysics, PHYSICS_STEP } from './src/game/physics.js';
import { Terrain, OBB } from './src/world/terrain.js';

const engine = await initPhysics();
const spec = {
  mass: 32, power: 500, maxSpeed: 48, reverseSpeed: 6, hullTraverse: 34,
  dims: { W: 3, L: 6.27, trackW: 0.58, hullH: 1.9, turretW: 2.1, turretL: 2.3, turretH: 0.78 },
};

function makeWorld(height, colliders = [], decks = [], deckHeight = () => -Infinity, water = () => -1e9) {
  const terrain = new Terrain(100, 2);
  for (let z = 0; z < terrain.n; z++) for (let x = 0; x < terrain.n; x++) {
    const idx = terrain.idx(x, z), wx = terrain.i2x(x), wz = terrain.i2x(z);
    terrain.h[idx] = height(wx, wz);
    terrain.water[idx] = water(wx, wz);
  }
  const groundHeight = (x, z) => Math.max(terrain.height(x, z), deckHeight(x, z));
  const physics = new BattlefieldPhysics(engine, { terrain, playHalf: 100, colliders, decks,
    veg: { rocks: [] }, groundHeight });
  function spawn(z, speed, x = 0, mass = spec.mass) {
    const pitch = -Math.atan((groundHeight(x, z + 1) - groundHeight(x, z - 1)) / 2);
    const roll = Math.atan((groundHeight(x + 1, z) - groundHeight(x - 1, z)) / 2);
    const tank = {
      spec: { ...spec, mass }, pos: new THREE.Vector3(x, groundHeight(x, z) + 0.01, z),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, roll, 'YXZ')),
      vel: new THREE.Vector3(), input: { throttle: 0, steer: 0 }, alive: true,
      modules: { engine: 1, tracks: 1 }, equip: { active: () => false, factor: 1 }, crewAlive: () => true,
    };
    physics.place(tank, speed);
    return tank;
  }
  return { physics, spawn, groundHeight };
}

const roughSlope = (x, z) => -0.38 * z + 0.12 * x + 0.045 * Math.sin(z * 0.9) * Math.cos(x * 0.4);
function steerDownhill(steer, hz) {
  const { physics, spawn, groundHeight } = makeWorld(roughSlope);
  const tank = spawn(-28, 10);
  tank.input.throttle = 1;
  tank.input.steer = steer;
  let minGap = Infinity, maxGap = -Infinity;
  for (let i = 0; i < hz * 3; i++) {
    physics.advance(1 / hz);
    assert.ok(!tank.airborne && tank.vehicle.contact > 0, 'continuous downhill contact');
    const gap = tank.pos.y - groundHeight(tank.pos.x, tank.pos.z);
    minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
  }
  assert.ok(maxGap - minGap < 0.15, { minGap, maxGap });
  assert.ok(tank.pos.z > -5 && Math.abs(tank.pos.x) > 6);
  assert.ok(tank.heading * steer > 0.35);
  physics.free();
  return tank.pos.toArray();
}

for (const steer of [-0.6, 0.6]) {
  const path = [30, 60, 120].map(hz => steerDownhill(steer, hz));
  assert.deepEqual(path[0], path[1], 'same integrated motion at different render rates');
  assert.deepEqual(path[0], path[2]);
}

function brakeFrom(grade, speed, mass = 33.7) {
  const { physics, spawn } = makeWorld((_, z) => -grade * z);
  const tank = spawn(-22, speed, 0, mass);
  tank.input.driveHeld = true;
  physics.advance(0.1);
  assert.equal(tank.vehicle.autoBrake, 0, 'a held direction control does not engage the automatic brake');

  const start = tank.pos.clone(), initialSpeed = Math.abs(tank.speed);
  tank.input.driveHeld = false;
  physics.advance(1 / 30);
  assert.ok(tank.vehicle.autoBrake > 0 && tank.vehicle.autoBrake < 1);
  assert.ok(Math.abs(tank.speed) > initialSpeed * 0.9 && tank.pos.distanceTo(start) > 0.1,
    'the hull carries momentum just after the controls are released');
  physics.advance(0.075 - 1 / 30);
  const engagedSpeed = Math.abs(tank.speed);
  const interval = 0.075;
  physics.advance(interval);
  const remainingSpeed = Math.abs(tank.speed);
  assert.ok(remainingSpeed > 0.5 && remainingSpeed < engagedSpeed,
    'the brake slows the hull before it comes to rest');
  physics.advance(1.5);
  const distance = tank.pos.distanceTo(start), stopped = tank.pos.clone();
  assert.ok(Math.abs(tank.speed) < 0.05 && distance > 0.3, { grade, speed, distance, finalSpeed: tank.speed });
  assert.equal(Math.sign(tank.pos.z - start.z), Math.sign(speed));
  physics.advance(1.5);
  assert.ok(tank.pos.distanceTo(stopped) < 0.08, 'the stopped tank holds its position');

  tank.input.driveHeld = true;
  tank.input.throttle = 1;
  physics.advance(0.35);
  assert.equal(tank.vehicle.autoBrake, 0);
  assert.ok(tank.speed > 0.8, 'new drive input releases the automatic brake');
  physics.free();
  return { distance, deceleration: (engagedSpeed - remainingSpeed) / interval };
}

const shermanBrake = brakeFrom(0, 10.7);
assert.ok(shermanBrake.distance >= 2 && shermanBrake.distance <= 3, shermanBrake.distance);
assert.ok(brakeFrom(0, 5.5).distance < shermanBrake.distance / 2);
assert.ok(brakeFrom(0, 15.5).distance > shermanBrake.distance * 1.8);
assert.ok(brakeFrom(0, -6).distance < 1.2);
assert.ok(brakeFrom(0.34, 10.7).distance < 3.5);
for (const [mass, factor] of [[18, 18 / 33.7], [66, 66 / 33.7], [188, 2.5]]) {
  const sample = brakeFrom(0, 10.7, mass);
  assert.ok(Math.abs(sample.deceleration / shermanBrake.deceleration - factor) < 0.04, { mass, sample });
}

for (const roll of [Math.PI / 2, Math.PI]) {
  const { physics, spawn } = makeWorld((_, z) => -Math.max(0, Math.min(1.4, (8 - Math.abs(z)) * 0.48)));
  const tank = spawn(0, 0);
  tank.pos.y += tank.spec.dims.hullH + tank.spec.dims.turretH + 0.1;
  tank.quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
  physics.place(tank);
  const upright = () => new THREE.Vector3(0, 1, 0).applyQuaternion(tank.quat).y;
  for (let i = 0; i < 240; i++) physics.advance(PHYSICS_STEP);
  assert.ok(upright() < 0.2 && tank.vehicle.contact > 0 && !tank.airborne,
    'an overturned hull lying in the ditch is grounded');

  const rest = tank.pos.clone();
  tank.modules.tracks = 0;
  tank.input.throttle = -1;
  for (let i = 0; i < 120; i++) physics.advance(PHYSICS_STEP);
  assert.ok(upright() < 0.2 && tank.pos.distanceTo(rest) < 0.1, 'disabled tracks cannot recover the hull');

  tank.modules.tracks = 1;
  for (let i = 0; i < 540; i++) physics.advance(PHYSICS_STEP);
  assert.ok(upright() > 0.8 && tank.vehicle.contact > 0, 'reverse input puts the tracks back on the ground');
  assert.ok(tank.pos.z < rest.z - 1, 'the vehicle can reverse after righting');
  tank.input.throttle = 0;
  for (let i = 0; i < 120; i++) physics.advance(PHYSICS_STEP);
  tank.input.steer = 1;
  const heading = tank.heading;
  for (let i = 0; i < 150; i++) physics.advance(PHYSICS_STEP);
  assert.ok(Math.abs(Math.sin(tank.heading - heading)) > 0.25, 'steering responds after recovery');
  physics.free();
}

{
  const { physics, spawn } = makeWorld(x => Math.max(-0.95, 1.4 - Math.abs(x) * 1.2));
  const tank = spawn(0, 0);
  for (let i = 0; i < 120; i++) physics.advance(PHYSICS_STEP);
  const start = tank.pos.clone();
  assert.ok(tank.vehicle.contact > 0 && !tank.airborne && Math.abs(tank.speed) < 0.05);
  tank.input.throttle = 1;
  for (let i = 0; i < 360; i++) physics.advance(PHYSICS_STEP);
  assert.ok(tank.pos.z > start.z + 1.5, 'a chassis grounded on a ridge can crawl off its belly');
  physics.free();
}

for (const releaseInAir of [false, true]) {
  const { physics, spawn } = makeWorld((_, z) => -Math.max(0, z * 0.5));
  const tank = spawn(-14, 16);
  tank.input.throttle = 1;
  let begin = null, end = null, airborneSteps = 0, completed = false;
  for (let i = 0; i < 470; i++) {
    const wasAirborne = tank.airborne;
    physics.advance(PHYSICS_STEP);
    if (tank.airborne) {
      airborneSteps++;
      if (!begin) {
        begin = { speed: tank.vel.z, vy: tank.vel.y, x: tank.pos.x };
        tank.input.throttle = releaseInAir ? 0 : -1;
        tank.input.steer = releaseInAir ? 0 : 1;
      }
      end = { speed: tank.vel.z, vy: tank.vel.y, x: tank.pos.x };
    } else if (wasAirborne) {
      assert.ok(tank.landingSpeed > 2);
      completed = true;
      break;
    }
  }
  assert.ok(completed && airborneSteps >= 45);
  assert.ok(Math.abs(end.speed - begin.speed) < 0.30, 'horizontal momentum in air');
  assert.ok(Math.abs(end.x - begin.x) < 0.05, 'steering creates no traction in air');
  assert.ok(Math.abs((begin.vy - end.vy) - 9.81 * (airborneSteps - 1) * PHYSICS_STEP) < 0.18);
  physics.free();
}

{
  const wall = new OBB(0, 0, 10, 0.15, 0, -1, 5, 'wall');
  const { physics, spawn } = makeWorld(() => 0, [wall]);
  const tank = spawn(-10, 23);
  tank.input.throttle = 1;
  for (let i = 0; i < 160; i++) physics.advance(PHYSICS_STEP);
  assert.ok(tank.pos.z < -2.98 && tank.pos.z > -4.3, tank.pos.z);
  assert.ok(Math.abs(tank.vel.z) < 0.5);
  physics.free();
}

{
  const { physics, spawn } = makeWorld(() => 0);
  const rear = spawn(-10, 15), front = spawn(0, 0);
  rear.input.throttle = 1;
  for (let i = 0; i < 115; i++) physics.advance(PHYSICS_STEP);
  assert.ok(front.pos.z > 1.0, 'collision transfers momentum to the front tank');
  assert.ok(front.pos.z - rear.pos.z > 6.23);
  physics.free();
}

{
  const deckY = u => 0.4 + u * 2;
  const deck = { hw: 3, len: 20, deckY,
    segs: [{ ax: 0, az: -10, ux: 0, uz: 1, l: 10, s0: 0 }, { ax: 0, az: 0, ux: 0, uz: 1, l: 10, s0: 10 }] };
  const { physics, spawn, groundHeight } = makeWorld(() => -2, [], [deck],
    (x, z) => Math.abs(x) <= 3 && Math.abs(z) <= 10 ? deckY((z + 10) / 20) : -Infinity);
  const tank = spawn(-4, 6);
  tank.input.throttle = 1;
  for (let i = 0; i < 130; i++) {
    physics.advance(PHYSICS_STEP);
    assert.ok(!tank.airborne && tank.vehicle.contact > 0);
    assert.ok(Math.abs(tank.pos.y - groundHeight(tank.pos.x, tank.pos.z)) < 0.1);
  }
  assert.ok(tank.pos.z > 0);
  physics.free();
}

for (const brokenSide of [-1, 1]) {
  for (const steer of [-1, 1]) {
    const { physics, spawn } = makeWorld(() => 0);
    const tank = spawn(0, 0);
    tank.modules.tracks = 0.5;
    tank.brokenTrackSide = brokenSide;
    tank.input.steer = steer;
    for (let i = 0; i < 240; i++) physics.advance(PHYSICS_STEP);
    assert.ok(tank.heading * steer > 0.2 && tank.heading * steer < 0.3, tank.heading);
    assert.ok(tank.pos.z * brokenSide * steer > 0.1, 'the hull arcs around the disabled side');
    assert.ok(Math.abs(tank.speed) < 0.4);
    physics.free();
  }
}

{
  const { physics, spawn } = makeWorld(() => 0);
  const tank = spawn(0, 0);
  tank.modules.tracks = 0;
  tank.input.steer = tank.input.throttle = 1;
  for (let i = 0; i < 240; i++) physics.advance(PHYSICS_STEP);
  assert.ok(Math.abs(tank.heading) < 0.01 && tank.pos.length() < 0.1);
  physics.free();
}

{
  const height = (_, z) => -Math.max(0, Math.min(3, (z + 6) * 0.24, (26 - z) * 0.24));
  const water = (_, z) => z >= -6 && z <= 26 ? 0 : -1e9;
  const { physics, spawn } = makeWorld(height, [], [], () => -Infinity, water);
  const tank = spawn(-12, 2);
  tank.spec = { ...spec, amphibious: { speed: 12, draft: 0.55 } };
  tank.input.throttle = 1;
  let afloatSteps = 0, floatBeforeExit = false;
  for (let i = 0; i < 1900; i++) {
    physics.advance(PHYSICS_STEP);
    if (tank.afloat && !tank.vehicle.contact && tank.pos.z > 4 && tank.pos.z < 16) {
      afloatSteps++;
      assert.ok(tank.pos.y > -0.8 && tank.pos.y < -0.35 && !tank.airborne);
      assert.ok(Math.abs(tank.speed) < 3.7);
    }
    if (tank.afloat && tank.pos.z > 17) floatBeforeExit = true;
    if (tank.pos.z > 33) break;
  }
  assert.ok(afloatSteps > 120 && floatBeforeExit);
  assert.ok(tank.pos.z > 33 && !tank.afloat && tank.vehicle.contact > 0, 'swims onto the far bank');
  physics.free();
}

console.log('Rapier automatic braking, downhill, ditch recovery, airborne, collision, bridge, damaged-track steering, and amphibious crossing checks passed.');
