import publishedBalance from './balanceDefaults.json';
import { clone, effective, loadLocal, EMPTY } from './balanceConfig.js';
// Tank specifications. Figures are grounded in published real-world data
// (armor in mm RHA / RHA-equivalent, slope in degrees from vertical,
// penetration in mm RHA at 100 m vs a flat plate, muzzle velocity in m/s).
// HP / damage are gameplay abstractions layered on top of the armor model.

export const TANKS = [
  {
    id: 'sherman', tier: 1, cls: 'Light', name: 'M4A3E8 Sherman "Easy Eight"', short: 'M4A3E8', nation: 'USA', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 33.7, power: 900, maxSpeed: 88, reverseSpeed: 22, hullTraverse: 70, turretTraverse: 50, gunSpeed: 9,
    gunDepression: 10, gunElevation: 25, hp: 900, viewRange: 380, reload: 6.0, aimTime: 2.2, dispersion: 2.64, stabilizer: 0.6,
    dims: { L: 6.27, W: 3.00, hullH: 1.9, clearance: 0.43, trackW: 0.58, turretZ: 0.35, turretL: 2.3, turretW: 2.55, turretH: 0.85, gunLen: 3.1 },
    armor: {
      hull: { front: [50, 47], side: [32, 0], rear: [32, 10], top: [16, 0], bottom: [13, 0] },
      turret: { front: [70, 30], side: [50, 5], rear: [50, 0], top: [20, 0] },
      lowerFront: [108, 35], lowerSide: [38, 0], mantlet: [140, 0], era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.6, zMax: 1.4, yMax: 1.0, chance: 0.05 },
    shells: [
      { name: 'M62 APCBC', type: 'APCBC', caliber: 76, pen: 116, velocity: 792, damage: 340, count: 45 },
      { name: 'M93 HVAP', type: 'APCR', caliber: 76, pen: 208, velocity: 1036, damage: 300, count: 6 },
      { name: 'M42A1 HE', type: 'HE', caliber: 76, pen: 12, velocity: 800, damage: 340, count: 20 },
    ],
    paint: { base: '#4b4f2f', camo: null, accent: '#3a3d24' },
    desc: 'Late-war Sherman with the long 76 mm M1A2 gun, HVSS suspension and wet ammo stowage. Fast-firing and reliable, but thin side armor.',
  },
  {
    id: 'tiger', tier: 2, cls: 'Heavy', name: 'Panzerkampfwagen VI Tiger I Ausf. E', short: 'Tiger I', nation: 'Germany', era: 'WWII', year: 1943,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Radio operator'], autoloader: false,
    mass: 66, power: 700, maxSpeed: 20, reverseSpeed: 4, hullTraverse: 12, turretTraverse: 5, gunSpeed: 3,
    gunDepression: 8, gunElevation: 15, hp: 1600, viewRange: 400, reload: 11.0, aimTime: 2.6, dispersion: 2.76, stabilizer: 1.0,
    selfDestruct: { radius: 18 },
    dims: { turretBoxZ: -0.15, L: 6.32, W: 3.70, hullH: 1.95, clearance: 0.47, trackW: 0.72, turretZ: 0.15, turretL: 2.95, turretW: 2.5, turretH: 0.85, gunLen: 3.9 },
    armor: {
      hull: { front: [520, 9], side: [140, 0], rear: [80, 9], top: [16, 0], bottom: [25, 0] },
      turret: { front: [520, 0], side: [150, 0], rear: [80, 0], top: [25, 0] },
      lowerFront: [200, 24], lowerSide: [60, 0], mantlet: [180, 0], era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -1.2, zMax: 1.2, yMax: 1.5, chance: 0.06 },
    shells: [
      { name: 'PzGr. 39 APCBC', type: 'APCBC', caliber: 88, pen: 162, velocity: 773, damage: 180, count: 50 },
      { name: 'PzGr. 40 APCR', type: 'APCR', caliber: 88, pen: 203, velocity: 930, damage: 160, count: 6 },
      { name: 'Sprgr. L/4.5 HE', type: 'HE', caliber: 88, pen: 18, velocity: 820, damage: 400, count: 36 },
    ],
    paint: { base: '#b39a5c', camo: ['#5a6b3a', '#6b4a2e'], accent: '#8d7a48' },
    desc: 'The legendary heavy tank. Thick, mostly flat armor and the precise 8.8 cm KwK 36 – but heavy, slow and with a sluggish hydraulic turret traverse.',
  },
  {
    id: 't34', tier: 1, cls: 'Light', name: 'T-34-85 (1944)', short: 'T-34-85', nation: 'USSR', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 32, power: 1000, maxSpeed: 96, reverseSpeed: 18, hullTraverse: 75, turretTraverse: 55, gunSpeed: 9,
    gunDepression: 5, gunElevation: 22, hp: 850, viewRange: 340, reload: 7.5, aimTime: 2.5, dispersion: 2.76, stabilizer: 1.0,
    scan: { cooldown: 24, maxTargets: 3, range: 400 },
    dims: { L: 6.1, W: 3.0, hullH: 1.65, clearance: 0.4, trackW: 0.5, turretZ: 0.6, turretL: 2.45, turretW: 2.15, turretH: 0.85, gunLen: 3.5 },
    armor: {
      hull: { front: [40, 60], side: [40, 40], rear: [40, 45], top: [16, 0], bottom: [16, 0] },
      turret: { front: [70, 20], side: [55, 20], rear: [45, 10], top: [16, 0] },
      lowerFront: [45, 53], lowerSide: [45, 0], mantlet: [100, 0], era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.8, zMax: 1.6, yMax: 0.9, chance: 0.08 },
    shells: [
      { name: 'BR-365 APBC', type: 'APCBC', caliber: 85, pen: 140, velocity: 792, damage: 360, count: 36 },
      { name: 'BR-365P APCR', type: 'APCR', caliber: 85, pen: 190, velocity: 1050, damage: 320, count: 5 },
      { name: 'O-365K HE', type: 'HE', caliber: 85, pen: 15, velocity: 793, damage: 360, count: 15 },
    ],
    paint: { base: '#4e5a32', camo: null, accent: '#3d4728' },
    desc: 'Mass-produced Soviet medium tank with superbly sloped armor, wide tracks and an 85 mm ZiS-S-53. Agile, cramped, and hard-hitting.',
  },
  {
    id: 't72', tier: 3, cls: 'Medium', name: 'T-72B (1985)', short: 'T-72B', nation: 'USSR', era: 'Cold War', year: 1985,
    crew: ['Commander', 'Gunner', 'Driver'], autoloader: true,
    mass: 44.5, power: 840, maxSpeed: 44, reverseSpeed: 5, hullTraverse: 32, turretTraverse: 24, gunSpeed: 6,
    gunDepression: 6, gunElevation: 14, hp: 1500, viewRange: 420, reload: 7.1, aimTime: 2, dispersion: 2.10, stabilizer: 0.35,
    magazine: { size: 4, intraReload: 1.2, fullReload: 9.5 },
    dims: { L: 6.95, W: 3.59, hullH: 1.5, clearance: 0.47, trackW: 0.58, turretZ: 0.35, turretL: 2.6, turretW: 2.3, turretH: 0.75, gunLen: 4.65 },
    armor: {
      // RHA-equivalent vs KE. Composite upper glacis (~200 mm LOS-adj @68°), cast turret w/ "super-Dorchester"-style insert.
      hull: { front: [300, 68], side: [80, 0], rear: [45, 0], top: [16, 0], bottom: [20, 0] },
      turret: { front: [340, 30], side: [160, 25], rear: [80, 0], top: [16, 0] },
      lowerFront: [110, 60], lowerSide: [70, 0], mantlet: [140, 0], skirt: 30, era: 250, heatMult: 1.15,  // Kontakt-1 ERA: extra protection vs HEAT on frontal arc
    },
    engineZone: 'rear', ammoRack: { zMin: -0.7, zMax: 1.4, yMax: 0.85, chance: 0.18 },
    shells: [
      { name: '3BM42 "Mango" APFSDS', type: 'APFSDS', caliber: 125, pen: 300, velocity: 1700, damage: 400, count: 22 },
      { name: '3BK18M HEAT', type: 'HEAT', caliber: 125, pen: 280, velocity: 905, damage: 450, count: 12 },
      { name: '3OF26 HE-FRAG', type: 'HE', caliber: 125, pen: 40, velocity: 850, damage: 560, count: 10 },
    ],
    paint: { base: '#4f5a37', camo: ['#2e2f22', '#7a6c46'], accent: '#3e472b' },
    desc: 'Cold War Soviet MBT with a 125 mm smoothbore fed by a carousel autoloader, Kontakt-1 ERA and a very low silhouette. Poor reverse speed.',
  },
  {
    id: 'm1a2', tier: 4, cls: 'Medium', name: 'M1A2 Abrams', short: 'M1A2', nation: 'USA', era: 'Modern', year: 1992,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 62, power: 1500, maxSpeed: 48, reverseSpeed: 24, hullTraverse: 36, turretTraverse: 40, gunSpeed: 8,
    gunDepression: 10, gunElevation: 20, hp: 1800, viewRange: 500, reload: 6.0, aimTime: 1.5, dispersion: 1.32, stabilizer: 0.2,
    stabilize: { duration: 7, cooldown: 22 },
    dims: { turretBoxZ: -0.15, L: 7.93, W: 3.66, hullH: 1.55, clearance: 0.48, trackW: 0.64, turretZ: -0.25, turretL: 4.3, turretW: 3.4, turretH: 0.8, gunLen: 4.1 },
    armor: {
      // RHA-equivalent vs KE (DU-reinforced Chobham-type composite on frontal arc)
      hull: { front: [400, 20], side: [90, 0], rear: [35, 0], top: [16, 0], bottom: [25, 0] },
      turret: { front: [460, 25], side: [180, 0], rear: [80, 0], top: [16, 0] },
      lowerFront: [160, 30], lowerSide: [70, 0], mantlet: [200, 0], skirt: 70, era: 0, heatMult: 1.5,
    },
    engineZone: 'rear', ammoRack: { zMin: -2.6, zMax: -1.4, yMax: 9, chance: 0.0, turretBustle: true },
    shells: [
      { name: 'M829A3 APFSDS-T', type: 'APFSDS', caliber: 120, pen: 340, velocity: 1555, damage: 430, count: 22 },
      { name: 'M830A1 HEAT-MP-T', type: 'HEAT', caliber: 120, pen: 300, velocity: 1410, damage: 460, count: 12 },
      { name: 'M908 HE-OR-T', type: 'HE', caliber: 120, pen: 50, velocity: 1410, damage: 520, count: 8 },
    ],
    paint: { base: '#b8a27a', camo: null, accent: '#9c8963' },
    desc: 'Modern US MBT: 1,500 hp gas turbine, DU composite armor, CITV hunter-killer sight with thermals, and the 120 mm M256 smoothbore. Fast in both directions.',
  },
  // ---------------- v2 additions ----------------
  {
    id: 'panther', tier: 2, cls: 'Medium', name: 'Panzerkampfwagen V Panther Ausf. G', short: 'Panther', nation: 'Germany', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Radio operator'], autoloader: false,
    mass: 44.8, power: 700, maxSpeed: 36, reverseSpeed: 7, hullTraverse: 24, turretTraverse: 18, gunSpeed: 5,
    gunDepression: 8, gunElevation: 18, hp: 1150, viewRange: 400, reload: 7.0, aimTime: 2.3, dispersion: 2.46, stabilizer: 1.0,
    overpen: { shots: 2, mult: 1.35, cooldown: 35 },
    dims: { L: 6.87, W: 3.42, hullH: 1.98, clearance: 0.56, trackW: 0.66, turretZ: 0.15, turretL: 2.6, turretW: 2.05, turretH: 0.85, gunLen: 4.1, turretBoxZ: 0.0 },
    armor: {
      hull: { front: [160, 55], side: [50, 29], rear: [40, 30], top: [12, 0], bottom: [14, 0] },
      turret: { front: [180, 11], side: [55, 25], rear: [45, 25], top: [12, 0] },
      lowerFront: [90, 55], lowerSide: [40, 0], mantlet: [100, 0], era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -1.0, zMax: 1.0, yMax: 1.25, chance: 0.07 },
    shells: [
      { name: 'PzGr. 39/42 APCBC', type: 'APCBC', caliber: 75, pen: 185, velocity: 935, damage: 360, count: 55 },
      { name: 'PzGr. 40/42 APCR', type: 'APCR', caliber: 75, pen: 226, velocity: 1120, damage: 320, count: 8 },
      { name: 'Sprgr. 42 HE', type: 'HE', caliber: 75, pen: 10, velocity: 700, damage: 300, count: 16 },
    ],
    paint: { base: '#b9a46a', camo: ['#4f5e33', '#6e4a2c'], accent: '#8f7d4b' },
    desc: 'Germany\'s answer to the T-34: steeply sloped 80 mm glacis, the very high-velocity 7.5 cm KwK 42 L/70 and wide interleaved road wheels. Weak lower hull and flat-ish sides.',
  },
  {
    id: 'is2', tier: 2, cls: 'Heavy', name: 'IS-2 model 1944', short: 'IS-2', nation: 'USSR', era: 'WWII', year: 1944,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 58, power: 520, maxSpeed: 18, reverseSpeed: 3, hullTraverse: 12, turretTraverse: 7, gunSpeed: 2.5,
    gunDepression: 3, gunElevation: 20, hp: 1700, viewRange: 360, reload: 20.0, aimTime: 2.8, dispersion: 3.12, stabilizer: 1.0,
    dims: { L: 6.77, W: 3.09, hullH: 1.60, clearance: 0.42, trackW: 0.65, trackPitch: 0.168, turretZ: 0.12, turretL: 2.80, turretW: 2.65, turretH: 0.87, gunLen: 4.97, turretBoxZ: 0.05 },
    armor: {
      hull: { front: [540, 60], side: [150, 15], rear: [60, 49], top: [16, 0], bottom: [20, 0] },
      turret: { front: [540, 20], side: [160, 20], rear: [90, 30], top: [30, 0] },
      lowerFront: [210, 30], lowerSide: [90, 0], mantlet: [190, 0], era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -1.6, zMax: 0.8, yMax: 1.0, chance: 0.08 },
    shells: [
      { name: 'BR-471 APHE', type: 'APCBC', caliber: 122, pen: 155, velocity: 795, damage: 260, count: 14 },
      { name: 'BR-471B APBC', type: 'APCBC', caliber: 122, pen: 168, velocity: 795, damage: 240, count: 6 },
      { name: 'OF-471 HE', type: 'HE', caliber: 122, pen: 30, velocity: 795, damage: 520, count: 8 },
    ],
    paint: { base: '#4a5530', camo: null, accent: '#3a4426' },
    desc: 'Soviet breakthrough tank with the huge 122 mm D-25T: devastating hits but separate-loading ammunition means a very long reload. Straightened 120 mm glacis.',
  },
  {
    id: 'pershing', tier: 2, cls: 'Heavy', name: 'M26 Pershing', short: 'M26', nation: 'USA', era: 'WWII', year: 1945,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver', 'Bow gunner'], autoloader: false,
    mass: 52, power: 500, maxSpeed: 22, reverseSpeed: 6, hullTraverse: 16, turretTraverse: 12, gunSpeed: 3,
    gunDepression: 10, gunElevation: 20, hp: 1450, viewRange: 390, reload: 10.0, aimTime: 2.5, dispersion: 2.88, stabilizer: 1.0,
    dims: { L: 6.33, W: 3.51, hullH: 1.93, clearance: 0.44, trackW: 0.61, turretZ: 0.3, turretL: 3.0, turretW: 2.7, turretH: 0.85, gunLen: 4.11, turretBoxZ: -0.05 },
    armor: {
      hull: { front: [520, 46], side: [280, 0], rear: [51, 10], top: [16, 0], bottom: [13, 0] },
      turret: { front: [540, 0], side: [300, 0], rear: [76, 0], top: [25, 0] },
      lowerFront: [360, 53], lowerSide: [200, 0], mantlet: [300, 0], era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.8, zMax: 1.2, yMax: 0.9, chance: 0.06 },
    shells: [
      { name: 'M82 APCBC', type: 'APCBC', caliber: 90, pen: 165, velocity: 853, damage: 180, count: 50 },
      { name: 'T30E16 HVAP', type: 'APCR', caliber: 90, pen: 245, velocity: 1021, damage: 160, count: 8 },
      { name: 'M71 HE', type: 'HE', caliber: 90, pen: 15, velocity: 823, damage: 360, count: 12 },
    ],
    paint: { base: '#4d5133', camo: null, accent: '#3c3f28' },
    desc: 'The first US heavy tank to see combat: 90 mm M3 gun, torsion-bar suspension and a thick cast turret. Underpowered but well balanced.',
  },
  {
    id: 'centurion', tier: 3, cls: 'Medium', name: 'Centurion Mk 3', short: 'Centurion', nation: 'UK', era: 'Cold War', year: 1948,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 49, power: 650, maxSpeed: 30, reverseSpeed: 7, hullTraverse: 24, turretTraverse: 30, gunSpeed: 5,
    gunDepression: 10, gunElevation: 20, hp: 1350, viewRange: 410, reload: 6.0, aimTime: 2, dispersion: 2.16, stabilizer: 0.5,
    dims: { L: 7.6, W: 3.39, hullH: 1.95, clearance: 0.51, trackW: 0.61, turretZ: 0.35, turretL: 3.1, turretW: 2.6, turretH: 0.85, gunLen: 4.45, turretBoxZ: -0.2 },
    armor: {
      hull: { front: [170, 57], side: [55, 12], rear: [38, 0], top: [14, 0], bottom: [15, 0] },
      turret: { front: [190, 15], side: [70, 20], rear: [60, 0], top: [14, 0] },
      lowerFront: [95, 46], lowerSide: [51, 0], mantlet: [110, 0], skirt: 40, era: 0, heatMult: 1.0,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.5, zMax: 2.2, yMax: 1.0, chance: 0.07 },
    shells: [
      { name: '20 pdr APDS Mk 1', type: 'APDS', caliber: 84, pen: 220, velocity: 1465, damage: 400, count: 20 },
      { name: '20 pdr APCBC Mk 3', type: 'APCBC', caliber: 84, pen: 200, velocity: 1020, damage: 420, count: 30 },
      { name: '20 pdr HE Mk 3', type: 'HE', caliber: 84, pen: 20, velocity: 600, damage: 380, count: 15 },
    ],
    paint: { base: '#3d4630', camo: null, accent: '#2f3725' },
    desc: 'The archetypal post-war British MBT: thick cast turret, Meteor V12, side skirts and the excellent 20-pounder firing APDS, with an early Metadyne stabiliser.',
  },
  {
    id: 'leo1', tier: 3, cls: 'Medium', name: 'Leopard 1A5', short: 'Leopard 1A5', nation: 'West Germany', era: 'Cold War', year: 1987,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 42.4, power: 830, maxSpeed: 46, reverseSpeed: 16, hullTraverse: 34, turretTraverse: 30, gunSpeed: 6,
    gunDepression: 9, gunElevation: 20, hp: 1250, viewRange: 450, reload: 6.5, aimTime: 1.8, dispersion: 1.92, stabilizer: 0.3,
    dims: { L: 6.94, W: 3.41, hullH: 1.62, clearance: 0.44, trackW: 0.55, turretZ: 0.1, turretL: 3.4, turretW: 2.6, turretH: 0.82, gunLen: 4.62, turretBoxZ: -0.25 },
    armor: {
      hull: { front: [200, 60], side: [40, 0], rear: [25, 0], top: [14, 0], bottom: [15, 0] },
      turret: { front: [220, 35], side: [60, 30], rear: [60, 0], top: [14, 0] },
      lowerFront: [100, 55], lowerSide: [25, 0], mantlet: [120, 0], skirt: 40, era: 0, heatMult: 1.35,
    },
    engineZone: 'rear', ammoRack: { zMin: 0.5, zMax: 2.8, yMax: 1.0, chance: 0.1 },
    shells: [
      { name: 'DM33 APFSDS-T', type: 'APFSDS', caliber: 105, pen: 260, velocity: 1455, damage: 330, count: 20 },
      { name: 'DM12 HEAT-MP-T', type: 'HEAT', caliber: 105, pen: 240, velocity: 1174, damage: 360, count: 20 },
      { name: 'DM512 HESH', type: 'HESH', caliber: 105, pen: 125, velocity: 730, damage: 440, count: 15 },
    ],
    paint: { base: '#4f5638', camo: ['#22231f', '#6a4a32'], accent: '#3e4430' },
    desc: 'Mobility over armor: the 105 mm L7A3, EMES 18 fire control with thermal sight and a fast 830 hp MTU diesel. Spaced-armor turret, very thin hull.',
  },
  {
    id: 'leo2a6', tier: 4, cls: 'Medium', name: 'Leopard 2A6', short: 'Leopard 2A6', nation: 'Germany', era: 'Modern', year: 2001,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 62.3, power: 1500, maxSpeed: 46, reverseSpeed: 20, hullTraverse: 36, turretTraverse: 40, gunSpeed: 8,
    gunDepression: 9, gunElevation: 20, hp: 1850, viewRange: 510, reload: 30.0, aimTime: 1.5, dispersion: 1.20, stabilizer: 0.15,
    dims: { L: 7.72, W: 3.75, hullH: 1.58, clearance: 0.54, trackW: 0.635, turretZ: -0.35, turretL: 4.1, turretW: 3.45, turretH: 0.8, gunLen: 6.05, turretBoxZ: -0.1 },
    armor: {
      hull: { front: [410, 20], side: [100, 0], rear: [40, 0], top: [16, 0], bottom: [25, 0] },
      turret: { front: [480, 0], side: [190, 0], rear: [70, 0], top: [16, 0] },
      lowerFront: [180, 25], lowerSide: [80, 0], mantlet: [220, 0], skirt: 150, era: 0, heatMult: 1.5,
    },
    engineZone: 'rear', ammoRack: { zMin: 1.4, zMax: 3.0, yMax: 1.0, chance: 0.0, turretBustle: true },
    shells: [
      { name: 'DM53 APFSDS-T', type: 'APFSDS', caliber: 120, pen: 340, velocity: 1750, damage: 800, count: 22 },
      { name: 'DM12 HEAT-MP-T', type: 'HEAT', caliber: 120, pen: 300, velocity: 1140, damage: 470, count: 12 },
      { name: 'DM11 HE-T', type: 'HE', caliber: 120, pen: 60, velocity: 1100, damage: 520, count: 8 },
    ],
    paint: { base: '#4f5638', camo: ['#22231f', '#6a4a32'], accent: '#3e4430' },
    desc: 'Arrowhead spaced add-on armor over the turret front, the long 120 mm L55 smoothbore and a 1,500 hp V12. Bustle ammunition with blow-out panels.',
  },
  {
    id: 't90m', tier: 4, cls: 'Medium', name: 'T-90M Proryv', short: 'T-90M', nation: 'Russia', era: 'Modern', year: 2017,
    crew: ['Commander', 'Gunner', 'Driver'], autoloader: true,
    mass: 46.5, power: 1130, maxSpeed: 42, reverseSpeed: 8, hullTraverse: 34, turretTraverse: 40, gunSpeed: 7,
    gunDepression: 6, gunElevation: 14, hp: 1650, viewRange: 470, reload: 6.5, aimTime: 1.7, dispersion: 1.50, stabilizer: 0.2,
    dims: { L: 7.075, W: 3.78, hullH: 1.5, clearance: 0.47, trackW: 0.58, turretZ: 0.3, turretL: 3.2, turretW: 3.0, turretH: 0.75, gunLen: 4.9, turretBoxZ: -0.25 },
    armor: {
      hull: { front: [340, 68], side: [80, 0], rear: [40, 0], top: [16, 0], bottom: [20, 0] },
      turret: { front: [420, 30], side: [180, 25], rear: [70, 0], top: [16, 0] },
      lowerFront: [140, 60], lowerSide: [70, 0], mantlet: [180, 0], skirt: 250, era: 500, eraKE: 220, heatMult: 1.15,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.8, zMax: 0.9, yMax: 0.75, chance: 0.15 },
    shells: [
      { name: '3BM60 Svinets-2 APFSDS', type: 'APFSDS', caliber: 125, pen: 330, velocity: 1660, damage: 420, count: 22 },
      { name: '3BK31 tandem HEAT', type: 'HEAT', caliber: 125, pen: 310, velocity: 905, damage: 460, count: 10 },
      { name: '3OF26 HE-FRAG', type: 'HE', caliber: 125, pen: 40, velocity: 850, damage: 560, count: 10 },
    ],
    paint: { base: '#59613d', camo: ['#7a7552', '#30352a'], accent: '#454c30' },
    desc: 'Latest T-90: Relikt ERA (effective against long rods and HEAT), new welded turret with bustle and slat armor, Kalina FCS. Low profile, autoloader carousel under the turret.',
  },
  {
    id: 'chally2', tier: 4, cls: 'Medium', name: 'Challenger 2', short: 'Challenger 2', nation: 'UK', era: 'Modern', year: 1998,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 62.5, power: 1200, maxSpeed: 42, reverseSpeed: 32, hullTraverse: 32, turretTraverse: 36, gunSpeed: 7,
    gunDepression: 10, gunElevation: 20, hp: 1900, viewRange: 500, reload: 6.5, aimTime: 1.6, dispersion: 1.38, stabilizer: 0.15,
    dims: { L: 8.33, W: 3.52, hullH: 1.62, clearance: 0.5, trackW: 0.635, turretZ: -0.3, turretL: 4.2, turretW: 3.45, turretH: 0.85, gunLen: 5.9, turretBoxZ: -0.25 },
    armor: {
      hull: { front: [420, 20], side: [90, 0], rear: [40, 0], top: [16, 0], bottom: [25, 0] },
      turret: { front: [440, 10], side: [200, 0], rear: [80, 0], top: [16, 0] },
      lowerFront: [170, 20], lowerSide: [80, 0], mantlet: [210, 0], skirt: 200, era: 0, heatMult: 1.5,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.5, zMax: 1.5, yMax: 0.9, chance: 0.05 },
    shells: [
      { name: 'L27A1 CHARM 3 APFSDS', type: 'APFSDS', caliber: 120, pen: 320, velocity: 1650, damage: 430, count: 18 },
      { name: 'L31A7 HESH', type: 'HESH', caliber: 120, pen: 170, velocity: 670, damage: 520, count: 12 },
      { name: 'L23A1 APFSDS', type: 'APFSDS', caliber: 120, pen: 280, velocity: 1535, damage: 400, count: 10 },
    ],
    paint: { base: '#c2a77a', camo: null, accent: '#a88f63' },
    desc: 'British MBT with second-generation Chobham ("Dorchester") armor and the rifled 120 mm L30A1 – the only NATO tank still firing HESH. Exceptionally well protected.',
  },
  {
    id: 'type99a', tier: 4, cls: 'Medium', name: 'Type 99A (ZTZ-99A)', short: 'Type 99A', nation: 'China', era: 'Modern', year: 2011,
    crew: ['Commander', 'Gunner', 'Driver'], autoloader: true,
    mass: 55, power: 1500, maxSpeed: 48, reverseSpeed: 20, hullTraverse: 36, turretTraverse: 40, gunSpeed: 7,
    gunDepression: 6, gunElevation: 16, hp: 1750, viewRange: 490, reload: 6.5, aimTime: 1.6, dispersion: 1.44, stabilizer: 0.15,
    overspeed: { mult: 1.45, duration: 8, cooldown: 30 },
    dims: { L: 7.6, W: 3.5, hullH: 1.55, clearance: 0.48, trackW: 0.6, turretZ: -0.1, turretL: 3.6, turretW: 3.3, turretH: 0.75, gunLen: 5.9, turretBoxZ: -0.1 },
    armor: {
      hull: { front: [360, 68], side: [80, 0], rear: [40, 0], top: [16, 0], bottom: [20, 0] },
      turret: { front: [430, 0], side: [180, 15], rear: [70, 0], top: [16, 0] },
      lowerFront: [150, 55], lowerSide: [70, 0], mantlet: [190, 0], skirt: 150, era: 400, eraKE: 150, heatMult: 1.25,
    },
    engineZone: 'rear', ammoRack: { zMin: -0.8, zMax: 0.9, yMax: 0.75, chance: 0.14 },
    shells: [
      { name: 'DTW-125 II APFSDS', type: 'APFSDS', caliber: 125, pen: 330, velocity: 1780, damage: 420, count: 22 },
      { name: 'DTP-125 HEAT', type: 'HEAT', caliber: 125, pen: 300, velocity: 900, damage: 460, count: 10 },
      { name: 'DTB-125 HE', type: 'HE', caliber: 125, pen: 40, velocity: 850, damage: 560, count: 8 },
    ],
    paint: { base: '#6b7046', camo: ['#3c4229', '#8c8a62'], accent: '#555a38', pattern: 'digital' },
    desc: 'China\'s top MBT: arrowhead ERA-clad turret, 1,500 hp diesel, laser dazzler and a 125 mm autoloaded smoothbore. Fast, flat and modern, in digital camouflage.',
  },
  {
    id: 'merkava4', tier: 4, cls: 'Medium', name: 'Merkava Mk.4', short: 'Merkava 4', nation: 'Israel', era: 'Modern', year: 2004,
    crew: ['Commander', 'Gunner', 'Loader', 'Driver'], autoloader: false,
    mass: 65, power: 1500, maxSpeed: 44, reverseSpeed: 14, hullTraverse: 34, turretTraverse: 36, gunSpeed: 7,
    gunDepression: 7, gunElevation: 20, hp: 1950, viewRange: 480, reload: 6.0, aimTime: 1.6, dispersion: 1.38, stabilizer: 0.15,
    dims: { L: 7.97, W: 3.72, hullH: 1.66, clearance: 0.53, trackW: 0.64, turretZ: -0.9, turretL: 4.6, turretW: 3.2, turretH: 0.8, gunLen: 4.3, turretBoxZ: 0.0 },
    armor: {
      hull: { front: [390, 30], side: [100, 0], rear: [80, 0], top: [16, 0], bottom: [30, 0] },
      turret: { front: [450, 20], side: [190, 10], rear: [100, 0], top: [16, 0] },
      lowerFront: [160, 30], lowerSide: [80, 0], mantlet: [200, 0], skirt: 200, era: 0, heatMult: 1.45,
    },
    engineZone: 'front', ammoRack: { zMin: -3.6, zMax: -1.5, yMax: 1.0, chance: 0.06 },
    shells: [
      { name: 'M338 APFSDS-T', type: 'APFSDS', caliber: 120, pen: 320, velocity: 1700, damage: 430, count: 20 },
      { name: 'M339 HEAT-MP', type: 'HEAT', caliber: 120, pen: 290, velocity: 1300, damage: 460, count: 12 },
      { name: 'M329 APAM HE', type: 'HE', caliber: 120, pen: 50, velocity: 1400, damage: 520, count: 10 },
    ],
    paint: { base: '#8d8a72', camo: null, accent: '#75725c' },
    desc: 'Crew survivability first: front-mounted engine, modular wedge armor with a long sloped turret, rear hatch and ball-and-chain curtains under the bustle.',
  },
];
// Playable self-propelled howitzer. The game uses an articulated artillery control profile:
 // deployment lock, high-arc ballistic solution, slow traverse and long reload.
