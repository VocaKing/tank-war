import * as THREE from 'three';
import { hullPitchFloor, MAX_RECOIL } from './gunClearance.js';
import { makeTrackBelt } from './trackBelt.js';

const detailedExteriorIds = new Set([
  '2s38', 'archer', 'bmpt', 'centauro2', 'fv4005s1', 'm50ontos', 'sprutsd', 'strv103', 't14', 'xm8ags',
]);
const exteriorRevision = '2026-11-exterior-detail';
const conceptRevision = '2026-11-concept-detail';
const fleetIds = new Set([
  ...detailedExteriorIds,
  'aegis140', 'bastion125', 'cerberus135', 'harrier105', 'lancer120', 'leviathan160', 'raptor90',
  'tempest155', 'thunderclad155', 'warden130',
]);
const referenceImages = new Map([['xm8ags', 2], ['sprutsd', 8], ['t14', 10]]);
const templates = new Map();
const requests = new Map();
const beltMaterial = new THREE.MeshStandardMaterial({
  color: 0x484137, roughness: .81, metalness: .36, side: THREE.DoubleSide,
});
const one = new THREE.Vector3(1, 1, 1);
const shoeMatrix = new THREE.Matrix4(), shoePosition = new THREE.Vector3(), shoeRotation = new THREE.Quaternion();

export function hasFleetModel(id) {
  return fleetIds.has(id);
}

function required(root, name) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`${root.name} is missing the ${name} model joint`);
  return node;
}

export function loadFleetModel(spec) {
  const { id } = spec;
  if (!hasFleetModel(id)) return Promise.resolve(false);
  if (templates.has(id)) return Promise.resolve(true);
  if (requests.has(id)) return requests.get(id);
  const request = Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]).then(async ([{ GLTFLoader }, { MeshoptDecoder }]) => {
    const referenceImage = referenceImages.get(id);
    const revision = detailedExteriorIds.has(id) ? exteriorRevision : conceptRevision;
    const url = `${import.meta.env.BASE_URL}models/fleet/${id}.glb?v=${revision}`;
    const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const root = required(scene, id);
    if (root.userData.fleetModelId !== id) throw new Error(`Incorrect vehicle in ${url}`);
    if (root.userData.fleetModelRevision !== revision) {
      throw new Error(`Incorrect detail revision in ${url}`);
    }
    if (referenceImage && root.userData.referenceImage !== referenceImage) {
      throw new Error(`Incorrect reference geometry in ${url}`);
    }
    const body = required(root, 'body');
    const turret = required(body, 'turret');
    const gun = required(turret, 'gun');
    const barrel = required(gun, 'recoiling-barrel');
    const muzzle = required(barrel, 'muzzle');
    if (muzzle.position.z <= 0) throw new Error(`Invalid muzzle axis on ${id}`);
    const clearance = {
      turretPos: turret.position.toArray(),
      gunPos: gun.position.toArray(),
      barrelLength: muzzle.position.z,
      barrelRadius: Math.max(.052, spec.shells[0].caliber / 1000),
      gunHullBoxes: spec.fixedGun ? [] : (root.userData.deckClearance || []),
    };
    root.userData.importedFleet = true;
    root.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (/paint|armor|armour/i.test(node.material.name)) node.userData.matKey = 'paint';
      if (node.material.map) node.material.map.anisotropy = 8;
      if (node.material.normalMap) node.material.normalMap.anisotropy = 8;
    });
    const tracks = [0, 1].map(side => {
      const wrap = root.getObjectByName(`track_${side}`);
      if (!wrap) return null;
      const poses = wrap.userData.poses.map(pose => ({
        position: new THREE.Vector3().fromArray(pose),
        rotation: new THREE.Quaternion().fromArray(pose, 3),
      }));
      const step = poses.reduce((sum, pose, i) => (
        sum + pose.position.distanceTo(poses[(i + 1) % poses.length].position)
      ), 0) / poses.length;
      const belt = new THREE.Mesh(makeTrackBelt(poses, spec.dims.trackW), beltMaterial);
      belt.name = `distant_track_${side}`;
      belt.receiveShadow = true;
      belt.visible = false;
      body.add(belt);
      return { poses, step };
    });
    templates.set(id, { root, clearance, tracks });
    return true;
  }).catch(error => {
    console.warn(`Could not load the ${spec.short} model`, error);
    return false;
  }).finally(() => requests.delete(id));
  requests.set(id, request);
  return request;
}

