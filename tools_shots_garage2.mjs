import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5173/'; const ids = (process.argv[3] || 'panther').split(','); const W = +(process.argv[4] || 1280), H = Math.round(W * 9 / 16);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } }); const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
await page.goto(base); await page.waitForFunction(() => window.__menu, null, { timeout: 120000 });
for (const id of ids) {
  await page.evaluate((id) => window.__menu.select(id), id);
  await page.evaluate((a) => { const g = window.__menu.garage; g.drag = { x: 0 }; g.angle = a[0]; g.distMul = a[1]; g.hMul = a[2]; if (a[3]) document.querySelector('.menu').style.visibility = 'hidden'; }, [+(process.argv[5] || 0.75), +(process.argv[6] || 1), +(process.argv[7] || 1), process.argv[8] === 'clean']);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `screenshots/v2/${process.argv[9] || 'garage'}_${id}.png`, timeout: 240000 });
  console.log('shot', id);
}
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); await browser.close();
