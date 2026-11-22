// Armour-penetration view (sniper mode only). Every visible enemy tank is re-shaded per fragment:
// a ray from the player's muzzle to the fragment is intersected with the same hull/turret armour
// boxes the ballistics use, the armour zone + plate slope give the effective thickness for the
// currently loaded shell (normalisation, ricochet, overmatch, HEAT multipliers, ERA, skirts), and
// that is compared with the shell's penetration at that distance including the ±PEN_RNG roll.
//   green  = penetrates even on the minimum roll      red  = cannot penetrate / ricochet
//   yellow → orange = may penetrate (more orange = less likely)        grey = no armour behind (gun, wheels)
import * as THREE from 'three';
import { SHELL_TYPES, PEN_RNG, zoneLowerFrontY, zoneLowerSideY } from './tankData.js';
import { impactDrop, MIN_INCIDENCE_COS } from './combatMath.js';

const FACE_KEYS = ['front', 'side', 'rear', 'top', 'bottom'];
const GLSL = /* glsl */`
uniform mat4 avInv; uniform vec3 avMuzzle; uniform vec4 avTur; // turret pos xyz, yaw
uniform vec4 avHull; // half-x, y0, y1, half-z
uniform vec4 avTurBox; // half-x, y0, y1, zc ; avTurL = half length
uniform float avTurL; uniform float avTurOn;
uniform vec2 avArm[12]; // 0-4 hull f,s,r,t,b  5 lowerFront 6 lowerSide  7-10 turret f,s,r,t  11 mantlet
uniform vec4 avZone; // lowerFrontY, lowerSideY, mantletHalfW, turretH
uniform vec4 avMods; // heatMult, eraHEAT, eraKE, skirt
uniform vec4 avShell; // pen@100, falloff, caliber, ricochetDeg
uniform vec4 avShell2; // reserved, heat, he, rng
uniform float avVelocity;
varying vec3 vAvW;
// returns (tEntry, axis, sign); axis < 0 => miss
vec3 avSlab(vec3 a, vec3 b, vec3 lo, vec3 hi) {
  float tmin = 0.0, tmax = 1.0, axis = -1.0, sgn = 0.0; vec3 d = b - a;
  for (int i = 0; i < 3; i++) {
    if (abs(d[i]) < 1e-6) { if (a[i] < lo[i] || a[i] > hi[i]) return vec3(2.0, -1.0, 0.0); continue; }
    float t0 = (lo[i] - a[i]) / d[i], t1 = (hi[i] - a[i]) / d[i], s = -1.0;
    if (t0 > t1) { float tt = t0; t0 = t1; t1 = tt; s = 1.0; }
    if (t0 > tmin) { tmin = t0; axis = float(i); sgn = s; }
    tmax = min(tmax, t1); if (tmin > tmax) return vec3(2.0, -1.0, 0.0);
  }
  if (axis < 0.0) return vec3(2.0, -1.0, 0.0);
  return vec3(tmin, axis, sgn);
}
vec3 avRotY(vec3 p, float yaw) { float c = cos(yaw), s = sin(yaw); return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c); }
// returns rgb (or -1 for no hit)
vec4 armorColor(vec3 W) {
  vec3 dirW = normalize(W - avMuzzle);
  vec3 a = (avInv * vec4(avMuzzle, 1.0)).xyz, b = (avInv * vec4(W + dirW * 2.5, 1.0)).xyz;
  vec3 h = avSlab(a, b, vec3(-avHull.x, avHull.y, -avHull.w), vec3(avHull.x, avHull.z, avHull.w));
  vec3 ta = avRotY(a - avTur.xyz, avTur.w), tb = avRotY(b - avTur.xyz, avTur.w);
  vec3 t = avTurOn > 0.5 ? avSlab(ta, tb, vec3(-avTurBox.x, avTurBox.y, avTurBox.w - avTurL), vec3(avTurBox.x, avTurBox.z, avTurBox.w + avTurL)) : vec3(2.0, -1.0, 0.0);
  bool turret = t.y >= 0.0 && (h.y < 0.0 || t.x < h.x);
  vec3 hit = turret ? t : h; if (hit.y < 0.0) return vec4(-1.0);
  vec3 A = turret ? ta : a, B = turret ? tb : b; vec3 L = mix(A, B, hit.x);
  // Use the predicted impact point, not the visible fitting behind the plate.
  vec3 delta = (W + dirW * 2.5 - avMuzzle) * hit.x;
  float d2 = dot(delta, delta);
  float u = avVelocity * avVelocity - 9.81 * delta.y;
  float disc = u*u - 9.81*9.81*d2;
  if (disc >= 0.0 && u > 0.0) delta.y -= 9.81*d2/max(1e-6,u+sqrt(disc));
  vec3 ld = normalize((avInv * vec4(delta, 0.0)).xyz);
  if (turret) ld = avRotY(ld,avTur.w);
  int face; // 0 front 1 side 2 rear 3 top 4 bottom
  if (hit.y > 1.5) face = hit.z > 0.0 ? 0 : 2; else if (hit.y > 0.5) face = hit.z > 0.0 ? 3 : 4; else face = 1;
  vec2 arm; int idx = face;
  if (!turret) {
    if (face == 0 && avArm[5].x > 0.0 && L.y < avZone.x) idx = 5;
    else if (face == 1 && avArm[6].x > 0.0 && L.y < avZone.y) idx = 6;
  } else {
    idx = face == 4 ? 3 : 7 + face;
    if (face == 0 && avArm[11].x > 0.0 && abs(L.x) < avZone.z && L.y > avZone.w * 0.12 && L.y < avZone.w * 0.88) idx = 11;
  }
  arm = avArm[idx];
  float sl = radians(arm.y); vec3 n;
  if (face == 0) n = vec3(0.0, sin(sl), cos(sl)); else if (face == 2) n = vec3(0.0, sin(sl), -cos(sl));
  else if (face == 1) n = vec3(hit.z * cos(sl), sin(sl), 0.0); else n = vec3(0.0, face == 3 ? 1.0 : -1.0, 0.0);
  float cosA = clamp(abs(dot(ld,n)),0.0,1.0);
  float ang = degrees(acos(cosA));
  float eff = arm.x / max(${MIN_INCIDENCE_COS.toExponential()},cosA);
  bool heat = avShell2.y > 0.5, he = avShell2.z > 0.5;
  if (heat) { eff *= avMods.x; if (face == 0) eff += avMods.y; if (!turret && face == 1) eff += avMods.w; }
  else if (!he && face == 0) eff += avMods.z;
  if (!turret && face == 1 && L.y < avZone.y) eff += 20.0;
  bool ric = !he && ang > avShell.w && !(avShell.z > arm.x * 3.0);
  float dist = sqrt(d2);
  float pen = avShell.x * max(0.35, 1.0 - avShell.y * max(0.0, dist - 100.0) / 1000.0);
  float pmin = pen * (1.0 - avShell2.w), pmax = pen * (1.0 + avShell2.w);
  vec3 col;
  if (ric || eff > pmax) col = vec3(0.86, 0.12, 0.08);
  else if (eff <= pmin) col = vec3(0.16, 0.82, 0.22);
  else { float p = (pmax - eff) / (pmax - pmin); col = mix(vec3(1.0, 0.42, 0.05), vec3(1.0, 0.86, 0.12), p); }
  return vec4(col, float(idx));
}
`;

