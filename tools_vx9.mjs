// Build the VX-9 game asset from its orthographic views, in metres with +Z forward.
// Reuse the existing animated shoe hardware and surface textures.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CylinderGeometry, LatheGeometry, TorusGeometry, Vector2, Vector3, ShapeUtils, BufferGeometry, Float32BufferAttribute } from 'three';
import { ModelParts, appendParts, parseGlb, serializeGlb, compactAsset, loft, ring, mirrored, plate, plateOutline } from './tools_rear_turrets.mjs';

import { VX9 as d, HULL_PLAN, HULL_LOWER, HULL_UPPER, SKIRTS, TURRET_PLAN, TURRET_RING,
  TURRET_ARMOR, WHEEL_STATIONS } from './src/models/vx9Design.js';

const id = 'aegis140';
const revision = '2026-11-vx9-orthographic';
const file = new URL('public/models/fleet/aegis140.glb', import.meta.url);
const front = new Vector3(0, 0, 1);
const { hullRoof, turretZ, trunnionZ, trackX, barrelLength: muzzleZ } = d;
const loftProfile = (outline, sections) => loft(sections.map(section => ring(outline, ...section)));
let seed = 91231;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;

function bolt(parts, location, direction = front, size = 0.026) {
  parts.round('dark', location, size * 1.23, 0.017, { direction, segments: 10, tint: 0.8 });
  parts.round('steel', location.map((v, i) => v + direction.getComponent(i) * 0.013),
    size * 0.77, 0.019, { direction, segments: 6, tint: 0.68 + random() * 0.28 });
}

function sidePlate(parts, s, mat, plan, xInner, xOuter, inset = 0.05, opening) {
  const toLocal = ([z, y]) => [-s * y, z];
  const outline = plan.map(toLocal);
  if (s === 1) outline.reverse();
  parts.add(mat, plate(outline, xInner, xOuter, inset, 0, opening?.map(toLocal)).rotateZ(-s * Math.PI / 2));
}

function graphic(parts, material, plan, place) {
  const vectors = plan.map(([a, b]) => new Vector2(a, b));
  const positions = plan.flatMap(([a, b]) => place(a, b));
  const mesh = new BufferGeometry();
  mesh.setAttribute('position', new Float32BufferAttribute(positions, 3));
  mesh.setIndex(ShapeUtils.triangulateShape(vectors, []).flat());
  mesh.computeVertexNormals();
  parts.add(material, mesh);
}

const glyphs = {
  V: [[0,1],[.23,1],[.5,.24],[.77,1],[1,1],[.61,0],[.39,0]],
  X: [[0,1],[.25,1],[.5,.68],[.75,1],[1,1],[.64,.5],[1,0],[.75,0],[.5,.32],[.25,0],[0,0],[.36,.5]],
  '-': [[0,.43],[1,.43],[1,.58],[0,.58]],
};
function stencil(parts, side, x, y, z) {
  for (const [index, char] of [...'VX-9'].entries()) {
    const offset = (1.5 - index) * 0.192;
    const transform = (a, b) => [side * x, y + b * 0.205, z + side * (offset - a * 0.144)];
    if (char === '9') {
      for (const [u, v, w, h] of [[0,.82,1,.18],[0,.43,1,.18],[0,.61,.19,.21],[.8,.18,.2,.64],[.25,0,.75,.18]])
        graphic(parts, 'ivory', [[u,v],[u+w,v],[u+w,v+h],[u,v+h]], transform);
    } else graphic(parts, 'ivory', glyphs[char], transform);
  }
}

function frontFrame(x, y, z, yaw = 0, pitch = 0) {
  const sx = Math.sin(yaw), cz = Math.cos(yaw), tilt = Math.sin(pitch), rise = Math.cos(pitch);
  return (u, v, d) => [x + u * cz + (d * rise - v * tilt) * sx,
    y + v * rise + d * tilt, z - u * sx + (d * rise - v * tilt) * cz];
}

// A single wraparound surround seats below the armour surface. Its opening
// rolls into a recessed liner, with the lens or grille behind the painted lip.
function chamferedOutline(width, height, slant = 0) {
  const x = width * .5, y = height * .5, bevel = Math.min(width * .11, height * .21);
  return [[-x+bevel,-y],[x-bevel,-y],[x,-y+bevel],[x,y-bevel],
    [x-bevel,y],[-x+bevel,y],[-x,y-bevel],[-x,-y+bevel]]
    .map(([u,v]) => [u+v*slant,v]);
}

