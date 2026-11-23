import * as THREE from 'three';

// A continuous belt follows the same contact points as the detailed shoes.
export function makeTrackBelt(poses, width) {
  const points = [], indices = [];
  const normal = new THREE.Vector3();
  const segments = Math.ceil(poses.length / 3);
  for (let i = 0; i < segments; i++) {
    const { position, rotation } = poses[i * 3];
    normal.set(0, 1, 0).applyQuaternion(rotation);
    for (const [side, thickness] of [[-1, -0.04], [1, -0.04], [1, 0.05], [-1, 0.05]]) {
      points.push(position.x + side * width / 2, position.y + normal.y * thickness, position.z + normal.z * thickness);
    }
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j, b = i * 4 + (j + 1) % 4;
      const c = ((i + 1) % segments) * 4 + (j + 1) % 4, d = ((i + 1) % segments) * 4 + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
