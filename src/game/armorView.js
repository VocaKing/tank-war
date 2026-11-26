import * as THREE from 'three';
import { PEN_RNG } from './tankData.js';
import { impactDrop } from './combatMath.js';
import { createArmorOverlay } from './armorOverlay.js';

export class ArmorView {
  constructor(game) {
    this.game = game;
    this.enabled = true;
    this.active = false;
    this.data = new Map();
  }
  toggle() { this.enabled = !this.enabled; return this.enabled; }
  update() {
    const g = this.game, player = g.player;
    this.active = this.enabled && g.cam.sniper && player.alive && !g.camOverride;
    const muzzle = this.active ? player.muzzleNode.getWorldPosition(new THREE.Vector3()) : null;
    const shell = player.previewShell;
    for (const tank of g.tanks) {
      const show = this.active && tank.team !== player.team && tank.alive && tank.model.root.visible;
      let overlay = this.data.get(tank);
      if (!show) {
        overlay?.show(false);
        continue;
      }
      if (!overlay) {
        overlay = createArmorOverlay(tank.model, tank.spec);
        this.data.set(tank, overlay);
      }
      overlay.show(true);
      overlay.update(tank.armorProfile, shell, muzzle, tank.eraSpent);
    }
  }
  classify(target, worldPoint) {
    const g = this.game, player = g.player, shell = player.previewShell;
    const muzzle = player.muzzleNode.getWorldPosition(new THREE.Vector3());
    const dir = worldPoint.clone().sub(muzzle).normalize();
    const end = worldPoint.clone().addScaledVector(dir, 2.5);
    const hit = target.rayTest(muzzle, end);
    if (!hit || hit.wheel) return { cls: 'none' };
    const delta = end.sub(muzzle).multiplyScalar(hit.t);
    const dist = delta.length();
    delta.y -= impactDrop(delta.lengthSq(), delta.y, shell.velocity);
    hit.dirW.copy(delta).normalize();
    const ev = g.ballistics.evaluate(target, hit, shell, dist);
    const pmin = ev.pen * (1 - PEN_RNG), pmax = ev.pen * (1 + PEN_RNG);
    const cls = ev.ricochet || ev.eff > pmax ? 'red' : ev.eff <= pmin ? 'green' : 'yellow';
    return { cls, los: ev.los, eff: Math.round(ev.eff), pen: Math.round(ev.pen), part: hit.part,
      face: hit.face, zone: ev.zone, angle: Math.round(ev.angle), ricochet: ev.ricochet };
  }
  dispose() {
    for (const overlay of this.data.values()) overlay.dispose();
    this.data.clear();
  }
  overlayCount(tank) { return this.data.get(tank)?.layers.filter(layer => layer.visible).length || 0; }
}