// A single wraparound surround seats below the armour surface. Its opening
// rolls into a recessed liner, with the lens or grille behind the painted lip.
function recess(parts, place, { width, height, seat, depth, paint = 'graphite', slant = 0 }) {
  const outline = (w,h) => chamferedOutline(w,h,slant);
  const rear = outline(width * 1.14, height * 1.23);
  const shoulder = outline(width, height);
  const lip = outline(width * .92, height * .89);
  const opening = outline(width * .82, height * .61);
  const well = outline(width * .75, height * .49);
  function band(material, lower, lowerDepth, upper, upperDepth) {
    const vertices = [...lower.flatMap(([u,v]) => place(u,v,lowerDepth)),
      ...upper.flatMap(([u,v]) => place(u,v,upperDepth))];
    const indices = [];
    for (let i = 0; i < lower.length; i++) {
      const next = (i + 1) % lower.length;
      indices.push(i,next,next+lower.length,i,next+lower.length,i+lower.length);
    }
    const mesh = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices,3));
    mesh.setIndex(indices);
    const flat = mesh.toNonIndexed();
    flat.computeVertexNormals();
    parts.add(material,flat);
  }
  band(paint,rear,-seat,shoulder,-depth*.29);
  band(paint,shoulder,-depth*.29,lip,0);
  band(paint,lip,0,opening,0);
  band('dark',opening,0,well,-depth);
  graphic(parts,'black',well,(u,v)=>place(u,v,-depth));
  return outline;
}

function grille(parts, [x, y, z], width, height, orientation, count) {
  const side = Math.sign(x);
  const onSide = orientation === 'side';
  const onRoof = orientation === 'roof';
  const place = (u, v, d) => onSide ? [x + side * d, y + v, z - side * u]
    : onRoof ? [x + u, y + d, z - v] : [x - u, y + v, z - d];
  recess(parts, place, { width, height, seat: .125, depth: .028 });
  const widthOpen = width * .73, heightOpen = height * .47;
  for (let i = 0; i < count; i++) {
    const y = ((i + .5) / count - .5) * heightOpen;
    const half = heightOpen / (count * 5.1);
    graphic(parts, i % 3 ? 'dark' : 'steel', [[-widthOpen/2,y-half],[widthOpen/2,y-half],
      [widthOpen/2,y+half],[-widthOpen/2,y+half]], (u,v) => place(u,v,-.017 + (v-y)*.45));
  }
  for (const x of [-.255,0,.255]) {
    graphic(parts, 'graphite', [[x*width-.007,-heightOpen/2],[x*width+.007,-heightOpen/2],
      [x*width+.007,heightOpen/2],[x*width-.007,heightOpen/2]], (u,v) => place(u,v,-.009));
  }
}

function lamp(parts, center, width, height, yaw, pitch, paint) {
  const place = frontFrame(...center, yaw, pitch);
  const outline = recess(parts, place, { width, height, seat: .205, depth: .056, paint, slant: .18 });
  graphic(parts, 'blue', outline(width * .725, height * .31), (u,v) => place(u,v,-.050));
  graphic(parts, 'light', outline(width * .678, height * .158), (u,v) => place(u,v,-.048));
}

function visor(parts, center, width, height, yaw = 0, pitch = 0.12) {
  const place = frontFrame(...center, yaw, pitch);
  const outline = recess(parts, place, { width, height, seat: .145, depth: .036, slant: .15 });
  graphic(parts, 'optic', outline(width * .60, height * .41), (u,v) => place(u-.018,v,-.033));
  graphic(parts, 'dark', outline(width * .044, height * .44), (u,v) => place(u + width*.22,v,-.031));
}

function towPoint(parts, x, y, z, end) {
  const lugs = z - end * .068;
  for (const s of [-1,1]) {
    const center = [x + s*.067,y+.11,lugs];
    parts.plate('graphite', plateOutline(center[0],center[2],.09,.27,.037),y+.032,y+.176,.15);
  }
  parts.rail('steel',[x-.103,y+.11,z],[x+.103,y+.11,z],.026,10);
  parts.add('steel',new TorusGeometry(.099,.022,8,18).translate(x,y+.014,z),.71);
}

function chipMarks(parts, side, x, y0, y1, z0, z1, count) {
  const n = new Vector3(side,0,0);
  for (let i=0;i<count;i++) {
    const z = lerp(z0,z1,random()), y = lerp(y0,y1,random());
    const w = .008 + random()*.027;
    parts.box(i%5 ? 'chip' : 'steel', [side*x,y,z], [.0016,w*.45,w], 0, .62+random()*.35);
    if (i%6===0) parts.round('chip', [side*x,y-.022,z], .006, .001, { direction:n, segments:5 });
  }
}

