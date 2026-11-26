import * as THREE from 'three';
import { CloudVfx } from './cloudVfx.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const BUDGETS = {
  high: { capacity: 272, fire: 16, dust: 22, smoke: 27, cap: 9, wisps: 7 },
  medium: { capacity: 176, fire: 12, dust: 15, smoke: 17, cap: 6, wisps: 5 },
  low: { capacity: 108, fire: 8, dust: 9, smoke: 12, cap: 4, wisps: 3 },
};

export class ArtilleryVfx extends CloudVfx {
  constructor(scene, quality, dust) {
    const budget = BUDGETS[quality] ?? BUDGETS.high;
    super(scene, budget.capacity);
    this.dust = dust.map(value => value * value * 0.84);
    this.budget = budget;
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
}
