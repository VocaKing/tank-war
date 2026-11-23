import { Parts, box, castLoft, cylY, cylZ, sideExtrude, superEllipse } from './geom.js';
import { barrel } from './kit.js';
import { trackCenterOffset } from '../game/vehicleDimensions.js';

export function buildSpecialist(d, spec) {
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
    P.add('hull', 'paint', box(0.52, 0.10, 0.58, 0.49, roof + 0.06, -half * 0.66));
    for (const x of [0.31, 0.50, 0.69]) P.add('hull', 'glass', box(0.10, 0.095, 0.045, x, roof + 0.11, -half * 0.66 - 0.27));
  }
  const top = superEllipse(d.turretW / 2, d.turretL / 2, d.turretL / 2, heavy ? 5.8 : rounded ? 2.45 : 3.6, 40);
  if (heavy) P.add('hull', 'dark', cylY(1.1, 0.055, 48, 0, roof - 0.013, d.turretZ));
  P.add('turret', 'paint', castLoft(top, d.turretH, heavy ? 0.91 : 0.77, rounded ? 0.79 : 0.9, 0, heavy ? 0.012 : 0));
  P.add('turret', 'paint', cylY(0.29, 0.13, 18, 0.40, d.turretH + 0.045, -d.turretL * 0.22));
  P.add('turret', 'metal', cylY(0.018, 1.0, 6, -0.60, d.turretH + 0.48, -d.turretL * 0.29));
  P.add('gun', 'paint', box(d.turretW * 0.52, d.turretH * 0.58, 0.36));
  barrel(P, 'barrel', d.gunLen, { r0: heavy ? 0.16 : 0.097, r1: heavy ? 0.092 : 0.054 });
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
