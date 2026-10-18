// ENDZONE KINGS — Ultimate Team: player cards, packs, quicksell, training, lineups.
// Everything here is bought with coins you earn by playing. There is no real-money anything.
import { TEAMS } from './teams.js?v=1792367732';
import { grade, nextForm, decay, formed } from './form.js?v=1792367732';

export const TIERS = [
  // mv = what the market pays. Kept well under what packs cost, so buying packs to resell always loses coins
  { key: 'bronze', name: 'Bronze', lo: 56, hi: 66, qs: 10, train: 220, mv: 55 },
  { key: 'silver', name: 'Silver', lo: 66, hi: 75, qs: 35, train: 480, mv: 220 },
  { key: 'gold', name: 'Gold', lo: 75, hi: 83, qs: 110, train: 1000, mv: 700 },
  { key: 'elite', name: 'Elite', lo: 83, hi: 89, qs: 420, train: 2200, mv: 3400 },
  { key: 'kings', name: 'Kings', lo: 89, hi: 96, qs: 1400, train: 4800, mv: 15000 },
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
  const o = { ...c, u: inst.u, b };
  if (inst.x && VARIANTS[inst.x]) VARIANTS[inst.x].apply(o);
  for (const k of KEYS[c.group]) o[k] = Math.min(99, o[k] + b);
  o.ovr = Math.min(99, o.ovr + b);
  // abilities and X-Factors unlocked with Training Points (they change the ratings the game actually uses)
  const A = inst.ab && abilityOf(c.group, inst.ab);
  if (A) { for (const [k, v] of Object.entries(A.add)) o[k] = Math.min(99, o[k] + v); o.ab = A; }
  if (inst.xf) { const X = XFACTORS[c.group]; for (const k of KEYS[c.group]) o[k] = Math.min(99, o[k] + 3); o.xf = X; o.ovr = Math.min(99, o.ovr + 1); }
  return o;
}

// ---------------- special program cards (only come out of themed packs) ----------------
const lift = (o, ks, to) => { for (const k of ks) o[k] = Math.max(o[k], to); };
export const VARIANTS = {
  legend: { program: 'Ultimate Legend', apply(o) { o.program = 'Ultimate Legend'; for (const k of KEYS[o.group]) o[k] = Math.min(99, o[k] + 4); o.ovr = Math.min(99, o.ovr + 4); o.legend = true; } },
  cyclone: { program: 'Cyclone', apply(o) { o.program = 'Cyclone'; lift(o, ['spd'], 98); o.elu = Math.min(99, o.elu + 6); o.ovr = Math.min(99, o.ovr + 2); } },
  frost: { program: 'Cold-Blooded', apply(o) { o.program = 'Cold-Blooded'; lift(o, ['cov'], 97); o.ovr = Math.min(99, o.ovr + 2); } },
  venom: { program: 'Venom', apply(o) { o.program = 'Venom'; lift(o, ['tkl'], 97); o.ovr = Math.min(99, o.ovr + 2); } },
  // limited-time weekly event programs (only drop the week they're live)
  primetime: { program: 'Primetime', apply(o) { o.program = 'Primetime'; for (const k of KEYS[o.group]) o[k] = Math.min(99, o[k] + 3); o.ovr = Math.min(99, o.ovr + 3); } },
  snowbowl: { program: 'Snow Bowl', apply(o) { o.program = 'Snow Bowl'; for (const k of ['tkl', 'blk', 'rush']) o[k] = Math.min(99, o[k] + 4); o.ovr = Math.min(99, o.ovr + 2); } },
  throwback: { program: 'Throwback', apply(o) { o.program = 'Throwback'; for (const k of ['spd', 'hands', 'elu']) o[k] = Math.min(99, o[k] + 3); o.ovr = Math.min(99, o.ovr + 2); } },
  breakout: { program: 'Breakout', apply(o) { o.program = 'Breakout'; for (const k of KEYS[o.group]) o[k] = Math.min(99, o[k] + 5); o.ovr = Math.min(99, o.ovr + 4); } },
};
// this week's limited event (rotates every Monday)
const EVENTS = [['primetime', 'Primetime Heroes'], ['snowbowl', 'Snow Bowl'], ['throwback', 'Throwback Week'], ['breakout', 'Breakout Stars']];
const weekNo = (d = new Date()) => { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return Math.floor(t.getTime() / 604800000); };
export const EVENT = (() => { const [x, name] = EVENTS[weekNo() % EVENTS.length]; const d = new Date(), left = 7 - ((d.getDay() + 6) % 7); return { x, name, left }; })();

