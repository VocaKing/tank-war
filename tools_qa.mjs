// QA: every map x every tank loads from the production build with no console errors
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';

const packagedModels = ['mauseng', ...['fleet', 'armour-expansion'].flatMap(directory =>
  readdirSync(new URL(`./public/models/${directory}/`, import.meta.url))
    .filter(name => name.endsWith('.glb')).map(name => name.slice(0, -4)))];
const base = process.argv[2] || 'http://localhost:4173/';
const maps = ['village', 'forest', 'desert'];
const tanks = (process.argv[3] || 'sherman,t34,tiger,panther,is2,pershing,centurion,t72,leo1,m1a2,chally2,leo2a6,merkava4,type99a,t90m').split(',');
const mapsArg = process.argv[4]; if (mapsArg) maps.splice(0, 3, ...mapsArg.split(','));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;

// Keep the same simulation and rendered-frame checks without running an
// unbounded SwiftShader render loop while the test waits on the browser.
function useManualFrames(page) {
  return page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      if (callback.name === 'loop' || callback.toString().includes('toneMappingExposure')) return 0;
      return raf(callback);
    };
  });
}

function collectErrors(page, errors) {
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    if (message.location().url.endsWith('/favicon.ico')) return;
    if (message.text() === 'using deprecated parameters for the initialization function; pass a single object instead') return;
    errors.push(message.text());
  });
  page.on('pageerror', error => errors.push('pageerror ' + error.message));
}

// menu load
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  collectErrors(page, errs);
  await useManualFrames(page);
  await page.goto(base);
  await page.waitForFunction(() => window.__ready || window.__menu, null, { timeout: 120000 });
  await page.evaluate(() => window.__menu.garage.render(0));
  console.log('MENU', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'ok'); if (errs.length) fails++; await page.close();
}
for (const m of maps) for (const t of tanks) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } }); const errs = [];
  collectErrors(page, errs);
  await useManualFrames(page);
  await page.goto(`${base}?autostart=1&map=${m}&tank=${t}&q=low&seed=7`);
  try {
    await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
    const spawnOK=await page.evaluate(()=>{const g=window.__game,L=g.spawnLayout,P=g.spawnPositions;return [2,3].includes(L.groupCount)&&P.every((team,i)=>team.length===7&&new Set(team.map(t=>t.lane)).size===L.groupCount&&team.every((t,j)=>g.tanks[i*7+j].pos.x===t.x&&g.tanks[i*7+j].pos.z===t.z&&Number.isFinite(g.tanks[i*7+j].pos.y))&&team.every((a,j)=>team.slice(j+1).every(b=>Math.hypot(a.x-b.x,a.z-b.z)>=15.99)))&&g.world.sidesSwapped===L.swapped&&g.ai.every(a=>a.ownBase===g.world.bases[a.t.team]&&a.enemyBase===g.world.bases[1-a.t.team]);});
    const modelDetails = await page.evaluate((ids) => {
      const g = window.__game;
      const fallback = g.tanks.filter(t => ids.includes(t.spec.id) && !(
        t.model.root.userData.importedFleet || t.model.root.userData.importedExpansion || t.model.root.userData.importedMaus
      )).map(t => t.spec.id);
      const visible = g.tanks.filter(t => t.team === g.player.team).every(t => t.model.root.visible);
      const fit = g.tanks.find(t => t.team === g.player.team && !t.isPlayer && t.model.setExteriorDetail);
      let independentDetail = true;
      if (fit) {
        const original = g.camera.position.clone();
        const focalPixels = g.camera.projectionMatrix.elements[5] * g.viewportHeight / 2;
        g.camera.position.copy(fit.pos).addScaledVector(fit.pos.clone().set(0, 0, 1), fit.spec.dims.W * focalPixels / 23);
        g.updateLOD();
        independentDetail = fit.model.exteriorDetailOn && !fit.model.linksOn;
        g.camera.position.copy(original);
        g.updateLOD();
      }
      return { fallback, visible, independentDetail };
    }, packagedModels);
    // exercise: AI sim, then sniper + armor view on the nearest enemy, then render real frames (compiles every shader incl. armor view)
    await page.evaluate(() => { const g = window.__game; g.debug.simulate(5); const e = g.tanks.filter((x) => x.team === 1).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0]; e.spotted[0] = true; g.cam.sniper = true; g.cam.zoom = 8; g.armorView.enabled = true; g.debug.aim(e.pos.x, e.pos.y + 1.2, e.pos.z); g.debug.simulate(0.5); window.__qaE = e; });
    await page.evaluate(() => {
      const g = window.__game;
      for (let frame = 0; frame < 3; frame++) {
        g.updateCamera(1 / 60);
        g.render();
      }
    });
    const info = await page.evaluate(() => { const g = window.__game; const av = g.armorView; const cls = av.classify(window.__qaE, window.__qaE.pos.clone().setY(window.__qaE.pos.y + 1.2)); g.armorView.toggle(); g.debug.simulate(0.2); const tiers = g.tanks.map((x) => x.spec.tier); return { avClass: cls.cls, avOffOk: !g.armorView.enabled, tierSpread: Math.max(...tiers) - Math.min(...tiers), tierBalanced: [0,1].every(team=>g.tanks.filter(x=>x.team===team&&x.spec.tier===g.player.spec.tier).length===7-g.lineup.adjacentPerTeam)&&g.lineup.adjacentPerTeam<=2, uniqueTeams:[0,1].every(team=>new Set(g.tanks.filter(x=>x.team===team).map(x=>x.spec.id)).size===7), map: g.map?.id || g.mapId, player: g.player.spec.id, team0: g.tanks.filter((x) => x.team === 0).length, team1: g.tanks.filter((x) => x.team === 1).length, ok: g.tanks.every((x) => Number.isFinite(x.pos.y)), models: g.tanks.map((x) => x.spec.id).join(',') }; });
    const good = info.player === t && info.team0 === 7 && info.team1 === 7 && info.ok && info.tierBalanced && info.uniqueTeams && info.tierSpread <= 1 && spawnOK && !modelDetails.fallback.length && modelDetails.visible && modelDetails.independentDetail && !errs.length; if (!good) fails++;
    console.log(m, t, good ? 'ok' : 'FAIL', JSON.stringify({ ...info, modelDetails }), errs.join(' | '));
  } catch (e) { fails++; console.log(m, t, 'FAIL', e.message, errs.join(' | ')); }
  await page.close();
}
console.log('FAILS', fails); await browser.close();
if (fails) process.exitCode = 1;
