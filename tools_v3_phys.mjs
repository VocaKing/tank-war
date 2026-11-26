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
    const proj = (dk, x, z) => { let best = null; for (const sg of dk.segs) { const dx = x - sg.ax, dz = z - sg.az; const al = dx * sg.ux + dz * sg.uz; const c = Math.max(0, Math.min(sg.l, al)); const ex = dx - sg.ux * c, ez = dz - sg.uz * c; const d = Math.hypot(ex, ez); const s = sg.s0 + ((sg === dk.segs[0] && al < 0) || (sg === dk.segs[dk.segs.length - 1] && al > sg.l) ? al : c); if (!best || d < best.d) best = { d, s }; } return best; };
    const at = (dk, sArc) => { const first = dk.segs[0], lastS = dk.segs[dk.segs.length - 1]; if (sArc <= 0) return [first.ax + first.ux * sArc, first.az + first.uz * sArc]; if (sArc >= dk.len) { const e = sArc - lastS.s0; return [lastS.ax + lastS.ux * e, lastS.az + lastS.uz * e]; } for (const sg of dk.segs) if (sArc <= sg.s0 + sg.l + 1e-6) { const f = sArc - sg.s0; return [sg.ax + sg.ux * f, sg.az + sg.uz * f]; } return [lastS.ax, lastS.az]; };
    const list = W.decks.slice().sort((a, b) => b.len - a.len).slice(0, 4);
    for (const dk of list) {
      const s0 = dk.segs[0]; const sx = s0.ax - s0.ux * 10, sz = s0.az - s0.uz * 10; D.teleport(sx, sz, Math.atan2(s0.ux, s0.uz));
      let maxErr = 0, samples = 0, maxS = -1e9; const keys = g.keys; keys.KeyW = true;
      for (let i = 0; i < 30 * 40; i++) { const pr = proj(dk, p.pos.x, p.pos.z); const [lx, lz] = at(dk, pr.s + 9); D.aim(lx, p.pos.y + 2, lz);
        let err = Math.atan2(lx - p.pos.x, lz - p.pos.z) - p.heading; err = Math.atan2(Math.sin(err), Math.cos(err)); keys.KeyA = err > 0.04; keys.KeyD = err < -0.04; D.simulate(1 / 30);
        const pr2 = proj(dk, p.pos.x, p.pos.z); if (pr2.s > 1 && pr2.s < dk.len - 1 && pr2.d < dk.hw) { maxErr = Math.max(maxErr, Math.abs(p.pos.y - dk.deckY(pr2.s / dk.len))); samples++; } maxS = Math.max(maxS, pr2.s);
        if (pr2.s > dk.len + 6) break; }
      keys.KeyW = false; keys.KeyA = false; keys.KeyD = false;
      const near = { cols: W.colGrid.query(p.pos.x, p.pos.z, 8).filter((c) => c.kind !== 'deck').map((c) => c.kind + ':' + c.hx.toFixed(1) + 'x' + c.hz.toFixed(1) + ' y' + c.y0.toFixed(1) + '-' + c.y1.toFixed(1) + ' d' + Math.hypot(c.x - p.pos.x, c.z - p.pos.z).toFixed(1)), rocks: W.veg.rockGrid.query(p.pos.x, p.pos.z, 8).filter((r) => r.s >= 1.6).map((r) => r.s.toFixed(1) + '@' + Math.hypot(r.x - p.pos.x, r.z - p.pos.z).toFixed(1)), py: p.pos.y.toFixed(2), gy: W.groundHeight(p.pos.x, p.pos.z).toFixed(2), slopeF: [W.groundHeight(p.pos.x + Math.sin(p.heading) * 2.5, p.pos.z + Math.cos(p.heading) * 2.5) - W.groundHeight(p.pos.x - Math.sin(p.heading) * 2.5, p.pos.z - Math.cos(p.heading) * 2.5)].map((v) => v.toFixed(2)), trees: W.veg.treeGrid.query(p.pos.x, p.pos.z, 6).filter((t) => t.alive).length };
      const [mx, mz] = at(dk, dk.len / 2); let turn = 0; for (let k = 1; k < dk.segs.length; k++) { let a = Math.atan2(dk.segs[k].ux, dk.segs[k].uz) - Math.atan2(dk.segs[k - 1].ux, dk.segs[k - 1].uz); a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 57.3; turn = Math.max(turn, Math.round(a)); }
      out.bridges.push({ len: Math.round(dk.len), segs: dk.segs.length, deckMidY: +dk.deckY(0.5).toFixed(2), terrainMidY: +W.terrain.height(mx, mz).toFixed(2), onDeckSamples: samples, maxYErr: +maxErr.toFixed(3), crossed: maxS > dk.len + 3, reached_m: Math.round(maxS), speed: +p.speed.toFixed(2), maxTurnDeg: turn, near: maxS < dk.len ? near : undefined, inWater: p.inWater });
    }
    const maxFixedPenetration = (tank) => {
      const physics = g.physics.world, hull = tank.vehicle.body.collider(0);
      let deepest = 0;
      physics.contactPairsWith(hull, other => {
        if (other.parent()) return;
        physics.contactPair(hull, other, manifold => {
          for (let i = 0; i < manifold.numContacts(); i++) deepest = Math.max(deepest, -manifold.contactDist(i));
        });
      });
      return deepest;
    };
    // building: drive straight into the nearest building for 6 s, measure footprint overlap
    const B = W.colliders.filter((c) => c.kind === 'building' && c.hx > 3); let worst = 0; let tests = 0;
    for (const c of B.slice(0, 4)) {
      const dir = [c.s, c.c]; const sx = c.x - dir[0] * (c.hz + 12), sz = c.z - dir[1] * (c.hz + 12);
      if (!g.nav.walkable(...g.nav.toCell(sx, sz))) continue; tests++;
      D.teleport(sx, sz, Math.atan2(dir[0], dir[1])); g.keys.KeyW = true; let pen = 0;
      for (let i = 0; i < 180; i++) { D.simulate(1 / 30); pen = Math.max(pen, maxFixedPenetration(p)); }
      g.keys.KeyW = false; worst = Math.max(worst, pen);
    }
    out.building = { tests, worstOverlap_m: +worst.toFixed(3) };
    const badT = g.tanks.filter((t) => !Number.isFinite(t.pos.x + t.pos.y + t.pos.z) || !Number.isFinite(t.heading)).map((t) => t.name + ':' + [t.pos.x, t.pos.y, t.pos.z, t.heading, t.speed].join(',')); if (badT.length) return { ...out, badT };
    // NPC: unfreeze 20 s and measure worst footprint overlap of any tank with any building/wall
    D.freeze(false); let npcWorst = 0;
    for (let k = 0; k < 20; k++) {
      D.simulate(1);
      for (const t of g.tanks) if (t.alive) npcWorst = Math.max(npcWorst, maxFixedPenetration(t));
    }
    out.npcWorstOverlap_m = +npcWorst.toFixed(3);
    return out;
  });
  console.log(map, JSON.stringify(r), 'errors:', errs.length ? errs.join(' | ') : 'none'); await page.close();
}
await browser.close();
