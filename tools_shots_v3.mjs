// v3 screenshots: loadout UI, items HUD, armor overlay, bridge crossing, bush close spotting
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/'; const only = (process.argv[3] || 'loadout,items,armor,bridge,bush').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const newPage = async () => { const p = await browser.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); return p; };
const frames = (page, n = 3) => page.evaluate((n) => new Promise((res) => { setTimeout(res, 200000); let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async (page, name) => { await frames(page, 3); await page.waitForTimeout(800); await page.screenshot({ path: `screenshots/v3/${name}.png`, timeout: 240000 }); console.log('saved', name); };
const game = async (q) => { const page = await newPage(); await page.goto(base + '?autostart=1&q=medium&seed=11&' + q); await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 300000 }); return page; };
// helper in page: flat clear spot + line
const HELP = `const g = window.__game, D = g.debug, p = g.player, W = g.world, T = W.terrain;
  const findLine = (R) => { for (let k = 0; k < 3000; k++) { const x = -420 + (k % 40) * 21, z = -420 + Math.floor(k / 40) * 21, h = (k * 0.9) % 6.28; const tx = x + Math.sin(h) * R, tz = z + Math.cos(h) * R;
    if (!g.nav.walkable(...g.nav.toCell(x, z)) || !g.nav.walkable(...g.nav.toCell(tx, tz)) || W.veg.bushAt(x, z, 3) || W.veg.bushAt(tx, tz, 3)) continue;
    if (W.losBlocked(x, T.height(x, z) + 3, z, tx, T.height(tx, tz) + 1.2, tz) || W.colGrid.query(tx, tz, 8).length || W.colGrid.query(x, z, 8).length) continue; return [x, z, h, tx, tz]; } return null; };`;
if (only.includes('loadout')) {
  const page = await newPage(); await page.goto(base); await page.waitForFunction(() => window.__menu, null, { timeout: 120000 });
  await page.evaluate(() => { localStorage.setItem('tw_items', JSON.stringify(['repair', 'reload', 'smoke'])); localStorage.setItem('tw_lo_tiger', JSON.stringify([60, 14, 18])); window.__menu.select('tiger'); window.__menu.showLoadout(true); });
  await shot(page, 'loadout_ui'); await page.close();
}
if (only.includes('items') || only.includes('armor')) {
  const page = await game('map=village&tank=sherman&items=repair,reload,smoke&loadout=45,10,16');
  const r = await page.evaluate(`(() => { ${HELP} D.freeze(true); const L = findLine(140); if (!L) return 'no line'; const [x, z, h, tx, tz] = L; D.teleport(x, z, h);
    const e = g.tanks.find((t) => t.team === 1 && t.spec.id === 'tiger') || g.tanks.find((t) => t.team === 1); e.placeAt(tx, tz, h + Math.PI + 0.55); e.turretYaw = -0.55; window.__e = e;
    for (const t of g.tanks) if (t !== p && t !== e) t.placeAt(t.team ? 560 : -560, t.team ? 560 - t.id * 9 : -560 + t.id * 9, 0);
    p.breakTracks(); p.modules.gun = 0.5; g.useItem(1); D.cam(h + 0.35, -0.1, 13); D.simulate(0.6); p.equip.slots[0].cd = 0; e.visibleUntil[0] = 1e9; e.spotted[0] = true; return { dist: Math.round(e.pos.distanceTo(p.pos)), enemy: e.spec.id }; })()`);
  console.log('stage', JSON.stringify(r));
  if (only.includes('items')) await shot(page, 'items_hud');
  if (only.includes('armor')) {
    const a = await page.evaluate(() => { const g = window.__game, D = g.debug, e = window.__e; g.armorView.enabled = true; g.cam.sniper = true; g.cam.zoom = 8; g._camInit = false; const P = e.model.root.localToWorld(new e.pos.constructor(0, e.spec.dims.hullH * 0.7, 0)); g.alignCamTo(P); D.simulate(0.1); g.alignCamTo(P); D.simulate(0.05); D.pause(true); return { overlays: g.armorView.overlayCount(e), cls: g.armorView.classify(e, P).cls }; });
    console.log('armor', JSON.stringify(a)); await shot(page, 'armor_overlay_on');
    await page.evaluate(() => { const g = window.__game; g.armorView.enabled = false; g.armorView.update(); }); await shot(page, 'armor_overlay_off');
  }
  await page.close();
}
if (only.includes('bridge')) {
  const page = await game('map=village&tank=tiger');
  const r = await page.evaluate(() => { const g = window.__game, D = g.debug, p = g.player, W = g.world; D.freeze(true);
    let best = null, bh = -1; for (const dk of W.decks) for (const sg of dk.segs) { const x = sg.ax + sg.ux * sg.l / 2, z = sg.az + sg.uz * sg.l / 2; const gap = dk.deckY((sg.s0 + sg.l / 2) / dk.len) - W.terrain.height(x, z); if (gap > bh && sg.s0 > 6 && sg.s0 + sg.l < dk.len - 6) { bh = gap; best = { dk, sg, x, z }; } }
    const { dk, sg, x, z } = best; const h = Math.atan2(sg.ux, sg.uz); D.teleport(x, z, h); D.aim(x + sg.ux * 200, p.pos.y + 2, z + sg.uz * 200); D.simulate(0.5);
    const cx = x + sg.uz * 22 - sg.ux * 9, cz = z - sg.ux * 22 - sg.uz * 9; D.camAt([cx, p.pos.y + 4, cz, x, p.pos.y + 0.3, z, 50]); D.simulate(0.05);
    return { tankY: +p.pos.y.toFixed(2), deckY: +dk.deckY((sg.s0 + sg.l / 2) / dk.len).toFixed(2), terrainY: +W.terrain.height(x, z).toFixed(2) }; });
  console.log('bridge', JSON.stringify(r)); await shot(page, 'bridge_crossing'); await page.close();
}
if (only.includes('bush')) {
  const page = await game('map=village&tank=sherman');
  const r = await page.evaluate(`(() => { ${HELP} D.freeze(true); const S = g.spotting; const e = g.tanks.find((t) => t.team === 1); e.lastFired = -100; e.lastMoving = -100;
    for (const t of g.tanks) if (t !== p && t !== e) t.placeAt(t.team ? 560 : -560, t.team ? 560 - t.id * 9 : -560 + t.id * 9, 0);
    for (const b of W.veg.bushes) { if (b.r < 3 || Math.abs(b.x) > 480 || Math.abs(b.z) > 480) continue;
      for (let k = 0; k < 8; k++) { const h = k * 0.785; const x = b.x + Math.sin(h) * 42, z = b.z + Math.cos(h) * 42;
        if (!g.nav.walkable(...g.nav.toCell(x, z)) || W.veg.bushAt(x, z, 5) || W.losBlocked(x, T.height(x, z) + 3, z, b.x, T.height(b.x, b.z) + 1.5, b.z)) continue;
        e.placeAt(b.x, b.z, h + 1.2); D.teleport(x, z, h + Math.PI); D.cam(h + Math.PI, -0.06, 11); D.simulate(0.5); S.timer = 0; S.update(0, g.time);
        if (!e.inBush) continue; window.__b = { b, h };
        return { dist: Math.round(e.pos.distanceTo(p.pos)), inBush: !!e.inBush, camo: +e.camo.toFixed(2), spotRange: Math.round(S.spotRange(p, e, g.time)), spotted: e.spotted[0] }; } }
    return 'no bush'; })()`);
  console.log('bush', JSON.stringify(r)); await shot(page, 'bush_close_spotted');
  const r2 = await page.evaluate(() => { const g = window.__game, D = g.debug, p = g.player, S = g.spotting; const { b, h } = window.__b; const e = g.tanks.find((t) => t.team === 1);
    const x = b.x + Math.sin(h) * 160, z = b.z + Math.cos(h) * 160; D.teleport(x, z, h + Math.PI); D.cam(h + Math.PI, -0.04, 11); e.visibleUntil[0] = 0; D.simulate(1.6); S.timer = 0; S.update(0, g.time);
    return { dist: Math.round(e.pos.distanceTo(p.pos)), spotted: e.spotted[0], visible: e.model.root.visible }; });
  console.log('bush far', JSON.stringify(r2)); await shot(page, 'bush_far_hidden'); await page.close();
}
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); await browser.close();
