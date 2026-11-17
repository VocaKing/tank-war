// Verifies that a shell fired at the ballistic reticle lands on the crosshair point at 100/300/500 m (dispersion zeroed).
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5173/'; const tanks = (process.argv[3] || 'sherman,tiger,leo2a6').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const rows = [];
for (const tank of tanks) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => errs.push(tank + ': ' + e.message));
  await page.goto(`${base}?autostart=1&map=desert&tank=${tank}&q=low&seed=5`);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 240000 });
  const r = await page.evaluate(async () => {
    const g = window.__game, D = g.debug, p = g.player, T = g.world.terrain; D.freeze(true); D.pause(true);
    p.dispersion = () => 0; const out = [];
    // find a flat open spot; targets are virtual points 1.5 m above ground straight ahead (shells hit ground or the target tank)
    const e = g.tanks.find((t) => t.team === 1);
    for (const R of [100, 300, 500]) {
      let best = null;
      for (let k = 0; k < 400 && !best; k++) {
        const x = -400 + (k % 20) * 40, z = -400 + Math.floor(k / 20) * 40; const h = (k * 0.37) % 6.28;
        const tx = x + Math.sin(h) * R, tz = z + Math.cos(h) * R; if (Math.abs(tx) > 560 || Math.abs(tz) > 560) continue;
        if (g.world.colGrid.query(x, z, 8).length || g.world.colGrid.query(tx, tz, 8).length) continue;
        const [ci, cj] = g.nav.toCell(x, z), [ti, tj] = g.nav.toCell(tx, tz); if (!g.nav.walkable(ci, cj) || !g.nav.walkable(ti, tj)) continue;
        if (g.world.losBlocked(x, T.height(x, z) + 2.5, z, tx, T.height(tx, tz) + 1.2, tz)) continue;
        if (T.segmentHit(x, T.height(x, z) + 3, z, tx, T.height(tx, tz) + 0.6, tz, 2) >= 0) continue;
        best = [x, z, h, tx, tz];
      }
      if (!best) { out.push({ R, err: 'no spot' }); continue; }
      const [x, z, h, tx, tz] = best; D.teleport(x, z, h); e.placeAt(tx, tz, h + Math.PI / 2); e.spotted[0] = true; e.noDamageTest = true;
      const aim = e.pos.clone(); aim.y += e.spec.dims.hullH * 0.6; // centre of the target's side
      D.aim(aim.x, aim.y, aim.z); D.pause(false); D.simulate(8); D.aim(aim.x, aim.y, aim.z); D.simulate(0.1);
      const ret = g.reticleWorld ? g.reticleWorld.clone() : null;
      g.lastImpact = null; const fired = D.fire(); let t = 0; while (!g.lastImpact && t < 4) { D.simulate(0.05, 1 / 120); t += 0.05; }
      D.pause(true); const li = g.lastImpact; const mz = p.model.muzzle.getWorldPosition(aim.clone()); const dir = aim.clone().sub(mz).normalize(); const perp = (q) => { const d = q.clone().sub(aim); return +d.sub(dir.clone().multiplyScalar(d.dot(dir))).length().toFixed(3); };
      out.push({ R: Math.round(p.pos.distanceTo(aim)), fired, reticleMiss_m: ret ? perp(ret) : null, impactMiss_m: li ? perp(li.p) : null, reticleToImpact_m: ret && li ? +ret.distanceTo(li.p).toFixed(3) : null, hit: li ? li.kind + (li.tank ? ':' + li.tank.spec.id : '') : 'none', tof: +t.toFixed(2) });
    }
    return out;
  });
  rows.push({ tank, r }); console.log(tank, JSON.stringify(r)); await page.close();
}
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); await browser.close();
