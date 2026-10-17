// ENDZONE KINGS — original team logos. Each city gets its own badge shape and emblem in its colors.
// These are made-up marks: no real league logos, mascots or wordmarks.
import { TEAMS } from './teams.js?v=1792207431';

// emblem per team, in TEAMS order (picked so nothing echoes a real club's mascot)
const EMBLEM = ['sun', 'comet', 'crown', 'snowflake', 'flame', 'tower', 'gear', 'rook', 'shield', 'mountain', 'chevrons', 'key', 'orbit', 'flag', 'wave', 'bolt',
  'dice', 'star', 'palm', 'diamond', 'compass', 'anchor', 'crescent', 'torch', 'hex', 'bell', 'hammer', 'bridge', 'pine', 'trident', 'note', 'pillar'];
const SHAPES = ['circle', 'shield', 'hex', 'square'];

function h32(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }
const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };

// Emblems are drawn in a 100x100 box centered at 50,50 using the current fillStyle / strokeStyle.
const E = {
  sun(c) { c.beginPath(); c.arc(50, 50, 16, 0, 7); c.fill(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(50 + Math.cos(a - 0.12) * 21, 50 + Math.sin(a - 0.12) * 21); c.lineTo(50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36); c.lineTo(50 + Math.cos(a + 0.12) * 21, 50 + Math.sin(a + 0.12) * 21); c.fill(); } },
  comet(c) { c.beginPath(); c.arc(62, 38, 13, 0, 7); c.fill(); for (const [o, w] of [[0, 9], [10, 6], [-10, 6]]) { c.beginPath(); c.moveTo(56 + o * 0.3, 46 + o * 0.6); c.lineTo(20 + o, 80 + o * 0.2); c.lineTo(52 + o * 0.6 + w * 0.3, 40 + o * 0.4); c.fill(); } },
  crown(c) { c.beginPath(); c.moveTo(18, 70); c.lineTo(22, 34); c.lineTo(36, 52); c.lineTo(50, 26); c.lineTo(64, 52); c.lineTo(78, 34); c.lineTo(82, 70); c.closePath(); c.fill(); c.fillRect(18, 74, 64, 8); },
  snowflake(c) { c.lineWidth = 6; c.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = Math.cos(a), y = Math.sin(a); c.beginPath(); c.moveTo(50, 50); c.lineTo(50 + x * 34, 50 + y * 34); c.moveTo(50 + x * 22, 50 + y * 22); c.lineTo(50 + Math.cos(a + 0.5) * 30, 50 + Math.sin(a + 0.5) * 30); c.moveTo(50 + x * 22, 50 + y * 22); c.lineTo(50 + Math.cos(a - 0.5) * 30, 50 + Math.sin(a - 0.5) * 30); c.stroke(); } },
  flame(c) { c.beginPath(); c.moveTo(50, 14); c.bezierCurveTo(70, 36, 80, 50, 72, 68); c.bezierCurveTo(66, 84, 34, 86, 28, 68); c.bezierCurveTo(24, 54, 34, 46, 38, 36); c.bezierCurveTo(40, 48, 46, 50, 48, 46); c.bezierCurveTo(48, 34, 46, 24, 50, 14); c.fill(); },
  tower(c) { c.fillRect(38, 30, 24, 52); c.fillRect(34, 24, 32, 8); c.beginPath(); c.moveTo(42, 24); c.lineTo(50, 10); c.lineTo(58, 24); c.fill(); c.fillRect(28, 80, 44, 6); },
  gear(c) { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 34 : 26; c.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } c.closePath(); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(50, 50, 11, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; },
  rook(c) { c.fillRect(32, 22, 8, 10); c.fillRect(46, 22, 8, 10); c.fillRect(60, 22, 8, 10); c.fillRect(32, 30, 36, 8); c.beginPath(); c.moveTo(36, 38); c.lineTo(64, 38); c.lineTo(68, 72); c.lineTo(32, 72); c.fill(); c.fillRect(26, 72, 48, 10); },
  shield(c) { c.beginPath(); c.moveTo(50, 16); c.lineTo(78, 26); c.lineTo(74, 58); c.quadraticCurveTo(66, 76, 50, 86); c.quadraticCurveTo(34, 76, 26, 58); c.lineTo(22, 26); c.closePath(); c.fill(); },
  mountain(c) { c.beginPath(); c.moveTo(12, 78); c.lineTo(38, 34); c.lineTo(50, 52); c.lineTo(62, 28); c.lineTo(88, 78); c.closePath(); c.fill(); },
  chevrons(c) { for (const y of [24, 44, 64]) { c.beginPath(); c.moveTo(20, y + 14); c.lineTo(50, y); c.lineTo(80, y + 14); c.lineTo(80, y + 24); c.lineTo(50, y + 10); c.lineTo(20, y + 24); c.closePath(); c.fill(); } },
  key(c) { c.lineWidth = 8; c.beginPath(); c.arc(36, 40, 14, 0, 7); c.stroke(); c.fillRect(46, 46, 36, 8); c.fillRect(70, 54, 7, 12); c.fillRect(58, 54, 7, 9); },
  orbit(c) { c.beginPath(); c.arc(50, 50, 12, 0, 7); c.fill(); c.lineWidth = 5; c.save(); c.translate(50, 50); c.rotate(-0.5); c.beginPath(); c.ellipse(0, 0, 36, 14, 0, 0, 7); c.stroke(); c.restore(); c.beginPath(); c.arc(80, 38, 5, 0, 7); c.fill(); },
  flag(c) { c.fillRect(24, 16, 6, 70); const s = 9; for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) if ((r + k) % 2 === 0) c.fillRect(30 + k * s, 18 + r * s, s, s); c.lineWidth = 3; c.strokeRect(30, 18, s * 5, s * 4); },
  wave(c) { c.beginPath(); c.moveTo(12, 70); c.bezierCurveTo(20, 30, 60, 18, 80, 40); c.bezierCurveTo(64, 34, 52, 44, 58, 56); c.bezierCurveTo(64, 66, 78, 64, 88, 58); c.lineTo(88, 80); c.lineTo(12, 80); c.closePath(); c.fill(); },
  bolt(c) { c.beginPath(); c.moveTo(58, 12); c.lineTo(28, 54); c.lineTo(48, 54); c.lineTo(40, 88); c.lineTo(72, 42); c.lineTo(52, 42); c.closePath(); c.fill(); },
  dice(c) { c.beginPath(); c.roundRect(24, 24, 52, 52, 10); c.fill(); c.globalCompositeOperation = 'destination-out'; for (const [x, y] of [[36, 36], [50, 50], [64, 64], [64, 36], [36, 64]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); } c.globalCompositeOperation = 'source-over'; },
  star(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 15 : 36; c.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a) * r); } c.closePath(); c.fill(); },
  palm(c) { c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(52, 86); c.quadraticCurveTo(44, 60, 52, 38); c.stroke(); for (const a of [-2.6, -2.0, -1.2, -0.5]) { c.beginPath(); c.moveTo(52, 38); c.quadraticCurveTo(52 + Math.cos(a) * 20, 30 + Math.sin(a) * 14, 52 + Math.cos(a) * 32, 40 + Math.sin(a) * 6 + 10); c.stroke(); } },
  diamond(c) { c.beginPath(); c.moveTo(28, 38); c.lineTo(40, 22); c.lineTo(60, 22); c.lineTo(72, 38); c.lineTo(50, 82); c.closePath(); c.fill(); },
  compass(c) { c.beginPath(); c.moveTo(50, 12); c.lineTo(58, 50); c.lineTo(50, 88); c.lineTo(42, 50); c.closePath(); c.fill(); c.beginPath(); c.moveTo(12, 50); c.lineTo(50, 43); c.lineTo(88, 50); c.lineTo(50, 57); c.closePath(); c.fill(); },
  anchor(c) { c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.arc(50, 22, 7, 0, 7); c.stroke(); c.beginPath(); c.moveTo(50, 29); c.lineTo(50, 82); c.moveTo(36, 40); c.lineTo(64, 40); c.stroke(); c.beginPath(); c.arc(50, 56, 26, 0.35, Math.PI - 0.35); c.stroke(); },
  crescent(c) { c.beginPath(); c.arc(48, 50, 32, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(62, 42, 27, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 9; c.lineTo(70 + Math.cos(a) * r, 50 + Math.sin(a) * r); } c.fill(); },
  torch(c) { c.beginPath(); c.moveTo(40, 40); c.lineTo(60, 40); c.lineTo(54, 86); c.lineTo(46, 86); c.closePath(); c.fill(); c.beginPath(); c.moveTo(50, 8); c.bezierCurveTo(64, 20, 64, 34, 50, 38); c.bezierCurveTo(36, 34, 38, 22, 50, 8); c.fill(); },
  hex(c) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.lineTo(50 + Math.cos(a) * 34, 50 + Math.sin(a) * 34); } c.closePath(); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; c.lineTo(50 + Math.cos(a) * 16, 50 + Math.sin(a) * 16); } c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over'; },
  bell(c) { c.beginPath(); c.moveTo(30, 72); c.quadraticCurveTo(34, 64, 34, 46); c.quadraticCurveTo(34, 22, 50, 22); c.quadraticCurveTo(66, 22, 66, 46); c.quadraticCurveTo(66, 64, 70, 72); c.closePath(); c.fill(); c.fillRect(24, 72, 52, 7); c.beginPath(); c.arc(50, 84, 6, 0, 7); c.fill(); c.fillRect(46, 12, 8, 10); },
  hammer(c) { c.save(); c.translate(50, 50); c.rotate(-0.6); c.fillRect(-4, -14, 8, 50); c.beginPath(); c.roundRect(-22, -30, 44, 18, 3); c.fill(); c.restore(); },
  bridge(c) { c.fillRect(28, 18, 7, 64); c.fillRect(65, 18, 7, 64); c.fillRect(10, 62, 80, 6); c.lineWidth = 3; c.beginPath(); c.moveTo(10, 40); c.quadraticCurveTo(31, 30, 31, 22); c.quadraticCurveTo(50, 60, 68, 22); c.quadraticCurveTo(68, 30, 90, 40); c.stroke(); for (let x = 36; x < 66; x += 6) { c.fillRect(x, 40 + Math.abs(x - 50) * -0.6 + 10, 1.6, 62 - (40 + Math.abs(x - 50) * -0.6 + 10)); } },
  pine(c) { for (const [y, w] of [[18, 16], [36, 24], [54, 32]]) { c.beginPath(); c.moveTo(50, y); c.lineTo(50 + w, y + 22); c.lineTo(50 - w, y + 22); c.closePath(); c.fill(); } c.fillRect(45, 76, 10, 12); },
  trident(c) { c.fillRect(47, 30, 6, 58); c.lineWidth = 6; c.beginPath(); c.moveTo(30, 18); c.lineTo(30, 34); c.quadraticCurveTo(30, 44, 50, 44); c.quadraticCurveTo(70, 44, 70, 34); c.lineTo(70, 18); c.stroke(); c.beginPath(); c.moveTo(50, 10); c.lineTo(56, 24); c.lineTo(44, 24); c.fill(); for (const x of [30, 70]) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x + 5, 20); c.lineTo(x - 5, 20); c.fill(); } },
  note(c) { c.fillRect(60, 18, 6, 50); c.beginPath(); c.ellipse(52, 70, 13, 10, -0.4, 0, 7); c.fill(); c.beginPath(); c.moveTo(66, 18); c.quadraticCurveTo(82, 26, 78, 44); c.quadraticCurveTo(76, 32, 66, 30); c.fill(); },
  pillar(c) { c.fillRect(22, 20, 56, 8); c.beginPath(); c.moveTo(18, 20); c.lineTo(50, 8); c.lineTo(82, 20); c.fill(); for (const x of [28, 44, 60]) c.fillRect(x, 30, 9, 44); c.fillRect(20, 76, 60, 8); },
};

