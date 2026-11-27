import assert from 'node:assert/strict';
import {makeMatch} from './src/game/matchmaking.js';
import {createServer} from 'vite';
const vite=await createServer({appType:'custom',server:{middlewareMode:true,ws:false}});
try{
 const {TANKS}=await vite.ssrLoadModule('/src/game/tankData.js');
 const {RNG}=await vite.ssrLoadModule('/src/util.js');
 assert.equal(TANKS.length,47);
 const byId=Object.fromEntries(TANKS.map(t=>[t.id,t]));
 const tierCounts=[1,2,3,4].map(tier=>TANKS.filter(t=>t.tier===tier).length);
 assert.deepEqual(tierCounts,[7,11,8,21]);
 let total=0,strict=0,duplicates=0;
 for(const player of TANKS){
  const lineups=new Set();
  for(let seed=1;seed<=32;seed++){
   const m=makeMatch(TANKS,player.id,new RNG(seed));
   assert.equal(m.team0[0],player.id);
   assert.equal(m.tier,player.tier);
   assert.equal(m.team0.length,7);assert.equal(m.team1.length,7);
   assert.equal(new Set(m.team0).size,7);assert.equal(new Set(m.team1).size,7);
   const all=[...m.team0,...m.team1].map(id=>byId[id]);
   assert.ok(Math.max(...all.map(t=>t.tier))-Math.min(...all.map(t=>t.tier))<=1);
   assert.ok(m.adjacentPerTeam<=2);
   for(const team of [m.team0,m.team1]){
    const same=team.filter(id=>byId[id].tier===player.tier).length;
    assert.equal(same,7-m.adjacentPerTeam);assert.ok(same>=5);
    assert.ok(team.every(id=>Math.abs(byId[id].tier-player.tier)<=1));
   }
   const upperBound=Math.min(tierCounts[player.tier-1],2*(7-m.adjacentPerTeam))+
    (m.adjacentPerTeam?Math.min(tierCounts[m.adjacentTier-1],2*m.adjacentPerTeam):0);
   assert.equal(new Set(all.map(t=>t.id)).size,upperBound,'Cross-team repeats only when distinct eligible cars are exhausted');
   lineups.add(m.team0.slice().sort().join(',')+'|'+m.team1.slice().sort().join(','));
   if(!m.adjacentPerTeam)strict++;
   duplicates+=14-upperBound;total++;
  }
  assert.ok(lineups.size>1,player.id+' lacks variation');
 }
 console.log('Matchmaking verified',total,'matches; strictly same tier:',strict,'unavoidable repeats:',duplicates);
}finally{await vite.close();}
