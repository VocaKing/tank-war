// v4 QA: dispersion statistics + bloom behaviour + reticle sizing
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const tank of ['sherman', 't72', 'leo2a6']) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${base}?autostart=1&map=desert&tank=${tank}&q=low&seed=3`);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
  const r = await page.evaluate(() => {
    const g = window.__game; const p = g.player; g.debug.freeze(); g.debug.pause?.(false);
    const aim = p.pos.clone().add({ x: Math.sin(p.heading) * 200, y: 2, z: Math.cos(p.heading) * 200 }); g.debug.aim(aim.x, aim.y, aim.z);
    g.debug.simulate(6); const aimedBloom = p.bloom; const base = p.baseDispersion();
    const devs = []; for (let i = 0; i < 300; i++) { p.bloom = 1; p.reloadLeft = 0; p.ammo[p.shellIdx] = 50; p.tryFire(g.time); devs.push(p.lastDeviation * 200); }
    g.flying.length = 0;
    devs.sort((a, b) => a - b); const mean = devs.reduce((a, b) => a + b, 0) / devs.length;
    p.bloom = 1; g.debug.simulate(0.05); p.reloadLeft = 0; p.tryFire(g.time); const afterFire = p.bloom;
    g.debug.simulate(p.aimTime()); const afterAimTime = p.bloom;
    // drive forward
    p.bloom = 1; g.freezeAI = true; p.input.throttle = 1; const drive = () => { for (let i = 0; i < 120; i++) { p.input.throttle = 1; p.input.steer = 0; p.update(1 / 30, g.time); p.updateTurret?.(1 / 30); } }; drive();
    return { tank: p.spec.id, base100m: +(base * 100).toFixed(3), aimedBloom: +aimedBloom.toFixed(3), r200_median: +devs[150].toFixed(2), r200_max: +devs[299].toFixed(2), r200_mean: +mean.toFixed(2), afterFire: +afterFire.toFixed(2), afterAimTime: +afterAimTime.toFixed(2), speed: +p.speed.toFixed(1), movingBloom: +p.bloom.toFixed(2) };
  });
  console.log(JSON.stringify(r), errs.join(' | ')); await page.close();
}
await browser.close();
