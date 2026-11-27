import assert from 'node:assert/strict';
import {Vector3,Quaternion,Euler,Group,Object3D,Matrix4} from 'three';
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
  const root=new Group(),body=new Group(),turret=new Group(),gun=new Group(),barrel=new Group(),muzzle=new Object3D();
  root.add(body);body.add(turret);turret.position.set(0,2,0);turret.add(gun);gun.position.set(0,.4,1);
  gun.add(barrel);barrel.add(muzzle);muzzle.position.z=4;
  const model={root,body,turret,gun,barrel,muzzle,maxRecoil:.15,gunPitchFloor:(_yaw,min)=>min};
  const tank=Object.assign(Object.create(Tank.prototype),{
   spec,pos:new Vector3(),quat:new Quaternion(),heading:0,pitch:0,roll:0,turretYaw:0,gunPitch:0,yawRate:0,
   shellIdx:0,abilities:{usingSecondary:false},modules:{turret:1},crew:[],
   input:{aim:new Vector3(0,0,300),aimBearing:null},recoil:0,spadeProgress:0,suspensionOffset:0,inv:new Matrix4(),
   model
  });
  // Keep a fixed world bearing while the hull pitches and rolls.
  for(let i=0;i<240;i++){
   tank.pitch=.15*Math.sin(i*.1);tank.roll=.13*Math.cos(i*.13);
   tank.quat.setFromEuler(new Euler(tank.pitch,0,tank.roll,'YXZ'));
   tank.input.aim.set(0,2.2,300);
   tank.syncModel();tank.updateTurret(dt);tank.syncModel();
   assert.ok(Number.isFinite(tank.gunPitch));
   assert.ok(tank.gunPitch<=spec.gunElevation*Math.PI/180+1e-9);
  }
  tank.pitch=0;tank.roll=0;tank.quat.identity();tank.syncModel();
  tank.input.aim.set(300,0,0);
  let previous=tank.turretYaw;
  for(let i=0;i<900;i++){
   tank.updateTurret(dt);tank.syncModel();
   assert.ok(Math.abs(wrap(tank.turretYaw-previous))<=spec.turretTraverse*Math.PI/180*dt+1e-8,id+' excessive turn rate');
   previous=tank.turretYaw;
  }
  let muzzleWorld=tank.muzzleNode.getWorldPosition(new Vector3()),dir=tank.gunDirection();
  let targetBearing=Math.atan2(tank.input.aim.x-muzzleWorld.x,tank.input.aim.z-muzzleWorld.z);
  assert.ok(Math.abs(wrap(Math.atan2(dir.x,dir.z)-targetBearing))<.01,id+' cannot align to new world bearing');
  // A near-self ray hit alternates across the vehicle. A supplied sight bearing
  // must keep the barrel's horizontal direction stable despite the near hit.
  tank.input.aimBearing=new Vector3(1,0,0);
  for(let i=0;i<120;i++){
   tank.input.aim.set((i%2?1:-1)*.1,0,-2);
   tank.updateTurret(dt);tank.syncModel();
  }
  dir=tank.gunDirection();
  assert.ok(Math.abs(wrap(Math.atan2(dir.x,dir.z)-Math.PI/2))<.01,id+' near-hit bearing reversal');
 }
 console.log('All four high-arc SPG production turret controllers: slope stability, elevation bounds, traverse rate and near-hit reversal verified.');
}finally{await vite.close();}
