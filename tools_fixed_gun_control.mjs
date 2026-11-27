import assert from 'node:assert/strict';
import {stableSightPoint,mayHullAim,hullYawCommand,limitedYaw,wrapYaw} from './src/game/fixedGunControl.js';
const pos={x:0,y:0,z:0},dir={x:0,y:-.1,z:1};
for(const aim of [{x:-4,y:1,z:2},{x:5,y:0,z:-5},{x:1,y:0,z:12},{x:100,y:0,z:20}]){
 const s=stableSightPoint(pos,aim,dir,2);assert.ok(s&&s.x===0&&s.z>=100);
}
assert.equal(stableSightPoint(pos,{x:2,y:0,z:200},dir,2),null);
assert.equal(stableSightPoint(pos,{x:-4,y:1,z:2},dir,2,true),null);
const t={alive:true,spec:{fixedGun:true},input:{throttle:0,steer:0,brake:false,driveHeld:false}};
assert.ok(mayHullAim(t,{turnLimit:1}));
for(const key of ['braced','floating','crawl'])assert.ok(!mayHullAim(t,{turnLimit:1,[key]:true}));
for(const key of ['brake','driveHeld','throttle','steer']){t.input[key]=1;assert.ok(!mayHullAim(t,{turnLimit:1}));t.input[key]=0;}
t.airborne=true;assert.ok(!mayHullAim(t,{turnLimit:1}));t.airborne=false;t.alive=false;assert.ok(!mayHullAim(t,{turnLimit:1}));t.alive=true;
assert.equal(hullYawCommand(0,0,1),0);
assert.ok(hullYawCommand(.1,.4,1)<hullYawCommand(.1,0,1));
assert.equal(hullYawCommand(3,0,.6),.6);
let heading=0,velocity=0;
for(let i=0;i<1200;i++){const dt=1/120,cmd=hullYawCommand(wrapYaw(1-heading),velocity,.6);velocity+=(cmd-velocity)*dt/.085;heading+=velocity*dt;}
assert.ok(Math.abs(heading-1)<.0015);
let current=.6,arc=38*Math.PI/180;
for(let i=0;i<120;i++){current=limitedYaw(current,(i%2?1:-1)*(Math.PI-.01),arc,.01);assert.ok(current>0&&current<=arc);}
for(let i=0;i<150;i++)current=limitedYaw(current,-.4,arc,.01);
assert.ok(Math.abs(current+.4)<1e-8);
console.log('Fixed-gun sight stabilization, exclusive control, damped aiming and limited mount arc verified.');
