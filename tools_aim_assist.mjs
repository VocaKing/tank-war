import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { AIM_ASSIST, AimAssist } from './src/game/aimAssist.js';

function vehicle(left, right, team = 1) {
  const root = new Group(), body = new Group(), turret = new Group();
  root.add(body);
  body.add(turret);
  return { left, right, team, alive: true, spotted: [true], model: { root, body, turret },
    spec: { dims: { L: 6, W: 3, hullH: 1.4, turretH: .7 } } };
}

const a = vehicle(-.22, .22), b = vehicle(.42, .62), ally = vehicle(.34, .38, 0);
const origin = new Vector3();
const game = {
  time: 0, viewportHeight: 600, player: { alive: true, team: 0 }, tanks: [b, a, ally],
  camera: { position: origin, fov: 32, getWorldDirection(out) { return out.copy(game.camDir()); } },
  cam: { yaw: 0, pitch: 0, sniper: true }, cursorPoint: new Vector3(),
  camDir(yaw = this.cam.yaw, pitch = this.cam.pitch) {
    return new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  },
  cameraPositionFor() { return origin; },
  limitCameraPitch(pitch) { return Math.min(.45, Math.max(-.35, pitch)); },
  alignCamTo(point, dt, yawOffset, pitchOffset) {
    this.cam.yaw = Math.atan2(point.x, point.z) + yawOffset;
    this.cam.pitch = this.limitCameraPitch(Math.atan2(point.y, Math.hypot(point.x, point.z)) + pitchOffset);
  },
  traceAim(position, direction) {
    const yaw = Math.atan2(direction.x, direction.z);
    const tank = this.tanks.find(v => v.alive && (v.team === 0 || v.spotted[0]) && yaw >= v.left && yaw <= v.right);
    return tank ? { tank, hit: { part: direction.y > .025 ? 'turret' : 'hull' }, point: direction.clone().multiplyScalar(25) } : null;
  },
};
const assist = new AimAssist(game);

function tick(frames = 1) {
  for (let i = 0; i < frames; i++) {
    game.time += 1 / 60;
    assist.preCamera(1 / 60);
    const hit = game.traceAim(origin, game.camDir());
    game.aimTank = hit?.tank ?? null;
    game.aimHit = hit?.hit ?? null;
    if (hit) game.cursorPoint.copy(hit.point);
    assist.postAim(1 / 60);
  }
}

function move(yaw, pitch = game.cam.pitch) {
  const [turn, tilt] = assist.look(game.cam.yaw - yaw, game.cam.pitch - pitch, 1);
  game.cam.yaw += turn;
  game.cam.pitch += tilt;
  tick();
}

tick(16);
assert.equal(assist.target, null, 'No stationary acquisition');
move(-.20);
tick(16);
assert.equal(assist.target, a);
move(.204, .042);
assert.equal(assist.target, a);
assert.equal(assist.part, 'turret');
assert.equal(assist.dragFactor(), 1, 'Fast motion between two points on one vehicle has full sensitivity');
tick(10);
assert.ok(Math.abs(game.cam.yaw - .204) < 1e-9, 'An off-center selected point must stay selected');

move(.24);
assert.equal(assist.target, a);
assert.equal(assist.dragFactor(), AIM_ASSIST.EDGE_DRAG);
assert.ok(game.cam.yaw > .22 && game.cam.yaw < .24, 'Only the part of the move beyond the edge is resisted');
move(.21, 0);
assert.equal(assist.dragFactor(), 1);
assert.equal(assist.part, 'hull');
move(.51);
assert.equal(assist.target, b, 'Another enemy can take over on the first motion');
assert.equal(assist.dragFactor(), 1);

a.left = .49;
a.right = .54;
game.tanks = [a, b, ally];
tick();
assert.equal(game.aimTank, a);
assert.equal(assist.target, b, 'An enemy entering a stationary crosshair does not switch the lock');
move(.52);
assert.equal(assist.target, a);
move(.1);
assert.equal(assist.target, null, 'A deliberate move into free space releases the lock');
move(.47);
assert.equal(assist.target, b, 'A continued manual movement through open space can hand off immediately');
move(.36);
assert.equal(assist.target, null, 'A teammate cannot take over the lock');

assist.setEnabled(false);
move(.45);
assert.equal(assist.target, null);
assert.equal(assist.toggleManual(), 'locked');
assert.equal(assist.target, b);
move(.5);
assert.equal(assist.target, a);
assert.equal(assist.manual, true);
assert.equal(assist.toggleManual(), 'released');
assert.equal(assist.target, null);
assert.equal(assist.toggleManual(), 'locked');
a.spotted[0] = false;
tick(15);
assert.equal(assist.target, null, 'A concealed target loses its lock without passively switching');
console.log('Verified aim acquisition, free aiming on armor, silhouette resistance, and deliberate soft and E-lock handoffs.');
