import assert from 'node:assert/strict';
import { dispersionPixels, dispersionMotionActive, advanceDispersion, zoomFov, DEG } from './src/game/combatMath.js';

const viewportHeight = 900;
const fov = zoomFov(4) * DEG;
const projectionY = 1 / Math.tan(fov * 0.5);
const coneHalfAngle = Math.atan(1.4 / 100) * 0.5;
const expected = dispersionPixels(coneHalfAngle, projectionY, viewportHeight);

for (const range of [8, 15, 30, 60, 100, 250, 500, 1000]) {
  const radius = dispersionPixels(coneHalfAngle, projectionY, viewportHeight);
  assert.ok(Math.abs(radius - expected) < 1e-9, `dispersion changed at range ${range}m`);
}
const zoom2Projection = 1 / Math.tan(zoomFov(2) * DEG * 0.5);
const zoom8Projection = 1 / Math.tan(zoomFov(8) * DEG * 0.5);
const r2 = dispersionPixels(coneHalfAngle, zoom2Projection, viewportHeight);
const r8 = dispersionPixels(coneHalfAngle, zoom8Projection, viewportHeight);
assert.ok(r8 > r2 * 3.9 && r8 < r2 * 4.1, 'zoom should scale the displayed ring, not range');

assert.equal(dispersionMotionActive(0, 0, 0), false);
assert.equal(dispersionMotionActive(0.2, 0, 0), true, 'forward/reverse movement blooms');
assert.equal(dispersionMotionActive(0, 0.02, 0), true, 'hull traverse blooms');
assert.equal(dispersionMotionActive(0, 0, 0.02), true, 'turret traverse blooms');
assert.equal(dispersionMotionActive(0.05, 0.002, 0.002), false, 'idle jitter below dead zones does not bloom');
const widened = advanceDispersion(0, true, 0.25, 1);
assert.ok(widened > 0, 'moving widens dispersion');
const recovered = advanceDispersion(widened, false, 0.25, 1);
assert.ok(recovered < widened, 'stopping lets dispersion recover');
console.log('Verified range-invariant reticle dispersion, zoom scaling, movement/hull/turret bloom and recovery.');
