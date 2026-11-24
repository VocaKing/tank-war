import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const BUDGETS = {
  high: { capacity: 272, fire: 16, dust: 22, smoke: 27, cap: 9, wisps: 7 },
  medium: { capacity: 176, fire: 12, dust: 15, smoke: 17, cap: 6, wisps: 5 },
  low: { capacity: 108, fire: 8, dust: 9, smoke: 12, cap: 4, wisps: 3 },
};
const VERTEX = `
attribute vec3 aCenter;
attribute vec4 aShape;
attribute vec4 aTint;
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
  vHeat = aShape.w;
  #include <fog_vertex>
}`;
const FRAGMENT = `
uniform sampler2D uCloud;
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

export class ArtilleryVfx {
  constructor(scene, quality, dust) {
    this.puffs = [];
    this.draw = [];
    this.dust = dust.map((value) => value * value * 0.84);
    this.budget = BUDGETS[quality] ?? BUDGETS.high;
    this.forward = new THREE.Vector3();
    this.atlas = cloudAtlas();

    const geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    const attribute = (name, size) => {
      const buffer = new THREE.InstancedBufferAttribute(new Float32Array(this.budget.capacity * size), size);
      geometry.setAttribute(name, buffer.setUsage(THREE.DynamicDrawUsage));
      return buffer;
    };
    this.center = attribute('aCenter', 3);
    this.shape = attribute('aShape', 4);
    this.tint = attribute('aTint', 4);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCloud: { value: null } }]),
      transparent: true, depthWrite: false, fog: true,
    });
    material.uniforms.uCloud.value = this.atlas;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  burst(pos, normal, surface) {
    const random = Math.random;
    const water = surface === 'water';
    const ground = surface === 'ground';
    const dust = water ? [0.44, 0.53, 0.57] : ground ? this.dust : [0.23, 0.20, 0.16];
    const soot = water ? [0.51, 0.58, 0.62] : [0.058, 0.046, 0.038];
    const origin = pos.clone().addScaledVector(normal, water ? 0.95 : 1.45);
    const direction = new THREE.Vector3();
    const surfaceRotation = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    const { fire, dust: dustCount, smoke, cap, wisps, capacity } = this.budget;

    // A hot textured core breaks into slower orange lobes as the dust front leaves it behind.
    this.emit(origin, UP, { life: 0.28, initial: 4.8, size: 9.4, tint: soot, heat: 1, fadeIn: 0.012 });
    for (let i = 0; i < fire; i++) {
      const angle = TAU * (i + random()) / fire;
      direction.set(Math.cos(angle) * 0.82, 0.32 + random() * 0.58, Math.sin(angle) * 0.82)
        .applyQuaternion(surfaceRotation);
      direction.y += 0.22;
      this.emit(origin, direction, {
        speed: 10 + random() * 9, delay: random() * 0.11, life: 0.44 + random() * 0.43,
        initial: 3 + random() * 2, size: 7.6 + random() * 4, tint: soot, alpha: 0.95, heat: 0.98, fadeIn: 0.04,
      });
    }

    // The low, fast cloud is wide and earth-colored. The tilted ring follows slopes on land,
    // while water throws a lighter fan of spray and mist along its level surface.
    for (let i = 0; i < dustCount; i++) {
      const angle = TAU * (i + random()) / dustCount;
      direction.set(Math.cos(angle), water ? 0.3 : 0.11 + random() * 0.15, Math.sin(angle));
      if (ground) direction.applyQuaternion(surfaceRotation);
      direction.y = Math.max(0.08, direction.y);
      this.emit(origin, direction, {
        speed: 11 + random() * 11, delay: random() * 0.09, life: 3.5 + random() * 2,
        initial: 2.8 + random() * 3, size: 9.5 + random() * 6, tint: dust, alpha: 0.67, fadeIn: 0.16,
      });
    }

    // Stagger the column and its curling upper lobes so smoke keeps developing after the flash.
    for (let i = 0; i < smoke + cap; i++) {
      const upper = i >= smoke;
      const angle = random() * TAU;
      const width = upper ? 0.78 : 0.35 + random() * 0.3;
      direction.set(Math.cos(angle) * width, upper ? 1.35 : 0.65 + random() * 0.60, Math.sin(angle) * width);
      this.emit(origin, direction, {
        speed: (upper ? 12 : 7) + random() * 8, delay: random() * (upper ? 1.7 : 1.15),
        life: (water ? 4.8 : 7.8) + random() * (water ? 2.7 : 3.2),
        initial: upper ? 4.2 : 2.7 + random() * 1.7, size: (upper ? 14 : 11) + random() * 7,
        tint: soot, alpha: upper ? 0.65 : 0.82, fadeIn: upper ? 0.5 : 0.28, rise: upper ? 1.8 : 1.05,
      });
    }
    // A few translucent wisps linger under the rising cap as the heavy dust settles.
    for (let i = 0; i < wisps; i++) {
      const angle = random() * TAU;
      direction.set(Math.cos(angle) * 0.35, 0.2 + i / wisps, Math.sin(angle) * 0.35);
      this.emit(origin, direction, {
        speed: 3 + random() * 5, delay: 0.55 + random() * 1.5, life: (water ? 4.2 : 6) + random() * 2,
        initial: 2.4, size: 8.5 + random() * 5, tint: soot, alpha: 0.33, fadeIn: 0.65, rise: 0.48 + i / wisps * 0.65,
      });
    }
    if (this.puffs.length > capacity) this.puffs.splice(0, this.puffs.length - capacity);
  }

  emit(origin, direction, { speed = 0, delay = 0, life, initial, size, tint, alpha = 1, heat = 0, fadeIn, rise = 0 }) {
    const random = Math.random;
    this.puffs.push({
      x: origin.x, y: origin.y, z: origin.z, vx: direction.x * speed, vy: direction.y * speed,
      vz: direction.z * speed, life, age: -delay, initial, size, tint, alpha, heat, fadeIn,
      rise, rot: random() * TAU, spin: (random() - 0.5) * (heat ? 1.35 : 0.63),
      tile: Math.floor(random() * 4), phase: random() * TAU,
    });
  }

  update(dt, camera) {
    const draw = this.draw;
    draw.length = 0;
    const eye = camera?.position;
    if (eye) camera.getWorldDirection(this.forward);
    const view = this.forward;
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
      puff.diameter = mix(puff.initial, puff.size, elapsed ** 0.56);
      puff.viewDepth = eye ? (puff.cx - eye.x) * view.x + (puff.cy - eye.y) * view.y + (puff.cz - eye.z) * view.z : age;
      const nearFade = eye ? saturate((puff.viewDepth - puff.diameter * 0.14) / (puff.diameter * 0.23)) : 1;
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
      const heat = puff.heat * (1 - puff.age / puff.life) ** 0.54;
      this.center.setXYZ(i, puff.cx, puff.cy, puff.cz);
      this.shape.setXYZW(i, puff.diameter, puff.rot + puff.age * puff.spin, puff.tile, heat);
      this.tint.setXYZW(i, puff.tint[0], puff.tint[1], puff.tint[2], puff.opacity);
    }
    for (const attr of [this.center, this.shape, this.tint]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, draw.length * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.atlas.dispose();
  }
}
