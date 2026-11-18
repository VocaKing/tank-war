// QA helper: open a match and run an async snippet (file) inside the page; prints JSON result + console errors
// usage: node tools_qa_eval.mjs <map> <tank> <q> <snippet.js> [base] [shot.png]
import { chromium } from 'playwright';
import fs from 'fs';
const [map = 'village', tank = 'sherman', q = 'low', file, base = 'http://localhost:4176/', shot] = process.argv.slice(2);
const code = fs.readFileSync(file, 'utf8');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); else if (m.text().startsWith('QA ')) console.log(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
await page.goto(`${base}?autostart=1&map=${map}&tank=${tank}&q=${q}&seed=7`);
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 180000 });
let res;
try { res = await page.evaluate(`(async () => { ${code} })()`); } catch (e) { res = { error: e.message }; }
if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify({ map, tank, q, res, errs }, null, 1));
await browser.close();
