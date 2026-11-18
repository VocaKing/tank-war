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
  const run = async (name, fn, arg) => { try { R[name] = await page.evaluate(fn, arg); } catch (e) { R[name] = { pass: false, error: e.message.slice(0, 300) }; } };
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
      for (const ang of [0, 1.57]) { const x = c.x + Math.sin(ang) * (Math.max(c.hx, c.hz) + 12), z = c.z + Math.cos(ang) * (Math.max(c.hx, c.hz) + 12); p.placeAt(x, z, Math.atan2(c.x - x, c.z - z)); p.speed = 0;
        g.keys.KeyW = true; for (let k = 0; k < 150; k++) { g.debug.simulate(1 / 30); worstDrive = Math.max(worstDrive, pen(p)); } g.keys.KeyW = false; } }
    g.debug.freeze(false); g.debug.teleport(...(() => { const b = W.bases[0]; return [b.x, b.z, 0]; })());
    let worstAI = 0, who = null; for (let s = 0; s < 60 * 5; s++) { g.debug.simulate(0.2); for (const t of g.tanks) { if (!t.alive) continue; const v = pen(t); if (v > worstAI) { worstAI = v; who = [t.spec.id, Math.round(t.pos.x), Math.round(t.pos.z)]; } } }
    return { pass: worstDrive < 0.15 && worstAI < 0.15, kinds, triedBuildings: tried, worstDrivePen: +worstDrive.toFixed(3), worstAIPen: +worstAI.toFixed(3), who }; });
  console.log(JSON.stringify({ map, q, R, errs: errs.slice(0, 10), nErrs: errs.length }));
  for (const [k, v] of Object.entries(R)) if (!v.pass) { fails++; }
  if (errs.length) fails++;
  await page.close();
}
console.log('FAILS', fails); await browser.close();
