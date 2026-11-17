import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://localhost:5173/');
const r = await page.evaluate(async () => {
  const M = await import('/src/models/tankModel.js'); const { TANKS } = await import('/src/game/tankData.js');
  const out = [];
  for (const s of TANKS) {
    try {
      const m = M.createTankModel(s, { links: true }); let tris = 0, draws = 0; m.root.updateMatrixWorld(true); const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9]; m.root.traverse((o)=>{ if(o.isMesh && !o.isInstancedMesh){ o.geometry.computeBoundingBox(); const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); ['x','y','z'].forEach((k,i)=>{mn[i]=Math.min(mn[i],b.min[k]); mx[i]=Math.max(mx[i],b.max[k]);}); } }); const bb={min:{x:mn[0],y:mn[1],z:mn[2]},max:{x:mx[0],y:mx[1],z:mx[2]}};
      m.root.traverse((o) => { if (o.isMesh) { draws++; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += o.isInstancedMesh ? n * o.count : n; } });
      out.push({ id: s.id, tris: Math.round(tris), draws, size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => +v.toFixed(2)), dims: [s.dims.W, s.dims.L], links: m.nLinks });
    } catch (e) { out.push({ id: s.id, err: e.message + ' ' + e.stack.split('\n')[1] }); }
  }
  return out;
});
console.log(r.map((x) => JSON.stringify(x)).join('\n')); console.log(errs.join('\n'));
await browser.close();
