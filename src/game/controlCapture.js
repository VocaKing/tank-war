// C is neutral territory. Credit belongs to a living, grounded vehicle, not to the point.
export const CONTROL_RADIUS = 25;
export const SOLO_CONTROL_CAPTURE_SECONDS = 240;
export const contributionRate = index => Math.max(0.2, 1 - 0.2 * index);
export const insideControl = (tank, point) => tank.alive && !tank.airborne && !tank.afloat &&
  Math.hypot(tank.pos.x - point.x, tank.pos.z - point.z) < point.r;
export const createControl = () => ({team:null, points:0, occupied:false, contested:false, contributions:new Map(), counts:[0,0]});
export function refreshControl(control) {
  const sum = [0,0];
  for (const [tank, seconds] of control.contributions) sum[tank.team] += seconds;
  const previous = control.team;
  if (!control.occupied) control.team = null;
  else if (!control.contested) control.team = control.counts[0] ? 0 : 1;
  else if (sum[0] > sum[1]) control.team = 0;
  else if (sum[1] > sum[0]) control.team = 1;
  else if (!sum[0]) control.team = null;
  else control.team = previous ?? 0;
  const value = control.team === null ? 0 : sum[control.team];
  control.points = value >= SOLO_CONTROL_CAPTURE_SECONDS - 1e-8 ? 100 : Math.min(100, value / SOLO_CONTROL_CAPTURE_SECONDS * 100);
}
export function updateControl(control, point, tanks, dt, time) {
  const groups = [[],[]];
  for (const tank of tanks) if (insideControl(tank, point)) groups[tank.team].push(tank);
  const present = new Set(groups.flat());
  for (const tank of control.contributions.keys()) if (!present.has(tank)) control.contributions.delete(tank);
  for (const tank of present) if (!control.contributions.has(tank)) control.contributions.set(tank,0);
  control.counts = groups.map(g=>g.length);
  control.occupied = present.size > 0;
  control.contested = groups.every(g=>g.length > 0);
  if (!control.contested) {
    // Preserve the original diminishing returns for additional occupants so capture is slower at every team size.
    const group = groups[0].length ? groups[0] : groups[1];
    group.forEach((tank,i)=>{
      if (tank.lastControlHitAt === time) return;
      control.contributions.set(tank,control.contributions.get(tank)+dt*contributionRate(i));
    });
  }
  refreshControl(control);
}
export function resetControlCredit(control, tank, time) {
  tank.lastControlHitAt = time;
  if (control.contributions.has(tank)) control.contributions.set(tank,0);
  refreshControl(control);
}
export function personalControlPercent(control,tank) {
  return Math.min(100,(control.contributions.get(tank)||0)/SOLO_CONTROL_CAPTURE_SECONDS*100);
}
