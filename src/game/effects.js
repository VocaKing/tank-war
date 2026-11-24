// GPU point-sprite particle systems + light flashes + tracers + debris
import * as THREE from 'three';
import { softSprite } from '../world/textures.js';
import { ArtilleryVfx } from './artilleryVfx.js';

const VS = `
attribute float aSize; attribute vec4 aColor; attribute float aRot;
varying vec4 vColor; varying float vRot; uniform float uScale;
#include <fog_pars_vertex>
void main(){ vColor = aColor; vRot = aRot; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = min(512.0, aSize * uScale / max(0.1, -mvPosition.z));
#include <fog_vertex>
}`;
const FS = `
uniform sampler2D uTex; varying vec4 vColor; varying float vRot;
#include <common>
#include <fog_pars_fragment>
void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5;
  vec4 t = texture2D(uTex, p); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.col = new Float32Array(max * 4); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: softSprite() }, uScale: { value: 600 } }]), vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
    this.mat.uniforms.uTex.value = softSprite();
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 5 : 4; scene.add(this.points); this.geo = g;
  }
  emit(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: 0, max: o.life || 1, s0: o.s0 || 1, s1: o.s1 ?? o.s0 * 2, r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, drag: o.drag ?? 1, grav: o.grav ?? 0, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (o.spin ?? 1), fadeIn: o.fadeIn ?? 0.05, r1: o.r1, g1: o.g1, b1: o.b1 }); }
  update(dt) {
    const P = this.p; let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; q.life += dt; if (q.life >= q.max) continue;
      const dr = Math.pow(q.drag, dt); q.vx *= dr; q.vy = q.vy * dr - q.grav * dt; q.vz *= dr; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += q.vr * dt;
      const t = q.life / q.max; const fade = Math.min(1, q.life / (q.max * q.fadeIn + 1e-4)) * (1 - t) ** 1.3;
      this.pos[w * 3] = q.x; this.pos[w * 3 + 1] = q.y; this.pos[w * 3 + 2] = q.z; this.size[w] = q.s0 + (q.s1 - q.s0) * Math.sqrt(t);
      const r = q.r1 !== undefined ? q.r + (q.r1 - q.r) * t : q.r, g = q.g1 !== undefined ? q.g + (q.g1 - q.g) * t : q.g, b = q.b1 !== undefined ? q.b + (q.b1 - q.b) * t : q.b;
      this.col[w * 4] = r; this.col[w * 4 + 1] = g; this.col[w * 4 + 2] = b; this.col[w * 4 + 3] = q.a * fade; this.rot[w] = q.rot;
      P[w] = q; w++;
    }
    P.length = w; this.geo.setDrawRange(0, w);
    if (!w) return;
    for (const attribute of Object.values(this.geo.attributes)) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, w * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
  dispose() { this.points.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

export class Effects {
  constructor(scene, renderer, dustColor = [0.55, 0.5, 0.42], quality = 'high') {
    this.scene = scene; this.smoke = new Particles(scene, 5000, false); this.fire = new Particles(scene, 2500, true);
    this.artillery = new ArtilleryVfx(scene, quality, dustColor);
    this.dust = dustColor; this.lights = []; this.burners = []; this.tracers = []; this.debris = [];
    const flashes = quality === 'high' ? 4 : quality === 'medium' ? 2 : 1;
    for (let i = 0; i < flashes; i++) { const l = new THREE.PointLight(0xffaa55, 0, 60, 1.6); scene.add(l); this.lights.push({ l, t: 0, max: 0.1, i0: 0 }); }
    this.tracerGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 5); this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffb566, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1); this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 });
    this.renderer = renderer;
  }
  setScale(h, fovDeg) { const s = h * this.renderer.getPixelRatio() / (2 * Math.tan((fovDeg * Math.PI) / 360)); this.smoke.mat.uniforms.uScale.value = s; this.fire.mat.uniforms.uScale.value = s; }
  dispose() {
    this.smoke.dispose(); this.fire.dispose(); this.artillery.dispose();
    this.tracerGeo.dispose(); this.tracerMat.dispose();
    this.debrisGeo.dispose(); this.debrisMat.dispose();
  }
  flash(pos, intensity = 60, dur = 0.09, color = 0xffaa55) {
    let best = this.lights[0]; for (const L of this.lights) if (L.t >= L.max) { best = L; break; }
    best.l.position.copy(pos); best.l.color.set(color); best.i0 = intensity; best.t = 0; best.max = dur; best.l.intensity = intensity;
  }
  muzzle(pos, dir, caliber) {
    const k = caliber / 100;
    this.flash(pos, 160 * k, 0.08);
    for (let i = 0; i < 14; i++) { const s = Math.random(); this.fire.emit({ x: pos.x + dir.x * s * 1.6, y: pos.y + dir.y * s * 1.6, z: pos.z + dir.z * s * 1.6, vx: dir.x * 12 * (1 - s) + (Math.random() - 0.5) * 3, vy: dir.y * 12 + (Math.random() - 0.5) * 3, vz: dir.z * 12 * (1 - s) + (Math.random() - 0.5) * 3, life: 0.08 + Math.random() * 0.06, s0: 1.4 * k + 0.6, s1: 2.6 * k + 1, r: 1, g: 0.75, b: 0.35, a: 1, drag: 0.02 }); }
    for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, sp = 3 + Math.random() * 6; const side = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6, Math.sin(a)).multiplyScalar(sp);
      this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * (6 + Math.random() * 14) + side.x, vy: dir.y * 8 + side.y + 0.5, vz: dir.z * (6 + Math.random() * 14) + side.z, life: 2.5 + Math.random() * 2, s0: 1.2 * k + 0.5, s1: 6 * k + 3, r: 0.78, g: 0.76, b: 0.72, a: 0.55, drag: 0.25, grav: -0.25 }); }
    // ground blast dust
    for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; this.smoke.emit({ x: pos.x, y: pos.y - 1.4, z: pos.z, vx: Math.cos(a) * 9, vy: 0.6, vz: Math.sin(a) * 9, life: 2.2, s0: 2, s1: 6, r: this.dust[0], g: this.dust[1], b: this.dust[2], a: 0.35, drag: 0.2 }); }
  }
  impactGround(pos, caliber, he = false) {
    const k = caliber / 100 * (he ? 1.8 : 1);
    for (let i = 0; i < 26 * k; i++) { this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 12 * k, vz: (Math.random() - 0.5) * 6, life: 1.2 + Math.random() * 1.6, s0: 0.8, s1: 4 * k + 1.5, r: this.dust[0] * 0.7, g: this.dust[1] * 0.65, b: this.dust[2] * 0.6, a: 0.85, drag: 0.4, grav: 6 }); }
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28; this.smoke.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z, vx: Math.cos(a) * 4, vy: 1.5, vz: Math.sin(a) * 4, life: 3 + Math.random() * 2, s0: 2, s1: 7 * k + 3, r: this.dust[0], g: this.dust[1], b: this.dust[2], a: 0.4, drag: 0.4, grav: -0.1 }); }
    if (he) { this.flash(pos, 90, 0.12); for (let i = 0; i < 14; i++) this.fire.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8, life: 0.25, s0: 2, s1: 4, r: 1, g: 0.6, b: 0.25, a: 1, drag: 0.1 }); }
  }
  impactWater(pos) { for (let i = 0; i < 40; i++) this.smoke.emit({ x: pos.x + (Math.random() - 0.5), y: pos.y, z: pos.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 3, vy: 6 + Math.random() * 10, vz: (Math.random() - 0.5) * 3, life: 1.5, s0: 0.6, s1: 2.5, r: 0.9, g: 0.94, b: 0.97, a: 0.8, drag: 0.6, grav: 9 }); }
  impactStructure(pos) { this.impactGround(pos, 80); for (let i = 0; i < 20; i++) this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8, life: 3, s0: 1.5, s1: 5, r: 0.75, g: 0.72, b: 0.66, a: 0.5, drag: 0.3 }); }
  artilleryImpact(pos, normal, surface) {
    const origin = pos.clone().addScaledVector(normal, 1.2);
    this.flash(origin, 720, 0.17, 0xff973d);
    this.artillery.burst(pos, normal, surface);
    if (surface === 'water') return;
    const count = this.artillery.budget.fire * 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 9 + Math.random() * 19;
      this.fire.emit({
        x: origin.x, y: origin.y, z: origin.z,
        vx: Math.cos(angle) * speed + normal.x * 5, vy: 4 + Math.random() * 15, vz: Math.sin(angle) * speed + normal.z * 5,
        life: 0.38 + Math.random() * 0.68, s0: 0.32 + Math.random() * 0.20, s1: 0.09,
        r: 1, g: 0.78, b: 0.38, r1: 0.92, g1: 0.26, b1: 0.035, drag: 0.31, grav: 15, fadeIn: 0.015,
      });
    }
  }
  sparks(pos, n = 30, color = [1, 0.8, 0.4], dir) {
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 18); if (dir) v.addScaledVector(dir, 12);
      this.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.25 + Math.random() * 0.35, s0: 0.25, s1: 0.1, r: color[0], g: color[1], b: color[2], a: 1, drag: 0.3, grav: 9.8 }); }
    this.flash(pos, 25, 0.05, 0xffe0a0);
  }
  penetration(pos) { this.sparks(pos, 40, [1, 0.65, 0.25]); for (let i = 0; i < 10; i++) this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 2.5, s0: 0.8, s1: 3, r: 0.2, g: 0.19, b: 0.18, a: 0.7, drag: 0.5 }); }
  explosion(pos, big = true) {
    this.flash(pos, big ? 900 : 300, 0.5, 0xff8a3a);
    for (let i = 0; i < (big ? 70 : 30); i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * (big ? 16 : 8));
      this.fire.emit({ x: pos.x, y: pos.y + 1, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.5 + Math.random() * 0.7, s0: 3, s1: big ? 9 : 5, r: 1, g: 0.62, b: 0.25, r1: 0.6, g1: 0.2, b1: 0.05, a: 1, drag: 0.15, grav: -2 }); }
    for (let i = 0; i < (big ? 60 : 25); i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 9);
      this.smoke.emit({ x: pos.x, y: pos.y + 1.5, z: pos.z, vx: v.x, vy: v.y + 2, vz: v.z, life: 4 + Math.random() * 4, s0: 3, s1: 14, r: 0.12, g: 0.11, b: 0.1, a: 0.85, drag: 0.4, grav: -0.6 }); }
    this.sparks(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 60, [1, 0.7, 0.3]);
    for (let i = 0; i < (big ? 14 : 5); i++) { const m = new THREE.Mesh(this.debrisGeo, this.debrisMat); const s = 0.15 + Math.random() * 0.45; m.scale.set(s, s * 0.5, s * 1.4); m.position.copy(pos).y += 1.5; m.castShadow = true; this.scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 18, 6 + Math.random() * 14, (Math.random() - 0.5) * 18), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), t: 0 }); }
  }
  addBurner(obj, offset, dur = 40, intensity = 1) { this.burners.push({ obj, offset, t: 0, dur, k: intensity, acc: 0 }); }
  trackDust(pos, speed, inWater, dt) {
    const rate = 36 * Math.min(1, Math.abs(speed) / 8);
    if (Math.random() >= Math.min(1, rate * dt)) return;
    if (inWater) { this.smoke.emit({ x: pos.x, y: pos.y + 0.3, z: pos.z, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 2, life: 1, s0: 0.6, s1: 2, r: 0.9, g: 0.94, b: 0.97, a: 0.6, drag: 0.5, grav: 6 }); return; }
    this.smoke.emit({ x: pos.x + (Math.random() - 0.5), y: pos.y + 0.3, z: pos.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.5, life: 2.5 + Math.random() * 2, s0: 1.2, s1: 5 + Math.abs(speed) * 0.25, r: this.dust[0], g: this.dust[1], b: this.dust[2], a: 0.22, drag: 0.5, grav: -0.05 });
  }
  landingDust(pos, heading, width, impactSpeed, inWater) {
    const force = Math.min(1, impactSpeed / 7);
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const tint = inWater ? [0.89, 0.93, 0.97] : this.dust;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2 + Math.floor(force * 4); i++) {
        const lateral = side * (width * 0.4 + Math.random() * 0.25);
        const along = (Math.random() - 0.5) * width;
        const spray = side * (0.7 + force * (1 + Math.random() * 2));
        this.smoke.emit({
          x: pos.x + cos * lateral + sin * along, y: pos.y + 0.2, z: pos.z - sin * lateral + cos * along,
          vx: cos * spray, vy: 0.7 + force * (1 + Math.random()), vz: -sin * spray,
          life: inWater ? 0.85 : 1.7 + force, s0: 0.75, s1: 2 + force * 3,
          r: tint[0], g: tint[1], b: tint[2], a: 0.24 + force * 0.12, drag: 0.75, grav: inWater ? 4 : 0.06,
        });
      }
    }
  }
  exhaust(pos, load) { if (Math.random() > 0.35 + load * 0.5) return; this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.8 + load, vz: (Math.random() - 0.5) * 0.6, life: 1.4, s0: 0.4, s1: 1.8, r: 0.25, g: 0.24, b: 0.23, a: 0.25 + load * 0.25, drag: 0.6, grav: -0.3 }); }
  addTracer(shell) { const m = new THREE.Mesh(this.tracerGeo, this.tracerMat); m.renderOrder = 6; this.scene.add(m); shell.tracer = m; }
  removeTracer(shell) { if (shell.tracer) { this.scene.remove(shell.tracer); shell.tracer = null; } }
  update(dt, ground, camera) {
    for (const L of this.lights) { if (L.t < L.max) { L.t += dt; L.l.intensity = L.i0 * Math.max(0, 1 - L.t / L.max); } else L.l.intensity = 0; }
    for (let i = this.burners.length - 1; i >= 0; i--) { const b = this.burners[i]; b.t += dt; if (b.t > b.dur) { this.burners.splice(i, 1); continue; }
      const p = b.obj.localToWorld(b.offset.clone()); const fade = 1 - b.t / b.dur; b.acc += dt * 30 * b.k;
      while (b.acc > 1) { b.acc -= 1;
        if (Math.random() < 0.5 * fade + 0.1) this.fire.emit({ x: p.x + (Math.random() - 0.5) * 1.2, y: p.y, z: p.z + (Math.random() - 0.5) * 1.2, vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5), life: 0.5 + Math.random() * 0.4, s0: 1.6 * fade + 0.4, s1: 0.4, r: 1, g: 0.55, b: 0.2, a: 0.9, drag: 0.5 });
        this.smoke.emit({ x: p.x, y: p.y + 1, z: p.z, vx: 0.6 + (Math.random() - 0.5), vy: 3 + Math.random() * 2, vz: 0.3 + (Math.random() - 0.5), life: 6 + Math.random() * 4, s0: 1.5, s1: 10, r: 0.1, g: 0.1, b: 0.1, a: 0.5 * fade + 0.15, drag: 0.7, grav: -0.2 }); }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) { const d = this.debris[i]; d.t += dt; d.v.y -= 9.81 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt;
      const gy = ground(d.m.position.x, d.m.position.z); if (d.m.position.y < gy + 0.1) { d.m.position.y = gy + 0.1; d.v.multiplyScalar(0.3); d.v.y = Math.abs(d.v.y) * 0.3; d.w.multiplyScalar(0.5); }
      if (d.t > 25) { this.scene.remove(d.m); this.debris.splice(i, 1); } }
    this.smoke.update(dt); this.fire.update(dt); this.artillery.update(dt, camera);
  }
}
