// v2 tank builders (Panther, IS-2, Pershing, Centurion, Leopard 1A5, Leopard 2A6, T-90M, Challenger 2, Type 99A, Merkava Mk4).
// Real-scale (1 unit = 1 m), +z = front. Dimensions come from spec.dims so hit boxes and visuals agree.
import * as THREE from 'three';
import { T, box, cylY, cylX, cylZ, sideExtrude, topExtrude, taper, superEllipse, castLoft, Parts } from './geom.js';
import * as K from './kit.js';

const DEG = Math.PI / 180;
// keep the part of a side profile polygon above y = fy (Sutherland–Hodgman against a horizontal line)
function clipAbove(poly, fy) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]; const ia = a[1] >= fy, ib = b[1] >= fy;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (fy - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, fy]); }
  }
  return out;
}
// lower hull between the tracks + upper hull / fenders above the track run
function hullShell(P, d, prof, fy, o = {}) {
  const inner = d.W - 2 * d.trackW - 0.04;
  P.add('hull', 'paint', sideExtrude(prof, inner, 0, 0.02));
  const up = clipAbove(prof, fy);
  let g = sideExtrude(up, o.upperW ?? d.W - 0.02, 0, 0.025);
  if (o.sideTaper) g = taper(g, fy, d.hullH, o.sideTaper, 1);
  P.add('hull', 'paint', g);
  if (o.fender !== false) for (const s of [-1, 1]) P.add('hull', 'paint', box(d.trackW + 0.06, 0.035, d.L * (o.fenderLen ?? 0.98), s * (d.W / 2 - d.trackW / 2 + 0.01), fy - 0.015, o.fenderZ ?? 0));
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
function deckGrilles(P,x0,x1,y,z0,z1,n){
  const w=Math.abs(x1-x0), l=Math.abs(z1-z0), x=(x0+x1)/2, z=(z0+z1)/2;
  P.add('hull','dark',box(w,0.02,l,x,y+0.005,z));
  for(let i=0;i<n;i++)P.add('hull','paint',box(w,0.045,0.035,x,y+0.03,z0+(z1-z0)*(i+0.5)/n,0.28));
  for(const edge of [x0,x1])P.add('hull','paint',box(0.04,0.035,l,edge,y+0.029,z));
  for(const edge of [z0,z1])P.add('hull','paint',box(w,0.035,0.04,x,y+0.029,edge));
  for(const edge of [x0,x1])for(const ez of [z0,z1])P.add('hull','metal',cylY(0.017,0.018,6,edge,y+0.05,ez));
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
  // glacis details: bow MG ball, driver periscope, headlight, tow shackles
  P.add('hull', 'paint', T(new THREE.SphereGeometry(0.13, 12, 8), 0.55, 1.45, hl - 0.68)); P.add('hull', 'dark', cylZ(0.02, 0.35, 6, 0.55, 1.47, hl - 0.52));
  K.periscope(P, 'hull', -0.55, H, hl - 1.45, 0); K.periscope(P, 'hull', 0.55, H, hl - 1.45, 0);
  K.headlight(P, 'hull', -1.05, 1.42, hl - 0.75, false);
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
  K.skirt(P, 1.74, fy + 0.04, -hl + 0.55, hl - 0.75, 0.55, 6, 0.012); K.skirt(P, -1.74, fy + 0.04, -hl + 0.55, hl - 0.75, 0.55, 6, 0.012);
  K.antenna(P, 'hull', 1.0, H, -hl + 0.5, 1.9);
  // turret: narrow-fronted, steeply sloped sides
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  const turretOutline = superEllipse(tw, tl * 0.86, tl * 1.02, 2.55, 64, (x, z) => [x * (z > 0.25 ? 1 - (z - 0.25) * 0.12 : 1), z]).map(([x, z]) => [x, z + bz]);
  turretBody(P, turretOutline, d.turretH, 0.82, 0.92, bz);
  K.cupola(P, 'turret', -0.52, d.turretH, bz - 0.55, 0.33, 0.27, 7, 'ww2');
  K.mg(P, 'turret', -0.52, d.turretH + 0.42, bz - 0.55, 0, 'mg34');
  K.hatch(P, 'turret', 0.42, d.turretH, bz - 0.2, 0.26); K.periscope(P, 'turret', 0.42, d.turretH, bz + 0.25, 0, 0.8);
  P.add('turret', 'paint', cylZ(0.36, 0.08, 16, 0, 0.42, bz - tl + 0.08)); // rear escape hatch
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.add('turret', 'metal', cylZ(0.04, 0.24, 8, s * 0.82, 0.62, bz + 0.6 - i * 0.12, 0.04, -0.6));
  K.liftHooks(P, 'turret', [[-0.6, d.turretH, bz + 0.6], [0.6, d.turretH, bz + 0.6], [0, d.turretH, bz - 0.9]]);
  // gun: "chin" mantlet + 75 mm KwK 42 L/70 with double-baffle brake
  const gz = bz + tl - 0.1;
  P.add('gun', 'paint', cylX(0.38, 1.25, 20, 0, -0.02, 0.05)); P.add('gun', 'paint', box(1.25, 0.25, 0.3, 0, -0.32, 0.05)); P.add('gun', 'dark', box(0.1, 0.07, 0.04, 0.38, 0.12, 0.43));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.07, brake: { type: 'double', r: 0.105, len: 0.42 } });
  return { P, ...g, wheelType: 'single', cast: 0.35, castTurret: 0.4, turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, gz], decals: [...decalsSide('cross', '', 'turret', tw * 0.9 + 0.05, 0.42, bz - 0.4, 0.42), ...decalsSide('text', '211', 'turret', tw * 0.9 + 0.05, 0.42, bz + 0.25, 0.5)] };
}

