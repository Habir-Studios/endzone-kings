// ENDZONE KINGS — game simulation (no DOM, runs in browser or Node)
// Units are yards. Team 0 attacks +z (scores at z >= 100), team 1 attacks -z (scores at z <= 0).
// x is sideline-to-sideline, |x| <= 26.65 is in bounds.

export const HALF_W = 26.65;

import { TEAMS, getRoster, POS_LABEL } from './teams.js';
export { TEAMS };

export const OFF_ROLES = ['QB', 'C', 'LG', 'RG', 'WR1', 'WR2', 'RB'];
export const DEF_ROLES = ['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S'];
export const RECEIVERS = ['WR1', 'WR2', 'RB']; // keys 1,2,3

const ROSTER = {
  QB:  { num: 7,  spd: 7.6, size: 1.0 },
  C:   { num: 55, spd: 6.0, size: 1.22 },
  LG:  { num: 66, spd: 6.0, size: 1.22 },
  RG:  { num: 72, spd: 6.0, size: 1.22 },
  WR1: { num: 11, spd: 9.3, size: 0.97 },
  WR2: { num: 84, spd: 9.1, size: 1.0 },
  RB:  { num: 28, spd: 9.0, size: 1.03 },
  DL1: { num: 91, spd: 6.9, size: 1.18 },
  DL2: { num: 99, spd: 6.6, size: 1.24 },
  DL3: { num: 95, spd: 6.9, size: 1.18 },
  LB:  { num: 54, spd: 8.2, size: 1.1 },
  CB1: { num: 24, spd: 9.1, size: 0.97 },
  CB2: { num: 21, spd: 9.0, size: 0.97 },
  S:   { num: 32, spd: 8.8, size: 1.02 },
};

// Alignment in offense-relative coords [lateral, depth]; depth > 0 is downfield.
const ALIGN = {
  QB: [0, -4.5], C: [0, -0.9], LG: [-1.75, -1.0], RG: [1.75, -1.0],
  WR1: [-13, -0.6], WR2: [13, -0.6], RB: [1.6, -4.9],
  DL1: [-2.3, 0.9], DL2: [0.2, 0.9], DL3: [2.3, 0.9], LB: [0, 5.5],
  CB1: [-13, 6], CB2: [13, 6], S: [0, 14],
};

// Routes: list of waypoints [lateral, depth, 'stop'?] in offense-relative coords.
export const OFF_PLAYS = [
  { id: 'slants', key: '1', name: 'Quick Slants', type: 'pass', tip: 'Fast inside cuts, beats the blitz',
    routes: { WR1: [[-13, 3], [-9, 9], [-3, 17]], WR2: [[13, 3], [9, 9], [3, 17]], RB: [[5, -3], [13, 0], [21, 2]] } },
  { id: 'curlflat', key: '2', name: 'Curl Flat', type: 'pass', tip: 'Safe chunk yards vs zone',
    routes: { WR1: [[-13, 11], [-15, 9.5, 'stop']], WR2: [[13, 7], [24, 7.5, 'stop']], RB: [[-6, -2], [-14, 1], [-22, 2]] } },
  { id: 'postdig', key: '3', name: 'Post Dig', type: 'pass', tip: 'Deep shot + crosser',
    routes: { WR1: [[-13, 9], [-7, 26], [-2, 45]], WR2: [[13, 11], [3, 12], [-14, 13]], RB: [[2, 0], [2.5, 4, 'stop']] } },
  { id: 'verts', key: '4', name: 'Four Verts', type: 'pass', tip: 'Go deep, needs time',
    routes: { WR1: [[-13, 50]], WR2: [[13, 50]], RB: [[-1, 0], [-1.5, 5, 'stop']] } },
  { id: 'dive', key: '5', name: 'HB Dive', type: 'run', tip: 'Downhill run up the middle',
    routes: { RB: [[0.9, -3.6], [0.9, 0.2]] } },
  { id: 'toss', key: '6', name: 'HB Toss', type: 'run', tip: 'Bounce it to the edge',
    routes: { RB: [[5, -5], [12, -2.5], [13.5, 0.5]] } },
];
export const DEF_PLAYS = [
  { id: 'man', key: '1', name: 'Man Lock', tip: 'Tight coverage, safety deep' },
  { id: 'zone', key: '2', name: 'Cover 3', tip: 'Deep zones, keep it in front' },
  { id: 'blitz', key: '3', name: 'LB Blitz', tip: 'Send pressure, risky' },
];