function badgePath(c, shape) {
  c.beginPath();
  if (shape === 'circle') c.arc(50, 50, 46, 0, 7);
  else if (shape === 'shield') { c.moveTo(50, 4); c.lineTo(92, 16); c.lineTo(88, 58); c.quadraticCurveTo(78, 84, 50, 97); c.quadraticCurveTo(22, 84, 12, 58); c.lineTo(8, 16); c.closePath(); }
  else if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; c.lineTo(50 + Math.cos(a) * 48, 50 + Math.sin(a) * 48); } c.closePath(); }
  else c.roundRect(6, 6, 88, 88, 20);
}

export function teamLogoInfo(ti) { return { emblem: EMBLEM[ti % EMBLEM.length], shape: SHAPES[h32(ti * 31 + 7) % SHAPES.length] }; }

// draw team ti's logo into a square of side `size` at (x, y)
export function drawLogo(c, ti, size, x = 0, y = 0) {
  const t = TEAMS[ti] || TEAMS[0], { emblem, shape } = teamLogoInfo(ti);
  const base = t.jersey === '#121a14' ? '#0f3a1e' : t.jersey;
  let ring = t.trim; if (Math.abs(lum(ring) - lum(base)) < 0.18) ring = lum(base) > 0.5 ? '#111111' : '#ffffff';
  const ink = lum(base) > 0.62 ? '#111111' : '#ffffff';
  c.save(); c.translate(x, y); c.scale(size / 100, size / 100);
  badgePath(c, shape); c.fillStyle = ring; c.fill();
  c.save(); c.translate(50, 50); c.scale(0.86, 0.86); c.translate(-50, -50); badgePath(c, shape); c.fillStyle = base; c.fill(); c.restore();
  // soft top shine
  c.save(); badgePath(c, shape); c.clip(); const g = c.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)'); c.fillStyle = g; c.fillRect(0, 0, 100, 100); c.restore();
  // emblem with a thin outline in the trim color
  c.save(); c.translate(50, 44); c.scale(0.56, 0.56); c.translate(-50, -50);
  c.fillStyle = ink; c.strokeStyle = ink; (E[emblem] || E.star)(c);
  c.restore();
  // monogram
  c.font = '900 17px "Big Shoulders Display", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.strokeText(t.abbr, 50, shape === 'shield' ? 79 : 80);
  c.fillStyle = ink; c.fillText(t.abbr, 50, shape === 'shield' ? 79 : 80);
  c.restore();
}

const cache = new Map();
export function logoURL(ti, size = 96) {
  const k = ti + '|' + size; if (cache.has(k)) return cache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  drawLogo(cv.getContext('2d'), ti, size);
  const u = cv.toDataURL('image/png'); cache.set(k, u); return u;
}
export function clearLogoCache() { cache.clear(); }
