// v2 tank builders (Panther, IS-2, Pershing, Centurion, Leopard 1A5, Leopard 2A6, T-90M, Challenger 2, Type 99A, Merkava Mk4).
// Real-scale (1 unit = 1 m), +z = front. Dimensions come from spec.dims so hit boxes and visuals agree.
import * as THREE from 'three';
import { trackCenterOffset } from '../game/vehicleDimensions.js';
import { T, box, cylY, cylX, cylZ, sideExtrude, topExtrude, taper, superEllipse, castLoft, glacis, lathe, Parts } from './geom.js';
import * as K from './kit.js';

const DEG = Math.PI / 180;
// Clip a side profile against a horizontal line.
function clipProfile(poly, fy, direction = 1) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = direction * (a[1] - fy) >= 0, ib = direction * (b[1] - fy) >= 0;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (fy - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, fy]); }
  }
  return out;
}
// lower hull between the tracks + upper hull / fenders above the track run
function hullShell(P, d, prof, fy, o = {}) {
  const inner = 2 * trackCenterOffset(d) - d.trackW - 0.04;
  const lower = o.lowerBevel ? clipProfile(prof, fy + .10, -1) : prof;
  P.add('hull', 'paint', sideExtrude(lower, inner, 0, o.lowerBevel ?? 0.02));
  const up = clipProfile(prof, fy);
  let g = sideExtrude(up, o.upperW ?? d.W - 0.02, 0, 0.025);
  if (o.sideTaper) g = taper(g, fy, d.hullH, o.sideTaper, 1);
  P.add('hull', 'paint', g);
  if (o.fender !== false) {
    const span = (d.W - inner) / 2;
    for (const s of [-1, 1]) {
      P.add('hull', 'paint', box(span, 0.035, d.L * (o.fenderLen ?? 0.98), s * (d.W - span) / 2, fy - 0.015, o.fenderZ ?? 0));
    }
  }
  return inner;
}
function gear(o) {
  const wheels = [];
  for (let i = 0; i < o.n; i++) {
    const z = o.zs ? o.zs[i] : o.z0 + ((o.z1 - o.z0) * i) / (o.n - 1); const y = o.r + 0.07;
    if (o.inter) { wheels.push({ z, y, r: o.r, w: 0.22, xo: i % 2 ? 0.19 : -0.12 }); wheels.push({ z, y, r: o.r, w: 0.22, xo: i % 2 ? -0.12 : 0.19 }); }
    else wheels.push({ z, y, r: o.r, w: o.w });
  }
  const rollers = (o.rollers || []).map((z) => ({ z, y: o.ry, r: o.rr || 0.08 }));
  return { wheels, sprockets: [o.spr], idlers: [o.idl], rollers };
}
const trackTop = (g) => Math.max(...[...g.wheels, ...g.sprockets, ...g.idlers, ...g.rollers].map((c) => c.y + c.r)) + 0.075;
function decalsSide(kind, text, part, x, y, z, s) { return [{ kind, text, part, pos: [x, y, z], ry: Math.PI / 2, s }, { kind, text, part, pos: [-x, y, z], ry: -Math.PI / 2, s }]; }
function turretBody(P,poly,h,sx,sz,cz,y0=0){
  // Cast turrets use curved multi-section armor; fabricated turrets keep
  // their characteristic broad planar armor faces and small edge radii.
  P.add('turret','paint',poly.length>20
    ? castLoft(poly,h,sx,sz,cz,y0)
    : taper(topExtrude(poly,h,y0,0.034,2),y0,y0+h,sx,sz,cz));
}
function deckGrilles(P, x0, x1, y, z0, z1, n) {
  const w = Math.abs(x1 - x0), l = Math.abs(z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  P.add('hull', 'dark', box(w, 0.021, l, x, y + 0.012, z));
  for (let i = 0; i < n; i++) {
    const zz = z0 + (z1 - z0) * (i + 0.5) / n;
    P.add('hull', 'metal', box(w - 0.035, 0.020, l * 0.53 / n, x, y + 0.045, zz, 0.32));
  }
  for (const edge of [x0, x1]) {
    P.add('hull', 'paintDetail', box(0.042, 0.044, l, edge, y + 0.026, z));
    K.boltRow(P, 'hull', [edge, y + 0.056, z0 + 0.06], [edge, y + 0.056, z1 - 0.06], 4, 0.012, 'y', 'metal');
  }
  for (const edge of [z0, z1]) P.add('hull', 'paintDetail', box(w, 0.043, 0.045, x, y + 0.025, edge));
  if (w > 0.5) P.add('hull', 'paintDetail', box(0.028, 0.024, l - 0.035, x, y + 0.055, z));
}
function sightWindow(P, width, height, x, y, z) {
  P.add('turret', 'paintDetail', box(width + 0.076, height + 0.075, 0.041, x, y, z - 0.008));
  P.add('turret', 'dark', box(width + 0.024, height + 0.022, 0.015, x, y, z + 0.014));
  P.add('turret', 'optic', box(width, height, 0.011, x, y, z + 0.024));
  P.add('turret', 'paintDetail', box(width + 0.068, 0.030, 0.098, x, y + height / 2 + 0.028, z + 0.024));
  K.bolts(P, 'turret', 'metal', [-1, 1].map(side => [x + side * (width / 2 + 0.024), y, z + 0.017]), 0.009, 0.012, 'z');
}
function bustleRoll(P, x, y, z, length, radius) {
  P.add('turret', 'canvas', cylX(radius, length, 14, x, y, z, radius * 0.94));
  for (const side of [-1, 1]) {
    P.add('turret', 'canvas', cylX(radius * 0.82, 0.054, 12, x + side * length * 0.48, y, z));
    P.add('turret', 'rubber', cylX(radius * 1.03, 0.032, 16, x + side * length * 0.31, y, z));
    P.add('turret', 'metal', box(0.046, 0.023, 0.064, x + side * length * 0.31, y + radius, z));
  }
}
function chainCurtain(P, x0, x1, y, z, n = 18, len = 0.42) {
  for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * i) / (n - 1); for(let k=0;k<6;k++) {
      const g=new THREE.TorusGeometry(len/12,0.008,5,10);
      g.scale(0.60,1,1);
      P.add('turret','metal',T(g,x,y-len*(k+0.5)/6,z,0,k%2*Math.PI/2,0));
    } P.add('turret', 'metal', T(new THREE.SphereGeometry(0.055, 8, 6), x, y - len - 0.03, z)); }
  P.add('turret', 'metal', box(x1 - x0 + 0.1, 0.04, 0.04, (x0 + x1) / 2, y, z));
}
function torsionArms(P, inner, g, c) { for (const s of [-1, 1]) K.suspensionArms(P, s * (inner / 2 + 0.06), g.wheels.filter((w, i) => !w.xo || i % 2 === 0), c + 0.12, s); }

// ---------------- WWII ----------------
function panther(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 8, z0: -2.45, z1: 2.15, r: 0.43, inter: true, spr: { z: hl - 0.38, y: 0.86, r: 0.39 }, idl: { z: -hl + 0.42, y: 0.72, r: 0.33 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.12, c], [hl - 0.85, c], [hl - 0.05, 1.08], [hl - 1.32, H], [-hl + 0.28, H], [-hl + 0.02, H - 0.35], [-hl + 0.02, c + 0.25]];
  const inner = hullShell(P, d, prof, fy, { sideTaper: 0.72 });
  torsionArms(P, inner, g, c);
  const bow = glacis(1.08, hl - 0.05, H, hl - 1.32);
  weld(P, 'hull', [bow.point(-1.08, bow.length - 0.029, 0.025), bow.point(1.08, bow.length - 0.029, 0.025)], 0.011);
  for (const side of [-1, 1]) {
    weld(P, 'hull', [bow.point(side * 1.41, 0.565, 0.019), bow.point(side * 1.17, bow.length - 0.07, 0.022)], 0.010);
  }
  // glacis details: bow MG ball, driver periscope, headlight, tow shackles
  P.add('hull', 'paint', T(new THREE.SphereGeometry(0.13, 12, 8), 0.55, 1.45, hl - 0.68)); P.add('hull', 'dark', cylZ(0.02, 0.35, 6, 0.55, 1.47, hl - 0.52));
  K.periscope(P, 'hull', -0.55, H, hl - 1.45, 0); K.periscope(P, 'hull', 0.55, H, hl - 1.45, 0);
  K.headlight(P, 'hull', -1.05, 1.42, hl - 0.75, false, 'lens');
  for (const s of [-1, 1]) { P.add('hull', 'metal', box(0.08, 0.22, 0.25, s * 0.85, c + 0.2, hl - 0.75)); P.add('hull', 'metal', cylX(0.05, 0.22, 8, s * 0.85, c + 0.15, hl - 0.63)); }
  K.hatchRect(P, 'hull', -0.6, H, hl - 1.7, 0.5, 0.55); K.hatchRect(P, 'hull', 0.6, H, hl - 1.7, 0.5, 0.55);
  // engine deck, rear plate exhausts, stowage boxes, jack, spare links
  deckGrilles(P, -0.8, 0.8, H, -hl + 0.5, -hl + 1.7, 7); for (const s of [-1, 1]) deckGrilles(P, s * 0.85, s * 1.15, H, -hl + 0.6, -hl + 1.6, 4);
  P.add('hull', 'paint', cylY(0.25, 0.08, 14, 0, H + 0.04, -hl + 2.2));
  for (const s of [-1, 1]) { K.exhaust(P, 'hull', s * 0.42, H - 0.15, -hl - 0.08, 'ww2', 0.1, 0.7); K.stowageBox(P, 'hull', s * 1.0, H - 0.6, -hl - 0.15, 0.55, 0.38, 0.28); }
  P.add('hull','metal',cylY(0.08,0.5,10,0,H-0.45,-hl-0.1));
  // Panther fan-cover rim and radial grille on the existing round cover.
  P.add('hull','metal',T(new THREE.TorusGeometry(0.23,0.018,6,24),0,H+0.085,-hl+2.2,Math.PI/2,0,0));
  for(let i=0;i<8;i++)P.add('hull','dark',box(0.025,0.012,0.40,0,H+0.086,-hl+2.2,0,i*Math.PI/8));
  K.spareLinks(P, 'hull', 0.0, c + 0.55, -hl - 0.03, 3, d.trackW, 0.15, 0, -Math.PI / 2);
  for (const s of [-1, 1]) { K.towCable(P, 'hull', s * 1.25, H - 0.12, -1.6, 1.4, 0.0); K.tools(P, 'hull', s * 0.95, H, 0.2, s); }
  for (const s of [-1, 1]) K.skirt(P, s * (d.W / 2 - 0.012), fy + 0.04, -hl + 0.55, hl - 0.75, 0.55, 6, 0.012);
  K.antenna(P, 'hull', 1.0, H, -hl + 0.5, 1.9);
  // turret: narrow-fronted, steeply sloped sides
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  const turretOutline = [[-.63,1.11],[.63,1.11],[.79,.86],[tw,-.63],[.83,-1.29],
    [-.83,-1.29],[-tw,-.63],[-.79,.86]].map(([x,z]) => [x,z + bz]);
  turretBody(P, turretOutline, d.turretH, 0.86, 0.96, bz);
  K.cupola(P, 'turret', -0.52, d.turretH, bz - 0.55, 0.33, 0.16, 7, 'ww2');
  K.mg(P, 'turret', -0.52, d.turretH + 0.29, bz - 0.55, 0, 'mg34');
  K.hatch(P, 'turret', 0.42, d.turretH, bz - 0.2, 0.26); K.periscope(P, 'turret', 0.42, d.turretH, bz + 0.25, 0, 0.8);
  P.add('turret', 'dark', cylZ(0.352, 0.052, 22, 0, 0.36, bz - tl + 0.004));
  P.add('turret', 'paintDetail', cylZ(0.32, 0.073, 24, 0, 0.36, bz - tl - 0.018));
  for (const x of [-0.205, 0.205]) {
    P.add('turret', 'paintDetail', box(0.095, 0.090, 0.094, x, 0.594, bz - tl - 0.017));
    P.add('turret', 'metal', cylX(0.026, 0.107, 10, x, 0.607, bz - tl - 0.052));
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.add('turret', 'metal', cylZ(0.04, 0.24, 8, s * 0.82, 0.62, bz + 0.6 - i * 0.12, 0.04, -0.6));
  K.liftHooks(P, 'turret', [[-0.6, d.turretH, bz + 0.6], [0.6, d.turretH, bz + 0.6], [0, d.turretH, bz - 0.9]]);
  // gun: "chin" mantlet + 75 mm KwK 42 L/70 with double-baffle brake
  const gz = bz + tl - 0.1;
  P.add('gun', 'paint', sideExtrude([[-.22,-.36],[.31,-.38],[.40,-.25],[.37,.11],
    [.30,.255],[.17,.33],[-.19,.32],[-.24,.18]], 1.25, 0, .050));
  P.add('gun', 'paintDetail', cylZ(0.186, .18, 26, 0, 0, .38, .166));
  P.add('gun', 'dark', cylZ(0.045, .033, 12, -.38, .14, .367));
  P.add('gun', 'optic', cylZ(0.022, .012, 12, -.38, .14, .386));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.07, brake: { type: 'double', r: 0.105, len: 0.42 } });
  const sideMark = (kind, text, z, size) => [-1, 1].map(side => ({ kind, text, part: 'turret',
    pos: [side * (0.95 - 0.14 * (z + 0.4)), 0.39, bz + z], ry: side * 1.42, s: size, projectDepth: .25 }));
  return { P, ...g, wheelType: 'single', cast: 0.35, castTurret: 0.13, castMantlet: .65,
    finish: { roughness: .78, abrasion: .22, primer: '#776847' },
    turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, gz],
    decals: [...sideMark('cross', '', -.45, .32), ...sideMark('text', '211', .27, .37)] };
}

