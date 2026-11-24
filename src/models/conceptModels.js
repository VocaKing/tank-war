// Distinct procedural fallback meshes for the fictional concept fleet.
// This is not a reskin: each profile, turret style and identifying equipment is authored here.
// The Blender scripts produce separately editable higher-detail assets.
import * as THREE from 'three';
import { T, box, cylY, cylZ, sideExtrude, topExtrude, taper, Parts } from './geom.js';
import * as K from './kit.js';

function wheels(d,id) {
  const count = ['aegis140','warden130','leviathan160','thunderclad155','cerberus135'].includes(id) ? 7 : 6;
  const radius = id==='raptor90' ? 0.24 : id==='leviathan160' ? 0.37 : 0.31;
  const z0=-d.L*0.38,z1=d.L*0.39;
  const w=Array.from({length:count},(_,i)=>({z:z0+(z1-z0)*i/(count-1),y:radius+0.09,r:radius,w:d.trackW*0.78}));
  const sprockets=[{z:-d.L/2+0.42,y:radius+0.13,r:radius*1.07}];
  const idlers=[{z:d.L/2-0.42,y:radius+0.13,r:radius*1.02}];
  const rollers=[{z:-d.L*0.22,y:radius*2+0.22,r:0.10},{z:0,y:radius*2+0.22,r:0.10},{z:d.L*0.22,y:radius*2+0.22,r:0.10}];
  return {wheels:w,sprockets,idlers,rollers};
}
function wedge(P,d,low=false) {
  const L=d.L/2,H=d.hullH,ground=d.clearance;
  const prof=[[-L+0.16,ground],[L-0.32,ground],[L,ground+0.44],
    [L-(low?1.85:1.45),H],[-L+0.38,H],[-L+0.05,H-0.30],[-L+0.15,ground+0.12]];
  P.add('hull','paint',sideExtrude(prof,d.W-2*d.trackW+0.05,0,0.025));
  P.add('hull','paint',sideExtrude(prof.map(([z,y])=>[z,Math.max(y,H-0.58)]),d.W-0.08,0,0.02));
}
function turretShell(P,d,style) {
  const tw=d.turretW/2,tl=d.turretL/2,bz=d.turretBoxZ||0,h=d.turretH;
  if(style==='open') {
    P.add('turret','metal',box(tw*1.70,0.07,tl*1.65,0,0.14,bz));
    for(const s of [-1,1]) {
      P.add('turret','paint',box(0.11,h*0.78,tl*1.60,s*tw*0.88,h*0.42,bz));
      P.add('turret','metal',box(0.06,h*0.42,0.13,s*tw*0.84,h*0.89,bz+tl*0.35));
    }
    P.add('turret','paint',box(tw*1.82,h*0.8,0.16,0,h*0.48,bz+tl*0.87));
    P.add('turret','dark',box(tw*1.26,0.04,tl*1.3,0,0.23,bz-0.05));
    return;
  }
  if(style==='casemate') {
    const p=[[-tw,bz-tl],[tw,bz-tl],[tw*0.94,bz+tl*0.25],[tw*0.48,bz+tl],[-tw*0.48,bz+tl],[-tw*0.94,bz+tl*0.25]];
    P.add('turret','paint',taper(topExtrude(p,h,0,0.04,2),0,h,0.83,0.88,bz));
    return;
  }
  const nose=style==='wedge'?0.38:style==='artillery'?0.76:0.65;
  const tail=style==='artillery'?1.12:0.94;
  const pts=[[-tw*0.52,bz+tl*nose],[tw*0.52,bz+tl*nose],
    [tw,bz+tl*(nose-0.36)],[tw,bz-tl*tail],
    [-tw,bz-tl*tail],[-tw,bz+tl*(nose-0.36)]];
  P.add('turret','paint',taper(topExtrude(pts,h,0,0.03,2),0,h,style==='artillery'?0.96:0.83,0.91,bz));
  if(style==='wedge') for(const s of [-1,1]){
    P.add('turret','paint',T(box(tw*0.77,h*0.70,tl*0.72,s*tw*0.47,h*0.42,bz+tl*0.46,0,s*0.27),0,0,0));
  }
}
function baseEquipment(P,d,vehicle) {
  const H=d.hullH,L=d.L/2,tx=d.W/2;
  for(const s of [-1,1]) {
    P.add('hull','metal',box(0.06,0.38,d.L*0.80,s*(tx+0.02),H-0.12,-0.05));
    K.headlight(P,'hull',s*(tx-0.22),H+0.03,L-0.75);
    K.towCable(P,'hull',s*(tx-0.36),H+0.07,-L+0.62,-0.25,0.09);
  }
  for(let i=0;i<8;i++) P.add('hull','dark',box(1.35,0.017,0.055,0,H+0.014,-L+0.62+i*0.16));
  K.periscope(P,'hull',-0.45,H+0.05,L-1.76,0,0.9);
  const th=d.turretH,tz=d.turretBoxZ||0;
  if(!vehicle.openTop) {
    K.hatch(P,'turret',-d.turretW*0.21,th,tz-0.52,0.30);
    K.periscope(P,'turret',d.turretW*0.2,th+0.03,tz+0.26,0,1.15);
  }
  K.antenna(P,'turret',-d.turretW*0.36,th,tz-d.turretL*0.27,1.8);
}
function identify(P,d,id) {
  const L=d.L/2,H=d.hullH,tw=d.turretW/2,th=d.turretH,tz=d.turretBoxZ||0;
  if(id==='aegis140') {
    for(const s of [-1,1]) {
      P.add('turret','metal',box(0.44,0.20,0.60,s*tw*0.68,th+0.08,tz+0.6)); // APS launchers
      P.add('turret','glass',box(0.18,0.10,0.19,s*tw*0.61,th+0.22,tz+0.8));
    }
    P.add('turret','dark',box(0.80,0.30,0.62,0,th+0.08,tz-0.6));
  } else if(id==='bastion125') {
    K.slatCage(P,'turret',-tw*0.99,tw*0.99,0.14,th*0.95,tz-d.turretL*0.66,12);
    for(const s of [-1,1])K.smokeDischargers(P,'turret',s*tw*0.82,th*0.84,tz+0.8,s*1.3,6);
    P.add('turret','metal',box(tw*1.6,0.10,0.75,0,0.2,tz-d.turretL*0.59));
  } else if(id==='harrier105'||id==='raptor90') {
    P.add('gun','metal',box(0.74,0.80,0.12,0,0.08,0.15)); // exposed gun shield
    P.add('turret','dark',box(0.72,0.22,0.52,0,0.38,tz-0.42)); // exposed breech
    for(const s of [-1,1]){
      P.add('turret','metal',cylY(0.13,0.16,16,s*0.62,0.30,tz-0.40));
      P.add('turret','glass',box(0.18,0.20,0.07,s*0.63,th*0.80,tz+0.57));
    }
    if(id==='raptor90') {
      P.add('turret','metal',box(0.44,0.40,0.42,tw*0.70,th*0.96,tz+0.18));
      P.add('turret','glass',box(0.28,0.22,0.04,tw*0.70,th*1.00,tz+0.42));
    }
  } else if(id==='warden130') {
    for(const s of [-1,1])P.add('hull','metal',box(0.08,0.68,1.24,s*(d.W/2-0.22),H-0.21,L-1.20));
    P.add('turret','dark',box(1.02,0.34,0.40,0,0.42,tz+d.turretL*0.46));
  } else if(id==='lancer120') {
    for(const s of [-1,1])P.add('turret','paint',box(0.32,0.44,1.20,s*(tw*0.90),th*0.60,tz-0.45));
    P.add('turret','metal',box(0.44,0.16,0.50,0,th+0.08,tz+0.36));
  } else if(id==='leviathan160') {
    // Two large curved dozer cheeks and two visible hydraulic pistons.
    P.add('hull','paint',box(d.W*1.06,0.70,0.18,0,0.48,L+0.14,-0.26));
    for(const s of [-1,1]){
      P.add('hull','metal',box(0.16,0.17,0.96,s*d.W*0.35,0.64,L-0.18,-0.22));
      P.add('hull','metal',box(0.14,0.60,0.13,s*d.W*0.51,0.53,L+0.28,0,s*0.15));
    }
  } else if(id==='thunderclad155') {
    for(const s of [-1,1]){
      P.add('turret','metal',box(0.16,0.64,1.2,s*(tw+0.03),th*0.54,tz-0.4));
      P.add('turret','paint',box(0.55,0.47,0.53,s*tw*0.55,th+0.13,tz-0.8));
    }
  } else if(id==='tempest155') {
    for(const s of [-1,1]) {
      P.add('turret','metal',box(0.11,0.45,1.4,s*(tw+0.03),0.42,tz-d.turretL*0.37));
      P.add('hull','metal',box(0.12,0.35,0.74,s*d.W*0.33,0.62,-L+0.4));
    }
    P.add('turret','glass',box(0.52,0.24,0.08,0,th+0.16,tz+0.1));
  } else if(id==='cerberus135') {
    for(const s of [-1,1]) {
      P.add('turret','dark',box(0.37,0.23,0.33,s*(tw*0.77),th+0.19,tz+0.45));
      P.add('turret','glass',box(0.22,0.12,0.09,s*(tw*0.77),th+0.29,tz+0.57));
    }
    P.add('turret','paint',box(tw*1.55,0.32,0.46,0,th+0.05,tz-0.84));
  }
}
export function buildConceptModel(d,spec) {
  const P=new Parts(),id=spec.id,g=wheels(d,id),L=d.L/2,H=d.hullH;
  wedge(P,d,id==='warden130'||id==='lancer120');
  const role=spec.openTop?'open':spec.casemate?'casemate':spec.artillery?'artillery':id==='aegis140'?'wedge':'standard';
  turretShell(P,d,role);
  baseEquipment(P,d,spec); identify(P,d,id);
  const gunR=spec.shells[0].caliber/1150;
  P.add('gun','paint',box(0.66,0.58,0.58,0,0,0));
  K.barrel(P,'barrel',d.gunLen,{r0:gunR*1.28,r1:gunR*0.78,sleeve:5,
    ...(spec.artillery ? {evac:{z:d.gunLen*0.56,r:gunR*1.3,len:0.62}} : {brake:{type:'double',r:gunR*1.33,len:0.44}})});
  return {P,...g,wheelType:id==='raptor90'?'single':'modern',cast:0.15,castTurret:0.10,
    turretPos:[0,H,d.turretZ],gunPos:[0,Math.max(0.25,d.turretH*0.48),(d.turretBoxZ||0)+d.turretL*0.44],
    decals:[],conceptShape:role};
}
