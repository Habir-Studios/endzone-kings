// ENDZONE KINGS — Ultimate Team: player cards, packs, quicksell, training, lineups.
// Everything here is bought with coins you earn by playing. There is no real-money anything.
import { TEAMS } from './teams.js?v=1792242869';

export const TIERS = [
  { key: 'bronze', name: 'Bronze', lo: 56, hi: 66, qs: 20, train: 120 },
  { key: 'silver', name: 'Silver', lo: 66, hi: 75, qs: 70, train: 260 },
  { key: 'gold', name: 'Gold', lo: 75, hi: 83, qs: 220, train: 550 },
  { key: 'elite', name: 'Elite', lo: 83, hi: 89, qs: 800, train: 1200 },
  { key: 'kings', name: 'Kings', lo: 89, hi: 96, qs: 2600, train: 2600 },
];
export const MAX_BOOST = [5, 5, 5, 4, 3];
export const CLUB_CAP = 200;

// position groups and the lineup slots they can fill
export const GROUPS = { QB: ['QB'], HB: ['RB'], WR: ['WR1', 'WR2'], OL: ['C', 'LG', 'RG'], DL: ['DL1', 'DL2', 'DL3'], LB: ['LB'], CB: ['CB1', 'CB2'], S: ['S'] };
export const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'C', 'LG', 'RG', 'DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S'];
export const SLOT_GROUP = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, ss]) => ss.map(s => [s, g])));
export const SLOT_LABEL = { QB: 'QB', RB: 'HB', WR1: 'WR', WR2: 'WR', C: 'C', LG: 'LG', RG: 'RG', DL1: 'DE', DL2: 'DT', DL3: 'DE', LB: 'MLB', CB1: 'CB', CB2: 'CB', S: 'S' };
const KEYS = { QB: ['acc', 'arm'], HB: ['spd', 'elu'], WR: ['spd', 'hands'], OL: ['blk'], DL: ['rush', 'tkl'], LB: ['tkl', 'spd'], CB: ['cov', 'spd'], S: ['cov', 'tkl'] };
const RK = ['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'];
const GROUP_KEYS = Object.keys(GROUPS);
const NUMS = { QB: [1, 19], HB: [20, 39], WR: [10, 89], OL: [50, 79], DL: [90, 99], LB: [40, 59], CB: [20, 39], S: [20, 49] };
export const RATING_NAMES = { spd: 'Speed', hands: 'Hands', acc: 'Accuracy', arm: 'Arm', elu: 'Elusive', blk: 'Block', rush: 'Pass rush', tkl: 'Tackle', cov: 'Coverage' };

