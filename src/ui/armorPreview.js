// Garage armor preview: colors the current tank model with the same penetration palette
// used in-battle (green = will pen, yellow = may pen, red = no pen / ricochet, grey = no armor).
// Uses the tank's primary kinetic shell at 100 m, head-on. Does not modify model generation.
import * as THREE from 'three';
import { SHELL_TYPES, PEN_RNG } from '../game/tankData.js';

const DEG = Math.PI / 180;
const GREEN = new THREE.Color(0x3dbe55);
const YELLOW = new THREE.Color(0xe3b54a);
const ORANGE = new THREE.Color(0xe07a30);
const RED = new THREE.Color(0xd0453a);
const GREY = new THREE.Color(0x6a6e72);

function los(th, slope) { return th / Math.max(0.08, Math.cos(slope * DEG)); }

// Approximate penetration color for a plate against a shell at 100 m, 0° impact (head-on).
export function penColor(plate, shell) {
  if (!plate || !shell) return GREY;
  const [th, slope] = plate;
  if (!th || th <= 0) return GREY;
  const type = SHELL_TYPES[shell.type] || SHELL_TYPES.APCBC;
  if (type.he && !type.heat && !type.hesh) return GREY;
  const eff = los(th, slope || 0);
  const pen = shell.pen;
  const minPen = pen * (1 - PEN_RNG);
  const maxPen = pen * (1 + PEN_RNG);
  if (minPen >= eff) return GREEN;
  if (maxPen < eff) return RED;
  const t = (eff - minPen) / Math.max(1, maxPen - minPen);
  return t < 0.5 ? YELLOW.clone().lerp(ORANGE, t * 2) : ORANGE.clone().lerp(RED, (t - 0.5) * 2);
}

// Classify a mesh as hull/turret + face based on its local bounding box center.
function classify(mesh, model) {
  const isTurret = mesh.parent === model.turret || (mesh.parent && mesh.parent.parent === model.turret);
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3());
  // convert to the relevant local space
  const local = isTurret ? model.turret.worldToLocal(c.clone()) : model.root.worldToLocal(c.clone());
  const absX = Math.abs(local.x), y = local.y, z = local.z;
  let face = 'side';
  if (y > (isTurret ? 0.55 : 1.55)) face = 'top';
  else if (z > 0.6) face = 'front';
  else if (z < -0.6) face = 'rear';
  else if (absX > 0.4) face = 'side';
  else face = 'top';
  return { part: isTurret ? 'turret' : 'hull', face };
}

export function applyArmorPreview(model, spec) {
  if (!model || !spec || model.userData._armorApplied) return;
  const shell = (spec.shells || []).find((s) => s.type !== 'HE' && s.type !== 'HESH') || spec.shells?.[0];
  if (!shell) return;
  const A = spec.armor;
  model.userData._armorOrig = [];
  model.root.traverse((o) => {
    if (!o.isMesh || o.userData.decal) return;
    const key = o.userData.matKey;
    if (key && key !== 'paint' && key !== 'metal') return;
    const { part, face } = classify(o, model);
    const plate = A[part]?.[face] || A.hull.front;
    const col = penColor(plate, shell);
    model.userData._armorOrig.push({ mesh: o, mat: o.material });
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.15 });
    o.material = m;
  });
  model.userData._armorApplied = true;
  model.userData._armorShell = shell.name;
}

export function clearArmorPreview(model) {
  if (!model || !model.userData._armorApplied) return;
  for (const { mesh, mat } of model.userData._armorOrig || []) mesh.material = mat;
  model.userData._armorOrig = [];
  model.userData._armorApplied = false;
}
