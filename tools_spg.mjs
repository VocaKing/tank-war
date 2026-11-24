// Smoke test for the PzH 2000 artillery-specific gameplay loop.
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?autostart=1&map=desert&tank=pzh2000&q=low&seed=19`);
await page.waitForFunction(() => window.__game && window.__game.player?.spec.id === 'pzh2000', null, { timeout: 180000 });

const result = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  p.speed = 0; p.turnRate = 0; p.reloadLeft = 0; p.aimError = 0;
  p.gunPitch = 75 * Math.PI / 180; p.syncModel();
  const ammoBefore = p.ammo[p.shellIdx], shellsBefore = g.ballistics.shells.length;
  const first = p.tryFire(g.time);
  const queued = !first && p.pendingFire && p.spadeState === 'deploying';
  for (let i = 0; i < 30 && p.spadeState !== 'deployed'; i++) p.updateSpade(0.1, g.time + i * 0.1);
  const fired = g.ballistics.shells.length > shellsBefore;
  const shell = g.ballistics.shells[g.ballistics.shells.length - 1];
  return {
    vehicle: p.spec.id,
    queuedUntilSpade: queued,
    spadeReachedDeployed: p.spadeState === 'deployed' && p.spadeProgress === 1,
    spadeMeshExists: !!p.model.spade,
    spadeMeshAtFiringAngle: !!p.model.spade && Math.abs(p.model.spade.rotation.x) < 0.02,
    shellSpawned: fired,
    ammoConsumed: p.ammo[p.shellIdx] === ammoBefore - 1,
    reloadSeconds: p.reloadLeft,
    recoilTriggered: p.recoil === 1,
    highElevationVelocity: !!shell && shell.vel.y > 130,
    highArcEnabled: !!p.spec.artillery.highArc,
    slowTraverse: p.spec.turretTraverse <= 6,
    longReload: p.reloadTime() >= 20
  };
});
await browser.close();
console.log(JSON.stringify({ result, errors }, null, 2));
const passed = result.queuedUntilSpade && result.spadeReachedDeployed && result.spadeMeshExists &&
  result.spadeMeshAtFiringAngle && result.shellSpawned && result.ammoConsumed && result.recoilTriggered &&
  result.highElevationVelocity && result.highArcEnabled && result.slowTraverse && result.longReload && errors.length === 0;
if (!passed) process.exit(1);