function is2(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  // IS-2 Model 1944: six large road wheels, rear drive sprockets and three return rollers.
  const g = gear({ n: 6, z0: -2.05, z1: 2.05, r: 0.34, w: 0.5, rollers: [-1.5, 0.0, 1.5], ry: 0.97, rr: 0.1, spr: { z: -hl + 0.35, y: 0.76, r: 0.33 }, idl: { z: hl - 0.32, y: 0.7, r: 0.3 } });
  const fy = trackTop(g);

  // Late-war single-piece sloped glacis (not the stepped 1943 nose), with a
  // steep upper plate and a separate lower nose. Side plates remain nearly vertical.
  const prof = [
    [-hl + 0.2, c], [hl - 0.6, c], [hl, 0.88],
    [hl - 0.55, H], [-hl + 0.72, H], [-hl, 1.22], [-hl, c + 0.2],
  ];
  const inner = hullShell(P, d, prof, fy, { sideTaper: 0.94 });
  torsionArms(P, inner, g, c);

  // Driver's narrow vision slit and fixed bow DT machine-gun mount on the glacis.
  P.add('hull', 'paint', box(0.29, 0.105, 0.045, -0.52, 1.34, hl - 0.29, -60 * DEG));
  P.add('hull', 'dark', box(0.20, 0.035, 0.018, -0.52, 1.35, hl - 0.265, -60 * DEG));
  P.add('hull', 'paint', T(new THREE.SphereGeometry(0.12, 16, 10), 0.55, 1.30, hl - 0.30, 0, 0, 0, 1, 1, 0.72));
  P.add('hull', 'dark', cylZ(0.022, 0.32, 8, 0.55, 1.31, hl - 0.16, 0.022, 0));
  K.headlight(P, 'hull', -1.18, fy + 0.16, hl - 0.28, true);
  for (const side of [-1, 1]) {
    P.add('hull', 'metal', T(new THREE.TorusGeometry(0.10, 0.018, 6, 16), side * 1.0, c + 0.23, hl - 0.10, 0, 0, Math.PI / 2));
    P.add('hull', 'metal', box(0.28, 0.06, 0.08, side * 1.0, c + 0.20, hl - 0.08));
  }

  // Four auxiliary fuel tanks: two cylindrical drums along each rear hull side.
  for (const side of [-1, 1]) {
    for (const z of [-2.50, -1.43]) {
      P.add('hull', 'paint', cylZ(0.17, 0.90, 18, side * 1.35, fy + 0.04, z));
      for (const dz of [-0.34, 0.34]) P.add('hull', 'metal', T(new THREE.TorusGeometry(0.174, 0.014, 6, 24), side * 1.35, fy + 0.04, z + dz));
      P.add('hull', 'metal', cylY(0.04, 0.045, 10, side * 1.35, fy + 0.23, z));
    }
    K.exhaust(P, 'hull', side * 0.55, 1.28, -hl - 0.08, 'ww2', 0.09, 0.42);
    K.towCable(P, 'hull', side * 1.05, H - 0.08, -2.35, 0.72);
  }
  K.tools(P, 'hull', 1.25, fy + 0.02, 1.75, 1);
  deckGrilles(P, -0.7, 0.7, H, -hl + 0.48, -hl + 1.58, 7);
  P.add('hull', 'paint', box(1.55, 0.055, 0.42, 0, H + 0.025, -hl + 2.05));
  // A few spare track links sit on the sloped glacis.
  K.spareLinks(P, 'hull', -0.48, 1.35, hl - 0.24, 3, d.trackW * 0.82, 0.15, 0, -60 * DEG);

  // Broad, rounded cast IS-2 turret with the characteristic wide gun shield.
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  const poly = superEllipse(tw, tl * 0.88, tl * 1.04, 2.35, 64, (x, z) => [
    x * (x > 0 ? 0.94 : 1.0) * (z > 0.35 ? 1 - (z - 0.35) * 0.10 : 1), z,
  ]).map(([x, z]) => [x, z + bz]);
  turretBody(P, poly, th * 0.96, 0.84, 0.89, bz);

  // Commander cupola and loader's hatch are separate roof fittings; DShK is mounted
  // on the commander's cupola on this late-production 1944 configuration.
  K.cupola(P, 'turret', 0.56, th * 0.93, bz - 0.48, 0.30, 0.25, 6, 'ww2');
  K.mg(P, 'turret', 0.56, th + 0.28, bz - 0.78, 0, 'dshk');
  K.hatch(P, 'turret', -0.48, th * 0.95, bz - 0.45, 0.26);
  K.periscope(P, 'turret', -0.34, th * 0.95, bz + 0.18, 0, 0.85);
  // Rear-facing DT machine gun in the turret bustle.
  P.add('turret', 'paint', T(new THREE.SphereGeometry(0.105, 14, 10), -0.58, 0.42, bz - tl * 0.98));
  K.mg(P, 'turret', -0.58, 0.42, bz - tl * 0.98, Math.PI, 'dt');
  K.liftHooks(P, 'turret', [[-0.82, th * 0.82, bz + 0.72], [0.82, th * 0.82, bz + 0.72]]);
  K.grabRail(P, 'turret', [-1.02, 0.42, bz - 0.15], [-1.02, 0.42, bz + 0.38], 0.0);
  K.grabRail(P, 'turret', [1.02, 0.42, bz - 0.15], [1.02, 0.42, bz + 0.38], 0.0);

  // Convex cast mantlet, coaxial opening and 122 mm D-25T with its double-baffle brake.
  // The IS-2's D-25T has a broad, rounded cast gun shield rather than a small flat box.
  P.add('gun', 'paint', T(new THREE.SphereGeometry(1, 32, 20), 0, 0, 0.04, 0, 0, 0, 0.95, 0.32, 0.30));
  P.add('gun', 'paint', cylZ(0.22, 0.24, 24, 0, 0, 0.27));
  P.add('gun', 'dark', cylZ(0.035, 0.035, 12, -0.42, 0.08, 0.245));
  P.add('gun', 'dark', box(0.08, 0.035, 0.018, 0.40, 0.13, 0.245));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.145, r1: 0.085, brake: { type: 'double', r: 0.155, len: 0.55 } });

  return {
    P, ...g, wheelType: 'disc', cast: 0.45, castTurret: 0.95,
    turretPos: [0, H, d.turretZ], gunPos: [0, 0.46, bz + tl * 0.88],
    decals: decalsSide('text', '23', 'turret', tw * 0.94, 0.42, bz - 0.2, 0.55),
  };
}

