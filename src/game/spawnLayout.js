// Distributed spawn areas in fictional game maps, indexed by physical side
// and existing map lane. Coordinates are game-world metres, not real locations.
export const SPAWN_AREAS={
 village:[
  [[-450,-350],[-450,-20],[-450,350]],
  [[450,-350],[450,40],[450,350]]
 ],
 forest:[
  [[-510,-75],[-430,-430],[-75,-510]],
  [[75,510],[430,430],[510,75]]
 ],
 desert:[
  [[-470,100],[-460,430],[-100,510]],
  [[100,-510],[460,-400],[510,-55]]
 ]
};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const shuffled=(items,r)=>{const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r.next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
export function chooseSpawnLayout(mapId,r){
 const areas=SPAWN_AREAS[mapId];if(!areas)throw Error('No spawn areas for '+mapId);
 const swapped=r.next()<.5,lanes=r.next()<.45?[0,2]:[0,1,2];
 // 4+3 or 3+2+2, with the larger group assigned randomly.
 const large=lanes[Math.floor(r.next()*lanes.length)];
 const teams=[0,1].map(team=>{
  const side=swapped?1-team:team;
  const zones=lanes.map(lane=>({lane,x:areas[side][lane][0],z:areas[side][lane][1],count:(lanes.length===2?3:2)+(lane===large?1:0)}));
  // Both sides have identical group sizes; individual tank-to-group assignment
  // is shuffled, including the player's location.
  return {side,zones,slots:shuffled(zones.flatMap(z=>Array.from({length:z.count},()=>z.lane)),r)};
 });
 return {swapped,groupCount:lanes.length,teams};
}
// Flood only traversable nav cells. Spawn candidates must be connected to the
// team's own base, so a locally flat but isolated patch is not accepted.
function reachable(nav,base){
 const [i,j]=nav.nearestWalkable(...nav.toCell(base.x,base.z)),n=nav.n;
 const seen=new Uint8Array(n*n),q=new Int32Array(n*n);
 if(!nav.walkable(i,j))throw Error('No traversable base cell');
 let a=0,b=1;q[0]=j*n+i;seen[q[0]]=1;
 while(a<b){const k=q[a++],x=k%n,y=(k/n)|0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const u=x+dx,v=y+dz,m=v*n+u;if(!nav.walkable(u,v)||seen[m])continue;seen[m]=1;q[b++]=m;}
 }
 return seen;
}
export function isSpawnClear(world,nav,x,z,radius,occupied=[],connected=null){
 if(Math.abs(x)+radius>world.playHalf-12||Math.abs(z)+radius>world.playHalf-12)return false;
 const [i,j]=nav.toCell(x,z);
 if(!nav.walkable(i,j)||connected&&!connected[j*nav.n+i])return false;
 const T=world.terrain;
 for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*.707,radius*.707],[-radius*.707,radius*.707],[radius*.707,-radius*.707],[-radius*.707,-radius*.707]]){
  const u=x+dx,v=z+dz,h=T.height(u,v),normal=T.normal(u,v);
  if(T.waterLevel(u,v)>h-.05||normal.y<.955)return false;
  if(!nav.walkable(...nav.toCell(u,v)))return false;
 }
 if(world.colGrid?.query(x,z,radius).some(c=>c.circle(x,z,radius)))return false;
 if(world.veg?.rockGrid?.query(x,z,radius+5).some(o=>Math.hypot(o.x-x,o.z-z)<radius+o.s+1))return false;
 if(world.veg?.treeGrid?.query(x,z,radius+3).some(o=>o.alive!==false&&Math.hypot(o.x-x,o.z-z)<radius+2))return false;
 if(occupied.some(o=>dist(o,{x,z})<Math.max(16,radius+o.radius+4)))return false;
 return true;
}
export function planSpawnPositions(world,nav,layout,specs,r){
 const occupied=[],teams=[];
 for(let team=0;team<2;team++){
  const group=layout.teams[team],connected=reachable(nav,world.bases[team]),result=[];
  const base=world.bases[team],other=world.bases[1-team];
  const heading=Math.atan2(other.x-base.x,other.z-base.z);
  for(let i=0;i<specs[team].length;i++){
   const spec=specs[team][i],lane=group.slots[i],zone=group.zones.find(z=>z.lane===lane);
   const radius=Math.hypot(spec.dims.L,spec.dims.W)/2+1.2;
   const [ci,cj]=nav.toCell(zone.x,zone.z);
   let best=null,score=Infinity;
   // Search in widening rings; prioritize a compact cluster of safe positions
   // with non-overlapping hull clearance. Never use a blocked fallback.
   for(const maxRange of [48,72,102]){
    const cells=Math.ceil(maxRange/nav.cell);
    for(let dz=-cells;dz<=cells;dz++)for(let dx=-cells;dx<=cells;dx++){
     const a=ci+dx,b=cj+dz;if(!nav.walkable(a,b))continue;
     const [x,z]=nav.center(a,b),d=Math.hypot(x-zone.x,z-zone.z);
     if(d>maxRange||d>=score+12)continue;
     if(!isSpawnClear(world,nav,x,z,radius,occupied,connected))continue;
     const s=d+r.next()*12;
     if(s<score){score=s;best={x,z,radius,lane,heading,team};}
    }
    if(best)break;
   }
   if(!best)throw Error('No safe spawn position in '+world.def.id+' side '+group.side+' lane '+lane);
   occupied.push(best);result.push(best);
  }
  teams.push(result);
 }
 return teams;
}
// Join the existing lane ahead of the actual spawn rather than returning to
// the old central base. World lanes are already oriented to team 0.
export function spawnLane(lane,team,pos){
 const route=lane.map(p=>p.slice());if(team===1)route.reverse();
 let closest=1,d=Infinity;
 for(let i=1;i<route.length-1;i++){const q=route[i],v=Math.hypot(pos.x-q[0],pos.z-q[1]);if(v<d){closest=i;d=v;}}
 return [[pos.x,pos.z],...route.slice(closest)];
}
