import * as THREE from 'three';
import { RNG, makeNoise2D, fbm, tileField, sampleField } from '../util.js';
import { sharedMediaUrl } from '../media.js';

const loader = new THREE.TextureLoader();
const cache = new Map();
let maxAniso = 8;
export function setMaxAniso(a) { maxAniso = a; }

// Poly Haven CC0 textures shipped in /public/tex
// v5: 2k sets for terrain layers on High (1k otherwise); 'arm' = AO/Roughness/Metal packed (linear)
const HI_SETS = new Set(['leafy_grass', 'forest_ground_04', 'aerial_rocks_02', 'gravel_road', 'coast_sand_01', 'dry_ground_01']);
const FALLBACK_COLORS = {
  leafy_grass: '#727e4b', forest_ground_04: '#796955', aerial_rocks_02: '#888075',
  gravel_road: '#9b8978', coast_sand_01: '#c3ae84', dry_ground_01: '#aa8b64',
  plastered_stone_wall: '#b3ab9b', red_brick_03: '#955748', clay_plaster: '#bca981',
  damaged_plaster: '#a99573', clay_roof_tiles_02: '#a26752',
  brown_planks_05: '#8b725b', bark_brown_02: '#7a6552', rusty_metal_02: '#776457',
};
const fallbackImages = new Map();
function fallbackImage(name, kind) {
  const color = kind === 'nor' ? '#8080ff' : kind === 'arm' ? '#ffc800' : (FALLBACK_COLORS[name] ?? '#aaa498');
  if (!fallbackImages.has(color)) {
    const [image, context] = canvas(1, 1);
    context.fillStyle = color; context.fillRect(0, 0, 1, 1);
    fallbackImages.set(color, image);
  }
  return fallbackImages.get(color);
}
let texHi = false;
export function setTexQuality(q) { texHi = q === 'high'; }
function loadPbr(name, kind) {
  const hi = texHi && kind !== 'arm' && HI_SETS.has(name);
  const t = loader.load(sharedMediaUrl(`tex/${name}_${kind}${hi ? '_2k' : ''}.jpg`), texture => {
    // WebGL2 texture storage is immutable. Release the placeholder's
    // allocation before uploading the decoded image at its actual size.
    texture.dispose();
  });
  // TextureLoader swaps this image out as soon as the real map decodes.
  t.image = fallbackImage(name, kind);
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function pbrTex(name, kind = 'diff', repeat = 1) {
  const key = name + kind + (texHi ? 'H' : 'L') + repeat;
  if (!cache.has(key)) { const t = loadPbr(name, kind); if (repeat !== 1) t.repeat.set(repeat, repeat); cache.set(key, t); }
  return cache.get(key);
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

const memo = {};
function once(key, fn) { return memo[key] || (memo[key] = fn()); }

// ---------- Foliage cards ----------
export function leafTexture(kind = 'broadleaf', opaque = false) {
  return once('leaf_' + kind + opaque, () => {
    const S = 512; const [c, g] = canvas(S, S); const r = new RNG(kind.length * 977 + 3);
    if (opaque) { g.fillStyle = kind === 'dry' ? '#3a3624' : '#1b2814'; g.fillRect(0, 0, S, S); }
    const P = {
      broadleaf: { hue: [85, 110], sat: [35, 55], lit: [18, 40], n: 900, size: [7, 14], round: 0.55 },
      oak: { hue: [75, 100], sat: [30, 50], lit: [16, 34], n: 900, size: [8, 15], round: 0.7 },
      birch: { hue: [70, 95], sat: [40, 60], lit: [24, 46], n: 1000, size: [5, 10], round: 0.6 },
      bush: { hue: [80, 115], sat: [30, 50], lit: [14, 34], n: 1400, size: [5, 11], round: 0.5 },
      dry: { hue: [45, 75], sat: [18, 35], lit: [22, 42], n: 1300, size: [4, 8], round: 0.45 },
    }[kind];
    // twigs
    g.strokeStyle = 'rgba(60,45,30,0.9)'; g.lineWidth = 3;
    for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(S / 2, S); g.quadraticCurveTo(r.range(0, S), r.range(S * 0.4, S), r.range(40, S - 40), r.range(40, S * 0.6)); g.stroke(); }
    for (let i = 0; i < P.n; i++) {
      // distribute in a soft disc so card edges stay transparent
      const a = r.range(0, Math.PI * 2), rad = Math.sqrt(r.next()) * S * 0.46;
      const x = opaque ? r.range(0, S) : S / 2 + Math.cos(a) * rad, y = opaque ? r.range(0, S) : S / 2 + Math.sin(a) * rad * 0.92;
      const sz = r.range(P.size[0], P.size[1]);
      const shade = 1 - (y / S) * 0.35 + r.range(-0.08, 0.08);
      g.save(); g.translate(x, y); g.rotate(r.range(0, Math.PI * 2));
      g.fillStyle = hsl(r.range(P.hue[0], P.hue[1]), r.range(P.sat[0], P.sat[1]), r.range(P.lit[0], P.lit[1]) * shade);
      g.beginPath(); g.ellipse(0, 0, sz, sz * P.round, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-sz, 0); g.lineTo(sz, 0); g.stroke();
      g.restore();
    }
    return toTex(c, true, opaque);
  });
}
export function needleTexture() {
  return once('needles', () => {
    const S = 512; const [c, g] = canvas(S, S); const r = new RNG(42);
    for (let b = 0; b < 9; b++) {
      const x0 = r.range(60, S - 60), y0 = r.range(60, S - 60), ang = r.range(-0.6, 0.6) - Math.PI / 2, len = r.range(160, 260);
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        const t = i / steps; const x = x0 + Math.cos(ang) * len * (t - 0.5), y = y0 + Math.sin(ang) * len * (t - 0.5);
        const w = (1 - t * 0.6) * 46;
        for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 4; k++) {
          const na = ang + s * r.range(0.7, 1.2);
          g.strokeStyle = hsl(r.range(95, 135), r.range(25, 45), r.range(10, 26)); g.lineWidth = r.range(1.5, 3);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(na) * w * r.range(0.6, 1), y + Math.sin(na) * w * r.range(0.6, 1)); g.stroke();
        }
      }
      g.strokeStyle = 'rgba(70,50,30,1)'; g.lineWidth = 3; g.beginPath();
      g.moveTo(x0 - Math.cos(ang) * len / 2, y0 - Math.sin(ang) * len / 2); g.lineTo(x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2); g.stroke();
    }
    return toTex(c, true, false);
  });
}
export function frondTexture() {
  return once('frond', () => {
    const W = 512, H = 128; const [c, g] = canvas(W, H); const r = new RNG(7);
    g.strokeStyle = '#5a5530'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, H / 2); g.quadraticCurveTo(W / 2, H / 2 - 8, W, H / 2 + 4); g.stroke();
    for (let i = 0; i < 90; i++) {
      const t = i / 90, x = t * W, y = H / 2 - 8 * Math.sin(t * Math.PI) + 4 * t;
      const l = (1 - Math.abs(t - 0.35)) * 58;
      for (const s of [-1, 1]) {
        g.strokeStyle = hsl(r.range(70, 95), r.range(30, 50), r.range(18, 34)); g.lineWidth = r.range(2, 4);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.5, y + s * l * r.range(0.7, 1)); g.stroke();
      }
    }
    return toTex(c, true, false);
  });
}

