import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } }); const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
await page.goto(base); await page.waitForFunction(() => window.__menu, null, { timeout: 120000 });
await page.click('.tcard[data-id="tiger"]'); await page.click('.mcard[data-id="village"]'); await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/01_menu.png' });
const ids = ['sherman', 'tiger', 't34', 't72', 'm1a2'];
for (let i = 0; i < ids.length; i++) { await page.click(`.tcard[data-id="${ids[i]}"]`); await page.waitForTimeout(5000); await page.screenshot({ path: `screenshots/0${i + 2}_garage_${ids[i]}.png` }); }
// stats table
const cmp = await page.$('#m-table'); if (cmp) { await cmp.click(); await page.waitForTimeout(1500); await page.screenshot({ path: 'screenshots/07_stats_table.png' }); }
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); await browser.close();
