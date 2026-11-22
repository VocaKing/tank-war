// Reduce interior tessellation while keeping every shared boundary vertex.
export function coarseTerrainIndices(width, height, stride) {
  const ranges = (size) => {
    const cells = [];
    for (let start = 0; start < size - 1;) {
      let end = Math.min(size - 1, start + stride);
      if (end === size - 2) end++;
      cells.push([start, end]);
      start = end;
    }
    return cells;
  };
  const index = (x, z) => z * width + x;
  const triangles = [];
  for (const [z0, z1] of ranges(height)) for (const [x0, x1] of ranges(width)) {
    const left = x0 === 0, right = x1 === width - 1;
    const top = z0 === 0, bottom = z1 === height - 1;
    const a = index(x0, z0), b = index(x0, z1), c = index(x1, z1), d = index(x1, z0);
    if (!(left || right || top || bottom)) {
      triangles.push(a, b, d, d, b, c);
      continue;
    }
    const perimeter = [a];
    if (left) for (let z = z0 + 1; z < z1; z++) perimeter.push(index(x0, z));
    perimeter.push(b);
    if (bottom) for (let x = x0 + 1; x < x1; x++) perimeter.push(index(x, z1));
    perimeter.push(c);
    if (right) for (let z = z1 - 1; z > z0; z--) perimeter.push(index(x1, z));
    perimeter.push(d);
    if (top) for (let x = x1 - 1; x > x0; x--) perimeter.push(index(x, z0));
    const center = index(Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2));
    for (let i = 0; i < perimeter.length; i++) {
      triangles.push(perimeter[i], perimeter[(i + 1) % perimeter.length], center);
    }
  }
  return triangles;
}

export function updateTerrainLOD(tiles, camera, detailDistance) {
  const position = camera.position;
  const magnification = Math.max(1, Math.min(4, camera.projectionMatrix.elements[5] / Math.sqrt(3)));
  const limit = detailDistance * magnification;
  for (const tile of tiles) {
    const dx = Math.max(0, tile.minX - position.x, position.x - tile.maxX);
    const dz = Math.max(0, tile.minZ - position.z, position.z - tile.maxZ);
    const dy = Math.max(0, position.y - tile.maxY);
    const enter = tile.near.visible ? limit + 24 : limit;
    const detailed = dx * dx + dy * dy + dz * dz <= enter * enter;
    tile.near.visible = detailed;
    tile.far.visible = !detailed;
  }
}