function chassis() {
  const b = new ModelParts();
  const plan = mirrored(HULL_PLAN);
  b.add('dark', loftProfile(plan,HULL_LOWER));
  b.add('gray', loftProfile(plan,HULL_UPPER));
  const [intakeX,intakeY,intakeZ] = d.rearIntake;
  const intakeOpening = chamferedOutline(d.rearIntakeWidth*.83,d.rearIntakeHeight*.63)
    .map(([u,v]) => [intakeZ+u,intakeY+v]);
  const deck = plateOutline(0, 0.45, 2.33, 7.08, .22);
  b.plate('graphite',deck,1.689,1.743,.025);
  b.round('black',[0,1.746,turretZ],1.12,.048,{segments:36});
  b.round('steel',[0,1.765,turretZ],1.04,.044,{segments:42,tint:.67});

  for (const s of [-1,1]) {
    const outward = new Vector3(s,0,0);
    // Seven deep double-rimmed road wheels and two raised end hubs.
    for (const [i,z] of WHEEL_STATIONS.entries()) {
      const end = i===0 || i===8, y = end ? .56 : .535, r = end ? .43 : .477;
      const offset = end ? .01 : 0, face = s*(trackX+.251+offset);
      b.round('rubber',[s*trackX,y,z],r,.49,{direction:outward,segments:30});
      b.round('wheel',[s*(trackX+.213),y,z],r*.91,.080,{direction:outward,segments:30,top:r*.86});
      b.round('dark',[face,y,z],r*.68,.038,{direction:outward,segments:28,top:r*.65});
      b.round('wheel',[s*(Math.abs(face)+.026),y,z],r*.48,.076,{direction:outward,top:r*.38,segments:22});
      b.round('steel',[s*(Math.abs(face)+.076),y,z],r*.229,.048,{direction:outward,top:r*.84*.229,segments:16});
      b.add('steel',new TorusGeometry(r*.778,.012,6,28).rotateY(Math.PI/2).translate(face,y,z),.72);
      for (let k=0;k<10;k++) {
        const a=k*Math.PI/5;
        bolt(b,[s*(Math.abs(face)+.063),y+Math.sin(a)*r*.35,z+Math.cos(a)*r*.35],outward,.016);
        if (end) b.add('dark',new CylinderGeometry(.048,.058,.024,7).rotateZ(Math.PI/2)
          .translate(s*(Math.abs(face)+.022),y+Math.sin(a)*r*.78,z+Math.cos(a)*r*.78));
      }
    }
    for (const [i, plan] of SKIRTS.entries()) {
      const base = i > 3 || i===2 ? 'graphite' : (i===1 ? 'silver' : 'gray');
      sidePlate(b,s,'dark',plan,1.715,1.842,.02);
      const opening = i === SKIRTS.length - 1 ? intakeOpening : undefined;
      sidePlate(b,s,base,plan,1.797,opening ? intakeX - .002 : 1.888,.024,opening);
      const z = plan.reduce((sum, p) => sum + p[0]/plan.length,0);
      const y = plan.reduce((sum, p) => sum + p[1]/plan.length,0);
      for (const [zz, yy] of plan) bolt(b,[s*1.885,lerp(yy,y,.21),lerp(zz,z,.12)],outward,.023);
      if (i>0 && i<5) {
        b.box('dark',[s*1.877,1.595,z],[.025,.073,.237]);
        b.box('steel',[s*1.892,1.60,z],[.019,.029,.174]);
      }
      if (i===3 || i===4) {
        const xz = i===3 ? -.91 : -1.95;
        graphic(b,'silver',[[xz,1.69],[xz-.24,1.69],[xz+.42,.94],[xz+.65,.94]],
          (z,y)=>[s*1.89,y,z]);
      }
      chipMarks(b,s,1.889,y-.11,y+.11,z-.22,z+.22,31);
    }
    stencil(b,s,1.892,1.11,-2.6);
    grille(b,[s*intakeX,intakeY,intakeZ],d.rearIntakeWidth,d.rearIntakeHeight,'side',9);
    grille(b,[s*1.29,1.789,-3.54],.55,.91,'roof',14);
    grille(b,[s*1.20,1.788,2.66],.49,.50,'roof',9);
    const prow = s>0 ? [[.79,4.04],[1.50,3.91],[1.79,3.55],[1.76,2.65],[1.34,2.47],[.98,2.73]]
      : [[-.98,2.73],[-1.34,2.47],[-1.76,2.65],[-1.79,3.55],[-1.50,3.91],[-.79,4.04]];
    b.plate('silver',prow,1.40,1.567,.038,-.174);
    lamp(b,[s*d.lamp[0],d.lamp[1],d.lamp[2]],d.lampWidth,d.lampHeight,s*d.lampSweep,d.lampTilt,'silver');
    b.box('chip',[s*1.02,1.39,4.37],[.054,.026,.012]);
    b.round('steel',[s*.88,1.20,4.444],.064,.056,{direction:front});
    for (const z of [1.48,.75,-2.51,-3.92]) {
      b.plate('dark',plateOutline(s*1.08,z,.64,.42,.068),1.681,1.764,.06);
      b.plate('gray',plateOutline(s*1.08,z,.586,.373,.063),1.746,1.777,.042);
      b.grip(s*1.08,1.775,z,.167);
    }
    for (let i=0;i<6;i++) bolt(b,[s*(.29+i*.21),1.229,4.466]);
    towPoint(b,s*.54,.945,4.309,1);
    towPoint(b,s*.59,1.012,-4.449,-1);
    b.box('chip',[s*1.45,1.37,-4.405],[.27,.047,.061]);
  }
  b.plate('dark',plateOutline(0,2.20,1.49,1.33,.21),1.60,1.764,.052,-.013);
  b.plate('graphite',plateOutline(0,2.20,1.42,1.26,.19),1.648,1.782,.031,-.013);
  visor(b,[0,1.794,2.847],.613,.115,0,.42);
  b.add('graphite', loft([ring(plan,.73,.96,.83),ring(plan,.76,.93,1.13)]),.92);
  b.plate('graphite',plateOutline(0,3.56,1.72,.72,.19),1.461,1.533,.041,-.158);
  for(const side of [-1,1]) {
    b.rail('steel',[side*.71,1.55,3.37],[side*.75,1.44,4.03],.013,5);
    for(const z of [3.42,3.67,3.88]) bolt(b,[side*.63,1.55-(z-3.40)*.18,z],new Vector3(0,1,0),.017);
  }
  grille(b,[0,1.397,-4.487],1.78,.45,'rear',8);
  return b;
}

