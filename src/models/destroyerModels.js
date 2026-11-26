import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Parts, T, box, cylX, cylY, cylZ, lathe, glacis, topExtrude } from './geom.js';
import * as kit from './kit.js';

const hull = 'body';
const hullDetail = 'body detail';
const turret = 'turret';
const turretDetail = 'turret detail';
const gun = 'gun';
const barrel = 'barrel';
const up = new THREE.Vector3(0, 1, 0);

class Exterior extends Parts {
  add(part, material, geometry, tone = '#ffffff') {
    const mesh = super.add(part, material, geometry);
    const { position, normal, uv } = mesh.attributes;
    const color = new THREE.Color(tone), colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      // Project at a consistent scale so a new bevel uses the same finish as a broad plate.
      const deck = ny > Math.max(nx, nz);
      uv.setXY(i, 0.45 + (nx > nz && !deck ? z : x) * 0.33, 0.37 + (deck ? z : y) * 0.33);
      const wear = 0.95 + 0.05 * Math.sin(x * 2.5 + z * 3.9 - y * 8.2);
      colors.set([color.r * wear, color.g * wear, color.b * wear], i * 3);
    }
    mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return mesh;
  }
  box(part, material, center, size, rotation = [], tone) {
    this.add(part, material, box(...size, ...center, ...rotation), tone);
  }
  beam(part, material, from, to, radius = 0.018, sides = 8) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const length = a.distanceTo(b);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
    this.add(part, material, new THREE.CylinderGeometry(radius, radius, length, sides)
      .applyQuaternion(rotation).translate(...a.lerp(b, 0.5)));
  }
  section(part, material, rings, tone) {
    const vertices = rings.flatMap(([plan, height]) => plan.map(([x, z]) =>
      new THREE.Vector3(x, typeof height === 'number' ? height : height(x, z), z)));
    this.add(part, material, new ConvexGeometry(vertices), tone);
  }
}

function outline(x, z, w, l, c) {
  const a = x - w / 2, b = x + w / 2, f = z + l / 2, r = z - l / 2;
  return [[a + c, f], [b - c, f], [b, f - c], [b, r + c],
    [b - c, r], [a + c, r], [a, r + c], [a, f - c]];
}

function lid(P, part, x, y, z, w, l, paint = 'paint') {
  P.add(part, 'dark', topExtrude(outline(x, z, w + .045, l + .045, .055), .029, y - .014, .005));
  P.add(part, paint, topExtrude(outline(x, z, w, l, .055), .046, y + .012, .009));
  kit.grabRail(P, part, [x - w * .23, y + .056, z + l * .29], [x + w * .23, y + .056, z + l * .29], .041);
  for (const s of [-1, 1]) {
    P.add(part, 'metal', cylX(.029, .106, 12, x + s * w * .30, y + .049, z - l * .43));
  }
}

function optics(P, part, [x, y, z], width, height, length, yaw = 0, ports = 2) {
  const yawTransform = geometry => geometry.rotateY(yaw).translate(x, y, z);
  P.add(part, 'paint', yawTransform(topExtrude(outline(0, -length / 2, width, length, .045), height, 0, .018)));
  // A dark inset and separate bezels make the ports readable from battle distance.
  P.add(part, 'dark', yawTransform(box(width * .87, height * .65, .035, 0, height * .48, .006)));
  for (let i = 0; i < ports; i++) {
    const pos = width * .64 * ((i + .5) / ports - .5);
    const size = Math.min(width / (ports + .6), height) * .70;
    P.add(part, 'metal', yawTransform(box(size + .035, height * .48, .047, pos, height * .48, .022)));
    P.add(part, 'glass', yawTransform(box(size, height * .345, .019, pos, height * .48, .053)), i % 2 ? '#a1b5c4' : '#ffffff');
  }
  P.add(part, 'paint', yawTransform(box(width * .97, .039, .135, 0, height * .89, .035, -.1)));
}

function louvres(P, part, [x, y, z], width, length, count) {
  P.box(part, 'paint', [x, y + .038, z], [width + .09, .11, length + .10]);
  P.box(part, 'dark', [x, y + .098, z], [width, .021, length]);
  for (let i = 0; i < count; i++) {
    const at = z + length * ((i + .5) / count - .5);
    P.box(part, 'metal', [x, y + .12, at], [width * .96, .019, length / count * .63], [-.37]);
  }
  for (const dx of [-width * .26, width * .26]) {
    P.box(part, 'paint', [x + dx, y + .139, z], [.028, .024, length]);
  }
}

