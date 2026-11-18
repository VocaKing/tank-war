// v2 tank builders (Panther, IS-2, Pershing, Centurion, Leopard 1A5, Leopard 2A6, T-90M, Challenger 2, Type 99A, Merkava Mk4).
// Real-scale (1 unit = 1 m), +z = front. Dimensions come from spec.dims so hit boxes and visuals agree.
import * as THREE from 'three';
import { T, box, cylY, cylX, cylZ, sideExtrude, topExtrude, taper, superEllipse, Parts } from './geom.js';
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
    if (o.inter) { wheels.push({ z, y, r: o.r, w: 0.17, xo: i % 2 ? 0.19 : -0.12 }); wheels.push({ z, y, r: o.r, w: 0.17, xo: i % 2 ? -0.12 : 0.19 }); }
    else wheels.push({ z, y, r: o.r, w: o.w });
  }
  const rollers = (o.rollers || []).map((z) => ({ z, y: o.ry, r: o.rr || 0.08 }));
  return { wheels, sprockets: [o.spr], idlers: [o.idl], rollers };
}
const trackTop = (g) => Math.max(...[...g.wheels, ...g.sprockets, ...g.idlers, ...g.rollers].map((c) => c.y + c.r)) + 0.075;
function decalsSide(kind, text, part, x, y, z, s) { return [{ kind, text, part, pos: [x, y, z], ry: Math.PI / 2, s }, { kind, text, part, pos: [-x, y, z], ry: -Math.PI / 2, s }]; }
function turretBody(P, poly, h, sx, sz, cz, y0 = 0) { P.add('turret', 'paint', taper(topExtrude(poly, h, y0, 0.03, 1), y0, y0 + h, sx, sz, cz)); }
function deckGrilles(P, x0, x1, y, z0, z1, n) { P.add('hull', 'dark', box(x1 - x0, 0.02, z1 - z0, (x0 + x1) / 2, y + 0.005, (z0 + z1) / 2)); for (let i = 0; i < n; i++) P.add('hull', 'paint', box(x1 - x0, 0.035, 0.04, (x0 + x1) / 2, y + 0.02, z0 + ((z1 - z0) * (i + 0.5)) / n)); }
function chainCurtain(P, x0, x1, y, z, n = 18, len = 0.42) {
  for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * i) / (n - 1); P.add('turret', 'metal', cylY(0.012, len, 4, x, y - len / 2, z)); P.add('turret', 'metal', T(new THREE.SphereGeometry(0.055, 8, 6), x, y - len - 0.03, z)); }
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
  K.profileWelds(P, prof, (y) => (d.W / 2 - 0.01) * (1 - 0.28 * Math.max(0, (y - fy) / (H - fy))), fy);
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
  P.add('hull', 'metal', cylY(0.08, 0.5, 10, 0, H - 0.45, -hl - 0.1));
  K.spareLinks(P, 'hull', 0.0, c + 0.55, -hl - 0.03, 4, d.trackW, 0.15, 0, -Math.PI / 2);
  K.jerrycans(P, 'hull', -1.2, H - 0.4, -hl + 0.3, 2, 0);
  for (const s of [-1, 1]) { K.towCable(P, 'hull', s * 1.25, H - 0.12, -1.6, 1.4, 0.0); K.tools(P, 'hull', s * 0.95, H, 0.2, s); K.boltRow(P, 'hull', [s * 1.4, H - 0.1, -1.2], [s * 1.4, H - 0.1, 0.8], 5, 0.018, 'x'); }
  K.skirt(P, 1.74, fy + 0.04, -hl + 0.55, hl - 0.75, 0.55, 6, 0.012); K.skirt(P, -1.74, fy + 0.04, -hl + 0.55, hl - 0.75, 0.55, 6, 0.012);
  K.antenna(P, 'hull', 1.0, H, -hl + 0.5, 1.9);
  // turret: narrow-fronted, steeply sloped sides
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  turretBody(P, [[-tw, bz - tl + 0.1], [tw, bz - tl + 0.1], [tw, bz + tl - 0.55], [tw * 0.62, bz + tl - 0.1], [-tw * 0.62, bz + tl - 0.1], [-tw, bz + tl - 0.55]], d.turretH, 0.76, 0.93, bz);
  K.cupola(P, 'turret', -0.52, d.turretH, bz - 0.55, 0.33, 0.27, 7, 'ww2');
  K.mg(P, 'turret', -0.52, d.turretH + 0.42, bz - 0.55, 0, 'mg34');
  K.hatch(P, 'turret', 0.42, d.turretH, bz - 0.2, 0.26); K.periscope(P, 'turret', 0.42, d.turretH, bz + 0.25, 0, 0.8);
  P.add('turret', 'paint', cylZ(0.36, 0.08, 16, 0, 0.42, bz - tl + 0.08)); // rear escape hatch
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.add('turret', 'metal', cylZ(0.04, 0.24, 8, s * 0.82, 0.62, bz + 0.6 - i * 0.12, 0.04, -0.6));
  K.liftHooks(P, 'turret', [[-0.6, d.turretH, bz + 0.6], [0.6, d.turretH, bz + 0.6], [0, d.turretH, bz - 0.9]]);
  // gun: "chin" mantlet + 75 mm KwK 42 L/70 with double-baffle brake
  const gz = bz + tl - 0.1;
  P.add('gun', 'paint', cylX(0.38, 1.25, 20, 0, -0.02, 0.05)); P.add('gun', 'paint', box(1.25, 0.25, 0.3, 0, -0.32, 0.05)); P.add('gun', 'dark', box(0.1, 0.07, 0.04, 0.38, 0.12, 0.43));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.12, r1: 0.07, brake: { type: 'double', r: 0.105, len: 0.42 } });
  return { P, ...g, wheelType: 'disc', cast: 0.35, castTurret: 0.4, turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, gz], decals: [...decalsSide('cross', '', 'turret', tw * 0.9 + 0.05, 0.42, bz - 0.4, 0.42), ...decalsSide('text', '211', 'turret', tw * 0.9 + 0.05, 0.42, bz + 0.25, 0.5)] };
}

