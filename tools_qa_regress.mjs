// QA v5 regression: per map x quality runs functional probes in-page and prints a JSON verdict per check.
// usage: node tools_qa_regress.mjs [base] [maps] [qualities] [outdir]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4176/';
const maps = (process.argv[3] || 'village,forest,desert').split(',');
const quals = (process.argv[4] || 'low,high').split(',');
const out = process.argv[5] || '/workspace/tw-shots/qa';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); setTimeout(res, 60000); }), n);
let fails = 0;
for (const map of maps) for (const q of quals) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(`${base}?autostart=1&map=${map}&tank=sherman&q=${q}&seed=7`);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 180000 });
  // HDRI may stream in; give it time
  await page.waitForFunction(() => window.__game.world.hdrLoaded, null, { timeout: 60000 }).catch(() => {});
  await frames(page, 3);
  const R = {};
  const run = async (name, fn, arg) => { if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) return; try { R[name] = await page.evaluate(fn, arg); } catch (e) { R[name] = { pass: false, error: e.message.slice(0, 300) }; } };
  await run('env', () => { const g = window.__game, W = g.world, S = g.scene; const passes = g.post ? g.post.composer.passes.map((p) => p.constructor.name + (p.enabled ? '' : '(off)')) : [];
    const env = S.environment; return { pass: !!env && W.hdrLoaded && (g.quality !== 'high' || passes.length >= 4), hdrLoaded: W.hdrLoaded, hdri: W.def.hdri?.file, env: env ? env.constructor.name + ' ' + (env.image?.width || '') : null, bg: S.background?.constructor.name, toneMapping: g.renderer.toneMapping, passes }; });
  await page.screenshot({ path: `${out}/env_${map}_${q}.png`, timeout: 240000 }).catch((e) => console.log("shot fail", e.message.slice(0, 80)));
  // ---- bridges ----
  await run('bridges', () => { const g = window.__game, W = g.world, p = g.player; g.debug.freeze(true); const out = [];
    for (const d of W.decks) {
      const s0 = d.segs[0], s1 = d.segs[d.segs.length - 1]; const pts = [[s0.ax - s0.ux * 14, s0.az - s0.uz * 14]]; for (const s of d.segs) pts.push([s.ax, s.az]); pts.push([s1.ax + s1.ux * s1.l, s1.az + s1.uz * s1.l]); pts.push([s1.ax + s1.ux * (s1.l + 14), s1.az + s1.uz * (s1.l + 14)]);
      for (const dirn of [1, -1]) {
        const P = dirn > 0 ? pts : pts.slice().reverse(); const goal = P[P.length - 1];
        p.placeAt(P[0][0], P[0][1], Math.atan2(P[1][0] - P[0][0], P[1][1] - P[0][1])); p.speed = 0; let wi = 1, t = 0, minGap = 99, maxSink = 0, ok = false, stuck = 0;
        for (; t < 45; t += 1 / 30) {
          while (wi < P.length - 1 && Math.hypot(P[wi][0] - p.pos.x, P[wi][1] - p.pos.z) < 6) wi++;
          const tg = P[wi]; const des = Math.atan2(tg[0] - p.pos.x, tg[1] - p.pos.z); let diff = des - p.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          g.keys.KeyW = Math.abs(diff) < 0.8; g.keys.KeyA = diff > 0.04; g.keys.KeyD = diff < -0.04; g.debug.simulate(1 / 30);
          const dk = W.deckAt(p.pos.x, p.pos.z); if (dk > -1e8 && dk > W.terrain.height(p.pos.x, p.pos.z)) { maxSink = Math.max(maxSink, dk - p.pos.y); }
          if (Math.hypot(goal[0] - p.pos.x, goal[1] - p.pos.z) < 5) { ok = true; break; }
        }
        g.keys.KeyW = g.keys.KeyA = g.keys.KeyD = false;
        out.push({ len: Math.round(d.len), causeway: !!d.causeway, dir: dirn, ok, sec: +t.toFixed(1), maxSinkBelowDeck: +maxSink.toFixed(2), end: [Math.round(p.pos.x), Math.round(p.pos.z)], goal: goal.map(Math.round) });
      }
    }
    g.debug.freeze(false); return { pass: out.every((o) => o.ok && o.maxSinkBelowDeck < 0.4), n: W.decks.length, runs: out }; });
  // ---- building clipping: drive player into buildings + AI sim ----
  await run('clip', () => { const g = window.__game, W = g.world, p = g.player; const Rp = g.constructor.rectPush; g.debug.freeze(true);
    const pen = (t) => { let worst = 0; const d = t.spec.dims; for (const c of W.colGrid.query(t.pos.x, t.pos.z, d.L / 2 + 2)) { if (c.kind === 'deck' || c.kind === 'prop') continue; if (c.y1 < t.pos.y + 0.3 || c.y0 > t.pos.y + d.hullH) continue; const r = Rp(t.pos.x, t.pos.z, d.W / 2, d.L / 2, t.heading, c); if (r && r[2] > worst) worst = r[2]; } return worst; };
    const blds = W.colliders.filter((c) => c.kind === 'building' || c.kind === 'wall' || !c.kind).slice(0, 400); const kinds = {}; for (const c of W.colliders) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    let worstDrive = 0, tried = 0;
    for (let i = 0; i < blds.length && tried < 6; i += Math.max(1, Math.floor(blds.length / 6))) { const c = blds[i]; if (c.kind !== 'building') continue; tried++;
      for (const ang of [0, 1.57]) { const x = c.x + Math.sin(ang) * (Math.max(c.hx, c.hz) + 12), z = c.z + Math.cos(ang) * (Math.max(c.hx, c.hz) + 12); p.placeAt(x, z, Math.atan2(c.x - x, c.z - z)); p.speed = 0; if (pen(p) > 0 || W.colGrid.query(x, z, 6).some((o) => o !== c && o.kind === 'building' && Rp(x, z, 3, 5, p.heading, o))) continue; // start spot inside a neighbouring block
        g.keys.KeyW = true; for (let k = 0; k < 150; k++) { g.debug.simulate(1 / 30); worstDrive = Math.max(worstDrive, pen(p)); } g.keys.KeyW = false; } }
    g.debug.freeze(false); g.debug.teleport(...(() => { const b = W.bases[0]; return [b.x, b.z, 0]; })());
    const pd = p.damage; p.damage = () => {}; // keep the player alive through the AI battle: later probes need it as observer
    let worstAI = 0, who = null; for (let s = 0; s < 60 * 5; s++) { g.debug.simulate(0.2); for (const t of g.tanks) { if (!t.alive) continue; const v = pen(t); if (v > worstAI) { worstAI = v; who = [t.spec.id, Math.round(t.pos.x), Math.round(t.pos.z)]; } } }
    p.damage = pd; return { pass: worstDrive < 0.15 && worstAI < 0.15, kinds, triedBuildings: tried, worstDrivePen: +worstDrive.toFixed(3), worstAIPen: +worstAI.toFixed(3), who }; });
  // ---- bush spotting ----
  await run('spot', () => { const g = window.__game, W = g.world, p = g.player, S = g.spotting; g.debug.freeze(true);
    const b0 = W.bases[0]; p.placeAt(b0.x, b0.z, 0); g.debug.simulate(0.5);
    const allies = g.tanks.filter((t) => t.team === 0 && t.alive), enemy = g.tanks.find((t) => t.team === 1 && t.alive); if (!p.alive) return { pass: false, error: 'player dead before spot probe' };
    // park the other enemies far away in the enemy base corner so they don't interfere
    const eye = (o) => [o.pos.x, o.pos.y + o.spec.dims.hullH + o.spec.dims.turretH + 0.3, o.pos.z];
    const res = {}; const bushes = W.veg.bushes || []; const cand = bushes.filter((b) => b.r >= 2.5 && W.veg.bushAt(b.x, b.z));
    const tryBush = (lo, hi) => { for (const b of cand) { const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z); if (d < lo || d > hi) continue; const [i, j] = g.nav.toCell(b.x, b.z); if (!g.nav.walkable(i, j)) continue;
      enemy.placeAt(b.x, b.z, 0); const e = eye(p); if (W.losBlocked(...e, enemy.pos.x, enemy.pos.y + enemy.spec.dims.hullH * 0.6, enemy.pos.z)) continue; if (!enemy.inBush && !W.veg.bushAt(enemy.pos.x, enemy.pos.z)) continue; return b; } return null; };
    enemy.lastFired = -100; g.debug.simulate(0.1);
    const near = tryBush(25, 48); if (near) { enemy.lastFired = -100; g.debug.simulate(1); res.near = { d: Math.round(near && enemy.pos.distanceTo(p.pos)), inBush: !!enemy.inBush, spotted: enemy.spotted[0] }; } else res.near = 'no bush 25-48 m with LOS';
    // far bush: outside concealed spot range, inside the "fired" range
    const camoHid = S.camo(enemy, g.time); const vr = p.viewRange; const rHid = Math.max(50, vr * (1 - camoHid));
    const far = tryBush(Math.max(60, rHid + 15), Math.min(vr * 0.95, vr * (1 - camoHid * 0.25) - 10));
    if (far) { for (const a of allies) if (a !== p) a.placeAt(W.bases[0].x + (a.id % 3) * 8 - 300 * Math.sign(W.bases[0].x || 1), W.bases[0].z, 0);
      enemy.lastFired = -100; g.debug.simulate(2); const minD = Math.min(...allies.filter((a) => a.alive).map((a) => a.pos.distanceTo(enemy.pos)));
      const hiddenBefore = !enemy.spotted[0]; enemy.reloadLeft = 0; enemy.input.aim.set(enemy.pos.x, enemy.pos.y + 300, enemy.pos.z + 50); g.debug.simulate(0.4); enemy.reloadLeft = 0; const fired = enemy.tryFire(g.time); const tF = g.time;
      g.debug.simulate(0.5); const s05 = enemy.spotted[0]; g.debug.simulate(4.0); const s45 = enemy.spotted[0]; g.debug.simulate(3.0); const s75 = enemy.spotted[0];
      res.far = { d: Math.round(enemy.pos.distanceTo(p.pos)), minAllyD: Math.round(minD), rHid: Math.round(rHid), inBush: !!enemy.inBush, hiddenBefore, fired, spotted_0_5s: s05, spotted_4_5s: s45, spotted_7_5s: s75 };
    } else res.far = 'no far bush';
    g.debug.freeze(false);
    const nOK = typeof res.near === 'object' ? res.near.spotted && res.near.inBush : null; const fOK = typeof res.far === 'object' ? res.far.hiddenBefore && res.far.fired && res.far.spotted_0_5s && res.far.spotted_4_5s && !res.far.spotted_7_5s : null;
    return { pass: nOK !== false && fOK !== false && (nOK || fOK), ...res }; });
  // ---- water penetration (KE + HEAT), shell fired through water into a submerged hull ----
  await run('water', () => { const g = window.__game, W = g.world, T = W.terrain, p = g.player; g.debug.freeze(true); let spot = null;
    for (let x = -W.playHalf + 20; x < W.playHalf - 20 && !spot; x += 4) for (let z = -W.playHalf + 20; z < W.playHalf - 20 && !spot; z += 4) { const wl = T.waterLevel(x, z); if (wl > -1e8 && wl - T.height(x, z) > 1.1 && W.deckAt(x, z) < -1e8) spot = [x, z, wl]; }
    if (!spot) { g.debug.freeze(false); return { pass: true, note: 'no water deeper than 1.1 m on this map' }; }
    const e = g.tanks.find((t) => t.team === 1 && t.alive); const out = [];
    const shoot = (shIdx, inWater) => { e.hp = e.maxHp; e.alive = true; const [x, z, wl] = spot; if (inWater) e.placeAt(x, z, 0); else { e.placeAt(W.bases[1].x, W.bases[1].z, 0); }
      g.debug.simulate(0.05); const pt = e.model.root.localToWorld(new e.pos.constructor(e.spec.dims.W / 2 + 0.02, 0.55, 0)); const ang = 18 * Math.PI / 180; const dir = new e.pos.constructor(-Math.cos(ang), -Math.sin(ang), 0).normalize();
      const wlh = T.waterLevel(pt.x, pt.z); const L = Math.max(8, ((wlh > -1e8 ? wlh : pt.y) + 1.5 - pt.y) / Math.sin(ang)); const o = pt.clone().addScaledVector(dir, -L); const sh = p.spec.shells[shIdx]; g.lastTankHit = null; g.ballistics.spawn(p, sh, o, dir.clone().multiplyScalar(sh.velocity)); g.debug.simulate(0.3);
      const h = g.lastTankHit; return { shell: sh.type, impact: g.lastImpact?.kind, L: +L.toFixed(1), depthAtHit: +(T.waterLevel(pt.x, pt.z) - pt.y).toFixed(2), hit: !!h, waterF: h ? +h.waterF.toFixed(2) : null, waterDist: h ? +h.waterDist.toFixed(2) : null, pen: h ? Math.round(h.pen) : null }; };
    for (let si = 0; si < p.spec.shells.length; si++) { const dry = shoot(si, false), wet = shoot(si, true); out.push({ dry, wet }); }
    e.hp = e.maxHp; g.debug.freeze(false);
    return { pass: out.every((o) => o.dry.hit && (o.wet.shell === 'HE' ? o.wet.impact === 'water' || o.wet.hit : o.wet.hit && o.wet.waterF < 1 && o.wet.waterF > 0 && o.wet.pen > 0)) && out.some((o) => o.wet.hit && o.wet.waterF < 1), spot: spot.map(Math.round), out }; });
  // ---- dispersion bloom ----
  await run('disp', () => { const g = window.__game, p = g.player, W = g.world; g.debug.freeze(true); const b = W.bases[0]; p.placeAt(b.x, b.z, p.heading); p.speed = 0;
    const aim = () => { const fx = Math.sin(p.heading), fz = Math.cos(p.heading); const x = p.pos.x + fx * 200, z = p.pos.z + fz * 200; g.debug.aim(x, W.groundHeight(x, z) + 1, z); };
    aim(); g.debug.simulate(8); const still = p.bloom; g.keys.KeyW = true; g.debug.simulate(2); aim(); const moving = p.bloom; g.keys.KeyW = false; g.debug.simulate(1.5); aim(); g.debug.simulate(6); const settled = p.bloom;
    g.debug.fire(); g.debug.simulate(1 / 30); const fired = p.bloom; g.debug.simulate(1); const fired1 = p.bloom; g.debug.simulate(5); const after = p.bloom; g.debug.aim(null); g.debug.freeze(false);
    const r = { still: +still.toFixed(2), moving: +moving.toFixed(2), settled: +settled.toFixed(2), fired: +fired.toFixed(2), fired1s: +fired1.toFixed(2), after5s: +after.toFixed(2) };
    return { pass: moving > still + 0.1 && fired > settled + 0.5 && fired1 < fired && after < fired1 && after < 1.2, ...r }; });
  // ---- reticle range right after a shot (3162 m report) ----
  await run('recoilRange', () => { const g = window.__game, p = g.player, W = g.world; g.debug.freeze(true); g.cam.sniper = false; { const b = W.bases[0]; p.placeAt(b.x, b.z, Math.atan2(-b.x, -b.z)); g.cam.yaw = p.heading; g.cam.pitch = -0.12; g._camInit = false; g.debug.simulate(0.5); } const fx = Math.sin(p.heading), fz = Math.cos(p.heading); const x = p.pos.x + fx * 150, z = p.pos.z + fz * 150; g.debug.aim(x, W.groundHeight(x, z) + 0.5, z); g.debug.simulate(6);
    g.debug.fire(); let bad = 0, maxD = 0, noHit = 0; for (let i = 0; i < 45; i++) { g.debug.simulate(1 / 30); const t = document.getElementById('h-pen').textContent; const m = /(\d+) m$/.exec(t); const d = m ? +m[1] : g.reticleNoHit ? 0 : Math.round(g.reticleDist || 0); maxD = Math.max(maxD, d); if (d > 1500) bad++; if (g.reticleNoHit) noHit++; }
    g.debug.aim(null); g.debug.freeze(false); return { pass: bad === 0, framesOver1500m: bad, maxReadout: maxD, noHitFrames: noHit }; });
  // ---- scope enter/leave keeps the aim point ----
  await run('scope', () => { const g = window.__game, p = g.player, W = g.world; g.debug.freeze(true); g.debug.aim(null); const b = W.bases[0]; p.placeAt(b.x, b.z, p.heading); const out = [];
    for (const [dy, pitch] of [[0, -0.06], [0.5, -0.12], [-0.4, -0.03], [1.2, 0.02]]) { g.cam.sniper = false; g.cam.yaw = p.heading + dy; g.cam.pitch = pitch; g._camInit = false; g.debug.simulate(1.5);
      const P0 = g.aimPoint.clone(); const d0 = g.aimDist; g.toggleSniper(); g.debug.simulate(1 / 30); const P1 = g.aimPoint.clone(); const d1 = g.aimDist; const c1 = g.camera.position.clone(); const dd = P0.clone().sub(c1); const Pn = c1.clone().addScaledVector(dd, 0.98); const occl = g.world.terrain.segmentHit(c1.x, c1.y, c1.z, Pn.x, Pn.y, Pn.z, 2) >= 0 || g.world.structureHit(c1.x, c1.y, c1.z, Pn.x, Pn.y, Pn.z) >= 0; g.toggleSniper(); g.debug.simulate(1 / 30); const P2 = g.aimPoint.clone();
      const cp = g.camera.position; out.push({ dist: Math.round(d0), scopeDist: Math.round(d1), scopeOccluded: occl, enterErr: +P0.distanceTo(P1).toFixed(2), leaveErr: +P1.distanceTo(P2).toFixed(2), enterMrad: +(P0.distanceTo(P1) / Math.max(1, d0) * 1000).toFixed(2), leaveMrad: +(P1.distanceTo(P2) / Math.max(1, d0) * 1000).toFixed(2) }); }
    g.debug.freeze(false); return { pass: out.every((o) => o.dist >= 1990 || o.scopeOccluded || (o.enterMrad < 2 && o.leaveMrad < 2)), note: 'dist>=1990 = sky (no ray hit): aim point is 2 km along the view ray, so a camera move shifts it along the ray only', out }; });
  // ---- armour overlay ----
  await run('armor', () => { const g = window.__game, p = g.player; g.debug.freeze(true); const e = g.tanks.find((t) => t.team === 1 && t.alive); const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    e.placeAt(p.pos.x + fx * 60, p.pos.z + fz * 60, p.heading + 1.2); e.spotted[0] = true; e.visibleUntil[0] = g.time + 100; g.debug.simulate(0.5); const P = e.pos.clone(); P.y += 1.2;
    g.cam.sniper = true; g.cam.zoom = 4; g.alignCamTo(P); g.debug.aim(P.x, P.y, P.z); const was = g.armorView.enabled; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' })); const toggled = g.armorView.enabled !== was; if (!g.armorView.enabled) g.armorView.toggle();
    e.visibleUntil[0] = g.time + 100; g.debug.simulate(0.2); const d = g.armorView.data.get(e); const m = d && d.mat; window.__qaArmorE = e; window.__qaArmorP = P;
    return { pass: toggled && !!m && m.transparent && !m.depthWrite && g.armorView.overlayCount(e) > 0 && /0\.42 \+ 0\.25 \* rim/.test(m.fragmentShader), toggled, transparent: m?.transparent, depthWrite: m?.depthWrite, overlays: g.armorView.overlayCount(e), paintMeshesVisible: e.model.meshes.filter((x) => x.visible).length }; });
  if (R.armor && R.armor.overlays) { await page.evaluate(() => { const g = window.__game; g.debug.simulate(0.05); }); await frames(page, 2); await page.screenshot({ path: `${out}/armor_${map}_${q}.png`, timeout: 240000 }).catch(() => {});
    await page.evaluate(() => { const g = window.__game; g.armorView.toggle(); g.debug.simulate(0.05); }); await frames(page, 2); await page.screenshot({ path: `${out}/armor_off_${map}_${q}.png`, timeout: 240000 }).catch(() => {});
    await page.evaluate(() => { const g = window.__game; g.armorView.toggle(); g.cam.sniper = false; g.debug.aim(null); g.debug.freeze(false); }); }
  // ---- ammo 1/2/3, items 4/5/6/R/F, weight ----
  await run('keys', () => { const g = window.__game, p = g.player, W = g.world; g.debug.freeze(true); const key = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const ammo = []; for (const [k, i] of [['Digit2', 1], ['Digit3', 2], ['Digit1', 0]]) { p.reloadLeft = 0; key(k); ammo.push({ key: k, want: i, got: p.shellIdx, hasShell: !!p.spec.shells[i] && p.ammo[i] > 0, reload: +p.reloadLeft.toFixed(2) }); }
    const items = {}; const slots = p.equip.slots.map((s) => s.id);
    p.modules.tracks = 0; p.modules.gun = 0.5; key('KeyR'); items.R_repair = p.modules.tracks === 1 && p.modules.gun === 1;
    p.burning = 5; key('KeyF'); items.F_ext = p.burning === 0;
    p.crew[1].alive = false; const mi = slots.indexOf('medkit'); key('Digit' + (4 + mi)); items.medkit = p.crew[1].alive;
    for (const s of p.equip.slots) s.cd = 0; p.modules.engine = 0.5; key('Digit' + (4 + slots.indexOf('repair'))); items.digitRepair = p.modules.engine === 1;
    // weight: top speed on the same straight with the default kit vs. no items
    const b = W.bases[0]; const top = (factor) => { p.equip.factor = factor; p.placeAt(b.x, b.z, Math.atan2(-b.x, -b.z)); p.speed = 0; g.keys.KeyW = true; let vmax = 0; for (let i = 0; i < 360; i++) { g.debug.simulate(1 / 30); vmax = Math.max(vmax, Math.abs(p.speed)); } g.keys.KeyW = false; return vmax; };
    const f0 = p.equip.factor; const vLoaded = top(f0), vEmpty = top(1); p.equip.factor = f0; g.debug.freeze(false);
    return { pass: ammo.every((a) => !a.hasShell || a.got === a.want) && Object.values(items).every(Boolean) && f0 < 1 && vLoaded < vEmpty, slots, ammo, items, kg: p.equip.kg, factor: +f0.toFixed(4), vLoaded: +(vLoaded * 3.6).toFixed(2), vEmpty: +(vEmpty * 3.6).toFixed(2) }; });
  console.log(JSON.stringify({ map, q, R, errs: errs.slice(0, 10), nErrs: errs.length }));
  for (const [k, v] of Object.entries(R)) if (!v.pass) { fails++; }
  if (errs.length) fails++;
  await page.close();
}
console.log('FAILS', fails); await browser.close();
