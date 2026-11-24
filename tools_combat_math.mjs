import assert from 'node:assert/strict';
import {advanceDispersion,zoomFov,dispersionPixels,incidence,impactDrop,sampleDispersionRadius} from './src/game/combatMath.js';
import { RNG } from './src/util.js';
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol, a+' != '+b);
near(incidence(1,10).los,10);
near(incidence(Math.cos(Math.PI/6),10).los,10/Math.sin(Math.PI/3));
near(incidence(0.5,10).los,20);
near(incidence(-0.5,10).los,20);
assert.ok(incidence(0,10).los>1e6);
let x=0;
const dt=1/60,aim=2;
for(let i=0;i<60;i++)x=advanceDispersion(x,0.0001,dt,aim);
near(x,0.5);
for(let i=0;i<60;i++)x=advanceDispersion(x,-2,dt,aim);
near(x,1);
for(let i=0;i<60;i++)x=advanceDispersion(x,0,dt,aim);
near(x,0.5);
for(let i=0;i<60;i++)x=advanceDispersion(x,0,dt,aim);
near(x,0);
near(advanceDispersion(0.25,3,1,4),0.5);
near(advanceDispersion(0.25,0,1,2),0);
near(advanceDispersion(0.75,3,1,2),1);
const px=(zoom)=>dispersionPixels(0.004,1/Math.tan(zoomFov(zoom)*Math.PI/360),1080);
for(const zoom of [2,4,8,16])near(px(zoom)/px(1),zoom);
near(dispersionPixels(0,2,1080),0);

// The first trial is outside the circle. It must be redrawn instead of clipped to radius 1.
const draws = [0.99, 0.9, 1 - Math.exp(-0.6), 1 - Math.exp(-0.6)][Symbol.iterator]();
near(sampleDispersionRadius({ next: () => draws.next().value }), 0.5);
const rng = new RNG(91);
const limits = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1];
const counts = limits.map(() => 0);
const shots = 100000;
for (let i = 0; i < shots; i++) {
  const r = sampleDispersionRadius(rng);
  assert.ok(r >= 0 && r < 1, 'every sample is strictly inside the dispersion disk');
  limits.forEach((limit, j) => { if (r < limit) counts[j]++; });
}
const integral = r => 1 - (1 + 2.4 * r) * Math.exp(-2.4 * r);
limits.forEach((r, i) => near(counts[i] / shots, integral(r) / integral(1), 0.006));
assert.equal(counts.at(-1), shots);

assert.ok(impactDrop(300**2,0,800)>0);
near(impactDrop(0,0,800),0);
console.log('Combat math checks passed: incidence, bounded exponential dispersion, optical magnification and projectile drop.');