function turretAssembly() {
  const t = new ModelParts();
  const plan = mirrored(TURRET_PLAN);
  t.add('dark',loftProfile(plan,TURRET_RING));
  t.add('gray',loftProfile(plan,TURRET_ARMOR));
  t.plate('graphite',plateOutline(0,-.65,1.43,2.17,.22),.839,.879,.042);
  for (const side of [-1,1]) {
    t.rail('dark',[side*.67,.821,1.41],[side*1.17,.803,.44],.015,5);
    t.rail('steel',[side*1.167,.806,.44],[side*1.137,.841,-.67],.012,5);
    t.rail('dark',[side*1.16,.849,-.854],[side*.981,.887,-1.74],.013,5);
    for (const z of [-1.07,-.76,.54,.91,1.26])
      bolt(t,[side*(z>.54?.84:.99),.853-z*.029,z],new Vector3(0,1,0),.019);
  }
  const up = new Vector3(0,1,0);
  // Flush circular hatch with its inner cap and radial hinge plates.
  t.round('dark',[.09,.868,-.75],.385,.069,{segments:32,top:.376});
  t.round('gray',[.09,.902,-.75],.359,.052,{segments:32,top:.329});
  t.round('steel',[.09,.928,-.75],.29,.016,{segments:32,tint:.76});
  t.round('gray',[.09,.939,-.75],.181,.016,{segments:32});
  for (let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    bolt(t,[.09+Math.cos(a)*.274,.934,-.75+Math.sin(a)*.274],up,.016);
  }
  for (const s of [-1,1]) {
    const wing = [[.51,2.13],[.82,2.18],[1.30,1.72],[1.61,1.13],[1.59,.48],[1.10,.45],[.75,1.06]];
    const shape = s>0 ? wing : wing.map(([x,z])=>[-x,z]).reverse();
    t.plate('graphite',shape,.17,.43,.091,-.062);
    t.plate('silver',shape,.413,.68,.14,-.158);
    const rear = [[.68,-.24],[1.52,-.13],[1.50,-1.45],[1.19,-1.91],[.72,-1.54],[.56,-.96]];
    t.plate('gray',s>0 ? rear : rear.map(([x,z])=>[-x,z]).reverse(),.38,.74,.074,.047);
    const outward = new Vector3(s,0,0);
    const face = [[.72,.30],[.75,.56],[.28,.66],[-1.28,.63],[-1.53,.53],[-1.42,.32],[-.97,.21]];
    sidePlate(t,s,'silver',face,1.47,1.635,.054);
    for (const [z,y] of face) bolt(t,[s*1.632,lerp(y,.44,.19),lerp(z,-.4,.08)],outward,.020);
    chipMarks(t,s,1.637,.40,.54,-1.24,.52,44);
    const emblem = [[-.36,.12],[-.18,.12],[0,-.06],[.18,.12],[.36,.12],[.22,.04],[0,-.17],[-.22,.04]];
    for(const shift of [0,.075])
      graphic(t,'ivory',emblem,(z,y)=>[s*1.639,.472+y*.64+shift,-.58+z]);
    lamp(t,[s*d.turretLamp[0],d.turretLamp[1],d.turretLamp[2]],d.turretLampWidth,d.turretLampHeight,
      s*d.turretLampSweep,d.turretLampTilt,'graphite');
    visor(t,[s*.459,.807,1.657],.434,.158,s*.18,.37);
    visor(t,[s*1.161,.795,.402],.294,.104,s*.13,.24);
    grille(t,[s*1.486,.484,-2.44],.79,.38,'side',8);
    grille(t,[s*.73,.495,-3.096],.70,.348,'rear',9);
    t.plate('dark',plateOutline(s*.61,-2.18,.88,1.15,.15),.700,.834,.05,-.025);
    t.plate('gray',plateOutline(s*.61,-2.18,.83,1.10,.14),.802,.850,.05,-.025);
    t.plate('graphite',plateOutline(s*.65,-1.28,.39,.436,.07),.774,.89,.073);
    t.grip(s*.65,.888,-1.26,.176);
    t.whip(s*.98,.733,-2.32,s>0 ? 1.24 : .94,s*.042);
    for (const offset of [-.4,-.82,-1.76]) bolt(t,[s*.86,.846,offset],up,.019);
  }
  // The optical mast and roof station use distinct silhouettes and lens glazing.
  t.round('graphite',[-.40,.919,-.29],.267,.119,{segments:24,top:.22});
  t.round('steel',[-.40,.975,-.29],.193,.037,{segments:24});
  t.plate('gray',plateOutline(-.41,-.18,.55,.62,.117),.981,1.171,.125,.057);
  visor(t,[-.526,1.107,.152],.224,.117,0,.24);
  t.round('dark',[-.295,1.10,.205],.098,.296,{direction:front,top:.075,segments:15});
  t.rail('steel',[-.29,1.10,.34],[-.29,1.10,1.08],.043,14);
  t.rail('black',[-.29,1.10,1.02],[-.29,1.10,1.25],.028,12);
  t.round('graphite',[.62,.875,-.48],.166,.126,{segments:22,top:.121});
  t.round('steel',[.62,.948,-.48],.111,.049,{segments:20,tint:.75});
  t.plate('gray',plateOutline(.62,-.48,.166,.174,.035),.953,1.242,.19,-.11);
  t.plate('gray',plateOutline(.62,-.48,.265,.251,.049),1.159,1.494,.103,.035);
  for (const [y,r] of [[1.255,.055],[1.405,.067]]) {
    t.round('graphite',[.62,y,-.362],r*1.31,.028,{direction:front});
    t.round('black',[.62,y,-.346],r*1.10,.012,{direction:front});
    t.round('optic',[.62,y,-.339],r,.011,{direction:front,top:r*.93});
  }
  return t;
}

