// Tank specifications. Figures are grounded in published real-world data
// (armor in mm RHA / RHA-equivalent, slope in degrees from vertical,
// penetration in mm RHA at 100 m vs a flat plate, muzzle velocity in m/s).
// HP / damage are gameplay abstractions layered on top of the armor model.

export const TANKS = [
  {
    id: 'sherman', name: 'M4A3E8 Sherman "Easy Eight"', short: 'M4A3E8', nation: 'USA', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 33.7, power: 450, maxSpeed: 48, reverseSpeed: 12, hullTraverse: 32, turretTraverse: 24, gunSpeed: 5,
    gunDepression: 10, gunElevation: 25, hp: 900, viewRange: 380, reload: 6.0, aimTime: 2.3, dispersion: 0.45, stabilizer: 0.6,
    dims: { L: 5.9, W: 2.99, hullH: 1.9, clearance: 0.43, trackW: 0.58, turretZ: 0.35, turretL: 2.3, turretW: 2.0, turretH: 0.85, gunLen: 4.2 },
    armor: {
      hull: { front: [63.5, 47], side: [38, 0], rear: [38, 10], top: [19, 0], bottom: [13, 0] },
      turret: { front: [89, 30], side: [63, 5], rear: [63, 0], top: [25, 0] },
      era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.6, zMax: 1.4, yMax: 1.0, chance: 0.05 },
    shells: [
      { name: 'M62 APCBC', type: 'APCBC', caliber: 76, pen: 135, velocity: 792, damage: 230, count: 45 },
      { name: 'M93 HVAP', type: 'APCR', caliber: 76, pen: 208, velocity: 1036, damage: 200, count: 6 },
      { name: 'M42A1 HE', type: 'HE', caliber: 76, pen: 12, velocity: 800, damage: 340, count: 20 },
    ],
    paint: { base: '#4b4f2f', camo: null, accent: '#3a3d24' },
    desc: 'Late-war Sherman with the long 76 mm M1A2 gun, HVSS suspension and wet ammo stowage. Fast-firing and reliable, but thin side armor.',
  },
  {
    id: 'tiger', name: 'Panzerkampfwagen VI Tiger I Ausf. E', short: 'Tiger I', nation: 'Germany', era: 'WWII', year: 1943,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Radio operator'], autoloader: false,
    mass: 57, power: 700, maxSpeed: 40, reverseSpeed: 8, hullTraverse: 22, turretTraverse: 7, gunSpeed: 4,
    gunDepression: 8, gunElevation: 15, hp: 1300, viewRange: 400, reload: 8.5, aimTime: 2.3, dispersion: 0.35, stabilizer: 1.0,
    dims: { L: 6.32, W: 3.56, hullH: 1.95, clearance: 0.47, trackW: 0.72, turretZ: 0.15, turretL: 2.95, turretW: 2.5, turretH: 0.85, gunLen: 5.0 },
    armor: {
      hull: { front: [100, 9], side: [80, 0], rear: [80, 9], top: [25, 0], bottom: [25, 0] },
      turret: { front: [120, 0], side: [80, 0], rear: [80, 0], top: [25, 0] },
      era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -1.2, zMax: 1.2, yMax: 1.5, chance: 0.06 },
    shells: [
      { name: 'PzGr. 39 APCBC', type: 'APCBC', caliber: 88, pen: 162, velocity: 773, damage: 280, count: 50 },
      { name: 'PzGr. 40 APCR', type: 'APCR', caliber: 88, pen: 203, velocity: 930, damage: 250, count: 6 },
      { name: 'Sprgr. L/4.5 HE', type: 'HE', caliber: 88, pen: 18, velocity: 820, damage: 400, count: 36 },
    ],
    paint: { base: '#b39a5c', camo: ['#5a6b3a', '#6b4a2e'], accent: '#8d7a48' },
    desc: 'The legendary heavy tank. Thick, mostly flat armor and the precise 8.8 cm KwK 36 – but heavy, slow and with a sluggish hydraulic turret traverse.',
  },
  {
    id: 't34', name: 'T-34-85 (1944)', short: 'T-34-85', nation: 'USSR', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 32, power: 500, maxSpeed: 54, reverseSpeed: 8, hullTraverse: 30, turretTraverse: 25, gunSpeed: 4,
    gunDepression: 5, gunElevation: 22, hp: 850, viewRange: 340, reload: 7.5, aimTime: 2.9, dispersion: 0.5, stabilizer: 1.0,
    dims: { L: 6.1, W: 3.0, hullH: 1.65, clearance: 0.4, trackW: 0.5, turretZ: 0.6, turretL: 2.45, turretW: 2.15, turretH: 0.85, gunLen: 4.65 },
    armor: {
      hull: { front: [45, 60], side: [45, 40], rear: [45, 45], top: [20, 0], bottom: [20, 0] },
      turret: { front: [90, 20], side: [75, 20], rear: [52, 10], top: [20, 0] },
      era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.8, zMax: 1.6, yMax: 0.9, chance: 0.08 },
    shells: [
      { name: 'BR-365 APBC', type: 'APCBC', caliber: 85, pen: 140, velocity: 792, damage: 240, count: 36 },
      { name: 'BR-365P APCR', type: 'APCR', caliber: 85, pen: 190, velocity: 1050, damage: 210, count: 5 },
      { name: 'O-365K HE', type: 'HE', caliber: 85, pen: 15, velocity: 793, damage: 360, count: 15 },
    ],
    paint: { base: '#4e5a32', camo: null, accent: '#3d4728' },
    desc: 'Mass-produced Soviet medium tank with superbly sloped armor, wide tracks and an 85 mm ZiS-S-53. Agile, cramped, and hard-hitting.',
  },
  {
    id: 't72', name: 'T-72B (1985)', short: 'T-72B', nation: 'USSR', era: 'Cold War', year: 1985,
    crew: ['Commander', 'Gunner', 'Driver'], autoloader: true,
    mass: 44.5, power: 840, maxSpeed: 60, reverseSpeed: 6, hullTraverse: 35, turretTraverse: 24, gunSpeed: 6,
    gunDepression: 6, gunElevation: 14, hp: 1500, viewRange: 420, reload: 7.1, aimTime: 2.0, dispersion: 0.4, stabilizer: 0.35,
    dims: { L: 6.86, W: 3.59, hullH: 1.5, clearance: 0.47, trackW: 0.58, turretZ: 0.35, turretL: 2.6, turretW: 2.3, turretH: 0.75, gunLen: 6.0 },
    armor: {
      // RHA-equivalent vs KE. Composite upper glacis (~200 mm LOS-adj @68°), cast turret w/ "super-Dorchester"-style insert.
      hull: { front: [200, 68], side: [80, 0], rear: [45, 0], top: [40, 0], bottom: [20, 0] },
      turret: { front: [460, 30], side: [220, 25], rear: [80, 0], top: [45, 0] },
      era: 250, heatMult: 1.15,  // Kontakt-1 ERA: extra protection vs HEAT on frontal arc
    },
    engineZone: 'rear', ammoRack: { zMin: -0.7, zMax: 1.4, yMax: 0.85, chance: 0.18 },
    shells: [
      { name: '3BM42 "Mango" APFSDS', type: 'APFSDS', caliber: 125, pen: 520, velocity: 1700, damage: 400, count: 22 },
      { name: '3BK18M HEAT', type: 'HEAT', caliber: 125, pen: 550, velocity: 905, damage: 450, count: 12 },
      { name: '3OF26 HE-FRAG', type: 'HE', caliber: 125, pen: 40, velocity: 850, damage: 560, count: 10 },
    ],
    paint: { base: '#4f5a37', camo: ['#2e2f22', '#7a6c46'], accent: '#3e472b' },
    desc: 'Cold War Soviet MBT with a 125 mm smoothbore fed by a carousel autoloader, Kontakt-1 ERA and a very low silhouette. Poor reverse speed.',
  },
  {
    id: 'm1a2', name: 'M1A2 Abrams', short: 'M1A2', nation: 'USA', era: 'Modern', year: 1992,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 62, power: 1500, maxSpeed: 67, reverseSpeed: 40, hullTraverse: 40, turretTraverse: 40, gunSpeed: 8,
    gunDepression: 10, gunElevation: 20, hp: 1800, viewRange: 500, reload: 6.0, aimTime: 1.4, dispersion: 0.25, stabilizer: 0.2,
    dims: { L: 7.93, W: 3.66, hullH: 1.55, clearance: 0.48, trackW: 0.64, turretZ: -0.25, turretL: 4.3, turretW: 3.4, turretH: 0.8, gunLen: 5.3 },
    armor: {
      // RHA-equivalent vs KE (DU-reinforced Chobham-type composite on frontal arc)
      hull: { front: [560, 20], side: [90, 0], rear: [35, 0], top: [40, 0], bottom: [25, 0] },
      turret: { front: [820, 25], side: [250, 0], rear: [80, 0], top: [50, 0] },
      era: 0, heatMult: 1.5,
    },
    engineZone: 'rear', ammoRack: { zMin: -2.6, zMax: -1.4, yMax: 9, chance: 0.0, turretBustle: true },
    shells: [
      { name: 'M829A3 APFSDS-T', type: 'APFSDS', caliber: 120, pen: 760, velocity: 1555, damage: 430, count: 22 },
      { name: 'M830A1 HEAT-MP-T', type: 'HEAT', caliber: 120, pen: 600, velocity: 1410, damage: 460, count: 12 },
      { name: 'M908 HE-OR-T', type: 'HE', caliber: 120, pen: 50, velocity: 1410, damage: 520, count: 8 },
    ],
    paint: { base: '#b8a27a', camo: null, accent: '#9c8963' },
    desc: 'Modern US MBT: 1,500 hp gas turbine, DU composite armor, CITV hunter-killer sight with thermals, and the 120 mm M256 smoothbore. Fast in both directions.',
  },
];
export const TANK_BY_ID = Object.fromEntries(TANKS.map((t) => [t.id, t]));

// Ballistic behaviour per projectile family
export const SHELL_TYPES = {
  APCBC: { ricochet: 70, normalize: 4, falloff: 0.18, heat: false, label: 'Armor-piercing capped ballistic cap' },
  APCR: { ricochet: 66, normalize: 2, falloff: 0.35, heat: false, label: 'Armor-piercing composite rigid (tungsten core)' },
  APFSDS: { ricochet: 78, normalize: 2, falloff: 0.06, heat: false, label: 'Fin-stabilised discarding sabot (long rod)' },
  HEAT: { ricochet: 85, normalize: 0, falloff: 0.0, heat: true, label: 'High-explosive anti-tank (shaped charge)' },
  HE: { ricochet: 90, normalize: 0, falloff: 0.0, heat: false, he: true, label: 'High-explosive' },
};

export function penAtRange(shell, dist) {
  const f = SHELL_TYPES[shell.type].falloff;
  return shell.pen * Math.max(0.35, 1 - f * Math.max(0, dist - 100) / 1000);
}
