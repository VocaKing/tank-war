// Balance editor and game use the same whitelist and validation.
export const STORAGE_KEY='tw_balance_v1';
export const EMPTY=()=>({version:1,tanks:{}});
// Older profiles encode only the minimum and used a 4.5× maximum.
export const legacyMaxDispersion = minimum => Math.max(minimum, Number((minimum * 4.5).toFixed(6)));
function maxDispersionFor(tank, patch) {
 return patch.maxDispersion ?? (patch.dispersion === undefined ? tank.maxDispersion : legacyMaxDispersion(patch.dispersion));
}
const def=(path,label,unit,min,max,step,group)=>({path,label,unit,min,max,step,group});
const core=[
 ['hp','生命值','HP',1,100000,1,'生存'],
 ['mass','重量','t',1,200,0.1,'机动'],['power','发动机功率','hp',1,5000,1,'机动'],
 ['maxSpeed','前进最高速度','km/h',1,200,0.1,'机动'],['reverseSpeed','倒车最高速度','km/h',1,100,0.1,'机动'],
 ['hullTraverse','车体转速','°/s',1,180,0.1,'机动'],['turretTraverse','炮塔转速','°/s',1,180,0.1,'火控'],
 ['gunSpeed','炮管俯仰速度','°/s',0.1,90,0.1,'火控'],['gunDepression','俯角','°',0,45,0.1,'火控'],['gunElevation','仰角','°',0,85,0.1,'火控'],
 ['reload','装填时间','s',0.1,120,0.1,'火控'],['aimTime','完整散布收缩时间','s',0.1,30,0.1,'火控'],
 ['dispersion','百米最小散布半径','m',0,5,0.01,'火控'],['maxDispersion','百米最大散布半径','m',0,100,0.01,'火控'],
 ['viewRange','视野','m',50,1500,1,'侦察']
].map(x=>def(...x));
const faces={front:'正面',side:'侧面',rear:'后面',top:'顶部',bottom:'底部'};
export function fields(t){
 const out=t.casemate?core.filter(f=>f.path!=='turretTraverse'):core.slice();
 // One clear row per armor aspect: hull and turret values sit beside each other.
 for(const face of ['front','side','rear','top','bottom']){
  const group=faces[face]+'装甲';
  for(const part of ['hull','turret']){
   if(!t.armor[part]?.[face])continue;
   const name=part==='hull'?'车体':t.casemate?'战斗室':'炮塔',p='armor.'+part+'.'+face;
   out.push(def(p+'.0',name+'厚度','mm',0.1,3000,0.1,group),def(p+'.1',name+'倾角','°',0,89,0.1,group));
  }
 }
 for(const [key,name] of [['lowerFront','首下装甲'],['lowerSide','下侧装甲'],['mantlet','炮盾装甲']])if(t.armor[key]){
  const group=name;
  out.push(def('armor.'+key+'.0','厚度','mm',0.1,3000,0.1,group),def('armor.'+key+'.1','倾角','°',0,89,0.1,group));
 }
 for(const [key,name,max] of [['era','正面 HEAT 反应装甲附加量',3000],['eraSide','侧面 HEAT 反应装甲附加量',3000],['eraKE','动能弹反应装甲附加量',3000],['skirt','侧裙附加防护',3000],['heatMult','HEAT 防护倍率',10]])if(key in t.armor)out.push(def('armor.'+key,name,key==='heatMult'?'×':'mm',key==='heatMult'?0.1:0,max,key==='heatMult'?0.01:1,'附加防护'));
 for(let i=0;i<t.shells.length;i++){
  const sh=t.shells[i],group='弹药 '+(i+1)+' · '+sh.name;
  for(const [key,label,unit,min,max,step] of [['pen','百米穿深','mm',1,3000,1],['damage','单发伤害','HP',1,10000,1],['velocity','初速','m/s',100,2500,1],['count','默认携带量','发',0,500,1]])out.push(def('shells.'+i+'.'+key,label,unit,min,max,step,group));
 }
 for(const [key,values] of Object.entries({magazine:{size:['弹夹容量','发',1,30,1],intraReload:['连发间隔','s',0.1,30,0.1],fullReload:['弹夹装填','s',0.1,120,0.1]},scan:{cooldown:['冷却','s',0.1,300,0.1],maxTargets:['最大扫描目标','辆',1,14,1],range:['扫描范围','m',50,1500,1]},overpen:{shots:['强化发数','发',1,30,1],mult:['穿深倍率','×',1,5,0.01],cooldown:['冷却','s',0.1,300,0.1]},overspeed:{mult:['速度倍率','×',1,5,0.01],duration:['持续时间','s',0.1,120,0.1],cooldown:['冷却','s',0.1,300,0.1]},stabilize:{duration:['持续时间','s',0.1,120,0.1],cooldown:['冷却','s',0.1,300,0.1]},selfDestruct:{radius:['范围','m',1,100,0.1]}})){
  if(t[key])for(const [k,v] of Object.entries(values))if(k in t[key])out.push(def(key+'.'+k,...v,'特殊技能'));
 }
 const specialist = {
  dozer: { speed: ['施工限速', 'km/h', 2, 20, 0.1], travel: ['施工行程', 'm', 0.5, 15, 0.1],
    cooldown: ['施工冷却', 's', 0.1, 300, 0.1], charges: ['土堤数量', '次', 1, 8, 1] },
  secondary: { reload: ['副炮装填', 's', 0.1, 60, 0.1], rounds: ['副炮备弹', '发', 1, 150, 1] },
  rearDriver: { maxSpeed: ['后驾驶席倒车限速', 'km/h', 1, 100, 0.1] },
  amphibious: { speed: ['浮航限速', 'km/h', 1, 25, 0.1] },
 };
 for (const [key, section] of Object.entries(specialist)) {
  if (!t[key]) continue;
  for (const [field, values] of Object.entries(section)) out.push(def(key + '.' + field, ...values, '特殊技能'));
 }
 if (t.secondary) {
  out.push(def('secondary.shell.pen','副炮穿深','mm',1,3000,1,'副炮'),
   def('secondary.shell.damage','副炮伤害','HP',1,10000,1,'副炮'),
   def('secondary.shell.velocity','副炮初速','m/s',100,2500,1,'副炮'));
 }
 if (t.aps) for (const [k,label,unit,min,max,step] of [['charges','拦截弹数量','发',0,20,1],['radius','拦截半径','m',1,30,0.1],['cooldown','拦截冷却','s',0.1,60,0.1],['rechargeSeconds','重新充能时间','s',0.1,180,0.1]]) if (k in t.aps) out.push(def('aps.'+k,label,unit,min,max,step,'主动防护'));
 if (t.artillery) for (const [k,label,unit,min,max,step] of [['spadeDeploySeconds','驻锄部署时间','s',0.1,20,0.1],['spadeRetractSeconds','驻锄收起时间','s',0.1,20,0.1],['maxFlightSeconds','最大弹道飞行时间','s',1,120,1],['aiEngageRange','AI交战距离','m',100,2000,1],['deploySeconds','自动部署时间','s',0.1,20,0.1],['packSeconds','自动收起时间','s',0.1,20,0.1],['fireMissionRounds','单次任务弹数','发',1,20,1],['recoilRecovery','后坐恢复时间','s',0.1,20,0.1]]) if (k in t.artillery) out.push(def('artillery.'+k,label,unit,min,max,step,'自行火炮'));
 if (t.recoilBrace) for (const [k,label] of [['spadeDeploySeconds','驻锄部署时间'],['spadeRetractSeconds','驻锄收起时间'],['recoilRecovery','后坐恢复时间']]) if (k in t.recoilBrace) out.push(def('recoilBrace.'+k,label,'s',0.1,20,0.1,'驻锄系统'));
 if (t.armorPackages) for (let i=0;i<t.armorPackages.length;i++) for (const [k,label,unit,min,max,step] of [['front','正面附加装甲','mm',0,1000,1],['side','侧面附加装甲','mm',0,1000,1],['mass','套件后重量','t',1,200,0.1],['speedMult','速度倍率','×',0.2,2,0.01],['heatMult','HEAT 防护倍率','×',0.1,5,0.01]]) if (k in t.armorPackages[i]) out.push(def('armorPackages.'+i+'.'+k,'套件 '+(i+1)+' · '+label,unit,min,max,step,'可换装甲'));
 if (t.multiTube?.modes) for (let i=0;i<t.multiTube.modes.length;i++) for (const [k,label,unit,min,max,step] of [['count','齐射炮管数','管',1,12,1],['reloadMult','装填倍率','×',0.1,10,0.1]]) if (k in t.multiTube.modes[i]) out.push(def('multiTube.modes.'+i+'.'+k,t.multiTube.modes[i].name+' · '+label,unit,min,max,step,'多管武器'));
 if (t.burst) for (const [k,label,unit,min,max,step] of [['count','点射发数','发',1,30,1],['interval','点射间隔','s',0.02,5,0.01]]) if (k in t.burst) out.push(def('burst.'+k,label,unit,min,max,step,'连发系统'));
 if (t.eraLayout) for (let i=0;i<t.eraLayout.length;i++) for (const [k,label] of [['heat','HEAT 单块防护','mm'],['ke','动能单块防护','mm']]) if (k in t.eraLayout[i]) out.push(def('eraLayout.'+i+'.'+k,'ERA '+(i+1)+' · '+label,'mm',0,1000,1,'模块化反应装甲'));
 if (t.dozerAssist !== undefined) out.push(def('dozerAssist','推土铲爬坡辅助','×',0,1,0.01,'推土铲辅助'));
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
  if (maxDispersionFor(t, next) < (next.dispersion ?? t.dispersion))
   throw Error(t.short+' / 百米最大散布半径必须大于或等于最小散布半径。');
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
  t.maxDispersion=maxDispersionFor(t,patch);
  for(const [path,value] of Object.entries(patch))write(t,path,value);
  t.ammoCap=t.shells.reduce((n,s)=>n+s.count,0);t.defaultLoadout=t.shells.map(s=>s.count);
  if(Object.keys(patch).some(p=>p.startsWith('shells.')))for(const sh of t.shells)sh.role='Custom balance: '+sh.pen+' mm / '+sh.damage+' HP';
 }
 return result;
}
export function diff(baseline,values){
 const config=EMPTY();
 for (const t of baseline) {
  const v=values.find(s=>s.id===t.id),patch={};
  if (!v) continue;
  for (const { path } of fields(t)) {
   if (path !== 'maxDispersion' && read(v,path) !== read(t,path)) patch[path]=read(v,path);
  }
  // An edited minimum and an unchanged maximum still need to round-trip.
  if (v.maxDispersion !== maxDispersionFor(t,patch)) patch.maxDispersion=v.maxDispersion;
  if (Object.keys(patch).length) config.tanks[t.id]=patch;
 }
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
