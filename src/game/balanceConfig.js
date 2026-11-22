import { MIN_DISPERSION_100M } from './combatMath.js';
// Balance editor and game use the same whitelist and validation.
export const STORAGE_KEY='tw_balance_v1';
export const EMPTY=()=>({version:1,tanks:{}});
const def=(path,label,unit,min,max,step,group)=>({path,label,unit,min,max,step,group});
const core=[
 ['hp','生命值','HP',1,100000,1,'生存'],
 ['mass','重量','t',1,200,0.1,'机动'],['power','发动机功率','hp',1,5000,1,'机动'],
 ['maxSpeed','前进最高速度','km/h',1,200,0.1,'机动'],['reverseSpeed','倒车最高速度','km/h',1,100,0.1,'机动'],
 ['hullTraverse','车体转速','°/s',1,180,0.1,'机动'],['turretTraverse','炮塔转速','°/s',1,180,0.1,'火控'],
 ['gunSpeed','炮管俯仰速度','°/s',0.1,90,0.1,'火控'],['gunDepression','俯角','°',0,45,0.1,'火控'],['gunElevation','仰角','°',0,85,0.1,'火控'],
 ['reload','装填时间','s',0.1,120,0.1,'火控'],['aimTime','完整散布收缩时间','s',0.1,30,0.1,'火控'],['dispersion','百米最小散布半径','m',MIN_DISPERSION_100M,5,0.01,'火控'],
 ['viewRange','视野','m',50,1500,1,'侦察']
].map(x=>def(...x));
const faces={front:'正面',side:'侧面',rear:'后面',top:'顶部',bottom:'底部'};
export function fields(t){
 const out=core.slice();
 for(const part of ['hull','turret'])for(const face of Object.keys(t.armor[part])){
  const name=(part==='hull'?'车体':'炮塔')+faces[face],p='armor.'+part+'.'+face;
  out.push(def(p+'.0',name+'厚度','mm',0.1,3000,0.1,'装甲'),def(p+'.1',name+'倾角','°',0,89,0.1,'装甲'));
 }
 for(const [key,name] of [['lowerFront','首下'],['lowerSide','下侧'],['mantlet','炮盾']])if(t.armor[key]){
  out.push(def('armor.'+key+'.0',name+'厚度','mm',0.1,3000,0.1,'装甲'),def('armor.'+key+'.1',name+'倾角','°',0,89,0.1,'装甲'));
 }
 for(const [key,name,max] of [['era','HEAT 反应装甲附加量',3000],['eraKE','动能弹反应装甲附加量',3000],['skirt','侧裙附加防护',3000],['heatMult','HEAT 防护倍率',10]])if(key in t.armor)out.push(def('armor.'+key,name,key==='heatMult'?'×':'mm',key==='heatMult'?0.1:0,max,key==='heatMult'?0.01:1,'装甲'));
 for(let i=0;i<t.shells.length;i++){
  const sh=t.shells[i],group='弹药 '+(i+1)+' · '+sh.name;
  for(const [key,label,unit,min,max,step] of [['pen','百米穿深','mm',1,3000,1],['damage','单发伤害','HP',1,10000,1],['velocity','初速','m/s',100,2500,1],['count','默认携带量','发',0,500,1]])out.push(def('shells.'+i+'.'+key,label,unit,min,max,step,group));
 }
 for(const [key,values] of Object.entries({magazine:{size:['弹夹容量','发',1,30,1],intraReload:['连发间隔','s',0.1,30,0.1],fullReload:['弹夹装填','s',0.1,120,0.1]},scan:{cooldown:['冷却','s',0.1,300,0.1],maxTargets:['最大扫描目标','辆',1,14,1],range:['扫描范围','m',50,1500,1]},overpen:{shots:['强化发数','发',1,30,1],mult:['穿深倍率','×',1,5,0.01],cooldown:['冷却','s',0.1,300,0.1]},overspeed:{mult:['速度倍率','×',1,5,0.01],duration:['持续时间','s',0.1,120,0.1],cooldown:['冷却','s',0.1,300,0.1]},stabilize:{duration:['持续时间','s',0.1,120,0.1],cooldown:['冷却','s',0.1,300,0.1]},selfDestruct:{radius:['范围','m',1,100,0.1]}})){
  if(t[key])for(const [k,v] of Object.entries(values))if(k in t[key])out.push(def(key+'.'+k,...v,'特殊技能'));
 }
 return out;
}
export const read=(obj,path)=>path.split('.').reduce((v,k)=>v[k],obj);
function write(obj,path,value){const keys=path.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k],obj)[last]=value;}
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
export const clone=o=>JSON.parse(JSON.stringify(o));
export function validate(config,baseline){
 if(!plain(config)||config.version!==1||!plain(config.tanks))throw Error('配置格式错误：需要 version: 1 和 tanks。');
 const clean=EMPTY(),byId=new Map(baseline.map(t=>[t.id,t]));
 for(const [id,patch] of Object.entries(config.tanks)){
  const t=byId.get(id);if(!t||!plain(patch))throw Error('未知坦克或配置：'+id);
  const allowed=new Map(fields(t).map(f=>[f.path,f])), next={};
  for(const [path,value] of Object.entries(patch)){
   const f=allowed.get(path);if(!f)throw Error(id+' 不支持字段 '+path);
   if(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max||(f.step===1&&!Number.isInteger(value)))throw Error(t.short+' / '+f.label+'：必须为 '+f.min+' 至 '+f.max+' 的'+(f.step===1?'整数':'数值'));
   next[path]=value;
  }
  const total=t.shells.reduce((sum,sh,i)=>sum+(next['shells.'+i+'.count']??sh.count),0);
  if(total<1||total>500)throw Error(t.short+' 总弹药必须为 1–500 发');
  if(Object.keys(next).length)clean.tanks[id]=next;
 }
 return clean;
}
export function effective(baseline,config){
 const checked=validate(config,baseline),result=clone(baseline);
 for(const t of result){
  const patch=checked.tanks[t.id]||{};
  for(const [path,value] of Object.entries(patch))write(t,path,value);
  t.ammoCap=t.shells.reduce((n,s)=>n+s.count,0);t.defaultLoadout=t.shells.map(s=>s.count);
  if(Object.keys(patch).some(p=>p.startsWith('shells.')))for(const sh of t.shells)sh.role='Custom balance: '+sh.pen+' mm / '+sh.damage+' HP';
 }
 return result;
}
export function diff(baseline,values){
 const config=EMPTY();
 for(const t of baseline){const v=values.find(s=>s.id===t.id),patch={};if(!v)continue;for(const f of fields(t)){const x=read(v,f.path);if(x!==read(t,f.path))patch[f.path]=x;}if(Object.keys(patch).length)config.tanks[t.id]=patch;}
 return validate(config,baseline);
}
export function loadLocal(baseline){
 try{const raw=globalThis.localStorage?.getItem(STORAGE_KEY);return raw?{config:validate(JSON.parse(raw),baseline),error:''}:{config:null,error:''};}
 catch(e){return {config:null,error:String(e.message||e)};}
}
export function saveLocal(config,baseline){
 const clean=validate(config,baseline);
 globalThis.localStorage.setItem(STORAGE_KEY,JSON.stringify(clean));
 return clean;
}
