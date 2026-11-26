import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const ARMOR_FACES = ['front', 'side', 'rear', 'top', 'bottom'];
export const ARMOR_SURFACE = { HULL: 0, TURRET: 1, MANTLET: 2, GEAR: 3 };

// Use the horizontal component for steep glacis plates. Only nearly level
// panels, or upward faces in the central deck area, belong to the roof.
const LEVEL = 0.985, DECK = 0.86, DECK_SPAN = 0.30;
export function armorFace(normal, y, z, length, roof, floor) {
  const central = Math.abs(z) < length * DECK_SPAN;
  const deck = central && ((normal.y >= DECK && y >= roof) || (normal.y <= -DECK && y <= floor));
  if (Math.abs(normal.y) >= LEVEL || deck) {
    return normal.y > 0 ? 'top' : 'bottom';
  }
  if (Math.abs(normal.x) > Math.abs(normal.z)) return 'side';
  return normal.z > 0 ? 'front' : 'rear';
}
export const armorFaceGLSL = `
int armorFace(vec3 n, float y, float z, float length, float roof, float floorY) {
  bool central = abs(z) < length * ${DECK_SPAN};
  bool deck = central && ((n.y >= ${DECK} && y >= roof) || (n.y <= -${DECK} && y <= floorY));
  if (abs(n.y) >= ${LEVEL} || deck) return n.y > 0.0 ? 3 : 4;
  if (abs(n.x) > abs(n.z)) return 1;
  return n.z > 0.0 ? 0 : 2;
}
`;

const surfaces = new WeakMap();
const trees = new WeakMap();
function isBelow(mesh, ancestor) {
  if (!ancestor) return false;
  for (let object = mesh; object; object = object.parent) if (object === ancestor) return true;
  return false;
}

export function armorSurfaces(model) {
  if (surfaces.has(model)) return surfaces.get(model);
  const result = [];
  for (const mesh of model.meshes) {
    if (mesh.isInstancedMesh || mesh.userData.decal) continue;
    if (mesh.userData.armorTrack || mesh.userData.armorWheel) {
      result.push({ mesh, kind: ARMOR_SURFACE.GEAR });
      continue;
    }
    if (mesh.userData.runningGear || isBelow(mesh, model.barrel) || isBelow(mesh, model.secondaryGun)
      || isBelow(mesh, model.trim) || isBelow(mesh, model.blade)) continue;
    const painted = mesh.userData.matKey === 'paint';
    if (!painted) continue;
    const kind = isBelow(mesh, model.gun) ? ARMOR_SURFACE.MANTLET
      : isBelow(mesh, model.turret) ? ARMOR_SURFACE.TURRET : ARMOR_SURFACE.HULL;
    result.push({ mesh, kind });
  }
  surfaces.set(model, result);
  return result;
}

const inverseMesh = new THREE.Matrix4(), inverseAnchor = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const direction = new THREE.Vector3();
const localRay = new THREE.Ray();
const boundsHit = new THREE.Vector3(), endLocal = new THREE.Vector3();

const instanceMatrix = new THREE.Matrix4(), wheelMatrix = new THREE.Matrix4();

function raycastMesh(geometry, side, matrixWorld, a, b, fraction) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  inverseMesh.copy(matrixWorld).invert();
  localRay.origin.copy(a).applyMatrix4(inverseMesh);
  endLocal.copy(b).applyMatrix4(inverseMesh).sub(localRay.origin);
  const localLength = endLocal.length();
  if (!(localLength > 0)) return null;
  localRay.direction.copy(endLocal).multiplyScalar(1 / localLength);
  const box = geometry.boundingBox;
  if (!box.containsPoint(localRay.origin)) {
    if (!localRay.intersectBox(box, boundsHit) || boundsHit.distanceToSquared(localRay.origin) > (localLength * fraction) ** 2) return null;
  }
  let tree = trees.get(geometry);
  if (!tree) {
    tree = new MeshBVH(geometry, { indirect: true });
    trees.set(geometry, tree);
  }
  const hit = tree.raycastFirst(localRay, side, 0, localLength * fraction);
  if (hit) hit.fraction = hit.distance / localLength;
  return hit;
}

