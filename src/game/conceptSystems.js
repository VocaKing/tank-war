// Runtime mechanics for the ten fictional concept vehicles.
// All state changes occur on Tank instances; model configuration remains immutable.
import * as THREE from 'three';
import { clamp } from '../util.js';

export function updateConceptTimers(t,dt) {
  const still = Math.abs(t.speed)<0.18&&Math.abs(t.turnRate)<0.018&&
    Math.abs(t.input?.throttle||0)<0.12&&Math.abs(t.input?.steer||0)<0.12;
  t.stationarySeconds = still ? Math.min(90,(t.stationarySeconds||0)+dt) : 0;
  t.suppressedFor=Math.max(0,(t.suppressedFor||0)-dt);
  if (t.spec.aps?.rechargeSeconds && t.apsCharges<t.spec.aps.charges && t.apsCooldown<=0) {
    t.apsRechargeTime+=dt;
    if(t.apsRechargeTime>=t.spec.aps.rechargeSeconds) {
      t.apsCharges++;t.apsRechargeTime=0;
      if(t.isPlayer)t.game.hud.message('APS interceptor replenished','#86dbed');
    }
  }
}
export function precisionMultiplier(t) {
  const siege=t.spec.siegeMode, first=t.spec.firstShot;
  if(siege && t.stationarySeconds>=siege.settleSeconds)return siege.dispersionMult;
  if(first && t.stationarySeconds>=first.settleSeconds &&
     t.game.time-t.lastFired>=first.recoverySeconds)return first.dispersionMult;
  return 1;
}
export function dozerSlopeBonus(t,uphill) {
  if(!t.spec.dozerAssist||uphill<=0)return 0;
  return Math.min(0.28,Math.max(0,uphill)*t.spec.dozerAssist);
}
export function mrsiVelocity(muzzle,target,seconds) {
  const t=Math.max(0.5,seconds),v=new THREE.Vector3().subVectors(target,muzzle);
  return new THREE.Vector3(v.x/t,v.y/t+9.81*t/2,v.z/t);
}
export function fireConceptMRSI(t,time) {
  const cfg=t.spec.mrsi, index=t.shellIdx, sh=t.spec.shells[index], g=t.game;
  if(!cfg||t.ammo[index]<2||!t.alive)return false;
  const muzzle=t.model.muzzle.getWorldPosition(new THREE.Vector3());
  const target=t.input.aim.clone();
  const range=Math.hypot(target.x-muzzle.x,target.z-muzzle.z);
  if(range<30||range>1700)return false;
  // Distinct trajectories, separate muzzle velocities and a delayed second shot.
  // Two trajectories use the same target coordinates, and arrive at nearly the
  // same time under the shared gravity integrator. It is a gameplay abstraction,
  // not a real howitzer charge-selection or autoloader model.
  const gap=cfg.secondDelaySeconds??2.0;
  const shortFlight=clamp(range/Math.max(90,sh.velocity*0.72),2.2,6.5);
  const longFlight=shortFlight+gap;
  const firstV=mrsiVelocity(muzzle,target,longFlight), secondV=mrsiVelocity(muzzle,target,shortFlight);
  g.ballistics.spawn(t,sh,muzzle,firstV);
  g.effects.muzzle(muzzle,firstV.clone().normalize(),sh.caliber);
  g.audio.gun(muzzle,sh.caliber,t.isPlayer,t.spec.id,{kind:sh.guided?'guided':'gun'});
  t.ammo[index]--; t.stats.shots++;t.lastFired=time;
  t.reloadLeft=t.reloadTime();t.recoil=1;t.stationarySeconds=0;
  t.mrsiQueue={index,target,delay:gap,flight:shortFlight};
  g.physics?.recoil(t,muzzle,firstV.clone().normalize(),sh.caliber);
  if(t.abilities)t.abilities.onFire();
  if(t.isPlayer)g.hud.message('MRSI · first round away · second in '+gap.toFixed(1)+' s','#a5dff1');
  return true;
}
export function updateConceptMRSI(t,dt,time) {
  const q=t.mrsiQueue;if(!q)return;
  q.delay-=dt;if(q.delay>0)return;
  t.mrsiQueue=null;
  if(!t.alive||t.ammo[q.index]<=0)return;
  const sh=t.spec.shells[q.index],g=t.game;
  const muzzle=t.model.muzzle.getWorldPosition(new THREE.Vector3());
  const vel=mrsiVelocity(muzzle,q.target,q.flight);
  g.ballistics.spawn(t,sh,muzzle,vel);
  g.effects.muzzle(muzzle,vel.clone().normalize(),sh.caliber);
  g.audio.gun(muzzle,sh.caliber,t.isPlayer,t.spec.id,{kind:sh.guided?'guided':'gun'});
  t.ammo[q.index]--;t.stats.shots++;t.lastFired=time;t.recoil=1;
  g.physics?.recoil(t,muzzle,vel.clone().normalize(),sh.caliber);
  if(t.isPlayer)g.hud.message('MRSI · second round away · paired impact','#a5dff1');
  if(t.ammo[t.shellIdx]<=0) {
    const next=t.ammo.findIndex(n=>n>0);if(next>=0)t.shellIdx=next;
  }
}