const _spgBase = TANKS.find((t) => t.id === 'leo2a6');
TANKS.push({
  ..._spgBase, id:'pzh2000', tier:4, cls:'Artillery', name:'PzH 2000 Self-Propelled Howitzer', short:'PzH 2000',
  artillery:{reloadMultiplier:2.1,traverseMultiplier:0.24,highArc:true},
  mass:55.8,power:735,maxSpeed:38,reverseSpeed:12,hullTraverse:26,turretTraverse:14,gunSpeed:3,
  gunDepression:2,gunElevation:65,hp:1450,viewRange:460,reload:7.2,aimTime:4.2,dispersion:4.4,
  dims:{..._spgBase.dims,L:7.90,W:3.55,hullH:1.78,clearance:0.48,trackW:0.64,turretZ:-0.15,turretL:4.2,turretW:3.25,turretH:0.95,gunLen:5.6},
  shells:[
    {name:'155 mm HE',type:'HE',caliber:155,pen:48,velocity:720,damage:780,count:24},
    {name:'155 mm HE-VT',type:'HE',caliber:155,pen:38,velocity:720,damage:690,count:12},
    {name:'155 mm Smoke',type:'HE',caliber:155,pen:1,velocity:720,damage:1,count:8}
  ],
  paint:{base:'#626b55',camo:['#343c32','#827d61'],accent:'#424b3b'},
  desc:'Self-propelled howitzer. Must deploy rear stabilizers before firing; slow turret traverse, high-angle ballistic fire and long reload.'
});
TANKS.sort((a, b) => a.tier - b.tier || a.year - b.year);
// ---- v3 ammunition balance & loadouts ----
// Each tank carries a fixed number of rounds (its real stowage capacity = sum of the historical default load).
// Shell strength is balanced: damage scales with (standard pen / pen)^0.5, so the high-penetration round does
// less damage per hit (and APCR/APDS also lose penetration faster with range); HE/HESH have little penetration
// but the highest damage, splash and module/crew damage. HEAT is countered by ERA, composite and spaced armour.
for (const t of TANKS) {
  const s0 = t.shells[0]; const D0 = s0.damage;
  t.ammoCap = t.shells.reduce((a, s) => a + s.count, 0); t.defaultLoadout = t.shells.map((s) => s.count);
  for (let i = 0; i < t.shells.length; i++) {
    const s = t.shells[i]; s.baseDamage ??= s.damage;
    if (s.type === 'HE') { s.damage = Math.round(D0 * 1.4 / 5) * 5; s.role = 'High damage + splash, wrecks modules, low penetration'; }
    else if (s.type === 'HESH') { s.damage = Math.round(D0 * 1.3 / 5) * 5; s.role = 'High damage, spalls crew/modules, stopped by spaced armour'; }
    else if (i === 0) s.role = 'Standard: balanced penetration and damage';
    else { const k = Math.max(0.75, Math.min(1.25, Math.sqrt(s0.pen / s.pen))); s.damage = Math.round(D0 * k / 5) * 5; s.role = s.pen > s0.pen ? `Premium: +${Math.round((s.pen / s0.pen - 1) * 100)}% penetration, −${Math.round((1 - k) * 100)}% damage` : `+${Math.round((k - 1) * 100)}% damage, lower penetration`; }
  }
}
// clamp a requested loadout to non-negative integers whose sum is exactly the tank's capacity
export function sanitizeLoadout(spec, arr) {
  const cap = spec.ammoCap; let a = (Array.isArray(arr) && arr.length === spec.shells.length ? arr : spec.defaultLoadout).map((n) => Math.max(0, Math.floor(+n || 0)));
  let sum = a.reduce((x, y) => x + y, 0);
  if (sum > cap) { for (let i = a.length - 1; i >= 0 && sum > cap; i--) { const d = Math.min(a[i], sum - cap); a[i] -= d; sum -= d; } }
  if (sum < cap) a[0] += cap - sum;
  return a;
}
// NPC loadouts: mostly the standard round, some premium, some HE, with a little variation
export function npcLoadout(spec, rng) {
  const cap = spec.ammoCap; const f = [0.62 + rng.range(-0.08, 0.08), 0.16 + rng.range(-0.05, 0.05)];
  const a = [Math.round(cap * f[0]), Math.round(cap * f[1])]; a.push(Math.max(0, cap - a[0] - a[1]));
  return sanitizeLoadout(spec, a);
}
export const TANK_BY_ID = Object.fromEntries(TANKS.map((t) => [t.id, t]));

