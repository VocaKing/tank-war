import { Vector3 } from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Parts, cylZ } from './geom.js';
import { barrel } from './kit.js';
import { hullPitchFloor } from './gunClearance.js';
import geometry from './expansionGeometry.json';

export function hasExpansionModel(id) {
  return Object.hasOwn(geometry, id);
}

export function expansionGunClearance(spec) {
  const d = spec.dims;
  const rig = geometry[spec.id];
  const [x, y, z] = rig.gun;
  const bounds = {
    gunPos: [x, y - d.hullH, z - d.turretZ],
    turretPos: [0, d.hullH, d.turretZ],
    barrelLength: d.gunLen,
    barrelRadius: spec.shells[0].caliber / 1000,
    gunHullBoxes: rig.deck.map(([start, end, height]) => [-d.W / 2, d.W / 2, start, end, height]),
  };
  return (yaw, min, max) => hullPitchFloor(bounds, yaw, min, max);
}

// Safe to use immediately on selection, or for a failed download. The volumes
// and gun mount come from the authored models in the same metre coordinates.
export function buildExpansionFallback(d, spec) {
  const rig = geometry[spec.id], P = new Parts();
  for (const vertices of rig.hull) P.add('hull', 'paint', new ConvexGeometry(vertices.map(p => new Vector3(...p))));
  const turretPos = [0, d.hullH, d.turretZ];
  const upper = rig.upper.map(([x, y, z]) => new Vector3(x, y - d.hullH, z - d.turretZ));
  P.add('turret', 'paint', new ConvexGeometry(upper));
  const [x, y, z] = rig.gun;
  const gunPos = [x, y - d.hullH, z - d.turretZ];
  const radius = spec.shells[0].caliber / 1000;
  P.add('gun', 'paint', cylZ(radius * 2.5, 0.55, 20, 0, 0, 0.11, radius * 1.65));
  barrel(P, 'barrel', d.gunLen, { r0: radius * 1.25, r1: radius * 0.92 });
  const gear = key => rig[key].map(([xo, y, z, r, w]) => ({ xo, y, z, r, w }));
  return {
    P, turretPos, gunPos, gunMountZ: gunPos[2], gunMountNoCollar: true,
    wheels: gear('wheels'), sprockets: gear('sprockets'), idlers: gear('idlers'), rollers: gear('rollers'),
    wheelType: 'disc', decals: [], trackPitch: rig.pitch,
  };
}
