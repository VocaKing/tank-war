// Build the VX-9 game asset from its orthographic views, in metres with +Z forward.
// Reuse the existing animated shoe hardware and surface textures.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CylinderGeometry, LatheGeometry, TorusGeometry, Vector2, Vector3, ShapeUtils, BufferGeometry, Float32BufferAttribute } from 'three';
import { ModelParts, appendParts, parseGlb, serializeGlb, compactAsset, loft, ring, mirrored, plate, plateOutline } from './tools_rear_turrets.mjs';

const id = 'aegis140';
const revision = '2026-11-vx9-reference';
const file = new URL('public/models/fleet/aegis140.glb', import.meta.url);
const front = new Vector3(0, 0, 1);
const hullRoof = 1.76;
const turretZ = -0.78;
const trunnionZ = 1.98;
const muzzleZ = 5.02;
const trackX = 1.50;
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

function sidePlate(parts, s, mat, plan, xInner, xOuter, inset = 0.05) {
  const outline = plan.map(([z, y]) => [-s * y, z]);
  if (s === 1) outline.reverse();
  parts.add(mat, plate(outline, xInner, xOuter, inset).rotateZ(-s * Math.PI / 2));
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

function grille(parts, center, width, height, orientation, count = 9) {
  const [x, y, z] = center;
  const facingSide = orientation === 'side';
  const roof = orientation === 'roof';
  const point = (u, v, d) => facingSide ? [x + Math.sign(x) * d, y + v, z + u]
    : roof ? [x + u, y + d, z + v] : [x + u, y + v, z - d];
  const size = (u,v,d) => facingSide ? [d,v,u] : roof ? [u,d,v] : [u,v,d];
  parts.box('steel', point(0,0,0), size(width, height, .046));
  parts.box('black', point(0,0,.024), size(width-.051, height-.057, .018));
  for (let i=0;i<count;i++) {
    parts.box('steel', point(0, ((i+.5)/count-.5)*(height-.052), .040), size(width-.052,.014,.018), 0, .68 + i%3*.1);
  }
  for (let i=1;i<=3;i++) parts.box('dark', point(width*(i/4-.5),0,.053), size(.014,height-.046,.014));
}

function lamp(parts, x, y, z, width, yaw) {
  parts.box('dark', [x,y,z], [width+.13,.19,.20], yaw);
  const face = (dy, dz) => [x+Math.sin(yaw)*dz,y+dy,z+Math.cos(yaw)*dz];
  parts.box('black', face(0,.105), [width+.034,.108,.024], yaw);
  parts.box('blue', face(0,.122), [width,.053,.018], yaw);
  parts.box('light', face(.005,.133), [width*.93,.023,.009], yaw);
  parts.box('steel', face(.071,.095), [width+.060,.026,.045], yaw);
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
  const plan = mirrored([[0,4.48],[.89,4.48],[1.55,4.20],[1.82,3.79],[1.865,3.25],
    [1.865,-3.79],[1.77,-4.21],[1.54,-4.48],[0,-4.48]]);
  b.add('dark', loft([ring(plan,.69,.85,.31,0,.01),ring(plan,.75,.92,.72)]));
  b.add('gray', loft([
    ring(plan,.78,.89,.72), ring(plan,1,1,1.25), ring(plan,.988,.96,1.52,-.035,-.037),
    ring(plan,.84,.80,hullRoof,-.39), 
  ]));
  const deck = plateOutline(0, 0.45, 2.33, 7.08, .22);
  b.plate('graphite',deck,1.689,1.743,.025);
  b.round('black',[0,1.746,turretZ],1.12,.048,{segments:36});
  b.round('steel',[0,1.765,turretZ],1.04,.044,{segments:42,tint:.67});

  for (const s of [-1,1]) {
    const d = new Vector3(s,0,0);
    // Seven deep double-rimmed road wheels and two raised end hubs.
    for (const [i,z] of [-3.52,-2.87,-1.92,-.96,0,.96,1.92,2.87,3.52].entries()) {
      const end = i===0 || i===8, y = end ? .56 : .535, r = end ? .43 : .477;
      const offset = end ? .01 : 0, face = s*(trackX+.251+offset);
      b.round('rubber',[s*trackX,y,z],r,.49,{direction:d,segments:30});
      b.round('wheel',[s*(trackX+.213),y,z],r*.91,.080,{direction:d,segments:30,top:r*.86});
      b.round('dark',[face,y,z],r*.68,.038,{direction:d,segments:28,top:r*.65});
      b.round('wheel',[s*(Math.abs(face)+.026),y,z],r*.48,.076,{direction:d,top:r*.38,segments:22});
      b.round('steel',[s*(Math.abs(face)+.076),y,z],r*.229,.048,{direction:d,top:r*.84*.229,segments:16});
      b.add('steel',new TorusGeometry(r*.778,.012,6,28).rotateY(Math.PI/2).translate(face,y,z),.72);
      for (let k=0;k<10;k++) {
        const a=k*Math.PI/5;
        bolt(b,[s*(Math.abs(face)+.063),y+Math.sin(a)*r*.35,z+Math.cos(a)*r*.35],d,.016);
        if (end) b.add('dark',new CylinderGeometry(.048,.058,.024,7).rotateZ(Math.PI/2)
          .translate(s*(Math.abs(face)+.022),y+Math.sin(a)*r*.78,z+Math.cos(a)*r*.78));
      }
    }
    const skirts = [
      [[3.83,1.28],[3.43,1.58],[2.47,1.70],[2.00,1.65],[1.54,.93],[2.78,.92],[3.64,1.05]],
      [[2.01,1.65],[.29,1.72],[.18,.91],[1.52,.92]],
      [[.25,1.72],[-.66,1.71],[-.92,.91],[.19,.91]],
      [[-.71,1.71],[-1.68,1.71],[-1.99,.92],[-.94,.91]],
      [[-1.72,1.71],[-3.16,1.70],[-3.42,.93],[-2.01,.92]],
      [[-3.21,1.69],[-4.43,1.67],[-4.39,1.24],[-4.03,.94],[-3.47,.93]],
    ];
    for (const [i, plan] of skirts.entries()) {
      const base = i > 3 || i===2 ? 'graphite' : (i===1 ? 'silver' : 'gray');
      sidePlate(b,s,'dark',plan,1.715,1.842,.02);
      sidePlate(b,s,base,plan,1.797,1.888,.024);
      const z = plan.reduce((sum, p) => sum + p[0]/plan.length,0);
      const y = plan.reduce((sum, p) => sum + p[1]/plan.length,0);
      for (const [zz, yy] of plan) bolt(b,[s*1.885,lerp(yy,y,.21),lerp(zz,z,.12)],d,.023);
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
    grille(b,[s*1.889,1.405,-3.73],.69,.34,'side',9);
    grille(b,[s*1.37,1.65,-3.58],.61,.94,'roof',14);
    grille(b,[s*1.22,1.633,2.69],.52,.54,'roof',9);
    const prow = s>0 ? [[.79,4.04],[1.50,3.91],[1.79,3.55],[1.76,2.65],[1.34,2.47],[.98,2.73]]
      : [[-.98,2.73],[-1.34,2.47],[-1.76,2.65],[-1.79,3.55],[-1.50,3.91],[-.79,4.04]];
    b.plate('silver',prow,1.42,1.605,.041,-.185);
    b.plate('gray',plateOutline(s*1.55,3.06,.40,.57,.09),1.54,1.666,.06,-.19);
    lamp(b,s*1.42,1.347,4.19,.56,-s*.30);
    b.box('chip',[s*1.02,1.39,4.37],[.054,.026,.012]);
    b.round('steel',[s*.88,1.20,4.444],.064,.056,{direction:front});
    for (const z of [1.48,.75,-2.51,-3.92]) {
      b.plate('graphite',plateOutline(s*1.08,z,.67,.43,.07),1.696,1.781,.06);
      b.grip(s*1.08,1.779,z,.18);
    }
    for (let i=0;i<6;i++) bolt(b,[s*(.29+i*.21),1.229,4.466]);
    b.add('steel',new TorusGeometry(.109,.024,7,18).translate(s*.54,.945,4.26),.70);
    b.add('steel',new TorusGeometry(.108,.025,7,18).translate(s*.59,1.012,-4.43),.71);
    b.box('chip',[s*1.45,1.37,-4.405],[.27,.047,.061]);
  }
  b.plate('graphite',plateOutline(0,2.20,1.45,1.32,.21),1.712,1.767,.07,-.057);
  b.optic(0,1.73,2.89,.64,.114,.24);
  b.add('graphite', loft([ring(plan,.73,.96,.83),ring(plan,.76,.93,1.13)]),.92);
  b.plate('graphite',plateOutline(0,3.56,1.72,.72,.19),1.461,1.533,.041,-.158);
  for(const side of [-1,1]) {
    b.rail('steel',[side*.71,1.55,3.37],[side*.75,1.44,4.03],.013,5);
    for(const z of [3.42,3.67,3.88]) bolt(b,[side*.63,1.55-(z-3.40)*.18,z],new Vector3(0,1,0),.017);
  }
  grille(b,[0,1.423,-4.472],1.78,.46,'rear',8);
  return b;
}

function turretAssembly() {
  const t = new ModelParts();
  const plan = mirrored([[0,2.18],[.51,2.15],[.84,1.93],[1.31,1.56],[1.58,1.14],[1.64,.43],
    [1.61,-.75],[1.46,-1.64],[1.48,-2.66],[1.30,-3.02],[0,-3.09]]);
  t.add('dark',loft([ring(plan,.64,.82,.043,-.05),ring(plan,.82,.95,.14)]));
  t.add('gray',loft([
    ring(plan,.83,.91,.14),ring(plan,1,1,.35,0,-.026),ring(plan,.97,.976,.62,-.03,-.040),
    ring(plan,.78,.83,.853,-.15,-.021),
  ]));
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
  t.hatch(.09,-0.04+.88,-.75,.354);
  t.round('steel',[.09,.951,-.75],.28,.017,{segments:30,tint:.76});
  t.round('gray',[.09,.964,-.75],.18,.020,{segments:30});
  for (let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    bolt(t,[.09+Math.cos(a)*.274,.952,-.75+Math.sin(a)*.274],up,.016);
  }
  for (const s of [-1,1]) {
    const wing = [[.51,2.13],[.82,2.18],[1.30,1.72],[1.61,1.13],[1.59,.48],[1.10,.45],[.75,1.06]];
    const shape = s>0 ? wing : wing.map(([x,z])=>[-x,z]).reverse();
    t.plate('graphite',shape,.17,.43,.091,-.062);
    t.plate('silver',shape,.413,.68,.14,-.158);
    const rear = [[.68,-.24],[1.52,-.13],[1.50,-1.45],[1.19,-1.91],[.72,-1.54],[.56,-.96]];
    t.plate('gray',s>0 ? rear : rear.map(([x,z])=>[-x,z]).reverse(),.38,.74,.074,.047);
    const d = new Vector3(s,0,0);
    const face = [[.72,.30],[.75,.56],[.28,.66],[-1.28,.63],[-1.53,.53],[-1.42,.32],[-.97,.21]];
    sidePlate(t,s,'silver',face,1.47,1.635,.054);
    for (const [z,y] of face) bolt(t,[s*1.632,lerp(y,.44,.19),lerp(z,-.4,.08)],d,.020);
    chipMarks(t,s,1.637,.40,.54,-1.24,.52,44);
    const emblem = [[-.36,.12],[-.18,.12],[0,-.06],[.18,.12],[.36,.12],[.22,.04],[0,-.17],[-.22,.04]];
    for(const shift of [0,.075])
      graphic(t,'ivory',emblem,(z,y)=>[s*1.639,.472+y*.64+shift,-.58+z]);
    lamp(t,s*1.03,.328,1.76,.31,s*.51);
    t.optic(s*.44,.746,1.48,.40,.169,.35,s*.13);
    t.optic(s*1.23,.731,.15,.24,.114,.26,s*.14);
    grille(t,[s*1.493,.49,-2.49],.78,.36,'side',8);
    grille(t,[s*.73,.568,-3.082],.70,.33,'rear',9);
    t.plate('gray',plateOutline(s*.61,-2.18,.83,1.12,.15),.694,.818,.082,-.025);
    t.plate('graphite',plateOutline(s*.60,-1.33,.42,.46,.07),.813,.894,.083);
    t.grip(s*.60,.895,-1.31,.22);
    t.whip(s*.98,.733,-2.32,s>0 ? 1.24 : .94,s*.042);
    for (const offset of [-.4,-.82,-1.76]) bolt(t,[s*.86,.846,offset],up,.019);
  }
  // The optical mast and roof station use distinct silhouettes and lens glazing.
  t.round('dark',[-.40,.915,-.37],.24,.143,{segments:25});
  t.plate('gray',plateOutline(-.41,-.18,.55,.62,.095),.96,1.19,.14);
  t.optic(-.55,1.09,.04,.22,.135,.21);
  t.box('dark',[-.295,1.08,.218],[.18,.14,.32]);
  t.rail('steel',[-.29,1.10,.34],[-.29,1.10,1.08],.043,14);
  t.rail('black',[-.29,1.10,1.02],[-.29,1.10,1.25],.028,12);
  t.round('steel',[.62,.887,-.48],.102,.18,{segments:12});
  t.box('dark',[.62,1.084,-.48],[.098,.25,.096]);
  t.plate('gray',plateOutline(.62,-.48,.28,.225,.04),1.15,1.49,.112);
  for (const [y,r] of [[1.25,.056],[1.402,.073]]) {
    t.round('black',[.62,y,-.357],r*1.28,.024,{direction:front});
    t.round('optic',[.62,y,-.342],r,.012,{direction:front});
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
gun.translation = [0,.466,trunnionZ];
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

const cap=.521, halfRun=3.52, pitch=(4*halfRun+2*Math.PI*cap)/100, elevation=.579;
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
