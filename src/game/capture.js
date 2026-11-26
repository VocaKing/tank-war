// Independent, uninterrupted capture credit for every attacking tank.
export const CAPTURE_SECONDS = 240;
const total = (cap) => {
  const seconds = [...cap.contributions.values()].reduce((a, b) => a + b, 0);
  cap.points = seconds >= CAPTURE_SECONDS - 1e-9 ? 100 : Math.max(0, seconds / CAPTURE_SECONDS * 100);
};
export function createCaptureState() {
  return { points: 0, contributions: new Map(), contested: false };
}
export function resetCaptureContribution(caps, tank, time) {
  tank.lastCaptureHitAt = time;
  for (const cap of caps) {
    if (cap.contributions.delete(tank)) total(cap);
  }
}
export function updateCaptureState(cap, base, tanks, defendingTeam, dt, time) {
  const inside = tanks.filter(t => t.alive && Math.hypot(t.pos.x - base.x, t.pos.z - base.z) < base.r);
  const attackers = new Set(inside.filter(t => t.team === 1 - defendingTeam));
  cap.contested = inside.some(t => t.team === defendingTeam) && attackers.size > 0;
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
