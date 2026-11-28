// Export the playable light tank after checking its orthographic design.
import { readFile, writeFile } from 'node:fs/promises';
import { BufferGeometry, Float32BufferAttribute, LatheGeometry, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three';
import { ModelParts, appendParts, parseGlb, serializeGlb, compactAsset, loft, ring, mirrored, plate, plateOutline } from './tools_rear_turrets.mjs';
import { VESPER as d, VESPER_HULL, VESPER_HULL_RINGS, VESPER_TURRET, VESPER_TURRET_RINGS, VESPER_RAIL } from './src/models/vesperDesign.js';

const file = new URL('./public/models/fleet/vesper48.glb',import.meta.url);
const base = new URL('./public/models/fleet/aegis140.glb',import.meta.url);
const src = await readFile(file).catch(error=>{if(error.code!=='ENOENT')throw error;return readFile(base);});
const { gltf, bytes } = parseGlb(src);
const zAxis=new Vector3(0,0,1), yAxis=new Vector3(0,1,0);
const sideAxis=s=>new Vector3(s,0,0);
const profile=(plan,stations)=>loft(stations.map(r=>ring(mirrored(plan),...r)));
const facet=(parts,mat,x,z,width,length,low,high,bevel=.07,rake=0)=>
  parts.plate(mat,plateOutline(x,z,width,length,bevel),low,high,.065,rake);

function bolt(parts, p, axis=yAxis, radius=.023) {
  parts.round('black',p,radius*1.18,.011,{direction:axis,segments:10});
  parts.round('steel',p.map((v,i)=>v+axis.getComponent(i)*.009),radius*.81,.015,{direction:axis,segments:6,tint:.89});
}
function polygon(parts,mat,plan,project) {
  const mesh=new BufferGeometry();
  mesh.setAttribute('position',new Float32BufferAttribute(plan.flatMap(v=>project(...v)),3));
  mesh.setIndex(ShapeUtils.triangulateShape(plan.map(([x,y])=>new Vector2(x,y)),[]).flat());
  mesh.computeVertexNormals();parts.add(mat,mesh);
}
function skin(parts,side,mat,points,inside,outside) {
  const outline=points.map(([z,y])=>[-side*y,z]);
  if(side>0)outline.reverse();
  parts.add(mat,plate(outline,inside,outside,.035).rotateZ(-side*Math.PI/2));
}
// Optical elements sit behind the same-plane metal rim, with a taper back into their mount.
function optic(parts, [x,y,z], radius, depth, lens, heading=zAxis) {
  const along=t=>[x+heading.x*t,y+heading.y*t,z+heading.z*t];
  parts.round('black',along(-depth*.16),radius*1.08,depth,{direction:heading,segments:22,top:radius});
  parts.round('steel',along(depth*.31),radius,.045,{direction:heading,segments:22,top:radius*.94});
  // An open ring protects the inset optical face without a solid cap in front.
  const profile=[[radius*.90,0],[radius,.005],[radius,.027],[radius*.92,.033],[radius*.83,.033],[radius*.83,.002]];
  const glassFrame=new LatheGeometry(profile.map(p=>new Vector2(...p)),24);
  glassFrame.applyQuaternion(new Quaternion().setFromUnitVectors(yAxis,heading));
  parts.add('steel',glassFrame.translate(...along(depth*.33)),.76);
  parts.round(lens,along(depth*.33+.024),radius*.81,.012,{direction:heading,segments:24});
}
function louvers(parts,x,y,z,w,l,count) {
  facet(parts,'black',x,z,w,l,y-.067,y,.05);
  for(let i=0;i<count;i++){
    const v=z+((i+.5)/count-.5)*(l-.035);
    parts.box(i%2?'dark':'steel',[x,y+.009,v],[w*.92,.021,.028],0,.75);
  }
  for(const side of [-1,1]) parts.box('paint',[x+side*w*.46,y-.006,z],[.032,.034,l]);
}
function hatch(parts,x,y,z) {
  facet(parts,'black',x,z,.62,.68,y-.041,y+.024);
  facet(parts,'paint',x,z,.565,.615,y+.015,y+.056);
  parts.grip(x,y+.056,z+.08,.151);
  for(const s of [-1,1])bolt(parts,[x+s*.21,y+.055,z-.23]);
}
function chassis(){
  const b=new ModelParts();
  b.add('paint',profile(VESPER_HULL,VESPER_HULL_RINGS));
  const lower=mirrored(VESPER_HULL);
  b.add('dark',loft([ring(lower,.73,.90,.345),ring(lower,.82,.96,.645)]));
  b.round('black',[0,1.407,d.turretZ],.77,.060,{segments:36});
  b.round('steel',[0,1.445,d.turretZ],.61,.046,{segments:36,tint:.73});
  // The stepped nose runs into the track shoulders rather than separate fender boxes.
  facet(b,'paint',0,2.409,1.84,.62,.925,1.258,.16,-.29);
  const screen = [[-.81,0],[.81,0],[.72,1],[-.72,1]];
  polygon(b,'dark',screen,(x,t)=>[x,.922+t*.262,3.075-t*.273]);
  for(let i=-5;i<=5;i++){
    const x=i*.138;
    b.rail('steel',[x,.925,3.075],[x,1.186,2.802],.019,6);
    bolt(b,[x,1.177,2.82],zAxis,.017);
  }
  for(const x of d.lightsX){
    facet(b,'paint',x,2.67,.252,.388,1.080,1.245,.049,-.18);
    optic(b,[x,d.lightsY,d.lightsZ],.101,.226,'white');
  }
  facet(b,'paint',0,1.96,.51,.52,1.340,1.565,.074,-.052);
  facet(b,'dark',0,1.99,.414,.43,1.346,1.596,.066);
  b.box('black',[0,1.476,2.208],[.267,.171,.054]);
  b.box('red',[0,1.481,2.235],[.184,.121,.025]);
  for(const s of [-1,1]){
    const axis=sideAxis(s);
    for(const [index,z] of [-d.trackEnd,...d.roadWheels,d.trackEnd].entries()){
      const outer=index===0||index===d.roadWheels.length+1;
      const y=outer?.49:.414, r=outer?.333:.353;
      b.round('rubber',[s*d.trackX,y,z],r,.367,{direction:axis,segments:27});
      b.round('wheel',[s*(d.trackX+.184),y,z],r*.87,.071,{direction:axis,segments:26,top:r*.75});
      b.round('black',[s*(d.trackX+.222),y,z],r*.67,.015,{direction:axis,segments:22});
      b.round('wheel',[s*(d.trackX+.242),y,z],r*.39,.052,{direction:axis,segments:20,top:r*.33});
      b.round('steel',[s*(d.trackX+.275),y,z],r*.206,.034,{direction:axis,segments:14});
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        bolt(b,[s*(d.trackX+.264),y+Math.sin(a)*r*.298,z+Math.cos(a)*r*.298],axis,.016);
        if(outer)b.box('steel',[s*(d.trackX+.235),y+Math.sin(a)*r*.805,z+Math.cos(a)*r*.805],[.017,.051,.058]);
      }
    }
    const skirt=[[2.78,.79],[2.51,1.045],[.96,1.122],[-.07,1.11],[-2.66,1.082],[-2.84,.773],[-2.30,.72],[2.31,.715]];
    skin(b,s,'dark',skirt,1.38,1.566);
    const modules=[
      [[2.75,.89],[2.53,1.043],[1.30,1.08],[1.12,.89],[1.24,.753],[2.48,.745]],
      [[1.06,.97],[.92,1.101],[-.57,1.1],[-.78,.92],[-.59,.77],[.92,.76]],
      [[-.86,1.002],[-1.13,1.084],[-2.52,1.057],[-2.75,.89],[-2.52,.762],[-1.08,.754]],
    ];
    for(const [i,p] of modules.entries()){
      skin(b,s,i===1?'gray':'paint',p,1.497,1.581);
      const y=p.reduce((sum,v)=>sum+v[1]/p.length,0),z=p.reduce((sum,v)=>sum+v[0]/p.length,0);
      for(const [zz,yy] of p)bolt(b,[s*1.584,yy*.83+y*.17,zz*.88+z*.12],axis,.018);
    }
    // Distinct diagonal field markings over the flared skirt.
    for(const z of [-1.80,-1.56,.86]){
      polygon(b,'mark',[[z,.987],[z+.11,.987],[z+.29,.799],[z+.183,.799]],(z,y)=>[s*1.583,y,z]);
    }
    for(const z of [-.36,-.08,.20]){
      optic(b,[s*1.552,.925,z],.077,.14,'cyan',axis);
    }
    b.rail('steel',[s*1.473,.203,1.62],[s*1.473,.203,-1.72],.023,8);
    b.rail('dark',[s*1.474,.335,1.72],[s*1.473,.203,1.62],.019,7);
    b.rail('dark',[s*1.474,.335,-1.87],[s*1.473,.203,-1.72],.019,7);
    facet(b,'gray',s*.995,.012,.59,1.11,1.25,1.515,.14,.067);
    optic(b,[s*1.058,1.470,.573],.105,.24,'red',new Vector3(s*.29,0,1).normalize());
    hatch(b,s*.74,1.411,-1.095);
    louvers(b,s*.71,1.407,-2.046,.57,.83,12);
    facet(b,'dark',s*.868,-2.709,.59,.406,1.246,1.365,.079);
    for(const zz of [-2.10,-1.84,-1.56])bolt(b,[s*1.12,1.409,zz],yAxis,.019);
    const aft=new Vector3(0,0,-1);
    optic(b,[s*1.065,1.036,-2.974],.096,.191,'red',aft);
    b.rail('steel',[s*.88,1.299,-2.86],[s*1.17,1.54,-2.98],.024,7);
    b.rail('steel',[s*1.17,1.54,-2.98],[s*.81,1.549,-2.55],.024,7);
    b.round('steel',[s*.327,.636,-3.01],.093,.175,{direction:aft,segments:14});
    b.round('black',[s*.327,.636,-3.116],.061,.027,{direction:aft,segments:12});
  }
  b.rail('steel',[-1.17,1.54,-2.98],[1.17,1.54,-2.98],.026,7);
  louvers(b,0,1.439,-2.431,.64,.96,13);
  b.whip(1.025,1.236,-2.247,1.86,.03);
  return b;
}

