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
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('console',m=>{if(m.type()==='error')process.stdout.write('BROWSER_ERROR='+m.text()+'\\n');});
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {TANKS}=await import('/src/game/tankData.js');
  const {createTankModel}=await import('/src/models/tankModel.js');
  const colors={paint:0x77805c,metal:0x55534b,rubber:0x242424,dark:0x141719,glass:0x435b65,wood:0x71583b,canvas:0x8b8068,burnt:0x211c18,bore:0x050607,steel:0x77736b,tail:0x8d1d15,amber:0x9c6c19,track:0x45433e};
  const models=TANKS.map(spec=>{
   const model=createTankModel(spec,{links:false});
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
  const report=models.map(x=>({id:x.spec.id,short:x.spec.short,specDims:{hullLength:x.spec.dims.L,width:x.spec.dims.W,hullH:x.spec.dims.hullH,turretH:x.spec.dims.turretH},rendered:x.size,body:x.body,turret:x.turret,gunLen:x.spec.dims.gunLen}));
  const webgl=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas:webgl,antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x1a242c,1);renderer.autoClear=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a242c);
  scene.add(new THREE.HemisphereLight(0xcbd8e1,0x454039,2.0));
  const key=new THREE.DirectionalLight(0xffedcf,3.0);key.position.set(7,11,9);scene.add(key);
  const fill=new THREE.DirectionalLight(0x9cb7d1,1.2);fill.position.set(-8,5,-5);scene.add(fill);
  const draw=(entry,width,height,view)=>{
   scene.add(entry.model.root);entry.model.root.updateMatrixWorld(true);
   const aspect=width/height,largest=Math.max(entry.size.length,entry.size.width,entry.size.height);
   const span=largest*1.38;
   const camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,0.1,100);
   const c=entry.center;
   const v=view==='side'?[12,4,0.4]:view==='front'?[0,4,13]:[9,6,11];
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
  const is2=models.find(x=>x.spec.id==='is2'),views=['three','side','front'],tileW=460,tileH=350,detail=document.createElement('canvas');detail.width=tileW*3;detail.height=tileH+32;
  const dctx=detail.getContext('2d');dctx.fillStyle='#111820';dctx.fillRect(0,0,detail.width,detail.height);
  for(let i=0;i<views.length;i++){dctx.drawImage(draw(is2,tileW,tileH,views[i]),i*tileW,0);dctx.fillStyle='#e7edf4';dctx.font='bold 16px system-ui';dctx.fillText(['FRONT 3/4','SIDE','FRONT'][i],i*tileW+10,tileH+23);}
  renderer.dispose();
  return {report,grid:grid.toDataURL('image/jpeg',0.66).split(',')[1],is2:detail.toDataURL('image/jpeg',0.7).split(',')[1]};
 });
 console.log('VISUAL_AUDIT_REPORT='+JSON.stringify(result.report));
 console.log('VISUAL_AUDIT_GRID='+result.grid);
 console.log('VISUAL_AUDIT_IS2='+result.is2);
} finally {
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
