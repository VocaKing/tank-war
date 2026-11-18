// v6 shared, cached canvas camo textures for tank paint (one 512² texture per scheme, shared by every instance).
// Patterns: 'solid' (single colour, sun-faded mottling), 'spray' (German soft-edged spray-gun bands),
// 'hard' (NATO / Russian hard-edged 3-tone), 'digital' (Chinese pixel camo).
import * as THREE from 'three';
import { makeNoise2D, tileField, sampleField, RNG } from '../util.js';

const cache = {};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function tankCamoTexture(paint, seed = 1) {
  const pattern = paint.pattern || (paint.camo ? 'hard' : 'solid');
  const key = pattern + seed + JSON.stringify(paint);
  if (cache[key]) return cache[key];
  const S = 512; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const noise = makeNoise2D(seed), r = new RNG(seed * 7 + 1), N = 128;
  const base = hex(paint.base), camo = (paint.camo || []).map(hex);
  const dig = pattern === 'digital';
  const fq = dig ? 4.5 : pattern === 'spray' ? 2.6 : 2.8;
  const f1 = tileField(noise, N, fq, 4, 0, 0), f2 = tileField(noise, N, fq, 4, 31.7, 17.3), f3 = tileField(noise, N, fq * 1.3, 3, 57.1, 3.3);
  const fg = tileField(noise, N, 9, 3, 71, 5), ff = tileField(noise, N, 2, 2, 13, 91);
  const img = g.createImageData(S, S), d = img.data;
  // soft spray edges vs crisp brushed/masked edges
  const e = pattern === 'spray' ? 0.07 : pattern === 'hard' ? 0.012 : 0.0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; const q = dig ? 6 : 1; const u = (Math.floor(x / q) * q + q / 2) / S, v = (Math.floor(y / q) * q + q / 2) / S;
    let col = base.slice();
    if (camo.length) {
      const n1 = sampleField(f1, N, u, v), n2 = sampleField(f2, N, u, v), n3 = sampleField(f3, N, u, v);
      const mixc = (cc, t) => { for (let k = 0; k < 3; k++) col[k] += (cc[k] - col[k]) * t; };
      const th = (n, t0) => (e > 0 ? sstep(t0 - e, t0 + e, n) : n > t0 ? 1 : 0);
      if (pattern === 'spray') { // thin wavy bands of green / brown over dunkelgelb
        mixc(camo[0], th(0.17 - Math.abs(n1), 0.07)); if (camo[1]) mixc(camo[1], th(0.15 - Math.abs(n2), 0.07));
      } else {
        mixc(camo[0], th(n1, 0.1)); if (camo[1]) mixc(camo[1], th(n2, 0.14)); if (camo[2]) mixc(camo[2], th(n3, 0.24));
      }
    }
    // large-scale sun fade / repaint mottling + fine grime
    const fade = sampleField(ff, N, x / S, y / S) * (paint.fade ?? 14);
    const grime = sampleField(fg, N, x / S, y / S) * 16 + (r.next() - 0.5) * 7;
    d[i] = Math.max(0, Math.min(255, col[0] + fade + grime - 3)); d[i + 1] = Math.max(0, Math.min(255, col[1] + fade + grime - 3)); d[i + 2] = Math.max(0, Math.min(255, col[2] + fade * 0.8 + grime * 0.8 - 3)); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // small scratches / chips and mud dabs
  for (let k = 0; k < 260; k++) { g.fillStyle = r.next() < 0.6 ? `rgba(62,50,34,${0.06 + r.next() * 0.2})` : `rgba(28,27,24,${0.08 + r.next() * 0.25})`; g.beginPath(); g.arc(r.next() * S, r.next() * S, 0.8 + r.next() * 3.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(30,28,24,0.18)'; g.lineWidth = 0.8;
  for (let k = 0; k < 60; k++) { const x0 = r.next() * S, y0 = r.next() * S, a = r.next() * Math.PI, l = 4 + r.next() * 18; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return (cache[key] = t);
}
