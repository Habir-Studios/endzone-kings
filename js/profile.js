// ENDZONE KINGS — progression: coins, XP and levels, ranked divisions, daily/weekly challenges, Ultimate Team club.
// Coins are only ever earned by playing. Nothing here can be bought with real money.
import { starterIds, autoLineup, CLUB_CAP, PACKS } from './ut.js?v=1792205915';

export const DIVS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
// 0-1499 RP: Bronze III … Diamond I in steps of 100. 1500+ is Kings.
export function rankInfo(rp) {
  if (rp >= 1500) return { name: 'Kings', div: 'Kings', idx: 5, sub: 0, into: rp - 1500, span: 0, floor: 1500 };
  const step = Math.floor(rp / 100), idx = Math.floor(step / 3), sub = 3 - (step % 3);
  return { name: `${DIVS[idx]} ${'I'.repeat(sub)}`, div: DIVS[idx], idx, sub, into: rp % 100, span: 100, floor: idx * 300 };
}
export const xpFor = lvl => 400 + lvl * 120;
export function levelReward(lvl) {
  const r = { coins: 150 + lvl * 25, pack: null };
  if (lvl % 25 === 0) r.pack = 'kings'; else if (lvl % 10 === 0) r.pack = 'elite'; else if (lvl % 5 === 0) r.pack = 'gold'; else if (lvl % 2 === 0) r.pack = 'bronze';
  return r;
}
export const RANK_REWARD = { Silver: { coins: 1500, pack: 'silver' }, Gold: { coins: 3000, pack: 'gold' }, Platinum: { coins: 6000, pack: 'gold' }, Diamond: { coins: 10000, pack: 'elite' }, Kings: { coins: 20000, pack: 'kings' } };

// ---------------- challenges ----------------
// stat: per-game value (best in a single game) unless cum (adds up across games)
const DAILY = [
  { k: 'win1', d: 'Win a game', t: 1, f: r => r.res === 'W' ? 1 : 0, cum: 1, c: 400, x: 300 },
  { k: 'play2', d: 'Play 2 games', t: 2, f: () => 1, cum: 1, c: 300, x: 250 },
  { k: 'td3', d: 'Score 3 touchdowns in one game', t: 3, f: r => r.me.tds, c: 350, x: 300 },
  { k: 'pass200', d: 'Throw for 200 yards in one game', t: 200, f: r => r.me.passYds, c: 350, x: 300 },
  { k: 'rush100', d: 'Run for 100 yards in one game', t: 100, f: r => r.me.rushYds, c: 350, x: 300 },
  { k: 'sack2', d: 'Get 2 sacks in one game', t: 2, f: r => r.me.sacks, c: 350, x: 300 },
  { k: 'int1', d: 'Intercept a pass', t: 1, f: r => r.opp.ints, cum: 1, c: 400, x: 300 },
  { k: 'fd8', d: 'Get 8 first downs in one game', t: 8, f: r => r.me.firstDowns, c: 300, x: 250 },
  { k: 'hold10', d: 'Win and allow 10 points or fewer', t: 1, f: r => r.res === 'W' && r.sc[1] <= 10 ? 1 : 0, cum: 1, c: 450, x: 350 },
  { k: 'ut1', d: 'Play an Ultimate Team game', t: 1, f: r => r.ut ? 1 : 0, cum: 1, c: 350, x: 250 },
  { k: 'pack1', d: 'Open a pack', t: 1, f: () => 0, cum: 1, ev: 'pack', c: 250, x: 200 },
];
const WEEKLY = [
  { k: 'w_win5', d: 'Win 5 games', t: 5, f: r => r.res === 'W' ? 1 : 0, cum: 1, c: 2500, x: 1500, pack: 'gold' },
  { k: 'w_td15', d: 'Score 15 touchdowns', t: 15, f: r => r.me.tds, cum: 1, c: 2000, x: 1200 },
  { k: 'w_pass1k', d: 'Throw for 1,000 yards', t: 1000, f: r => r.me.passYds, cum: 1, c: 2000, x: 1200 },
  { k: 'w_rush500', d: 'Run for 500 yards', t: 500, f: r => r.me.rushYds, cum: 1, c: 2000, x: 1200 },
  { k: 'w_online3', d: 'Play 3 online games', t: 3, f: r => r.mode === 'online' ? 1 : 0, cum: 1, c: 3000, x: 1500, pack: 'gold' },
  { k: 'w_ut3', d: 'Win 3 Ultimate Team games', t: 3, f: r => r.ut && r.res === 'W' ? 1 : 0, cum: 1, c: 2500, x: 1500, pack: 'silver' },
  { k: 'w_allpro', d: 'Beat the CPU on All-Pro or Legend', t: 1, f: r => r.mode !== 'online' && r.diff >= 2 && r.res === 'W' ? 1 : 0, cum: 1, c: 3000, x: 1800, pack: 'gold' },
  { k: 'w_sack8', d: 'Get 8 sacks', t: 8, f: r => r.me.sacks, cum: 1, c: 1800, x: 1000 },
];
const ALL_CH = Object.fromEntries([...DAILY, ...WEEKLY].map(c => [c.k, c]));
export const challengeDef = k => ALL_CH[k];

function dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function weekKey(d = new Date()) { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return dayKey(t); }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pickN(pool, n, seed) { const a = pool.slice(); let s = seed; const out = []; while (out.length < n && a.length) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; out.push(a.splice(s % a.length, 1)[0]); } return out; }
export function nextReset(kind) { const d = new Date(); if (kind === 'daily') { d.setHours(24, 0, 0, 0); } else { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (8 - (d.getDay() || 7))); } return d; }

// ---------------- profile store ----------------
const blank = () => ({
  v: 1, rev: 0, coins: 1500, xp: 0, lvl: 1, rp: 0, rpBest: 0, games: 0, wins: 0, tds: 0, streak: 0, bestStreak: 0,
  packs: { silver: 1 }, daily: null, weekly: null, divsReached: ['Bronze'], log: [],
  ut: { cards: [], next: 1, lineup: {}, club: 3, name: '', started: false, opened: 0 },
});

export class Profile {
  constructor(userId) {
    this.key = 'ek_prof_' + userId;
    this.p = blank();
    try { const raw = localStorage.getItem(this.key); if (raw) this.p = { ...blank(), ...JSON.parse(raw) }; } catch (_) {}
    this.p.ut = { ...blank().ut, ...this.p.ut };
    this.refreshChallenges();
    this.listeners = [];
  }
  onSave(fn) { this.listeners.push(fn); }
  save() { this.p.rev++; try { localStorage.setItem(this.key, JSON.stringify(this.p)); } catch (_) {} this.listeners.forEach(f => f(this.p)); }
  // merge a copy loaded from the cloud (keeps whichever has seen more saves)
  adopt(remote) { if (remote && remote.rev > this.p.rev) { this.p = { ...blank(), ...remote, ut: { ...blank().ut, ...remote.ut } }; this.refreshChallenges(); try { localStorage.setItem(this.key, JSON.stringify(this.p)); } catch (_) {} return true; } return false; }

  get rank() { return rankInfo(this.p.rp); }
  refreshChallenges() {
    const P = this.p, dk = dayKey(), wk = weekKey();
    if (!P.daily || P.daily.d !== dk) P.daily = { d: dk, list: pickN(DAILY, 3, hashStr(dk + this.key)).map(c => ({ k: c.k, p: 0, done: false, claimed: false })) };
    if (!P.weekly || P.weekly.d !== wk) P.weekly = { d: wk, list: pickN(WEEKLY, 3, hashStr(wk + this.key)).map(c => ({ k: c.k, p: 0, done: false, claimed: false })) };
  }
  // count an out-of-game event (like opening a pack) toward challenges
  bump(ev) {
    this.refreshChallenges();
    for (const ch of [...this.p.daily.list, ...this.p.weekly.list]) { const d = ALL_CH[ch.k]; if (d && d.ev === ev && !ch.done) { ch.p = Math.min(d.t, ch.p + 1); ch.done = ch.p >= d.t; } }
  }
  claim(k) {
    const ch = [...this.p.daily.list, ...this.p.weekly.list].find(c => c.k === k); const d = ALL_CH[k];
    if (!ch || !ch.done || ch.claimed) return null;
    ch.claimed = true;
    const out = { coins: d.c, xp: d.x, pack: d.pack || null, levels: [] };
    this.p.coins += d.c; if (d.pack) this.addPack(d.pack);
    out.levels = this.addXp(d.x);
    this.save();
    return out;
  }
  addPack(k, n = 1) { this.p.packs[k] = (this.p.packs[k] || 0) + n; }
  addXp(x) {
    const P = this.p, ups = [];
    P.xp += x;
    while (P.xp >= xpFor(P.lvl)) { P.xp -= xpFor(P.lvl); P.lvl++; const r = levelReward(P.lvl); P.coins += r.coins; if (r.pack) this.addPack(r.pack); ups.push({ lvl: P.lvl, ...r }); }
    return ups;
  }

