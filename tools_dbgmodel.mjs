import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage(); await page.goto('http://localhost:5173/');
console.log(await page.evaluate(async (id) => { const M = await import('/src/models/tankModel.js'); const { TANK_BY_ID } = await import('/src/game/tankData.js');
 const m = M.createTankModel(TANK_BY_ID[id]); const o=[]; m.turret.children.forEach((x) => { if (x.isMesh) { x.geometry.computeBoundingBox(); const b=x.geometry.boundingBox; o.push(x.userData.matKey+' '+[b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z].map(v=>v.toFixed(2)).join(',')); } }); return o.join('\n'); }, process.argv[2]));
await browser.close();