function barrelAssembly() {
  const mount = new ModelParts(), barrel = new ModelParts();
  mount.round('black',[0,0,-.108],.353,.31,{direction:front,top:.307,segments:40});
  mount.round('gray',[0,0,-.006],.302,.17,{direction:front,top:.274,segments:36});
  for(let i=0;i<14;i++) {
    const a=2*Math.PI*i/14;
    bolt(mount,[Math.cos(a)*.276,Math.sin(a)*.276,.057],front,.023);
  }
  // Radial profile includes a front rim and a recessed, dark bore.
  const profile=[[0,.05],[.21,.05],[.24,.16],[.24,.42],[.208,.49],[.206,.81],[.17,.94],[.165,1.18],
    [.153,2.54],[.176,2.59],[.177,2.73],[.147,2.78],[.117,4.65],[.138,4.70],[.14,4.98],[.128,muzzleZ],
    [.081,muzzleZ],[.081,muzzleZ-.30],[0,muzzleZ-.30]];
  barrel.add('barrel',new LatheGeometry(profile.map(([r,z])=>new Vector2(r,z)),48).rotateX(Math.PI/2));
  barrel.round('black',[0,0,muzzleZ-.296],.079,.008,{direction:front,segments:32});
  const shroud = [[.57,.253],[.74,.267],[1.57,.217],[1.69,.182]];
  for(const [z,r] of shroud) {
    barrel.round('graphite',[0,0,z],r,.119,{direction:front,segments:12});
    barrel.round('steel',[0,0,z+.057],r*.98,.035,{direction:front,segments:12});
  }
  for(const s of [-1,1]) {
    for(const y of [-.104,.104]) {
      barrel.rail('dark',[s*.166,y,.65],[s*.152,y,1.62],.037,8);
      barrel.rail('steel',[s*.171,y,1.72],[s*.137,y,2.54],.024,7);
    }
    for(let i=0;i<7;i++) barrel.box('black',[s*.195,.014,.80+i*.094],[.034,.089,.052]);
    for(const y of [-.081,.081]) for(let i=0;i<3;i++)
      barrel.box('black',[s*.124,y,4.785+i*.076],[.018,.042,.059]);
  }
  // Continuous painted diagonal stripes wrap around the shroud.
  for(const z of [3.48,3.64]) {
    const positions=[], indices=[];
    for(let i=0;i<=48;i++) {
      const a=2*Math.PI*i/48, h=z+Math.cos(a)*.122, r=.153-(h-2.78)*.015;
      positions.push(Math.sin(a)*r,Math.cos(a)*r,h,Math.sin(a)*r,Math.cos(a)*r,h+.041);
      if(i>0) indices.push(i*2-2,i*2-1,i*2,i*2,i*2-1,i*2+1);
    }
    const mesh=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
    mesh.setIndex(indices);
    mesh.computeVertexNormals();
    barrel.add('ivory',mesh);
  }
  return { mount, barrel };
}