function is2(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.3, z1: 2.0, r: 0.28, w: 0.5, rollers: [-1.5, 0.0, 1.5], ry: 0.97, rr: 0.1, spr: { z: -hl + 0.35, y: 0.76, r: 0.33 }, idl: { z: hl - 0.32, y: 0.7, r: 0.3 } });
  const fy = trackTop(g);
  // model 1944 "straightened nose": one flat 100 mm upper glacis at 60° from vertical, lower plate at ~30° (not the stepped 1943 cast nose)
  const prof = [[-hl + 0.2, c], [hl - 0.42, c], [hl, 0.98], [hl - 1.5, H], [-hl + 0.12, H], [-hl, 1.42], [-hl, c + 0.2]];
  const inner = hullShell(P, d, prof, fy, { sideTaper: 0.86 });
  K.profileWelds(P, prof, (y) => (d.W / 2 - 0.01) * (1 - 0.14 * Math.max(0, (y - fy) / (H - fy))), fy);
  torsionArms(P, inner, g, c);
  P.add('hull', 'dark', box(0.32, 0.06, 0.03, 0, 1.47, hl - 0.85, -60 * DEG)); P.add('hull', 'paint', box(0.42, 0.14, 0.12, 0, 1.45, hl - 0.86, -60 * DEG)); // driver vision block on the flat glacis
  K.headlight(P, 'hull', -1.2, fy + 0.15, hl - 0.25);
  for (const s of [-1, 1]) {
    P.add('hull', 'paint', cylZ(0.17, 0.95, 14, s * 1.28, fy + 0.18, -1.6)); P.add('hull', 'metal', box(0.4, 0.04, 0.05, s * 1.28, fy + 0.05, -1.3)); P.add('hull', 'metal', box(0.4, 0.04, 0.05, s * 1.28, fy + 0.05, -1.9)); // external fuel tanks
    K.stowageBox(P, 'hull', s * 1.3, fy + 0.2, 0.6, 0.42, 0.36, 0.9);
    K.exhaust(P, 'hull', s * 0.55, 1.3, -hl - 0.1, 'ww2', 0.09, 0.4);
    K.towCable(P, 'hull', s * 1.05, H - 0.05, -2.4, 0.8);
  }
  K.tools(P, 'hull', 1.3, fy + 0.02, 1.9, 1);
  deckGrilles(P, -0.7, 0.7, H, -hl + 0.5, -hl + 1.6, 6); P.add('hull', 'paint', box(1.6, 0.06, 0.5, 0, H + 0.02, -hl + 2.1));
  K.spareLinks(P, 'hull', -0.45, 1.12, hl - 0.3, 3, d.trackW, 0.16, 0, -60 * DEG);
  // cast turret
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  const poly = superEllipse(tw, 1.12, 1.3, 2.2, 40).map(([x, z]) => [x, z + bz]);
  turretBody(P, poly, d.turretH * 0.9, 0.8, 0.82, bz);
  K.castSeam(P, 'turret', poly, 0, d.turretH * 0.9, 0.8, 0.82, bz, 0.45, 0.03, 2); P.add('turret', 'paint', taper(topExtrude(superEllipse(tw * 0.8, 0.9, 1.05, 2.2, 32).map(([x, z]) => [x, z + bz]), 0.1, d.turretH * 0.88, 0.05, 2), d.turretH * 0.88, d.turretH * 0.98, 0.9, 0.9, bz));
  P.add('turret', 'paint', box(1.0, 0.55, 0.45, 0, 0.45, bz + 1.0)); for (const s of [-1, 1]) P.add('turret', 'paint', cylY(0.25, 0.6, 12, s * 0.62, 0.42, bz + 0.95));
  K.cupola(P, 'turret', -0.5, d.turretH * 0.95, bz - 0.45, 0.3, 0.26, 6, 'ww2');
  K.hatch(P, 'turret', 0.45, d.turretH * 0.96, bz - 0.4, 0.25); K.mg(P, 'turret', 0.45, d.turretH + 0.25, bz - 0.4, 0, 'dshk');
  P.add('turret', 'paint', T(new THREE.SphereGeometry(0.11, 10, 8), 0, 0.5, bz - 1.25)); P.add('turret', 'dark', cylZ(0.02, 0.3, 6, 0, 0.5, bz - 1.4)); // rear MG
  for (const s of [-1, 1]) K.grabRail(P, 'turret', [s * 0.95, 0.55, bz - 0.4], [s * 0.88, 0.55, bz + 0.3], 0.0);
  K.periscope(P, 'turret', 0.3, d.turretH * 0.95, bz + 0.3, 0, 0.8);
  P.add('gun', 'paint', box(0.95, 0.62, 0.32, 0, 0, 0.05)); P.add('gun', 'paint', cylZ(0.22, 0.45, 14, 0, 0, 0.35));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.14, r1: 0.085, brake: { type: 'double', r: 0.155, len: 0.55 } });
  return { P, ...g, wheelType: 'disc', cast: 0.6, castTurret: 1.0, turretPos: [0, H, d.turretZ], gunPos: [0, 0.45, bz + 1.22], decals: decalsSide('text', '23', 'turret', tw * 0.94, 0.4, bz - 0.2, 0.55) };
}

