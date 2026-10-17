// ENDZONE KINGS — game simulation (no DOM, runs in browser or Node)
// Units are yards. Team 0 attacks +z (scores at z >= 100), team 1 attacks -z (scores at z <= 0).
// x is sideline-to-sideline, |x| <= 26.65 is in bounds.

export const HALF_W = 26.65;

import { TEAMS, getRoster, POS_LABEL } from './teams.js?v=1792251972';
export { TEAMS };

// 11 on 11. Player ids follow these lists: offense 0-10, defense 11-21 (the first seven of each keep their old ids)
export const OFF_ROLES = ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB', 'LT', 'RT', 'TE', 'WR3'];
export const DEF_ROLES = ['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S', 'DL4', 'LB2', 'LB3', 'SS'];
export const RECEIVERS = ['WR1', 'WR2', 'RB', 'TE', 'WR3']; // keys 1-5
const N_OFF = OFF_ROLES.length;
const isLine = r => r === 'C' || r === 'LG' || r === 'RG' || r === 'LT' || r === 'RT';
const isSafety = r => r === 'S' || r === 'SS';
const isLB = r => r === 'LB' || r === 'LB2' || r === 'LB3';

import { FORMS, LINE, OFF_PLAYS, DEF_PLAYS, KICK_PLAYS, OFF_CATS, DEF_CATS, OFF_STYLES, DEF_STYLES, teamPlaybook, cleanCustom } from './playbook.js?v=1792251972';
export { OFF_PLAYS, DEF_PLAYS, KICK_PLAYS, OFF_CATS, DEF_CATS, FORMS, teamPlaybook };

// top speeds in yards/second (Madden-like pace: elite WRs ~ 8.5 yd/s, linemen ~ 5.5)
const ROSTER = {
  QB:  { spd: 6.6, size: 1.0 },
  C:   { spd: 5.2, size: 1.22 },
  LG:  { spd: 5.2, size: 1.22 },
  RG:  { spd: 5.2, size: 1.22 },
  WR1: { spd: 8.1, size: 0.97 },
  WR2: { spd: 7.9, size: 1.0 },
  RB:  { spd: 7.8, size: 1.03 },
  DL1: { spd: 6.0, size: 1.18 },
  DL2: { spd: 5.7, size: 1.24 },
  DL3: { spd: 6.0, size: 1.18 },
  LB:  { spd: 7.1, size: 1.1 },
  CB1: { spd: 7.9, size: 0.97 },
  CB2: { spd: 7.8, size: 0.97 },
  S:   { spd: 7.6, size: 1.02 },
  LT:  { spd: 5.3, size: 1.24 },
  RT:  { spd: 5.3, size: 1.24 },
  TE:  { spd: 7.0, size: 1.12 },
  WR3: { spd: 8.0, size: 0.96 },
  DL4: { spd: 5.8, size: 1.22 },
  LB2: { spd: 7.2, size: 1.08 },
  LB3: { spd: 7.2, size: 1.08 },
  SS:  { spd: 7.5, size: 1.04 },
};
const DEF_ALIGN = {
  DL1: [-3.6, 1.15], DL4: [-1.05, 1.15], DL2: [1.05, 1.15], DL3: [3.6, 1.15],
  LB: [0, 5.2], LB2: [-4.8, 4.8], LB3: [4.8, 4.8],
  CB1: [-13, 6], CB2: [13, 6], S: [-3, 13], SS: [5, 10],
};
function offAlign(form) { const f = FORMS[form] || FORMS.gun; return { ...LINE, QB: f.QB, RB: f.RB, WR1: f.WR1, WR2: f.WR2, WR3: f.WR3 || [-8.5, -1.3], TE: f.TE || [5.3, -1.15] }; }

const DIFF = [
  { name: 'Rookie', ai: 0.85, shed: 0.08, intP: 0.26, qbErr: 1.6, react: 0.45, brk: 0.04 },
  { name: 'Pro',    ai: 0.91, shed: 0.12, intP: 0.38, qbErr: 1.05, react: 0.32, brk: 0.08 },
  { name: 'All-Pro', ai: 0.96, shed: 0.16, intP: 0.5, qbErr: 0.65, react: 0.22, brk: 0.12 },
  { name: 'Legend',  ai: 1.0, shed: 0.2, intP: 0.6, qbErr: 0.45, react: 0.16, brk: 0.15 },
];
export const DIFFICULTIES = DIFF.map(d => d.name);

const R = 0.55; // player radius
const dirOf = t => (t === 0 ? 1 : -1);
const prog = (t, z) => (t === 0 ? z : 100 - z);
const zOf = (t, p) => (t === 0 ? p : 100 - p);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const dist = (a, b) => hyp(a.x - b.x, a.z - b.z);

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(opts = {}) {
  const o = {
    teams: opts.teams || [3, 15],
    humans: opts.humans || [true, false],
    quarterLen: opts.quarterLen || 120,
    difficulty: opts.difficulty ?? 1,
    seed: opts.seed ?? (Date.now() & 0xffffffff),
    rosters: [0, 1].map(k => cleanRoster(opts.rosters && opts.rosters[k])),
    weather: WEATHERS.includes(opts.weather) ? opts.weather : 'clear',
    tod: TODS.includes(opts.tod) ? opts.tod : 'night',
    halftime: opts.practice || opts.drill ? 0 : (opts.halftime ?? 12),
    practice: ['off', 'def', 'st'].includes(opts.practice) ? opts.practice : null,
    pspot: clamp(+opts.pspot || 25, 20, 97),
    drill: !!opts.drill,
    cel: [0, 1].map(k => { const v = opts.cel ? +opts.cel[k] : -1; return Number.isFinite(v) && v >= -1 && v <= 6 ? v : -1; }),
  };
  const rng = mulberry(o.seed);
  const first = rng() < 0.5 ? 0 : 1;
  const g = {
    opts: o, rng, cfg: DIFF[o.difficulty] || DIFF[1],
    t: 0, phase: 'presnap', phaseT: 0, deadDur: 2,
    quarter: 1, clock: o.quarterLen, score: [0, 0],
    poss: first, firstReceiver: first,
    losZ: 0, ballX: 0, fdZ: 0, down: 1, togo: 10,
    offPlay: null, defPlay: null, defChosen: false, playClock: 20,
    players: [], ball: { state: 'held', carrier: 1, x: 0, y: 0.3, z: 0 },
    ctrl: [-1, -1], play: null, playId: 0, runoff: 0,
    msg: null, flash: null, events: [], kick: null, winner: -1,
    stats: [mkStats(), mkStats()],
    custom: [{}, {}], pat: -1, ps: {}, halfReady: [false, false], mom: 0, hot: {}, hl: [], to: [3, 3], lastRunoff: 0, books: [0, 1].map(k => teamPlaybook((opts.teams || [3, 15])[k], TEAMS[(opts.teams || [3, 15])[k]])),
  };
  if (o.practice) { g.poss = o.practice === 'def' ? 1 : 0; g.firstReceiver = g.poss; }
  if (o.drill) { g.poss = 0; g.firstReceiver = 0; g.quarter = 4; }
  g.losZ = zOf(g.poss, o.practice && o.practice !== 'st' ? o.pspot : 25);
  setFirstDown(g);
  if (o.practice === 'st') nextPlay(g); else setupPlay(g);
  g.msg = o.practice ? { text: 'PRACTICE', sub: o.practice === 'off' ? 'Run any play you want · no clock' : o.practice === 'st' ? 'Field goals and punts from all over the field' : 'Defend any play · no clock', until: 2.4 }
    : o.drill ? { text: 'TWO-MINUTE DRILL', sub: 'Score as much as you can · every drive starts at the 25', until: 2.6 }
    : { text: 'KICKOFF', sub: TEAMS[o.teams[g.poss]].name + ' ball', until: 2.2 };
  return g;
}

export function getPlay(g, team, id) {
  if (!id) return null;
  const k = KICK_PLAYS.find(p => p.id === id); if (k) return k;
  const b = g.books[team];
  if (b.sig && b.sig.id === id) return b.sig;
  if (id.startsWith('c_')) return g.custom[team][id] || null;
  return OFF_PLAYS.find(p => p.id === id) || DEF_PLAYS.find(p => p.id === id) || null;
}

export const WEATHERS = ['clear', 'rain', 'snow', 'fog'];
export const TODS = ['day', 'dusk', 'night'];
const RKEYS = ['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'];
// a custom roster (Ultimate Team squad) sent from a menu or over the network: keep only sane values
function cleanRoster(r) {
  if (!r || typeof r !== 'object' || !r.players) return null;
  const out = { players: {} };
  for (const role of Object.keys(ROSTER)) {
    let q = r.players[role];
    // squads saved before 11-on-11 don't have the new spots yet: a solid backup fills in
    if (!q || typeof q !== 'object') q = { first: 'Backup', last: role, num: 0, face: 7, ovr: 68, spd: 68, hands: 66, acc: 60, arm: 60, elu: 62, blk: 68, rush: 66, tkl: 66, cov: 64 };
    const p = { role, pos: POS_LABEL[role] };
    for (const k of RKEYS) p[k] = Math.max(40, Math.min(99, Math.round(+q[k] || 60)));
    p.first = String(q.first || 'Player').replace(/[<>]/g, '').slice(0, 14);
    p.last = String(q.last || 'One').replace(/[<>]/g, '').slice(0, 16);
    p.name = `${p.first[0]}. ${p.last}`;
    p.num = Math.max(0, Math.min(99, Math.round(+q.num || 0)));
    p.face = (+q.face >>> 0) || 1;
    p.ovr = Math.max(40, Math.min(99, Math.round(+q.ovr || 70)));
    out.players[role] = p;
  }
  return out;
}
// momentum: +100 means team 0 owns the game, -100 means team 1 does. Swings on big plays, settles between plays.
function mom(g, team, amt) {
  if (g.opts.practice) return;
  const before = g.mom;
  g.mom = clamp(g.mom + (team === 0 ? amt : -amt), -100, 100);
  if (Math.abs(g.mom) >= 70 && Math.abs(before) < 70) { g.events.push('momentum'); if (!g.flash) g.flash = { text: `${TEAMS[g.opts.teams[g.mom > 0 ? 0 : 1]].abbr} HAS THE MOMENTUM`, until: 1.6 }; }
}
const momOf = (g, team) => (team === 0 ? g.mom : -g.mom);
function highlight(g, text, sub, team) { if (!g.opts.practice) g.hl.push({ q: g.quarter, clk: Math.ceil(g.clock), text, sub: sub || '', team }); if (g.hl.length > 24) g.hl.shift(); }
export const rosterFor = (g, team) => g.opts.rosters[team] || getRoster(g.opts.teams[team]);
function pst(g, p) {
  const k = p.team + ':' + p.role;
  return g.ps[k] || (g.ps[k] = { t: p.team, n: p.rt.name, pos: POS_LABEL[p.role], role: p.role, face: p.rt.face || faceSeed(p.rt.first + p.rt.last + p.num), py: 0, ptd: 0, ry: 0, rec: 0, recy: 0, td: 0, tk: 0, sk: 0, int: 0 });
}

function mkStats() { return { passYds: 0, rushYds: 0, comp: 0, att: 0, tds: 0, ints: 0, sacks: 0, firstDowns: 0, pens: 0, penYds: 0, tkl: 0, fgm: 0, fga: 0, fgl: 0, xpm: 0, xpa: 0, punts: 0, puntYds: 0 }; }

function setFirstDown(g) {
  const p = prog(g.poss, g.losZ);
  const fd = Math.min(100, p + 10);
  g.fdZ = zOf(g.poss, fd);
  g.togo = fd - p;
  g.down = 1;
}

function makePlayer(g, id, team, unit, role, x, z) { const pl = makePlayer0(g, id, team, unit, role, x, z); pl.max0 = pl.max; return pl; }
function makePlayer0(g, id, team, unit, role, x, z) {
  const r = ROSTER[role];
  const rt = rosterFor(g, team).players[role];
  const d = dirOf(g.poss);
  const faceOff = d > 0 ? 0 : Math.PI;
  return {
    id, team, unit, role, num: rt.num, size: r.size, max: r.spd * (0.88 + rt.spd / 100 * 0.15) * (g.opts.weather === 'snow' ? 0.95 : 1) * (momOf(g, team) >= 60 ? 1.025 : 1), rt,
    x, z, vx: 0, vz: 0, face: unit === 'off' ? faceOff : faceOff + Math.PI, max0: 0,
    stam: 1, stun: 0, juke: 0, jukeCd: 0, dive: 0, tackleCd: 0, fallen: 0, spin: 0, stiff: 0, hurdle: 0, moveCd: 0, playBall: 0, hx: x, hz: z,
    engagedBy: -1, blockOn: -1, shedCd: 0, svx: 0, svz: 0,
    route: null, ri: 0, rstop: false, ldx: 0, ldz: d,
  };
}

function rel(g, lx, lz) {
  const P = g.play, d = dirOf(P ? P.off : g.poss);
  const bx = P ? P.bx : g.ballX, los = P ? P.los : g.losZ;
  return { x: clamp(bx - lx * d, -HALF_W + 0.8, HALF_W - 0.8), z: los + lz * d };
}

function setupPlay(g) {
  const off = g.poss, def = 1 - off;
  g.play = { off, def, los: g.losZ, bx: g.ballX, type: null, snapT: 0, thrown: false, handed: false,
    crossed: false, turnover: false, recognized: false, target: -1, throwT: 0, readT: 0, qbDecided: false, isPat: g.pat === off };
  g.players = [];
  const oa = offAlign('gun');
  OFF_ROLES.forEach((role, i) => { const p = rel(g, ...oa[role]); g.players.push(makePlayer(g, i, off, 'off', role, p.x, p.z)); });
  DEF_ROLES.forEach((role, i) => { const p = rel(g, ...DEF_ALIGN[role]); g.players.push(makePlayer(g, N_OFF + i, def, 'def', role, p.x, p.z)); });
  const c = g.players[1];
  g.ball = { state: 'held', carrier: 1, x: c.x, y: 0.3, z: g.losZ, auto: false };
  g.offPlay = null; g.defPlay = 'cover1'; g.defChosen = false; g.playClock = 25;
  g.ctrl = [-1, -1];
  g.ctrl[off] = 0; // QB
  g.ctrl[def] = byRole(g, 'LB').id;
  g.kick = null; g.celebrate = -1; g.lastFlag = null; g.hot = {}; g.mom *= 0.94; g.cadence = 0; g.cpuSnapAt = 4.8 + g.rng() * 2.4;
  g.playId++;
  if (!g.opts.humans[off]) cpuCallOffense(g);
  if (!g.opts.humans[def]) { g.defPlay = cpuCallDefense(g); g.defChosen = true; }
  alignOffense(g, true); alignDefense(g, true);
}

// formations: set each player's home spot for the chosen play (they jog there pre-snap)
function alignOffense(g, instant) {
  const pl = getPlay(g, g.poss, g.offPlay);
  const form = pl && pl.form ? pl.form : (pl && pl.id === 'punt' ? 'punt' : pl && (pl.id === 'fg' || pl.id === 'xp') ? 'fg' : 'gun');
  const oa = offAlign(form);
  for (const p of g.players) if (p.unit === 'off') {
    const h = rel(g, ...oa[p.role]); p.hx = h.x; p.hz = h.z;
    if (instant) { p.x = h.x; p.z = h.z; }
  }
  g.form = form;
  alignDefense(g, instant);
}
function alignDefense(g, instant) {
  const dp = getPlay(g, 1 - g.poss, g.defPlay) || DEF_PLAYS[0];
  const wr = { WR1: byRole(g, 'WR1'), WR2: byRole(g, 'WR2'), WR3: byRole(g, 'WR3'), TE: byRole(g, 'TE'), RB: byRole(g, 'RB') };
  const d = dirOf(g.poss);
  for (const p of g.players) if (p.unit === 'def') {
    let [lx, lz] = DEF_ALIGN[p.role];
    const man = dp.man && dp.man[p.role];
    if (man && wr[man] && man !== 'RB') { lx = null; lz = dp.press && p.role.startsWith('CB') ? 1.6 : isLB(p.role) ? 4.5 : 6; }
    if (dp.zone && dp.zone[p.role] && !p.role.startsWith('DL')) { const z = dp.zone[p.role]; lx = p.role.startsWith('CB') ? null : z[0]; lz = Math.min(z[1], isSafety(p.role) ? 16 : 9); }
    if (dp.rush && dp.rush.includes(p.role)) lz = 3;
    let h = rel(g, lx ?? 0, lz);
    if (lx === null) { const w = man ? wr[man] : (p.role === 'CB1' ? wr.WR1 : wr.WR2); h = { x: w.hx, z: g.losZ + lz * d }; }
    p.hx = h.x; p.hz = h.z;
    if (instant) { p.x = h.x; p.z = h.z; }
  }
}

