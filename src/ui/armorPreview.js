// Garage armor preview: recolors the current tank with the same penetration palette
// used in-battle. Primary kinetic shell, 100 m, head-on.
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
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3());
  const local = (part === 'turret' ? model.turret : model.body).worldToLocal(c.clone());
  let face = 'side';
  if (local.y > (part === 'turret' ? 0.4 : 1.4)) face = 'top';
  else if (local.z > 0.4) face = 'front';
  else if (local.z < -0.4) face = 'rear';
  return { part, face };
}

export function applyArmorPreview(model, spec) {
  if (!model || !spec) return false;
  if (model.userData._armorApplied) return true;
  const shell = (spec.shells || []).find((s) => !['HE', 'HESH'].includes(s.type)) || spec.shells?.[0];
  if (!shell) return false;
  const A = spec.armor || {};
  model.userData._armorOrig = [];
  let n = 0;
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.decal) return;
    const key = o.userData.matKey;
    if (key && key !== 'paint' && key !== 'metal' && key !== 'steel') return;
    if (!key && o !== model.wheels && o !== model.sprockets) return;
    const { part, face } = zoneOf(o, model);
    const plate = (A[part] && A[part][face]) || A.hull?.front || [0, 0];
    const col = penColor(plate, shell);
    model.userData._armorOrig.push({ mesh: o, mat: o.material });
    o.material = new THREE.MeshBasicMaterial({ color: col });
    n++;
  });
  model.userData._armorApplied = n > 0;
  model.userData._armorShell = shell.name;
  return n > 0;
}

export function clearArmorPreview(model) {
  if (!model || !model.userData._armorApplied) return;
  for (const { mesh, mat } of model.userData._armorOrig || []) if (mesh) mesh.material = mat;
  model.userData._armorOrig = [];
  model.userData._armorApplied = false;
}
