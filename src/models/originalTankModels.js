// Launch roster. The hull, turret and elevating mantlet use their own local
// coordinates in metres; the chassis faces +Z and the turret plans are top views.
import * as THREE from 'three';
import { Parts, T, box, castLoft, cylX, cylY, cylZ, glacis, lathe, sideExtrude, taper, topExtrude } from './geom.js';
import { trackCenterOffset } from '../game/vehicleDimensions.js';
import * as K from './kit.js';

const sides = [-1, 1];
const quarterTurn = Math.PI / 2;
const rad = (degrees) => degrees * Math.PI / 180;

function rod(P, part, mat, a, b, radius, segments = 6) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const tube = new THREE.CylinderGeometry(radius, radius, direction.length(), segments);
  tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  tube.translate(...start.lerp(end, 0.5).toArray());
  P.add(part, mat, tube);
}

function curvedTube(P, part, mat, points, radius, segments = 14) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  P.add(part, mat, new THREE.TubeGeometry(curve, segments, radius, 6, false));
}

function castTurret(P, points, height, roofX, roofZ, centerZ = 0) {
  const path = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
  const outline = Array.from({ length: 56 }, (_, i) => {
    const { x, z } = path.getPoint(i / 56);
    return [x, z];
  });
  P.add('turret', 'paint', castLoft(outline, height, roofX, roofZ, centerZ));
}

function turretRing(P, y, z, radius) {
  P.add('hull', 'paint', cylY(radius + 0.04, 0.048, 32, 0, y + 0.004, z));
  P.add('hull', 'dark', cylY(radius, 0.041, 32, 0, y + 0.03, z));
}

function grille(P, part, x, y, z, width, length, slats) {
  P.add(part, 'dark', box(width, 0.023, length, x, y + 0.017, z));
  for (const side of sides) {
    P.add(part, 'paintDetail', box(0.037, 0.037, length + 0.02, x + side * width / 2, y + 0.023, z));
    P.add(part, 'paintDetail', box(width, 0.037, 0.04, x, y + 0.023, z + side * length / 2));
    K.boltRow(P, part, [x + side * width / 2, y + 0.045, z - length * 0.4],
      [x + side * width / 2, y + 0.045, z + length * 0.4], 4, 0.011, 'y', 'metal');
  }
  for (let i = 0; i < slats; i++) {
    P.add(part, 'metal', box(width - 0.03, 0.02, length / slats * 0.49,
      x, y + 0.04, z + ((i + 0.5) / slats - 0.5) * length, 0.26));
  }
}

function towEye(P, x, y, z, side = 1, size = 1) {
  P.add('hull', 'paintDetail', box(0.18 * size, 0.17 * size, 0.12 * size, x, y, z - side * 0.04));
  P.add('hull', 'metal', cylX(0.034 * size, 0.14 * size, 10, x, y, z + side * 0.035));
  const shackle = T(new THREE.TorusGeometry(0.070 * size, 0.018 * size, 6, 14),
    x, y - 0.066 * size, z + side * 0.041);
  P.add('hull', 'metal', shackle);
}

function fender(P, x, width, y, z0, z1, drop = 0.13) {
  P.add('hull', 'paintDetail', sideExtrude([
    [z0 - 0.22, y - drop], [z0, y], [z1, y], [z1 + 0.25, y - drop],
    [z1 + 0.24, y - drop - 0.034], [z1 - 0.01, y - 0.034],
    [z0 + 0.01, y - 0.034], [z0 - 0.21, y - drop - 0.034],
  ], width, x, 0.007));
  const edge = x + Math.sign(x) * (width / 2 - 0.014);
  rod(P, 'hull', 'paintDetail', [edge, y - 0.008, z0], [edge, y - 0.008, z1], 0.019);
  for (const z of [z0 + 0.06, z1 - 0.06]) {
    P.add('hull', 'metal', box(width * 0.86, 0.025, 0.046, x, y + 0.008, z));
    K.bolts(P, 'hull', 'paintDetail', [[x - width * 0.34, y + 0.03, z], [x + width * 0.34, y + 0.03, z]], 0.014, 0.016);
  }
}

function fuelDrum(P, x, y, z, radius, length, across = false) {
  const cylinder = across ? cylX : cylZ;
  P.add('hull', 'paintDetail', cylinder(radius, length, 24, x, y, z));
  for (const side of sides) {
    const dx = across ? side : 0;
    const dz = across ? 0 : side;
    P.add('hull', 'paintDetail', cylinder(radius * 1.025, 0.022, 24, x + dx * length * 0.49, y, z + dz * length * 0.49));
    P.add('hull', 'metal', cylinder(radius * 1.038, 0.043, 24, x + dx * length * 0.34, y, z + dz * length * 0.34));
    P.add('hull', 'paintDetail', box(across ? 0.055 : radius * 1.15, 0.084, across ? radius * 1.3 : 0.055,
      x + dx * length * 0.34, y - radius + 0.009, z + dz * length * 0.34));
  }
  P.add('hull', 'metal', cylY(radius * 0.19, 0.035, 10, x, y + radius, z + (across ? 0 : length * 0.24)));
}