const FIRST = ['Marcus', 'Jalen', 'Tyler', 'Devin', 'Chris', 'Jordan', 'Darius', 'Andre', 'Malik', 'Josh', 'Caleb', 'Trey', 'Isaiah', 'Brandon', 'DeShawn', 'Cole', 'Logan', 'Zach', 'Mason', 'Elijah', 'Jaylen', 'Nate', 'Kendall', 'Bryce', 'Austin', 'Xavier', 'Terrell', 'Cameron', 'Hunter', 'Quinton', 'Jamal', 'Owen', 'Dante', 'Rashad', 'Kyle', 'Luke', 'Micah', 'Jace', 'Victor', 'Garrett', 'Tavon', 'Keon', 'Blake', 'Desmond', 'Eli', 'Jabari', 'Kobe', 'Myles', 'Noah', 'Omar', 'Reggie', 'Tariq', 'Wyatt', 'Zion', 'Amari', 'Bo', 'Cedric', 'Dillon', 'Gavin', 'Hakeem', 'Jarvis', 'Kareem', 'Montez', 'Nico', 'Preston', 'Quincy', 'Roman', 'Sincere', 'Tobias', 'Ulysses', 'Vince', 'Wes', 'Yusuf', 'Ezra', 'Fletcher', 'Ronnie', 'Sterling', 'Booker', 'Ahmad', 'Brooks'];
const LAST = ['Jackson', 'Carter', 'Brooks', 'Mitchell', 'Harris', 'Coleman', 'Reed', 'Bennett', 'Hayes', 'Price', 'Sanders', 'Foster', 'Bryant', 'Griffin', 'Wallace', 'Barnes', 'Russell', 'Hamilton', 'Graham', 'Sullivan', 'Wright', 'Turner', 'Parker', 'Collins', 'Stewart', 'Morris', 'Cooper', 'Howard', 'Ward', 'Gray', 'Watson', 'Kelly', 'Butler', 'Simmons', 'Jenkins', 'Perry', 'Powell', 'Hughes', 'Flores', 'Henderson', 'Ross', 'Ellis', 'Holmes', 'Kennedy', 'Wells', 'Daniels', 'Payne', 'Burke', 'Dixon', 'Fields', 'Hart', 'Knox', 'Lane', 'Mack', 'Nash', 'Owens', 'Rhodes', 'Shaw', 'Tate', 'Vance', 'Webb', 'Young', 'Boone', 'Crane', 'Dorsey', 'Easley', 'Fontaine', 'Gaines', 'Holloway', 'Ingram', 'Kincaid', 'Lockett', 'Mercer', 'Okafor', 'Pugh', 'Ramsey', 'Slater', 'Thorne', 'Vaughn', 'Whitfield', 'Okoye', 'Adebayo', 'Castillo', 'Delgado', 'Fuimaono', 'Tuilagi', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura'];
// program names on Elite and Kings cards
const PROGRAMS = ['Primetime', 'Iron Wall', 'Gridiron Gods', 'Night Shift', 'Thunder', 'Crown Jewel', 'Blitz Kings', 'Sunday Legends'];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clampR = v => Math.max(40, Math.min(99, Math.round(v)));

// A card id encodes its tier and group so packs can ask for "a gold WR": id = tier*1e8 + group*1e7 + n
export const makeId = (tier, group, n) => tier * 1e8 + group * 1e7 + (n % 1e7);
const cardCache = new Map();
export function card(id) {
  if (cardCache.has(id)) return cardCache.get(id);
  const tier = Math.floor(id / 1e8), gi = Math.floor(id / 1e7) % 10, group = GROUP_KEYS[gi] || 'QB';
  const T = TIERS[tier] || TIERS[0];
  const r = rng(id * 2654435761);
  const ovr = Math.round(T.lo + r() * (T.hi - T.lo));
  const keys = KEYS[group];
  const c = { id, tier, tierKey: T.key, tierName: T.name, group, pos: group === 'HB' ? 'HB' : group, first: FIRST[(r() * FIRST.length) | 0], last: LAST[(r() * LAST.length) | 0] };
  for (const k of RK) c[k] = clampR(keys.includes(k) ? ovr + (r() - 0.35) * 6 : ovr - 14 + (r() - 0.5) * 16);
  if (group === 'OL' || group === 'DL') c.spd = clampR(Math.min(c.spd, 62 + r() * 18));
  if (group === 'QB') c.spd = clampR(55 + r() * 30);
  c.ovr = Math.max(T.lo, Math.min(T.hi, clampR(keys.reduce((s, k) => s + c[k], 0) / keys.length + 1)));
  const [a, b] = NUMS[group]; c.num = a + ((r() * (b - a + 1)) | 0);
  c.face = ((id * 2246822519) >>> 0) || 7;
  c.team = (r() * TEAMS.length) | 0;
  c.program = tier >= 3 ? PROGRAMS[(r() * PROGRAMS.length) | 0] : '';
  cardCache.set(id, c);
  return c;
}
// a card as you own it, with training boosts applied
export function owned(inst) {
  const c = card(inst.id), b = inst.b || 0;
  if (!b) return { ...c, u: inst.u, b: 0 };
  const o = { ...c, u: inst.u, b };
  for (const k of KEYS[c.group]) o[k] = Math.min(99, c[k] + b);
  o.ovr = Math.min(99, c.ovr + b);
  return o;
}
export const quicksell = inst => { const c = owned(inst); return Math.round(TIERS[c.tier].qs * (1 + (c.ovr - TIERS[c.tier].lo) * 0.06) + (inst.b || 0) * TIERS[c.tier].train * 0.25); };
export const trainCost = inst => { const c = card(inst.id); const b = inst.b || 0; return b >= MAX_BOOST[c.tier] ? 0 : TIERS[c.tier].train * (b + 1); };

// ---------------- packs ----------------
export const PACKS = [
  { key: 'bronze', name: 'Bronze Pack', cost: 400, n: 5, w: [85, 14, 1, 0, 0], guar: 0, blurb: '5 players, mostly bronze' },
  { key: 'silver', name: 'Silver Pack', cost: 1200, n: 5, w: [35, 55, 10, 0, 0], guar: 1, blurb: '5 players, at least 1 silver' },
  { key: 'gold', name: 'Gold Pack', cost: 3000, n: 5, w: [0, 45, 50, 5, 0], guar: 2, blurb: '5 players, at least 1 gold' },
  { key: 'elite', name: 'Elite Pack', cost: 8000, n: 5, w: [0, 0, 70, 27, 3], guar: 3, blurb: '5 players, at least 1 elite' },
  { key: 'kings', name: 'Kings Pack', cost: 20000, n: 3, w: [0, 0, 0, 70, 30], guar: 4, blurb: '3 players, 1 Kings card guaranteed' },
];
export const packByKey = k => PACKS.find(p => p.key === k);
function pickTier(w, r) { const tot = w.reduce((a, b) => a + b, 0); let x = r() * tot; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; } return 0; }
// returns card ids, best last (for the reveal)
export function rollPack(key, seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
  const P = packByKey(key); const r = rng(seed);
  const ids = [];
  for (let i = 0; i < P.n; i++) ids.push(makeId(pickTier(P.w, r), (r() * 8) | 0, (r() * 1e7) | 0));
  if (!ids.some(id => Math.floor(id / 1e8) >= P.guar)) ids[0] = makeId(P.guar, (r() * 8) | 0, (r() * 1e7) | 0);
  return ids.sort((a, b) => card(a).ovr - card(b).ovr);
}
// the starter squad: one bronze-ish player for every slot
export function starterIds(seed) {
  const r = rng(seed); const ids = [];
  const need = { QB: 1, HB: 1, WR: 2, OL: 3, DL: 3, LB: 1, CB: 2, S: 1 };
  for (const [g, n] of Object.entries(need)) for (let i = 0; i < n; i++) ids.push(makeId(0, GROUP_KEYS.indexOf(g), (r() * 1e7) | 0));
  return ids;
}

