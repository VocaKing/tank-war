// Integration coverage for the ten specialist vehicles and their unique mechanics.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const ids = ['t14','strv103','fv4005s1','m50ontos','centauro2','sprutsd','archer','bmpt','2s38','xm8ags'];
const results = [];
for (const id of ids) {
  await page.goto(`${base}?autostart=1&map=village&tank=${id}&q=low&seed=1944`);
  await page.waitForFunction((vehicleId) => window.__game && window.__game.player?.spec.id === vehicleId, id, { timeout: 180000 });
  const result = await page.evaluate((vehicleId) => {
    const g = window.__game, p = g.player, result = { id: vehicleId, constructed: !!p.model.root };
    p.speed = 0; p.turnRate = 0; p.reloadLeft = 0; p.aimError = 0;
    p.input.aim.set(p.pos.x + 100, p.pos.y + 12, p.pos.z + 100);
    if (vehicleId === 't14') {
      const before = p.apsCharges, centre = p.pos.clone(); centre.y += p.spec.dims.hullH * 0.62;
      const intercepted = p.tryAPS({ owner: { team: 1 }, type: { heat: true }, spec: {} }, centre);
      Object.assign(result, { aps: !!p.spec.aps, intercepted, chargesSpent: before - p.apsCharges, unmannedTurret: p.spec.unmannedTurret, crewCapsule: p.spec.crewCapsule, eraSide: p.spec.armor.eraSide });
    } else if (vehicleId === 'strv103') {
      const before = p.heading; p.updateTurret(1);
      Object.assign(result, { casemate: !!p.spec.casemate, turretYaw: p.turretYaw, hullAimDegrees: Math.abs(Math.atan2(Math.sin(p.heading-before),Math.cos(p.heading-before))) * 180 / Math.PI, hydroPitch: p.hydroPitch });
    } else if (vehicleId === 'fv4005s1') {
      const deployed = p.setSpade(true); p.updateSpade(3, g.time);
      Object.assign(result, { openTop: p.spec.openTop, fireArc: p.spec.fireArc, recoilBrace: !!p.spec.recoilBrace, deployed, braceState: p.spadeState, braceMesh: !!p.model.spade });
    } else if (vehicleId === 'm50ontos') {
      p.cycleWeaponMode(); p.cycleWeaponMode();
      const before = p.ammo[p.shellIdx], shells = g.ballistics.shells.length;
      const fired = p.tryFire(g.time);
      Object.assign(result, { openTop: p.spec.openTop, mode: p.spec.multiTube.modes[p.weaponModeIndex].name, fired, roundsConsumed: before-p.ammo[p.shellIdx], projectilesSpawned: g.ballistics.shells.length-shells });
    } else if (vehicleId === 'centauro2') {
      p.breakTracks();
      Object.assign(result, { runningGear: p.mobilityModule, wheelModuleDisabled: p.modules.wheels === 0, repairTimer: p.trackRepair, roadBonus: p.spec.roadSpeedMult, offRoadPenalty: p.spec.offRoadSpeedMult });
    } else if (vehicleId === 'sprutsd') {
      p.toggleSuspension(); p.toggleSuspension();
      Object.assign(result, { amphibious: p.spec.amphibious, suspensionMode: p.suspensionMode, rideHeightOffset: p.suspensionOffset, lowProfileAimMultiplier: p.dispersion() / p.baseDispersion() });
    } else if (vehicleId === 'archer') {
      const queued = !p.tryFire(g.time) && p.pendingFire;
      p.updateAutoArtillery(1, g.time); p.updateAutoArtillery(1, g.time+1);
      Object.assign(result, { queued, state: p.autoArtilleryState, roundsFired: p.autoArtilleryShots, fireMissionRounds: p.spec.artillery.fireMissionRounds, magazine: !!p.spec.magazine, shellSpawned: g.ballistics.shells.length > 0 });
    } else if (vehicleId === 'bmpt') {
      const before = p.ammo[p.shellIdx], shells = g.ballistics.shells.length;
      const fired = p.tryFire(g.time); for (let i=0;i<3;i++) p.fireBurstRound(g.time+i*0.11);
      Object.assign(result, { burstCount: p.spec.burst.count, fired, roundsConsumed: before-p.ammo[p.shellIdx], projectilesSpawned: g.ballistics.shells.length-shells, guidedMissile: p.spec.shells.some(s=>s.guided) });
    } else if (vehicleId === '2s38') {
      p.selectShell(1); p.reloadLeft = 0; p.aimError = 0;
      const fired = p.tryFire(g.time), shell = g.ballistics.shells[g.ballistics.shells.length-1];
      Object.assign(result, { burstCount: p.spec.burst.count, fired, timedFuze: !!shell?.spec.airburst, fuseTime: shell?.spec.fuseTime, scanSystem: !!p.spec.scan });
    } else if (vehicleId === 'xm8ags') {
      const baseFront = p.spec.armor.hull.front[0]; p.cycleArmorPackage(); p.cycleArmorPackage();
      Object.assign(result, { package: p.spec.armorPackages[p.armorPackageIndex].name, mass: p.activeMass, speed: p.activeMaxSpeed, addedFrontProtection: p.armorProfile.hull.front[0]-baseFront });
    }
    return result;
  }, id);
  results.push(result);
}
await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));

const byId = Object.fromEntries(results.map(r => [r.id,r]));
assert.equal(results.length, 10);
assert.ok(byId.t14.aps && byId.t14.intercepted && byId.t14.chargesSpent === 1, 'T-14 APS failed');
assert.ok(byId.strv103.casemate && byId.strv103.turretYaw === 0 && byId.strv103.hullAimDegrees > 20, 'Strv 103 fixed-gun hull aiming failed');
assert.ok(byId.fv4005s1.openTop && byId.fv4005s1.recoilBrace && byId.fv4005s1.braceState === 'deployed' && byId.fv4005s1.braceMesh, 'FV4005 recoil brace failed');
assert.ok(byId.m50ontos.openTop && byId.m50ontos.fired && byId.m50ontos.roundsConsumed === 6 && byId.m50ontos.projectilesSpawned === 6, 'M50 Ontos six-tube salvo failed');
assert.ok(byId.centauro2.runningGear === 'wheels' && byId.centauro2.wheelModuleDisabled, 'Centauro II wheeled mobility module failed');
assert.ok(byId.sprutsd.amphibious && byId.sprutsd.suspensionMode === 'high' && byId.sprutsd.rideHeightOffset > 0, 'Sprut-SD amphibious / suspension system failed');
assert.ok(byId.archer.queued && byId.archer.state === 'deployed' && byId.archer.roundsFired === 1 && byId.archer.shellSpawned, 'Archer auto-deploy fire mission failed');
assert.ok(byId.bmpt.fired && byId.bmpt.roundsConsumed === 4 && byId.bmpt.projectilesSpawned === 4 && byId.bmpt.guidedMissile, 'BMPT burst / missile system failed');
assert.ok(byId['2s38'].fired && byId['2s38'].timedFuze && byId['2s38'].fuseTime > 0 && byId['2s38'].scanSystem, '2S38 timed airburst system failed');
assert.ok(byId.xm8ags.mass > 20 && byId.xm8ags.addedFrontProtection > 30, 'XM8 armour package switching failed');
assert.equal(errors.length, 0, 'browser runtime errors detected');