function pershing(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.15, z1: 2.0, r: 0.33, w: 0.48, rollers: [-1.9, -1.0, 0.0, 1.0, 1.9], ry: 0.98, rr: 0.085, spr: { z: -hl + 0.35, y: 0.78, r: 0.33 }, idl: { z: hl - 0.33, y: 0.72, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.25, c], [hl - 0.5, c], [hl, 0.95], [hl - 1.12, H], [-hl + 0.05, H], [-hl, 1.38], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  P.add('hull', 'paint', T(new THREE.SphereGeometry(0.14, 12, 8), 0.6, 1.35, hl - 0.6)); P.add('hull', 'dark', cylZ(0.02, 0.35, 6, 0.6, 1.4, hl - 0.45));
  for (const s of [-1, 1]) { K.headlight(P, 'hull', s * 1.3, fy + 0.12, hl - 0.15); K.hatch(P, 'hull', s * 0.6, H, hl - 1.45, 0.27, { periscope: true }); P.add('hull', 'paint', box(0.06, 0.32, d.L * 0.92, s * (d.W / 2 + 0.01), fy - 0.15, 0)); }
  for (const s of [-1, 1]) P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.9, c + 0.3, hl - 0.15));
  deckGrilles(P, -1.1, 1.1, H, -hl + 0.35, -hl + 1.75, 9);
  P.add('hull','paint',box(2.2,0.35,0.1,0,1.25,-hl-0.08));
  for(const side of [-1,1])for(let i=0;i<4;i++)P.add('hull','metal',box(0.36,0.022,0.055,side*0.65,1.12+i*0.075,-hl-0.155)); for (const s of [-1, 1]) P.add('hull', 'metal', box(0.5, 0.28, 0.1, s * 0.6, 1.25, -hl - 0.15));
  K.tools(P, 'hull', 0.0, H, -hl + 2.6, 1); K.towCable(P, 'hull', 1.4, fy + 0.04, -2.0, 1.0); K.jerrycans(P, 'hull', -1.45, fy, -2.4, 3, Math.PI / 2);
  K.stowageBox(P, 'hull', -1.4, fy + 0.18, 0.6, 0.45, 0.34, 1.0);
  // cast turret with bustle
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  turretBody(P, superEllipse(tw,1.05,1.62,2.5,64).map(([x, z]) => [x, z + bz]), d.turretH, 0.84, 0.9, bz);
  K.cupola(P, 'turret', 0.55, d.turretH, bz - 0.5, 0.33, 0.26, 6, 'ww2'); K.mg(P, 'turret', 0.55, d.turretH + 0.42, bz - 0.5, 0, 'm2');
  K.hatch(P, 'turret', -0.5, d.turretH, bz - 0.35, 0.27); K.periscope(P, 'turret', -0.45, d.turretH, bz + 0.35, 0, 0.8);
  K.antenna(P, 'turret', -0.8, d.turretH * 0.8, bz - 1.2, 2.2); K.stowageBox(P, 'turret', 0, 0.35, bz - 1.75, 1.6, 0.35, 0.3);
  K.liftHooks(P, 'turret', [[-0.85, d.turretH * 0.8, bz + 0.5], [0.85, d.turretH * 0.8, bz + 0.5]]);
  // M26's large rounded gun shield and coaxial aperture.
  P.add('gun', 'paint', castLoft(superEllipse(0.82, 0.22, 0.22, 2.35, 48), 0.58, 0.98, 0.96, 0.02, -0.29));
  P.add('gun', 'paint', cylZ(0.22, 0.22, 24, 0, 0, 0.22));
  P.add('gun', 'dark', cylZ(0.028, 0.035, 12, 0.43, 0.08, 0.245));
  P.add('gun', 'dark', cylZ(0.035, 0.04, 12, -0.43, 0.08, 0.245));
  // Standard M26 90 mm M3 uses the large double-baffle muzzle brake (not the M26A1 single-baffle type).
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.075, brake: { type: 'double', r: 0.14, len: 0.42 } });
  return { P, ...g, wheelType: 'disc', cast: 0.7, castTurret: 1.0, turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, bz + 1.12], decals: [...decalsSide('usstar', '', 'hull', d.W / 2 + 0.05, fy - 0.15, -0.3, 0.3), ...decalsSide('usstar', '', 'turret', tw * 0.93, 0.42, bz - 0.2, 0.55)] };
}