// ---------------- lineups ----------------
export function autoLineup(cards) {
  const lu = {}, used = new Set();
  const own = cards.map(owned).sort((a, b) => b.ovr - a.ovr);
  for (const s of SLOTS) { const c = own.find(x => x.group === SLOT_GROUP[s] && !used.has(x.u)); if (c) { lu[s] = c.u; used.add(c.u); } }
  return lu;
}
export function lineupCards(ut) {
  const byU = new Map(ut.cards.map(c => [c.u, c]));
  const out = {};
  for (const s of SLOTS) { const inst = byU.get(ut.lineup[s]); out[s] = inst && card(inst.id).group === SLOT_GROUP[s] ? owned(inst) : null; }
  return out;
}
export function squadOvr(ut) {
  const L = lineupCards(ut); const v = SLOTS.map(s => L[s] ? L[s].ovr : 40);
  const off = v.slice(0, 7), def = v.slice(7);
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  return { ovr: Math.round((avg([off[0], ...off]) + avg(def)) / 2), off: avg([off[0], ...off]), def: avg(def), full: SLOTS.every(s => L[s]) };
}
// roster object the sim understands (see sim.js cleanRoster)
export function squadRoster(ut) {
  const L = lineupCards(ut); if (!SLOTS.every(s => L[s])) return null;
  const players = {}, usedNums = new Set();
  for (const s of SLOTS) {
    const c = L[s]; let num = c.num; while (usedNums.has(num)) num = (num + 1) % 100; usedNums.add(num);
    players[s] = { first: c.first, last: c.last, num, face: c.face, ovr: c.ovr, spd: c.spd, hands: c.hands, acc: c.acc, arm: c.arm, elu: c.elu, blk: c.blk, rush: c.rush, tkl: c.tkl, cov: c.cov };
  }
  return { players };
}
