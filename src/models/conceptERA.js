// Coordinate-locked ERA tile layout: the same authored tile coordinates are used
// by hit detection and by the InstancedMesh visualisation. No permanent ERA bonus.
import * as THREE from 'three';

function bounds(spec,group) {
  const d=spec.dims, turret=group.part==='turret';
  const width=turret?d.turretW:d.W, height=turret?d.turretH:d.hullH;
  const length=turret?d.turretL:d.L;
  return {
    crossMin:-width*0.43,crossMax:width*0.43,
    yMin:turret?0.08:Math.min(0.63,height*0.40),
    yMax:turret?height*0.88:height*0.95,
    zMin:-length*0.36,zMax:length*0.37,
  };
}
function groups(spec) {
  return Array.isArray(spec.eraLayout)?spec.eraLayout:[];
}
export function findEraTile(spec,hit) {
  if(!hit || !groups(spec).length) return null;
  for(const [groupIndex,g] of groups(spec).entries()) {
    if(g.part!==hit.part||g.face!==hit.face)continue;
    const b=bounds(spec,g), side=g.face==='side'?(hit.sideSign>0?1:-1):0;
    const horizontal=g.face==='side'?hit.local.z:hit.local.x;
    const lo=g.face==='side'?b.zMin:b.crossMin;
    const hi=g.face==='side'?b.zMax:b.crossMax;
    const u=(horizontal-lo)/(hi-lo),v=(hit.local.y-b.yMin)/(b.yMax-b.yMin);
    if(u<0||u>=1||v<0||v>=1)continue;
    const col=Math.floor(u*g.cols),row=Math.floor(v*g.rows);
    return {key:`${groupIndex}:${side}:${row}:${col}`,group:g,row,col,side};
  }
  return null;
}
const zero=new THREE.Matrix4().makeScale(0,0,0);
export function useEraTile(model,key) {
  const item=model.eraMeshes?.get(key);
  if(!item)return;
  item.mesh.setMatrixAt(item.index,zero);
  item.mesh.instanceMatrix.needsUpdate=true;
}
export function createEraVisuals(spec,body,turret) {
  const byKey=new Map();
  const d=spec.dims;
  for(const [groupIndex,g] of groups(spec).entries()) {
    const b=bounds(spec,g), front=g.face==='front';
    if(!front&&g.face!=='side')continue;
    const faces=front?[0]:[-1,1];
    for(const side of faces) {
      const width=front?b.crossMax-b.crossMin:b.zMax-b.zMin;
      const height=b.yMax-b.yMin;
      const tileW=width/g.cols,tileH=height/g.rows;
      const geo=new THREE.BoxGeometry(front?tileW*0.94:0.095,tileH*0.91,front?0.12:tileW*0.94);
      const mat=new THREE.MeshStandardMaterial({color:spec.id==='bastion125'?0x6b715d:0x65715a,roughness:0.74,metalness:0.46});
      const mesh=new THREE.InstancedMesh(geo,mat,g.cols*g.rows);
      mesh.name=`ERA_${g.part}_${g.face}_${side}_${groupIndex}`;
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
      const parent=g.part==='turret'?turret:body;
      parent.add(mesh);
      const yaw=front?0:0;
      let n=0;
      for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++) {
        const y=b.yMin+(r+0.5)*tileH;
        const x=front?b.crossMin+(c+0.5)*tileW:side*(g.part==='turret'?d.turretW/2+0.10:d.W/2+0.065);
        const z=front?(g.part==='turret'?(d.turretBoxZ||0)+d.turretL*0.42:d.L*0.46)
          :b.zMin+(c+0.5)*tileW;
        const transform=new THREE.Matrix4().makeTranslation(x,y,z);
        mesh.setMatrixAt(n,transform);
        const key=`${groupIndex}:${side}:${r}:${c}`;
        byKey.set(key,{mesh,index:n});
        n++;
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  return byKey;
}