// ---------------- Cold War ----------------
function centurion(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const zs = [-2.35, -1.7, -0.45, 0.2, 1.45, 2.1];
  const g = gear({ n: 6, zs, r: 0.31, w: 0.46, rollers: [-2.6, -1.6, -0.6, 0.4, 1.4, 2.4], ry: 1.02, rr: 0.08, spr: { z: -hl + 0.42, y: 0.8, r: 0.36 }, idl: { z: hl - 0.42, y: 0.74, r: 0.33 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.3, c], [hl - 0.9, c], [hl - 0.05, 0.98], [hl - 1.15, H - 0.2], [hl - 1.3, H - 0.2], [-hl + 0.1, H - 0.2], [-hl, 1.45], [-hl, c + 0.3]];
  const inner = hullShell(P, d, prof, fy, { upperW: d.W - 2 * d.trackW + 0.3 });
  // Horstmann bogies (pairs of wheels on one coil-sprung unit)
  for (const s of [-1, 1]) for (let b = 0; b < 3; b++) { const zc = (zs[b * 2] + zs[b * 2 + 1]) / 2; const x = s * (inner / 2 + 0.1); P.add('hull', 'metal', box(0.12, 0.3, 0.7, x, 0.55, zc)); for (const o of [-0.12, 0.12]) P.add('hull', 'metal', cylZ(0.06, 0.45, 8, x + s * 0.06, 0.62, zc + o)); }
  // bazooka plates, track-guard bins
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 + 0.03), fy + 0.02, -hl + 0.45, hl - 0.55, 0.5, 6, 0.03);
    for (const z of [-1.9, -0.6, 0.7]) K.stowageBox(P, 'hull', s * (d.W / 2 - 0.3), fy + 0.25, z, 0.5, 0.46, 1.15);
    K.headlight(P, 'hull', s * 1.2, fy + 0.15, hl - 0.25);
  }
  K.tools(P, 'hull', 1.2, fy + 0.5, 1.7, 1); K.towCable(P, 'hull', -1.25, fy + 0.52, -2.4, 1.2);
  deckGrilles(P, -0.95, 0.95, H - 0.2, -hl + 0.4, -hl + 2.2, 10); K.hatchRect(P, 'hull', 0.6, H - 0.2, hl - 1.6, 0.55, 0.5);
  K.periscope(P, 'hull', 0.6, H - 0.2, hl - 1.25, 0);
  for (const s of [-1, 1]) K.exhaust(P, 'hull', s * 0.6, 1.25, -hl - 0.1, 'ww2', 0.09, 0.4);
  // cast/welded turret with side bins and rear basket
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  turretBody(P, superEllipse(tw*0.9,1.35,1.6,3.0,64).map(([x, z]) => [x, z + bz]), d.turretH, 0.86, 0.93, bz);
  for (const s of [-1, 1]) { K.stowageBox(P, 'turret', s * (tw * 0.92 + 0.05), 0.38, bz - 0.3, 0.26, 0.5, 1.7); K.smokeDischargers(P, 'turret', s * 0.95, 0.72, bz + 1.1, s * 0.7, 6, 0.08, 0.2, 0.035); }
  for (let i = 0; i < 6; i++) P.add('turret', 'metal', box(0.02, 0.4, 0.02, -1.0 + i * 0.4, 0.35, bz - 1.75)); P.add('turret', 'metal', box(2.05, 0.03, 0.4, 0, 0.16, bz - 1.6)); P.add('turret', 'metal', box(2.05, 0.03, 0.03, 0, 0.55, bz - 1.78));
  P.add('turret', 'canvas', box(1.6, 0.25, 0.25, 0, 0.3, bz - 1.6));
  K.cupola(P, 'turret', 0.55, d.turretH, bz - 0.3, 0.36, 0.25, 8, 'modern'); K.mg(P, 'turret', 0.55, d.turretH + 0.45, bz - 0.3, 0, 'mag');
  K.hatch(P, 'turret', -0.55, d.turretH, bz - 0.25, 0.3); K.antenna(P, 'turret', -0.9, d.turretH * 0.8, bz - 1.0); K.antenna(P, 'turret', 0.95, d.turretH * 0.8, bz - 1.05, 1.6);
  P.add('gun', 'paint', box(0.72, 0.52, 0.28, 0, 0, 0.02)); P.add('gun', 'canvas', cylZ(0.24, 0.4, 14, 0, 0, 0.35, 0.16));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.074, evac: { z: 2.9, r: 0.14, len: 0.75 } });
  return { P, ...g, wheelType: 'disc', cast: 0.4, castTurret: 0.9, turretPos: [0, H - 0.2, d.turretZ], gunPos: [0, 0.4, bz + 1.45], decals: decalsSide('text', '31', 'turret', tw * 0.92 + 0.19, 0.42, bz - 0.3, 0.42) };
}