function is2CastLoft(poly, h, cz = 0, y0 = 0, wallAngles = { left: 4, right: 20 }) {
  // IS-2 Model 1944 cast turret: the left wall is nearly vertical while the
  // right wall draws inward by about 20 degrees toward the roof.
  let p = poly.slice();
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) p.reverse();
  const n = p.length, positions = [], uv = [], idx = [];
  const leftMaxX = Math.max(1e-6, ...p.filter(([x]) => x < 0).map(([x]) => Math.abs(x)));
  const rightMaxX = Math.max(1e-6, ...p.filter(([x]) => x > 0).map(([x]) => x));
  const wallBase = 0.22;
  // [height, lower left scale, lower right scale, front scale, rear-bustle scale]
  const rings = [
    [0.00, 0.92, 0.92, 0.94, 0.96],
    [0.07, 0.98, 0.97, 0.98, 0.99],
    [0.22, 1.00, 1.00, 1.00, 1.00],
    [0.46, 1.00, 1.00, 0.93, 1.00],
    [0.70, 1.00, 1.00, 0.82, 0.97],
    [0.88, 1.00, 1.00, 0.74, 0.93],
    [0.97, 1.00, 1.00, 0.71, 0.90],
    [1.00, 1.00, 1.00, 0.68, 0.88],
  ];
  for (const [v, leftBase, rightBase, front, rear] of rings) {
    const rise = Math.max(0, v - wallBase) * h;
    const left = v <= wallBase ? leftBase : 1 - Math.tan(wallAngles.left * DEG) * rise / leftMaxX;
    const right = v <= wallBase ? rightBase : 1 - Math.tan(wallAngles.right * DEG) * rise / rightMaxX;
    for (const [x, z] of p) {
      const sx = x < 0 ? left : right;
      const sz = z > cz ? front : rear;
      positions.push(x * sx, y0 + v * h, cz + (z - cz) * sz);
      uv.push(x, z);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (const top of [false, true]) {
    const ring = top ? rings.length - 1 : 0, offset = positions.length / 3;
    const outline = [];
    for (let i = 0; i < n; i++) {
      const k = (ring * n + i) * 3;
      const x = positions[k], z = positions[k + 2];
      positions.push(x, positions[k + 1], z);
      uv.push(x, z);
      outline.push(new THREE.Vector2(x, z));
    }
    for (let [a, b, c] of THREE.ShapeUtils.triangulateShape(outline, [])) {
      const A = outline[a], B = outline[b], C = outline[c];
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      if ((top && cross > 0) || (!top && cross < 0)) [b, c] = [c, b];
      idx.push(offset + a, offset + b, offset + c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const roof = p.map((_, i) => {
    const offset = ((rings.length - 1) * n + i) * 3;
    return positions.slice(offset, offset + 3);
  });
  return { geometry: g, roof };
}

function is2Cupola(P, x, y, z) {
  // Six-sided, low cast commander's cupola with six separate vision slits.
  const outline = Array.from({ length: 6 }, (_, i) => {
    const angle = (i + 0.5) * Math.PI / 3;
    return [Math.cos(angle) * 0.342, Math.sin(angle) * 0.342];
  });
  P.add('turret', 'paint', T(castLoft(outline, 0.22, 0.88, 0.88), x, y, z));
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const wx = x + Math.cos(a) * 0.285;
    const wz = z + Math.sin(a) * 0.285;
    const yaw = Math.PI / 2 - a;
    P.add('turret', 'dark', box(0.125, 0.065, 0.025, wx, y + 0.135, wz, 0, yaw));
    P.add('turret', 'glass', box(0.088, 0.029, 0.012, wx + Math.cos(a) * 0.017, y + 0.137, wz + Math.sin(a) * 0.017, 0, yaw));
    P.add('turret', 'paintDetail', box(0.147, 0.021, 0.042, wx, y + 0.169, wz, 0, yaw));
  }
  P.add('turret', 'paint', cylY(0.275, 0.045, 24, x, y + 0.225, z));
  K.hatch(P, 'turret', x, y + 0.255, z, 0.215);
}

function is2Mantlet(P) {
  // The cast shield wraps the front of the turret and moves with the gun.
  const sh = new THREE.Shape();
  sh.moveTo(-0.70, -0.19);
  sh.bezierCurveTo(-0.79, -0.03, -0.75, 0.19, -0.58, 0.28);
  sh.bezierCurveTo(-0.34, 0.40, 0.34, 0.40, 0.58, 0.28);
  sh.bezierCurveTo(0.75, 0.19, 0.79, -0.03, 0.70, -0.19);
  sh.bezierCurveTo(0.42, -0.33, -0.42, -0.33, -0.70, -0.19);
  const shield = new THREE.ExtrudeGeometry(sh, {
    depth: 0.23, bevelEnabled: true, bevelSegments: 3,
    steps: 1, bevelSize: 0.046, bevelThickness: 0.048, curveSegments: 14,
  });
  P.add('gun', 'paint', T(shield, 0, 0, -0.17));
  P.add('gun', 'paint', lathe([[0.205, 0.071], [0.222, 0.105], [0.200, 0.158], [0.185, 0.160], [0.172, 0.141]]));
  P.add('gun', 'dark', T(new THREE.TorusGeometry(0.182, 0.009, 6, 32), 0, 0, 0.147));
  for (const [x, y, radius, material] of [[-0.43, 0.075, 0.045, 'dark'], [0.43, 0.105, 0.036, 'glass']]) {
    P.add('gun', 'paintDetail', T(new THREE.TorusGeometry(radius, 0.008, 5, 16), x, y, 0.112));
    P.add('gun', material, cylZ(radius * 0.78, 0.012, 16, x, y, 0.114));
  }
}

function weld(P, part, points, radius, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
  const segments = Math.max(9, Math.ceil(curve.getLength() / 0.045));
  const bead = new THREE.TubeGeometry(curve, segments, radius, 5, closed);
  const vertices = bead.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const center = curve.getPointAt(i / segments);
    const ripple = 1 + Math.sin((closed ? i % segments : i) * 1.91) * 0.16;
    for (let j = 0; j <= 5; j++) {
      const v = i * 6 + j;
      vertices.setXYZ(v, center.x + (vertices.getX(v) - center.x) * ripple,
        center.y + (vertices.getY(v) - center.y) * ripple, center.z + (vertices.getZ(v) - center.z) * ripple);
    }
  }
  bead.computeVertexNormals();
  P.add(part, 'paintDetail', bead);
}

function is2FuelDrum(P, x, y, z, deck) {
  const drum = lathe([[0, -0.442], [0.14, -0.446], [0.174, -0.436], [0.190, -0.41],
    [0.190, 0.41], [0.174, 0.436], [0.14, 0.446], [0, 0.442]], 24);
  P.add('hull', 'paintDetail', T(drum, x, y, z));
  for (const end of [-1, 1]) {
    P.add('hull', 'paintDetail', T(new THREE.TorusGeometry(0.180, 0.009, 5, 20), x, y, z + end * 0.424));
    P.add('hull', 'metal', T(new THREE.TorusGeometry(0.190, 0.009, 5, 20), x, y, z + end * 0.281));
    P.add('hull', 'paintDetail', box(0.20, 0.059, 0.072, x - Math.sign(x) * 0.049, deck + 0.025, z + end * 0.28));
    P.add('hull', 'metal', box(0.036, 0.045, 0.081, x + Math.sign(x) * 0.176, y - 0.048, z + end * 0.28));
    K.bolts(P, 'hull', 'metal', [[x + Math.sign(x) * 0.197, y - 0.048, z + end * 0.28]], 0.013, 0.015, 'x');
  }
  P.add('hull', 'paintDetail', cylY(0.052, 0.031, 14, x, y + 0.193, z + 0.19));
  P.add('hull', 'metal', cylY(0.040, 0.024, 10, x, y + 0.222, z + 0.19));
}

function is2(d) {
  const P = new Parts();
  const hl = d.L / 2, H = d.hullH, c = d.clearance;

  // Six twin road-wheel stations, 550 mm road-wheel diameter, three return
  // rollers, rear drive sprocket and front idler; +z is the bow.
  const g = gear({
    n: 6, z0: -2.05, z1: 2.05, r: 0.275, w: 0.50,
    rollers: [-1.5, 0.0, 1.5], ry: 0.91, rr: 0.085,
    spr: { z: -hl + 0.35, y: 0.76, r: 0.33 },
    idl: { z: hl - 0.32, y: 0.70, r: 0.275 },
  });
  const fy = trackTop(g);

  // 1944 straight glacis: 60 degrees from vertical. The lower nose plate
  // is less steep (30 degrees from vertical), unlike the earlier stepped bow.
  const upperGlacisRun = 1.25;
  const prof = [
    [-hl + 0.20, c],
    [hl - 0.28, c],
    [hl, c + 0.46],
    [hl - upperGlacisRun, H],
    [-hl + 0.72, H],
    [-hl, 1.18],
    [-hl, c + 0.20],
  ];
  const inner = hullShell(P, d, prof, fy, { sideTaper: 0.92, upperW: d.W - 0.40, fender: false });
  torsionArms(P, inner, g, c);
  const bow = glacis(c + 0.46, hl, H, hl - upperGlacisRun);
  const visorHeight = bow.length * 0.75;
  P.add('hull', 'paint', bow.place(box(0.41, 0.126, 0.074), 0, visorHeight, 0.029));
  P.add('hull', 'dark', bow.place(box(0.266, 0.042, 0.017), 0, visorHeight, 0.072));
  P.add('hull', 'glass', bow.place(box(0.204, 0.018, 0.010), 0, visorHeight, 0.082));
  P.add('hull', 'paintDetail', bow.place(box(0.32, 0.026, 0.039), 0, visorHeight + 0.038, 0.077));
  P.add('hull', 'paint', bow.place(cylZ(0.055, 0.052, 18, 0, 0, 0), 0.66, 0.71, 0.025));
  P.add('hull', 'dark', bow.place(cylZ(0.026, 0.017, 14, 0, 0, 0), 0.66, 0.71, 0.056));
  // Seams at the joints of the straight glacis and the rolled upper deck.
  weld(P, 'hull', [bow.point(-0.917, 0.035, 0.019), bow.point(0.917, 0.035, 0.019)], 0.013);
  weld(P, 'hull', [bow.point(-1.20, bow.length - 0.043, 0.023), bow.point(1.20, bow.length - 0.043, 0.023)], 0.012);
  P.add('hull', 'dark', cylY(0.88, 0.037, 40, 0, H + 0.012, d.turretZ));
  P.add('hull', 'paint', cylY(0.91, 0.028, 40, 0, H - 0.004, d.turretZ));

  for (const side of [-1, 1]) {
    const x = side * 1.239;
    const edge = side * 1.514;
    P.add('hull', 'paintDetail', sideExtrude([
      [-3.32, fy - 0.117], [-3.11, fy + 0.018], [3.018, fy + 0.018], [3.31, fy - 0.122],
      [3.30, fy - 0.155], [3.012, fy - 0.015], [-3.105, fy - 0.015], [-3.31, fy - 0.15],
    ], 0.56, x, 0.005));
    P.add('hull', 'paintDetail', box(0.025, 0.056, 6.10, edge, fy - 0.006, -0.047));
    for (const z of [-2.93, -1.39, 0.18, 1.65, 2.97]) {
      P.add('hull', 'paintDetail', box(0.239, 0.038, 0.074, x - side * 0.132, fy + 0.017, z));
      K.boltRow(P, 'hull', [x - side * 0.229, fy + 0.040, z],
        [x + side * 0.223, fy + 0.033, z], 3, 0.014, 'y', 'metal');
    }
    K.periscope(P, 'hull', side * 0.29, H + 0.004, hl - 1.36, 0, 0.64);
    K.headlight(P, 'hull', side * 1.21, fy + 0.136, hl - 0.37, true, 'lens');
    const lead = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 1.21, fy + 0.127, hl - 0.424),
      new THREE.Vector3(side * 1.21, fy + 0.041, hl - 0.455),
      new THREE.Vector3(side * 1.10, fy + 0.022, hl - 0.561),
      new THREE.Vector3(side * 1.02, fy + 0.028, hl - 0.626),
    ]);
    P.add('hull', 'dark', new THREE.TubeGeometry(lead, 10, 0.009, 5));
    P.add('hull', 'paintDetail', bow.place(box(0.19, 0.165, 0.106), side * 0.755, 0.093, 0.058));
    const [eyeX, eyeY, eyeZ] = bow.point(side * 0.755, 0.077, 0.116);
    P.add('hull', 'metal', cylX(0.034, 0.16, 12, eyeX, eyeY, eyeZ));
    P.add('hull', 'metal', T(new THREE.TorusGeometry(0.082, 0.018, 6, 18), eyeX, eyeY - 0.070, eyeZ + 0.011));
    for (const z of [-2.46, -1.425]) is2FuelDrum(P, side * 1.327, fy + 0.202, z, fy);

    K.towCable(P, 'hull', side * 1.182, H + 0.036, -2.43, 1.51, 0.011, 0.017);
    P.add('hull', 'paintDetail', box(0.214, 0.245, 0.086, side * 0.59, 1.246, -hl + 0.105, -0.45));
    const pipe = lathe([[0.053, -0.16], [0.078, -0.16], [0.085, -0.12], [0.078, 0.10], [0.064, 0.13], [0.052, 0.124]], 20);
    P.add('hull', 'metal', T(pipe, side * 0.59, 1.286, -hl + 0.056, 0.36));
    P.add('hull', 'dark', cylZ(0.051, 0.022, 16, side * 0.59, 1.325, -hl - 0.083, 0.052, 0.36));
    P.add('hull', 'paintDetail', box(0.20, 0.143, 0.061, side * 0.84, 0.736, -hl + 0.005));
    P.add('hull', 'metal', T(new THREE.TorusGeometry(0.076, 0.018, 5, 16), side * 0.84, 0.665, -hl - 0.033));
    P.add('hull', 'rubber', box(0.48, 0.23, 0.042, x, fy - 0.174, -3.30, -0.12));
  }
  P.add('hull', 'metal', box(0.242, 0.16, 0.108, -1.113, fy + 0.075, -3.112));
  P.add('hull', 'tail', cylZ(0.049, 0.016, 16, -1.113, fy + 0.075, -3.172));
  K.tools(P, 'hull', 1.20, fy + 0.022, 1.94, 1);
  deckGrilles(P, -1.04, -0.28, H, -hl + 0.79, -hl + 1.66, 10);
  deckGrilles(P, 0.28, 1.04, H, -hl + 0.79, -hl + 1.66, 10);
  P.add('hull', 'paintDetail', box(0.515, 0.039, 0.97, 0, H + 0.013, -2.19));
  K.grabRail(P, 'hull', [-0.114, H + 0.032, -2.43], [0.114, H + 0.032, -2.43], 0.04, 0.012);
  K.boltRow(P, 'hull', [0, H + 0.039, -2.64], [0, H + 0.039, -1.81], 4, 0.016, 'y', 'metal');
  P.add('hull', 'paintDetail', cylY(0.198, 0.044, 24, 0, H + 0.018, -hl + 2.03));
  P.add('hull', 'metal', T(new THREE.TorusGeometry(0.187, 0.013, 5, 24), 0, H + 0.044, -hl + 2.03));
  // Spare track shoes follow the inclined lower strip of the bow.
  for (const x of [-0.45, -0.259, -0.068]) {
    P.add('hull', 'track', bow.place(box(0.168, 0.332, 0.037), x, 0.574, 0.025));
    for (const offset of [-0.096, 0.096]) {
      P.add('hull', 'metal', bow.place(box(0.150, 0.029, 0.028), x, 0.574 + offset, 0.046));
    }
  }
  P.add('hull', 'metal', bow.place(box(0.64, 0.024, 0.037), -0.259, 0.698, 0.054));

  // Asymmetric late-production cast turret: the left wall remains steep while
  // the right wall draws inward toward the roof; the rear bustle is fuller.
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  const turretControl = [
    [-0.65 * tw, 0.814 * tl], [-0.48 * tw, 0.93 * tl], [-0.12 * tw, 0.98 * tl],
    [0.28 * tw, 0.96 * tl], [0.65 * tw, 0.85 * tl], [0.84 * tw, 0.60 * tl],
    [0.91 * tw, 0.28 * tl], [0.90 * tw, -0.25 * tl], [0.77 * tw, -0.67 * tl],
    [0.50 * tw, -0.91 * tl], [0.12 * tw, -1.02 * tl], [-0.34 * tw, -0.99 * tl],
    [-0.66 * tw, -0.82 * tl], [-0.85 * tw, -0.50 * tl], [-0.90 * tw, -0.08 * tl],
    [-0.82 * tw, 0.38 * tl], [-0.70 * tw, 0.66 * tl],
  ];
  const turretCurve = new THREE.CatmullRomCurve3(turretControl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.22);
  const poly = turretCurve.getPoints(96).slice(0, -1).map(v => [v.x, v.z + bz]);
  const turretWallAngles = { left: 4, right: 20 };
  const roofY = th * 0.96;
  const shell = is2CastLoft(poly, roofY, bz, 0, turretWallAngles);
  P.add('turret', 'paint', shell.geometry);
  const roofSeam = shell.roof.filter((_, i) => i % 3 === 0)
    .map(([x, y, z]) => [x * 0.974, y + 0.005, bz + (z - bz) * 0.976]);
  weld(P, 'turret', roofSeam, 0.011, true);

  // Commander's fixed six-slit cupola is on the left rear; the loader's hatch
  // is on the right. DShK sits on the cupola, as on late 1944 production tanks.
  const cupolaX = -0.56, cupolaZ = bz - 0.48, cupolaY = roofY - 0.071;
  is2Cupola(P, cupolaX, cupolaY, cupolaZ);
  K.mg(P, 'turret', cupolaX, cupolaY + 0.35, cupolaZ - 0.048, 0, 'dshk');
  K.hatch(P, 'turret', 0.53, roofY, bz - 0.37, 0.259, { ry: Math.PI / 8 });
  K.periscope(P, 'turret', -0.30, roofY, bz + 0.22, 0, 0.77);
  P.add('turret', 'paintDetail', cylY(0.14, 0.034, 22, 0.085, roofY + 0.012, bz - 0.83));
  P.add('turret', 'metal', T(new THREE.TorusGeometry(0.134, 0.011, 5, 22), 0.085, roofY + 0.026, bz - 0.83, Math.PI / 2));
  K.grabRail(P, 'turret', [-1.098, 0.58, bz - 0.45], [-1.133, 0.58, bz + 0.15], 0.057, 0.015);
  K.grabRail(P, 'turret', [1.008, 0.53, bz - 0.43], [1.038, 0.53, bz + 0.18], 0.055, 0.014);
  K.antenna(P, 'turret', 0.66, roofY - 0.02, bz - 0.73, 1.33);

  // Rear-facing DT ball mount on the right half of the turret bustle.
  const rearMountZ = bz - tl * 0.87;
  P.add('turret', 'paint', T(new THREE.SphereGeometry(1, 20, 14), 0.58, 0.42, rearMountZ, 0, 0, 0, 0.143, 0.135, 0.112));
  P.add('turret', 'metal', cylZ(0.051, 0.053, 18, 0.58, 0.42, rearMountZ - 0.106));
  P.add('turret', 'dark', cylZ(0.019, 0.128, 12, 0.58, 0.42, rearMountZ - 0.174));
  K.liftHooks(P, 'turret', [[-0.78, roofY - 0.015, bz + 0.61], [0.69, roofY - 0.015, bz + 0.57], [0.33, roofY - 0.014, bz - 0.96]]);

  // D-25T 122 mm gun, shaped cast mantlet and double-baffle muzzle brake.
  is2Mantlet(P);
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.15, r1: 0.09, brake: { type: 'double', r: 0.17, len: 0.60, openSides: true } });

  return {
    P, ...g, wheelType: 'steel', cast: 0.42, castTurret: 1.12, castMantlet: 1.06, finishedDetails: true,
    roadWheelDiameter: g.wheels[0].r * 2,
    frontIdlerDiameter: g.idlers[0].r * 2,
    driveSprocketTeeth: 14,
    auxiliaryFuelTanks: 4,
    headlights: 2,
    rearDTMountX: 0.58,
    roadWheelStarIndentations: 12,
    glacisAngleFromVertical: Math.atan2(upperGlacisRun, H - (c + 0.46)) / DEG,
    turretLeftWallAngleFromVertical: turretWallAngles.left,
    turretRightWallAngleFromVertical: turretWallAngles.right,
    turretPos: [0, H + 0.017, d.turretZ], gunPos: [0, 0.46, bz + tl * 0.93],
    gunMountZ: bz + tl * 0.93, gunMountNoCollar: true,
    decals: [],
  };
}
function pershing(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.15, z1: 2.0, r: 0.33, w: 0.48, rollers: [-1.9, -1.0, 0.0, 1.0, 1.9], ry: 0.98, rr: 0.085, spr: { z: -hl + 0.35, y: 0.78, r: 0.33 }, idl: { z: hl - 0.33, y: 0.72, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.25, c], [hl - 0.5, c], [hl, 0.95], [hl - 1.12, H], [-hl + 0.05, H], [-hl, 1.38], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, { upperW: 3.05, lowerBevel: .085 });
  torsionArms(P, inner, g, c);
  P.add('hull', 'paint', T(new THREE.SphereGeometry(0.14, 12, 8), 0.6, 1.35, hl - 0.6)); P.add('hull', 'dark', cylZ(0.02, 0.35, 6, 0.6, 1.4, hl - 0.45));
  for (const s of [-1, 1]) {
    K.headlight(P, 'hull', s * 1.3, fy + 0.12, hl - 0.15, true, 'lens');
    K.hatch(P, 'hull', s * 0.6, H, hl - 1.45, 0.27, { periscope: true });
    P.add('hull', 'paintDetail', sideExtrude([[-hl + .09, fy - .20], [-hl + .48, fy - .068],
      [hl - .59, fy - .068], [hl - .19, fy - .21], [hl - .13, fy - .13],
      [hl - .54, fy + .016], [-hl + .45, fy + .016]], .061, s * (d.W / 2 - .035), .012));
    P.add('hull', 'paintDetail', box(.21,.048,.94,s*1.615,fy+.004,hl-.64));
    P.add('hull', 'metal', box(.164,.043,.15,s*1.476,fy+.041,hl-.39));
    for (const z of [-1.64,-.56,1.13]) P.add('hull', 'paintDetail', box(.193,.10,.075,s*1.619,fy+.036,z));
  }
  for (const s of [-1, 1]) P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.9, c + 0.3, hl - 0.15));
  const bow = glacis(0.95, hl, H, hl - 1.12);
  weld(P, 'hull', [bow.point(-1.19, 0.407, 0.021), bow.point(1.19, 0.407, 0.021)], 0.013);
  for (const side of [-1, 1]) {
    P.add('hull', 'paintDetail', bow.place(box(.23,.17,.085), side*.95, .25, .029));
    P.add('hull', 'metal', T(new THREE.TorusGeometry(.074,.027,6,16), ...bow.point(side*.95,.21,.106), bow.pitch));
  }
  P.add('hull', 'paintDetail', bow.place(box(.47,.17,.069), 0,.19,.034));
  P.add('hull', 'metal', bow.place(cylX(.034,.46,10,0,0,0), 0,.21,.083));
  for (const side of [-1, 1]) {
    for (const z of [-2.32, -0.95, 0.66, 2.48]) {
      P.add('hull', 'paintDetail', box(0.058, 0.132, 0.062, side * (d.W / 2 - 0.014), fy - 0.117, z));
      K.bolts(P, 'hull', 'metal', [[side * (d.W / 2 + 0.011), fy - 0.077, z]], 0.014, 0.014, 'x');
    }
  }
  deckGrilles(P, -1.11, -0.105, H, -hl + 0.35, -hl + 1.75, 12);
  deckGrilles(P, 0.105, 1.11, H, -hl + 0.35, -hl + 1.75, 12);
  for (const x of [-0.80, 0.80]) {
    K.grabRail(P, 'hull', [x - .13, H + .016, -hl + 1.83], [x + .13, H + .016, -hl + 1.83], .042);
  }
  P.add('hull','paint',box(2.2,0.35,0.1,0,1.25,-hl-0.08));
  for(const side of [-1,1])for(let i=0;i<4;i++)P.add('hull','metal',box(0.36,0.022,0.055,side*0.65,1.12+i*0.075,-hl-0.155)); for (const s of [-1, 1]) P.add('hull', 'metal', box(0.5, 0.28, 0.1, s * 0.6, 1.25, -hl - 0.15));
  K.tools(P, 'hull', 0.0, H, -hl + 2.6, 1); K.towCable(P, 'hull', 1.4, fy + 0.04, -2.0, 1.0); K.jerrycans(P, 'hull', -1.45, fy, -2.4, 3, Math.PI / 2);
  K.stowageBox(P, 'hull', -1.4, fy + 0.18, 0.6, 0.45, 0.34, 1.0);
  // cast turret with bustle
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  const castOutline = superEllipse(tw, 1.08, 1.62, 2.56, 64, (x, z) =>
    [x * (z > 0 ? 1 - .17 * z : 1 + .07 * z), z]).map(([x, z]) => [x, z + bz]);
  turretBody(P, castOutline, d.turretH, 0.78, 0.90, bz);
  K.cupola(P, 'turret', 0.55, d.turretH, bz - 0.5, 0.33, 0.26, 6, 'ww2'); K.mg(P, 'turret', 0.55, d.turretH + 0.40, bz - 0.5, 0, 'm2');
  K.hatch(P, 'turret', -0.5, d.turretH, bz - 0.35, 0.27); K.periscope(P, 'turret', -0.45, d.turretH, bz + 0.35, 0, 0.8);
  K.antenna(P, 'turret', -0.8, d.turretH * 0.8, bz - 1.2, 2.2); K.stowageBox(P, 'turret', 0, 0.35, bz - 1.75, 1.6, 0.35, 0.3);
  K.liftHooks(P, 'turret', [[-0.85, d.turretH * 0.8, bz + 0.5], [0.85, d.turretH * 0.8, bz + 0.5]]);
  // M26's large rounded gun shield and coaxial aperture.
  P.add('gun', 'paint', castLoft(superEllipse(0.82, 0.22, 0.22, 2.35, 48), 0.58, 0.98, 0.96, 0.02, -0.29));
  P.add('gun', 'paint', cylZ(0.22, 0.22, 24, 0, 0, 0.22));
  for (const [x, r] of [[.43, .028], [-.43, .038]]) {
    P.add('gun', 'paintDetail', cylZ(r + .028, .068, 16, x, .08, .218));
    P.add('gun', 'dark', cylZ(r, .015, 16, x, .08, .257));
  }
  // Standard M26 90 mm M3 uses the large double-baffle muzzle brake (not the M26A1 single-baffle type).
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.075, brake: { type: 'double', r: 0.14, len: 0.42 } });
  return { P, ...g, wheelType: 'disc', cast: 0.48, castTurret: .95, castMantlet: .83,
    finish: { roughness: .74, abrasion: .20, primer: '#625340' },
    turretPos: [0, H, d.turretZ], gunPos: [0, 0.30, bz + 1.12],
    decals: decalsSide('usstar', '', 'turret', tw * 0.88, .31, bz - .15, .43).map(mark => ({ ...mark, projectDepth: .27 })) };
}

