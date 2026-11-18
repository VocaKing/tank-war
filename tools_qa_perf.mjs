// QA: per-map/quality cost + leak trend. SwiftShader (software GL) makes absolute FPS meaningless (~3-4 s/frame at 640x360,
// 1.2 M tris), so this measures (a) game-logic cost per 30 Hz tick over a long AI battle, (b) a short rendered sample,
// (c) JS heap + renderer.info.memory + scene object count over time to catch leaks inside a match.
// usage: node tools_qa_perf.mjs [base] [maps] [qualities] [simSeconds]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4176/';
const maps = (process.argv[3] || 'village,forest,desert').split(','); const quals = (process.argv[4] || 'low,high').split(','); const SEC = +(process.argv[5] || 240);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { const t = []; let l = performance.now(); const f = () => { const x = performance.now(); t.push(x - l); l = x; if (t.length > n) return res(t.slice(1)); requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
for (const map of maps) for (const q of quals) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(`${base}?autostart=1&map=${map}&tank=sherman&q=${q}&seed=7`, { timeout: 240000 });
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 240000 });
  await frames(page, 3);
  const snap = () => page.evaluate(() => { if (window.gc) window.gc(); const g = window.__game, i = g.renderer.info; let n = 0; g.scene.traverse(() => n++); return { t: Math.round(g.time), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geo: i.memory.geometries, tex: i.memory.textures, progs: i.programs?.length, objs: n, shells: g.ballistics.shells.length, flying: g.flying.length, alive: g.tanks.filter((t) => t.alive).length }; });
  const S = [await snap()]; const tick = [];
  await page.evaluate(() => { const g = window.__game; g.player.damage = () => {}; g.timeLimit = 1e9; });
  for (let s = 0; s < SEC; s += 30) { tick.push((await page.evaluate(() => window.__game.debug.simulate(30))).perFrame); const ft = await frames(page, 2); S.push({ ...(await snap()), frameMs: ft.map((x) => Math.round(x)) }); }
  console.log(JSON.stringify({ map, q, tickMs: { mean: +(tick.reduce((a, b) => a + b, 0) / tick.length).toFixed(2), max: Math.max(...tick) }, first: S[0], last: S[S.length - 1], trend: S.map((s) => [s.t, s.heapMB, s.geo, s.tex, s.objs, s.alive]), errs: errs.slice(0, 5), nErrs: errs.length }));
  await page.close();
}
await browser.close();
