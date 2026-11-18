// QA: NPC stuck time over a long simulated match. A tank counts as stuck while its AI wants to drive (|throttle|>0.3,
// not holding) but it moved <1.5 m in the last 3 s. Prints per-NPC stuck seconds + worst spots (with terrain slope).
// usage: node tools_qa_stuck.mjs [base] [maps] [seconds]
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const base = process.argv[2] || 'http://localhost:4176/';
const maps = (process.argv[3] || 'village,forest,desert').split(','); const SEC = +(process.argv[4] || 300);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let worst = 0;
for (const map of maps) for (const tank of ['sherman', 'tiger']) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } }); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  // DIST=<dir>: serve that build instead of the preview's dist (A/B a variant without a second server/port)
  if (process.env.DIST) await page.route('**/*', (rt) => { const u = new URL(rt.request().url()); if (!u.host.startsWith('localhost')) return rt.continue(); let f = path.join(process.env.DIST, decodeURIComponent(u.pathname)); if (u.pathname.endsWith('/')) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) return rt.continue(); const ext = path.extname(f); rt.fulfill({ body: fs.readFileSync(f), contentType: { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.hdr': 'application/octet-stream' }[ext] }); });
  // deterministic Math.random (AI uses it) so before/after runs are comparable
  await page.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
  await page.goto(`${base}?autostart=1&map=${map}&tank=${tank}&q=low&seed=7`, { timeout: 240000 });
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 180000 });
  const r = await page.evaluate((SEC) => {
    const g = window.__game; const T = g.world.terrain; g.timeLimit = 1e9;
    // keep the player out of the fight (invulnerable observer at its base) so the match lasts; NPCs fight normally
    const p = g.player; p.damage = () => {}; const st = new Map(); for (const ai of g.ai) st.set(ai, { hist: [], stuck: 0, spots: [] });
    const dt = 1 / 30; let t = 0;
    for (; t < SEC && !g.ended; t += 0.5) {
      g.debug.simulate(0.5, dt);
      for (const ai of g.ai) { const a = ai.t; const s = st.get(ai); if (!a.alive) continue; s.hist.push([g.time, a.pos.x, a.pos.z]); while (s.hist.length && s.hist[0][0] < g.time - 3) s.hist.shift();
        const h0 = s.hist[0]; const moved = Math.hypot(a.pos.x - h0[1], a.pos.z - h0[2]); const wants = Math.abs(a.input.throttle) > 0.3 && g.time - h0[0] > 2.9;
        if (wants && moved < 1.5) { s.stuck += 0.5; const n = T.normal(a.pos.x, a.pos.z); s.spots.push([Math.round(a.pos.x), Math.round(a.pos.z), +(Math.sqrt(1 - n.y * n.y) / n.y).toFixed(2), ai.state, ai.reverseT > 0 ? 'rev' : 'fwd']); }
      }
    }
    const per = g.ai.map((ai) => { const s = st.get(ai); return { id: ai.t.spec.id, team: ai.t.team, role: ai.role, alive: ai.t.alive, stuckSec: s.stuck, maxRun: s.spots.length, spots: s.spots.slice(-4) }; });
    return { simSec: Math.round(t), ended: g.ended, total: per.reduce((a, x) => a + x.stuckSec, 0), worst: Math.max(...per.map((x) => x.stuckSec)), per: per.filter((x) => x.stuckSec > 0) };
  }, SEC);
  worst = Math.max(worst, r.worst); console.log(JSON.stringify({ map, tank, ...r, errs: errs.slice(0, 5) }));
  await page.close();
}
console.log('WORST_STUCK_SEC', worst); await browser.close();
