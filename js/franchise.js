// ENDZONE KINGS — Franchise: run one team for as many seasons as you want.
// Your roster is real: players gain XP from what they do in games, age every offseason, ask for new contracts,
// and retire. Every offseason you re-sign or cut, draft rookies, then sign free agents under the salary cap.
import { askYes, askPick, showInfo, injuryCard } from './ui.js?v=1792379820';
import { grade, nextForm, decay, formed, formTag } from './form.js?v=1792379820';
import { watchSim } from './simview.js?v=1792379820';
import { bracketHTML } from './bracket.js?v=1792379820';
import { TEAMS, getRoster, POS_LABEL } from './teams.js?v=1792379820';
import * as Season from './season.js?v=1792379820';

let C = null;
const fmt = n => Math.round(+n || 0).toLocaleString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = () => 'ek_franchise_' + (C.Auth.user ? C.Auth.user.id : 'anon');
export const load = () => { try { return JSON.parse(localStorage.getItem(KEY())); } catch (_) { return null; } };
// the team overall at the top updates the moment the roster changes (sign, trade, cut, draft)
function liveFrOvr(F) { try { const el = document.querySelector('#fr-top .fr-ovr'); if (!el || !F || F.team == null) return; const r = teamRating(F), t = `${r.ovr} OVR (offense ${r.off}, defense ${r.def})`; if (el.textContent !== t) el.textContent = t; } catch (_) {} }
const save = F => { if (F) setTimeout(() => liveFrOvr(F), 0); if (F) F.at = Date.now(); try { localStorage.setItem(KEY(), JSON.stringify(F)); } catch (_) {} if (C && C.Auth && C.Auth.saveCloud) C.Auth.saveCloud(null, { fr: F }); };
// a newer franchise from another device replaces this one
export function adoptCloud(fr) { const cur = load(); if (fr && (!cur || (fr.at || 0) > (cur.at || 0))) { try { localStorage.setItem(KEY(), JSON.stringify(fr)); } catch (_) {} return true; } return false; }