function buildT34(d) {
  const P = new Parts();
  const H = d.hullH;
  const bow = glacis(0.85, 2.995, H, 1.59);
  P.add('hull', 'paint', taper(sideExtrude([
    [-3.015, 1.18], [-2.43, H], [1.59, H], [2.995, 0.85], [-2.80, 0.88],
  ], 2.94, 0, 0.013), 0.88, H, 0.80, 1));
  P.add('hull', 'paint', sideExtrude([[-2.94, 0.50], [2.40, 0.43], [3.02, 0.82], [2.93, 0.90], [-2.84, 0.96]], 2.0));
  turretRing(P, H, d.turretZ, 0.81);

  // Large tilted driver’s hatch and two narrow, separately hinged vision covers.
  const hatchX = 0.49;
  const hatchU = bow.length * 0.56;
  P.add('hull', 'dark', bow.place(box(0.77, 0.65, 0.029), hatchX, hatchU, 0.011));
  P.add('hull', 'paint', bow.place(box(0.72, 0.595, 0.058), hatchX, hatchU, 0.036));
  for (const side of sides) {
    const x = hatchX + side * 0.186;
    P.add('hull', 'paint', bow.place(box(0.25, 0.16, 0.051), x, hatchU + 0.13, 0.074));
    P.add('hull', 'glass', bow.place(box(0.165, 0.036, 0.009), x, hatchU + 0.121, 0.104));
    P.add('hull', 'metal', bow.place(cylX(0.027, 0.14, 10, 0, 0, 0), x, hatchU + 0.23, 0.074));
    P.add('hull', 'paint', bow.place(box(0.10, 0.073, 0.055), x, hatchU + 0.293, 0.041));
  }
  rod(P, 'hull', 'metal', bow.point(0.35, hatchU - 0.19, 0.09), bow.point(0.59, hatchU - 0.19, 0.09), 0.016);
  P.add('hull', 'paint', bow.place(T(new THREE.SphereGeometry(0.125, 20, 12), 0, 0, 0, 0, 0, 0, 1, 1, 0.56), -0.63, hatchU - 0.015, 0.01));
  const mgMount = bow.point(-0.63, hatchU - 0.015, 0.057);
  P.add('hull', 'metal', cylZ(0.041, 0.09, 12, ...mgMount));
  P.add('hull', 'dark', cylZ(0.017, 0.16, 8, mgMount[0], mgMount[1], mgMount[2] + 0.065));
  rod(P, 'hull', 'paint', [-1.27, 0.869, 2.982], [1.27, 0.869, 2.982], 0.013);

  for (const side of sides) {
    const x = side * trackCenterOffset(d);
    fender(P, x, 0.52, 0.981, -2.80, 2.77, 0.11);
    towEye(P, side * 0.79, 0.87, 3.005, 1, 0.85);
    towEye(P, side * 0.80, 0.79, -2.94, -1, 0.84);
    grille(P, 'hull', side * 0.59, H, -1.69, 0.47, 0.98, 9);
    rod(P, 'hull', 'paintDetail', [side * 1.182, H + 0.013, -2.414], [side * 1.182, H + 0.013, 1.535], 0.012);
    const pipeX = side * 0.61;
    P.add('hull', 'paint', box(0.255, 0.25, 0.09, pipeX, 1.14, -3.012, -0.22));
    rod(P, 'hull', 'metal', [pipeX, 1.20, -2.975], [pipeX, 1.03, -3.10], 0.071, 14);
    P.add('hull', 'dark', cylZ(0.053, 0.014, 14, pipeX, 1.03, -3.112));
    K.grabRail(P, 'turret', [side * 0.85, 0.49, -0.79], [side * 0.97, 0.49, -0.15], 0.05, 0.016);
  }
  K.headlight(P, 'hull', 1.20, 1.21, 2.61, false, 'lens');
  rod(P, 'hull', 'metal', [1.20, 1.10, 2.57], [1.18, 1.18, 2.40], 0.028);
  for (const [x, z] of [[-1.35, -1.06], [-1.35, -2.03], [1.35, -1.80]]) {
    fuelDrum(P, x, 1.25, z, 0.176, 0.76);
    const sign = Math.sign(x);
    for (const offset of [-0.245, 0.245])
      rod(P, 'hull', 'paintDetail', [sign * 1.18, 1.05, z + offset], [x, 1.13, z + offset], 0.041);
  }
  K.hatchRect(P, 'hull', 0, H + 0.007, -1.52, 0.53, 0.65);
  grille(P, 'hull', 0, H, -2.18, 1.53, 0.30, 4);
  K.towCable(P, 'hull', 1.08, H + 0.025, -2.30, -0.84, 0.01, 0.015);

  castTurret(P, [[-0.46, 1.07], [0.45, 1.065], [0.75, 0.81], [1.03, 0.35],
    [1.07, -0.29], [0.91, -0.88], [0.60, -1.22], [-0.13, -1.30],
    [-0.67, -1.15], [-1.01, -0.80], [-1.08, -0.23], [-0.93, 0.41], [-0.68, 0.84]], d.turretH, 0.83, 0.86, -0.11);
  P.add('gun', 'paint', sideExtrude([[-0.16, -0.29], [0.22, -0.29], [0.30, -0.06],
    [0.25, 0.19], [0.10, 0.27], [-0.18, 0.27]], 1.13, 0, 0.036));
  P.add('gun', 'paint', cylZ(0.20, 0.23, 24, 0, 0, 0.26, 0.24));
  P.add('gun', 'dark', cylZ(0.049, 0.034, 14, 0.34, 0.055, 0.28));
  P.add('gun', 'metal', cylZ(0.029, 0.16, 12, -0.37, -0.018, 0.28));
  K.cupola(P, 'turret', 0.42, d.turretH - 0.006, -0.53, 0.282, 0.176, 5);
  K.hatch(P, 'turret', -0.43, d.turretH - 0.004, -0.26, 0.257, { ry: 0.3 });
  K.periscope(P, 'turret', -0.41, d.turretH, 0.27, -0.1, 0.84);
  for (const z of [-0.62, -0.91]) {
    P.add('turret', 'dark', cylY(0.117, 0.046, 18, -0.11, d.turretH + 0.012, z));
    P.add('turret', 'paint', cylY(0.12, 0.052, 18, -0.11, d.turretH + 0.052, z, 0.128));
  }
  K.liftHooks(P, 'turret', [[-0.60, d.turretH - 0.01, 0.48], [0.62, d.turretH - 0.01, 0.44], [0.39, d.turretH, -0.95]]);
  K.antenna(P, 'turret', -0.48, d.turretH - 0.02, -0.86, 1.32);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.16, r1: 0.07 });

  return {
    P, cast: 0.24, castTurret: 1.06, weather: 0.60, wheelType: 'disc', trackPitch: 0.172,
    paint: { base: '#48503a', dust: '#777058', grime: 0.43 },
    wheels: [-2.05, -1.07, -0.09, 0.89, 1.87].map(z => ({ z, y: 0.44, r: 0.41, w: 0.36 })),
    sprockets: [{ z: -2.75, y: 0.55, r: 0.37 }], idlers: [{ z: 2.72, y: 0.58, r: 0.34 }], rollers: [],
    turretPos: [0, H + 0.027, d.turretZ], gunPos: [0, 0.38, 1.07], gunMountZ: 1.07, gunMountNoCollar: true,
    decals: sides.map(side => ({ kind: 'text', text: '24', part: 'turret',
      pos: [side * 1.038, 0.42, -0.46], ry: side * 1.83, rx: -0.17, s: 0.49 })),
  };
}

