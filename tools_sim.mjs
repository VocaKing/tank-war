import { chromium } from 'playwright';
const [,, url, secs = '120'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack||'').slice(0,800)));
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
for (let k = 0; k < +secs / 30; k++) {
  const r = await page.evaluate(() => { const g = window.__game; g.paused = false; const r = g.debug.simulate(30); const i = g.debug.info(); return { r, t: Math.round(i.time), alive: i.alive.map(a => `${a[2]}:${a[1]}:${a[3]?a[4]:'X'}@${a[5]},${a[6]}${a[8]?'(B)':''}`).join(' '), cap: g.capture.map(c=>Math.round(c.points)), shells: g.tanks.reduce((s,t)=>s+t.stats.shots,0) }; });
  console.log(JSON.stringify(r));
  if (r.r.ended) break;
}
console.log(errs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
