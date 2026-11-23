// Touch controls use the same vehicle inputs, aiming and firing logic as desktop.
export const isMobile = () => {
 const forced=new URLSearchParams(location.search).get('mobile');
 if(forced==='0')return false;
 return forced==='1'||document.documentElement.classList.contains('mobile-device')|| /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)|| (navigator.maxTouchPoints>0&&Math.min(screen.width,screen.height,innerWidth,innerHeight)<=1024)||Math.min(innerWidth,innerHeight)<=600;
};
export class TouchControls {
 constructor(game){
  this.g=game;this.throttle=0;this.steer=0;this.firing=false;this.listeners=[];
  const root=document.createElement('div');root.className='touch-controls';this.root=root;
  root.innerHTML='<div class="touch-drive" aria-label="驾驶摇杆"><span>驾驶</span><i></i></div><div class="touch-actions"><button data-action="scope">开镜</button><button data-action="zoom">倍率</button><button data-action="armor">装甲</button><button data-action="lock">锁定</button><button data-action="ability">技能</button><button data-action="spade">驻锄</button><button data-action="fire" class="touch-fire">开火</button></div><div class="touch-ammo"><button data-action="ammo0">弹 1</button><button data-action="ammo1">弹 2</button><button data-action="ammo2">弹 3</button><button data-action="item0">装备 1</button><button data-action="item1">装备 2</button><button data-action="item2">装备 3</button></div><div class="touch-top"><button data-action="score">战况</button><button data-action="pause">暂停</button></div><div class="touch-hint">左手驾驶 · 右手滑动战场瞄准 · 建议横屏</div>';
  game.hud.root.append(root);game.hud.root.classList.add('touch-hud');
  const canvas=game.renderer.domElement,drive=root.querySelector('.touch-drive'),knob=drive.querySelector('i');
  const on=(target,event,fn,opts)=>{target.addEventListener(event,fn,opts);this.listeners.push(()=>target.removeEventListener(event,fn,opts));};
  const ready=()=>!game.paused&&!game.ended&&game.player.alive;
  let driveId=null,aimId=null,fireId=null,ax=0,ay=0;
  const resetDrive=()=>{driveId=null;this.throttle=this.steer=0;knob.style.transform='translate(-50%,-50%)';};
  const moveDrive=e=>{const r=drive.getBoundingClientRect(),radius=r.width*.35;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}this.steer=Math.abs(x)<.08?0:-x;this.throttle=Math.abs(y)<.08?0:-y;knob.style.transform='translate(calc(-50% + '+x*radius+'px),calc(-50% + '+y*radius+'px))';};
  on(drive,'pointerdown',e=>{if(!ready()||driveId!==null)return;e.preventDefault();driveId=e.pointerId;drive.setPointerCapture(e.pointerId);moveDrive(e);});
  on(drive,'pointermove',e=>{if(e.pointerId===driveId)moveDrive(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(drive,type,e=>{if(e.pointerId===driveId)resetDrive();});
  on(canvas,'pointerdown',e=>{if(e.pointerType==='mouse'||!ready()||aimId!==null)return;e.preventDefault();aimId=e.pointerId;ax=e.clientX;ay=e.clientY;canvas.setPointerCapture(e.pointerId);},{passive:false});
  on(canvas,'pointermove',e=>{if(e.pointerId!==aimId)return;if(ready())game.mouseLook((e.clientX-ax)*2.2,(e.clientY-ay)*2.2);ax=e.clientX;ay=e.clientY;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(canvas,type,e=>{if(e.pointerId===aimId)aimId=null;});
  const fire=root.querySelector('[data-action=fire]');
  on(fire,'pointerdown',e=>{if(!ready()||fireId!==null)return;e.preventDefault();game.audio.init();game.audio.resume();fireId=e.pointerId;fire.setPointerCapture(e.pointerId);this.firing=true;game.player.tryFire(game.time);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(fire,type,e=>{if(e.pointerId===fireId){fireId=null;this.firing=false;}});
  const runAction=b=>{
   const a=b.dataset.action,p=game.player;
   if(a==='pause'){game.setPaused(!game.paused);return;}
   if(a==='score'){this.clear();const board=game.hud.$('h-board');const open=board.style.display!=='flex';game.hud.scoreboard(open);if(open){const box=board.querySelector('.box');if(box){const close=document.createElement('button');close.textContent='关闭战况';close.type='button';close.onpointerdown=e=>{e.preventDefault();e.stopPropagation();game.hud.scoreboard(false);};close.onclick=()=>game.hud.scoreboard(false);box.append(close);}}return;}
   if(!ready())return;
   if(a==='scope')game.toggleSniper();
   if(a==='zoom'){if(!game.cam.sniper)game.toggleSniper();else {const z=game.constructor.ZOOMS;game.cam.zoom=z[(z.indexOf(game.cam.zoom)+1)%z.length];}}
   if(a==='armor')game.armorView.toggle();
   if(a==='lock')game.toggleLock();
   if(a==='ability')p.tryAbility();
   if(a==='spade' && p.spec.artillery)p.toggleSpade();
   if(a.startsWith('ammo'))p.selectShell(+a.slice(4));
   if(a.startsWith('item'))game.useItem(+a.slice(4));
  };
  // iOS WebViews can suppress synthetic clicks during multitouch or while HUD
  // labels are updated. Activate immediately on the same pointerdown as Fire.
  for(const b of root.querySelectorAll('button:not([data-action=fire])')){
   b.type='button';
   on(b,'pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();e.stopPropagation();runAction(b);},{passive:false});
   on(b,'click',e=>{e.stopPropagation();if(e.detail===0&&(!e.pointerType||e.pointerType===''))runAction(b);});
  }
  this.clear=()=>{resetDrive();aimId=fireId=null;this.firing=false;};
  on(window,'blur',this.clear);on(document,'visibilitychange',()=>{if(document.hidden)this.clear();});
 }
 update(){
  const g=this.g,p=g.player;
  const label=(b,v)=>{if(b.textContent!==v)b.textContent=v;};
  this.root.classList.toggle('touch-paused',g.paused||g.ended||!p.alive);
  if(g.paused||g.ended||!p.alive)this.clear();
  for(const b of this.root.querySelectorAll('button')){const a=b.dataset.action;if(a==='scope')label(b,g.cam.sniper?'退出开镜':'开镜');if(a==='zoom')label(b,g.cam.sniper?'×'+g.cam.zoom:'倍率');if(a==='armor')b.classList.toggle('active',g.armorView.enabled);if(a==='lock')b.classList.toggle('active',!!g.lock);
   if(a.startsWith('ammo')){const i=+a.slice(4);label(b,'弹 '+(i+1)+' · '+(p.ammo[i]??0));b.classList.toggle('active',p.shellIdx===i);}
   if(a==='fire')label(b,p.reloadLeft>0?p.reloadLeft.toFixed(1)+'s':'开火');
   if(a==='spade'){label(b,p.spadeState==='deployed'?'驻锄已放':'驻锄');b.classList.toggle('active',p.spadeProgress>0.01);}
  }
 }
 dispose(){this.clear();for(const off of this.listeners)off();this.root.remove();}
}
