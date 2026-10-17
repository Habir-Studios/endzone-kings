// Season mode: 14-week schedule, everyone else simulated by ratings, top-4 playoff, Kings Bowl.
import { TEAMS, teamOvr } from './teams.js?v=1792254012';

export const WEEKS = 14;
const N = TEAMS.length;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function newSeason(team, seed = Date.now() & 0xffffffff) {
  const r = rng(seed);
  const weeks = [];
  const faced = new Set();
  for (let w = 0; w < WEEKS; w++) {
    let ids, tries = 0;
    do {
      ids = [...Array(N).keys()];
      for (let i = ids.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
      tries++;
    } while (tries < 50 && (() => { const k = ids.indexOf(team); const opp = ids[k % 2 ? k - 1 : k + 1]; return faced.has(opp); })());
    const games = [];
    for (let i = 0; i < N; i += 2) games.push({ home: ids[i], away: ids[i + 1], hs: null, as: null });
    const mine = games.find(g => g.home === team || g.away === team);
    faced.add(mine.home === team ? mine.away : mine.home);
    weeks.push(games);
  }
  const standings = {};
  for (let i = 0; i < N; i++) standings[i] = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  return { v: 1, team, seed, week: 0, weeks, standings, phase: 'regular', playoffs: null, champion: null, created: Date.now() };
}

export function userGame(S) {
  if (S.phase === 'regular') return S.weeks[S.week].find(g => g.home === S.team || g.away === S.team);
  if (S.phase === 'semis' || S.phase === 'final') return (S.phase === 'semis' ? S.playoffs.semis : [S.playoffs.final]).find(g => g && (g.home === S.team || g.away === S.team)) || null;
  return null;
}

// ovr: optional { team: overall } overrides (franchise mode uses your real roster's rating)
let OVR_OV = null;
export function setOvrOverride(ov) { OVR_OV = ov || null; }
const ovrOf = t => (OVR_OV && OVR_OV[t] != null ? OVR_OV[t] : teamOvr(t));
export function simScore(a, b, r = Math.random) {
  const d = (ovrOf(a) - ovrOf(b)) / 10;
  const pts = (bias) => { let p = 0; const drives = 9 + ((r() * 3) | 0); for (let i = 0; i < drives; i++) { const x = r() + bias * 0.055; p += x > 0.72 ? 7 : x > 0.58 ? 3 : 0; } return p; };
  let sa = pts(d + 0.04), sb = pts(-d);
  if (sa === sb) { if (r() < 0.5 + d * 0.15) sa += 3; else sb += 3; }
  return [sa, sb];
}

function record(S, g) {
  const H = S.standings[g.home], A = S.standings[g.away];
  H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
  if (g.hs > g.as) { H.w++; A.l++; } else if (g.as > g.hs) { A.w++; H.l++; } else { H.t++; A.t++; }
}

export function table(S) {
  return Object.entries(S.standings).map(([i, s]) => ({ team: +i, ...s, pct: (s.w + s.t * 0.5) / Math.max(1, s.w + s.l + s.t) }))
    .sort((a, b) => b.pct - a.pct || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);
}

// apply the user's result (myScore, oppScore), sim everyone else, advance
export function finishWeek(S, myScore, oppScore) {
  const g = userGame(S);
  if (!g) return S;
  if (g.home === S.team) { g.hs = myScore; g.as = oppScore; } else { g.hs = oppScore; g.as = myScore; }
  if (S.phase === 'regular') {
    for (const x of S.weeks[S.week]) { if (x.hs === null) { const [a, b] = simScore(x.home, x.away); x.hs = a; x.as = b; } record(S, x); }
    S.week++;
    if (S.week >= WEEKS) startPlayoffs(S);
  } else advancePlayoffs(S);
  return S;
}

function startPlayoffs(S) {
  const top = table(S).slice(0, 4).map(r => r.team);
  S.playoffs = { seeds: top, semis: [{ home: top[0], away: top[3], hs: null, as: null }, { home: top[1], away: top[2], hs: null, as: null }], final: null };
  S.phase = 'semis';
  if (!top.includes(S.team)) { simRest(S); }
}

function playoffSim(g) { let [a, b] = simScore(g.home, g.away); if (a === b) a += 3; g.hs = a; g.as = b; }
const winner = g => g.hs > g.as ? g.home : g.away;

function advancePlayoffs(S) {
  const P = S.playoffs;
  if (S.phase === 'semis') {
    for (const g of P.semis) if (g.hs === null) playoffSim(g);
    for (const g of P.semis) if (g.hs === g.as) g.hs += 3; // no ties in playoffs
    P.final = { home: winner(P.semis[0]), away: winner(P.semis[1]), hs: null, as: null };
    S.phase = 'final';
    if (P.final.home !== S.team && P.final.away !== S.team) simRest(S);
  } else if (S.phase === 'final') {
    if (P.final.hs === P.final.as) P.final.hs += 3;
    S.champion = winner(P.final); S.phase = 'done';
  }
}

function simRest(S) {
  // user is eliminated: play out the bracket
  const P = S.playoffs;
  if (S.phase === 'semis') { for (const g of P.semis) if (g.hs === null) playoffSim(g); P.final = { home: winner(P.semis[0]), away: winner(P.semis[1]), hs: null, as: null }; S.phase = 'final'; }
  if (S.phase === 'final') { playoffSim(P.final); S.champion = winner(P.final); S.phase = 'done'; }
  S.eliminated = true;
}

export function simMyGame(S) {
  const g = userGame(S); if (!g) return null;
  const [h, a] = simScore(g.home, g.away);
  const mine = g.home === S.team ? [h, a] : [a, h];
  if (S.phase !== 'regular' && mine[0] === mine[1]) mine[0] += 3;
  finishWeek(S, mine[0], mine[1]);
  return mine;
}