// Ballistic behaviour per projectile family
export const SHELL_TYPES = {
  APCBC: { ricochet: 70, normalize: 4, falloff: 0.18, heat: false, label: 'Armor-piercing capped ballistic cap' },
  APCR: { ricochet: 66, normalize: 2, falloff: 0.35, heat: false, label: 'Armor-piercing composite rigid (tungsten core)' },
  APFSDS: { ricochet: 78, normalize: 2, falloff: 0.06, heat: false, label: 'Fin-stabilised discarding sabot (long rod)' },
  HEAT: { ricochet: 85, normalize: 0, falloff: 0.0, heat: true, label: 'High-explosive anti-tank (shaped charge)' },
  APDS: { ricochet: 75, normalize: 3, falloff: 0.13, heat: false, label: 'Armor-piercing discarding sabot' },
  HESH: { ricochet: 80, normalize: 0, falloff: 0.0, heat: true, hesh: true, label: 'High-explosive squash head (spalling)' },
  HE: { ricochet: 90, normalize: 0, falloff: 0.0, heat: false, he: true, label: 'High-explosive' },
};

export function penAtRange(shell, dist) {
  const f = SHELL_TYPES[shell.type].falloff;
  return shell.pen * Math.max(0.35, 1 - f * Math.max(0, dist - 100) / 1000);
}