function applyFormationShading(g) {
  // CBs line up over their WR's actual x; nothing fancy
  const wr1 = byRole(g, 'WR1'), wr2 = byRole(g, 'WR2');
  const cb1 = byRole(g, 'CB1'), cb2 = byRole(g, 'CB2');
  cb1.x = wr1.x; cb2.x = wr2.x;
}

const byRole = (g, role) => g.players.find(p => p.role === role);

export function is4th(g) { return g.down === 4; }
export function fgDistance(g) { return Math.round(100 - prog(g.poss, g.losZ) + 17); }
export function canFG(g) { return fgDistance(g) <= 58 && g.pat < 0; }

// ---------------- CPU play calling ----------------
function cpuCallOffense(g) {
  const r = g.rng, p = prog(g.poss, g.losZ), book = g.books[g.poss];
  if (g.pat === g.poss) {
    const diff = g.score[g.poss] + 6 - g.score[1 - g.poss];
    const goTwo = (g.quarter >= 4 && [-1, -2, 1, -5, -9].includes(diff - 6)) || r() < 0.08;
    if (!goTwo) { g.offPlay = 'xp'; alignOffense(g); return; }
  } else if (g.down === 4) {
    const fd = fgDistance(g);
    const late = g.quarter >= 4 && g.clock < 60 && g.score[g.poss] < g.score[1 - g.poss];
    if (!late) {
      if (fd <= 52) { g.offPlay = 'fg'; alignOffense(g); return; }
      if (!(g.togo <= 2 && p >= 45)) { g.offPlay = r() < 0.03 ? 'fakepunt' : 'punt'; alignOffense(g); return; }
    }
  }
  const style = OFF_STYLES[book.style.off];
  const w = { ...style.weight };
  if (g.togo <= 2 || g.pat === g.poss) { w.Run *= 2.2; w.Deep *= 0.4; }
  else if (g.togo >= 8 && g.down >= 2) { w.Run *= 0.35; w.Deep *= 1.4; w.Screen *= 1.3; }
  if (p > 88) { w.Deep *= 0.3; }
  const cat = pickW(r, w);
  let pool = book.off.map(id => OFF_PLAYS.find(q => q.id === id)).filter(q => q && q.cat === cat);
  if (book.sig && book.sig.cat === cat && r() < 0.35) pool = [book.sig];
  if (!pool.length) pool = OFF_PLAYS.filter(q => q.cat === 'Quick');
  g.offPlay = pool[(r() * pool.length) | 0].id;
  alignOffense(g);
}

function cpuCallDefense(g) {
  const book = g.books[1 - g.poss], st = DEF_STYLES[book.style.def];
  const w = { ...st.weight };
  if (g.togo >= 8) { w.Zone *= 1.6; w.Blitz *= 0.7; } else if (g.togo <= 2) { w.Blitz *= 1.6; w.Man *= 1.3; }
  // situational calls: goal line only near the goal line, prevent only when protecting a late lead
  const toGoal = 100 - prog(g.poss, g.losZ), dTeam = 1 - g.poss, lead = g.score[dTeam] - g.score[g.poss];
  const late = (g.quarter === 2 || g.quarter >= 4) && g.clock < 50;
  if (toGoal <= 4 && g.rng() < 0.6) return 'goalline';
  const ok = q => q && (q.id !== 'goalline' || toGoal <= 6) && (q.id !== 'prevent' || (late && lead > 0));
  if (late && lead > 0 && lead <= 8 && toGoal > 25 && g.rng() < 0.45) return 'prevent';
  const cat = pickW(g.rng, w);
  let pool = book.def.map(id => DEF_PLAYS.find(q => q.id === id)).filter(q => ok(q) && q.cat === cat);
  if (!pool.length) pool = book.def.map(id => DEF_PLAYS.find(q => q.id === id)).filter(ok);
  return (pool.length ? pool[(g.rng() * pool.length) | 0] : DEF_PLAYS[0]).id;
}

function pickW(r, w) {
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  let x = r() * tot;
  for (const [k, v] of Object.entries(w)) { x -= v; if (x <= 0) return k; }
  return Object.keys(w)[0];
}

// ---------------- events / input ----------------
function handleEvent(g, team, ev) {
  const P = g.play;
  if (ev.t === 'custom') { const c = cleanCustom(ev.def); if (c) g.custom[team][c.id] = c; return; }
  if (g.phase === 'half') { if (ev.t === 'snap' || ev.t === 'ready') g.halfReady[team] = true; return; }
  if (g.phase === 'kickset') { if (team === g.poss && (ev.t === 'kick' || ev.t === 'snap')) advanceKick(g); return; }
  if (ev.t === 'timeout' && (g.phase === 'presnap' || g.phase === 'dead') && g.to[team] > 0 && !g.opts.practice && g.timeoutCd <= 0) {
    g.to[team]--; g.timeoutCd = 3;
    if (g.phase === 'dead') g.runoff = 0; else { g.clock = Math.min(g.opts.quarterLen, g.clock + g.lastRunoff); g.lastRunoff = 0; g.playClock = 25; }
    g.msg = { text: 'TIMEOUT', sub: `${TEAMS[g.opts.teams[team]].name} · ${g.to[team]} left`, until: 2 };
    g.events.push('whistle');
    return;
  }
  if (g.phase === 'presnap') {
    if (team === g.poss) {
      if (ev.t === 'play') {
        if (ev.def) { const c = cleanCustom(ev.def); if (c) g.custom[team][c.id] = c; }
        const pl = getPlay(g, team, ev.id);
        if (!pl || pl.side === 'def' || DEF_PLAYS.includes(pl)) return;
        const isPat = g.pat === team;
        if (pl.id === 'xp' && !isPat) return;
        if ((pl.id === 'fg' && (!canFG(g) || isPat)) || (pl.id === 'punt' && isPat)) return;
        if (g.opts.practice === 'st' && pl.id !== 'fg' && pl.id !== 'punt') return;
        if ((pl.id === 'fakepunt' || pl.id === 'fakefg') && isPat) return;
        if (g.offPlay !== pl.id) g.hot = {};
        g.offPlay = pl.id; alignOffense(g);
      } else if (ev.t === 'hot' && g.offPlay) {
        const pl = getPlay(g, team, g.offPlay);
        if (pl && pl.type === 'pass' && !g.play.isPat && RECEIVERS.includes(ev.role)) {
          const r = hotRoute(pl.form || 'gun', ev.role, ev.kind);
          if (r === null) g.hot[ev.role] = []; else if (r) g.hot[ev.role] = r;
        }
      } else if (ev.t === 'snap' && g.offPlay && g.phaseT > 0.6) {
        snap(g);
      }
    } else {
      if (ev.t === 'play') {
        if (ev.def) { const c = cleanCustom(ev.def); if (c) g.custom[team][c.id] = c; }
        const pl = getPlay(g, team, ev.id);
        if (pl && (DEF_PLAYS.includes(pl) || pl.side === 'def')) { g.defPlay = pl.id; g.defChosen = true; alignDefense(g); }
      }
      else if (ev.t === 'switch') cycleDefender(g, team);
      else if (ev.t === 'pick') { const p = g.players[ev.id]; if (p && p.team === team) g.ctrl[team] = p.id; }
    }
    return;
  }
  if (g.phase !== 'live') return;
  const me = g.players[g.ctrl[team]];
  const b = g.ball;
  const carrier = b.state === 'held' ? g.players[b.carrier] : null;
  const iCarry = me && carrier === me && me.stun <= 0 && me.fallen <= 0;
  if (ev.t === 'throw' || ev.t === 'pick') {
    if (team === P.off && canThrow(g)) {
      let r = null;
      if (ev.t === 'throw') r = byRole(g, RECEIVERS[ev.n - 1]);
      else { const p = g.players[ev.id]; if (p && p.team === team && RECEIVERS.includes(p.role)) r = p; }
      if (r) { throwBall(g, g.players[0], r, humanErr(g)); return; }
    }
    if (ev.t === 'pick') {
      const p = g.players[ev.id];
      if (p && p.team === team && !(carrier && carrier.team === team)) g.ctrl[team] = p.id;
    }
  } else if (ev.t === 'cdive' && iCarry && !me.cdive && !(me.id === 0 && P.type === 'pass' && !P.thrown && !P.crossed)) {
    // ball carrier lays out forward: extra yards, or stretch it over the goal line
    me.cdive = 0.55; me.dive = 0.55; const sp = Math.max(7.5, hyp(me.vx, me.vz) + 2);
    const fx = Math.sin(me.face), fz = Math.cos(me.face); me.vx = fx * sp; me.vz = fz * sp;
    g.events.push('dive');
    return;
  } else if (ev.t === 'slide' && iCarry) {
    // give yourself up: down where you are, no hit, clock keeps rolling
    me.fallen = 2; g.msgNote = me.id === 0 ? 'QB slides' : 'gives himself up';
    return endPlay(g, 'tackle', me, null);
  } else if (ev.t === 'juke') {
    if (iCarry && me.moveCd <= 0) {
      me.juke = 0.4; me.moveCd = 1.0;
      const ix = ev.x || 0, iz = ev.z || 0;
      let lx = -me.vz, lz = me.vx; const l = hyp(lx, lz) || 1; lx /= l; lz /= l;
      if (ix * lx + iz * lz < 0) { lx = -lx; lz = -lz; }
      me.vx += lx * 4.2; me.vz += lz * 4.2;
      g.events.push('juke');
    }
  } else if (ev.t === 'spin') {
    if (iCarry && me.moveCd <= 0) { me.spin = 0.55; me.moveCd = 1.5; g.events.push('spin'); }
  } else if (ev.t === 'stiff') {
    if (iCarry && me.moveCd <= 0) { me.stiff = 0.6; me.moveCd = 1.3; g.events.push('stiff'); }
  } else if (ev.t === 'hurdle') {
    if (iCarry && me.moveCd <= 0) { me.hurdle = 0.55; me.moveCd = 1.8; g.events.push('hurdle'); }
  } else if (ev.t === 'playball') {
    // defender: jump the route / swat. receiver: aggressive catch
    if (me && b.state === 'air' && !b.auto && me.playBall <= 0 && me.stun <= 0) {
      const dl = hyp(me.x - b.tx, me.z - b.tz), left = b.T - b.t;
      if (dl < 4.5 + left * me.max * 0.6) { me.playBall = 0.75; g.events.push('playball'); }
      else { me.playBall = 0.4; me.stun = 0.35; }
    }
  } else if (ev.t === 'dive') {
    if (me && carrier && carrier.team !== team && me.dive <= 0 && me.stun <= 0 && me.engagedBy < 0) {
      let dx = carrier.x - me.x, dz = carrier.z - me.z; const l = hyp(dx, dz) || 1;
      dx /= l; dz /= l;
      me.dive = 0.45; me.vx = dx * 9.5; me.vz = dz * 9.5; me.face = Math.atan2(dx, dz);
      g.events.push('dive');
    }
  } else if (ev.t === 'switch') {
    if (!(carrier && carrier.team === team) && !(team === P.off && canThrow(g))) {
      const ref = b.state === 'air' && !b.auto ? { x: b.tx, z: b.tz } : (carrier || b);
      let best = null, bd = 1e9;
      for (const p of g.players) if (p.team === team) { const d = hyp(p.x - ref.x, p.z - ref.z); if (d < bd && p.id !== g.ctrl[team]) { bd = d; best = p; } }
      if (best) g.ctrl[team] = best.id;
    }
  }
}

function cycleDefender(g, team) {
  const order = ['LB', 'LB2', 'LB3', 'S', 'SS', 'CB1', 'CB2', 'DL1', 'DL4', 'DL2', 'DL3'];
  const cur = g.players[g.ctrl[team]];
  const i = cur ? order.indexOf(cur.role) : -1;
  g.ctrl[team] = byRole(g, order[(i + 1) % order.length]).id;
}

function humanErr(g) {
  const qb = g.players[0];
  const sp = hyp(qb.vx, qb.vz);
  let pressure = 0;
  for (const p of g.players) if (p.team !== qb.team) { const d = dist(p, qb); if (d < 3) pressure = Math.max(pressure, (3 - d) / 3); }
  return (0.35 + sp * 0.1 + pressure * 1.3) * (1.45 - qb.rt.acc / 100);
}

export function canThrow(g) {
  const P = g.play, b = g.ball;
  return g.phase === 'live' && P.type === 'pass' && !P.thrown && !P.crossed && b.state === 'held' && b.carrier === 0;
}

