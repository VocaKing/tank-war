// Start Vite first (npm run dev), then node tools_gun_clearance.mjs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { centralFront,hullPitchFloor } from './src/models/gunClearance.js';
const triangle=points=>({attributes:{position:{count:points.length,getX:i=>points[i][0],getZ:i=>points[i][2]}}});
assert.ok(Math.abs(centralFront([triangle([[-2,0,1],[2,0,1],[2,1,3]])],.25)-2.125)<1e-9);
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:800,height:600}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173/');
 const checks=await page.evaluate(async()=>{
  const {createTankModel}=await import('/src/models/tankModel.js');
  const {TANKS}=await import('/src/game/tankData.js');
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const out=[],D=Math.PI/180;
  for(const s of TANKS){
   const m=createTankModel(s,{links:false}),p=m.gun.position.clone();
   const c=m.gunClearance;let bad=0;
   for(let yaw=0;yaw<2*Math.PI;yaw+=Math.PI/18){
    m.turret.rotation.y=yaw;
    const floor=m.gunPitchFloor(yaw,-s.gunDepression*D,s.gunElevation*D);
    for(const pitch of [floor,Math.max(0,floor),s.gunElevation*D]){
     m.gun.rotation.x=-pitch;
     for(const recoil of [0,m.maxRecoil]){
      m.barrel.position.z=-recoil;m.root.updateMatrixWorld(true);
      const muzzle=m.muzzle.getWorldPosition(new THREE.Vector3());
      const direction=new THREE.Vector3(0,0,1).applyQuaternion(m.gun.getWorldQuaternion(new THREE.Quaternion()));
      const pivot=m.gun.getWorldPosition(new THREE.Vector3());
      if(!Number.isFinite(muzzle.x+muzzle.y+muzzle.z)||!m.gun.position.equals(p)||muzzle.clone().sub(pivot).normalize().dot(direction)<.99999)bad++;
      // No external tube vertex (beyond the intentional collar overlap) may
      // retreat behind the computed central turret front during normal motion.
      m.barrel.traverse(o=>{if(!o.isMesh)return;const v=o.geometry.attributes.position;for(let i=0;i<v.count;i++){
       if(v.getZ(i)<.65)continue;
       const pt=m.turret.worldToLocal(o.localToWorld(new THREE.Vector3(v.getX(i),v.getY(i),v.getZ(i))));
       if(pt.z<c.front-.001)bad++;
      }});
     }
    }
   }
   out.push({id:s.id,shift:c.shift,front:c.front,pivot:c.pivot,bad});
  }
  return out;
 });
 console.log(checks);assert.equal(checks.length,15);assert.ok(checks.every(x=>x.bad===0));assert.deepEqual(errors,[]);
}finally{await browser.close()}
