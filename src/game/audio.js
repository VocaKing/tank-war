// Synthesised WebAudio sound effects with distance attenuation and speed-of-sound delay
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.listener = { x: 0, y: 0, z: 0 }; this.volume = 0.7; }
  init() {
    if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.enabled = false; return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine loop
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng2 = c.createOscillator(); this.eng2.type = 'square';
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 300; this.engG = c.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.engF); this.eng2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); this.eng.start(); this.eng2.start();
    const ns = c.createBufferSource(); ns.buffer = this.noise; ns.loop = true; this.trkF = c.createBiquadFilter(); this.trkF.type = 'bandpass'; this.trkF.frequency.value = 900; this.trkF.Q.value = 0.7; this.trkG = c.createGain(); this.trkG.gain.value = 0; ns.connect(this.trkF); this.trkF.connect(this.trkG); this.trkG.connect(this.master); ns.start();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setListener(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }
  _dist(p) { if (!p) return 0; return Math.hypot(p.x - this.listener.x, p.y - this.listener.y, p.z - this.listener.z); }
  _noiseBurst(t0, dur, freq, gain, type = 'lowpass', q = 0.7, decay = 4) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.6 + Math.random() * 0.3;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05); void decay;
  }
  gun(p, caliber, own = false) {
    if (!this.ctx || !this.enabled) return; const d = own ? 0 : this._dist(p); const att = Math.min(1, 40 / (d + 20)); if (att < 0.02) return;
    const t0 = this.ctx.currentTime + d / 343; const k = caliber / 100;
    this._noiseBurst(t0, 1.6 + k, 900 - d * 0.5 > 150 ? 900 - d * 0.5 : 150, 1.4 * att, 'lowpass');
    this._noiseBurst(t0, 0.25, 3000, 0.5 * att * (d < 200 ? 1 : 0.3), 'bandpass', 0.8);
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + 0.5);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.9 * att, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.8);
  }
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