// v3: the armour view is a semi-transparent OVERLAY drawn on top of the tank's own paint (not a replacement material):
// ~45 % tint on plate faces, stronger at grazing angles (rim) and an almost opaque outline where the colour class or
// the armour zone changes, so plate boundaries stay readable while the camouflage remains visible underneath.
function makeMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      varying vec3 vAvW; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 p = vec4(position, 1.0); vec3 nn = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
        #endif
        vec4 w = modelMatrix * p; vAvW = w.xyz; vN = normalize(mat3(modelMatrix) * nn); vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: GLSL.replace('varying vec3 vAvW;', '') + /* glsl */`
      varying vec3 vAvW; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 c = armorColor(vAvW); bool none = c.x < 0.0; vec3 col = none ? vec3(0.55) : c.rgb;
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float edge = clamp(step(0.01, fwidth(none ? -1.0 : c.w)) + length(fwidth(col)) * 5.0, 0.0, 1.0);
        float a = none ? 0.1 : 0.42 + 0.25 * rim; a = max(a, edge * 0.9);
        gl_FragColor = vec4(col * (1.0 + edge * 0.25), a);
        #include <colorspace_fragment>
      }`,
  });
}

export class ArmorView {
  constructor(game) { this.game = game; this.enabled = true; this.active = false; this.data = new Map(); }
  toggle() { this.enabled = !this.enabled; return this.enabled; }
  ensure(t) {
    let d = this.data.get(t); if (d) return d;
    const u = {
      avInv: { value: new THREE.Matrix4() }, avMuzzle: { value: new THREE.Vector3() }, avTur: { value: new THREE.Vector4() },
      avHull: { value: new THREE.Vector4() }, avTurBox: { value: new THREE.Vector4() }, avTurL: { value: 1 }, avTurOn: { value: 1 },
      avArm: { value: Array.from({ length: 12 }, () => new THREE.Vector2()) }, avZone: { value: new THREE.Vector4() },
      avMods: { value: new THREE.Vector4() }, avShell: { value: new THREE.Vector4() }, avShell2: { value: new THREE.Vector4() }, avVelocity: { value: 1 },
    };
    const s = t.spec, A = s.armor, dd = s.dims;
    FACE_KEYS.forEach((k, i) => u.avArm.value[i].set(...(A.hull[k] || A.hull.bottom)));
    if (A.lowerFront) u.avArm.value[5].set(...A.lowerFront); if (A.lowerSide) u.avArm.value[6].set(...A.lowerSide);
    ['front', 'side', 'rear', 'top'].forEach((k, i) => u.avArm.value[7 + i].set(...A.turret[k]));
    if (A.mantlet) u.avArm.value[11].set(...A.mantlet);
    u.avZone.value.set(zoneLowerFrontY(dd), zoneLowerSideY(dd), dd.turretW * 0.24, dd.turretH);
    u.avMods.value.set(A.heatMult || 1, A.era || 0, A.eraKE || 0, A.skirt || 0);
    const hb = t.hullBox, tb = t.turBox; u.avHull.value.set(hb.x, hb.y0, hb.y1, hb.z);
    u.avTurBox.value.set(tb.x, tb.y0, tb.y1, (tb.z0 + tb.z1) / 2); u.avTurL.value = (tb.z1 - tb.z0) / 2;
    d = { u, mat: makeMaterial(u), on: false }; this.data.set(t, d); return d;
  }
  setOn(t, on) {
    const d = this.ensure(t);
    if (!d.ov) { // one overlay mesh per model mesh, sharing geometry / instance matrices; paint stays untouched underneath
      d.ov = [];
      for (const m of t.model.meshes) {
        if (m.userData.decal) continue;
        const ov = m.isInstancedMesh ? new THREE.InstancedMesh(m.geometry, d.mat, m.count) : new THREE.Mesh(m.geometry, d.mat);
        if (m.isInstancedMesh) ov.instanceMatrix = m.instanceMatrix;
        ov.frustumCulled = false; ov.castShadow = false; ov.receiveShadow = false; ov.renderOrder = 5; ov.visible = false; ov.userData.avOverlay = true; ov.userData.src = m;
        m.add(ov); d.ov.push(ov);
      }
    }
    if (on) for (const ov of d.ov) { const m = ov.userData.src; ov.geometry = m.geometry; if (m.isInstancedMesh) ov.count = m.count; }
    if (d.on === on) return; d.on = on;
    for (const ov of d.ov) ov.visible = on;
  }
  update() {
    const g = this.game, p = g.player;
    this.active = this.enabled && g.cam.sniper && p.alive && !g.camOverride;
    const muzzle = this.active ? p.model.muzzle.getWorldPosition(new THREE.Vector3()) : null;
    const sh = p.previewShell, ty = SHELL_TYPES[sh.type];
    for (const t of g.tanks) {
      const show = this.active && t.team !== p.team && t.alive && t.model.root.visible;
      if (!show) { if (this.data.get(t)?.on) this.setOn(t, false); continue; }
      const d = this.ensure(t); this.setOn(t, true); const u = d.u;
      u.avInv.value.copy(t.inv); u.avMuzzle.value.copy(muzzle);
      const tp = t.model.turret.position; u.avTur.value.set(tp.x, tp.y, tp.z, t.turretYaw); u.avTurOn.value = t.turretGone ? 0 : 1;
      u.avShell.value.set(sh.pen, ty.falloff, sh.caliber, ty.ricochet); u.avShell2.value.set(0, ty.heat ? 1 : 0, ty.he ? 1 : 0, PEN_RNG); u.avVelocity.value = sh.velocity;
    }
  }
  // CPU mirror of the shader classification (used by tests and the HUD legend)
  classify(target, worldPoint) {
    const g = this.game, p = g.player; const muzzle = p.model.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = worldPoint.clone().sub(muzzle).normalize(); const end = worldPoint.clone().addScaledVector(dir, 2.5);
    const hit = target.rayTest(muzzle, end); if (!hit) return { cls: 'none' };
    const delta = end.clone().sub(muzzle).multiplyScalar(hit.t);
    const dist = delta.length();
    delta.y -= impactDrop(delta.lengthSq(), delta.y, p.shell.velocity);
    hit.ldir.copy(delta).transformDirection(target.inv);
    if (hit.part === 'turret') hit.ldir.applyAxisAngle(new THREE.Vector3(0,1,0),-target.turretYaw);
    const ev = g.ballistics.evaluate(target, hit, p.previewShell, dist);
    const pmin = ev.pen * (1 - PEN_RNG), pmax = ev.pen * (1 + PEN_RNG);
    const cls = ev.ricochet || ev.eff > pmax ? 'red' : ev.eff <= pmin ? 'green' : 'yellow';
    return { cls, los: ev.los, eff: Math.round(ev.eff), pen: Math.round(ev.pen), part: hit.part, face: hit.face, zone: ev.zone, angle: Math.round(ev.angle), ricochet: ev.ricochet };
  }
  dispose() { for (const t of this.data.keys()) this.setOn(t, false); }
  overlayCount(t) { const d = this.data.get(t); return d && d.ov ? d.ov.filter((o) => o.visible).length : 0; }
}