function buildSherman(d) {
  const P = new Parts();
  const H = d.hullH;
  const bow = glacis(0.955, 3.00, H, 1.965);
  P.add('hull', 'paint', sideExtrude([
    [-3.07, 1.19], [-3.07, 1.54], [-2.76, H], [1.965, H], [3.00, 0.955], [2.48, 1.17],
  ], 2.65, 0, 0.019));
  P.add('hull', 'paint', sideExtrude([[-3.04, 0.51], [2.47, 0.45], [2.76, 0.63], [2.68, 1.20], [-3.04, 1.22]], 1.87));
  // Late single-piece cast differential cover, with a raised bolted flange.
  P.add('hull', 'paint', sideExtrude([[2.53, 0.50], [2.96, 0.54], [3.075, 0.66], [3.097, 0.81],
    [3.048, 0.93], [2.970, 1.01], [2.87, 1.05], [2.55, 0.94]], 2.17, 0, 0.04));
  P.add('hull', 'paint', bow.place(box(2.16, 0.079, 0.045), 0, 0.054, 0.027));
  for (let i = 0; i < 11; i++)
    P.add('hull', 'metal', bow.place(cylZ(0.022, 0.023, 6, 0, 0, 0), -0.96 + i * 0.192, 0.05, 0.054));
  P.add('hull', 'paint', bow.place(cylZ(0.119, 0.077, 20, 0, 0, 0), -0.58, 0.77, 0.033));
  const mg = bow.point(-0.58, 0.77, 0.065);
  P.add('hull', 'dark', cylZ(0.024, 0.19, 8, mg[0], mg[1], mg[2] + 0.074));
  turretRing(P, H, d.turretZ, 0.91);

  for (const side of sides) {
    K.hatch(P, 'hull', side * 0.63, H, 1.43, 0.291, { ry: side * 1.2 });
    K.periscope(P, 'hull', side * 0.61, H + 0.025, 1.79, 0, 0.78);
    const x = side * trackCenterOffset(d);
    fender(P, x, 0.60, 1.361, -2.79, 2.90, 0.10);
    K.headlight(P, 'hull', side * 1.195, 1.465, 2.55, true, 'lens');
    towEye(P, side * 0.84, 0.83, 3.119);
    towEye(P, side * 0.79, 0.73, -3.065, -1);
    grille(P, 'hull', side * 0.45, H, -1.85, 0.78, 1.37, 11);
    P.add('hull', 'paint', cylX(0.20, 0.30, 16, side * 1.008, 0.87, 2.82));
    P.add('hull', 'tail', cylZ(0.042, 0.023, 14, side * 1.11, 1.36, -3.078));
    // Cast bogie carriers, their paired arms and the exposed horizontal units.
    for (const z of [-2.05, -0.15, 1.75]) {
      P.add('hull', 'paint', sideExtrude([
        [z - 0.30, 0.56], [z - 0.22, 0.80], [z + 0.22, 0.80],
        [z + 0.30, 0.56], [z + 0.16, 0.41], [z - 0.16, 0.41],
      ], 0.30, side * 0.93, 0.02));
      P.add('hull', 'metal', cylZ(0.077, 0.61, 14, x - side * 0.01, 0.68, z));
      for (const end of sides) {
        P.add('hull', 'paint', cylZ(0.093, 0.074, 14, x - side * 0.01, 0.68, z + end * 0.26));
        rod(P, 'hull', 'paint', [x - side * 0.02, 0.59, z + end * 0.18], [x - side * 0.025, 0.33, z + end * 0.30], 0.075, 10);
        K.bolts(P, 'hull', 'metal', [[x + side * 0.075, 0.63, z + end * 0.168]], 0.026, 0.026, 'x');
      }
    }
  }
  P.add('hull', 'dark', box(1.81, 0.17, 0.038, 0, 1.04, -3.106));
  P.add('hull', 'paint', box(1.78, 0.23, 0.075, 0, 1.19, -3.118, -0.23));
  for (const x of [-0.55, 0.55]) P.add('hull', 'metal', cylZ(0.072, 0.19, 12, x, 1.04, -3.02));
  K.tools(P, 'hull', 1.10, H, -0.61, 1);

  castTurret(P, [[-0.55, 1.03], [0.54, 1.03], [0.88, 0.70], [1.19, 0.18],
    [1.19, -0.44], [0.92, -1.08], [0.48, -1.23], [-0.62, -1.27],
    [-1.12, -1.08], [-1.30, -0.58], [-1.23, 0.12], [-0.92, 0.69]], d.turretH, 0.88, 0.89, -0.24);
  P.add('gun', 'paint', sideExtrude([[-0.18, -0.29], [0.17, -0.29], [0.28, -0.20],
    [0.33, 0.08], [0.27, 0.24], [0.14, 0.28], [-0.16, 0.28]], 1.28, 0, 0.034));
  P.add('gun', 'paint', cylZ(0.16, 0.17, 24, 0, 0, 0.292, 0.18));
  P.add('gun', 'dark', cylZ(0.049, 0.03, 16, 0.43, 0.087, 0.283));
  P.add('gun', 'metal', cylZ(0.023, 0.14, 10, -0.42, 0, 0.306));
  K.cupola(P, 'turret', -0.58, d.turretH - 0.014, -0.39, 0.318, 0.158, 6);
  P.add('turret', 'dark', T(cylY(0.30, 0.034, 30, 0, 0, 0), 0.52, d.turretH + 0.011, -0.15, 0, 0.12, 0, 0.91, 1, 1.19));
  P.add('turret', 'paint', T(cylY(0.28, 0.058, 30, 0, 0, 0), 0.52, d.turretH + 0.037, -0.15, 0, 0.12, 0, 0.90, 1, 1.20));
  K.grabRail(P, 'turret', [0.38, d.turretH + 0.068, -0.04], [0.59, d.turretH + 0.068, -0.04], 0.046);
  K.periscope(P, 'turret', 0.32, d.turretH, 0.57);
  K.periscope(P, 'turret', -0.46, d.turretH, 0.46, 0.16, 0.84);
  K.liftHooks(P, 'turret', [[0.72, d.turretH - 0.016, 0.40], [-0.69, d.turretH - 0.016, 0.47], [0.09, d.turretH, -0.96]]);
  K.mg(P, 'turret', -0.26, d.turretH + 0.24, -0.76, 0.22);
  K.antenna(P, 'turret', 0.62, d.turretH, -0.77, 1.35);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.06, brake: { type: 'single', r: 0.095, len: 0.30 } });

  return {
    P, cast: 0.25, castTurret: 0.89, weather: 0.55,
    paint: { base: '#464832', dust: '#746e58', grime: 0.35 },
    wheels: [-2.35, -1.75, -0.45, 0.15, 1.45, 2.05].map(z => ({ z, y: 0.31, r: 0.26, w: 0.5 })),
    sprockets: [{ z: 2.85, y: 0.95, r: 0.33 }], idlers: [{ z: -2.75, y: 0.60, r: 0.30 }],
    rollers: [-2, -0.15, 1.75].map(z => ({ z, y: 1.03, r: 0.09 })),
    turretPos: [0, H + 0.026, d.turretZ], gunPos: [0, 0.38, 1.03], gunMountZ: 1.03, gunMountNoCollar: true,
    decals: sides.map(side => ({ kind: 'usstar', part: 'hull', pos: [side * 1.33, 1.54, -0.71], ry: side * quarterTurn, s: 0.65 })),
  };
}

