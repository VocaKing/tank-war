// v5 post-processing (High only): N8AO ambient occlusion, subtle HDR bloom, tone map + sRGB output, SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, rt); this.composer.setPixelRatio(renderer.getPixelRatio()); this.composer.setSize(w, h);
    const ao = new N8AOPass(scene, camera, w, h); this.ao = ao;
    Object.assign(ao.configuration, { aoRadius: 1.6, distanceFalloff: 1.2, intensity: 1.6, accumulate: false, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, aoSamples: 12, denoiseSamples: 4, denoiseRadius: 8, color: new THREE.Color(0, 0, 0), screenSpaceRadius: false });
    this.composer.addPass(ao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.10, 0.40, 2.2); this.bloom = bloom; this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
    const pr = renderer.getPixelRatio(); this.smaa = new SMAAPass(w * pr, h * pr); this.composer.addPass(this.smaa);
  }
  setCamera(camera) { this.ao.camera = camera; }
  resize(w, h) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  render() {
    // AO may render the scene multiple times. Refresh dynamic shadows once per displayed frame.
    const shadows = this.renderer.shadowMap, auto = shadows.autoUpdate;
    shadows.autoUpdate = false; shadows.needsUpdate = true;
    try { this.composer.render(); } finally { shadows.autoUpdate = auto; }
  }
  dispose() { this.composer.dispose(); }
}