function pershing(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.15, z1: 2.0, r: 0.33, w: 0.48, rollers: [-1.9, -1.0, 0.0, 1.0, 1.9], ry: 0.98, rr: 0.085, spr: { z: -hl + 0.35, y: 0.78, r: 0.33 }, idl: { z: hl - 0.33, y: 0.72, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.25, c], [hl - 0.5, c], [hl, 0.95], [hl - 1.12, H], [-hl + 0.05, H], [-hl, 1.38], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  K.profileWelds(P, prof, d.W / 2 - 0.01, fy);
  torsionArms(P, inner, g, c);
  P.add('hull', 'paint', T(new THREE.SphereGeometry(0.14, 12, 8), 0.6, 1.35, hl - 0.6)); P.add('hull', 'dark', cylZ(0.02, 0.35, 6, 0.6, 1.4, hl - 0.45));
  for (const s of [-1, 1]) { K.headlight(P, 'hull', s * 1.3, fy + 0.12, hl - 0.15); K.hatch(P, 'hull', s * 0.6, H, hl - 1.45, 0.27, { periscope: true }); P.add('hull', 'paint', box(0.06, 0.32, d.L * 0.92, s * (d.W / 2 + 0.01), fy - 0.15, 0)); }
  for (const s of [-1, 1]) P.add('hull', 'metal', cylZ(0.08, 0.12, 10, s * 0.9, c + 0.3, hl - 0.15));
  deckGrilles(P, -1.1, 1.1, H, -hl + 0.35, -hl + 1.75, 9);
  P.add('hull', 'paint', box(2.2, 0.35, 0.1, 0, 1.25, -hl - 0.08)); for (const s of [-1, 1]) P.add('hull', 'metal', box(0.5, 0.28, 0.1, s * 0.6, 1.25, -hl - 0.15));
  K.tools(P, 'hull', 0.0, H, -hl + 2.6, 1); K.towCable(P, 'hull', 1.4, fy + 0.04, -2.0, 1.0); K.jerrycans(P, 'hull', -1.45, fy, -2.4, 3, Math.PI / 2);
  K.stowageBox(P, 'hull', -1.4, fy + 0.18, 0.6, 0.45, 0.34, 1.0);
  // cast turret with bustle
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  turretBody(P, superEllipse(tw, 1.05, 1.62, 2.5, 40).map(([x, z]) => [x, z + bz]), d.turretH, 0.84, 0.9, bz);
  K.castSeam(P, 'turret', superEllipse(tw, 1.05, 1.62, 2.5, 40).map(([x, z]) => [x, z + bz]), 0, d.turretH, 0.84, 0.9, bz, 0.5, 0.03, 2);
  K.cupola(P, 'turret', 0.55, d.turretH, bz - 0.5, 0.33, 0.26, 6, 'ww2'); K.mg(P, 'turret', 0.55, d.turretH + 0.42, bz - 0.5, 0, 'm2');
  K.hatch(P, 'turret', -0.5, d.turretH, bz - 0.35, 0.27); K.periscope(P, 'turret', -0.45, d.turretH, bz + 0.35, 0, 0.8);
  K.antenna(P, 'turret', -0.8, d.turretH * 0.8, bz - 1.2, 2.2); K.stowageBox(P, 'turret', 0, 0.35, bz - 1.75, 1.6, 0.35, 0.3);
  K.liftHooks(P, 'turret', [[-0.85, d.turretH * 0.8, bz + 0.5], [0.85, d.turretH * 0.8, bz + 0.5]]);
  P.add('gun', 'paint', box(1.05, 0.62, 0.3, 0, 0, 0.05)); P.add('gun', 'paint', cylZ(0.2, 0.4, 14, 0, 0, 0.35)); P.add('gun', 'dark', cylZ(0.025, 0.4, 6, 0.32, 0.0, 0.25)); P.add('gun', 'dark', box(0.1, 0.08, 0.04, -0.33, 0.14, 0.21));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.12, r1: 0.075, brake: { type: 'single', r: 0.1, len: 0.32 } });
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
  turretBody(P, superEllipse(tw * 0.9, 1.35, 1.6, 3.0, 40).map(([x, z]) => [x, z + bz]), d.turretH, 0.86, 0.93, bz);
  K.castSeam(P, 'turret', superEllipse(tw * 0.9, 1.35, 1.6, 3.0, 40).map(([x, z]) => [x, z + bz]), 0, d.turretH, 0.86, 0.93, bz, 0.5, 0.03, 2);
  for (const s of [-1, 1]) { K.stowageBox(P, 'turret', s * (tw * 0.92 + 0.05), 0.38, bz - 0.3, 0.26, 0.5, 1.7); K.smokeDischargers(P, 'turret', s * 0.95, 0.72, bz + 1.1, s * 0.7, 6, 0.08, 0.2, 0.035); }
  for (let i = 0; i < 6; i++) P.add('turret', 'metal', box(0.02, 0.4, 0.02, -1.0 + i * 0.4, 0.35, bz - 1.75)); P.add('turret', 'metal', box(2.05, 0.03, 0.4, 0, 0.16, bz - 1.6)); P.add('turret', 'metal', box(2.05, 0.03, 0.03, 0, 0.55, bz - 1.78));
  P.add('turret', 'canvas', box(1.6, 0.25, 0.25, 0, 0.3, bz - 1.6));
  K.cupola(P, 'turret', 0.55, d.turretH, bz - 0.3, 0.36, 0.25, 8, 'modern'); K.mg(P, 'turret', 0.55, d.turretH + 0.45, bz - 0.3, 0, 'mag');
  K.hatch(P, 'turret', -0.55, d.turretH, bz - 0.25, 0.3); K.antenna(P, 'turret', -0.9, d.turretH * 0.8, bz - 1.0); K.antenna(P, 'turret', 0.95, d.turretH * 0.8, bz - 1.05, 1.6);
  P.add('gun', 'paint', box(0.72, 0.52, 0.28, 0, 0, 0.02)); P.add('gun', 'canvas', cylZ(0.24, 0.4, 14, 0, 0, 0.35, 0.16));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.12, r1: 0.074, evac: { z: 2.9, r: 0.14, len: 0.75 } });
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
  K.hatch(P, 'turret', 0.6, d.turretH, bz - 0.4, 0.3); K.antenna(P, 'turret', -0.85, d.turretH * 0.75, bz - 1.1, 2.0);
  P.add('gun', 'paint', box(0.68, 0.5, 0.26, 0, 0, 0.02)); P.add('gun', 'canvas', cylZ(0.22, 0.38, 14, 0, 0, 0.32, 0.15));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.11, r1: 0.07, evac: { z: 2.6, r: 0.13, len: 0.7 } });
  return { P, ...g, wheelType: 'disc', cast: 0.3, castTurret: 0.2, turretPos: [0, H, d.turretZ], gunPos: [0, 0.38, bz + 1.15], decals: decalsSide('cross', '', 'turret', tw * 0.95, 0.4, bz - 0.3, 0.4) };
}