function buildTiger(d) {
  const P = new Parts();
  const H = d.hullH;
  P.add('hull', 'paint', sideExtrude([[-3.06, 1.06], [2.99, 1.06], [2.99, 1.15],
    [2.57, 1.45], [2.514, H], [-2.88, H], [-3.04, 1.51]], 3.48, 0, 0.023));
  P.add('hull', 'paint', sideExtrude([[-3.11, 0.58], [2.76, 0.52], [3.15, 0.89], [3.09, 1.10], [-3.05, 1.13]], 2.34));
  const front = glacis(1.45, 2.57, H, 2.514);
  P.add('hull', 'paint', front.place(box(0.428, 0.192, 0.090), 0.60, 0.176, 0.044));
  P.add('hull', 'dark', front.place(box(0.226, 0.026, 0.014), 0.60, 0.171, 0.096));
  for (const x of [0.435, 0.765])
    P.add('hull', 'metal', front.place(cylZ(0.027, 0.021, 8, 0, 0, 0), x, 0.18, 0.094));
  P.add('hull', 'paint', front.place(cylZ(0.148, 0.104, 20, 0, 0, 0), -0.72, 0.16, 0.042));
  P.add('hull', 'metal', cylZ(0.075, 0.10, 18, -0.72, 1.611, 2.638));
  P.add('hull', 'dark', cylZ(0.024, 0.16, 10, -0.72, 1.611, 2.725));
  rod(P, 'hull', 'paint', [-1.62, 1.445, 2.569], [1.62, 1.445, 2.569], 0.014);
  turretRing(P, H, d.turretZ, 0.94);

  for (const side of sides) {
    const x = side * trackCenterOffset(d);
    fender(P, x, 0.715, 1.234, -2.85, 2.84, 0.13);
    towEye(P, side * 1.025, 0.93, 3.128, 1, 1.08);
    towEye(P, side * 0.95, 0.80, -3.11, -1, 1.02);
    K.headlight(P, 'hull', side * 1.37, H + 0.063, 2.28, false, 'lens');
    curvedTube(P, 'hull', 'dark', [[side * 1.37, H + 0.015, 2.22], [side * 1.36, H + 0.045, 2.10],
      [side * 1.20, H + 0.023, 2.06], [side * 1.1, H + 0.007, 1.92]], 0.012, 12);
    K.hatch(P, 'hull', side * 0.70, H, 1.92, 0.29, { ry: side * 1.4 });
    K.periscope(P, 'hull', side * 0.70, H, 2.30, 0, 0.85);
    for (let i = 0; i < 6; i++) {
      const z = -2.37 + i * 0.95;
      const edge = side * (d.W / 2 - 0.049);
      P.add('hull', 'paint', box(0.096, 0.034, 0.924, edge, 1.220, z));
      P.add('hull', 'metal', box(0.04, 0.032, 0.093, edge, 1.245, z - 0.40));
      K.boltRow(P, 'hull', [edge + side * 0.048, 1.224, z - 0.32],
        [edge + side * 0.048, 1.224, z + 0.32], 3, 0.011, 'x', 'metal');
    }
    for (const z of [-2.53, -1.68])
      grille(P, 'hull', side * 1.02, H, z, 0.77, 0.70, 10);
    K.towCable(P, 'hull', side * 1.24, H + 0.025, -2.77, 1.11, 0.009, 0.021);

    // Separate rear exhaust shields and early external Feifel air cleaners.
    const exhaustX = side * 0.51;
    K.exhaust(P, 'hull', exhaustX, 1.365, -3.155, 'ww2', 0.112, 0.684);
    const shield = new THREE.CylinderGeometry(0.166, 0.185, 0.578, 16, 1, true, quarterTurn, Math.PI);
    P.add('hull', 'paint', T(shield, exhaustX, 1.351, -3.177));
    for (const dx of [-0.147, 0.147])
      K.boltRow(P, 'hull', [exhaustX + dx, 1.16, -3.193], [exhaustX + dx, 1.55, -3.193], 3, 0.016, 'z', 'metal');
    const filterX = side * 1.137;
    P.add('hull', 'paint', box(0.32, 0.48, 0.062, filterX, 1.315, -3.06));
    P.add('hull', 'paint', cylY(0.141, 0.45, 18, filterX, 1.35, -3.16, 0.125));
    P.add('hull', 'paint', cylY(0.083, 0.18, 16, filterX, 1.107, -3.16, 0.125));
    for (const y of [1.27, 1.49])
      P.add('hull', 'metal', cylY(0.143, 0.032, 18, filterX, y, -3.16));
    curvedTube(P, 'hull', 'metal', [[filterX, 1.55, -3.16], [filterX, 1.72, -3.14], [side * 0.93, 1.85, -2.98],
      [side * 0.66, 1.87, -2.84], [side * 0.34, 1.85, -2.77]], 0.042);
  }
  K.hatchRect(P, 'hull', 0, H, -1.95, 0.87, 1.35);
  K.tools(P, 'hull', 1.06, H, 0.48);
  const trackRack = glacis(1.15, 2.99, 1.45, 2.57);
  for (const x of [-0.375, -0.1875, 0, 0.1875, 0.375]) {
    P.add('hull', 'track', trackRack.place(box(0.173, 0.33, 0.044), x, 0.248, 0.028));
    P.add('hull', 'metal', trackRack.place(box(0.043, 0.294, 0.028), x, 0.248, 0.061));
  }
  P.add('hull', 'metal', trackRack.place(box(0.981, 0.036, 0.021), 0, 0.208, 0.079));

  castTurret(P, [[-1.18, 1.22], [-0.94, 1.29], [0.97, 1.29], [1.17, 1.20], [1.234, 0.75],
    [1.237, -0.17], [1.08, -0.86], [0.70, -1.31], [0.0, -1.49], [-0.70, -1.31],
    [-1.08, -0.86], [-1.237, -0.17], [-1.23, 0.75]], d.turretH, 0.94, 0.96, -0.12);
  P.add('gun', 'paint', sideExtrude([[-0.18, -0.36], [0.13, -0.37], [0.26, -0.32], [0.30, -0.12],
    [0.31, 0.11], [0.25, 0.33], [0.04, 0.36], [-0.19, 0.32]], 1.80, 0, 0.041));
  P.add('gun', 'paint', cylZ(0.22, 0.22, 26, 0, 0, 0.345, 0.255));
  for (const x of [0.603, 0.713]) P.add('gun', 'dark', cylZ(0.036, 0.042, 12, x, 0.087, 0.267));
  P.add('gun', 'metal', cylZ(0.038, 0.158, 12, -0.62, -0.012, 0.295));
  K.stowageBox(P, 'turret', 0, 0.37, -1.63, 1.57, 0.49, 0.53, Math.PI);
  K.cupola(P, 'turret', 0.57, d.turretH, -0.55, 0.282, 0.271, 5);
  K.hatchRect(P, 'turret', -0.55, d.turretH, -0.06, 0.47, 0.39, 0.16);
  K.periscope(P, 'turret', -0.58, d.turretH, 0.35, 0.12, 0.92);
  P.add('turret', 'paint', cylY(0.157, 0.055, 20, -0.08, d.turretH + 0.014, -0.59));
  K.liftHooks(P, 'turret', [[0.85, d.turretH, 0.71], [-0.85, d.turretH, 0.71], [0, d.turretH, -1.22]]);
  for (const side of sides) {
    K.smokeDischargers(P, 'turret', side * 1.235, 0.606, 0.79, side * 0.54, 3, 0.108, 0.22, 0.045);
    rod(P, 'turret', 'metal', [side * 0.72, 0.42, -1.43], [side * 0.72, 0.51, -1.80], 0.022);
  }
  K.antenna(P, 'hull', -1.38, H, -2.67, 1.55);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.18, r1: 0.075, brake: { type: 'double', r: 0.135, len: 0.42 } });

  // Twenty-four separate rubber-rim discs staggered across each track.
  const wheels = [];
  for (const xo of [-0.19, 0, 0.19]) {
    for (let i = 0; i < 8; i++)
      wheels.push({ z: -2.15 + i * 0.60 + (xo === 0 ? 0.30 : 0), y: 0.45, r: 0.4, w: 0.22, xo });
  }
  return {
    P, cast: 0.25, castTurret: 0.60, weather: 0.62, wheels, wheelType: 'single',
    paint: { base: '#a18b59', camo: ['#777151', '#836b50'], dust: '#8a785c', grime: 0.46 },
    sprockets: [{ z: 2.75, y: 0.8, r: 0.42 }], idlers: [{ z: -2.88, y: 0.7, r: 0.30 }], rollers: [],
    turretPos: [0, H + 0.022, d.turretZ], gunPos: [0, 0.42, 1.29], gunMountZ: 1.29, gunMountNoCollar: true,
    decals: sides.flatMap(side => [
      { kind: 'cross', part: 'hull', pos: [side * 1.746, 1.47, -0.89], ry: side * quarterTurn, s: 0.46 },
      { kind: 'text', text: '131', part: 'turret', pos: [side * 1.231, 0.44, 0.26], ry: side * quarterTurn, rx: -0.06, s: 0.65 },
    ]),
  };
}