function overhead(){
  const t=new ModelParts();
  t.round('dark',[0,.168,0],.56,.335,{segments:32,top:.515});
  t.round('steel',[0,.229,0],.505,.051,{segments:36,tint:.92});
  t.round('paint',[0,.355,0],.525,.182,{segments:32,top:.462});
  t.add('paint',profile(VESPER_TURRET,VESPER_TURRET_RINGS));
  // The long pod tapers into a shared roof with protected lamp and sensor mounts.
  facet(t,'gray',0,-1.198,1.31,1.433,.917,1.097,.17,-.033);
  for(const s of [-1,1]){
    const side=sideAxis(s);
    skin(t,s,'gray',[[.21,.60],[.03,.99],[-.56,1.025],[-1.773,1.014],[-1.95,.787],[-1.70,.502],[-.55,.51]],.612,.796);
    skin(t,s,'dark',[[-.810,.53],[-.86,.70],[-1.79,.69],[-1.84,.545]],.750,.833);
    for(const z of [-.42,-.80,-1.28,-1.62])bolt(t,[s*.801,.887,z],side,.021);
    t.rail('steel',[s*.768,.60,-.577],[s*.797,.598,-1.818],.018,6);
    t.rail('dark',[s*.53,.955,-.918],[s*.59,1.22,-.654],.030,7);
    t.rail('dark',[s*.59,1.22,-.654],[s*.53,1.204,-.36],.030,7);
  }
  facet(t,'dark',.38,-.26,.43,.496,.988,1.199,.076);
  for(const side of [-1,1]){
    t.rail('steel',[.38+side*.161,1.077,-.217],[.38+side*.177,1.393,-.194],.040,9);
  }
  optic(t,[.38,1.313,-.19],.227,.397,'white');
  facet(t,'paint',-.31,.03,.342,.461,.916,1.097,.092);
  optic(t,[-.31,1.099,.084],.139,.310,'white');
  facet(t,'dark',-.42,-.485,.41,.389,.986,1.104,.070);
  t.rail('dark',[-.44,1.012,.287],[-.44,1.023,.719],.096,14);
  for(let i=0;i<5;i++){
    const a=2*Math.PI*i/5,x=-.44+.059*Math.cos(a),y=1.02+.059*Math.sin(a);
    t.rail('steel',[x,y,.628],[x,y,1.262],.023,8);
  }
  t.round('dark',[-.44,1.02,1.12],.105,.059,{direction:zAxis,segments:14});
  t.round('black',[-.44,1.02,1.242],.099,.041,{direction:zAxis,segments:14});
  optic(t,[0,.743,-2.033],.117,.119,'red',new Vector3(0,0,-1));
  return t;
}