function leo1(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 7, z0: -2.55, z1: 2.35, r: 0.35, w: 0.45, rollers: [-2.0, -0.7, 0.6, 1.8], ry: 1.0, spr: { z: -hl + 0.38, y: 0.72, r: 0.33 }, idl: { z: hl - 0.33, y: 0.66, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.3, c], [hl - 0.75, c], [hl - 0.05, 0.95], [hl - 0.95, H - 0.04], [hl - 1.05, H], [-hl + 0.1, H], [-hl, H - 0.2], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 + 0.02), fy + 0.03, -hl + 0.35, hl - 0.4, 0.48, 7, 0.025, 0, 'rubber');
    K.headlight(P, 'hull', s * 1.35, H - 0.1, hl - 0.9); P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.9, c + 0.3, hl - 0.6));
    deckGrilles(P, s * 0.4, s * 1.5, H, -hl + 0.3, -hl + 1.9, 10);
    K.exhaust(P, 'hull', s * 1.25, fy + 0.22, -hl - 0.02, 'modern', 0.12, 0.6);
  }
  K.tools(P, 'hull', -0.2, H, -hl + 2.7, 1); K.towCable(P, 'hull', 0.0, H + 0.03, hl - 2.2, hl - 1.15);
  K.hatchRect(P, 'hull', -0.65, H, hl - 1.3, 0.55, 0.5); for (let i = 0; i < 3; i++) K.periscope(P, 'hull', -0.85 + i * 0.2, H, hl - 1.0, 0, 0.7);
  // 1A5 welded add-on armour turret: angular wedge
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  turretBody(P, [[tw * 0.42, bz + tl], [tw, bz + tl - 0.85], [tw, bz - tl + 0.45], [tw * 0.86, bz - tl], [-tw * 0.86, bz - tl], [-tw, bz - tl + 0.45], [-tw, bz + tl - 0.85], [-tw * 0.42, bz + tl]], d.turretH, 0.9, 0.95, bz);
  for (const s of [-1, 1]) { K.boltRow(P, 'turret', [s * tw * 0.98, d.turretH * 0.6, bz - 0.8], [s * tw * 0.98, d.turretH * 0.6, bz + 0.6], 6, 0.02, 'x'); K.smokeDischargers(P, 'turret', s * (tw - 0.05), d.turretH * 0.85, bz - 0.6, s * Math.PI / 2, 4, 0.1, 0.22, 0.04); }
  P.add('turret', 'paint', box(0.55, 0.35, 0.65, -0.65, d.turretH + 0.17, bz + 0.9)); P.add('turret', 'glass', box(0.4, 0.2, 0.02, -0.65, d.turretH + 0.2, bz + 1.23)); // EMES 18
  P.add('turret', 'paint', cylY(0.2, 0.3, 12, 0.55, d.turretH + 0.15, bz + 0.2)); P.add('turret', 'paint', box(0.32, 0.25, 0.35, 0.55, d.turretH + 0.42, bz + 0.2)); P.add('turret', 'glass', box(0.22, 0.12, 0.02, 0.55, d.turretH + 0.44, bz + 0.38)); // PERI R12
  K.hatch(P, 'turret', 0.6, d.turretH, bz - 0.4, 0.3); K.hatch(P, 'turret', -0.6, d.turretH, bz - 0.35, 0.3); K.mg(P, 'turret', -0.6, d.turretH + 0.3, bz - 0.1, 0, 'mag');
  for (let i = 0; i < 5; i++) P.add('turret', 'metal', box(0.02, 0.35, 0.02, -0.9 + i * 0.45, d.turretH * 0.6, bz - tl - 0.35)); P.add('turret', 'metal', box(1.9, 0.03, 0.4, 0, 0.12, bz - tl - 0.18)); P.add('turret', 'canvas', box(1.5, 0.3, 0.3, 0, 0.3, bz - tl - 0.18));
  K.antenna(P, 'turret', -1.0, d.turretH, bz - 1.2); K.antenna(P, 'turret', 1.0, d.turretH, bz - 1.25, 1.6);
  P.add('gun', 'paint', box(0.55, 0.5, 0.45, 0, 0, 0.0)); P.add('gun', 'rubber', cylZ(0.2, 0.25, 12, 0, 0, 0.3));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.12, r1: 0.072, evac: { z: 2.3, r: 0.13, len: 0.7 }, sleeve: 5 });
  return { P, ...g, wheelType: 'modern', cast: 0.25, castTurret: 0.2, turretPos: [0, H, d.turretZ], gunPos: [0, 0.4, bz + tl - 0.1], decals: [...decalsSide('cross', '', 'turret', tw * 0.95 + 0.06, 0.42, bz - 0.95, 0.4), ...decalsSide('cross', '', 'hull', d.W / 2 + 0.05, fy - 0.2, 1.8, 0.3)] };
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
    P.add('hull', 'paint', box(0.13, 0.66, 1.75, s * (d.W / 2 + 0.05), fy - 0.28, hl - 1.15)); K.boltRow(P, 'hull', [s * (d.W / 2 + 0.12), fy - 0.1, hl - 1.9], [s * (d.W / 2 + 0.12), fy - 0.1, hl - 0.4], 5, 0.02, 'x');
    K.skirt(P, s * (d.W / 2 + 0.03), fy + 0.03, -hl + 0.3, hl - 2.05, 0.55, 5, 0.05);
    K.headlight(P, 'hull', s * 1.45, H - 0.05, hl - 1.6); P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 1.0, c + 0.35, hl - 0.5));
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
    K.smokeDischargers(P, 'turret', s * (tw - 0.1), th + 0.05, bz - 1.0, s * Math.PI / 2, 4, 0.11, 0.22, 0.04);
    for (let i = 0; i < 4; i++) P.add('turret', 'metal', box(0.02, 0.35, 0.02, s * (tw + 0.1), th * 0.55, bz - 1.9 + i * 0.4)); P.add('turret', 'canvas', box(0.18, 0.32, 1.3, s * (tw + 0.08), th * 0.5, bz - 1.35));
  }
  P.add('turret', 'paint', box(0.6, 0.42, 0.8, -0.85, th + 0.21, bz + 1.0)); P.add('turret', 'glass', box(0.45, 0.25, 0.02, -0.85, th + 0.25, bz + 1.41)); // EMES 15 doghouse
  P.add('turret', 'paint', cylY(0.22, 0.35, 14, 0.7, th + 0.17, bz - 0.15)); P.add('turret', 'paint', box(0.38, 0.32, 0.42, 0.7, th + 0.5, bz - 0.15)); P.add('turret', 'glass', box(0.28, 0.16, 0.02, 0.7, th + 0.52, bz + 0.07)); // PERI R17
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
    K.skirt(P, s * (d.W / 2 + 0.02), fy + 0.03, -hl + 0.3, hl - 2.2, 0.55, 4, 0.03, 0, 'rubber');
    sideEra(P, 'hull', s, s * (d.W / 2 + 0.02), fy - 0.6, hl - 0.25, 4, 2, 0.48, 0.3, 0.09);
    P.add('hull', 'paint', cylX(0.29, 0.9, 16, s * 0.62, 1.15, -hl - 0.12));
    for (let i = 0; i < 3; i++) K.stowageBox(P, 'hull', s * (d.W / 2 - 0.3), fy + 0.2, 0.9 - i * 1.0, 0.5, 0.36, 0.9);
    K.headlight(P, 'hull', s * 1.4, fy + 0.15, hl - 0.4);
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
  P.add('turret', 'paint', box(0.48, 0.4, 0.5, 0.55, th + 0.2, bz - 0.2)); P.add('turret', 'glass', box(0.3, 0.2, 0.02, 0.55, th + 0.22, bz + 0.06)); // commander sight
  P.add('turret', 'paint', box(0.55, 0.45, 0.4, -0.75, th + 0.22, bz + 0.6)); P.add('turret', 'glass', box(0.36, 0.22, 0.02, -0.75, th + 0.24, bz + 0.81)); // gunner sight
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
    K.skirt(P, s * (d.W / 2 + 0.06), fy + 0.04, -hl + 0.5, hl - 0.6, 0.6, 7, 0.11); // Dorchester side armour
    K.headlight(P, 'hull', s * 1.3, H - 0.25, hl - 0.75); P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.95, c + 0.3, hl - 0.55));
    deckGrilles(P, s * 0.25, s * 1.55, H, -hl + 0.35, -hl + 2.3, 12);
    K.stowageBox(P, 'hull', s * 1.25, H - 0.35, -hl + 0.12, 0.8, 0.45, 0.22);
  }
  K.towCable(P, 'hull', -0.8, H + 0.03, -2.0, 0.9); K.tools(P, 'hull', 0.8, H, -hl + 2.8, 1);
  K.hatchRect(P, 'hull', 0, H, hl - 1.85, 0.6, 0.55); K.periscope(P, 'hull', 0, H, hl - 1.6, 0, 0.9);
  // slab-sided Chobham turret with high bustle
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0, th = d.turretH;
  turretBody(P, [[1.05, bz + tl], [tw, bz + tl - 0.75], [tw, bz - tl], [-tw, bz - tl], [-tw, bz + tl - 0.75], [-1.05, bz + tl]], th, 0.95, 0.97, bz);
  for (const s of [-1, 1]) {
    K.smokeDischargers(P, 'turret', s * 1.15, th + 0.06, bz + tl - 0.55, s * 0.6, 5, 0.09, 0.22, 0.04);
    for (const z of [bz - 0.4, bz - 1.2]) K.stowageBox(P, 'turret', s * (tw * 0.95 + 0.15), th * 0.5, z, 0.25, th * 0.75, 0.75);
    K.jerrycans(P, 'turret', s * 1.1, 0.05, bz - tl - 0.25, 2, 0);
  }
  for (let i = 0; i < 5; i++) P.add('turret', 'metal', box(0.02, 0.4, 0.02, -1.4 + i * 0.7, th * 0.55, bz - tl - 0.4)); P.add('turret', 'metal', box(2.9, 0.03, 0.42, 0, 0.12, bz - tl - 0.2));
  P.add('turret', 'paint', cylY(0.22, 0.42, 14, 0.75, th + 0.2, bz - 0.1)); P.add('turret', 'paint', T(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.75, th + 0.4, bz - 0.1)); P.add('turret', 'glass', box(0.2, 0.15, 0.02, 0.75, th + 0.5, bz + 0.15)); // VS580 commander sight
  P.add('turret', 'paint', box(0.5, 0.35, 0.45, -0.85, th + 0.17, bz + 1.4)); P.add('turret', 'glass', box(0.36, 0.18, 0.02, -0.85, th + 0.2, bz + 1.63));
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
    K.skirt(P, s * (d.W / 2 + 0.03), fy + 0.04, -hl + 0.35, hl - 0.4, 0.58, 7, 0.05);
    sideEra(P, 'hull', s, s * (d.W / 2 + 0.06), fy - 0.5, hl - 0.4, 4, 1, 0.5, 0.45, 0.07);
    K.headlight(P, 'hull', s * 1.35, H - 0.05, hl - 1.35);
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
    P.add('turret', 'dark', box(0.18, 0.22, 0.12, s * 1.2, th + 0.11, bz - 1.4)); P.add('turret', 'glass', box(0.12, 0.08, 0.02, s * 1.2, th + 0.14, bz - 1.33)); // laser warning / dazzler
  }
  P.add('turret', 'paint', cylY(0.2, 0.35, 12, 0.65, th + 0.17, bz - 0.4)); P.add('turret', 'paint', box(0.36, 0.3, 0.4, 0.65, th + 0.48, bz - 0.4)); P.add('turret', 'glass', box(0.26, 0.15, 0.02, 0.65, th + 0.5, bz - 0.19));
  P.add('turret', 'paint', box(0.55, 0.38, 0.45, -0.85, th + 0.19, bz + 0.6)); P.add('turret', 'glass', box(0.4, 0.2, 0.02, -0.85, th + 0.22, bz + 0.83));
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
    K.headlight(P, 'hull', s * 1.35, fy + 0.25, hl - 0.6);
    K.stowageBox(P, 'hull', s * 1.2, H - 0.45, -hl + 0.15, 0.9, 0.55, 0.25);
  }
  // front engine deck grilles on the long glacis (rotated)
  for (let i = 0; i < 6; i++) P.add('hull', 'dark', T(new THREE.BoxGeometry(2.2, 0.03, 0.08), 0, 1.15 + i * 0.08, hl - 0.4 - i * 0.29, -0.24, 0, 0));
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
  P.add('turret', 'paint', cylY(0.2, 0.35, 12, 0.7, th + 0.17, bz - 0.6)); P.add('turret', 'paint', box(0.36, 0.32, 0.42, 0.7, th + 0.5, bz - 0.6)); P.add('turret', 'glass', box(0.26, 0.16, 0.02, 0.7, th + 0.52, bz - 0.38));
  P.add('turret', 'paint', box(0.5, 0.35, 0.45, -0.55, th + 0.17, bz + 0.6)); P.add('turret', 'glass', box(0.36, 0.18, 0.02, -0.55, th + 0.2, bz + 0.83));
  K.cupola(P, 'turret', 0.7, th, bz - 1.2, 0.36, 0.18, 8, 'modern'); K.mg(P, 'turret', 0.7, th + 0.3, bz - 0.95, 0, 'mag');
  K.hatch(P, 'turret', -0.6, th, bz - 1.25, 0.3); K.mg(P, 'turret', -0.6, th + 0.3, bz - 1.0, 0, 'mag');
  K.antenna(P, 'turret', -1.3, th, bz - 2.0, 2.5); K.antenna(P, 'turret', 1.3, th, bz - 2.0, 2.0);
  P.add('gun', 'paint', box(0.5, 0.45, 0.6, 0, 0, 0)); P.add('gun', 'canvas', cylZ(0.22, 0.4, 12, 0, 0, 0.45, 0.16));
  K.barrel(P, 'barrel', d.gunLen, { r0: 0.13, r1: 0.085, evac: { z: 2.8, r: 0.15, len: 0.9 }, sleeve: 6, mrs: true });
  return { P, ...g, wheelType: 'disc', cast: 0.15, castTurret: 0.1, turretPos: [0, H, d.turretZ], gunPos: [0, 0.38, bz + tl - 1.0], decals: decalsSide('text', '3', 'turret', tw * 0.88 + 0.05, th * 0.4, bz - 1.2, 0.45) };
}

const V2 = { panther, is2, pershing, centurion, leo1, leo2a6, t90m, chally2, type99a, merkava4 };
export function buildV2(d, spec) {
  const f = V2[spec && spec.id]; if (!f) throw new Error('No builder for ' + (spec && spec.id));
  return f(d);
}