// ---------------- penalties ----------------
// Pre-snap fouls (false start, offsides, delay of game) stop the play before it starts.
// Live fouls (holding, pass interference, roughing, facemask) put a flag on the play and get
// enforced when it ends, accepted or declined by whichever choice helps the other team more.
const PEN = {
  fs: { name: 'FALSE START', yds: 5, off: true, replay: true },
  dog: { name: 'DELAY OF GAME', yds: 5, off: true, replay: true },
  offside: { name: 'OFFSIDES', yds: 5, off: false },
  hold: { name: 'HOLDING', yds: 10, off: true, replay: true, from: 'los' },
  opi: { name: 'OFFENSIVE PASS INTERFERENCE', yds: 10, off: true, replay: true, from: 'los' },
  dpi: { name: 'PASS INTERFERENCE', yds: 0, off: false, auto1: true, from: 'spot' },
  dhold: { name: 'DEFENSIVE HOLDING', yds: 5, off: false, auto1: true, from: 'los' },
  rough: { name: 'ROUGHING THE PASSER', yds: 15, off: false, auto1: true, from: 'end' },
  mask: { name: 'FACEMASK', yds: 15, off: false, auto1: true, from: 'end' },
};
export const PENALTY_NAMES = Object.fromEntries(Object.entries(PEN).map(([k, v]) => [k, v.name]));
function throwFlag(g, type, who, z) {
  const P = g.play; if (!P || P.flag || P.isPat || g.phase !== 'live' || g.opts.practice) return;
  P.flag = { type, on: who.team, num: who.num, name: who.rt.name, z: z ?? who.z, x: who.x };
  g.flash = { text: 'FLAG ON THE PLAY', until: 1.4 };
  g.events.push('flag');
}
// move the ball for a foul: positive yds help the offense (toward their goal). Half the distance near a goal line.
function penaltyMove(g, team, fromP, yds) {
  let to = fromP + yds;
  if (to > 99) to = fromP + (100 - fromP) / 2;      // half the distance to the goal
  if (to < 1) to = fromP / 2;
  to = clamp(to, 1, 99);
  g.losZ = zOf(team, to);
  return to;
}
function presnapFoul(g, type, offender) {
  const pen = PEN[type], off = g.poss;
  const team = pen.off ? off : 1 - off;
  g.stats[team].pens++; g.stats[team].penYds += pen.yds;
  const fromP = prog(off, g.losZ);
  const to = penaltyMove(g, off, fromP, pen.off ? -pen.yds : pen.yds);
  if (prog(off, g.fdZ) <= to) setFirstDown(g); else g.togo = Math.max(1, Math.round(prog(off, g.fdZ) - to));
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = 2.2; g.runoff = 0;
  g.msg = { text: pen.name, sub: `${pen.off ? 'Offense' : 'Defense'}${offender ? ` · #${offender.num} ${offender.rt.name}` : ''} · ${Math.round(Math.abs(to - fromP))} yards`, until: 2.2, pen: 1 };
  g.events.push('flag', 'whistle');
}
const FOUL_RATE = 1; // overall penalty frequency multiplier
const fouls = g => (g.opts.practice ? 0 : 1);
// returns true when the flag decided how the play ended (so the caller should stop)
function enforceFlag(g, endP, turnover, td) {
  const P = g.play, F = P.flag; if (!F || P.isPat) return false;
  P.flag = null;
  const pen = PEN[F.type], off = P.off, losP = prog(off, P.los);
  const resYds = endP == null ? 0 : endP - losP;
  let accept;
  if (pen.off) accept = !turnover && (endP == null || td || resYds > -pen.yds);
  else if (td) accept = false;
  else if (pen.from === 'end' || turnover || endP == null) accept = true;
  else accept = pen.auto1 ? (prog(off, g.fdZ) > endP || resYds < pen.yds) : resYds < pen.yds;
  const tm = TEAMS[g.opts.teams[F.on]].abbr;
  if (!accept) { g.flagNote = `${pen.name} on ${tm}, declined`; return false; }
  g.stats[F.on].pens++;
  g.poss = off; g.lastFlag = [r2(F.x), r2(F.z)];
  let to, yds;
  if (F.type === 'dpi') { const spotP = clamp(prog(off, F.z), losP + 1, 99); to = spotP; g.losZ = zOf(off, to); yds = Math.round(to - losP); }
  else if (pen.from === 'end' && endP != null && !turnover) { to = penaltyMove(g, off, Math.max(1, endP), pen.yds); yds = pen.yds; }
  else { to = penaltyMove(g, off, losP, pen.off ? -pen.yds : pen.yds); yds = Math.round(Math.abs(to - losP)); }
  g.stats[F.on].penYds += Math.abs(yds);
  g.ballX = clamp(g.ballX, -7, 7);
  if (pen.auto1 || prog(off, g.fdZ) <= to) setFirstDown(g);
  else g.togo = Math.max(1, Math.round(prog(off, g.fdZ) - to));
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = 2.6; g.runoff = 0;
  g.msg = { text: pen.name, sub: `${pen.off ? 'Offense' : 'Defense'} · #${F.num} ${F.name} · ${Math.abs(yds)} yards${pen.auto1 ? ' · automatic first down' : pen.replay ? ' · replay the down' : ''}`, until: 2.6, pen: 1 };
  g.events.push('whistle');
  return true;
}

// quick route changes at the line: in-breaking, out-breaking, go, curl; the back can flat, wheel or stay in to block
export const HOT_KINDS = { WR: ['go', 'in', 'out', 'curl', 'post', 'corner', 'drag', 'comeback'], TE: ['go', 'in', 'out', 'curl', 'post', 'corner', 'drag', 'block'], RB: ['wheel', 'flat', 'curl', 'block', 'angle', 'swing', 'seam', 'texas'] };
function hotRoute(form, role, kind) {
  const f = FORMS[form] || FORMS.gun; const [sx, sz] = f[role] || [0, 0];
  const inside = sx === 0 ? 1 : -Math.sign(sx);
  if (role === 'RB') {
    const side = sx >= 0 ? 1 : -1, wide = Math.abs(sx) > 6;
    if (kind === 'block') return null;
    if (wide) { // back split out wide (empty): treat him like a receiver
      if (kind === 'wheel' || kind === 'seam') return [[sx, 8], [sx + inside, 30]];
      if (kind === 'flat' || kind === 'swing') return [[sx, 4], [sx - inside * 5, 4]];
      if (kind === 'angle' || kind === 'texas') return [[sx, 2], [sx + inside * 8, 8]];
      return [[sx, 7], [sx + inside, 5.5, 'stop']];
    }
    if (kind === 'flat') return [[sx + side * 4, sz + 2], [sx + side * 12, 1]];
    if (kind === 'wheel') return [[sx + side * 7, sz + 3], [sx + side * 11, 6], [sx + side * 11, 26]];
    if (kind === 'curl') return [[sx + side * 1, 3], [sx + side * 1, 6, 'stop']];
    if (kind === 'angle') return [[sx + side * 4, -2.5], [sx + side * 3, 3], [sx - side * 3, 6]];
    if (kind === 'swing') return [[sx + side * 6, sz + 0.5], [sx + side * 14, -1.5]];
    if (kind === 'seam') return [[sx + side * 2.5, 1], [sx + side * 3.5, 22]];
    if (kind === 'texas') return [[sx - side * 4, -2.5], [sx - side * 6, 2], [sx - side * 1, 8]];
    return undefined;
  }
  if (kind === 'block') return role === 'TE' ? null : undefined;
  if (kind === 'go') return [[sx, 8], [sx + inside * 1, 30]];
  if (kind === 'in') return [[sx, 2], [sx + inside * 8, 9], [sx + inside * 14, 12]];
  if (kind === 'out') return [[sx, 7], [sx - inside * 6, 7]];
  if (kind === 'curl') return [[sx, 11], [sx + inside * 1.5, 8.5, 'stop']];
  if (kind === 'post') return [[sx, 11], [sx + inside * 7, 26], [sx + inside * 9, 42]];
  if (kind === 'corner') return [[sx, 11], [sx - inside * 6, 22], [sx - inside * 8, 30]];
  if (kind === 'drag') return [[sx, 2], [sx + inside * 9, 4], [sx + inside * 24, 5]];
  if (kind === 'comeback') return [[sx, 15], [sx - inside * 2.5, 12, 'stop']];
  return undefined;
}

function snap(g) {
  const P = g.play;
  if (g.offPlay === 'punt' || g.offPlay === 'fg' || g.offPlay === 'xp') { if (g.opts.humans[g.poss] || g.opts.humans[1 - g.poss]) beginKickSet(g, g.offPlay); else startKick(g, g.offPlay); return; }
  if (g.pat < 0 && !g.opts.practice) {
    const r = g.rng();
    if (!g.opts.humans[g.poss] && r < 0.008 * FOUL_RATE * fouls(g)) return presnapFoul(g, 'fs', byRole(g, ['LT', 'LG', 'C', 'RG', 'RT', 'TE'][(g.rng() * 6) | 0]));
    if (!g.opts.humans[1 - g.poss] && r > 1 - 0.008 * FOUL_RATE * fouls(g)) return presnapFoul(g, 'offside', byRole(g, ['DL1', 'DL2', 'DL3', 'DL4'][(g.rng() * 4) | 0]));
  }
  const play = getPlay(g, g.poss, g.offPlay);
  P.type = play.type; P.playDef = play; P.snapT = g.t;
  P.readT = (g.opts.humans[1 - g.poss] ? 2.0 : 1.7) + g.rng() * 1.2;
  P.def = 1 - g.poss;
  P.flag = null; P.holdT = 0.6 + g.rng() * 2.2; P.holdRoll = g.rng();
  g.phase = 'live'; g.phaseT = 0;
  g.events.push('snap');
  for (const p of g.players) {
    p.x = p.hx; p.z = p.hz;
    if (play.routes[p.role]) { p.route = play.routes[p.role]; p.ri = 0; }
    if (g.hot[p.role]) { if (g.hot[p.role].length) { p.route = g.hot[p.role]; p.ri = 0; } else p.route = null; }
    if (p.role === 'QB' && play.qbPath) { p.route = play.qbPath; p.ri = 0; }
  }
  // defensive assignments from the called coverage
  const dp = getPlay(g, 1 - g.poss, g.defPlay) || DEF_PLAYS[0];
  P.dp = dp;
  for (const p of g.players) {
    if (p.unit !== 'def') continue;
    p.assign = -1; p.dmode = p.role.startsWith('DL') ? 'rush' : 'zone'; p.zone = null;
    if (dp.man && dp.man[p.role]) { p.dmode = 'man'; p.assign = byRole(g, dp.man[p.role]).id; }
    if (dp.zone && dp.zone[p.role]) { p.dmode = 'zone'; p.zone = dp.zone[p.role]; }
    if (dp.rush && dp.rush.includes(p.role)) p.dmode = 'rush';
    if (dp.spy && dp.spy.includes(p.role)) p.dmode = 'spy';
    if (dp.deep && dp.deep.includes(p.role)) p.dmode = 'deep';
    if (p.dmode === 'zone' && !p.zone) p.zone = DEF_ALIGN[p.role];
    if (dp.press && p.dmode === 'man' && p.role.startsWith('CB')) p.press = 0.9;
  }
  // OL assignments
  // five linemen on four down linemen: the center is free to pick up whoever blitzes
  byRole(g, 'LT').blockOn = byRole(g, 'DL1').id;
  byRole(g, 'LG').blockOn = byRole(g, 'DL4').id;
  byRole(g, 'RG').blockOn = byRole(g, 'DL2').id;
  byRole(g, 'RT').blockOn = byRole(g, 'DL3').id;
  byRole(g, 'C').blockOn = -1;
  if (play.type === 'run') {
    // run game: the center climbs to the middle linebacker, the tight end takes the linebacker on his side
    const te = byRole(g, 'TE'), lb2 = byRole(g, 'LB2'), lb3 = byRole(g, 'LB3');
    byRole(g, 'C').blockOn = byRole(g, 'LB').id;
    te.blockOn = (dist(te, lb2) < dist(te, lb3) ? lb2 : lb3).id;
  }
  const qb = g.players[0];
  const sd = dist(qb, g.players[1]);
  launchBall(g, qb.x, qb.z, sd < 2 ? 0.12 : 0.32, sd < 2 ? 0.05 : 0.4, qb.id, true);
}

function launchBall(g, tx, tz, T, h, target, auto) {
  const b = g.ball;
  b.state = 'air'; b.fx = b.x; b.fz = b.z; b.fy = b.y; b.tx = tx; b.tz = tz; b.T = T; b.t = 0; b.h = h;
  b.target = target; b.auto = auto; b.carrier = -1;
}

function leadPoint(from, r, speed) {
  let tx = r.x, tz = r.z, T = 0.4;
  let vx = r.vx, vz = r.vz;
  if (r.rstop) { vx = 0; vz = 0; }
  for (let k = 0; k < 4; k++) {
    const D = hyp(tx - from.x, tz - from.z);
    T = Math.max(0.35, D / speed);
    tx = r.x + vx * T; tz = r.z + vz * T;
  }
  return { x: tx, z: tz, T };
}

function throwBall(g, qb, r, err) {
  const P = g.play;
  const D0 = dist(qb, r);
  const speed = (16 + Math.min(D0, 40) * 0.17) * (0.86 + qb.rt.arm / 100 * 0.2);
  const L = leadPoint(qb, r, speed);
  // longer throws are harder to place
  const a = g.rng() * Math.PI * 2, e = err * (0.6 + Math.min(D0, 45) / 11) * Math.sqrt(g.rng());
  const tx = L.x + Math.cos(a) * e, tz = L.z + Math.sin(a) * e;
  const D = hyp(tx - qb.x, tz - qb.z);
  g.ball.x = qb.x; g.ball.z = qb.z; g.ball.y = 1.9;
  launchBall(g, tx, tz, Math.max(0.4, D / speed), 0.7 + D * 0.12, r.id, false);
  g.ball.ix = L.x; g.ball.iz = L.z;   // where the QB meant to put it
  P.thrown = true; P.target = r.id; P.throwT = g.t; qb.throwAt = g.t;
  g.stats[P.off].att++;
  for (const d of g.players) if (d.team !== P.off && !g.opts.humans[d.team] && d.dmode === 'rush' && dist(d, qb) < 1.5 && g.rng() < 0.1 * FOUL_RATE) { throwFlag(g, 'rough', d, qb.z); break; }
  g.events.push('throw');
  if (g.opts.humans[P.off]) g.ctrl[P.off] = r.id;
}

// ---------------- kicks ----------------
// ---------------- kick meter (human kickers) ----------------
// Madden-style three press: aim with left/right, press to start the meter, press to lock power,
// press again on the line as it drops back for accuracy. Early or late hooks the kick.
const KICK_SWEET = 0.1;
function legOf(g, team) { const q = rosterFor(g, team).players.QB; return clamp(((q.arm || 70) * 0.7 + (q.acc || 70) * 0.3), 50, 99); }
function kickRange(g, team, type) { const leg = legOf(g, team); return type === 'punt' ? 40 + (leg - 70) * 0.3 : clamp(50 + (leg - 70) * 0.35, 44, 62); }
function beginKickSet(g, type) {
  const off = g.poss, d = dirOf(off);
  g.phase = 'kickset'; g.phaseT = 0;
  const fd = type === 'xp' ? 20 : type === 'fg' ? fgDistance(g) : 0;
  g.ks = { type, stage: 'aim', aim: type === 'punt' ? clamp(g.ballX, -12, 12) : 0, m: 0, dir: 1, power: 0, fd, maxR: kickRange(g, off, type), t: 0 };
  if (!g.opts.humans[off]) {
    // CPU kicker: decide the swing up front, then let the meter play out so it looks (and takes as long as) a real kick
    const k = g.ks, sk = (legOf(g, off) - 50) / 49;
    const need = type === 'punt' ? 0.82 + g.rng() * 0.16 : clamp(fd / (k.maxR * 1.08) + 0.06 + (g.rng() - 0.5) * 0.08, 0.3, 1);
    const sd = type === 'punt' ? 0.05 : 0.04 + fd * 0.0034 - sk * 0.025;
    const gauss = () => (g.rng() + g.rng() + g.rng() - 1.5) / 1.5;
    k.cpu = { aim: type === 'punt' ? clamp(g.ballX * 0.4 + (g.rng() - 0.5) * 12, -18, 18) : (g.rng() - 0.5) * 0.8, power: need, acc: gauss() * sd * 1.6 };
  }
  const holder = g.players[0]; holder.x = g.ballX; holder.z = g.losZ - (type === 'punt' ? 12 : 7) * d;
  const b = g.ball; b.state = 'held'; b.carrier = 0; b.x = holder.x; b.z = holder.z; b.y = 0.35;
  g.events.push('snap');
}
function advanceKick(g) {
  const k = g.ks; if (!k) return;
  if (k.stage === 'aim') { k.stage = 'power'; k.m = 0; k.dir = 1; g.events.push('ui'); }
  else if (k.stage === 'power') { k.power = Math.max(0.05, k.m); k.stage = 'acc'; g.events.push('ui'); }
  else if (k.stage === 'acc') finishKick(g, k.m - KICK_SWEET);
}
function finishKick(g, acc) { const k = g.ks; g.ks = null; startKick(g, k.type, { power: k.power, acc: clamp(acc, -0.4, 0.4), aim: k.aim }); }
function updateKickSet(g, dt, inputs) {
  const k = g.ks; if (!k) return;
  k.t += dt;
  const inp = inputs[g.poss] || {};
  const lim = k.type === 'punt' ? 24 : 14;
  if (k.cpu) {
    if (k.stage === 'aim') { k.aim += (k.cpu.aim - k.aim) * Math.min(1, dt * 2.5); if (g.phaseT > 1.6) advanceKick(g); }
    else if (k.stage === 'power') { k.m += dt / 1.05; if (k.m >= k.cpu.power) { k.m = k.cpu.power; advanceKick(g); } }
    else if (k.stage === 'acc') { k.m -= dt / 0.9; if (k.m <= KICK_SWEET + k.cpu.acc) finishKick(g, k.m - KICK_SWEET); }
    return;
  }
  if (k.stage !== 'acc') k.aim = clamp(k.aim + (inp.mx || 0) * dt * (k.type === 'punt' ? 14 : 7), -lim, lim);
  if (k.stage === 'power') { k.m += dt / 1.05 * k.dir; if (k.m >= 1) { k.m = 1; k.dir = -1; } if (k.m <= 0 && k.dir < 0) { k.m = 0; k.dir = 1; } }
  else if (k.stage === 'acc') { k.m -= dt / 0.9; if (k.m < -0.18) return finishKick(g, -0.3); }
  if (g.phaseT > 14 && !k.cpu) { if (k.stage === 'aim') advanceKick(g); else if (k.stage === 'power') { k.m = 0.7; advanceKick(g); } else finishKick(g, 0.2); }
}

function startKick(g, type, sk) {
  const off = g.poss, d = dirOf(off);
  const p = prog(off, g.losZ);
  g.phase = 'kick'; g.phaseT = 0;
  const k = { type, t: 0, human: !!sk };
  k.fx = g.ballX; k.fz = g.losZ - 7 * d;
  if (sk) {
    const skill = (legOf(g, off) - 50) / 49;
    if (type === 'punt') {
      k.fz = g.losZ - 12 * d;
      const shank = Math.abs(sk.acc) > 0.2;
      let dist0 = 6 + sk.power * kickRange(g, off, 'punt') * (shank ? 0.55 : 1) + (g.rng() - 0.5) * 4;
      let land = p + 12 + dist0 - 12;
      let tx = sk.aim + sk.acc * 22 + (g.rng() - 0.5) * (2.5 - skill * 1.5);
      const oob = Math.abs(tx) > HALF_W;
      tx = clamp(tx, -HALF_W - 1, HALF_W + 1);
      k.tx = tx; k.T = 1.6 + sk.power * 1.6; k.h = 6 + sk.power * 11;
      if (land >= 100) { k.result = 'touchback'; k.newP = 20; land = Math.min(land, 108); }
      else { k.result = oob ? 'oob' : 'punt'; k.newP = 100 - land; }
      k.tz = zOf(off, land); k.yds = Math.round(Math.min(land, 100) - p); k.shank = shank;
    } else {
      const fd = type === 'xp' ? 20 : fgDistance(g);
      const reach = sk.power * kickRange(g, off, type) * 1.08;
      const hook = sk.acc * 13 * (0.55 + fd / 45);
      const xPost = sk.aim + hook + (g.rng() - 0.5) * (1.6 - skill * 1.1);
      const short = reach < fd;
      k.good = !short && Math.abs(xPost) < 3.05; k.dist = fd;
      k.miss = short ? 'short' : Math.abs(xPost) >= 3.05 ? ((xPost * d > 0) ? 'wide left' : 'wide right') : '';
      k.tx = clamp(xPost, -14, 14);
      k.tz = short ? zOf(off, p - 7 + reach + 2) : zOf(off, 110); k.T = 1.2 + fd * 0.012; k.h = short ? 4 : 6 + fd * 0.12;
    }
    g.kick = k;
    const b = g.ball; b.state = 'kick'; b.carrier = -1; b.x = k.fx; b.z = k.fz; b.y = 0.5;
    g.events.push('kick');
    return;
  }
  if (type === 'punt') {
    let dist0 = 38 + g.rng() * 12;
    if (g.rng() < 0.06) dist0 = 22 + g.rng() * 8; // shank
    let land = p + dist0;
    k.tx = clamp(g.ballX + (g.rng() - 0.5) * 16, -22, 22);
    k.T = 2.6; k.h = 14;
    if (land >= 100) { k.result = 'touchback'; k.newP = 20; land = Math.min(land, 108); }
    else { k.result = 'punt'; k.newP = 100 - land; }
    k.tz = zOf(off, land); k.yds = Math.round(Math.min(land, 100) - p);
  } else if (type === 'xp') {
    k.good = g.rng() < 0.94; k.dist = 20;
    k.tx = k.good ? (g.rng() - 0.5) * 4 : (g.rng() < 0.5 ? -1 : 1) * (4.2 + g.rng() * 2);
    k.tz = zOf(off, 110); k.T = 1.4; k.h = 6;
  } else {
    const fd = fgDistance(g);
    const pr = fd <= 30 ? 0.97 : fd <= 40 ? 0.9 : fd <= 50 ? 0.75 : 0.5 - (fd - 50) * 0.03;
    k.good = g.rng() < pr; k.dist = fd;
    k.tx = k.good ? (g.rng() - 0.5) * 4 : (g.rng() < 0.5 ? -1 : 1) * (4.5 + g.rng() * 3);
    k.tz = zOf(off, 110); k.T = 1.7; k.h = 6 + fd * 0.12;
  }
  g.kick = k;
  const b = g.ball; b.state = 'kick'; b.carrier = -1; b.x = k.fx; b.z = k.fz; b.y = 0.5;
  g.events.push('kick');
}

function updateKick(g, dt) {
  const k = g.kick;
  k.t += dt;
  const s = Math.min(1, k.t / k.T);
  const b = g.ball;
  b.x = k.fx + (k.tx - k.fx) * s; b.z = k.fz + (k.tz - k.fz) * s;
  b.y = 0.5 + 4 * k.h * s * (1 - s) + (k.type !== 'punt' ? s * 3 : 0);
  g.clock = Math.max(0, g.clock - dt);
  if (k.t >= k.T + 0.4) {
    const off = g.poss;
    g.phase = 'dead'; g.phaseT = 0; g.deadDur = 2.2; g.runoff = 0;
    g.events.push('whistle');
    const ks = g.stats[off];
    if (k.type === 'xp') { ks.xpa++; if (k.good) ks.xpm++; }
    else if (k.type === 'punt') { ks.punts++; ks.puntYds += k.yds || 0; }
    else { ks.fga++; if (k.good) { ks.fgm++; ks.fgl = Math.max(ks.fgl, k.dist || 0); } }
    if (k.type === 'xp') {
      if (k.good) { score(g, off, 1); g.events.push('score'); }
      g.msg = k.good ? { text: 'EXTRA POINT GOOD', sub: '', until: 2 } : { text: 'EXTRA POINT NO GOOD', sub: k.miss || '', until: 2 };
      g.pat = -1; kickoffTo(g, 1 - off);
    } else if (k.type === 'punt') {
      g.poss = 1 - off; g.losZ = zOf(g.poss, k.newP); g.ballX = 0; setFirstDown(g);
      g.msg = k.result === 'touchback' ? { text: 'TOUCHBACK', sub: `${k.yds} yd punt`, until: 2 } : { text: k.shank ? 'SHANKED PUNT' : k.result === 'oob' ? 'PUNT OUT OF BOUNDS' : 'PUNT', sub: `${k.yds} yards`, until: 2 };
      sudden(g);
    } else if (k.good) {
      score(g, off, 3); mom(g, off, 7); highlight(g, 'FIELD GOAL', `${k.dist} yards`, off);
      g.msg = { text: 'IT’S GOOD!', sub: `${k.dist} yd field goal`, until: 2.6, big: true };
      g.events.push('score');
      kickoffTo(g, 1 - off);
      g.deadDur = 2.8;
    } else {
      g.msg = { text: 'NO GOOD', sub: `${k.dist} yd attempt${k.miss ? ' · ' + k.miss : ''}`, until: 2.2 };
      g.poss = 1 - off; g.ballX = 0; setFirstDown(g);
      sudden(g);
    }
  }
}

function score(g, team, pts) {
  g.score[team] += pts; g.acPts = (g.acPts || 0) + pts;
  if (g.quarter >= 5) { g.otScored = true; }
}
function sudden(g) { /* placeholder for possession change hooks */ }

function kickoffTo(g, team) {
  g.poss = team; g.losZ = zOf(team, 25); g.ballX = 0; setFirstDown(g);
}

// ---------------- main step ----------------
// ---------------- anti-cheat ----------------
// The game watches itself. Nothing a skilled player does can trip these, because every legit move goes through the
// same physics: players can't move faster than their top speed allows, scores only change through scoring plays,
// ratings can't change mid-game and input can't be stronger than a full stick. Tampering with the code or memory can.
function rosterSig(g) {
  let h = 0;
  for (const t of [0, 1]) { const r = rosterFor(g, t).players; for (const k of Object.keys(r).sort()) { const q = r[k]; for (const f of RKEYS) h = (Math.imul(h ^ (q[f] | 0), 16777619) + 7) >>> 0; } }
  return h;
}
function acFlag(g, why) { if (!g.ac) g.ac = { n: 0, why: '' }; g.ac.n++; if (!g.ac.why) g.ac.why = why; }
const cleanInput = i => { if (!i) return i; const mx = +i.mx || 0, mz = +i.mz || 0, l = Math.hypot(mx, mz); if (!Number.isFinite(l)) return { ...i, mx: 0, mz: 0 }; if (l > 1.001) return { ...i, mx: mx / l, mz: mz / l }; return i; };
export function step(g, dt, inputs = [{}, {}]) {
  if (g.phase === 'gameover') return;
  if (!g.ac) { g.ac = { n: 0, why: '' }; g.acPts = g.score[0] + g.score[1]; g.acSig = rosterSig(g); }
  dt = Math.min(Math.max(+dt || 0, 0), 0.1);
  inputs = [cleanInput(inputs[0]), cleanInput(inputs[1])];
  const pid = g.playId, ph = g.phase, before = g.players.map(p => [p.x, p.z]);
  const scoreOk = () => { if (g.score[0] + g.score[1] !== g.acPts) { acFlag(g, 'score changed outside a scoring play'); g.acPts = g.score[0] + g.score[1]; } };
  scoreOk();
  if (g.phase === 'live' && g.acPid === pid) for (const p of g.players) if (p.acX !== undefined && Math.hypot(p.x - p.acX, p.z - p.acZ) > 0.05) { acFlag(g, 'player moved between frames'); break; }
  stepInner(g, dt, inputs);
  scoreOk();
  for (const p of g.players) { p.acX = p.x; p.acZ = p.z; }
  g.acPid = g.playId;
  if (ph === 'live' && g.phase === 'live' && g.playId === pid) {
    for (let i = 0; i < g.players.length; i++) {
      const p = g.players[i], b = before[i]; if (!b) continue;
      const moved = Math.hypot(p.x - b[0], p.z - b[1]), lim = (p.max || 8) * 3 * dt + 1.0;
      if (moved > lim) { acFlag(g, 'player teleported'); break; }
      if (p.max0 && p.max > p.max0 * 1.06) { acFlag(g, 'player speed was changed'); break; }
    }
  }
  if (g.playId !== pid && g.acSig && rosterSig(g) !== g.acSig) { acFlag(g, 'ratings changed mid-game'); g.acSig = rosterSig(g); }
}
function stepInner(g, dt, inputs) {
  if (g.phase === 'gameover') return;
  g.t += dt; g.phaseT += dt; g.timeoutCd = Math.max(0, (g.timeoutCd || 0) - dt);
  if (g.msg && (g.msg.until -= dt) <= 0) g.msg = null;
  if (g.flash && (g.flash.until -= dt) <= 0) g.flash = null;
  for (let t = 0; t < 2; t++) {
    if (!g.opts.humans[t]) continue;
    const evs = inputs[t] && inputs[t].ev;
    if (evs) for (const ev of evs) handleEvent(g, t, ev);
  }
  if (g.phase === 'half') {
    if (g.phaseT >= g.opts.halftime || (g.halfReady[0] && g.halfReady[1] && g.phaseT > 1.5)) {
      g.phase = 'presnap'; g.phaseT = 0; setupPlay(g);
      g.msg = { text: 'SECOND HALF', sub: TEAMS[g.opts.teams[g.poss]].name + ' ball', until: 2.2 };
    }
    return;
  }
  if (g.phase === 'presnap') return updatePresnap(g, dt, inputs);
  if (g.phase === 'kickset') return updateKickSet(g, dt, inputs);
  if (g.phase === 'live') return updateLive(g, dt, inputs);
  if (g.phase === 'kick') return updateKick(g, dt);
  if (g.phase === 'dead') {
    if (g.flagNote && g.msg) { g.msg.sub = (g.msg.sub ? g.msg.sub + ' · ' : '') + g.flagNote; g.flagNote = null; }
    for (const p of g.players) { p.vx *= Math.max(0, 1 - dt * 4); p.vz *= Math.max(0, 1 - dt * 4); p.x += p.vx * dt; p.z += p.vz * dt; }
    separate(g, 1);
    if (g.ball.state === 'held' && g.players[g.ball.carrier]) { const c = g.players[g.ball.carrier]; g.ball.x = c.x; g.ball.z = c.z; }
    if (g.phaseT >= g.deadDur) nextPlay(g);
  }
}

function updatePresnap(g, dt, inputs) {
  if (!g.opts.practice) g.playClock -= dt;
  const off = g.poss, def = 1 - off;
  for (const p of g.players) {
    if (g.opts.humans[def] && g.ctrl[def] === p.id) continue;
    const dx = p.hx - p.x, dz = p.hz - p.z, l = hyp(dx, dz);
    if (l > 0.05) { const st = Math.min(l, 7 * dt); p.x += dx / l * st; p.z += dz / l * st; p.vx = dx / l * (l > 0.3 ? 5 : 0); p.vz = dz / l * (l > 0.3 ? 5 : 0); p.face = Math.atan2(dx, dz); }
    else { p.vx = 0; p.vz = 0; p.face = p.unit === 'off' ? (dirOf(off) > 0 ? 0 : Math.PI) : (dirOf(off) > 0 ? Math.PI : 0); }
  }
  separate(g, 1);
  // let defensive human shuffle a little pre-snap
  if (g.opts.humans[def]) {
    const me = g.players[g.ctrl[def]], inp = inputs[def] || {};
    if (me && (inp.mx || inp.mz)) {
      const d = dirOf(off);
      const home = { x: me.hx, z: me.hz };
      me.x = clamp(me.x + (inp.mx || 0) * 3 * dt, home.x - 4, home.x + 4);
      const nz = me.z + (inp.mz || 0) * 3 * dt;
      // keep on defensive side of the ball
      me.z = nz;
      if ((me.z - g.losZ) * d < 0.25 && g.pat < 0 && !g.opts.practice) return presnapFoul(g, 'offside', me);   // you jumped across the line
      if ((me.z - g.losZ) * d < 0.25) me.z = g.losZ + 0.25 * d;
    }
  }
  if (!g.opts.humans[off]) {
    if (!g.offPlay) cpuCallOffense(g);
    const humanDef = g.opts.humans[def];
    const ready = !humanDef ? g.phaseT > 2.0 : (g.defChosen ? g.phaseT > g.cpuSnapAt : g.phaseT > 13);
    if (humanDef && !g.cadence && g.phaseT > g.cpuSnapAt - 1.4 && g.defChosen) { g.cadence = 1; g.events.push('cadence'); }
    if (ready || g.playClock <= 0) snap(g);
  } else if (g.playClock <= 0) {
    if (g.pat < 0 && g.phaseT > 3) return presnapFoul(g, 'dog', null);
    if (!g.offPlay) { g.offPlay = g.pat === off ? 'xp' : 'dive'; alignOffense(g); }
    snap(g);
  }
}

function cpuTimeout(g) {
  for (let t = 0; t < 2; t++) {
    if (g.opts.humans[t] || g.to[t] <= 0 || g.opts.practice || g.opts.drill) continue;
    const late = (g.quarter === 2 || g.quarter >= 4) && g.clock < 50 && g.clock > 3 && g.runoff > 0;
    if (late && g.poss === t && g.score[t] <= g.score[1 - t]) { g.to[t]--; g.runoff = 0; g.msg = { text: 'TIMEOUT', sub: `${TEAMS[g.opts.teams[t]].name} · ${g.to[t]} left`, until: 2 }; return; }
  }
}
function nextPlay(g) {
  cpuTimeout(g);
  g.lastRunoff = Math.min(g.runoff || 0, g.clock);
  if (g.opts.practice) {
    const side = g.opts.practice === 'def' ? 1 : 0;
    g.clock = g.opts.quarterLen; g.runoff = 0; g.pat = -1; g.score = [0, 0]; g.acPts = 0;
    if (g.opts.practice === 'st') {
      // special teams: a fresh kick every rep, field goals from 20 to 55 yards or a punt from deep
      g.stkN = (g.stkN || 0) + 1;
      const punt = g.stkN % 3 === 0, spot = punt ? 15 + g.rng() * 30 : 100 - (3 + g.rng() * 35);
      g.poss = 0; g.losZ = zOf(0, spot); g.ballX = Math.round((g.rng() - 0.5) * 14); setFirstDown(g); g.down = 4;
      g.phase = 'presnap'; g.phaseT = 0; setupPlay(g);
      g.offPlay = punt ? 'punt' : 'fg'; alignOffense(g, true);
      return;
    }
    const p = prog(side, g.losZ);
    if (g.poss !== side || p >= 99 || p <= 1 || g.down > 4 || g.pracReset) { g.pracReset = false; g.poss = side; g.losZ = zOf(side, g.opts.pspot || 25); g.ballX = 0; setFirstDown(g); }
    g.phase = 'presnap'; g.phaseT = 0; setupPlay(g); return;
  }
  if (g.opts.drill) {
    if (g.runoff) { g.clock = Math.max(0, g.clock - Math.min(g.runoff, 6)); g.runoff = 0; }
    if (g.clock <= 0 && g.pat < 0) return endGame(g);
    if (g.poss !== 0 && g.pat < 0) { g.poss = 0; g.losZ = zOf(0, 25); g.ballX = 0; setFirstDown(g); }
    g.phase = 'presnap'; g.phaseT = 0; setupPlay(g); return;
  }
  if (g.runoff) { g.clock = Math.max(0, g.clock - g.runoff); g.runoff = 0; }
  if (g.otScored) return endGame(g);
  if (g.clock <= 0 && g.pat < 0) {
    const q = g.quarter;
    if (q === 2) {
      g.quarter = 3; g.clock = g.opts.quarterLen; g.to = [3, 3];
      kickoffTo(g, 1 - g.firstReceiver);
      if (g.opts.halftime > 0) {
        g.phase = 'half'; g.phaseT = 0; g.halfReady = [!g.opts.humans[0], !g.opts.humans[1]];
        g.msg = null; g.events.push('half');
        return;
      }
      g.msg = { text: 'HALFTIME', sub: `${TEAMS[g.opts.teams[0]].abbr} ${g.score[0]} - ${g.score[1]} ${TEAMS[g.opts.teams[1]].abbr}`, until: 2.5 };
    } else if (q === 4 || q >= 5) {
      if (q === 4 && g.score[0] === g.score[1]) {
        g.quarter = 5; g.clock = g.opts.quarterLen;
        kickoffTo(g, g.rng() < 0.5 ? 0 : 1);
        g.msg = { text: 'OVERTIME', sub: 'Next score wins', until: 2.5 };
      } else return endGame(g);
    } else {
      g.quarter = q + 1; g.clock = g.opts.quarterLen;
      g.msg = { text: `END OF Q${q}`, sub: '', until: 1.8 };
    }
  }
  g.phase = 'presnap'; g.phaseT = 0;
  setupPlay(g);
}

function endGame(g) {
  g.phase = 'gameover'; g.phaseT = 0;
  g.winner = g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : -1;
  g.msg = { text: 'FINAL', sub: '', until: 99999 };
  g.events.push('final');
}

// ---------------- live play ----------------
function updateLive(g, dt, inputs) {
  g._dt = dt;
  { const P = g.play;
    if (P && P.thrown && !P.flag && !P.isPat && g.t - P.throwT < 1.0) {
      const qb = g.players[0], dt2 = g.ctrl[1 - P.off];
      const me = dt2 >= 0 ? g.players[dt2] : null;
      if (me && g.opts.humans[me.team] && me.dive > 0 && dist(me, qb) < 1.1 && g.t - P.throwT > 0.2) throwFlag(g, 'rough', me, qb.z);
    }
    if (P && !P.flag && !P.isPat && P.holdT && g.phaseT >= P.holdT) {
      P.holdT = 0;
      const ol = g.players.filter(p => p.team === P.off && isLine(p.role) && p.blockOn >= 0);
      if (ol.length && !g.opts.humans[P.off] && P.holdRoll < 0.035 * FOUL_RATE) throwFlag(g, 'hold', ol[(g.rng() * ol.length) | 0]);
      else if (!g.opts.humans[1 - P.off] && P.holdRoll > 1 - 0.012 * FOUL_RATE) { const cb = g.players.find(p => p.team !== P.off && (p.role === 'CB1' || p.role === 'CB2') && p.dmode === 'man'); if (cb && P.type === 'pass' && !P.thrown) throwFlag(g, 'dhold', cb); }
    }
  }
  const P = g.play, b = g.ball, cfg = g.cfg;
  const tl = g.phaseT;
  // timers
  for (const p of g.players) {
    p.stun = Math.max(0, p.stun - dt); p.juke = Math.max(0, p.juke - dt); p.jukeCd = Math.max(0, p.jukeCd - dt);
    p.tackleCd = Math.max(0, p.tackleCd - dt); p.shedCd = Math.max(0, p.shedCd - dt);
    if (p.dive > 0) { p.dive -= dt; if (p.dive <= 0) { p.stun = 0.75; p.fallen = 0.75; } }
    if (p.fallen > 0 && p.stun <= 0) p.fallen = 0;
    p.spin = Math.max(0, p.spin - dt); p.stiff = Math.max(0, p.stiff - dt); p.hurdle = Math.max(0, p.hurdle - dt);
    p.moveCd = Math.max(0, p.moveCd - dt); p.playBall = Math.max(0, p.playBall - dt); if (p.press) p.press = Math.max(0, p.press - dt);
  }
  const pd = P.playDef || {};
  // run play: handoff / pitch
  if (P.type === 'run' && pd.qbRun && !P.handed) P.handed = true;
  if (P.type === 'run' && !P.handed && b.state === 'held' && b.carrier === 0) {
    const rb = byRole(g, 'RB'), qb = g.players[0];
    if (pd.pitch && tl > pd.pitch) {
      P.handed = true;
      const L = leadPoint(qb, rb, 14);
      launchBall(g, L.x, L.z, L.T, 0.5, rb.id, true);
      b.x = qb.x; b.z = qb.z; b.y = 1.2;
      g.events.push('pitch');
    } else if (pd.hand !== undefined && (tl > pd.hand + 0.45 || (tl > pd.hand * 0.6 && dist(rb, qb) < 2.0))) {
      P.handed = true; b.carrier = rb.id;
      if (g.opts.humans[P.off]) g.ctrl[P.off] = rb.id;
      g.events.push('handoff');
    }
  }
  if (!P.recognized) {
    const rt = P.type === 'run' ? (pd.hand || pd.pitch || 0) + 0.55 + cfg.react * 1.3 : 99;
    if (tl > rt || P.crossed || (b.state === 'held' && b.carrier !== 0 && b.carrier !== -1 && P.thrown)) P.recognized = true;
  }

  const carrier = b.state === 'held' ? g.players[b.carrier] : null;
  const pocket = P.type === 'pass' && !P.thrown && !P.crossed && carrier && carrier.id === 0;
  const airPass = b.state === 'air' && !b.auto;

  // AI QB decision
  if (pocket && !g.opts.humans[P.off]) aiQB(g, tl);

  // desired velocities
  let diveDone = null;
  for (const p of g.players) {
    if (p.cdive > 0) {   // committed to the dive: no steering, he flies forward and slows as he hits the turf
      p.cdive -= dt; const k = Math.max(0, 1 - dt * 1.5); p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.cdive <= 0) diveDone = p;
      continue;
    }
    const human = g.opts.humans[p.team] && g.ctrl[p.team] === p.id;
    const inp = human ? (inputs[p.team] || {}) : null;
    let want; // {x,z,s} direction * speedFactor
    const idle = !inp || (Math.abs(inp.mx || 0) + Math.abs(inp.mz || 0) < 0.12);
    const tracking = airPass && p.id === b.target && p.team === P.off;
    if (human && !tracking && !(idle && assistIdle(g, p, carrier))) {
      let mx = inp.mx || 0, mz = inp.mz || 0;
      if (p.id === 0 && pocket && tl < (pd.pa ? pd.pa + 0.1 : 0.5)) { want = qbPocketMove(g, p); }
      else if (P.type === 'run' && p.id === 0 && !P.handed) { want = aiMove(g, p, carrier, pocket, airPass, tl); }
      else {
        const l = hyp(mx, mz); if (l > 1) { mx /= l; mz /= l; }
        const canSprint = inp.sprint && p.stam > 0.05;
        if (canSprint && l > 0.1) p.stam = Math.max(0, p.stam - dt * 0.24); else p.stam = Math.min(1, p.stam + dt * 0.13);
        const s = canSprint ? 1 : 0.8;
        want = { x: mx, z: mz, s };
        if (carrier && carrier.team !== p.team && g.phase === 'live' && !(inp.mx === 0 && inp.mz === 0)) {
          const dx = carrier.x + carrier.vx * 0.2 - p.x, dz = carrier.z + carrier.vz * 0.2 - p.z, l = hyp(dx, dz);
          if (l < 4.5 && l > 0.01 && (dx * mx + dz * mz) / l > 0.1) {   // only if you're already heading roughly at him
            const pull = 0.55 * (1 - l / 4.5);
            const nx = mx * (1 - pull) + dx / l * pull, nz = mz * (1 - pull) + dz / l * pull, nl = hyp(nx, nz) || 1;
            want = { x: nx / nl, z: nz / nl, s };
          }
        }
      }
    } else {
      want = aiMove(g, p, carrier, pocket, airPass, tl);
      p.stam = Math.min(1, p.stam + dt * 0.13);
    }
    applyMove(g, p, want, dt);
  }

  updateBlocks(g, dt, pocket);
  separate(g);
  if (diveDone && g.ball.state === 'held' && g.ball.carrier === diveDone.id) {
    const c = diveDone;
    if (prog(c.team, c.z) >= 100) return touchdown(g, c);
    c.fallen = 2; g.msgNote = 'dives forward';
    return endPlay(g, 'tackle', c, null);
  }

  // ball
  if (b.state === 'held') {
    const c = g.players[b.carrier];
    b.x = c.x + Math.sin(c.face) * 0.35; b.z = c.z + Math.cos(c.face) * 0.35; b.y = 1.15;
  } else if (b.state === 'air') {
    b.t += dt;
    const s = Math.min(1, b.t / b.T);
    b.x = b.fx + (b.tx - b.fx) * s; b.z = b.fz + (b.tz - b.fz) * s;
    b.y = b.fy + (1.3 - b.fy) * s + 4 * b.h * s * (1 - s);
    // the ball gets to somebody before its landing spot: resolve it right there instead of flying through him
    if (!b.auto && s > 0.35 && s < 1 && b.y < 2.9) {
      for (const p of g.players) {
        if (p.stun > 0 && p.dive <= 0) continue;
        const reachable = p.team === g.play.off ? RECEIVERS.includes(p.role) : true;
        if (reachable && hyp(p.x - b.x, p.z - b.z) < (p.playBall > 0 ? 1.0 : 0.75)) { b.tx = b.x; b.tz = b.z; resolveBall(g); break; }
      }
      if (b.state !== 'air' || g.phase !== 'live') return;
    }
    if (s >= 1) resolveBall(g);
    if (g.phase !== 'live') return;
  }

  // QB crosses line?
  const c2 = g.ball.state === 'held' ? g.players[g.ball.carrier] : null;
  if (c2 && c2.id === 0 && !P.thrown && !P.crossed) {
    if ((c2.z - P.los) * dirOf(P.off) > 0.4) { P.crossed = true; P.recognized = true; }
  }

  // tackles / boundaries / scoring
  if (c2) {
    const ct = c2.team;
    if (prog(ct, c2.z) >= 100) return touchdown(g, c2);
    if (Math.abs(c2.x) > HALF_W) return endPlay(g, 'oob', c2);
    if (prog(ct, c2.z) < -9.5) return endPlay(g, 'oob', c2);
    for (const d of g.players) {
      if (d.team === ct || d.stun > 0 || d.tackleCd > 0 || d.fallen > 0) continue;
      if (d.engagedBy >= 0 && dist(d, c2) > 0.55) continue;
      const vsCpu = g.opts.humans[d.team] && !g.opts.humans[ct];
      const tr = (d.dive > 0 ? 2.1 : 1.12) * (0.5 + 0.5 * (d.size + c2.size) / 2) * (vsCpu ? 1.38 : 1);
      if (dist(d, c2) < tr) {
        const humanCarrier = g.opts.humans[ct] && g.ctrl[ct] === c2.id;
        let brk = c2.role === 'RB' ? cfg.brk + 0.12 : c2.role === 'TE' ? cfg.brk + 0.08 : cfg.brk;
        // a runner at full speed is harder to bring down head on, an arm tackle from behind is easy to shake
        { const sp = hyp(c2.vx, c2.vz) / (c2.max || 7); if (sp > 0.75) brk += 0.06; if (d.engagedBy >= 0) brk += 0.25; if (!c2.contacted && sp > 0.6 && c2.role === 'RB') brk += 0.1; c2.contacted = true; if (sp < 0.35) brk -= 0.3; }   // no momentum, no breaking tackles
        if (c2.juke > 0) brk = Math.max(brk, humanCarrier ? 0.6 : 0.42);
        if (c2.spin > 0) brk = Math.max(brk, humanCarrier ? 0.55 : 0.4);
        if (c2.stiff > 0) {
          const fx = Math.sin(c2.face), fz = Math.cos(c2.face), ax = d.x - c2.x, az = d.z - c2.z, al = hyp(ax, az) || 1;
          if ((fx * ax + fz * az) / al > -0.2) brk = Math.max(brk, 0.3 + (c2.size - 0.95) * 1.2 + c2.rt.elu * 0.0025);
        }
        if (c2.hurdle > 0) brk = Math.max(brk, d.dive > 0 ? 0.8 : 0.22);
        if (c2.role === 'QB' && !P.thrown && !P.crossed) brk *= 0.6;
        if (d.dive > 0 && c2.hurdle <= 0) brk *= 0.75;
        brk *= (1.5 - d.rt.tkl / 100) * (0.6 + c2.rt.elu / 100 * 0.6);
        if (vsCpu) brk *= g.ctrl[d.team] === d.id ? 0.45 : 0.65;
        // skill, not luck: the carrier breaks it when his move is timed into the hit (or the tackler is tied up),
        // with only a sliver of randomness on top
        if (brk + (g.rng() - 0.5) * 0.24 > 0.36) {
          d.stun = 0.85; d.fallen = 0.85; d.tackleCd = 1.2; d.dive = 0;
          c2.vx *= 0.6; c2.vz *= 0.6;
          g.events.push('brokentackle'); mom(g, ct, 3);
          g.flash = { text: 'BROKEN TACKLE', until: 1.0 };
        } else {
          c2.fallen = 3; d.fallen = 3; d.wrapAt = g.t; c2.hitAt = g.t;
          { const fx = Math.sin(c2.face), fz = Math.cos(c2.face); c2.fallBack = ((d.x - c2.x) * fx + (d.z - c2.z) * fz) > 0.2 ? 1 : 0; }
          // tackler wraps up: drive him into the carrier
          const ux = c2.x - d.x, uz = c2.z - d.z, ul = hyp(ux, uz) || 1;
          d.vx = ux / ul * 3 + c2.vx * 0.5; d.vz = uz / ul * 3 + c2.vz * 0.5; d.face = Math.atan2(ux, uz);
          c2.face = Math.atan2(c2.vx || ux, c2.vz || uz);
          g.events.push(c2.vx * c2.vx + c2.vz * c2.vz > 30 ? 'bighit' : 'tackle');
          // forward progress: a runner going downhill falls forward, more if he's hit from the side or behind
          { const dd = dirOf(ct), vf = c2.vz * dd, front = ((d.z - c2.z) * dd) > 0.3;
            const sack = c2.id === 0 && !P.thrown && !P.crossed;
            if (vf > 1 && !sack) { const fall = clamp(vf * 0.2, 0, 1.7) * (front ? 0.55 : 1) * (0.8 + c2.size * 0.25); c2.z = zOf(ct, Math.min(99.4, prog(ct, c2.z) + fall)); } }
          return endPlay(g, 'tackle', c2, d);
        }
      }
    }
  }
  if (!P.isPat && !g.opts.practice) g.clock = Math.max(0, g.clock - dt);
}

