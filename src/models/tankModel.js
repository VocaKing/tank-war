// Procedural, real-scale (1 unit = 1 m) tank models built from code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { trackTexture, decalTexture } from '../world/textures.js';
import { tankCamoTexture as camoTexture } from './paint.js';
import { DEG, makeNoise2D, tileField, sampleField, RNG } from '../util.js';

import { V3, T, box, cylY, cylX, cylZ, sideExtrude, topExtrude, flipWinding, taper, lathe, superEllipse, clean, Parts } from './geom.js';
import { buildV2 } from './tanksV2.js';
import * as K from './kit.js';
import { TANKS } from '../game/tankData.js';

// ---------- Materials ----------
let NOISE_TEX = null;
function noiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const S = 256; const d = new Uint8Array(S * S * 4); const n = makeNoise2D(77); const n2 = makeNoise2D(91);
  const N = 128; const f1 = tileField(n, N, 4, 5), f2 = tileField(n2, N, 12, 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v1 = Math.min(1, Math.max(0, sampleField(f1, N, x / S, y / S) * 1.2 + 0.5)); const v2 = Math.min(1, Math.max(0, sampleField(f2, N, x / S, y / S) * 1.2 + 0.5)); const v3 = Math.random();
    const i = (y * S + x) * 4; d[i] = v1 * 255; d[i + 1] = v2 * 255; d[i + 2] = v3 * 255; d[i + 3] = 255;
  }
  NOISE_TEX = new THREE.DataTexture(d, S, S); NOISE_TEX.wrapS = NOISE_TEX.wrapT = THREE.RepeatWrapping; NOISE_TEX.magFilter = THREE.LinearFilter; NOISE_TEX.minFilter = THREE.LinearMipmapLinearFilter; NOISE_TEX.generateMipmaps = true; NOISE_TEX.needsUpdate = true;
  return NOISE_TEX;
}
const _eu = new THREE.Euler(), _qq = new THREE.Quaternion(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(1,1,1), _mat = new THREE.Matrix4();
export function updateRunningGear(model, distL, distR) {
  if (distL === 0 && distR === 0) return;
  const tp = model.pitch || 0.17; model.trackOffset[0] -= distL / tp; model.trackOffset[1] -= distR / tp;
  model.trackTex[0].offset.x = model.trackOffset[0]; model.trackTex[1].offset.x = model.trackOffset[1];
  model.spinL = (model.spinL || 0) + distL; model.spinR = (model.spinR || 0) + distR;
  const set = (im, list) => {
    if (!im || !list) return;
    list.forEach((w, i) => {
      const dist = w.side < 0 ? model.spinL : model.spinR;
      _eu.set(dist / w.r, 0, 0); _qq.setFromEuler(_eu); _pos.set(w.x, w.y, w.z); _scl.set(w.w, w.r, w.r); _mat.compose(_pos, _qq, _scl); im.setMatrixAt(i, _mat);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  model._gearFrame = (model._gearFrame || 0) + 1;
  const fast = Math.abs(distL) + Math.abs(distR) > 0.08;
  if (fast || model._gearFrame % 2 === 0) {
    set(model.wheels, model.wheelList); set(model.sprockets, model.sprocketList); if (model.innerWheels) set(model.innerWheels, model.innerList);
    if (model.linksOn) updateLinks(model);
  }
}
export function updateSuspension(model, dt, speed, groundY) {
  if (!dt || dt > 0.25) { model.susY0 = groundY; return; }
  const s = model.sus ||= { y: 0, v: 0, dist: 0 }; const gy0 = model.susY0 ?? groundY; model.susY0 = groundY;
  const vy = (groundY - gy0) / dt; s.dist += Math.abs(speed) * dt;
  const bump = Math.min(1, Math.abs(speed) / 12) * 0.012 * (Math.sin(s.dist * 2.1) * 0.6 + Math.sin(s.dist * 5.3 + 1.3) * 0.4);
  const target = Math.max(-0.05, Math.min(0.05, -vy * 0.012)) + bump;
  const k = 90, c = 11; s.v += ((target - s.y) * k - s.v * c) * dt; s.y += s.v * dt; s.y = Math.max(-0.06, Math.min(0.06, s.y));
  model.body.position.y = s.y;
  const off = -s.y;
  if (Math.abs(off - (model._lastOff || 0)) > 0.0005) {
    for (const m of [model.wheels, model.innerWheels, model.sprockets, ...model.tracks, ...model.links]) if (m) m.position.y = off;
    model._lastOff = off;
  }
}
