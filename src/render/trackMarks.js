import * as THREE from 'three';
import { OCC } from '../world/mapgen.js';

const CAPACITY = { high: 2200, medium: 1400, low: 660 };
const RANGE = { high: 160, medium: 120, low: 88 };
const LIFE = 32;
const STRIDE = 0.52;
const BREAK = 5;
const COLORS = { village: 0x352b20, forest: 0x27251e, desert: 0x765537 };

export class TrackMarks {
  constructor(world, tanks, quality) {
    this.world = world;
    this.tanks = tanks;
    this.capacity = CAPACITY[quality] ?? CAPACITY.high;
    this.range = RANGE[quality] ?? RANGE.high;
    this.head = 0;
    this.count = 0;
    this.last = -Infinity;
    this.time = { value: 0 };
    this.states = tanks.map(() => [null, null]);
    this.geometry = new THREE.BufferGeometry();
    this.positions = this.attribute('position', 3);
    this.uvs = this.attribute('uv', 2);
    this.ages = this.attribute('birthAndOpacity', 2);
    const indices = new Uint16Array(this.capacity * 6);
    for (let i = 0; i < this.capacity; i++) {
      const a = i * 4;
      indices.set([a, a + 2, a + 1, a + 2, a + 3, a + 1], i * 6);
    }
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      color: COLORS[world.def.id], transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    material.onBeforeCompile = shader => {
      shader.uniforms.trackTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 birthAndOpacity; varying vec2 vTrackUv; varying vec2 vTrackAge;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrackUv = uv; vTrackAge = birthAndOpacity;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float trackTime; varying vec2 vTrackUv; varying vec2 vTrackAge;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float fade = 1.0 - smoothstep(${(LIFE * 0.43).toFixed(2)}, ${LIFE.toFixed(1)}, trackTime - vTrackAge.x);
          float edge = abs(vTrackUv.x - 0.5);
          float tread = 1.0 - smoothstep(0.12, 0.42, abs(fract(vTrackUv.y + edge * 0.58) - 0.5));
          float rough = 0.85 + 0.15 * sin(vTrackUv.y * 19.0 + vTrackUv.x * 12.0);
          diffuseColor.a *= (1.0 - smoothstep(0.32, 0.5, edge)) * (0.35 + tread * 0.65) * rough * fade * vTrackAge.y;
          if (diffuseColor.a < 0.004) discard;`);
    };
    material.customProgramCacheKey = () => 'ground-track-marks';
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'ground track marks';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -3;
    this.mesh.visible = false;
    world.scene.add(this.mesh);
  }

  attribute(name, width) {
    const attribute = new THREE.BufferAttribute(new Float32Array(this.capacity * 4 * width), width);
    attribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute(name, attribute);
    return attribute;
  }

  stamp(ax, az, bx, bz, phase, width, time) {
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
    const t = this.world.terrain;
    const floor = t.height(midX, midZ);
    if (t.waterLevel(midX, midZ) > floor + 0.05 || this.world.deckAt(midX, midZ) > floor + 0.16) return false;
    const occ = t.occAt(midX, midZ);
    if (occ === OCC.BUILDING || occ === 255) return false;
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    const nx = dz / length * width, nz = -dx / length * width;
    const opacity = occ === OCC.ROAD ? 0.19 : 0.31;
    const base = this.head * 4;
    for (let end = 0; end < 2; end++) for (let side = 0; side < 2; side++) {
      const sign = side * 2 - 1;
      const x = (end ? bx : ax) + nx * sign, z = (end ? bz : az) + nz * sign;
      const i = base + end * 2 + side;
      this.positions.setXYZ(i, x, t.height(x, z) + 0.042, z);
      this.uvs.setXY(i, side, (phase + end * length) / 0.24);
      this.ages.setXY(i, time, opacity);
    }
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.last = time;
    return true;
  }

  update(time, camera) {
    this.time.value = time;
    const start = this.head;
    let written = 0;
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i], pos = t.pos, state = this.states[i];
      const dx = camera.x - pos.x, dz = camera.z - pos.z;
      if (!t.alive || t.airborne || (!t.isPlayer && !t.model.root.visible) || dx * dx + dz * dz > this.range * this.range) {
        state[0] = state[1] = null;
        continue;
      }
      const d = t.spec.dims;
      const spread = (d.W - d.trackW) / 2;
      const ux = Math.cos(t.heading) * spread, uz = -Math.sin(t.heading) * spread;
      for (let side = 0; side < 2; side++) {
        const sign = side * 2 - 1;
        const x = pos.x + ux * sign, z = pos.z + uz * sign;
        const previous = state[side];
        const length = previous ? Math.hypot(x - previous.x, z - previous.z) : Infinity;
        if (length < STRIDE) continue;
        if (length > BREAK) { state[side] = { x, z, phase: 0 }; continue; }
        if (this.stamp(previous.x, previous.z, x, z, previous.phase, d.trackW * 0.49, time)) written++;
        previous.x = x; previous.z = z; previous.phase = (previous.phase + length) % 24;
      }
    }
    this.mesh.visible = this.count > 0 && time - this.last < LIFE;
    if (!written) return;
    const tail = Math.min(written, this.capacity - start), wrap = Math.min(this.capacity, written - tail);
    for (const attribute of [this.positions, this.uvs, this.ages]) {
      const stride = attribute.itemSize * 4;
      attribute.addUpdateRange(start * stride, tail * stride);
      if (wrap) attribute.addUpdateRange(0, wrap * stride);
      attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, this.count * 6);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose(); this.mesh.material.dispose();
  }
}
