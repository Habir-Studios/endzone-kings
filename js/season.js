// Season mode, NFL style: real divisions, 17 games over 18 weeks (one bye), the NFL scheduling formula with
// the real 2026 division rotation, 7 playoff teams per conference (top seed gets a bye), Wild Card, Divisional,
// Conference Championships and the Kings Bowl. Seasons saved before this (v1) keep playing the old way.
import { TEAMS, teamOvr } from './teams.js?v=1792376976';

export const WEEKS = 18;
const N = TEAMS.length;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------- leagues: conferences and divisions ----------------
const DIVS = {
  'AFC East': ['BUF', 'MIA', 'BOS', 'NJ'], 'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'], 'AFC South': ['HOU', 'IND', 'JAX', 'TEN'], 'AFC West': ['DEN', 'KC', 'LV', 'SD'],
  'NFC East': ['DAL', 'NY', 'PHI', 'WAS'], 'NFC North': ['CHI', 'DET', 'GB', 'MIN'], 'NFC South': ['ATL', 'CAR', 'NO', 'TB'], 'NFC West': ['ARI', 'LA', 'SF', 'SEA'],
};
const IDX = Object.fromEntries(TEAMS.map((t, i) => [t.abbr, i]));
export const DIVISION = {}; for (const [d, ts] of Object.entries(DIVS)) for (const a of ts) DIVISION[IDX[a]] = d;
export const divisionOf = t => DIVISION[t];
export const confOf = t => DIVISION[t].slice(0, 3);
const divTeams = d => DIVS[d].map(a => IDX[a]);
const PARTS = ['East', 'North', 'South', 'West'];

// NFL rotation (2023 is year 0). Intra-conference repeats every 3 years, inter-conference every 4.
// 2026 checks out against the NFL's published opponents: AFC E-W, N-S; AFC East-NFC North, North-South, South-East, West-West;
// 17th game AFC East-NFC West, North-East, South-North, West-South.
const INTRA = [{ East: 'West', West: 'East', North: 'South', South: 'North' }, { East: 'South', South: 'East', North: 'West', West: 'North' }, { East: 'North', North: 'East', South: 'West', West: 'South' }];
const INTER = [{ East: 'East', North: 'West', South: 'South', West: 'North' }, { East: 'West', North: 'East', South: 'North', West: 'South' }, { East: 'South', North: 'North', South: 'West', West: 'East' }, { East: 'North', North: 'South', South: 'East', West: 'West' }];
const mod = (a, n) => ((a % n) + n) % n;

// build every team's 17 opponents with the NFL formula; "last year's finish" comes from team ratings
function opponents(year) {
  const y = year - 2023, intra = INTRA[mod(y, 3)], inter = INTER[mod(y, 4)], x17 = INTER[mod(y + 2, 4)];
  const place = {};   // projected division finish 0..3
  for (const d of Object.keys(DIVS)) divTeams(d).sort((a, b) => teamOvr(b) - teamOvr(a)).forEach((t, i) => { place[t] = i; });
  const games = [];   // [a, b, kind] each pair once (division pairs twice)
  const seen = new Set(), add = (a, b, k) => { const key = Math.min(a, b) + '-' + Math.max(a, b) + '-' + k; if (seen.has(key)) return; seen.add(key); games.push([a, b, k]); };
  for (const [d, ts] of Object.entries(DIVS)) {
    const conf = d.slice(0, 3), part = d.slice(4), other = conf === 'AFC' ? 'NFC' : 'AFC';
    const mine = divTeams(d);
    for (const a of mine) for (const b of mine) if (a < b) { add(a, b, 'div1'); add(a, b, 'div2'); }
    const intraD = divTeams(conf + ' ' + intra[part]);
    for (const a of mine) for (const b of intraD) add(a, b, 'intra');
    if (conf === 'AFC') { const interD = divTeams('NFC ' + inter[part]); for (const a of mine) for (const b of interD) add(a, b, 'inter'); }
    // same-place games vs the two divisions in your conference you don't play in full
    const rest = PARTS.filter(p => p !== part && p !== intra[part]);
    for (const p of rest) { const od = divTeams(conf + ' ' + p); for (const a of mine) { const b = od.find(t => place[t] === place[a]); add(a, b, 'place'); } }
    // 17th game: same place in the cross-conference division
    if (conf === 'AFC') { const od = divTeams('NFC ' + x17[part]); for (const a of mine) { const b = od.find(t => place[t] === place[a]); add(a, b, 'x17'); } }
    void other;
  }
  return games;
}