function roll(P, part, x, y, z, width, radius, tone) {
  P.add(part, 'canvas', cylX(radius, width, 14, x, y, z, radius * .92), tone);
  for (const s of [-1, 1]) {
    P.add(part, 'canvas', cylX(radius * .88, .06, 14, x + s * width * .48, y, z, radius * .72), tone);
    P.add(part, 'rubber', cylX(radius * 1.022, .039, 16, x + s * width * .32, y, z));
    P.box(part, 'metal', [x + s * width * .32, y + radius * .985, z], [.052, .023, .071]);
  }
}

function pipeRing(P, part, material, x, y, z, radius, wire, yaw = 0) {
  P.add(part, material, T(new THREE.TorusGeometry(radius, wire, 7, 20), x, y, z, 0, yaw));
}

function collar(P, part, at, radius, depth, tone) {
  P.add(part, 'metal', lathe([[radius * .97, at - depth / 2], [radius * 1.04, at - depth * .31],
    [radius * 1.04, at + depth * .29], [radius * .96, at + depth / 2]], 32), tone);
  pipeRing(P, part, 'dark', 0, 0, at + depth * .32, radius, .010);
}

function shapedTube(P, length, rows, radius, finish) {
  const end = length;
  P.add(barrel, 'metal', lathe([...rows, [radius, end - .04], [radius * .93, end],
    [radius * .69, end], [radius * .64, end - .055], [radius * .64, end - .21]], 32), finish);
  P.add(barrel, 'dark', lathe([[radius * .64, end - .21], [radius * .62, end - .26],
    [.001, end - .28]], 32));
  P.add(barrel, 'paint', lathe([[radius * 1.005, end - .195], [radius * 1.16, end - .17],
    [radius * 1.16, end - .08], [radius, end - .054]], 32), '#c4c3a9');
}