function sightHousing(P, part, x, y, z, width, height, length, optic = 'glass') {
  const front = z + length / 2;
  P.add(part, 'paintDetail', box(width, height, length, x, y, z));
  P.add(part, 'dark', box(width * 0.83, height * 0.76, 0.022, x, y, front));
  P.add(part, optic, box(width * 0.62, height * 0.53, 0.017, x, y, front + 0.013));
  P.add(part, 'paintDetail', box(width + 0.015, 0.039, length * 0.29, x, y + height * 0.39, front + 0.024));
}

// Parametric crown shared by the cast turret and its surface-mounted tiles.
function t72Crown(height, polar, azimuth) {
  const radius = Math.sin(polar);
  const forward = Math.cos(azimuth);
  return new THREE.Vector3(
    Math.sin(azimuth) * 1.30 * radius * (1 + 0.09 * forward),
    height * Math.min(1, Math.cos(polar) * 1.10),
    forward * radius * (forward > 0 ? 1.147 : 1.28),
  );
}

function t72Turret(P, height) {
  const dome = new THREE.SphereGeometry(1, 76, 28, 0, Math.PI * 2, 0, quarterTurn);
  const vertices = dome.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const point = t72Crown(height, Math.acos(vertices.getY(i)), Math.atan2(vertices.getX(i), vertices.getZ(i)));
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  // Leave an aperture in the shell behind the moving, overlapping mantlet.
  const indices = dome.index.array;
  const outer = [];
  for (let i = 0; i < indices.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const v = indices[i + k];
      x += vertices.getX(v) / 3;
      y += vertices.getY(v) / 3;
      z += vertices.getZ(v) / 3;
    }
    if (z < 0.72 || Math.hypot(x, (y - 0.34) * 1.16) >= 0.275) outer.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  dome.setIndex(outer);
  dome.computeVertexNormals();
  P.add('turret', 'paint', dome);
  P.add('turret', 'paint', T(cylY(1, 0.108, 44, 0, 0.026, 0), 0, 0, -0.063, 0, 0, 0, 1.26, 1, 1.21));

  for (const [row, polar] of [[0, 1.29], [1, 1.00]]) {
    for (const side of sides) for (let i = 0; i < 6; i++) {
      const azimuth = side * rad(21 + i * 14 + (row ? 5 : 0));
      const c = t72Crown(height, polar, azimuth);
      const along = t72Crown(height, polar + 0.01, azimuth).sub(c);
      const across = t72Crown(height, polar, azimuth + 0.01).sub(c);
      const normal = along.cross(across).normalize();
      const pitch = -Math.asin(normal.y);
      const yaw = Math.atan2(normal.x, normal.z);
      const width = row ? 0.218 : 0.251;
      const tileHeight = row ? 0.166 : 0.187;
      P.add('turret', 'metal', box(width + 0.012, tileHeight + 0.009, 0.027, ...c.toArray(), pitch, yaw));
      const front = c.addScaledVector(normal, 0.040);
      P.add('turret', 'paint', box(width, tileHeight, 0.065, ...front.toArray(), pitch, yaw));
      const cap = front.addScaledVector(normal, 0.035);
      P.add('turret', 'metal', T(cylZ(0.013, 0.017, 6, 0, 0, 0), ...cap.toArray(), pitch, yaw));
    }
  }
}

