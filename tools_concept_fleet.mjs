// Browser integration test: ten new concepts + previously shipped specialist fleet.
// Run with Vite at http://127.0.0.1:5173/ (npm run dev -- --host 127.0.0.1).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url=process.argv[2]||'http://127.0.0.1:5173/';
const ids=['aegis140','bastion125','harrier105','warden130','lancer120',
           'leviathan160','thunderclad155','tempest155','cerberus135','raptor90'];
const existing=['t14','strv103','fv4005s1','m50ontos','centauro2',
                'sprutsd','archer','bmpt','2s38','xm8ags'];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:540}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
let roster=[];
for(const id of ids){
  await page.goto(`${url}?autostart=1&map=village&tank=${id}&q=low&seed=2026`);
  await page.waitForFunction(key=>window.__game?.player?.spec?.id===key,id,{timeout:180000});
  if(!roster.length) roster=await page.evaluate(async()=>{
    const {TANKS}=await import('/src/game/tankData.js');
    return TANKS.map(t=>t.id);
  });
  const r=await page.evaluate(key=>{
    const g=window.__game,p=g.player,d=p.spec.dims,T=p.pos.constructor;
    const result={id:key,model:!!p.model?.root,modelName:p.model?.root?.name,stats:p.spec.systemTag};
    p.reloadLeft=0;p.speed=0;p.turnRate=0;p.aimError=0;
    p.input.throttle=0;p.input.steer=0;
    p.input.aim.set(p.pos.x+250,p.pos.y+18,p.pos.z+250);
    if(p.spec.eraLayout){
      const group=p.spec.eraLayout[0],face=group.face,part=group.part;
      const hit={part,face,sideSign:1,
        local:new T(face==='side'?d.W*.5:0,part==='hull'?d.hullH*.7:d.turretH*.5,0),
        ldir:new T(face==='side'?-1:0,0,face==='front'?-1:0)};
      const sh=p.spec.shells[1],typ={heat:true,he:false,hesh:false,ricochet:180};
      const tile=p.spec.eraLayout?.length>0?p.consumeERA(hit,sh,typ):false;
      Object.assign(result,{eraMeshes:p.model.eraMeshes?.size,eraConsumed:tile,eraSpent:p.eraSpent.size});
    }
    if(key==='aegis140'){
      const center=p.pos.clone();center.y+=d.hullH*.62;
      const threat={owner:{team:1},type:{heat:true},spec:{}};
      const intercepted=p.tryAPS(threat,center);p.apsCooldown=0;
      p.apsRechargeTime=p.spec.aps.rechargeSeconds;
      p.update(0.08,g.time);
      Object.assign(result,{intercepted,apsRecharged:p.apsCharges===1});
    }
    if(key==='bastion125'){
      const hit={part:'turret',face:'rear',sideSign:0,local:new T(0,d.turretH*.45,-d.turretL*.45),ldir:new T(0,0,1)};
      result.rearHeatProtection=p.armorAt(hit,p.spec.shells[1],{heat:true,he:false,ricochet:180}).eff;
      result.blowout=!!p.spec.blowoutAmmo;
    }
    if(key==='harrier105'||key==='raptor90')result.openTop=!!p.spec.openTop;
    if(key==='warden130'||key==='lancer120'){
      const baseline=p.dispersion();
      p.stationarySeconds=5;
      const precision=p.dispersion();
      result.precisionRatio=precision/baseline;
    }
    if(key==='leviathan160')result.dozer=p.spec.dozerAssist;
    if(key==='thunderclad155'||key==='tempest155'){
      const started=p.setSpade(true);
      p.updateSpade(5,g.time);
      result.spadeReady=started&&p.spadeState==='deployed'&&!!p.model.spade;
    }
    if(key==='tempest155'){
      p.ammo[0]=Math.max(2,p.ammo[0]);p.input.aim.set(p.pos.x+180,p.pos.y+14,p.pos.z+400);
      const fired=p.tryFire(g.time);const queue=!!p.mrsiQueue;
      const first=g.ballistics.shells.length;
      p.update(2.1,g.time+2.1);
      result.mrsi={fired,queue,first,after:g.ballistics.shells.length,remainingQueue:!!p.mrsiQueue};
    }
    if(key==='cerberus135'){
      const a=p.aimTime();p.modules.turret=0.5;result.fcsSlowdown=p.aimTime()/a;
      result.crewCapsule=!!p.spec.crewCapsule;
    }
    return result;
  },id);
  results.push(r);
}
await browser.close();
console.log(JSON.stringify({results,errors,rosterCount:roster.length},null,2));
for(const id of ids)assert.ok(roster.includes(id),'missing concept '+id);
for(const id of existing)assert.ok(roster.includes(id),'previous specialist lost '+id);
assert.equal(results.length,10);
for(const r of results){
 assert.ok(r.model,'model missing: '+r.id);
 assert.equal(r.modelName,r.id,'model identity differs');
}
for(const id of ['aegis140','bastion125','warden130','lancer120','cerberus135']){
 const r=results.find(x=>x.id===id);
 assert.ok(r.eraMeshes>0&&r.eraConsumed&&r.eraSpent===1,'ERA not consumable: '+id);
}
assert.ok(results.find(r=>r.id==='aegis140').intercepted,'Aegis APS failed');
assert.ok(results.find(r=>r.id==='aegis140').apsRecharged,'Aegis APS failed to recharge');
assert.ok(results.find(r=>r.id==='bastion125').blowout,'Bastion blow-out panel flag missing');
assert.ok(results.find(r=>r.id==='harrier105').openTop&&results.find(r=>r.id==='raptor90').openTop,'open-top roster failed');
assert.ok(results.find(r=>r.id==='warden130').precisionRatio<0.6,'Warden siege failed');
assert.ok(results.find(r=>r.id==='lancer120').precisionRatio<0.6,'Lancer first-shot bonus failed');
assert.ok(results.find(r=>r.id==='leviathan160').dozer>0.1,'dozer not equipped');
assert.ok(results.find(r=>r.id==='thunderclad155').spadeReady,'heavy SPG deployment failed');
assert.ok(results.find(r=>r.id==='tempest155').spadeReady,'mobile SPG deployment failed');
const mrsi=results.find(r=>r.id==='tempest155').mrsi;
assert.ok(mrsi.fired&&mrsi.queue&&mrsi.first===1&&mrsi.after===2&&!mrsi.remainingQueue,'MRSI two-round sequence failed');
assert.ok(results.find(r=>r.id==='cerberus135').crewCapsule&&results.find(r=>r.id==='cerberus135').fcsSlowdown>1.5,'Cerberus fire control penalty failed');
assert.deepEqual(errors,[],'browser runtime errors occurred');