function warden(P, model) {
  // A continuous fighting compartment with wide, overlapping armored shoulders.
  const base = [[-.53, 2.12], [.53, 2.12], [1.50, 1.75], [1.75, 1.25], [1.68, -.98],
    [1.44, -1.9], [-1.44, -1.9], [-1.68, -.98], [-1.75, 1.25], [-1.50, 1.75]];
  const roof = [[-.59, 1.02], [.59, 1.02], [1.13, .65], [1.22, -.85], [1.09, -1.49],
    [-1.09, -1.49], [-1.22, -.85], [-1.13, .65]];
  P.section(turret, 'armor', [[base, -.21], [base.map(([x, z]) => [x * .99, z * .95]), .06],
    [roof, (_, z) => .58 - z * .062]], '#9aa99a');
  P.box(turret, 'dark', [0, .22, 1.83], [.72, .55, .55], [-.23]);
  P.add(turret, 'armor', cylZ(.36, .32, 24, 0, .215, 1.86, .313), '#b5b9a5');
  for (const side of [-1, 1]) {
    const mirror = plan => plan.map(([x, z]) => [x * side, z]);
    const cheek = mirror([[.42, 2.12], [.74, 2.06], [1.58, 1.70], [1.84, 1.03], [1.72, .60], [.73, 1.14]]);
    const upper = mirror([[.44, 1.95], [.79, 1.88], [1.38, 1.56], [1.63, .91], [1.44, .66], [.62, 1.17]]);
    P.section(turret, 'armor', [[cheek, -.015], [cheek, .14], [upper, (_, z) => .52 - z * .133]], '#b9bd9e');
    P.section(turret, 'dark', [[cheek, -.078], [cheek, -.012]], '#c0c2b6');
    // Exposed flange and the fasteners for the lower removable sections.
    P.beam(turretDetail, 'metal', [side * .54, .155, 2.105], [side * 1.52, .155, 1.719]);
    for (let i = 0; i < 5; i++) {
      const step = i * .197, z = 2.109 - i * .078;
      P.add(turretDetail, 'metal', cylZ(.025, .042, 6, side * (.56 + step), .128, z));
    }
    for (let i = 0; i < 3; i++) {
      const z = .54 - i * .65;
      P.box(turret, 'dark', [side * 1.68, .015, z], [.14, .315, .60], [0, 0, side * .25]);
      P.box(turret, 'armor', [side * 1.735, .035, z + .015], [.092, .245, .54], [0, 0, side * .25],
        i === 1 ? '#9ea992' : '#b0b49a');
    }
    // Continuous fender rails tie the fighting compartment to the track guards.
    const edge = mirror([[1.73, 2.34], [1.96, 1.98], [2.04, .77], [2.04, -2.50], [1.84, -3.12], [1.64, -2.91], [1.71, 1.42]]);
    P.section(hull, 'paint', [[edge, 1.31], [edge.map(([x, z]) => [x * .98, z]), 1.46]], '#a4ae9c');
    for (const z of [1.2, .10, -.96, -2.01]) {
      P.box(hullDetail, 'dark', [side * 2.023, 1.383, z], [.034, .125, .053]);
      P.add(hullDetail, 'metal', cylX(.034, .034, 6, side * 2.024, 1.411, z + .075));
    }
    kit.grabRail(P, turretDetail, [side * 1.17, .626, -.67], [side * 1.17, .68, -1.27], .052);
    louvres(P, hullDetail, [side * .68, 1.653, -2.62], .74, .74, 8);
  }
  P.box(turret, 'paint', [-.69, .647, -.02], [.61, .20, .58], [.06, .03, .05]);
  optics(P, turret, [-.69, .745, .37], .62, .255, .45, .055, 3);
  optics(P, turret, [.75, .46, 1.27], .49, .16, .38, -.18);
  lid(P, turretDetail, .51, .662, -.61, .60, .70);
  lid(P, turretDetail, -.48, .686, -1.03, .58, .51);
  kit.antenna(P, turretDetail, 1.02, .69, -1.36, .58);
  kit.antenna(P, turretDetail, -.97, .667, -1.23, .75);
  kit.jerrycans(P, hullDetail, 1.23, 1.57, -3.26, 2, Math.PI / 2);
  roll(P, hullDetail, -.64, 1.752, -3.33, .86, .15, '#8e9681');

  const end = model.muzzle.position.z;
  shapedTube(P, end, [[.19, -.03], [.235, .17], [.235, .51], [.186, .72], [.159, 1.49],
    [.157, 2.01], [.137, 2.20], [.119, 5.58], [.116, end - .38]], .119, '#b9bdb1');
  for (const [z, radius, length] of [[.59, .225, .10], [1.52, .172, .12], [2.0, .172, .15], [4.31, .139, .12]]) {
    P.add(barrel, 'paint', cylZ(radius, length, 24, 0, 0, z), '#b3b6a3');
  }
  for (const x of [-.137, .137]) P.box(barrel, 'dark', [x, .074, 1.28], [.047, .049, .80], [0, 0, 0]);
}