const { gltf, bytes } = parseGlb(await readFile(file));
const node = name => gltf.nodes.find(n => n.name === name);
const root = node(id), body = node('body'), turret = node('turret'), gun = node('gun'), recoil = node('recoiling-barrel');
root.extras = { ...root.extras, fleetModelRevision: revision, deckClearance: [[-1.54,1.54,-3.94,3.56,1.77]] };
turret.translation = [0,hullRoof,turretZ];
gun.translation = [0,d.trunnionY,trunnionZ];
node('sight').translation = [.44,.247,.1];
node('muzzle').translation = [0,0,muzzleZ];
turret.extras = { turretExteriorRevision: revision };

const palette = {
  rubber: 'aegis140_Rubber',
  dark: 'VX-9 powder-coated fitting', steel: 'VX-9 exposed fastener', black: 'VX-9 black recess',
  wheel: 'VX-9 wheel alloy', gray: 'VX-9 medium gray armor', silver: 'VX-9 light gray armor',
  graphite: 'VX-9 graphite armor', chip: 'VX-9 ochre wear', ivory: 'VX-9 ivory stencil',
  paint: 'VX-9 medium gray armor', fitting: 'VX-9 powder-coated fitting', glass: 'VX-9 dichroic optic',
  blue: 'VX-9 blue strip', light: 'VX-9 illuminated strip', optic: 'VX-9 dichroic optic', barrel: 'VX-9 barrel alloy',
};
let data = bytes;

