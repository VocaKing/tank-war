import * as THREE from 'three';
import { Parts, T, box, castLoft, cylX, cylY, cylZ, sideExtrude, superEllipse, taper } from './geom.js';
import * as K from './kit.js';
import { trackCenterOffset } from '../game/vehicleDimensions.js';

function buildM6A1(d, secondaryOffset) {
  // Welded M6A1 hull and the external bogie-support plates visible in TM 9-2800.
  const P = new Parts(), half = d.L / 2, roof = d.hullH, xTrack = trackCenterOffset(d);
  const deckEdge = d.W * 0.433, fender = 1.29;
  const bogies = [-2.13, -0.72, 0.72, 2.13];
  P.add('hull', 'paint', sideExtrude([
    [-half + 0.09, 0.84], [-half + 0.48, d.clearance], [half - 0.52, d.clearance],
    [half - 0.05, 0.83], [half, 1.24], [-half + 0.04, 1.27],
  ], d.W * 0.58, 0, 0.028));
  const upper = sideExtrude([
    [-half + 0.13, fender], [half - 0.54, fender], [half - 0.88, 1.67],
    [half - 1.29, roof], [-half + 0.49, roof],
  ], deckEdge * 2, 0, 0.018);
  P.add('hull', 'paint', taper(upper, fender, roof, 0.91, 1));
  for (const side of [-1, 1]) {
    const sx = side * (d.W / 2 - 0.022);
    const suspensionPlate = [[-half + 0.32, 1.12], [-2.97, 0.64]];
    for (const z of bogies) suspensionPlate.push([z - 0.45, 0.58], [z - 0.19, 0.73], [z + 0.21, 0.73], [z + 0.42, 0.54]);
    suspensionPlate.push([half - 0.93, 0.56], [half - 0.62, 0.70], [half - 0.62, 1.07], [half - 1.03, 1.20], [-half + 0.33, 1.20]);
    P.add('hull', 'paint', sideExtrude(suspensionPlate, 0.044, sx, 0.012));
    const fenderX = side * (d.W * 0.33);
    P.add('hull', 'paint', box(d.W * 0.31, 0.046, d.L * 0.91, fenderX, fender, -0.02));
    P.add('hull', 'paint', box(d.W * 0.30, 0.055, 0.61, fenderX, fender - 0.17, half - 0.25, -0.38));
    K.headlight(P, 'hull', side * 1.11, fender + 0.16, half - 0.66);
    const tow = new THREE.TorusGeometry(0.073, 0.025, 6, 12);
    P.add('hull', 'metal', T(tow, side * 0.75, 1.24, half + 0.011, 0.35));
    for (const z of bogies) {
      P.add('hull', 'metal', cylZ(0.065, 0.68, 10, side * (xTrack - 0.12), 0.67, z));
      for (const s of [-1, 1]) {
        P.add('hull', 'paint', box(0.19, 0.14, 0.19, side * (xTrack - 0.12), 0.57, z + s * 0.32, -s * 0.56));
        P.add('hull', 'metal', cylX(0.026, 0.014, 6, sx + side * 0.029, 1.049, z + s * 0.35));
      }
    }
    for (const z of [-2.05, -0.88, 1.55]) {
      P.add('hull', 'dark', box(0.012, 0.25, 0.36, sx + side * 0.023, 0.92, z));
      P.add('hull', 'paint', box(0.016, 0.22, 0.33, sx + side * 0.033, 0.92, z));
    }
    K.hatch(P, 'hull', side * 0.61, roof, half - 1.70, 0.24, { periscope: true });
    K.exhaust(P, 'hull', side * 0.66, 1.53, -half + 0.21, 'ww2', 0.093, 0.32);
  }
  for (let i = 0; i < 12; i++) {
    P.add('hull', 'dark', box(1.75, 0.027, 0.047, 0, roof + 0.012, -half + 0.66 + i * 0.098));
  }
  K.tools(P, 'hull', -0.98, roof, -half + 1.90);
  const plan = superEllipse(d.turretW / 2, 1.16, 1.56, 3.3, 48,
    (x, z) => [x * (z > 0.45 ? 1 - (z - 0.45) * 0.23 : 1), z]);
  P.add('turret', 'paint', castLoft(plan, d.turretH, 0.89, 0.91));
  P.add('gun', 'paint', cylX(0.31, 1.59, 24, 0.10, 0, 0.07));
  P.add('gun', 'paint', cylZ(0.16, 0.24, 24, 0, 0, 0.19));
  P.add('gun', 'paint', cylZ(0.084, 0.22, 16, secondaryOffset, 0, 0.21));
  K.hatch(P, 'turret', 0.37, d.turretH, -0.52, 0.31, { periscope: true });
  K.hatch(P, 'turret', -0.45, d.turretH, -0.34, 0.24);
  K.periscope(P, 'turret', 0.33, d.turretH + 0.019, 0.22, 0, 0.76);
  K.liftHooks(P, 'turret', [[-0.86, d.turretH - 0.08, 0.62], [0.84, d.turretH - 0.08, 0.62],
    [-0.76, d.turretH - 0.10, -1.15], [0.76, d.turretH - 0.10, -1.15]]);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.106, r1: 0.055 });
  return {
    P, wheelType: 'spoked', cast: 0.18, castTurret: 0.90, driveSprocketTeeth: 14,
    wheels: bogies.flatMap(z => [-0.30, 0.30].map(offset => ({ z: z + offset, y: 0.367, r: 0.30, w: d.trackW * 0.84 }))),
    sprockets: [{ z: -half + 0.44, y: 0.78, r: 0.37 }],
    idlers: [{ z: half - 0.44, y: 0.79, r: 0.35 }],
    rollers: bogies.map(z => ({ z, y: 0.99, r: 0.12 })),
    turretPos: [0, roof, d.turretZ], gunPos: [0, 0.44, 1.21],
    decals: [-1, 1].map(side => ({
      kind: 'usstar', part: 'hull', pos: [side * (d.W / 2 + 0.003), 0.98, 0.14],
      ry: side * Math.PI / 2, s: 0.28,
    })),
  };
}