function lancer(P, model) {
  // The main cheeks sweep past the offset sights into a shallow rear bustle.
  const rim = [[-.54, 1.42], [.51, 1.47], [1.12, 1.0], [1.42, .40], [1.30, -1.15],
    [.86, -1.72], [-.83, -1.68], [-1.31, -1.07], [-1.44, .29], [-1.14, 1.07]];
  const crown = [[-.49, .98], [.29, 1.15], [.83, .83], [1.09, .29], [.98, -1.12],
    [.64, -1.32], [-.79, -1.29], [-1.11, -.68], [-1.14, .38]];
  P.section(turret, 'dark', [[rim.map(([x, z]) => [x * .92, z * .96]), .036], [rim, .13]], '#c6c4ad');
  P.section(turret, 'armor', [[rim, .102], [rim, .252],
    [crown, (_, z) => .595 - z * .061]], '#dad5ac');
  for (const side of [-1, 1]) {
    const plate = [[side * .50, 1.39], [side * .73, 1.35], [side * 1.25, .89], [side * 1.48, .28],
      [side * 1.38, -.37], [side * 1.06, -.26], [side * .89, .48]];
    const inset = plate.map(([x, z]) => [x * .93, z * .93 - .075]);
    P.section(turret, 'armor', [[plate, .20], [plate, .275], [inset, (_, z) => .49 - z * .075]],
      side > 0 ? '#a3a991' : '#c6c3a2');
    P.beam(turretDetail, 'metal', [side * 1.48, .282, .22], [side * 1.38, .292, -.42], .019);
    kit.grabRail(P, turretDetail, [side * .98, .618, -.36], [side * .974, .66, -.92], .042);
  }
  P.box(turret, 'dark', [0, .30, 1.30], [.69, .49, .39], [-.12]);
  P.add(turret, 'armor', cylZ(.318, .28, 24, 0, .316, 1.35, .274), '#b5b59c');
  lid(P, turretDetail, .49, .58, -.12, .57, .67);
  lid(P, turretDetail, -.48, .665, -.48, .50, .57);
  optics(P, turret, [-.62, .566, .89], .46, .199, .40, -.13);
  P.box(turret, 'paint', [.60, .613, -.66], [.42, .169, .46]);
  optics(P, turret, [.58, .69, -.35], .41, .24, .34, .12, 2);
  kit.antenna(P, turretDetail, -.93, .656, -1.03, .79);
  kit.antenna(P, turretDetail, .87, .675, -.95, .53);
  const rear = -1.79;
  P.box(turret, 'dark', [0, .266, rear - .015], [2.20, .071, .50]);
  for (const x of [-1.09, -.55, 0, .55, 1.09]) {
    P.beam(turret, 'metal', [x, .23, rear - .23], [x, .57, rear - .23], .023);
    P.beam(turret, 'metal', [x, .23, rear - .23], [x * .89, .24, rear + .39], .025);
  }
  for (const y of [.24, .42, .56]) P.beam(turret, 'metal', [-1.09, y, rear - .23], [1.09, y, rear - .23], .026);
  roll(P, turretDetail, -.45, .451, rear + .03, .95, .162, '#c2b18f');
  kit.stowageBox(P, turretDetail, .61, .45, rear, .63, .35, .41);
  for (const side of [-1, 1]) {
    P.box(hullDetail, 'dark', [side * 1.53, 1.194, -2.88], [.20, .119, .65]);
    kit.grabRail(P, hullDetail, [side * 1.53, 1.243, -2.60], [side * 1.53, 1.243, -3.20]);
    for (let i = 0; i < 4; i++) {
      const z = 1.15 - i * .91;
      const panel = [[side * 1.63, z + .42], [side * 1.75, z + .23], [side * 1.77, z - .26],
        [side * 1.68, z - .42], [side * 1.58, z - .29]];
      P.section(hull, 'paint', [[panel, 1.045], [panel, 1.255]], i % 2 ? '#d6cca7' : '#b8bc9c');
      kit.bolts(P, hullDetail, 'metal', [[side * 1.763, 1.207, z - .21], [side * 1.757, 1.207, z + .14]], .022, .019, 'x');
    }
  }

  const end = model.muzzle.position.z;
  shapedTube(P, end, [[.188, .01], [.202, .23], [.181, .61], [.14, .79], [.131, 1.55],
    [.131, 2.65], [.116, 2.86], [.105, end - .39]], .107, '#d6d3c0');
  // A distinct flat-sided thermal sleeve with recessed longitudinal strips.
  for (const s of [-1, 1]) {
    P.box(barrel, 'paint', [s * .116, .001, 1.79], [.109, .209, 1.95], [0, 0, s * -.12], '#d6cc9e');
    P.box(barrel, 'dark', [s * .175, .036, 1.78], [.024, .059, 1.76], [0, 0, s * -.12]);
  }
  for (const [z, r, d] of [[.78, .197, .16], [1.98, .18, .10], [2.79, .17, .15], [4.44, .121, .09], [6.05, .121, .092]]) {
    P.add(barrel, 'paint', cylZ(r, d, 24, 0, 0, z), '#c7c2a2');
  }
}

