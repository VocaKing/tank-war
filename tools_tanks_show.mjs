// Tank showroom renders in the real game scene (HDRI + post) from vite preview on :4174.
// usage: node tools_tanks_show.mjs [ids|all] [views q,f,s,r,c1,c2] [outDir] [map]
import { chromium } from 'playwright';
const base = 'http://localhost:4174/';
const idsArg = process.argv[2] || 'all'; const views = (process.argv[3] || 'q').split(','); const out = process.argv[4] || '/workspace/tw-shots/tanks'; const map = process.argv[5] || 'village';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 720) } }); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const frames = (n = 3) => page.evaluate((n) => new Promise((res) => { setTimeout(res, 200000); let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await page.goto(base + `?autostart=1&q=high&seed=11&map=${map}&tank=sherman`, { timeout: 300000 });
await page.waitForFunction(() => window.__game && window.__game.player && window.__game.world.hdrLoaded && window.__TM, null, { timeout: 300000 });
// specs: from player tank list in garage data via game.tanks + a full list exposed by __TM
const list = await page.evaluate((idsArg) => { const all = window.__TM.TANKS.map((t) => t.id); return idsArg === 'all' ? all : idsArg.split(','); }, idsArg);
// find flat open spot near player
await page.evaluate(() => { const g = window.__game, D = g.debug, W = g.world, T = W.terrain, p = g.player.pos; D.freeze(true); const hud = document.querySelector(".hud"); if (hud) hud.style.visibility = "hidden";
  let best = null; for (let k = 0; k < 600 && !best; k++) { const x = p.x + Math.sin(k * 2.4) * (8 + k * 0.6), z = p.z + Math.cos(k * 2.4) * (8 + k * 0.6);
    let ok = !W.colGrid.query(x, z, 16).length && !W.veg.treeGrid.query(x, z, 16).length && !W.veg.bushAt(x, z, 12); if (!ok) continue;
    const h0 = T.height(x, z); for (const [a, b] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) if (Math.abs(T.height(x + a, z + b) - h0) > 0.6) ok = false; if (ok) best = [x, z]; }
  window.__spot = best || [p.x + 20, p.z];
  for (const t of g.tanks) t.placeAt(t.team ? 900 : -900, t.team ? 900 - t.id * 12 : -900 + t.id * 12, 0);
  window.__show = (id, view) => { const TM = window.__TM, S = TM.TANKS.find((t) => t.id === id); if (window.__cur) g.scene.remove(window.__cur.root);
    const m = TM.createTankModel(S, { links: true }); TM.setTrackLOD(m, true); const [x, z] = window.__spot; const y = T.height(x, z); m.root.position.set(x, y, z); m.root.rotation.y = 0.5; m.turret.rotation.y = 0.3; g.scene.add(m.root); window.__cur = m; m.root.updateMatrixWorld(true);
    const L = S.dims.L, H = S.dims.hullH; const loc = { q: [L * 0.9, L * 0.42, L * 1.0, 0, H * 0.7, 0, 45], f: [0.6, H + 0.6, L * 1.35, 0, H * 0.7, 0, 45], s: [L * 1.35, H * 0.9, 0.2, 0, H * 0.7, 0, 45], r: [-L * 0.85, L * 0.45, -L * 0.95, 0, H * 0.7, 0, 45],
      c1: [L * 0.45, H * 0.55, L * 0.5, 0, H * 0.45, L * 0.1, 40], c2: [L * 0.35, H + 1.6, L * 0.35, 0, H + 0.5, 0, 45], wheel: [L * 0.62, H * 0.35, L * 0.12, 0, S.dims.clearance + 0.2, -L * 0.15, 40] }[view];
    const P = (a, b, c) => m.root.localToWorld(new TM.THREE.Vector3(a, b, c)); const c = P(loc[0], loc[1], loc[2]), t = P(loc[3], loc[4], loc[5]);
    D.pause(false); D.camAt([c.x, c.y, c.z, t.x, t.y, t.z, loc[6]]); D.simulate(0.05); D.pause(true);
    let tri = 0, draws = 0; m.root.traverse((o) => { if (o.isMesh && o.visible) { draws++; const gg = o.geometry; const n = (gg.index ? gg.index.count : gg.attributes.position.count) / 3; tri += o.isInstancedMesh ? n * o.count : n; } });
    TM.setTrackLOD(m, false); let triFar = 0; m.root.traverse((o) => { if (o.isMesh && o.visible) { const gg = o.geometry; const n = (gg.index ? gg.index.count : gg.attributes.position.count) / 3; triFar += o.isInstancedMesh ? n * o.count : n; } }); if (m.lod) { triFar = m.lodTris || triFar; } TM.setTrackLOD(m, true);
    return { id, tri: Math.round(tri), triFar: Math.round(triFar), draws }; };
});
for (const id of list) for (const v of views) {
  const r = await page.evaluate(([id, v]) => window.__show(id, v), [id, v]); await frames(4); await page.waitForTimeout(400);
  const f = `${out}/${id}${v === 'q' ? '' : '_' + v}.png`; await page.screenshot({ path: f, timeout: 300000 }); console.log(JSON.stringify(r), f);
}
console.log('errors:', errs.join(' | ') || 'none'); await browser.close();
