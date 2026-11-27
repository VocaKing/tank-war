import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BattlefieldPhysics,initPhysics,PHYSICS_STEP} from './src/game/physics.js';
import {Terrain} from './src/world/terrain.js';
import {longitudinalBrakeMode,remainingTraction,steeringTravelDirection} from './src/game/vehicleHandling.js';
const engine=await initPhysics();
function setup(speed=0,mass=33.7){
 const terrain=new Terrain(100,2);terrain.water.fill(-1e9);
 const physics=new BattlefieldPhysics(engine,{terrain,playHalf:100,colliders:[],decks:[],veg:{rocks:[]},groundHeight:()=>0});
 const spec={mass,power:900,maxSpeed:48,reverseSpeed:12,hullTraverse:34,cls:'Medium',runningGear:'tracks',
  dims:{L:6.27,W:3,trackW:.58,trackGauge:2.26,hullH:1.9,clearance:.43,turretW:2.1,turretL:2.3,turretH:.78,turretZ:0}};
 const tank={spec,pos:new THREE.Vector3(0,.01,0),quat:new THREE.Quaternion(),vel:new THREE.Vector3(),
  input:{throttle:0,steer:0,brake:false,driveHeld:true},alive:true,airborne:false,afloat:false,inWater:false,
  modules:{engine:1,tracks:1,turret:1},mobilityModule:'tracks',equip:{active:()=>false,factor:1},
  crewAlive:()=>true,activeMaxSpeed:48,heading:0,pitch:0,roll:0,speed:0,turnRate:0,
  hullAiming:false,brokenTrackSide:0,turretGone:false,usesSpade:()=>false,vehicleSkill:null,abilities:null};
 physics.place(tank,speed);
 for(let i=0;i<36;i++)physics.advance(PHYSICS_STEP);
 return {physics,tank,close:()=>physics.free()};
}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
assert.equal(steeringTravelDirection(1,-8),1);
assert.equal(steeringTravelDirection(-1,8),-1);
assert.equal(steeringTravelDirection(0,-8),-1);
assert.equal(steeringTravelDirection(0,0),1);
assert.equal(longitudinalBrakeMode(1,-8,false),'counter');
assert.equal(longitudinalBrakeMode(1,-.2,false),'drive');
assert.equal(longitudinalBrakeMode(1,8,true),'service');
assert.ok(Math.abs(remainingTraction(100,60,60)-52.915026)<1e-5);
assert.equal(remainingTraction(100,100,0),0);
function serviceStop(mass){
 const {physics,tank,close}=setup(15,mass);
 tank.input.brake=true;let elapsed=0;
 while(elapsed<3&&Math.abs(tank.speed)>.08){physics.advance(PHYSICS_STEP);elapsed+=PHYSICS_STEP;}
 const out={elapsed,distance:Math.abs(tank.pos.z),speed:tank.speed};close();return out;
}
const normal=serviceStop(33.7),heavy=serviceStop(66);
assert.ok(normal.elapsed<2.1&&normal.distance<16&&Math.abs(normal.speed)<.08,normal);
assert.ok(Math.abs(normal.elapsed-heavy.elapsed)<.12,{normal,heavy});
{
 const {physics,tank,close}=setup(-10.7);tank.input.throttle=1;tank.input.driveHeld=true;
 let crossed=false,crossTime=0;
 for(let i=0;i<360;i++){physics.advance(PHYSICS_STEP);if(!crossed&&tank.speed>=0){crossed=true;crossTime=(i+1)*PHYSICS_STEP;}}
 assert.ok(crossed&&crossTime<1.9,{crossed,crossTime,speed:tank.speed});
 assert.ok(tank.speed>1.0,tank.speed);close();
}
{
 const {physics,tank,close}=setup(-6);tank.input.throttle=1;tank.input.steer=1;tank.input.driveHeld=true;
 const start=tank.heading;for(let i=0;i<36;i++)physics.advance(PHYSICS_STEP);
 assert.ok(wrap(tank.heading-start)>.045,{start,heading:tank.heading,speed:tank.speed});close();
}
{
 const {physics,tank,close}=setup(0);tank.vehicle.body.setLinvel({x:8,y:0,z:0},true);tank.input.driveHeld=true;
 for(let i=0;i<60;i++)physics.advance(PHYSICS_STEP);
 assert.ok(Math.abs(tank.vel.x)<4.2,tank.vel.x);close();
}
console.log('Vehicle handling verified: direction-aware steering, counter-throttle braking, service braking, mass scaling, lateral grip and friction-circle yaw torque.');