export function buildSpecialist(d, spec) {
  if (spec.id === 'm6a1') return buildM6A1(d, spec.secondary.offset);
  const P = new Parts(), half = d.L / 2, width = d.W / 2;
  const low = d.clearance, roof = d.hullH, fender = low + (roof - low) * 0.45;
  const boat = !!spec.amphibious, heavy = !!spec.dozer, rounded = !!spec.secondary || boat;
  const nose = half * (boat ? 0.64 : heavy ? 0.81 : 0.73);
  P.add('hull', 'paint', sideExtrude([
    [-half + 0.24, low], [half - 0.9, low], [half, fender], [nose, roof],
    [-half + 0.35, roof], [-half, fender + 0.14],
  ], d.W - d.trackW * (boat ? 0.76 : 1.25)));
  const fenderWidth = width - trackCenterOffset(d) + d.trackW / 2;
  for (const side of [-1, 1]) {
    const x = side * (width - fenderWidth / 2);
    P.add('hull', 'paint', box(fenderWidth, heavy ? 0.5 : 0.12, d.L * 0.91, x, fender + 0.10, -0.10));
    P.add('hull', 'metal', box(0.09, 0.15, 0.18, side * (width - 0.39), fender + 0.17, nose));
    P.add('hull', 'glass', box(0.08, 0.1, 0.015, side * (width - 0.39), fender + 0.18, nose + 0.10));
    P.add('hull', 'dark', cylZ(boat ? 0.23 : 0.10, 0.25, 14, side * width * 0.50, fender, -half + 0.10));
  }
  for (let i = 0; i < 7; i++) {
    P.add('hull', 'dark', box(d.W * 0.46, 0.035, 0.035, 0, roof + 0.014, -half * 0.82 + i * 0.11));
  }
  P.add('hull', 'paint', box(0.50, 0.055, 0.45, 0.48, roof + 0.04, nose - 0.20));
  if (spec.rearDriver) {
    const aft = -half * 0.67;
    K.hatchRect(P, 'hull', 0.49, roof, aft + 0.12, 0.54, 0.39, Math.PI);
    for (const x of [0.30, 0.49, 0.68]) K.periscope(P, 'hull', x, roof + 0.011, aft - 0.23, Math.PI, 0.82);
    P.add('hull', 'paint', cylZ(0.082, 0.118, 14, -0.86, roof - 0.19, -half + 0.12));
    P.add('hull', 'glass', cylZ(0.063, 0.018, 16, -0.86, roof - 0.19, -half + 0.05));
    K.stowageBox(P, 'hull', -0.76, roof + 0.09, -half * 0.43, 0.32, 0.18, 0.50);
    K.tools(P, 'hull', 0.68, roof - 0.03, half * 0.37);
    K.towCable(P, 'hull', -0.91, roof + 0.025, -0.8, 0.73, 0.03, 0.014);
  }
  if (boat) {
    const slope = Math.atan2(roof - fender, half - nose);
    const hatch = nose + (half - nose) * 0.30;
    const hatchY = roof - (roof - fender) * 0.30;
    P.add('hull', 'dark', box(0.62, 0.025, 0.31, 0, hatchY + 0.012, hatch, slope));
    P.add('hull', 'paint', box(0.58, 0.040, 0.28, 0, hatchY + 0.029, hatch, slope));
    for (const s of [-1, 1]) {
      const x = s * width * 0.50;
      const nozzleZ = -half - 0.065;
      P.add('hull', 'paint', cylZ(0.214, 0.19, 20, x, fender, nozzleZ));
      P.add('hull', 'dark', cylZ(0.164, 0.015, 20, x, fender, nozzleZ - 0.10));
      for (const offset of [-0.10, -0.034, 0.034, 0.10]) {
        P.add('hull', 'metal', box(0.019, 0.27 - Math.abs(offset) * 0.52, 0.035, x + offset, fender, nozzleZ - 0.115, 0, 0, s * 0.1));
      }
      K.grabRail(P, 'hull', [s * width * 0.66, roof, -half * 0.75], [s * width * 0.66, roof, -half * 0.47]);
      K.liftHooks(P, 'hull', [[s * width * 0.57, roof, nose - 0.09]]);
    }
  }
  const top = superEllipse(d.turretW / 2, d.turretL / 2, d.turretL / 2, heavy ? 5.8 : rounded ? 2.45 : 3.6, 40);
  if (heavy) P.add('hull', 'dark', cylY(1.1, 0.055, 48, 0, roof - 0.013, d.turretZ));
  P.add('turret', 'paint', castLoft(top, d.turretH, heavy ? 0.91 : 0.77, rounded ? 0.79 : 0.9, 0, heavy ? 0.012 : 0));
  P.add('turret', 'paint', cylY(0.29, 0.13, 18, 0.40, d.turretH + 0.045, -d.turretL * 0.22));
  P.add('turret', 'metal', cylY(0.018, 1.0, 6, -0.60, d.turretH + 0.48, -d.turretL * 0.29));
  P.add('gun', 'paint', box(d.turretW * 0.52, d.turretH * 0.58, 0.36));
  K.barrel(P, 'barrel', d.gunLen, { r0: heavy ? 0.16 : 0.097, r1: heavy ? 0.092 : 0.054 });
  const count = heavy ? 9 : spec.secondary ? 8 : 6;
  const radius = heavy ? 0.31 : boat ? 0.29 : 0.27;
  const wheels = Array.from({ length: count }, (_, i) => ({
    z: -half * 0.75 + half * 1.50 * i / (count - 1), y: radius + 0.07, r: radius, w: d.trackW * 0.78,
  }));
  const decals = [-1, 1].map(side => ({
    kind: heavy ? 'cross' : spec.secondary ? 'usstar' : 'text',
    text: spec.rearDriver ? '17' : '52', part: 'turret',
    pos: [side * (d.turretW * 0.45 + 0.02), d.turretH * 0.39, -0.20], ry: side * Math.PI / 2, s: 0.36,
  }));
  return {
    P, wheels, wheelType: 'disc',
    sprockets: [{ z: -half * 0.88, y: fender * 0.69, r: radius }],
    idlers: [{ z: half * 0.86, y: fender * 0.61, r: radius * 0.84 }],
    rollers: heavy ? [] : [-0.45, 0, 0.45].map(f => ({ z: f * half, y: radius * 2 + 0.07, r: 0.09 })),
    turretPos: [0, roof, d.turretZ], gunPos: [0, d.turretH * 0.44, d.turretL * 0.43], decals,
  };
}
