// Visual layout in metres. X is lateral, Y is up, and +Z points forward.
export const VX9 = {
  hullLength: 8.96,
  hullWidth: 3.78,
  hullRoof: 1.76,
  turretRoof: 2.64,
  turretZ: -.78,
  trunnionZ: 1.98,
  trunnionY: .466,
  barrelLength: 5.02,
  trackX: 1.50,
  trackWidth: .62,
  trackEnd: 3.52,
  trackRadius: .521,
  trackY: .579,
  lamp: [1.374, 1.369, 4.268],
  lampSweep: .427,
  lampTilt: .24,
  lampWidth: .685,
  lampHeight: .205,
  turretLamp: [1.100, .338, 1.997],
  turretLampSweep: .556,
  turretLampTilt: .06,
  turretLampWidth: .386,
  turretLampHeight: .145,
  rearIntake: [1.888, 1.405, -3.73],
  rearIntakeWidth: .69,
  rearIntakeHeight: .49,
};

export const HULL_PLAN = [[0,4.48],[.89,4.48],[1.55,4.20],[1.82,3.79],[1.865,3.25],
  [1.865,-3.79],[1.77,-4.21],[1.54,-4.48],[0,-4.48]];
export const HULL_LOWER = [[.69,.85,.31,0,.01],[.75,.92,.72]];
export const HULL_UPPER = [[.78,.89,.72],[1,1,1.25],[.988,.96,1.52,-.035,-.037],[.84,.80,VX9.hullRoof,-.39]];
export const SKIRTS = [
  [[3.83,1.28],[3.43,1.58],[2.47,1.70],[2.00,1.65],[1.54,.93],[2.78,.92],[3.64,1.05]],
  [[2.01,1.65],[.29,1.72],[.18,.91],[1.52,.92]],
  [[.25,1.72],[-.66,1.71],[-.92,.91],[.19,.91]],
  [[-.71,1.71],[-1.68,1.71],[-1.99,.92],[-.94,.91]],
  [[-1.72,1.71],[-3.16,1.70],[-3.42,.93],[-2.01,.92]],
  [[-3.21,1.69],[-4.43,1.67],[-4.39,1.24],[-4.03,.94],[-3.47,.93]],
];
export const TURRET_PLAN = [[0,2.18],[.51,2.15],[.84,1.93],[1.31,1.56],[1.58,1.14],[1.64,.43],
  [1.61,-.75],[1.46,-1.64],[1.48,-2.66],[1.30,-3.02],[0,-3.09]];
export const TURRET_RING = [[.64,.82,.043,-.05],[.82,.95,.14]];
export const TURRET_ARMOR = [[.83,.91,.14],[1,1,.35,0,-.026],[.97,.976,.62,-.03,-.040],[.78,.83,.853,-.15,-.008]];
export const WHEEL_STATIONS = [-3.52,-2.87,-1.92,-.96,0,.96,1.92,2.87,3.52];