  // Called once per finished game. r = { mode: 'cpu'|'online'|'season', ut, res: 'W'|'L'|'T', diff, qlen, sc: [mine, theirs], me: teamStats, opp: teamStats }
  award(r) {
    const P = this.p; this.refreshChallenges();
    const lines = [];
    const len = Math.max(0.5, Math.min(1.5, (r.qlen || 120) / 120));
    const diffMul = r.mode === 'online' ? 1.5 : [0.7, 1, 1.35, 1.75][r.diff ?? 1] || 1;
    const add = (label, c, x) => { if (c || x) lines.push({ label, c: Math.round(c * len * diffMul * (r.ut ? 1.2 : 1)), x: Math.round(x * len) }); };
    add('Game played', 120, 160);
    if (r.res === 'W') add('Win', 180, 160); else if (r.res === 'T') add('Tie', 60, 60);
    if (r.me.tds) add(`${r.me.tds} touchdown${r.me.tds > 1 ? 's' : ''}`, r.me.tds * 25, r.me.tds * 30);
    if (r.me.sacks) add(`${r.me.sacks} sack${r.me.sacks > 1 ? 's' : ''}`, r.me.sacks * 15, r.me.sacks * 15);
    if (r.opp.ints) add(`${r.opp.ints} interception${r.opp.ints > 1 ? 's' : ''}`, r.opp.ints * 30, r.opp.ints * 30);
    if (r.res === 'W' && r.me.ints === 0) add('No turnovers', 60, 50);
    if (r.res === 'W' && r.sc[1] === 0) add('Shutout', 120, 100);
    if (r.res === 'W' && r.sc[0] - r.sc[1] >= 21) add('Blowout', 80, 60);
    if (r.res === 'W' && P.streak >= 1) add(`Win streak (${P.streak + 1})`, Math.min(5, P.streak) * 30, Math.min(5, P.streak) * 20);
    let coins = lines.reduce((s, l) => s + l.c, 0), xp = lines.reduce((s, l) => s + l.x, 0);
    P.coins += coins; P.games++; P.tds += r.me.tds || 0;
    if (r.res === 'W') { P.wins++; P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak); } else if (r.res === 'L') P.streak = 0;
    // ranked points
    const before = rankInfo(P.rp), rp0 = P.rp;
    let drp = 0;
    if (r.mode === 'online') drp = r.res === 'W' ? 40 : r.res === 'L' ? -20 : 5;
    else drp = r.res === 'W' ? 6 + 4 * (r.diff ?? 1) : r.res === 'L' ? -4 : 1;
    P.rp = Math.max(before.floor, P.rp + drp); P.rpBest = Math.max(P.rpBest, P.rp);
    const after = rankInfo(P.rp);
    const promos = [];
    if (after.div !== before.div && !P.divsReached.includes(after.div)) {
      P.divsReached.push(after.div); const rr = RANK_REWARD[after.div];
      if (rr) { P.coins += rr.coins; this.addPack(rr.pack); promos.push({ div: after.div, ...rr }); }
    }
    // challenges
    const done = [];
    for (const ch of [...P.daily.list, ...P.weekly.list]) {
      const d = ALL_CH[ch.k]; if (!d || ch.done || d.ev) continue;
      const v = d.f(r) || 0;
      ch.p = Math.min(d.t, d.cum ? ch.p + v : Math.max(ch.p, v));
      if (ch.p >= d.t) { ch.done = true; done.push(d); }
    }
    const levels = this.addXp(xp);
    P.log.unshift({ at: Date.now(), res: r.res, sc: r.sc, mode: r.mode, ut: !!r.ut, coins, xp }); P.log.length = Math.min(P.log.length, 20);
    this.save();
    return { lines, coins, xp, levels, drp: P.rp - rp0, rank: after, rankBefore: before, promos, done };
  }

  // ---------------- Ultimate Team ----------------
  get ut() { return this.p.ut; }
  startUT(club) {
    const U = this.p.ut; if (U.started) return;
    U.started = true; U.club = club;
    this.addCards(starterIds(hashStr(this.key + 'starter')));
    U.lineup = autoLineup(U.cards);
    this.save();
  }
  addCards(ids) {
    const U = this.p.ut; const added = [];
    for (const id of ids) { const inst = { u: U.next++, id, b: 0 }; U.cards.push(inst); added.push(inst); }
    return added;
  }
  clubFull() { return this.p.ut.cards.length >= CLUB_CAP; }
  buyPack(k) {
    const P = PACKS.find(x => x.key === k); if (!P) return 'No such pack';
    if (this.p.coins < P.cost) return `You need ${(P.cost - this.p.coins).toLocaleString()} more coins`;
    if (this.p.ut.cards.length + P.n > CLUB_CAP) return `Your club is full (${CLUB_CAP} players). Quicksell some players first`;
    this.p.coins -= P.cost; this.addPack(k);
    this.save();
    return null;
  }
  // opens one pack you own; returns the new card instances or an error string
  openPack(k, ids) {
    if (!(this.p.packs[k] > 0)) return 'You have no pack like that';
    if (this.p.ut.cards.length + ids.length > CLUB_CAP) return `Your club is full (${CLUB_CAP} players). Quicksell some players first`;
    this.p.packs[k]--; this.p.ut.opened++;
    const added = this.addCards(ids);
    this.bump('pack');
    this.save();
    return added;
  }
  inLineup(u) { return Object.values(this.p.ut.lineup).includes(u); }
  sell(u, value) {
    const U = this.p.ut; if (this.inLineup(u)) return false;
    const i = U.cards.findIndex(c => c.u === u); if (i < 0) return false;
    U.cards.splice(i, 1); this.p.coins += value; this.save(); return true;
  }
  train(u, cost) {
    const inst = this.p.ut.cards.find(c => c.u === u); if (!inst || !cost) return 'This player is maxed out';
    if (this.p.coins < cost) return `You need ${(cost - this.p.coins).toLocaleString()} more coins`;
    this.p.coins -= cost; inst.b = (inst.b || 0) + 1; this.save(); return null;
  }
  setSlot(slot, u) { const L = this.p.ut.lineup; for (const s of Object.keys(L)) if (L[s] === u) delete L[s]; L[slot] = u; this.save(); }
}