// ---------------- Cold War ----------------
function centurion(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const zs = [-2.35, -1.7, -0.45, 0.2, 1.45, 2.1];
  const g = gear({ n: 6, zs, r: 0.31, w: 0.46, rollers: [-2.6, -1.6, -0.6, 0.4, 1.4, 2.4], ry: 1.02, rr: 0.08, spr: { z: -hl + 0.42, y: 0.8, r: 0.36 }, idl: { z: hl - 0.42, y: 0.74, r: 0.33 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.3, c], [hl - 0.9, c], [hl - 0.05, 0.98], [hl - 1.15, H], [-hl + 0.1, H], [-hl, 1.45], [-hl, c + 0.3]];
  const inner = hullShell(P, d, prof, fy, { upperW: d.W - 2 * d.trackW + 0.3 });
  // Horstmann bogies (pairs of wheels on one coil-sprung unit)
  for (const side of [-1, 1]) for (let i = 0; i < zs.length; i += 2) {
    const z = (zs[i] + zs[i + 1]) / 2;
    const x = side * (inner / 2 + .115);
    const axleHeight = g.wheels[i].y;
    P.add('hull', 'paintDetail', sideExtrude([[z-.39,.70],[z-.26,.83],[z+.26,.83],
      [z+.39,.70],[z+.24,.53],[z-.24,.53]], .16, x, .023));
    for (const end of [-1, 1]) {
      P.add('hull', 'metal', box(.17,.116,.32,x,axleHeight+.095,z+end*.22,-end*.42));
      P.add('hull', 'paintDetail', cylX(.09,.14,14,x+side*.085,axleHeight+.16,z+end*.24));
      P.add('hull', 'metal', cylX(.034,.035,8,x+side*.16,axleHeight+.16,z+end*.24));
      P.add('hull', 'steel', cylZ(.071,.062,12,x+side*.093,.64,z+end*.234));
    }
    P.add('hull', 'dark', cylZ(.055,.56,12,x+side*.093,.64,z));
  }
  // bazooka plates, track-guard bins
  for (const s of [-1, 1]) {
    const x = s * (d.W / 2 - .035), start = -hl + .45, length = (d.L - 1) / 5;
    for (let i = 0; i < 5; i++) {
      const a = start + i * length + .011, b = a + length - .026;
      const top = fy + .02, bottom = fy - .45;
      P.add('hull', 'paint', sideExtrude([[a,top],[b,top],[b,bottom+.07],[b-.12,bottom],
        [a+.11,bottom],[a,bottom+.085]], .033, x, .008));
      for (const z of [a+.16,b-.16]) P.add('hull', 'metal', cylZ(.022,.14,8,x+s*.022,top-.044,z));
    }
    for (const z of [-1.9, -0.6, 0.7]) K.stowageBox(P, 'hull', s * (d.W / 2 - 0.3), fy + 0.25, z, 0.5, 0.46, 1.15);
    K.headlight(P, 'hull', s * 1.2, fy + 0.15, hl - 0.25, true, 'lens');
  }
  K.tools(P, 'hull', 1.2, fy + 0.5, 1.7, 1); K.towCable(P, 'hull', -1.25, fy + 0.52, -2.4, 1.2);
  deckGrilles(P, -0.95, 0.95, H, -hl + 0.4, -hl + 2.2, 10); K.hatchRect(P, 'hull', 0.6, H, hl - 1.6, 0.55, 0.5);
  K.periscope(P, 'hull', 0.6, H, hl - 1.25, 0);
  const bow = glacis(.98, hl - .05, H, hl - 1.15);
  const chin = bow.point(0,.305,.036);
  P.add('hull', 'paintDetail', bow.place(box(.61,.183,.061), 0,.305,.021));
  P.add('hull', 'dark', bow.place(box(.46,.125,.043),0,.30,.061));
  P.add('hull', 'metal', cylX(.033,.44,10,chin[0],chin[1]+.018,chin[2]+.065));
  for (const side of [-1, 1]) {
    P.add('hull', 'metal', T(new THREE.TorusGeometry(.076,.025,6,16), ...bow.point(side*.99,.235,.092),bow.pitch));
    K.bolts(P, 'hull', 'metal', [bow.point(side*.40,.204,.062),bow.point(side*.40,.387,.062)], .016,.02,'z');
  }
  for (const s of [-1, 1]) K.exhaust(P, 'hull', s * 0.6, 1.25, -hl - 0.1, 'ww2', 0.09, 0.4);
  // cast/welded turret with side bins and rear basket
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  const turretOutline = superEllipse(tw*.95,1.35,1.60,3.1,64,(x,z) =>
    [x * (z > .18 ? 1 - (z - .18)*.22 : 1),z]).map(([x,z]) => [x,z + bz]);
  turretBody(P, turretOutline, d.turretH, .86, .93, bz);
  for (const s of [-1, 1]) { K.stowageBox(P, 'turret', s * (tw * 0.92 + 0.05), 0.38, bz - 0.3, 0.26, 0.5, 1.7); K.smokeDischargers(P, 'turret', s * 0.95, 0.72, bz + 1.1, s * 0.7, 6, 0.08, 0.2, 0.035); }
  for (let i = 0; i < 6; i++) P.add('turret', 'metal', box(0.02, 0.4, 0.02, -1.0 + i * 0.4, 0.35, bz - 1.75)); P.add('turret', 'metal', box(2.05, 0.03, 0.4, 0, 0.16, bz - 1.6)); P.add('turret', 'metal', box(2.05, 0.03, 0.03, 0, 0.55, bz - 1.78));
  bustleRoll(P, 0, .31, bz - 1.66, 1.58, .133);
  K.cupola(P, 'turret', 0.55, d.turretH, bz - 0.3, 0.36, 0.25, 8, 'modern'); K.mg(P, 'turret', 0.55, d.turretH + 0.45, bz - 0.3, 0, 'mag');
  K.hatch(P, 'turret', -0.55, d.turretH, bz - 0.25, 0.3); K.antenna(P, 'turret', -0.9, d.turretH * 0.8, bz - 1.0); K.antenna(P, 'turret', 0.95, d.turretH * 0.8, bz - 1.05, 1.6);
  P.add('gun', 'paint', box(0.72, 0.52, 0.28, 0, 0, 0.02));
  P.add('gun', 'canvas', lathe([[0.244, 0.125], [0.232, 0.185], [0.246, 0.218], [0.209, 0.263],
    [0.225, 0.303], [0.196, 0.36], [0.211, 0.409], [0.169, 0.466], [0.152, 0.494]], 22));
  P.add('gun', 'metal', T(new THREE.TorusGeometry(0.162, 0.011, 5, 24), 0, 0, 0.478));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.074, evac: { z: 2.9, r: 0.14, len: 0.75 } });
  return { P, ...g, wheelType: 'disc', cast: 0.32, castTurret: .91, castMantlet: .42,
    finish: { roughness: .79, abrasion: .21, primer: '#605a43' },
    turretPos: [0, H, d.turretZ], gunPos: [0, 0.4, bz + 1.45], decals: decalsSide('text', '31', 'turret', tw * 0.92 + 0.19, 0.42, bz - 0.3, 0.42) };
}

