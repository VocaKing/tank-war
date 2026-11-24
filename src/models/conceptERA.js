// Coordinate-locked, destructible ERA tiles with bevelled, individually shaded modules.
// The exact same group/row/column layout is used by hit detection and visuals.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function bounds(spec, group) {
  const d = spec.dims, turret = group.part === 'turret';
  const width = turret ? d.turretW : d.W;
  const height = turret ? d.turretH : d.hullH;
  const length = turret ? d.turretL : d.L;
  return { crossMin: -width * 0.43, crossMax: width * 0.43,
    yMin: turret ? 0.08 : Math.min(0.63, height * 0.40),
    yMax: turret ? height * 0.88 : height * 0.95,
    zMin: -length * 0.36, zMax: length * 0.37 };
}
function groups(spec) { return Array.isArray(spec.eraLayout) ? spec.eraLayout : []; }
export function findEraTile(spec, hit) {
  if (!hit || !groups(spec).length) return null;
  for (const [groupIndex, group] of groups(spec).entries()) {
    if (group.part !== hit.part || group.face !== hit.face) continue;
    const b = bounds(spec, group), side = group.face === 'side' ? (hit.sideSign > 0 ? 1 : -1) : 0;
    const horizontal = group.face === 'side' ? hit.local.z : hit.local.x;
    const lo = group.face === 'side' ? b.zMin : b.crossMin, hi = group.face === 'side' ? b.zMax : b.crossMax;
    const u = (horizontal - lo) / (hi - lo), v = (hit.local.y - b.yMin) / (b.yMax - b.yMin);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const col = Math.floor(u * group.cols), row = Math.floor(v * group.rows);
    return { key: `${groupIndex}:${side}:${row}:${col}`, group, row, col, side };
  }
  return null;
}
const zero = new THREE.Matrix4().makeScale(0, 0, 0);
export function useEraTile(model, key) {
  const item = model.eraMeshes?.get(key);
  if (!item) return;
  item.mesh.setMatrixAt(item.index, zero);
  item.mesh.instanceMatrix.needsUpdate = true;
}
const PALETTES = {
  aegis140: [0x58634b, 0x697158, 0x46513f], bastion125: [0x555b46, 0x656b52, 0x454b3a],
  warden130: [0x4a5143, 0x5d644f, 0x3d4437], lancer120: [0x59604d, 0x6c715a, 0x464d40],
  cerberus135: [0x485449, 0x5b6657, 0x3d473e],
};
export function createEraVisuals(spec, body, turret) {
  const byKey = new Map(), d = spec.dims;
  for (const [groupIndex, group] of groups(spec).entries()) {
    const b = bounds(spec, group), front = group.face === 'front';
    if (!front && group.face !== 'side') continue;
    for (const side of (front ? [0] : [-1, 1])) {
      const width = front ? b.crossMax - b.crossMin : b.zMax - b.zMin;
      const height = b.yMax - b.yMin, tileW = width / group.cols, tileH = height / group.rows;
      const depth = front ? 0.135 : 0.105;
      const bevel = Math.min(0.022, tileH * 0.12, tileW * 0.10, depth * 0.22);
      const geo = new RoundedBoxGeometry(front ? tileW * 0.91 : depth, tileH * 0.89, front ? depth : tileW * 0.91, 2, bevel);
      const palette = PALETTES[spec.id] || [0x59614c, 0x69735b, 0x48513f];
      const mat = new THREE.MeshStandardMaterial({ color: palette[0], roughness: 0.79, metalness: 0.28 });
      const mesh = new THREE.InstancedMesh(geo, mat, group.cols * group.rows);
      mesh.name = `ERA_${group.part}_${group.face}_${side}_${groupIndex}`;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      (group.part === 'turret' ? turret : body).add(mesh);
      let n = 0;
      for (let row = 0; row < group.rows; row++) for (let col = 0; col < group.cols; col++) {
        const y = b.yMin + (row + 0.5) * tileH;
        const x = front ? b.crossMin + (col + 0.5) * tileW : side * (group.part === 'turret' ? d.turretW / 2 + 0.105 : d.W / 2 + 0.075);
        const z = front ? (group.part === 'turret' ? (d.turretBoxZ || 0) + d.turretL * 0.42 : d.L * 0.46) : b.zMin + (col + 0.5) * tileW;
        const seed = (groupIndex + 1) * 71 + (row + 1) * 29 + (col + 1) * 13 + (side + 1) * 7;
        const tilt = ((seed % 7) - 3) * 0.0025;
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(front ? 0 : tilt, front ? tilt : 0, 0));
        mesh.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(1, 1, 1)));
        const color = new THREE.Color(palette[seed % palette.length]);
        color.offsetHSL(0, ((seed % 5) - 2) * 0.006, ((seed % 9) - 4) * 0.012);
        mesh.setColorAt(n, color);
        byKey.set(`${groupIndex}:${side}:${row}:${col}`, { mesh, index: n });
        n++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  return byKey;
}