function weapon(){
  const mount=new ModelParts(), barrel=new ModelParts();
  for(const s of [-1,1]){
    const outline=s>0?VESPER_RAIL:VESPER_RAIL.map(([x,z])=>[-x,z]).reverse();
    mount.plate('dark',outline,-.173,.068,.040,-.012);
    mount.plate('gray',outline,-.067,.108,.079,-.021);
    mount.rail('steel',[s*.309,.104,2.361],[s*.491,.116,.678],.022,8);
    mount.rail('dark',[s*.491,.116,.678],[s*.566,.447,.101],.045,9);
    mount.rail('steel',[s*.488,.103,.65],[s*.559,.376,.135],.026,8);
    for(const z of [.47,1.18,1.95]){
      mount.box('black',[s*(.465-z*.065),.124,z],[.136,.040,.121]);
      bolt(mount,[s*(.462-z*.065),.151,z],yAxis,.022);
    }
    mount.box('mark',[s*.30,-.01,2.442],[.113,.106,.021]);
  }
  mount.round('black',[0,0,-.021],.268,.396,{direction:zAxis,segments:28,top:.237});
  mount.round('dark',[0,0,.246],.267,.225,{direction:zAxis,segments:28,top:.231});
  const sketch=[[0,.134],[.181,.134],[.184,.45],[.149,.503],[.145,1.18],[.171,1.22],[.169,1.68],[.143,1.708],
    [.122,2.59],[.159,2.641],[.159,3.0],[.111,3.051],[.105,4.079],[.142,4.131],[.143,4.365],[.129,4.41],
    [.062,4.41],[.061,4.13],[0,4.13]];
  barrel.add('steel',new LatheGeometry(sketch.map(p=>new Vector2(...p)),42).rotateX(Math.PI/2),.75);
  barrel.round('black',[0,0,4.139],.060,.015,{direction:zAxis,segments:28});
  for(const z of [1.57,2.49,2.75,3.42,3.78]){
    barrel.round('dark',[0,0,z],z===1.57?.173:z===2.75?.161:.126,.042,{direction:zAxis,segments:29});
  }
  for(const s of [-1,1]) {
    for(let i=0;i<4;i++)barrel.box('black',[s*.129,.028,4.15+i*.05],[.018,.052,.032]);
    barrel.rail('gray',[s*.114,.128,1.32],[s*.100,.125,2.674],.019,7);
  }
  for(let i=0;i<11;i++)barrel.box(i%2?'dark':'gray',[0,.169,1.60+i*.093],[.166,.015,.066]);
  return {mount,barrel};
}

