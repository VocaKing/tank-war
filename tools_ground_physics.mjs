import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BattlefieldPhysics, initPhysics, PHYSICS_STEP } from './src/game/physics.js';
import { Terrain, OBB } from './src/world/terrain.js';

const engine = await initPhysics();
const spec = {
  mass: 32, power: 500, maxSpeed: 48, reverseSpeed: 6, hullTraverse: 34,
  dims: { W: 3, L: 6.27, trackW: 0.58, hullH: 1.9, turretW: 2.1, turretL: 2.3, turretH: 0.78 },
};

function makeWorld(height, colliders = [], decks = [], deckHeight = () => -Infinity) {
  const terrain = new Terrain(100, 2);
  for (let z = 0; z < terrain.n; z++) for (let x = 0; x < terrain.n; x++) {
    terrain.h[terrain.idx(x, z)] = height(terrain.i2x(x), terrain.i2x(z));
  }
  const groundHeight = (x, z) => Math.max(terrain.height(x, z), deckHeight(x, z));
  const physics = new BattlefieldPhysics(engine, { terrain, playHalf: 100, colliders, decks,
    veg: { rocks: [] }, groundHeight });
  function spawn(z, speed, x = 0) {
    const pitch = -Math.atan((groundHeight(x, z + 1) - groundHeight(x, z - 1)) / 2);
    const roll = Math.atan((groundHeight(x + 1, z) - groundHeight(x - 1, z)) / 2);
    const tank = {
      spec, pos: new THREE.Vector3(x, groundHeight(x, z) + 0.01, z),
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

{
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
        tank.input.throttle = -1;
        tank.input.steer = 1;
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
  for (let i = 0; i < 130; i++) {
    physics.advance(PHYSICS_STEP);
    assert.ok(!tank.airborne && tank.vehicle.contact > 0);
    assert.ok(Math.abs(tank.pos.y - groundHeight(tank.pos.x, tank.pos.z)) < 0.1);
  }
  assert.ok(tank.pos.z > 0);
  physics.free();
}

console.log('Rapier downhill steering, fixed timestep, airborne inertia, contacts, and bridge checks passed.');
