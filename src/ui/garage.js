// Garage / showroom scene used by the main menu
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { createTankModel } from '../models/tankModel.js';
import { pbrTex } from '../world/textures.js';

export class Garage {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1d1f);
    this.scene.fog = new THREE.Fog(0x1b1d1f, 18, 45);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.models = {};
    this.angle = 0.6; this.current = null; this.drag = null;
    const pm = new THREE.PMREMGenerator(renderer);
    new RGBELoader().load('./tex/studio_1k.hdr', (hdr) => { hdr.mapping = THREE.EquirectangularReflectionMapping; this.scene.environment = pm.fromEquirectangular(hdr).texture; this.scene.environmentIntensity = 0.55; hdr.dispose(); });
    const floorTex = pbrTex('gravel_road', 'diff', 6), floorN = pbrTex('gravel_road', 'nor', 6);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ map: floorTex, normalMap: floorN, color: 0x8a8580, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.8, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.8, metalness: 0.3 }));
    plinth.position.y = 0.06; plinth.receiveShadow = true; this.scene.add(plinth);
    this.turntable = new THREE.Group(); this.turntable.position.y = 0.12; this.scene.add(this.turntable);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.6); key.position.set(6, 10, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2); rim.position.set(-8, 4, -6); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x2a2622, 0.5));
    const spot = new THREE.SpotLight(0xffe2b8, 40, 30, 0.6, 0.6); spot.position.set(0, 12, 0); spot.target = this.turntable; this.scene.add(spot);
  }
  show(spec) {
    if (!this.models[spec.id]) this.models[spec.id] = createTankModel(spec, { links: true });
    if (this.current) this.turntable.remove(this.current.root);
    this.current = this.models[spec.id]; this.turntable.add(this.current.root);
    this.current.turret.rotation.y = 0.0; this.current.gun.rotation.x = -0.04;
    this.spec = spec;
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  render(dt) {
    if (!this.drag) this.angle += dt * 0.18;
    const L = this.spec ? this.spec.dims.L : 6;
    const dist = (L * 1.65 + 3) * (this.distMul || 1);
    this.camera.position.set(Math.sin(this.angle) * dist, (2.6 + L * 0.12) * (this.hMul || 1), Math.cos(this.angle) * dist);
    this.camera.lookAt(0, 1.1, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