const node=name=>gltf.nodes.find(n=>n.name===name);
const root=gltf.nodes[gltf.scenes[0].nodes[0]],body=node('body'),turret=node('turret'),gun=node('gun'),recoil=node('recoiling-barrel');
root.name=d.id;
root.extras={fleetModelId:d.id,fleetModelRevision:d.revision,referenceSource:d.source,
  deckClearance:[[-1.25,1.25,-2.73,2.29,1.49]]};
turret.translation=[0,d.hullRoof,d.turretZ];
gun.translation=[0,d.gunY,d.gunZ];
node('sight').translation=[.35,.22,.18];
node('muzzle').translation=[0,0,d.barrelLength];
const track=gltf.materials.find(m=>/^(?:aegis140|vesper48)_Track$/.test(m.name));
const rubber=gltf.materials.find(m=>/^(?:aegis140|vesper48)_Rubber$/.test(m.name));
track.name=d.id+'_Track'; rubber.name=d.id+'_Rubber';
track.pbrMetallicRoughness.baseColorFactor=[.84,.88,.89,1];
const palette={rubber:rubber.name};
const maps=gltf.materials.find(m=>m.name==='VX-9 medium gray armor');
function surface(key,label,rgb,metal,rough,texture=false,emissive){
  const name='Vesper-48 '+label;
  palette[key]=name;
  const info={ name, doubleSided:true, pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metal,roughnessFactor:rough},
    ...(texture&&{normalTexture:{...maps.normalTexture,scale:.56}}),...(emissive&&{emissiveFactor:emissive}) };
  if(texture&&maps.pbrMetallicRoughness.baseColorTexture)info.pbrMetallicRoughness.baseColorTexture=maps.pbrMetallicRoughness.baseColorTexture;
  const i=gltf.materials.findIndex(m=>m.name===name);
  if(i<0)gltf.materials.push(info);else gltf.materials[i]=info;
}
surface('paint','slate armor',[.057,.088,.101],.43,.68,true);
surface('gray','brushed gray armor',[.125,.166,.177],.49,.60,true);
surface('dark','underside steel',[.041,.060,.064],.47,.72,true);
surface('black','recess',[.014,.020,.023],.29,.86);
surface('steel','fasteners and barrel steel',[.166,.175,.168],.66,.45,true);
surface('wheel','cast wheel',[.121,.162,.175],.43,.64,true);
surface('mark','vermillion markings',[.41,.093,.042],.20,.61,true);
surface('red','red optics',[.54,.049,.023],.13,.31,false,[.72,.025,.008]);
surface('white','warm searchlight lens',[.83,.81,.67],.16,.25,false,[.65,.51,.27]);
surface('cyan','teal armored glass',[.049,.171,.182],.46,.29,false,[.009,.034,.039]);
let data=bytes;
function add(parent,parts,name,keep){
  parent.children=parent.children.filter(i=>keep.includes(gltf.nodes[i].name));
  const output=appendParts(gltf,data,parts.parts,palette,name);data=output.bytes;
  parent.children.push(gltf.nodes.push({name,mesh:output.mesh})-1);
}
const hull=chassis(), turretBody=overhead(), {mount,barrel}=weapon();
root.extras.exteriorDetailParts=hull.parts.length+turretBody.parts.length+mount.parts.length+barrel.parts.length;
add(body,hull,'Vesper chassis',['turret','track_0','track_1']);
add(turret,turretBody,'Vesper elevated turret',['gun']);
add(gun,mount,'Vesper rail cradle',['recoiling-barrel','sight']);
add(recoil,barrel,'Vesper segmented barrel',['muzzle']);

