// Mechanical gun attachment: CPU-side geometry bounds, computed once per model.
// Positive z is forward. Intentional internal overlap at the trunnion is allowed.
export const MAX_RECOIL = 0.15;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
// Clip triangle to a narrow strip around the barrel; interpolate edge crossings,
// so broad faces are included even when none of their vertices lie in the strip.
export function centralFront(parts,halfWidth=0.26){
 let front=-Infinity;
 for(const g of parts){
  const a=g.attributes.position;
  for(let i=0;i<a.count;i+=3){
   let poly=[0,1,2].map(j=>[a.getX(i+j),a.getZ(i+j)]);
   for(const side of [-1,1]){
    const out=[];
    for(let k=0;k<poly.length;k++){
     const p=poly[k],q=poly[(k+1)%poly.length],d=halfWidth-side*p[0],e=halfWidth-side*q[0];
     if(d>=0)out.push(p);
     if((d>=0)!==(e>=0)){const t=d/(d-e);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    poly=out;
   }
   for(const p of poly)front=Math.max(front,p[1]);
  }
 }
 return front;
}
export function gunMount(P,b,spec,lathe){
 const raw=Object.entries(P.b).filter(([k])=>k.startsWith('turret|')).flatMap(([,v])=>v);
 const original=b.gunPos[2],front=centralFront(raw);
 // Reserve a little space in front of the turret for the moving gun tube.
 const pivot=Number.isFinite(b.gunMountZ)?b.gunMountZ:Math.max(original,Number.isFinite(front)?front+0.12:original);
 const shift=pivot-original;
 b.gunPos=[b.gunPos[0],b.gunPos[1],pivot];
 // Integrate the trunnion support into the armor, no floating gap or exposed rod
 // bridging the turret. The profile is a solid cast/tapered collar.
 if(!b.gunMountNoCollar){
  const r=spec.era==='WWII'?0.25:0.23;
  const rear=Math.min(original-0.18,pivot-0.28);
  const collar=lathe([[0.001,rear-pivot],[r*1.28,rear-pivot],[r*1.28,-0.16],[r,-0.04],[r*0.94,0.08],[0.001,0.08]],32);
  collar.translate(b.gunPos[0],b.gunPos[1],pivot);
  P.add('turret','paint',collar);
 }
 // Measure gun-forward length from the chassis rear datum, even on models
 // with external drums or other stowage. Keep the chamber and mount intact.
 const tubes=Object.entries(P.b).filter(([k])=>k.startsWith('barrel|')).flatMap(([,v])=>v);
 let originalEnd=0;
 for(const g of tubes){g.computeBoundingBox();originalEnd=Math.max(originalEnd,g.boundingBox.max.z);}
 const shoulder=0.65;
 const { L, gunForwardL } = spec.dims;
 const neutralEnd = gunForwardL === undefined
  ? originalEnd - shift
  : gunForwardL - L / 2 - b.turretPos[2] - pivot;
 const factor = originalEnd > shoulder
  ? Math.max(gunForwardL === undefined ? 0.78 : 0.1, (neutralEnd - shoulder) / (originalEnd - shoulder))
  : 1;
 for(const g of tubes){
  const a=g.attributes.position;
  for(let i=0;i<a.count;i++)if(a.getZ(i)>shoulder)a.setZ(i,shoulder+(a.getZ(i)-shoulder)*factor);
  a.needsUpdate=true;
  // Transform original smooth normals analytically instead of flat-shading the tube.
  const n=g.attributes.normal;
  if(n)for(let i=0;i<n.count;i++)if(a.getZ(i)>shoulder){
   const x=n.getX(i),y=n.getY(i),z=n.getZ(i)/factor,l=Math.hypot(x,y,z)||1;n.setXYZ(i,x/l,y/l,z/l);
  }
  if(n)n.needsUpdate=true;
  g.computeBoundingBox();g.computeBoundingSphere();
 }
 let end=0,rad=0;
 for(const g of tubes){
  g.computeBoundingBox();end=Math.max(end,g.boundingBox.max.z);
  const a=g.attributes.position;
  for(let i=0;i<a.count;i++)rad=Math.max(rad,Math.hypot(a.getX(i),a.getY(i)));
 }
 b.barrelLength=end||spec.dims.gunLen;b.barrelRadius=Math.max(0.12,rad);
 // Per-part bounds for the hull, retained as collision proxies for gun depression.
 b.gunHullBoxes=[];
 const pivotY=b.turretPos[1]+b.gunPos[1];
 const minY=pivotY-b.barrelLength*Math.sin(Math.min(45,spec.gunDepression)*Math.PI/180)-0.25;
 for(const [key,parts] of Object.entries(P.b))if(key.startsWith('hull|'))for(const g of parts){
  if(g.userData.flexible)continue;
  g.computeBoundingBox();const q=g.boundingBox;
  if(q&&q.max.y>minY)b.gunHullBoxes.push([q.min.x,q.max.x,q.min.z,q.max.z,q.max.y]);
 }
 b.gunClearance={original,front,pivot,shift};
}
// Conservative hull clearance: intersect the barrel's horizontal sweep with
// slightly expanded component AABBs. The solved elevation is a lower bound.
export function hullPitchFloor(b,yaw,minPitch,maxPitch){
 const sn=Math.sin(yaw),cs=Math.cos(yaw),p=b.gunPos,t=b.turretPos;
 const x=t[0]+p[0]*cs+p[2]*sn,z=t[2]-p[0]*sn+p[2]*cs,y=t[1]+p[1];
 const r=Math.min(0.35,b.barrelRadius)+0.025;
 let floor=minPitch;
 for(const q of b.gunHullBoxes){
  let lo=0.38,hi=b.barrelLength+MAX_RECOIL;
  for(const [origin,d,a,c] of [[x,sn,q[0]-r,q[1]+r],[z,cs,q[2]-r,q[3]+r]]){
   if(Math.abs(d)<1e-8){if(origin<a||origin>c){lo=1;hi=0;break;}}
   else{const u=(a-origin)/d,v=(c-origin)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}
  }
  if(lo>hi)continue;
  const h=q[4]+r-y;
  floor=Math.max(floor,Math.atan2(h,h>=0?lo:hi));
 }
 return clamp(floor,minPitch,maxPitch);
}
