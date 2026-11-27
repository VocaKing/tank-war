import assert from 'node:assert/strict';
import {Vector3,Quaternion,Euler} from 'three';
import {createServer} from 'vite';
const vite=await createServer({appType:'custom',server:{middlewareMode:true,ws:false}});
try{
 const {Tank}=await vite.ssrLoadModule('/src/game/tank.js');
 const {TANKS}=await vite.ssrLoadModule('/src/game/tankData.js');
 const ids=TANKS.filter(s=>s.artillery?.highArc).map(s=>s.id).sort();
 assert.deepEqual(ids,['archer','pzh2000','tempest155','thunderclad155']);
 const dt=1/60,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 for(const id of ids){
  const spec=TANKS.find(s=>s.id===id);
  // Invoke the real production turret update on a minimal vehicle state.
  // No renderer or physics needed to exercise the gun laying controller.
  const tank=Object.assign(Object.create(Tank.prototype),{
   spec,pos:new Vector3(),quat:new Quaternion(),heading:0,turretYaw:0,gunPitch:0,
   shellIdx:0,abilities:{usingSecondary:false},modules:{turret:1},crew:[],
   input:{aim:new Vector3(0,0,300),aimBearing:null},
   model:{turret:{position:new Vector3(0,2,0)},gun:{position:new Vector3(0,.4,1)},muzzle:{position:new Vector3(0,0,4)},gunPitchFloor:(_yaw,min)=>min}
  });
  for(let i=0;i<240;i++){
   // Repeated pitch/roll changes, with a fixed world azimuth.
   tank.quat.setFromEuler(new Euler(.15*Math.sin(i*.1),0,.13*Math.cos(i*.13),'YXZ'));
   const pivot=tank.model.turret.position.clone().applyQuaternion(tank.quat).add(tank.pos);
   tank.input.aim.set(pivot.x,0,pivot.z+300);
   tank.updateTurret(dt);
   assert.ok(Math.abs(tank.turretYaw)<1e-7,id+' yaw changed when pitch/roll varied');
   assert.ok(Number.isFinite(tank.gunPitch));
   assert.ok(tank.gunPitch<=spec.gunElevation*Math.PI/180+1e-9);
  }
  tank.quat.identity();
  tank.input.aim.set(300,0,0);
  let previous=tank.turretYaw;
  for(let i=0;i<900;i++){
   tank.updateTurret(dt);
   assert.ok(Math.abs(wrap(tank.turretYaw-previous))<=spec.turretTraverse*Math.PI/180*dt+1e-8,id+' excessive turn rate');
   previous=tank.turretYaw;
  }
  assert.ok(Math.abs(wrap(tank.turretYaw-Math.PI/2))<.001,id+' cannot turn to new bearing');
  // A near-self ray hit alternates across the vehicle. The camera-bearing
  // override must keep the mount looking in the same direction.
  tank.input.aimBearing=new Vector3(1,0,0);
  for(let i=0;i<120;i++){
   tank.input.aim.set((i%2?1:-1)*.1,0,-2);
   tank.updateTurret(dt);
   assert.ok(Math.abs(wrap(tank.turretYaw-Math.PI/2))<.001,id+' near-hit reversal');
  }
 }
 console.log('All four high-arc SPG production turret controllers: slope stability, elevation bounds, traverse rate and near-hit reversal verified.');
}finally{await vite.close();}