function leo2a6(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 7, z0: -2.6, z1: 2.4, r: 0.36, w: 0.46, rollers: [-2.2, -0.8, 0.6, 2.0], ry: 1.03, spr: { z: -hl + 0.4, y: 0.75, r: 0.34 }, idl: { z: hl - 0.35, y: 0.68, r: 0.31 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.35, c], [hl - 0.8, c], [hl - 0.05, 0.98], [hl - 1.0, H], [-hl + 0.15, H], [-hl, H - 0.15], [-hl + 0.05, c + 0.2]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 + 0.02), fy + 0.03, -hl + 0.4, hl - 0.45, 0.5, 7, 0.028, 0, 'rubber');
    K.headlight(P, 'hull', s * 1.4, H - 0.08, hl - 0.85);
    deckGrilles(P, s * 0.5, s * 1.6, H, -hl + 0.35, -hl + 2.0, 11);
    K.exhaust(P, 'hull', s * 1.3, fy + 0.25, -hl - 0.02, 'modern', 0.13, 0.65);
  }
  K.tools(P, 'hull', -0.3, H, -hl + 2.8, 1); K.towCable(P, 'hull', 0.0, H + 0.04, hl - 2.3, hl - 1.2);
  K.hatchRect(P, 'hull', -0.7, H, hl - 1.35, 0.58, 0.52);
  // Leopard 2A6 turret with spaced armor wedges
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  turretBody(P, [[tw * 0.5, bz + tl], [tw, bz + tl - 0.7], [tw, bz - tl + 0.4], [tw * 0.9, bz - tl], [-tw * 0.9, bz - tl], [-tw, bz - tl + 0.4], [-tw, bz + tl - 0.7], [-tw * 0.5, bz + tl]], d.turretH, 0.92, 0.96, bz);
  for (const s of [-1, 1]) {
    P.add('turret', 'darkN', box(0.03, d.turretH * 0.55, 0.5, s * (tw + 0.02), d.turretH * 0.4, bz + 0.3)); // spaced wedge cue
    K.smokeDischargers(P, 'turret', s * (tw - 0.05), d.turretH * 0.8, bz - 0.5, s * Math.PI / 2, 8, 0.09, 0.2, 0.035);
    K.boltRow(P, 'turret', [s * tw * 0.97, d.turretH * 0.55, bz - 0.9], [s * tw * 0.97, d.turretH * 0.55, bz + 0.7], 7, 0.018, 'x');
  }
  P.add('turret', 'paint', box(0.6, 0.38, 0.7, -0.7, d.turretH + 0.18, bz + 0.95)); P.add('turret', 'glass', box(0.42, 0.22, 0.02, -0.7, d.turretH + 0.22, bz + 1.28)); // EMES 15
  P.add('turret', 'paint', cylY(0.22, 0.32, 12, 0.6, d.turretH + 0.16, bz + 0.15)); P.add('turret', 'paint', box(0.35, 0.28, 0.38, 0.6, d.turretH + 0.45, bz + 0.15)); P.add('turret', 'glass', box(0.24, 0.13, 0.02, 0.6, d.turretH + 0.48, bz + 0.35)); // PERI R17
  K.hatch(P, 'turret', 0.65, d.turretH, bz - 0.45, 0.32); K.antenna(P, 'turret', -0.9, d.turretH * 0.7, bz - 1.15, 2.1);
  P.add('gun', 'paint', box(0.7, 0.52, 0.28, 0, 0, 0.02)); P.add('gun', 'canvas', cylZ(0.23, 0.4, 14, 0, 0, 0.33, 0.16));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.12, r1: 0.075, evac: { z: 3.1, r: 0.145, len: 0.8 } });
  return { P, ...g, wheelType: 'disc', cast: 0.25, castTurret: 0.15, turretPos: [0, H, d.turretZ], gunPos: [0, 0.4, bz + 1.2], decals: decalsSide('cross', '', 'turret', tw * 0.96, 0.42, bz - 0.25, 0.42) };
}

