// Draw and check the design sheet before exporting any model geometry.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { VX9 as d, HULL_PLAN, HULL_LOWER, HULL_UPPER, SKIRTS, TURRET_PLAN, TURRET_RING,
  TURRET_ARMOR, WHEEL_STATIONS } from './src/models/vx9Design.js';
import { mirrored, ring } from './tools_rear_turrets.mjs';

const file = new URL('./public/models/fleet/vx9-three-views.svg', import.meta.url);
const scale = 74;
const frontZ = d.hullLength / 2;
const muzzleZ = d.turretZ + d.trunnionZ + d.barrelLength;
const gunY = d.hullRoof + d.trunnionY;
const views = {
  front: { x: 219, y: 443, horizontal: [0, 1], vertical: [1, -1], depth: 2, label: 'Front' },
  right: { x: 890, y: 443, horizontal: [2, -1], vertical: [1, -1], depth: 0, label: 'Right side' },
  top: { x: 890, y: 717, horizontal: [2, -1], vertical: [0, 1], depth: 1, label: 'Top' },
};
const marks = {
  nose: [0, .93, frontZ],
  tail: [0, .93, -frontZ],
  left: [-d.hullWidth / 2, 1.25, -.3],
  right: [d.hullWidth / 2, 1.25, -.3],
  roof: [0, d.turretRoof, -.78],
  ground: [0, 0, -.78],
  pivot: [0, d.hullRoof, d.turretZ],
  muzzle: [0, gunY, muzzleZ],
  lampL: [-d.lamp[0], d.lamp[1], d.lamp[2]],
  lampR: d.lamp,
  intake: d.rearIntake,
};

const project = (p, view) => [view.x + p[view.horizontal[0]] * view.horizontal[1] * scale,
  view.y + p[view.vertical[0]] * view.vertical[1] * scale];
const faces = [];
function face(points, fill) { faces.push({ points, fill }); }
function rows(rings, fill) {
  face(rings.at(-1), fill);
  for (let level = 1; level < rings.length; level++) {
    const outer = rings[level], inner = rings[level - 1];
    for (let i = 0; i < outer.length; i++) {
      const next = (i + 1) % outer.length;
      face([inner[i], inner[next], outer[next], outer[i]], fill);
    }
  }
}
const ringSet = (profile, sections) => sections.map(section => ring(mirrored(profile), ...section));
function box([x,y,z], [w,h,l], fill) {
  const shell = height => [[x-w/2,height,z+l/2],[x+w/2,height,z+l/2],
    [x+w/2,height,z-l/2],[x-w/2,height,z-l/2]];
  rows([shell(y-h/2),shell(y+h/2)],fill);
}
function disc(center, radius, depth, axis, fill) {
  const circle = side => Array.from({length: 28}, (_, i) => {
    const p = [...center], angle = i * Math.PI / 14;
    p[axis] += side * depth / 2;
    p[(axis+1)%3] += Math.cos(angle) * radius;
    p[(axis+2)%3] += Math.sin(angle) * radius;
    return p;
  });
  const lo = circle(-1), hi = circle(1);
  rows([lo,hi],fill);
  face(lo,fill);
}
function lamp([x,y,z], width, height, sweep, tilt) {
  const c = Math.cos(sweep), s = Math.sin(sweep);
  const point = (u,v,depth=0) => [x+u*c+(depth*Math.cos(tilt)-v*Math.sin(tilt))*s,
    y+v*Math.cos(tilt)+depth*Math.sin(tilt),z-u*s+(depth*Math.cos(tilt)-v*Math.sin(tilt))*c];
  const w = width / 2, h = height / 2;
  const outline = [[-w,-h*.65],[-w*.87,-h],[w*.87,-h],[w,-h*.65],[w,h*.65],[w*.87,h],[-w*.87,h],[-w,h*.65]];
  rows([outline.map(([u,v])=>point(u*1.14,v*1.23,-.20)),outline.map(([u,v])=>point(u,v))],'#687987');
  face([[-w*.76,-h*.19],[w*.76,-h*.19],[w*.76,h*.19],[-w*.76,h*.19]].map(([u,v])=>point(u,v)), '#88cff1');
}
rows(ringSet(HULL_PLAN, HULL_LOWER), '#586774');
rows(ringSet(HULL_PLAN, HULL_UPPER), '#adb7bf');
for (const s of [-1,1]) {
  const path = (radius, width) => {
    const track = [];
    for (const z of [-1,1]) for (let i = 0; i <= 16; i++) {
      const angle = (i / 16 - .5) * Math.PI;
      track.push([s*d.trackX+width,d.trackY+z*Math.sin(angle)*radius,z*(d.trackEnd+Math.cos(angle)*radius)]);
    }
    return track;
  };
  const band = (outer, inner) => outer.forEach((p,i)=>{
    const j=(i+1)%outer.length;
    face([p,outer[j],inner[j],inner[i]],'#3f4d59');
  });
  const half = d.trackWidth / 2;
  band(path(d.trackRadius,half),path(d.trackRadius,-half));
  for (const x of [-half,half]) band(path(d.trackRadius,x),path(d.trackRadius-.073,x));
  for (const [index,z] of WHEEL_STATIONS.entries()) {
    const end = index === 0 || index === WHEEL_STATIONS.length - 1;
    const y = end ? .56 : .535;
    disc([s*(d.trackX+.254),y,z],end ? .43 : .477,.094,0,'#7b8791');
    disc([s*(d.trackX+.312),y,z],.172,.035,0,'#a3acb4');
  }
  for (const [i,panel] of SKIRTS.entries()) {
    face(panel.map(([z,y])=>[s*d.hullWidth/2,y,z]),i>3 || i===2 ? '#637280' : '#b9c2c8');
  }
  const [,y,z] = d.rearIntake;
  face([[y-.13,z-.23],[y+.13,z-.23],[y+.13,z+.23],[y-.13,z+.23]]
    .map(([y,z])=>[s*(d.hullWidth/2+.001),y,z]),'#354756');
  for (const dy of [-.08,-.04,0,.04,.08]) {
    face([[y+dy-.006,z-.216],[y+dy+.006,z-.216],[y+dy+.006,z+.216],[y+dy-.006,z+.216]]
      .map(([y,z])=>[s*(d.hullWidth/2+.002),y,z]),'#a2adb5');
  }
  lamp([s*d.lamp[0],d.lamp[1],d.lamp[2]],d.lampWidth,d.lampHeight,s*d.lampSweep,d.lampTilt);
}
const turret = sections => ringSet(TURRET_PLAN, sections)
  .map(row => row.map(([x,y,z])=>[x,y+d.hullRoof,z+d.turretZ]));
