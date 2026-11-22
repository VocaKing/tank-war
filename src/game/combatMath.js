// Shared, pure combat math. Angles are radians unless explicitly labelled.
export const MIN_DISPERSION_100M = 1.2; // radius in metres, minimum stock and custom balance
export const MIN_BLOOM = 1;
export const MAX_BLOOM = 4.5;
export const BASE_FOV = 60;
export const DEG = Math.PI / 180;
export const MIN_INCIDENCE_COS = 1e-6;
export function advanceBloom(current, moving, dt, aimTime, max = MAX_BLOOM) {
  const target = moving ? max : MIN_BLOOM;
  const step = (max - MIN_BLOOM) * Math.max(0, dt) / Math.max(0.001, aimTime);
  return Math.max(MIN_BLOOM, Math.min(max, current + Math.sign(target-current)*Math.min(Math.abs(target-current),step)));
}
export function zoomFov(zoom, baseFov = BASE_FOV) {
  return 2 * Math.atan(Math.tan(baseFov * DEG / 2) / zoom) / DEG;
}
export function dispersionPixels(cone, travel, viewDepth, projectionY, viewportHeight) {
  return Math.tan(cone) * Math.max(0,travel) * projectionY * viewportHeight / (2*Math.max(0.01,viewDepth));
}
// Geometric line-of-sight thickness, with no shell-dependent angular normalization.
export function incidence(cosine, nominal) {
  const c = Math.min(1,Math.abs(cosine));
  return { angle: Math.acos(c)/DEG, los: nominal/Math.max(MIN_INCIDENCE_COS,c) };
}
// Low-arc projectile impact tangent for the armour preview. Given the displacement
// from launch to the selected impact, estimate the gravity-induced arrival angle.
export function impactDrop(distanceSquared, dy, speed, gravity = 9.81) {
  const a=speed*speed-gravity*dy, disc=a*a-gravity*gravity*distanceSquared;
  if (disc < 0 || a <= 0) return 0;
  return gravity*distanceSquared/Math.max(1e-6,a+Math.sqrt(disc));
}