// ---------------- abilities and X-Factors ----------------
export const ABILITIES = {
  QB: [{ k: 'dime', n: 'Dime Dropper', d: '+5 Accuracy', add: { acc: 5 } }, { k: 'cannon', n: 'Cannon', d: '+5 Arm', add: { arm: 5 } }],
  HB: [{ k: 'jukebox', n: 'Juke Box', d: '+5 Elusive', add: { elu: 5 } }, { k: 'burner', n: 'Afterburner', d: '+3 Speed', add: { spd: 3 } }],
  WR: [{ k: 'glue', n: 'Glue Hands', d: '+5 Hands', add: { hands: 5 } }, { k: 'deep', n: 'Deep Threat', d: '+3 Speed', add: { spd: 3 } }],
  TE: [{ k: 'mismatch', n: 'Mismatch', d: '+5 Hands', add: { hands: 5 } }, { k: 'sealer', n: 'Edge Sealer', d: '+5 Block', add: { blk: 5 } }],
  OL: [{ k: 'wall', n: 'Brick Wall', d: '+5 Block', add: { blk: 5 } }, { k: 'mauler', n: 'Mauler', d: '+3 Block, +3 Speed', add: { blk: 3, spd: 3 } }],
  DL: [{ k: 'edge', n: 'Edge Threat', d: '+5 Pass rush', add: { rush: 5 } }, { k: 'clamp', n: 'Run Clamp', d: '+5 Tackle', add: { tkl: 5 } }],
  LB: [{ k: 'stuffer', n: 'Run Stuffer', d: '+5 Tackle', add: { tkl: 5 } }, { k: 'lurker', n: 'Lurker', d: '+5 Coverage', add: { cov: 5 } }],
  CB: [{ k: 'shutdown', n: 'Shutdown', d: '+5 Coverage', add: { cov: 5 } }, { k: 'pickartist', n: 'Pick Artist', d: '+5 Hands', add: { hands: 5 } }],
  S: [{ k: 'enforcer', n: 'Enforcer', d: '+5 Tackle (more fumbles)', add: { tkl: 5 } }, { k: 'hawk', n: 'Ball Hawk', d: '+5 Coverage', add: { cov: 5 } }],
};
export const XFACTORS = { QB: 'Field General', HB: 'Freight Train', WR: 'Double Me', TE: 'Red Zone Threat', OL: 'Fortress', DL: 'Unstoppable Force', LB: 'Heat Seeker', CB: 'Lockdown', S: 'No Fly Zone' };
export const abilityOf = (group, k) => (ABILITIES[group] || []).find(a => a.k === k) || null;
export const TP_ABILITY = [0, 0, 170, 280, 420];   // gold and up
export const TP_XFACTOR = 700;                     // Kings and Ultimate Legends only
export const quicksell = inst => { const c = owned(inst); return Math.round(TIERS[c.tier].qs * (1 + (c.ovr - TIERS[c.tier].lo) * 0.06) + (inst.b || 0) * TIERS[c.tier].train * 0.25); };
// training costs Training Points (earned by playing and quickselling), not coins
export const TP_TRAIN = [16, 34, 68, 135, 270];
export const TP_QS = [5, 12, 30, 80, 200];   // quickselling is the main way to earn TP
export const trainCost = inst => { const c = card(inst.id); const b = inst.b || 0; return b >= MAX_BOOST[c.tier] ? 0 : TP_TRAIN[c.tier] * (b + 1); };
export const quicksellTp = inst => Math.round((TP_QS[card(inst.id).tier] || 0) * (inst.x ? 2 : 1) + (inst.b || 0) * 4);

