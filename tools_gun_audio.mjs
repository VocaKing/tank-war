import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {GUN_VOICES,gunProfile,gunDistance,synthesizeGun} from './src/game/gunAudio.js';
import {Audio} from './src/game/audio.js';
const vite=await createServer({appType:'custom',server:{middlewareMode:true,ws:false}});
try{
 const {TANKS}=await vite.ssrLoadModule('/src/game/tankData.js');
 assert.equal(TANKS.length,48);assert.equal(Object.keys(GUN_VOICES).length,48);
 assert.equal(new Set(Object.values(GUN_VOICES).map(v=>v.join(','))).size,48);
 const fingerprints=new Set();
 for(const t of TANKS){
   assert.ok(GUN_VOICES[t.id],t.id+' missing voice');
   const p=gunProfile(t.id,t.shells[0].caliber),sample=synthesizeGun(p);
   assert.ok(sample.length>=9000&&sample.length<=60000,t.id+' duration');
   let peak=0,energy=0,checksum=0;
   for(let i=0;i<sample.length;i++){const v=sample[i];assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));energy+=v*v;checksum+=v*Math.sin(i*.39);}
   assert.ok(peak>.15&&peak<=.901,t.id+' peak');assert.ok(energy>1);assert.equal(sample[0],0);assert.equal(sample.at(-1),0);
   fingerprints.add(checksum.toFixed(6));
   assert.notEqual(sample[1000],synthesizeGun(p,1)[1000]);
   assert.equal(sample[1000],synthesizeGun(p)[1000]);
 }
 assert.equal(fingerprints.size,48);
 let prev=null;
 for(const mm of [30,37,57,75,76,84,85,88,90,100,105,106,120,122,125,128,130,135,140,155,160,183]){
   const p=gunProfile('generic',mm);if(prev){assert.ok(p.pitch<prev.pitch);assert.ok(p.gain>prev.gain);}prev=p;
   const near=gunDistance(p,0),far=gunDistance(p,600);
   assert.ok(far.cutoff<near.cutoff&&far.attenuation<near.attenuation&&far.delay>near.delay);
   assert.equal(gunDistance(p,600,true).delay,0);
 }
 assert.notEqual(synthesizeGun(gunProfile('bmpt',130,'guided'))[1000],synthesizeGun(gunProfile('bmpt',130,'gun'))[1000]);
 const nodes=[];
 const node=()=>({connect(){},disconnect(){},gain:{value:0},frequency:{value:0},Q:{value:0},pan:{value:0},start(at){this.at=at;},stop(){this.onended?.();}});
 const a=new Audio();
 a.ctx={currentTime:10,createBuffer:(channels,n,rate)=>{const data=new Float32Array(n);return{getChannelData:()=>data,length:n,sampleRate:rate};},createBufferSource:()=>{const n=node();nodes.push(n);return n;},createBiquadFilter:node,createGain:node,createStereoPanner:node};
 a.master=node();a.setListener({x:0,y:0,z:0},{x:0,z:1});
 a.gun({x:343,y:0,z:0},120,false,'m1a2');assert.equal(nodes.at(-1).at,11);
 a.gun({x:343,y:0,z:0},120,true,'m1a2');assert.equal(nodes.at(-1).at,10);
 a.gun({x:0,y:0,z:0},120,true,'m1a2');assert.equal(a.gunCache.size,2);
 for(let i=0;i<60;i++)a.gun({x:50,y:0,z:0},57,false,'2s38');
 assert.ok(a.gunVoices.size<=36);
 a.clearGunVoices();assert.equal(a.gunVoices.size,0);
 console.log('48 distinct vehicle audio voices, caliber scaling, sample bounds, distance delay and audio voice limits verified.');
}finally{await vite.close();}
