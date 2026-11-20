// Garage armor preview. Models merge all hull paint into one mesh (same for turret/gun),
// so a per-mesh material can only be one color. We color vertices by local position instead.
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

// Classify a vertex (local to the mesh, which is in hull or turret space) into a face.
function faceOf(x, y, z, isTurret) {
  const ax = Math.abs(x);
  if (isTurret) {
    if (y > 0.45) return 'top';
    if (z > 0.25 && z >= ax) return 'front';
    if (z < -0.2 && -z >= ax * 0.6) return 'rear';
    return 'side';
  }
  // hull: +z front, -z rear, high y top, large |x| side
  if (y > 1.45) return 'top';
  if (z > 0.4 && z > ax) return 'front';
  if (z < -0.4 && -z > ax * 0.5) return 'rear';
  if (ax > 0.6) return 'side';
  return y > 1.0 ? 'top' : 'side';
}

export function applyArmorPreview(model, spec) {
  if (!model || !spec || !model.root) return 0;
  const ud = model.root.userData;
  if (ud._armorApplied) return ud._armorCount || 1;
  const shell = (spec.shells || []).find((s) => !['HE', 'HESH'].includes(s.type)) || spec.shells?.[0];
  if (!shell) return 0;
  const A = spec.armor || {};
  const colors = {
    hull: { front: penColor(A.hull?.front, shell), side: penColor(A.hull?.side, shell), rear: penColor(A.hull?.rear, shell), top: penColor(A.hull?.top, shell) },
    turret: { front: penColor(A.turret?.front, shell), side: penColor(A.turret?.side, shell), rear: penColor(A.turret?.rear, shell), top: penColor(A.turret?.top, shell) },
  };
  ud._armorOrig = [];
  let n = 0, verts = 0;
  model.root.traverse((o) => {
    if (!o.isMesh || o.userData.decal) return;
    if (o === model.wheels || o === model.sprockets) return;
    if (model.tracks && model.tracks.includes(o)) return;
    if (model.links && model.links.includes(o)) return;
    const key = o.userData.matKey;
    if (key && key !== 'paint' && key !== 'metal' && key !== 'steel') return;
    if (!key) return;
    let isTurret = false, p = o.parent;
    while (p) { if (p === model.turret || p === model.gun) { isTurret = true; break; } p = p.parent; }
    const part = isTurret ? 'turret' : 'hull';
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    const arr = new Float32Array(pos.count * 3);
    const pal = colors[part];
    for (let i = 0; i < pos.count; i++) {
      const face = faceOf(pos.getX(i), pos.getY(i), pos.getZ(i), isTurret);
      const c = pal[face] || pal.front;
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      verts++;
    }
    ud._armorOrig.push({ mesh: o, mat: o.material, colorAttr: o.geometry.getAttribute('color') });
    o.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    o.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    n++;
  });
  ud._armorApplied = n > 0;
  ud._armorCount = n;
  ud._armorVerts = verts;
  ud._armorShell = shell.name;
  return n;
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
}
