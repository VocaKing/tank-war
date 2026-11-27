import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync('src/game/game.js', 'utf8');
const tank = readFileSync('src/game/tank.js', 'utf8');
const inputStart = game.indexOf('  updatePlayerInput() {');
const aimStart = game.indexOf('  updatePlayerGunAim(dt) {');
const loopStart = game.indexOf('  update(dt) {');
const inputBody = game.slice(inputStart, aimStart);
const frame = game.slice(loopStart);
const compute = frame.indexOf('this.computeAim();');
const servo = frame.indexOf('this.updatePlayerGunAim(dt);');
const reticle = frame.indexOf('this.updateReticle();', servo);
const fire = frame.indexOf('this.player.tryFire(this.time)', reticle);

assert.ok(inputStart >= 0 && aimStart > inputStart && loopStart > aimStart);
assert.ok(!inputBody.includes('p.tryFire('), 'input collection must not fire using stale aim');
assert.ok(!inputBody.includes('p.input.aim.copy('), 'input collection must not overwrite aim before camera ray calculation');
assert.ok(compute >= 0 && servo > compute, 'camera ray and target lock must be resolved before gun laying');
assert.ok(reticle > servo, 'impact reticle must use the newly synchronized gun pose');
assert.ok(fire > reticle, 'shots must use the same-frame aim and gun pose as the reticle');
assert.ok(frame.indexOf('t.updateAfterMotion(dt, t !== this.player);') >= 0,
  'the player turret servo must not be advanced once with stale aim before camera calculation');
assert.ok(tank.includes('updateAfterMotion(dt, updateGun = true)'));
assert.ok(tank.includes('if (updateGun) this.updateTurret(dt);'));
console.log('Player aim sync verified: current-frame camera aim -> gun servo -> impact reticle -> firing.');

const reticleStart = game.indexOf('  updateReticle() {');
const reticleEnd = game.indexOf('  updateCamera(dt) {', reticleStart);
const reticleBody = game.slice(reticleStart, reticleEnd);
assert.ok(reticleBody.includes('p.previewLaunch(aim)'), 'impact preview must use the gun input aim point');
assert.ok(reticleBody.includes('shot.shell.guided ? aim : undefined'), 'guided-shot preview must share the firing target');