function buildT72(d) {
  const P = new Parts();
  const H = d.hullH;
  const bow = glacis(0.924, 3.395, H, 1.923);
  P.add('hull', 'paint', sideExtrude([[-3.38, 0.51], [2.79, 0.48], [3.395, 0.924],
    [1.923, H], [-3.24, H], [-3.391, 1.16]], 2.19, 0, 0.015));
  turretRing(P, H, d.turretZ, 0.94);
  K.eraGrid(P, 'hull', bow.point(-1.035, 0.274, 0.016), [1, 0, 0], [0, ...bow.up], 7, 3, 0.296, 0.339, 0.060, 0.024);
  P.add('hull', 'paint', bow.place(box(2.16, 0.065, 0.095), 0, 0.151, 0.057));
  P.add('hull', 'dark', box(0.562, 0.015, 0.354, 0, H + 0.008, 1.690));
  P.add('hull', 'paint', box(0.535, 0.021, 0.328, 0, H + 0.019, 1.690));
  P.add('hull', 'paintDetail', box(0.169, 0.039, 0.083, 0, H + 0.018, 1.892));
  P.add('hull', 'glass', box(0.130, 0.024, 0.015, 0, H + 0.018, 1.935));

  for (const side of sides) {
    const x = side * (d.W / 2 - 0.31);
    fender(P, x, 0.61, 1.103, -3.16, 3.15, 0.20);
    K.skirt(P, side * (d.W / 2 - 0.022), 1.068, -3.15, 3.19, 0.325, 6, 0.052, 0, 'rubber');
    P.add('hull', 'rubber', box(0.56, 0.29, 0.043, x, 0.84, -3.36, 0.15));
    K.headlight(P, 'hull', side * 0.97, 1.122, 3.221, true, 'lens');
    towEye(P, side * 0.73, 0.785, 3.245, 1, 1.04);
    towEye(P, side * 0.87, 0.72, -3.398, -1);
    for (const z of [0.39, -0.57, -1.53, -2.49]) {
      K.stowageBox(P, 'hull', x, 1.27, z, 0.48, 0.32, 0.91, side > 0 ? 0 : Math.PI);
      P.add('hull', 'paint', box(0.50, 0.03, 0.11, x, 1.433, z - 0.24));
    }
    grille(P, 'hull', side * 0.50, H, -2.44, 0.85, 1.53, 13);
    fuelDrum(P, side * 0.602, 1.167, -3.545, 0.268, 1.025, true);
    rod(P, 'hull', 'metal', [side * 0.82, 0.90, -3.11], [side * 0.81, 0.92, -3.58], 0.041);
  }
  K.stowageBox(P, 'hull', 1.46, 1.21, 1.36, 0.46, 0.22, 0.75);
  P.add('hull', 'wood', cylX(0.101, 2.12, 9, 0, 0.766, -3.430));
  for (const x of [-0.91, 0.91]) P.add('hull', 'metal', cylX(0.107, 0.066, 12, x, 0.766, -3.43));
  K.exhaust(P, 'hull', 0, 1.30, -3.39, 'modern', 0.109, 0.83);

  t72Turret(P, d.turretH);
  const mantlet = lathe([[0.20, -0.13], [0.307, -0.13], [0.334, -0.068], [0.316, 0.047],
    [0.282, 0.138], [0.233, 0.235], [0.193, 0.235]], 32);
  P.add('gun', 'paint', mantlet);
  P.add('gun', 'paint', cylZ(0.276, 0.032, 24, 0, 0, -0.124));
  P.add('gun', 'paint', lathe([[0.197, 0.145], [0.234, 0.146], [0.234, 0.198],
    [0.212, 0.24], [0.194, 0.24]], 32));
  K.cupola(P, 'turret', -0.455, 0.672, -0.19, 0.294, 0.132, 5, 'modern');
  K.hatch(P, 'turret', 0.449, 0.686, -0.30, 0.278, { ry: -0.35 });
  sightHousing(P, 'turret', 0.47, 0.723, 0.35, 0.302, 0.244, 0.292);
  K.periscope(P, 'turret', 0.30, 0.710, 0.16, 0.12, 0.72);
  P.add('turret', 'paint', box(0.256, 0.206, 0.22, -0.418, 0.454, 0.992));
  P.add('turret', 'paint', cylZ(0.165, 0.202, 24, -0.432, 0.524, 1.037));
  P.add('turret', 'metal', cylZ(0.151, 0.041, 24, -0.432, 0.524, 1.146));
  P.add('turret', 'glass', cylZ(0.122, 0.017, 24, -0.432, 0.524, 1.173));
  curvedTube(P, 'turret', 'dark', [[-0.50, 0.40, 1.06], [-0.534, 0.355, 0.958], [-0.72, 0.50, 0.72]], 0.018, 10);
  K.smokeDischargers(P, 'turret', 1.14, 0.433, -0.32, 0.08, 4, 0.111, 0.218, 0.042);
  K.stowageBox(P, 'turret', -0.92, 0.36, -0.69, 0.51, 0.309, 0.34, -1.3);
  K.mg(P, 'turret', -0.72, 0.969, -0.35, 0.12, 'dshk');
  K.antenna(P, 'turret', 0.68, 0.596, -0.68, 1.58);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.20, r1: 0.095,
    evac: { z: Math.min(3.6, d.gunLen * 0.72), r: 0.14, len: Math.min(0.55, d.gunLen * 0.16) } });

  return {
    P, cast: 0.23, castTurret: 0.90, weather: 0.62,
    paint: { base: '#4c523d', camo: ['#3b4235', '#635d47'], dust: '#73715d', grime: 0.44 },
    wheels: [-2.55, -1.62, -0.69, 0.24, 1.17, 2.10].map(z => ({ z, y: 0.4, r: 0.375, w: 0.46 })),
    sprockets: [{ z: -3.15, y: 0.62, r: 0.33 }], idlers: [{ z: 2.95, y: 0.56, r: 0.31 }],
    rollers: [-1.6, 0, 1.5].map(z => ({ z, y: 0.98, r: 0.075 })),
    turretPos: [0, H, d.turretZ], gunPos: [0, 0.34, 1.05], gunMountZ: 1.05, gunMountNoCollar: true,
    decals: [],
  };
}

