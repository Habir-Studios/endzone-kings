// ENDZONE KINGS — Franchise: run one team for as many seasons as you want.
// Your roster is real: players gain XP from what they do in games, age every offseason, ask for new contracts,
// and retire. Every offseason you re-sign or cut, draft rookies, then sign free agents under the salary cap.
import { TEAMS, getRoster, POS_LABEL } from './teams.js?v=1792250937';
import * as Season from './season.js?v=1792250937';

let C = null;
const fmt = n => Math.round(+n || 0).toLocaleString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = () => 'ek_franchise_' + (C.Auth.user ? C.Auth.user.id : 'anon');
export const load = () => { try { return JSON.parse(localStorage.getItem(KEY())); } catch (_) { return null; } };
const save = F => { try { localStorage.setItem(KEY(), JSON.stringify(F)); } catch (_) {} };

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
  F.season = Season.newSeason(team);
  save(F);
  return F;
}

// ---------------- helpers ----------------
export const payroll = F => Object.values(F.players).reduce((s, p) => s + p.sal, 0);
export function teamRating(F) {
  const P = id => F.players[id] || { ovr: 50 };
  const off = ['QB', 'QB', 'RB', 'WR1', 'WR2', 'C', 'LG', 'RG'].filter(r => r === 'QB' || F.starters[r] !== undefined).map(r => P(F.starters[r]).ovr);
  const defR = Object.keys(F.starters).filter(r => /^(DL|LB|CB|S)/.test(r));
  const def = defR.map(r => P(F.starters[r]).ovr);
  const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  return { off: Math.round(avg(off)), def: Math.round(avg(def)), ovr: Math.round((avg(off) + avg(def)) / 2) };
}
// the roster object the sim reads
export function simRoster(F) {
  const players = {}, used = new Set();
  for (const [role, id] of Object.entries(F.starters)) {
    const p = F.players[id]; if (!p) return null;
    let num = p.num || 0; while (used.has(num)) num = (num + 1) % 100; used.add(num);
    players[role] = { first: p.first, last: p.last, num, face: p.face, ovr: p.ovr, spd: p.spd, hands: p.hands, acc: p.acc, arm: p.arm, elu: p.elu, blk: p.blk, rush: p.rush, tkl: p.tkl, cov: p.cov };
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
export function applyGame(F, ps, myIdx, won, myScore, oppScore) {
  const out = [];
  for (const s of ps || []) {
    if (s.t !== myIdx) continue;
    const id = F.starters[s.role]; const p = F.players[id]; if (!p) continue;
    for (const k of ['py', 'ptd', 'ry', 'rec', 'recy', 'td', 'tk', 'sk', 'int']) { p.ss[k] = (p.ss[k] || 0) + (s[k] || 0); p.cs[k] = (p.cs[k] || 0) + (s[k] || 0); }
    let xp = 60 + (won ? 50 : 0) + (s.py || 0) * 0.6 + (s.ptd || 0) * 40 + (s.ry || 0) * 1.6 + (s.recy || 0) * 1.3 + (s.rec || 0) * 8 + (s.td || 0) * 45 + (s.tk || 0) * 14 + (s.sk || 0) * 50 + (s.int || 0) * 60;
    if (p.group === 'OL') xp += 40 + Math.max(0, myScore - oppScore) * 2;
    xp *= devMul(p.dev);
    p.xp += Math.round(xp);
    let ups = 0; while (p.xp >= xpNeed(p) && p.ovr < 99) { p.xp -= xpNeed(p); levelUp(p); ups++; }
    if (ups) out.push(`${p.first} ${p.last} +${ups} OVR (now ${p.ovr})`);
  }
  return out;
}
function setOvr(F) { const t = teamRating(F); Season.setOvrOverride({ [F.team]: t.ovr }); }
export function recordResult(F, myScore, oppScore, ps, myIdx) {
  setOvr(F);
  const ups = applyGame(F, ps, myIdx, myScore > oppScore, myScore, oppScore);
  Season.finishWeek(F.season, myScore, oppScore);
  if (F.season.phase === 'done') endSeason(F);
  save(F);
  return ups;
}
export function simWeek(F) {
  setOvr(F);
  const mine = Season.simMyGame(F.season);
  // simulated games still give a little XP to starters
  if (mine) for (const id of Object.values(F.starters)) { const p = F.players[id]; if (!p) continue; p.xp += Math.round((70 + (mine[0] > mine[1] ? 40 : 0)) * devMul(p.dev)); while (p.xp >= xpNeed(p) && p.ovr < 99) { p.xp -= xpNeed(p); levelUp(p); } }
  if (F.season.phase === 'done') endSeason(F);
  save(F);
  return mine;
}
function endSeason(F) {
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
export function askingPrice(p) { return +(salaryFor(p.ovr) * (p.age >= 31 ? 0.85 : 1.1)).toFixed(2); }
export function resign(F, id, yrs) { const p = F.players[id]; if (!p) return; p.sal = askingPrice(p); p.yrs = yrs; save(F); }
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
    p.pid = 'd' + i; p.grade = p.ovr + (devMul(p.dev) - 1) * 12;
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
  F.log.unshift(`${F.year}: drafted ${p.first} ${p.last} (${p.group}, ${p.ovr} OVR, ${devName(p.dev)}) in round ${D.round}`);
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
    if (p.age <= 24) d = Math.round(rnd(0, 3) * devMul(p.dev));
    else if (p.age <= 28) d = Math.round(rnd(-0.5, 2) * devMul(p.dev));
    else if (p.age <= 31) d = Math.round(rnd(-2, 0.5));
    else d = Math.round(rnd(-5, -1));
    if (d > 0) { for (let i = 0; i < d; i++) levelUp(p); } else if (d < 0) levelDown(p, -d);
    if (Math.abs(d) >= 3) notes.push(`${p.first} ${p.last} ${d > 0 ? '+' : ''}${d} OVR`);
    if (p.age >= 34 && Math.random() < (p.age - 32) * 0.25) { notes.push(`${p.first} ${p.last} retired`); F.log.unshift(`${F.year}: ${p.first} ${p.last} retired at ${p.age}`); release(F, p.id); }
  }
  fillHoles(F);
  F.season = Season.newSeason(F.team);
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
export function franchiseSub() { const F = load(); if (!F) return 'Run a team for years: draft, contracts, progression'; const s = F.season.standings[F.team]; return `${TEAMS[F.team].city}, ${F.year}, ${F.phase === 'season' ? `${s.w}-${s.l}` : 'offseason'}`; }
// franchises started before 11-on-11 get the team's real tight end, slot, tackles and extra defenders
function migrate(F) {
  const r = getRoster(F.team); let n = 0;
  for (const role of r.order) if (!F.players[F.starters[role]]) { const p = fromRoster(F, role, r.players[role]); F.players[p.id] = p; F.starters[role] = p.id; n++; }
  if (n) { F.log.unshift(`${F.year}: the league went 11-on-11, ${n} players joined your team`); save(F); }
}
export function renderFranchise() {
  const F = load(), { $ } = C;
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
  $('#fr-top').innerHTML = `<img alt="" src="${C.logoURL(F.team, 96)}"><div><h3>${t.city} <small>${F.year} season</small></h3><p class="note">${r.ovr} OVR (offense ${r.off}, defense ${r.def}). ${F.trophies} Kings Bowl title${F.trophies === 1 ? '' : 's'}. Payroll $${pay.toFixed(1)}M of $${CAP}M.</p></div>
    <div class="fr-cap"><div class="bar"><i style="width:${Math.min(100, pay / CAP * 100)}%;${pay > CAP ? 'background:var(--siren)' : ''}"></i></div><small>Cap space $${(CAP - pay).toFixed(1)}M</small></div>`;
  ({ hub: hubTab, roster: rosterTab, league: leagueTab, legacy: legacyTab })[tab](F);
}
function hubTab(F) {
  const pane = C.$('#fr-pane');
  if (F.phase === 'resign') return resignView(F, pane);
  if (F.phase === 'draft') return draftView(F, pane);
  if (F.phase === 'fa') return faView(F, pane);
  const S = F.season, g = Season.userGame(S);
  const st = S.standings[F.team];
  const opp = g ? (g.home === F.team ? g.away : g.home) : -1;
  pane.innerHTML = `<div class="fr-next">${g ? `<div><small>${S.phase === 'regular' ? `Week ${S.week + 1} of ${Season.WEEKS}` : S.phase === 'semis' ? 'Playoff semifinal' : 'Kings Bowl'}</small><h3>${g.home === F.team ? 'vs' : 'at'} ${TEAMS[opp].city}</h3><p class="note">You're ${st.w}-${st.l}${st.t ? '-' + st.t : ''}. Opponent ${C.teamOvr(opp)} OVR.</p></div>
      <div class="cr-btns"><button class="btn primary big" id="fr-play">Play game</button><button class="btn" id="fr-sim">Simulate</button></div>` : `<p class="note">${S.eliminated ? 'Your season is over.' : 'Season complete.'}</p>`}</div>
    <h3 class="store-h">Recent moves</h3><ul class="fr-log">${F.log.slice(0, 8).map(l => `<li>${esc(l)}</li>`).join('') || '<li>Nothing yet. Go win some games.</li>'}</ul>`;
  const pb = C.$('#fr-play'); if (pb) pb.onclick = () => { const ros = simRoster(F); if (!ros) return C.toast('Your lineup has holes'); C.startCPU({ teams: [F.team, opp], rosters: [ros, null], franchise: true }); };
  const sb = C.$('#fr-sim'); if (sb) sb.onclick = () => { const m = simWeek(F); if (m) C.toast(`${m[0] > m[1] ? 'Won' : m[0] < m[1] ? 'Lost' : 'Tied'} ${m[0]}-${m[1]}`); renderFranchise(); };
}
function pRow(p, extra = '') { return `<div class="fr-p"><span class="fr-ovr">${p.ovr}</span><div><b>${esc(p.first)} ${esc(p.last)}</b><small>${p.group}, age ${p.age}, ${devName(p.dev)}, $${p.sal.toFixed(2)}M x ${Math.max(0, p.yrs)} yr${p.yrs === 1 ? '' : 's'}</small></div>${extra}</div>`; }
function rosterTab(F) {
  const pane = C.$('#fr-pane'), order = getRoster(F.team).order;
  pane.innerHTML = `<h3 class="store-h">Starters</h3><div class="fr-list">${order.map(role => { const p = F.players[F.starters[role]]; return p ? `<div class="fr-slot"><small>${POS_LABEL[role] || role}</small>${pRow(p, `<div class="fr-xp" title="XP to next point"><i style="width:${Math.min(100, p.xp / xpNeed(p) * 100)}%"></i></div><button class="btn sm" data-sw="${role}">Swap</button>`)}</div>` : `<div class="fr-slot"><small>${role}</small><p class="note">Empty</p></div>`; }).join('')}</div>
    <h3 class="store-h">Bench (${F.bench.length} of ${BENCH_MAX})</h3><div class="fr-list">${F.bench.map(id => F.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).map(p => pRow(p, `<button class="btn sm danger" data-cut="${p.id}">Release</button>`)).join('') || '<p class="note">No backups.</p>'}</div>`;
  C.$$('[data-sw]', pane).forEach(b => b.onclick = () => {
    const role = b.dataset.sw, g = GROUP(role), opts = F.bench.map(id => F.players[id]).filter(p => p && p.group === g);
    if (!opts.length) return C.toast(`No ${g} on your bench`);
    const best = opts.sort((a, b) => b.ovr - a.ovr);
    const choice = prompt(`Swap in who?\n${best.map((p, i) => `${i + 1}. ${p.first} ${p.last} (${p.ovr})`).join('\n')}`, '1'); if (!choice) return;
    const p = best[(+choice || 1) - 1]; if (!p) return;
    const e = swap(F, role, p.id); if (e) C.toast(e); else { C.toast(`${p.last} is starting`); renderFranchise(); }
  });
  C.$$('[data-cut]', pane).forEach(b => b.onclick = () => { const p = F.players[+b.dataset.cut]; if (!confirm(`Release ${p.first} ${p.last}? His salary comes off your cap.`)) return; release(F, p.id); renderFranchise(); });
}
function leagueTab(F) {
  const pane = C.$('#fr-pane'), rows = Season.table(F.season);
  pane.innerHTML = `<div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr>${rows.map((r, i) => `<tr class="${r.team === F.team ? 'me' : ''}"><td>${i + 1}</td><td>${TEAMS[r.team].city}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td></tr>`).join('')}</table></div>`;
}
function legacyTab(F) {
  const pane = C.$('#fr-pane'), all = Object.values(F.players).sort((a, b) => (b.cs.td || 0) + (b.cs.py || 0) / 50 - (a.cs.td || 0) - (a.cs.py || 0) / 50).slice(0, 8);
  pane.innerHTML = `<h3 class="store-h">Seasons</h3><div class="fr-list">${F.history.map(h => `<div class="fr-p"><span class="fr-ovr">${h.champ ? '🏆' : h.playoffs ? 'P' : '-'}</span><div><b>${h.year}: ${h.w}-${h.l}${h.t ? '-' + h.t : ''}</b><small>${h.champ ? 'Kings Bowl champions' : h.playoffs ? 'Made the playoffs' : 'Missed the playoffs'}</small></div></div>`).join('') || '<p class="note">Your first season is still going.</p>'}</div>
    <h3 class="store-h">Franchise leaders</h3><div class="fr-list">${all.map(p => pRow(p, `<small class="fr-cs">${fmt(p.cs.py || 0)} pass yds, ${fmt(p.cs.ry || 0)} rush, ${fmt(p.cs.recy || 0)} rec, ${fmt(p.cs.td || 0)} TD, ${fmt(p.cs.tk || 0)} tkl, ${fmt(p.cs.sk || 0)} sacks</small>`)).join('')}</div>
    <div class="actions"><button class="btn danger" id="fr-quit">Retire from this franchise</button></div>`;
  C.$('#fr-quit').onclick = () => { if (!confirm('End this franchise for good? Everything in it is deleted.')) return; try { localStorage.removeItem(KEY()); } catch (_) {} renderFranchise(); };
}
function resignView(F, pane) {
  const exp = Object.values(F.players).filter(p => p.yrs <= 0).sort((a, b) => b.ovr - a.ovr);
  pane.innerHTML = `<div class="fr-next"><div><small>Offseason, step 1 of 3</small><h3>Re-sign players</h3><p class="note">These contracts are up. Re-sign who you want, everyone else walks. Cap space left: $${(CAP - payroll(F)).toFixed(1)}M.</p></div><button class="btn primary" id="fr-go">Go to the draft</button></div>
    <div class="fr-list">${exp.map(p => pRow(p, `<span class="note">Asks $${askingPrice(p).toFixed(2)}M</span><button class="btn sm primary" data-rs="${p.id}" data-y="3">3 yrs</button><button class="btn sm" data-rs="${p.id}" data-y="1">1 yr</button>`)).join('') || '<p class="note">No expiring contracts.</p>'}</div>`;
  C.$$('[data-rs]', pane).forEach(b => b.onclick = () => { const p = F.players[+b.dataset.rs]; if (payroll(F) - p.sal + askingPrice(p) > CAP) return C.toast('That would put you over the cap'); resign(F, p.id, +b.dataset.y); C.toast(`${p.last} re-signed`); renderFranchise(); });
  C.$('#fr-go').onclick = () => { toDraft(F); renderFranchise(); };
}
function draftView(F, pane) {
  const D = F.draft;
  pane.innerHTML = `<div class="fr-next"><div><small>Offseason, step 2 of 3</small><h3>Draft, round ${D.round}</h3><p class="note">You're on the clock. Rookies sign cheap 4-year deals. Development trait decides how fast they grow.</p></div><button class="btn" id="fr-skip">Skip this pick</button></div>
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