function accessor(values,type){
  const binary=Buffer.from(new Float32Array(values).buffer);
  const view=gltf.bufferViews.push({buffer:0,byteOffset:data.length,byteLength:binary.length})-1;
  data=Buffer.concat([data,binary]);
  return gltf.accessors.push({bufferView:view,componentType:5126,type,count:values.length/(type==='VEC3'?3:4)})-1;
}
const R=d.trackRadius, half=d.trackEnd, arc=Math.PI*R;
const advance=(4*half+2*arc)/100;
for(const [side,sign] of [[0,-1],[1,1]]){
  const belt=node('track_'+side);
  belt.extras.poses=Array.from({length:100},(_,i)=>{
    const distance=i*advance;
    let y=d.trackY-R,z=-half+distance,a=0;
    if(distance>=4*half+arc){
      const offset=(distance-4*half-arc)/R;
      y=d.trackY+R*Math.cos(offset);z=-half-R*Math.sin(offset);a=Math.PI+offset;
    }else if(distance>=2*half+arc){
      y=d.trackY+R;z=half-(distance-2*half-arc);a=Math.PI;
    }else if(distance>=2*half){
      a=(distance-2*half)/R;y=d.trackY-R*Math.cos(a);z=half+R*Math.sin(a);
    }
    return [sign*d.trackX,y,z,-Math.sin(a/2),0,0,Math.cos(a/2)].map(v=>+v.toFixed(7));
  });
  for(const i of belt.children){
    const batch=gltf.nodes[i], mesh=gltf.nodes[batch.children[0]], p=mesh.translation;
    const s=mesh.scale[1];
    mesh.scale=[s*.69,s,s*.731];
    const poses=batch.extras.indices.map(i=>belt.extras.poses[i]);
    const attributes=mesh.extensions.EXT_mesh_gpu_instancing.attributes;
    attributes.TRANSLATION=accessor(poses.flatMap(pose=>pose.slice(0,3).map((v,i)=>(v-p[i])/mesh.scale[i])),'VEC3');
    attributes.ROTATION=accessor(poses.flatMap(pose=>pose.slice(3)),'VEC4');
  }
}
const output=serializeGlb(gltf,compactAsset(gltf,data));
await writeFile(file,output);
console.log(`${d.name} exported with ${root.extras.exteriorDetailParts} parts and animated track anchors.`);