function bustleRack(P) {
  const rear = -2.83;
  const front = -2.12;
  const floor = 0.16;
  const rail = 0.61;
  const halfWidth = 1.51;
  for (const side of sides) {
    const x = side * halfWidth;
    rod(P, 'turret', 'paint', [x, floor, rear], [x, floor, front], 0.026);
    rod(P, 'turret', 'paint', [x, rail, rear], [x, rail, front], 0.027);
    rod(P, 'turret', 'paint', [x, floor, rear], [x, rail, rear], 0.026);
    rod(P, 'turret', 'paint', [x, floor, front], [x, rail, front], 0.026);
    for (const z of [-2.31, -2.49, -2.67])
      rod(P, 'turret', 'metal', [x, floor, z], [x, rail, z], 0.010);
  }
  for (let i = 0; i <= 15; i++) {
    const x = halfWidth * (i / 7.5 - 1);
    rod(P, 'turret', 'metal', [x, floor, rear], [x, floor, front], 0.009);
    rod(P, 'turret', 'metal', [x, floor, rear], [x, rail, rear], 0.009);
  }
  for (const y of [floor, 0.31, 0.46, rail])
    rod(P, 'turret', 'paint', [-halfWidth, y, rear], [halfWidth, y, rear], y === floor || y === rail ? 0.027 : 0.010);
  P.add('turret', 'canvas', box(0.80, 0.32, 0.46, -0.47, 0.34, -2.46, 0, 0.06, 0.04));
  P.add('turret', 'canvas', T(cylX(0.125, 0.67, 16, 0, 0, 0), 0.61, 0.286, -2.52, 0, -0.16));
  for (const x of [-0.70, -0.29]) P.add('turret', 'dark', box(0.043, 0.021, 0.44, x, 0.509, -2.46, 0, 0.06, 0.04));
}

