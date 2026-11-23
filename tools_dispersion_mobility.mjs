// Runtime integration checks for balance dispersion and river-bank mobility.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem('tw_balance_v1', JSON.stringify({
    version: 1,
    tanks: { tiger: { dispersion: 0.01, aimTime: 1.0 } }
  }));
});
await page.goto(`${base}?autostart=1&map=forest&tank=tiger&q=low&seed=1901`);
await page.waitForFunction(() => window.__game && window.__game.player?.spec.id === 'tiger', null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  g.debug.freeze(true);
  p.bloom = 1;
  const specDispersion = p.spec.dispersion;
  const baseDispersion = p.baseDispersion();
  const currentDispersion = p.dispersion();
  const expected = Math.atan(0.01 / 100);
  const deviations = [];
  for (let i = 0; i < 30; i++) {
    p.reloadLeft = 0;
    p.tryFire(g.time);
    deviations.push(p.lastDeviation);
  }

  // Choose a real river section away from the two designed fords.
  const river = g.world.mb.rivers.find((r) => !r.dry);
  const pts = river.pts;
  const fords = g.world.mb.fords || [];
  let k = 0, best = -Infinity;
  for (let i = 2; i < pts.length - 2; i++) {
    const [x,z] = pts[i];
    const fordGap = fords.length ? Math.min(...fords.map(f => Math.hypot(x-f.x,z-f.z))) : 1e6;
    const score = fordGap - Math.abs(z) * 0.02;
    if (score > best) { best = score; k = i; }
  }
  const prev = pts[k - 2], next = pts[k + 2], center = pts[k];
  const tx = next[0] - prev[0], tz = next[1] - prev[1];
  const tangent = Math.atan2(tx, tz);
  const heading = tangent + Math.PI / 2;
  const start = [center[0], center[1]];
  const profile = [];
  for (let d = -18; d <= 18; d += 2) {
    const x = center[0] + Math.sin(heading) * d, z = center[1] + Math.cos(heading) * d;
    profile.push({ d, h: g.world.terrain.height(x, z), water: g.world.terrain.waterLevel(x, z) });
  }

  p.modules.tracks = 1; p.modules.engine = 1; p.speed = 0; p.turnRate = 0;
  p.placeAt(start[0], start[1], heading);
  const beforeHeading = p.heading;
  g.keys.KeyD = true;
  g.debug.simulate(2, 1 / 30);
  g.keys.KeyD = false;
  const turnDelta = Math.atan2(Math.sin(p.heading - beforeHeading), Math.cos(p.heading - beforeHeading));
  const turnState = { deltaRadians: turnDelta, degrees: turnDelta * 180 / Math.PI, turnRate: p.turnRate, tracks: p.modules.tracks, inWater: p.inWater, speed: p.speed };

  p.speed = 0; p.turnRate = 0; p.placeAt(start[0], start[1], heading);
  const before = p.pos.clone();
  g.keys.KeyW = true;
  g.debug.simulate(8, 1 / 30);
  g.keys.KeyW = false;
  const forwardDelta = (p.pos.x - before.x) * Math.sin(heading) + (p.pos.z - before.z) * Math.cos(heading);
  const forwardState = { delta: forwardDelta, speed: p.speed, turnRate: p.turnRate, x: p.pos.x, z: p.pos.z, groundY: p.groundY, inWater: p.inWater };

  p.speed = 0; p.turnRate = 0; p.placeAt(start[0], start[1], heading);
  const backStart = p.pos.clone();
  g.keys.KeyS = true;
  g.debug.simulate(8, 1 / 30);
  g.keys.KeyS = false;
  const reverseDelta = -((p.pos.x - backStart.x) * Math.sin(heading) + (p.pos.z - backStart.z) * Math.cos(heading));
  return {
    balance: { specDispersion, baseDispersion, currentDispersion, expected, maxShotDeviation: Math.max(...deviations), minShotDeviation: Math.min(...deviations) },
    river: { center: start, width: river.width, profile, forwardState, turnState, reverseDelta },
    errors: []
  };
});
await browser.close();
report.errors = errors;
console.log(JSON.stringify(report, null, 2));
assert.equal(report.balance.specDispersion, 0.01, 'local balance dispersion did not reach the live tank spec');
assert.ok(Math.abs(report.balance.baseDispersion - report.balance.expected) < 1e-10, 'base dispersion did not use the configured value');
assert.ok(report.balance.maxShotDeviation <= report.balance.expected * 1.00001, 'actual shot deviation exceeded configured cone');
assert.ok(report.river.forwardState.delta > 3, 'tank could not make forward progress across the river section');
assert.ok(Math.abs(report.river.turnState.degrees) > 5, 'tank could not turn while in the river section');
assert.ok(report.river.reverseDelta > 2, 'tank could not reverse away from the river bank');
assert.equal(report.errors.length, 0, 'browser runtime errors detected');
