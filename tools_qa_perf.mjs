// QA: frame time + JS heap + renderer.info over a few minutes of real rendered play (AI fighting, player camera moving),
// plus a restart cycle (back to menu → new match) to catch leaks across matches.
// usage: node tools_qa_perf.mjs [base] [maps] [qualities] [seconds]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4176/';
const maps = (process.argv[3] || 'village,forest,desert').split(','); const quals = (process.argv[4] || 'low,high').split(','); const SEC = +(process.argv[5] || 120);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
for (const map of maps) for (const q of quals) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(`${base}?autostart=1&map=${map}&tank=sherman&q=${q}&seed=7`);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 180000 });
  const r = await page.evaluate(async (SEC) => {
    const g = window.__game; g.player.damage = () => {}; g.timeLimit = 1e9; const R = g.renderer;
    const snap = () => { if (window.gc) window.gc(); const i = R.info; return { t: Math.round(g.time), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, geo: i.memory.geometries, tex: i.memory.textures, progs: i.programs?.length, calls: i.render.calls, tris: i.render.triangles, sceneObjs: (() => { let n = 0; g.scene.traverse(() => n++); return n; })(), shells: g.ballistics.shells.length, flying: g.flying.length, smokes: g.smokes.length }; };
    const samples = [snap()]; const ft = []; const t0 = performance.now(); let last = t0, k = 0;
    await new Promise((res) => { const f = () => { const now = performance.now(); ft.push(now - last); last = now; g.cam.yaw += 0.01; if (++k % 4 === 0) g.debug.simulate(0.5); if ((now - t0) / 1000 > SEC) return res(); if (k % 120 === 0) samples.push(snap()); requestAnimationFrame(f); }; requestAnimationFrame(f); });
    samples.push(snap()); ft.sort((a, b) => a - b); const pct = (p) => +ft[Math.floor(ft.length * p)].toFixed(1);
    return { frames: ft.length, simSec: Math.round(g.time), frameMs: { p50: pct(0.5), p95: pct(0.95), max: +ft[ft.length - 1].toFixed(1) }, first: samples[1] || samples[0], last: samples[samples.length - 1], samples: samples.map((s) => [s.t, s.heapMB, s.geo, s.tex, s.sceneObjs]) };
  }, SEC);
  // restart cycle: exit to menu and start the same match again twice; resources should return to the same level
  const cyc = await page.evaluate(async () => { const out = []; const R = window.__game.renderer; for (let i = 0; i < 2; i++) { const g = window.__game; out.push({ geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }); if (!g.exit) break; g.exit(); await new Promise((r) => setTimeout(r, 1500)); const b = [...document.querySelectorAll('button')].find((x) => /battle|play|start/i.test(x.textContent)); if (b) b.click(); await new Promise((r) => { const t0 = Date.now(); const w = () => (window.__game && window.__game !== g && window.__game.player) || Date.now() - t0 > 90000 ? r() : setTimeout(w, 500); w(); }); if (window.__game === g) { out.push('no restart button'); break; } await new Promise((r) => setTimeout(r, 1500)); } if (window.gc) window.gc(); out.push({ geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }); return out; }).catch((e) => 'cycle error ' + e.message.slice(0, 200));
  console.log(JSON.stringify({ map, q, ...r, cycle: cyc, errs: errs.slice(0, 5), nErrs: errs.length }));
  await page.close();
}
await browser.close();
