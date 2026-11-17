// v4: showroom renders of all tank models (dev server). usage: node tools_v4_lineup.mjs [ids] [outPrefix]
import { chromium } from 'playwright';
import fs from 'fs';
const save = async (page, path) => { const d = await page.evaluate(() => window.__show.r.domElement.toDataURL('image/png')); fs.writeFileSync(path, Buffer.from(d.split(',')[1], 'base64')); };
const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null; const out = process.argv[3] || 'screenshots/v4/tank_';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } }); const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5173/'); await page.waitForFunction(() => window.__menu, null, { timeout: 120000 });
await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
  const M = await import('/src/models/tankModel.js'); const { TANKS } = await import('/src/game/tankData.js');
  document.body.innerHTML = ''; const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(1200, 700); r.shadowMap.enabled = true; r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9fb4c8); sc.fog = new THREE.Fog(0x9fb4c8, 60, 220);
  sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a5040, 1.1)); const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(-30, 40, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); sc.add(sun);
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x7d7462, roughness: 0.95 })); gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; sc.add(gnd);
  const cam = new THREE.PerspectiveCamera(35, 1200 / 700, 0.1, 500);
  window.__show = { THREE, M, TANKS, r, sc, cam, cur: null };
  window.__render = (id, view) => { const S = window.__show; if (S.cur) S.sc.remove(S.cur); const spec = S.TANKS.find((t) => t.id === id); const m = S.M.createTankModel(spec, { links: true }); S.M.setTrackLOD?.(m, true); m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); S.sc.add(m.root); S.cur = m.root; m.turret.rotation.y = 0.35; const L = spec.dims.L;
    const v = { q: [L * 0.95, L * 0.5, L * 1.05], f: [0.5, L * 0.25, L * 1.5], s: [L * 1.45, L * 0.2, 0.3], r: [-L * 0.9, L * 0.55, -L * 1.0] }[view || 'q']; S.cam.position.set(...v); S.cam.lookAt(0, spec.dims.hullH * 0.8, 0); S.r.render(S.sc, S.cam); };
  window.__lineup = () => { const S = window.__show; if (S.cur) S.sc.remove(S.cur); const g = new S.THREE.Group(); S.TANKS.forEach((spec, i) => { const m = S.M.createTankModel(spec, { links: true }); S.M.setTrackLOD?.(m, true); m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); const row = Math.floor(i / 5), col = i % 5; m.root.position.set((col - 2) * 6, 0, -row * 12); m.root.rotation.y = 0.6; m.turret.rotation.y = 0.2; g.add(m.root); }); S.sc.add(g); S.cur = g; S.cam.fov = 40; S.cam.updateProjectionMatrix(); S.cam.position.set(14, 20, 24); S.cam.lookAt(0, 0, -11); S.r.render(S.sc, S.cam); };
});
const list = ids || await page.evaluate(() => window.__show.TANKS.map((t) => t.id));
if (!ids) { await page.evaluate(() => window.__lineup()); await save(page, 'screenshots/v4/tanks_lineup.png'); console.log('lineup'); }
const views = (process.argv[4] || 'q').split(',');
for (const id of list) for (const v of views) { await page.evaluate(([id, v]) => window.__render(id, v), [id, v]); await save(page, `${out}${id}${v === 'q' ? '' : '_' + v}.png`); console.log('saved', id, v); }
console.log(errs.join('\n')); await browser.close();
