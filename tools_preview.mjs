// Standalone visual regression runner; no production game changes or deployment.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const html = `<!doctype html><html><body style="margin:0;background:#20252b"><script type="module">
import * as THREE from 'three';
import { TANKS } from '/src/game/tankData.js';
import {createTankModel,updateRunningGear,setTrackLOD} from '/src/models/tankModel.js';
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x303941);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1000,700); renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x77716a,2.1));
const sun=new THREE.DirectionalLight(0xfff3e1,3.1);sun.position.set(6,10,8);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:0.1,far:35});scene.add(sun);
const fill=new THREE.DirectionalLight(0xc9d9ff,1.2);fill.position.set(-6,4,-8);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:0x66635c,roughness:0.95}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.03;ground.receiveShadow=true;scene.add(ground);
const camera=new THREE.PerspectiveCamera(36,1000/700,0.1,100);
let model=null; window.tankIds=TANKS.map(s=>s.id);
window.renderTank=(id,angle)=>{
 if(model)scene.remove(model.root);
 const spec=TANKS.find(s=>s.id===id);
 if(!spec)throw new Error('Unknown tank '+id);
 model=createTankModel(spec,{links:true});scene.add(model.root);
 updateRunningGear(model,0.12,0.12);setTrackLOD(model,false);setTrackLOD(model,true);
 const bounds=new THREE.Box3().setFromObject(model.root);
 if(bounds.isEmpty()||!Number.isFinite(bounds.max.x))throw new Error('Invalid bounds '+id);
 const target=new THREE.Vector3(0,1.2,0.7),distance=Math.max(14,spec.dims.L*2.1);
 camera.position.set(Math.sin(angle)*distance,6.2,Math.cos(angle)*distance);camera.lookAt(target);
 renderer.render(scene,camera);
 return {id,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};
};
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true},plugins:[{name:'tank-preview',configureServer(s){s.middlewares.use('/__tank-preview',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__tank-preview',html));}catch(e){next(e);}});}}]});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5178/__tank-preview');
 await page.waitForFunction(()=>typeof window.renderTank==='function');
 await mkdir('tank-previews',{recursive:true});
 const ids=await page.evaluate(()=>window.tankIds);
 for(const id of ids)for(const [name,angle] of [['front',0.76],['rear',2.48]]){
  const info=await page.evaluate(([id,angle])=>window.renderTank(id,angle),[id,angle]);
  await page.locator('canvas').screenshot({path:'tank-previews/'+id+'-'+name+'.png'});
  console.log(JSON.stringify(info));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Rendered '+ids.length+' tanks from both angles.');
}finally{if(browser)await browser.close();await server.close();}