function leo1(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 7, z0: -2.55, z1: 2.35, r: 0.35, w: 0.45, rollers: [-2.0, -0.7, 0.6, 1.8], ry: 1.0, spr: { z: -hl + 0.38, y: 0.72, r: 0.33 }, idl: { z: hl - 0.33, y: 0.66, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.3, c], [hl - 0.75, c], [hl - 0.05, 0.95], [hl - 0.95, H - 0.04], [hl - 1.05, H], [-hl + 0.1, H], [-hl, H - 0.2], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 - 0.022), fy + 0.03, -hl + 0.35, hl - 0.4, 0.48, 7, 0.025, 0, 'rubber');
    K.headlight(P, 'hull', s * 1.35, H - 0.1, hl - 0.9, true, 'lens'); P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.9, c + 0.3, hl - 0.6));
    deckGrilles(P, s * 0.4, s * 1.5, H, -hl + 0.3, -hl + 1.9, 10);
    const x = s * (d.W / 2 - .003), y = (fy + H) / 2, z = -hl + .79;
    P.add('hull', 'paintDetail', box(.063,.29,1.03,x,y,z));
    P.add('hull', 'dark', box(.025,.228,.936,x+s*.04,y,z));
    for (let i = 0; i < 6; i++) P.add('hull', 'metal', box(.043,.018,.918,x+s*.055,y+(i-2.5)*.036,z,0,0,s*.38));
    for (const dz of [-.23,.23]) P.add('hull', 'paintDetail', box(.032,.229,.018,x+s*.077,y,z+dz));
  }
  K.tools(P, 'hull', -0.2, H, -hl + 2.7, 1); K.towCable(P, 'hull', 0.0, H + 0.03, hl - 2.2, hl - 1.15);
  K.hatchRect(P, 'hull', -0.65, H, hl - 1.3, 0.55, 0.5); for (let i = 0; i < 3; i++) K.periscope(P, 'hull', -0.85 + i * 0.2, H, hl - 1.0, 0, 0.7);
  // The 1A5 uses a cast turret with spaced add-on panels on stand-offs.
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  const castOutline = superEllipse(tw, tl * .935, tl, 2.8, 64, (x, z) =>
    [x * (z > 0 ? 1 - .13 * z : 1), z]).map(([x, z]) => [x, z + bz]);
  turretBody(P, castOutline, d.turretH, .82, .91, bz);
  for (const side of [-1, 1]) {
    const x = side * (tw + .073);
    for (const [a, b] of [[-1.38,-.27],[-.22,.72]]) {
      const profile = [[bz+a,.29],[bz+a+.11,.23],[bz+b-.09,.22],[bz+b,.31],
        [bz+b-.13,.65],[bz+a+.11,.65]];
      P.add('turret', 'paint', sideExtrude(profile, .052, 0, .012).rotateZ(side*.17).translate(x,0,0));
      for (const z of [a+.19,b-.25]) {
        P.add('turret', 'dark', box(.18,.079,.099,side*(tw-.015),.455,bz+z));
        P.add('turret', 'metal', cylX(.017,.021,8,x-side*.057,.463,bz+z));
      }
    }
    K.smokeDischargers(P, 'turret', side * (tw - .05), d.turretH * .85, bz - .6, side*Math.PI/2, 4, .1, .22, .04);
  }
  P.add('turret', 'paint', box(0.55, 0.35, 0.65, -0.65, d.turretH + 0.17, bz + 0.9)); sightWindow(P, 0.4, 0.2, -0.65, d.turretH + 0.2, bz + 1.23); // EMES 18
  P.add('turret', 'paint', cylY(0.2, 0.3, 12, 0.55, d.turretH + 0.15, bz + 0.2)); P.add('turret', 'paint', box(0.32, 0.25, 0.35, 0.55, d.turretH + 0.42, bz + 0.2)); sightWindow(P, 0.22, 0.12, 0.55, d.turretH + 0.44, bz + 0.38); // PERI R12
  K.hatch(P, 'turret', 0.6, d.turretH, bz - 0.4, 0.3); K.hatch(P, 'turret', -0.6, d.turretH, bz - 0.35, 0.3); K.mg(P, 'turret', -0.6, d.turretH + 0.3, bz - 0.1, 0, 'mag');
  for (let i = 0; i < 5; i++) P.add('turret', 'metal', box(.023,.35,.026,-.9+i*.45,.341,bz-tl-.34));
  P.add('turret', 'metal', box(1.88,.028,.40,0,.16,bz-tl-.18));
  P.add('turret', 'metal', box(1.88,.026,.031,0,.518,bz-tl-.34));
  bustleRoll(P, -.08, .303, bz-tl-.183, 1.44, .132);
  K.antenna(P, 'turret', -1.0, d.turretH, bz - 1.2); K.antenna(P, 'turret', 1.0, d.turretH, bz - 1.25, 1.6);
  P.add('gun', 'paint', box(0.55, 0.5, 0.45, 0, 0, 0.0)); P.add('gun', 'rubber', cylZ(0.2, 0.25, 12, 0, 0, 0.3));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.072, evac: { z: 2.3, r: 0.13, len: 0.7 }, sleeve: 5 });
  return { P, ...g, wheelType: 'modern', cast: .24, castTurret: .78, castMantlet: .47,
    finish: { roughness: .76, abrasion: .17, primer: '#666052' },
    turretPos: [0, H, d.turretZ], gunPos: [0, .4, bz + tl - .1],
    decals: [...decalsSide('cross', '', 'hull', d.W / 2 + .005, fy - .17, 1.8, .30),
      ...decalsSide('cross', '', 'turret', tw + .03, .42, bz - .90, .32).map(mark => ({ ...mark, projectDepth: .20 }))] };
}

