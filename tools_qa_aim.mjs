// QA (all maps): focus outline + aim-assist soft lock, derived from tools_aim.mjs. usage: node tools_qa_aim.mjs [base] [quality] [map]
import { chromium } from 'playwright';
import fs from 'fs';
const base = process.argv[2] || 'http://localhost:4176/'; const Q = process.argv[3] || 'low'; const MAP = process.argv[4] || 'village';
const OUT = '/workspace/tw-shots/qa/aim/' + MAP + '_' + Q; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = []; let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name, info !== undefined ? JSON.stringify(info) : ''); if (!ok) fails++; };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto(base + `?autostart=1&q=${Q}&seed=11&map=${MAP}&tank=t34`, { timeout: 300000 });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 300000 });
const frames = (n = 3) => page.evaluate((n) => new Promise((res) => { setTimeout(res, 200000); let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// count outline-red pixels in a screenshot (decoded in the page)
const redCount = async (png, box) => page.evaluate(async ([b64, box]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const [x0, y0, x1, y1] = box || [0, 0, img.width, img.height]; const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] < 70) n++; return n; }, [png.toString('base64'), box]);
const shot = async (name) => { await frames(4); const b = await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 300000 }); console.log('saved', `${OUT}/${name}.png`); return b; };

const setup = await page.evaluate(() => {
  const g = window.__game, D = g.debug, p = g.player, W = g.world, T = W.terrain;
  const findLine = (R) => { for (let k = 0; k < 3000; k++) { const x = -420 + (k % 40) * 21, z = -420 + Math.floor(k / 40) * 21, h = (k * 0.9) % 6.28; const tx = x + Math.sin(h) * R, tz = z + Math.cos(h) * R;
    if (!g.nav.walkable(...g.nav.toCell(x, z)) || !g.nav.walkable(...g.nav.toCell(tx, tz)) || W.veg.bushAt(x, z, 3) || W.veg.bushAt(tx, tz, 3)) continue;
    if (W.losBlocked(x, T.height(x, z) + 3, z, tx, T.height(tx, tz) + 1.2, tz) || W.colGrid.query(tx, tz, 25).length || W.colGrid.query(x, z, 8).length) continue; let tr = false; for (let u = 0.05; u < 1.15; u += 0.05) { const qx = x + (tx - x) * u, qz = z + (tz - z) * u; if (W.veg.treeGrid.query(qx, qz, 8).length || W.veg.bushAt(qx, qz, 4)) { tr = true; break; } } if (tr) continue; return [x, z, h, tx, tz]; } return null; };
  D.freeze(true); const L = findLine(140); if (!L) return 'no line'; const [x, z, h, tx, tz] = L; D.teleport(x, z, h);
  const en = g.tanks.filter((t) => t.team === 1); const e = en[0], e2 = en[1]; window.__e = e; window.__e2 = e2;
  // e: broadside-ish, 140 m ahead; e2: 25 m to the side of e, forced UNSPOTTED (e.g. hidden in concealment)
  const px = Math.cos(h), pz = -Math.sin(h);
  e.placeAt(tx, tz, h + Math.PI / 2); e2.placeAt(tx + px * 25, tz + pz * 25, h + Math.PI / 2);
  for (const t of g.tanks) if (t !== p && t !== e && t !== e2) t.placeAt(t.team ? 560 : -560, t.team ? 560 - t.id * 9 : -560 + t.id * 9, 0);
  const orig = g.spotting.canSee.bind(g.spotting); g.spotting.canSee = (o, t, time) => (t === e2 ? false : t === e ? true : orig(o, t, time));
  D.cam(h, -0.05, 13); D.simulate(1.5);
  return { dist: Math.round(e.pos.distanceTo(p.pos)), eSpotted: e.spotted[0], e2Spotted: e2.spotted[0], e2Visible: e2.model.root.visible };
});
console.log('setup', JSON.stringify(setup));
// helper: point the camera at a tank (centre of hull side) with the real mouse path
const aimAt = (which, dy = 0.62) => page.evaluate(([which, dy]) => { const g = window.__game; const t = window[which]; const P = t.model.root.localToWorld(new t.pos.constructor(0, t.spec.dims.hullH * dy, 0)); g.alignCamTo(P); g.debug.look(0.01, 0); g.debug.simulate(0.4); return g.debug.assist(); }, [which, dy]);

// 1. unspotted enemy: no focus, no outline, no lock
let a = await aimAt('__e2');
await page.evaluate(() => window.__game.debug.pause(true)); await frames(3); a = await page.evaluate(() => window.__game.debug.assist());
check('unspotted enemy: no focus / outline / lock', a.focus === -1 && a.outline === -1 && !a.locked, a);
await page.evaluate(() => window.__game.debug.pause(false));
// 2. spotted enemy: focus + outline + lock
a = await aimAt('__e');
await page.evaluate(() => window.__game.debug.pause(true));
const shot1 = await shot('outline_thirdperson');
a = await page.evaluate(() => window.__game.debug.assist()); const eIdx = await page.evaluate(() => window.__game.tanks.indexOf(window.__e));
const red1 = await redCount(shot1, [340, 160, 940, 560]);
check('spotted enemy focused: outline drawn + locked', a.focus === eIdx && a.outline === eIdx && a.locked && a.target === eIdx, { ...a, redPixels: red1 });
check('outline red pixels visible in third-person screenshot', red1 > 60, red1);
// 3. lock tracks a moving target (and a moving player)
await page.evaluate(() => window.__game.debug.pause(false));
const tr = await page.evaluate(() => {
  const g = window.__game, e = window.__e, p = g.player; const A = g.assist; const out = [];
  e.input.throttle = 1; e.speed = 7; p.input.throttle = 0; g.keys.KeyW = true;
  for (let i = 0; i < 6; i++) { g.debug.simulate(0.5); const P = A.target ? A.anchorWorld() : null; const d = new e.pos.constructor(); g.camera.getWorldDirection(d);
    const v = P ? P.clone().sub(g.camera.position).normalize() : null; out.push({ locked: !!A.target, errDeg: v ? +(Math.acos(Math.min(1, v.dot(d))) * 180 / Math.PI).toFixed(3) : null, aimOnTarget: g.aimTank === e, eSpeed: +(e.speed * 3.6).toFixed(1), moved: +e.pos.distanceTo(window.__e0 ||= e.pos.clone()).toFixed(1) }); }
  g.keys.KeyW = false; e.input.throttle = 0; return out; });