// Tileable paint fatigue, grime streaks and fine, warm corrosion. The same tile
// reads as darker weathering on graphite, with the silver panels still distinct.
function weatherTexture() {
  const previous = gltf.textures.findIndex(texture => texture.name === 'VX-9 paint weathering');
  if (previous >= 0) return previous;
  const extent = 256;
  const raw = Buffer.alloc(extent * (extent * 3 + 1));
  function noise(x,y,period,seed) {
    const i=Math.floor(x), j=Math.floor(y);
    const hash=(a,b)=>{
      const h=Math.imul((a%period+period)%period+seed,1367130551)^Math.imul((b%period+period)%period+seed,146627089);
      return ((Math.imul(h^(h>>>16),2246822507)>>>0)/4294967296);
    };
    const ease=v=>v*v*(3-2*v);
    const u=ease(x-i),v=ease(y-j);
    return lerp(lerp(hash(i,j),hash(i+1,j),u),lerp(hash(i,j+1),hash(i+1,j+1),u),v);
  }
  for(let y=0;y<extent;y++) for(let x=0;x<extent;x++) {
    const u=x/extent,v=y/extent;
    const cloud=noise(u*8,v*8,8,17)*.51+noise(u*28,v*28,28,29)*.33+noise(u*75,v*75,75,63)*.16;
    const streak=noise(u*32,v*3,32,61)*.70+noise(u*82,v*10,82,43)*.30;
    const grain=noise(x,y,extent,93);
    const grime=Math.max(0,(.49-cloud)*1.9)+Math.max(0,.35-streak)*.51;
    const pitting=Math.max(0,(.295-noise(u*111,v*111,111,107))*2.1)*Math.max(0,.72-cloud);
    const offset=y*(extent*3+1)+1+3*x;
    raw[offset]=Math.min(255,244-cloud*8-grime*117-pitting*86+grain*11);
    raw[offset+1]=Math.min(255,244-cloud*8-grime*123-pitting*132+grain*10);
    raw[offset+2]=Math.min(255,242-cloud*8-grime*132-pitting*147+grain*9);
  }
  const chunk=(name,payload)=>{
    const out=Buffer.alloc(payload.length+12);out.writeUInt32BE(payload.length);out.write(name,4);payload.copy(out,8);
    let crc=-1;
    for(const byte of out.subarray(4,out.length-4)) {
      crc^=byte;
      for(let i=0;i<8;i++) crc=(crc>>>1)^(crc&1?0xedb88320:0);
    }
    out.writeUInt32BE((crc^-1)>>>0,out.length-4);
    return out;
  };
  const header=Buffer.alloc(13);
  header.writeUInt32BE(extent);header.writeUInt32BE(extent,4);header[8]=8;header[9]=2;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:data.length,byteLength:png.length})-1;
  data=Buffer.concat([data,png,Buffer.alloc((4-png.length%4)%4)]);
  const source=gltf.images.push({name:'VX-9 paint weathering',bufferView,mimeType:'image/png'})-1;
  return gltf.textures.push({name:'VX-9 paint weathering',sampler:0,source})-1;
}
const baseColorTexture = { index: weatherTexture() };
const normal = gltf.materials.find(m => m.name === 'aegis140_Paint').normalTexture;
function makeMaterial(key, rgb, metal, rough, roughDetails=false, emissive) {
  const material = {
    name: palette[key], doubleSided:true,
    pbrMetallicRoughness:{ baseColorFactor:[...rgb,1],metallicFactor:metal,roughnessFactor:rough, ...(roughDetails && { baseColorTexture }) },
    ...(roughDetails && { normalTexture:{ ...normal, scale: .43 } }),
    ...(emissive && { emissiveFactor: emissive }),
  };
  const index=gltf.materials.findIndex(m=>m.name===palette[key]);
  if(index>=0) gltf.materials[index]=material;
  else gltf.materials.push(material);
}
makeMaterial('gray',[.26,.269,.267],.34,.64,true);
makeMaterial('silver',[.44,.452,.436],.31,.66,true);
makeMaterial('graphite',[.071,.082,.095],.28,.68,true);
makeMaterial('dark',[.078,.089,.091],.35,.7,true);
makeMaterial('black',[.024,.028,.03],.18,.89);
makeMaterial('steel',[.30,.265,.216],.71,.49,true);
makeMaterial('wheel',[.23,.231,.21],.48,.64,true);
makeMaterial('chip',[.36,.245,.104],.33,.72);
makeMaterial('ivory',[.73,.73,.67],.10,.69);
makeMaterial('barrel',[.114,.111,.105],.62,.51,true);
makeMaterial('blue',[.11,.44,.9],.23,.30,false,[.054,.20,.55]);
makeMaterial('light',[.60,.84,1],.10,.25,false,[.32,.69,1]);
makeMaterial('optic',[.048,.17,.22],.52,.14,false,[.02,.078,.125]);

