// Independent, uninterrupted capture credit for every attacking tank.
export const CAPTURE_SECONDS = 240;
export const CAPTURE_RADIUS = 25;
export function insideCapture(tank, base) {
  return tank.alive && Math.hypot(tank.pos.x - base.x, tank.pos.z - base.z) < base.r;
}
export function personalCapturePercent(cap, tank) { return Math.min(100, (cap.contributions.get(tank) || 0) / CAPTURE_SECONDS * 100); }
const total = (cap) => {
  const seconds = [...cap.contributions.values()].reduce((a, b) => a + b, 0);
  cap.points = seconds >= CAPTURE_SECONDS - 1e-9 ? 100 : Math.max(0, seconds / CAPTURE_SECONDS * 100);
};
export function createCaptureState() {
  return { points: 0, contributions: new Map(), contested: false, attackers: 0, defenders: 0 };
}
export function resetCaptureContribution(caps, tank, time) {
  tank.lastCaptureHitAt = time;
  for (const cap of caps) {
    if (cap.contributions.delete(tank)) total(cap);
  }
}
export function updateCaptureState(cap, base, tanks, defendingTeam, dt, time) {
  const inside = tanks.filter(t => insideCapture(t, base));
  const attackers = new Set(inside.filter(t => t.team === 1 - defendingTeam));
  cap.attackers = attackers.size;
  cap.defenders = inside.length - attackers.size;
  cap.contested = cap.defenders > 0 && cap.attackers > 0;
  // Exiting or dying erases only that tank's credit, even during a contest.
  for (const tank of cap.contributions.keys()) {
    if (!attackers.has(tank)) cap.contributions.delete(tank);
  }
  for (const tank of attackers) {
    // An impact in this frame invalidates all earlier credit and this frame's accrual.
    if (tank.lastCaptureHitAt === time) {
      cap.contributions.set(tank, 0);
      continue;
    }
    // A newly entered tank starts at zero; no credit for the frame before entry.
    if (!cap.contributions.has(tank)) {
      cap.contributions.set(tank, 0);
      continue;
    }
    if (!cap.contested) cap.contributions.set(tank, cap.contributions.get(tank) + dt);
  }
  total(cap);
}
