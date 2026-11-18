// QA: find what keeps an exited Game alive. Marks the game with a runtime-named class, exits, starts a new match,
// then takes a CDP heap snapshot to /workspace/tw-shots/qa/heap/after.heapsnapshot (analyse with tools_qa_heap_paths.py).
import { chromium } from 'playwright'; import fs from 'fs';
const base = process.argv[2] || 'http://localhost:4176/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?autostart=1&map=village&tank=sherman&q=low&seed=7`, { timeout: 240000 });
await (await page.waitForFunction(() => !!(window.__game && window.__game.player), null, { timeout: 240000 })).dispose(); // the returned JSHandle (a Tank) would otherwise pin the old Game
await page.evaluate(async () => { const g = window.__game; g.debug.simulate(3); const M = new Function('return class QaLeakMarker {}')(); g.__qaMarker = new M(); g.exit(); await new Promise((r) => setTimeout(r, 800)); document.getElementById('m-battle').click(); });
await (await page.waitForFunction(() => !!(window.__game && !window.__game.__qaMarker && window.__game.player), null, { timeout: 240000 })).dispose();
await page.evaluate(async () => { window.__game.debug.simulate(2); await new Promise((r) => setTimeout(r, 1500)); window.gc && window.gc(); });
const cdp = await page.context().newCDPSession(page); const out = fs.createWriteStream('/workspace/tw-shots/qa/heap/after.heapsnapshot');
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => out.write(e.chunk));
await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
await new Promise((r) => out.end(r)); console.log('snapshot written'); await browser.close();
