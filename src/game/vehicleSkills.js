// New gameplay-only vehicle skills. All timers use simulation time, not wall time.
const passive=(id,name,effect,params={})=>({id,name,effect,active:false,...params});
const active=(id,name,effect,params={})=>({id,name,effect,active:true,...params});
export const VEHICLE_SKILLS = {
 su100:passive('camo','静默猎手','静止准备完成后提升隐蔽；行驶清除准备。',{prepare:3,mult:1.35}),
 jagdpanther:passive('ambush','无声伏击','准备完成后的首次开火降低隐蔽惩罚；再次准备后恢复。',{prepare:5,mult:0.7}),
 isu122:passive('charge','火力蓄积','静止蓄力提升下一发的游戏伤害；开火消耗蓄力。',{prepare:6,mult:1.2}),
 jagdtiger:passive('brace','重型射击平台','静止准备后减小散布、缩短装填时间。',{prepare:4,mult:0.7,reloadMult:0.9}),
 amxfoch:passive('serial','连续狙击','静止连续命中积累瞄准强化，最多三层；移动清空。',{prepare:3,mult:0.12,stacks:3}),
 strv103:active('siege','攻城姿态','静止时切换射击姿态，准备后缩小散布并限制行驶速度；前后驾驶退出。',{prepare:2,mult:0.55,speedMult:0.2}),
 warden130:passive('precision','极限精度','静止准备逐渐减小散布，移动清空；允许轻微原地瞄准。',{prepare:8,mult:0.55}),
 mauseng:active('fortress','重装突破','缓慢推进时减少普通战斗伤害。',{duration:12,cooldown:45,mult:0.7,speedMult:0.6}),
 tiger:passive('laststand','不屈意志','生命值首次低于20%时获得短暂性能强化，不复活乘员或修复断履带。',{duration:15,threshold:0.2,mult:1.25}),
 is2:active('shock','破坏性冲击','下一次有效命中使目标短时扩大散布。',{duration:5,cooldown:40,mult:1.3}),
 m6a1:active('engine','紧急动力','发动机受损时临时提高动力，不永久修复模块。',{duration:10,cooldown:45,mult:1.7}),
 chally2:active('guard','应急防御','短时间减少普通战斗伤害，可移动。',{duration:10,cooldown:40,mult:0.78}),
 bastion125:passive('zone','区域防御','在C据点内获得伤害减免与履带修复增益，移动也有效。',{mult:0.9,repairMult:1.3}),
 m1a2:passive('hunter','猎歼系统','击毁后标记附近已经被发现的敌车，延长显示时间。',{duration:5,cooldown:25,range:400}),
 leo2a6:active('fcs','精密火控','短时间加快瞄准收敛，降低散布。',{duration:8,cooldown:30,mult:0.75}),
 t90m:active('jam','电子反锁定','解除并阻止敌方自动锁定；不影响手动瞄准、普通射击或可见性。',{duration:6,cooldown:40}),
 type99a:active('power','动力超载','临时提高加速和转向，结束后短暂动力下降。',{duration:8,cooldown:35,mult:1.4,turnMult:1.25}),
 merkava4:active('crew','乘员救援','恢复一名失能乘员，每场一次。',{charges:1}),
 t14:active('aps','防御系统重启','补充一次APS使用次数，不超过原容量。',{cooldown:60}),
 centurion:active('reload','紧急装填','缩短当前剩余装填时间。',{cooldown:40,mult:0.5}),
 t34:passive('momentum','机动惯性','持续行驶积累动力强化，停车后清空。',{prepare:5,mult:1.2}),
 leo1:active('relocate','快速转场','短时提高行驶限速与加速度。',{duration:8,cooldown:35,mult:1.25}),
 xm8ags:active('light','轻量化模式','切换机动模式，速度增加但普通承伤增加。',{mult:1.25,damageMult:1.15,cooldown:8}),
 r17:active('decoy','虚假信号','在敌方小地图显示一个静止的虚假敌车标记，不生成实体或碰撞。',{duration:8,cooldown:35,range:65}),
 centauro2:passive('escape','紧急撤离','普通受伤后短时间提升机动性。',{duration:5,cooldown:30,mult:1.2}),
 sprutsd:passive('water','水域隐蔽','浮航时提升隐蔽，离开水域失效。',{mult:1.3}),
 raptor90:passive('tracking','持续追踪','己方小地图保留被本车发现目标的最后位置更久，不更新隐藏车辆实时坐标。',{duration:12}),
 harrier105:active('evasive','极限机动','移动时减少散布惩罚。',{duration:5,cooldown:25,mult:0.72}),
 fv4005s1:active('heavyshot','重型射击','强化下一发游戏伤害，随后增加装填时间。',{mult:1.2,reloadMult:1.5,cooldown:50}),
 bmpt:passive('suppress','持续压制','有效命中累积短暂压制，使敌人散布增大。',{duration:1.2,mult:1.18}),
 '2s38':active('heat','高速连射','开启高速连射；每发积热，过热停止发射直至冷却。',{duration:8,cooldown:25,mult:0.7,heatPerRound:13,coolRate:18}),
 lancer120:passive('cycle','射击循环','装填完成后短时间提高瞄准精度，不需要停车。',{duration:3,mult:0.75}),
 atlas:passive('reverse','倒车反击','倒车时减少移动散布。',{mult:0.75}),
 basilisk:passive('advance','持续推进','持续前进后降低模块受损概率，停车清空。',{prepare:5,mult:0.7}),
};
export const STATIONARY_SKILLS=new Set(['camo','ambush','charge','brace','serial','siege','precision']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function skillKey(spec){
 if(!spec.skill?.active)return null;
 return spec.scan||spec.selfDestruct||spec.stabilize||spec.overspeed||spec.overpen||spec.dozer||spec.secondary?'K':'G';
}
export function describeVehicleSkill(spec){
 const s=spec.skill;if(!s)return null;
 const timing=[s.prepare?'准备 '+s.prepare+'s':'',s.duration?'持续 '+s.duration+'s':'',s.cooldown?'冷却 '+s.cooldown+'s':'',s.charges?'每场 '+s.charges+' 次':''].filter(Boolean).join(' · ');
 return {type:s.active?'active':'passive',name:s.name,effect:s.effect,timing,key:skillKey(spec)};
}
export class VehicleSkill {
 constructor(tank){this.t=tank;this.cfg=tank.spec.skill||null;this.cd=0;this.left=0;this.prep=0;this.stacks=0;this.charges=this.cfg?.charges??0;this.armed=false;this.toggled=false;this.heat=0;this.overheated=false;this.used=false;this.silentUntil=-Infinity;this.wasReloading=false;this.lastShotPrepared=false;}
 get id(){return this.cfg?.id;}
 get fraction(){return clamp(this.prep/(this.cfg?.prepare||1),0,1);}
 get prepared(){return this.fraction>=1;}
 get running(){return this.left>0||this.toggled;}
 get ready(){return !!this.cfg?.active&&this.t.alive&&this.cd<=0&&this.left<=0&&!this.armed&&(!this.cfg.charges||this.charges>0);}
 msg(s){if(this.t.isPlayer)this.t.game.hud?.message(s,'#9fd39f');}
 activate(){
  const t=this.t,s=this.cfg;if(!s?.active||!t.alive||t.game.ended)return false;
  if(this.id==='siege'){
   if(this.toggled){this.exitSiege();return true;}
   if(Math.abs(t.speed)>0.3||Math.abs(t.input.throttle)>0.1||t.afloat||t.airborne)return false;
   this.toggled=true;this.prep=0;this.msg(s.name+' · 准备中');return true;
  }
  if(this.id==='light'&&this.toggled){this.toggled=false;this.cd=s.cooldown;return true;}
  if(!this.ready)return false;
  if(this.id==='crew'){const c=t.crew.find(c=>!c.alive);if(!c||this.charges<=0)return false;c.alive=true;this.charges--;}
  else if(this.id==='aps'){if(t.apsCharges>=t.spec.aps.charges)return false;t.apsCharges++;t.apsRechargeTime=0;}
  else if(this.id==='reload'){if(t.reloadLeft<=0||t.burstLeft>0||t.mrsiQueue)return false;t.reloadLeft*=s.mult;}
  else if(this.id==='engine'){if(t.modules.engine>=1)return false;this.left=s.duration;}
  else if(this.id==='shock'||this.id==='heavyshot'){this.armed=true;}
  else if(this.id==='light'){this.toggled=true;}
  else if(this.id==='decoy'){
   const angle=t.heading+Math.PI/2;const x=t.pos.x+Math.sin(angle)*s.range,z=t.pos.z+Math.cos(angle)*s.range;
   const half=t.game.world.playHalf||600;
   (t.game.skillDecoys??=[]).push({team:t.team,x:clamp(x,-half,half),z:clamp(z,-half,half),until:t.game.time+s.duration});
  } else if(this.id==='heat'){if(this.overheated)return false;this.left=s.duration;}
  else this.left=s.duration||0;
  // Armed attacks start cooldown only when consumed; toggles are explicitly managed.
  if(!this.armed&&!this.toggled)this.cd=s.cooldown||0;
  this.msg(s.name+' · 已启动');return true;
 }
 exitSiege(){this.toggled=false;this.prep=0;}
 update(dt){
  const t=this.t,s=this.cfg;if(!s)return;
  this.cd=Math.max(0,this.cd-dt);this.left=Math.max(0,this.left-dt);
  if(this.id==='heat'){this.heat=Math.max(0,this.heat-dt*s.coolRate);if(this.overheated&&this.heat<=35)this.overheated=false;}
  if(this.id==='laststand'&&!this.used&&t.hp<=t.maxHp*s.threshold){this.used=true;this.left=s.duration;this.msg(s.name);}
  if(this.id==='cycle'){const reloading=t.reloadLeft>0;if(this.wasReloading&&!reloading)this.left=s.duration;this.wasReloading=reloading;}
 }
 motion(dt){
  const t=this.t,s=this.cfg;if(!s)return;
  const moving=Math.abs(t.speed)>0.55||Math.abs(t.input.throttle||0)>0.12||t.airborne||t.afloat;
  const turn=Math.abs(t.turnRate||0);
  if(STATIONARY_SKILLS.has(this.id)){
   if(moving){this.prep=0;this.stacks=0;if(this.id==='siege')this.exitSiege();this.silentUntil=-Infinity;}
   else if(this.id!=='siege'||this.toggled){
    if(turn<0.025)this.prep=Math.min(s.prepare,this.prep+dt);
    else this.prep=Math.max(0,this.prep-dt*(turn<0.14?0.25:2.5));
    if(!this.prepared&&this.id==='serial'&&turn>=0.14)this.stacks=0;
   }
  }
  if(this.id==='momentum'||this.id==='advance'){
   const eligible=this.id==='advance'?t.speed>1:Math.abs(t.speed)>1;
   this.prep=eligible?Math.min(s.prepare,this.prep+dt):0;
  }
 }
 get zone(){const t=this.t,p=t.game.world?.controlPoint;return !!(p&&t.alive&&!t.airborne&&!t.afloat&&Math.hypot(t.pos.x-p.x,t.pos.z-p.z)<p.r);}
 get dispersionMult(){
  const s=this.cfg;if(!s)return 1;
  if(this.id==='precision')return 1-(1-s.mult)*this.fraction;
  if((this.id==='brace'||this.id==='siege')&&this.prepared)return s.mult;
  if(['fcs','evasive','cycle'].includes(this.id)&&this.left>0)return s.mult;
  if(this.id==='reverse'&&this.t.speed<-.55)return s.mult;
  if(this.id==='heat'&&this.heat>65)return 1+0.5*(this.heat-65)/35;
  return 1;
 }
 get aimMult(){const s=this.cfg;if(!s)return 1;if(this.id==='serial')return Math.max(0.2,1-s.mult*this.stacks);if(this.id==='fcs'&&this.left>0)return s.mult;if(this.id==='laststand'&&this.left>0)return 1/s.mult;return 1;}
 get reloadMult(){return this.id==='brace'&&this.prepared?this.cfg.reloadMult:this.id==='laststand'&&this.left>0?1/this.cfg.mult:1;}
 get speedMult(){const s=this.cfg;if(!s)return 1;if(this.id==='siege'&&this.toggled)return s.speedMult;if(this.id==='fortress'&&this.left>0)return s.speedMult;if(this.id==='light'&&this.toggled||['relocate','escape'].includes(this.id)&&this.left>0)return s.mult;return 1;}
 get accelMult(){const s=this.cfg;if(!s)return 1;if(this.id==='power')return this.left>0?s.mult:this.cd>s.cooldown-s.duration-3?0.8:1;if(this.id==='engine'&&this.left>0||this.id==='laststand'&&this.left>0)return s.mult;if(this.id==='momentum')return 1+(s.mult-1)*this.fraction;if(this.id==='light'&&this.toggled||['relocate','escape'].includes(this.id)&&this.left>0)return s.mult;return 1;}
 get turnMult(){return this.id==='power'&&this.left>0?this.cfg.turnMult:this.id==='momentum'?this.accelMult:1;}
 get damageMult(){const s=this.cfg;if(!s)return 1;if(['fortress','guard'].includes(this.id)&&this.left>0||this.id==='zone'&&this.zone)return s.mult;if(this.id==='light'&&this.toggled)return s.damageMult;return 1;}
 get repairMult(){return this.id==='zone'&&this.zone?this.cfg.repairMult:1;}
 get moduleMult(){return this.id==='advance'&&this.prepared?this.cfg.mult:1;}
 get camoMult(){return this.id==='camo'&&this.prepared||this.id==='water'&&this.t.afloat?this.cfg.mult:1;}
 get fireCamoFactor(){return this.id==='ambush'&&this.t.game.time<this.silentUntil?0.25+0.75*this.cfg.mult:0.25;}
 get jammed(){return this.id==='jam'&&this.left>0;}
 get canFire(){return !this.overheated;}
 get burstIntervalMult(){return this.id==='heat'&&this.left>0?this.cfg.mult:1;}
 onShot(shell){
  const s=this.cfg;if(!s)return shell;
  let next=shell;
  if(this.id==='charge'&&this.fraction>0){next={...next,damage:next.damage*(1+(s.mult-1)*this.fraction)};this.prep=0;}
  if(this.id==='ambush'){this.silentUntil=this.prepared?this.t.game.time+5:-Infinity;this.prep=0;}
  if(this.id==='heavyshot'&&this.armed){next={...next,damage:next.damage*s.mult};this.armed=false;this.cd=s.cooldown;this.lastShotPrepared=true;}
  if(this.id==='shock'&&this.armed){next={...next,vehicleShock:s.duration,vehicleShockMult:s.mult};this.armed=false;this.cd=s.cooldown;}
  if(this.id==='serial'){if(this.serialPending&&!this.serialHit)this.stacks=0;this.serialPending=true;this.serialHit=false;next={...next,vehicleSerial:!!this.prepared,vehicleSerialIndex:(this.serialIndex=(this.serialIndex||0)+1)};}
  if(this.id==='suppress')next={...next,vehicleSuppression:s.duration,vehicleShockMult:s.mult};
  if(this.id==='heat'){this.heat=Math.min(100,this.heat+s.heatPerRound);if(this.heat>=100){this.overheated=true;this.left=0;this.msg('炮管过热 · 等待冷却');}}
  return next;
 }
 afterReload(base){if(!this.lastShotPrepared)return base;this.lastShotPrepared=false;return base*this.cfg.reloadMult;}
 hit(target,shell){
  if(!target?.alive||target.team===this.t.team)return;
  if(this.id==='serial'&&shell.vehicleSerial&&this.prepared&&shell.vehicleSerialIndex===this.serialIndex&&!this.serialHit){this.serialHit=true;this.stacks=Math.min(this.cfg.stacks,this.stacks+1);}
  if(shell.vehicleShock||shell.vehicleSuppression){
   target.skillShockUntil=Math.max(target.skillShockUntil||0,this.t.game.time+(shell.vehicleShock||shell.vehicleSuppression));
   target.skillShockMult=shell.vehicleShockMult||1.2;
  }
 }
 damaged(){if(this.id==='escape'&&this.cd<=0){this.left=this.cfg.duration;this.cd=this.cfg.cooldown;}}
 killed(victim){
  if(this.id!=='hunter'||this.cd>0||!victim||victim.team===this.t.team)return;
  const t=this.t,s=this.cfg;
  const found=t.game.tanks.filter(e=>e.alive&&e.team!==t.team&&e.spotted[t.team]&&e.pos.distanceTo(victim.pos)<=s.range).sort((a,b)=>a.pos.distanceTo(victim.pos)-b.pos.distanceTo(victim.pos))[0];
  if(found){found.visibleUntil[t.team]=Math.max(found.visibleUntil[t.team],t.game.time+s.duration);this.cd=s.cooldown;this.msg(s.name+' · '+found.spec.short);}
 }
 ai(target){
  if(!this.cfg?.active||!this.t.alive)return;const t=this.t,id=this.id;
  if(id==='siege'){if(target&&!this.toggled&&Math.abs(t.speed)<.25)this.activate();return;}
  if(!this.ready)return;
  if(id==='crew'||id==='aps'||id==='engine'||id==='reload'&&target&&t.reloadLeft>t.spec.reload*.4){this.activate();return;}
  if(['fortress','guard','jam'].includes(id)&&target&&t.hp<t.maxHp*.85||['fcs','shock','heavyshot','heat','evasive'].includes(id)&&target||['relocate','power','light'].includes(id)&&Math.abs(t.speed)>2||id==='decoy'&&target)this.activate();
 }
 status(){
  if(!this.cfg)return '';const s=this.cfg;
  if(this.id==='heat')return s.name+' · 热量 '+Math.round(this.heat)+'%'+(this.overheated?' · 过热':'')+(this.left>0?' · 连射':'');
  if(STATIONARY_SKILLS.has(this.id))return s.name+' · '+(this.id==='siege'&&!this.toggled?'G 切换':this.prepared?'准备完成':Math.round(this.fraction*100)+'%')+(this.id==='serial'?' · '+this.stacks+' 层':'');
  if(this.armed)return s.name+' · 下一发';
  if(this.toggled)return s.name+' · 已开启';
  if(this.left>0)return s.name+' · '+this.left.toFixed(1)+'s';
  if(this.cd>0)return s.name+' · 冷却 '+Math.ceil(this.cd)+'s';
  if(s.charges&&this.charges===0||this.id==='laststand'&&this.used)return s.name+' · 已使用';
  return s.name+(s.active?' · '+skillKey(this.t.spec)+' 就绪':' · 被动');
 }
}
