// Independent tube readiness. No ammo is created; the tank's reserve is consumed per shot.
export class TubeReload {
 constructor(count, initial=1.5){this.timers=Array(count).fill(initial);this.cursor=0;}
 update(dt){this.timers=this.timers.map(t=>Math.max(0,t-dt));}
 required(count,ammo){return Math.max(0,Math.min(count,ammo,this.timers.length));}
 readyIn(count,ammo){const n=this.required(count,ammo);return n?this.timers.slice().sort((a,b)=>a-b)[n-1]:0;}
 available(count,ammo){
  const n=this.required(count,ammo), ready=[];
  for(let i=0;i<this.timers.length;i++){const k=(this.cursor+i)%this.timers.length;if(this.timers[k]<=0)ready.push(k);}
  return n&&ready.length>=n?ready.slice(0,n):[];
 }
 fire(indices,reload){for(const i of indices)this.timers[i]=reload; if(indices.length)this.cursor=(indices.at(-1)+1)%this.timers.length;}
 changeAmmo(reload){this.timers=this.timers.map(t=>Math.max(t,reload));}
}
