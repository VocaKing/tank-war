// Garage armor preview: recolors the tank with penetration colors.
// The model object from createTankModel is a plain {root, body, turret, ...}, not an Object3D,
// so state is stored on model.root.userData.
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

function los(th, slope) { return th / Math.max(0.08, Math.cos((slope || 0) * DEG)); }

export function penColor(plate, shell) {
  if (!plate || !shell) return C.n;
  const th = plate[0];
  if (!th || th <= 0) return C.n;
  const type = SHELL_TYPES[shell.type] || SHELL_TYPES.APCBC;
  if (type.he && !type.heat && !type.hesh) return C.n;
  const eff = los(th, plate[1]);
  const pen = shell.pen || 0;
  const lo = pen * (1 - PEN_RNG), hi = pen * (1 + PEN_RNG);
  if (lo >= eff) return C.g;
  if (hi < eff) return C.r;
  const t = (eff - lo) / Math.max(1, hi - lo);
  return t < 0.5 ? C.y.clone().lerp(C.o, t * 2) : C.o.clone().lerp(C.r, (t - 0.5) * 2);
}

function zoneOf(mesh, model) {
  let p = mesh.parent, part = 'hull';
  while (p) {
    if (p === model.turret || p === model.gun) { part = 'turret'; break; }
    p = p.parent;
  }
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const c = bb ? bb.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  let face = 'side';
  if (c.y > (part === 'turret' ? 0.35 : 1.3)) face = 'top';
  else if (c.z > 0.3) face = 'front';
  else if (c.z < -0.3) face = 'rear';
  return { part, face };
}

export function applyArmorPreview(model, spec) {
  if (!model || !spec || !model.root) return 0;
  const ud = model.root.userData;
  if (ud._armorApplied) return ud._armorCount || 1;
  const shell = (spec.shells || []).find((s) => !['HE', 'HESH'].includes(s.type)) || spec.shells?.[0];
  if (!shell) return 0;
  const A = spec.armor || {};
  ud._armorOrig = [];
  let n = 0;
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.decal) return;
    if (o === model.wheels || o === model.sprockets) return;
    if (model.tracks && model.tracks.includes(o)) return;
    if (model.links && model.links.includes(o)) return;
    const key = o.userData.matKey;
    if (key && key !== 'paint' && key !== 'metal' && key !== 'steel') return;
    if (!key) return;
    let part = 'hull', face = 'front';
    try { ({ part, face } = zoneOf(o, model)); } catch (e) { /* keep defaults */ }
    const plate = (A[part] && A[part][face]) || A.hull?.front || [0, 0];
    const col = penColor(plate, shell);
    ud._armorOrig.push({ mesh: o, mat: o.material });
    o.material = new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
    n++;
  });
  ud._armorApplied = n > 0;
  ud._armorCount = n;
  ud._armorShell = shell.name;
  return n;
}

export function clearArmorPreview(model) {
  if (!model || !model.root) return;
  const ud = model.root.userData;
  if (!ud._armorApplied) return;
  for (const { mesh, mat } of ud._armorOrig || []) if (mesh) mesh.material = mat;
  ud._armorOrig = [];
  ud._armorApplied = false;
  ud._armorCount = 0;
}