// Each frame follows the angle of the underlying plate rather than floating off the hull.
function spareTracks(P, [x, y, z], width, pitch, count, rx, ry = 0) {
  const transform = geometry => T(geometry, x, y, z, rx, ry);
  P.add(hullDetail, 'dark', transform(box(width + .09, pitch * count + .07, .053, 0, 0, -.022)));
  for (let i = 0; i < count; i++) {
    const at = (i - (count - 1) / 2) * pitch;
    P.add(hullDetail, 'track', transform(box(width, pitch * .86, .085, 0, at, .018)), i % 2 ? '#d4c7b6' : '#eee7d9');
    P.add(hullDetail, 'metal', transform(cylX(.025, width * 1.04, 8, 0, at - pitch * .41, .049)));
    for (const side of [-1, 1]) {
      P.add(hullDetail, 'track', transform(box(width * .24, .055, .052, side * width * .26, at + .01, .066)));
    }
  }
  for (const side of [-1, 1]) {
    P.add(hullDetail, 'paint', transform(box(.047, pitch * count + .08, .040, side * width * .41, 0, .074)));
    for (const at of [-1, 1]) {
      P.add(hullDetail, 'metal', transform(cylZ(.023, .022, 8, side * width * .41, at * pitch * count * .47, .103)));
    }
  }
}

function sideTools(P, x, y, z, side) {
  P.box(hullDetail, 'paint', [x - side * .019, y, z], [.064, .145, 1.13], [0, 0, side * .14]);
  P.add(hullDetail, 'wood', cylZ(.026, .71, 10, x, y - .018, z - .04));
  P.box(hullDetail, 'metal', [x + side * .014, y + .012, z + .43], [.068, .174, .22], [.17, 0, side * -.2]);
  P.beam(hullDetail, 'metal', [x + side * .014, y + .064, z - .60], [x + side * .014, y + .066, z + .32], .016);
  for (const at of [-.29, .19]) {
    P.box(hullDetail, 'metal', [x + side * .027, y + .016, z + at], [.082, .16, .026]);
  }
}

function su100(P) {
  collar(P, gun, .411, .180, .087, '#c1bfa7');
  collar(P, barrel, .833, .136, .073, '#b6b8a8');
  lid(P, hullDetail, -.69, 1.985, 1.82, .52, .40);
  optics(P, hull, [.61, 1.986, 1.97], .40, .14, .33, .035, 1);
  spareTracks(P, [.77, 1.61, 2.594], .59, .105, 3, -.671);
  kit.liftHooks(P, hullDetail, [[.88, 2.003, 2.06, .62], [-.91, 1.993, -.31, -.55]]);
  sideTools(P, -1.295, 1.72, .32, -1);
  const seam = glacis(1.39, 2.709, 1.985, 2.235);
  for (const s of [-1, 1]) {
    P.beam(hullDetail, 'metal', seam.point(s * 1.064, .06, .011), seam.point(s * 1.064, seam.length - .04, .011), .015);
  }
  roll(P, hullDetail, .66, 1.583, -2.61, .86, .126, '#b4ad82');
  P.beam(hullDetail, 'metal', [1.31, 1.51, -2.86], [1.36, 1.505, -2.52], .017);
}

function jagdpanther(P) {
  collar(P, gun, .48, .215, .101, '#bbb7a5');
  collar(P, barrel, 1.447, .116, .087, '#bdb49f');
  optics(P, hull, [-.72, 2.53, 1.99], .52, .177, .40, -.06, 1);
  kit.liftHooks(P, hullDetail, [[-.96, 2.555, 1.14], [.98, 2.558, 1.21], [-.97, 2.559, -.77], [1.00, 2.559, -.73]]);
  // Spare shoes on the fighting-compartment flank, and pioneer tools on the opposite side.
  spareTracks(P, [1.471, 1.876, -.17], .65, .152, 4, -.30, Math.PI / 2);
  sideTools(P, -1.48, 1.85, -.26, -1);
  kit.stowageBox(P, hullDetail, -1.28, 1.767, -1.96, .31, .20, .73);
  kit.towCable(P, hullDetail, 1.532, 1.59, -1.93, .84, .065, .024);
  const glacisFront = glacis(1.63, 2.985, 2.552, 2.015);
  for (const x of [-.63, .60]) {
    const foot = glacisFront.point(x, .20, .016);
    const head = glacisFront.point(x, .46, .016);
    P.beam(hullDetail, 'paint', foot, head, .041);
    P.beam(hullDetail, 'metal', glacisFront.point(x - .048, .47, .043), glacisFront.point(x + .048, .47, .043), .022);
  }
}