const DIFF = [
  { name: 'Rookie', ai: 0.84, shed: 0.11, intP: 0.28, qbErr: 1.6, react: 0.45, brk: 0.04 },
  { name: 'Pro',    ai: 0.9,  shed: 0.16, intP: 0.42, qbErr: 1.05, react: 0.32, brk: 0.08 },
  { name: 'All-Pro', ai: 0.95, shed: 0.21, intP: 0.55, qbErr: 0.65, react: 0.22, brk: 0.12 },
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
  };
  g.losZ = zOf(first, 25);
  setFirstDown(g);
  setupPlay(g);
  g.msg = { text: 'KICKOFF', sub: TEAMS[o.teams[first]].name + ' ball', until: 2.2 };
  return g;
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
    id, team, unit, role, num: rt.num, size: r.size, max: r.spd * (0.86 + rt.spd / 100 * 0.17), rt,
    x, z, vx: 0, vz: 0, face: unit === 'off' ? faceOff : faceOff + Math.PI,
    stam: 1, stun: 0, juke: 0, jukeCd: 0, dive: 0, tackleCd: 0, fallen: 0,
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
    crossed: false, turnover: false, recognized: false, target: -1, throwT: 0, readT: 0, qbDecided: false };
  g.players = [];
  OFF_ROLES.forEach((role, i) => { const p = rel(g, ...ALIGN[role]); g.players.push(makePlayer(g, i, off, 'off', role, p.x, p.z)); });
  DEF_ROLES.forEach((role, i) => { const p = rel(g, ...ALIGN[role]); g.players.push(makePlayer(g, 7 + i, def, 'def', role, p.x, p.z)); });
  const c = g.players[1];
  g.ball = { state: 'held', carrier: 1, x: c.x, y: 0.3, z: g.losZ, auto: false };
  g.offPlay = null; g.defPlay = 'man'; g.defChosen = false; g.playClock = 20;
  g.ctrl = [-1, -1];
  g.ctrl[off] = 0; // QB
  g.ctrl[def] = byRole(g, 'LB').id;
  g.kick = null; g.celebrate = -1;
  g.playId++;
  if (!g.opts.humans[off]) cpuCallOffense(g);
  if (!g.opts.humans[def]) { g.defPlay = cpuCallDefense(g); g.defChosen = true; }
  applyFormationShading(g);
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
export function canFG(g) { return fgDistance(g) <= 58; }

