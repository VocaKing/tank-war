import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--base','/'],{stdio:'ignore'});
let browser;
try {
 let ready=false;
 for(let i=0;i<80;i++){
  try{const r=await fetch('http://127.0.0.1:5173/');if(r.ok){ready=true;break;}}catch{}
  await delay(250);
 }
 assert.ok(ready,'Vite server did not start');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/balance.html');
 await page.waitForSelector('#form .field-group');
 const desktop=await page.evaluate(async()=>{
  const {TANKS}=await import('/src/game/tankData.js');
  const {fields}=await import('/src/game/balanceConfig.js');
  const buttons=[...document.querySelectorAll('#list .tank')],report=[];
  if(buttons.length!==TANKS.length)throw new Error('Balance editor vehicle count differs from the roster');
  for(let i=0;i<TANKS.length;i++){
   buttons[i].click();
   const expected=new Map();
   for(const f of fields(TANKS[i])){
    if(!expected.has(f.group))expected.set(f.group,[]);
    expected.get(f.group).push(f.label+' · '+f.unit);
   }
   const sections=[...document.querySelectorAll('#form .field-group')];
   const actual=sections.map(section=>({
    title:section.querySelector('h3').textContent,
    labels:[...section.querySelectorAll('.field-label')].map(x=>x.textContent)
   }));
   if(actual.length!==expected.size)throw new Error(TANKS[i].id+': group count mismatch');
   for(const item of actual){
    const labels=expected.get(item.title);
    if(!labels||JSON.stringify(labels)!==JSON.stringify(item.labels))throw new Error(TANKS[i].id+': field order/content mismatch in '+item.title);
   }
   for(const face of ['正面装甲','侧面装甲','后面装甲','顶部装甲','底部装甲']){
    const item=actual.find(x=>x.title===face);
    if(item&&item.labels.length>2)throw new Error(TANKS[i].id+': '+face+' must only expose plate thickness');
   }
   if(actual.some(section=>section.labels.some(label=>label.includes('倾角'))))throw new Error(TANKS[i].id+': obsolete armor angle input');
   report.push({id:TANKS[i].id,groups:actual.length,front:actual.find(x=>x.title==='正面装甲')?.labels.length||0,side:actual.find(x=>x.title==='侧面装甲')?.labels.length||0});
  }
  buttons[0].click();
  const section=[...document.querySelectorAll('#form .field-group')].find(x=>x.querySelector('h3')?.textContent==='正面装甲');
  const cells=[...section.querySelectorAll('.field')];
  return {report,desktopColumns:getComputedStyle(section.querySelector('.fields')).gridTemplateColumns.split(' ').length,frontCellRows:new Set(cells.map(x=>Math.round(x.getBoundingClientRect().top))).size};
 });
 assert.ok(desktop.report.length>=15);
 assert.equal(desktop.desktopColumns,4,'Desktop armor row should have four columns');
 assert.ok(desktop.frontCellRows<=1,'Front armor fields should fit on one desktop row');
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.evaluate(()=>{
  const section=[...document.querySelectorAll('#form .field-group')].find(x=>x.querySelector('h3')?.textContent==='正面装甲');
  const cells=[...section.querySelectorAll('.field')];
  return {columns:getComputedStyle(section.querySelector('.fields')).gridTemplateColumns.split(' ').length,rows:new Set(cells.map(x=>Math.round(x.getBoundingClientRect().top))).size};
 });
 assert.equal(mobile.columns,2,'Mobile editor should use two columns');
 for(const viewport of [{width:2048,height:1055},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#m-balance').evaluate(button=>button.click());
  await page.waitForSelector('.balance-root #form .field');
  const layout=await page.evaluate(()=>{
   const metrics=document.querySelector('.balance-metrics'),form=document.querySelector('#form');
   const bounds=metrics.getBoundingClientRect(),parent=form.getBoundingClientRect();
   const title=document.querySelector('.section-title').getBoundingClientRect();
   const field=document.querySelector('.field-group').getBoundingClientRect();
   return {position:getComputedStyle(metrics).position,contained:bounds.left>=parent.left&&bounds.right<=parent.right,
    inFlow:bounds.top>=title.bottom&&bounds.bottom<=field.top,horizontalScroll:document.documentElement.scrollWidth>innerWidth};
  });
  assert.deepEqual(layout,{position:'static',contained:true,inFlow:true,horizontalScroll:false});
  const spread=page.getByRole('spinbutton',{name:'百米最小散布半径 m',exact:true});
  await spread.fill('0.6');
  await page.locator('#save').click();
  assert.match(await page.locator('#status').textContent(),/已保存/);
 }
 await page.setViewportSize({ width: 1280, height: 720 });
 await page.goto('http://127.0.0.1:5173/balance.html');
 await page.getByRole('button', { name: /Tiger I/ }).click();
 const garage = await context.newPage();
 await garage.setViewportSize({ width: 1280, height: 720 });
 garage.on('pageerror', e => errors.push(e.message));
 await garage.addInitScript(() => {
  const raf = requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback =>
   callback.name === 'loop' || callback.toString().includes('toneMappingExposure') ? 0 : raf(callback);
 });
 await garage.goto('http://127.0.0.1:5173/?tank=tiger');
 await garage.locator('#m-armor').click();
 await garage.locator('#av-shell').selectOption('1');
 const rear = page.locator('.field-group').filter({ has: page.getByRole('heading', { name: '后面装甲', exact: true }) });
 await rear.getByRole('spinbutton', { name: '车体厚度 mm' }).fill('3000');
 await rear.getByRole('spinbutton', { name: '炮塔厚度 mm' }).fill('3000');
 const ammo = page.locator('.field-group').filter({ has: page.getByRole('heading', { name: /^弹药 2 ·/ }) });
 await ammo.getByRole('spinbutton', { name: '百米穿深 mm' }).fill('400');
 assert.notEqual(await garage.evaluate(() => window.__menu.garage.spec.armor.hull.rear[0]), 3000);
 await page.locator('#save').click();
 await garage.waitForFunction(() => window.__menu.garage.spec.armor.hull.rear[0] === 3000);
 const preview = await garage.evaluate(() => {
  const { garage: scene } = window.__menu;
  let overlay;
  scene.current.root.traverse(node => { if (node.userData.avOverlay) overlay = node.material.uniforms; });
  return {
   open: scene.armorMode, hullRear: overlay.avArm.value[2], turretRear: overlay.avArm.value[9],
   pen: overlay.avShell.value.x, shell: document.querySelector('#av-shell').value,
  };
 });
 assert.deepEqual(preview, { open: true, hullRear: 3000, turretRear: 3000, pen: 400, shell: '1' });
 const rearPixels = await garage.evaluate(async () => {
  const { THREE } = await import('/src/models/tankModel.js');
  const { intersectArmor } = await import('/src/game/armorGeometry.js');
  const { garage: scene } = window.__menu;
  const { renderer, camera, current, spec } = scene;
  scene.drag = { x: 0 };
  scene.angle = Math.PI + 0.9;
  scene.hMul = 0.4;
  scene.render(0);
  const width = 640, height = 360;
  const target = new THREE.WebGLRenderTarget(width, height);
  const pixels = new Uint8Array(width * height * 4);
  renderer.setRenderTarget(target);
  renderer.render(scene.scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  renderer.setRenderTarget(null);
  target.dispose();

  const raycaster = new THREE.Raycaster(), end = new THREE.Vector3();
  let blocked = 0, penetrable = 0;
  for (let y = 140; y < 220; y += 5) for (let x = 190; x < 390; x += 5) {
   raycaster.setFromCamera({ x: (x + 0.5) / width * 2 - 1, y: (y + 0.5) / height * 2 - 1 }, camera);
   const ray = raycaster.ray;
   const hit = intersectArmor(current, spec, ray.origin, ray.at(300, end));
   if (hit?.face !== 'rear' || hit.part !== 'hull' || hit.local.z > -0.42 * spec.dims.L) continue;
   const pixel = (y * width + x) * 4;
   const [red, green] = pixels.subarray(pixel, pixel + 2);
   if (red > green * 1.4) blocked++;
   if (green > red * 1.4) penetrable++;
  }
  return { blocked, penetrable };
 });
 assert.ok(rearPixels.blocked > 10, JSON.stringify(rearPixels));
 assert.equal(rearPixels.penetrable, 0, 'Grazing adjacent plates must not color the 3000 mm rear hull green');
 assert.equal(await garage.locator('.tcard[data-id="warden130"] em').textContent(), '无炮塔');
 await garage.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({desktop,mobile,preview,rearPixels},null,2));
} finally {
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