function isu122(P) {
  collar(P, gun, .512, .232, .118, '#8c9386');
  collar(P, barrel, 1.72, .138, .069, '#a8ad9a');
  for (const x of [-.38, .38]) {
    P.box(gun, 'paint', [x, -.106, .387], [.11, .12, .10], [0, x * -.55, 0], '#b6bdad');
    P.add(gun, 'metal', cylZ(.027, .039, 6, x, -.107, .448));
  }
  const face = glacis(1.51, 3.10, 2.346, 2.575);
  spareTracks(P, face.point(.86, .24, .031), .52, .109, 3, face.pitch);
  const visionFrame = face.place(box(.49, .284, .085), -.84, .65, .047);
  P.add(hull, 'paint', visionFrame, '#b7bdaa');
  P.add(hull, 'dark', face.place(box(.33, .075, .037), -.84, .682, .085));
  P.add(hull, 'glass', face.place(box(.26, .036, .013), -.84, .68, .108));
  // Field equipment is strapped to the fenders and clears the engine doors.
  roll(P, hullDetail, -.99, 1.55, -1.08, .72, .12, '#aaa177');
  kit.grabRail(P, hullDetail, [1.18, 2.337, -.36], [1.18, 2.337, .06], .07, .018);
  kit.grabRail(P, hullDetail, [-1.18, 2.337, -.34], [-1.18, 2.337, .09], .07, .018);
  kit.stowageBox(P, hullDetail, 1.30, 1.599, -2.79, .29, .20, .65);
  for (const s of [-1, 1]) P.beam(hullDetail, 'metal',
    [s * 1.23, 2.344, .11], [s * 1.23, 2.344, 2.26], .014);
}

function jagdtiger(P) {
  collar(P, gun, .571, .267, .14, '#c5c1a7');
  collar(P, barrel, 2.864, .157, .094, '#b4ac94');
  // Heavy bolt-on spare-link holders and the rear casemate-door hardware.
  for (const side of [-1, 1]) {
    spareTracks(P, [side * 1.574, 2.174, -.61], .66, .142, 4, -.247, side * Math.PI / 2);
    spareTracks(P, [side * 1.575, 2.168, .37], .66, .142, 4, -.247, side * Math.PI / 2);
    P.box(hullDetail, 'paint', [side * .625, 2.25, -1.755], [.14, .134, .13]);
    P.add(hullDetail, 'metal', cylX(.033, .106, 12, side * .62, 2.257, -1.813));
    kit.towCable(P, hullDetail, side * 1.62, 1.754, -2.98, -1.63, .066, .025);
  }
  optics(P, hull, [.81, 2.745, 1.70], .39, .18, .36, .04, 1);
  lid(P, hullDetail, -.83, 2.747, -.99, .41, .50);
  kit.liftHooks(P, hullDetail, [[-1.24, 2.749, 1.53], [1.24, 2.749, 1.44], [1.26, 2.748, -1.35]]);
}

function foch(P) {
  collar(P, gun, .559, .276, .10, '#a9aeaa');
  collar(P, barrel, 1.64, .143, .079, '#bec9c4');
  for (const x of [-.27, .27]) {
    P.box(gun, 'paint', [x, .172, .429], [.109, .11, .137], [-.28], '#c1c5b3');
    P.add(gun, 'metal', cylZ(.024, .033, 8, x, .173, .493));
  }
  // The low, armored optical station is separate from the cross-roof rangefinder.
  optics(P, hull, [-.69, 2.382, .53], .58, .232, .45, -.05, 2);
  for (const side of [-1, 1]) {
    optics(P, hullDetail, [side * 1.17, 2.42, 1.48], .31, .20, .30, side * .62, 1);
    const x = side * 1.29;
    kit.grabRail(P, hullDetail, [x, 2.39, -.85], [x, 2.39, .12], .075, .019);
    P.beam(hullDetail, 'metal', [side * 1.42, 1.64, -2.8], [side * 1.42, 1.65, -2.16], .023);
  }
  lid(P, hullDetail, .19, 1.60, -2.62, .53, .49);
  kit.stowageBox(P, hullDetail, -.61, 1.68, -2.93, .58, .16, .35);
}