// ---------------- Modern ----------------
function leo2a6(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 7, z0: -2.75, z1: 2.6, r: 0.35, w: 0.5, rollers: [-2.2, -0.8, 0.6, 2.0], ry: 1.03, spr: { z: -hl + 0.42, y: 0.72, r: 0.34 }, idl: { z: hl - 0.38, y: 0.68, r: 0.32 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.35, c], [hl - 0.7, c], [hl, 0.98], [hl - 1.75, H], [-hl + 0.1, H], [-hl, H - 0.15], [-hl, c + 0.25]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    const edge = s * (d.W / 2);
    P.add('hull', 'paint', box(0.13, 0.66, 1.75, edge - s * 0.065, fy - 0.28, hl - 1.15));
    K.boltRow(P, 'hull', [edge, fy - 0.1, hl - 1.9], [edge, fy - 0.1, hl - 0.4], 5, 0.02, 'x');
    K.skirt(P, edge - s * 0.038, fy + 0.03, -hl + 0.3, hl - 2.05, 0.55, 5, 0.05);
    K.headlight(P, 'hull', s * 1.45, H - 0.05, hl - 1.6, true, 'lens'); P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 1.0, c + 0.35, hl - 0.5));
    deckGrilles(P, s * 0.3, s * 1.6, H, -hl + 0.3, -hl + 2.2, 12);
    K.stowageBox(P, 'hull', s * 1.3, H - 0.3, -hl + 0.12, 0.8, 0.4, 0.22);
  }
  K.towCable(P, 'hull', 0.0, H - 0.25, hl - 1.5, hl - 0.4); K.tools(P, 'hull', 0.0, H, -hl + 2.9, 1);
  K.hatchRect(P, 'hull', -0.7, H, hl - 1.95, 0.6, 0.55); for (let i = 0; i < 3; i++) K.periscope(P, 'hull', -0.9 + i * 0.2, H, hl - 1.75, 0, 0.7);
  // turret: box body + arrowhead spaced wedge add-on
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0; const th = d.turretH;
  turretBody(P, [[1.15, bz + tl - 0.85], [tw, bz + tl - 1.35], [tw, bz - tl + 0.4], [tw - 0.12, bz - tl], [-tw + 0.12, bz - tl], [-tw, bz - tl + 0.4], [-tw, bz + tl - 1.35], [-1.15, bz + tl - 0.85]], th, 0.94, 0.97, bz);
  for (const s of [-1, 1]) {
    const w = [[s * 0.42, bz + tl - 0.8], [s * tw, bz + tl - 1.35], [s * 0.42, bz + tl]]; if (s < 0) w.reverse();
    P.add('turret', 'paint', taper(topExtrude(w, th * 0.86, 0.04, 0.02, 1), 0.04, th * 0.9, 1, 0.96, bz + tl - 0.9));
    const y = 0.04 + th * 0.86 - 0.005;
    K.boltRow(P, 'turret', [s * 0.55, y, bz + tl - 0.21], [s * (tw - 0.17), y, bz + tl - 1.30], 5, 0.015, 'y', 'metal');
    K.smokeDischargers(P, 'turret', s * (tw - 0.1), th + 0.05, bz - 1.0, s * Math.PI / 2, 4, 0.11, 0.22, 0.04);
    for (let i = 0; i < 4; i++) P.add('turret', 'metal', box(0.02, 0.35, 0.02, s * (tw + 0.1), th * 0.55, bz - 1.9 + i * 0.4)); P.add('turret', 'canvas', box(0.18, 0.32, 1.3, s * (tw + 0.08), th * 0.5, bz - 1.35));
  }
  P.add('turret', 'paint', box(0.6, 0.42, 0.8, -0.85, th + 0.21, bz + 1.0)); sightWindow(P, 0.45, 0.25, -0.85, th + 0.25, bz + 1.41); // EMES 15 doghouse
  P.add('turret', 'paint', cylY(0.22, 0.35, 14, 0.7, th + 0.17, bz - 0.15)); P.add('turret', 'paint', box(0.38, 0.32, 0.42, 0.7, th + 0.5, bz - 0.15)); sightWindow(P, 0.28, 0.16, 0.7, th + 0.52, bz + 0.07); // PERI R17
  K.hatch(P, 'turret', 0.75, th, bz - 0.75, 0.32, { periscope: true }); K.hatch(P, 'turret', -0.75, th, bz - 0.65, 0.32); K.mg(P, 'turret', -0.75, th + 0.3, bz - 0.35, 0, 'mag');
  for (let i = 0; i < 5; i++) P.add('turret', 'metal', box(0.02, 0.4, 0.02, -1.4 + i * 0.7, th * 0.55, bz - tl - 0.4)); P.add('turret', 'metal', box(2.9, 0.03, 0.45, 0, 0.12, bz - tl - 0.2)); P.add('turret', 'canvas', box(2.4, 0.32, 0.36, 0, 0.32, bz - tl - 0.2));
  K.antenna(P, 'turret', -1.4, th, bz - 1.75, 2.4); K.antenna(P, 'turret', 1.4, th, bz - 1.75, 1.8);
  K.liftHooks(P, 'turret', [[-1.3, th, bz + 0.3], [1.3, th, bz + 0.3]]);
  P.add('gun', 'paint', box(0.55, 0.62, 0.6, 0, 0, -0.05)); P.add('gun', 'dark', box(0.42, 0.5, 0.05, 0, 0, 0.26));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.13, r1: 0.076, evac: { z: 2.5, r: 0.145, len: 0.85 }, sleeve: 6, mrs: true });
  return { P, ...g, wheelType: 'modern', cast: 0.15, castTurret: 0.15, turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, bz + tl - 0.55], decals: [...decalsSide('cross', '', 'turret', tw + 0.24, 0.45, bz - 0.4, 0.35)] };
}