// ---------------- CPU play calling ----------------
function cpuCallOffense(g) {
  const r = g.rng, p = prog(g.poss, g.losZ);
  if (g.down === 4) {
    const fd = fgDistance(g);
    const late = g.quarter >= 4 && g.clock < 60 && g.score[g.poss] < g.score[1 - g.poss];
    if (!late) {
      if (fd <= 50) { g.offPlay = 'fg'; return; }
      if (!(g.togo <= 2 && p >= 45)) { g.offPlay = 'punt'; return; }
    }
  }
  let w;
  if (g.togo <= 2) w = { slants: 2, curlflat: 1, postdig: 1, verts: 0.5, dive: 4, toss: 2 };
  else if (g.togo >= 8 && g.down >= 2) w = { slants: 2, curlflat: 3, postdig: 3, verts: 2, dive: 0.7, toss: 0.7 };
  else w = { slants: 2, curlflat: 2, postdig: 1.5, verts: 1, dive: 2, toss: 1.5 };
  if (p > 90) { w.verts = 0.2; w.postdig = 0.5; }
  g.offPlay = pickW(r, w);
}
function cpuCallDefense(g) {
  const w = g.togo >= 8 ? { man: 3, zone: 5, blitz: 1 } : g.togo <= 2 ? { man: 4, zone: 2, blitz: 3 } : { man: 4, zone: 3, blitz: 2 };
  return pickW(g.rng, w);
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
  if (g.phase === 'presnap') {
    if (team === g.poss) {
      if (ev.t === 'play') {
        if (ev.id === 'punt' || ev.id === 'fg') { if (g.down === 4 && (ev.id === 'punt' || canFG(g))) g.offPlay = ev.id; }
        else if (OFF_PLAYS.some(p => p.id === ev.id)) g.offPlay = ev.id;
      } else if (ev.t === 'snap' && g.offPlay && g.phaseT > 0.6) {
        snap(g);
      }
    } else {
      if (ev.t === 'play' && DEF_PLAYS.some(p => p.id === ev.id)) { g.defPlay = ev.id; g.defChosen = true; }
      else if (ev.t === 'switch') cycleDefender(g, team);
      else if (ev.t === 'pick') { const p = g.players[ev.id]; if (p && p.team === team) g.ctrl[team] = p.id; }
    }
    return;
  }
  if (g.phase !== 'live') return;
  const me = g.players[g.ctrl[team]];
  const b = g.ball;
  const carrier = b.state === 'held' ? g.players[b.carrier] : null;
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
    if (me && carrier === me && me.jukeCd <= 0 && me.stun <= 0) {
      me.juke = 0.38; me.jukeCd = 1.15;
      const ix = ev.x || 0, iz = ev.z || 0;
      let lx = -me.vz, lz = me.vx; const l = hyp(lx, lz) || 1; lx /= l; lz /= l;
      if (ix * lx + iz * lz < 0) { lx = -lx; lz = -lz; }
      me.vx += lx * 5; me.vz += lz * 5;
      g.events.push('juke');
    }
  } else if (ev.t === 'dive') {
    if (me && carrier && carrier.team !== team && me.dive <= 0 && me.stun <= 0 && me.engagedBy < 0) {
      let dx = carrier.x - me.x, dz = carrier.z - me.z; const l = hyp(dx, dz) || 1;
      // dive along movement if moving, biased toward carrier
      dx /= l; dz /= l;
      me.dive = 0.42; me.vx = dx * 11; me.vz = dz * 11; me.face = Math.atan2(dx, dz);
      g.events.push('dive');
    }
  } else if (ev.t === 'switch') {
    if (!(carrier && carrier.team === team) && !(team === P.off && canThrow(g))) {
      const ref = carrier || b;
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
  return (0.35 + sp * 0.09 + pressure * 1.3) * (1.45 - qb.rt.acc / 100);
}

export function canThrow(g) {
  const P = g.play, b = g.ball;
  return g.phase === 'live' && P.type === 'pass' && !P.thrown && !P.crossed && b.state === 'held' && b.carrier === 0;
}

function snap(g) {
  const P = g.play;
  if (g.offPlay === 'punt' || g.offPlay === 'fg') { startKick(g, g.offPlay); return; }
  const play = OFF_PLAYS.find(p => p.id === g.offPlay);
  P.type = play.type; P.playDef = play; P.snapT = g.t;
  P.readT = 1.1 + g.rng() * 1.0;
  g.phase = 'live'; g.phaseT = 0;
  g.events.push('snap');
  for (const p of g.players) {
    if (play.routes[p.role]) { p.route = play.routes[p.role]; p.ri = 0; }
  }
  // man assignments
  const dp = g.defPlay;
  const wr1 = byRole(g, 'WR1'), wr2 = byRole(g, 'WR2'), rb = byRole(g, 'RB');
  byRole(g, 'CB1').assign = wr1.id; byRole(g, 'CB2').assign = wr2.id;
  byRole(g, 'LB').assign = dp === 'blitz' ? -1 : rb.id;
  byRole(g, 'S').assign = dp === 'blitz' ? rb.id : -1;
  // OL assignments
  byRole(g, 'C').blockOn = byRole(g, 'DL2').id;
  byRole(g, 'LG').blockOn = byRole(g, 'DL1').id;
  byRole(g, 'RG').blockOn = byRole(g, 'DL3').id;
  // ball snaps back to QB
  const qb = g.players[0];
  launchBall(g, qb.x, qb.z, 0.28, 0.4, qb.id, true);
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
  const speed = (19 + Math.min(D0, 40) * 0.2) * (0.86 + qb.rt.arm / 100 * 0.2);
  const L = leadPoint(qb, r, speed);
  const a = g.rng() * Math.PI * 2, e = err * Math.sqrt(g.rng());
  const tx = L.x + Math.cos(a) * e, tz = L.z + Math.sin(a) * e;
  const D = hyp(tx - qb.x, tz - qb.z);
  g.ball.x = qb.x; g.ball.z = qb.z; g.ball.y = 1.9;
  launchBall(g, tx, tz, Math.max(0.35, D / speed), 0.6 + D * 0.11, r.id, false);
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
  b.y = 0.5 + 4 * k.h * s * (1 - s) + (k.type === 'fg' ? s * 3 : 0);
  g.clock = Math.max(0, g.clock - dt);
  if (k.t >= k.T + 0.4) {
    const off = g.poss;
    g.phase = 'dead'; g.phaseT = 0; g.deadDur = 2.2; g.runoff = 0;
    g.events.push('whistle');
    if (k.type === 'punt') {
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
  // let defensive human shuffle a little pre-snap
  if (g.opts.humans[def]) {
    const me = g.players[g.ctrl[def]], inp = inputs[def] || {};
    if (me && (inp.mx || inp.mz)) {
      const d = dirOf(off);
      const home = rel(g, ...ALIGN[me.role]);
      me.x = clamp(me.x + (inp.mx || 0) * 3 * dt, home.x - 3, home.x + 3);
      const nz = me.z + (inp.mz || 0) * 3 * dt;
      // keep on defensive side of the ball
      me.z = (nz - g.losZ) * d < 0.8 ? g.losZ + 0.8 * d : nz;
    }
  }
  if (!g.opts.humans[off]) {
    if (!g.offPlay) cpuCallOffense(g);
    const humanDef = g.opts.humans[def];
    const ready = !humanDef ? g.phaseT > 1.3 : (g.defChosen ? g.phaseT > 1.6 : g.phaseT > 5);
    if (ready || g.playClock <= 0) snap(g);
  } else if (g.playClock <= 0) {
    if (!g.offPlay) g.offPlay = 'dive';
    snap(g);
  }
}

function nextPlay(g) {
  if (g.runoff) { g.clock = Math.max(0, g.clock - g.runoff); g.runoff = 0; }
  if (g.otScored) return endGame(g);
  if (g.clock <= 0) {
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
  }
  // run play: handoff / pitch
  if (P.type === 'run' && !P.handed && b.state === 'held' && b.carrier === 0) {
    const rb = byRole(g, 'RB'), qb = g.players[0];
    if (P.playDef.id === 'toss' && tl > 0.32) {
      P.handed = true;
      const L = leadPoint(qb, rb, 14);
      launchBall(g, L.x, L.z, L.T, 0.5, rb.id, true);
      b.x = qb.x; b.z = qb.z; b.y = 1.2;
      g.events.push('pitch');
    } else if (P.playDef.id === 'dive' && (tl > 0.42 || (tl > 0.2 && dist(rb, qb) < 1.3))) {
      P.handed = true; b.carrier = rb.id;
      if (g.opts.humans[P.off]) g.ctrl[P.off] = rb.id;
      g.events.push('handoff');
    }
  }
  if (!P.recognized) {
    const rt = P.type === 'run' ? 0.35 + cfg.react : 99;
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
      if (p.id === 0 && pocket && tl < 0.45) { const t = rel(g, 0, -7); want = seek(p, t.x, t.z, 1); }
      else if (P.type === 'run' && p.id === 0 && !P.handed) { want = { x: 0, z: 0, s: 0 }; }
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
        let brk = c2.juke > 0 ? (humanCarrier ? 0.62 : 0.45) : (c2.role === 'RB' ? cfg.brk + 0.06 : cfg.brk);
        if (c2.role === 'QB' && !P.thrown && !P.crossed) brk *= 0.6;
        if (d.dive > 0) brk *= 0.75;
        brk *= (1.5 - d.rt.tkl / 100) * (0.6 + c2.rt.elu / 100 * 0.6);
        if (g.rng() < brk) {
          d.stun = 0.85; d.fallen = 0.85; d.tackleCd = 1.2; d.dive = 0;
          c2.vx *= 0.6; c2.vz *= 0.6;
          g.events.push('brokentackle');
          g.flash = { text: 'BROKEN TACKLE', until: 1.0 };
        } else {
          c2.fallen = 3; d.fallen = 3;
          g.events.push('tackle');
          return endPlay(g, 'tackle', c2, d);
        }
      }
    }
  }
  g.clock = Math.max(0, g.clock - dt);
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
  const tvx = (w.x || 0) * spd, tvz = (w.z || 0) * spd;
  const acc = (p.size > 1.15 ? 16 : 24) * dt * (p.juke > 0 ? 0.3 : 1);
  let dvx = tvx - p.vx, dvz = tvz - p.vz; const dl = hyp(dvx, dvz);
  if (dl > acc) { dvx *= acc / dl; dvz *= acc / dl; }
  p.vx += dvx; p.vz += dvz;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const sp = hyp(p.vx, p.vz);
  if (sp > 0.6) {
    const target = Math.atan2(p.vx, p.vz);
    let da = target - p.face; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    p.face += da * Math.min(1, dt * 12);
  }
}

function separate(g) {
  const ps = g.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.fallen > 0 || b.fallen > 0) continue;
    if (a.team !== b.team && (g.ball.state === 'held') && (g.ball.carrier === a.id || g.ball.carrier === b.id)) continue;
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
    if (P.type === 'run' && p.role === 'RB' && p.route && p.ri < p.route.length && !P.turnover) {
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
    if (p.role === 'C' || p.role === 'LG' || p.role === 'RG') return passBlock(g, p, qb);
    if (p.route) {
      if (P.type === 'run' && p.role !== 'RB') return stalk(g, p);
      return { ...routeMove(g, p), s: ai + 0.04 };
    }
    if (P.type === 'run' && p.role !== 'RB') return stalk(g, p);
    if (p.id === 0) return { x: 0, z: 0, s: 0 };
    return { x: 0, z: 0, s: 0 };
  }
  // defense
  const dp = g.defPlay;
  if (p.role.startsWith('DL') || (p.role === 'LB' && dp === 'blitz')) {
    const tgt = carrier || qb;
    let w = seek(p, tgt.x, tgt.z, ai + (p.role === 'LB' ? 0.05 : 0));
    if (p.engagedBy >= 0) {
      const side = (p.id % 2 ? 1 : -1);
      w = { x: w.x * 0.5 + -w.z * side * 0.6, z: w.z * 0.5 + w.x * side * 0.6, s: w.s };
    }
    return w;
  }
  if (dp === 'zone' && !P.recognized) return zoneMove(g, p, ai);
  if (p.assign >= 0 && !P.recognized) return manMove(g, p, g.players[p.assign], ai);
  if (p.role === 'S' && !P.recognized) {
    // deep help: shade to the deepest receiver
    let deep = null, dd = -1e9;
    for (const r of g.players) if (r.team === P.off && RECEIVERS.includes(r.role)) { const dep = (r.z - P.los) * d; if (dep > dd) { dd = dep; deep = r; } }
    const t = rel(g, 0, 14);
    const tx = deep ? (t.x * 0.5 + deep.x * 0.5) : t.x;
    const tz = P.los + Math.max(14, dd + 6) * d;
    return seek(p, tx, tz, ai);
  }
  if (p.role === 'LB' && !P.recognized) {
    // spy the QB
    return seek(p, qb.x, P.los + 4.5 * d, 0.6);
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
  const P = g.play;
  const drop = rel(g, P.bx * 0 + 0, -7);
  const t = g.phaseT;
  if (t < 0.6) return seek(qb, drop.x, drop.z, 0.9);
  // slide away from nearest free rusher
  let nr = null, nd = 1e9;
  for (const d of g.players) if (d.team !== qb.team && d.engagedBy < 0) { const dd = dist(d, qb); if (dd < nd) { nd = dd; nr = d; } }
  if (nr && nd < 4.5) {
    const dx = qb.x - nr.x, dz = qb.z - nr.z, l = hyp(dx, dz) || 1;
    return { x: dx / l, z: dz / l * 0.3, s: 0.6 };
  }
  return seek(qb, drop.x, drop.z, 0.5);
}

function aiQB(g, tl) {
  const P = g.play, qb = g.players[0], cfg = g.cfg;
  if (tl < 0.55) return;
  let pressure = 1e9;
  for (const d of g.players) if (d.team !== qb.team && d.engagedBy < 0) pressure = Math.min(pressure, dist(d, qb));
  let best = null, bs = -1e9;
  for (const role of RECEIVERS) {
    const r = byRole(g, role);
    const speed = 19 + Math.min(dist(qb, r), 40) * 0.2;
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
  if (best && ((tl > 0.9 && bs > want) || (urgent && bs > 0.8) || tl > 3.6)) {
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
  return { x: fx / l, z: fz / l, s: Math.min(1, s + 0.05) };
}

function pursue(g, p, c, s) {
  const l = dist(p, c);
  const t = Math.min(1.1, l / (p.max * s + 0.1)) * 0.85;
  const tx = c.x + c.vx * t, tz = c.z + c.vz * t;
  return seek(p, tx, tz, s + 0.03, 0.2);
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
  const rushers = g.players.filter(q => q.team !== p.team && (q.role.startsWith('DL') || (q.role === 'LB' && g.defPlay === 'blitz')));
  if (!t || t.shedCd > 0 || (t.engagedBy >= 0 && t.engagedBy !== p.id)) {
    t = null; let bd = 1e9;
    for (const q of rushers) {
      if (q.shedCd > 0 || (q.engagedBy >= 0 && q.engagedBy !== p.id)) continue;
      const dq = dist(p, q); if (dq < bd && dq < 7) { bd = dq; t = q; }
    }
    p.blockOn = t ? t.id : -1;
  }
  if (!t) { const home = rel(g, ALIGN[p.role][0], -2.5); return seek(p, home.x, home.z, 0.5); }
  const dx = qb.x - t.x, dz = qb.z - t.z, l = hyp(dx, dz) || 1;
  return seek(p, t.x + dx / l * 1.0, t.z + dz / l * 1.0, 0.95, 0.3);
}

function stalk(g, p) {
  // receivers block on run plays
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
  const L = { CB1: [-13, 15], CB2: [13, 15], S: [0, 19], LB: [0, 7] }[p.role] || [0, 8];
  const home = rel(g, L[0], L[1]);
  let near = null, nd = 1e9;
  for (const r of g.players) if (r.team === P.off && RECEIVERS.includes(r.role)) { const dd = hyp(r.x - home.x, r.z - home.z); if (dd < nd) { nd = dd; near = r; } }
  let tx = home.x, tz = home.z;
  if (near && nd < 10) {
    tx = home.x + (near.x - home.x) * 0.7;
    const deep = (near.z - P.los) * d, myDeep = (home.z - P.los) * d;
    const td = p.role === 'LB' ? Math.min(myDeep, deep + 1.5) : Math.max(myDeep * 0.7, deep + 2);
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
    const dd = hyp(p.x - L.x, p.z - L.z);
    if (p.team === offTeam) { if (RECEIVERS.includes(p.role) && dd < dO) { dO = dd; ro = p; } }
    else if (dd < dD) { dD = dd; rd = p; }
  }
  const cO = ro && dO < 1.5, cD = rd && dD < 1.4;
  const target = g.players[P.target];
  let outcome = 'inc';
  if (outOfBounds) outcome = 'inc';
  else if (cO && cD) {
    const hands = 0.8 + ro.rt.hands / 100 * 0.22, cov = 0.6 + rd.rt.cov / 100 * 0.6;
    let pc = clamp((0.55 + (dD - dO) * 0.3) * hands / (0.7 + cov * 0.3), 0.2, 0.88);
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
  } else {
    b.x = L.x; b.z = L.z; b.y = 0.2;
    g.events.push(cD ? 'breakup' : 'incomplete');
    endPlay(g, 'incomplete', null, null, cD ? 'PASS BROKEN UP' : null);
  }
}

// ---------------- end of play ----------------
function touchdown(g, c) {
  const t = c.team;
  g.phase = 'dead'; g.phaseT = 0; g.deadDur = 3.4; g.runoff = 0;
  score(g, t, 7);
  g.stats[t].tds++;
  addYards(g, c, prog(t, zOf(t, 100)));
  g.msg = { text: 'TOUCHDOWN!', sub: `${c.rt.name} · ${TEAMS[g.opts.teams[t]].name}`, until: 3.2, big: true, team: t };
  g.celebrate = t; c.scorer = 1;
  g.events.push('td', 'whistle');
  kickoffTo(g, 1 - t);
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
        | (g.phase === 'dead' && g.celebrate === p.team ? 64 : 0) | (p.scorer && g.phase === 'dead' ? 128 : 0), r2(p.stam), r2(p.size), p.rt.name, POS_LABEL[p.role]]),
    b: [r2(g.ball.x), r2(g.ball.y), r2(g.ball.z), g.ball.state === 'air' ? 1 : g.ball.state === 'kick' ? 2 : 0,
      g.ball.state === 'air' && !g.ball.auto ? [r2(g.ball.tx), r2(g.ball.tz)] : null, g.ball.carrier ?? -1],
    st: g.stats,
    ql: g.opts.quarterLen,
    can4: g.down === 4 ? { fg: canFG(g), fgd: fgDistance(g) } : null,
  };
}

function reaching(g, p) {
  const b = g.ball;
  if (g.phase !== 'live' || b.state !== 'air' || b.auto) return false;
  const left = b.T - b.t;
  return left < 0.45 && hyp(p.x - b.tx, p.z - b.tz) < 2.6 && RECEIVERS.concat(['CB1', 'CB2', 'S', 'LB']).includes(p.role);
}
export function drainEvents(g) { const e = g.events; g.events = []; return e; }
