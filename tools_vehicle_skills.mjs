import assert from 'node:assert/strict';
import { VEHICLE_SKILLS, VehicleSkill, STATIONARY_SKILLS, skillKey } from './src/game/vehicleSkills.js';
import { TubeReload } from './src/game/tubeReload.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
function make(id,extra={}) {
 const t={spec:{id,skill:VEHICLE_SKILLS[id],reload:10,...extra},alive:true,hp:100,maxHp:100,game:{time:0,world:{controlPoint:{x:0,z:0,r:25},playHalf:600},tanks:[]},input:{throttle:0},speed:0,turnRate:0,pos:{x:0,z:0},crew:[{alive:false}],modules:{engine:0.5},team:0,apsCharges:0,reloadLeft:8};
 t.vehicleSkill=new VehicleSkill(t);return t;
}
assert.equal(Object.keys(VEHICLE_SKILLS).length,34);
for(const [id,cfg] of Object.entries(VEHICLE_SKILLS)){
 const t=make(id),s=t.vehicleSkill;
 assert.ok(s.status().includes(cfg.name));
 for(const key of ['dispersionMult','aimMult','reloadMult','speedMult','accelMult','turnMult','damageMult','repairMult','moduleMult','camoMult','fireCamoFactor'])assert.ok(Number.isFinite(s[key]),id+' '+key);
 if(STATIONARY_SKILLS.has(cfg.id)&&cfg.id!=='siege'){s.motion(cfg.prepare);assert.ok(s.prepared,id);t.turnRate=.05;s.motion(.1);assert.ok(s.prep>0);t.input.throttle=1;s.motion(.1);assert.equal(s.prep,0);}
}
{
 const t=make('strv103'),s=t.vehicleSkill;t.speed=3;assert.equal(s.activate(),false);t.speed=0;assert.ok(s.activate());s.motion(2);near(s.dispersionMult,.55);t.input.throttle=1;s.motion(.1);assert.equal(s.toggled,false);
}
{
 const t=make('warden130'),s=t.vehicleSkill;s.motion(4);near(s.dispersionMult,.775);s.motion(4);near(s.dispersionMult,.55);
 const b=make('jagdpanther').vehicleSkill;b.motion(5);b.onShot({damage:100});near(b.fireCamoFactor,.775);b.onShot({damage:100});near(b.fireCamoFactor,.25);
 const c=make('isu122').vehicleSkill;c.motion(6);near(c.onShot({damage:100}).damage,120);near(c.onShot({damage:100}).damage,100);
 const j=make('jagdtiger').vehicleSkill;j.motion(4);near(j.reloadMult,.9);near(j.dispersionMult,.7);
 const a=make('amxfoch').vehicleSkill;a.motion(3);const e={alive:true,team:1};let sh=a.onShot({});a.hit(e,sh);a.hit(e,sh);assert.equal(a.stacks,1);a.onShot({});a.onShot({});assert.equal(a.stacks,0);
}
{
 const s=make('centurion').vehicleSkill;assert.ok(s.activate());near(s.t.reloadLeft,4);assert.equal(s.activate(),false);s.update(40);assert.ok(s.activate());
 const r=make('merkava4').vehicleSkill;assert.ok(r.activate());assert.equal(r.charges,0);assert.equal(r.activate(),false);
 const a=make('t14',{aps:{charges:4}}).vehicleSkill;assert.ok(a.activate());assert.equal(a.t.apsCharges,1);
 const h=make('fv4005s1').vehicleSkill;assert.ok(h.activate());near(h.onShot({damage:100}).damage,120);near(h.afterReload(10),15);near(h.afterReload(10),10);
 const j=make('t90m').vehicleSkill;assert.ok(j.activate());assert.ok(j.jammed);j.update(6);assert.equal(j.jammed,false);
 const d=make('r17').vehicleSkill;assert.ok(d.activate());assert.equal(d.t.game.skillDecoys.length,1);assert.equal(d.t.game.skillDecoys[0].until,8);
}
{
 const t=make('2s38',{scan:{}}),s=t.vehicleSkill;assert.equal(skillKey(t.spec),'K');assert.ok(s.activate());near(s.burstIntervalMult,.7);for(let i=0;i<8;i++)s.onShot({});assert.equal(s.canFire,false);s.update(4);assert.ok(s.canFire);assert.equal(s.activate(),false);
 const g=make('chally2').vehicleSkill;assert.ok(g.activate());near(g.damageMult,.78);g.update(10);near(g.damageMult,1);
 const z=make('bastion125');near(z.vehicleSkill.damageMult,.9);z.speed=5;near(z.vehicleSkill.damageMult,.9);z.pos.x=25;near(z.vehicleSkill.damageMult,1);
}
{
 const t=new TubeReload(6,0);assert.deepEqual(t.available(1,6),[0]);t.fire([0],10);assert.deepEqual(t.available(2,5),[1,2]);t.fire([1,2],20);assert.deepEqual(t.available(6,6),[]);assert.equal(t.readyIn(6,6),20);t.update(10);assert.equal(t.readyIn(6,6),10);t.update(10);assert.equal(t.available(6,6).length,6);assert.equal(t.available(6,2).length,2);t.changeAmmo(8);assert.equal(t.readyIn(1,2),8);
}
console.log('Vehicle skill regression tests passed: 34 profiles, 7 stationary TDs, heat, cooldowns, charge and independent tubes.');