function add(parent, parts, name, keep, extras) {
  parent.children = parent.children.filter(i=>keep.includes(gltf.nodes[i].name));
  const result = appendParts(gltf,data,parts.parts,palette,name);
  data=result.bytes;
  parent.children.push(gltf.nodes.push({ name, mesh:result.mesh, extras })-1);
}
const hull = chassis(), top = turretAssembly(), {mount,barrel} = barrelAssembly();
root.extras.exteriorDetailParts = hull.parts.length+top.parts.length+mount.parts.length+barrel.parts.length;
add(body,hull,'VX-9 chassis', ['turret','track_0','track_1']);
add(turret,top,'VX-9 turret',['gun'],{turretExterior:id,turretDetailParts:top.parts.length});
add(gun,mount,'VX-9 mantlet',['recoiling-barrel','sight']);
add(recoil,barrel,'VX-9 barrel',['muzzle']);

function trackAccessor(values, type) {
  const array = new Float32Array(values);
  const buffer = Buffer.from(array.buffer);
  const view = gltf.bufferViews.push({buffer:0,byteOffset:data.length,byteLength:buffer.length})-1;
  data = Buffer.concat([data, buffer]);
  return gltf.accessors.push({bufferView:view,componentType:5126,type,count:values.length/(type==='VEC3'?3:4)})-1;
}

const { trackRadius: cap, trackEnd: halfRun, trackY: elevation } = d;
const pitch = (4*halfRun+2*Math.PI*cap)/100;
for(const [side,scale] of [[0,-1],[1,1]]) {
  const track=node('track_'+side);
  track.extras.poses=Array.from({length:100},(_,i)=>{
    const distance=i*pitch;
    let y=elevation-cap,z=-halfRun+distance,a=0;
    if(distance>=2*halfRun+Math.PI*cap) {
      y=elevation+cap; z=halfRun-(distance-2*halfRun-Math.PI*cap); a=Math.PI;
      if(z < -halfRun) {
        const next=Math.min(Math.PI,(-halfRun-z)/cap);
        y=elevation+cap*Math.cos(next); z=-halfRun-cap*Math.sin(next); a+=next;
      }
    } else if(distance>=2*halfRun) {
      a=(distance-2*halfRun)/cap;
      y=elevation-cap*Math.cos(a); z=halfRun+cap*Math.sin(a);
    }
    return [scale*trackX,y,z,-Math.sin(a/2),0,0,Math.cos(a/2)].map(v=>+v.toFixed(7));
  });
  for(const index of track.children) {
    const zone=gltf.nodes[index];
    const inst=gltf.nodes[zone.children[0]];
    const translation=inst.translation ?? [0,0,0];
    inst.scale[0]=inst.scale[1]*.88;
    const poses=zone.extras.indices.map(i=>track.extras.poses[i]);
    const attributes=inst.extensions.EXT_mesh_gpu_instancing.attributes;
    attributes.TRANSLATION=trackAccessor(poses.flatMap(p=>p.slice(0,3).map((x,i)=>(x-translation[i])/(inst.scale?.[i] ?? 1))), 'VEC3');
    attributes.ROTATION=trackAccessor(poses.flatMap(p=>p.slice(3)), 'VEC4');
  }
}
const trackPbr = gltf.materials.find(m => m.name === 'aegis140_Track').pbrMetallicRoughness;
trackPbr.baseColorFactor = [.59,.54,.46,1];

// Flatten the older shoe geometry's compressed views so the download also
// imports in Blender versions that lack EXT_meshopt_compression.
await MeshoptDecoder.ready;
for (const view of gltf.bufferViews) {
  const compressed = view.extensions?.EXT_meshopt_compression;
  if (!compressed) continue;
  const { byteOffset=0, byteLength, count, byteStride, mode, filter } = compressed;
  const decoded=Buffer.alloc(count*byteStride);
  MeshoptDecoder.decodeGltfBuffer(decoded,count,byteStride,data.subarray(byteOffset,byteOffset+byteLength),mode,filter);
  Object.assign(view,{buffer:0,byteOffset:data.length,byteLength:decoded.length});
  delete view.extensions.EXT_meshopt_compression;
  if(!Object.keys(view.extensions).length) delete view.extensions;
  data=Buffer.concat([data,decoded,Buffer.alloc((4-decoded.length%4)%4)]);
}
gltf.extensionsUsed = gltf.extensionsUsed.filter(ext=>ext!=='EXT_meshopt_compression');
gltf.extensionsRequired = gltf.extensionsRequired.filter(ext=>ext!=='EXT_meshopt_compression');
gltf.buffers.length = 1;
const output = serializeGlb(gltf, compactAsset(gltf,data));
await writeFile(file,output);
console.log(`VX-9 rebuilt with ${root.extras.exteriorDetailParts} exterior parts (${Math.round(output.length/1024)} KiB)`);
