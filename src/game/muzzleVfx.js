import { Vector3 } from 'three';
import { CloudVfx } from './cloudVfx.js';

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0);
const budgets = { low: [108, 7, 4], medium: [170, 10, 6], high: [242, 13, 8] };
const soot = [0.19, 0.165, 0.145], pale = [0.31, 0.295, 0.27];
const colors = { amber: [1, 0.37, 0.063], gold: [1, 0.51, 0.12], orange: [1, 0.24, 0.026], blue: [0.12, 0.55, 1] };
// Width, forward reach, lateral vents, smoke persistence, and flash colour.
// These are visual profiles for the game, with individual variation per vehicle.
const signatures = {
  sherman: [0.91, 1.02, 0.32, 0.88, 'gold'], t34: [1.05, 0.9, 0.22, 1.04, 'amber'],
  panther: [0.87, 1.32, 0.82, 0.90, 'gold'], tiger: [1.18, 1.05, 0.72, 1.18, 'amber'],
  is2: [1.24, 0.94, 0.87, 1.37, 'orange'], mauseng: [1.36, 0.93, 0.20, 1.42, 'orange'],
  m1a2: [1.35, 1.19, 0.1, 1.06, 'gold'], chally2: [1.26, 1.03, 0.18, 1.28, 'orange'],
  leo2a6: [0.92, 1.42, 0.16, 0.98, 'gold'], t72: [1.13, 1.24, 0.24, 1.18, 'amber'],
  t90m: [1.11, 1.18, 0.33, 1.12, 'orange'], strv103: [0.85, 1.29, 0.43, 0.88, 'gold'],
  aegis140: [0.86, 1.55, 0.22, 0.62, 'blue'], fv4005s1: [1.45, 1.05, 0.12, 1.48, 'orange'],
  archer: [0.90, 1.32, 1.18, 1.35, 'gold'], pzh2000: [1.22, 1.01, 0.99, 1.48, 'amber'],
  tempest155: [1.04, 1.16, 1.07, 1.24, 'gold'], thunderclad155: [1.30, 0.96, 0.80, 1.52, 'orange'],
  bmpt: [0.57, 1.29, 0.25, 0.64, 'gold'], '2s38': [0.68, 1.33, 0.38, 0.79, 'amber'],
  m50ontos: [0.74, 1.13, 0.54, 1.11, 'orange'],
};
const profiles = new Map();
export function muzzleProfile(spec, caliber, mode = 'gun') {
  const key = `${spec.id}/${caliber}/${mode}`;
  if (profiles.has(key)) return profiles.get(key);
  let hash = 2166136261;
  for (const c of spec.id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const unit = shift => ((hash >>> shift) & 255) / 255;
  const heavy = spec.cls === 'Artillery' || spec.cls === 'Super-heavy';
  const [width, length, vents, linger, hue] = signatures[spec.id] ?? [
    heavy ? 1.17 : 0.94, heavy ? 1.01 : 1.14, spec.cls === 'Tank Destroyer' ? 0.65 : 0.32,
    heavy ? 1.26 : 0.98, spec.era === 'WWII' ? 'orange' : 'gold',
  ];
  const size = Math.pow(Math.max(0.12, Math.min(2.2, caliber / 100)), 0.81);
  const guided = mode === 'guided';
  const tube = mode === 'tube';
  const profile = {
    size: size * (guided ? 0.48 : tube ? 0.75 : 1),
    width: width * (0.85 + unit(0) * 0.29), length: length * (0.9 + unit(8) * 0.22),
    vents: vents * (0.81 + unit(16) * 0.38),
    linger: linger * (0.86 + unit(24) * 0.27),
    tint: colors[guided ? 'gold' : hue], guided, tube,
    phase: unit(4) * TAU,
  };
  profiles.set(key, profile);
  return profile;
}

export class MuzzleVfx extends CloudVfx {
  constructor(scene, quality, dust, ground) {
    const [capacity, flameCount, smokeCount] = budgets[quality] ?? budgets.high;
    super(scene, capacity, true);
    this.flameCount = flameCount;
    this.smokeCount = smokeCount;
    this.dust = dust.map(value => value * value * 0.84);
    this.ground = ground;
  }

  fire(pos, dir, profile) {
    const random = Math.random;
    const { size, width, length, vents, linger, tint, phase, guided, tube } = profile;
    const right = new Vector3().crossVectors(Math.abs(dir.y) < 0.94 ? UP : X, dir).normalize();
    const up = new Vector3().crossVectors(dir, right);
    const center = new Vector3(), ray = new Vector3();
    const radius = size * width;
    const heat = guided ? 0.68 : 1;
    const fireLife = guided ? 0.16 : 0.11 + Math.min(0.065, radius * 0.043);
    const lobes = Math.max(4, Math.round(this.flameCount * (radius < 0.57 ? 0.62 : 1)));
    const addFire = (distance, lateral, vertical, velocity, diameter, opacity, life = fireLife) => {
      center.copy(pos).addScaledVector(dir, distance).addScaledVector(right, lateral).addScaledVector(up, vertical);
      this.emit(center, velocity, {
        speed: 7.3 * size, life, initial: diameter * 0.77, size: diameter * 1.47,
        tint: soot, flameTint: tint, alpha: opacity, heat, cooling: life * 1.13, fadeIn: 0.006,
      });
    };

    // A compact, overexposed jet feeds a turbulent ring instead of a screen-sized glare sprite.
    ray.copy(dir).multiplyScalar(0.25);
    addFire(size * 0.13, 0, 0, ray, size * 1.16, 1, fireLife * 0.8);
    addFire(size * 0.93, 0, 0, ray, radius * 1.45, 1);
    for (let i = 0; i < 4; i++) {
      addFire((0.14 + i * 0.49) * size * length, 0, 0, dir,
        size * (0.89 - 0.14 * i), 0.98 - i * 0.10, fireLife * (0.73 + 0.075 * i));
    }
    for (let i = 0; i < lobes; i++) {
      const angle = phase + TAU * (i + random() * 0.47) / lobes;
      const x = Math.cos(angle), y = Math.sin(angle);
      const spread = radius * (0.30 + random() * 0.23);
      ray.copy(dir).multiplyScalar(0.33).addScaledVector(right, x * (0.59 + vents * 0.46)).addScaledVector(up, y * 0.70);
      addFire(size * (0.69 + random() * 0.48), x * spread * (1 + vents * 0.48), y * spread, ray,
        radius * (0.78 + random() * 0.4), 0.91);
    }
    if (vents > 0.6) for (const side of [-1, 1]) {
      ray.copy(dir).multiplyScalar(0.12).addScaledVector(right, side * (0.67 + vents));
      addFire(size * 0.26, side * size * 0.46, 0, ray, radius * 0.86, 0.89);
    }

    // After the flash, cooler puffs advect forward and rise. Only a nearby ground surface gets dust.
    for (let i = 0; i < this.smokeCount; i++) {
      const angle = phase + TAU * (i + random()) / this.smokeCount;
      ray.copy(dir).multiplyScalar((0.51 + random() * 0.63) * length)
        .addScaledVector(right, Math.cos(angle) * (0.37 + vents * 0.32)).addScaledVector(up, Math.sin(angle) * 0.63);
      center.copy(pos).addScaledVector(dir, size * (0.19 + random() * 0.74));
      this.emit(center, ray, {
        delay: 0.04 + random() * 0.13, life: (1.15 + random() * 1.27) * linger,
        speed: (1.9 + random() * 2.8) * Math.sqrt(size), initial: 0.61 * radius,
        size: (1.78 + random() * 1.41) * radius, tint: guided || tube ? pale : soot,
        alpha: guided ? 0.58 : 0.82, fadeIn: 0.17, rise: 0.56,
      });
    }
    if (size >= 0.59 && this.ground && !guided) {
      const y = this.ground(pos.x, pos.z);
      const clearance = pos.y - y;
      if (clearance >= 0 && clearance < 3.7) {
        for (let i = 0; i < 4; i++) {
          const angle = phase + TAU * i / 4;
          ray.set(Math.cos(angle), 0.09, Math.sin(angle)).addScaledVector(dir, 0.49);
          center.set(pos.x + ray.x * 0.68, y + 0.26, pos.z + ray.z * 0.68);
          this.emit(center, ray, {
            speed: 3.8 * size, delay: 0.044 + i * 0.012, life: 1.52 * linger,
            initial: 0.93 * size, size: (2.5 + random()) * size, tint: this.dust,
            alpha: 0.53 * (1 - clearance / 5), fadeIn: 0.22, rise: 0.21,
          });
        }
      }
    }
    if (this.puffs.length > this.capacity) this.puffs.splice(0, this.puffs.length - this.capacity);
  }
}