function buildAbrams(d) {
  const P = new Parts();
  const H = d.hullH;
  const halfWidth = d.W / 2;
  const rear = -d.L / 2;
  const bow = glacis(1.00, 3.928, H, 1.641);
  P.add('hull', 'paint', sideExtrude([[rear + 0.12, 0.57], [3.12, 0.52], [3.928, 1.00],
    [1.641, H], [rear + 0.21, H], [rear + 0.015, 1.32]], 2.33, 0, 0.017));
  P.add('hull', 'paint', taper(sideExtrude([[rear + 0.06, 1.18], [3.31, 1.18],
    [1.641, H], [rear + 0.21, H], [rear + 0.044, 1.40]], 3.39, 0, 0.02), 1.18, H, 0.923, 1));
  turretRing(P, H, d.turretZ, 1.22);
  P.add('hull', 'paint', bow.place(box(0.73, 0.69, 0.053), 0, 1.87, 0.019));
  for (const x of [-0.218, 0, 0.218]) {
    P.add('hull', 'paint', bow.place(box(0.207, 0.076, 0.093), x, 1.613, 0.073));
    P.add('hull', 'glass', bow.place(box(0.141, 0.03, 0.009), x, 1.608, 0.124));
  }
  for (const side of sides) {
    // Three thicker forward skirts, followed by the lighter swing-out panels.
    const segments = [[-3.56, -2.68], [-2.68, -1.77], [-1.77, -0.85], [-0.85, 0.08],
      [0.08, 1.14], [1.14, 2.14], [2.14, 3.17]];
    for (const [start, end] of segments) {
      const thick = start >= 0.08;
      const bottom = thick ? 0.568 : 0.688;
      const width = thick ? 0.139 : 0.085;
      const x = side * (halfWidth - width / 2 - 0.017);
      P.add('hull', 'paint', sideExtrude([[start + 0.035, bottom], [end - 0.045, bottom],
        [end - 0.023, 1.202], [start + 0.023, 1.202]], width, x, 0.009));
      for (const z of [start + 0.143, end - 0.14]) {
        P.add('hull', 'paint', box(width + 0.035, 0.083, 0.084, x, 1.195, z));
        P.add('hull', 'metal', cylX(0.016, 0.021, 6, side * (halfWidth - 0.014), 0.79, z));
      }
    }
    const skirtX = side * (halfWidth - 0.15);
    P.add('hull', 'paint', sideExtrude([[3.155, 0.596], [3.611, 0.676], [3.743, 0.892], [3.231, 1.137],
      [3.138, 1.203]], 0.258, skirtX, 0.019));
    P.add('hull', 'rubber', box(0.56, 0.25, 0.048, side * trackCenterOffset(d), 0.79, rear + 0.267, 0.06));
    P.add('hull', 'paint', bow.place(box(0.155, 1.62, 0.096), side * 1.28, 1.04, 0.018));
    sightHousing(P, 'hull', side * 1.23, 1.143, 3.40, 0.271, 0.155, 0.20, 'lens');
    P.add('hull', 'amber', cylZ(0.026, 0.017, 10, side * 1.339, 1.132, 3.506));
    towEye(P, side * 0.87, 0.79, 3.628, 1, 1.13);
    towEye(P, side * 0.91, 0.77, rear + 0.02, -1, 1.16);
    grille(P, 'hull', side * 0.67, H, -2.87, 1.16, 1.27, 12);
    P.add('hull', 'tail', cylZ(0.055, 0.023, 14, side * 1.15, 1.256, rear - 0.029));
  }
  // Individual rear grille doors, recessed vents and the central tow point.
  for (const x of [-0.773, 0, 0.773]) {
    P.add('hull', 'paint', box(0.758, 0.68, 0.078, x, 0.981, rear + 0.01));
    P.add('hull', 'dark', box(0.642, 0.518, 0.016, x, 0.967, rear - 0.037));
    for (let i = 0; i < 9; i++)
      P.add('hull', 'metal', box(0.638, 0.028, 0.061, x, 0.744 + i * 0.054, rear - 0.045, -0.27));
    K.boltRow(P, 'hull', [x - 0.33, 1.29, rear - 0.038], [x + 0.33, 1.29, rear - 0.038], 4, 0.016, 'z', 'metal');
  }
  towEye(P, 0, 0.67, rear + 0.01, -1, 1.05);

  const ht = d.turretH;
  const turret = [[-0.51, 1.946], [0.56, 1.83], [1.61, 0.56], [1.68, -1.03], [1.53, -2.225],
    [-1.49, -2.225], [-1.67, -1.17], [-1.66, 0.54]];
  P.add('turret', 'paint', taper(topExtrude(turret, ht, 0.014, 0.028, 2), 0.014, ht, 0.949, 0.964, -0.12));
  // Independent cheek faces with bevels and a recessed center mantlet.
  P.add('turret', 'paint', taper(topExtrude([
    [-0.432, 1.960], [-0.589, 1.987], [-1.688, 0.613], [-1.696, 0.309], [-1.092, 0.632], [-0.418, 1.65],
  ], 0.597, 0.033, 0.019), 0.033, 0.63, 0.965, 0.975, 0.24));
  P.add('turret', 'paint', taper(topExtrude([
    [0.426, 1.900], [0.602, 1.888], [1.628, 0.659], [1.679, 0.29], [1.063, 0.595], [0.40, 1.566],
  ], 0.604, 0.031, 0.019), 0.031, 0.635, 0.966, 0.973, 0.24));
  P.add('turret', 'dark', box(0.77, 0.562, 0.063, 0, 0.325, 1.923));
  P.add('gun', 'paint', sideExtrude([[-0.25, -0.23], [0.13, -0.24], [0.211, -0.13],
    [0.201, 0.16], [0.120, 0.23], [-0.22, 0.235]], 0.639, 0, 0.027));
  P.add('gun', 'paint', cylZ(0.208, 0.143, 24, 0, 0, 0.180, 0.217));
  sightHousing(P, 'turret', -0.757, ht + 0.161, 0.909, 0.579, 0.365, 0.61);
  P.add('turret', 'metal', box(0.025, 0.229, 0.029, -0.75, ht + 0.157, 1.230));
  P.add('turret', 'paint', cylY(0.182, 0.29, 24, 0.85, ht + 0.117, 0.36, 0.202));
  sightHousing(P, 'turret', 0.85, ht + 0.305, 0.39, 0.375, 0.228, 0.32);
  K.cupola(P, 'turret', -0.75, ht, -0.30, 0.341, 0.136, 6, 'modern');
  K.hatch(P, 'turret', 0.68, ht, -0.31, 0.299, { ry: -0.45 });
  K.mg(P, 'turret', -0.64, ht + 0.396, -0.35, 0.15);
  K.mg(P, 'turret', 0.99, ht + 0.245, -0.13, 0.13, 'mag');
  for (const side of sides) {
    K.smokeDischargers(P, 'turret', side * 1.46, 0.472, 0.31, side * 0.33, 6, 0.091, 0.151, 0.036);
    K.antenna(P, 'turret', side * 1.29, ht - 0.025, -1.77, 1.48);
    K.grabRail(P, 'turret', [side * 1.15, ht - 0.014, -1.72], [side * 1.15, ht - 0.014, -1.19], 0.049);
    K.hatchRect(P, 'turret', side * 0.62, ht + 0.014, -1.29, 1.12, 0.97);
    K.boltRow(P, 'turret', [side * 1.650, 0.30, -1.12], [side * 1.650, 0.30, 0.42], 5, 0.018, 'x', 'metal');
  }
  bustleRack(P);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.16, r1: 0.10, evac: { z: 2.85, r: 0.155, len: 0.62 }, sleeve: 5, mrs: true });

  return {
    P, cast: 0.20, castTurret: 0.22, weather: 0.52, wheelType: 'disc',
    paint: { base: '#9d8b6b', dust: '#92816a', grime: 0.36 },
    wheels: [-2.75, -1.88, -1.01, -0.14, 0.73, 1.60, 2.47].map(z => ({ z, y: 0.37, r: 0.32, w: 0.52 })),
    sprockets: [{ z: -3.55, y: 0.62, r: 0.34 }], idlers: [{ z: 3.45, y: 0.62, r: 0.32 }],
    rollers: [-1.4, 1.2].map(z => ({ z, y: 0.98, r: 0.08 })),
    turretPos: [0, H + 0.015, d.turretZ], gunPos: [0, 0.37, 1.955], gunMountZ: 1.955, gunMountNoCollar: true,
    decals: [],
  };
}

export const ORIGINAL_TANK_BUILDERS = {
  t34: buildT34,
  sherman: buildSherman,
  tiger: buildTiger,
  t72: buildT72,
  m1a2: buildAbrams,
};
