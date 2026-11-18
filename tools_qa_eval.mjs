// QA helper: open a match and run an async snippet (file) inside the page; prints JSON result + console errors
// usage: node tools_qa_eval.mjs <map> <tank> <q> <snippet.js> [base] [shot.png]
import { chromium } from 'playwright';
import fs from 'fs';
const [map = 'village', tank = 'sherman', q = 'low', file, base = 'http://localhost:4176/', shot] = process.argv.slice(2);
const code = fs.readFileSync(file, 'utf8');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } }); const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); else if (m.text().startsWith('QA ')) console.log(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
if (process.env.SEEDRAND) await page.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
if (process.env.DIST) { const fs2 = await import('fs'), path = await import('path'); await page.route('**/*', (rt) => { const u = new URL(rt.request().url()); let f = path.join(process.env.DIST, decodeURIComponent(u.pathname)); if (u.pathname.endsWith('/')) f = path.join(f, 'index.html'); if (!u.host.startsWith('localhost') || !fs2.existsSync(f)) return rt.continue(); rt.fulfill({ body: fs2.readFileSync(f), contentType: { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] }); }); }
await page.goto(`${base}?autostart=1&map=${map}&tank=${tank}&q=${q}&seed=7`, { timeout: 240000 });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 180000 });
let res;
try { res = await page.evaluate(`(async () => { ${code} })()`); } catch (e) { res = { error: e.message }; }
if (shot) await page.screenshot({ path: shot, timeout: 300000 });
console.log(JSON.stringify({ map, tank, q, res, errs }, null, 1));
await browser.close();
