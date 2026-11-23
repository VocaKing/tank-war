// Garage armor preview. Models merge hull/turret paint into a few meshes, so we color
// vertices by local normal + position. Reference pen is chosen so the hull front is
// borderline (yellow); sides and rear then show as green, thick plates as red.
import * as THREE from 'three';
import { SHELL_TYPES, PEN_RNG } from '../game/tankData.js';

const DEG = Math.PI / 180;
const C = {
  g: new THREE.Color(0x2ecc40),
  y: new THREE.Color(0xf1c40f),
  o: new THREE.Color(0xe67e22),
  r: new THREE.Color(0xe74c3c),
  n: new THREE.Color(0x7f8c8d),
};

function los(th, slope) { return (th || 0) / Math.max(0.08, Math.cos((slope || 0) * DEG)); }

export function penColorFor(eff, pen) {
  if (!eff || eff <= 0) return C.n;
  const lo = pen * (1 - PEN_RNG), hi = pen * (1 + PEN_RNG);
  if (lo >= eff) return C.g;
  if (hi < eff) return C.r;
  const t = (eff - lo) / Math.max(1, hi - lo);
  return t < 0.5 ? C.y.clone().lerp(C.o, t * 2) : C.o.clone().lerp(C.r, (t - 0.5) * 2);
}

// Face from local normal (dominant) and position. +z = front.
function faceOf(nx, ny, nz, x, y, z, isTurret) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay > 0.7 && ny > 0) return 'top';
  if (az >= ax && az >= ay) return nz > 0 ? 'front' : 'rear';
  if (ax >= ay) return 'side';
  // fallback by position
  if (isTurret) {
    if (y > 0.4) return 'top';
    if (z > 0.2) return 'front';
    if (z < -0.15) return 'rear';
    return 'side';
  }
  if (y > 1.4) return 'top';
  if (z > 0.3) return 'front';
  if (z < -0.3) return 'rear';
  return 'side';
}

export function applyArmorPreview(model, spec, shellOrPen) {
  if (!model || !spec || !model.root) return { n: 0, pen: 0 };
  const ud = model.root.userData;
  // Allow re-apply when the reference pen changes.
  const shell = shellOrPen && shellOrPen.pen ? shellOrPen : null;
  const refKey = shell ? shell.name + shell.pen : shellOrPen;
  if (ud._armorApplied && ud._armorRef === refKey) return { n: ud._armorCount || 1, pen: shell ? shell.pen : shellOrPen, shell: shell && shell.name };
  if (ud._armorApplied) clearArmorPreview(model);
  const A = spec.armor || {};
  const frontLOS = los(A.hull?.front?.[0], A.hull?.front?.[1]);
  const sideLOS = los(A.hull?.side?.[0], A.hull?.side?.[1]);
  const pen = shell ? shell.pen : (shellOrPen || Math.round((frontLOS + sideLOS) / 2) || 80);
  const plates = {
    hull: { front: los(A.hull?.front?.[0], A.hull?.front?.[1]), side: los(A.hull?.side?.[0], A.hull?.side?.[1]), rear: los(A.hull?.rear?.[0], A.hull?.rear?.[1]), top: los(A.hull?.top?.[0], A.hull?.top?.[1]) },
    turret: { front: los(A.turret?.front?.[0], A.turret?.front?.[1]), side: los(A.turret?.side?.[0], A.turret?.side?.[1]), rear: los(A.turret?.rear?.[0], A.turret?.rear?.[1]), top: los(A.turret?.top?.[0], A.turret?.top?.[1]) },
  };
  ud._armorOrig = [];
  let n = 0;
  model.root.traverse((o) => {
    if (!o.isMesh || o.userData.decal) return;
    if (o.userData.runningGear || o === model.wheels || o === model.sprockets) return;
    if (model.tracks && model.tracks.includes(o)) return;
    if (model.links && model.links.includes(o)) return;
    const key = o.userData.matKey;
    if (!key || (key !== 'paint' && key !== 'metal' && key !== 'steel')) return;
    let isTurret = false, p = o.parent;
    while (p) { if (p === model.turret || p === model.gun) { isTurret = true; break; } p = p.parent; }
    const part = isTurret ? 'turret' : 'hull';
    const pos = o.geometry.attributes.position;
    const nrm = o.geometry.attributes.normal;
    if (!pos) return;
    const arr = new Float32Array(pos.count * 3);
    const pal = plates[part];
    for (let i = 0; i < pos.count; i++) {
      const face = faceOf(nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0, pos.getX(i), pos.getY(i), pos.getZ(i), isTurret);
      const c = penColorFor(pal[face] || pal.front, pen);
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    ud._armorOrig.push({ mesh: o, mat: o.material, colorAttr: o.geometry.getAttribute('color') });
    o.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    o.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    n++;
  });
  ud._armorApplied = n > 0;
  ud._armorCount = n;
  ud._armorRef = refKey;
  return { n, pen, shell: shell && shell.name };
}

export function clearArmorPreview(model) {
  if (!model || !model.root) return;
  const ud = model.root.userData;
  if (!ud._armorApplied) return;
  for (const { mesh, mat, colorAttr } of ud._armorOrig || []) {
    if (!mesh) continue;
    mesh.material = mat;
    if (colorAttr) mesh.geometry.setAttribute('color', colorAttr);
    else mesh.geometry.deleteAttribute('color');
  }
  ud._armorOrig = [];
  ud._armorApplied = false;
  ud._armorCount = 0;
  ud._armorRef = 0;
}