function assistIdle(g, p, carrier) {
  // AI takes over an idle human-controlled player when they don't have the ball (prevents frozen defenders/receivers)
  if (carrier && carrier.id === p.id) return false;
  if (p.id === 0 && carrier && carrier.id === 0) return false;
  return true;
}

function seek(p, tx, tz, s, arrive = 1.2) {
  const dx = tx - p.x, dz = tz - p.z, l = hyp(dx, dz);
  if (l < 0.15) return { x: 0, z: 0, s: 0 };
  const k = l < arrive ? l / arrive : 1;
  return { x: dx / l, z: dz / l, s: s * k };
}

function applyMove(g, p, w, dt) {
  if (p.dive > 0) { p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; return; }
  if (p.stun > 0) { p.vx *= Math.max(0, 1 - dt * 6); p.vz *= Math.max(0, 1 - dt * 6); p.x += p.vx * dt; p.z += p.vz * dt; return; }
  let spd = p.max * (w.s || 0);
  if (p.engagedBy >= 0) spd *= 0.14;
  if (p.blockOn >= 0) { const t = g.players[p.blockOn]; if (t && t.engagedBy === p.id) spd *= 0.55; }
  if (p.juke > 0) spd *= 1.05;
  if (p.secureT > 0) { spd *= 0.6; p.secureT -= g._dt || 1 / 60; }
  if (p.spin > 0) spd *= 0.82;
  if (p.hurdle > 0) spd *= 0.95;
  if (p.unit === 'off' && RECEIVERS.includes(p.role)) {
    for (const q of g.players) if (q.press > 0 && q.assign === p.id && dist(q, p) < 1.7) { spd *= 0.45; break; }
  }
  if (p.playBall > 0 && p.unit === 'def') spd *= 1.04;
  const tvx = (w.x || 0) * spd, tvz = (w.z || 0) * spd;
  const acc = (p.size > 1.15 ? 13 : 20) * dt * (p.juke > 0 ? 0.3 : 1) * (p.spin > 0 ? 0.6 : 1);
  let dvx = tvx - p.vx, dvz = tvz - p.vz; const dl = hyp(dvx, dvz);
  if (dl > acc) { dvx *= acc / dl; dvz *= acc / dl; }
  p.vx += dvx; p.vz += dvz;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const sp = hyp(p.vx, p.vz);
  if (sp > 0.6) {
    const target = Math.atan2(p.vx, p.vz);
    let da = target - p.face; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    p.face += da * Math.min(1, dt * 11);
  }
}