// Penetration RNG (uniform ±): a roll of pen × (1 ± PEN_RNG) is compared with effective armour.
export const PEN_RNG = 0.08;
export const TIER_NAMES = ['', 'Lights', 'Heavies', 'Mediums', 'Modern mediums'];
// Effective armour model shared by hit resolution, AI, HUD and the armour-view shader.
// part: 'hull'|'turret', face: 'front'|'side'|'rear'|'top'|'bottom', local: hit point in part space.
export function armorZone(spec, part, face, local) {
  const A = spec.armor, d = spec.dims;
  if (part === 'hull') {
    if (face === 'front' && A.lowerFront && local.y < zoneLowerFrontY(d)) return [A.lowerFront, 'lower front'];
    if (face === 'side' && A.lowerSide && local.y < zoneLowerSideY(d)) return [A.lowerSide, 'lower side'];
    return [A.hull[face] || A.hull.bottom, face];
  }
  if (face === 'front' && A.mantlet && Math.abs(local.x) < d.turretW * 0.24 && local.y > d.turretH * 0.12 && local.y < d.turretH * 0.88) return [A.mantlet, 'mantlet'];
  return [A.turret[face] || A.hull.top, face];
}
export const zoneLowerFrontY = (d) => d.clearance + (d.hullH - d.clearance) * 0.42;
export const zoneLowerSideY = (d) => d.clearance + 0.6;

// Apply overrides AFTER automatic stock ammunition balancing, before any game/menu constructor.
export const STOCK_TANKS = clone(TANKS);
let published = STOCK_TANKS, publishedError = '';
try { published = effective(STOCK_TANKS, publishedBalance); }
catch(e) { publishedError = String(e.message||e); console.error('Published balance rejected',e); }
export const PUBLISHED_TANKS = clone(published);
const local = loadLocal(STOCK_TANKS);
export const BALANCE_STATUS = { source: local.config ? 'local' : 'published', error: [publishedError,local.error].filter(Boolean).join('; ') };
const active = local.config ? effective(STOCK_TANKS,local.config) : clone(PUBLISHED_TANKS);
for(let i=0;i<TANKS.length;i++) Object.assign(TANKS[i],active[i]);
