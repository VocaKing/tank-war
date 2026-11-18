// The three battlefields. 1 unit = 1 metre. Playable area 1.2 km x 1.2 km (1.44 km²) each,
// with terrain extending to 1.4 km plus a far-terrain horizon ring.
import { smoothstep, clamp, ridged } from '../util.js';
import { OCC } from './mapgen.js';

const houseStyle = (r) => ({ style: 'stone', floors: r.next() < 0.45 ? 2 : 1, roof: 'gable', ruined: r.next() < 0.12 });

export const MAPS = [
  {
    id: 'village', name: 'Normandy Countryside', subtitle: 'Saint-Aubin-sur-Orne',
    desc: 'Rolling bocage farmland cut by a river, with a stone village and church at its heart. Dense hedgerows give superb concealment; three bridges and a ford are the key crossings.',
    seed: 1944, playHalf: 600, terrainHalf: 700,
    sun: { elevation: 48, azimuth: 205 }, turbidity: 3.5, rayleigh: 1.4, fog: { color: 0xbcc8d2, density: 0.0011 }, exposure: 0.62,
    hdri: { file: 'kloofendal_48d_partly_cloudy_puresky', sunDir: [0.555, 0.742, 0.377], sunE: [4.35, 4.38, 3.98], horizon: [0.445, 0.479, 0.582], exposure: 0.82, fogDensity: 0.0009, heightFog: [0.03, 0.45, 1.25] },
    layers: { A: 'leafy_grass', B: 'forest_ground_04', C: 'aerial_rocks_02', D: 'gravel_road', tintA: [0.5, 0.76, 0.47], tintB: [0.86, 0.84, 0.76] },
    farColor: [0.36, 0.42, 0.26],
    generate(mb) {
      const r = mb.rng;
      mb.setHeights((x, z) => 12 + 13 * mb.fbm(x, z, 420, 4) + 4.5 * mb.fbm(x + 300, z, 140, 3) + 0.7 * mb.fbm(x, z, 33, 2) + 26 * smoothstep(320, 700, -z) + 10 * smoothstep(380, 700, x + z * 0.2));
      mb.bases = [{ x: -470, z: -20, r: 45 }, { x: 470, z: 40, r: 45 }];
      for (const b of mb.bases) mb.flatten(b.x, b.z, 60, 40);
      mb.flatten(190, -10, 140, 50);
      mb.river([[-40, -720], [10, -520], [-35, -320], [40, -130], [15, 60], [-45, 250], [5, 450], [55, 720]], 16, 2.5);
      mb.ford(-18, -400, 16); mb.ford(-20, 160, 13);
      mb.road([[-720, -40], [-480, -20], [-300, -90], [-120, -150], [30, -130], [140, -40], [190, 20], [320, 80], [480, 60], [720, 30]], 7, 'gravel');
      mb.road([[165, -720], [150, -420], [175, -200], [190, 20], [160, 200], [130, 420], [70, 720]], 6, 'gravel');
      mb.road([[-480, -20], [-430, 190], [-300, 370], [-130, 410], [-40, 300], [90, 250], [160, 200]], 5.5, 'gravel');
      mb.road([[-300, -90], [-330, -300], [-300, -460], [-200, -560]], 4.5, 'dirt');
      mb.road([[320, 80], [380, -150], [420, -330]], 4.5, 'dirt');
      // church + square
      mb.building({ x: 230, z: -10, w: 11, d: 24, rot: 0.15, style: 'stone', kind: 'church', floors: 3, roof: 'gable' });
      mb.occupyRect(205, 40, 18, 14, 0.15, OCC.RESERVED, 0);
      mb.settle(190, 0, 175, { spacing: 15, density: 0.9, w: [7, 10], d: [8, 13], make: houseStyle });
      for (const [fx, fz] of [[-330, -330], [-190, 385], [420, -310], [380, 330]]) {
        const rot = r.range(0, 3);
        for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; const bx = fx + Math.sin(a) * 18, bz = fz + Math.cos(a) * 18; if (mb.footFree(bx, bz, 7, 6, a)) mb.building({ x: bx, z: bz, w: r.range(8, 13), d: r.range(7, 10), rot: a, style: k === 2 ? 'brick' : 'stone', floors: k === 0 ? 2 : 1, roof: 'gable', barn: k > 1 }); }
        mb.prop('haystack', fx + 4, fz - 3); mb.prop('cart', fx - 5, fz + 2, rot);
      }
      // bocage hedgerows on a jittered 110 m field grid
      const F = 110; mb.fieldSize = F;
      for (let gz = -6; gz <= 6; gz++) for (let gx = -6; gx <= 6; gx++) {
        const x0 = gx * F, z0 = gz * F; if (Math.hypot(x0 - 190, z0) < 190) continue;
        for (const dir of [0, 1]) { if (r.next() > 0.72) continue;
          const pts = []; for (let k = 0; k <= 4; k++) { const t = k / 4; const px = dir ? x0 + F * t : x0, pz = dir ? z0 : z0 + F * t; pts.push([px + mb.noise(px / 40, pz / 40) * 6, pz + mb.noise(pz / 40, px / 40) * 6]); }
          const gap = r.int(1, 3); const a = pts.slice(0, gap), b = pts.slice(gap);
          if (a.length > 1) mb.hedgerow(a, { treeChance: 0.18, treeType: r.next() < 0.5 ? 'oak' : 'broadleaf', step: 6.5 }); if (b.length > 1) mb.hedgerow(b, { treeChance: 0.18, treeType: 'oak', step: 6.5 }); }
      }
      // orchard
      for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { const x = 40 + i * 9 + r.range(-1, 1), z = 300 + j * 9 + r.range(-1, 1); if (mb.isFree(x, z)) mb.tree(x, z, 'broadleaf', r.range(0.42, 0.55)); }
      // woods
      mb.scatter(9, (x, z) => { if (!mb.isFree(x, z, 3)) return 0; if (mb.bases.some((b) => Math.hypot(x - b.x, z - b.z) < 110)) return 0; if (Math.hypot(x - 190, z) < 200) return 0; const n = mb.fbm(x + 900, z - 400, 260, 4); return smoothstep(0.18, 0.34, n) * 0.9 + (Math.abs(x) > 640 || Math.abs(z) > 640 ? 0.5 : 0); },
        (x, z) => mb.tree(x, z, r.next() < 0.55 ? 'oak' : r.next() < 0.6 ? 'broadleaf' : 'birch', r.range(0.75, 1.2)));
      mb.scatter(60, (x, z) => (mb.isFree(x, z, 4) ? 0.35 : 0), (x, z) => mb.tree(x, z, 'oak', r.range(0.8, 1.25)));
      mb.scatter(22, (x, z) => { if (!mb.isFree(x, z, 4)) return 0; const n = mb.fbm(x + 900, z - 400, 260, 4); return n > 0.1 && n < 0.2 ? 0.6 : 0.05; }, (x, z) => mb.bush(x, z, r.range(3.5, 5.5), r.range(2.8, 3.8)));
      // telegraph poles along main road
      { const rd = mb.roads[0]; for (let i = 0; i < rd.pts.length; i += 22) { const [x, z] = rd.pts[i]; const j = Math.min(rd.pts.length - 1, i + 1); const dx = rd.pts[j][0] - x, dz = rd.pts[j][1] - z; const l = Math.hypot(dx, dz) || 1; const px = x + dz / l * 7, pz = z - dx / l * 7; if (mb.isFree(px, pz)) mb.prop('pole', px, pz, Math.atan2(dx, dz)); } }
      mb.scatter(70, (x, z) => (mb.isFree(x, z, 3) ? 0.25 : 0), (x, z) => mb.prop('haybale', x, z, r.range(0, 3)));
      mb.scatter(45, (x, z) => (mb.slope(x, z) > 0.35 && mb.isFree(x, z) ? 0.7 : 0.04), (x, z) => mb.rock(x, z, r.range(0.8, 2.4)));
      mb.lanes = [
        [[-470, -20], [-330, -250], [-18, -400], [250, -330], [470, 40]],
        [[-470, -20], [-300, -90], [-120, -150], [30, -130], [190, 20], [470, 40]],
        [[-470, -20], [-430, 190], [-130, 410], [-40, 300], [160, 200], [470, 40]],
      ];
      const F2 = mb.fieldSize;
      mb.finalize((x, z) => { const h = Math.abs(Math.sin(Math.floor(x / F2) * 12.9898 + Math.floor(z / F2) * 78.233) * 43758.5453) % 1; return h < 0.22 ? 0.75 : 0; },
        (x, z) => { const h = Math.abs(Math.sin(Math.floor(x / F2) * 12.9898 + Math.floor(z / F2) * 78.233) * 43758.5453) % 1; const n = mb.noise2(x / 60, z / 60) * 0.06;
          if (h > 0.22 && h < 0.42) return [1.13 + n, 1.07 + n, 0.78]; if (h > 0.42 && h < 0.55) return [0.98, 1.06, 0.84]; return [1 + n, 1 + n, 1 + n]; });
    },
  },
  {
    id: 'forest', name: 'Carpathian Forest', subtitle: 'Valley of the Prut',
    desc: 'Steep wooded hills and a mountain stream. Spruce forests and clearings, a sawmill hamlet in the valley and a ruined watchtower on the ridge. Long sightlines are rare; ambushes are common.',
    seed: 3121, playHalf: 600, terrainHalf: 700,
    sun: { elevation: 21, azimuth: 120 }, turbidity: 6, rayleigh: 2.0, fog: { color: 0xc7c3b4, density: 0.0019 }, exposure: 0.6,
    hdri: { file: 'kloofendal_overcast_puresky', sunDir: [0.70, 0.55, 0.45], sunE: [0.9, 0.9, 0.92], horizon: [0.56, 0.615, 0.68], exposure: 0.84, fogDensity: 0.00068, overcast: true, heightFog: [0.045, 0.3, 1.35] },
    layers: { A: 'forest_ground_04', B: 'leafy_grass', C: 'aerial_rocks_02', D: 'gravel_road', tintA: [0.76, 0.74, 0.66], tintB: [0.66, 0.86, 0.56] },
    farColor: [0.18, 0.24, 0.16],
    generate(mb) {
      const r = mb.rng;
      const valley = (x, z) => { const d = (x + z + 40 * mb.noise(x / 300, z / 300)) / Math.SQRT2; return Math.exp(-((d / 170) ** 2)); };
      mb.setHeights((x, z) => 40 + 26 * mb.fbm(x, z, 520, 4) + 34 * ridged(mb.noise, x / 380, z / 380, 4) - 34 * valley(x, z) + 1.2 * mb.fbm(x, z, 40, 2) + (x - z) * 0.018);
      mb.bases = [{ x: -430, z: -430, r: 45 }, { x: 430, z: 430, r: 45 }];
      for (const b of mb.bases) mb.flatten(b.x, b.z, 70, 50);
      mb.flatten(30, -40, 110, 50);
      mb.river([[700, -720], [480, -470], [300, -330], [140, -170], [80, -60], [-60, 70], [-200, 170], [-380, 360], [-720, 690]], 11, 2.0);
      mb.ford(300, -320, 12); mb.ford(-250, 220, 12);
      mb.road([[-430, -430], [-330, -300], [-200, -230], [-60, -120], [30, -40], [130, 40], [250, 170], [330, 320], [430, 430]], 6, 'gravel', { smooth: 14 });
      mb.road([[-700, -120], [-450, -60], [-250, 60], [-60, 70], [30, -40]], 5, 'gravel', { smooth: 14 });
      mb.road([[30, -40], [140, -170], [260, -420], [380, -700]], 5, 'gravel', { smooth: 14 });
      mb.road([[-430, -430], [-520, -150], [-470, 120], [-320, 330], [-100, 460], [150, 500], [430, 430]], 4.5, 'dirt', { smooth: 16 });
      mb.road([[-430, -430], [-150, -500], [150, -420], [380, -200], [500, 120], [430, 430]], 4.5, 'dirt', { smooth: 16 });
      // sawmill hamlet
      mb.settle(30, -40, 120, { spacing: 20, density: 0.8, w: [7, 9], d: [8, 12], make: (r) => ({ style: 'cabin', floors: r.next() < 0.3 ? 2 : 1, roof: 'gable' }) });
      mb.building({ x: 70, z: -95, w: 14, d: 26, rot: 0.8, style: 'cabin', floors: 1, roof: 'gable', barn: true });
      for (let i = 0; i < 6; i++) mb.prop('logs', 40 + r.range(-25, 25), -110 + r.range(-15, 15), r.range(0, 3));
      // watchtower ruin on the highest ground in the south-west quadrant
      let best = [-250, 250], bh = -1e9; for (let i = 0; i < 300; i++) { const x = r.range(-500, -50), z = r.range(80, 500); const h = mb.t.height(x, z); if (h > bh && mb.isFree(x, z, 20)) { bh = h; best = [x, z]; } }
      mb.building({ x: best[0], z: best[1], w: 9, d: 9, rot: 0.3, style: 'castle', kind: 'tower', floors: 5, roof: 'none', ruined: true });
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, a2 = (k + 0.75) / 8 * Math.PI * 2; if (k === 3) continue; mb.wall(best[0] + Math.cos(a) * 26, best[1] + Math.sin(a) * 26, best[0] + Math.cos(a2) * 26, best[1] + Math.sin(a2) * 26, r.range(1.5, 3.5), 'castle', 1.2); }
      mb.forestSeedTower = best;
      for (const [fx, fz] of [[-400, 150], [300, -480], [480, 90]]) for (let k = 0; k < 3; k++) { const a = r.range(0, 6); const bx = fx + Math.sin(a) * 15, bz = fz + Math.cos(a) * 15; if (mb.footFree(bx, bz, 6, 6, a)) mb.building({ x: bx, z: bz, w: 7, d: 9, rot: a, style: 'cabin', floors: 1, roof: 'gable' }); }
      // dense forest with clearings
      const forestD = (x, z) => { const n = mb.fbm(x - 500, z + 200, 230, 4); const clearing = smoothstep(-0.05, 0.12, n); const v = valley(x, z); return clearing * (1 - 0.65 * smoothstep(0.75, 0.95, v)); };
      mb.scatter(8.5, (x, z) => { if (!mb.isFree(x, z, 3)) return 0; if (mb.bases.some((b) => Math.hypot(x - b.x, z - b.z) < 100)) return 0; if (Math.hypot(x - 30, z + 40) < 120) return 0; if (Math.hypot(x - best[0], z - best[1]) < 40) return 0; return forestD(x, z) * (mb.quality === 'low' ? 0.55 : 0.92); },
        (x, z) => { const h = mb.t.height(x, z); mb.tree(x, z, h > 45 || r.next() < 0.7 ? 'spruce' : r.next() < 0.5 ? 'birch' : 'broadleaf', r.range(0.75, 1.25)); });
      // bushes at forest edges / clearings
      mb.scatter(14, (x, z) => { if (!mb.isFree(x, z, 4)) return 0; const f = forestD(x, z); return f > 0.05 && f < 0.6 ? 0.55 : 0.04; }, (x, z) => mb.bush(x, z, r.range(3.5, 5.2), r.range(2.8, 3.6)));
      mb.scatter(26, (x, z) => (mb.slope(x, z) > 0.4 && mb.isFree(x, z) ? 0.8 : 0.06), (x, z) => mb.rock(x, z, r.range(1, 3.5)));
      mb.lanes = [
        [[-430, -430], [-520, -150], [-470, 120], [-250, 220], [-100, 460], [430, 430]],
        [[-430, -430], [-200, -230], [30, -40], [250, 170], [430, 430]],
        [[-430, -430], [-150, -500], [300, -320], [500, 120], [430, 430]],
      ];
      mb.finalize((x, z, s) => { const v = valley(x, z); return clamp(1 - forestD(x, z) * 1.3, 0, 1) * 0.9 + v * 0.3; },
        (x, z) => { const n = mb.noise2(x / 80, z / 80) * 0.08; return [1 + n, 1 + n, 1 + n]; });
    },
  },
  {
    id: 'desert', name: 'Al-Qasr Desert Town', subtitle: 'Wadi Rasheed',
    desc: 'A sun-baked town of flat-roofed sandstone houses, a mosque and a market, partly ruined by fighting. Dunes and a rocky mesa surround it; a dry wadi with an oasis cuts the south.',
    seed: 1991, playHalf: 600, terrainHalf: 700,
    sun: { elevation: 34, azimuth: 250 }, turbidity: 8, rayleigh: 1.1, fog: { color: 0xd8c6a6, density: 0.00095 }, exposure: 0.56,
    hdri: { file: 'kloofendal_43d_clear_puresky', sunDir: [0.591, 0.682, 0.431], sunE: [6.45, 6.08, 5.56], horizon: [0.74, 0.72, 0.70], exposure: 0.8, fogDensity: 0.0008, heightFog: [0.022, 0.6, 1.15] },
    layers: { A: 'coast_sand_01', B: 'dry_ground_01', C: 'aerial_rocks_02', D: 'gravel_road', tintA: [1.08, 0.98, 0.84], tintB: [1.05, 0.95, 0.82] },
    farColor: [0.62, 0.5, 0.36],
    generate(mb) {
      const r = mb.rng;
      const town = (x, z) => 1 - smoothstep(240, 420, Math.hypot(x, z));
      mb.setHeights((x, z) => {
        const dune = Math.pow(0.5 + 0.5 * Math.sin((x * 0.8 + z * 0.6) / 42 + 3 * mb.fbm(x, z, 260, 3)), 2.2) * 7 * (1 - town(x, z));
        const mesaN = mb.fbm(x + 200, z - 300, 260, 4); const mesa = smoothstep(0.05, 0.16, mesaN) * 34 * smoothstep(-150, -380, z);
        return 6 + 5 * mb.fbm(x, z, 380, 3) + dune + mesa + 0.4 * mb.fbm(x, z, 25, 2);
      });
      mb.bases = [{ x: -460, z: 430, r: 45 }, { x: 460, z: -400, r: 45 }];
      for (const b of mb.bases) mb.flatten(b.x, b.z, 60, 50);
      mb.flatten(0, 0, 250, 90);
      mb.river([[-720, 260], [-450, 300], [-250, 340], [-50, 380], [150, 350], [350, 420], [720, 470]], 34, 2.8, { dry: true });
      mb.lake(-260, 335, 32, 2.2);
      // street grid
      const G = 55; const streets = [];
      for (let k = -4; k <= 4; k++) { streets.push([[k * G, -235], [k * G, 235]]); streets.push([[-235, k * G], [235, k * G]]); }
      mb.road([[-720, 150], [-460, 430 - 280], [-235, 0], [235, 0], [460, -150], [720, -200]], 9, 'asphalt');
      mb.road([[0, -720], [0, -235], [0, 235], [20, 420], [0, 720]], 8, 'asphalt');
      for (const s of streets) mb.road(s, 5, 'gravel', { smooth: 4, noBridges: true });
      mb.road([[-460, 430], [-300, 250], [-235, 110]], 5, 'gravel'); mb.road([[460, -400], [300, -250], [235, -110]], 5, 'gravel');
      // mosque on central square
      mb.building({ x: 55 + 27, z: -55 - 27, w: 22, d: 22, rot: 0, style: 'desert', kind: 'mosque', floors: 2, roof: 'flat' });
      mb.occupyRect(-27, 27, 20, 20, 0, OCC.RESERVED, 0); // market square
      for (let i = 0; i < 6; i++) mb.prop('stall', -27 + r.range(-14, 14), 27 + r.range(-14, 14), r.int(0, 3) * Math.PI / 2);
      // fill blocks
      for (let bi = -4; bi < 4; bi++) for (let bj = -4; bj < 4; bj++) {
        const cx = (bi + 0.5) * G, cz = (bj + 0.5) * G; const inner = G - 9;
        const nx = r.int(1, 3), nz = r.int(1, 3);
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          if (r.next() < 0.12) continue;
          const w = inner / nx - r.range(1.5, 4), d = inner / nz - r.range(1.5, 4);
          const x = cx - inner / 2 + (a + 0.5) * inner / nx, z = cz - inner / 2 + (b + 0.5) * inner / nz;
          if (!mb.footFree(x, z, w / 2, d / 2, 0)) continue;
          mb.building({ x, z, w: Math.min(w, 24), d: Math.min(d, 24), door: r.next() < 0.5 ? 1 : -1, rot: 0, style: 'desert', floors: r.next() < 0.3 ? 3 : r.next() < 0.6 ? 2 : 1, roof: 'flat', ruined: r.next() < 0.3 });
        }
      }
      // outlying farm compounds with walls
      for (const [fx, fz] of [[-380, -150], [330, 230], [-200, -420], [150, 470], [420, 120]]) {
        if (!mb.footFree(fx, fz, 10, 10, 0)) continue;
        mb.building({ x: fx, z: fz, w: 12, d: 9, rot: 0.2, style: 'desert', floors: 1, roof: 'flat', ruined: r.next() < 0.4 });
        const c = Math.cos(0.2), s = Math.sin(0.2); const P = [[-16, -14], [16, -14], [16, 14], [-16, 14]].map(([a, b]) => [fx + a * c + b * s, fz - a * s + b * c]);
        for (let k = 0; k < 4; k++) { const A = P[k], B = P[(k + 1) % 4]; const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; mb.wall(A[0], A[1], A[0] + (m[0] - A[0]) * 0.75, A[1] + (m[1] - A[1]) * 0.75, 2.2, 'adobe', 0.5); mb.wall(B[0], B[1], B[0] + (m[0] - B[0]) * 0.75, B[1] + (m[1] - B[1]) * 0.75, 2.2, 'adobe', 0.5); }
      }
      // palms: oasis, wadi, town gardens
      for (let i = 0; i < 40; i++) { const a = r.range(0, 6.28), d = r.range(36, 60); const x = -260 + Math.cos(a) * d, z = 335 + Math.sin(a) * d; if (mb.isFree(x, z)) mb.tree(x, z, 'palm', r.range(0.8, 1.2)); }
      mb.scatter(16, (x, z) => { const o = mb.t.occAt(x, z); const nearWadi = Math.abs(z - (300 + x * 0.1)) < 90; return (o === OCC.FREE || o === OCC.WATER) && nearWadi && mb.isFree(x, z) ? 0.25 : 0; }, (x, z) => mb.tree(x, z, 'palm', r.range(0.7, 1.15)));
      mb.scatter(30, (x, z) => (Math.hypot(x, z) < 240 && mb.isFree(x, z, 3) ? 0.3 : 0), (x, z) => mb.tree(x, z, 'palm', r.range(0.6, 1.0)));
      // dry scrub bushes (concealment) – denser along wadi and near town edges
      mb.scatter(18, (x, z) => { if (!mb.isFree(x, z, 4)) return 0; const nearWadi = Math.abs(z - (320 + x * 0.1)) < 80; const d = Math.hypot(x, z); return nearWadi ? 0.5 : d > 250 && d < 380 ? 0.28 : 0.1; }, (x, z) => mb.bush(x, z, r.range(3.4, 4.8), r.range(2.6, 3.3), 'dry'));
      mb.scatter(20, (x, z) => (mb.slope(x, z) > 0.45 && mb.isFree(x, z) ? 0.9 : 0.03), (x, z) => mb.rock(x, z, r.range(1.2, 4)));
      for (let i = 0; i < 14; i++) { const x = r.range(-400, 400), z = r.range(-400, 400); if (mb.isFree(x, z, 3)) mb.prop('wreck', x, z, r.range(0, 6)); }
      for (const [x, z] of [[-240, 0], [240, 0], [0, -240], [0, 240]]) for (let k = 0; k < 5; k++) { const px = x + r.range(-14, 14) + (x ? 0 : r.range(-12, 12)), pz = z + r.range(-14, 14); if (mb.isFree(px, pz)) mb.prop(k % 2 ? 'hedgehog' : 'sandbags', px, pz, r.range(0, 3)); }
      mb.lanes = [
        [[-460, 430], [-460, 150], [-380, -150], [-200, -420], [200, -460], [460, -400]],
        [[-460, 430], [-235, 110], [0, 0], [235, -110], [460, -400]],
        [[-460, 430], [-100, 470], [150, 470], [420, 120], [460, -400]],
      ];
      mb.finalize((x, z, s) => { const n = mb.fbm(x + 50, z, 120, 3); return smoothstep(-0.05, 0.25, n) * 0.8 + town(x, z) * 0.5; },
        (x, z) => { const n = mb.noise2(x / 90, z / 90) * 0.07; return [1 + n, 1 + n * 0.8, 1 + n * 0.6]; });
    },
  },
];
export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
