// Garage armor preview: forces a plain material onto the tank so the pen colors are visible
// even though the normal paint uses a custom camo shader.
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
  // Use the mesh's own bounding box center in parent-local space (avoids world-matrix issues).
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
  if (!model || !spec) return 0;
  if (model.userData._armorApplied) return model.userData._armorCount || 1;
  const shell = (spec.shells || []).find((s) => !['HE', 'HESH'].includes(s.type)) || spec.shells?.[0];
  if (!shell) return 0;
  const A = spec.armor || {};
  model.userData._armorOrig = [];
  let n = 0;
  let total = 0, meshes = 0, keyed = 0;
  const root = model.root || model;
  if (!root || !root.traverse) { model.userData._armorCount = 0; return 0; }
  root.traverse((o) => {
    total++;
    if (!o.isMesh) return;
    meshes++;
    if (o.userData.decal) return;
    if (o === model.wheels || o === model.sprockets) return;
    if (model.tracks && model.tracks.includes(o)) return;
    if (model.links && model.links.includes(o)) return;
    const key = o.userData.matKey || 'paint';
    keyed++;
    let part = 'hull', face = 'front';
    try { ({ part, face } = zoneOf(o, model)); } catch (e) { /* keep defaults */ }
    const plate = (A[part] && A[part][face]) || A.hull?.front || [0, 0];
    const col = penColor(plate, shell);
    model.userData._armorOrig.push({ mesh: o, mat: o.material });
    const mat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
    o.material = mat;
    o.material.needsUpdate = true;
    n++;
  });
  model.userData._armorApplied = n > 0;
  model.userData._armorCount = n;
  model.userData._armorDebug = total + '/' + meshes + '/' + keyed;
  model.userData._armorShell = shell.name;
  return n;
}

export function clearArmorPreview(model) {
  if (!model || !model.userData._armorApplied) return;
  for (const { mesh, mat } of model.userData._armorOrig || []) if (mesh) mesh.material = mat;
  model.userData._armorOrig = [];
  model.userData._armorApplied = false;
  model.userData._armorCount = 0;
}
