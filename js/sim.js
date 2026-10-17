// ENDZONE KINGS — game simulation (no DOM, runs in browser or Node)
// Units are yards. Team 0 attacks +z (scores at z >= 100), team 1 attacks -z (scores at z <= 0).
// x is sideline-to-sideline, |x| <= 26.65 is in bounds.

export const HALF_W = 26.65;

import { TEAMS, getRoster, POS_LABEL } from './teams.js?v=1792278338';
export { TEAMS };

// 11 on 11. Player ids follow these lists: offense 0-10, defense 11-21 (the first seven of each keep their old ids)
export const OFF_ROLES = ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB', 'LT', 'RT', 'TE', 'WR3'];
export const DEF_ROLES = ['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S', 'DL4', 'LB2', 'LB3', 'SS'];
export const RECEIVERS = ['WR1', 'WR2', 'RB', 'TE', 'WR3']; // keys 1-5
const N_OFF = OFF_ROLES.length;
const isLine = r => r === 'C' || r === 'LG' || r === 'RG' || r === 'LT' || r === 'RT';
const isSafety = r => r === 'S' || r === 'SS';
const isLB = r => r === 'LB' || r === 'LB2' || r === 'LB3';

import { FORMS, LINE, OFF_PLAYS, DEF_PLAYS, KICK_PLAYS, OFF_CATS, DEF_CATS, OFF_STYLES, DEF_STYLES, teamPlaybook, cleanCustom } from './playbook.js?v=1792278338';
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
// the CPU adapts: your chosen difficulty is the base, then 'adapt' (from how you've been playing) slides it up or down,
// even past Legend
const LEGEND_PLUS = { name: 'Legend+', ai: 1.04, shed: 0.24, intP: 0.66, qbErr: 0.34, react: 0.12, brk: 0.18 };
export function cfgFor(diff, adapt = 0) {
  const d = Math.max(0, Math.min(4, (diff ?? 1) + Math.max(-1, Math.min(1.4, adapt || 0))));
  const rows = [...DIFF, LEGEND_PLUS], i = Math.min(3, Math.floor(d)), t = d - i, A = rows[i], B = rows[i + 1];
  const out = { name: A.name };
  for (const k of ['ai', 'shed', 'intP', 'qbErr', 'react', 'brk']) out[k] = A[k] + (B[k] - A[k]) * t;
  return out;
}

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
    wind: (() => { const mph = Math.max(0, Math.min(30, +opts.wind || 0)); return { mph, dir: Number.isFinite(+opts.windDir) ? +opts.windDir : (opts.seed || 1) * 2.399 % (Math.PI * 2) }; })(),
    tod: TODS.includes(opts.tod) ? opts.tod : 'night',
    halftime: opts.practice || opts.drill ? 0 : (opts.halftime ?? 12),
    practice: ['off', 'def', 'st'].includes(opts.practice) ? opts.practice : null,
    pspot: clamp(+opts.pspot || 25, 20, 97),
    drill: !!opts.drill,
    cel: [0, 1].map(k => { const v = opts.cel ? +opts.cel[k] : -1; return Number.isFinite(v) && v >= -1 && v <= 8 ? v : -1; }),
  };
  const rng = mulberry(o.seed);
  const first = rng() < 0.5 ? 0 : 1;
  const g = {
    opts: o, rng, cfg: o.adapt ? cfgFor(o.difficulty, o.adapt) : (DIFF[o.difficulty] || DIFF[1]),
    t: 0, phase: 'presnap', phaseT: 0, deadDur: 2,
    quarter: 1, clock: o.quarterLen, score: [0, 0],
    poss: first, firstReceiver: first,
    losZ: 0, ballX: 0, fdZ: 0, down: 1, togo: 10,
    offPlay: null, defPlay: null, defChosen: false, playClock: 20,
    players: [], ball: { state: 'held', carrier: 1, x: 0, y: 0.3, z: 0 },
    ctrl: [-1, -1], play: null, playId: 0, runoff: 0, inj: [{}, {}], injLog: [], fat: [{}, {}], injAsk: [null, null], lastPlay: [null, null], onside: [false, false], depth: [{}, {}], bench: [{}, {}], subAsk: [null, null], subAskT: [0, 0], benchV: 0,
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
function highlight(g, text, sub, team) { g.hlCount = (g.hlCount || 0) + 1; g.hlTeam = team; if (!g.opts.practice) g.hl.push({ q: g.quarter, clk: Math.ceil(g.clock), text, sub: sub || '', team }); if (g.hl.length > 24) g.hl.shift(); }
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
  g.togo = Math.max(1, Math.round(fd - p));
  g.down = 1;
}

