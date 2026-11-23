import * as THREE from 'three';
import { Garage } from './ui/garage.js';
import { Menu } from './ui/menu.js';
import { initPhysics } from './game/physics.js';
import { Game } from './game/game.js';
import { Audio } from './game/audio.js';
import { setMaxAniso } from './world/textures.js';
import { isMobile } from './ui/touchControls.js';
import { renderPixelRatio } from './render/pixelRatio.js';
import './ui/mobile.css';

const canvas = document.getElementById('gl'); const ui = document.getElementById('ui');
const params = new URLSearchParams(location.search);
const mobile = isMobile(); if (mobile) { document.body.classList.add('mobile-mode'); document.documentElement.classList.add('mobile-device'); }
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' }); }
catch(e) {
  ui.innerHTML='<div style="pointer-events:auto;padding:24px"><h2>3D graphics unavailable</h2><p>当前设备未能启动 WebGL。仍可编辑坦克平衡配置。</p><button id="fallback-balance">游戏平衡编辑器</button></div>';
  document.getElementById('fallback-balance').onclick=()=>import('./ui/balanceEditor.js');
  throw e;
}
function resizeRenderer(quality) {
  const ratio = renderPixelRatio(quality, innerWidth, innerHeight, devicePixelRatio, mobile);
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
}
resizeRenderer('menu');
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9; renderer.outputColorSpace = THREE.SRGBColorSpace;
setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const audio = new Audio();
const garage = new Garage(renderer); garage.resize(innerWidth, innerHeight);
let game = null; let mode = 'menu';
const loading = document.createElement('div'); loading.className = 'loading'; loading.innerHTML = '<div><h2>Generating battlefield…</h2><p>Sculpting 1.4 km of terrain, planting forests, building villages</p><div class="spin"></div></div>'; ui.appendChild(loading);
const menu = new Menu(ui, garage, start, openBalance);
if (mobile) { if (!localStorage.getItem('tw_mobile_q_init')) { menu.quality='low'; menu.root.querySelector('#m-q').value='low'; localStorage.setItem('tw_q','low'); localStorage.setItem('tw_mobile_q_init','1'); } const hint=document.createElement('div');hint.className='mobile-garage-hint';hint.textContent='手机版 v2 · 滑动查看全部功能 · 战斗建议横屏';menu.root.prepend(hint);
 const inspect=document.createElement('button');inspect.className='mobile-inspect';inspect.textContent='全屏查看 3D 模型';menu.root.append(inspect);
 const back=document.createElement('button');back.className='mobile-inspect-back';back.textContent='返回车库';back.hidden=true;ui.append(back);
 inspect.onclick=()=>{menu.show(false);back.hidden=false;};
 back.onclick=()=>{back.hidden=true;menu.show(true);};
 }
async function openBalance() {
  if (mode !== 'menu') return;
  mode = 'balance';
  try { await import('./ui/balanceEditor.js'); }
  catch(e) { console.error(e); mode = 'menu'; alert('Unable to open balance editor. Please reload and retry.'); }
}
function start(opts, gesture = true) {
  if (gesture) { audio.init(); audio.resume(); }
  menu.show(false); loading.style.display = 'flex'; mode = 'loading';
  setTimeout(async () => {
    try {
      const physicsEngine = await initPhysics();
      resizeRenderer(opts.quality);
      game = new Game(renderer, ui, audio, { ...opts, physicsEngine, fixedGunTest: params.get('fixedGunTest') === '1', seed: params.get('seed') ? +params.get('seed') : undefined, onExit: () => { game = null; window.__game = null; mode = 'menu'; resizeRenderer('menu'); garage.resize(innerWidth, innerHeight); menu.show(true); } });
      window.__game = game;
      if (game.world.exposure) renderer.toneMappingExposure = game.world.exposure; else if (game.world.def.exposure) renderer.toneMappingExposure = game.world.def.exposure * 1.5;
      mode = 'game';
    } catch (e) { console.error(e); loading.innerHTML = '<div><h2>Failed to start</h2><pre>' + (e.stack || e) + '</pre></div>'; return; }
    loading.style.display = 'none';
  }, 50);
}
window.__start = start; window.__menu = menu;
addEventListener('resize', () => { resizeRenderer(game?.quality ?? 'menu'); garage.resize(innerWidth, innerHeight); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && game) game.frameRequested = true;
});
let last = performance.now(); let fpsAcc = 0, fpsN = 0; window.__fps = 0;
function loop() {
  requestAnimationFrame(loop); const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (mode === 'menu') { renderer.toneMappingExposure = 0.9; garage.render(dt); }
  else if (mode === 'game' && game) {
    if (game.debugPaused) game.updateCamera(1 / 60);
    else game.update(dt);
    if (!game.paused || game.debugPaused || game.frameRequested) game.render();
  }
}
loop();
window.__ready = true;
if (params.get('autostart')) start({ tankId: params.get('tank') || 'sherman', mapId: params.get('map') || 'village', quality: params.get('q') || (mobile?'low':'high'), loadout: params.get('loadout') ? params.get('loadout').split(',').map(Number) : undefined, items: params.get('items') ? params.get('items').split(',') : undefined, aimAssist: params.get('aa') !== '0' && localStorage.getItem('tw_aa') !== '0' }, false);
