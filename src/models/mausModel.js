import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { approach } from '../util.js';
import { makeTrackBelt } from './trackBelt.js';

const MAUS_URL = import.meta.env.BASE_URL + 'models/maus-engineering.glb';
const WORLD_X = new THREE.Vector3(1, 0, 0);
const identityScale = new THREE.Vector3(1, 1, 1);
const lowTrackMaterial = new THREE.MeshStandardMaterial({ color: 0x39342c, roughness: 0.81, metalness: 0.36, side: THREE.DoubleSide });
const originalName = (node) => node.userData.name || node.name;
let template;
let loading;

function find(group, name) {
  let item;
  group.traverse(node => { if (originalName(node) === name) item = node; });
  if (!item) throw new Error('Maus model is missing ' + name);
  return item;
}

// Flatten fixed pieces within each pivot. The glTF uses one material per
// primitive and the same indexed position, normal and UV layout per material.
function batchRigid(group, excluded = new Set()) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map();
  function visit(node) {
    if (excluded.has(node)) return;
    if (node.isMesh) {
      const geom = node.geometry.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld));
      const layout = Object.entries(geom.attributes).map(([name, attr]) => name + ':' + attr.itemSize).sort().join(',');
      const key = node.material.uuid + '/' + !!geom.index + '/' + layout;
      if (!batches.has(key)) batches.set(key, { material: node.material, sources: [] });
      batches.get(key).sources.push({ node, geom });
    }
    for (const child of node.children) visit(child);
  }
  for (const child of group.children) visit(child);
  for (const { material, sources } of batches.values()) {
    const geometry = mergeGeometries(sources.map(({ geom }) => geom));
    if (geometry) {
      const batch = new THREE.Mesh(geometry, material);
      batch.name = group.name + '_surface';
      if (/^(01 Hull|02 Turret|04 Moldboard)/.test(material.name)) batch.userData.matKey = 'paint';
      group.add(batch);
      for (const { node } of sources) node.removeFromParent();
    }
    for (const { geom } of sources) geom.dispose();
  }
}

function prepareTrack(track) {
  track.updateWorldMatrix(true, true);
  const inverse = track.matrixWorld.clone().invert();
  const shoes = track.children.filter(n => /^Shoe_[LR]_\d+$/.test(originalName(n)))
    .sort((a, b) => originalName(a).localeCompare(originalName(b)));
  if (shoes.length !== 96) throw new Error('Unexpected Maus track link count');
  const wheels = [];
  track.traverse(node => {
    if (/^(Front_Idler_|Rear_Sprocket_|Paired road wheel |Return roller)/.test(originalName(node))) wheels.push(node);
  });
  const batches = new Map();
  function extract(node, index, rollingRadius) {
    const local = inverse.clone().multiply(node.matrixWorld);
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    local.decompose(position, rotation, scale);
    const anchorInverse = node.matrixWorld.clone().invert();
    node.traverse(mesh => {
      if (!mesh.isMesh) return;
      const key = mesh.geometry.uuid + '/' + mesh.material.uuid;
      if (!batches.has(key)) batches.set(key, { geometry: mesh.geometry, material: mesh.material, parts: [] });
      batches.get(key).parts.push({ index, rollingRadius, position, rotation, scale,
        offset: anchorInverse.clone().multiply(mesh.matrixWorld) });
    });
    node.removeFromParent();
    return { position, rotation };
  }
  const poses = shoes.map((shoe, i) => extract(shoe, i, 0));
  const silhouette = [makeTrackBelt(poses, 0.96)];
  wheels.forEach(wheel => {
    const name = originalName(wheel);
    const endWheel = /^(Front_Idler_|Rear_Sprocket_)/.test(name);
    const radius = endWheel ? 0.455 : name.startsWith('Return roller') ? 0.127 : 0.242;
    const { position } = extract(wheel, null, radius);
    if (endWheel || (radius === 0.242 && position.x * track.position.x > 0)) {
      const disc = new THREE.CylinderGeometry(radius, radius, endWheel ? 0.64 : 0.22, 10);
      disc.deleteAttribute('uv');
      disc.rotateZ(Math.PI / 2).translate(position.x, position.y, position.z);
      silhouette.push(disc);
    }
  });
  batchRigid(track);
  const pitch = poses.reduce((sum, pose, i) => sum + pose.position.distanceTo(poses[(i + 1) % poses.length].position), 0) / poses.length;
  const lowBelt = mergeGeometries(silhouette);
  for (const geometry of silhouette) geometry.dispose();
  return { poses, pitch, batches: [...batches.values()], lowBelt };
}