function makePlayer(g, id, team, unit, role, x, z) { const pl = makePlayer0(g, id, team, unit, role, x, z); pl.max0 = pl.max; return pl; }
// ---------------- injuries, fatigue and subs ----------------
const INJURIES = [
  ['Cramp', 'plays', 3], ['Stinger', 'plays', 4], ['Ankle sprain', 'plays', 6], ['Hamstring tightness', 'plays', 6], ['Knee contusion', 'plays', 5],
  ['Shoulder sprain', 'game', 0], ['Concussion protocol', 'game', 0], ['High ankle sprain', 'weeks', 2], ['Hamstring strain', 'weeks', 3], ['Turf toe', 'weeks', 2], ['Broken hand', 'weeks', 4],
];
const INJ_W = [16, 12, 14, 12, 10, 8, 6, 7, 6, 5, 4];
const BK_FIRST = ['Tavon', 'Keon', 'Rashad', 'Micah', 'Dillon', 'Booker', 'Sterling', 'Montez', 'Jarvis', 'Quinton', 'Desmond', 'Garrett', 'Ahmad', 'Fletcher', 'Ronnie', 'Vince', 'Yusuf', 'Kendall', 'Terrell', 'Bo'];
const BK_LAST = ['Hollis', 'Pruitt', 'Okafor', 'Blanton', 'Varner', 'Mabry', 'Kessler', 'Duvall', 'Tillman', 'Ashby', 'Greer', 'Lusk', 'Fontenot', 'Ruffin', 'Steele', 'Whitlock', 'Crain', 'Odom', 'Pettis', 'Gaines'];
// two backups per spot (2nd and 3rd string), built off the starter so the drop-off makes sense
function makeBench(g, team, role) {
  const base = rosterFor(g, team).players[role];
  let h = (g.opts.teams[team] + 1) * 7919 + team * 131; for (const c of role) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const k = ['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'];
  return [1, 2].map(n => {
    const drop = n === 1 ? 4 + r() * 6 : 9 + r() * 7, first = BK_FIRST[(r() * BK_FIRST.length) | 0], last = BK_LAST[(r() * BK_LAST.length) | 0];
    const b = { ...base, first, last, name: `${first[0]}. ${last}`, num: (base.num + 17 * n + ((r() * 9) | 0)) % 100, face: ((base.face || 7) ^ (0x5bd1 * n)) >>> 0, ovr: Math.max(45, Math.round((base.ovr || 70) - drop)), depth: n };
    for (const x of k) b[x] = Math.max(38, Math.round((base[x] || 60) - drop + (r() - 0.5) * 6));   // a backup can be faster or better at one thing
    return b;
  });
}
export function benchFor(g, team, role) { return g.bench[team][role] || (g.bench[team][role] = makeBench(g, team, role)); }
const fatKey = (g, team, role) => { const d = g.depth[team][role] || 0; return d ? `${role}#${d}` : role; };
function starterOut(g, team, role) { const j = g.inj[team][role]; return !!(j && !j.ready && (j.out !== 'plays' || j.plays > 0)) || !!(j && j.ready); }
// who can take this spot right now: 0 = starter, 1/2 = backups
function canPlay(g, team, role, d) { if (d === 0) return !starterOut(g, team, role) || !!(g.inj[team][role] && g.inj[team][role].ready); const b = benchFor(g, team, role)[d - 1]; return !!b && !b.hurt; }
function bestHealthy(g, team, role) { for (const d of [1, 2]) if (canPlay(g, team, role, d)) return d; return 1; }
function refreshSpot(g, team, role) {
  if (g.phase !== 'presnap' && g.phase !== 'dead') return;
  const i = g.players.findIndex(p => p.team === team && p.role === role); if (i < 0) return;
  const p = g.players[i], fresh = makePlayer(g, p.id, p.team, p.unit, p.role, p.x, p.z); fresh.hx = p.hx; fresh.hz = p.hz; g.players[i] = fresh;
}
function setDepth(g, team, role, d) {
  g.depth[team][role] = d; g.benchV++;
  if (d === 0) { const j = g.inj[team][role]; if (j && j.ready) delete g.inj[team][role]; }
  if (g.subAsk[team] === role) g.subAsk[team] = null;
  if (d === 0 && g.injAsk[team] === role) g.injAsk[team] = null;
  refreshSpot(g, team, role);
}
// the guy who got hurt is off the field: the human picks his replacement, the CPU takes the best one
function needSub(g, team, role) {
  const d = bestHealthy(g, team, role); g.depth[team][role] = d; g.benchV++;
  if (g.opts.humans[team]) { g.subAsk[team] = role; g.subAskT[team] = g.t; }
}
export function benchReport(g) {
  const out = [{}, {}];
  for (let t = 0; t < 2; t++) for (const role of Object.keys(ROSTER)) { if (!rosterFor(g, t).players[role]) continue; const st0 = rosterFor(g, t).players[role]; out[t][role] = [[st0.name, st0.ovr, st0.num, 0], ...benchFor(g, t, role).map(b => [b.name, b.ovr, b.num, b.hurt || 0])]; }
  return out;
}
export function injuryReport(g) {
  const out = [];
  for (let t = 0; t < 2; t++) for (const [role, j] of Object.entries(g.inj[t])) out.push({ team: t, role, name: j.name, kind: j.kind, out: j.out, plays: j.plays, ready: !!j.ready, sub: !!j.sub, depth: g.depth[t][role] || 0 });
  return out;
}
function injure(g, p, power) {
  if (g.opts.practice || g.opts.drill) return;
  const dep = g.depth[p.team][p.role] || 0;
  if (dep === 0 && g.inj[p.team][p.role] && !g.inj[p.team][p.role].ready) return;
  const base = 0.0045 * (1 + (g.fat[p.team][fatKey(g, p.team, p.role)] || 0) * 1.5) * power;
  if (g.rng() > base) return;
  let x = g.rng() * INJ_W.reduce((a, b) => a + b, 0), i = 0; while (x > INJ_W[i]) { x -= INJ_W[i]; i++; }
  const [kind, out, n] = INJURIES[i];
  if (dep > 0) {   // a backup went down: he's done for the day, pick someone else
    const b = benchFor(g, p.team, p.role)[dep - 1]; b.hurt = kind;
    g.flash = { text: `INJURY: ${b.name}`, until: 2.2 }; g.events.push('injury');
    needSub(g, p.team, p.role);
    g.msgInj = { team: p.team, text: `${b.name} is hurt (${kind}) and out for the game.${g.opts.humans[p.team] ? ' Pick who goes in.' : ''}` };
    return;
  }
  const name = rosterFor(g, p.team).players[p.role].name || p.rt.name;
  g.inj[p.team][p.role] = { name, kind, out, plays: out === 'plays' ? n : 0, weeks: out === 'weeks' ? n : 0 };
  g.injLog.push({ team: p.team, role: p.role, name, kind, out, weeks: out === 'weeks' ? n : 0 });
  g.flash = { text: `INJURY: ${name}`, until: 2.2 }; g.events.push('injury');
  needSub(g, p.team, p.role);
  g.msgInj = { team: p.team, text: `${name} is hurt (${kind}). ${out === 'plays' ? `Out for a few plays.` : out === 'game' ? 'Out for the game.' : `Out for the game, about ${n} weeks.`}${g.opts.humans[p.team] ? ' Pick who goes in.' : ' A backup is in.'}` };
}
function makePlayer0(g, id, team, unit, role, x, z) {
  const r = ROSTER[role];
  const base = rosterFor(g, team).players[role];
  let dep = (g.depth && g.depth[team][role]) || 0;
  if (dep === 0 && g.inj && starterOut(g, team, role) && !(g.inj[team][role] && g.inj[team][role].ready)) dep = g.depth[team][role] = bestHealthy(g, team, role);
  const rt = dep && base ? benchFor(g, team, role)[dep - 1] : base;   // whoever's on the depth chart for this spot
  const d = dirOf(g.poss);
  const faceOff = d > 0 ? 0 : Math.PI;
  return {
    id, team, unit, role, num: rt.num, size: r.size, max: r.spd * (0.70 + Math.min(rt.spd, 99) / 100 * 0.39) * (g.opts.weather === 'snow' ? 0.95 : 1) * (momOf(g, team) >= 60 ? 1.025 : 1) * (1 - Math.min(0.6, (g.fat && g.fat[team][fatKey(g, team, role)]) || 0) * 0.12), rt,
    x, z, vx: 0, vz: 0, face: unit === 'off' ? faceOff : faceOff + Math.PI, max0: 0,
    stam: 1, stun: 0, juke: 0, jukeCd: 0, dive: 0, tackleCd: 0, fallen: 0, spin: 0, stiff: 0, truck: 0, hurdle: 0, moveCd: 0, playBall: 0, hx: x, hz: z,
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
  g.kick = null; g.ballFly = null; g.flip = false; g.motion = null; g.noHuddle = false; g.spiked = false; g.celebrate = -1; g.deadInit = false; g.deadSkip = [false, false]; g.lastFlag = null; g.hot = {}; g.mom *= 0.94; g.cadence = 0; g.cpuSnapAt = 4.8 + g.rng() * 2.4;
  g.playId++;
  if (!g.opts.humans[off]) cpuCallOffense(g);
  if (!g.opts.humans[def]) { g.defPlay = cpuCallDefense(g); g.defChosen = true; }
  alignOffense(g, true); alignDefense(g, true);
}

// formations: set each player's home spot for the chosen play (they jog there pre-snap)
const mirror = pts => pts && pts.map(q => [-q[0], q[1], ...q.slice(2)]);   // flipped plays run to the other side
function alignOffense(g, instant) {
  const pl = getPlay(g, g.poss, g.offPlay);
  const form = pl && pl.form ? pl.form : (pl && pl.id === 'punt' ? 'punt' : pl && (pl.id === 'fg' || pl.id === 'xp') ? 'fg' : 'gun');
  const oa = offAlign(form);
  for (const p of g.players) if (p.unit === 'off') {
    const a = oa[p.role], h = rel(g, g.flip ? -a[0] : a[0], a[1]); p.hx = h.x; p.hz = h.z;
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
      const desperate = g.quarter >= 4 && g.clock < 300 && g.score[g.poss] < g.score[1 - g.poss] && g.score[1 - g.poss] - g.score[g.poss] <= 11;
      if (!(g.togo <= 2 && p >= 45)) { g.offPlay = r() < (desperate && g.togo <= 6 ? 0.22 : 0.03) ? 'fakepunt' : 'punt'; alignOffense(g); return; }
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
  // injured player cleared to return: put him back in or keep him out
  if (ev.t === 'injback' && typeof ev.role === 'string') { const j = g.inj[team][ev.role]; if (j && j.ready) { if (ev.back && g.phase !== 'live') setDepth(g, team, ev.role, 0); else if (!ev.back) { j.ready = false; j.sub = true; } } if (g.injAsk[team] === ev.role) g.injAsk[team] = null; return; }
  // depth chart (between plays): put any healthy guy at a spot — starter or either backup
  if (ev.t === 'sub' && typeof ev.role === 'string' && ROSTER[ev.role] && g.phase !== 'live' && rosterFor(g, team).players[ev.role]) {
    const d = +ev.pick;
    if ((d === 0 || d === 1 || d === 2) && canPlay(g, team, ev.role, d)) {
      if (d === 0) { const j = g.inj[team][ev.role]; if (j && j.sub && j.out === 'plays' && j.plays <= 0) delete g.inj[team][ev.role]; }
      setDepth(g, team, ev.role, d);
    }
    return;
  }
  // pick a touchdown celebration while you're celebrating
  if (ev.t === 'cel') { const v = +ev.id; if (Number.isFinite(v) && v >= -1 && v <= 8) { g.opts.cel[team] = v; if (g.phase === 'dead' && g.celebrate !== team && g.phaseT < g.deadDur - 0.8) startCel(g, team); else if (g.phase === 'dead' && g.celebrate === team) { for (const p of g.players) if (p.team === team) p.celReset = 1; g.events.push('cel' + (v < 0 ? 0 : v)); } } return; }
  // done watching: both humans hit snap and the next play comes up
  if (ev.t === 'skip') { if (g.phase === 'dead' && g.phaseT > 1.5) { g.deadSkip[team] = true; if ([0, 1].every(t => !g.opts.humans[t] || g.deadSkip[t])) g.deadDur = Math.min(g.deadDur, g.phaseT + 0.2); } return; }
  // onside kick: call it any time you have the ball; it happens on your next kickoff
  if (ev.t === 'onside' && !g.opts.practice && (g.phase === 'presnap' || g.phase === 'dead' || g.phase === 'kickset') && team === g.poss) { g.onside[team] = !g.onside[team]; g.flash = { text: g.onside[team] ? 'ONSIDE KICK CALLED FOR THE NEXT KICKOFF' : 'ONSIDE KICK CANCELLED', until: 1.6 }; return; }
  if (ev.t === 'nohuddle' && g.phase === 'dead' && team === g.poss && g.phaseT > 0.4) { g.noHuddle = true; g.nhPending = team; g.deadDur = Math.min(g.deadDur, g.phaseT + 0.3); return; }
  if (g.phase === 'half') { if (ev.t === 'snap' || ev.t === 'ready') g.halfReady[team] = true; return; }
  if (g.phase === 'kickset') { if (team === g.poss && (ev.t === 'kick' || ev.t === 'snap')) advanceKick(g); return; }
  if (ev.t === 'timeout' && g.to[team] > 0 && !g.opts.practice && g.timeoutCd <= 0) {
    // during a play you can't stop it, but the timeout is called the moment the whistle blows (no clock runs off)
    if (g.phase === 'live' || g.phase === 'kick') { (g.toQ || (g.toQ = [false, false]))[team] = true; return; }
    if (g.phase === 'presnap' || g.phase === 'dead') callTimeout(g, team);
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
        if (g.offPlay && g.offPlay !== pl.id && g.phaseT > 0.6 && !g.opts.humans[team] === false) { g.flash = { text: 'AUDIBLE!', until: 1.1 }; g.events.push('audible'); }
        if (g.offPlay !== pl.id) { g.hot = {}; g.flip = false; g.motion = null; }
        g.offPlay = pl.id; g.lastPlay[team] = pl.id; alignOffense(g);
      } else if (ev.t === 'flip' && g.offPlay && !['punt', 'fg', 'xp'].includes(g.offPlay)) {
        g.flip = !g.flip; g.motion = null; alignOffense(g); g.flash = { text: g.flip ? 'PLAY FLIPPED' : 'PLAY FLIPPED BACK', until: 0.9 };
      } else if (ev.t === 'motion' && g.offPlay && !g.motion && !['punt', 'fg', 'xp'].includes(g.offPlay)) {
        // send the slot (or TE) across the formation; a defender who follows him is in man coverage
        const m = byRole(g, 'WR3') || byRole(g, 'TE');
        if (m) { const side = Math.sign(m.hx - g.ballX) || 1, toX = clamp(g.ballX - side * Math.min(9, Math.abs(m.hx - g.ballX) + 3), -HALF_W + 2, HALF_W - 2); g.motion = { role: m.role, from: m.hx, to: toX, dx: 0, t: 0, read: false }; g.flash = { text: 'MOTION', until: 0.7 }; }
      } else if (ev.t === 'nohuddle' && g.lastPlay[team] && g.pat < 0) {
        const id = g.lastPlay[team]; if (getPlay(g, team, id)) { g.offPlay = id; g.hot = {}; alignOffense(g, true); g.phaseT = Math.max(g.phaseT, 0.7); g.flash = { text: 'NO HUDDLE', until: 0.9 }; }
      } else if (ev.t === 'spike' && g.pat < 0 && g.down < 4 && g.phaseT > 0.3 && !g.opts.practice) {
        // clock it: costs a down, stops the clock
        g.offPlay = g.offPlay && !['punt', 'fg', 'xp'].includes(g.offPlay) ? g.offPlay : (OFF_PLAYS.find(q => q.type === 'pass') || OFF_PLAYS[0]).id;
        alignOffense(g, true); snap(g); g.clock = Math.max(0, g.clock - 1); g.spiked = true;
        endPlay(g, 'incomplete', null, null, 'SPIKED: CLOCK STOPPED'); g.deadDur = 1.2; g.noHuddle = true;
      } else if (ev.t === 'hot' && g.offPlay) {
        const pl = getPlay(g, team, g.offPlay);
        if (pl && pl.type === 'pass' && !g.play.isPat && RECEIVERS.includes(ev.role)) {
          const r = hotRoute(pl.form || 'gun', ev.role, ev.kind);
          if (r === null) g.hot[ev.role] = []; else if (r) g.hot[ev.role] = r;
        }
      } else if (ev.t === 'snap' && g.offPlay && g.phaseT > 0.6 && !(g.toHold > 0)) {
        for (let t = 0; t < 2; t++) if (g.subAsk[t] && g.t - g.subAskT[t] > 20) { setDepth(g, t, g.subAsk[t], g.depth[t][g.subAsk[t]] || bestHealthy(g, t, g.subAsk[t])); }   // nobody picked in 20s: keep the guy who's in
        if (g.subAsk[team]) { g.flash = { text: 'PICK A SUB FIRST', until: 1.2 }; }
        else if (g.subAsk[1 - team]) { if (!g.flash) g.flash = { text: 'WAITING ON A SUB', until: 1.2 }; }
        else if (g.opts.humans[1 - team] && !g.defChosen) { if (!g.flash) g.flash = { text: 'WAITING FOR THE DEFENSE', until: 1.2 }; }   // both sides call a play first
        else snap(g);
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
  if (ev.t === 'throwaway' && team === g.poss && g.play && !g.play.thrown && g.ball.state === 'held') {
    const qb = g.players[g.ball.carrier];
    if (qb && qb.role === 'QB' && qb.team === team && !g.play.crossed) {
      const outside = Math.abs(qb.x - g.play.bx) > 6.5;   // outside the tackle box you can throw it away; inside it's grounding
      if (outside) { g.play.thrown = true; g.stats[team].att = (g.stats[team].att || 0) + 1; endPlay(g, 'incomplete', null, null, 'THROWN AWAY'); }
      else { g.play.thrown = true; endPlay(g, 'incomplete', null, null, 'INTENTIONAL GROUNDING: LOSS OF DOWN'); if (g.poss === team && g.phase === 'dead') { g.losZ = clamp(g.losZ - dirOf(team) * 10, 1, 99); g.togo = Math.abs(g.fdZ - g.losZ); } }
      return;
    }
  }
  const me = g.players[g.ctrl[team]];
  const b = g.ball;
  const carrier = b.state === 'held' ? g.players[b.carrier] : null;
  const iCarry = me && carrier === me && me.stun <= 0 && me.fallen <= 0;
  if (ev.t === 'throw' || ev.t === 'pick') {
    if (team === P.off && canThrow(g)) {
      let r = null;
      if (ev.t === 'throw') r = byRole(g, RECEIVERS[ev.n - 1]);
      else { const p = g.players[ev.id]; if (p && p.team === team && RECEIVERS.includes(p.role)) r = p; }
      if (r) { throwBall(g, g.players[0], r, humanErr(g), ev.t === 'throw' && typeof ev.pw === 'number' ? clamp(ev.pw, 0, 1.4) : undefined); return; }
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
  } else if (ev.t === 'truck') {
    if (iCarry && me.moveCd <= 0) { me.truck = 0.55; me.moveCd = 1.4; g.events.push('juke'); }
  } else if (ev.t === 'hurdle') {
    if (iCarry && me.moveCd <= 0) { me.hurdle = 0.55; me.moveCd = 1.8; g.events.push('hurdle'); }
  } else if (ev.t === 'playball') {
    // defender: jump the route / swat. receiver: aggressive catch
    if (me && b.state === 'air' && !b.auto && me.playBall <= 0 && me.stun <= 0) {
      const dl = hyp(me.x - b.tx, me.z - b.tz), left = b.T - b.t;
      if (dl < 4.5 + left * me.max * 0.6) { me.playBall = 0.75; g.events.push('playball'); }
      else { me.playBall = 0.45; }
    }
  } else if (ev.t === 'dive' && me && b.state === 'loose' && me.dive <= 0 && me.stun <= 0 && me.fallen <= 0) {
    let dx = b.x - me.x, dz = b.z - me.z; const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
    me.dive = 0.5; me.hit = 0; me.vx = dx * 9; me.vz = dz * 9; me.face = Math.atan2(dx, dz); g.events.push('dive');
  } else if (ev.t === 'dive') {
    if (me && carrier && carrier.team !== team && me.dive <= 0 && me.stun <= 0 && me.engagedBy < 0) {
      let dx = carrier.x - me.x, dz = carrier.z - me.z; const l = hyp(dx, dz) || 1;
      dx /= l; dz /= l;
      me.dive = 0.45; me.hit = 0; me.vx = dx * 9.5; me.vz = dz * 9.5; me.face = Math.atan2(dx, dz);
      g.events.push('dive');
    }
  } else if (ev.t === 'rdive') {
    // receiver lays out for the ball: big reach, but time it so you're still in the air when it gets there
    if (me && team === P.off && b.state === 'air' && !b.auto && RECEIVERS.includes(me.role) && me.dive <= 0 && me.stun <= 0 && me.fallen <= 0) {
      let dx = b.tx - me.x, dz = b.tz - me.z; const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
      const sp = Math.max(8, hyp(me.vx, me.vz) + 2.5);
      me.dive = 0.55; me.rdive = 0.55; me.hit = 0; me.vx = dx * sp; me.vz = dz * sp; me.face = Math.atan2(dx, dz);
      g.events.push('dive');
    }
  } else if (ev.t === 'hitstick') {
    // hit stick: launch your shoulder into the carrier. Land it and he's going down hard (and might cough it up),
    // whiff and you're eating turf while he runs past
    if (me && carrier && carrier.team !== team && me.dive <= 0 && me.stun <= 0 && me.engagedBy < 0 && me.fallen <= 0) {
      let dx = carrier.x + carrier.vx * 0.15 - me.x, dz = carrier.z + carrier.vz * 0.15 - me.z; const l = hyp(dx, dz) || 1;
      dx /= l; dz /= l;
      const sp = Math.max(8, hyp(me.vx, me.vz) + 2.5);
      me.dive = 0.38; me.hit = 1; me.vx = dx * sp; me.vz = dz * sp; me.face = Math.atan2(dx, dz);
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
  // feet set and clean pocket = on the money; throwing on the run or with a guy in your face sprays it
  return (0.7 + sp * 0.2 + pressure * 1.8) * (1.45 - qb.rt.acc / 100);
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
  g.snaps = (g.snaps || 0) + 1;
  g.runBudget = 0;
  const P = g.play;
  if (g.offPlay === 'punt' || g.offPlay === 'fg' || g.offPlay === 'xp') { if (g.opts.humans[g.poss] || g.opts.humans[1 - g.poss]) beginKickSet(g, g.offPlay); else startKick(g, g.offPlay); return; }
  if (g.pat < 0 && !g.opts.practice) {
    const r = g.rng();
    if (!g.opts.humans[g.poss] && r < 0.008 * FOUL_RATE * fouls(g)) return presnapFoul(g, 'fs', byRole(g, ['LT', 'LG', 'C', 'RG', 'RT', 'TE'][(g.rng() * 6) | 0]));
    if (!g.opts.humans[1 - g.poss] && r > 1 - 0.008 * FOUL_RATE * fouls(g)) return presnapFoul(g, 'offside', byRole(g, ['DL1', 'DL2', 'DL3', 'DL4'][(g.rng() * 4) | 0]));
  }
  let play = getPlay(g, g.poss, g.offPlay);
  if (!play) { g.offPlay = 'dive'; alignOffense(g); play = getPlay(g, g.poss, 'dive') || OFF_PLAYS[0]; }   // never crash on a stale play id
  P.type = play.type; P.playDef = play; P.snapT = g.t;
  P.readT = (g.opts.humans[1 - g.poss] ? 2.0 : 1.7) + g.rng() * 1.2;
  P.def = 1 - g.poss;
  P.flag = null; P.holdT = 0.6 + g.rng() * 2.2; P.holdRoll = g.rng();
  g.phase = 'live'; g.phaseT = 0;
  g.events.push('snap');
  for (const p of g.players) {
    p.x = p.hx; p.z = p.hz;
    if (play.routes[p.role]) { p.route = g.flip ? mirror(play.routes[p.role]) : play.routes[p.role]; p.ri = 0; }
    if (g.hot[p.role]) { if (g.hot[p.role].length) { p.route = g.hot[p.role]; p.ri = 0; } else p.route = null; }
    if (p.role === 'QB' && play.qbPath) { p.route = g.flip ? mirror(play.qbPath) : play.qbPath; p.ri = 0; }
    if (g.motion && g.motion.role === p.role && p.route) { const dx = g.motion.dx; p.route = p.route.map(q => [q[0] + dx, q[1], ...q.slice(2)]); }   // motion man runs his route from where he ended up
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

// how hard a throw to a receiver this far away should be (0..1), shared with the HUD meter
export function throwNeed(D) { return clamp(0.22 + Math.min(D, 45) / 45 * 0.68, 0.25, 0.9); }
function throwBall(g, qb, r, err, pw) {
  const P = g.play;
  const D0 = dist(qb, r);
  // power: tap = soft touch/lob, hold = bullet. Hit the window for the distance or it sails long or dies short.
  const need = throwNeed(D0), human = pw !== undefined;
  if (!human) pw = need + (g.rng() - 0.5) * 0.1;
  const bullet = clamp(pw, 0.1, 1.4);
  const speed = (16 + Math.min(D0, 40) * 0.17) * (0.86 + qb.rt.arm / 100 * 0.2) * (0.72 + bullet * 0.38);
  const L = leadPoint(qb, r, speed);
  // lead him to a spot he can actually catch it: inside the sideline and in front of the end line
  L.x = clamp(L.x, -HALF_W + 1.3, HALF_W - 1.3); L.z = zOf(P.off, Math.min(prog(P.off, L.z), 108.5));
  // longer throws are harder to place
  const a = g.rng() * Math.PI * 2, e = err * (0.6 + Math.min(D0, 45) / 11) * Math.sqrt(g.rng());
  let tx = L.x + Math.cos(a) * e, tz = L.z + Math.sin(a) * e;
  if (human) {
    const off = pw - need, ux = (L.x - qb.x) / (hyp(L.x - qb.x, L.z - qb.z) || 1), uz = (L.z - qb.z) / (hyp(L.x - qb.x, L.z - qb.z) || 1);
    let depth = 0;
    if (off > 0.2) depth = (off - 0.2) * 24;            // too much juice: sails over his head
    else if (off < -0.14) depth = (off + 0.14) * 30;    // not enough: dies short, defenders undercut it
    tx += ux * depth; tz += uz * depth;
    g.flash = Math.abs(off) <= 0.12 ? { text: 'PERFECT THROW', until: 0.7 } : depth > 2.5 ? { text: 'OVERTHROWN', until: 0.8 } : depth < -2.5 ? { text: 'UNDERTHROWN', until: 0.8 } : g.flash;
  }
  { const W = g.opts.wind; if (W && W.mph) { const T0 = hyp(tx - qb.x, tz - qb.z) / speed, k = W.mph / 20 * T0 * T0 * 1.4 * (bullet > 0.9 ? 0.7 : 1); tx += Math.sin(W.dir) * k; tz += Math.cos(W.dir) * k * 0.6; } }   // wind pushes the ball, floaters most
  const D = hyp(tx - qb.x, tz - qb.z);
  g.ball.x = qb.x; g.ball.z = qb.z; g.ball.y = 1.9;
  const arc = (0.7 + D * 0.12) * (bullet < 0.45 ? 1.7 - bullet : bullet > 0.85 ? 0.8 : 1);   // touch passes float, bullets are flat
  launchBall(g, tx, tz, Math.max(0.4, D / speed), arc, r.id, false);
  g.ball.pw = bullet; g.ball.pwOff = human ? pw - need : 0;
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
      const W = g.opts.wind || { mph: 0, dir: 0 }, tail = Math.cos(W.dir) * d * W.mph, cross = Math.sin(W.dir) * W.mph;
      let dist0 = (6 + sk.power * kickRange(g, off, 'punt') * (shank ? 0.55 : 1) + (g.rng() - 0.5) * 4) * (1 + tail * 0.012);
      let land = p + 12 + dist0 - 12;
      let tx = sk.aim + sk.acc * 22 + (g.rng() - 0.5) * (2.5 - skill * 1.5) + cross * 0.35;
      const oob = Math.abs(tx) > HALF_W;
      tx = clamp(tx, -HALF_W - 1, HALF_W + 1);
      k.tx = tx; k.T = 1.6 + sk.power * 1.6; k.h = 6 + sk.power * 11;
      if (land >= 100) { k.result = 'touchback'; k.newP = 20; land = Math.min(land, 108); }
      else { k.result = oob ? 'oob' : 'punt'; k.newP = 100 - land; }
      k.tz = zOf(off, land); k.yds = Math.round(Math.min(land, 100) - p); k.shank = shank;
    } else {
      const fd = type === 'xp' ? 20 : fgDistance(g);
      const W = g.opts.wind || { mph: 0, dir: 0 }, tail = Math.cos(W.dir) * d * W.mph, cross = Math.sin(W.dir) * W.mph;
      const reach = sk.power * kickRange(g, off, type) * 1.08 * (1 + tail * 0.01);
      const hook = sk.acc * 13 * (0.55 + fd / 45);
      const xPost = sk.aim + hook + (g.rng() - 0.5) * (1.6 - skill * 1.1) + cross * fd * 0.0065;
      const short = reach < fd;
      k.good = !short && Math.abs(xPost) < 3.05; k.dist = fd;
      k.miss = short ? 'short' : Math.abs(xPost) >= 3.05 ? ((xPost * d > 0) ? 'wide left' : 'wide right') : '';
      k.tx = clamp(xPost, -14, 14);
      k.tz = short ? zOf(off, p - 7 + reach + 2) : zOf(off, 110); k.T = 1.2 + fd * 0.012; k.h = short ? 4 : 6 + fd * 0.12;
      if (!short) {
        // carry the flight past the posts so the ball visibly sails over the crossbar (3.3 up) between the uprights (x = ±3.1)
        // and drops into the net, crossing the goal line plane exactly at xPost
        throughPosts(k, off, xPost, k.good ? 6 + Math.min(fd, 55) * 0.04 : 5.5);
      }
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
    { const W = g.opts.wind; if (W && W.mph >= 10) { const cross = Math.abs(Math.sin(W.dir)) * W.mph; if (k.good && g.rng() < cross * fd * 0.0004) k.good = false; } }   // a stiff crosswind costs the CPU kicker too
    k.tx = k.good ? (g.rng() - 0.5) * 4 : (g.rng() < 0.5 ? -1 : 1) * (4.5 + g.rng() * 3);
    k.tz = zOf(off, 110); k.T = 1.7; k.h = 6 + fd * 0.12;
  }
  if (type !== 'punt') throughPosts(k, off, k.tx, k.good ? 6 + Math.min(k.dist || 20, 55) * 0.04 : 5.5);
  g.kick = k;
  const b = g.ball; b.state = 'kick'; b.carrier = -1; b.x = k.fx; b.z = k.fz; b.y = 0.5;
  g.events.push('kick');
}

// kicks keep flying past the goal line plane: they cross it exactly at xPost, at a height clearly over the 3.3 crossbar,
// then drop into the net behind the posts
function throughPosts(k, off, xPost, cross) {
  const z0 = prog(off, k.fz), zEnd = 119, sc = (110 - z0) / (zEnd - z0);
  k.tx = clamp(k.fx + (xPost - k.fx) / sc, -30, 30);
  k.tz = zOf(off, zEnd); k.T = k.T / sc;
  k.h = Math.max(k.h, (cross - 0.5 - 3 * sc) / (4 * sc * (1 - sc)));
}
// a loose kicked ball after the play: gravity, a bounce, then it rolls to a stop
function flyBall(g, dt) {
  const f = g.ballFly, b = g.ball; if (!f) return;
  f.vy -= 9.8 * dt; b.x += f.vx * dt; b.z += f.vz * dt; b.y += f.vy * dt;
  if (b.y <= 0.14) { b.y = 0.14; if (Math.abs(f.vy) > 1.5) { f.vy = -f.vy * 0.35; f.vx *= 0.6; f.vz *= 0.6; } else { f.vy = 0; f.vx *= Math.max(0, 1 - dt * 3); f.vz *= Math.max(0, 1 - dt * 3); } }
  if (Math.abs(b.z - 50) > 64) { f.vz = 0; f.vx = 0; }   // the stands stop it
  if (f.vy === 0 && Math.hypot(f.vx, f.vz) < 0.05) g.ballFly = null;
}
function updateKick(g, dt) {
  const k = g.kick;
  k.t += dt;
  const s = Math.min(1, k.t / k.T);
  const b = g.ball;
  if (k.type !== 'punt' && k.t > k.T) {
    // past the posts the ball keeps going and comes down behind the end zone instead of hanging in the air
    if (!g.ballFly) g.ballFly = { vx: (k.tx - k.fx) / k.T, vz: (k.tz - k.fz) / k.T, vy: (3 - 4 * k.h) / k.T };
    flyBall(g, dt);
  } else {
    b.x = k.fx + (k.tx - k.fx) * s; b.z = k.fz + (k.tz - k.fz) * s;
    b.y = 0.5 + 4 * k.h * s * (1 - s) + (k.type !== 'punt' ? s * 3 : 0);
  }
  g.clock = Math.max(0, g.clock - dt);
  if (k.type === 'punt' && k.result === 'punt') {
    // hang time: the coverage team sprints downfield, the returner settles under it, his teammates set up a wall
    puntFlight(g, k, dt);
    if (k.t >= k.T) return startReturn(g, k);
  }
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
      g.msg = { text: 'NO GOOD', sub: `${k.dist} yd attempt${k.miss ? ' · ' + k.miss : ''}`, until: 2.2 }; if (off === 0) g.events.push('boo');
      g.poss = 1 - off; g.ballX = 0; setFirstDown(g);
      sudden(g);
    }
  }
}

// ---------------- punt returns ----------------
const returnerOf = (g, team) => g.players.find(p => p.team === team && p.role === 'S') || g.players.find(p => p.team === team && p.role.startsWith('CB'));
function puntFlight(g, k, dt) {
  const off = g.poss, rec = 1 - off, dRec = dirOf(rec), ret = returnerOf(g, rec);
  for (const p of g.players) {
    let tx, tz, sp;
    if (p.team === off) {
      if (p.role === 'QB') continue;                                   // the punter hangs back
      tx = k.tx + (p.hx - k.fx) * 0.35; tz = k.tz; sp = p.max * 0.92;    // gunners and coverage fan out toward the ball
    } else if (p === ret) { tx = k.tx; tz = k.tz; sp = p.max; }
    else { tx = k.tx + clamp(p.x - k.tx, -16, 16) * 0.8; tz = k.tz + dRec * (9 + (p.id % 4) * 2); sp = p.max * 0.7; }   // the wall, a few yards in front of the returner
    const dx = tx - p.x, dz = tz - p.z, l = hyp(dx, dz);
    if (l > 0.3) { const st = Math.min(l, sp * dt); p.x += dx / l * st; p.z += dz / l * st; p.vx = dx / l * sp; p.vz = dz / l * sp; p.face = Math.atan2(dx, dz); } else { p.vx = p.vz = 0; }
  }
  separate(g, 1);
}
function startReturn(g, k) {
  const off = g.poss, rec = 1 - off, ret = returnerOf(g, rec);
  g.stats[off].punts++; g.stats[off].puntYds += k.yds || 0;
  let nearest = 1e9; for (const p of g.players) if (p.team === off) nearest = Math.min(nearest, hyp(p.x - k.tx, p.z - k.tz));
  const humanRet = g.opts.humans[rec];
  // a CPU returner with coverage right on top of him calls a fair catch
  if (!ret || (!humanRet && nearest < 4.5)) {
    g.kick = null; g.phase = 'dead'; g.phaseT = 0; g.deadDur = 2.2; g.runoff = 0; g.events.push('whistle');
    g.poss = rec; g.losZ = zOf(rec, k.newP); g.ballX = 0; setFirstDown(g);
    g.msg = { text: 'FAIR CATCH', sub: `${k.yds} yard punt`, until: 2 };
    return;
  }
  ret.x = k.tx; ret.z = k.tz; ret.warpT = g.t;
  g.kick = null; g.poss = rec;
  g.play = { off: rec, def: off, los: k.tz, bx: k.tx, type: 'run', snapT: g.t, thrown: false, handed: true, crossed: true, turnover: false, recognized: true,
    target: -1, throwT: 0, readT: 0, qbDecided: true, isPat: false, isReturn: true, playDef: {}, holdT: 99, holdRoll: 0, flag: null, puntYds: k.yds };
  for (const p of g.players) { p.blockOn = -1; p.engagedBy = -1; p.route = null; p.dmode = null; p.assign = -1; p.stun = 0; p.dive = 0; p.fallen = 0; p.contacted = false; }
  // blockers pick up the nearest cover man
  for (const p of g.players) if (p.team === rec && p !== ret) { let best = null, bd = 1e9; for (const q of g.players) if (q.team === off && !g.players.some(o => o.blockOn === q.id) && dist(p, q) < bd) { bd = dist(p, q); best = q; } if (best && bd < 12) p.blockOn = best.id; }
  const b = g.ball; b.state = 'held'; b.carrier = ret.id; b.x = ret.x; b.z = ret.z; b.y = 1.1;
  g.phase = 'live'; g.phaseT = 0;
  if (humanRet) g.ctrl[rec] = ret.id;
  if (g.opts.humans[off]) { let best = null, bd = 1e9; for (const q of g.players) if (q.team === off && dist(q, ret) < bd) { bd = dist(q, ret); best = q; } if (best) g.ctrl[off] = best.id; }
  g.msg = { text: 'PUNT', sub: `${k.yds} yards · return it!`, until: 1.2 };
  g.events.push('catch');
}

function score(g, team, pts) {
  g.score[team] += pts; g.acPts = (g.acPts || 0) + pts;
  if (g.quarter >= 5) { g.otScored = true; }
}
function sudden(g) { /* placeholder for possession change hooks */ }

// the weather can turn during a game: a storm rolls in, or it clears up
function weatherShift(g) {
  if (g.opts.practice || g.opts.drill || g.opts.fixedWx || g.rng() > 0.22) return;
  const w = g.opts.weather, next = { clear: g.rng() < 0.5 ? 'rain' : 'fog', rain: g.rng() < 0.6 ? 'clear' : 'snow', fog: 'clear', snow: g.rng() < 0.5 ? 'clear' : 'snow' }[w] || 'clear';
  if (next === w) return;
  g.opts.weather = next; g.events.push('weather');
  g.flash = { text: { rain: 'RAIN IS MOVING IN', snow: 'IT\'S STARTING TO SNOW', fog: 'FOG IS ROLLING IN', clear: 'THE SKIES ARE CLEARING' }[next], until: 2.6 };
}
function kickoffTo(g, team) {
  const kicker = 1 - team;
  { const down = g.score[team] - g.score[kicker]; if (!g.opts.humans[kicker] && !g.opts.practice && g.quarter >= 4 && g.clock < 200 && down > 0 && down <= 16) g.onside[kicker] = true; }   // CPU goes for it when it's desperate
  if (g.onside && g.onside[kicker]) {
    g.onside[kicker] = false;
    const got = g.rng() < 0.22;   // roughly the real-life success rate
    if (got) { g.poss = kicker; g.losZ = zOf(kicker, 47); g.flash = { text: 'ONSIDE KICK... RECOVERED BY THE KICKING TEAM!', until: 2.4 }; g.events.push('crowd'); highlight(g, 'ONSIDE RECOVERY', '', kicker); }
    else { g.poss = team; g.losZ = zOf(team, 55); g.flash = { text: 'ONSIDE KICK... THEY COVER IT', until: 2 }; }
    g.ballX = 0; setFirstDown(g); return;
  }
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
  // something outside the game moved a player (devtools): a real hack, not lag (lag can't move anyone between frames on the machine running the game)
  if (g.phase === 'live' && g.acPid === pid) for (const p of g.players) if (p.acX !== undefined && Math.hypot(p.x - p.acX, p.z - p.acZ) > 0.5) { acFlag(g, 'player moved between frames'); break; }
  stepInner(g, dt, inputs);
  scoreOk();
  for (const p of g.players) { p.acX = p.x; p.acZ = p.z; }
  g.acPid = g.playId;
  if (ph === 'live' && g.phase === 'live' && g.playId === pid) {
    for (let i = 0; i < g.players.length; i++) {
      const p = g.players[i], b = before[i]; if (!b) continue;
      if (p.warpT === g.t) continue;   // the game itself put him there (diving catch, fumble recovery, punt return)
      const moved = Math.hypot(p.x - b[0], p.z - b[1]), lim = (p.max || 8) * 4 * dt + 2.0;
      if (moved > lim) { g.acTele = (g.acTele || 0) + 1; if (g.acTele >= 3) acFlag(g, 'player teleported'); break; }   // one-off glitches don't count, it has to keep happening
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
    if (!g.deadInit) {
      g.deadInit = true;
      const human = g.opts.humans[0] || g.opts.humans[1];
      if (human && g.deadDur >= 1 && !g.opts.practice && !g.opts.drill && !g.noHuddle) g.deadDur = Math.max(g.deadDur, 6);   // a real break between plays
      g.cpuCelAt = -1;
      if (human && (g.hlCount || 0) !== (g.hlSeen || 0) && g.celebrate < 0) { const t = g.hlTeam; if (t === 0 || t === 1) { if (!g.opts.humans[t] && g.rng() < 0.75) g.cpuCelAt = 0.9 + g.rng() * 0.8; } }
      g.hlSeen = g.hlCount || 0;
      if (g.celebrate >= 0 && !g.opts.humans[g.celebrate]) g.deadDur = Math.max(g.deadDur, 6.5);
      { const o = g.poss; if (!g.opts.humans[o] && g.celebrate < 0 && g.quarter >= 4 && g.clock < 150 && g.score[o] < g.score[1 - o]) g.deadDur = Math.min(g.deadDur, 2); }   // trailing CPU goes hurry-up
    }
    if (g.cpuCelAt > 0 && g.phaseT >= g.cpuCelAt) { g.cpuCelAt = -1; startCel(g, g.hlTeam, (g.rng() * 9) | 0); }
    if (g.toQ && g.phaseT > 0.6) for (let t = 0; t < 2; t++) if (g.toQ[t]) { g.toQ[t] = false; if (g.to[t] > 0 && g.pat < 0) callTimeout(g, t); }
    if (g.flagNote && g.msg) { g.msg.sub = (g.msg.sub ? g.msg.sub + ' · ' : '') + g.flagNote; g.flagNote = null; }
    for (const p of g.players) { p.vx *= Math.max(0, 1 - dt * 4); p.vz *= Math.max(0, 1 - dt * 4); p.x += p.vx * dt; p.z += p.vz * dt; }
    separate(g, 1);
    if (g.ballFly) flyBall(g, dt);
    else if (g.ball.state === 'held' && g.players[g.ball.carrier]) { const c = g.players[g.ball.carrier]; g.ball.x = c.x; g.ball.z = c.z; }
    if (g.phaseT >= g.deadDur) nextPlay(g);
  }
}

function updatePresnap(g, dt, inputs) {
  if (g.toHold > 0) { g.toHold -= dt; return; }   // timeout stoppage
  if (g.nhPending !== undefined && g.nhPending !== null) { const t = g.nhPending; g.nhPending = null; if (t === g.poss && g.pat < 0 && g.lastPlay[t] && getPlay(g, t, g.lastPlay[t])) { g.offPlay = g.lastPlay[t]; alignOffense(g, true); g.phaseT = 0.7; g.flash = { text: 'NO HUDDLE: SAME PLAY', until: 1 }; } }
  if (g.motion && g.motion.t < 1) {   // the motion man jogs across; a man-coverage defender trails him
    const M = g.motion, m = byRole(g, M.role); M.t = Math.min(1, M.t + dt / 1.4);
    const dpM = getPlay(g, 1 - g.poss, g.defPlay) || DEF_PLAYS[0], manM = dpM.cat === 'Man' || (dpM.man && Object.values(dpM.man).includes(M.role));
    if (m) { m.hx = M.from + (M.to - M.from) * M.t; M.dx = -(m.hx - M.from) * dirOf(g.poss); alignDefense(g);
      if (manM) { const sh = byRole(g, 'SS') || byRole(g, 'LB2'); if (sh) { sh.hx = m.hx; sh.hz = m.hz + dirOf(g.poss) * 6; } } }
    if (M.t >= 1 && !M.read) { M.read = true; const dp = getPlay(g, 1 - g.poss, g.defPlay) || DEF_PLAYS[0]; const man = dp.cat === 'Man' || (dp.man && Object.values(dp.man).includes(M.role));
      if (g.opts.humans[g.poss]) g.flash = { text: man ? 'A DEFENDER FOLLOWED HIM: MAN COVERAGE' : 'NOBODY FOLLOWED: LOOKS LIKE ZONE', until: 1.8 }; }
  }
  if (!g.opts.practice) g.playClock -= dt;
  // after a play that ended in bounds the game clock keeps running until the snap (up to the usual runoff).
  // Snapping fast saves time; a timeout stops it.
  if (g.runBudget > 0 && g.pat < 0 && !g.opts.practice) {
    const d = Math.min(dt, g.runBudget); g.clock = Math.max(0, g.clock - d); g.runBudget -= d;
    if (g.clock <= 0) { g.runBudget = 0; g.events.push('whistle'); return nextPlay(g); }
  }
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
  // a human defense that never picks gets a coverage called for it with a few seconds left, so the game never stalls
  if (g.opts.humans[def] && !g.defChosen && g.playClock <= 4) { g.defPlay = cpuCallDefense(g); g.defChosen = true; alignDefense(g); g.flash = { text: 'DEFENSE AUTO-CALLED', until: 1.2 }; }
  if (!g.opts.humans[off]) {
    if (!g.offPlay) cpuCallOffense(g);
    const humanDef = g.opts.humans[def];
    const ready = !humanDef ? g.phaseT > 2.0 : (g.defChosen && g.phaseT > g.cpuSnapAt);
    if (humanDef && !g.cadence && g.phaseT > g.cpuSnapAt - 1.4 && g.defChosen) { g.cadence = 1; g.events.push('cadence'); }
    if (ready || g.playClock <= 0) snap(g);
  } else if (g.playClock <= 0) {
    if (g.pat < 0 && g.phaseT > 3) return presnapFoul(g, 'dog', null);
    if (!g.offPlay) { g.offPlay = g.pat === off ? 'xp' : 'dive'; alignOffense(g); }
    snap(g);
  }
}

// Madden-style timeout: the game clock freezes, the play clock resets, both sides get a breather and the team that
// called it can pick a different play
function callTimeout(g, team) {
  if (g.to[team] <= 0) return;
  g.toSnap = g.toSnap || [-1, -1];
  if (g.toSnap[team] === (g.snaps || 0)) { if (g.toQ) g.toQ[team] = false; if (g.opts.humans[team]) g.flash = { text: 'ONE TIMEOUT PER PLAY', until: 1.2 }; return; }   // only one timeout between snaps
  g.toSnap[team] = g.snaps || 0;
  g.to[team]--; g.timeoutCd = 3; if (g.toQ) g.toQ[team] = false;
  g.runoff = 0; g.runBudget = 0; g.playClock = 25;
  if (g.phase === 'presnap') {
    g.phaseT = 0; g.cadence = 0; g.cpuSnapAt = 5 + g.rng() * 2;
    if (g.opts.humans[team] && team === g.poss) { g.offPlay = null; g.hot = {}; }
    if (g.opts.humans[team] && team !== g.poss) g.defChosen = false;
  }
  g.toHold = 2.5;   // nobody snaps during the stoppage
  g.msg = { text: 'TIMEOUT', sub: `${TEAMS[g.opts.teams[team]].name} · ${g.to[team]} left · clock stopped`, until: 2.5 };
  g.events.push('whistle');
}
function cpuTimeout(g) {
  for (let t = 0; t < 2; t++) {
    if (g.opts.humans[t] || g.to[t] <= 0 || g.opts.practice || g.opts.drill) continue;
    const late = (g.quarter === 2 || g.quarter >= 4) && g.clock < 50 && g.clock > 3 && (g.runoff > 0 || g.runBudget > 0);
    g.toSnap = g.toSnap || [-1, -1];
    if (late && g.poss === t && g.score[t] <= g.score[1 - t] && g.toSnap[t] !== (g.snaps || 0)) { g.toSnap[t] = g.snaps || 0; g.to[t]--; g.runoff = 0; g.runBudget = 0; g.msg = { text: 'TIMEOUT', sub: `${TEAMS[g.opts.teams[t]].name} · ${g.to[t]} left`, until: 2 }; return; }
  }
}
function wearAndTear(g) {
  if (!g.play || g.opts.practice || g.opts.drill) return;
  for (let t = 0; t < 2; t++) {
    const onField = new Set(g.players.filter(p => p.team === t).map(p => p.role));
    for (const role of Object.keys(ROSTER)) {
      const j = g.inj[t][role], playing = fatKey(g, t, role);
      for (const key of [role, `${role}#1`, `${role}#2`]) {
        const f = g.fat[t][key] || 0;
        if (!f && key !== playing) continue;
        g.fat[t][key] = key !== playing || !onField.has(role) ? Math.max(0, f - 0.12) : Math.min(1, f + (role === 'RB' || role.startsWith('DL') ? 0.045 : 0.025));
      }
      if (j && j.out === 'plays' && !j.sub && j.plays > 0) {
        j.plays--;
        if (j.plays <= 0) { if (g.opts.humans[t]) { j.ready = true; g.injAsk[t] = role; } else { delete g.inj[t][role]; g.depth[t][role] = 0; } }   // CPU puts him right back
      }
    }
  }
}
function nextPlay(g) {
  wearAndTear(g);
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
  g.runBudget = g.runoff || 0; g.runoff = 0;   // runs off live during the next pre-snap instead of all at once
  if (g.otScored) return endGame(g);
  if (g.clock <= 0 && g.pat < 0) {
    const q = g.quarter;
    if (q === 2) {
      g.quarter = 3; g.clock = g.opts.quarterLen; g.to = [3, 3];
      weatherShift(g);
      kickoffTo(g, 1 - g.firstReceiver);
      if (g.opts.halftime > 0) {
        g.phase = 'half'; g.phaseT = 0; g.halfReady = [!g.opts.humans[0], !g.opts.humans[1]];
        g.to = [3, 3];   // 3 timeouts per half: unused first-half timeouts don't carry over
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
      weatherShift(g);
    }
  }
  g.phase = 'presnap'; g.phaseT = 0;
  setupPlay(g);
  if (g.phase === 'presnap' && g.down === 3 && g.pat < 0 && !g.opts.practice) g.events.push(g.poss === 1 ? 'thirddown' : 'thirddown_away');   // the home crowd gets loud when their defense is on the field
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
    if (p.rdive > 0) p.rdive -= dt;
    if (p.dive > 0) { p.dive -= dt; if (p.dive <= 0) { p.stun = p.hit > 0 ? 1.25 : 0.75; p.fallen = p.stun; p.hit = 0; } }   // whiffed hit stick = longer on the ground
    if (p.fallen > 0 && p.stun <= 0) p.fallen = 0;
    p.spin = Math.max(0, p.spin - dt); p.stiff = Math.max(0, p.stiff - dt); p.truck = Math.max(0, (p.truck || 0) - dt); p.hurdle = Math.max(0, p.hurdle - dt);
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
      // nobody without the ball (AI-driven) leaves the field: hold at the sideline and the back of the end zone
      if (want && !(carrier && carrier.id === p.id)) {
        if (Math.abs(p.x) > HALF_W - 0.8 && want.x * p.x > 0) want = { ...want, x: 0 };
        const dz = p.z > 100 ? p.z - 100 : p.z < 0 ? -p.z : 0;
        if (dz > 8.5 && want.z * (p.z > 50 ? 1 : -1) > 0) want = { ...want, z: 0 };
      }
    }
    applyMove(g, p, want, dt);
    if (!(carrier && carrier.id === p.id) && !p.dive && !p.fallen) { const lim = HALF_W + 0.4; if (p.x > lim) p.x = lim; else if (p.x < -lim) p.x = -lim; if (p.z > 109.5) p.z = 109.5; else if (p.z < -9.5) p.z = -9.5; }
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
  } else if (b.state === 'loose') {
    b.looseT += dt;
    b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= 18 * dt; b.y += b.vy * dt;
    if (b.y < 0.15) { b.y = 0.15; if (Math.abs(b.vy) > 1.2) { b.vy = -b.vy * 0.45; b.vx += (g.rng() - 0.5) * 3; b.vz += (g.rng() - 0.5) * 3; } else b.vy = 0; b.vx *= 0.88; b.vz *= 0.88; }   // a football bounces funny
    b.vx *= 1 - dt * 0.7; b.vz *= 1 - dt * 0.7;
    // out of bounds: the team that fumbled keeps it there
    if (Math.abs(b.x) > HALF_W || b.z > 110 || b.z < -10) {
      const f = g.players[P.fumbler] || g.players[0]; f.x = clamp(b.x, -HALF_W, HALF_W); f.z = clamp(b.z, -9.9, 109.9);
      b.state = 'held'; b.carrier = f.id; g.flash = { text: 'BALL WENT OUT OF BOUNDS', until: 1.4 };
      return endPlay(g, 'oob', f);
    }
    let rec = null, rd = 1e9;
    if (b.looseT > 0.5 && b.y < 1.5) for (const p of g.players) {
      const diving = p.dive > 0;
      if (!diving && (p.stun > 0 || p.fallen > 0)) continue;
      const dd = hyp(p.x - b.x, p.z - b.z), reach = diving ? 1.5 : 0.95;
      if (dd < reach && dd < rd) { rd = dd; rec = p; }
    }
    if (!rec && b.looseT > 7) for (const p of g.players) { const dd = hyp(p.x - b.x, p.z - b.z); if (dd < rd) { rd = dd; rec = p; } }
    if (rec) {
      b.state = 'held'; b.carrier = rec.id; rec.x = b.x; rec.z = b.z; rec.warpT = g.t;
      const fum = g.players[P.fumbler], fumTeam = fum ? fum.team : P.off;
      if (rec.team !== fumTeam) {
        P.turnover = !P.turnover || rec.team !== P.off; g.poss = rec.team; mom(g, rec.team, 14); g.events.push('turnover');
        g.flash = { text: rec.team === P.off ? 'THEY GOT IT BACK!' : 'FUMBLE RECOVERED! TURNOVER!', until: 1.8 };
        if (rec.team !== P.off) highlight(g, 'FUMBLE RECOVERY', rec.rt.name, rec.team);
      } else g.flash = { text: 'RECOVERED! STILL THEIR BALL', until: 1.6 };
      if (g.opts.humans[rec.team]) g.ctrl[rec.team] = rec.id;
      const other = 1 - rec.team;
      if (g.opts.humans[other]) { let best = null, bd = 1e9; for (const q of g.players) if (q.team === other && dist(q, rec) < bd) { bd = dist(q, rec); best = q; } if (best) g.ctrl[other] = best.id; }
      g.events.push('catch');
      if (rec.dive > 0) return endPlay(g, 'tackle', rec, null);   // dove on it: he's down right there
    }
  } else if (b.state === 'air') {
    b.t += dt;
    const s = Math.min(1, b.t / b.T);
    b.x = b.fx + (b.tx - b.fx) * s; b.z = b.fz + (b.tz - b.fz) * s;
    b.y = b.fy + (1.3 - b.fy) * s + 4 * b.h * s * (1 - s);
    // the ball gets to somebody before its landing spot: resolve it right there instead of flying through him
    if (!b.auto && s > 0.12 && s < 1 && b.y < 3.6) {
      for (const p of g.players) {
        if (p.stun > 0 && p.dive <= 0) continue;
        const off = p.team === g.play.off, reachable = off ? RECEIVERS.includes(p.role) && s > 0.35 : true;
        const you = g.opts.humans[p.team] && g.ctrl[p.team] === p.id;
        // how high and how far he can get to it: a jump (play ball) gets you way up there, the guy you control gets a bit more
        const top = p.playBall > 0 ? 3.5 : (you ? 2.9 : 2.6), rad = (p.playBall > 0 ? 1.15 : 0.8) + (you && !off ? 0.15 : 0);
        if (reachable && b.y < top && hyp(p.x - b.x, p.z - b.z) < rad) { b.tx = b.x; b.tz = b.z; resolveBall(g); break; }
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
      // the defender YOU control is the playmaker: bigger tackle range and harder to shake. Your AI teammates play straight.
      const youD = g.opts.humans[d.team] && g.ctrl[d.team] === d.id;
      const hitting = d.hit > 0 && d.dive > 0 && youD;
      const tr = (hitting ? 1.55 : d.dive > 0 ? 2.1 : 1.12) * (0.5 + 0.5 * (d.size + c2.size) / 2) * (youD ? 1.45 : 1);
      if (dist(d, c2) < tr) {
        const humanCarrier = g.opts.humans[ct] && g.ctrl[ct] === c2.id;
        let brk = c2.role === 'RB' ? cfg.brk + 0.12 : c2.role === 'TE' ? cfg.brk + 0.08 : cfg.brk;
        // a runner at full speed is harder to bring down head on, an arm tackle from behind is easy to shake
        { const sp = hyp(c2.vx, c2.vz) / (c2.max || 7); if (sp > 0.75) brk += 0.06; if (d.engagedBy >= 0) brk += 0.25; if (!c2.contacted && sp > 0.6 && c2.role === 'RB') brk += 0.1; c2.contacted = true; if (sp < 0.35) brk -= 0.3; }   // no momentum, no breaking tackles
        if (c2.juke > 0) brk = Math.max(brk, humanCarrier ? 0.6 : 0.42);
        if (c2.spin > 0) brk = Math.max(brk, humanCarrier ? 0.55 : 0.4);
        // truck: lower the shoulder and try to run him over. Big, fast backs win it; a solid tackler squared up stops it,
        // and if it fails you go down hard
        if (c2.truck > 0) {
          const fx = Math.sin(c2.face), fz = Math.cos(c2.face), ax = d.x - c2.x, az = d.z - c2.z, al = hyp(ax, az) || 1;
          if ((fx * ax + fz * az) / al > -0.1 && d.dive <= 0) {
            const sp = hyp(c2.vx, c2.vz) / (c2.max || 7);
            const power = (c2.size - 1) * 2.4 + sp * 0.55 + c2.rt.elu * 0.002 + (c2.truck > 0.3 ? 0.1 : 0);
            const hold = (d.size - 1) * 2.0 + d.rt.tkl / 100 * 0.5 + (youD ? 0.25 : 0);
            c2.truck = 0;
            if (power - hold + (g.rng() - 0.5) * 0.5 > 0.12) {
              d.stun = 1.4; d.fallen = 1.4; d.tackleCd = 1.5; d.fallBack = 1; d.vx = ax / al * 5; d.vz = az / al * 5;
              c2.vx *= 0.8; c2.vz *= 0.8; d.hitAt = g.t;
              g.events.push('bighit'); mom(g, ct, 7); g.flash = { text: 'TRUCKED!', until: 1.2 }; highlight(g, 'TRUCK STICK', c2.rt.name, ct);
              continue;
            }
            brk = -9;   // failed truck: he's going down
          }
        }
        let stiffWin = false;
        if (c2.stiff > 0) {
          // stiff arm: a big back shoving a defender who comes at him from the front or side, timed as the hit lands
          const fx = Math.sin(c2.face), fz = Math.cos(c2.face), ax = d.x - c2.x, az = d.z - c2.z, al = hyp(ax, az) || 1;
          if ((fx * ax + fz * az) / al > -0.3 && d.dive <= 0) {
            const shove = 0.42 + (c2.size - 0.95) * 1.5 + c2.rt.elu * 0.002 + (c2.stiff > 0.3 ? 0.12 : 0) - d.rt.tkl / 100 * 0.3 - (d.size - 1) * 0.6;
            brk = Math.max(brk, shove + 0.12); stiffWin = shove > 0.24;
          }
        }
        if (c2.hurdle > 0) brk = Math.max(brk, d.dive > 0 ? 0.8 : 0.22);
        if (c2.role === 'QB' && !P.thrown && !P.crossed) brk *= 0.6;
        if (d.dive > 0 && c2.hurdle <= 0 && !hitting) brk *= 0.75;
        // a landed hit stick is a kill shot unless the runner timed a move into it
        if (hitting) brk = c2.juke > 0 || c2.spin > 0 || c2.hurdle > 0 ? brk + 0.15 : brk * 0.25;
        brk *= (1.5 - d.rt.tkl / 100) * (0.6 + c2.rt.elu / 100 * 0.6);
        if (youD) brk *= 0.4;
        // skill, not luck: the carrier breaks it when his move is timed into the hit (or the tackler is tied up),
        // with only a sliver of randomness on top
        if (brk + (g.rng() - 0.5) * 0.24 > 0.36) {
          d.stun = stiffWin ? 1.1 : 0.85; d.fallen = stiffWin ? 1.1 : 0.85; d.tackleCd = 1.2; d.dive = 0;
          if (stiffWin) { const ax = d.x - c2.x, az = d.z - c2.z, al = hyp(ax, az) || 1; d.vx = ax / al * 4; d.vz = az / al * 4; d.fallBack = 1; }   // shoved to the ground
          c2.vx *= stiffWin ? 0.85 : 0.6; c2.vz *= stiffWin ? 0.85 : 0.6;
          g.events.push('brokentackle'); mom(g, ct, stiffWin ? 5 : 3);
          g.flash = { text: stiffWin ? 'STIFF ARM!' : 'BROKEN TACKLE', until: 1.0 };
          if (stiffWin) highlight(g, 'STIFF ARM', c2.rt.name, ct);
        } else {
          c2.fallen = 3; d.fallen = 3; d.wrapAt = g.t; c2.hitAt = g.t;
          { const fx = Math.sin(c2.face), fz = Math.cos(c2.face); c2.fallBack = ((d.x - c2.x) * fx + (d.z - c2.z) * fz) > 0.2 ? 1 : 0; }
          // tackler wraps up: drive him into the carrier
          const ux = c2.x - d.x, uz = c2.z - d.z, ul = hyp(ux, uz) || 1;
          d.vx = ux / ul * 3 + c2.vx * 0.5; d.vz = uz / ul * 3 + c2.vz * 0.5; d.face = Math.atan2(ux, uz);
          c2.face = Math.atan2(c2.vx || ux, c2.vz || uz);
          g.events.push(hitting || c2.vx * c2.vx + c2.vz * c2.vz > 30 ? 'bighit' : 'tackle');
          if (hitting) {
            c2.fallBack = 1; c2.vx += Math.sin(d.face) * 4; c2.vz += Math.cos(d.face) * 4;
            g.flash = { text: 'HIT STICK!', until: 1.1 }; mom(g, d.team, 6);
            highlight(g, 'BIG HIT', d.rt.name, d.team);
          }
          // fumbles: rare on a normal tackle, real on a big hit or a hit stick. Going down (slide) protects the ball.
          // whoever is closest to the loose ball comes up with it, so it can bounce back to the offense too
          if (!P.isPat && !c2.slide && !(c2.id === 0 && !P.thrown && !P.crossed && !hitting && g.rng() > 0.4)) {
            const hp = hyp(d.vx, d.vz) / 9 + (d.size - 1) * 1.5 + d.rt.tkl / 100 * 0.4;
            const sec = c2.rt.elu / 100 * 0.25 + (c2.role === 'RB' ? 0.08 : 0) + (c2.role === 'QB' ? -0.05 : 0);
            const big = c2.vx * c2.vx + c2.vz * c2.vz > 30;
            const fc = hitting ? clamp(0.12 + (hp - sec) * 0.12, 0.06, 0.28) : clamp((big ? 0.045 : 0.016) + (hp - sec) * 0.012 + (c2.juke > 0 || c2.spin > 0 ? 0.015 : 0), 0.008, 0.07);   // moves in traffic are riskier
            if (g.rng() < fc) {
              // the ball is LOOSE: it bounces around and whoever gets to it first (or dives on it) owns it
              const b = g.ball, a = g.rng() * Math.PI * 2, sp = 3 + g.rng() * 4;
              b.state = 'loose'; b.carrier = -1; b.x = c2.x; b.z = c2.z; b.y = 0.9; b.vx = Math.sin(a) * sp + c2.vx * 0.3; b.vz = Math.cos(a) * sp + c2.vz * 0.3; b.vy = 2.6; b.looseT = 0;
              P.fumbler = c2.id; P.recognized = true;
              c2.fallen = 1.4; c2.stun = 1.1; d.fallen = 1.1; d.stun = 0.8; d.tackleCd = 1.5; d.vx *= 0.3; d.vz *= 0.3; c2.vx *= 0.3; c2.vz *= 0.3;
              highlight(g, 'FORCED FUMBLE', d.rt.name, d.team);
              g.flash = { text: 'FUMBLE! BALL IS LOOSE', until: 1.6 }; g.events.push('bighit');
              return;
            }
          }
          // forward progress: a runner going downhill falls forward, more if he's hit from the side or behind
          { const dd = dirOf(ct), vf = c2.vz * dd, front = ((d.z - c2.z) * dd) > 0.3;
            const sack = c2.id === 0 && !P.thrown && !P.crossed;
            if (vf > 1 && !sack) { const fall = clamp(vf * 0.2, 0, 1.7) * (front ? 0.55 : 1) * (0.8 + c2.size * 0.25); c2.z = zOf(ct, Math.min(99.4, prog(ct, c2.z) + fall)); } }
          { const big = c2.vx * c2.vx + c2.vz * c2.vz > 30; injure(g, c2, hitting ? 7 : big ? 2.6 : 1); if (hitting || big) injure(g, d, 0.6); }
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
  if (g.play && p.team !== g.play.off) return false;   // the defender you control only moves when YOU move him
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
  if (p.unit === 'def' && g.opts.humans[p.team] && g.ctrl[p.team] === p.id) spd *= 1.04;   // you're the quickest guy on your defense
  const tvx = (w.x || 0) * spd, tvz = (w.z || 0) * spd;
  const acc = (p.size > 1.15 ? 13 : 20) * dt * (0.82 + Math.min(p.rt.spd, 99) / 100 * 0.25) * (p.juke > 0 ? 0.3 : 1) * (p.spin > 0 ? 0.6 : 1);
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
    const shed = g.opts.humans[t.team] && g.ctrl[t.team] === t.id ? Math.max(cfg.shed * 1.8, 0.25) : cfg.shed;   // the rusher you control beats blocks faster
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
  const P = g.play, b = g.ball, cfg = g.cfg;
  // your offensive teammates run crisp routes and blocks; your defensive teammates are average, so stops come from you
  const ai = g.opts.humans[p.team] && !g.opts.humans[1 - p.team] ? (p.team === P.off ? 0.99 : Math.min(cfg.ai, 0.9)) : cfg.ai;
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

  // loose ball: closest guys sprint for it, everyone else flows toward it
  if (b.state === 'loose') { const dl = hyp(p.x - b.x, p.z - b.z); return seek(p, b.x + b.vx * 0.2, b.z + b.vz * 0.2, dl < 14 ? Math.max(ai, 0.97) + 0.03 : ai * 0.75, 0.05); }
  // ball in the air on a pass
  if (airPass) {
    const since = g.t - P.throwT;
    if (p.id === b.target) {
      // he runs to where the ball should be, and only adjusts to a bad throw once he can read it
      const k = clamp((b.t / (b.T || 1) - 0.35) / 0.4, 0, 1), ix = b.ix ?? b.tx, iz = b.iz ?? b.tz;
      return seek(p, clamp(ix + (b.tx - ix) * k, -HALF_W + 0.6, HALF_W - 0.6), zOf(P.off, Math.min(prog(P.off, iz + (b.tz - iz) * k), 109.4)), 1, 0.4);   // he won't chase it out of bounds
    }
    if (!isOff) {
      const dl = hyp(p.x - b.tx, p.z - b.tz), mine = g.opts.humans[p.team] && !g.opts.humans[1 - p.team];
      const react = mine ? Math.max(cfg.react, 0.3) : cfg.react;
      const tr = g.players[b.target];
      // the man covering the target stays in his hip pocket, then attacks the catch point
      if (tr && p.assign === b.target) {
        if (since < react * 0.5) return seek(p, tr.x + (b.tx - tr.x) * 0.3, tr.z + (b.tz - tr.z) * 0.3, Math.max(ai, 0.95), 0.2);
        return seek(p, b.tx, b.tz, Math.max(ai, 0.97) + 0.06, 0.3);
      }
      if (since > react * 0.6 && dl < (mine ? 14 : 20)) {
        // nearby: drive on the receiver and the ball together so he's there to contest or make the tackle
        const k = clamp(since / ((b.T || 1) * 0.8), 0, 1), rx = tr ? tr.x : b.tx, rz = tr ? tr.z : b.tz;
        return seek(p, rx + (b.tx - rx) * k, rz + (b.tz - rz) * k, Math.max(ai, 0.95) + 0.05, 0.3);
      }
      if (p.role.startsWith('DL')) return seek(p, b.tx, b.tz, 0.55);
      // everyone else rallies to where the ball is coming down instead of standing in his zone
      if (since > react) return seek(p, b.tx, b.tz - dirOf(P.off) * -2, ai * 0.92, 1);
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
    const tx = clamp(P.bx - w[0] * d, -HALF_W + 1.2, HALF_W - 1.2), tz = zOf(P.off, Math.min(prog(P.off, P.los + w[1] * d), 108));   // stay in bounds and inside the back line
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
    if (nd && best < 3) { let dx = p.x - nd.x, dz = p.z - nd.z; if (Math.abs(p.x) > HALF_W - 3 && dx * p.x > 0) dx = 0; if (prog(P.off, p.z) > 105 && dz * d > 0) dz = 0; const l = hyp(dx, dz); if (l < 0.01) return { x: 0, z: 0, s: 0 }; return { x: dx / l, z: dz / l, s: 0.35 }; }   // find space, but not out of bounds
    return { x: 0, z: 0, s: 0 };
  }
  let x = p.ldx, z = p.ldz;
  if (Math.abs(p.x) > HALF_W - 1.5 && Math.sign(x) === Math.sign(p.x)) x = 0;
  if (prog(P.off, p.z) > 107 && z * d > 0) { z = 0; if (!x) return { x: 0, z: 0, s: 0 }; }   // settle at the back of the end zone
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
    for (const q of g.players) if (q.team !== p.team && q.stun <= 0 && q.engagedBy < 0 && dist(p, q) < 1.75 && ((q.x - p.x) * (q.vx - p.vx) + (q.z - p.z) * (q.vz - p.vz)) < 0 && g.rng() < 0.12 + p.rt.elu / 100 * 0.25) { if (p.size > 1.05 && g.rng() < 0.5) p.truck = 0.5; else p.juke = 0.35; p.jukeCd = 1.6; g.events.push('juke'); break; }
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
    const dd = hyp(p.x - L.x, p.z - L.z) - (p.playBall > 0 ? 0.8 : 0) - (p.rdive > 0 && p.dive > 0 ? 1.4 : 0);   // jumping or laying out extends your reach
    if (p.team === offTeam) { if (RECEIVERS.includes(p.role) && dd < dO) { dO = dd; ro = p; } }
    else if (dd < dD) { dD = dd; rd = p; }
  }
  const myD = rd && g.opts.humans[rd.team] && g.ctrl[rd.team] === rd.id;   // only the defender you control gets the bigger contest range
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
    else if ((dD < 0.5 && dD < dO - 0.6) || (edge < -0.6 && dD < 1.1 && (defPlay || timing(rd) > 0.45))
      || (myD && dD < 1.0 && dD < dO - 0.15) || (myD && defPlay && edge < -0.3 && dD < 1.5)
      || (myD && defPlay && timing(rd) > 0.3 && dD < 0.95 && dD <= dO + 0.35)) outcome = 'int';   // you went up with good timing and it hit your hands: yours   // you beat him to it: it's yours   // ball thrown into the defender's chest gets picked
    else outcome = 'inc';
  } else if (cO) {
    // open-ish: how hard was this catch? reaching for it, a defender closing on him, running full speed across the field
    const near = rd ? dD : 9, spdK = hyp(ro.vx, ro.vz) / (ro.max || 8);
    const hot = Math.max(0, (b.pw || 0.6) - 0.9) * 0.45 + Math.max(0, (b.pwOff || 0) - 0.1) * 0.5;   // a fastball he wasn't ready for
    const need = Math.max(0, dO - 0.55) * 0.55 + (near < 3.1 ? (3.1 - near) * 0.21 : 0) + (spdK > 0.85 ? 0.07 : 0) + hot + 0.02;
    outcome = (ro.rt.hands * wx) / 100 * 0.9 - 0.27 + timing(ro) * 0.25 + noise() > need ? 'catch' : 'inc';
    if (outcome === 'inc' && !g.flash) g.flash = { text: near < 2.6 ? 'BROKEN UP' : 'DROPPED', until: 1.0 };
  } else if (ro && !outOfBounds && dO < 3.0 && (!rd || dD > dO + 0.4)) {
    // just out of reach: he lays out for it if he's fast and sure-handed enough
    const reachOk = (ro.rt.hands * wx) / 100 * 1.2 + timing(ro) * 0.4 + (ro.playBall > 0 ? 0.15 : 0) - (dO - 1.7) * 0.45 + noise();
    if (reachOk > 0.78) { outcome = 'catch'; diving = true; }
  } else if (cD) {
    // only a defender there: a pick if he's in front of it and timed it, otherwise he knocks it down
    // thrown right at him (within arm's length) is a pick almost every time; farther away he needs timing or ball skills
    const pick = (1.4 - dD) * 0.9 + timing(rd) * 0.6 + rd.rt.cov / 100 * 0.4 + noise();
    outcome = (dD < 0.45) || (myD && dD < 1.1) || (pick > 1.3 && dD < 0.9) || (myD && defPlay && pick > 0.95 && dD < 1.7) ? 'int' : 'inc';   // the ball's coming right at you = you catch it
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
  // feet have to be in bounds: a catch made on or past the sideline (or out the back of the end zone) is incomplete
  if ((outcome === 'catch' || outcome === 'int') && (() => { const q = outcome === 'catch' ? ro : rd; return q && (Math.abs(q.x) > HALF_W - 0.15 || prog(q.team === offTeam ? offTeam : 1 - offTeam, q.z) > 109.9); })()) {
    outcome = 'inc'; g.flash = { text: 'OUT OF BOUNDS', until: 1.2 };
  }
  if (outcome === 'catch' && ro.rdive > 0 && ro.dive > 0) diving = true;   // you laid out for it
  if (outcome !== 'catch' && ro && ro.rdive > 0 && ro.dive > 0 && !g.flash) g.flash = { text: 'CAN\'T REEL IT IN', until: 1.0 };
  if (outcome === 'catch') {
    b.state = 'held'; b.carrier = ro.id;
    P.catchZ = ro.z; ro.caughtAt = g.t;
    ro.vx *= 0.45; ro.vz *= 0.45; ro.secureT = 0.3;   // securing the catch costs a step
    if (diving) {
      ro.x = L.x; ro.z = L.z; ro.warpT = g.t; ro.dive = 0.55; ro.vx *= 0.3; ro.vz *= 0.3;
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
    g.events.push('int'); if (offTeam === 0) g.events.push('boo');   // the home crowd hates a pick
    if (P.isPat) return endPlay(g, 'patfail', rd);
  } else {
    b.x = L.x; b.z = L.z; b.y = 0.2;
    g.events.push(cD ? 'breakup' : 'incomplete');
    endPlay(g, 'incomplete', null, null, defPlay ? 'SWATTED!' : cD ? 'PASS BROKEN UP' : null);
  }
}

// ---------------- end of play ----------------
// someone celebrates after the whistle: the guy who made the play (or whoever that team controls) does the dance,
// the camera swings over to watch, and the break gets long enough to see it
function startCel(g, team, id) {
  if (g.phase !== 'dead' || g.opts.practice || g.opts.drill) return;
  const mine = g.players.filter(p => p.team === team); if (!mine.length) return;
  let star = mine.find(p => p.scorer);
  if (!star) { const c = g.players[g.ball.carrier], cp = g.players[g.ctrl[team]];
    star = c && c.team === team ? c : cp && cp.team === team ? cp : mine.reduce((a, p) => Math.hypot(p.x - g.ball.x, p.z - g.ball.z) < Math.hypot(a.x - g.ball.x, a.z - g.ball.z) ? p : a); }
  for (const p of g.players) { if (p.team !== team) p.scorer = 0; p.celReset = 1; }
  star.scorer = 1; g.celebrate = team; g.celBy = star.id;
  if (id !== undefined) g.opts.cel[team] = id;
  g.events.push('cel' + (g.opts.cel[team] >= 0 ? g.opts.cel[team] : 0));
  g.deadDur = Math.max(g.deadDur, g.phaseT + 4);
}
function touchdown(g, c) {
  const t = c.team, P = g.play;
  if (P.flag && !P.isPat && t === P.off && PEN[P.flag.type].off && !P.turnover) { if (enforceFlag(g, 100, false, false)) { g.msg.sub += ' · touchdown wiped out'; return; } }
  if (P.flag && !P.isPat) { const F = P.flag; P.flag = null; if (!PEN[F.type].off && t === P.off) g.flagNote = `${PEN[F.type].name} on ${TEAMS[g.opts.teams[F.on]].abbr}, declined`; }
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = 3.4; g.runoff = 0;
  g.celebrate = t; g.celBy = c.id; c.scorer = 1; g.events.push('cel' + (g.opts.cel[t] >= 0 ? g.opts.cel[t] : 0));
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
  if (P.isReturn && c) {
    const t = c.team, p = prog(t, c.z), yds = Math.round(p - prog(t, P.los));
    if (p <= 0) { g.poss = t; g.losZ = zOf(t, 20); g.msg = { text: 'TOUCHBACK', sub: '', until: 2 }; }
    else { g.poss = t; g.losZ = zOf(t, clamp(p, 1, 99)); g.msg = { text: kind === 'oob' ? 'RETURN, OUT OF BOUNDS' : 'PUNT RETURN', sub: `${yds} yard return · ${c.rt.name}`, until: 2.2 }; if (yds >= 20) highlight(g, `${yds}-YARD RETURN`, c.rt.name, t); }
    g.ballX = clamp(c.x * 0.5, -9, 9); setFirstDown(g);
    return;
  }
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
    poss: g.poss, los: r2(g.losZ), fd: r2(g.fdZ), bx: r2(g.ballX), dn: g.down, tg: Math.max(1, Math.round(g.togo)),
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
        | (p.wrapAt !== undefined && g.t - p.wrapAt < 1.2 ? 8192 : 0) | (p.caughtAt !== undefined && g.t - p.caughtAt < 0.5 ? 16384 : 0) | (p.fallBack ? 32768 : 0) | (p.oneHandAt !== undefined && g.t - p.oneHandAt < 0.6 ? 65536 : 0) | (p.truck > 0 ? 131072 : 0),
      r2(p.stam), r2(p.size), p.rt.name, POS_LABEL[p.role], r2(p.moveCd), p.rt.face || faceSeed(p.rt.first + p.rt.last + p.num)]),
    b: [r2(g.ball.x), r2(g.ball.y), r2(g.ball.z), g.ball.state === 'air' ? 1 : g.ball.state === 'kick' ? 2 : g.ball.state === 'loose' ? 3 : 0,
      g.ball.state === 'air' && !g.ball.auto ? [r2(g.ball.tx), r2(g.ball.tz)] : null, g.ball.carrier ?? -1],
    st: g.stats,
    ql: g.opts.quarterLen,
    can4: g.down === 4 ? { fg: canFG(g), fgd: fgDistance(g) } : null,
    sp: { fg: canFG(g), fgd: fgDistance(g), pat: g.pat === g.poss },
    pat: g.pat, form: g.form,
    opDef: g.phase === 'presnap' && g.offPlay ? (() => { const q = getPlay(g, g.poss, g.offPlay); return q && q.routes ? { form: q.form, routes: Object.fromEntries(Object.entries({ ...q.routes, ...g.hot }).filter(([, v]) => v && v.length)), qbPath: q.qbPath || null, hot: Object.keys(g.hot), type: q.type } : null; })() : null,
    bT: g.ball.state === 'air' && !g.ball.auto ? r2(g.ball.T - g.ball.t) : -1,
    ks: g.phase === 'kickset' && g.ks ? { type: g.ks.type, stage: g.ks.stage, m: r2(g.ks.m), aim: r2(g.ks.aim), power: r2(g.ks.power), fd: g.ks.fd, maxR: r2(g.ks.maxR), sweet: KICK_SWEET } : null,
    celBy: g.phase === 'dead' && g.celebrate >= 0 ? (g.celBy ?? -1) : -1, deadLeft: g.phase === 'dead' ? r2(Math.max(0, g.deadDur - g.phaseT)) : 0,
    osd: g.onside ? g.onside.slice() : [false, false], flip: !!g.flip, mot: g.motion ? (g.motion.t >= 1 ? 2 : 1) : 0, lp: g.lastPlay ? g.lastPlay.slice() : [null, null],
    to: g.to.slice(), pcMax: 25, ac: g.ac ? { n: g.ac.n, why: g.ac.why } : null,
    inj: injuryReport(g), injAsk: g.injAsk.slice(), depth: g.depth, subAsk: g.subAsk.slice(), bv: g.benchV,
    bench: (g.snapN = (g.snapN || 0) + 1) % 45 === 1 || g.benchSent !== g.benchV ? (g.benchSent = g.benchV, benchReport(g)) : undefined, fat: g.fat, msgInj: g.msgInj || null,
    wind: g.opts.wind, wx: g.opts.weather, tod: g.opts.tod, mom: Math.round(g.mom), cel: g.opts.cel, mode: g.opts.practice ? 'practice' : g.opts.drill ? 'drill' : 'game',
    hls: g.phase === 'gameover' || g.phase === 'half' ? g.hl : null,
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
// if something ever goes wrong mid-play, end the play cleanly and line up the next one instead of freezing
export function recover(g) {
  try {
    if (g.phase === 'gameover') return;
    g.ks = null; g.kick = null;
    if (g.play) { g.play.flag = null; g.play.turnover = false; }
    g.phase = 'dead'; g.phaseT = 0; g.deadDur = 0.6; g.runoff = 0;
    g.msg = { text: 'PLAY RESET', sub: '', until: 1.2 };
  } catch (_) {}
}
export const __test = { alignOffense: (g) => alignOffense(g, true), setup: (g) => setupPlay(g) };