// ---------------- packs ----------------
export const PACKS = [
  { key: 'bronze', name: 'Rookie Rush Pack', art: ['Rookie', 'Rush'], stars: 1, cost: 1100, n: 5, w: [85, 14, 1, 0, 0], guar: 0, blurb: '5 players, mostly bronze. Fill out the depth chart.' },
  { key: 'silver', name: 'Blitz Pack', art: ['Blitz', 'Box'], stars: 2, cost: 3200, n: 5, w: [35, 55, 10, 0, 0], guar: 1, blurb: '5 players, at least 1 silver' },
  { key: 'gold', name: 'Prime Time Pack', art: ['Prime', 'Time'], stars: 3, cost: 7800, n: 5, w: [0, 45, 50, 5, 0], guar: 2, blurb: '5 players, at least 1 gold' },
  { key: 'elite', name: 'Showtime Pack', art: ['Show', 'Time'], stars: 4, cost: 21000, n: 5, w: [0, 0, 70, 27, 3], guar: 3, blurb: '5 players, at least 1 elite. Small shot at a Kings card' },
  { key: 'kings', name: 'Crown Vault', art: ['Crown', 'Vault'], stars: 5, cost: 56000, n: 3, w: [0, 0, 0, 70, 30], guar: 4, blurb: '3 players, 1 Kings card guaranteed' },
  // themed and risk packs
  { key: 'boom', name: 'Boom or Bust Pack', art: ['Boom', 'or Bust'], stars: 2, cost: 1700, n: 4, w: [90, 7, 1.6, 1, 0.4], guar: 0, blurb: 'Cheap and risky. Usually junk, tiny shot at an Elite or Kings card' },
  { key: 'cyclone', name: 'Cyclone Pack', art: ['Cyclone', ''], stars: 3, cost: 5800, n: 5, w: [60, 35, 5, 0, 0], guar: 0, groups: ['WR', 'CB', 'HB'], special: { x: 'cyclone', chance: 0.06, tier: 4, groups: ['WR', 'CB', 'HB'] }, blurb: 'Fast WRs, CBs and backs. Rare shot at a 98-speed Cyclone star' },
  { key: 'blizzard', name: 'Sub-Zero Blizzard', art: ['Sub-Zero', 'Blizzard'], stars: 3, cost: 6400, n: 5, w: [55, 38, 7, 0, 0], guar: 0, groups: ['DL', 'DL', 'LB', 'CB', 'S'], special: { x: 'frost', chance: 0.06, tier: 4, groups: ['CB', 'S'] }, blurb: 'Defense pack. Rare shot at a Cold-Blooded lockdown corner or safety' },
  { key: 'venom', name: 'Venom Spike Pack', art: ['Venom', 'Spike'], stars: 3, cost: 6400, n: 5, w: [55, 38, 7, 0, 0], guar: 0, groups: ['LB', 'S', 'DL'], special: { x: 'venom', chance: 0.06, tier: 3, groups: ['LB', 'S'] }, blurb: 'Hard hitters. Rare shot at a Venom safety or linebacker who forces fumbles' },
  { key: 'supernova', name: 'Supernova Pack', art: ['Super', 'nova'], stars: 4, cost: 9800, n: 1, w: [100, 0, 0, 0, 0], guar: 0, nova: true, blurb: 'Most of the time: 1 bronze player and 150 TP. 15% of the time it explodes into 3 Elite players' },
  { key: 'vortex', name: 'Vortex Chaos Pack', art: ['Vortex', 'Chaos'], stars: 4, cost: 11500, n: 3, w: [40, 30, 18, 9, 3], guar: 0, blurb: 'Pure chaos. Any tier can drop, bronze to Kings' },
  { key: 'legends', name: 'Ultimate Legends Pack', art: ['Ultimate', 'Legends'], stars: 5, cost: 85000, n: 3, w: [0, 0, 0, 80, 20], guar: 3, special: { x: 'legend', chance: 1, tier: 4, guaranteed: true }, blurb: '3 players, 1 Ultimate Legend guaranteed: an all-time great of the league' },
  { key: 'event', name: `${EVENT.name} Pack`, art: [EVENT.name.split(' ')[0], EVENT.name.split(' ').slice(1).join(' ') || 'Event'], stars: 4, cost: 14500, n: 4, w: [10, 50, 32, 7, 1], guar: 2, special: { x: EVENT.x, chance: 0.18, tier: 3 }, limited: true, blurb: `LIMITED: ${EVENT.left} day${EVENT.left === 1 ? '' : 's'} left. 4 players, 18% shot at a ${VARIANTS[EVENT.x].program} card you can only get this week` },
  { key: 'camp', name: 'Training Camp Pack', art: ['Training', 'Camp'], stars: 3, cost: 0, tpCost: 480, n: 4, w: [0, 60, 35, 5, 0], guar: 2, blurb: 'Bought with Training Points. 4 players, at least 1 gold' },
];
export const packByKey = k => PACKS.find(p => p.key === k);
function pickTier(w, r) { const tot = w.reduce((a, b) => a + b, 0); let x = r() * tot; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; } return 0; }
// returns card ids, best last (for the reveal)
// returns entries ({ id, x }) best last, plus bonus TP for Supernova duds
export function rollPack(key, seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
  const P = packByKey(key); const r = rng(seed);
  const grp = () => P.groups ? GROUP_KEYS.indexOf(P.groups[(r() * P.groups.length) | 0]) : (r() * GROUP_KEYS.length) | 0;
  let out = [];
  if (P.nova) {
    if (r() < 0.15) for (let i = 0; i < 3; i++) out.push({ id: makeId(3, (r() * GROUP_KEYS.length) | 0, (r() * 1e7) | 0) });
    else { out.push({ id: makeId(0, grp(), (r() * 1e7) | 0) }); out.tp = 150; }
  } else {
    for (let i = 0; i < P.n; i++) out.push({ id: makeId(pickTier(P.w, r), grp(), (r() * 1e7) | 0) });
    if (!out.some(e => Math.floor(e.id / 1e8) >= P.guar)) out[0] = { id: makeId(P.guar, grp(), (r() * 1e7) | 0) };
    const S = P.special;
    if (S && (S.guaranteed || r() < S.chance)) { const g = S.groups ? GROUP_KEYS.indexOf(S.groups[(r() * S.groups.length) | 0]) : (r() * GROUP_KEYS.length) | 0; out[out.length - 1] = { id: makeId(S.tier, g, (r() * 1e7) | 0), x: S.x }; }
  }
  const tp = out.tp; out = out.sort((a, b) => owned(a).ovr - owned(b).ovr); out.tp = tp;
  return out;
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
// team chemistry: starters from the same team boost each other (+1 at 3, +2 at 5, +3 at 7); your club's own team counts one extra
export function chemistry(ut) {
  const L = lineupCards(ut), by = {};
  for (const s of SLOTS) { const c = L[s]; if (!c) continue; (by[c.team] = by[c.team] || []).push(s); }
  const groups = Object.entries(by).map(([t, ss]) => { const n = ss.length + (+t === ut.club ? 1 : 0); return { team: +t, n: ss.length, bonus: n >= 7 ? 3 : n >= 5 ? 2 : n >= 3 ? 1 : 0, slots: ss }; }).filter(g => g.bonus).sort((a, b) => b.bonus - a.bonus || b.n - a.n);
  const slot = {}; for (const g of groups) for (const s of g.slots) slot[s] = g.bonus;
  return { groups, slot, total: Object.values(slot).reduce((a, b) => a + b, 0) };
}
// roster object the sim understands (see sim.js cleanRoster)
export function squadRoster(ut) {
  const L = lineupCards(ut); if (!SLOTS.every(s => L[s])) return null;
  const CH = chemistry(ut);
  const players = {}, usedNums = new Set();
  for (const s of SLOTS) {
    const c = L[s]; let num = c.num; while (usedNums.has(num)) num = (num + 1) % 100; usedNums.add(num);
    players[s] = formed({ first: c.first, last: c.last, num, face: c.face, ovr: c.ovr, spd: c.spd, hands: c.hands, acc: c.acc, arm: c.arm, elu: c.elu, blk: c.blk, rush: c.rush, tkl: c.tkl, cov: c.cov }, ((ut.form || {})[ut.lineup[s]] || 0) + (CH.slot[s] || 0));   // live form + chemistry
  }
  return { players };
}

// ---------------- scaling rival: a CPU squad built around a target overall ----------------
// As your squad gets better (and you keep winning), the rival squads you face get better too.
// live attribute form: after each Ultimate Team game, starters run hot or cold off their box score
export function updateForm(ut, ps, me, won, margin) {
  ut.form = ut.form || {}; const played = new Set(), out = [];
  for (const s of ps || []) { if (s.t !== me) continue; const u = ut.lineup[s.role]; if (u == null) continue; const f0 = ut.form[u] || 0; ut.form[u] = nextForm(f0, grade(s, s.role, won, margin)); played.add(String(u));
    if (ut.form[u] >= 1.5 && f0 < 1.5) out.push(`${s.n} is heating up: +${Math.round(ut.form[u])} to every rating`); else if (ut.form[u] <= -1.5 && f0 > -1.5) out.push(`${s.n} is in a slump: ${Math.round(ut.form[u])} to every rating`); }
  for (const u of Object.keys(ut.form)) { if (!played.has(u)) ut.form[u] = decay(ut.form[u]); if (!ut.form[u]) delete ut.form[u]; }
  return out;
}
export function rivalLevel(ut) { const o = squadOvr(ut).ovr; return Math.max(58, Math.min(97, o - 1 + Math.min(9, Math.floor((ut.rw || 0) / 3)))); }
export function rivalRoster(target, seed) {
  const r = rng(seed >>> 0 || 7), players = {}, usedNums = new Set();
  const tierFor = o => Math.max(0, TIERS.findIndex(T => o >= T.lo && o <= T.hi));
  for (const s of SLOTS) {
    const g = SLOT_GROUP[s], gi = GROUP_KEYS.indexOf(g), want = Math.round(target + (r() - 0.5) * 6);
    let best = null;
    for (let k = 0; k < 40; k++) { const c = card(makeId(tierFor(Math.max(56, Math.min(96, want))), gi, (r() * 1e7) | 0)); if (!best || Math.abs(c.ovr - want) < Math.abs(best.ovr - want)) best = c; if (Math.abs(c.ovr - want) <= 1) break; }
    let num = best.num; while (usedNums.has(num)) num = (num + 1) % 100; usedNums.add(num);
    players[s] = { first: best.first, last: best.last, num, face: best.face, ovr: best.ovr, spd: best.spd, hands: best.hands, acc: best.acc, arm: best.arm, elu: best.elu, blk: best.blk, rush: best.rush, tkl: best.tkl, cov: best.cov };
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
export const MARKET_SLOT_MS = 15 * 60 * 1000;  // listings refresh every 15 minutes
export const MAX_LISTINGS = 5;
export const LIST_TIMES = [[10, '10 min'], [30, '30 min'], [60, '1 hour']];
export const marketSlot = (t = Date.now()) => Math.floor(t / MARKET_SLOT_MS);
// 15 cards for sale this half hour, the same for everyone
// every player gets their own market (seeded by who you are), so a good card is pure luck, not a batch everyone sees
export function marketListings(slot = marketSlot(), salt = 0) {
  const r = rng((slot * 97 + 13) ^ (salt >>> 0)), out = [];
  // each listing rolls on its own: 1.5% Elite, 0.15% Kings
  for (let i = 0; i < 15; i++) {
    const tier = pickTier([52, 34, 12.35, 1.5, 0.15], r), id = makeId(tier, (r() * 8) | 0, (r() * 1e7) | 0);
    out.push({ k: slot + ':' + i, id, price: r50(marketValue(id) * (tier >= 3 ? 1.15 + r() * 0.35 : 0.95 + r() * 0.35)) });   // and they cost a premium
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
// Every set costs more in players than it gives back, and each can only be done a few times a day,
// so sets can't be looped into endless coins (someone farmed 125k that way).
export const SET_DAILY = 2;
export const SETS = [
  { k: 'b2s', n: 'Bronze Bundle', d: 'Turn 14 bronze players into a Silver Pack. 2 a day', need: [[0, 14]], give: { pack: 'silver' }, daily: SET_DAILY },
  { k: 's2g', n: 'Silver Exchange', d: 'Turn 11 silver players into a Gold Pack. 2 a day', need: [[1, 11]], give: { pack: 'gold' }, daily: SET_DAILY },
  { k: 'g2e', n: 'Gold Upgrade', d: 'Turn 12 gold players into an Elite Pack. 2 a day', need: [[2, 12]], give: { pack: 'elite' }, daily: SET_DAILY },
  { k: 'e2k', n: 'Elite Trade-up', d: 'Turn 7 elite players into a Kings Pack. Once a day', need: [[3, 7]], give: { pack: 'kings' }, daily: 1 },
  { k: 'mix', n: 'Coin Flip', d: 'Turn 5 silver and 3 gold players into 900 coins. Once a day', need: [[1, 5], [2, 3]], give: { coins: 900 }, daily: 1 },
  { k: 'master', n: 'Weekly Master', d: 'Turn 2 elite and 5 gold players into this week’s 95 OVR Kings player. Once a week', need: [[3, 2], [2, 5]], give: { master: true }, weekly: true },
];
// this week's master card: a 95 OVR Kings player (fixed per week)
export function masterId(weekSeed) { const r = rng(weekSeed); let id; for (let i = 0; i < 400; i++) { id = makeId(4, (r() * 8) | 0, (r() * 1e7) | 0); if (card(id).ovr >= 95) break; } return id; }

// ---------------- solo challenges ----------------
// One CPU game each, any Ultimate Team lineup. Each can be beaten once a week.
export const SOLOS = [
  { k: 'bronzeb', n: 'Bronze Brigade', d: 'Win with every starter a bronze card', req: (L) => Object.values(L).every(c => c && c.tier === 0), reqd: 'Every starter must be bronze', opp: 25, diff: 1, f: r => r.res === 'W', give: { coins: 1400, pack: 'silver', fp: 500 } },
  { k: 'hometown', n: 'Hometown Heroes', d: 'Win with 6+ starters from one team', req: (L) => { const n = {}; for (const c of Object.values(L)) if (c) n[c.team] = (n[c.team] || 0) + 1; return Math.max(0, ...Object.values(n)) >= 6; }, reqd: 'Start 6 players from the same team', opp: 9, diff: 2, f: r => r.res === 'W', give: { coins: 1600, pack: 'gold', fp: 600 } },
  { k: 'open', n: 'Opening Drive', d: 'Win the game', opp: 19, diff: 0, f: r => r.res === 'W', give: { coins: 450, fp: 300 } },
  { k: 'air', n: 'Air Show', d: 'Throw for 250 yards and win', opp: 0, diff: 1, f: r => r.res === 'W' && r.me.passYds >= 250, give: { coins: 750, pack: 'bronze', fp: 400 } },
  { k: 'ground', n: 'Ground and Pound', d: 'Run for 120 yards and win', opp: 30, diff: 1, f: r => r.res === 'W' && r.me.rushYds >= 120, give: { coins: 750, fp: 400 } },
  { k: 'hawk', n: 'Ball Hawk', d: 'Intercept 2 passes', opp: 23, diff: 1, f: r => r.opp.ints >= 2, give: { coins: 900, fp: 400 } },
  { k: 'sacks', n: 'Sack Master', d: 'Get 4 sacks', opp: 14, diff: 1, f: r => r.me.sacks >= 4, give: { coins: 900, fp: 400 } },
  { k: 'wall', n: 'Brick Wall', d: 'Win and allow 7 points or fewer', opp: 12, diff: 1, f: r => r.res === 'W' && r.sc[1] <= 7, give: { coins: 1250, pack: 'silver', fp: 500 } },
  { k: 'state', n: 'Statement Win', d: 'Win by 21 or more', opp: 11, diff: 2, f: r => r.res === 'W' && r.sc[0] - r.sc[1] >= 21, give: { coins: 2000, pack: 'gold', fp: 700 } },
  { k: 'legend', n: 'Legend Killer', d: 'Beat the best team in the league', opp: 17, diff: 3, f: r => r.res === 'W', give: { coins: 4000, pack: 'elite', fp: 1000 } },
];

// ---------------- field pass ----------------
// A free season pass: earn pass XP by playing, claim a reward at every tier. Resets each month.
export const FP_TIERS = 30, FP_XP = 1100;   // a Field Pass tier takes real playing time
export function fpReward(t) {
  if (t === FP_TIERS) return { coins: 5000, pack: 'kings' };
  if (t % 10 === 0) return { coins: 1200, pack: 'elite' };
  if (t % 5 === 0) return { coins: 700, pack: 'gold' };
  if (t % 3 === 0) return { coins: 300, pack: 'silver' };
  return { coins: 200 + t * 25 };
}
export const fpSeason = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

// clubs from before 11-on-11: top up any position you don't have enough players for, then fill the new spots
export function missingForLineup(cards) {
  const have = {}; for (const c of cards) { const g = card(c.id).group; have[g] = (have[g] || 0) + 1; }
  const out = []; let n = 1;
  for (const [g, ss] of Object.entries(GROUPS)) for (let i = have[g] || 0; i < ss.length; i++) out.push(makeId(1, GROUP_KEYS.indexOf(g), (Date.now() + n++ * 7919) % 1e7));
  return out;
}