// ---------- Tank textures ----------
export function trackTexture() {
  return once('track', () => {
    const W = 128, H = 128; const [c, g] = canvas(W, H);
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, W, H);
    // one link per texture repeat in U
    g.fillStyle = '#3d3a36'; g.fillRect(6, 4, W - 12, H - 8);
    g.fillStyle = '#1b1a19'; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
    g.fillStyle = '#55514b'; g.fillRect(W * 0.35, 8, W * 0.3, H - 16); // grouser
    g.fillStyle = '#2f2d2a'; g.fillRect(W * 0.42, H * 0.42, W * 0.16, H * 0.16); // guide horn hole
    const r = new RNG(3); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${90 + r.range(0, 60)},${70 + r.range(0, 40)},${50},${r.range(0.05, 0.25)})`; g.fillRect(r.range(0, W), r.range(0, H), 2, 2); }
    return toTex(c);
  });
}
export function camoTexture(paint, seed = 1) {
  return once('camo_' + seed + JSON.stringify(paint), () => {
  const S = 512; const [c, g] = canvas(S, S); const r = new RNG(seed); const noise = makeNoise2D(seed);
  g.fillStyle = paint.base; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S); const d = img.data;
  const camo = (paint.camo || []).map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const grimeAmount = paint.grime ?? 1;
  const dig = paint.pattern === 'digital'; const N = 128;
  const f1 = tileField(noise, N, dig ? 5 : 3.2, 4, 0, 0), f2 = tileField(noise, N, dig ? 5 : 3.2, 4, 31.7, 17.3), fg = tileField(noise, N, 9, 3, 71, 5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; const q = dig ? 8 : 1; const u = (Math.floor(x / q) * q + q / 2) / S, v = (Math.floor(y / q) * q + q / 2) / S;
    const n1 = sampleField(f1, N, u, v), n2 = sampleField(f2, N, u, v);
    if (camo.length) {
      if (n1 > 0.12) { d[i] = camo[0][0]; d[i + 1] = camo[0][1]; d[i + 2] = camo[0][2]; }
      else if (camo[1] && n2 > 0.16) { d[i] = camo[1][0]; d[i + 1] = camo[1][1]; d[i + 2] = camo[1][2]; }
      else if (camo[2] && n2 < -0.2) { d[i] = camo[2][0]; d[i + 1] = camo[2][1]; d[i + 2] = camo[2][2]; }
    }
    const grime = (sampleField(fg, N, x / S, y / S) * 22 + (r.next() - 0.5) * 6) * grimeAmount;
    d[i] = Math.max(0, Math.min(255, d[i] + grime - 4)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + grime - 4)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + grime * 0.8 - 4));
  }
  g.putImageData(img, 0, 0);
  // chipped paint / mud spots
  for (let k = 0; k < 350 * grimeAmount; k++) {
    g.fillStyle = r.next() < 0.6 ? `rgba(60,48,32,${r.range(0.08, 0.3)})` : `rgba(30,28,25,${r.range(0.1, 0.35)})`;
    g.beginPath(); g.arc(r.range(0, S), r.range(0, S), r.range(1, 5), 0, Math.PI * 2); g.fill();
  }
  return toTex(c);
  });
}
export function decalTexture(kind, text = '') {
  return once('decal_' + kind + text, () => {
    const S = 256; const [c, g] = canvas(S, S); const cx = S / 2;
    const star = (R, r0, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r0 : R; g.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr); } g.fill(); };
    if (kind === 'usstar') { g.strokeStyle = 'rgba(235,235,225,0.92)'; g.lineWidth = 12; g.beginPath(); g.arc(cx, cx, 110, 0, Math.PI * 2); g.stroke(); star(100, 40, 'rgba(235,235,225,0.92)'); }
    else if (kind === 'redstar') { star(110, 44, '#b3261e'); }
    else if (kind === 'cross') { g.fillStyle = '#f0f0f0'; g.fillRect(cx - 100, cx - 30, 200, 60); g.fillRect(cx - 30, cx - 100, 60, 200); g.fillStyle = '#111'; g.fillRect(cx - 88, cx - 16, 176, 32); g.fillRect(cx - 16, cx - 88, 32, 176); }
    else if (kind === 'text') { g.fillStyle = 'rgba(235,235,225,0.9)'; g.font = 'bold 150px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cx, cx + 6); }
    const t = toTex(c, true, false); return t;
  });
}

// ---------- FX ----------
export function softSprite() {
  return once('soft', () => {
    const S = 128; const [c, g] = canvas(S, S); const r = new RNG(11); const noise = makeNoise2D(5);
    const img = g.createImageData(S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2); const rr = Math.sqrt(dx * dx + dy * dy);
      const n = fbm(noise, x / 22, y / 22, 4) * 0.35;
      const a = Math.max(0, 1 - rr + n) ** 1.6;
      const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, a * 255);
    }
    g.putImageData(img, 0, 0); r.next();
    return toTex(c, false, false);
  });
}
export function waterNormalTexture() {
  // v5: tileable spectrum of directional ripples (integer wave vectors so it wraps seamlessly)
  return once('waternormal5', () => {
    const S = 512; const [c, g] = canvas(S, S); const r = new RNG(77);
    const waves = []; for (let i = 0; i < 48; i++) { const kmag = 2 + Math.floor(r.next() ** 1.6 * 28); const a = r.range(-1.2, 1.2) + (i % 3 === 0 ? Math.PI / 2 : 0); const kx = Math.round(Math.cos(a) * kmag), ky = Math.round(Math.sin(a) * kmag); if (!kx && !ky) continue; waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.25), r.range(0, 6.283)]); }
    const img = g.createImageData(S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0; const u = x / S * 6.2831853, v = y / S * 6.2831853;
      for (const [kx, ky, A, ph] of waves) { const t = kx * u + ky * v + ph; const cc = Math.cos(t) * A; dx += cc * kx; dy += cc * ky; }
      const nx = -dx * 0.06, ny = -dy * 0.06, nz = 1; const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4; d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTex(c, false, true);
  });
}
// v5: glass/frame roughness to pair with windowTexture (frame rough, panes glossy)
export function windowRoughTexture() {
  return once('windowR', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#101010'; g.fillRect(10, 10, 108, 108);
    g.fillStyle = '#e0e0e0'; g.fillRect(60, 10, 8, 108); g.fillRect(10, 58, 108, 8);
    const r = new RNG(5); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(200,200,200,${r.range(0.1, 0.4)})`; g.beginPath(); g.arc(r.range(10, 118), r.range(10, 118), r.range(2, 7), 0, 6.3); g.fill(); } // dust/grime
    return toTex(c, false, false);
  });
}
export function windowTexture() {
  return once('window', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#5b4632'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#141a1f'; g.fillRect(10, 10, 108, 108);
    const grd = g.createLinearGradient(0, 0, 128, 128); grd.addColorStop(0, 'rgba(120,140,160,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(10, 10, 108, 108);
    g.fillStyle = '#5b4632'; g.fillRect(60, 10, 8, 108); g.fillRect(10, 58, 108, 8);
    return toTex(c, true, false);
  });
}