function t90m(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.2, z1: 2.0, r: 0.375, w: 0.48, rollers: [-1.8, -0.6, 0.6, 1.8], ry: 1.0, spr: { z: -hl + 0.36, y: 0.74, r: 0.32 }, idl: { z: hl - 0.32, y: 0.68, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.25, c], [hl - 0.7, c], [hl - 0.05, 0.95], [hl - 1.1, H], [-hl + 0.1, H], [-hl, H - 0.25], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  // Relikt ERA
  const slopeV = (dx, dy) => Math.atan2(dy, dx);
  eraBlocks(P, 'hull', [-1.3, 0.94, hl - 0.06], [1, 0, 0], slopeV(1.46, 0.56), 10, 3, 0.28, 0.48, 0.08);
  K.boltRow(P, 'hull', [1.4, 0.9, hl - 0.4], [1.4, 0.9, -hl + 1.5], 8, 0.016, 'x');
  for (const s of [-1, 1]) {
    sideEra(P, 'hull', s, s * (d.W / 2 + 0.02), fy - 0.6, hl - 0.25, 4, 2, 0.48, 0.3, 0.09);
    K.skirt(P, s * (d.W / 2 + 0.02), fy + 0.03, -hl + 2.0, hl - 2.2, 0.55, 3, 0.03, 0, 'rubber');
    K.exhaust(P, 'hull', s * 0.7, fy + 0.2, -hl - 0.05, 'modern', 0.1, 0.5);
  }
  K.tools(P, 'hull', 0.2, H, -hl + 2.5, 1); K.stowageBox(P, 'hull', -1.3, fy + 0.2, -hl + 0.8, 0.4, 0.35, 0.7);
  K.hatchRect(P, 'hull', -0.6, H, hl - 1.25, 0.5, 0.48);
  // turret with cassette front module
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  for (const s of [-1, 1]) {
    const x0 = s * 0.4, x1 = s * (tw + 0.08), zf = bz + tl + 0.12, zb = bz + tl - 1.0;
    const poly = [[x0, zf], [x1, zf - 0.32], [x1, zb], [x0, zb]]; if (s < 0) poly.reverse();
    const g = topExtrude(poly, d.turretH * 0.92, 0.02, 0.02, 1); P.add('turret', 'paint', g);
    sideEra(P, 'turret', s, s * (tw + 0.02), 0.1, bz + tl - 0.95, 3, 1, 0.42, 0.3, 0.09);
  }
  K.slatCage(P, 'turret', -1.45, 1.45, 0.05, d.turretH + 0.05, bz - tl - 0.45, 12);
  K.hatch(P, 'turret', 0.55, d.turretH, bz - 0.7, 0.28); K.antenna(P, 'turret', -0.8, d.turretH * 0.65, bz - 1.2, 1.8);
  P.add('gun', 'paint', box(0.65, 0.48, 0.25, 0, 0, 0.02));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.11, r1: 0.068, brake: { type: 'single', r: 0.095, len: 0.28 } });
  return { P, ...g, wheelType: 'disc', cast: 0.4, castTurret: 0.3, turretPos: [0, H, d.turretZ], gunPos: [0, 0.38, bz + 1.05], decals: decalsSide('text', 'T-90M', 'turret', tw * 0.9, 0.4, bz - 0.3, 0.45) };
}

