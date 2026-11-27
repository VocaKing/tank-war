// Game-only mount controls for the short-barrel assault gun and high-arc SPGs.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const stabilizedMount=spec=>spec.id==='leviathan160'||!!spec.artillery?.highArc;
export function useSightBearing(pos,aim,dir,hasTarget){
 if(hasTarget)return false;
 const x=aim.x-pos.x,z=aim.z-pos.z,h=Math.hypot(dir.x,dir.z);
 if(!Number.isFinite(x+z+h)||h<1e-5)return false;
 const ahead=(x*dir.x+z*dir.z)/h;
 return Math.hypot(x,z)<22||ahead<1;
}
// For a near-vertical or unreachable solution, the elevation servo cannot
// achieve the mathematical direction. Keep the horizontal target bearing
// rather than letting a tiny projected component reverse the turret.
// Feasible ballistic solutions are unchanged.
export function mountAngles(vector,bearing,maxPitch){
 const x=vector.x,y=vector.y,z=vector.z;
 const horizontal=Math.hypot(x,z),pitch=Math.atan2(y,horizontal);
 const yaw=horizontal>1e-7?Math.atan2(x,z):bearing;
 const along=x*Math.sin(bearing)+z*Math.cos(bearing);
 if(horizontal<.025||along<0||(pitch>maxPitch&&Math.abs(wrap(yaw-bearing))>Math.PI/6)){
  return {yaw:wrap(bearing),pitch:Math.atan2(y,Math.max(0,along))};
 }
 return {yaw,pitch};
}

// High-arc game mounts use independent azimuth and elevation servos.
// Retain the previous yaw when the cursor is directly above the pivot.
export function highArcMountYaw(dx,dz,heading,previous,mountOffset=0){
 const range=Math.hypot(dx,dz);
 if(!Number.isFinite(range+heading+mountOffset)||range<Math.max(.75,Math.abs(mountOffset)+.25))return previous;
 return wrap(Math.atan2(dx,dz)-heading-Math.asin(Math.max(-1,Math.min(1,mountOffset/range))));
}
