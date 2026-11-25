// Gameplay-only ERA tile mapping. Visual tile meshes are deliberately deferred until bespoke vehicle models are ready.
export function eraBounds(spec, group) {
  const d = spec.dims, turret = group.part === 'turret';
  const width = turret ? d.turretW : d.W;
  const height = turret ? d.turretH : d.hullH;
  const length = turret ? d.turretL : d.L;
  return {
    crossMin: -width * 0.43, crossMax: width * 0.43,
    yMin: turret ? 0.08 : Math.min(0.63, height * 0.40),
    yMax: turret ? height * 0.88 : height * 0.95,
    zMin: -length * 0.36, zMax: length * 0.37,
  };
}
export function findEraTile(spec, hit) {
  const groups = Array.isArray(spec.eraLayout) ? spec.eraLayout : [];
  if (!hit || !groups.length) return null;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.part !== hit.part || group.face !== hit.face) continue;
    const b = eraBounds(spec, group);
    const side = group.face === 'side' ? (hit.sideSign > 0 ? 1 : -1) : 0;
    const horizontal = group.face === 'side' ? hit.local.z : hit.local.x;
    const lo = group.face === 'side' ? b.zMin : b.crossMin;
    const hi = group.face === 'side' ? b.zMax : b.crossMax;
    const u = (horizontal - lo) / (hi - lo);
    const v = (hit.local.y - b.yMin) / (b.yMax - b.yMin);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const col = Math.floor(u * group.cols), row = Math.floor(v * group.rows);
    return { key: `${groupIndex}:${side}:${row}:${col}`, group, row, col, side };
  }
  return null;
}
export function eraTileCount(spec) {
  return (Array.isArray(spec.eraLayout) ? spec.eraLayout : [])
    .reduce((sum, group) => sum + group.cols * group.rows * (group.face === 'side' ? 2 : 1), 0);
}
