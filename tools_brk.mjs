import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage(); await page.goto('http://localhost:5173/');
console.log(await page.evaluate(async () => { const M = await import('/src/models/tankModel.js'); const { TANK_BY_ID } = await import('/src/game/tankData.js');
 const m = M.createTankModel(TANK_BY_ID.panther, { links: true }); const o=[]; m.root.traverse((x) => { if (x.isMesh) { const g = x.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; o.push((x.parent.name||x.parent.type)+':'+(x.userData.matKey||x.type)+' '+n+'x'+(x.count||1)); } }); return o.join('\n'); }));
await browser.close();