// keep bodies from overlapping. A few relaxation passes so a crowd settles instead of sinking into each other.
// Ball carrier vs defenders keep a tighter gap (they still need to get close enough to tackle).
function separate(g, iters = 3) {
  const ps = g.players, carrier = g.ball.state === 'held' ? g.ball.carrier : -1;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.fallen > 0 && b.fallen > 0) continue;
      let k = 1;
      if (a.team === b.team && (a.role === 'QB' || b.role === 'QB') && (a.role === 'RB' || b.role === 'RB' || a.role === 'C' || b.role === 'C')) k = g.phaseT < 1.6 || g.phase !== 'live' ? 0.62 : 1;
      if (a.team !== b.team && (carrier === a.id || carrier === b.id)) k = 0.7;
      else if (a.engagedBy === b.id || b.engagedBy === a.id) k = 0.82;
      if (a.fallen > 0 || b.fallen > 0) k *= 0.55;   // step over / around guys on the ground
      const dx = b.x - a.x, dz = b.z - a.z, m = R * (a.size + b.size) * k;
      if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
      let d = hyp(dx, dz);
      if (d >= m) continue;
      let nx, nz;
      if (d < 1e-4) { const an = (i * 2.39996 + j) % (Math.PI * 2); nx = Math.cos(an); nz = Math.sin(an); d = 0; } else { nx = dx / d; nz = dz / d; }
      const push = m - d;
      // heavier / grounded players move less
      let wa = b.size / (a.size + b.size), wb = a.size / (a.size + b.size);
      if (a.fallen > 0) { wa = 0; wb = 1; } else if (b.fallen > 0) { wa = 1; wb = 0; }
      a.x -= nx * push * wa; a.z -= nz * push * wa;
      b.x += nx * push * wb; b.z += nz * push * wb;
      // kill the part of the velocity that drives them into each other
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) { a.vx += nx * rv * wa; a.vz += nz * rv * wa; b.vx -= nx * rv * wb; b.vz -= nz * rv * wb; }
    }
  }
  for (const p of ps) { p.x = clamp(p.x, -HALF_W - 6, HALF_W + 6); }
}

