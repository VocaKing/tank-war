// Nominal dimensions for the fictional playable adaptation. X is lateral, +Z forward.
export const VESPER = {
  id: 'vesper48', name: 'Vesper-48', revision: '2026-11-vesper-orthographic',
  hullLength: 6.20, hullWidth: 3.16, hullRoof: 1.43,
  turretZ: .65, gunZ: .12, gunY: .675, barrelLength: 4.41, turretRoof: 2.51, opticsRoof: 2.98,
  trackX: 1.28, trackWidth: .47, trackEnd: 2.39, trackRadius: .447, trackY: .493,
  roadWheels: [-1.84,-1.10,-.37,.37,1.10,1.84],
  lightsX: [-.65,-.27,.27,.65], lightsY: 1.223, lightsZ: 2.805,
  source: 'https://www.behance.net/gallery/54326805/Light-tank-concept',
};
export const VESPER_HULL = [[0,3.10],[.88,3.10],[1.34,2.92],[1.58,2.57],[1.58,-2.56],
  [1.42,-2.88],[1.23,-3.10],[0,-3.10]];
export const VESPER_HULL_RINGS = [[.76,.93,.33],[.88,.99,.65],[1,1,.86],[.98,.94,1.08], [.79,.81,1.43,-.20]];
export const VESPER_TURRET = [[0,.93],[.37,.91],[.64,.55],[.76,-.29],[.85,-1.43],[.69,-1.99],[0,-2.06]];
export const VESPER_TURRET_RINGS = [[.75,.91,.40],[1,1,.50],[1,1,.91],[.83,.94,1.08]];
export const VESPER_RAIL = [[.19,2.45],[.39,2.44],[.51,.68],[.67,.24],[.64,-.14],[.32,-.18],[.19,.86]];