function strv(P) {
  // The additions follow the low wedge and leave the fixed gun's travel clear.
  const slope = glacis(.968, 3.04, 1.387, 1.48);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      P.add(hull, 'paint', slope.place(box(.44, .071, .065), side * 1.19, .22 + i * .177, .035), '#dde1ce');
    }
    P.beam(hullDetail, 'metal', slope.point(side * 1.43, .17, .077), slope.point(side * 1.43, .87, .077), .021);
    kit.towCable(P, hullDetail, side * 1.64, 1.53, -2.53, -.68, .08, .020);
  }
  const rear = -2.79;
  P.box(hullDetail, 'paint', [-.64, 1.50, rear], [1.01, .13, .50]);
  kit.jerrycans(P, hullDetail, -.64, 1.548, rear, 3);
  roll(P, hullDetail, .64, 1.68, -2.76, .82, .132, '#c1b68c');
  kit.grabRail(P, hullDetail, [.52, 1.68, -1.22], [1.07, 1.68, -1.22], .065, .017);
}

function ontos(P, model) {
  // Six moving sleeves stay parented to the individual tube rack through pitch and recoil.
  for (const muzzle of model.barrel.children.filter(node => /^muzzle(?:_\d+)?$/.test(node.name))) {
    const { x, y, z } = muzzle.position;
    pipeRing(P, barrel, 'metal', x, y, z - .27, .083, .019);
    pipeRing(P, barrel, 'paint', x, y, z - 1.22, .095, .024);
    P.box(barrel, 'dark', [x + Math.sign(x) * .09, y - .024, z - 1.22], [.080, .096, .12]);
  }
  const z = .07;
  for (const side of [-1, 1]) {
    P.beam(turretDetail, 'metal', [side * .43, .16, z], [side * .90, .72, z - .31], .045, 10);
    P.beam(turretDetail, 'metal', [side * .90, .72, z - .31], [side * .62, .82, z + .42], .038, 8);
    kit.grabRail(P, hullDetail, [side * .77, 1.105, -1.66], [side * .77, 1.163, -1.00], .054);
  }
  roll(P, hullDetail, -.66, 1.21, -1.34, .58, .114, '#a8a077');
  kit.stowageBox(P, hullDetail, .75, 1.208, -1.35, .42, .23, .50);
}

function fv4005(P) {
  collar(P, barrel, .39, .161, .152, '#b8b7a2');
  collar(P, barrel, 2.08, .133, .105, '#a4a695');
  // Large attachment flanges and a recessed access-door surround break up the shield.
  for (const side of [-1, 1]) {
    const x = side * 1.502;
    P.box(turret, 'dark', [x, 1.097, -.55], [.057, .82, 1.01], [0, 0, side * -.031]);
    P.box(turret, 'paint', [x + side * .033, 1.104, -.55], [.072, .77, .942], [0, 0, side * -.031], '#d3ccb4');
    for (const z of [-.93, -.20]) {
      P.add(turretDetail, 'metal', cylY(.040, .147, 12, x + side * .069, 1.11, z));
      P.box(turretDetail, 'paint', [x + side * .052, .99, z], [.073, .087, .10]);
    }
    const y = .58;
    kit.boltRow(P, turretDetail, [x, y, -1.19], [x, y, .68], 10, .019, 'x', 'metal');
    kit.grabRail(P, turretDetail, [side * .89, 1.824, -1.14], [side * .89, 1.824, -.58], .107, .020);
    P.box(turret, 'paint', [side * .443, .759, 1.40], [.31, .32, .172], [-.154]);
    P.add(turretDetail, 'metal', cylZ(.082, .055, 14, side * .441, .766, 1.506));
  }
  lid(P, turretDetail, -.55, 1.822, .34, .60, .62);
  optics(P, turretDetail, [.59, 1.822, .72], .327, .139, .36, .08, 1);
  kit.grabRail(P, hullDetail, [-.80, 1.783, -2.53], [-1.30, 1.783, -2.53], .052, .017);
}

function centauro(P) {
  for (const side of [-1, 1]) {
    const x = side * 1.701;
    P.box(hull, 'dark', [x, 1.764, -1.62], [.109, .33, .77], [0, 0, side * .10]);
    for (let i = 0; i < 6; i++) {
      P.box(hull, 'metal', [x + side * .047, 1.642 + i * .049, -1.62], [.060, .027, .69], [0, 0, side * .26]);
    }
    kit.boltRow(P, hullDetail, [x + side * .057, 1.925, -1.99], [x + side * .057, 1.925, -1.28], 4, .018, 'x', 'metal');
    kit.grabRail(P, turretDetail, [side * .93, .868, -.51], [side * .93, .874, -1.13], .061, .019);
  }
  optics(P, turret, [-.71, .895, .49], .46, .226, .37, -.13, 2);
  roll(P, turretDetail, .57, .72, -1.53, .70, .113, '#b3aa8f');
  lid(P, hullDetail, .76, 1.95, -2.13, .50, .38);
}

