import assert from 'node:assert/strict';
import { CAPTURE_SECONDS, createCaptureState, resetCaptureContribution, updateCaptureState } from './src/game/capture.js';
const base = { x: 0, z: 0, r: 20 };
const tank = (team = 1) => ({ team, alive: true, pos: { x: 0, z: 0 } });
const fixture = (tanks) => {
  const cap = createCaptureState(); let time = 0;
  const tick = (dt = 1) => { time += dt; updateCaptureState(cap, base, tanks, 0, dt, time); };
  const hit = (t) => resetCaptureContribution([cap], t, time);
  const hitFrame = (t, dt = 1) => { time += dt; resetCaptureContribution([cap], t, time); updateCaptureState(cap, base, tanks, 0, dt, time); };
  const near = (expected) => assert.ok(Math.abs(cap.points - expected) < 1e-8, 'Expected ' + expected + ', got ' + cap.points);
  return { cap, tick, hit, hitFrame, near };
};
{
  const a = tank(), f = fixture([a]); f.tick(); f.near(0);
  for (let i = 0; i < CAPTURE_SECONDS * 20 - 1; i++) f.tick(0.05);
  assert.ok(f.cap.points < 100); f.tick(0.05); f.near(100);
}
{
  const a = tank(), b = tank(), f = fixture([a,b]); f.tick(); f.tick(60); f.near(50);
  f.hitFrame(a); f.near(61 / 240 * 100);
  f.tick(12); f.near(85 / 240 * 100);
  a.pos.x = 20; f.tick(); f.near(74 / 240 * 100);
  a.pos.x = 0; f.tick(); f.near(75 / 240 * 100);
  f.tick(24); f.near(123 / 240 * 100);
  b.alive = false; f.tick(); f.near(25 / 240 * 100);
  a.pos.x = 30; f.tick(); f.near(0);
}
{
  const a = tank(), b = tank(), d = tank(0); d.pos.x = 30;
  const f = fixture([a,b,d]); f.tick(); f.tick(60); f.near(50);
  d.pos.x = 0; f.tick(60); f.near(50); assert.equal(f.cap.contested,true);
  f.hit(a); f.near(25); a.pos.x = 30; f.tick(); f.near(25);
  b.pos.x = 30; f.tick(); f.near(0); assert.equal(f.cap.contested,false);
}
{
  const a = tank(), b = tank(); const f = fixture([a,b]); f.tick(); f.tick(119); assert.ok(f.cap.points < 100); f.tick(); f.near(100);
}
{
  const ts = Array.from({length:7},()=>tank()); const f = fixture(ts); f.tick(); f.tick(30); f.near(87.5); f.tick(5); f.near(100);
}
console.log('Capture regression tests passed.');