function updateBlocks(g, dt, pocket) {
  const cfg = g.cfg;
  for (const bl of g.players) {
    if (bl.blockOn < 0 || bl.stun > 0) continue;
    const t = g.players[bl.blockOn];
    if (!t || t.shedCd > 0 || (g.ball.state === 'held' && g.ball.carrier === t.id)) { bl.blockOn = -1; continue; }
    if (t.engagedBy < 0 && dist(bl, t) < R * (bl.size + t.size) + 0.25) t.engagedBy = bl.id;   // big men touch at a bigger distance
  }
  for (const t of g.players) {
    if (t.engagedBy < 0) continue;
    const bl = g.players[t.engagedBy];
    if (!bl || dist(bl, t) > 1.9 || bl.stun > 0 || bl.blockOn !== t.id) { t.engagedBy = -1; continue; }
    if (g.play && g.play.type === 'run' && g.play.handed !== undefined) {
      // drive block: on runs the blocker moves his man off the ball, which is what opens the hole
      const dd = dirOf(g.play.off), push = clamp(0.8 + (bl.rt.blk - Math.max(t.rt.rush, t.rt.tkl)) / 35, 0.15, 1.5) * dt;
      t.z += dd * push; bl.z += dd * push * 0.9;
    }
    const line = t.role.startsWith('DL') && g.phaseT < 2.6;
    const shed = g.opts.humans[t.team] && !g.opts.humans[1 - t.team] ? Math.max(cfg.shed, 0.17) : cfg.shed;   // your rushers aren't nerfed by the CPU's difficulty
    let rate = (pocket || line) ? shed * (pocket ? 1.9 : 1.4) : shed * 2.2 + 0.3;
    rate *= (0.5 + Math.max(t.rt.rush, t.rt.tkl * 0.8) / 100) / (0.5 + bl.rt.blk / 100);
    if (g.play && g.play.type === 'run') rate *= 0.55;   // a drive block on a run is harder to shed than a pass set
    if (g.rng() < rate * dt) {
      t.engagedBy = -1; t.shedCd = 1.3; bl.stun = 0.4; bl.blockOn = -1;
      g.events.push('shed');
    }
  }
}

// ---------------- AI movement ----------------
function aiMove(g, p, carrier, pocket, airPass, tl) {
  const P = g.play, b = g.ball, cfg = g.cfg, ai = g.opts.humans[p.team] && !g.opts.humans[1 - p.team] ? 0.99 : cfg.ai;
  const isOff = p.team === P.off;
  const d = dirOf(P.off);
  const qb = g.players[0];

  // ball carrier AI
  if (carrier && carrier.id === p.id) {
    if (p.id === 0 && pocket) return qbPocketMove(g, p);
    if (P.type === 'run' && p.route && p.ri < p.route.length && !P.turnover) {
      const w = routeMove(g, p);
      return { ...w, s: ai };
    }
    return carrierSteer(g, p, ai);
  }

  // ball in the air on a pass
  if (airPass) {
    const since = g.t - P.throwT;
    if (p.id === b.target) {
      // he runs to where the ball should be, and only adjusts to a bad throw once he can read it
      const k = clamp((b.t / (b.T || 1) - 0.35) / 0.4, 0, 1), ix = b.ix ?? b.tx, iz = b.iz ?? b.tz;
      return seek(p, ix + (b.tx - ix) * k, iz + (b.tz - iz) * k, 1, 0.4);
    }
    if (!isOff) {
      const dl = hyp(p.x - b.tx, p.z - b.tz), mine = g.opts.humans[p.team] && !g.opts.humans[1 - p.team];
      const react = mine ? Math.min(cfg.react, 0.2) : cfg.react;
      if (since > react * 0.8 && (p.assign === b.target || dl < (mine ? 18 : 16))) return seek(p, b.tx, b.tz, Math.max(ai, 0.97) + 0.06, 0.3);   // break on the ball
      if (p.role.startsWith('DL')) return seek(p, b.tx, b.tz, 0.5);
    } else if (RECEIVERS.includes(p.role)) {
      // other receivers drift toward the ball late
      if (since > 0.6) return seek(p, b.tx, b.tz, 0.7, 2);
    }
  }

  // running play / pursuit mode
  const pursuit = carrier && !pocket && (carrier.id !== 0 || P.crossed) && P.recognized;
  if (carrier && !pocket && carrier.team === p.team) return blockFor(g, p, carrier);
  if (pursuit && carrier.team !== p.team) return pursue(g, p, carrier, ai);
  if (b.state === 'air' && b.auto && b.target >= 0 && !isOff && P.recognized) return pursue(g, p, g.players[b.target], ai);

  // pre-recognition / pocket behaviour
  if (isOff) {
    const pd = P.playDef || {};
    const isOL = isLine(p.role);
    if (isOL && pd.screen && tl > pd.screen) {
      // screen: linemen release and lead the way
      p.blockOn = -1;
      const rb = byRole(g, 'RB'), side = rb.x - P.bx;
      const t = { x: rb.x + Math.sign(side || 1) * -1.5 + (['LT', 'LG', 'C', 'RG', 'RT'].indexOf(p.role) - 2) * 2, z: P.los + 2.5 * d };
      return seek(p, t.x, t.z, 0.9);
    }
    if (isOL) return P.type === 'run' ? runBlock(g, p) : passBlock(g, p, qb);
    if (P.type === 'run' && p.role === 'TE') return runBlock(g, p);
    if (P.type === 'pass' && g.hot[p.role]) { if (!g.hot[p.role].length) return p.role === 'RB' || p.role === 'TE' ? passBlock(g, p, qb) : stalk(g, p); if (p.route) return { ...routeMove(g, p), s: ai + 0.04 }; }
    if (pd.block && pd.block.includes(p.role) && P.type === 'pass') {
      if (p.role === 'RB' || p.role === 'TE') { if (p.route && p.ri < p.route.length) return { ...routeMove(g, p), s: ai }; return passBlock(g, p, qb); }
      return stalk(g, p);
    }
    if (P.type === 'pass' && !p.route && p.role === 'TE') return passBlock(g, p, qb);
    if (P.type === 'pass' && !p.route && p.role === 'WR3') return stalk(g, p);
    if (pd.pa && P.type === 'pass' && p.role === 'RB' && tl < pd.pa) return { ...routeMove(g, p), s: ai * 0.9 };
    if (p.route) {
      if (P.type === 'run' && p.role !== 'RB') return stalk(g, p);
      return { ...routeMove(g, p), s: ai + 0.04 };
    }
    if (p.id === 0 && P.type === 'run' && !P.handed) {
      const pd = P.playDef || {};
      if (pd.qbDrop !== undefined && tl < (pd.hand || 1) - 0.25) { const t = rel(g, 0, pd.qbDrop); return seek(p, t.x, t.z, 0.6); }
      const rb = byRole(g, 'RB');
      const hx = p.hx + (rb.x - p.hx) * 0.35, hz = p.hz + (rb.z - p.hz) * 0.35;
      return seek(p, hx, hz, 0.5, 0.4);   // open up toward the back (mesh point)
    }
    if (P.type === 'run' && p.role !== 'RB') return stalk(g, p);
    if (p.id === 0) return { x: 0, z: 0, s: 0 };
    return { x: 0, z: 0, s: 0 };
  }
  // defense
  const mode = p.dmode || (p.role.startsWith('DL') ? 'rush' : 'zone');
  const pdx = P.playDef || {};
  if (mode === 'rush') {
    const tgt = (P.type === 'run' && !P.recognized && (pdx.hand || 0) > 0.7) ? qb : (carrier || qb);   // draws fool the pass rush
    let w = seek(p, tgt.x, tgt.z, ai + (p.role.startsWith('DL') ? 0 : 0.05));
    if (p.engagedBy >= 0) {
      const side = (p.id % 2 ? 1 : -1);
      w = { x: w.x * 0.5 + -w.z * side * 0.6, z: w.z * 0.5 + w.x * side * 0.6, s: w.s };
    }
    return w;
  }
  // play action: second-level defenders bite on the fake
  if (pdx.pa && !P.recognized && tl < pdx.pa + g.cfg.react * 0.8 && (isLB(p.role) || isSafety(p.role)) && mode !== 'man') {
    return seek(p, p.x * 0.7 + qb.x * 0.3, P.los + 2.5 * d, 0.6);
  }
  if (mode === 'zone' && !P.recognized) return zoneMove(g, p, ai);
  if (mode === 'man' && p.assign >= 0 && !P.recognized) return manMove(g, p, g.players[p.assign], ai);
  if (mode === 'spy' && !P.recognized) return seek(p, qb.x, P.los + 4 * d, 0.8);
  if (mode === 'deep' && !P.recognized) {
    let deep = null, dd = -1e9;
    for (const r of g.players) if (r.team === P.off && RECEIVERS.includes(r.role)) { const dep = (r.z - P.los) * d; if (dep > dd) { dd = dep; deep = r; } }
    const t = rel(g, 0, 14);
    const tx = deep ? (t.x * 0.5 + deep.x * 0.5) : t.x;
    const tz = P.los + Math.max(13, dd + 6) * d;
    return seek(p, tx, tz, ai);
  }
  const tgt = carrier || (b.state === 'air' ? { x: b.tx, z: b.tz } : qb);
  return seek(p, tgt.x, tgt.z, ai);
}

function routeMove(g, p) {
  const P = g.play, d = dirOf(P.off);
  const r = p.route;
  while (p.ri < r.length) {
    const w = r[p.ri];
    const tx = clamp(P.bx - w[0] * d, -HALF_W + 1, HALF_W - 1), tz = P.los + w[1] * d;
    const dx = tx - p.x, dz = tz - p.z, l = hyp(dx, dz);
    if (l < 0.9) {
      p.ri++;
      if (w[2] === 'stop' && p.ri >= r.length) { p.rstop = true; break; }
      continue;
    }
    p.ldx = dx / l; p.ldz = dz / l;
    return { x: dx / l, z: dz / l, s: 1 };
  }
  if (p.rstop) {
    // sit in the window, drift away from nearest defender a bit
    let nd = null, best = 1e9;
    for (const q of g.players) if (q.team !== p.team) { const dd = dist(q, p); if (dd < best) { best = dd; nd = q; } }
    if (nd && best < 3) { const dx = p.x - nd.x, dz = p.z - nd.z, l = hyp(dx, dz) || 1; return { x: dx / l, z: dz / l, s: 0.35 }; }
    return { x: 0, z: 0, s: 0 };
  }
  let x = p.ldx, z = p.ldz;
  if (Math.abs(p.x) > HALF_W - 1.5 && Math.sign(x) === Math.sign(p.x)) x = 0;
  const l = hyp(x, z) || 1;
  return { x: x / l, z: z / l, s: 1 };
}

function qbPocketMove(g, qb) {
  const P = g.play, pd = P.playDef || {};
  const t = g.phaseT;
  if (pd.pa && t < pd.pa) { const f = rel(g, 0.7, -3.2); return seek(qb, f.x, f.z, 0.7); }  // fake handoff
  if (qb.route && qb.ri < qb.route.length) return { ...routeMove(g, qb), s: 0.75 };          // bootleg
  const drop = rel(g, 0, pd.drop || -7);
  if (t < (pd.pa || 0) + 0.9) return seek(qb, drop.x, drop.z, 0.8);
  let nr = null, nd = 1e9;
  for (const d of g.players) if (d.team !== qb.team && d.engagedBy < 0) { const dd = dist(d, qb); if (dd < nd) { nd = dd; nr = d; } }
  if (nr && nd < 4.5) {
    const dx = qb.x - nr.x, dz = qb.z - nr.z, l = hyp(dx, dz) || 1;
    return { x: dx / l, z: dz / l * 0.3, s: 0.6 };
  }
  return seek(qb, qb.route ? qb.x : drop.x, qb.route ? qb.z : drop.z, 0.5);
}

function aiQB(g, tl) {
  const P = g.play, qb = g.players[0], cfg = g.cfg;
  const pdq = P.playDef || {};
  if (tl < (pdq.pa ? pdq.pa + 0.3 : 0.8)) return;
  let pressure = 1e9;
  for (const d of g.players) if (d.team !== qb.team && d.engagedBy < 0) pressure = Math.min(pressure, dist(d, qb));
  let best = null, bs = -1e9;
  for (const role of RECEIVERS) {
    const r = byRole(g, role);
    const speed = (16 + Math.min(dist(qb, r), 40) * 0.17) * (0.86 + qb.rt.arm / 100 * 0.2);
    const L = leadPoint(qb, r, speed);
    if (Math.abs(L.x) > HALF_W - 0.5) continue;
    let sep = 1e9;
    for (const d of g.players) if (d.team !== qb.team) {
      const px = d.x + d.vx * L.T * 0.55, pz = d.z + d.vz * L.T * 0.55;
      sep = Math.min(sep, hyp(px - L.x, pz - L.z));
    }
    const gain = (L.z - P.los) * dirOf(P.off);
    // defenders close while the ball is in the air, so a long throw has to be a lot more open than it looks
    const sc = Math.min(sep - L.T * 1.6, 6) + gain * 0.05 - (gain < 0 ? 1 : 0) - L.T * 0.3 + (g.rng() - 0.5) * 0.5;
    if (sc > bs) { bs = sc; best = r; }
  }
  const urgent = pressure < 2.3;
  const want = tl > P.readT ? 2.2 : 3.4;
  // finish the drop before throwing: quick game is out fast, deep shots take a real five or seven step drop
  const minT = pdq.screen ? pdq.screen + 0.15 : pdq.cat === 'Quick' ? 1.2 : (pdq.drop || -7) <= -8 ? 2.3 : 1.85;
  if (best && ((tl > minT && bs > want) || (urgent && bs > 0.8 && tl > 0.9) || tl > 4.6)) {
    const vsHuman = g.opts.humans[1 - qb.team] && !g.opts.humans[qb.team];
    throwBall(g, qb, best, cfg.qbErr * (urgent ? 1.5 : 1) * (1.45 - qb.rt.acc / 100));
  } else if (urgent && tl > 1.2 && !P.scramble && g.rng() < 0.02) {
    P.scramble = true;
  }
}

