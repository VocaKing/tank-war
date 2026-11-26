import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasExpansionModel, expansionGunClearance } from './expansionFallback.js';
import geometry from './expansionGeometry.json';
import { MAX_RECOIL } from './gunClearance.js';
import { makeTrackBelt } from './trackBelt.js';
import { refineTankDestroyer } from './destroyerModels.js';

const templates = new Map();
const requests = new Map();
const sharedMaps = new Map();
const materialMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
const sharedMaterialName = /^(Abraded rubber|Burnished contact|Oxidized track|Forged and soot)/;
const rollingAxis = new THREE.Vector3(1, 0, 0);
const sides = ['R', 'L']; // Blender's right track is the negative-x track in game coordinates.
const revisedTurrets = new Set(['atlas', 'basilisk']);
const beltMaterial = new THREE.MeshStandardMaterial({ color: 0x39342c, roughness: 0.81, metalness: 0.36, side: THREE.DoubleSide });
const originalName = node => node.userData.name || node.name;

function find(root, name) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error('Armour expansion model is missing ' + name);
  return node;
}

function instances(node) {
  const meshes = [];
  node.traverse(child => { if (child.isInstancedMesh) meshes.push(child); });
  return meshes;
}

function readPose(mesh, index) {
  const matrix = new THREE.Matrix4();
  const pose = { position: new THREE.Vector3(), rotation: new THREE.Quaternion(), scale: new THREE.Vector3() };
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(pose.position, pose.rotation, pose.scale);
  return pose;
}

function batchArmCarriers(gear) {
  const carriers = gear.children.filter(node => /^Arm carrier /.test(originalName(node)) && node.isMesh);
  if (carriers.length < 2 || carriers.some(node => node.material !== carriers[0].material)) return;
  const pieces = carriers.map(node => node.geometry.clone().applyMatrix4(node.matrix));
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!merged) return;
  for (const carrier of carriers) carrier.removeFromParent();
  const batch = new THREE.Mesh(merged, carriers[0].material);
  batch.name = 'Suspension arm carriers';
  gear.add(batch);
}

function prepareSide(body, side, spec) {
  const track = find(body, 'TRACK_' + side);
  const gear = find(body, 'RUNNING_GEAR_' + side);
  batchArmCarriers(gear);
  const variants = track.children.map(node => instances(node)[0]);
  const count = track.userData.link_count;
  if (variants.length !== 2 || !variants.every(mesh => mesh?.count * 2 === count)) {
    throw new Error(`Unexpected track link layout on ${spec.id} ${side}`);
  }
  // The two exported shoe batches hold the even and odd poses of the same loop.
  const poses = Array.from({ length: count }, (_, i) => readPose(variants[i % 2], Math.floor(i / 2)));
  const simplified = new THREE.Group();
  simplified.name = 'Distant running gear ' + side;
  simplified.position.copy(track.position);
  const belt = new THREE.Mesh(makeTrackBelt(poses, spec.dims.trackW), beltMaterial);
  belt.userData.armorTrack = true;
  simplified.add(belt);
  const rig = geometry[spec.id];
  const wheels = [...rig.wheels, ...rig.sprockets, ...rig.idlers, ...rig.rollers];
  const sign = Math.sign(track.position.x);
  const discs = wheels.map(([x, y, z, radius, width]) => {
    const g = new THREE.CylinderGeometry(radius, radius, width, 10);
    g.deleteAttribute('uv');
    return g.rotateZ(Math.PI / 2).translate(sign * x, y, z);
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: spec.paint.accent, roughness: 0.86, metalness: 0.18 });
  simplified.add(new THREE.Mesh(mergeGeometries(discs), wheelMaterial));
  for (const disc of discs) disc.dispose();
  body.add(simplified);
  for (const group of [track, gear, simplified]) group.traverse(node => { node.userData.runningGear = true; });
  return { poses, wheels, pitch: track.userData.link_pitch_m };
}

function prepare(scene, spec) {
  const root = find(scene, 'VEHICLE_ROOT');
  const body = find(root, 'HULL');
  const gun = find(body, 'GUN_PIVOT');
  let turret;
  if (spec.casemate) {
    // This anchor drives aiming and the upper armor volume. The fighting
    // compartment itself stays attached to the hull.
    const traverse = find(body, 'GUN_TRAVERSE');
    turret = new THREE.Group();
    turret.name = 'CASEMATE_ANCHOR';
    turret.position.set(0, spec.dims.hullH, spec.dims.turretZ);
    body.add(turret);
    turret.attach(gun);
    traverse.removeFromParent();
  } else turret = find(body, 'TURRET_PIVOT');
  const barrel = find(gun, 'RECOIL_SLIDE');
  const muzzle = find(gun, 'MUZZLE_SOCKET');
  root.name = spec.id;
  root.userData.importedExpansion = true;
  const sight = new THREE.Object3D();
  sight.name = 'GUN_SIGHT';
  sight.position.set(0.35, 0.25, 0.20);
  gun.add(sight);
  scene.updateMatrixWorld(true);
  const materials = new Set();
  root.traverse(node => { if (node.isMesh) materials.add(node.material); });
  for (const material of materials) for (const slot of materialMaps) {
    const texture = material[slot];
    if (!texture) continue;
    texture.anisotropy = 8;
    if (sharedMaterialName.test(texture.name)) {
      const key = `${texture.name}/${texture.colorSpace}/${texture.channel}`;
      if (!sharedMaps.has(key)) sharedMaps.set(key, texture);
      material[slot] = sharedMaps.get(key);
    }
  }
  const tracks = sides.map(side => prepareSide(body, side, spec));
  refineTankDestroyer(root, spec, { body, turret, gun, barrel, muzzle });
  return { root, tracks, clearance: expansionGunClearance(spec) };
}