export const CAP = 240;   // salary cap, $M
const BENCH_MAX = 10;
const RK = ['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'];
const GROUP = r => ({ QB: 'QB', RB: 'HB', WR1: 'WR', WR2: 'WR', WR3: 'WR', TE: 'TE', C: 'OL', LG: 'OL', RG: 'OL', LT: 'OL', RT: 'OL', DL1: 'DL', DL2: 'DL', DL3: 'DL', DL4: 'DL', LB: 'LB', LB2: 'LB', LB3: 'LB', CB1: 'CB', CB2: 'CB', S: 'S', SS: 'S' }[r] || 'WR');
const KEYS = { QB: ['acc', 'arm'], HB: ['spd', 'elu'], WR: ['spd', 'hands'], TE: ['hands', 'blk'], OL: ['blk'], DL: ['rush', 'tkl'], LB: ['tkl', 'spd'], CB: ['cov', 'spd'], S: ['cov', 'tkl'] };
const DEV = [['normal', 'Normal', 1], ['star', 'Star', 1.35], ['superstar', 'Superstar', 1.75], ['xfactor', 'X-Factor', 2.2]];
const devMul = d => (DEV.find(x => x[0] === d) || DEV[0])[2];
const devName = d => (DEV.find(x => x[0] === d) || DEV[0])[1];
const FIRST = ['Marcus', 'Jalen', 'Tyler', 'Devin', 'Chris', 'Jordan', 'Darius', 'Andre', 'Malik', 'Caleb', 'Trey', 'Isaiah', 'Cole', 'Logan', 'Zach', 'Mason', 'Elijah', 'Nate', 'Bryce', 'Xavier', 'Hunter', 'Jamal', 'Owen', 'Dante', 'Kyle', 'Micah', 'Jace', 'Victor', 'Tavon', 'Keon', 'Blake', 'Eli', 'Jabari', 'Myles', 'Omar', 'Reggie', 'Zion', 'Amari', 'Cedric', 'Gavin', 'Hakeem', 'Kareem', 'Nico', 'Quincy', 'Roman', 'Tobias', 'Wes', 'Ezra'];
const LAST = ['Carter', 'Brooks', 'Mitchell', 'Coleman', 'Reed', 'Bennett', 'Hayes', 'Sanders', 'Foster', 'Griffin', 'Wallace', 'Barnes', 'Graham', 'Turner', 'Collins', 'Morris', 'Howard', 'Watson', 'Butler', 'Jenkins', 'Powell', 'Hughes', 'Ellis', 'Holmes', 'Daniels', 'Dixon', 'Fields', 'Knox', 'Lane', 'Nash', 'Owens', 'Shaw', 'Tate', 'Vance', 'Webb', 'Boone', 'Crane', 'Dorsey', 'Gaines', 'Holloway', 'Ingram', 'Lockett', 'Mercer', 'Okafor', 'Ramsey', 'Slater', 'Thorne', 'Vaughn', 'Whitfield', 'Castillo'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clampR = v => Math.max(40, Math.min(99, Math.round(v)));

export const salaryFor = ovr => +(0.6 + Math.max(0, ovr - 60) ** 2 * 0.02).toFixed(2);
function calcOvr(p) { const ks = KEYS[p.group] || ['spd']; return clampR(ks.reduce((s, k) => s + p[k], 0) / ks.length + 2); }
const xpNeed = p => 900 + Math.max(0, p.ovr - 60) * 45;

// ---------------- making players ----------------
function mkPlayer(F, group, ovr, age, extra = {}) {
  const p = { id: F.next++, group, first: pick(FIRST), last: pick(LAST), age, dev: extra.dev || (Math.random() < 0.06 ? 'superstar' : Math.random() < 0.2 ? 'star' : 'normal'), xp: 0, face: (Math.random() * 4e9) >>> 0, num: 0, ss: {}, cs: {} };
  const ks = KEYS[group];
  for (const k of RK) p[k] = clampR(ks.includes(k) ? ovr + rnd(-2, 3) : ovr - 14 + rnd(-8, 8));
  if (group === 'OL' || group === 'DL') p.spd = clampR(Math.min(p.spd, 58 + rnd(0, 18)));
  p.ovr = calcOvr(p);
  p.sal = extra.sal ?? +(salaryFor(p.ovr) * rnd(0.75, 1.05)).toFixed(2);
  p.yrs = extra.yrs ?? (1 + ((Math.random() * 4) | 0));
  return p;
}
function fromRoster(F, role, q) {
  const p = { id: F.next++, group: GROUP(role), first: q.first, last: q.last, age: q.age || 26, dev: q.ovr >= 93 ? 'xfactor' : q.ovr >= 87 ? 'superstar' : q.ovr >= 80 ? 'star' : 'normal', xp: 0, face: q.face || ((Math.random() * 4e9) >>> 0), num: q.num, ss: {}, cs: {} };
  for (const k of RK) p[k] = q[k];
  p.ovr = q.ovr; p.sal = +(salaryFor(p.ovr) * rnd(0.6, 0.9)).toFixed(2); p.yrs = 1 + ((Math.random() * 4) | 0);
  return p;
}

export function newFranchise(team) {
  const F = { v: 1, team, year: 2026, next: 1, players: {}, starters: {}, bench: [], phase: 'season', season: null, history: [], trophies: 0, draft: null, fa: null, pick: 0, log: [] };
  const r = getRoster(team);
  for (const role of r.order) { const p = fromRoster(F, role, r.players[role]); F.players[p.id] = p; F.starters[role] = p.id; }
  // a few backups so injuries and retirements don't leave holes
  for (const g of ['QB', 'HB', 'WR', 'OL', 'DL', 'LB', 'CB', 'S']) { const p = mkPlayer(F, g, rnd(60, 70), 22 + ((Math.random() * 6) | 0)); F.players[p.id] = p; F.bench.push(p.id); }
  F.season = Season.newSeason(team, undefined, 2026);
  save(F);
  return F;
}

// ---------------- helpers ----------------
export const payroll = F => Object.values(F.players).reduce((s, p) => s + p.sal, 0);
// who actually plays a spot this week: the starter, or (if he's hurt) the best healthy backup at his position
function activeAt(F, role) {
  const p = F.players[F.starters[role]];
  if (p && !(p.inj && p.inj.weeks > 0)) return p;
  const g = GROUP(role), alt = F.bench.map(id => F.players[id]).filter(q => q && q.group === g && !(q.inj && q.inj.weeks > 0)).sort((a, b) => b.ovr - a.ovr)[0];
  if (alt) return alt;
  return p ? { ...p, first: 'Backup', last: role, ovr: Math.max(50, p.ovr - 10), spd: p.spd - 8, hands: p.hands - 8, acc: p.acc - 8, arm: p.arm - 8, elu: p.elu - 8, blk: p.blk - 8, rush: p.rush - 8, tkl: p.tkl - 8, cov: p.cov - 8 } : null;
}
export function teamRating(F) {
  const P = id => { const role = Object.keys(F.starters).find(r => F.starters[r] === id); return (role && activeAt(F, role)) || F.players[id] || { ovr: 50 }; };
  const off = ['QB', 'QB', 'RB', 'WR1', 'WR2', 'C', 'LG', 'RG'].filter(r => r === 'QB' || F.starters[r] !== undefined).map(r => P(F.starters[r]).ovr);
  const defR = Object.keys(F.starters).filter(r => /^(DL|LB|CB|S)/.test(r));
  const def = defR.map(r => P(F.starters[r]).ovr);
  const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  return { off: Math.round(avg(off)), def: Math.round(avg(def)), ovr: Math.round((avg(off) + avg(def)) / 2) };
}
// the roster object the sim reads
export function simRoster(F) {
  const players = {}, used = new Set();
  for (const [role] of Object.entries(F.starters)) {
    const p = activeAt(F, role); if (!p) return null;
    let num = p.num || 0; while (used.has(num)) num = (num + 1) % 100; used.add(num);
    players[role] = formed({ first: p.first, last: p.last, num, face: p.face, ovr: p.ovr, spd: p.spd, hands: p.hands, acc: p.acc, arm: p.arm, elu: p.elu, blk: p.blk, rush: p.rush, tkl: p.tkl, cov: p.cov }, p.form, p.ling);   // hot/cold form and lingering knocks
  }
  return { players };
}
const roleOf = (F, id) => Object.keys(F.starters).find(r => F.starters[r] === id);
function fillHoles(F) {
  // any empty starting spot takes the best backup at that position, or a cheap rookie if there's nobody
  const r = getRoster(F.team);
  for (const role of r.order) {
    if (F.players[F.starters[role]]) continue;
    const g = GROUP(role);
    const b = F.bench.map(id => F.players[id]).filter(p => p && p.group === g).sort((a, b) => b.ovr - a.ovr)[0];
    if (b) { F.starters[role] = b.id; F.bench = F.bench.filter(x => x !== b.id); }
    else { const p = mkPlayer(F, g, rnd(58, 64), 22, { yrs: 2, sal: 0.75 }); F.players[p.id] = p; F.starters[role] = p.id; F.log.unshift(`${F.year}: signed ${p.first} ${p.last} (${g}) to fill a hole`); }
  }
}
function levelUp(p) { const ks = KEYS[p.group]; for (const k of ks) p[k] = clampR(p[k] + 1); p.ovr = calcOvr(p); }
function levelDown(p, n) { for (const k of RK) p[k] = clampR(p[k] - n * (KEYS[p.group].includes(k) || k === 'spd' ? 1 : 0.5)); p.ovr = calcOvr(p); }

// ---------------- games ----------------
// XP from one game: S.ps holds per-player stats keyed by role
export function applyGame(F, ps, myIdx, won, myScore, oppScore, xpScale = 1) {
  const out = [], played = new Set();
  for (const s of ps || []) {
    if (s.t !== myIdx) continue;
    const id = F.starters[s.role]; const p = F.players[id]; if (!p || p.inj) continue;
    const f0 = p.form || 0; p.form = nextForm(f0, grade(s, s.role, won, myScore - oppScore)); played.add(p.id);
    if (p.form >= 1.5 && f0 < 1.5) out.push(`${p.first} ${p.last} is heating up (form +${Math.round(p.form)})`);
    else if (p.form <= -1.5 && f0 > -1.5) out.push(`${p.first} ${p.last} is in a slump (form ${Math.round(p.form)})`);
    for (const k of ['py', 'ptd', 'ry', 'rec', 'recy', 'td', 'tk', 'sk', 'int']) { p.ss[k] = (p.ss[k] || 0) + (s[k] || 0); p.cs[k] = (p.cs[k] || 0) + (s[k] || 0); }
    let xp = 60 + (won ? 50 : 0) + (s.py || 0) * 0.6 + (s.ptd || 0) * 40 + (s.ry || 0) * 1.6 + (s.recy || 0) * 1.3 + (s.rec || 0) * 8 + (s.td || 0) * 45 + (s.tk || 0) * 14 + (s.sk || 0) * 50 + (s.int || 0) * 60;
    if (p.group === 'OL') xp += 40 + Math.max(0, myScore - oppScore) * 2;
    xp *= devMul(p.dev) * xpScale;
    p.xp += Math.round(xp);
    let ups = 0; while (p.xp >= xpNeed(p) && p.ovr < 99) { p.xp -= xpNeed(p); levelUp(p); ups++; }
    if (ups) out.push(`${p.first} ${p.last} +${ups} OVR (now ${p.ovr})`);
  }
  for (const p of Object.values(F.players)) if (!played.has(p.id) && p.form) p.form = decay(p.form);
  return out;
}
function setOvr(F) { const t = teamRating(F); Season.setOvrOverride({ [F.team]: t.ovr }); }
// ---------------- wear and tear ----------------
// fatigue builds on starters all season; practice intensity trades growth for freshness; tired guys pull muscles
const SOFT = ['Hamstring strain', 'Groin strain', 'Calf strain', 'Back spasms', 'Quad strain'];
export const PRACTICE = { light: { fat: 0.01, xp: 0, inj: 0.004, n: 'Light' }, normal: { fat: 0.05, xp: 25, inj: 0.008, n: 'Normal' }, hard: { fat: 0.09, xp: 60, inj: 0.016, n: 'Hard' } };
function weekly(F, gameInj) {
  const pr = PRACTICE[F.practice || 'normal'], notes = [];
  for (const j of gameInj || []) {   // injuries from the game you just played
    const id = F.starters[j.role], p = F.players[id]; if (!p) continue;
    if (j.out === 'weeks') { p.inj = { kind: j.kind, weeks: j.weeks + 1, total: j.weeks }; notes.push(`${p.first} ${p.last}: ${j.kind}, out ${j.weeks} weeks`); }
    else if (!p.inj) { p.ling = { kind: j.kind, weeks: j.out === 'game' ? 3 : 2 }; notes.push(`${p.first} ${p.last} is playing through a ${j.kind.toLowerCase()}`); }   // a week of playing banged up
  }
  const starters = new Set(Object.values(F.starters));
  for (const p of Object.values(F.players)) {
    if (p.ling) { if (--p.ling.weeks <= 0) delete p.ling; }
    if (p.inj) { p.inj.weeks--; if (p.inj.weeks <= 0) { notes.push(`${p.first} ${p.last} is back from his ${p.inj.kind.toLowerCase()}, still a little banged up`); p.ling = { kind: p.inj.kind, weeks: 2 }; delete p.inj; } }
    const st = starters.has(p.id) && !p.inj;
    p.fat = Math.max(0, Math.min(1, (p.fat || 0) + (st ? 0.04 + pr.fat : -0.15)));
    if (st && pr.xp) { p.xp += Math.round(pr.xp * devMul(p.dev)); while (p.xp >= xpNeed(p) && p.ovr < 99) { p.xp -= xpNeed(p); levelUp(p); } }
    if (st && Math.random() < pr.inj + p.fat * 0.03) { const w = 1 + ((Math.random() * 3) | 0); p.inj = { kind: SOFT[(Math.random() * SOFT.length) | 0], weeks: w, total: w }; notes.push(`${p.first} ${p.last}: ${p.inj.kind} in practice, out ${w} week${w > 1 ? 's' : ''}`); }
  }
  for (const n of notes) F.log.unshift(`${F.year}: ${n}`);
  return notes;
}
export function setPractice(F, k) { if (PRACTICE[k]) { F.practice = k; save(F); } }
export function restPlayer(F, id, on) { const p = F.players[id]; if (p) { p.rest = !!on; save(F); } }
export function recordResult(F, myScore, oppScore, ps, myIdx, gameInj) {
  setOvr(F);
  const ups = applyGame(F, ps, myIdx, myScore > oppScore, myScore, oppScore);
  F.lastNotes = weekly(F, gameInj);
  Season.finishWeek(F.season, myScore, oppScore);
  if (F.season.phase === 'done') endSeason(F);
  save(F);
  return ups;
}
// a simmed week you watched: the real engine played it, so the box score drives form, injuries and a bit of XP
export function simResult(F, myScore, oppScore, ps, gameInj) {
  setOvr(F);
  const ups = applyGame(F, ps, 0, myScore > oppScore, myScore, oppScore, 0.6);
  F.lastNotes = weekly(F, gameInj);
  Season.finishWeek(F.season, myScore, oppScore);
  if (F.season.phase === 'done') endSeason(F);
  save(F);
  return ups;
}
export function simWeek(F) {
  setOvr(F);
  const mine = Season.simMyGame(F.season);
  F.lastNotes = weekly(F, []);
  // simulated games still give a little XP to starters
  if (mine) for (const id of Object.values(F.starters)) { const p = F.players[id]; if (!p) continue; p.xp += Math.round((70 + (mine[0] > mine[1] ? 40 : 0)) * devMul(p.dev)); while (p.xp >= xpNeed(p) && p.ovr < 99) { p.xp -= xpNeed(p); levelUp(p); } }
  if (F.season.phase === 'done') endSeason(F);
  save(F);
  return mine;
}
// end-of-season awards for your team, and the Hall of Fame for the all-time greats who retire with you
const OFFG = ['QB', 'HB', 'WR', 'TE', 'OL'];
function seasonAwards(F) {
  const all = Object.values(F.players).filter(p => production(p) > 0), top = (arr) => arr.sort((a, b) => production(b) - production(a))[0];
  const A = { year: F.year };
  const mvp = top(all.slice()); if (mvp) A.mvp = { n: `${mvp.first} ${mvp.last}`, g: mvp.group, id: mvp.id };
  const op = top(all.filter(p => OFFG.includes(p.group))); if (op) A.opoy = { n: `${op.first} ${op.last}`, g: op.group };
  const dp = top(all.filter(p => !OFFG.includes(p.group))); if (dp) A.dpoy = { n: `${dp.first} ${dp.last}`, g: dp.group };
  const rk = top(all.filter(p => p.age <= 23)); if (rk) A.roy = { n: `${rk.first} ${rk.last}`, g: rk.group };
  for (const k of ['mvp', 'opoy', 'dpoy', 'roy']) { const a = A[k]; if (!a) continue; const p = Object.values(F.players).find(q => `${q.first} ${q.last}` === a.n); if (p) p.awards = (p.awards || 0) + 1; }
  F.awards = [A, ...(F.awards || [])].slice(0, 30);
  F.log.unshift(`${F.year}: awards: MVP ${A.mvp ? A.mvp.n : '-'}${A.roy ? ', Rookie of the Year ' + A.roy.n : ''}`);
}
function hallCheck(F, p) {
  const c = p.cs || {}, score = (c.py || 0) / 25 + (c.ptd || 0) * 4 + (c.ry || 0) / 10 + (c.recy || 0) / 10 + (c.td || 0) * 6 + (c.tk || 0) * 1.2 + (c.sk || 0) * 4 + (c.int || 0) * 5 + (p.awards || 0) * 60;
  if (score >= 650 || (p.awards || 0) >= 3) { F.hof = [...(F.hof || []), { n: `${p.first} ${p.last}`, g: p.group, y: F.year, line: `${(c.py || 0) + (c.ry || 0) + (c.recy || 0)} yds, ${(c.td || 0) + (c.ptd || 0)} TD, ${c.tk || 0} tkl, ${p.awards || 0} awards` }]; F.log.unshift(`${F.year}: ${p.first} ${p.last} is going to the Hall of Fame`); }
}
function endSeason(F) {
  seasonAwards(F);
  const st = F.season.standings[F.team];
  const champ = F.season.champion === F.team;
  F.history.unshift({ year: F.year, w: st.w, l: st.l, t: st.t, champ, playoffs: !!(F.season.playoffs && F.season.playoffs.seeds.includes(F.team)) });
  if (champ) F.trophies++;
  // draft order: worst record picks first
  const tbl = Season.table(F.season).reverse();
  F.pick = tbl.findIndex(r => r.team === F.team);
  F.phase = 'resign';
  for (const p of Object.values(F.players)) p.yrs--;
}

// ---------------- offseason ----------------
// what a player wants: his rating, his age, and how much he produced this season (a big year means a raise)
export function production(p) { const s = p.ss || {}; return (s.py || 0) / 25 + (s.ptd || 0) * 4 + (s.ry || 0) / 10 + (s.recy || 0) / 10 + (s.rec || 0) * 0.5 + (s.td || 0) * 6 + (s.tk || 0) * 1.2 + (s.sk || 0) * 4 + (s.int || 0) * 5; }
export function askingPrice(p) {
  const prodBoost = Math.max(-0.12, Math.min(0.4, (production(p) - 60) / 400)), form = (p.form || 0) >= 1.5 ? 0.06 : 0;
  return +(salaryFor(p.ovr) * (p.age >= 31 ? 0.85 : 1.1) * (1 + prodBoost + form) * (1 + (p.askUp || 0))).toFixed(2);
}
// lowball offer: he might take it, or get insulted and ask for more
export function lowball(F, id, yrs) { const p = F.players[id]; if (!p || p.lowballed) return null; p.lowballed = true; const ok = Math.random() < (p.age >= 31 ? 0.6 : production(p) > 150 ? 0.25 : 0.45);
  if (ok) { p.sal = +(askingPrice(p) * 0.85).toFixed(2); p.yrs = yrs; } else p.askUp = (p.askUp || 0) + 0.1; save(F); return ok; }
export function resign(F, id, yrs) { const p = F.players[id]; if (!p) return; p.sal = askingPrice(p); p.yrs = yrs; delete p.askUp; delete p.lowballed; save(F); }
export function release(F, id) {
  const p = F.players[id]; if (!p) return;
  delete F.players[id]; F.bench = F.bench.filter(x => x !== id);
  const r = roleOf(F, id); if (r) delete F.starters[r];
  save(F);
}
export function toDraft(F) {
  // anyone left with no years walks
  for (const p of Object.values(F.players)) if (p.yrs <= 0) { F.log.unshift(`${F.year}: ${p.first} ${p.last} left in free agency`); release(F, p.id); }
  fillHoles(F);
  F.draft = { round: 1, pool: [], picks: [] };
  const groups = ['QB', 'HB', 'WR', 'WR', 'TE', 'OL', 'OL', 'DL', 'DL', 'LB', 'CB', 'CB', 'S'];
  for (let i = 0; i < 120; i++) {
    const g = pick(groups), pot = Math.random();
    const p = mkPlayer({ next: 100000 + i }, g, rnd(58, 76) + (pot > 0.92 ? 4 : 0), 21 + ((Math.random() * 2) | 0), { dev: pot > 0.97 ? 'xfactor' : pot > 0.88 ? 'superstar' : pot > 0.65 ? 'star' : 'normal', yrs: 4 });
    // scouting isn't perfect: the projection is what everyone sees; a few are busts (look great, won't grow) or sleepers (look average, will explode)
    const roll = Math.random();
    if (roll < 0.08) { p.tag = 'bust'; p.proj = Math.random() < 0.5 ? 'superstar' : 'star'; p.dev = 'normal'; p.ovr = Math.min(80, p.ovr + 3); }
    else if (roll < 0.18) { p.tag = 'sleeper'; p.proj = 'normal'; p.dev = Math.random() < 0.3 ? 'xfactor' : 'superstar'; }
    else p.proj = p.dev;
    p.hidden = true;
    p.pid = 'd' + i; p.grade = p.ovr + (devMul(p.proj) - 1) * 12;
    F.draft.pool.push(p);
  }
  F.draft.pool.sort((a, b) => b.grade - a.grade);
  F.phase = 'draft';
  aiPicksUntilMine(F);
  save(F);
}
function aiPicksUntilMine(F) {
  // the other 31 teams pick between your turns: mostly best available, sometimes a reach
  const D = F.draft; if (!D) return;
  const n = D.round === 1 ? F.pick : 31;
  for (let i = 0; i < n && D.pool.length; i++) { const k = Math.min(D.pool.length - 1, Math.random() < 0.7 ? 0 : (Math.random() * 4) | 0); D.pool.splice(k, 1); }
}
export function draftPlayer(F, pid) {
  const D = F.draft; const i = D.pool.findIndex(p => p.pid === pid); if (i < 0) return 'Already taken';
  if (F.bench.length >= BENCH_MAX) return `Your bench is full (${BENCH_MAX}). Release someone first`;
  const p = D.pool.splice(i, 1)[0]; p.id = F.next++; p.sal = +(salaryFor(p.ovr) * 0.5).toFixed(2); p.yrs = 4; delete p.pid; delete p.grade;
  F.players[p.id] = p; F.bench.push(p.id); D.picks.push(p.id);
  F.log.unshift(`${F.year}: drafted ${p.first} ${p.last} (${p.group}, ${p.ovr} OVR, projected ${devName(p.proj || p.dev)}) in round ${D.round}`);
  D.round++;
  if (D.round > 3) return toFreeAgency(F), null;
  aiPicksUntilMine(F); save(F); return null;
}
export function skipPick(F) { const D = F.draft; D.round++; if (D.round > 3) toFreeAgency(F); else aiPicksUntilMine(F); save(F); }
function toFreeAgency(F) {
  F.draft = null; F.phase = 'fa';
  F.fa = [];
  for (let i = 0; i < 30; i++) { const g = pick(['QB', 'HB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S']); const age = 25 + ((Math.random() * 9) | 0); const p = mkPlayer({ next: 200000 + i }, g, rnd(62, 86), age, { yrs: 1 + ((Math.random() * 3) | 0) }); p.pid = 'f' + i; p.sal = askingPrice(p); F.fa.push(p); }
  F.fa.sort((a, b) => b.ovr - a.ovr);
  save(F);
}
export function signFA(F, pid) {
  const i = F.fa.findIndex(p => p.pid === pid); if (i < 0) return 'Already signed';
  const p = F.fa[i];
  if (payroll(F) + p.sal > CAP) return `Not enough cap space. You need $${(payroll(F) + p.sal - CAP).toFixed(1)}M more`;
  if (F.bench.length >= BENCH_MAX) return `Your bench is full (${BENCH_MAX}). Release someone first`;
  F.fa.splice(i, 1); p.id = F.next++; delete p.pid; F.players[p.id] = p; F.bench.push(p.id);
  F.log.unshift(`${F.year}: signed free agent ${p.first} ${p.last} (${p.group}, ${p.ovr} OVR)`);
  save(F); return null;
}
export function startNextSeason(F) {
  F.fa = null; F.year++;
  const notes = [];
  for (const p of Object.values(F.players)) {
    p.age++; p.ss = {};
    // progression and regression by age and development trait
    let d = 0;
    if (p.tag === 'bust' && p.age <= 27) d = Math.round(rnd(-1.5, 0.8));   // busts stall out
    else if (p.age <= 24) d = Math.round(rnd(0, 3) * devMul(p.dev));
    else if (p.age <= 28) d = Math.round(rnd(-0.5, 2) * devMul(p.dev));
    else if (p.age <= 31) d = Math.round(rnd(-2, 0.5));
    else d = Math.round(rnd(-5, -1));
    if (d > 0) { for (let i = 0; i < d; i++) levelUp(p); } else if (d < 0) levelDown(p, -d);
    if (Math.abs(d) >= 3) notes.push(`${p.first} ${p.last} ${d > 0 ? '+' : ''}${d} OVR`);
    // after his first season the truth comes out
    if (p.hidden) {
      p.hidden = false;
      if (p.tag === 'sleeper') { notes.push(`SLEEPER! ${p.first} ${p.last} is a ${devName(p.dev)}`); F.log.unshift(`${F.year}: ${p.first} ${p.last} turned out to be a sleeper (${devName(p.dev)})`); }
      else if (p.tag === 'bust') { notes.push(`BUST: ${p.first} ${p.last} isn't the ${devName(p.proj)} we thought`); F.log.unshift(`${F.year}: ${p.first} ${p.last} was a draft bust`); }
    }
    if (p.age >= 34 && Math.random() < (p.age - 32) * 0.25) { notes.push(`${p.first} ${p.last} retired`); F.log.unshift(`${F.year}: ${p.first} ${p.last} retired at ${p.age}`); hallCheck(F, p); release(F, p.id); }
  }
  fillHoles(F);
  F.season = Season.newSeason(F.team, undefined, F.year);
  F.phase = 'season';
  save(F);
  return notes;
}
export function swap(F, role, benchId) {
  const cur = F.starters[role], b = F.players[benchId]; if (!b || b.group !== GROUP(role)) return 'Wrong position';
  F.bench = F.bench.filter(x => x !== benchId); if (cur !== undefined && F.players[cur]) F.bench.push(cur);
  F.starters[role] = benchId; save(F); return null;
}

// ---------------- UI ----------------
let tab = 'hub';
export function initFranchise(ctx) {
  C = ctx;
  C.$$('.fr-tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.fr; C.sfx.play('ui'); renderFranchise(); }));
}
export function franchiseSub() { const F = load(); if (!F) return 'Run a team for years: draft, contracts, progression'; const s = F.season.standings[F.team]; return `${TEAMS[F.team].city}, ${F.year}, ${F.phase === 'season' ? `${s.w}W-${s.l}L` : 'offseason'}`; }
// franchises started before 11-on-11 get the team's real tight end, slot, tackles and extra defenders
function migrate(F) {
  const r = getRoster(F.team); let n = 0;
  for (const role of r.order) if (!F.players[F.starters[role]]) { const p = fromRoster(F, role, r.players[role]); F.players[p.id] = p; F.starters[role] = p.id; n++; }
  if (n) { F.log.unshift(`${F.year}: the league went 11-on-11, ${n} players joined your team`); save(F); }
}
// ---------- trades with CPU teams (before the week 9 deadline, 4 a season) ----------
const TRADE_MAX = 4;
export const tradeOpen = F => F.season && F.season.phase === 'regular' && F.season.week < 9;
const tradeVal = p => p.ovr + (p.age <= 25 ? 2 : p.age >= 31 ? -3 : 0) + (p.dev === 'superstar' ? 4 : p.dev === 'star' ? 2 : 0);
export function tradeOffers(F, id) {
  const p = F.players[id]; if (!p) return [];
  F.offers = F.offers || {}; const key = `${id}:${F.year}:${F.season.week}`;
  if (F.offers[key]) return F.offers[key];
  const others = Object.keys(TEAMS).map(Number).filter(t => t !== F.team), v = tradeVal(p);
  const weak = Object.keys(F.starters).map(r => [r, F.players[F.starters[r]]]).filter(([, q]) => q).sort((a, b) => a[1].ovr - b[1].ovr).map(([r]) => GROUP(r));
  const groups = [p.group, weak[0] || p.group, weak[1] || p.group];
  const out = groups.map((g, i) => { const age = 23 + ((Math.random() * 9) | 0), ovr = Math.max(55, Math.min(95, Math.round(v - (age <= 25 ? 2 : age >= 31 ? -3 : 0) + (Math.random() * 4 - 2.5)))); const q = mkPlayer(F, g, ovr, age, { yrs: 1 + ((Math.random() * 3) | 0) }); q.sal = salaryFor(q.ovr); q.from = others[(Math.random() * others.length) | 0]; return q; });
  F.offers = { [key]: out }; save(F); return out;
}
export function acceptTrade(F, id, offerIdx) {
  const p = F.players[id], key = `${id}:${F.year}:${F.season.week}`, q = F.offers && F.offers[key] && F.offers[key][offerIdx]; if (!p || !q) return 'That offer is gone';
  if (!tradeOpen(F)) return 'The trade deadline has passed';
  F.trades = F.trades && F.trades.y === F.year ? F.trades : { y: F.year, n: 0 }; if (F.trades.n >= TRADE_MAX) return `You've used all ${TRADE_MAX} trades this season`;
  if (payroll(F) - p.sal + q.sal > CAP) return 'That trade would put you over the cap';
  const role = roleOf(F, id); delete F.players[id]; F.bench = F.bench.filter(x => x !== id);
  const nq = { ...q, id: F.next++ }; delete nq.from; F.players[nq.id] = nq;
  if (role && GROUP(role) === nq.group) F.starters[role] = nq.id; else { if (role) delete F.starters[role]; F.bench.push(nq.id); fillHoles(F); }
  F.trades.n++; F.offers = {}; F.log.unshift(`${F.year}: traded ${p.first} ${p.last} to ${TEAMS[q.from].city} for ${nq.first} ${nq.last} (${nq.group}, ${nq.ovr})`); save(F); return null;
}
function tradeTab(F) {
  const pane = C.$('#fr-pane'), open = tradeOpen(F), left = TRADE_MAX - (F.trades && F.trades.y === F.year ? F.trades.n : 0);
  const mine = Object.values(F.players).sort((a, b) => b.ovr - a.ovr);
  pane.innerHTML = `<div class="fr-next"><div><small>Trade block</small><h3>${open ? `Deadline: before week 9 · ${left} trade${left === 1 ? '' : 's'} left` : 'The trade deadline has passed'}</h3><p class="note">Put a player on the block to see what CPU teams will give you. Offers change every week.</p></div></div>
    <div class="fr-list">${mine.map(p => pRow(p, open && left > 0 ? `<button class="btn sm" data-tb="${p.id}">Shop him</button>` : '')).join('')}</div><div id="fr-offers"></div>`;
  C.$$('[data-tb]', pane).forEach(b => b.onclick = () => {
    const id = +b.dataset.tb, p = F.players[id], offs = tradeOffers(F, id), box = C.$('#fr-offers');
    box.innerHTML = `<h3 class="store-h">Offers for ${esc(p.first)} ${esc(p.last)} (${p.group}, ${p.ovr})</h3><div class="fr-list">${offs.map((q, i) => pRow(q, `<span class="note">from ${TEAMS[q.from].abbr}</span><button class="btn sm primary" data-ta="${i}">Accept</button>`)).join('')}</div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    C.$$('[data-ta]', box).forEach(a => a.onclick = async () => { const q = offs[+a.dataset.ta]; if (!(await askYes(`Trade ${p.last} for ${q.first} ${q.last} (${q.group}, ${q.ovr})?`, 'Trade'))) return; const err = acceptTrade(F, id, +a.dataset.ta); C.toast(err || 'Trade done'); renderFranchise(); });
  });
}
// tap any player: injury, recovery, fatigue and form
function wirePlayerInfo(F) {
  const pane = C.$('#fr-pane'); if (!pane || pane.dataset.pi) return; pane.dataset.pi = 1;
  pane.addEventListener('click', e => {
    if (e.target.closest('button, input, select')) return;
    const el = e.target.closest('[data-pinfo]'); if (!el) return;
    const FF = load(), p = FF && FF.players[el.dataset.pinfo]; if (!p) return;
    const wk = FF.season ? (FF.season.week || 0) + 1 : 0;
    showInfo(p.inj ? 'Injury report' : 'Player status', injuryCard({ ...p, name: `${p.first} ${p.last}`, pos: `${p.group} · ${p.ovr} OVR`, backWeek: p.inj && wk ? wk + p.inj.weeks : 0 }));
  });
}
export function renderFranchise() {
  const F = load(), { $ } = C; wirePlayerInfo(F);
  if (F) migrate(F);
  $('#fr-new').classList.toggle('hidden', !!F); $('#fr-hub').classList.toggle('hidden', !F);
  if (!F) {
    let pickT = -1;
    C.fillGrid($('#fr-grid'), -1, -1, ti => { pickT = ti; $('#fr-start').disabled = false; });
    $('#fr-start').disabled = true;
    $('#fr-start').onclick = () => { if (pickT < 0) return; newFranchise(pickT); C.toast(`Welcome to ${TEAMS[pickT].city}. The front office is yours.`); tab = 'hub'; renderFranchise(); };
    return;
  }
  C.$$('.fr-tab').forEach(b => b.classList.toggle('on', b.dataset.fr === tab));
  const t = TEAMS[F.team], r = teamRating(F), pay = payroll(F);
  $('#fr-top').innerHTML = `<img alt="" src="${C.logoURL(F.team, 96)}"><div><h3>${t.city} <small>${F.year} season</small></h3><p class="note"><span class="fr-ovr">${r.ovr} OVR (offense ${r.off}, defense ${r.def})</span>. ${F.trophies} Kings Bowl title${F.trophies === 1 ? '' : 's'}. ${(() => { const h = F.history || [], w = h.reduce((a, x) => a + x.w, 0), l = h.reduce((a, x) => a + x.l, 0), tt = h.reduce((a, x) => a + (x.t || 0), 0), po = h.filter(x => x.playoffs).length; return h.length ? `All-time ${w}-${l}${tt ? '-' + tt : ''} over ${h.length} season${h.length > 1 ? 's' : ''}, ${po} playoff trip${po === 1 ? '' : 's'}.` : 'First season.'; })()} Payroll $${pay.toFixed(1)}M of $${CAP}M.</p></div>
    <div class="fr-cap"><div class="bar"><i style="width:${Math.min(100, pay / CAP * 100)}%;${pay > CAP ? 'background:var(--siren)' : ''}"></i></div><small>Cap space $${(CAP - pay).toFixed(1)}M</small></div>`;
  ({ hub: hubTab, roster: rosterTab, trade: tradeTab, league: leagueTab, legacy: legacyTab })[tab](F);
}
function hubTab(F) {
  const pane = C.$('#fr-pane');
  if (F.phase === 'resign') return resignView(F, pane);
  if (F.phase === 'draft') return draftView(F, pane);
  if (F.phase === 'fa') return faView(F, pane);
  const S = F.season, g = Season.userGame(S);
  const st = S.standings[F.team];
  const opp = g ? (g.home === F.team ? g.away : g.home) : -1;
  const bye = Season.onBye && Season.onBye(S);
  pane.innerHTML = `<div class="fr-next">${bye ? `<div><small>${Season.phaseLabel(S)}</small><h3>Bye week</h3><p class="note">You're ${st.w}W-${st.l}L${st.t ? '-' + st.t + 'T' : ''}. Rest up, the rest of the league plays.</p></div><div class="cr-btns"><button class="btn primary big" id="fr-sim">Next week</button></div>` : g ? `<div><small>${Season.phaseLabel(S)}</small><h3>${g.home === F.team ? 'vs' : 'at'} ${TEAMS[opp].city}</h3><p class="note">You're ${st.w}W-${st.l}L${st.t ? '-' + st.t + 'T' : ''}. Opponent ${C.teamOvr(opp)} OVR.</p></div>
      <div class="cr-btns"><button class="btn primary big" id="fr-play">Play game</button><button class="btn" id="fr-sim">Simulate</button></div>` : `<p class="note">${S.eliminated ? 'Your season is over.' : 'Season complete.'}</p>`}</div>
    <div class="fr-practice"><b>Practice this week</b><div class="seg" id="fr-prac"></div><small class="note">${PRACTICE[F.practice || 'normal'].n === 'Hard' ? 'Hard: players grow faster but wear down and get hurt more.' : PRACTICE[F.practice || 'normal'].n === 'Light' ? 'Light: players stay fresh, but grow slower.' : 'Normal: a balance of growth and freshness.'}</small></div>
    ${(() => { const hurt = Object.values(F.players).filter(p => p.inj || p.ling); const tired = Object.values(F.players).filter(p => !p.inj && (p.fat || 0) > 0.55 && Object.values(F.starters).includes(p.id)); return (hurt.length ? `<h3 class="store-h">Injuries</h3><ul class="fr-log">${hurt.map(p => `<li class="inj-li" data-pinfo="${p.id}"><i class="inj-cross ${p.inj ? '' : 'q'}">✚</i><b>${esc(p.first)} ${esc(p.last)}</b> (${p.group}): ${p.inj ? `${esc(p.inj.kind)}, out ${p.inj.weeks} more week${p.inj.weeks > 1 ? 's' : ''}` : `playing through ${esc(p.ling.kind.toLowerCase())}, ${p.ling.weeks} wk`}<small>details</small></li>`).join('')}</ul>` : '') + (tired.length ? `<h3 class="store-h">Worn down</h3><p class="note">${tired.map(p => `${esc(p.last)} (${Math.round(p.fat * 100)}%)`).join(', ')}. Ease up in practice or sit them to avoid injuries.</p>` : ''); })()}
    <h3 class="store-h">Recent moves</h3><ul class="fr-log">${F.log.slice(0, 8).map(l => `<li>${esc(l)}</li>`).join('') || '<li>Nothing yet. Go win some games.</li>'}</ul>`;
  { const ps = C.$('#fr-prac'); if (ps) C.seg(ps, [['light', 'Light'], ['normal', 'Normal'], ['hard', 'Hard']], F.practice || 'normal', v => { setPractice(F, v); renderFranchise(); }); }
  const pb = C.$('#fr-play'); if (pb) pb.onclick = () => { const ros = simRoster(F); if (!ros) return C.toast('Your lineup has holes'); C.startCPU({ teams: [F.team, opp], rosters: [ros, null], franchise: true }); };
  const sb = C.$('#fr-sim'); if (sb) sb.onclick = async () => {
    if (opp < 0) { simWeek(F); C.toast('Bye week done'); return renderFranchise(); }
    const ros = simRoster(F); if (!ros) return C.toast('Your lineup has holes');
    const r = await watchSim({ teams: [F.team, opp], rosters: [ros, null], names: [TEAMS[F.team].city, TEAMS[opp].city], qlen: C.SET.qlen || 120, diff: C.SET.diff ?? 1, logo: C.logoURL });
    const ups = simResult(F, r.sc[0], r.sc[1], r.ps, r.injLog.filter(j => j.team === 0));
    C.toast(`${r.sc[0] > r.sc[1] ? 'Won' : r.sc[0] < r.sc[1] ? 'Lost' : 'Tied'} ${r.sc[0]}-${r.sc[1]}${ups.length ? ' · ' + ups[0] : ''}`, 3200); renderFranchise();
  };
}
function pRow(p, extra = '') { const hurtTag = p.inj ? ` · <b style="color:#ff8b8b">OUT ${p.inj.weeks} wk (${esc(p.inj.kind)})</b>` : p.ling ? ` · <b style="color:#ffb36b">banged up: ${esc(p.ling.kind)}</b>` : (p.fat || 0) > 0.55 ? ` · <b style="color:#f6c445">tired ${Math.round(p.fat * 100)}%</b>` : ''; extra = hurtTag ? `<small class="fr-hurt">${hurtTag}</small>` + extra : extra; const dv = p.hidden ? `projected ${devName(p.proj || p.dev)} (?)` : devName(p.dev) + (p.tag === 'sleeper' ? ' · SLEEPER' : p.tag === 'bust' ? ' · BUST' : ''); return `<div class="fr-p ${p.inj ? 'is-hurt' : p.ling ? 'is-ling' : ''}" data-pinfo="${p.id}" title="Tap for injury and form details"><span class="fr-ovr">${p.ovr}</span><div><b>${esc(p.first)} ${esc(p.last)}</b>${p.inj ? '<i class="inj-cross" title="Injured">✚</i>' : ''}${formTag(p.form)}<small>${p.group}, age ${p.age}, ${dv}, $${p.sal.toFixed(2)}M x ${Math.max(0, p.yrs)} yr${p.yrs === 1 ? '' : 's'}</small></div>${extra}</div>`; }
function rosterTab(F) {
  const pane = C.$('#fr-pane'), order = getRoster(F.team).order;
  pane.innerHTML = `<h3 class="store-h">Starters</h3><div class="fr-list">${order.map(role => { const p = F.players[F.starters[role]]; return p ? `<div class="fr-slot"><small>${POS_LABEL[role] || role}</small>${pRow(p, `<div class="fr-xp" title="XP to next point"><i style="width:${Math.min(100, p.xp / xpNeed(p) * 100)}%"></i></div><button class="btn sm" data-sw="${role}">Swap</button>`)}</div>` : `<div class="fr-slot"><small>${role}</small><p class="note">Empty</p></div>`; }).join('')}</div>
    <h3 class="store-h">Bench (${F.bench.length} of ${BENCH_MAX})</h3><div class="fr-list">${F.bench.map(id => F.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).map(p => pRow(p, `<button class="btn sm danger" data-cut="${p.id}">Release</button>`)).join('') || '<p class="note">No backups.</p>'}</div>`;
  C.$$('[data-sw]', pane).forEach(b => b.onclick = async () => {
    const role = b.dataset.sw, g = GROUP(role), opts = F.bench.map(id => F.players[id]).filter(p => p && p.group === g);
    if (!opts.length) return C.toast(`No ${g} on your bench`);
    const best = opts.sort((a, b) => b.ovr - a.ovr);
    const pid = await askPick('Swap in who?', best.map(p => [p.id, `${p.first} ${p.last} (${p.ovr} OVR)`])); if (pid === null) return;
    const p = best.find(x => x.id === pid); if (!p) return;
    const e = swap(F, role, p.id); if (e) C.toast(e); else { C.toast(`${p.last} is starting`); renderFranchise(); }
  });
  C.$$('[data-cut]', pane).forEach(b => b.onclick = async () => { const p = F.players[+b.dataset.cut]; if (!(await askYes(`Release ${p.first} ${p.last}? His salary comes off your cap.`, 'Release'))) return; release(F, p.id); renderFranchise(); });
}
function leagueTab(F) {
  const pane = C.$('#fr-pane'), rows = Season.table(F.season);
  pane.innerHTML = `${F.season.playoffs ? `<h3 class="store-h">Playoffs</h3>${bracketHTML(F.season, F.team, C.logoURL)}` : ''}<div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr>${rows.map((r, i) => `<tr class="${r.team === F.team ? 'me' : ''}"><td>${i + 1}</td><td>${TEAMS[r.team].city}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td></tr>`).join('')}</table></div>`;
}
function legacyTab(F) {
  const pane = C.$('#fr-pane'), all = Object.values(F.players).sort((a, b) => (b.cs.td || 0) + (b.cs.py || 0) / 50 - (a.cs.td || 0) - (a.cs.py || 0) / 50).slice(0, 8);
  pane.innerHTML = `<h3 class="store-h">Seasons</h3><div class="fr-list">${F.history.map(h => `<div class="fr-p"><span class="fr-ovr">${h.champ ? '🏆' : h.playoffs ? 'P' : '-'}</span><div><b>${h.year}: ${h.w}W-${h.l}L${h.t ? '-' + h.t + 'T' : ''}</b><small>${h.champ ? 'Kings Bowl champions' : h.playoffs ? 'Made the playoffs' : 'Missed the playoffs'}</small></div></div>`).join('') || '<p class="note">Your first season is still going.</p>'}</div>
    <h3 class="store-h">Franchise leaders</h3><div class="fr-list">${all.map(p => pRow(p, `<small class="fr-cs">${fmt(p.cs.py || 0)} pass yds, ${fmt(p.cs.ry || 0)} rush, ${fmt(p.cs.recy || 0)} rec, ${fmt(p.cs.td || 0)} TD, ${fmt(p.cs.tk || 0)} tkl, ${fmt(p.cs.sk || 0)} sacks</small>`)).join('')}</div>
    <h3 class="store-h">Awards</h3>${(F.awards || []).length ? `<div class="fr-list">${F.awards.map(a => `<div class="fr-p award-row"><span class="fr-ovr">${a.year}</span><div><b>MVP: ${esc(a.mvp ? a.mvp.n : '-')}</b><small>Off. POY ${esc(a.opoy ? a.opoy.n : '-')} · Def. POY ${esc(a.dpoy ? a.dpoy.n : '-')} · Rookie of the Year ${esc(a.roy ? a.roy.n : '-')}</small></div></div>`).join('')}</div>` : '<p class="note">Awards are handed out at the end of every season.</p>'}
    <h3 class="store-h">Hall of Fame</h3>${(F.hof || []).length ? `<div class="fr-list">${F.hof.map(h => `<div class="fr-p hof-row"><span class="fr-ovr">HOF</span><div><b>${esc(h.n)}</b><small>${h.g} · retired ${h.y} · ${esc(h.line)}</small></div></div>`).join('')}</div>` : '<p class="note">Legends who retire with your team get inducted here.</p>'}
    <div class="actions"><button class="btn danger" id="fr-quit">Retire from this franchise</button></div>`;
  C.$('#fr-quit').onclick = async () => { if (!(await askYes('End this franchise for good? Everything in it is deleted.', 'End it'))) return; try { localStorage.removeItem(KEY()); } catch (_) {} renderFranchise(); };
}
function resignView(F, pane) {
  const exp = Object.values(F.players).filter(p => p.yrs <= 0).sort((a, b) => b.ovr - a.ovr);
  pane.innerHTML = `<div class="fr-next"><div><small>Offseason, step 1 of 3</small><h3>Re-sign players</h3><p class="note">These contracts are up. Re-sign who you want, everyone else walks. Cap space left: $${(CAP - payroll(F)).toFixed(1)}M.</p></div><button class="btn primary" id="fr-go">Go to the draft</button></div>
    <div class="fr-list">${exp.map(p => pRow(p, `<span class="note">Asks $${askingPrice(p).toFixed(2)}M${production(p) > 120 ? ' (coming off a big year)' : ''}</span><button class="btn sm primary" data-rs="${p.id}" data-y="3">3 yrs</button><button class="btn sm" data-rs="${p.id}" data-y="1">1 yr</button>${p.lowballed ? '' : `<button class="btn sm" data-lb="${p.id}">Lowball -15%</button>`}`)).join('') || '<p class="note">No expiring contracts.</p>'}</div>`;
  C.$$('[data-rs]', pane).forEach(b => b.onclick = () => { const p = F.players[+b.dataset.rs]; if (payroll(F) - p.sal + askingPrice(p) > CAP) return C.toast('That would put you over the cap'); resign(F, p.id, +b.dataset.y); C.toast(`${p.last} re-signed`); renderFranchise(); });
  C.$$('[data-lb]', pane).forEach(b => b.onclick = () => { const p = F.players[+b.dataset.lb]; const ok = lowball(F, p.id, 2); C.toast(ok ? `${p.last} took the discount: 2 years at $${p.sal.toFixed(2)}M` : `${p.last} is insulted. His price just went up 10%`, 3200); renderFranchise(); });
  C.$('#fr-go').onclick = () => { toDraft(F); renderFranchise(); };
}
function draftView(F, pane) {
  const D = F.draft;
  pane.innerHTML = `<div class="fr-next"><div><small>Offseason, step 2 of 3</small><h3>Draft, round ${D.round}</h3><p class="note">You're on the clock. Rookies sign cheap 4-year deals. Scouting isn't perfect: some "can't miss" picks are busts, and some average-looking guys are sleepers. You find out after their first season.</p></div><button class="btn" id="fr-skip">Skip this pick</button></div>
    <div class="fr-list">${D.pool.slice(0, 24).map(p => pRow({ ...p, sal: salaryFor(p.ovr) * 0.5 }, `<button class="btn sm primary" data-dp="${p.pid}">Draft</button>`)).join('')}</div>`;
  C.$$('[data-dp]', pane).forEach(b => b.onclick = () => { const e = draftPlayer(F, b.dataset.dp); if (e) C.toast(e); else C.sfx.play('firstdown'); renderFranchise(); });
  C.$('#fr-skip').onclick = () => { skipPick(F); renderFranchise(); };
}
function faView(F, pane) {
  pane.innerHTML = `<div class="fr-next"><div><small>Offseason, step 3 of 3</small><h3>Free agency</h3><p class="note">Sign veterans if you have the cap space. Cap space left: $${(CAP - payroll(F)).toFixed(1)}M.</p></div><button class="btn primary" id="fr-next">Start the ${F.year + 1} season</button></div>
    <div class="fr-list">${(F.fa || []).map(p => pRow(p, `<button class="btn sm primary" data-fa="${p.pid}">Sign</button>`)).join('')}</div>`;
  C.$$('[data-fa]', pane).forEach(b => b.onclick = () => { const e = signFA(F, b.dataset.fa); if (e) C.toast(e); else C.sfx.play('ui'); renderFranchise(); });
  C.$('#fr-next').onclick = () => { const notes = startNextSeason(F); C.toast(`Welcome to ${F.year}.${notes.length ? ' ' + notes.slice(0, 3).join('. ') + '.' : ''}`, 4500); renderFranchise(); };
}
