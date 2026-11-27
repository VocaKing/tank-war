// Artistic game audio presets; not measured acoustic signatures.
// Per-vehicle crack, body, metallic texture, tail. Caliber sets pitch and level.
export const GUN_VOICES=Object.freeze({
 sherman:[1.12,.82,.74,.84],tiger:[.84,1.14,.82,1.12],t34:[1.04,.93,1.06,.87],
 t72:[.96,1.03,.70,1.02],m1a2:[1.22,.94,.61,1.06],panther:[1.23,.85,.91,.93],
 is2:[.78,1.25,.82,1.22],pershing:[.94,1.02,.72,.98],centurion:[1.17,.92,.66,.96],
 leo1:[1.19,.86,.59,.92],leo2a6:[1.34,1.01,.55,1.07],t90m:[.93,1.11,.71,1.09],
 chally2:[.86,1.16,.83,1.15],type99a:[1.19,1.07,.67,.98],merkava4:[1.02,1.13,.57,1.13],
 mauseng:[.73,1.31,.91,1.30],m6a1:[1.06,.93,1.03,.91],r17:[1.31,.70,1.14,.69],
 at52:[.97,.91,.88,.97],t14:[1.14,1.05,.46,1.11],strv103:[1.05,1.01,.58,.83],
 fv4005s1:[.70,1.40,1.10,1.38],m50ontos:[1.35,.68,1.20,.78],centauro2:[1.27,.93,.81,.91],
 sprutsd:[1.15,.97,.89,.87],archer:[1.10,1.07,.61,1.29],bmpt:[1.42,.71,1.32,.65],
 '2s38':[1.28,.81,1.15,.72],xm8ags:[1.18,.85,1.02,.88],
 su100:[1.01,1.08,.95,.94],jagdpanther:[1.20,.94,.77,1.05],isu122:[.83,1.25,.94,1.14],
 jagdtiger:[.80,1.32,.81,1.24],amxfoch:[1.03,1.10,.74,1.01],pzh2000:[.90,1.20,.66,1.36],
 atlas:[.89,1.18,.95,1.12],basilisk:[1.02,1.23,.91,1.16],
 aegis140:[1.01,1.30,.51,1.24],bastion125:[.78,1.27,.66,1.24],harrier105:[1.33,.83,1.05,.80],
 warden130:[.90,1.22,.53,1.18],lancer120:[1.37,.90,.64,.93],leviathan160:[.68,1.43,1.02,1.42],
 thunderclad155:[.79,1.35,.93,1.50],tempest155:[1.01,1.13,.85,1.32],cerberus135:[1.18,1.19,.60,1.21],
 raptor90:[1.32,.78,1.12,.77],
});
const bound=(v,a,b)=>Math.max(a,Math.min(b,v));
function hashVoice(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
function voiceRandom(seed){let x=seed||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
export function gunProfile(id,caliber,kind='gun'){
 const mm=bound(Number(caliber)||100,20,220),k=mm/100;
 const [crack,body,metal,tail]=GUN_VOICES[id]||[1,1,1,1];
 return {id,kind,mm,crack,body,metal,tail,seed:hashVoice(id+'|'+mm+'|'+kind),
 pitch:96*Math.pow(k,-.73),gain:.74*Math.pow(k,.79),
 duration:bound((.42+.62*k)*tail,.40,2.5),attack:.0018+.0016*k,bodyDecay:.055+.077*k,
 tailDecay:.11+.15*k,airCut:Math.min(8200,4100*Math.pow(k,-.55))};
}
export function gunDistance(p,d,own=false){
 const distance=own?0:Math.max(0,d);
 return {distance,delay:distance/343,attenuation:Math.min(1,40/(distance+20)),cutoff:bound(p.airCut/(1+distance/170),260,p.airCut)};
}
// Bake deterministic, non-looping sound: impulse + filtered noise + damped bass,
// early reflections and mechanical texture. No sustained oscillator or per-shot reverb.
export function synthesizeGun(p,variant=0,rate=24000){
 const rng=voiceRandom((p.seed^Math.imul(variant+1,0x9e3779b9))>>>0);
 const n=Math.ceil(p.duration*rate),out=new Float32Array(n);
 let low=0,mid=0,air=0,phase=0,phase2=0,peak=0;
 const lp=f=>1-Math.exp(-2*Math.PI*f/rate);
 const aLow=lp(p.pitch*2.8),aMid=lp(530+p.pitch*2),aAir=lp(p.airCut);
 const phaseOffset=rng()*Math.PI*2,metalHz=(840+260*p.metal)*(100/p.mm)**.30;
 const missile=p.kind==='guided',tube=p.kind==='tube';
 const echo1=Math.round((.044+.012*p.tail)*rate),echo2=Math.round((.103+.018*p.tail)*rate);
 for(let i=0;i<n;i++){
   const t=i/rate,w=rng()*2-1;
   low+=aLow*(w-low);mid+=aMid*(w-mid);air+=aAir*(w-air);
   const rise=Math.min(1,t/p.attack),crackEnv=Math.exp(-t/(.009+.006*p.mm/100)),bodyEnv=Math.exp(-t/p.bodyDecay);
   const tailEnv=(1-Math.exp(-t/.018))*Math.exp(-t/(p.tailDecay*p.tail));
   const freq=p.pitch*(.62+.38*Math.exp(-t/.065));
   phase+=2*Math.PI*freq/rate;phase2+=2*Math.PI*(freq*1.67)/rate;
   const modal=(Math.sin(phase)+.24*Math.sin(phase2+phaseOffset))*.34;
   const snap=(air-mid)*p.crack*crackEnv*2.5;
   const boom=(low*2.0+modal)*p.body*bodyEnv;
   const roar=(mid-low)*1.4*p.body*tailEnv;
   const metal=(air-mid)*Math.sin(2*Math.PI*metalHz*t+phaseOffset)*.23*p.metal*Math.exp(-t/.085);
   const tubeRasp=tube?(air-low)*.45*Math.exp(-t/.12):0;
   const launch=missile?((air-mid)*.65+mid*.7)*(1-Math.exp(-t/.026))*Math.exp(-t/.18):0;
   let v=rise*(missile?.65*snap+.36*boom+launch:snap+boom+roar+metal+tubeRasp);
   if(i>=echo1)v+=out[i-echo1]*.20*p.tail;
   if(i>=echo2)v+=out[i-echo2]*.11*p.tail;
   v=Math.tanh(v*1.05)*Math.max(0,Math.min(1,(n-i-1)/(rate*.055)));
   out[i]=v;peak=Math.max(peak,Math.abs(v));
 }
 const early=Math.min(n,Math.floor(rate*.14));let energy=0;
 for(let i=0;i<early;i++)energy+=out[i]*out[i];
 const rms=Math.sqrt(energy/Math.max(1,early));
 const norm=Math.min(.90/Math.max(peak,.00001),.22/Math.max(rms,.00001));
 for(let i=0;i<n;i++)out[i]*=norm;
 out[0]=out[n-1]=0;
 return out;
}