function trackInstance(root, side, layout) {
  if (!layout) return null;
  const track = required(root, `track_${side}`);
  const belt = required(root, `distant_track_${side}`);
  const inverseTrack = track.matrixWorld.clone().invert();
  const batches = track.children.map(variant => {
    const meshes = [];
    variant.traverse(mesh => {
      if (!mesh.isInstancedMesh) return;
      mesh.userData.runningGear = true;
      meshes.push(mesh);
    });
    const [main] = meshes;
    main.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const mesh of meshes) {
      mesh.instanceMatrix = main.instanceMatrix;
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += .12;
    }
    const local = inverseTrack.clone().multiply(main.matrixWorld);
    return { main, indices: variant.userData.indices, local, inverse: local.clone().invert() };
  });
  return { ...layout, track, belt, batches };
}

function moveTrack(track, distance) {
  const count = track.poses.length;
  const delta = THREE.MathUtils.euclideanModulo(distance / track.step, count);
  for (const { main, indices, local, inverse } of track.batches) {
    for (let i = 0; i < indices.length; i++) {
      const u = (indices[i] + count - delta) % count;
      const j = Math.floor(u), k = (j + 1) % count;
      shoePosition.copy(track.poses[j].position).lerp(track.poses[k].position, u - j);
      shoeRotation.copy(track.poses[j].rotation).slerp(track.poses[k].rotation, u - j);
      shoeMatrix.compose(shoePosition, shoeRotation, one).premultiply(inverse).multiply(local);
      main.setMatrixAt(i, shoeMatrix);
    }
    main.instanceMatrix.needsUpdate = true;
  }
}

export function createFleetModel(spec) {
  const template = templates.get(spec.id);
  if (!template) return null;
  const root = template.root.clone(true);
  const body = required(root, 'body');
  const turret = required(body, 'turret');
  const gun = required(turret, 'gun');
  const barrel = required(gun, 'recoiling-barrel');
  const sight = required(gun, 'sight');
  const muzzle = required(barrel, 'muzzle');
  const muzzles = [muzzle, ...barrel.children.filter(node => /^muzzle_\d+$/.test(node.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))];
  const spade = root.getObjectByName('spade');
  const trim = root.getObjectByName('trim');
  const stabilizers = [];
  const wheels = [];
  const steerAxles = [];
  root.updateMatrixWorld(true);
  const tracks = template.tracks.map((layout, side) => trackInstance(root, side, layout));
  const meshes = [];
  root.traverse(node => {
    if (node.isMesh) meshes.push(node);
    if (node.name.startsWith('wheel_') && node.userData.radius > 0) {
      const steer = node.parent;
      wheels.push({ node, radius: node.userData.radius, side: steer.position.x < 0 ? 0 : 1 });
      node.traverse(part => { part.userData.runningGear = true; });
    }
    if (node.name.startsWith('steering_') && node.userData.steering) steerAxles.push(node);
    if (/^stabilizer_(left|right)$/.test(node.name)) stabilizers.push(node);
  });
  let near = true;
  const distance = [0, 0];
  return {
    root, body, turret, gun, barrel, muzzle, muzzles, sight, spade, trim, stabilizers, meshes,
    maxRecoil: spec.recoilBrace?.recoilDistance ?? spec.artillery?.recoilDistance ?? MAX_RECOIL,
    gunPitchFloor: (yaw, min, max) => hullPitchFloor(template.clearance, yaw, min, max),
    steerWheels(angle) {
      for (const axle of steerAxles) axle.rotation.y = angle;
    },
    setRunningGearNear(value) {
      near = value;
      for (const [side, track] of tracks.entries()) {
        if (!track) continue;
        track.track.visible = value;
        track.belt.visible = !value;
        if (value) moveTrack(track, distance[side]);
      }
    },
    moveRunningGear(left, right) {
      distance[0] += left;
      distance[1] += right;
      if (!near) return;
      for (const { node, radius, side } of wheels) node.rotation.x = distance[side] / radius;
      if (left && tracks[0]) moveTrack(tracks[0], distance[0]);
      if (right && tracks[1]) moveTrack(tracks[1], distance[1]);
    },
  };
}