function carrierSteer(g, p, s) {
  // runner's vision: look at a fan of lanes a few yards ahead and take the one with the most room,
  // treating defenders who are locked up on a block as mostly out of the play
  const d = dirOf(p.team);
  const segDist = (q, ax, az) => { const vx = ax - p.x, vz = az - p.z, L = vx * vx + vz * vz || 1; let t = ((q.x - p.x) * vx + (q.z - p.z) * vz) / L; t = clamp(t, 0, 1); return hyp(p.x + vx * t - q.x, p.z + vz * t - q.z); };
  let bx = p.x, bz = p.z + d * 4, bs = -1e9;
  for (let k = -5; k <= 5; k++) {
    const ax = clamp(p.x + k * 1.4, -HALF_W + 1.5, HALF_W - 1.5), az = p.z + d * (4 - Math.abs(k) * 0.25);
    let clear = 9;
    for (const q of g.players) {
      if (q === p || q.fallen > 0) continue;
      if (q.team === p.team) { if (q.blockOn < 0 || !isLine(q.role)) continue; const dd = segDist(q, ax, az) * 1.7; if (dd < clear) clear = dd; continue; }   // don't run up your own lineman's back
      if (q.stun > 0) continue;
      const dd = segDist(q, ax, az) * (q.engagedBy >= 0 ? 2.4 : 1);
      if (dd < clear) clear = dd;
    }
    const prevBias = p.laneX !== undefined ? -Math.abs(ax - p.laneX) * 0.08 : 0;
    const sc = clear - Math.abs(k) * 0.28 + prevBias;
    if (sc > bs) { bs = sc; bx = ax; bz = az; }
  }
  p.laneX = bx;
  let fx = bx - p.x, fz = bz - p.z;
  // no dancing in the backfield: if he's been stuck for a moment, he lowers his shoulder and goes north
  const slow = hyp(p.vx, p.vz) < 2.2;
  p.stall = slow ? (p.stall || 0) + (g._dt || 1 / 60) : Math.max(0, (p.stall || 0) - (g._dt || 1 / 60) * 2);
  if (p.stall > 0.5) { fx *= 0.15; fz = Math.abs(fz) * d + d * 2; }
  // last-second dodge: a defender right on top of him pushes him sideways
  for (const q of g.players) {
    if (q.team === p.team || q.stun > 0 || q.engagedBy >= 0) continue;
    const dx = p.x - q.x, dz = p.z - q.z, l = hyp(dx, dz);
    if (l < 1.8 && (q.z - p.z) * d > -0.5) { fx += (dx / (l || 1)) * (1.8 - l) * 2.2; }
  }
  if (p.x > HALF_W - 2.5) fx -= 2; if (p.x < -HALF_W + 2.5) fx += 2;
  if (fz * d < 0.4) fz = 0.4 * d;
  const l = hyp(fx, fz) || 1;
  if (p.jukeCd <= 0) {
    // CPU runners time their move into contact; shiftier backs do it more often
    for (const q of g.players) if (q.team !== p.team && q.stun <= 0 && q.engagedBy < 0 && dist(p, q) < 1.75 && ((q.x - p.x) * (q.vx - p.vx) + (q.z - p.z) * (q.vz - p.vz)) < 0 && g.rng() < 0.12 + p.rt.elu / 100 * 0.25) { p.juke = 0.35; p.jukeCd = 1.6; g.events.push('juke'); break; }
  }
  return { x: fx / l, z: fz / l, s: Math.min(1, s) };
}

// run blocking: linemen and the tight end fire off the ball and drive the man in front of them,
// anyone without a man climbs to the second level
function runBlock(g, p) {
  const d = dirOf(p.team);
  let t = p.blockOn >= 0 ? g.players[p.blockOn] : null;
  if (!t || t.shedCd > 0 || (t.engagedBy >= 0 && t.engagedBy !== p.id) || dist(p, t) > 9) {
    t = null; let bd = 1e9;
    for (const q of g.players) {
      if (q.team === p.team || q.shedCd > 0 || (q.engagedBy >= 0 && q.engagedBy !== p.id)) continue;
      if (g.players.some(o => o !== p && o.team === p.team && o.blockOn === q.id)) continue;
      const ahead = (q.z - p.z) * d;
      if (ahead < -1.5) continue;
      const dq = dist(p, q) + Math.abs(q.x - p.x) * 0.6; if (dq < bd && dq < 8) { bd = dq; t = q; }
    }
    p.blockOn = t ? t.id : -1;
  }
  if (!t) return seek(p, p.x, p.z + 3 * d, 0.8);
  return seek(p, t.x, t.z - 0.35 * d, 0.97, 0.2);
}

function pursue(g, p, c, s) {
  // solve for an intercept point: where can I meet him if he keeps going this way?
  let t = 0;
  for (let k = 0; k < 3; k++) { const tx = c.x + c.vx * t, tz = c.z + c.vz * t; t = Math.min(1.6, hyp(tx - p.x, tz - p.z) / (p.max + 0.1)); }
  const dc = dist(p, c);
  // rank among pursuers: the closest takes him head on, the rest fan out into lanes so he can't beat them all with one cut
  let rank = 0, side = 0;
  for (const q of g.players) if (q.team === p.team && q !== p && q.stun <= 0 && q.fallen <= 0 && dist(q, c) < dc) rank++;
  if (rank > 0) side = (p.x >= c.x ? 1 : -1);
  const lead = dc < 2.2 ? 0.25 : 1;
  const d = dirOf(c.team);
  const LW = (globalThis.EK_LANES ?? 0.35);
  const laneX = rank === 0 ? 0 : side * Math.min(2.5, 0.8 + rank * 0.5) * LW;     // inside / outside leverage
  const laneZ = rank === 0 ? 0 : d * Math.min(3, rank * 0.8) * LW;                 // later pursuers cut further downfield (the alley)
  const k = Math.min(1, Math.max(0, (dc - 2.5) / 6));                      // lanes collapse onto him as they close
  const tx = c.x + c.vx * t * lead + laneX * k, tz = c.z + c.vz * t * lead + laneZ * k;
  return seek(p, tx, tz, 1, 0.2);   // pursuit is full effort
}

function blockFor(g, p, carrier) {
  // find nearest pursuer not already blocked
  if (p.blockOn >= 0) {
    const t = g.players[p.blockOn];
    if (t && t.shedCd <= 0 && dist(p, t) < 9) {
      const dx = carrier.x - t.x, dz = carrier.z - t.z, l = hyp(dx, dz) || 1;
      return seek(p, t.x + dx / l * 0.8, t.z + dz / l * 0.8, 0.95, 0.2);
    }
    p.blockOn = -1;
  }
  let best = null, bd = 1e9;
  for (const q of g.players) {
    if (q.team === p.team || q.shedCd > 0 || q.stun > 0) continue;
    if (g.players.some(o => o !== p && o.blockOn === q.id)) continue;
    const dq = dist(p, q), dc = dist(q, carrier);
    if (dq < 10 && dc < 14 && dq + dc * 0.5 < bd) { bd = dq + dc * 0.5; best = q; }
  }
  if (best) { p.blockOn = best.id; return seek(p, best.x, best.z, 0.95, 0.2); }
  // run ahead of carrier
  const d = dirOf(carrier.team);
  return seek(p, carrier.x + (p.x > carrier.x ? 3 : -3), carrier.z + 5 * d, 0.8);
}

function passBlock(g, p, qb) {
  let t = p.blockOn >= 0 ? g.players[p.blockOn] : null;
  const rushers = g.players.filter(q => q.team !== p.team && q.dmode === 'rush');
  if (!t || t.shedCd > 0 || (t.engagedBy >= 0 && t.engagedBy !== p.id)) {
    t = null; let bd = 1e9;
    for (const q of rushers) {
      if (q.shedCd > 0 || (q.engagedBy >= 0 && q.engagedBy !== p.id)) continue;
      const dq = dist(p, q); if (dq < bd && dq < 7) { bd = dq; t = q; }
    }
    p.blockOn = t ? t.id : -1;
  }
  if (!t) { const home = rel(g, LINE[p.role] ? LINE[p.role][0] : 0, -2.5); return seek(p, home.x, home.z, 0.5); }
  const dx = qb.x - t.x, dz = qb.z - t.z, l = hyp(dx, dz) || 1;
  return seek(p, t.x + dx / l * 1.0, t.z + dz / l * 1.0, 0.95, 0.3);
}

function stalk(g, p) {
  // receivers block on run plays; on inside runs the slot/backside WR cracks down on the linebacker
  const pd = g.play.playDef || {};
  if (p.blockOn < 0 && pd.inside && p.role === 'WR2') {
    const lb = g.players.find(q => q.team !== p.team && q.role === 'LB');
    if (lb && !g.players.some(o => o !== p && o.blockOn === lb.id)) p.blockOn = lb.id;
  }
  if (p.blockOn < 0 && p.role === 'TE') {
    // the tight end seals the edge: nearest outside linebacker or end nobody has
    let best = null, bd = 1e9;
    for (const q of g.players) if (q.team !== p.team && (isLB(q.role) || q.role === 'DL1' || q.role === 'DL3')) {
      if (g.players.some(o => o !== p && o.blockOn === q.id)) continue;
      const dq = dist(p, q); if (dq < bd) { bd = dq; best = q; }
    }
    if (best && bd < 9) p.blockOn = best.id;
  }
  if (p.blockOn < 0) {
    let best = null, bd = 1e9;
    for (const q of g.players) if (q.team !== p.team && (q.role.startsWith('CB') || isSafety(q.role))) {
      if (g.players.some(o => o !== p && o.blockOn === q.id)) continue;
      const dq = dist(p, q); if (dq < bd) { bd = dq; best = q; }
    }
    if (best) p.blockOn = best.id;
  }
  const t = g.players[p.blockOn];
  if (!t) return { x: 0, z: 0, s: 0 };
  return seek(p, t.x, t.z, 0.85, 0.2);
}

function manMove(g, p, r, s) {
  const P = g.play, d = dirOf(P.off);
  const k = Math.min(1, (g._dt || 1 / 60) / g.cfg.react);
  p.svx += (r.vx - p.svx) * k; p.svz += (r.vz - p.svz) * k;
  const depth = (r.z - P.los) * d;
  const cushion = depth < 3 ? 2.2 : 1.1;
  const tx = r.x + p.svx * 0.45, tz = r.z + p.svz * 0.45 + cushion * d;
  return seek(p, tx, tz, s + 0.02, 0.5);
}

function zoneMove(g, p, s) {
  const P = g.play, d = dirOf(P.off);
  const L = p.zone || { CB1: [-13, 15], CB2: [13, 15], S: [0, 19], LB: [0, 7] }[p.role] || [0, 8];
  const home = rel(g, L[0], L[1]);
  let near = null, nd = 1e9;
  for (const r of g.players) if (r.team === P.off && RECEIVERS.includes(r.role) && !(r.role === 'RB' && P.type === 'run')) { const dd = hyp(r.x - home.x, r.z - home.z); if (dd < nd) { nd = dd; near = r; } }
  let tx = home.x, tz = home.z;
  if (near && nd < 10) {
    tx = home.x + (near.x - home.x) * 0.7;
    const deep = (near.z - P.los) * d, myDeep = (home.z - P.los) * d;
    const td = myDeep < 10 ? Math.min(myDeep + 2, Math.max(deep, myDeep - 2)) : Math.max(myDeep * 0.7, deep + 2);
    tz = P.los + td * d;
  }
  return seek(p, tx, tz, s, 0.8);
}

const wxHands = g => (g.opts.weather === 'rain' ? 0.93 : g.opts.weather === 'snow' ? 0.96 : 1) * (g.play && momOf(g, g.play.off) >= 60 ? 1.03 : 1);
// ---------------- pass resolution ----------------
function resolveBall(g) {
  const b = g.ball, P = g.play, cfg = g.cfg;
  const L = { x: b.tx, z: b.tz };
  if (b.auto) {
    const t = g.players[b.target];
    b.state = 'held'; b.carrier = t.id;
    if (b.target === 0) return; // snap
    if (g.opts.humans[P.off]) g.ctrl[P.off] = t.id;
    return;
  }
  const offTeam = P.off;
  const outOfBounds = Math.abs(L.x) > HALF_W || prog(offTeam, L.z) > 110 || prog(offTeam, L.z) < -10;
  let ro = null, dO = 1e9, rd = null, dD = 1e9;
  for (const p of g.players) {
    if (p.stun > 0 && p.dive <= 0) continue;
    const dd = hyp(p.x - L.x, p.z - L.z) - (p.playBall > 0 ? 0.8 : 0);   // jumping extends your reach
    if (p.team === offTeam) { if (RECEIVERS.includes(p.role) && dd < dO) { dO = dd; ro = p; } }
    else if (dd < dD) { dD = dd; rd = p; }
  }
  const myD = rd && g.opts.humans[rd.team] && !g.opts.humans[offTeam];
  const cO = ro && dO < 1.7, cD = rd && dD < (myD ? 1.85 : 1.4);
  let diving = false;
  const target = g.players[P.target];
  let outcome = 'inc';
  const defPlay = cD && rd.playBall > 0, offAgg = cO && ro.playBall > 0;
  // Skill decides this, not dice. What matters, in order: who got to the spot (separation), whether you pressed
  // the button at the right moment (timing), then ratings. A little noise keeps it from being robotic.
  const human = q => q && g.opts.humans[q.team] && g.ctrl[q.team] === q.id;
  const timing = q => {
    if (!q) return 0;
    if (human(q)) { if (q.playBall <= 0) return 0; const el = 0.75 - q.playBall; return clamp(1 - Math.abs(el - 0.32) / 0.38, 0, 1); }
    return clamp(((q.team === offTeam ? q.rt.hands : q.rt.cov) - 55) / 60, 0.1, 0.75) * (q.playBall > 0 || q.team === offTeam ? 1 : 0.6);   // CPU players time it by rating
  };
  const noise = () => (g.rng() + g.rng() - 1) * 0.12;
  const wx = wxHands(g);
  if (outOfBounds) outcome = 'inc';
  else if (cO && cD) {
    // contested: separation first, then timing, then hands vs coverage
    const edge = (dD - dO) * 1.25 + (timing(ro) - timing(rd)) * 0.7 + (ro.rt.hands * wx - rd.rt.cov) / 100 * 0.9 + (rd.dive > 0 ? 0.15 : 0) + noise();
    if (edge > 0.05) outcome = 'catch';
    else if (edge < -0.6 && dD < 1.1 && (defPlay || timing(rd) > 0.45)) outcome = 'int';
    else outcome = 'inc';
  } else if (cO) {
    // open: catch it unless he had to stretch and doesn't have the hands for it
    const need = dO < 1.0 ? 0 : (dO - 1.0) / 0.7 * 0.55;
    outcome = (ro.rt.hands * wx) / 100 - 0.35 + timing(ro) * 0.2 + noise() * 0.5 > need ? 'catch' : 'inc';
  } else if (ro && !outOfBounds && dO < 3.0 && (!rd || dD > dO + 0.4)) {
    // just out of reach: he lays out for it if he's fast and sure-handed enough
    const reachOk = (ro.rt.hands * wx) / 100 * 1.2 + timing(ro) * 0.4 + (ro.playBall > 0 ? 0.15 : 0) - (dO - 1.7) * 0.45 + noise();
    if (reachOk > 0.78) { outcome = 'catch'; diving = true; }
  } else if (cD) {
    // only a defender there: a pick if he's in front of it and timed it, otherwise he knocks it down
    const pick = (1.4 - dD) * 0.8 + timing(rd) * 0.6 + rd.rt.cov / 100 * 0.4 + noise();
    outcome = pick > 1.3 && dD < 0.9 ? 'int' : 'inc';
  }
  if (!outOfBounds && cO && cD && !P.isPat) {
    const r = g.rng();
    const humanD = g.opts.humans[rd.team] && g.ctrl[rd.team] === rd.id, humanO = g.opts.humans[ro.team] && g.ctrl[ro.team] === ro.id;
    const bump = hyp(rd.x - ro.x, rd.z - ro.z) < 1.05;
    if (humanD) {
      // you dove or jumped into him and got there before the ball did
      if (outcome !== 'catch' && bump && (rd.dive > 0 || (rd.playBall > 0 && dD > dO + 0.3))) { throwFlag(g, 'dpi', rd, L.z); outcome = 'inc'; }
    } else if (!g.opts.humans[rd.team] && outcome !== 'catch' && dD < 1.1 && r < (rd.dive > 0 ? 0.2 : 0.08) * FOUL_RATE) { throwFlag(g, 'dpi', rd, L.z); outcome = 'inc'; }
    if (outcome === 'catch' && humanO && ro.playBall > 0 && bump && r < 0.3) { throwFlag(g, 'opi', ro, L.z); outcome = 'inc'; }
    else if (outcome === 'catch' && !g.opts.humans[ro.team] && r < 0.02 * FOUL_RATE) { throwFlag(g, 'opi', ro, L.z); outcome = 'inc'; }
  }
  if (outcome === 'catch') {
    b.state = 'held'; b.carrier = ro.id;
    P.catchZ = ro.z; ro.caughtAt = g.t;
    ro.vx *= 0.45; ro.vz *= 0.45; ro.secureT = 0.3;   // securing the catch costs a step
    if (diving) {
      ro.x = L.x; ro.z = L.z; ro.dive = 0.55; ro.vx *= 0.3; ro.vz *= 0.3;
      g.flash = { text: 'DIVING CATCH!', until: 1.4 }; g.events.push('catch', 'bighit');
      highlight(g, 'DIVING CATCH', ro.rt.name, offTeam); mom(g, offTeam, 6);
      g.stats[offTeam].comp++; pst(g, ro).rec++;
      if (g.opts.humans[offTeam]) g.ctrl[offTeam] = ro.id;
      if (P.isPat && prog(offTeam, L.z) < 100) return endPlay(g, 'tackle', ro, null);
      if (prog(offTeam, L.z) >= 100) return touchdown(g, ro);
      return endPlay(g, 'tackle', ro, null);
    }
    // stretched out or fighting a defender: great hands snag it with one hand
    const stretch = dO > 1.15 || (cD && dD < 1.4);
    if (stretch && !P.isPat && g.rng() < clamp((ro.rt.hands - 62) / 70, 0.05, 0.5)) {
      ro.oneHandAt = g.t; g.flash = { text: 'ONE-HANDED CATCH!', until: 1.4 }; g.events.push('bighit');
      highlight(g, 'ONE-HANDED CATCH', ro.rt.name, offTeam); mom(g, offTeam, 5);
    }
    g.stats[offTeam].comp++; pst(g, ro).rec++;
    if (g.opts.humans[offTeam]) g.ctrl[offTeam] = ro.id;
    g.events.push('catch');
    if (ro !== target) {} // caught by a different receiver, fine
  } else if (outcome === 'int' && P.flag && !PEN[P.flag.type].off) {
    b.x = L.x; b.z = L.z; b.y = 0.2;
    if (enforceFlag(g, null, true, false)) return;
  } else if (outcome === 'int') {
    b.state = 'held'; b.carrier = rd.id;
    P.turnover = true; P.recognized = true;
    g.poss = rd.team;
    g.stats[offTeam].ints++; pst(g, rd).int++; mom(g, rd.team, 18); highlight(g, 'INTERCEPTION', rd.rt.name, rd.team);
    if (g.opts.humans[rd.team]) g.ctrl[rd.team] = rd.id;
    if (g.opts.humans[offTeam]) {
      // control nearest player to the interceptor
      let best = null, bd = 1e9;
      for (const p of g.players) if (p.team === offTeam) { const dd = dist(p, rd); if (dd < bd) { bd = dd; best = p; } }
      g.ctrl[offTeam] = best.id;
    }
    // clear blocks
    for (const p of g.players) { p.blockOn = -1; p.engagedBy = -1; }
    g.flash = { text: `INTERCEPTED! ${rd.rt.name}`, until: 1.8 };
    g.events.push('int');
    if (P.isPat) return endPlay(g, 'patfail', rd);
  } else {
    b.x = L.x; b.z = L.z; b.y = 0.2;
    g.events.push(cD ? 'breakup' : 'incomplete');
    endPlay(g, 'incomplete', null, null, defPlay ? 'SWATTED!' : cD ? 'PASS BROKEN UP' : null);
  }
}

