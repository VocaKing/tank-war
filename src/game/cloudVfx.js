import * as THREE from 'three';

const TAU = Math.PI * 2;
let atlas = null, atlasUsers = 0;
const VERTEX = `
attribute vec3 aCenter;
attribute vec4 aShape;
attribute vec4 aTint;
#ifdef COLORED_FLAME
attribute vec3 aFlameTint;
varying vec3 vFlameTint;
#endif
varying vec2 vUv;
varying vec2 vTile;
varying vec4 vTint;
varying float vHeat;
#include <fog_pars_vertex>
void main() {
  float c = cos(aShape.y), s = sin(aShape.y);
  vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
  mvPosition.xy += mat2(c, s, -s, c) * (position.xy * aShape.x);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vTile = vec2(mod(aShape.z, 2.0), floor(aShape.z * 0.5));
  vTint = aTint;
  #ifdef COLORED_FLAME
  vFlameTint = aFlameTint;
  #endif
  vHeat = aShape.w;
  #include <fog_vertex>
}`;
const FRAGMENT = `
uniform sampler2D uCloud;
#ifdef COLORED_FLAME
varying vec3 vFlameTint;
#endif
varying vec2 vUv;
varying vec2 vTile;
varying vec4 vTint;
varying float vHeat;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 cloud = texture2D(uCloud, (vUv + vTile) * 0.5);
  float alpha = cloud.a * vTint.a;
  if (alpha < 0.012) discard;
  vec3 soot = vTint.rgb * mix(0.42, 1.86, cloud.r);
  vec3 flame = mix(vec3(0.7, 0.065, 0.004), vec3(3.0, 1.35, 0.26), pow(cloud.g, 1.3));
  #ifdef COLORED_FLAME
  float core = pow(cloud.g, 1.2);
  flame = mix(vFlameTint * 0.54, vFlameTint * 2.4, smoothstep(0.10, 0.78, core));
  flame = mix(flame, mix(vFlameTint, vec3(1.0), 0.81) * 3.4, smoothstep(0.70, 1.0, core));
  #endif
  gl_FragColor = vec4(mix(soot, flame * mix(0.38, 1.0, vHeat), vHeat), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function hash(x, y, seed) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y + seed, 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function mix(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function saturate(t) { return Math.min(1, Math.max(0, t)); }

function noise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y);
  const u = smooth(x - i), v = smooth(y - j);
  return mix(mix(hash(i, j, seed), hash(i + 1, j, seed), u), mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), u), v);
}

// Packed shape and lighting variations. Values outside the soft lobes have zero opacity,
// so each puff keeps an irregular rim even after the cloud has expanded.
function cloudAtlas() {
  const tile = 96, width = tile * 2;
  const pixels = new Uint8Array(width * width * 4);
  for (let frame = 0; frame < 4; frame++) {
    const seed = 23 + 31 * frame;
    for (let j = 0; j < tile; j++) {
      for (let i = 0; i < tile; i++) {
        const x = (i + 0.5) * 2 / tile - 1, y = (j + 0.5) * 2 / tile - 1;
        const r = Math.hypot(x, y);
        const broad = noise(3.3 * x, 3.3 * y, seed);
        const lumps = noise(7 * x + broad, 7 * y - broad, seed + 13);
        const grit = noise(18 * x, 18 * y, seed + 51);
        const edge = 1 - smooth(saturate((r - 0.69) / 0.31));
        const density = saturate((0.87 - r + (broad - 0.48) * 0.45 + (lumps - 0.48) * 0.24) * 1.9);
        const opacity = edge * smooth(density) * (0.69 + 0.31 * lumps);
        const lit = saturate(0.40 + y * 0.19 - x * 0.09 + broad * 0.19 + (lumps - 0.5) * 0.66 + (grit - 0.5) * 0.24);
        const core = saturate(density * (0.56 + 0.55 * lumps) + 0.14 * grit);
        const offset = (((frame >> 1) * tile + j) * width + (frame % 2) * tile + i) * 4;
        pixels[offset] = Math.round(lit * 255);
        pixels[offset + 1] = Math.round(core * 255);
        pixels[offset + 3] = Math.round(opacity * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(pixels, width, width);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function cloudSilhouette(texture) {
  const { data, width } = texture.image;
  const tile = width / 2;
  let diagonal = 0.5;
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      const u = (x % tile + 0.5) / tile - 0.5;
      const v = (y % tile + 0.5) / tile - 0.5;
      diagonal = Math.max(diagonal, Math.abs(u) + Math.abs(v));
    }
  }
  // Keep the fully transparent atlas corners outside the geometry. One texel
  // of bilinear filtering support per axis preserves all visible edge samples.
  const edge = Math.min(0.5, diagonal + 2 / tile - 0.5);
  const rim = [[0.5, edge], [edge, 0.5], [-edge, 0.5], [-0.5, edge],
    [-0.5, -edge], [-edge, -0.5], [edge, -0.5], [0.5, -edge]];
  const position = [], uv = [], indices = [];
  for (let i = 0; i < rim.length; i++) {
    const [x, y] = rim[i];
    position.push(x, y, 0);
    uv.push(x + 0.5, y + 0.5);
    if (i >= 2) indices.push(0, i - 1, i);
  }
  return { position, uv, indices };
}

export class CloudVfx {
  constructor(scene, capacity, coloredFlame = false) {
    this.puffs = [];
    this.draw = [];
    this.capacity = capacity;
    atlas ??= cloudAtlas();
    atlasUsers++;

    const geometry = new THREE.InstancedBufferGeometry();
    const silhouette = cloudSilhouette(atlas);
    geometry.setIndex(silhouette.indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(silhouette.position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(silhouette.uv, 2));
    const attribute = (name, size) => {
      const buffer = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      geometry.setAttribute(name, buffer.setUsage(THREE.DynamicDrawUsage));
      return buffer;
    };
    this.center = attribute('aCenter', 3);
    this.shape = attribute('aShape', 4);
    this.tint = attribute('aTint', 4);
    if (coloredFlame) this.flameTint = attribute('aFlameTint', 3);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      defines: coloredFlame ? { COLORED_FLAME: 1 } : {},
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCloud: { value: null } }]),
      transparent: true, depthWrite: false, fog: true,
    });
    material.uniforms.uCloud.value = atlas;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = coloredFlame ? 4.1 : 4;
    scene.add(this.mesh);
  }

  emit(origin, direction, {
    speed = 0, delay = 0, life, initial, size, tint, alpha = 1, heat = 0,
    fadeIn, rise = 0, cooling = life, roll = 0, flameTint = [1, 1, 1],
  }) {
    const random = Math.random;
    this.puffs.push({
      x: origin.x, y: origin.y, z: origin.z, vx: direction.x * speed, vy: direction.y * speed,
      vz: direction.z * speed, life, age: -delay, initial, size, tint, alpha, heat, fadeIn,
      rise, cooling, roll, flameTint, rot: random() * TAU, spin: (random() - 0.5) * (heat ? 1.35 : 0.63),
      tile: Math.floor(random() * 4), phase: random() * TAU,
    });
  }

  update(dt, camera) {
    if (!this.puffs.length) return;
    const draw = this.draw;
    draw.length = 0;
    const view = camera?.matrixWorldInverse.elements;
    const projection = camera?.isPerspectiveCamera ? camera.projectionMatrix.elements : null;
    let kept = 0;
    for (const puff of this.puffs) {
      const age = puff.age + dt;
      if (age >= puff.life) continue;
      puff.age = age;
      this.puffs[kept++] = puff;
      if (age <= 0) continue;
      const elapsed = age / puff.life;
      const momentum = (1 - Math.exp(-age * 1.25)) / 1.25;
      const curl = Math.sin(puff.phase + age * 0.92) * Math.min(age, 2.6) * (puff.rise ? 0.9 : 0.28);
      puff.cx = puff.x + puff.vx * momentum + age * 1.15 + curl;
      puff.cy = puff.y + puff.vy * momentum + puff.rise * age;
      puff.cz = puff.z + puff.vz * momentum - age * 0.56 - curl * 0.67;
      if (puff.roll) {
        const angle = Math.PI * (1 - Math.exp(-Math.max(0, age - 0.26) * 0.72));
        const spread = (1 - Math.cos(angle)) * puff.roll;
        const horizontal = Math.hypot(puff.vx, puff.vz) || 1;
        puff.cx += puff.vx / horizontal * spread;
        puff.cz += puff.vz / horizontal * spread;
        puff.cy += (Math.sin(angle) - 0.60 * (1 - Math.cos(angle))) * puff.roll * 0.76;
      }
      puff.diameter = mix(puff.initial, puff.size, elapsed ** 0.56);
      puff.viewDepth = view ? -(view[2] * puff.cx + view[6] * puff.cy + view[10] * puff.cz + view[14]) : age;
      if (projection) {
        const depth = puff.viewDepth;
        if (depth < camera.near || depth > camera.far) continue;
        const x = view[0] * puff.cx + view[4] * puff.cy + view[8] * puff.cz + view[12];
        const y = view[1] * puff.cx + view[5] * puff.cy + view[9] * puff.cz + view[13];
        // A rolled billboard stays inside the half-diagonal of its square.
        // Leave a small float margin and keep simulating puffs outside the view.
        const radius = puff.diameter * Math.SQRT1_2 + 0.002;
        if (Math.abs(x * projection[0] - depth * projection[8]) > depth + radius * projection[0]
          || Math.abs(y * projection[5] - depth * projection[9]) > depth + radius * projection[5]) continue;
      }
      const nearFade = view ? saturate((puff.viewDepth - puff.diameter * 0.14) / (puff.diameter * 0.23)) : 1;
      const fade = Math.min(1, age / puff.fadeIn) * (1 - elapsed) ** (puff.heat ? 0.92 : 0.76);
      puff.opacity = puff.alpha * fade * nearFade;
      if (puff.opacity >= 0.012) draw.push(puff);
    }
    this.puffs.length = kept;
    this.mesh.visible = draw.length > 0;
    this.mesh.geometry.instanceCount = draw.length;
    if (!draw.length) return;
    draw.sort((a, b) => b.viewDepth - a.viewDepth);
    for (let i = 0; i < draw.length; i++) {
      const puff = draw[i];
      const heat = puff.heat * Math.max(0, 1 - puff.age / puff.cooling) ** 0.54;
      this.center.setXYZ(i, puff.cx, puff.cy, puff.cz);
      this.shape.setXYZW(i, puff.diameter, puff.rot + puff.age * puff.spin, puff.tile, heat);
      this.flameTint?.setXYZ(i, ...puff.flameTint);
      this.tint.setXYZW(i, puff.tint[0], puff.tint[1], puff.tint[2], puff.opacity);
    }
    for (const attr of [this.center, this.shape, this.tint, this.flameTint]) {
      if (!attr) continue;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, draw.length * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (--atlasUsers === 0) {
      atlas.dispose();
      atlas = null;
    }
  }
}
