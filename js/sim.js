// ENDZONE KINGS — game simulation (no DOM, runs in browser or Node)
// Units are yards. Team 0 attacks +z (scores at z >= 100), team 1 attacks -z (scores at z <= 0).
// x is sideline-to-sideline, |x| <= 26.65 is in bounds.

export const HALF_W = 26.65;

import { TEAMS, getRoster, POS_LABEL } from './teams.js?v=1792199425';
export { TEAMS };

export const OFF_ROLES = ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB'];
export const DEF_ROLES = ['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S'];
export const RECEIVERS = ['WR1', 'WR2', 'RB']; // keys 1,2,3

import { FORMS, LINE, OFF_PLAYS, DEF_PLAYS, KICK_PLAYS, OFF_CATS, DEF_CATS, OFF_STYLES, DEF_STYLES, teamPlaybook, cleanCustom } from './playbook.js?v=1792199425';
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
};
const DEF_ALIGN = {
  DL1: [-2.3, 0.9], DL2: [0.2, 0.9], DL3: [2.3, 0.9], LB: [0, 5.5],
  CB1: [-13, 6], CB2: [13, 6], S: [0, 13],
};
function offAlign(form) { const f = FORMS[form] || FORMS.gun; return { ...LINE, QB: f.QB, RB: f.RB, WR1: f.WR1, WR2: f.WR2 }; }

const DIFF = [
  { name: 'Rookie', ai: 0.85, shed: 0.08, intP: 0.26, qbErr: 1.6, react: 0.45, brk: 0.04 },
  { name: 'Pro',    ai: 0.91, shed: 0.12, intP: 0.38, qbErr: 1.05, react: 0.32, brk: 0.08 },
  { name: 'All-Pro', ai: 0.96, shed: 0.16, intP: 0.5, qbErr: 0.65, react: 0.22, brk: 0.12 },
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
    custom: [{}, {}], pat: -1, books: [0, 1].map(k => teamPlaybook((opts.teams || [3, 15])[k], TEAMS[(opts.teams || [3, 15])[k]])),
  };
  g.losZ = zOf(first, 25);
  setFirstDown(g);
  setupPlay(g);
  g.msg = { text: 'KICKOFF', sub: TEAMS[o.teams[first]].name + ' ball', until: 2.2 };
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

function mkStats() { return { passYds: 0, rushYds: 0, comp: 0, att: 0, tds: 0, ints: 0, sacks: 0, firstDowns: 0 }; }

function setFirstDown(g) {
  const p = prog(g.poss, g.losZ);
  const fd = Math.min(100, p + 10);
  g.fdZ = zOf(g.poss, fd);
  g.togo = fd - p;
  g.down = 1;
}

