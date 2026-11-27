// Synthesised WebAudio sound effects with distance attenuation and speed-of-sound delay
import { gunProfile, gunDistance, synthesizeGun } from './gunAudio.js';
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.listener = { x: 0, y: 0, z: 0 }; this.volume = 0.7; this.gunCache = new Map(); this.gunVoices = new Set(); this.gunSerial = 0; this.listenerRight = {x:1,z:0}; }
  init() {
    if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.enabled = false; return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = this.volume;
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=12;this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.16;this.master.connect(this.limiter);this.limiter.connect(c.destination);
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine loop
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng2 = c.createOscillator(); this.eng2.type = 'square';
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 300; this.engG = c.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.engF); this.eng2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); this.eng.start(); this.eng2.start();
    const ns = c.createBufferSource(); ns.buffer = this.noise; ns.loop = true; this.trkF = c.createBiquadFilter(); this.trkF.type = 'bandpass'; this.trkF.frequency.value = 900; this.trkF.Q.value = 0.7; this.trkG = c.createGain(); this.trkG.gain.value = 0; ns.connect(this.trkF); this.trkF.connect(this.trkG); this.trkG.connect(this.master); ns.start();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setListener(p,forward) { this.listener.x=p.x;this.listener.y=p.y;this.listener.z=p.z;if(forward){const h=Math.hypot(forward.x,forward.z);if(h>.001){this.listenerRight.x=-forward.z/h;this.listenerRight.z=forward.x/h;}} }
  _dist(p) { if (!p) return 0; return Math.hypot(p.x - this.listener.x, p.y - this.listener.y, p.z - this.listener.z); }
  _noiseBurst(t0, dur, freq, gain, type = 'lowpass', q = 0.7, decay = 4) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.6 + Math.random() * 0.3;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05); void decay;
  }
  _gunBuffer(profile,variant) {
    const key=profile.id+'|'+profile.mm+'|'+profile.kind+'|'+variant;
    if(this.gunCache.has(key))return this.gunCache.get(key);
    const data=synthesizeGun(profile,variant,24000);
    const buffer=this.ctx.createBuffer(1,data.length,24000);
    buffer.getChannelData(0).set(data);
    if(this.gunCache.size>=96)this.gunCache.delete(this.gunCache.keys().next().value);
    this.gunCache.set(key,buffer);return buffer;
  }
  gun(p,caliber,own=false,vehicleId='generic',options={}) {
    if(!this.ctx||!this.enabled)return;
    const profile=gunProfile(vehicleId,caliber,options.kind||'gun');
    const dist=gunDistance(profile,this._dist(p),own);
    if(dist.attenuation<.02)return;
    const c=this.ctx,at=c.currentTime+dist.delay+(options.offset||0);
    const volume=profile.gain*dist.attenuation/Math.sqrt(Math.max(1,options.salvoCount||1));
    if(this.gunVoices.size>=36){
      let quiet=null;
      for(const v of this.gunVoices)if(!v.own&&(!quiet||v.volume<quiet.volume))quiet=v;
      if(!quiet||!own&&quiet.volume>=volume)return;
      this.gunVoices.delete(quiet);try{quiet.source.stop();}catch{}
    }
    const source=c.createBufferSource();source.buffer=this._gunBuffer(profile,(this.gunSerial++)%2);
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=dist.cutoff;filter.Q.value=.5;
    const gain=c.createGain();gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);
    let pan=null;
    if(c.createStereoPanner){pan=c.createStereoPanner();const dx=(p?.x||0)-this.listener.x,dz=(p?.z||0)-this.listener.z;pan.pan.value=own?0:Math.max(-.85,Math.min(.85,(dx*this.listenerRight.x+dz*this.listenerRight.z)/Math.max(12,dist.distance)));gain.connect(pan);pan.connect(this.master);}
    else gain.connect(this.master);
    const voice={source,volume,own};this.gunVoices.add(voice);
    source.onended=()=>{this.gunVoices.delete(voice);source.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();};
    source.start(at);
  }
  clearGunVoices(){for(const v of this.gunVoices){try{v.source.stop();}catch{}}this.gunVoices.clear();}
  impact(p, kind) {
    if (!this.ctx || !this.enabled) return; const d = this._dist(p); const att = Math.min(1, 30 / (d + 15)); if (att < 0.02) return; const t0 = this.ctx.currentTime + d / 343;
    if (kind === 'ricochet') { const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(2400, t0); o.frequency.exponentialRampToValueAtTime(700, t0 + 0.5); const g = this.ctx.createGain(); g.gain.setValueAtTime(0.35 * att, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.6); this._noiseBurst(t0, 0.15, 4000, 0.4 * att, 'highpass'); }
    else if (kind === 'metal') { this._noiseBurst(t0, 0.4, 1800, 0.9 * att, 'bandpass', 2); const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 180; const g = this.ctx.createGain(); g.gain.setValueAtTime(0.25 * att, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.45); }
    else if (kind === 'explosion') { this._noiseBurst(t0, 3.0, 400, 1.6 * att, 'lowpass'); this._noiseBurst(t0, 0.6, 1500, 0.7 * att); }
    else if (kind === 'wreck') {
      this._noiseBurst(t0, 3.8, 245, 1.25 * att);
      this._noiseBurst(t0, 0.53, 1650, 0.55 * att, 'bandpass', 0.65);
      this._noiseBurst(t0 + 0.09, 1.9, 630, 0.34 * att);
    }
    else { this._noiseBurst(t0, 0.9, 600, 0.8 * att, 'lowpass'); }
  }
  engine(load, speed, rpm0 = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; const f = (32 + load * 28 + Math.abs(speed) * 2.2) * rpm0;
    this.eng.frequency.setTargetAtTime(f, t, 0.15); this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.15); this.engF.frequency.setTargetAtTime(220 + load * 500, t, 0.2);
    this.engG.gain.setTargetAtTime(0.06 + load * 0.08, t, 0.2); this.trkG.gain.setTargetAtTime(Math.min(0.25, Math.abs(speed) * 0.02), t, 0.2);
  }
  stopEngine() { if (this.ctx) { this.engG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); this.trkG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } }
}
