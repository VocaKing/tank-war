// Near-camera grass: instanced clumps of crossed alpha cards on a deterministic jittered grid that is
// re-laid around the camera as it moves (so blades never "swim"). Density follows the terrain's
// grass splat layer; no grass on roads, water, buildings or rock. Wind sway in the vertex shader.
import * as THREE from 'three';
import { OCC } from './mapgen.js';
import { foliageShading } from './vegetation.js';
import { RNG } from '../util.js';

const PRESETS = {
  village: { layer: 0, dens: 1.0, col: [0.62, 0.68, 0.42], col2: [0.8, 0.74, 0.46], h: 0.46 },
  forest: { layer: 1, dens: 0.85, col: [0.56, 0.64, 0.38], col2: [0.7, 0.66, 0.4], h: 0.52 },
  desert: { layer: 1, dens: 0.16, col: [1.15, 0.95, 0.62], col2: [0.95, 0.8, 0.5], h: 0.38 },
};
function bladeTexture(biome) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = new RNG(biome === 'desert' ? 91 : biome === 'forest' ? 63 : 44);
  const dry = biome === 'desert';
  const amount = dry ? 36 : 62;
  for (let i = 0; i < amount; i++) {
    const x = random.range(17, size - 17);
    const base = size - random.range(0, 15);
    const height = size * random.range(0.30, 0.88);
    const lean = (x - size / 2) * 0.20 + random.range(-31, 31);
    const width = random.range(1.12, 2.92);
    const hue = dry ? random.range(33, 51) : random.range(65, 99);
    const sat = dry ? random.range(23, 37) : random.range(32, 53);
    const value = random.range(30, 52);
    const blade = ctx.createLinearGradient(x, base, x + lean, base - height);
    blade.addColorStop(0, `hsl(${hue},${sat}%,${value * 0.58}%)`);
    blade.addColorStop(0.68, `hsl(${hue},${sat}%,${value}%)`);
    blade.addColorStop(1, `hsl(${hue - 6},${sat * 0.86}%,${value * 1.18}%)`);
    ctx.fillStyle = blade;
    ctx.beginPath(); ctx.moveTo(x - width, base);
    ctx.quadraticCurveTo(x + lean * 0.28 - width, base - height * 0.62, x + lean, base - height);
    ctx.quadraticCurveTo(x + lean * 0.28 + width, base - height * 0.64, x + width, base);
    ctx.fill();

    // A few pale seed heads break up the silhouette without extra geometry.
    if (i % (dry ? 7 : 11) === 0) {
      ctx.fillStyle = dry ? '#b5a577' : '#b6b17e';
      for (let seed = 0; seed < 4; seed++) {
        ctx.beginPath();
        ctx.ellipse(x + lean - seed * lean * 0.028, base - height + seed * 3, 1.2 + seed * 0.13, 2.6, lean * 0.009, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967296; }

export class Grass {
  constructor(scene, mb, quality, windUniform) {
    this.mb = mb; this.t = mb.t; this.p = PRESETS[mb.def.id] || PRESETS.village;
    this.radius = quality === 'high' ? 62 : quality === 'medium' ? 40 : 0; this.spacing = quality === 'high' ? 0.95 : 1.15;
    if (!this.radius) return;
    const geo = new THREE.BufferGeometry(); const pos = [], uv = [], nrm = [];
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
      const q = [[-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1]];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); uv.push(q[i][3], q[i][4]); nrm.push(0, 1, 0); } }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(mb.def.id), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: new THREE.Color(...this.p.col) });
    const R = this.radius;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = windUniform; sh.uniforms.uR = { value: R };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind; uniform float uR;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz; float ph = ip.x * 0.31 + ip.z * 0.23;
          float d = length(ip.xz - cameraPosition.xz); float fade = 1.0 - smoothstep(uR * 0.7, uR, d);
          transformed.y *= fade;
          float gust = 0.6 + 0.4 * sin(uWind * 0.35 + ip.x * 0.02 + ip.z * 0.015);
          transformed.x += sin(uWind * 2.1 + ph) * 0.13 * position.y * position.y * gust; transformed.z += cos(uWind * 1.7 + ph) * 0.09 * position.y * position.y * gust;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.42, 1.08, smoothstep(0.0, 0.8, vMapUv.y));');
      foliageShading(sh, 0.06, 0.6, 'vMapUv.y');
    };
    mat.customProgramCacheKey = () => 'grass5';
    const max = Math.ceil((Math.PI * R * R) / (this.spacing * this.spacing) * 1.05);
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.mesh.instanceColor = this.colors;
    scene.add(this.mesh); this.last = null;
  }
  update(camPos) {
    if (!this.mesh) return;
    if (this.last && Math.hypot(camPos.x - this.last.x, camPos.z - this.last.z) < 5) return;
    this.last = { x: camPos.x, z: camPos.z };
    const t = this.t, mb = this.mb, p = this.p, s = this.spacing, R = this.radius; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const i0 = Math.floor((camPos.x - R) / s), i1 = Math.ceil((camPos.x + R) / s), j0 = Math.floor((camPos.z - R) / s), j1 = Math.ceil((camPos.z + R) / s);
    let n = 0; const max = this.mesh.instanceMatrix.count; const c1 = p.col, c2 = p.col2;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h1 = hash(i, j); const x = (i + hash(j, i + 7)) * s, z = (j + hash(i + 3, j - 5)) * s;
      if ((x - camPos.x) ** 2 + (z - camPos.z) ** 2 > R * R) continue;
      const gi = t.x2i(x), gj = t.x2i(z); if (!t.inside(gi, gj)) continue; const k = t.idx(gi, gj);
      const w = mb.splat[k * 4 + p.layer] * p.dens; if (h1 > w * 1.15 - 0.1) continue;
      if (t.occ[k] === OCC.ROAD || t.occ[k] === OCC.BUILDING || t.occ[k] === OCC.WATER) continue;
      const y = t.height(x, z); if (t.water[k] > -1e8 && y < t.water[k] + 0.1) continue;
      const growth = hash(i * 3, j * 7);
      const hs = p.h * (0.57 + growth * growth * 0.94) * (0.74 + w * 0.47);
      const spread = p.h * (0.95 + hash(j + 3, i - 9) * 0.81);
      e.set(0, h1 * 6.28, 0); q.setFromEuler(e);
      m.compose(v.set(x, y - 0.031, z), q, sc.set(spread, hs, spread));
      this.mesh.setMatrixAt(n, m);
      const f = hash(i + 11, j + 13); this.colors.setXYZ(n, (c1[0] + (c2[0] - c1[0]) * f) / p.col[0], (c1[1] + (c2[1] - c1[1]) * f) / p.col[1], (c1[2] + (c2[2] - c1[2]) * f) / p.col[2]);
      if (++n >= max) break;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.colors.needsUpdate = true;
  }
  dispose() { if (this.mesh) { this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.map.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); } }
}
