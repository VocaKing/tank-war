import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173/tank-war/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto(new URL('balance.html', base).href);
  const result = await page.evaluate(async base => {
    const { Game } = await import(new URL('src/game/game.js', base).href);
    const { THREE } = await import(new URL('src/models/tankModel.js', base).href);
    const game = Object.create(Game.prototype);
    const target = new THREE.Vector3(41, 7, 126);
    let aimed = null, synced = 0, fired = 0;
    game.player = {
      alive: true,
      spec: { fixedGun: false },
      input: { aim: new THREE.Vector3(), aimBearing: null },
      updateTurret() { aimed = this.input.aim.clone(); },
      syncModel() { synced++; },
      tryFire() { fired++; return true; },
    };
    game.aimPoint = target.clone();
    game.debugAim = true;
    game.aimTank = null;
    game.updatePlayerGunAim(1 / 60);
    const currentFrameAim = aimed?.distanceTo(target) ?? Infinity;
    const syncCount = synced;
    game.keys = {};
    game.touch = null;
    game.mouseDown = true;
    game.aimPoint.set(-20, 2, 90);
    game.player.input.aim.set(999, 999, 999);
    game.player.input.throttle = 0;
    game.player.input.steer = 0;
    game.player.input.brake = false;
    game.player.input.driveHeld = false;
    game.updatePlayerInput();
    return { currentFrameAim, syncCount, fired, inputAfterInputOnly: game.player.input.aim.toArray() };
  }, base);
  assert.ok(result.currentFrameAim < 1e-8, JSON.stringify(result));
  assert.equal(result.syncCount, 1);
  assert.equal(result.fired, 0, 'fire must wait until the current camera aim and gun pose are synchronized');
  assert.deepEqual(result.inputAfterInputOnly, [999, 999, 999], 'input collection must not overwrite the aim with last frame data');
  console.log('Player aim sync verified: current-frame camera aim -> gun servo -> impact reticle/fire order.');
} finally {
  await browser.close();
}