rows(turret(TURRET_RING), '#556471');
rows(turret(TURRET_ARMOR), '#a5b0b9');
for (const s of [-1,1]) {
  const [x,y,z] = d.turretLamp;
  lamp([s*x,y+d.hullRoof,z+d.turretZ],d.turretLampWidth,d.turretLampHeight,s*d.turretLampSweep,d.turretLampTilt);
  box([s*.98,d.hullRoof+1.21,d.turretZ-2.32],[.016,.94,.018],'#586774');
}
disc([.09,d.hullRoof+.90,d.turretZ-.75],.36,.054,1,'#8f9da6');
box([.62,d.hullRoof+1.235,d.turretZ-.48],[.265,.51,.25],'#778591');
box([-.41,d.hullRoof+1.09,d.turretZ-.18],[.55,.19,.62],'#7d8c96');
for (const [start,end,radius] of [[1.2,1.74,.275],[1.74,2.96,.205],[2.96,3.93,.167],[3.93,5.90,.139],[5.9,muzzleZ,.128]]) {
  disc([0,gunY,(start+end)/2],radius,end-start,2,'#637280');
}
disc([0,gunY,muzzleZ+.001],.081,.002,2,'#263745');

const fmt = number => Number(number.toFixed(4));
const text = (x,y,content,css='') => `<text x="${x}" y="${y}" class="${css}">${content}</text>`;
const line = (x1,y1,x2,y2,css,extra='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${css}" ${extra}/>`;
function dimension(x1, y1, x2, y2, label) {
  const x = (x1+x2)*.5, y = (y1+y2)*.5;
  return line(x1,y1,x2,y2,'dim','marker-start="url(#arrow)" marker-end="url(#arrow)"')
    + (x1 === x2 ? `<g transform="translate(${x-9} ${y}) rotate(-90)">${text(0,0,label,'measure')}</g>`
      : text(x,y-7,label,'measure'));
}

function drawingFor(view) {
  // Painter ordering uses the coordinate toward the observer, keeping the sheet strictly orthographic.
  const depth = face => face.points.reduce((sum,p)=>sum+p[view.depth],0)/face.points.length;
  return [...faces].sort((a,b)=>depth(a)-depth(b)).map(({points,fill}) => {
    const projected=points.map(p=>project(p,view).map(fmt));
    const area=projected.reduce((sum,[x,y],i)=>{
      const [nx,ny]=projected[(i+1)%projected.length];
      return sum+x*ny-nx*y;
    },0);
    if(Math.abs(area)<0.05)return '';
    return `<polygon points="${projected.map(p=>p.join(',')).join(' ')}" fill="${fill}"/>`;
  }).join('');
}

function sheet() {
  const right = views.right, front = views.front;
  const head = project(marks.nose,right)[0], tail = project(marks.tail,right)[0], tip = project(marks.muzzle,right)[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="1010" viewBox="0 0 1320 1010" role="img">
<title>VX-9 Aegis orthographic reference</title>
<desc>Front, right side and top views drawn at the same scale, with dimensions in metres.</desc>
<defs>
<pattern id="grid" width="37" height="37" patternUnits="userSpaceOnUse"><path d="M 37 0 H 0 V 37" fill="none" stroke="#e1e9ed" stroke-width="1"/></pattern>
<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 L2 4 Z" fill="#346678"/></marker>
<style>text{font:16px system-ui,sans-serif;fill:#203641}.title{font-size:39px;font-weight:700}.subtitle,.foot{fill:#526b76}.label{font-size:19px;font-weight:700;letter-spacing:.06em}.dim{stroke:#346678;stroke-width:1.3}.guide{stroke:#809aa5;stroke-width:1;stroke-dasharray:5 5}.ground{stroke:#8fa1aa;stroke-width:1}.measure{fill:#28566a;text-anchor:middle;font-weight:600;font-size:14px;paint-order:stroke;stroke:#f8fbfc;stroke-width:4px}.tiles polygon{stroke:#425564;stroke-width:.65;stroke-linejoin:round}</style>
</defs>
<path fill="#f8fbfc" d="M0 0H1320V1010H0Z"/><path fill="#264c5c" d="M0 0H1320V9H0Z"/>
${text(63,74,'VX-9 Aegis','title')}
${text(65,108,'Orthographic reference · Game model · Dimensions in metres','subtitle')}
<path fill="url(#grid)" d="M62 145H1258V892H62Z"/>
${line(head,206,head,861,'guide')}${line(tail,206,tail,861,'guide')}
${line(project(marks.pivot,right)[0],211,project(marks.pivot,right)[0],858,'guide')}
${line(75,443,1254,443,'ground')}${line(219,173,219,490,'guide')}
${Object.entries(views).map(([name,view])=>`<g id="${name}" class="tiles">${drawingFor(view)}</g>`).join('')}
${text(75,175,'FRONT','label')}${text(417,175,'RIGHT SIDE','label')}${text(417,560,'TOP','label')}
${dimension(head,475,tail,475,'8.96 m hull')}
${dimension(tip,510,tail,510,'10.70 m overall')}
${dimension(project(marks.left,front)[0],475,project(marks.right,front)[0],475,'3.78 m hull')}
${dimension(65,project(marks.roof,front)[1],65,front.y,'2.64 m turret roof')}
${line(415,940,415+148,940,'dim')}${[0,1,2].map(i=>line(415+74*i,934,415+74*i,946,'dim')).join('')}
${text(415,970,'0')}${text(485,970,'1')}${text(550,970,'2 m')}
${text(620,945,'Roof dimension excludes hatches, optics and antennas.','foot')}
<g display="none">
${Object.entries(views).flatMap(([name,view])=>Object.entries(marks).map(([mark,p])=>{
    const [x,y] = project(p,view).map(fmt);
    return `<circle data-view="${name}" data-mark="${mark}" cx="${x}" cy="${y}" r="0"/>`;
  })).join('')}
</g>
</svg>\n`;
}

function check(svg) {
  const seen = new Set();
  const matches = [...svg.matchAll(/data-view="(\w+)" data-mark="(\w+)" cx="([^"]+)" cy="([^"]+)"/g)];
  assert.equal(matches.length, Object.keys(views).length * Object.keys(marks).length);
  const axes = new Map();
  for (const [,view,mark,x,y] of matches) {
    assert.ok(!seen.has(view+'/'+mark));
    seen.add(view+'/'+mark);
    const {x:ox,y:oy,horizontal:[h,hs],vertical:[v,vs]} = views[view];
    for (const [axis,value] of [[h,(Number(x)-ox)/(hs*scale)],[v,(Number(y)-oy)/(vs*scale)]]) {
      assert.ok(Math.abs(value-marks[mark][axis]) < 0.000002);
      const key = mark+'/'+axis;
      if (axes.has(key)) assert.ok(Math.abs(axes.get(key)-value) < 0.000002);
      else axes.set(key,value);
    }
  }
  assert.ok(Math.abs(muzzleZ+frontZ-10.70)<1e-9);
  assert.equal(d.hullWidth,3.78);
  assert.equal(d.turretRoof,2.64);
  assert.equal(svg,sheet(),'The distributed views must match their design source');
  console.log(`Three orthographic views agree on ${Object.keys(marks).length} reference points and the shared dimensions.`);
}
if (process.argv.includes('--write')) {
  await writeFile(file,sheet());
  console.log('Generated the front, right-side and top orthographic views.');
}
check(await readFile(file,'utf8'));