function addRunningGear(track, source) {
  const model = new THREE.Group();
  model.name = 'Maus detailed running gear';
  const low = new THREE.Mesh(source.lowBelt, lowTrackMaterial);
  low.name = 'Maus distant track silhouette';
  track.add(model, low);
  const batches = source.batches.map(({ geometry, material, parts }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = 'Maus running gear instances';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    model.add(mesh);
    return { mesh, parts };
  });
  track.traverse(node => { node.userData.runningGear = true; });
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const { poses, pitch } = source;
  let distance = 0;
  function pose() {
    const shift = THREE.MathUtils.euclideanModulo(distance / pitch, poses.length);
    const whole = Math.floor(shift), fraction = shift - whole;
    for (const { mesh, parts } of batches) {
      parts.forEach((part, i) => {
        if (part.rollingRadius) {
          rotation.setFromAxisAngle(WORLD_X, distance / part.rollingRadius).multiply(part.rotation);
          matrix.compose(part.position, rotation, part.scale);
        } else {
          const a = poses[(part.index + whole) % poses.length];
          const b = poses[(part.index + whole + 1) % poses.length];
          position.lerpVectors(a.position, b.position, fraction);
          rotation.slerpQuaternions(a.rotation, b.rotation, fraction);
          matrix.compose(position, rotation, identityScale);
        }
        mesh.setMatrixAt(i, matrix.multiply(part.offset));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  pose();
  for (const { mesh } of batches) {
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 0.25;
  }
  return {
    move(delta) {
      distance += delta;
      if (delta !== 0 && model.visible) pose();
    },
    setNear(value) {
      model.visible = value;
      low.visible = !value;
      if (value && distance) pose();
    },
  };
}

function prepare(gltf) {
  const root = find(gltf.scene, 'MAUS_ENG_ROOT');
  const body = find(root, 'HULL'), turret = find(root, 'TURRET_PIVOT'), gun = find(root, 'GUN_PIVOT');
  const lift = find(root, 'DOZER_LIFT_PIVOT'), blade = find(root, 'BLADE_PIVOT');
  const muzzle = find(root, 'MUZZLE_SOCKET');
  const barrel = new THREE.Group();
  barrel.name = 'Maus_recoil';
  const mainGun = find(gun, 'Main gun exterior');
  gun.add(barrel);
  barrel.add(mainGun, muzzle);
  const sight = new THREE.Object3D();
  sight.name = 'Maus_sight';
  sight.position.set(0.35, 0.25, 0.2);
  gun.add(sight);
  const cylinders = ['L', 'R'].map(side => find(body, 'DOZER_RAM_BASE_' + side));
  const rods = ['L', 'R'].map(side => find(body, 'Hydraulic piston rod ' + side));
  const tracks = ['L', 'R'].map(side => find(body, 'TRACK_' + side));
  const gear = tracks.map(prepareTrack);

  batchRigid(body, new Set([turret, lift, ...tracks, ...cylinders, ...rods]));
  batchRigid(turret, new Set([gun]));
  batchRigid(gun, new Set([barrel]));
  for (const node of [barrel, blade, ...cylinders]) batchRigid(node);
  batchRigid(lift, new Set([blade]));

  return { root, gear, animations: gltf.animations };
}

export function loadMausModel() {
  if (!loading) {
    loading = import('three/addons/loaders/GLTFLoader.js').then(async ({ GLTFLoader }) => {
      template = prepare(await new GLTFLoader().loadAsync(MAUS_URL));
      return true;
    }).catch(error => {
      loading = null;
      console.warn('Unable to load the detailed Maus model', error);
      return false;
    });
  }
  return loading;
}

export function createMausModel(near) {
  if (!template) return null;
  const root = template.root.clone(true);
  root.userData.importedMaus = true;
  const tracks = ['L', 'R'].map((side, i) => addRunningGear(find(root, 'TRACK_' + side), template.gear[i]));
  tracks.forEach(track => track.setNear(near));

  const dozerChannels = template.animations.flatMap(clip => clip.tracks).map(track => {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const node = root.getObjectByName(nodeName);
    if (!node || !node[propertyName]?.fromArray) throw new Error('Invalid Maus dozer animation ' + track.name);
    return { property: node[propertyName], sample: track.createInterpolant(), start: track.times[0], end: track.times[track.times.length - 1] };
  });
  let dozerProgress = 0;
  function poseBlade() {
    for (const { property, sample, start, end } of dozerChannels) {
      property.fromArray(sample.evaluate(THREE.MathUtils.lerp(start, end, dozerProgress)));
    }
  }
  poseBlade();

  const meshes = [];
  root.traverse(node => {
    if (node.isMesh) {
      node.castShadow = node.receiveShadow = true;
      meshes.push(node);
    }
  });
  return {
    root, meshes, body: find(root, 'HULL'), turret: find(root, 'TURRET_PIVOT'), gun: find(root, 'GUN_PIVOT'),
    barrel: find(root, 'Maus_recoil'), muzzle: find(root, 'MUZZLE_SOCKET'), sight: find(root, 'Maus_sight'),
    blade: find(root, 'BLADE_PIVOT'), linksOn: near,
    setRunningGearNear(value) { tracks.forEach(track => track.setNear(value)); },
    moveRunningGear(left, right) { tracks[0].move(left); tracks[1].move(right); },
    moveBlade(active, dt) {
      const next = approach(dozerProgress, active ? 1 : 0, dt * 3.2);
      if (next !== dozerProgress) {
        dozerProgress = next;
        poseBlade();
      }
    },
  };
}
