import assert from 'node:assert/strict';
import { FramePacing, simulationSteps, smoothingAlpha } from './src/render/framePacing.js';
for (const dt of [1/144, 1/60, 1/30, 0.05, 0.08, 0.1, 2]) {
  const steps = simulationSteps(dt);
  assert.ok(steps.every(v => v > 0 && v <= 1/30 + 1e-9));
  assert.ok(Math.abs(steps.reduce((a,b)=>a+b,0) - Math.min(dt,0.1)) < 1e-9);
}
assert.deepEqual(simulationSteps(0), []);
assert.ok(Math.abs((1-smoothingAlpha(14,1/60))**6 - (1-smoothingAlpha(14,0.1))) < 1e-12);
const p = new FramePacing(1.5,0.7);
for (let i=0;i<60;i++) p.sample(1/25);
assert.ok(p.ratio < 1.5 && p.ratio >= 0.7);
for (let i=0;i<1000;i++) p.sample(1/25);
assert.equal(p.ratio,0.7);
p.sample(5); assert.equal(p.ratio,0.7);
for (let i=0;i<300;i++) p.sample(1/60);
assert.equal(p.ratio,0.7);
for (let i=0;i<450;i++) p.sample(1/60);
assert.ok(p.ratio > 0.7 && p.ratio <= 1.5);
const stable = new FramePacing(1);
for (let i=0;i<500;i++) stable.sample(1/60);
assert.equal(stable.ratio,1);
console.log('Frame pacing regression tests passed.');
