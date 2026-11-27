// Tier-restricted diversity-first 7v7 NPC matchmaking; tier is a game balance value.
export const TEAM_SIZE=7;
export const MAX_ADJACENT_PER_TEAM=2;
export const MIN_SAME_TIER=TEAM_SIZE-MAX_ADJACENT_PER_TEAM;
const shuffle=(list,r)=>{const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r.next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const role=t=>t.cls==='Super-heavy'?'Heavy':t.cls;
function roleCounts(team){const out={};for(const t of team){const k=role(t);out[k]=(out[k]||0)+1;}return out;}
function roleDiff(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].reduce((n,k)=>n+Math.abs((a[k]||0)-(b[k]||0)),0);}
function metrics(team){return [team.reduce((s,t)=>s+t.hp,0),team.reduce((s,t)=>s+Math.log1p(t.armor.hull.front[0])+Math.log1p(t.armor.turret.front[0]),0),team.reduce((s,t)=>s+Math.log1p(Math.max(...t.shells.map(sh=>sh.pen))),0),team.reduce((s,t)=>s+Math.log1p(t.shells[0].damage/Math.max(.1,t.reload)),0),team.reduce((s,t)=>s+t.viewRange,0)];}
function balanceScore(a,b){const x=metrics(a),y=metrics(b);return x.reduce((sum,v,i)=>sum+Math.abs(v-y[i])/Math.max(1,(v+y[i])/2)*[4,5,4,3,1][i],0)+.35*roleDiff(roleCounts(a),roleCounts(b));}
export function makeMatch(roster,playerId,r){
 const player=roster.find(t=>t.id===playerId);if(!player)throw Error('Unknown vehicle: '+playerId);
 const tier=player.tier,same=roster.filter(t=>t.tier===tier);
 const neighbors=[tier-1,tier+1].map(level=>({level,pool:roster.filter(t=>t.tier===level)})).filter(n=>n.pool.length);
 // Same-tier preferred; small pools use adjacent slots to reduce repetition.
 // Never admit both lower and higher tiers in a single battle.
 const draw=r.next();let adjacent=same.length>=14?(draw<.70?0:draw<.93?1:2):(draw<.2?1:2);
 adjacent=Math.min(MAX_ADJACENT_PER_TEAM,Math.max(adjacent,TEAM_SIZE-same.length,0));
 const eligible=neighbors.filter(n=>n.pool.length>=adjacent);let neighbor=null;
 if(adjacent&&eligible.length){const lower=eligible.find(n=>n.level<tier);neighbor=lower&&r.next()<.65?lower:eligible[Math.floor(r.next()*eligible.length)];}else adjacent=0;
 const groups=[{pool:same,n:TEAM_SIZE-adjacent,player},{pool:neighbor?.pool||[],n:adjacent,player:null}].filter(g=>g.n);
 const makeSide=(pool,n,required,avoid)=>{
  const out=required?[required]:[],used=new Set(out.map(t=>t.id));
  for(const t of shuffle(pool.filter(t=>!used.has(t.id)&&!avoid.has(t.id)),r)){if(out.length>=n)break;out.push(t);used.add(t.id);}
  for(const t of shuffle(pool.filter(t=>!used.has(t.id)),r)){if(out.length>=n)break;if(!used.has(t.id)){out.push(t);used.add(t.id);}}
  while(out.length<n){if(!pool.length)throw Error('Insufficient eligible vehicles');out.push(pool[Math.floor(r.next()*pool.length)]);}
  return out;
 };
 let best=null;
 // Exact tier parity; class and game-stat parity are approximate.
 for(let i=0;i<96;i++){
  const a=groups.flatMap(g=>makeSide(g.pool,g.n,g.player,new Set()));
  const avoid=new Set(a.map(t=>t.id));
  const b=groups.flatMap(g=>makeSide(g.pool,g.n,null,avoid));
  const unique=new Set([...a,...b].map(t=>t.id)).size;
  const internal=(a.length-new Set(a.map(t=>t.id)).size)+(b.length-new Set(b.map(t=>t.id)).size);
  const score=internal*10000+(14-unique)*100+balanceScore(a,b);
  if(!best||score<best.score)best={a,b,score};
 }
 return {team0:[player.id,...shuffle(best.a.slice(1),r).map(t=>t.id)],team1:shuffle(best.b,r).map(t=>t.id),tier,adjacentTier:neighbor?.level??null,adjacentPerTeam:adjacent};
}
