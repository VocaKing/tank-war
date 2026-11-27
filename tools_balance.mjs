// Run with node tools_balance.mjs. Executes the real tank data initialization
// with a simulated browser storage, including a second load (refresh).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SPECIALIST_TANKS} from './src/game/specialistTanks.js';
import {EXPANSION_TANKS} from './src/game/expansionTanks.js';
import {CONCEPT_VEHICLES} from './src/game/conceptVehicles.js';
import {VEHICLE_SKILLS} from './src/game/vehicleSkills.js';
const source=await readFile(new URL('./src/game/tankData.js',import.meta.url),'utf8');
const config=await readFile(new URL('./src/game/balanceConfig.js',import.meta.url),'utf8');
const strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');
const store=new Map(),env={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
const api=new Function('globalThis',strip(config)+'\nreturn {STORAGE_KEY,EMPTY,clone,effective,legacyMaxDispersion,loadLocal,saveLocal,diff};')(env);
function load(published=api.EMPTY()){
 return new Function('publishedBalance','clone','effective','legacyMaxDispersion','loadLocal','EMPTY','SPECIALIST_TANKS','EXPANSION_TANKS','CONCEPT_VEHICLES','VEHICLE_SKILLS',strip(source)+'\nreturn {TANKS,TANK_BY_ID,STOCK_TANKS,armorZone,penAtRange,sanitizeLoadout,BALANCE_STATUS,refreshLocalBalance};')(published,api.clone,api.effective,api.legacyMaxDispersion,api.loadLocal,api.EMPTY,SPECIALIST_TANKS,EXPANSION_TANKS,CONCEPT_VEHICLES,VEHICLE_SKILLS);
}
const stock=load().STOCK_TANKS,cfg=api.EMPTY();
const stockTiger=stock.find(t=>t.id==='tiger');
assert.equal(stock.length,47);
assert.equal(new Set(stock.map(t=>t.id)).size,47);
const td=stock.filter(t=>t.cls==='Tank Destroyer');
const others=stock.filter(t=>t.cls!=='Tank Destroyer');
assert.equal(td.length,11);
for(const tank of stock){
 assert.ok(tank.dispersion>=0.2&&tank.dispersion<=0.95,tank.id+' stock minimum');
 assert.ok(tank.maxDispersion>=1.1&&tank.maxDispersion<=1.87,tank.id+' stock maximum');
 assert.ok(tank.dispersion<tank.maxDispersion,tank.id+' independent radii');
}
assert.ok(Math.max(...td.map(t=>t.dispersion))<Math.min(...others.map(t=>t.dispersion)));
assert.ok(Math.max(...td.map(t=>t.maxDispersion))<Math.min(...others.map(t=>t.maxDispersion)));
for(const tank of stock) {
 const published=load().TANK_BY_ID[tank.id];
 assert.equal(published.dispersion,tank.dispersion);
 assert.equal(published.maxDispersion,tank.maxDispersion);
}
cfg.tanks.tiger={hp:2222,maxSpeed:31,reload:6.5,aimTime:1.3,dispersion:0.35,maxDispersion:stockTiger.maxDispersion,'armor.hull.front.0':123,'armor.hull.front.1':25,'shells.0.damage':555,'shells.0.pen':444,'shells.0.count':60};
env.localStorage.setItem(api.STORAGE_KEY,JSON.stringify(cfg));
const game=load(),t=game.TANK_BY_ID.tiger;
assert.equal(t.hp,2222);assert.equal(t.maxSpeed,31);assert.equal(t.reload,6.5);assert.equal(t.dispersion,0.35);
assert.equal(t.aimTime,1.3);assert.equal(t.maxDispersion,stockTiger.maxDispersion);
assert.equal(t.shells[0].damage,555);assert.equal(game.penAtRange(t.shells[0],100),444);
assert.deepEqual(game.armorZone(t,'hull','front',{y:1.9})[0],[123,stockTiger.armor.hull.front[1]]);
assert.equal(t.ammoCap,t.shells.reduce((a,s)=>a+s.count,0));
assert.equal(game.sanitizeLoadout(t,null).reduce((a,b)=>a+b,0),t.ammoCap);
assert.equal(game.TANKS.find(x=>x.id==='tiger'),t);
const clean=api.diff(stock,game.TANKS);
assert.equal(clean.tanks.tiger['armor.hull.front.0'],123);
assert.ok(!('armor.hull.front.1' in clean.tanks.tiger));
assert.deepEqual(api.saveLocal(cfg,stock),clean);
assert.throws(()=>api.saveLocal({version:1,tanks:{tiger:{hp:-1}}},stock));
assert.throws(()=>api.saveLocal({version:1,tanks:{tiger:{dispersion:-0.01}}},stock));
assert.throws(()=>api.saveLocal({version:1,tanks:{tiger:{dispersion:0.35,maxDispersion:0.34}}},stock),/最大散布半径/);
assert.equal(load().TANK_BY_ID.tiger.hp,2222);
env.localStorage.removeItem(api.STORAGE_KEY);
assert.equal(load().TANK_BY_ID.tiger.hp,stock.find(t=>t.id==='tiger').hp);
assert.equal(game.refreshLocalBalance(), true);
assert.equal(game.BALANCE_STATUS.source, 'published');
assert.equal(game.TANK_BY_ID.tiger.hp, stockTiger.hp);
assert.equal(game.refreshLocalBalance(), false);
assert.equal(t.hp, 2222, 'Refreshing the roster must preserve a battle’s existing spec');
api.saveLocal({ version: 1, tanks: { tiger: { 'armor.hull.rear.0': 3000, 'shells.0.pen': 400 } } }, stock);
assert.equal(game.refreshLocalBalance(), true);
assert.equal(game.BALANCE_STATUS.source, 'local');
assert.equal(game.TANK_BY_ID.tiger.armor.hull.rear[0], 3000);
assert.equal(game.TANK_BY_ID.tiger.shells[0].pen, 400);
assert.equal(game.TANKS.find(x => x.id === 'tiger'), game.TANK_BY_ID.tiger);
env.localStorage.removeItem(api.STORAGE_KEY);
assert.equal(load(cfg).TANK_BY_ID.tiger.hp,2222);
assert.equal(load(cfg).TANK_BY_ID.tiger.dispersion,0.35);
assert.equal(load(cfg).TANK_BY_ID.tiger.maxDispersion,stockTiger.maxDispersion);
const legacy={version:1,tanks:{tiger:{dispersion:0.25}}};
assert.equal(load(legacy).TANK_BY_ID.tiger.maxDispersion,1.125);
api.saveLocal(legacy,stock);
assert.equal(load().TANK_BY_ID.tiger.maxDispersion,1.125);
api.saveLocal({version:1,tanks:{tiger:{dispersion:0}}},stock);
assert.equal(load().TANK_BY_ID.tiger.dispersion,0);
assert.equal(load().TANK_BY_ID.tiger.maxDispersion,0);
api.saveLocal({version:1,tanks:{tiger:{dispersion:0,maxDispersion:2}}},stock);
assert.equal(load().TANK_BY_ID.tiger.maxDispersion,2);
const specialists = {
  version: 1,
  tanks: {
    mauseng: { 'dozer.travel': 4.8, 'dozer.charges': 5 },
    m6a1: { 'secondary.reload': 3.2, 'secondary.rounds': 42, 'secondary.shell.damage': 64 },
    r17: { 'rearDriver.maxSpeed': 47 },
    at52: { 'amphibious.speed': 14 },
  },
};
api.saveLocal(specialists, stock);
const adjusted = load();
assert.equal(adjusted.TANK_BY_ID.mauseng.dozer.travel, 4.8);
assert.equal(adjusted.TANK_BY_ID.m6a1.secondary.shell.damage, 64);
assert.equal(adjusted.TANK_BY_ID.r17.rearDriver.maxSpeed, 47);
assert.equal(adjusted.TANK_BY_ID.at52.amphibious.speed, 14);
assert.deepEqual(api.diff(stock, adjusted.TANKS), specialists);
const skillBalance={version:1,tanks:{warden130:{'skill.prepare':10,'skill.mult':0.6},chally2:{'skill.cooldown':50,'skill.duration':12}}};
api.saveLocal(skillBalance,stock);
const skillAdjusted=load();
assert.equal(skillAdjusted.TANK_BY_ID.warden130.skill.prepare,10);
assert.equal(skillAdjusted.TANK_BY_ID.chally2.skill.duration,12);
assert.deepEqual(api.diff(stock,skillAdjusted.TANKS),skillBalance);
assert.throws(()=>api.saveLocal({version:1,tanks:{warden130:{'skill.prepare':0}}},stock));
// The requested ranges are stock values only, not editor limits.
const unrestricted={version:1,tanks:{warden130:{dispersion:0.05,maxDispersion:3.5},sherman:{dispersion:1.2,maxDispersion:5}}};
api.saveLocal(unrestricted,stock);
assert.equal(load().TANK_BY_ID.warden130.dispersion,0.05);
assert.equal(load().TANK_BY_ID.warden130.maxDispersion,3.5);
assert.equal(load().TANK_BY_ID.sherman.dispersion,1.2);
assert.equal(load().TANK_BY_ID.sherman.maxDispersion,5);
assert.deepEqual(api.diff(stock,load().TANKS),unrestricted);
console.log('Balance integration checks passed, including all 47 stock dispersion pairs and unrestricted custom ranges.');