function eraBlocks(P, part, o, u, v, nu, nv, su, sv, t) { K.eraGrid(P, part, o, u, v, nu, nv, su, sv, t, 0.02); }
// ERA bricks on a vertical side plane at x, running rearward from z (normal points outward on side s)
function sideEra(P, part, s, x, y, z, nu, nv, su, sv, t) { if (s > 0) K.eraGrid(P, part, [x, y, z], [0, 0, -1], [0, 1, 0], nu, nv, su, sv, t, 0.02); else K.eraGrid(P, part, [x, y, z - nu * su], [0, 0, 1], [0, 1, 0], nu, nv, su, sv, t, 0.02); }
function slopeV(dz, dy) { const l = Math.hypot(dz, dy); return [0, dy / l, -dz / l]; }

function t90m(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.55, z1: 2.1, r: 0.375, w: 0.46, rollers: [-1.6, 0.0, 1.5], ry: 0.98, rr: 0.075, spr: { z: -hl + 0.3, y: 0.62, r: 0.33 }, idl: { z: hl - 0.5, y: 0.56, r: 0.31 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.1, c], [hl - 0.35, c], [hl, 0.62], [hl - 0.02, 0.92], [hl - 1.5, H], [-hl + 0.1, H], [-hl, 1.2]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  // Relikt ERA on the glacis and skirts
  eraBlocks(P, 'hull', [-1.3, 0.94, hl - 0.06], [1, 0, 0], slopeV(1.46, 0.56), 9, 3, 0.29, 0.5, 0.08);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 - 0.028), fy + 0.03, -hl + 0.3, hl - 2.2, 0.55, 4, 0.03, 0, 'rubber');
    sideEra(P, 'hull', s, s * (d.W / 2 - 0.10), fy - 0.6, hl - 0.25, 4, 2, 0.48, 0.3, 0.09);
    P.add('hull', 'paintDetail', cylX(0.29, 0.9, 24, s * 0.62, 1.15, -hl - 0.12));
    for (const end of [-1, 1]) {
      P.add('hull', 'metal', T(new THREE.TorusGeometry(0.291, 0.012, 5, 24), s * 0.62 + end * 0.31, 1.15, -hl - 0.12, 0, Math.PI / 2));
    }
    for (let i = 0; i < 3; i++) K.stowageBox(P, 'hull', s * (d.W / 2 - 0.3), fy + 0.2, 0.9 - i * 1.0, 0.5, 0.36, 0.9);
    K.headlight(P, 'hull', s * 1.4, fy + 0.15, hl - 0.4, true, 'lens');
  }
  P.add('hull', 'wood', cylX(0.14, 2.6, 10, 0, 1.62, -hl + 0.1)); deckGrilles(P, -1.1, 1.1, H, -hl + 0.4, -hl + 2.0, 9);
  K.towCable(P, 'hull', 0, 1.0, hl - 0.15, hl - 0.15 + 0.001, 0); K.periscope(P, 'hull', 0, H, hl - 1.25, 0, 0.9);
  // welded turret with Relikt wedges, bustle + slat cage
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  turretBody(P, [[0.55, bz + tl - 0.2], [tw, bz + tl - 0.95], [tw, bz - tl + 0.65], [tw - 0.25, bz - tl + 0.35], [-tw + 0.25, bz - tl + 0.35], [-tw, bz - tl + 0.65], [-tw, bz + tl - 0.95], [-0.55, bz + tl - 0.2]], th, 0.9, 0.95, bz);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4; const x = s * (0.55 + (tw - 0.55) * t), z = bz + tl - 0.2 - 0.75 * t; P.add('turret', 'paint', box(0.34, 0.1, 0.42, x, th + 0.05, z - 0.12, 0, s * 0.96)); P.add('turret', 'paint', box(0.34, th * 0.8, 0.12, x, th * 0.45, z + 0.04, 0, s * 0.96)); }
    for (let i = 0; i < 2; i++) sideEra(P, 'turret', s, s * (tw + 0.02), 0.1 + i * 0.32, bz + tl - 0.95, 3, 1, 0.42, 0.3, 0.09);
    K.smokeDischargers(P, 'turret', s * (tw - 0.2), th + 0.08, bz + tl - 1.15, s * 0.9, 6, 0.09, 0.22, 0.04);
  }
  P.add('turret', 'paint', box(2.2, th * 0.8, 0.7, 0, th * 0.42, bz - tl + 0.05));
  K.slatCage(P, 'turret', -1.45, 1.45, 0.05, th + 0.05, bz - tl - 0.45, 12); for (const s of [-1, 1]) P.add('turret', 'metal', box(0.04, 0.04, 0.6, s * 1.45, th, bz - tl - 0.15));
  P.add('turret', 'paint', box(0.48, 0.4, 0.5, 0.55, th + 0.2, bz - 0.2)); sightWindow(P, 0.3, 0.2, 0.55, th + 0.22, bz + 0.06); // commander sight
  P.add('turret', 'paint', box(0.55, 0.45, 0.4, -0.75, th + 0.22, bz + 0.6)); sightWindow(P, 0.36, 0.22, -0.75, th + 0.24, bz + 0.81); // gunner sight
  P.add('turret', 'paint', cylY(0.33, 0.12, 16, 0.5, th + 0.06, bz - 0.85)); P.add('turret', 'paint', box(0.3, 0.3, 0.45, 0.5, th + 0.35, bz - 0.85)); K.mg(P, 'turret', 0.5, th + 0.45, bz - 0.7, 0, 'dshk'); // Kord RWS
  K.hatch(P, 'turret', -0.5, th, bz - 0.7, 0.28); K.antenna(P, 'turret', -1.1, th, bz - 1.2, 2.2);
  P.add('gun', 'paint', box(0.62, 0.5, 0.3, 0, 0, 0)); P.add('gun', 'rubber', cylZ(0.2, 0.3, 12, 0, 0, 0.28));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.135, r1: 0.085, evac: { z: 3.6, r: 0.14, len: 0.5 }, sleeve: 5 });
  return { P, ...g, wheelType: 'disc', cast: 0.2, castTurret: 0.25, turretPos: [0, H, d.turretZ], gunPos: [0, 0.34, bz + tl - 0.25], decals: decalsSide('text', '102', 'turret', tw - 0.2 + 0.04, th * 0.42, bz - tl + 0.4, 0.45).map((x) => ({ ...x, pos: [x.pos[0] > 0 ? 1.14 : -1.14, x.pos[1], x.pos[2]] })) };
}

