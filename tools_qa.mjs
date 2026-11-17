// QA: every map x every tank loads from the production build with no console errors
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const maps = ['village', 'forest', 'desert'], tanks = ['sherman', 'tiger', 't34', 't72', 'm1a2'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
// menu load
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(base); await page.waitForFunction(() => window.__ready || window.__menu, null, { timeout: 120000 }); await page.waitForTimeout(2000);
  console.log('MENU', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'ok'); if (errs.length) fails++; await page.close();
}
for (const m of maps) for (const t of tanks) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } }); const errs = [];
  page.on('console', (x) => { if (x.type() === 'error' || x.type() === 'warning') errs.push(x.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(`${base}?autostart=1&map=${m}&tank=${t}&q=low&seed=7`);
  try {
    await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
    const info = await page.evaluate(() => { const g = window.__game; g.debug.simulate(5); return { map: g.map?.id || g.mapId, player: g.player.spec.id, team0: g.tanks.filter((x) => x.team === 0).length, team1: g.tanks.filter((x) => x.team === 1).length, ok: g.tanks.every((x) => Number.isFinite(x.pos.y)), models: g.tanks.map((x) => x.spec.id).join(',') }; });
    const good = info.player === t && info.team0 === 7 && info.team1 === 7 && info.ok && !errs.length; if (!good) fails++;
    console.log(m, t, good ? 'ok' : 'FAIL', JSON.stringify(info), errs.join(' | '));
  } catch (e) { fails++; console.log(m, t, 'FAIL', e.message, errs.join(' | ')); }
  await page.close();
}
console.log('FAILS', fails); await browser.close();