check('lock tracks moving target (crosshair stays on anchor, <0.6°)', tr.every((s) => s.locked && s.errDeg < 0.6) && tr[tr.length - 1].moved > 10, tr);
// 4. small mouse movement dampened
const dmp = await page.evaluate(() => { const g = window.__game, D = g.debug; D.simulate(0.3); const s0 = D.assist(); const k = 0.0024; const y0 = g.cam.yaw;
  // move off the tank sideways in small steps (spaced in time so it is not a flick)
  const A = g.assist; let applied = 0, n = 0; for (let i = 0; i < 4; i++) { const f = A.dragFactor(); D.look(3, 0); applied += f; n++; D.simulate(1 / 30); }
  const s1 = D.assist(); return { before: s0, after: s1, expectedFactor: +(applied / n).toFixed(3), offPx: s1.offPx, stillLocked: s1.locked, yawDelta: +(g.cam.yaw - y0).toFixed(5), undamped: -12 * k }; });
check('small mouse movement is dampened (~35-50%) and keeps lock', dmp.stillLocked && dmp.expectedFactor >= 0.35 && dmp.expectedFactor <= 0.6, dmp);
// 5. larger deliberate movement breaks the lock
const brk = await page.evaluate(() => { const g = window.__game, D = g.debug; let i = 0; for (; i < 40 && g.assist.target; i++) { D.look(14, 0); D.simulate(0.12); } const s = D.assist(); return { steps: i, rawPx: i * 14, locked: s.locked, lastBreak: s.lastBreak, focus: s.focus, offPx: s.offPx }; });
check('larger drag movement breaks the lock', !brk.locked && brk.lastBreak === 'drag' && brk.steps <= 20, brk);
// 5b. cooldown: no instant re-lock while still blocked, re-aiming back on the tank re-locks
const rl = await page.evaluate(() => { const g = window.__game, D = g.debug, e = window.__e; D.look(0.01, 0); D.simulate(0.3); const s0 = D.assist(); const P = e.model.root.localToWorld(new e.pos.constructor(0, e.spec.dims.hullH * 0.62, 0)); g.alignCamTo(P); D.look(0.01, 0); D.simulate(0.4); return { awayLocked: s0.locked, back: D.assist() }; });
check('re-aim back on target re-locks', !rl.awayLocked && rl.back.locked, rl);
// 5c. fast flick breaks instantly
const fl = await page.evaluate(() => { const g = window.__game, D = g.debug; const y0 = g.cam.yaw; D.look(80, 0); D.look(90, 0); D.simulate(1 / 30); const s = D.assist(); return { locked: s.locked, lastBreak: s.lastBreak, yawDelta: +(g.cam.yaw - y0).toFixed(3) }; });
check('fast flick breaks the lock', !fl.locked && fl.lastBreak === 'flick', fl);
// 6. sniper scope: outline + armor view coexist; aim point preserved entering the scope
const sc = await page.evaluate(() => { const g = window.__game, D = g.debug, e = window.__e; D.simulate(1.6); const P = e.model.root.localToWorld(new e.pos.constructor(0.0, e.spec.dims.hullH + e.spec.dims.turretH * 0.4, 0)); g.alignCamTo(P); D.look(0.01, 0); D.simulate(0.4);
  const before = g.aimPoint.clone(); g.toggleSniper(); g.cam.zoom = 8; g.alignCamTo(before); D.simulate(0.5); const after = g.aimPoint.clone(); if (!g.armorView.enabled) g.armorView.toggle(); D.simulate(0.2); D.pause(true);
  return { ...D.assist(), aimShift_m: +before.distanceTo(after).toFixed(2), armor: g.armorView.enabled, sniper: g.cam.sniper }; });
const shot2 = await shot('outline_scope');
const sc2 = await page.evaluate(() => window.__game.debug.assist()); sc.outline = sc2.outline;
await page.evaluate(() => { window.__game.outline.enabled = false; }); await frames(4); const shot2b = await page.screenshot({ timeout: 300000 }); await page.evaluate(() => { window.__game.outline.enabled = true; });
const red2 = (await redCount(shot2, [240, 60, 1040, 660])) - (await redCount(shot2b, [240, 60, 1040, 660]));
check('scope: outline drawn with armor view on, lock kept', sc.outline === eIdx && sc.locked && sc.armor && red2 > 60, { ...sc, redPixels: red2 });
check('scope: aim point consistent on entering scope (<0.6 m)', sc.aimShift_m < 0.6, sc.aimShift_m);
// 7. disabled assist: outline still marks focus but never locks
const off = await page.evaluate(() => { const g = window.__game, D = g.debug; D.pause(false); g.assist.setEnabled(false); D.look(0.01, 0); D.simulate(0.6); const s = D.assist(); g.assist.setEnabled(true); return s; });
check('assist OFF: no lock', !off.locked, off);
// 8. perf: per-frame sim cost with lock
const perf = await page.evaluate(() => { const g = window.__game; return g.debug.simulate(2); });
console.log('sim perf', JSON.stringify(perf));
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); if (errs.length) fails++;
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