function sprut(P) {
  // Bolt-down bow ribs and tie-downs reflect the shallow amphibious hull.
  const bow = glacis(1.217, 3.02, 1.398, 1.53);
  for (const side of [-1, 1]) {
    for (const x of [.93, 1.21]) {
      P.add(hull, 'paint', bow.place(box(.046, 1.22, .042), side * x, .77, .023), '#cbd2ac');
    }
    kit.liftHooks(P, hullDetail, [[side * 1.29, 1.296, 2.38, .38], [side * 1.09, 1.43, -2.82, -.16]]);
    kit.towCable(P, hullDetail, side * 1.547, 1.408, -2.68, -.66, .046, .018);
  }
  optics(P, turret, [-.52, .71, .37], .42, .18, .36, -.19, 2);
  roll(P, hullDetail, -.75, 1.60, -3.17, .70, .14, '#a2a77e');
}

const designs = { su100, jagdpanther, isu122, jagdtiger, amxfoch: foch, warden130: warden, lancer120: lancer,
  strv103: strv, m50ontos: ontos, fv4005s1: fv4005, centauro2: centauro, sprutsd: sprut };

function makePalette(root, spec) {
  const originalMaterials = new Set();
  root.traverse(node => { if (node.isMesh) originalMaterials.add(node.material); });
  const materials = [...originalMaterials];
  const make = (pattern, color, roughness, metalness) => {
    const source = materials.find(material => pattern.test(material.name));
    const material = source ? source.clone() : new THREE.MeshStandardMaterial({ color, roughness, metalness });
    material.vertexColors = true;
    material.transmission = 0;
    return material;
  };
  const modernConcept = spec.id === 'warden130' || spec.id === 'lancer120';
  return {
    armor: make(/^(Armor ·|\w+_paint$)/i, spec.paint.base, .80, .24),
    paint: make(modernConcept ? /_paint$/i : /^Fittings ·/, spec.paint.base, .75, .27),
    metal: make(/^(Contact ·|\w+_(baremetal|steel)$)/i, '#71756a', .63, .63),
    dark: make(/^(Recess ·|\w+_(darkmetal|dark_steel)$)/i, '#272c29', .84, .37),
    track: make(/^(Track ·|\w+_track$)/i, '#66594c', .88, .46),
    glass: make(/^(Optics ·|Coated optical glass|\w+_glass$)/i, '#3c606b', .24, .43),
    wood: make(/^Tool handles ·/, '#806d4f', .94, .04),
    canvas: make(/_canvas$/i, '#8b8168', .98, 0),
    rubber: make(/^(Rubber ·|\w+_rubber$)/i, '#2e2d28', .94, .02),
  };
}

export function refineTankDestroyer(root, spec, anchors) {
  const design = designs[spec.id];
  if (!design) return;
  const materials = makePalette(root, spec);
  const exterior = new Exterior();
  design(exterior, anchors);
  if (design === warden || design === lancer) {
    anchors.turret.getObjectByName('turret_visual').removeFromParent();
    anchors.barrel.getObjectByName('recoiling-barrel_visual').removeFromParent();
  }
  for (const [part, batches] of Object.entries(exterior.merged())) {
    const group = new THREE.Group();
    group.name = `${spec.short} ${part} exterior`;
    group.userData.close_detail = part.endsWith(' detail');
    for (const [material, geometry] of Object.entries(batches)) {
      const mesh = new THREE.Mesh(geometry, materials[material]);
      mesh.name = `${part} ${material}`;
      mesh.userData.matKey = material === 'armor' ? 'paint' : material === 'paint' ? 'paintDetail' : material;
      group.add(mesh);
    }
    const anchor = part.split(' ')[0];
    anchors[anchor].add(group);
  }
  root.userData.tankDestroyerDetail = spec.id;
}
