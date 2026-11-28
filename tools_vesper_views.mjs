import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { VESPER as d, VESPER_HULL, VESPER_HULL_RINGS, VESPER_TURRET, VESPER_TURRET_RINGS, VESPER_RAIL } from './src/models/vesperDesign.js';
import { mirrored, ring } from './tools_rear_turrets.mjs';

const file = new URL('./public/models/fleet/vesper48-three-views.svg',import.meta.url);
const scale = 87;
const end = d.hullLength / 2, gunY=d.hullRoof+d.gunY, muzzle=d.turretZ+d.gunZ+d.barrelLength;
const views = {
  front: { center: [213,448], axes: [[0,1],[1,-1]], depth: 2 },
  right: { center: [884,448], axes: [[2,-1],[1,-1]], depth: 0 },
  top: { center: [884,711], axes: [[2,-1],[0,1]], depth: 1 },
};
const marks = {
  nose: [0,.86,end], tail: [0,.86,-end], outerL: [-d.hullWidth/2,.86,0],outerR: [d.hullWidth/2,.86,0],
  pivot:[0,d.hullRoof,d.turretZ], muzzle:[0,gunY,muzzle], roof:[0,d.turretRoof,d.turretZ-.8],
  lowerTrack:[d.trackX,d.trackY-d.trackRadius,0],
  ...Object.fromEntries(d.lightsX.map((x,i)=>['lamp'+i,[x,d.lightsY,d.lightsZ]])),
};
const surfaces=[];
function face(p,c){surfaces.push({p,c});}
function sides(rows,color,cap=true){
  if(cap)face(rows.at(-1),color);
  for(let i=1;i<rows.length;i++)for(let j=0;j<rows[i].length;j++){
    const k=(j+1)%rows[i].length;
    face([rows[i-1][j],rows[i-1][k],rows[i][k],rows[i][j]],color);
  }
}
function box([x,y,z],[w,h,l],c){
  const quad=h=>[[x-w/2,h,z-l/2],[x+w/2,h,z-l/2],[x+w/2,h,z+l/2],[x-w/2,h,z+l/2]];
  sides([quad(y-h/2),quad(y+h/2)],c);
  face(quad(y-h/2),c);
}
function disc(center, radius, depth, axis, color){
  const row = sign=>Array.from({length:24},(_,i)=>{
    const p=[...center],angle=i*Math.PI/12;
    p[axis]+=sign*depth/2;p[(axis+1)%3]+=Math.cos(angle)*radius;p[(axis+2)%3]+=Math.sin(angle)*radius;
    return p;
  });
  sides([row(-1),row(1)],color);
  face(row(-1),color);
}
sides(VESPER_HULL_RINGS.map(r=>ring(mirrored(VESPER_HULL),...r)),'#67777d');
sides(VESPER_TURRET_RINGS.map(r=>ring(mirrored(VESPER_TURRET),...r).map(([x,y,z])=>[x,y+d.hullRoof,z+d.turretZ])),'#51636d');
disc([0,d.hullRoof+.24,d.turretZ],.46,.48,1,'#667b84');
for(const s of [-1,1]){
  const loop=(radius,width)=>[-1,1].flatMap(z=>Array.from({length:13},(_,i)=>{
    const a=(i/12-.5)*Math.PI;
    return [s*d.trackX+width,d.trackY+z*radius*Math.sin(a),z*(d.trackEnd+radius*Math.cos(a))];
  }));
  const inner=loop(d.trackRadius,-d.trackWidth/2),outer=loop(d.trackRadius,d.trackWidth/2);
  sides([inner,outer],'#39484d',false);
  for(const w of [-d.trackWidth/2,d.trackWidth/2])sides([loop(d.trackRadius-.065,w),loop(d.trackRadius,w)],'#39484d',false);
  for(const z of [-d.trackEnd,...d.roadWheels,d.trackEnd]){
    disc([s*(d.trackX+.226),.415,z],.36,.054,0,'#74868a');
    disc([s*(d.trackX+.253),.415,z],.152,.035,0,'#a3adb2');
  }
  for(const [a,b] of [[-2.66,-1.16],[-1.13,.68],[.72,2.58]]) {
    const z=(a+b)/2,l=b-a;
    box([s*1.47,.89,z],[.18,.25,l],'#788a91');
  }
  for(const z of [-1.65,.86]){
    face([[s*1.56,.99,z],[s*1.56,.99,z+.32],[s*1.56,.86,z+.08],[s*1.56,.86,z-.25]],'#ba6952');
  }
  const rail = VESPER_RAIL.map(([x,z])=>[s*x,gunY-.135,d.turretZ+d.gunZ+z]);
  sides([rail,rail.map(([x,y,z])=>[x,y+.255,z])],'#4c5960');
  disc([s*1.03,1.25,.50],.105,.13,2,'#cb594e');
}
for(const x of d.lightsX)disc([x,d.lightsY,d.lightsZ],.09,.19,2,'#efdfbe');
box([0,1.44,1.96],[.36,.26,.36],'#6b7379');
box([0,1.453,2.152],[.16,.153,.024],'#d66052');
box([.38,2.514,.43],[.34,.15,.40],'#65777d');
disc([.38,2.743,.46],.23,.39,2,'#65777d');
disc([.38,2.743,.669],.17,.013,2,'#eee6c5');
disc([-.31,2.523,.76],.147,.30,2,'#819297');
for(const [a,b,r] of [[.77,2.74,.17],[2.74,3.59,.156],[3.59,4.83,.106],[4.83,muzzle,.133]]){
  disc([0,gunY,(a+b)/2],r,b-a,2,'#53666d');
}
disc([0,gunY,muzzle+.001],.066,.002,2,'#243740');
box([1.04,2.50,-2.41],[.021,1.27,.025],'#566970');
const fmt=x=>+x.toFixed(4);
const project=(p,{center,axes})=>axes.map(([axis,sign],i)=>fmt(center[i]+p[axis]*sign*scale));
const texts=(x,y,text,style='')=>`<text x="${x}" y="${y}" class="${style}">${text}</text>`;
function paint(view) {
  const z=f=>f.p.reduce((a,p)=>a+p[view.depth],0)/f.p.length;
  return [...surfaces].sort((a,b)=>z(a)-z(b)).map(({p,c})=>{
    const points=p.map(v=>project(v,view));
    const area=points.reduce((a,[x,y],i)=>{const [nx,ny]=points[(i+1)%points.length];return a+x*ny-nx*y;},0);
    return Math.abs(area)>.075?`<polygon points="${points.map(v=>v.join(',')).join(' ')}" fill="${c}"/>`:'';
  }).join('');
}
const vertical=(x,y1,y2)=>`<path class="guide" d="M${x} ${y1}V${y2}"/>`;
const measure=(x1,x2,y,label)=>`<path class="dim" d="M${x1} ${y}H${x2}" marker-start="url(#arr)" marker-end="url(#arr)"/>${texts((x1+x2)/2,y-7,label,'measure')}`;
const nose=project(marks.nose,views.right)[0], tail=project(marks.tail,views.right)[0],tip=project(marks.muzzle,views.right)[0];
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1260" height="960" viewBox="0 0 1260 960">
<title>Vesper-48 · Orthographic game design</title>
<defs><pattern id="grid" width="43.5" height="43.5" patternUnits="userSpaceOnUse"><path d="M43.5 0H0V43.5" fill="none" stroke="#dfe8e9"/></pattern><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8L2 4Z" fill="#27606a"/></marker>
<style>text{font:16px system-ui,sans-serif;fill:#233842}.title{font-size:43px;font-weight:700}.sub{fill:#516c74}.label{font-size:19px;font-weight:700;letter-spacing:.06em}.measure{text-anchor:middle;fill:#235359;font-size:14px;font-weight:600;paint-order:stroke;stroke:#f6f9f9;stroke-width:4px}.guide{fill:none;stroke:#9bb2b6;stroke-dasharray:5 5}.dim{fill:none;stroke:#27606a;stroke-width:1.25}.model polygon{stroke:#34464e;stroke-width:.55;stroke-linejoin:round}</style></defs>
<path fill="#f6f9f9" d="M0 0H1260V960H0Z"/><path fill="#294a51" d="M0 0H1260V10H0Z"/>
${texts(62,75,d.name,'title')}${texts(65,110,'Light tank · Orthographic game design · Dimensions in metres','sub')}
<path fill="url(#grid)" d="M64 142H1194V865H64Z"/>
${vertical(nose,178,856)}${vertical(tail,178,856)}${vertical(project(marks.pivot,views.right)[0],190,856)}${vertical(213,176,483)}
<path stroke="#8fa2a9" d="M65 448H1195"/>
${Object.entries(views).map(([name,v])=>`<g class="model" id="${name}">${paint(v)}</g>`).join('')}
${texts(77,168,'FRONT','label')}${texts(434,168,'RIGHT SIDE','label')}${texts(434,575,'TOP','label')}
${measure(project(marks.outerL,views.front)[0],project(marks.outerR,views.front)[0],486,'3.16 m')}
${measure(nose,tail,486,'6.20 m hull')}${measure(tip,tail,528,'8.28 m overall')}
<path class="dim" d="M434 898h174m-174 -6v12m87 -12v12m87 -12v12"/>
${texts(431,928,'0')}${texts(517,928,'1')}${texts(596,928,'2 m')}
${texts(675,899,'2.51 m armored turret roof · 2.98 m searchlight assembly','sub')}
<a href="${d.source}">${texts(675,928,'Visual reference · Light tank concept by Encho Enchev','sub')}</a>
<g display="none">${Object.entries(views).flatMap(([view,v])=>Object.entries(marks).map(([mark,p])=>{
const [x,y]=project(p,v);return `<circle data-view="${view}" data-mark="${mark}" cx="${x}" cy="${y}" r="0"/>`;
})).join('')}</g></svg>\n`;

if(process.argv.includes('--write')) await writeFile(file,svg);
const checked=await readFile(file,'utf8');
assert.equal(checked,svg,'Published drawing does not match the vehicle design');
const axes = new Map();
const marksInSheet=[...checked.matchAll(/data-view="(\w+)" data-mark="(\w+)" cx="([^"]+)" cy="([^"]+)"/g)];
assert.equal(marksInSheet.length,Object.keys(marks).length*3);
for(const [,view,mark,x,y] of marksInSheet){
  const {axes:projections,center}=views[view];
  for(const [i,coordinate] of [x,y].entries()){
    const [axis,sign]=projections[i],value=(Number(coordinate)-center[i])/(sign*scale),key=mark+'/'+axis;
    assert.ok(Math.abs(value-marks[mark][axis])<.000002);
    if(axes.has(key))assert.ok(Math.abs(value-axes.get(key))<.000002);
    axes.set(key,value);
  }
}
assert.ok(Math.abs(end+muzzle-8.28)<1e-9);
console.log(`Vesper-48 front, right and top views agree at ${Object.keys(marks).length} shared datums.`);
