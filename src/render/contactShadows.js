import * as THREE from 'three';

const ROW = 5;
const VERTICES = ROW * ROW;
const INDICES = (ROW - 1) * (ROW - 1) * 6;

export class ContactShadows {
  constructor(world, tanks) {
    this.world = world;
    this.tanks = tanks;
    const geometry = new THREE.BufferGeometry();
    const count = tanks.length * VERTICES;
    this.position = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.opacity = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(count * 2);
    const indices = new Uint16Array(tanks.length * INDICES);
    let i = 0;
    for (let tank = 0; tank < tanks.length; tank++) {
      for (let z = 0; z < ROW; z++) for (let x = 0; x < ROW; x++) {
        const p = tank * VERTICES + z * ROW + x;
        uv.set([x / (ROW - 1), z / (ROW - 1)], p * 2);
        if (x === ROW - 1 || z === ROW - 1) continue;
        indices.set([p, p + ROW, p + 1, p + 1, p + ROW, p + ROW + 1], i);
        i += 6;
      }
    }
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('opacityByTank', this.opacity);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0x170f0a, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float opacityByTank; varying vec2 vContactUv; varying float vOpacityByTank;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvContactUv = uv; vOpacityByTank = opacityByTank;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vContactUv; varying float vOpacityByTank;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 d = abs(vContactUv - 0.5);
          float edge = length(max(d - vec2(0.19, 0.30), 0.0)) + 0.11 * length(d);
          diffuseColor.a *= vOpacityByTank * (1.0 - smoothstep(0.025, 0.29, edge));`);
    };
    material.customProgramCacheKey = () => 'tank-contact-shadow';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'vehicle contact shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
    world.scene.add(this.mesh);
  }

  update(camera) {
    const world = this.world;
    let active = 0;
    for (const t of this.tanks) {
      if (!(t.isPlayer || t.model.root.visible)) continue;
      const p = t.pos;
      const dx = camera.x - p.x, dz = camera.z - p.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= 135 * 135) continue;
      const groundY = world.groundHeight(p.x, p.z);
      if (world.terrain.waterLevel(p.x, p.z) > groundY + 0.1) continue;
      const elevation = Math.max(0, p.y - groundY);
      if (elevation >= 1.25) continue;
      const fade = 1 - elevation / 1.25;
      const opacity = 0.30 * Math.min(1, (135 - Math.sqrt(distanceSquared)) / 30) * fade * fade;
      const sin = Math.sin(t.heading), cos = Math.cos(t.heading);
      const dims = t.spec.dims;
      const width = dims.W * 1.34 + elevation * 0.7, length = dims.L * 1.23 + elevation * 0.7;
      for (let z = 0; z < ROW; z++) for (let x = 0; x < ROW; x++) {
        const u = (x / (ROW - 1) - 0.5) * width, v = (z / (ROW - 1) - 0.5) * length;
        const wx = p.x + cos * u + sin * v, wz = p.z - sin * u + cos * v;
        const index = active * VERTICES + z * ROW + x;
        this.position.setXYZ(index, wx, world.groundHeight(wx, wz) + 0.045, wz);
        this.opacity.setX(index, opacity);
      }
      active++;
    }
    this.mesh.geometry.setDrawRange(0, active * INDICES);
    this.mesh.visible = active > 0;
    if (!active) return;
    this.position.needsUpdate = true;
    this.opacity.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
