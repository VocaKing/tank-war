import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autostart=1&q=low&map=village&tank=t34&seed=3');
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 200000 });
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => { const r = document.getElementById('h-ret'); const ring = r.firstChild; const cs = getComputedStyle(ring); const rr = ring.getBoundingClientRect(); const pr = getComputedStyle(r); return { cls: r.className, tr: r.style.transform, w: ring.style.width, rect: [rr.x, rr.y, rr.width, rr.height], border: cs.border, vis: pr.visibility, disp: pr.display, op: pr.opacity, z: pr.zIndex, ringDisp: cs.display, html: r.outerHTML.slice(0, 300), bloom: window.__game.player.bloom }; }));
await browser.close();