export function intersectArmor(model, spec, a, b, turretGone, includeWheels = false) {
  direction.subVectors(b, a);
  const distance = direction.length();
  if (distance < 1e-8) return null;
  direction.multiplyScalar(1 / distance);
  let best = null, fraction = 1;
  for (const { mesh, kind } of armorSurfaces(model)) {
    if (turretGone && (kind === ARMOR_SURFACE.TURRET || kind === ARMOR_SURFACE.MANTLET)) continue;
    if (mesh.userData.armorWheel && !includeWheels) continue;
    const hit = raycastMesh(mesh.geometry, mesh.material.side, mesh.matrixWorld, a, b, fraction);
    if (!hit) continue;
    fraction = hit.fraction;
    best = { hit, mesh, kind };
  }
  if (includeWheels && model.wheelList) {
    for (const [mesh, geometry, layout] of [[model.wheels, model.wheelGeoLo, model.wheelList],
      [model.sprockets, model.sprockets.geometry, model.sprocketList]]) {
      // A swept sphere test rejects rays that cannot reach each wheel. Wheel
      // matrices are then tested against real geometry at their current pose.
      inverseAnchor.copy(mesh.matrixWorld).invert();
      const localA = a.clone().applyMatrix4(inverseAnchor);
      const localDelta = b.clone().applyMatrix4(inverseAnchor).sub(localA);
      const lengthSquared = localDelta.lengthSq();
      for (let i = 0; i < layout.length; i++) {
        const { x, y, z, r, w } = layout[i];
        boundsHit.set(x, y, z).sub(localA);
        const u = Math.max(0, Math.min(fraction, boundsHit.dot(localDelta) / lengthSquared));
        if (boundsHit.addScaledVector(localDelta, -u).lengthSq() > (r * 1.15) ** 2 + w * w) continue;
        mesh.getMatrixAt(i, instanceMatrix);
        wheelMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
        const hit = raycastMesh(geometry, mesh.material.side, wheelMatrix, a, b, fraction);
        if (!hit) continue;
        fraction = hit.fraction;
        best = { hit, mesh, kind: ARMOR_SURFACE.GEAR, wheelWorld: wheelMatrix.clone() };
      }
    }
  }
  if (!best) return null;

  const { hit, mesh, kind, wheelWorld } = best, d = spec.dims;
  const matrixWorld = wheelWorld || mesh.matrixWorld;
  const world = hit.point.applyMatrix4(matrixWorld);
  const normalW = hit.face.normal.applyNormalMatrix(normalMatrix.getNormalMatrix(matrixWorld));
  inverseAnchor.copy(model.body.matrixWorld).invert();
  const local = world.clone().applyMatrix4(inverseAnchor);
  const casemate = kind === ARMOR_SURFACE.HULL && spec.casemate && local.y >= d.hullH;
  const upper = kind === ARMOR_SURFACE.TURRET || kind === ARMOR_SURFACE.MANTLET || casemate;
  if (casemate) {
    local.y -= d.hullH;
    local.z -= d.turretZ;
  } else if (upper) local.copy(world).applyMatrix4(inverseAnchor.copy(model.turret.matrixWorld).invert());
  const normal = normalW.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(inverseAnchor));
  const gear = kind === ARMOR_SURFACE.GEAR;
  const length = upper ? d.turretL : d.L;
  const height = upper ? d.turretH : d.hullH;
  const floor = upper ? height * 0.12 : d.clearance + 0.12;
  const face = gear ? 'side' : armorFace(normal, local.y, local.z - (upper ? d.turretBoxZ || 0 : 0),
    length, height * 0.86, floor);
  const sideSign = face === 'side' ? Math.sign(gear ? local.x : normal.x) : 0;
  return { t: fraction, part: upper ? 'turret' : 'hull', face, sideSign, local, normalW,
    dirW: direction.clone(), gear, wheel: !!wheelWorld || !!mesh.userData.armorWheel, mantlet: kind === ARMOR_SURFACE.MANTLET };
}
