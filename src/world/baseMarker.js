// Terrain-conforming objective boundary; outer edge matches the gameplay radius.
export function captureRingData(base, height, segments = 128, width = 1.8, lift = 0.65) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * 2 * Math.PI;
    for (const radius of [Math.max(0,base.r-width),base.r]) {
      const x = base.x + Math.cos(a)*radius, z = base.z + Math.sin(a)*radius;
      positions.push(x,height(x,z)+lift,z);
    }
    if (i < segments) { const k = i*2; indices.push(k,k+2,k+1,k+1,k+2,k+3); }
  }
  return {positions,indices};
}
