import assert from 'node:assert/strict';
import {stabilizedMount,useSightBearing,mountAngles,highArcMountYaw} from './src/game/mortarAim.js';
const max=83*Math.PI/180;
assert.ok(stabilizedMount({id:'leviathan160'}));
assert.ok(stabilizedMount({id:'thunderclad155',artillery:{highArc:true}}));
assert.ok(!stabilizedMount({id:'t72'}));
const pos={x:0,z:0},dir={x:0,z:1};
assert.ok(useSightBearing(pos,{x:0,z:-5},dir,false));
assert.ok(useSightBearing(pos,{x:2,z:12},dir,false));
assert.ok(!useSightBearing(pos,{x:2,z:12},dir,true));
assert.ok(!useSightBearing(pos,{x:2,z:200},dir,false));
for(let i=0;i<200;i++){
 const sign=i%2?1:-1;
 const a=mountAngles({x:sign*.0001,y:1,z:-.002},0,max);
 assert.ok(Math.abs(a.yaw)<1e-8&&a.pitch>1.5);
 const b=mountAngles({x:0,y:.999,z:-.04},0,max);
 assert.ok(Math.abs(b.yaw)<1e-8);
}
const b=.8,p=.6;
const normal=mountAngles({x:Math.sin(b)*Math.cos(p),y:Math.sin(p),z:Math.cos(b)*Math.cos(p)},b,max);
assert.ok(Math.abs(normal.yaw-b)<1e-9&&Math.abs(normal.pitch-p)<1e-9);
console.log('Short-barrel and high-arc mount angle stability verified.');

for(const heading of [0,.2,-2.8,Math.PI-.02,-Math.PI+.02]){
 const yaw=highArcMountYaw(0,100,heading,.4);
 assert.ok(Math.abs(Math.sin(yaw+heading))<1e-9);
 assert.ok(Math.cos(yaw+heading)>.999);
 assert.equal(highArcMountYaw(0,0,heading,.4),.4);
}
