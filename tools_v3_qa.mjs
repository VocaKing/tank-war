// v3 numeric QA: loadout, item weight, repair kit, scope aim continuity, bush close spotting, water penetration
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const out = {};
async function open(q) {
  const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '?autostart=1&q=low&seed=7&' + q);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 240000 }); return page;
}
// 1) loadout respected + fixed totals (player and NPC), sanitizing of an over-cap request
let page = await open('map=village&tank=sherman&loadout=10,30,31&items=repair,reload,smoke');
out.loadout = await page.evaluate(() => { const g = window.__game; const p = g.player; return { player: p.ammo, cap: p.spec.ammoCap, npcOk: g.tanks.every((t) => t.ammo.reduce((a, b) => a + b, 0) === t.spec.ammoCap), npc: g.tanks.slice(1, 4).map((t) => t.spec.id + ':' + t.ammo.join('/')), items: p.equip.slots.map((s) => s.id) }; });
// 2) repair kit restores destroyed tracks + damaged engine/gun; medkit crew
out.repair = await page.evaluate(() => { const g = window.__game, p = g.player; g.debug.freeze(true); p.breakTracks(); p.modules.engine = 0.5; p.modules.gun = 0.5; const before = { ...p.modules }; const ok = g.useItem(p.equip.find('repair')); return { before, after: { ...p.modules }, used: ok, chargesLeft: p.equip.slots[p.equip.find('repair')].charges, cooldown: p.equip.slots[p.equip.find('repair')].cd }; });
// 3) item weight lowers top speed: drive on the flattest long road stretch with no items vs heavy items
out.weight = await page.evaluate(() => {
  const g = window.__game, p = g.player, D = g.debug, Eq = p.equip.constructor; const T = g.world.terrain;
  // find a flat, clear 250 m straight
  let spot = null; for (let k = 0; k < 2000 && !spot; k++) { const x = -450 + (k % 40) * 22, z = -450 + Math.floor(k / 40) * 22, h = (k * 0.7) % 6.28; let ok = true; let y0 = T.height(x, z);
    for (let d = 0; d <= 260 && ok; d += 10) { const px = x + Math.sin(h) * d, pz = z + Math.cos(h) * d; if (Math.abs(px) > 560 || Math.abs(pz) > 560 || Math.abs(T.height(px, pz) - y0) > 4 || !g.nav.walkable(...g.nav.toCell(px, pz)) || g.world.colGrid.query(px, pz, 5).length) ok = false; } if (ok) spot = [x, z, h]; }
  if (!spot) return 'no flat spot';
  const run = (items) => { p.equip = new Eq(p, items); D.teleport(...spot); p.speed = 0; g.keys.KeyW = true; let vmax = 0; for (let i = 0; i < 30 * 14; i++) { D.simulate(1 / 30); vmax = Math.max(vmax, Math.abs(p.speed)); } g.keys.KeyW = false; return { items: items.join('+') || 'none', kg: p.equip.kg, factor: +p.equip.factor.toFixed(4), topSpeed_kmh: +(vmax * 3.6).toFixed(2) }; };
  const a = run([]), b = run(['repair', 'camonet', 'overdrive']); return [a, b];
});
// 4) scope opens on the same aim point (and leaving the scope too): ground points and an enemy tank at ~150 m
out.scope = await page.evaluate(() => {
  const g = window.__game, D = g.debug, p = g.player; D.aim(null); const res = []; g.keys = {}; p.speed = 0; p.turnRate = 0; D.simulate(2); p.speed = 0;
  const e = g.tanks.find((t) => t.team === 1); const fx = Math.sin(p.heading), fz = Math.cos(p.heading); e.placeAt(p.pos.x + fx * 70 + fz * 8, p.pos.z + fz * 70 - fx * 8, 1); e.visibleUntil[0] = 1e9; e.spotted[0] = true;
  const toE = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
  for (const [yaw, pitch, label] of [[p.heading + 0.3, -0.12, 'ground'], [p.heading - 0.5, -0.06, 'ground'], [toE, -0.02, 'tank']]) {
    g.cam.sniper = false; g.cam.yaw = yaw; g.cam.pitch = pitch; g._camInit = false; D.simulate(1 / 30); D.simulate(1 / 30);
    if (label === 'tank') { const P = e.model.root.localToWorld(new e.pos.constructor(0, e.spec.dims.hullH * 0.6, 0)); g.alignCamTo(P); D.simulate(1 / 30); D.simulate(1 / 30); }
    const P0 = g.aimPoint.clone(); const d0 = g.aimDist; const c0 = g.camera.position.clone();
    g.toggleSniper(); D.simulate(1 / 30); const P1 = g.aimPoint.clone(); const c1 = g.camera.position.clone();
    const mrad = (c, A, B) => A.clone().sub(c).normalize().angleTo(B.clone().sub(c).normalize()) * 1000;
    g.toggleSniper(); D.simulate(1 / 30); const P2 = g.aimPoint.clone(); const c2 = g.camera.position.clone();
    res.push({ target: label, aimDist: Math.round(d0), enter_err_m: +P1.distanceTo(P0).toFixed(3), enter_err_mrad: +mrad(c1, P1, P0).toFixed(2), exit_err_m: +P2.distanceTo(P1).toFixed(3), exit_err_mrad: +mrad(c2, P2, P1).toFixed(2), scopeHitsTank: g.aimTank === e || P1.distanceTo(e.pos) < 6 });
  }
  return res;
});
// 5) bush: enemy in a bush (not firing) is visible at close range but hidden farther away
out.bush = await page.evaluate(() => {
  const g = window.__game, D = g.debug, p = g.player, W = g.world, T = W.terrain; D.freeze(true);
  const e = g.tanks.find((t) => t.team === 1); e.lastFired = -100; e.speed = 0; e.lastMoving = -100;
  const S = g.spotting; const rows = [];
  for (const b of W.veg.bushes) {
    if (b.r < 3 || Math.abs(b.x) > 500 || Math.abs(b.z) > 500) continue;
    for (let k = 0; k < 8; k++) {
      const h = k * 0.785; const ok = [40, 200].every((R) => { const x = b.x + Math.sin(h) * R, z = b.z + Math.cos(h) * R; return g.nav.walkable(...g.nav.toCell(x, z)) && !W.veg.bushAt(x, z, 4) && !W.losBlocked(x, T.height(x, z) + 3, z, b.x, T.height(b.x, b.z) + 1.5, b.z); });
      if (!ok) continue;
      e.placeAt(b.x, b.z, 0); e.speed = 0;
      for (const R of [40, 120, 200]) { const x = b.x + Math.sin(h) * R, z = b.z + Math.cos(h) * R; D.teleport(x, z, h + Math.PI); for (const t of g.tanks) if (t.team === 0 && !t.isPlayer) t.placeAt(t.pos.x + 2000 > 0 ? -590 : -590, -590, 0);
        e.visibleUntil[0] = 0; S.timer = 0; S.update(0, g.time); const inBush = !!e.inBush; const camo = e.camo; const range = S.spotRange(p, e, g.time);
        rows.push({ R, inBush, camo: +camo.toFixed(2), spotRange_m: Math.round(range), spotted: e.spotted[0] }); }
      // open-ground comparison at 200 m
      return rows;
    }
  }
  return 'no bush';
});
// 6) water: shells into a tank standing in water still penetrate, but less often than on dry land
out.water = await page.evaluate(() => {
  const g = window.__game, D = g.debug, W = g.world, T = W.terrain; D.freeze(true);
  const tiger = g.tanks.find((t) => t.spec.id === 'tiger') || g.tanks.find((t) => t.team === 1); const shooter = g.player; const sh = shooter.spec.shells[0];
  let spot = null; for (let k = 0; k < 40000 && !spot; k++) { const x = -560 + (k % 200) * 5.6, z = -560 + Math.floor(k / 200) * 5.6; const wl = T.waterLevel(x, z); if (wl < -1e8) continue; const dep = wl - T.height(x, z); if (dep > 1.0 && dep < 1.5) spot = [x, z, wl]; }
  if (!spot) return 'no water';
  // shell descends at 10° onto the hull side plate, hitting it 0.4 m below the water surface (≈2.3 m of water path)
  const trial = (x, z, wl, n) => { let pens = 0, hits = 0, wf = 0, wd = 0; const kinds = {}; const V = tiger.pos.constructor; let from = null, aim = null;
    for (let a = 0; a < 8 && !from; a++) { const hd = a * 0.785; tiger.placeAt(x, z, hd); const ay = wl !== null ? wl - 0.4 : tiger.pos.y + 0.9;
      const right = new V(Math.cos(hd), 0, -Math.sin(hd)); const ap = new V(x, ay, z).addScaledVector(right, tiger.spec.dims.W / 2 + 0.02);
      const f = ap.clone().addScaledVector(right, 25 * Math.cos(0.1745)); f.y += 25 * Math.sin(0.1745);
      if (T.segmentHit(f.x, f.y, f.z, ap.x, ap.y, ap.z, 1) < 0 && W.structureHit(f.x, f.y, f.z, ap.x, ap.y, ap.z) < 0) { from = f; aim = ap; } }
    if (!from) return 'no clear line';
    tiger.inWater = wl !== null && wl - tiger.groundY > 0.15;
    for (let i = 0; i < n; i++) { tiger.hp = tiger.maxHp; tiger.alive = true; g.lastTankHit = null; g.lastImpact = null;
      const vel = aim.clone().addScaledVector(aim.clone().sub(from).normalize(), 2).sub(from).normalize().multiplyScalar(sh.velocity);
      const shl = g.ballistics.spawn(shooter, sh, from, vel); const tr = []; for (let s = 0; s < 20; s++) { g.ballistics.update(1 / 60); if (i === 0) tr.push([+shl.pos.y.toFixed(2), !!shl.wet, +(shl.waterDist || 0).toFixed(2)]); } 
      const k = g.lastImpact ? g.lastImpact.kind : 'none'; kinds[k] = (kinds[k] || 0) + 1; const h = g.lastTankHit; if (h && h.tank === tiger) { hits++; if (h.penetrated) pens++; wf += h.waterF; wd += h.waterDist; } }
    return { kinds, inWater: tiger.inWater, depth: wl !== null ? +(wl - tiger.groundY).toFixed(2) : 0, hits, pens, penRate: hits ? +(pens / hits).toFixed(2) : null, avgWaterF: hits ? +(wf / hits).toFixed(2) : null, avgWaterDist_m: hits ? +(wd / hits).toFixed(2) : null }; };
  const wet = trial(spot[0], spot[1], spot[2], 40);
  // dry comparison: flat land
  let dry = null; for (let k = 0; k < 4000 && !dry; k++) { const x = -400 + (k % 60) * 13, z = -400 + Math.floor(k / 60) * 13; if (T.waterLevel(x, z) > -1e8 || T.waterLevel(x - 60, z) > -1e8) continue; if (Math.abs(T.height(x, z) - T.height(x - 60, z)) > 1) continue; if (W.colGrid.query(x - 30, z, 35).length) continue; dry = [x, z]; }
  const dryR = trial(dry[0], dry[1], null, 40);
  return { shell: sh.name + ' ' + sh.pen + 'mm', target: tiger.spec.id + ' side 80mm', wet, dry: dryR };
});
await page.close();
console.log(JSON.stringify(out, null, 1)); console.log('errors:', errs.length ? errs.join(' | ') : 'none'); await browser.close();
