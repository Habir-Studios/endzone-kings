// ENDZONE KINGS — Ultimate Team: player cards, packs, quicksell, training, lineups.
// Everything here is bought with coins you earn by playing. There is no real-money anything.
import { TEAMS } from './teams.js?v=1792257986';

export const TIERS = [
  { key: 'bronze', name: 'Bronze', lo: 56, hi: 66, qs: 15, train: 220, mv: 180 },
  { key: 'silver', name: 'Silver', lo: 66, hi: 75, qs: 50, train: 480, mv: 600 },
  { key: 'gold', name: 'Gold', lo: 75, hi: 83, qs: 160, train: 1000, mv: 1700 },
  { key: 'elite', name: 'Elite', lo: 83, hi: 89, qs: 600, train: 2200, mv: 8000 },
  { key: 'kings', name: 'Kings', lo: 89, hi: 96, qs: 2000, train: 4800, mv: 36000 },
];
export const MAX_BOOST = [5, 5, 5, 4, 3];
export const CLUB_CAP = 200;

// position groups and the lineup slots they can fill
// TE is listed last so the group numbers baked into older card ids don't move
export const GROUPS = { QB: ['QB'], HB: ['RB'], WR: ['WR1', 'WR2', 'WR3'], OL: ['LT', 'LG', 'C', 'RG', 'RT'], DL: ['DL1', 'DL4', 'DL2', 'DL3'], LB: ['LB2', 'LB', 'LB3'], CB: ['CB1', 'CB2'], S: ['S', 'SS'], TE: ['TE'] };
export const OFF_SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
export const DEF_SLOTS = ['DL1', 'DL4', 'DL2', 'DL3', 'LB2', 'LB', 'LB3', 'CB1', 'CB2', 'S', 'SS'];
export const SLOTS = [...OFF_SLOTS, ...DEF_SLOTS];
export const SLOT_GROUP = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, ss]) => ss.map(s => [s, g])));
export const SLOT_LABEL = { QB: 'QB', RB: 'HB', WR1: 'WR', WR2: 'WR', WR3: 'Slot', TE: 'TE', LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT', DL1: 'DE', DL4: 'DT', DL2: 'DT', DL3: 'DE', LB2: 'OLB', LB: 'MLB', LB3: 'OLB', CB1: 'CB', CB2: 'CB', S: 'FS', SS: 'SS' };
const KEYS = { QB: ['acc', 'arm'], HB: ['spd', 'elu'], WR: ['spd', 'hands'], OL: ['blk'], DL: ['rush', 'tkl'], LB: ['tkl', 'spd'], CB: ['cov', 'spd'], S: ['cov', 'tkl'], TE: ['hands', 'blk'] };
const RK = ['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'];
const GROUP_KEYS = Object.keys(GROUPS);
const NUMS = { QB: [1, 19], HB: [20, 39], WR: [10, 89], OL: [50, 79], DL: [90, 99], LB: [40, 59], CB: [20, 39], S: [20, 49], TE: [80, 89] };
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
  const c = { id, tier, tierKey: T.key, tierName: T.name, group, pos: group, first: FIRST[(r() * FIRST.length) | 0], last: LAST[(r() * LAST.length) | 0] };
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
  { key: 'bronze', name: 'Bronze Pack', cost: 750, n: 5, w: [85, 14, 1, 0, 0], guar: 0, blurb: '5 players, mostly bronze' },
  { key: 'silver', name: 'Silver Pack', cost: 2250, n: 5, w: [35, 55, 10, 0, 0], guar: 1, blurb: '5 players, at least 1 silver' },
  { key: 'gold', name: 'Gold Pack', cost: 5500, n: 5, w: [0, 45, 50, 5, 0], guar: 2, blurb: '5 players, at least 1 gold' },
  { key: 'elite', name: 'Elite Pack', cost: 15000, n: 5, w: [0, 0, 70, 27, 3], guar: 3, blurb: '5 players, at least 1 elite' },
  { key: 'kings', name: 'Kings Pack', cost: 40000, n: 3, w: [0, 0, 0, 70, 30], guar: 4, blurb: '3 players, 1 Kings card guaranteed' },
];
export const packByKey = k => PACKS.find(p => p.key === k);
function pickTier(w, r) { const tot = w.reduce((a, b) => a + b, 0); let x = r() * tot; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; } return 0; }
// returns card ids, best last (for the reveal)
export function rollPack(key, seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
  const P = packByKey(key); const r = rng(seed);
  const ids = [];
  for (let i = 0; i < P.n; i++) ids.push(makeId(pickTier(P.w, r), (r() * GROUP_KEYS.length) | 0, (r() * 1e7) | 0));
  if (!ids.some(id => Math.floor(id / 1e8) >= P.guar)) ids[0] = makeId(P.guar, (r() * GROUP_KEYS.length) | 0, (r() * 1e7) | 0);
  return ids.sort((a, b) => card(a).ovr - card(b).ovr);
}
// the starter squad: one bronze-ish player for every slot
export function starterIds(seed) {
  const r = rng(seed); const ids = [];
  const need = Object.fromEntries(Object.entries(GROUPS).map(([g, ss]) => [g, ss.length]));
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
  const L = lineupCards(ut), o = s => L[s] ? L[s].ovr : 40;
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const off = avg(['QB', ...OFF_SLOTS].map(o)), def = avg(DEF_SLOTS.map(o));
  return { ovr: Math.round((off + def) / 2), off, def, full: SLOTS.every(s => L[s]) };
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

// ---------------- market (auction house) ----------------
// What a card is worth on the market: tier base, climbing about 12% per overall point, plus training.
const r50 = v => Math.max(50, Math.round(v / 50) * 50);
export function marketValue(inst) {
  const c = typeof inst === 'number' ? card(inst) : owned(inst), T = TIERS[c.tier];
  return r50(T.mv * Math.pow(1.12, c.ovr - T.lo - (c.b || 0)) + (c.b || 0) * T.train * 0.6);
}
export const MARKET_TAX = 0.1;                 // the market keeps 10% of every sale
export const MARKET_SLOT_MS = 30 * 60 * 1000;  // listings refresh every 30 minutes
export const MAX_LISTINGS = 5;
export const LIST_TIMES = [[10, '10 min'], [30, '30 min'], [60, '1 hour']];
export const marketSlot = (t = Date.now()) => Math.floor(t / MARKET_SLOT_MS);
// 15 cards for sale this half hour, the same for everyone
export function marketListings(slot = marketSlot()) {
  const r = rng(slot * 97 + 13), out = [];
  for (let i = 0; i < 15; i++) {
    const tier = pickTier([30, 32, 25, 10, 3], r), id = makeId(tier, (r() * 8) | 0, (r() * 1e7) | 0);
    out.push({ k: slot + ':' + i, id, price: r50(marketValue(id) * (0.95 + r() * 0.35)) });
  }
  return out;
}
// will a listing sell? the closer to market value, the likelier. Decided once, from the listing itself.
export function listingSells(l) {
  const ratio = l.price / Math.max(50, l.mv), r = rng((l.u * 7919 + l.at) >>> 0)();
  const p = ratio <= 0.9 ? 0.97 : ratio <= 1 ? 0.9 : ratio <= 1.15 ? 0.7 : ratio <= 1.3 ? 0.4 : ratio <= 1.5 ? 0.15 : 0.03;
  return r < p;
}

// ---------------- sets ----------------
// Trade players in for something better. Lineup players can't go in a set.
export const SETS = [
  { k: 'b2s', n: 'Bronze Bundle', d: 'Turn 6 bronze players into a Silver Pack', need: [[0, 6]], give: { pack: 'silver' } },
  { k: 's2g', n: 'Silver Exchange', d: 'Turn 5 silver players into a Gold Pack', need: [[1, 5]], give: { pack: 'gold' } },
  { k: 'g2e', n: 'Gold Upgrade', d: 'Turn 7 gold players into an Elite Pack', need: [[2, 7]], give: { pack: 'elite' } },
  { k: 'e2k', n: 'Elite Trade-up', d: 'Turn 4 elite players into a Kings Pack', need: [[3, 4]], give: { pack: 'kings' } },
  { k: 'mix', n: 'Coin Flip', d: 'Turn 3 silver and 2 gold players into 4,000 coins', need: [[1, 3], [2, 2]], give: { coins: 4000 } },
  { k: 'master', n: 'Weekly Master', d: 'Turn 2 elite and 5 gold players into this week’s 95 OVR Kings player. Once a week', need: [[3, 2], [2, 5]], give: { master: true }, weekly: true },
];
// this week's master card: a 95 OVR Kings player (fixed per week)
export function masterId(weekSeed) { const r = rng(weekSeed); let id; for (let i = 0; i < 400; i++) { id = makeId(4, (r() * 8) | 0, (r() * 1e7) | 0); if (card(id).ovr >= 95) break; } return id; }

// ---------------- solo challenges ----------------
// One CPU game each, any Ultimate Team lineup. Each can be beaten once a week.
export const SOLOS = [
  { k: 'open', n: 'Opening Drive', d: 'Win the game', opp: 19, diff: 0, f: r => r.res === 'W', give: { coins: 900, fp: 300 } },
  { k: 'air', n: 'Air Show', d: 'Throw for 250 yards and win', opp: 0, diff: 1, f: r => r.res === 'W' && r.me.passYds >= 250, give: { coins: 1500, pack: 'bronze', fp: 400 } },
  { k: 'ground', n: 'Ground and Pound', d: 'Run for 120 yards and win', opp: 30, diff: 1, f: r => r.res === 'W' && r.me.rushYds >= 120, give: { coins: 1500, fp: 400 } },
  { k: 'hawk', n: 'Ball Hawk', d: 'Intercept 2 passes', opp: 23, diff: 1, f: r => r.opp.ints >= 2, give: { coins: 1800, fp: 400 } },
  { k: 'sacks', n: 'Sack Master', d: 'Get 4 sacks', opp: 14, diff: 1, f: r => r.me.sacks >= 4, give: { coins: 1800, fp: 400 } },
  { k: 'wall', n: 'Brick Wall', d: 'Win and allow 7 points or fewer', opp: 12, diff: 1, f: r => r.res === 'W' && r.sc[1] <= 7, give: { coins: 2500, pack: 'silver', fp: 500 } },
  { k: 'state', n: 'Statement Win', d: 'Win by 21 or more', opp: 11, diff: 2, f: r => r.res === 'W' && r.sc[0] - r.sc[1] >= 21, give: { coins: 4000, pack: 'gold', fp: 700 } },
  { k: 'legend', n: 'Legend Killer', d: 'Beat the best team in the league', opp: 17, diff: 3, f: r => r.res === 'W', give: { coins: 8000, pack: 'elite', fp: 1000 } },
];

// ---------------- field pass ----------------
// A free season pass: earn pass XP by playing, claim a reward at every tier. Resets each month.
export const FP_TIERS = 30, FP_XP = 600;
export function fpReward(t) {
  if (t === FP_TIERS) return { coins: 10000, pack: 'kings' };
  if (t % 10 === 0) return { coins: 2500, pack: 'elite' };
  if (t % 5 === 0) return { coins: 1500, pack: 'gold' };
  if (t % 3 === 0) return { coins: 600, pack: 'silver' };
  return { coins: 500 + t * 60 };
}
export const fpSeason = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

// clubs from before 11-on-11: top up any position you don't have enough players for, then fill the new spots
export function missingForLineup(cards) {
  const have = {}; for (const c of cards) { const g = card(c.id).group; have[g] = (have[g] || 0) + 1; }
  const out = []; let n = 1;
  for (const [g, ss] of Object.entries(GROUPS)) for (let i = have[g] || 0; i < ss.length; i++) out.push(makeId(1, GROUP_KEYS.indexOf(g), (Date.now() + n++ * 7919) % 1e7));
  return out;
}
