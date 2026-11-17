// v3 physics checks: bridge deck driving + building blocking (player and NPC)
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5173/'; const maps = (process.argv[3] || 'village,forest,desert').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const map of maps) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${base}?autostart=1&map=${map}&tank=tiger&q=low&seed=7`);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 240000 });
  const r = await page.evaluate(() => {
    const g = window.__game, D = g.debug, p = g.player, W = g.world; D.freeze(true); const out = { decks: W.decks.length, bridges: [] };
    for (const dk of W.decks.slice(0, 3)) {
      // start 6 m before the deck, drive along it
      const sx = dk.x0 - dk.ux * 8, sz = dk.z0 - dk.uz * 8; const h = Math.atan2(dk.ux, dk.uz);
      D.teleport(sx, sz, h); p.input.aim.set(sx + dk.ux * 300, p.pos.y + 2, sz + dk.uz * 300); D.aim(sx + dk.ux * 300, p.pos.y + 2, sz + dk.uz * 300);
      let maxErr = 0, samples = 0, minAlong = 1e9, maxAlong = -1e9; const keys = g.keys; keys.KeyW = true;
      for (let i = 0; i < 400; i++) { D.simulate(1 / 30); const along = (p.pos.x - dk.x0) * dk.ux + (p.pos.z - dk.z0) * dk.uz; const across = (p.pos.x - dk.x0) * dk.uz - (p.pos.z - dk.z0) * dk.ux;
        // steer back to the centreline
        const err = Math.atan2(-across, 10); p.input.steer = 0; keys.KeyA = err > 0.03; keys.KeyD = err < -0.03;
        if (along > 1 && along < dk.len - 1) { const dy = Math.abs(p.pos.y - dk.deckY(along / dk.len)); maxErr = Math.max(maxErr, dy); samples++; minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along); }
        if (along > dk.len + 6) break; }
      keys.KeyW = false; keys.KeyA = false; keys.KeyD = false;
      const mid = dk.deckY(0.5), terrMid = W.terrain.height(dk.x0 + dk.ux * dk.len / 2, dk.z0 + dk.uz * dk.len / 2);
      out.bridges.push({ len: Math.round(dk.len), deckMidY: +mid.toFixed(2), terrainMidY: +terrMid.toFixed(2), onDeckSamples: samples, maxYErr: +maxErr.toFixed(3), crossed: maxAlong > dk.len - 3, inWater: p.inWater });
    }
    // building: drive straight into the nearest building for 6 s, measure footprint overlap
    const B = W.colliders.filter((c) => c.kind === 'building' && c.hx > 3); let worst = 0; let tests = 0;
    for (const c of B.slice(0, 4)) {
      const dir = [c.s, c.c]; const sx = c.x - dir[0] * (c.hz + 12), sz = c.z - dir[1] * (c.hz + 12);
      if (!g.nav.walkable(...g.nav.toCell(sx, sz))) continue; tests++;
      D.teleport(sx, sz, Math.atan2(dir[0], dir[1])); g.keys.KeyW = true; let pen = 0;
      for (let i = 0; i < 180; i++) { D.simulate(1 / 30); const d = p.spec.dims; const res = g.constructor.rectPush(p.pos.x, p.pos.z, d.W / 2, d.L / 2, p.heading, c); if (res) pen = Math.max(pen, res[2]); }
      g.keys.KeyW = false; worst = Math.max(worst, pen);
    }
    out.building = { tests, worstOverlap_m: +worst.toFixed(3) };
    // NPC: unfreeze 20 s and measure worst footprint overlap of any tank with any building/wall
    D.freeze(false); let npcWorst = 0;
    for (let k = 0; k < 20; k++) { D.simulate(1); for (const t of g.tanks) { if (!t.alive) continue; const d = t.spec.dims; for (const c of W.colGrid.query(t.pos.x, t.pos.z, d.L)) { if (c.kind === 'deck' || c.y1 < t.pos.y + 0.3) continue; const res = g.constructor.rectPush(t.pos.x, t.pos.z, d.W / 2, d.L / 2, t.heading, c); if (res) npcWorst = Math.max(npcWorst, res[2]); } } }
    out.npcWorstOverlap_m = +npcWorst.toFixed(3);
    return out;
  });
  console.log(map, JSON.stringify(r), 'errors:', errs.length ? errs.join(' | ') : 'none'); await page.close();
}
await browser.close();
