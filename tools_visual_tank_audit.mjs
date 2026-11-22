import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('console',m=>{if(m.type()==='error')process.stdout.write('BROWSER_ERROR='+m.text()+'\\n');});
 await page.goto('http://127.0.0.1:5173/');
 const result=await page.evaluate(async()=>{
  const {THREE,createTankModel,setTrackLOD}=await import('/src/models/tankModel.js');
  const {TANKS}=await import('/src/game/tankData.js');
  const colors={paint:0x77805c,metal:0x55534b,rubber:0x242424,dark:0x141719,glass:0x435b65,wood:0x71583b,canvas:0x8b8068,burnt:0x211c18,bore:0x050607,steel:0x77736b,tail:0x8d1d15,amber:0x9c6c19,track:0x45433e};
  const models=TANKS.map(spec=>{
   const model=createTankModel(spec,{links:false});
   setTrackLOD(model,true); // audit the detailed road-wheel and individual-link geometry, not the far LOD proxy
   for(const mesh of model.meshes){
    if(mesh.userData.decal){mesh.visible=false;continue;}
    const key=mesh.userData.matKey||'track';
    mesh.material=new THREE.MeshStandardMaterial({color:colors[key]??0x77805c,roughness:key==='metal'?0.62:0.88,metalness:key==='metal'?0.45:0.08});
   }
   model.root.updateMatrixWorld(true);
   const all=new THREE.Box3().setFromObject(model.root);
   const body=new THREE.Box3().setFromObject(model.body);
   const turret=new THREE.Box3().setFromObject(model.turret);
   const size=all.getSize(new THREE.Vector3()),bs=body.getSize(new THREE.Vector3()),ts=turret.getSize(new THREE.Vector3());
   return {spec,model,bounds:all,center:all.getCenter(new THREE.Vector3()),size:{length:+size.z.toFixed(2),width:+size.x.toFixed(2),height:+size.y.toFixed(2)},body:{length:+bs.z.toFixed(2),width:+bs.x.toFixed(2),height:+bs.y.toFixed(2)},turret:{length:+ts.z.toFixed(2),width:+ts.x.toFixed(2),height:+ts.y.toFixed(2)}};
  });
  const report=models.map(x=>({id:x.spec.id,short:x.spec.short,specDims:{hullLength:x.spec.dims.L,width:x.spec.dims.W,hullH:x.spec.dims.hullH,turretH:x.spec.dims.turretH,trackWidth:x.spec.dims.trackW},rendered:x.size,body:x.body,turret:x.turret,gunLen:x.spec.dims.gunLen,trackPitch:x.model.pitch,trackLinksPerSide:x.model.trackLinksPerSide,muzzle:x.model.muzzleInfo,gunClearance:x.model.gunClearance,gunMountNoCollar:x.model.gunMountNoCollar,roadWheelStationsPerSide:x.model.roadWheelStationsPerSide,roadWheelDiscsPerSide:x.model.roadWheelDiscsPerSide,roadWheelDiameter:x.model.roadWheelDiameter,frontIdlerDiameter:x.model.frontIdlerDiameter,driveSprocketTeethPerSide:x.model.driveSprocketTeethPerSide,auxiliaryFuelTanks:x.model.auxiliaryFuelTanks,headlights:x.model.headlights,rearDTMountX:x.model.rearDTMountX,roadWheelStarIndentations:x.model.roadWheelStarIndentations,turretLeftWallAngleFromVertical:x.model.turretLeftWallAngleFromVertical,turretRightWallAngleFromVertical:x.model.turretRightWallAngleFromVertical,glacisAngleFromVertical:x.model.glacisAngleFromVertical,idlersPerSide:x.model.idlersPerSide,returnRollersPerSide:x.model.returnRollersPerSide,driveSprocketsPerSide:x.model.driveSprocketsPerSide}));
  const webgl=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas:webgl,antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x1a242c,1);renderer.autoClear=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a242c);
  scene.add(new THREE.HemisphereLight(0xcbd8e1,0x454039,2.0));
  const key=new THREE.DirectionalLight(0xffedcf,3.0);key.position.set(7,11,9);scene.add(key);
  const fill=new THREE.DirectionalLight(0x9cb7d1,1.2);fill.position.set(-8,5,-5);scene.add(fill);
  const draw=(entry,width,height,view)=>{
   scene.add(entry.model.root);entry.model.root.updateMatrixWorld(true);
   const aspect=width/height;
   // Frame each orthographic view around the dimensions that are actually
   // visible from that direction; the previous length-based front framing
   // made the nose, turret face and suspension details too small to inspect.
   const span=view==='front'||view==='rear'
    ? Math.max(entry.size.width,entry.size.height)*1.05
    : view==='top'
     ? entry.size.length*1.10
     : Math.max(entry.size.length,entry.size.height)*1.05;
   const camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,0.1,100);
   const c=entry.center;
   const v=view==='side'?[12,4,0.4]:view==='opposite'?[-12,4,0.4]:view==='front'?[0,4,13]:view==='rear'?[0,4,-13]:view==='top'?[0,16,0.01]:[9,6,11];
   if(view==='top')camera.up.set(0,0,-1);
   camera.position.set(c.x+v[0],c.y+v[1],c.z+v[2]);camera.lookAt(c.x,c.y+0.08,c.z);camera.updateProjectionMatrix();
   renderer.setSize(width,height,false);renderer.setViewport(0,0,width,height);renderer.setScissor(0,0,width,height);renderer.setScissorTest(true);renderer.clear(true,true,true);renderer.render(scene,camera);
   scene.remove(entry.model.root);
   return webgl;
  };
  const cols=4,cellW=340,cellH=270,grid=document.createElement('canvas');grid.width=cols*cellW;grid.height=4*cellH;
  const g=grid.getContext('2d');g.fillStyle='#111820';g.fillRect(0,0,grid.width,grid.height);
  for(let i=0;i<models.length;i++){
   const x=(i%cols)*cellW,y=Math.floor(i/cols)*cellH;
   g.drawImage(draw(models[i],cellW,cellH-30,'three'),x,y);
   g.fillStyle='#e7edf4';g.font='bold 17px system-ui';g.fillText(models[i].spec.short,x+10,y+cellH-9);
  }
  const is2=models.find(x=>x.spec.id==='is2'),views=['three','side','opposite','front','rear','top'],labels=['FRONT 3/4','RIGHT SIDE','LEFT SIDE','FRONT','REAR','TOP'],tileW=640,tileH=480,detail=document.createElement('canvas');detail.width=tileW*views.length;detail.height=tileH+32;
  const dctx=detail.getContext('2d');dctx.fillStyle='#111820';dctx.fillRect(0,0,detail.width,detail.height);
  for(let i=0;i<views.length;i++){dctx.drawImage(draw(is2,tileW,tileH,views[i]),i*tileW,0);dctx.fillStyle='#e7edf4';dctx.font='bold 16px system-ui';dctx.fillText(labels[i],i*tileW+10,tileH+23);}
  renderer.dispose();
  return {report,grid:grid.toDataURL('image/jpeg',0.66).split(',')[1],is2:detail.toDataURL('image/jpeg',0.7).split(',')[1]};
 });
 const outDir=process.env.TANK_AUDIT_OUT||'tank-audit-output';
 mkdirSync(outDir,{recursive:true});
 writeFileSync(join(outDir,'tank-lineup.jpg'),Buffer.from(result.grid,'base64'));
 writeFileSync(join(outDir,'is2-views.jpg'),Buffer.from(result.is2,'base64'));
 writeFileSync(join(outDir,'tank-audit.json'),JSON.stringify(result.report,null,2));
 // T-72B and T-90M envelope lengths include the fitted rear auxiliary fuel drums; the published base lengths exclude them.
 const expectedOverall={sherman:7.57,tiger:8.45,t34:8.15,t72:9.91,m1a2:9.83,panther:8.86,is2:9.83,pershing:8.647,centurion:9.83,leo1:9.54,leo2a6:10.97,t90m:10.25,chally2:11.55,type99a:10.92,merkava4:9.04};
 for(const tank of result.report){
  assert.ok(tank.muzzle&&tank.muzzle.bore>0, tank.id+' has no open muzzle bore');
  assert.ok(Number.isFinite(tank.gunClearance.front)&&(tank.gunMountNoCollar||tank.gunClearance.pivot>=tank.gunClearance.front+0.1-1e-3),tank.id+' gun pivot intersects the turret face without a cut-out mount');
  const delta=Math.abs(tank.rendered.length-expectedOverall[tank.id]);
  assert.ok(delta<0.65,tank.id+' rendered overall length '+tank.rendered.length+'m differs from reference '+expectedOverall[tank.id]+'m');
 }
 const expectedRoadWheels={sherman:6,t34:5,tiger:24,panther:16,is2:6,pershing:6,centurion:6,t72:6,leo1:7,m1a2:7,chally2:6,leo2a6:7,merkava4:6,type99a:6,t90m:6};
 for(const tank of result.report){
  assert.equal(tank.roadWheelStationsPerSide,expectedRoadWheels[tank.id],tank.id+' has an incorrect road-wheel station count');
  assert.equal(tank.idlersPerSide,1,tank.id+' must have one idler per side');
  assert.equal(tank.driveSprocketsPerSide,1,tank.id+' must have one drive sprocket per side');
 }
 const expectedReturnRollers={sherman:3,t34:0,tiger:0,panther:0,is2:3,pershing:5,centurion:6,t72:3,leo1:4,m1a2:2,chally2:4,leo2a6:4,merkava4:4,type99a:3,t90m:3};
 for(const tank of result.report){
  assert.equal(tank.returnRollersPerSide,expectedReturnRollers[tank.id],tank.id+' has an incorrect return-roller count');
  assert.ok(Math.abs(tank.rendered.width-tank.specDims.width)<0.45,tank.id+' track / hull width envelope is too far from the reference width');
 }
 const tiger=result.report.find(t=>t.id==='tiger');
 assert.equal(tiger.roadWheelStationsPerSide,24,'Tiger I must show 24 individual interleaved road wheels per side');
 const is2=result.report.find(t=>t.id==='is2');
 assert.equal(is2.specDims.hullLength,6.77);
 assert.equal(is2.specDims.width,3.09);
 assert.ok(Math.abs(is2.roadWheelDiameter-0.55)<1e-6,'IS-2 road wheels must be 550 mm in diameter');
 assert.equal(is2.roadWheelStationsPerSide,6,'IS-2 must have six road-wheel stations per side');
 assert.equal(is2.roadWheelDiscsPerSide,12,'IS-2 must have six twin road-wheel pairs per side');
 assert.ok(Math.abs(is2.frontIdlerDiameter-0.55)<1e-6,'IS-2 front idler must match the 550 mm road-wheel diameter');
 assert.equal(is2.trackLinksPerSide,86,'IS-2 tracks must contain 86 links per side');
 assert.equal(is2.driveSprocketTeethPerSide,14,'IS-2 drive sprocket must use 14-tooth rims');
 assert.equal(is2.auxiliaryFuelTanks,4,'IS-2 must have four external auxiliary fuel tanks');
 assert.equal(is2.headlights,2,'IS-2 must have two guarded headlights');
 assert.ok(Math.abs(is2.rearDTMountX-0.58)<1e-6,'IS-2 rear DT ball mount must be on the right half of the turret bustle');
 assert.equal(is2.roadWheelStarIndentations,12,'IS-2 cast road wheels must show twelve star indentations');
 assert.ok(Math.abs(is2.turretLeftWallAngleFromVertical-4)<0.2,'IS-2 left turret wall must remain nearly vertical');
 assert.ok(Math.abs(is2.turretRightWallAngleFromVertical-20)<0.2,'IS-2 right turret wall must slope by about 20 degrees');
 assert.ok(Math.abs(is2.glacisAngleFromVertical-60)<0.2,'IS-2 Model 1944 upper glacis must be 60 degrees from vertical');
 console.log('VISUAL_AUDIT_REPORT='+JSON.stringify(result.report));
 console.log('VISUAL_AUDIT_GRID='+result.grid);
 console.log('VISUAL_AUDIT_IS2='+result.is2);
} finally {
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
