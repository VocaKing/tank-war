// v5 post-processing (High only): N8AO ambient occlusion, subtle HDR bloom, tone map + sRGB output, SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

const BLOOM_SCALE = 0.65;

class ScaledBloomPass extends UnrealBloomPass {
  setSize(width, height) {
    super.setSize(Math.max(32, Math.round(width * BLOOM_SCALE)), Math.max(32, Math.round(height * BLOOM_SCALE)));
  }
}

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    this.ratio = renderer.getPixelRatio();
    this.composer = new EffectComposer(renderer, rt); this.composer.setPixelRatio(this.ratio); this.composer.setSize(w, h);
    const ao = new N8AOPass(scene, camera, w, h); this.ao = ao;
    // AO uses the depth from the main scene render. Skip the pair of
    // transparency renders for water and short-lived particle effects.
    ao.configuration.transparencyAware = false;
    Object.assign(ao.configuration, { aoRadius: 1.7, distanceFalloff: 1.2, intensity: 1.55, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, aoSamples: 12, denoiseSamples: 6, denoiseRadius: 10, color: new THREE.Color(0, 0, 0), screenSpaceRadius: false });
    this.composer.addPass(ao);
    const bloom = new ScaledBloomPass(new THREE.Vector2(w * BLOOM_SCALE, h * BLOOM_SCALE), 0.16, 0.52, 2.2); this.bloom = bloom; this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
    const pr = renderer.getPixelRatio(); this.smaa = new SMAAPass(w * pr, h * pr); this.composer.addPass(this.smaa);
  }
  setCamera(camera) { this.ao.camera = camera; }
  resize(w, h) {
    const ratio = this.renderer.getPixelRatio();
    if (this.ratio !== ratio) { this.ratio = ratio; this.composer.setPixelRatio(ratio); }
    this.composer.setSize(w, h);
  }
  render() { this.composer.render(); }
  dispose() {
    for (const pass of this.composer.passes) pass.dispose();
    // N8AO 2.1 inherits the empty Pass.dispose implementation. Release its
    // owned GPU resources when a match ends, including its depth atlas.
    for (const resource of new Set(Object.values(this.ao))) {
      if (resource?.isWebGLRenderTarget || resource?.isTexture || resource?.isMaterial) resource.dispose();
    }
    for (const key of ['depthMipAtlas', 'depthCopyPass', 'depthDownsampleQuad', 'effectShaderQuad', 'poissonBlurQuad', 'accumulationQuad', 'effectCompositerQuad']) {
      this.ao[key]?.dispose();
    }
    this.composer.dispose();
  }
}