function chally2(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.3, z1: 2.1, r: 0.38, w: 0.5, rollers: [-1.9, -0.7, 0.5, 1.7], ry: 1.02, spr: { z: -hl + 0.38, y: 0.76, r: 0.34 }, idl: { z: hl - 0.34, y: 0.7, r: 0.31 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.3, c], [hl - 0.75, c], [hl - 0.05, 0.97], [hl - 1.05, H], [-hl + 0.12, H], [-hl, H - 0.2], [-hl + 0.05, c + 0.18]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 + 0.03), fy + 0.03, -hl + 0.4, hl - 0.5, 0.52, 6, 0.03, 0, 'rubber');
    K.headlight(P, 'hull', s * 1.35, H - 0.1, hl - 0.9);
    K.stowageBox(P, 'hull', s * 1.3, fy + 0.22, -1.2, 0.45, 0.38, 0.8);
  }
  K.tools(P, 'hull', 0.0, H, -hl + 2.6, 1); K.towCable(P, 'hull', 1.2, H - 0.05, -2.0, 1.2);
  deckGrilles(P, -0.9, 0.9, H, -hl + 0.4, -hl + 1.9, 9);
  K.hatchRect(P, 'hull', -0.65, H, hl - 1.4, 0.55, 0.5);
  // Challenger 2 high bustle turret
  const tw = d.turretW / 2, bz = d.turretBoxZ || 0;
  turretBody(P, superEllipse(tw * 0.95, 1.4, 1.7, 2.8, 40).map(([x, z]) => [x, z + bz]), d.turretH, 0.88, 0.94, bz);
  K.castSeam(P, 'turret', superEllipse(tw * 0.95, 1.4, 1.7, 2.8, 40).map(([x, z]) => [x, z + bz]), 0, d.turretH, 0.88, 0.94, bz, 0.5, 0.03, 2);
  for (const s of [-1, 1]) { K.smokeDischargers(P, 'turret', s * (tw - 0.05), d.turretH * 0.75, bz - 0.4, s * Math.PI / 2, 5, 0.1, 0.22, 0.04); K.boltRow(P, 'turret', [s * tw * 0.96, d.turretH * 0.5, bz - 1.0], [s * tw * 0.96, d.turretH * 0.5, bz + 0.6], 6, 0.02, 'x'); }
  K.cupola(P, 'turret', 0.5, d.turretH, bz - 0.4, 0.35, 0.26, 7, 'modern'); K.mg(P, 'turret', 0.5, d.turretH + 0.4, bz - 0.4, 0, 'm2');
  K.hatch(P, 'turret', -0.55, d.turretH, bz - 0.3, 0.3); K.antenna(P, 'turret', -0.85, d.turretH * 0.7, bz - 1.1, 2.0);
  P.add('gun', 'paint', box(0.75, 0.55, 0.3, 0, 0, 0.02)); P.add('gun', 'canvas', cylZ(0.25, 0.42, 14, 0, 0, 0.35, 0.17));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.13, r1: 0.08, evac: { z: 2.8, r: 0.15, len: 0.75 } });
  return { P, ...g, wheelType: 'disc', cast: 0.5, castTurret: 0.7, turretPos: [0, H, d.turretZ], gunPos: [0, 0.42, bz + 1.3], decals: decalsSide('text', 'C2', 'turret', tw * 0.92, 0.4, bz - 0.25, 0.4) };
}

