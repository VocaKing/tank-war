import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:4173/?autostart=1&q=low&map=village&tank=t34&seed=3');
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 200000 });
console.log(await page.evaluate(() => { const g = window.__game; const grp = g.scene.getObjectByName('structures'); const out = []; grp.children.forEach((m) => { const c = m.geometry.attributes.color; const set = new Set(); if (c) for (let i = 0; i < c.count; i += 97) set.add(c.getX(i).toFixed(2) + ',' + c.getY(i).toFixed(2) + ',' + c.getZ(i).toFixed(2)); out.push([m.material.vertexColors, !!c, set.size, [...set].slice(0, 4).join(' ')]); }); return JSON.stringify(out); }));
await browser.close();
