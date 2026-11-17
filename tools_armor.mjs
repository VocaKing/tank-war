// Armor-view logic check: Sherman (each shell) vs Tiger front / side at several ranges; samples a grid over the silhouette.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 225 } }); const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${base}?autostart=1&map=desert&tank=sherman&q=low&seed=7`);
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 240000 });
const out = await page.evaluate(() => {
  const g = window.__game, D = g.debug, p = g.player; D.freeze(true);
  const e = g.tanks.find((t) => t.team === 1 && t.spec.id === 'tiger'); e.noDamageTest = true;
  const res = [];
  for (const shellIdx of [0, 1]) {
    p.shell = p.spec.shells[shellIdx]; if (p.shellIdx !== undefined) p.shellIdx = shellIdx;
    for (const [view, hd] of [['front', Math.PI], ['side', Math.PI / 2]]) for (const R of [50, 150, 300, 600]) {
      D.teleport(0, 0, 0); e.placeAt(0, R, hd); e.turretYaw = 0; e.spotted[0] = true; D.aim(0, e.pos.y + 1.5, R); D.simulate(0.3);
      D.aim(0, e.pos.y + 1.5, R);
      const counts = {};
      const halfW = view === 'front' ? e.spec.dims.W / 2 : e.spec.dims.L / 2;
      for (let i = -4; i <= 4; i++) for (let j = 0; j <= 12; j++) {
        const wp = e.pos.clone(); wp.x += (i / 4.5) * halfW; wp.y += 0.2 + j * 0.2;
        const c = g.armorView.classify(e, wp); if (c.cls === 'none') continue;
        const k = `${c.part}/${c.zone}`; counts[k] = counts[k] || {}; counts[k][c.cls] = (counts[k][c.cls] || 0) + 1;
        if (!counts[k].eff) counts[k].eff = c.eff + '/' + c.pen;
      }
      res.push({ shell: p.shell.name, view, R, counts });
    }
  }
  return res;
});
for (const r of out) console.log(r.shell, r.view, r.R + 'm', JSON.stringify(r.counts));
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); await browser.close();
