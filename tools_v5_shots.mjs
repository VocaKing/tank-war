// v5 screenshots at High: map overviews + close-ups. usage: node tools_v5_shots.mjs [base] [maps] [which] [q]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const maps = (process.argv[3] || 'village,forest,desert').split(','); const only = (process.argv[4] || 'over,terrain,building,water,ground').split(','); const Q = process.argv[5] || 'high';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const frames = (page, n = 3) => page.evaluate((n) => new Promise((res) => { setTimeout(res, 300000); let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const NAME = { village: 'map1', forest: 'map2', desert: 'map3' };
for (const map of maps) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errs.push(map + ' ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(map + ' ' + m.text()); });
  await page.goto(base + `?autostart=1&q=${Q}&seed=11&map=${map}&tank=${map === 'desert' ? 'm1a2' : map === 'forest' ? 'leo2a6' : 'sherman'}`);
  await page.waitForFunction(() => window.__game && window.__game.player && window.__game.world.hdrLoaded, null, { timeout: 300000 });
  await page.evaluate(() => { const h = document.querySelector('.hud'); if (h) h.style.visibility = 'hidden'; window.__game.debug.freeze(true); });
  const shot = async (name) => { await frames(page, 4); await page.waitForTimeout(500); await page.screenshot({ path: `screenshots/v5/${name}.png`, timeout: 300000 }); console.log('saved', name); };
  const view = (fn) => page.evaluate(`(() => { const g = window.__game, D = g.debug, W = g.world, T = W.terrain, p = g.player.pos; const hy = (x, z) => T.height(x, z); D.pause(false);
    const look = (x, y, z, tx, ty, tz, fov = 60) => { W.grass.last = null; W.grass.update({ x, z }); W.veg.updateLOD({ x, y, z }); D.camAt([x, y, z, tx, ty, tz, fov]); D.simulate(0.1); D.pause(true); };
    ${fn} })()`);
  if (only.includes('over')) {
    await view(`const b = W.bases[1]; const dx = b.x - p.x, dz = b.z - p.z, l = Math.hypot(dx, dz); look(p.x - dx / l * 20, hy(p.x, p.z) + 45, p.z - dz / l * 20, p.x + dx / l * 300, hy(p.x + dx / l * 300, p.z + dz / l * 300), p.z + dz / l * 300);`);
    await shot(NAME[map]);
  }
  if (only.includes('terrain')) {
    const r = await view(`for (let k = 0; k < 400; k++) { const x = p.x + Math.sin(k) * (30 + k), z = p.z + Math.cos(k) * (30 + k); if (W.colGrid.query(x, z, 12).length || W.veg.treeGrid.query(x, z, 10).length || W.veg.bushAt(x, z, 6)) continue; const s = W.mb.splat ? 0 : 0; const h = k * 0.7; look(x, hy(x, z) + 1.7, z, x + Math.sin(h) * 9, hy(x + Math.sin(h) * 9, z + Math.cos(h) * 9), z + Math.cos(h) * 9); return [x | 0, z | 0]; } return 'none';`);
    console.log('terrain', r); await shot(NAME[map] + '_terrain_closeup');
  }
  if (only.includes('building')) {
    const r = await view(`const B = W.mb.buildings.filter((b) => !b.ruined && !['tower', 'church', 'mosque'].includes(b.kind)).sort((a, b2) => Math.hypot(a.x, a.z) - Math.hypot(b2.x, b2.z));
      for (const bb of B.slice(0, 40)) for (let k = 0; k < 16; k++) { const ang = k / 16 * 6.283; const D2 = Math.max(bb.w, bb.d) / 2 + 11; const x = bb.x + Math.sin(ang) * D2, z = bb.z + Math.cos(ang) * D2; const y = hy(x, z) + 1.8; if (W.colGrid.query(x, z, 3).length) continue; if (W.structureHit(x, y, z, bb.x, hy(bb.x, bb.z) + 3, bb.z) < 0.5) continue; if (W.veg.treeGrid.query((x + bb.x) / 2, (z + bb.z) / 2, 6).length || W.veg.bushGrid.query((x + bb.x) / 2, (z + bb.z) / 2, 5).length) continue;
        look(x, y, z, bb.x, hy(bb.x, bb.z) + 3.5, bb.z, 55); return [bb.x | 0, bb.z | 0, bb.style]; } return 'none';`);
    console.log('building', r); await shot(NAME[map] + '_building_closeup');
  }
  if (only.includes('water')) {
    const r = await view(`const L = W.mb.lakes[0]; const R = W.mb.rivers.find((r) => !r.dry);
      let cx, cz, wl, rad; if (L) { cx = L.x; cz = L.z; wl = L.wl; rad = L.r; } else if (R) { const q = R.pts[Math.floor(R.pts.length / 2)]; cx = q[0]; cz = q[1]; wl = q[2]; rad = R.width; } else return 'nowater';
      for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283; const x = cx + Math.sin(a) * (rad + 14), z = cz + Math.cos(a) * (rad + 14); if (W.veg.treeGrid.query(x, z, 5).length || W.veg.bushAt(x, z, 4)) continue; look(x, Math.max(hy(x, z), wl) + 2.5, z, cx, wl, cz, 60); return [cx | 0, cz | 0, !!L]; } return 'blocked';`);
    console.log('water', r); await shot(NAME[map] + '_water');
  }
  if (only.includes('ground')) {
    // ground-level, looking across the sun so shadows of tanks/trees read clearly
    const r = await view(`const s = W.sunDir; const sa = Math.atan2(s.x, s.z) + Math.PI * 0.6; for (const tk of g.tanks) { const q = tk.pos;
      for (let k = 0; k < 64; k++) { const a = sa + k * 0.4, d = 11 + (k % 4) * 3; const x = q.x + Math.sin(a) * d, z = q.z + Math.cos(a) * d; let bad = W.colGrid.query(x, z, 3).length > 0; for (let u = 0; u <= 1 && !bad; u += 0.2) { const qx = x + (q.x - x) * u, qz = z + (q.z - z) * u; if (W.veg.treeGrid.query(qx, qz, 4).length || W.veg.bushAt(qx, qz, 3)) bad = true; } if (bad) continue; look(x, hy(x, z) + 1.6, z, q.x, hy(q.x, q.z) + 1.2, q.z, 60); return [q.x | 0, q.z | 0, k]; } } return 'none';`);
    console.log('ground', r); await shot(NAME[map] + '_shadows_ground');
  }
  await page.close();
}
console.log('errors:', errs.join(' | ') || 'none'); await browser.close();
