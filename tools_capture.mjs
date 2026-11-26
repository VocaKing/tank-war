import assert from 'node:assert/strict';
import { CAPTURE_SECONDS, CAPTURE_RADIUS, insideCapture, personalCapturePercent, createCaptureState, resetCaptureContribution, updateCaptureState } from './src/game/capture.js';
import { captureRingData } from './src/world/baseMarker.js';
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
{
  const b = {x:10,z:20,r:CAPTURE_RADIUS}, a=tank(), d=tank(0), cap=createCaptureState();
  a.pos={x:35,z:20}; assert.equal(insideCapture(a,b),false);
  a.pos.x=34.99; assert.equal(insideCapture(a,b),true);
  d.pos={x:10,z:20};
  updateCaptureState(cap,b,[a,d],0,1,1);
  assert.equal(cap.attackers,1); assert.equal(cap.defenders,1); assert.equal(cap.contested,true);
  d.pos.x=100; updateCaptureState(cap,b,[a,d],0,1,2);
  assert.equal(cap.contested,false); assert.ok(personalCapturePercent(cap,a)>0);
  a.pos.x=35; updateCaptureState(cap,b,[a,d],0,1,3); assert.equal(cap.points,0); assert.equal(cap.attackers,0);
  const height=(x,z)=>x*0.04+z*0.1;
  const ring=captureRingData(b,height);
  assert.equal(ring.positions.length,129*2*3);
  for(let i=0;i<ring.positions.length;i+=3){
    const [x,y,z]=ring.positions.slice(i,i+3);
    assert.ok(Math.abs(y-height(x,z)-0.65)<1e-9);
    assert.ok(Math.abs(Math.hypot(x-b.x,z-b.z)-(i%6===3?25:23.2))<1e-9);
  }
}
console.log('Capture regression tests passed.');
