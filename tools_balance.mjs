// Run with node tools_balance.mjs. Executes the real tank data initialization
// with a simulated browser storage, including a second load (refresh).
import assert from 'node:assert/strict';
import { MIN_DISPERSION_100M } from './src/game/combatMath.js';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./src/game/tankData.js',import.meta.url),'utf8');
const config=await readFile(new URL('./src/game/balanceConfig.js',import.meta.url),'utf8');
const strip=s=>s.replace(/^import .*$/gm,'').replace(/^export /gm,'');
const store=new Map(),env={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
const api=new Function('globalThis','MIN_DISPERSION_100M',strip(config)+'\nreturn {STORAGE_KEY,EMPTY,clone,effective,loadLocal,saveLocal,diff};')(env,MIN_DISPERSION_100M);
function load(published=api.EMPTY()){
 return new Function('publishedBalance','clone','effective','loadLocal','EMPTY',strip(source)+'\nreturn {TANKS,TANK_BY_ID,STOCK_TANKS,armorZone,penAtRange,sanitizeLoadout,BALANCE_STATUS};')(published,api.clone,api.effective,api.loadLocal,api.EMPTY);
}
const stock=load().STOCK_TANKS,cfg=api.EMPTY();
cfg.tanks.tiger={hp:2222,maxSpeed:31,reload:6.5,dispersion:1.65,'armor.hull.front.0':123,'armor.hull.front.1':25,'shells.0.damage':555,'shells.0.pen':444,'shells.0.count':60};
api.saveLocal(cfg,stock);
const game=load(),t=game.TANK_BY_ID.tiger;
assert.equal(t.hp,2222);assert.equal(t.maxSpeed,31);assert.equal(t.reload,6.5);assert.equal(t.dispersion,1.65);
assert.equal(t.shells[0].damage,555);assert.equal(game.penAtRange(t.shells[0],100),444);
assert.deepEqual(game.armorZone(t,'hull','front',{y:1.9})[0],[123,25]);
assert.equal(t.ammoCap,t.shells.reduce((a,s)=>a+s.count,0));
assert.equal(game.sanitizeLoadout(t,null).reduce((a,b)=>a+b,0),t.ammoCap);
assert.equal(game.TANKS.find(x=>x.id==='tiger'),t);
assert.deepEqual(api.diff(stock,game.TANKS),cfg);
assert.throws(()=>api.saveLocal({version:1,tanks:{tiger:{hp:-1}}},stock));
assert.equal(load().TANK_BY_ID.tiger.hp,2222);
env.localStorage.removeItem(api.STORAGE_KEY);
assert.equal(load().TANK_BY_ID.tiger.hp,stock.find(t=>t.id==='tiger').hp);
assert.equal(load(cfg).TANK_BY_ID.tiger.hp,2222);
store.set(api.STORAGE_KEY,JSON.stringify({version:1,tanks:{tiger:{hp:2222,dispersion:0.35}}}));
assert.equal(load().TANK_BY_ID.tiger.dispersion,MIN_DISPERSION_100M);
assert.equal(load().TANK_BY_ID.tiger.hp,2222);
assert.ok(stock.every(t=>t.dispersion>=MIN_DISPERSION_100M));
console.log('Balance integration checks passed.');
