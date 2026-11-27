import assert from 'node:assert/strict';
import {SPAWN_AREAS,chooseSpawnLayout,planSpawnPositions,spawnLane,isSpawnClear} from './src/game/spawnLayout.js';
import {RNG} from './src/util.js';
const n=200,cell=6,half=600;
const nav={n,cell,walkable:(i,j)=>i>=0&&j>=0&&i<n&&j<n,toCell:(x,z)=>[Math.max(0,Math.min(n-1,Math.floor((x+half)/cell))),Math.max(0,Math.min(n-1,Math.floor((z+half)/cell)))],center:(i,j)=>[-half+(i+.5)*cell,-half+(j+.5)*cell],nearestWalkable:(i,j)=>[i,j]};
const spec={dims:{L:9,W:4}};
for(const [mapId,areas] of Object.entries(SPAWN_AREAS)){
 const swaps=new Set(),counts=new Set(),playerLanes=new Set();
 for(let seed=1;seed<=48;seed++){
  const r=new RNG(seed),layout=chooseSpawnLayout(mapId,r);swaps.add(layout.swapped);counts.add(layout.groupCount);playerLanes.add(layout.teams[0].slots[0]);
  const bases=layout.teams.map(g=>({x:areas[g.side][1][0],z:areas[g.side][1][1]}));
  const world={def:{id:mapId},bases,playHalf:half,terrain:{height:()=>10,waterLevel:()=>-100,normal:()=>({y:1})}};
  // Place a mock obstacle directly at the anchor of a selected group.
  const blocked=layout.teams[0].zones[0];
  world.colGrid={query:()=>[{circle:(x,z,radius)=>Math.hypot(x-blocked.x,z-blocked.z)<radius+8}]};
  const specs=[Array(7).fill(spec),Array(7).fill(spec)];
  const positions=planSpawnPositions(world,nav,layout,specs,r);
  assert.equal(layout.teams[0].side,1-layout.teams[1].side);
  assert.equal(layout.groupCount,layout.teams[0].zones.length);
  for(const [team,slots] of positions.entries()){
   assert.equal(slots.length,7);assert.equal(new Set(slots.map(s=>s.lane)).size,layout.groupCount);
   assert.deepEqual(layout.teams[team].zones.map(z=>slots.filter(s=>s.lane===z.lane).length),layout.teams[team].zones.map(z=>z.count));
   for(const a of slots)assert.ok(isSpawnClear(world,nav,a.x,a.z,a.radius,slots.filter(b=>a!==b)));
   for(const a of layout.teams[team].zones)for(const b of layout.teams[team].zones)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=275);
   const centers=layout.teams[team].zones.map(z=>{const p=slots.filter(s=>s.lane===z.lane);return{x:p.reduce((sum,s)=>sum+s.x,0)/p.length,z:p.reduce((sum,s)=>sum+s.z,0)/p.length};});
   for(const [i,a] of centers.entries())for(const b of centers.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>200);
  }
 }
 assert.equal(swaps.size,2);assert.equal(counts.size,2);assert.equal(playerLanes.size,3);
}
const route=[[-400,0],[-300,0],[0,0],[300,0],[400,0]];
assert.deepEqual(spawnLane(route,0,{x:-310,z:20}),[[-310,20],[-300,0],[0,0],[300,0],[400,0]]);
assert.deepEqual(spawnLane(route,1,{x:310,z:20}),[[310,20],[300,0],[0,0],[-300,0],[-400,0]]);
console.log('144 distributed-spawn layouts: group counts, random sides, clearances, spacing and lane orientation verified.');
