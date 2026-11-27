// Pure gameplay control helpers for hull-aimed vehicles and limited-arc mounts.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const DEG=Math.PI/180;
export const wrapYaw=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Nearby terrain/walls can jump between camera and vehicle as the chase camera
// moves. Keep the horizontal bearing tied to the sight in that case, not the
// unstable camera ray intersection. Genuine target/lock and debug aims stay exact.
export function stableSightPoint(pos,aim,dir,mountHeight,hasTarget=false){
 const dx=aim.x-pos.x,dz=aim.z-pos.z,range=Math.hypot(dx,dz);
 const h=Math.hypot(dir.x,dir.z);
 if(h<1e-6||!Number.isFinite(h+range+aim.y))return null;
 if(hasTarget)return null;
 const forward=(dx*dir.x+dz*dir.z)/h;
 const lateral=Math.abs(dx*dir.z-dz*dir.x)/h;
 if(forward>=35&&lateral<=forward*.12)return null;
 // Aim in the sight direction from the vehicle, not behind or beside it.
 const d=Math.max(100,forward);
 return {x:pos.x+dir.x/h*d,y:pos.y+mountHeight+dir.y/h*d,z:pos.z+dir.z/h*d};
}
export function mayHullAim(tank,{turnLimit,braced=false,floating=false,crawl=false}){
 const i=tank.input;
 return !!(tank.spec.fixedGun&&tank.alive&&turnLimit>0&&!braced&&!floating&&!crawl&&!tank.airborne&&!tank.afloat&&!i.brake&&!i.driveHeld&&Math.abs(i.throttle)<1e-6&&Math.abs(i.steer)<1e-6);
}
// Damped servo with a sub-tenth-degree settling band. It is a torque target,
// not a direct transform: existing ground friction and damage constraints remain.
export function hullYawCommand(error,angularSpeed,turnLimit){
 if(!Number.isFinite(error+angularSpeed+turnLimit)||turnLimit<=0)return 0;
 if(Math.abs(error)<.0007&&Math.abs(angularSpeed)<.008)return 0;
 return clamp(error/.24-angularSpeed*.38,-turnLimit,turnLimit);
}
// An arc-limited mount must traverse within its physical arc. Aiming almost
// straight behind cannot flip it from one stop to the other at the wrap seam.
export function limitedYaw(current,desired,arc,step){
 const prev=clamp(current,-arc,arc),raw=wrapYaw(desired);
 const side=Math.abs(raw)>Math.PI-10*DEG&&Math.abs(prev)>.002?Math.sign(prev):Math.sign(raw);
 const target=Math.abs(raw)>arc?side*arc:raw;
 return clamp(prev+clamp(target-prev,-step,step),-arc,arc);
}
