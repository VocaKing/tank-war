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
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/tests/muzzle.html');
 const result=await page.evaluate(async()=>{
  const {createTankModel}=await import('/src/models/tankModel.js');
  const {TANKS}=await import('/src/game/tankData.js');
  const out=[];
  for(const spec of TANKS){
   const model=createTankModel(spec,{links:false});
   const boreMeshes=model.barrel.children.filter(x=>x.isMesh&&x.userData.matKey==='bore');
   out.push({id:spec.id,removed:model.muzzleInfo?.removed||0,bore:model.muzzleInfo?.bore||0,outer:model.muzzleInfo?.outer||0,boreMeshes:boreMeshes.length,muzzleZ:model.muzzle.position.z});
  }
  const t72=createTankModel(TANKS.find(x=>x.id==='t72'),{links:false});
  t72.root.updateMatrixWorld(true);
  let rearTubeVertices=0;
  for(const mesh of t72.turret.children){
   if(!mesh.isMesh||mesh.userData.matKey!=='metal')continue;
   const p=mesh.geometry.attributes.position;
   for(let i=0;i<p.count;i++){
    const radial=Math.hypot(p.getX(i),p.getY(i)-0.5),z=p.getZ(i);
    if(z>-2.02&&z<-0.68&&Math.abs(radial-0.09)<0.012)rearTubeVertices++;
   }
  }
  const pivotWorldZ=t72.turret.position.z+t72.gun.position.z;
  const muzzleWorldZ=pivotWorldZ+t72.barrel.position.z+t72.muzzle.position.z;
  return {out,t72:{pivotZ:t72.gun.position.z,clearancePivot:t72.gunClearance.pivot,front:t72.gunClearance.front,muzzleZ:muzzleWorldZ,pivotWorldZ,rearTubeVertices}};
 });
 assert.equal(result.out.length,26);
 const modelPending=new Set(['t14','strv103','fv4005s1','m50ontos','centauro2','sprutsd','archer','bmpt','2s38','xm8ags']);
 for(const x of result.out){
  assert.ok(x.removed>0, x.id+' has no open muzzle face');
  assert.ok(x.bore>0.025, x.id+' has no visible bore radius');
  assert.ok(x.boreMeshes>=1, x.id+' is missing the inner liner and recessed chamber');
  if(!modelPending.has(x.id)){ const minimumMuzzleReach=x.id==='sherman'?2.5:3; assert.ok(x.muzzleZ>minimumMuzzleReach, x.id+' has an invalid muzzle position'); }
 }
 assert.ok(Math.abs(result.t72.pivotZ-1.05)<1e-6,'T-72B trunnion must stay at the front mantlet position');
 assert.ok(Math.abs(result.t72.clearancePivot-1.05)<1e-6,'T-72B geometry mount override was not applied');
 assert.ok(result.t72.muzzleZ>result.t72.pivotWorldZ+3,'T-72B barrel points forward from its turret mount');
 assert.equal(result.t72.rearTubeVertices,0,'T-72B still has the protruding rear-center snorkel cylinder');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify(result,null,2));
} finally {
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
