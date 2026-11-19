// Tank specifications with special abilities assigned
// Overpen moved to T-34 for balance

export const TANKS = [
  {
    id: 'sherman', tier: 1, cls: 'Medium', name: 'M4A3E8 Sherman "Easy Eight"', short: 'M4A3E8', nation: 'USA', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 33.7, power: 620, maxSpeed: 78, reverseSpeed: 14, hullTraverse: 42, turretTraverse: 38, gunSpeed: 6,
    gunDepression: 10, gunElevation: 25, hp: 900, viewRange: 380, reload: 5.0, aimTime: 1.6, dispersion: 0.38, movingDispersion: 0.95,
    dims: { L: 5.9, W: 2.99, hullH: 1.9, clearance: 0.43, trackW: 0.58, turretZ: 0.35, turretL: 2.3, turretW: 2.0, turretH: 0.85, gunLen: 4.2 },
    armor: { hull: { front: [63.5, 47], side: [38, 0], rear: [38, 10], top: [19, 0], bottom: [13, 0] }, turret: { front: [89, 30], side: [63, 5], rear: [63, 0], top: [25, 0] }, lowerFront: [108, 35], lowerSide: [38, 0], mantlet: [140, 0], era: 0, heatMult: 1.0 },
    engineZone: 'rear', ammoRack: { zMin: -0.6, zMax: 1.4, yMax: 1.0, chance: 0.05 },
    shells: [
      { name: 'M62 APCBC', type: 'APCBC', caliber: 76, pen: 116, velocity: 792, damage: 85, count: 45 },
      { name: 'M93 HVAP', type: 'APCR', caliber: 76, pen: 208, velocity: 1036, damage: 70, count: 6 },
      { name: 'M42A1 HE', type: 'HE', caliber: 76, pen: 12, velocity: 800, damage: 95, count: 20 },
    ],
    paint: { base: '#4a4b2e', camo: null, accent: '#3a3b24', pattern: 'solid', fade: 16, rough: 0.78 },
    desc: 'Late-war Sherman with the long 76 mm M1A2 gun, HVSS suspension and wet ammo stowage. Fast-firing and reliable, but thin side armor.',
    overspeed: { mult: 1.4, duration: 8, cooldown: 28 },
    magazine: { size: 12, intraReload: 0.4, fullReload: 18 },
  },
  {
    id: 't34', tier: 1, cls: 'Medium', name: 'T-34-85 (1944)', short: 'T-34-85', nation: 'USSR', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 32, power: 700, maxSpeed: 84, reverseSpeed: 10, hullTraverse: 38, turretTraverse: 36, gunSpeed: 5,
    gunDepression: 5, gunElevation: 22, hp: 850, viewRange: 340, reload: 5.6, aimTime: 1.7, dispersion: 0.40, movingDispersion: 0.98,
    dims: { L: 6.1, W: 3.0, hullH: 1.65, clearance: 0.4, trackW: 0.5, turretZ: 0.6, turretL: 2.45, turretW: 2.15, turretH: 0.85, gunLen: 4.65 },
    armor: { hull: { front: [45, 60], side: [45, 40], rear: [45, 45], top: [20, 0], bottom: [20, 0] }, turret: { front: [90, 20], side: [75, 20], rear: [52, 10], top: [20, 0] }, lowerFront: [45, 53], lowerSide: [45, 0], mantlet: [100, 0], era: 0, heatMult: 1.0 },
    engineZone: 'rear', ammoRack: { zMin: -0.8, zMax: 1.6, yMax: 0.9, chance: 0.08 },
    shells: [
      { name: 'BR-365 APBC', type: 'APCBC', caliber: 85, pen: 140, velocity: 792, damage: 190, count: 36 },
      { name: 'BR-365P APCR', type: 'APCR', caliber: 85, pen: 190, velocity: 1050, damage: 170, count: 5 },
      { name: 'O-365K HE', type: 'HE', caliber: 85, pen: 15, velocity: 793, damage: 290, count: 15 },
    ],
    paint: { base: '#4b5631', camo: null, accent: '#3d4728', pattern: 'solid', fade: 18, rough: 0.8 },
    desc: 'Mass-produced Soviet medium tank with superbly sloped armor, wide tracks and an 85 mm ZiS-S-53. Agile, cramped, and hard-hitting.',
    scan: { cooldown: 25, maxTargets: 3, range: 380 },
    overpen: { mult: 1.5, shots: 2, cooldown: 28 },
    magazine: { size: 4, intraReload: 1.3, fullReload: 14 },
  },
  {
    id: 'm1a2', tier: 4, cls: 'MBT', name: 'M1A2 Abrams', short: 'M1A2', nation: 'USA', era: 'Modern', year: 1992,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 62, power: 1724, maxSpeed: 68, reverseSpeed: 40, hullTraverse: 40, turretTraverse: 40, gunSpeed: 8,
    gunDepression: 10, gunElevation: 20, hp: 1800, viewRange: 520, reload: 6.0, aimTime: 1.8, dispersion: 0.18, movingDispersion: 0.42,
    dims: { turretBoxZ: -0.15, L: 7.93, W: 3.66, hullH: 1.55, clearance: 0.48, trackW: 0.64, turretZ: -0.25, turretL: 4.3, turretW: 3.4, turretH: 0.8, gunLen: 5.3 },
    armor: { hull: { front: [560, 20], side: [90, 0], rear: [35, 0], top: [40, 0], bottom: [25, 0] }, turret: { front: [820, 25], side: [250, 0], rear: [80, 0], top: [50, 0] }, lowerFront: [180, 30], lowerSide: [70, 0], mantlet: [380, 0], skirt: 70, era: 0, heatMult: 1.5 },
    engineZone: 'rear', ammoRack: { zMin: -2.6, zMax: -1.4, yMax: 9, chance: 0.0, turretBustle: true },
    shells: [
      { name: 'M829A3 APFSDS-T', type: 'APFSDS', caliber: 120, pen: 760, velocity: 1555, damage: 740, count: 22 },
      { name: 'M830A1 HEAT-MP-T', type: 'HEAT', caliber: 120, pen: 600, velocity: 1410, damage: 790, count: 12 },
      { name: 'M908 HE-OR-T', type: 'HE', caliber: 120, pen: 50, velocity: 1410, damage: 800, count: 8 },
    ],
    paint: { base: '#b5a07a', camo: null, accent: '#9c8963', pattern: 'solid', fade: 10, rough: 0.7 },
    desc: 'Modern US MBT: 1,500 hp gas turbine, DU composite armor, CITV hunter-killer sight with thermals, and the 120 mm M256 smoothbore. Fast in both directions.',
    magazine: { size: 3, intraReload: 1.4, fullReload: 12 },
    stabilize: { duration: 7, cooldown: 22 },
  },
];

export const TANK_BY_ID = Object.fromEntries(TANKS.map((t) => [t.id, t]));
export function sanitizeLoadout(spec, loadout) { return loadout || spec.shells.map((s) => s.count); }
export function npcLoadout(spec, r) { return spec.shells.map((s) => s.count); }