function chally2(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.95, z1: 2.7, r: 0.38, w: 0.5, rollers: [-2.3, -0.8, 0.7, 2.1], ry: 1.06, spr: { z: -hl + 0.45, y: 0.75, r: 0.36 }, idl: { z: hl - 0.45, y: 0.7, r: 0.33 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.4, c], [hl - 0.9, c], [hl - 0.05, 0.95], [hl - 0.1, 1.05], [hl - 1.6, H], [-hl + 0.1, H], [-hl, H - 0.2], [-hl + 0.1, c + 0.2]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 - 0.077), fy + 0.04, -hl + 0.5, hl - 0.6, 0.6, 7, 0.11); // Dorchester side armour
    K.headlight(P, 'hull', s * 1.3, H - 0.25, hl - 0.75, true, 'lens'); P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.95, c + 0.3, hl - 0.55));
    deckGrilles(P, s * 0.25, s * 1.55, H, -hl + 0.35, -hl + 2.3, 12);
    K.stowageBox(P, 'hull', s * 1.25, H - 0.35, -hl + 0.12, 0.8, 0.45, 0.22);
  }
  K.towCable(P, 'hull', -0.8, H + 0.03, -2.0, 0.9); K.tools(P, 'hull', 0.8, H, -hl + 2.8, 1);
  K.hatchRect(P, 'hull', 0, H, hl - 1.85, 0.6, 0.55); K.periscope(P, 'hull', 0, H, hl - 1.6, 0, 0.9);
  // slab-sided Chobham turret with high bustle
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  turretBody(P, [[1.05, bz + tl], [tw, bz + tl - 0.75], [tw, bz - tl], [-tw, bz - tl], [-tw, bz + tl - 0.75], [-1.05, bz + tl]], th, 0.95, 0.97, bz);
  for (const side of [-1, 1]) {
    P.add('turret', 'rubber', box(0.26, 0.012, 0.85, side * tw * 0.74, th + 0.006, bz - 0.94));
    for (const z of [bz - 0.64, bz - 1.24]) P.add('turret', 'paintDetail', box(0.30, 0.021, 0.026, side * tw * 0.74, th + 0.012, z));
  }
  for (const s of [-1, 1]) {
    K.smokeDischargers(P, 'turret', s * 1.15, th + 0.06, bz + tl - 0.55, s * 0.6, 5, 0.09, 0.22, 0.04);
    for (const z of [bz - 0.4, bz - 1.2]) K.stowageBox(P, 'turret', s * (tw * 0.95 + 0.15), th * 0.5, z, 0.25, th * 0.75, 0.75);
    K.jerrycans(P, 'turret', s * 1.1, 0.05, bz - tl - 0.25, 2, 0);
  }
  for (let i = 0; i < 5; i++) P.add('turret', 'metal', box(0.02, 0.4, 0.02, -1.4 + i * 0.7, th * 0.55, bz - tl - 0.4)); P.add('turret', 'metal', box(2.9, 0.03, 0.42, 0, 0.12, bz - tl - 0.2));
  P.add('turret', 'paint', cylY(0.22, 0.42, 14, 0.75, th + 0.2, bz - 0.1)); P.add('turret', 'paint', T(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.75, th + 0.4, bz - 0.1)); sightWindow(P, 0.2, 0.15, 0.75, th + 0.5, bz + 0.15); // VS580 commander sight
  P.add('turret', 'paint', box(0.5, 0.35, 0.45, -0.85, th + 0.17, bz + 1.4)); sightWindow(P, 0.36, 0.18, -0.85, th + 0.2, bz + 1.63);
  K.cupola(P, 'turret', 0.65, th, bz - 0.75, 0.36, 0.2, 8, 'modern'); K.hatch(P, 'turret', -0.7, th, bz - 0.6, 0.3); K.mg(P, 'turret', -0.7, th + 0.32, bz - 0.3, 0, 'mag');
  K.antenna(P, 'turret', -1.5, th, bz - 1.9, 2.4); K.antenna(P, 'turret', 1.5, th, bz - 1.9, 2.0);
  P.add('gun', 'paint', box(0.6, 0.55, 0.35, 0, 0, 0)); P.add('gun', 'canvas', cylZ(0.24, 0.35, 12, 0, 0, 0.32, 0.17));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.13, r1: 0.085, evac: { z: 2.7, r: 0.15, len: 1.0 }, sleeve: 6, mrs: true });
  return { P, ...g, wheelType: 'modern', cast: 0.15, castTurret: 0.1, turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, bz + tl - 0.1], decals: decalsSide('text', '11B', 'turret', tw * 0.95 + 0.3, th * 0.5, bz - 0.8, 0.38) };
}

function type99a(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.65, z1: 2.5, r: 0.38, w: 0.48, rollers: [-1.9, -0.3, 1.3], ry: 1.03, rr: 0.08, spr: { z: -hl + 0.42, y: 0.7, r: 0.34 }, idl: { z: hl - 0.42, y: 0.66, r: 0.32 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.2, c], [hl - 0.45, c], [hl, 0.68], [hl - 0.02, 0.95], [hl - 1.6, H], [-hl + 0.1, H], [-hl, H - 0.25], [-hl + 0.05, c + 0.2]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  eraBlocks(P, 'hull', [-1.25, 0.97, hl - 0.06], [1, 0, 0], slopeV(1.58, 0.6), 8, 3, 0.31, 0.55, 0.09);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 - 0.039), fy + 0.04, -hl + 0.35, hl - 0.4, 0.58, 7, 0.05);
    sideEra(P, 'hull', s, s * (d.W / 2 - 0.08), fy - 0.5, hl - 0.4, 4, 1, 0.5, 0.45, 0.07);
    K.headlight(P, 'hull', s * 1.35, H - 0.05, hl - 1.35, true, 'lens');
    deckGrilles(P, s * 0.3, s * 1.55, H, -hl + 0.35, -hl + 2.1, 11);
    K.stowageBox(P, 'hull', s * (d.W / 2 - 0.3), fy + 0.2, -0.4, 0.5, 0.35, 1.2);
  }
  K.towCable(P, 'hull', 0, H + 0.03, -1.5, 0.8); K.hatchRect(P, 'hull', 0, H, hl - 1.75, 0.6, 0.5); K.periscope(P, 'hull', 0, H, hl - 1.5, 0, 0.9);
  // arrow-head turret
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  turretBody(P, [[1.0, bz + tl - 0.7], [tw, bz + tl - 1.2], [tw, bz - tl + 0.35], [tw - 0.2, bz - tl], [-tw + 0.2, bz - tl], [-tw, bz - tl + 0.35], [-tw, bz + tl - 1.2], [-1.0, bz + tl - 0.7]], th, 0.92, 0.96, bz);
  for (const s of [-1, 1]) {
    const w = [[s * 0.4, bz + tl - 0.7], [s * tw, bz + tl - 1.2], [s * 0.4, bz + tl]]; if (s < 0) w.reverse();
    P.add('turret', 'paint', taper(topExtrude(w, th * 0.85, 0.03, 0.02, 1), 0.03, th * 0.88, 1, 0.95, bz + tl - 0.8));
    for (let i = 0; i < 4; i++) { const t = i / 4 + 0.12; P.add('turret', 'paint', box(0.32, 0.08, 0.28, s * (0.4 + (tw - 0.4) * t), th * 0.88 + 0.04, bz + tl - 0.7 * t - 0.15 - 0.5 * (1 - t) * 0)); }
    K.smokeDischargers(P, 'turret', s * (tw - 0.15), th + 0.06, bz - 0.2, s * 1.2, 5, 0.1, 0.22, 0.04);
    P.add('turret', 'dark', box(0.18, 0.22, 0.12, s * 1.2, th + 0.11, bz - 1.4)); sightWindow(P, 0.12, 0.08, s * 1.2, th + 0.14, bz - 1.33); // laser warning / dazzler
  }
  P.add('turret', 'paint', cylY(0.2, 0.35, 12, 0.65, th + 0.17, bz - 0.4)); P.add('turret', 'paint', box(0.36, 0.3, 0.4, 0.65, th + 0.48, bz - 0.4)); sightWindow(P, 0.26, 0.15, 0.65, th + 0.5, bz - 0.19);
  P.add('turret', 'paint', box(0.55, 0.38, 0.45, -0.85, th + 0.19, bz + 0.6)); sightWindow(P, 0.4, 0.2, -0.85, th + 0.22, bz + 0.83);
  K.hatch(P, 'turret', -0.6, th, bz - 0.7, 0.3); K.mg(P, 'turret', -0.6, th + 0.3, bz - 0.45, 0, 'dshk'); K.hatch(P, 'turret', 0.65, th, bz - 1.05, 0.3);
  for (let i = 0; i < 4; i++) P.add('turret', 'metal', box(0.02, 0.35, 0.02, -1.2 + i * 0.8, th * 0.55, bz - tl - 0.35)); P.add('turret', 'metal', box(2.5, 0.03, 0.4, 0, 0.12, bz - tl - 0.18));
  K.antenna(P, 'turret', -1.3, th, bz - 1.5, 2.3);
  P.add('gun', 'paint', box(0.55, 0.5, 0.35, 0, 0, 0)); P.add('gun', 'rubber', cylZ(0.2, 0.3, 12, 0, 0, 0.3));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.135, r1: 0.085, evac: { z: 3.2, r: 0.145, len: 0.65 }, sleeve: 5 });
  return { P, ...g, wheelType: 'disc', cast: 0.2, castTurret: 0.15, turretPos: [0, H, d.turretZ], gunPos: [0, 0.36, bz + tl - 0.35], decals: decalsSide('redstar', '', 'turret', tw * 0.94 + 0.04, th * 0.45, bz - 0.6, 0.45) };
}

