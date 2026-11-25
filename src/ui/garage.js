// Garage / showroom scene used by the main menu
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { createTankModel, hasDetailedTankModel, loadDetailedTankModel } from '../models/tankModel.js';
import { createFleetModel, hasFleetModel } from '../models/fleetModel.js';
import { applyArmorPreview, clearArmorPreview, updateArmorPreview } from './armorPreview.js';
import { pbrTex } from '../world/textures.js';
import { sharedMediaUrl } from '../media.js';

// Frame the entire lineup at the same metres per pixel. Position the orbit a
// little forward of the hull centre to leave room for the longest gun.
const ORBIT_TARGET = new THREE.Vector3(0, 1.4, 1.0);
const ORBIT_RADIUS = 18;
const GARAGE_WIDTH = 13.6;
const GARAGE_HEIGHT = 7.6;

export class Garage {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x202528);
    this.scene.fog = new THREE.Fog(0x202528, 18, 45);
    this.camera = new THREE.OrthographicCamera(-7, 7, 4, -4, 0.1, 1200);
    this.models = {};
    this.angle = 0.6; this.current = null; this.drag = null; this.armorMode = false;
    const pm = new THREE.PMREMGenerator(renderer);
    new RGBELoader().load(sharedMediaUrl('tex/studio_1k.hdr'), (hdr) => { hdr.mapping = THREE.EquirectangularReflectionMapping; this.scene.environment = pm.fromEquirectangular(hdr).texture; this.scene.environmentIntensity = 0.83; hdr.dispose(); pm.dispose(); });
    // The larger floor keeps the same texel density and fills an orthographic view at low angles.
    const floorTex = pbrTex('gravel_road', 'diff', 40), floorN = pbrTex('gravel_road', 'nor', 40);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(200, 64), new THREE.MeshStandardMaterial({ map: floorTex, normalMap: floorN, color: 0x727579, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.8, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.8, metalness: 0.3 }));
    plinth.position.y = 0.06; plinth.receiveShadow = true; this.scene.add(plinth);
    this.turntable = new THREE.Group(); this.turntable.position.y = 0.12; this.scene.add(this.turntable);
    const key = new THREE.DirectionalLight(0xfff1df, 3.25); key.position.set(6, 8, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 }); key.shadow.bias = -0.00038; key.shadow.normalBias = 0.011;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc5daed, 1.4); rim.position.set(-8, 5, -7); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xeaf0f3, 0.60); fill.position.set(-6, 3, 8); this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x625744, 0.64));
    this._bindDrag();
  }
  _bindDrag() {
    const interactive = (t) => t && t.closest && t.closest('button, select, input, a, label, .tbl-btn, .tcard, .mcard, .box');
    const start = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (interactive(e.target) || e.target !== this.renderer.domElement) return;
      this.drag = { x: e.clientX, y: e.clientY, a: this.angle, h: this.hMul || 1 };
    };
    const move = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.angle = this.drag.a - dx * 0.01;
      this.hMul = Math.max(0.4, Math.min(2.4, this.drag.h + dy * 0.005));
    };
    const end = () => { this.drag = null; };
    window.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  show(spec) {
    if (this.current) {
      clearArmorPreview(this.current);
      this.turntable.remove(this.current.root);
    }
    this.current = null;
    this.spec = spec;
    const id = spec.id;
    const fleet = hasFleetModel(id);
    if (fleet && !this.models[id]) {
      const cached = createFleetModel(spec);
      if (cached) this.models[id] = cached;
      else {
        loadDetailedTankModel(spec).then(() => {
          this.models[id] ??= createTankModel(spec, { links: true });
          if (this.spec === spec) this.show(spec);
        });
        return;
      }
    }
    this.models[id] ??= createTankModel(spec, { links: true });
    this.current = this.models[id];
    this.turntable.add(this.current.root);
    this.current.turret.rotation.y = 0;
    this.current.gun.rotation.x = spec.id === 'archer' ? -0.21 : -0.04;
    if (this.armorMode) this.setArmorMode(true);
    if (!fleet && hasDetailedTankModel(id) && this.current.links) {
      const placeholder = this.current;
      loadDetailedTankModel(spec).then(loaded => {
        if (!loaded || this.models[spec.id] !== placeholder) return;
        this.models[spec.id] = createTankModel(spec, { links: true });
        clearArmorPreview(placeholder);
        if (this.current === placeholder) this.show(spec);
        placeholder.links.forEach(mesh => mesh.dispose());
        placeholder.wheels.dispose();
        placeholder.sprockets.dispose();
        placeholder.tracks.forEach(mesh => mesh.material.dispose());
        placeholder.trackTex.forEach(texture => texture.dispose());
      });
    }
  }
  setArmorMode(on, shell) {
    this.armorMode = !!on;
    if (shell) this.refShell = shell;
    if (!this.current || !this.spec) return { n: 0, pen: 0 };
    if (on) return applyArmorPreview(this.current, this.spec, this.refShell);
    clearArmorPreview(this.current); return { n: 0, pen: 0 };
  }
  setSidePanels(list, stats) {
    this.sidePanels = [list, stats];
    this.resize(this.width, this.height);
  }
  resize(w, h) {
    this.width = w;
    this.height = h;
    let stageWidth = w;
    let centerX = w / 2;
    if (this.sidePanels) {
      const [list, stats] = this.sidePanels.map(panel => panel.getBoundingClientRect());
      const left = list.right + 12;
      const right = stats.left - 12;
      if (right > left) {
        stageWidth = right - left;
        centerX = (left + right) / 2;
      }
    }
    const metresPerPixel = Math.max(GARAGE_WIDTH / stageWidth, GARAGE_HEIGHT / h);
    this.camera.left = -centerX * metresPerPixel;
    this.camera.right = (w - centerX) * metresPerPixel;
    this.camera.top = h / 2 * metresPerPixel;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
  }
  render(dt) {
    if (!this.drag) this.angle += dt * 0.18;
    const rise = 4.9 * (this.hMul || 1);
    // Orthographic distance leaves scale unchanged. Pull the camera back
    // enough that the entire near plane sits above the showroom floor.
    const setback = Math.max(1, (this.camera.top + 1) / rise);
    this.camera.position.set(
      Math.sin(this.angle) * ORBIT_RADIUS,
      rise,
      Math.cos(this.angle) * ORBIT_RADIUS,
    ).multiplyScalar(setback).add(ORBIT_TARGET);
    this.camera.lookAt(ORBIT_TARGET);
    const distance = Math.hypot(ORBIT_RADIUS, rise) * setback;
    this.scene.fog.near = distance;
    this.scene.fog.far = distance + 27;
    if (this.armorMode) updateArmorPreview(this.current);
    this.renderer.render(this.scene, this.camera);
  }
}