export function loadExpansionModel(spec) {
  const { id } = spec;
  if (!hasExpansionModel(id)) return Promise.resolve(false);
  if (templates.has(id)) return Promise.resolve(true);
  if (!requests.has(id)) {
    const request = Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]).then(async ([{ GLTFLoader }, { MeshoptDecoder }]) => {
      const base = import.meta.env.VITE_EXPANSION_MODELS_BASE || import.meta.env.BASE_URL;
      const revision = revisedTurrets.has(id) ? '?v=2026-11-rear-turrets' : '';
      const url = base + `models/armour-expansion/${id}.glb${revision}`;
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
      templates.set(id, prepare(gltf.scene, spec));
      return true;
    }).catch(error => {
      console.warn(`Unable to load the detailed ${spec.short} model`, error);
      return false;
    }).finally(() => requests.delete(id));
    requests.set(id, request);
  }
  return requests.get(id);
}

function animateInstances(meshes) {
  const mesh = meshes[0];
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const part of meshes) {
    part.instanceMatrix = mesh.instanceMatrix;
    part.computeBoundingSphere();
    part.boundingSphere.radius += 0.14;
  }
  return mesh;
}

function wheelRadius(wheels, position) {
  return wheels.find(([, y, z]) => Math.abs(y - position.y) < 0.002 && Math.abs(z - position.z) < 0.002)?.[3] ?? 0.35;
}

function wheelMotion(gear, wheels) {
  const groups = [], endWheels = [];
  for (const node of gear.children) {
    const batch = instances(node);
    if (batch.length) {
      const mesh = animateInstances(batch);
      const poses = Array.from({ length: mesh.count }, (_, i) => readPose(mesh, i));
      groups.push({ mesh, poses, radii: poses.map(pose => wheelRadius(wheels, pose.position)) });
    } else if (/^(Drive sprocket|Track idler) /.test(originalName(node))) {
      endWheels.push({ node, neutral: node.quaternion.clone(), radius: wheelRadius(wheels, node.position) });
    }
  }
  const spin = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  return distance => {
    for (const { mesh, poses, radii } of groups) {
      for (let i = 0; i < poses.length; i++) {
        const { position, rotation, scale } = poses[i];
        spin.setFromAxisAngle(rollingAxis, distance / radii[i]).multiply(rotation);
        mesh.setMatrixAt(i, matrix.compose(position, spin, scale));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const { node, neutral, radius } of endWheels) {
      node.quaternion.setFromAxisAngle(rollingAxis, distance / radius).multiply(neutral);
    }
  };
}

function trackMotion(body, side, data, near) {
  const track = find(body, 'TRACK_' + side);
  const gear = find(body, 'RUNNING_GEAR_' + side);
  const low = find(body, 'Distant running gear ' + side);
  const variants = track.children.map(node => animateInstances(instances(node)));
  const motion = wheelMotion(gear, data.wheels);
  const { poses, pitch } = data;
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  let distance = 0;
  function pose() {
    const shift = THREE.MathUtils.euclideanModulo(distance / pitch, poses.length);
    const offset = Math.floor(shift), fraction = shift - offset;
    for (const [variant, mesh] of variants.entries()) {
      for (let i = 0; i < mesh.count; i++) {
        const a = poses[(i * 2 + variant + offset) % poses.length];
        const b = poses[(i * 2 + variant + offset + 1) % poses.length];
        position.lerpVectors(a.position, b.position, fraction);
        rotation.slerpQuaternions(a.rotation, b.rotation, fraction);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, a.scale));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    motion(distance);
  }
  function setNear(value) {
    track.visible = gear.visible = value;
    low.visible = !value;
    if (value && distance) pose();
  }
  setNear(near);
  return {
    setNear,
    move(delta) {
      distance += delta;
      if (delta && track.visible) pose();
    },
  };
}

export function createExpansionModel(spec, near) {
  const template = templates.get(spec.id);
  if (!template) return null;
  const root = template.root.clone(true);
  const body = find(root, 'HULL');
  const tracks = sides.map((side, i) => trackMotion(body, side, template.tracks[i], near));
  const gun = find(body, 'GUN_PIVOT');
  const meshes = [];
  const detailGroups = [];
  root.traverse(node => {
    if (node.userData.close_detail) { detailGroups.push(node); node.visible = near; }
    if (!node.isMesh) return;
    if (node.userData.matKey === undefined && /^(Armor|Fittings)/.test(node.material.name)) node.userData.matKey = 'paint';
    node.castShadow = node.receiveShadow = true;
    meshes.push(node);
  });
  return {
    root, body, meshes, gun, turret: find(body, spec.casemate ? 'CASEMATE_ANCHOR' : 'TURRET_PIVOT'),
    barrel: find(gun, 'RECOIL_SLIDE'), muzzle: find(gun, 'MUZZLE_SOCKET'), sight: find(gun, 'GUN_SIGHT'),
    maxRecoil: MAX_RECOIL, gunPitchFloor: template.clearance, linksOn: near,
    setRunningGearNear(value) {
      for (const track of tracks) track.setNear(value);
      for (const detail of detailGroups) detail.visible = value;
    },
    moveRunningGear(left, right) { tracks[0].move(left); tracks[1].move(right); },
  };
}