function makePlayer(g, id, team, unit, role, x, z) {
  const r = ROSTER[role];
  const rt = getRoster(g.opts.teams[team]).players[role];
  const d = dirOf(g.poss);
  const faceOff = d > 0 ? 0 : Math.PI;
  return {
    id, team, unit, role, num: rt.num, size: r.size, max: r.spd * (0.88 + rt.spd / 100 * 0.15), rt,
    x, z, vx: 0, vz: 0, face: unit === 'off' ? faceOff : faceOff + Math.PI,
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
  ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB'].forEach((role, i) => { const p = rel(g, ...oa[role]); g.players.push(makePlayer(g, i, off, 'off', role, p.x, p.z)); });
  DEF_ROLES.forEach((role, i) => { const p = rel(g, ...DEF_ALIGN[role]); g.players.push(makePlayer(g, 7 + i, def, 'def', role, p.x, p.z)); });
  const c = g.players[1];
  g.ball = { state: 'held', carrier: 1, x: c.x, y: 0.3, z: g.losZ, auto: false };
  g.offPlay = null; g.defPlay = 'cover1'; g.defChosen = false; g.playClock = 25;
  g.ctrl = [-1, -1];
  g.ctrl[off] = 0; // QB
  g.ctrl[def] = byRole(g, 'LB').id;
  g.kick = null; g.celebrate = -1;
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
  const wr = { WR1: byRole(g, 'WR1'), WR2: byRole(g, 'WR2') };
  const d = dirOf(g.poss);
  for (const p of g.players) if (p.unit === 'def') {
    let [lx, lz] = DEF_ALIGN[p.role];
    const man = dp.man && dp.man[p.role];
    if (man && wr[man]) { lx = null; lz = dp.press ? 1.6 : 6; }
    if (dp.zone && dp.zone[p.role] && !p.role.startsWith('DL')) { const z = dp.zone[p.role]; lx = p.role.startsWith('CB') ? null : z[0]; lz = Math.min(z[1], p.role === 'S' ? 16 : 9); }
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
  const cat = pickW(g.rng, w);
  const pool = book.def.map(id => DEF_PLAYS.find(q => q.id === id)).filter(q => q && q.cat === cat);
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
  if (g.phase === 'presnap') {
    if (team === g.poss) {
      if (ev.t === 'play') {
        if (ev.def) { const c = cleanCustom(ev.def); if (c) g.custom[team][c.id] = c; }
        const pl = getPlay(g, team, ev.id);
        if (!pl || pl.side === 'def' || DEF_PLAYS.includes(pl)) return;
        const isPat = g.pat === team;
        if (pl.id === 'xp' && !isPat) return;
        if ((pl.id === 'fg' && (!canFG(g) || isPat)) || (pl.id === 'punt' && isPat)) return;
        if ((pl.id === 'fakepunt' || pl.id === 'fakefg') && isPat) return;
        g.offPlay = pl.id; alignOffense(g);
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
  const order = ['LB', 'S', 'CB1', 'CB2', 'DL1', 'DL2', 'DL3'];
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

function snap(g) {
  const P = g.play;
  if (g.offPlay === 'punt' || g.offPlay === 'fg' || g.offPlay === 'xp') { startKick(g, g.offPlay); return; }
  const play = getPlay(g, g.poss, g.offPlay);
  P.type = play.type; P.playDef = play; P.snapT = g.t;
  P.readT = 1.7 + g.rng() * 1.1;
  P.def = 1 - g.poss;
  g.phase = 'live'; g.phaseT = 0;
  g.events.push('snap');
  for (const p of g.players) {
    p.x = p.hx; p.z = p.hz;
    if (play.routes[p.role]) { p.route = play.routes[p.role]; p.ri = 0; }
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
  byRole(g, 'C').blockOn = byRole(g, 'DL2').id;
  byRole(g, 'LG').blockOn = byRole(g, 'DL1').id;
  byRole(g, 'RG').blockOn = byRole(g, 'DL3').id;
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
  const a = g.rng() * Math.PI * 2, e = err * Math.sqrt(g.rng());
  const tx = L.x + Math.cos(a) * e, tz = L.z + Math.sin(a) * e;
  const D = hyp(tx - qb.x, tz - qb.z);
  g.ball.x = qb.x; g.ball.z = qb.z; g.ball.y = 1.9;
  launchBall(g, tx, tz, Math.max(0.4, D / speed), 0.7 + D * 0.12, r.id, false);
  P.thrown = true; P.target = r.id; P.throwT = g.t; qb.throwAt = g.t;
  g.stats[P.off].att++;
  g.events.push('throw');
  if (g.opts.humans[P.off]) g.ctrl[P.off] = r.id;
}

// ---------------- kicks ----------------
function startKick(g, type) {
  const off = g.poss, d = dirOf(off);
  const p = prog(off, g.losZ);
  g.phase = 'kick'; g.phaseT = 0;
  const k = { type, t: 0 };
  k.fx = g.ballX; k.fz = g.losZ - 7 * d;
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
    if (k.type === 'xp') {
      if (k.good) { score(g, off, 1); g.events.push('score'); }
      g.msg = k.good ? { text: 'EXTRA POINT GOOD', sub: '', until: 2 } : { text: 'EXTRA POINT NO GOOD', sub: '', until: 2 };
      g.pat = -1; kickoffTo(g, 1 - off);
    } else if (k.type === 'punt') {
      g.poss = 1 - off; g.losZ = zOf(g.poss, k.newP); g.ballX = 0; setFirstDown(g);
      g.msg = k.result === 'touchback' ? { text: 'TOUCHBACK', sub: `${k.yds} yd punt`, until: 2 } : { text: 'PUNT', sub: `${k.yds} yards`, until: 2 };
      sudden(g);
    } else if (k.good) {
      score(g, off, 3);
      g.msg = { text: 'IT’S GOOD!', sub: `${k.dist} yd field goal`, until: 2.6, big: true };
      g.events.push('score');
      kickoffTo(g, 1 - off);
      g.deadDur = 2.8;
    } else {
      g.msg = { text: 'NO GOOD', sub: `${k.dist} yd attempt`, until: 2.2 };
      g.poss = 1 - off; g.ballX = 0; setFirstDown(g);
      sudden(g);
    }
  }
}

function score(g, team, pts) {
  g.score[team] += pts;
  if (g.quarter >= 5) { g.otScored = true; }
}
function sudden(g) { /* placeholder for possession change hooks */ }

function kickoffTo(g, team) {
  g.poss = team; g.losZ = zOf(team, 25); g.ballX = 0; setFirstDown(g);
}

// ---------------- main step ----------------
export function step(g, dt, inputs = [{}, {}]) {
  if (g.phase === 'gameover') return;
  g.t += dt; g.phaseT += dt;
  if (g.msg && (g.msg.until -= dt) <= 0) g.msg = null;
  if (g.flash && (g.flash.until -= dt) <= 0) g.flash = null;
  for (let t = 0; t < 2; t++) {
    if (!g.opts.humans[t]) continue;
    const evs = inputs[t] && inputs[t].ev;
    if (evs) for (const ev of evs) handleEvent(g, t, ev);
  }
  if (g.phase === 'presnap') return updatePresnap(g, dt, inputs);
  if (g.phase === 'live') return updateLive(g, dt, inputs);
  if (g.phase === 'kick') return updateKick(g, dt);
  if (g.phase === 'dead') {
    for (const p of g.players) { p.vx *= Math.max(0, 1 - dt * 4); p.vz *= Math.max(0, 1 - dt * 4); p.x += p.vx * dt; p.z += p.vz * dt; }
    if (g.ball.state === 'held' && g.players[g.ball.carrier]) { const c = g.players[g.ball.carrier]; g.ball.x = c.x; g.ball.z = c.z; }
    if (g.phaseT >= g.deadDur) nextPlay(g);
  }
}

function updatePresnap(g, dt, inputs) {
  g.playClock -= dt;
  const off = g.poss, def = 1 - off;
  for (const p of g.players) {
    if (g.opts.humans[def] && g.ctrl[def] === p.id) continue;
    const dx = p.hx - p.x, dz = p.hz - p.z, l = hyp(dx, dz);
    if (l > 0.05) { const st = Math.min(l, 7 * dt); p.x += dx / l * st; p.z += dz / l * st; p.vx = dx / l * (l > 0.3 ? 5 : 0); p.vz = dz / l * (l > 0.3 ? 5 : 0); p.face = Math.atan2(dx, dz); }
    else { p.vx = 0; p.vz = 0; p.face = p.unit === 'off' ? (dirOf(off) > 0 ? 0 : Math.PI) : (dirOf(off) > 0 ? Math.PI : 0); }
  }
  // let defensive human shuffle a little pre-snap
  if (g.opts.humans[def]) {
    const me = g.players[g.ctrl[def]], inp = inputs[def] || {};
    if (me && (inp.mx || inp.mz)) {
      const d = dirOf(off);
      const home = { x: me.hx, z: me.hz };
      me.x = clamp(me.x + (inp.mx || 0) * 3 * dt, home.x - 4, home.x + 4);
      const nz = me.z + (inp.mz || 0) * 3 * dt;
      // keep on defensive side of the ball
      me.z = (nz - g.losZ) * d < 0.8 ? g.losZ + 0.8 * d : nz;
    }
  }
  if (!g.opts.humans[off]) {
    if (!g.offPlay) cpuCallOffense(g);
    const humanDef = g.opts.humans[def];
    const ready = !humanDef ? g.phaseT > 2.0 : (g.defChosen ? g.phaseT > 2.2 : g.phaseT > 7);
    if (ready || g.playClock <= 0) snap(g);
  } else if (g.playClock <= 0) {
    if (!g.offPlay) { g.offPlay = g.pat === off ? 'xp' : 'dive'; alignOffense(g); }
    snap(g);
  }
}

function nextPlay(g) {
  if (g.runoff) { g.clock = Math.max(0, g.clock - g.runoff); g.runoff = 0; }
  if (g.otScored) return endGame(g);
  if (g.clock <= 0 && g.pat < 0) {
    const q = g.quarter;
    if (q === 2) {
      g.quarter = 3; g.clock = g.opts.quarterLen;
      kickoffTo(g, 1 - g.firstReceiver);
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
    const rt = P.type === 'run' ? (pd.hand || pd.pitch || 0) + 0.3 + cfg.react : 99;
    if (tl > rt || P.crossed || (b.state === 'held' && b.carrier !== 0 && b.carrier !== -1 && P.thrown)) P.recognized = true;
  }

  const carrier = b.state === 'held' ? g.players[b.carrier] : null;
  const pocket = P.type === 'pass' && !P.thrown && !P.crossed && carrier && carrier.id === 0;
  const airPass = b.state === 'air' && !b.auto;

  // AI QB decision
  if (pocket && !g.opts.humans[P.off]) aiQB(g, tl);

  // desired velocities
  for (const p of g.players) {
    const human = g.opts.humans[p.team] && g.ctrl[p.team] === p.id;
    const inp = human ? (inputs[p.team] || {}) : null;
    let want; // {x,z,s} direction * speedFactor
    const idle = !inp || (Math.abs(inp.mx || 0) + Math.abs(inp.mz || 0) < 0.12);
    if (human && !(idle && assistIdle(g, p, carrier))) {
      let mx = inp.mx || 0, mz = inp.mz || 0;
      if (p.id === 0 && pocket && tl < (pd.pa ? pd.pa + 0.1 : 0.5)) { want = qbPocketMove(g, p); }
      else if (P.type === 'run' && p.id === 0 && !P.handed) { want = aiMove(g, p, carrier, pocket, airPass, tl); }
      else {
        const l = hyp(mx, mz); if (l > 1) { mx /= l; mz /= l; }
        const canSprint = inp.sprint && p.stam > 0.05;
        if (canSprint && l > 0.1) p.stam = Math.max(0, p.stam - dt * 0.24); else p.stam = Math.min(1, p.stam + dt * 0.13);
        const s = canSprint ? 1 : 0.8;
        want = { x: mx, z: mz, s };
      }
    } else {
      want = aiMove(g, p, carrier, pocket, airPass, tl);
      p.stam = Math.min(1, p.stam + dt * 0.13);
    }
    applyMove(g, p, want, dt);
  }

  updateBlocks(g, dt, pocket);
  separate(g);

  // ball
  if (b.state === 'held') {
    const c = g.players[b.carrier];
    b.x = c.x + Math.sin(c.face) * 0.35; b.z = c.z + Math.cos(c.face) * 0.35; b.y = 1.15;
  } else if (b.state === 'air') {
    b.t += dt;
    const s = Math.min(1, b.t / b.T);
    b.x = b.fx + (b.tx - b.fx) * s; b.z = b.fz + (b.tz - b.fz) * s;
    b.y = b.fy + (1.3 - b.fy) * s + 4 * b.h * s * (1 - s);
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
      const tr = (d.dive > 0 ? 1.9 : 1.3) * (0.5 + 0.5 * (d.size + c2.size) / 2);
      if (dist(d, c2) < tr) {
        const humanCarrier = g.opts.humans[ct] && g.ctrl[ct] === c2.id;
        let brk = c2.role === 'RB' ? cfg.brk + 0.06 : cfg.brk;
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
        if (g.rng() < brk) {
          d.stun = 0.85; d.fallen = 0.85; d.tackleCd = 1.2; d.dive = 0;
          c2.vx *= 0.6; c2.vz *= 0.6;
          g.events.push('brokentackle');
          g.flash = { text: 'BROKEN TACKLE', until: 1.0 };
        } else {
          c2.fallen = 3; d.fallen = 3;
          // tackler wraps up: drive him into the carrier
          const ux = c2.x - d.x, uz = c2.z - d.z, ul = hyp(ux, uz) || 1;
          d.vx = ux / ul * 3 + c2.vx * 0.5; d.vz = uz / ul * 3 + c2.vz * 0.5; d.face = Math.atan2(ux, uz);
          c2.face = Math.atan2(c2.vx || ux, c2.vz || uz);
          g.events.push(c2.vx * c2.vx + c2.vz * c2.vz > 30 ? 'bighit' : 'tackle');
          return endPlay(g, 'tackle', c2, d);
        }
      }
    }
  }
  if (!P.isPat) g.clock = Math.max(0, g.clock - dt);
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

function separate(g) {
  const ps = g.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.fallen > 0 || b.fallen > 0) continue;
    if (a.team !== b.team && (g.ball.state === 'held') && (g.ball.carrier === a.id || g.ball.carrier === b.id)) continue;
    if (a.team === b.team && g.phase === 'live' && g.phaseT < 1.6 && ((a.role === 'QB' && b.role === 'RB') || (a.role === 'RB' && b.role === 'QB'))) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz), m = R * (a.size + b.size);
    if (d < m && d > 1e-4) {
      const push = (m - d) / 2, nx = dx / d, nz = dz / d;
      const wa = b.size / (a.size + b.size), wb = a.size / (a.size + b.size);
      a.x -= nx * push * 2 * wa; a.z -= nz * push * 2 * wa;
      b.x += nx * push * 2 * wb; b.z += nz * push * 2 * wb;
    }
  }
}

function updateBlocks(g, dt, pocket) {
  const cfg = g.cfg;
  for (const bl of g.players) {
    if (bl.blockOn < 0 || bl.stun > 0) continue;
    const t = g.players[bl.blockOn];
    if (!t || t.shedCd > 0 || (g.ball.state === 'held' && g.ball.carrier === t.id)) { bl.blockOn = -1; continue; }
    if (t.engagedBy < 0 && dist(bl, t) < 1.25) t.engagedBy = bl.id;
  }
  for (const t of g.players) {
    if (t.engagedBy < 0) continue;
    const bl = g.players[t.engagedBy];
    if (!bl || dist(bl, t) > 1.9 || bl.stun > 0 || bl.blockOn !== t.id) { t.engagedBy = -1; continue; }
    const line = t.role.startsWith('DL') && g.phaseT < 2.6;
    let rate = (pocket || line) ? cfg.shed * (pocket ? 1 : 1.4) : cfg.shed * 2.2 + 0.3;
    rate *= (0.5 + Math.max(t.rt.rush, t.rt.tkl * 0.8) / 100) / (0.5 + bl.rt.blk / 100);
    if (g.rng() < rate * dt) {
      t.engagedBy = -1; t.shedCd = 1.3; bl.stun = 0.4; bl.blockOn = -1;
      g.events.push('shed');
    }
  }
}

// ---------------- AI movement ----------------
function aiMove(g, p, carrier, pocket, airPass, tl) {
  const P = g.play, b = g.ball, cfg = g.cfg, ai = cfg.ai;
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
    if (p.id === b.target) return seek(p, b.tx, b.tz, 1, 0.4);
    if (!isOff) {
      const dl = hyp(p.x - b.tx, p.z - b.tz);
      if (since > cfg.react && (p.assign === b.target || dl < 13)) return seek(p, b.tx, b.tz, ai + 0.04, 0.3);
      if (p.role.startsWith('DL')) return seek(p, b.tx, b.tz, 0.5);
    } else if (p.role.startsWith('WR') || p.role === 'RB') {
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
    const isOL = p.role === 'C' || p.role === 'LG' || p.role === 'RG';
    if (isOL && pd.screen && tl > pd.screen) {
      // screen: linemen release and lead the way
      p.blockOn = -1;
      const rb = byRole(g, 'RB'), side = rb.x - P.bx;
      const t = { x: rb.x + Math.sign(side || 1) * -1.5 + (p.id - 2) * 2, z: P.los + 2.5 * d };
      return seek(p, t.x, t.z, 0.9);
    }
    if (isOL) return passBlock(g, p, qb);
    if (pd.block && pd.block.includes(p.role) && P.type === 'pass') {
      if (p.role === 'RB') { if (p.route && p.ri < p.route.length) return { ...routeMove(g, p), s: ai }; return passBlock(g, p, qb); }
      return stalk(g, p);
    }
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
  if (pdx.pa && !P.recognized && tl < pdx.pa + g.cfg.react * 0.8 && (p.role === 'LB' || p.role === 'S') && mode !== 'man') {
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
    const sc = Math.min(sep, 6) + gain * 0.06 - (gain < 0 ? 1 : 0) - L.T * 0.4 + (g.rng() - 0.5) * 0.5;
    if (sc > bs) { bs = sc; best = r; }
  }
  const urgent = pressure < 2.3;
  const want = tl > P.readT ? 2.2 : 3.4;
  if (best && ((tl > 1.3 && bs > want) || (urgent && bs > 0.8) || tl > 4.6)) {
    throwBall(g, qb, best, cfg.qbErr * (urgent ? 1.5 : 1) * (1.45 - qb.rt.acc / 100));
  } else if (urgent && tl > 1.2 && !P.scramble && g.rng() < 0.02) {
    P.scramble = true;
  }
}

function carrierSteer(g, p, s) {
  const d = dirOf(p.team);
  let fx = 0, fz = d * 1.0;
  for (const q of g.players) {
    if (q.team === p.team || q.stun > 0) continue;
    const dx = p.x - q.x, dz = p.z - q.z, l = hyp(dx, dz);
    if (l > 7 || q.engagedBy >= 0) continue;
    const ahead = -dz * d > -1.5; // defender in front-ish
    const w = (ahead ? 1.6 : 0.5) / Math.max(0.8, l * l) * 4;
    fx += (dx / l) * w * 1.4; fz += (dz / l) * w * 0.6;
  }
  if (p.x > HALF_W - 4) fx -= (p.x - (HALF_W - 4)) * 0.6;
  if (p.x < -HALF_W + 4) fx += (-HALF_W + 4 - p.x) * 0.6;
  if (fz * d < 0.25) fz = 0.25 * d;
  const l = hyp(fx, fz) || 1;
  // AI juke
  if (p.jukeCd <= 0) {
    for (const q of g.players) if (q.team !== p.team && q.stun <= 0 && dist(p, q) < 1.9 && g.rng() < 0.05) { p.juke = 0.35; p.jukeCd = 1.6; g.events.push('juke'); break; }
  }
  return { x: fx / l, z: fz / l, s: Math.min(1, s) };
}

function pursue(g, p, c, s) {
  const l = dist(p, c);
  const t = Math.min(1.1, l / (p.max + 0.1)) * 0.85;
  const tx = c.x + c.vx * t, tz = c.z + c.vz * t;
  return seek(p, tx, tz, Math.min(1, s + 0.1), 0.2);   // pursuit is full effort
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
  if (p.blockOn < 0) {
    let best = null, bd = 1e9;
    for (const q of g.players) if (q.team !== p.team && (q.role.startsWith('CB') || q.role === 'S')) {
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
  for (const r of g.players) if (r.team === P.off && RECEIVERS.includes(r.role)) { const dd = hyp(r.x - home.x, r.z - home.z); if (dd < nd) { nd = dd; near = r; } }
  let tx = home.x, tz = home.z;
  if (near && nd < 10) {
    tx = home.x + (near.x - home.x) * 0.7;
    const deep = (near.z - P.los) * d, myDeep = (home.z - P.los) * d;
    const td = myDeep < 10 ? Math.min(myDeep + 2, Math.max(deep, myDeep - 2)) : Math.max(myDeep * 0.7, deep + 2);
    tz = P.los + td * d;
  }
  return seek(p, tx, tz, s, 0.8);
}

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
  const cO = ro && dO < 1.5, cD = rd && dD < 1.4;
  const target = g.players[P.target];
  let outcome = 'inc';
  const defPlay = cD && rd.playBall > 0, offAgg = cO && ro.playBall > 0;
  if (outOfBounds) outcome = 'inc';
  else if (defPlay) {
    // defender timed the jump: big INT chance, otherwise it's batted down
    const cov = rd.rt.cov / 100;
    let pInt = (cO ? 0.22 : 0.34) + cov * 0.38 - (offAgg ? 0.15 : 0) - Math.max(0, dD) * 0.08;
    if (g.rng() < pInt) outcome = 'int';
    else if (cO && g.rng() < (offAgg ? 0.35 : 0.18)) outcome = 'catch';
    else outcome = 'inc';
  }
  else if (cO && cD) {
    const hands = 0.8 + ro.rt.hands / 100 * 0.22, cov = 0.6 + rd.rt.cov / 100 * 0.6;
    let pc = clamp((0.55 + (dD - dO) * 0.3) * hands / (0.7 + cov * 0.3) + (offAgg ? 0.12 : 0), 0.2, 0.9);
    if (rd.dive > 0) pc -= 0.1;
    if (g.rng() < pc) outcome = 'catch';
    else if (g.rng() < (dD < dO ? cfg.intP * 0.6 * cov : 0.12)) outcome = 'int';
  } else if (cO) {
    const hands = 0.8 + ro.rt.hands / 100 * 0.22;
    outcome = g.rng() < Math.min(0.98, (dO < 1.0 ? 0.92 : 0.82) * hands) ? 'catch' : 'inc';
  } else if (cD) {
    outcome = g.rng() < cfg.intP * (0.6 + rd.rt.cov / 100 * 0.6) ? 'int' : 'inc';
  }
  if (outcome === 'catch') {
    b.state = 'held'; b.carrier = ro.id;
    P.catchZ = ro.z;
    g.stats[offTeam].comp++;
    if (g.opts.humans[offTeam]) g.ctrl[offTeam] = ro.id;
    g.events.push('catch');
    if (ro !== target) {} // caught by a different receiver, fine
  } else if (outcome === 'int') {
    b.state = 'held'; b.carrier = rd.id;
    P.turnover = true; P.recognized = true;
    g.poss = rd.team;
    g.stats[offTeam].ints++;
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
  addYards(g, c, prog(t, zOf(t, 100)));
  g.msg = { text: 'TOUCHDOWN!', sub: `${c.rt.name} · ${TEAMS[g.opts.teams[t]].name}`, until: 3.2, big: true, team: t };
  g.events.push('td', 'whistle');
  if (g.quarter >= 5) { kickoffTo(g, 1 - t); return; }            // walk-off in OT
  g.pat = t; g.poss = t; g.losZ = zOf(t, 97); g.ballX = 0; setFirstDown(g);
}

function addYards(g, c, endP) {
  const P = g.play;
  if (P.turnover) return;
  const gained = endP - prog(P.off, P.los);
  if (P.thrown) g.stats[P.off].passYds += Math.round(gained);
  else g.stats[P.off].rushYds += Math.round(gained);
}

function endPlay(g, kind, c, tackler, note) {
  const P = g.play;
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = 2.1; g.runoff = 0;
  g.events.push('whistle');
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
  if (sack) g.stats[1 - ct].sacks++;
  g.losZ = zOf(ct, spot);
  if (p >= prog(ct, g.fdZ)) {
    setFirstDown(g);
    g.stats[ct].firstDowns++;
    g.msg = { text: 'FIRST DOWN', sub: `${c.rt.name} +${Math.max(0, gained)} yds`, until: 1.9 };
    g.events.push('firstdown');
  } else {
    g.down++;
    g.togo = Math.max(1, Math.round(prog(ct, g.fdZ) - spot));
    g.msg = sack ? { text: 'SACKED!', sub: `${tackler ? tackler.rt.name + ' · ' : ''}${gained} yds`, until: 1.9 }
      : kind === 'oob' ? { text: 'OUT OF BOUNDS', sub: `${c.rt.name} ${gained >= 0 ? '+' : ''}${gained} yds`, until: 1.9 }
      : { text: gained > 0 ? `GAIN OF ${gained}` : gained === 0 ? 'NO GAIN' : `LOSS OF ${-gained}`, sub: c.rt.name + (tackler ? ` · tackle ${tackler.rt.name}` : ''), until: 1.9 };
    checkDowns(g);
  }
}

function checkDowns(g) {
  if (g.down > 4) {
    g.poss = 1 - g.poss; g.ballX = clamp(g.ballX, -7, 7); setFirstDown(g);
    g.msg = { text: 'TURNOVER ON DOWNS', sub: '', until: 2.2 };
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
    msg: g.msg ? { text: g.msg.text, sub: g.msg.sub, big: !!g.msg.big } : null,
    flash: g.flash ? g.flash.text : null,
    win: g.winner,
    pl: g.players.map(p => [p.team, p.unit === 'off' ? 1 : 0, p.role, p.num, r2(p.x), r2(p.z), r2(p.face),
      r2(hyp(p.vx, p.vz)), (p.fallen > 0 ? 1 : 0) | (p.dive > 0 ? 2 : 0) | (p.juke > 0 ? 4 : 0) | (p.engagedBy >= 0 || p.blockOn >= 0 && g.players[p.blockOn] && g.players[p.blockOn].engagedBy === p.id ? 8 : 0)
        | (p.throwAt !== undefined && g.t - p.throwAt < 0.5 && g.phase === 'live' ? 16 : 0) | (reaching(g, p) ? 32 : 0)
        | (g.phase === 'dead' && g.celebrate === p.team ? 64 : 0) | (p.scorer && g.phase === 'dead' ? 128 : 0)
        | (p.spin > 0 ? 256 : 0) | (p.stiff > 0 ? 512 : 0) | (p.hurdle > 0 ? 1024 : 0) | (p.playBall > 0 ? 2048 : 0) | (p.press > 0 ? 4096 : 0),
      r2(p.stam), r2(p.size), p.rt.name, POS_LABEL[p.role], r2(p.moveCd)]),
    b: [r2(g.ball.x), r2(g.ball.y), r2(g.ball.z), g.ball.state === 'air' ? 1 : g.ball.state === 'kick' ? 2 : 0,
      g.ball.state === 'air' && !g.ball.auto ? [r2(g.ball.tx), r2(g.ball.tz)] : null, g.ball.carrier ?? -1],
    st: g.stats,
    ql: g.opts.quarterLen,
    can4: g.down === 4 ? { fg: canFG(g), fgd: fgDistance(g) } : null,
    sp: { fg: canFG(g), fgd: fgDistance(g), pat: g.pat === g.poss },
    pat: g.pat, form: g.form,
    opDef: g.phase === 'presnap' && g.offPlay ? (() => { const q = getPlay(g, g.poss, g.offPlay); return q && q.routes ? { form: q.form, routes: q.routes, qbPath: q.qbPath || null } : null; })() : null,
    bT: g.ball.state === 'air' && !g.ball.auto ? r2(g.ball.T - g.ball.t) : -1,
  };
}

function reaching(g, p) {
  const b = g.ball;
  if (g.phase !== 'live' || b.state !== 'air' || b.auto) return false;
  const left = b.T - b.t;
  return left < 0.45 && hyp(p.x - b.tx, p.z - b.tz) < 2.6 && RECEIVERS.concat(['CB1', 'CB2', 'S', 'LB']).includes(p.role);
}
export function drainEvents(g) { const e = g.events; g.events = []; return e; }