function type99a(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.25, z1: 2.05, r: 0.37, w: 0.47, rollers: [-1.85, -0.65, 0.55, 1.75], ry: 1.01, spr: { z: -hl + 0.37, y: 0.75, r: 0.33 }, idl: { z: hl - 0.33, y: 0.69, r: 0.3 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.28, c], [hl - 0.72, c], [hl - 0.05, 0.96], [hl - 1.08, H], [-hl + 0.1, H], [-hl, H - 0.22], [-hl + 0.05, c + 0.16]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  const slopeV = (dx, dy) => Math.atan2(dy, dx);
  eraBlocks(P, 'hull', [-1.25, 0.92, hl - 0.05], [1, 0, 0], slopeV(1.4, 0.55), 9, 3, 0.3, 0.5, 0.08);
  for (const s of [-1, 1]) {
    sideEra(P, 'hull', s, s * (d.W / 2 + 0.02), fy - 0.55, hl - 0.2, 4, 2, 0.46, 0.28, 0.09);
    K.skirt(P, s * (d.W / 2 + 0.02), fy + 0.03, -hl + 1.8, hl - 2.0, 0.52, 4, 0.028, 0, 'rubber');
  }
  K.tools(P, 'hull', 0.1, H, -hl + 2.4, 1); K.stowageBox(P, 'hull', -1.25, fy + 0.18, -hl + 0.6, 0.4, 0.34, 0.65);
  K.hatchRect(P, 'hull', -0.58, H, hl - 1.2, 0.52, 0.48);
  // arrowhead turret
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  turretBody(P, [[tw * 0.45, bz + tl], [tw, bz + tl - 0.65], [tw, bz - tl + 0.35], [tw * 0.88, bz - tl], [-tw * 0.88, bz - tl], [-tw, bz - tl + 0.35], [-tw, bz + tl - 0.65], [-tw * 0.45, bz + tl]], d.turretH, 0.9, 0.95, bz);
  for (const s of [-1, 1]) sideEra(P, 'turret', s, s * (tw + 0.02), 0.08, bz + tl - 0.9, 3, 1, 0.4, 0.28, 0.09);
  K.slatCage(P, 'turret', -1.4, 1.4, 0.04, d.turretH + 0.04, bz - tl - 0.4, 10);
  K.hatch(P, 'turret', 0.5, d.turretH, bz - 0.65, 0.27); K.antenna(P, 'turret', -0.75, d.turretH * 0.65, bz - 1.15, 1.7);
  P.add('gun', 'paint', box(0.62, 0.46, 0.24, 0, 0, 0.02));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.11, r1: 0.067, brake: { type: 'single', r: 0.092, len: 0.26 } });
  return { P, ...g, wheelType: 'disc', cast: 0.35, castTurret: 0.25, turretPos: [0, H, d.turretZ], gunPos: [0, 0.36, bz + 1.0], decals: decalsSide('text', '99A', 'turret', tw * 0.88, 0.38, bz - 0.28, 0.42) };
}

