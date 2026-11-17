// v4 screenshots: dispersion (third-person + scoped), map views. usage: node tools_v4_shots.mjs [base] [which]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/'; const only = (process.argv[3] || 'disp,maps').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const newPage = async () => { const p = await browser.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); return p; };
const frames = (page, n = 3) => page.evaluate((n) => new Promise((res) => { setTimeout(res, 200000); let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async (page, name) => { await frames(page, 3); await page.waitForTimeout(600); await page.screenshot({ path: `screenshots/v4/${name}.png`, timeout: 300000 }); console.log('saved', name); };
const game = async (q) => { const page = await newPage(); await page.goto(base + '?autostart=1&q=medium&seed=11&' + q); await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 300000 }); return page; };
const HELP = `const g = window.__game, D = g.debug, p = g.player, W = g.world, T = W.terrain;
  const findLine = (R) => { for (let k = 0; k < 3000; k++) { const x = -420 + (k % 40) * 21, z = -420 + Math.floor(k / 40) * 21, h = (k * 0.9) % 6.28; const tx = x + Math.sin(h) * R, tz = z + Math.cos(h) * R;
    if (!g.nav.walkable(...g.nav.toCell(x, z)) || !g.nav.walkable(...g.nav.toCell(tx, tz)) || W.veg.bushAt(x, z, 3) || W.veg.bushAt(tx, tz, 3)) continue;
    if (W.losBlocked(x, T.height(x, z) + 3, z, tx, T.height(tx, tz) + 1.2, tz) || W.colGrid.query(tx, tz, 8).length || W.colGrid.query(x, z, 8).length) continue; return [x, z, h, tx, tz]; } return null; };`;
if (only.includes('disp')) {
  const page = await game('map=desert&tank=t34');
  const r = await page.evaluate(`(() => { ${HELP} D.freeze(true); const L = findLine(230); if (!L) return 'no line'; const [x, z, h, tx, tz] = L; D.teleport(x, z, h);
    const e = g.tanks.find((t) => t.team === 1); e.placeAt(tx, tz, h + Math.PI + 0.6); window.__e = e;
    for (const t of g.tanks) if (t !== p && t !== e) t.placeAt(t.team ? 560 : -560, t.team ? 560 - t.id * 9 : -560 + t.id * 9, 0);
    e.visibleUntil[0] = 1e9; e.spotted[0] = true; const P = e.model.root.localToWorld(new e.pos.constructor(0, e.spec.dims.hullH * 0.7, 0));
    D.cam(h, -0.04, 12); D.aim(P.x, P.y, P.z); D.simulate(3); p.reloadLeft = 0; p.tryFire(g.time); D.simulate(0.15); D.pause(true);
    return { dist: Math.round(e.pos.distanceTo(p.pos)), bloom: +p.bloom.toFixed(2), circleRadius_m: +(g.reticleRadiusWorld || 0).toFixed(2) }; })()`);
  console.log('third', JSON.stringify(r)); await shot(page, 'dispersion_thirdperson');
  const r2 = await page.evaluate(() => { const g = window.__game, D = g.debug, e = window.__e, p = g.player; D.pause(false); g.cam.sniper = true; g.cam.zoom = 8; g._camInit = false; const P = e.model.root.localToWorld(new e.pos.constructor(0, e.spec.dims.hullH * 0.7, 0)); g.alignCamTo(P); D.simulate(0.1); g.alignCamTo(P); D.aim(P.x, P.y, P.z); D.simulate(4); g.alignCamTo(P); D.simulate(0.05); D.pause(true); return { bloom: +p.bloom.toFixed(2), circleRadius_m: +(g.reticleRadiusWorld || 0).toFixed(2), dist: Math.round(g.reticleDist) }; });
  console.log('scoped', JSON.stringify(r2)); await shot(page, 'dispersion_scoped');
  const r3 = await page.evaluate(() => { const g = window.__game, D = g.debug, p = g.player; D.pause(false); p.reloadLeft = 0; p.tryFire(g.time); D.simulate(0.12); D.pause(true); return { bloom: +p.bloom.toFixed(2), circleRadius_m: +(g.reticleRadiusWorld || 0).toFixed(2) }; });
  console.log('scoped after shot', JSON.stringify(r3)); await shot(page, 'dispersion_scoped_after_shot');
  await page.close();
}
if (only.includes('maps')) {
  const M = [['village', 'map1', 'sherman'], ['forest', 'map2', 'leo2a6'], ['desert', 'map3', 'm1a2']];
  for (const [map, name, tank] of M) {
    const page = await game(`map=${map}&tank=${tank}`);
    await page.evaluate(() => { const h = document.querySelector('.hud'); if (h) h.style.visibility = 'hidden'; });
    const r = await page.evaluate(() => { const g = window.__game, D = g.debug, T = g.world.terrain; D.freeze(true); const p = g.player.pos; const b = g.world.bases[1]; const dx = b.x - p.x, dz = b.z - p.z, l = Math.hypot(dx, dz); const hy = (x, z) => T.height(x, z);
      D.camAt([p.x - dx / l * 20, hy(p.x, p.z) + 45, p.z - dz / l * 20, p.x + dx / l * 300, hy(p.x + dx / l * 300, p.z + dz / l * 300), p.z + dz / l * 300, 60]); D.simulate(0.1); D.pause(true); return null; });
    await shot(page, name);
    const r2 = await page.evaluate(() => { const g = window.__game, D = g.debug, T = g.world.terrain; D.pause(false); const hy = (x, z) => T.height(x, z); const B = g.world.mb.buildings.filter((b) => !b.ruined && !['tower', 'church', 'mosque'].includes(b.kind)).sort((a, b2) => Math.hypot(a.x, a.z) - Math.hypot(b2.x, b2.z));
      for (const bb of B.slice(0, 40)) for (let k = 0; k < 16; k++) { const ang = k / 16 * 6.283; const D2 = Math.max(bb.w, bb.d) / 2 + 22; const x = bb.x + Math.sin(ang) * D2, z = bb.z + Math.cos(ang) * D2; const y = hy(x, z) + 3; if (g.world.colGrid.query(x, z, 4).length) continue; if (g.world.structureHit(x, y, z, bb.x, hy(bb.x, bb.z) + 3, bb.z) < 0.6) continue; if (g.world.veg.treeGrid.query((x + bb.x) / 2, (z + bb.z) / 2, 9).length || g.world.veg.bushGrid.query((x + bb.x) / 2, (z + bb.z) / 2, 8).length) continue;
        g.world.grass.last = null; g.world.grass.update({ x, z }); D.camAt([x, y, z, bb.x, hy(bb.x, bb.z) + 3, bb.z, 60]); D.simulate(0.1); D.pause(true); return [bb.x | 0, bb.z | 0, bb.style]; } return 'none'; });
    console.log(name, 'buildings', JSON.stringify(r2)); await shot(page, name + '_buildings');
    await page.close();
  }
}
console.log('errors:', errs.join(' | ') || 'none'); await browser.close();
