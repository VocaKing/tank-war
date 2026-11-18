// v6 focus outline: a red line that hugs the silhouette of ONE tank (the enemy under the player's focus).
// Works identically on every graphics setting and on top of the High post-processing chain:
//   1. the target's model is rendered alone into a small mask render target with a flat white override material
//      (its root is temporarily re-parented into a private scene, so the big world scene is never traversed);
//   2. a full-screen quad dilates the mask (N taps on a circle) and paints red only OUTSIDE the silhouette,
//      alpha-blended over the finished frame. The tank's own pixels — including the armour-penetration
//      overlay (X) — are left untouched, so both can be on at once.
// Cost: one extra draw of a single tank + one full-screen pass (8 taps Low/Medium, 16 taps High) only while a target exists.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const OUTLINE = {
  color: [1.0, 0.12, 0.08], // red
  thicknessPx: { high: 2.4, medium: 2.0, low: 1.6 }, // in CSS px
  taps: { high: 16, medium: 8, low: 8 },
  maskScale: { high: 1.0, medium: 0.75, low: 0.5 }, // mask RT resolution vs drawing buffer
  alpha: 0.95,
};

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = (taps) => /* glsl */`
uniform sampler2D tMask; uniform vec2 texel; uniform float radius; uniform vec3 color; uniform float alpha;
varying vec2 vUv;
void main(){
  float self = texture2D(tMask, vUv).r;
  if (self > 0.5) discard; // never paint over the tank itself
  float m = 0.0, m2 = 0.0;
  for (int i = 0; i < ${taps}; i++) {
    float a = 6.2831853 * float(i) / float(${taps});
    vec2 d = vec2(cos(a), sin(a)) * texel;
    m = max(m, texture2D(tMask, vUv + d * radius).r);
    m2 = max(m2, texture2D(tMask, vUv + d * radius * 0.5).r);
  }
  float edge = max(m, m2);
  if (edge < 0.02) discard;
  gl_FragColor = vec4(color, alpha * smoothstep(0.0, 0.6, edge));
}`;

export class Outline {
  constructor(renderer, quality = 'high') {
    this.renderer = renderer; this.q = OUTLINE.taps[quality] ? quality : 'high';
    this.scene = new THREE.Scene();
    this.scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false, side: THREE.DoubleSide });
    this.rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: this.rt.texture }, texel: { value: new THREE.Vector2() }, radius: { value: 2 }, color: { value: new THREE.Color(...OUTLINE.color) }, alpha: { value: OUTLINE.alpha } },
      vertexShader: VS, fragmentShader: FS(OUTLINE.taps[this.q]), transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.mat); this._cc = new THREE.Color(); this.lastDrawn = null;
    this.resize();
  }
  resize() {
    const s = new THREE.Vector2(); this.renderer.getDrawingBufferSize(s); const k = OUTLINE.maskScale[this.q];
    const w = Math.max(4, Math.round(s.x * k)), h = Math.max(4, Math.round(s.y * k)); this.rt.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    // radius is in mask texels: CSS px × pixelRatio × maskScale
    this.mat.uniforms.radius.value = OUTLINE.thicknessPx[this.q] * pr * k; this.mat.uniforms.texel.value.set(1 / w, 1 / h);
  }
  // draw the outline of tank `t` (or nothing) on top of what is already on screen
  render(t, camera) {
    this.lastDrawn = null;
    if (!t || !t.model || !t.model.root.visible) return;
    const R = this.renderer; const root = t.model.root; const parent = root.parent; if (!parent) return;
    const s = new THREE.Vector2(); R.getDrawingBufferSize(s); const k = OUTLINE.maskScale[this.q];
    if (Math.abs(this.rt.width - Math.round(s.x * k)) > 1 || Math.abs(this.rt.height - Math.round(s.y * k)) > 1) this.resize();
    const prevTarget = R.getRenderTarget(), prevAuto = R.autoClear, prevAlpha = R.getClearAlpha(); R.getClearColor(this._cc);
    const prevShadow = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false;
    this.scene.add(root); // re-parent (world transform unchanged: the world scene has an identity transform)
    try {
      R.setRenderTarget(this.rt); R.setClearColor(0x000000, 1); R.clear(true, false, false); R.autoClear = false;
      R.render(this.scene, camera);
    } finally { parent.add(root); R.setClearColor(this._cc, prevAlpha); R.shadowMap.autoUpdate = prevShadow; }
    R.setRenderTarget(prevTarget); R.autoClear = false;
    this.quad.render(R);
    R.autoClear = prevAuto; this.lastDrawn = t;
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); this.scene.overrideMaterial.dispose(); }
}