function merkava4(d) {
  const P = new Parts(); const hl = d.L / 2, H = d.hullH, c = d.clearance;
  const g = gear({ n: 6, z0: -2.2, z1: 2.0, r: 0.36, w: 0.46, rollers: [-1.8, -0.6, 0.6, 1.8], ry: 1.0, spr: { z: -hl + 0.35, y: 0.73, r: 0.32 }, idl: { z: hl - 0.32, y: 0.67, r: 0.29 } });
  const fy = trackTop(g);
  const prof = [[-hl + 0.25, c], [hl - 0.65, c], [hl - 0.05, 0.94], [hl - 1.0, H], [-hl + 0.1, H], [-hl, H - 0.2], [-hl + 0.05, c + 0.15]];
  const inner = hullShell(P, d, prof, fy, {});
  torsionArms(P, inner, g, c);
  for (const s of [-1, 1]) {
    K.skirt(P, s * (d.W / 2 + 0.02), fy + 0.03, -hl + 0.35, hl - 0.4, 0.5, 6, 0.025, 0, 'rubber');
    K.headlight(P, 'hull', s * 1.3, H - 0.08, hl - 0.8);
    K.stowageBox(P, 'hull', s * 1.25, fy + 0.2, -1.0, 0.42, 0.36, 0.75);
  }
  K.tools(P, 'hull', 0.0, H, -hl + 2.5, 1); K.towCable(P, 'hull', 1.1, H - 0.04, -1.8, 1.0);
  K.hatchRect(P, 'hull', -0.6, H, hl - 1.3, 0.52, 0.48);
  // front-engine, long wedge turret
  const tw = d.turretW / 2, tl = d.turretL / 2, bz = d.turretBoxZ || 0;
  turretBody(P, [[tw * 0.4, bz + tl], [tw, bz + tl - 0.55], [tw, bz - tl + 0.3], [tw * 0.85, bz - tl], [-tw * 0.85, bz - tl], [-tw, bz - tl + 0.3], [-tw, bz + tl - 0.55], [-tw * 0.4, bz + tl]], d.turretH, 0.88, 0.94, bz);
  chainCurtain(P, -1.3, 1.3, d.turretH * 0.3, bz + tl + 0.15, 16, 0.45);
  for (const s of [-1, 1]) K.smokeDischargers(P, 'turret', s * (tw - 0.05), d.turretH * 0.7, bz - 0.5, s * Math.PI / 2, 6, 0.09, 0.2, 0.035);
  K.hatch(P, 'turret', 0.5, d.turretH, bz - 0.6, 0.28); K.antenna(P, 'turret', -0.8, d.turretH * 0.65, bz - 1.1, 1.9);
  P.add('gun', 'paint', box(0.68, 0.5, 0.26, 0, 0, 0.02));
  K.barrel(P, 'gun', d.gunLen, { r0: 0.12, r1: 0.075, brake: { type: 'single', r: 0.1, len: 0.3 } });
  return { P, ...g, wheelType: 'disc', cast: 0.4, castTurret: 0.35, turretPos: [0, H, d.turretZ], gunPos: [0, 0.38, bz + 0.95], decals: decalsSide('text', 'Mk4', 'turret', tw * 0.9, 0.38, bz - 0.25, 0.4) };
}

const V2 = { panther, is2, pershing, centurion, leo1, leo2a6, t90m, chally2, type99a, merkava4 };
export function buildV2(d, spec) {
  const f = V2[spec && spec.id]; if (!f) throw new Error('No builder for ' + (spec && spec.id));
  return f(d);
}
