import * as THREE from 'three';
import { CloudVfx } from './cloudVfx.js';

const TAU = 2 * Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const SOOT = [[0.029, 0.026, 0.023], [0.046, 0.040, 0.036], [0.067, 0.058, 0.050]];
const STEAM = [0.53, 0.60, 0.63];
const BUDGETS = {
  high: { capacity: 580, fire: 12, dust: 18, stem: 18, crown: 16, sparks: 32, debris: 8 },
  medium: { capacity: 390, fire: 8, dust: 12, stem: 13, crown: 12, sparks: 22, debris: 5 },
  low: { capacity: 270, fire: 5, dust: 8, stem: 8, crown: 9, sparks: 13, debris: 3 },
};

export class TankWreckVfx extends CloudVfx {
  constructor(scene, quality, dust) {
    const budget = BUDGETS[quality] ?? BUDGETS.high;
    super(scene, budget.capacity);
    this.budget = budget;
    this.dust = dust.map(channel => channel * channel * 0.83);
    this.mesh.name = 'Tank destruction clouds';
  }

  burst(origin, surfaceY, water, scale) {
    const { capacity, fire, dust, stem, crown } = this.budget;
    // Keep the crown and column present on every quality tier. When many wrecks
    // are active, thin the overlapping puffs before exceeding the shared batch.
    const density = this.puffs.length > capacity * 0.55 ? 0.64 : 1;
    const random = Math.random;
    const direction = new THREE.Vector3(), start = origin.clone();
    const smokeColor = () => SOOT[Math.floor(random() * SOOT.length)];
    const count = n => Math.max(3, Math.round(n * density));

    this.emit(origin, UP, {
      speed: 8 * scale, life: 0.36, initial: 5.0 * scale, size: 10.5 * scale,
      heat: 1, tint: SOOT[0], fadeIn: 0.022,
    });
    for (let i = 0; i < count(fire); i++) {
      const angle = random() * TAU;
      direction.set(Math.cos(angle) * 0.74, 0.30 + random() * 0.81, Math.sin(angle) * 0.74);
      this.emit(origin, direction, {
        speed: (7.5 + random() * 5.5) * scale, delay: i * 0.019, life: 0.63 + random() * 0.68,
        initial: (2.8 + random() * 1.8) * scale, size: (6.1 + random() * 3.8) * scale,
        tint: SOOT[0], heat: 1, fadeIn: 0.046, rise: 0.6,
      });
    }

    // Dust stays at the vehicle's feet. Over water the same expanding ring
    // becomes spray, while the hot smoke above the hull keeps its shape.
    const ringCount = count(dust);
    const lift = Math.max(0, origin.y - surfaceY - 2);
    for (let i = 0; i < ringCount; i++) {
      const angle = (i + random() * 0.7) * TAU / ringCount;
      const x = Math.cos(angle), z = Math.sin(angle);
      start.set(origin.x + x * scale, surfaceY + 0.60, origin.z + z * scale);
      direction.set(x, water ? 0.27 : 0.075 + random() * 0.11, z);
      this.emit(start, direction, {
        speed: (10.2 + random() * 6.2) * scale, delay: 0.08 + random() * 0.18 + Math.min(0.8, lift * 0.12),
        life: (water ? 2.1 : 3.7) + random() * 1.8, initial: 2.4 * scale, size: (5.8 + random() * 3.8) * scale,
        tint: water ? STEAM : this.dust, alpha: (water ? 0.68 : 0.72) / (1 + lift * 0.12), fadeIn: 0.17,
      });
    }

    // Stagger smoke along the height of the column. Lower puffs anchor the
    // narrower stem to the wreck as the hottest material rises into the crown.
    const stemCount = count(stem);
    for (let i = 0; i < stemCount; i++) {
      const level = (i + random()) / stemCount;
      const angle = random() * TAU;
      const lateral = 0.12 + random() * 0.14;
      direction.set(Math.cos(angle) * lateral, 0.28 + level * 1.01, Math.sin(angle) * lateral);
      start.set(origin.x + Math.cos(angle) * scale * 0.32, origin.y, origin.z + Math.sin(angle) * scale * 0.32);
      this.emit(start, direction, {
        speed: (11.2 + random() * 2.9) * scale, delay: 0.09 + 0.32 * level + random() * 0.28,
        life: 6.8 + random() * 3.6, initial: (2.9 + random() * 1.2) * scale,
        size: (4.9 + random() * 2.5 + level * 1.8) * scale, tint: smokeColor(),
        alpha: 0.91 + random() * 0.07, fadeIn: 0.23 + random() * 0.24,
        heat: 0.19 + random() * 0.19, cooling: 0.8 + random() * 0.9, rise: (0.42 + level * 0.86) * scale,
      });
    }

    // A thick center crowns an annulus whose leading lobes spread and turn
    // downward. Each lobe has its own timing so the silhouette stays irregular.
    this.emit(origin, UP, {
      speed: 20.5 * scale, delay: 0.36, life: 10.4, initial: 5.9 * scale, size: 13.7 * scale,
      tint: SOOT[1], alpha: 0.99, fadeIn: 0.57, heat: 0.21, cooling: 1.45, rise: 1.45 * scale,
    });
    const crownCount = count(crown);
    const rimCount = Math.max(3, Math.floor(crownCount * 0.77));
    for (let i = 0; i < crownCount; i++) {
      const rim = i < rimCount;
      const angle = (i + random() * 0.6) * TAU / rimCount;
      const radius = rim ? 0.18 + random() * 0.10 : 0.06 + random() * 0.09;
      direction.set(Math.cos(angle) * radius, (rim ? 0.96 : 1.10) + random() * 0.09, Math.sin(angle) * radius);
      start.set(origin.x, origin.y + (rim ? 0.44 : 0.76) * scale, origin.z);
      this.emit(start, direction, {
        speed: (16.7 + random() * 2.2) * scale, delay: 0.30 + random() * 0.30,
        life: 8.3 + random() * 3.9, initial: (4.4 + random() * 1.8) * scale, size: (10.8 + random() * 3.5) * scale,
        tint: smokeColor(), alpha: rim ? 0.88 : 0.99, fadeIn: 0.42 + random() * 0.34,
        heat: 0.16 + random() * 0.16, cooling: 1.3 + random() * 0.74, rise: (rim ? 1.07 : 1.28) * scale,
        roll: rim ? (1.65 + random() * 0.83) * scale : 0,
      });
    }
    if (this.puffs.length <= capacity) return;
    // Remove older dust and flash puffs first so a full platoon's smoke caps
    // can develop even if the vehicles go down in the same frame.
    let excess = this.puffs.length - capacity, kept = 0;
    for (const puff of this.puffs) {
      if (excess > 0 && puff.life < 6) {
        excess--;
        continue;
      }
      this.puffs[kept++] = puff;
    }
    this.puffs.length = kept;
    if (excess) this.puffs.splice(0, excess);
  }
}