function merkava4(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.7, z1: 2.5, r: 0.37, w: 0.5, rollers: [-2.0, -0.6, 0.8, 2.2], ry: 1.05, spr: { z: hl - 0.42, y: 0.82, r: 0.37 }, idl: { z: -hl + 0.45, y: 0.7, r: 0.33 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.15, c], [hl - 0.8, c], [hl - 0.05, 0.98], [hl - 2.35, H], [-hl + 0.05, H], [-hl, H - 0.1], [-hl, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  for (const s of [-1, 1]) for (const w of g.wheels) P.add('hull', 'metal', cylY(0.07, 0.38, 8, s * (inner / 2 + 0.12), w.y + 0.3, w.z + 0.25)); // coil springs
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 + 0.06), fy + 0.04, -hl + 0.3, hl - 0.45, 0.62, 6, 0.09);
    K.headlight(P, 'hull', s * 1.35, fy + 0.25, hl - 0.6, true, 'lens');
    K.stowageBox(P, 'hull', s * 1.2, H - 0.45, -hl + 0.15, 0.9, 0.55, 0.25);
  }
  const bow = glacis(0.98, hl - 0.05, H, hl - 2.35);
  // The twin grille frames sit flush with the slanted engine deck.
  for (const side of [-1, 1]) {
    const x = side * 0.625;
    P.add('hull', 'paintDetail', bow.place(box(1.035, 0.82, 0.041), x, 1.24, 0.024));
    P.add('hull', 'dark', bow.place(box(0.951, 0.73, 0.021), x, 1.24, 0.049));
    for (let i = 0; i < 10; i++) {
      P.add('hull', 'metal', bow.place(box(0.934, 0.033, 0.020), x, 0.925 + i * 0.07, 0.062));
    }
  }
  P.add('hull', 'paint', box(1.1, 0.95, 0.06, 0, 1.05, -hl - 0.02)); P.add('hull','metal',box(0.06,0.2,0.05,0.45,1.05,-hl-0.06));
  // Rear double-door outline and hinge knuckles.
  P.add('hull','dark',box(0.017,0.92,0.012,0,1.05,-hl-0.057));
  for(const side of [-1,1])for(const y of [0.75,1.35])P.add('hull','metal',cylY(0.035,0.18,10,side*0.54,y,-hl-0.07));
  K.towCable(P, 'hull', 0.0, H + 0.03, -2.6, -1.0); K.hatchRect(P, 'hull', -0.75, H - 0.15, hl - 2.7, 0.55, 0.5); K.periscope(P, 'hull', -0.75, H - 0.1, hl - 2.45, 0, 0.9);
  // long wedge turret with chain curtain
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  turretBody(P, [[0.35, bz + tl], [tw, bz + tl - 1.55], [tw, bz - tl + 0.4], [tw - 0.2, bz - tl], [-tw + 0.2, bz - tl], [-tw, bz - tl + 0.4], [-tw, bz + tl - 1.55], [-0.35, bz + tl]], th, 0.84, 0.94, bz - 0.4);
  chainCurtain(P, -1.35, 1.35, 0.05, bz - tl + 0.15, 20, 0.4);
  for (const s of [-1, 1]) {
    P.add('turret', 'paint', box(0.12, 0.35, 0.45, s * (tw - 0.05), th * 0.75, bz + 0.15)); P.add('turret', 'dark', box(0.02, 0.28, 0.38, s * (tw + 0.01), th * 0.75, bz + 0.15)); // Trophy radar panels
    P.add('turret', 'metal', cylY(0.12, 0.25, 10, s * (tw - 0.25), th + 0.12, bz - 0.4)); // Trophy launcher
    K.smokeDischargers(P, 'turret', s * (tw - 0.3), th + 0.04, bz - 1.1, s * 1.3, 5, 0.09, 0.22, 0.04);
    for (let i = 0; i < 4; i++) P.add('turret', 'metal', box(0.02, 0.3, 0.02, s * (tw + 0.1), th * 0.5, bz - 1.8 + i * 0.35));
  }
  P.add('turret', 'metal', cylZ(0.04, 1.0, 10, -0.95, th + 0.12, bz - 0.6)); P.add('turret', 'metal', box(0.12, 0.12, 0.25, -0.95, th + 0.08, bz - 1.05)); // 60 mm mortar
  P.add('turret', 'paint', cylY(0.2, 0.35, 12, 0.7, th + 0.17, bz - 0.6)); P.add('turret', 'paint', box(0.36, 0.32, 0.42, 0.7, th + 0.5, bz - 0.6)); sightWindow(P, 0.26, 0.16, 0.7, th + 0.52, bz - 0.38);
  P.add('turret', 'paint', box(0.5, 0.35, 0.45, -0.55, th + 0.17, bz + 0.6)); sightWindow(P, 0.36, 0.18, -0.55, th + 0.2, bz + 0.83);
  K.cupola(P, 'turret', 0.7, th, bz - 1.2, 0.36, 0.18, 8, 'modern'); K.mg(P, 'turret', 0.7, th + 0.3, bz - 0.95, 0, 'mag');
  K.hatch(P, 'turret', -0.6, th, bz - 1.25, 0.3); K.mg(P, 'turret', -0.6, th + 0.3, bz - 1.0, 0, 'mag');
  K.antenna(P, 'turret', -1.3, th, bz - 2.0, 2.5); K.antenna(P, 'turret', 1.3, th, bz - 2.0, 2.0);
  P.add('gun', 'paint', box(0.5, 0.45, 0.6, 0, 0, 0)); P.add('gun', 'canvas', cylZ(0.22, 0.4, 12, 0, 0, 0.45, 0.16));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.13, r1: 0.085, evac: { z: 2.8, r: 0.15, len: 0.9 }, sleeve: 6, mrs: true });
  return { P, ...g, wheelType: 'disc', cast: 0.15, castTurret: 0.1, turretPos: [0, H, d.turretZ], gunPos: [0, 0.38, bz + tl - 1.0], decals: decalsSide('text', '3', 'turret', tw * 0.88 + 0.05, th * 0.4, bz - 1.2, 0.45) };
}

const V2 = { panther, is2, pershing, centurion, leo1, leo2a6, t90m, chally2, type99a, merkava4 };
const FINISHES = {
  panther: { base: '#a29267', camo: ['#58634a', '#705749'], grime: 0.50, dust: '#8e8164', mud: '#4b4030', weather: 0.68, roughness: 0.79, abrasion: 0.72, primer: '#725342' },
  is2: { base: '#4c523e', grime: 0.45, dust: '#8b7d62', mud: '#504335', weather: 0.67, roughness: 0.81, abrasion: 0.90, primer: '#695242' },
  pershing: { base: '#4c4d39', grime: 0.38, dust: '#80765a', mud: '#4e4333', weather: 0.64, roughness: 0.74, abrasion: 0.69, primer: '#685848' },
  centurion: { base: '#454b40', grime: 0.41, dust: '#786f5c', mud: '#4e4437', weather: 0.66, roughness: 0.78, abrasion: 0.65 },
  leo1: { base: '#555a45', camo: ['#343934', '#665344'], grime: 0.41, dust: '#81785e', mud: '#514838', weather: 0.57, roughness: 0.76, abrasion: 0.55 },
  leo2a6: { base: '#494f44', camo: ['#353838', '#6c594c'], grime: 0.33, dust: '#8b8069', mud: '#524a3c', weather: 0.55, roughness: 0.82, abrasion: 0.46 },
  t90m: { base: '#51584b', camo: ['#626553', '#383e36'], grime: 0.40, dust: '#7c7761', mud: '#4d483b', weather: 0.66, roughness: 0.78, abrasion: 0.64 },
  chally2: { base: '#a59270', grime: 0.36, dust: '#aa987a', mud: '#63533f', weather: 0.65, roughness: 0.80, abrasion: 0.48 },
  type99a: { base: '#616550', camo: ['#454d3e', '#7b7962'], grime: 0.33, dust: '#868068', mud: '#56513f', weather: 0.57, roughness: 0.80, abrasion: 0.46 },
  merkava4: { base: '#7d7a69', grime: 0.41, dust: '#ad9778', mud: '#655944', weather: 0.68, roughness: 0.84, abrasion: 0.55 },
};
export function buildV2(d, spec) {
  const id = spec?.id;
  const builder = V2[id];
  if (!builder) throw new Error('No builder for ' + id);
  const { weather, roughness, abrasion, primer, ...paint } = FINISHES[id];
  return { ...builder(d), paint, weather, finish: { roughness, abrasion, primer } };
}