// ---------------- end of play ----------------
function touchdown(g, c) {
  const t = c.team, P = g.play;
  if (P.flag && !P.isPat && t === P.off && PEN[P.flag.type].off && !P.turnover) { if (enforceFlag(g, 100, false, false)) { g.msg.sub += ' · touchdown wiped out'; return; } }
  if (P.flag && !P.isPat) { const F = P.flag; P.flag = null; if (!PEN[F.type].off && t === P.off) g.flagNote = `${PEN[F.type].name} on ${TEAMS[g.opts.teams[F.on]].abbr}, declined`; }
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = 3.4; g.runoff = 0;
  g.celebrate = t; c.scorer = 1;
  if (P.isPat) {
    score(g, t, 2);
    g.msg = { text: '2-POINT GOOD!', sub: `${c.rt.name} · ${TEAMS[g.opts.teams[t]].name}`, until: 2.6, big: true, team: t };
    g.events.push('score', 'whistle');
    g.pat = -1; kickoffTo(g, 1 - t);
    return;
  }
  score(g, t, 6);
  g.stats[t].tds++;
  mom(g, t, P.turnover ? 30 : 24); highlight(g, P.turnover ? 'PICK SIX' : 'TOUCHDOWN', `${c.rt.name}${P.thrown && !P.turnover ? ' catch' : ' run'}`, t);
  addYards(g, c, prog(t, zOf(t, 100)));
  if (!P.turnover) { pst(g, c).td++; if (P.thrown) pst(g, g.players[0]).ptd++; } else pst(g, c).td++;
  g.msg = { text: 'TOUCHDOWN!', sub: `${c.rt.name} · ${TEAMS[g.opts.teams[t]].name}`, until: 3.2, big: true, team: t };
  g.events.push('td', 'whistle');
  if (g.quarter >= 5) { kickoffTo(g, 1 - t); return; }            // walk-off in OT
  g.pat = t; g.poss = t; g.losZ = zOf(t, 97); g.ballX = 0; setFirstDown(g);
}

function addYards(g, c, endP) {
  const P = g.play;
  if (P.turnover) return;
  const gained = endP - prog(P.off, P.los);
  const y = Math.round(gained);
  if (P.thrown) { g.stats[P.off].passYds += y; pst(g, g.players[0]).py += y; pst(g, c).recy += y; }
  else { g.stats[P.off].rushYds += y; pst(g, c).ry += y; }
}

function endPlay(g, kind, c, tackler, note) {
  const P = g.play;
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = g.opts.humans[0] || g.opts.humans[1] ? 2.7 : 2.1; g.runoff = 0;
  g.events.push('whistle');
  if (!P.isPat && !g.opts.practice && kind === 'tackle' && tackler && !g.opts.humans[tackler.team] && c && c.team === P.off && !P.flag && g.rng() < 0.01 * FOUL_RATE) throwFlag2(g, 'mask', tackler, c.z);
  if (P.flag && !P.isPat) {
    const endP = kind === 'incomplete' ? null : (c && c.team === P.off ? prog(P.off, c.z) : null);
    if (enforceFlag(g, endP, !!P.turnover, false)) return;
  }
  if (P.isPat) {
    g.msg = { text: '2-POINT FAILED', sub: '', until: 2 };
    g.pat = -1; kickoffTo(g, 1 - P.off);
    return;
  }
  if (kind === 'incomplete') {
    g.down++;
    g.msg = { text: note || 'INCOMPLETE', sub: '', until: 1.9 };
    checkDowns(g);
    return;
  }
  const ct = c.team;
  const p = prog(ct, c.z);
  if (p < 0) {
    if (P.turnover) {
      g.poss = ct; g.losZ = zOf(ct, 20); g.ballX = 0; setFirstDown(g);
      g.msg = { text: 'TOUCHBACK', sub: '', until: 2 };
    } else {
      score(g, 1 - ct, 2);
      g.poss = 1 - ct; g.losZ = zOf(1 - ct, 35); g.ballX = 0; setFirstDown(g);
      g.msg = { text: 'SAFETY!', sub: '+2 ' + TEAMS[g.opts.teams[1 - ct]].abbr, until: 2.6, big: true };
      g.events.push('score');
      g.deadDur = 2.6;
    }
    return;
  }
  const spot = clamp(p, 1, 99);
  g.ballX = clamp(c.x, -7, 7);
  if (kind === 'tackle') g.runoff = 12;
  if (P.turnover) {
    g.poss = ct; g.losZ = zOf(ct, spot); setFirstDown(g);
    g.msg = { text: 'TURNOVER', sub: `${c.rt.name} return · ${TEAMS[g.opts.teams[ct]].name} ball`, until: 2 };
    g.runoff = 0;
    return;
  }
  addYards(g, c, p);
  const gained = Math.round(p - prog(ct, P.los));
  const sack = c.id === 0 && P.type === 'pass' && !P.thrown && !P.crossed && kind === 'tackle';
  if (sack) { g.stats[1 - ct].sacks++; mom(g, 1 - ct, 9); if (tackler) highlight(g, 'SACK', tackler.rt.name, 1 - ct); }
  if (gained >= 20) { mom(g, ct, 10); highlight(g, `${gained}-YARD ${P.thrown ? 'CATCH' : 'RUN'}`, c.rt.name, ct); }
  if (tackler && kind === 'tackle') { pst(g, tackler).tk++; if (sack) pst(g, tackler).sk++; }
  g.losZ = zOf(ct, spot);
  if (p >= prog(ct, g.fdZ)) {
    setFirstDown(g);
    g.stats[ct].firstDowns++; mom(g, ct, 3);
    g.msg = { text: 'FIRST DOWN', sub: `${c.rt.name} +${Math.max(0, gained)} yds${g.msgNote ? ' · ' + g.msgNote : ''}`, until: 1.9 }; g.msgNote = null;
    g.events.push('firstdown');
  } else {
    g.down++;
    g.togo = Math.max(1, Math.round(prog(ct, g.fdZ) - spot));
    g.msg = sack ? { text: 'SACKED!', sub: `${tackler ? tackler.rt.name + ' · ' : ''}${gained} yds`, until: 1.9 }
      : kind === 'oob' ? { text: 'OUT OF BOUNDS', sub: `${c.rt.name} ${gained >= 0 ? '+' : ''}${gained} yds`, until: 1.9 }
      : { text: gained > 0 ? `GAIN OF ${gained}` : gained === 0 ? 'NO GAIN' : `LOSS OF ${-gained}`, sub: c.rt.name + (tackler ? ` · tackle ${tackler.rt.name}` : g.msgNote ? ` ${g.msgNote}` : ''), until: 1.9 };
    g.msgNote = null;
    checkDowns(g);
  }
}

function throwFlag2(g, type, who, z) { const P = g.play; P.flag = { type, on: who.team, num: who.num, name: who.rt.name, z, x: who.x }; g.events.push('flag'); }

function checkDowns(g) {
  if (g.down > 4) {
    g.poss = 1 - g.poss; g.ballX = clamp(g.ballX, -7, 7); setFirstDown(g);
    g.msg = { text: 'TURNOVER ON DOWNS', sub: '', until: 2.2 }; mom(g, g.poss, 14);
    g.runoff = 0;
  } else {
    const fd = prog(g.poss, g.fdZ), p = prog(g.poss, g.losZ);
    g.togo = Math.max(1, Math.round(fd - p));
  }
}

// ---------------- snapshot (what the renderer & network see) ----------------
const r2 = v => Math.round(v * 100) / 100;
export function snapshot(g) {
  const P = g.play || {};
  return {
    v: 1, id: g.playId, ph: g.phase, pt: r2(g.phaseT), q: g.quarter, clk: r2(g.clock), sc: g.score.slice(),
    poss: g.poss, los: r2(g.losZ), fd: r2(g.fdZ), bx: r2(g.ballX), dn: g.down, tg: g.togo,
    op: g.offPlay, dp: g.defPlay, dc: g.defChosen, pc: Math.ceil(Math.max(0, g.playClock)),
    off: P.off, plos: r2(P.los ?? g.losZ), pbx: r2(P.bx ?? g.ballX), pty: P.type, thr: !!P.thrown,
    canThrow: canThrow(g),
    ctrl: g.ctrl.slice(), teams: g.opts.teams, humans: g.opts.humans, diff: g.opts.difficulty,
    msg: g.msg ? { text: g.msg.text, sub: g.msg.sub, big: !!g.msg.big, pen: !!g.msg.pen } : null,
    fl: g.play && g.play.flag && g.phase === 'live' ? [r2(g.play.flag.x), r2(g.play.flag.z)] : (g.lastFlag && g.phase === 'dead' ? g.lastFlag : null),
    flash: g.flash ? g.flash.text : null,
    win: g.winner,
    pl: g.players.map(p => [p.team, p.unit === 'off' ? 1 : 0, p.role, p.num, r2(p.x), r2(p.z), r2(p.face),
      r2(hyp(p.vx, p.vz)), (p.fallen > 0 ? 1 : 0) | (p.dive > 0 ? 2 : 0) | (p.juke > 0 ? 4 : 0) | (p.engagedBy >= 0 || p.blockOn >= 0 && g.players[p.blockOn] && g.players[p.blockOn].engagedBy === p.id ? 8 : 0)
        | (p.throwAt !== undefined && g.t - p.throwAt < 0.5 && g.phase === 'live' ? 16 : 0) | (reaching(g, p) ? 32 : 0)
        | (g.phase === 'dead' && g.celebrate === p.team ? 64 : 0) | (p.scorer && g.phase === 'dead' ? 128 : 0)
        | (p.spin > 0 ? 256 : 0) | (p.stiff > 0 ? 512 : 0) | (p.hurdle > 0 ? 1024 : 0) | (p.playBall > 0 ? 2048 : 0) | (p.press > 0 ? 4096 : 0)
        | (p.wrapAt !== undefined && g.t - p.wrapAt < 1.2 ? 8192 : 0) | (p.caughtAt !== undefined && g.t - p.caughtAt < 0.5 ? 16384 : 0) | (p.fallBack ? 32768 : 0) | (p.oneHandAt !== undefined && g.t - p.oneHandAt < 0.6 ? 65536 : 0),
      r2(p.stam), r2(p.size), p.rt.name, POS_LABEL[p.role], r2(p.moveCd), p.rt.face || faceSeed(p.rt.first + p.rt.last + p.num)]),
    b: [r2(g.ball.x), r2(g.ball.y), r2(g.ball.z), g.ball.state === 'air' ? 1 : g.ball.state === 'kick' ? 2 : 0,
      g.ball.state === 'air' && !g.ball.auto ? [r2(g.ball.tx), r2(g.ball.tz)] : null, g.ball.carrier ?? -1],
    st: g.stats,
    ql: g.opts.quarterLen,
    can4: g.down === 4 ? { fg: canFG(g), fgd: fgDistance(g) } : null,
    sp: { fg: canFG(g), fgd: fgDistance(g), pat: g.pat === g.poss },
    pat: g.pat, form: g.form,
    opDef: g.phase === 'presnap' && g.offPlay ? (() => { const q = getPlay(g, g.poss, g.offPlay); return q && q.routes ? { form: q.form, routes: Object.fromEntries(Object.entries({ ...q.routes, ...g.hot }).filter(([, v]) => v && v.length)), qbPath: q.qbPath || null, hot: Object.keys(g.hot), type: q.type } : null; })() : null,
    bT: g.ball.state === 'air' && !g.ball.auto ? r2(g.ball.T - g.ball.t) : -1,
    ks: g.phase === 'kickset' && g.ks ? { type: g.ks.type, stage: g.ks.stage, m: r2(g.ks.m), aim: r2(g.ks.aim), power: r2(g.ks.power), fd: g.ks.fd, maxR: r2(g.ks.maxR), sweet: KICK_SWEET } : null,
    to: g.to.slice(), pcMax: 25, ac: g.ac ? { n: g.ac.n, why: g.ac.why } : null,
    wx: g.opts.weather, tod: g.opts.tod, mom: Math.round(g.mom), cel: g.opts.cel, mode: g.opts.practice ? 'practice' : g.opts.drill ? 'drill' : 'game',
    hls: g.phase === 'gameover' ? g.hl : null,
    hr: g.phase === 'half' ? g.halfReady.slice() : null, hl: g.opts.halftime,
    ps: g.phase === 'half' || g.phase === 'gameover' ? Object.values(g.ps) : null,
  };
}

function reaching(g, p) {
  const b = g.ball;
  if (g.phase !== 'live' || b.state !== 'air' || b.auto) return false;
  const left = b.T - b.t;
  const dd = hyp(p.x - b.tx, p.z - b.tz);
  return (left < 0.45 && dd < 2.6 && RECEIVERS.concat(['CB1', 'CB2', 'S', 'SS', 'LB', 'LB2', 'LB3']).includes(p.role)) || (left < 0.75 && dd < 3.4 && p.id === b.target);
}
export function faceSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; }
export function drainEvents(g) { const e = g.events; g.events = []; return e; }
export const __test = { alignOffense: (g) => alignOffense(g, true), setup: (g) => setupPlay(g) };
