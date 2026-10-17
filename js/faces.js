// ENDZONE KINGS — procedural faces. One seed → the same face on the 3D player, the UT card and the halftime show.
export const SKIN = ['#4a2c18', '#5e3a22', '#6b4226', '#8d5524', '#a8693f', '#c68642', '#d9a066', '#e0ac69', '#f1c27d', '#f6d3a8'];
const HAIR = ['#0d0906', '#1c120b', '#2b1a10', '#4a2e1a', '#6d4524', '#a0662f', '#c9a15a', '#3a3a3a'];
const EYES = ['#2b1a10', '#3d2614', '#4f3420', '#2e4a2a', '#2c3e5c'];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function faceParams(seed) {
  const r = rng(seed);
  const pick = a => a[(r() * a.length) | 0];
  const skinI = (r() * SKIN.length) | 0;
  const dark = skinI < 5;
  return {
    skin: SKIN[skinI],
    hair: dark ? pick(HAIR.slice(0, 3)) : pick(HAIR),
    hairStyle: (r() * 7) | 0,          // 0 buzz, 1 fade, 2 locs, 3 afro, 4 bald, 5 swept, 6 braids
    beard: r() < 0.38 ? 0 : (1 + r() * 3) | 0, // 0 none, 1 stubble, 2 goatee, 3 full
    eye: dark ? pick(EYES.slice(0, 3)) : pick(EYES),
    brow: 0.7 + r() * 0.6,
    jaw: 0.9 + r() * 0.2,
    nose: 0.85 + r() * 0.35,
    lips: 0.85 + r() * 0.3,
    smile: r() < 0.3,
    eyeBlack: r() < 0.45,
    eyeGap: 0.9 + r() * 0.2,
  };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let rr = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${m(rr)},${m(g)},${m(b)})`;
}

// Face features only (eyes, brows, nose, mouth, beard, eye black), centered on (cx, cy) with face width fw.
function features(c, F, cx, cy, fw) {
  const u = fw / 100;
  const ey = cy - 6 * u, gap = 17 * u * F.eyeGap;
  // eye black
  if (F.eyeBlack) { c.fillStyle = '#111'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * gap, ey + 11 * u, 9 * u, 3.2 * u, 0, 0, Math.PI * 2); c.fill(); } }
  // eyes
  for (const s of [-1, 1]) {
    c.fillStyle = '#f4f1ea'; c.beginPath(); c.ellipse(cx + s * gap, ey, 8 * u, 4.4 * u, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = F.eye; c.beginPath(); c.arc(cx + s * gap + s * 0.6 * u, ey, 3.6 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#050505'; c.beginPath(); c.arc(cx + s * gap + s * 0.6 * u, ey, 1.7 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(cx + s * gap - 1 * u, ey - 1.3 * u, 0.9 * u, 0, Math.PI * 2); c.fill();
    c.strokeStyle = shade(F.skin, -0.45); c.lineWidth = 1.4 * u; c.beginPath(); c.ellipse(cx + s * gap, ey, 8 * u, 4.4 * u, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  }
  // brows
  c.strokeStyle = F.hair === '#c9a15a' ? '#8a6a35' : '#140c07'; c.lineCap = 'round'; c.lineWidth = 3.4 * u * F.brow;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * (gap - 9 * u), ey - 8 * u); c.quadraticCurveTo(cx + s * gap, ey - 12 * u, cx + s * (gap + 9 * u), ey - 8.5 * u); c.stroke(); }
  // nose
  c.strokeStyle = shade(F.skin, -0.35); c.lineWidth = 1.8 * u;
  c.beginPath(); c.moveTo(cx - 1.5 * u, ey + 3 * u); c.lineTo(cx - 3 * u, ey + 15 * u); c.stroke();
  c.fillStyle = shade(F.skin, -0.3);
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 4.6 * u * F.nose, ey + 17 * u, 2.4 * u * F.nose, 1.6 * u, 0, 0, Math.PI * 2); c.fill(); }
  // beard
  if (F.beard) {
    c.fillStyle = F.beard === 1 ? hexA(F.hair, 0.35) : F.hair;
    c.beginPath();
    if (F.beard === 2) { c.ellipse(cx, cy + 33 * u * F.jaw, 11 * u, 9 * u, 0, 0, Math.PI * 2); c.fill(); c.fillRect(cx - 12 * u, cy + 20 * u, 24 * u, 4 * u); }
    else { c.moveTo(cx - 36 * u * F.jaw, cy + 2 * u); c.quadraticCurveTo(cx - 34 * u, cy + 44 * u * F.jaw, cx, cy + 46 * u * F.jaw); c.quadraticCurveTo(cx + 34 * u, cy + 44 * u * F.jaw, cx + 36 * u * F.jaw, cy + 2 * u); c.lineTo(cx + 28 * u, cy + 18 * u); c.quadraticCurveTo(cx, cy + 14 * u, cx - 28 * u, cy + 18 * u); c.closePath(); c.fill(); }
  }
  // mouth
  const my = cy + 25 * u;
  c.fillStyle = shade(F.skin, -0.4);
  c.beginPath();
  if (F.smile) { c.moveTo(cx - 11 * u * F.lips, my - 1 * u); c.quadraticCurveTo(cx, my + 8 * u, cx + 11 * u * F.lips, my - 1 * u); c.quadraticCurveTo(cx, my + 3 * u, cx - 11 * u * F.lips, my - 1 * u); c.fill(); c.fillStyle = '#f4f1ea'; c.fillRect(cx - 7 * u, my + 0.6 * u, 14 * u, 1.6 * u); }
  else { c.ellipse(cx, my, 10 * u * F.lips, 2.6 * u, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = shade(F.skin, -0.55); c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(cx - 10 * u * F.lips, my); c.lineTo(cx + 10 * u * F.lips, my); c.stroke(); }
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

// Texture for the 3D head (wrapped on the front of a sphere): skin background + centered features.
export function drawFaceTexture(c, w, h, seed) {
  const F = faceParams(seed);
  c.fillStyle = F.skin; c.fillRect(0, 0, w, h);
  // skin texture: faint pores and uneven tone so faces don't look like plastic (drawn once per player)
  for (let i = 0; i < 900; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)'; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random()); }
  for (let i = 0; i < 6; i++) { const x = Math.random() * w, y = Math.random() * h, r = w * (0.05 + Math.random() * 0.08), gg = c.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(120,40,30,0.05)'); gg.addColorStop(1, 'rgba(120,40,30,0)'); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); }
  const g = c.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, w * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // sphere UV: the front of the head (+z) sits at u=0.25 on a three.js sphere, squash horizontally
  c.save(); c.translate(w * 0.25, h * 0.5); c.scale(0.5, 1); features(c, F, 0, 0, h * 0.62); c.restore();
  return F;
}

// Card / halftime portrait: head and shoulders on a transparent background.
export function drawPortrait(c, w, h, seed, jersey = '#24306a', trim = '#f6c445') {
  const F = faceParams(seed);
  const cx = w / 2, cy = h * 0.43, fw = w * 0.5;
  const u = fw / 100;
  // shoulders + jersey
  c.fillStyle = jersey; c.beginPath(); c.moveTo(cx - 64 * u * 1.6, h); c.quadraticCurveTo(cx - 70 * u * 1.4, cy + 58 * u, cx - 22 * u, cy + 52 * u); c.lineTo(cx + 22 * u, cy + 52 * u); c.quadraticCurveTo(cx + 70 * u * 1.4, cy + 58 * u, cx + 64 * u * 1.6, h); c.fill();
  c.strokeStyle = trim; c.lineWidth = 4 * u; c.beginPath(); c.moveTo(cx - 20 * u, cy + 54 * u); c.quadraticCurveTo(cx, cy + 70 * u, cx + 20 * u, cy + 54 * u); c.stroke();
  // neck
  c.fillStyle = shade(F.skin, -0.12); c.fillRect(cx - 17 * u, cy + 30 * u, 34 * u, 26 * u);
  // hair behind (afro/locs)
  c.fillStyle = F.hair;
  if (F.hairStyle === 3) { c.beginPath(); c.ellipse(cx, cy - 18 * u, 52 * u, 46 * u, 0, 0, Math.PI * 2); c.fill(); }
  if (F.hairStyle === 2 || F.hairStyle === 6) for (let i = -5; i <= 5; i++) { c.beginPath(); c.roundRect(cx + i * 7.4 * u - 3 * u, cy - 30 * u, 6 * u, (F.hairStyle === 2 ? 70 : 54) * u + Math.abs(i) * -2 * u, 3 * u); c.fill(); }
  // ears
  c.fillStyle = shade(F.skin, -0.08); for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 38 * u * F.jaw, cy - 2 * u, 6 * u, 10 * u, 0, 0, Math.PI * 2); c.fill(); }
  // head
  const g = c.createLinearGradient(cx - 40 * u, 0, cx + 40 * u, 0);
  g.addColorStop(0, shade(F.skin, -0.1)); g.addColorStop(0.45, F.skin); g.addColorStop(1, shade(F.skin, -0.18));
  c.fillStyle = g; c.beginPath();
  c.moveTo(cx - 38 * u * F.jaw, cy - 14 * u); c.quadraticCurveTo(cx - 40 * u, cy - 52 * u, cx, cy - 54 * u); c.quadraticCurveTo(cx + 40 * u, cy - 52 * u, cx + 38 * u * F.jaw, cy - 14 * u);
  c.quadraticCurveTo(cx + 36 * u * F.jaw, cy + 34 * u, cx, cy + 44 * u * F.jaw); c.quadraticCurveTo(cx - 36 * u * F.jaw, cy + 34 * u, cx - 38 * u * F.jaw, cy - 14 * u); c.fill();
  // hair on top
  c.fillStyle = F.hair;
  const top = () => { c.beginPath(); c.moveTo(cx - 39 * u, cy - 16 * u); c.quadraticCurveTo(cx - 42 * u, cy - 58 * u, cx, cy - 60 * u); c.quadraticCurveTo(cx + 42 * u, cy - 58 * u, cx + 39 * u, cy - 16 * u); c.quadraticCurveTo(cx + 30 * u, cy - 38 * u, cx, cy - 40 * u); c.quadraticCurveTo(cx - 30 * u, cy - 38 * u, cx - 39 * u, cy - 16 * u); c.fill(); };
  if (F.hairStyle === 0) { c.globalAlpha = 0.55; top(); c.globalAlpha = 1; }
  else if (F.hairStyle === 1) { top(); c.globalAlpha = 0.35; c.fillRect(cx - 40 * u, cy - 26 * u, 80 * u, 10 * u); c.globalAlpha = 1; }
  else if (F.hairStyle === 3) { c.beginPath(); c.ellipse(cx, cy - 38 * u, 46 * u, 26 * u, 0, Math.PI, 0); c.fill(); }
  else if (F.hairStyle === 5) { top(); c.beginPath(); c.ellipse(cx + 8 * u, cy - 50 * u, 34 * u, 14 * u, -0.2, 0, Math.PI * 2); c.fill(); }
  else if (F.hairStyle === 2 || F.hairStyle === 6) { top(); }
  features(c, F, cx, cy, fw * 0.8);
  return F;
}

// cached data-URL portraits for HTML (cards, halftime leaders)
const cache = new Map();
export function portraitURL(seed, jersey, trim, size = 160) {
  const k = `${seed}|${jersey}|${trim}|${size}`;
  if (cache.has(k)) return cache.get(k);
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  drawPortrait(cv.getContext('2d'), size, size, seed, jersey, trim);
  const url = cv.toDataURL('image/png');
  if (cache.size > 400) cache.clear();
  cache.set(k, url);
  return url;
}