// spread the 272 games over 18 weeks: byes first (weeks 5-14, like the NFL), then each week is a full slate where
// every team not on bye plays exactly once. Teams with the fewest options get matched first; a dead end retries.
function buildWeeks(year, r) {
  const all = opponents(year);
  const BYE_SIZES = [2, 4, 4, 4, 4, 2, 4, 2, 4, 2];   // weeks 5..14, 32 teams total
  for (let attempt = 0; attempt < 300; attempt++) {
    const order = [...Array(N).keys()]; for (let i = N - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    const byeWeek = {}; let k = 0; BYE_SIZES.forEach((n, i) => { for (let q = 0; q < n; q++) byeWeek[order[k++]] = 4 + i; });
    // division rivals share a bye-free pairing problem otherwise; that's fine
    let left = all.map(([a, b, kind], id) => ({ a, b, kind, id }));
    const weeks = []; let ok = true;
    for (let w = 0; w < WEEKS && ok; w++) {
      const active = [...Array(N).keys()].filter(t => byeWeek[t] !== w);
      let slate = null;
      for (let tryW = 0; tryW < 60 && !slate; tryW++) {
        const used = new Set(), pick = [], free = new Set(active);
        let dead = false;
        while (free.size) {
          // the team with the fewest available opponents goes first
          let best = null, bestOpts = null;
          for (const t of free) {
            const opts = left.filter(g => !used.has(g.id) && ((g.a === t && free.has(g.b)) || (g.b === t && free.has(g.a))));
            if (!best || opts.length < bestOpts.length || (opts.length === bestOpts.length && r() < 0.3)) { best = t; bestOpts = opts; }
            if (opts.length === 0) break;
          }
          if (!bestOpts.length) { dead = true; break; }
          // prefer the game whose other team is the most constrained, with a little randomness
          const scored = bestOpts.map(g => { const o = g.a === best ? g.b : g.a; const n = left.filter(x => !used.has(x.id) && (x.a === o || x.b === o)).length; return { g, o, sc: n + r() * 2.5 }; }).sort((x, y) => x.sc - y.sc);
          const { g, o } = scored[0];
          used.add(g.id); pick.push(g); free.delete(best); free.delete(o);
        }
        if (!dead) slate = pick;
      }
      if (!slate) { ok = false; break; }
      const ids = new Set(slate.map(g => g.id)); left = left.filter(g => !ids.has(g.id));
      weeks.push(slate);
    }
    if (!ok || left.length) continue;
    // division rematches shouldn't be back to back; reshuffling weeks keeps every slate valid
    // home/away: division games one each; the rest balanced
    const homes = new Array(N).fill(0);
    return weeks.map(wk => wk.map(({ a, b, kind }) => {
      let h = a, v = b;
      if (kind === 'div2') { h = b; v = a; }
      else if (kind !== 'div1') { if (homes[a] > homes[b] || (homes[a] === homes[b] && r() < 0.5)) { h = b; v = a; } }
      homes[h]++;
      return { home: h, away: v, hs: null, as: null, k: kind };
    }));
  }
  return null;
}

export function newSeason(team, seed = Date.now() & 0xffffffff, year = 2026) {
  const r = rng(seed);
  const weeks = buildWeeks(year, r);
  if (!weeks) return newSeasonV1(team, seed);   // safety net, never expected
  const standings = {};
  for (let i = 0; i < N; i++) standings[i] = { w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, cw: 0, cl: 0 };
  return { v: 2, year, team, seed, week: 0, weeks, standings, phase: 'regular', playoffs: null, champion: null, created: Date.now() };
}

const isV2 = S => S && S.v === 2;
export function userGame(S) {
  if (!isV2(S)) return userGameV1(S);
  if (S.phase === 'regular') return S.weeks[S.week].find(g => g.home === S.team || g.away === S.team) || null;   // null = bye week
  const R = S.playoffs && S.playoffs.rounds[S.phase];
  return R ? R.find(g => g.home === S.team || g.away === S.team) || null : null;
}
export const onBye = S => isV2(S) && S.phase === 'regular' && !userGame(S);
const ROUND_NAME = { wildcard: 'Wild Card round', divisional: 'Divisional round', conference: 'Conference Championship', final: 'The Kings Bowl' };
export function phaseLabel(S) {
  if (!isV2(S)) return S.phase === 'regular' ? `Week ${S.week + 1} of 14` : S.phase === 'semis' ? 'Playoff semifinal' : 'The Kings Bowl';
  return S.phase === 'regular' ? `Week ${S.week + 1} of ${WEEKS}${onBye(S) ? ' (bye)' : ''}` : ROUND_NAME[S.phase] || '';
}

function recordV2(S, g) {
  const H = S.standings[g.home], A = S.standings[g.away];
  H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
  const div = divisionOf(g.home) === divisionOf(g.away), conf = confOf(g.home) === confOf(g.away);
  const res = (X, won, lost) => { if (won) { X.w++; if (div) X.dw++; if (conf) X.cw++; } else if (lost) { X.l++; if (div) X.dl++; if (conf) X.cl++; } else X.t++; };
  res(H, g.hs > g.as, g.hs < g.as); res(A, g.as > g.hs, g.as < g.hs);
}
const pctOf = s => (s.w + s.t * 0.5) / Math.max(1, s.w + s.l + s.t);
const rank = (S, ts) => ts.slice().sort((a, b) => { const A = S.standings[a], B = S.standings[b]; return pctOf(B) - pctOf(A) || (B.dw - B.dl) - (A.dw - A.dl) || (B.cw - B.cl) - (A.cw - A.cl) || (B.pf - B.pa) - (A.pf - A.pa) || B.pf - A.pf; });
export function table(S) {
  if (!isV2(S)) return tableV1(S);
  return rank(S, [...Array(N).keys()]).map(t => ({ team: t, ...S.standings[t], pct: pctOf(S.standings[t]), div: divisionOf(t) }));
}
// standings grouped by division, conference by conference
export function divisionTables(S) { return Object.keys(DIVS).map(d => ({ div: d, rows: rank(S, divTeams(d)).map(t => ({ team: t, ...S.standings[t] })) })); }
// 7 seeds per conference: 4 division winners by record, then 3 wild cards
export function seeds(S, conf) {
  const winners = Object.keys(DIVS).filter(d => d.startsWith(conf)).map(d => rank(S, divTeams(d))[0]);
  const w = rank(S, winners), wc = rank(S, [...Array(N).keys()].filter(t => confOf(t) === conf && !winners.includes(t))).slice(0, 3);
  return [...w, ...wc];
}

function simGame(g) { if (g.hs !== null) return; const [a, b] = simScore(g.home, g.away); g.hs = a; g.as = b; }
function poSim(g) { simGame(g); if (g.hs === g.as) g.hs += 3; }
const winnerOf = g => g.hs > g.as ? g.home : g.away;

// a playoff game can't end tied. The game itself plays extra overtime periods (sim opts.playoff); if a tie still
// comes back, settle it with an overtime coin flip instead of always handing it to the home team
function noTie(S, my, opp) {
  if (S.phase === 'regular' || my == null || opp == null || my !== opp) return [my, opp];
  const r = rng(((S.seed >>> 0) ^ 0x2f6b) + S.phase.length * 7919 + (S.week || 0) * 31 + my)();
  return r < 0.5 ? [my + 3, opp] : [my, opp + 3];
}
export function finishWeek(S, myScore, oppScore) {
  [myScore, oppScore] = noTie(S, myScore, oppScore);
  if (!isV2(S)) return finishWeekV1(S, myScore, oppScore);
  const g = userGame(S);
  if (g && myScore != null) { if (g.home === S.team) { g.hs = myScore; g.as = oppScore; } else { g.hs = oppScore; g.as = myScore; } }
  if (S.phase === 'regular') {
    for (const x of S.weeks[S.week]) { simGame(x); recordV2(S, x); }
    S.week++;
    if (S.week >= WEEKS) startPlayoffsV2(S);
  } else advanceV2(S);
  return S;
}
function startPlayoffsV2(S) {
  const A = seeds(S, 'AFC'), F = seeds(S, 'NFC');
  const wc = s => [{ home: s[1], away: s[6] }, { home: s[2], away: s[5] }, { home: s[3], away: s[4] }].map(g => ({ ...g, hs: null, as: null }));
  S.playoffs = { seeds: [...A, ...F], afc: A, nfc: F, rounds: { wildcard: [...wc(A), ...wc(F)] } };
  S.phase = 'wildcard';
  if (!userGame(S)) skipAhead(S);
}
function advanceV2(S) {
  const P = S.playoffs, R = P.rounds;
  for (const g of R[S.phase]) poSim(g);
  if (S.phase === 'wildcard') {
    const next = (seedsC, games) => { const alive = [seedsC[0], ...games.map(winnerOf)].sort((a, b) => seedsC.indexOf(a) - seedsC.indexOf(b)); return [{ home: alive[0], away: alive[3] }, { home: alive[1], away: alive[2] }].map(g => ({ ...g, hs: null, as: null })); };
    R.divisional = [...next(P.afc, R.wildcard.slice(0, 3)), ...next(P.nfc, R.wildcard.slice(3))];
    S.phase = 'divisional';
  } else if (S.phase === 'divisional') {
    const cc = (seedsC, games) => { const a = games.map(winnerOf).sort((x, y) => seedsC.indexOf(x) - seedsC.indexOf(y)); return { home: a[0], away: a[1], hs: null, as: null }; };
    R.conference = [cc(P.afc, R.divisional.slice(0, 2)), cc(P.nfc, R.divisional.slice(2))];
    S.phase = 'conference';
  } else if (S.phase === 'conference') {
    R.final = [{ home: winnerOf(R.conference[0]), away: winnerOf(R.conference[1]), hs: null, as: null }];
    S.phase = 'final';
  } else if (S.phase === 'final') { S.champion = winnerOf(R.final[0]); S.phase = 'done'; return; }
  if (!userGame(S)) skipAhead(S);
}
// you're out (or never made it): play the rest of the bracket
function skipAhead(S) { S.eliminated = true; while (S.phase !== 'done') advanceV2(S); }

export function simMyGame(S) {
  if (!isV2(S)) return simMyGameV1(S);
  const g = userGame(S);
  if (!g) { finishWeek(S); return null; }   // bye week
  const [h, a] = simScore(g.home, g.away);
  const mine = g.home === S.team ? [h, a] : [a, h];
  if (S.phase !== 'regular' && mine[0] === mine[1]) mine[0] += 3;
  finishWeek(S, mine[0], mine[1]);
  return mine;
}

// ---------------- v1 (14-week) seasons saved before the NFL format ----------------
function newSeasonV1(team, seed = Date.now() & 0xffffffff) {
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

function userGameV1(S) {
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

function tableV1(S) {
  return Object.entries(S.standings).map(([i, s]) => ({ team: +i, ...s, pct: (s.w + s.t * 0.5) / Math.max(1, s.w + s.l + s.t) }))
    .sort((a, b) => b.pct - a.pct || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);
}

// apply the user's result (myScore, oppScore), sim everyone else, advance
function finishWeekV1(S, myScore, oppScore) {
  const g = userGameV1(S);
  if (!g) return S;
  if (g.home === S.team) { g.hs = myScore; g.as = oppScore; } else { g.hs = oppScore; g.as = myScore; }
  if (S.phase === 'regular') {
    for (const x of S.weeks[S.week]) { if (x.hs === null) { const [a, b] = simScore(x.home, x.away); x.hs = a; x.as = b; } record(S, x); }
    S.week++;
    if (S.week >= S.weeks.length) startPlayoffs(S);   // old saves have 14 weeks
  } else advancePlayoffs(S);
  return S;
}

function startPlayoffs(S) {
  const top = tableV1(S).slice(0, 4).map(r => r.team);
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

function simMyGameV1(S) {
  const g = userGameV1(S); if (!g) return null;
  const [h, a] = simScore(g.home, g.away);
  const mine = g.home === S.team ? [h, a] : [a, h];
  if (S.phase !== 'regular' && mine[0] === mine[1]) mine[0] += 3;
  finishWeekV1(S, mine[0], mine[1]);
  return mine;
}
