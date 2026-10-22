// ENDZONE KINGS — progression: coins, XP and levels, ranked divisions, daily/weekly challenges, Ultimate Team club.
// Coins are only ever earned by playing. Nothing here can be bought with real money.
import { starterIds, autoLineup, missingForLineup, SLOTS, SLOT_GROUP, CLUB_CAP, PACKS, squadOvr, card, owned, marketValue, marketSlot, marketListings, listingSells, MARKET_TAX, MAX_LISTINGS, SETS, SOLOS, masterId, SB_GAMES, sbTier, sbPoints, theme, PROG_STEPS, progKey, programPlayer, FP_TIERS, FP_XP, fpReward, fpSeason, TP_ABILITY, TP_XFACTOR } from './ut.js?v=1792641359';

export const DIVS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
// Each division has 3 steps (III, II, I), and every division's steps cost more RP than the one before:
// Bronze 130 a step, Silver 155, Gold 185, Platinum 215, Diamond 250. Kings starts at 2,805 RP.
export const RANK_STEP = [130, 155, 185, 215, 250];
const DIV_FLOOR = RANK_STEP.reduce((a, s, i) => (a.push(a[i] + s * 3), a), [0]);   // [0, 390, 855, 1410, 2055, 2805]
export const KINGS_RP = DIV_FLOOR[5];
export function rankInfo(rp) {
  rp = Math.max(0, rp || 0);
  if (rp >= KINGS_RP) return { name: 'Kings', div: 'Kings', idx: 5, sub: 0, into: rp - KINGS_RP, span: 0, floor: KINGS_RP };
  let idx = 0; while (rp >= DIV_FLOOR[idx + 1]) idx++;
  const span = RANK_STEP[idx], inDiv = rp - DIV_FLOOR[idx], step = Math.floor(inDiv / span), sub = 3 - step;
  return { name: `${DIVS[idx]} ${'I'.repeat(sub)}`, div: DIVS[idx], idx, sub, into: inDiv % span, span, floor: DIV_FLOOR[idx] };
}
// ---------- ranked seasons: one per calendar month. Your best rank pays out when it ends, then RP soft-resets ----------
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const RANK_REWARDS = [
  { div: 'Bronze', coins: 300 }, { div: 'Silver', coins: 700, pack: 'bronze' }, { div: 'Gold', coins: 1400, pack: 'silver' },
  { div: 'Platinum', coins: 2400, pack: 'gold' }, { div: 'Diamond', coins: 4000, pack: 'elite' }, { div: 'Kings', coins: 7000, pack: 'kings' },
];
export function seasonDaysLeft(d = new Date()) { const end = new Date(d.getFullYear(), d.getMonth() + 1, 1); return Math.max(1, Math.ceil((end - d) / 86400000)); }
// ---------- Weekend League: Friday through Sunday, your first 10 online games count. Pays out after the weekend ----------
export const WL_MAX = 10;
export const isWeekend = (d = new Date()) => [5, 6, 0].includes(d.getDay());
export const WL_REWARDS = [
  { w: 0, coins: 200 }, { w: 3, coins: 600, pack: 'bronze' }, { w: 5, coins: 1200, pack: 'silver' },
  { w: 7, coins: 2400, pack: 'gold' }, { w: 9, coins: 4000, pack: 'elite' }, { w: 10, coins: 6500, pack: 'kings' },
];
export const wlReward = w => WL_REWARDS.filter(r => w >= r.w).pop();
// ---------- daily login: come back every day for a growing reward (a 7-day cycle; miss a day and it restarts) ----------
export const LOGIN_REWARDS = [{ coins: 100 }, { coins: 150 }, { coins: 250 }, { coins: 250 }, { coins: 350 }, { coins: 350, pack: 'bronze' }, { coins: 600, pack: 'silver' }];
export const xpFor = lvl => 650 + lvl * 200;   // levels take a while
export function levelReward(lvl) {
  const r = { coins: 80 + lvl * 15, pack: null };
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
  { k: 'ut_win1', d: 'Win an Ultimate Team game', t: 1, f: r => r.ut && r.res === 'W' ? 1 : 0, cum: 1, c: 500, x: 350 },
  { k: 'ut_td4', d: 'Score 4 TDs in one Ultimate Team game', t: 4, f: r => r.ut ? r.me.tds : 0, c: 450, x: 350 },
  { k: 'ut_online', d: 'Play online with your UT squad', t: 1, f: r => r.ut && r.mode === 'online' ? 1 : 0, cum: 1, c: 550, x: 400 },
  { k: 'qs3', d: 'Quicksell 3 players', t: 3, f: () => 0, cum: 1, ev: 'qs', c: 250, x: 200 },
  { k: 'train1', d: 'Train a player', t: 1, f: () => 0, cum: 1, ev: 'train', c: 300, x: 250 },
  { k: 'mkt1', d: 'Buy a player on the market', t: 1, f: () => 0, cum: 1, ev: 'buy', c: 300, x: 250 },
  { k: 'set1', d: 'Complete a set', t: 1, f: () => 0, cum: 1, ev: 'set', c: 350, x: 300 },
  { k: 'comp15', d: 'Complete 15 passes in one game', t: 15, f: r => r.me.comp, c: 350, x: 300 },
  { k: 'tkl8', d: 'Make 8 tackles in one game', t: 8, f: r => r.me.tkl || 0, c: 350, x: 300 },
  { k: 'fg2', d: 'Make 2 field goals in one game', t: 2, f: r => r.me.fgm || 0, c: 350, x: 300 },
  { k: 'clean', d: 'Win without throwing a pick', t: 1, f: r => r.res === 'W' && !(r.me.ints) ? 1 : 0, cum: 1, c: 400, x: 300 },
  { k: 'blowout', d: 'Win by 21 or more', t: 1, f: r => r.res === 'W' && r.sc[0] - r.sc[1] >= 21 ? 1 : 0, cum: 1, c: 500, x: 400 },
  { k: 'play3', d: 'Play 3 games', t: 3, f: () => 1, cum: 1, c: 450, x: 400 },
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
  { k: 'w_ut10', d: 'Play 10 Ultimate Team games', t: 10, f: r => r.ut ? 1 : 0, cum: 1, c: 3500, x: 2200, pack: 'gold' },
  { k: 'w_utonline', d: 'Win 3 online games with your UT squad', t: 3, f: r => r.ut && r.mode === 'online' && r.res === 'W' ? 1 : 0, cum: 1, c: 4000, x: 2500, pack: 'gold' },
  { k: 'w_set3', d: 'Complete 3 sets', t: 3, f: () => 0, cum: 1, ev: 'set', c: 2200, x: 1300 },
  { k: 'w_train5', d: 'Train players 5 times', t: 5, f: () => 0, cum: 1, ev: 'train', c: 1800, x: 1200 },
  { k: 'w_qs15', d: 'Quicksell 15 players', t: 15, f: () => 0, cum: 1, ev: 'qs', c: 1600, x: 1000 },
  { k: 'w_pack5', d: 'Open 5 packs', t: 5, f: () => 0, cum: 1, ev: 'pack', c: 1500, x: 1000 },
  { k: 'w_int5', d: 'Intercept 5 passes', t: 5, f: r => r.opp.ints, cum: 1, c: 2000, x: 1300 },
  { k: 'w_tkl40', d: 'Make 40 tackles', t: 40, f: r => r.me.tkl || 0, cum: 1, c: 1800, x: 1200 },
  { k: 'w_win10', d: 'Win 10 games', t: 10, f: r => r.res === 'W' ? 1 : 0, cum: 1, c: 5000, x: 3000, pack: 'elite' },
  { k: 'w_play15', d: 'Play 15 games', t: 15, f: () => 1, cum: 1, c: 3000, x: 2500, pack: 'silver' },
];
const ALL_CH = Object.fromEntries([...DAILY, ...WEEKLY].map(c => [c.k, c]));
export const challengeDef = k => ALL_CH[k];

export function dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export function weekKey(d = new Date()) { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return dayKey(t); }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pickN(pool, n, seed) { const a = pool.slice(); let s = seed; const out = []; while (out.length < n && a.length) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; out.push(a.splice(s % a.length, 1)[0]); } return out; }
export function nextReset(kind) { const d = new Date(); if (kind === 'daily') { d.setHours(24, 0, 0, 0); } else { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (8 - (d.getDay() || 7))); } return d; }

// ---------------- achievements ----------------
// f: checked against a finished game; g: checked against the whole profile; ev: unlocked by an event
export const ACH = [
  { k: 'first_win', n: 'First win', d: 'Win any game', c: 250, f: r => r.res === 'W' },
  { k: 'td5', n: 'Five-star game', d: 'Score 5 touchdowns in one game', c: 800, f: r => r.me.tds >= 5 },
  { k: 'pass300', n: 'Air it out', d: 'Throw for 300 yards in one game', c: 600, f: r => r.me.passYds >= 300 },
  { k: 'rush150', n: 'Workhorse', d: 'Run for 150 yards in one game', c: 600, f: r => r.me.rushYds >= 150 },
  { k: 'shutout', n: 'Brick wall', d: 'Win without allowing a point', c: 700, f: r => r.res === 'W' && r.sc[1] === 0 },
  { k: 'pick3', n: 'Ball hawk', d: 'Intercept 3 passes in one game', c: 700, f: r => r.opp.ints >= 3 },
  { k: 'sack5', n: 'Sack party', d: 'Get 5 sacks in one game', c: 600, f: r => r.me.sacks >= 5 },
  { k: 'legend', n: 'Legendary', d: 'Beat the CPU on Legend', c: 1500, f: r => r.mode !== 'online' && r.diff >= 3 && r.res === 'W' },
  { k: 'online_win', n: 'Online winner', d: 'Win an online game', c: 800, f: r => r.mode === 'online' && r.res === 'W' },
  { k: 'clean', n: 'Disciplined', d: 'Win a full game with no penalties', c: 500, f: r => r.res === 'W' && (r.me.pens || 0) === 0 && r.qlen >= 120 },
  { k: 'streak5', n: 'On a heater', d: 'Win 5 games in a row', c: 1000, g: P => P.p.streak >= 5 },
  { k: 'games50', n: 'Grinder', d: 'Play 50 games', c: 1500, g: P => P.p.games >= 50 },
  { k: 'lvl10', n: 'Double digits', d: 'Reach level 10', c: 1000, g: P => P.p.lvl >= 10 },
  { k: 'lvl25', n: 'Veteran', d: 'Reach level 25', c: 3000, g: P => P.p.lvl >= 25 },
  { k: 'gold', n: 'Golden', d: 'Reach Gold rank', c: 1000, g: P => P.p.rp >= 600 },
  { k: 'diamond', n: 'Shine bright', d: 'Reach Diamond rank', c: 3000, g: P => P.p.rp >= 1200 },
  { k: 'kings', n: 'Endzone King', d: 'Reach Kings rank', c: 8000, g: P => P.p.rp >= 1500 },
  { k: 'packs10', n: 'Pack rat', d: 'Open 10 packs', c: 800, g: P => P.p.ut.opened >= 10 },
  { k: 'elite', n: 'Elite company', d: 'Own an Elite card', c: 1000, g: P => P.p.ut.cards.some(c => card(c.id).tier >= 3) },
  { k: 'kingscard', n: 'Royalty', d: 'Own a Kings card', c: 3000, g: P => P.p.ut.cards.some(c => card(c.id).tier >= 4) },
  { k: 'squad80', n: 'Contender', d: 'Build an 80 OVR Ultimate Team squad', c: 2000, g: P => P.p.ut.started && squadOvr(P.p.ut).ovr >= 80 },
  { k: 'drill21', n: 'Clutch', d: 'Score 21 points in the two-minute drill', c: 1200, g: P => (P.p.drill.best || 0) >= 21 },
  { k: 'creator', n: 'Mad scientist', d: 'Save a play in the Play Creator', c: 400, ev: 'creator' },
  { k: 'champ', n: 'Kings Bowl champion', d: 'Win the Kings Bowl in Season', c: 3000, ev: 'champ' },
];

// ---------------- profile store ----------------
const blank = () => ({
  v: 1, rev: 0, coins: 1500, tp: 50, xp: 0, lvl: 1, rp: 0, rpBest: 0, games: 0, wins: 0, tds: 0, streak: 0, bestStreak: 0,
  packs: { silver: 1 }, daily: null, weekly: null, divsReached: ['Bronze'], log: [],
  ut: { cards: [], next: 1, lineup: {}, club: 3, name: '', started: false, opened: 0, mk: { slot: 0, bought: [], list: [], sold: 0 }, sets: { w: '', done: [] }, solos: { w: '', done: [] } },
  fp: { s: '', xp: 0, got: [] },
  ach: {}, drill: { best: 0, runs: [] },
});

// tamper seal over the parts of a save that matter (coins, packs, cards). Editing the save by hand breaks it.
// packs are sealed with their keys sorted: the cloud database reorders object keys, which used to make a
// perfectly good save look edited on the other device
const sortedPacks = o => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
function sealOk(p, key) { return !!p && !!p.sig && (p.sig === seal(p, key) || p.sig === seal(p, key, true)); }
function seal(p, key, legacy) {
  const body = [p.coins, p.xp, p.lvl, p.rp, legacy ? JSON.stringify(p.packs || {}) : sortedPacks(p.packs), (p.ut && p.ut.cards || []).map(c => c.id + ':' + (c.b || 0) + (c.x ? 'x' + c.x : '') + (c.ab ? 'a' + c.ab : '') + (c.xf ? 'f' : '')).join(','), key, 'ek-v2-habir'].join('|') + (p.tpv ? '|tp' + (p.tp || 0) : '');   // saves from before Training Points seal the old way
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < body.length; i++) { const c = body.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) ^ (h2 >>> 13); }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36));
}
// Season 1 full reset (Oct 20, 2026): every save from before this is wiped and never comes back (local or cloud)
export const WIPE_ID = 's1-20261020c';
export class Profile {
  constructor(userId) {
    this.key = 'ek_prof_' + userId;
    this.p = blank();
    try { const raw = localStorage.getItem(this.key); if (raw) this.p = { ...blank(), ...JSON.parse(raw) }; } catch (_) {}
    if (this.p.wipe !== WIPE_ID) {
      this.p = blank(); this.p.wipe = WIPE_ID;
      const uid = String(userId);
      try { for (const k of ['ek_franchise_' + uid, 'ek_season_' + uid, 'ek_quit_' + uid, 'ek_drill_board']) localStorage.removeItem(k); } catch (_) {}
      try { localStorage.setItem(this.key, JSON.stringify(this.p)); } catch (_) {}
    }
    this.p.ut = { ...blank().ut, ...this.p.ut }; this.p.ach = this.p.ach || {}; this.p.drill = this.p.drill || { best: 0, runs: [] }; this.p.fp = this.p.fp || blank().fp;
    this.verify();
    this.refreshChallenges();
    this.listeners = [];
    this.upgradeClub();
  }
  onSave(fn) { this.listeners.push(fn); }
  cloudOk(remote) { return sealOk(remote, this.key); }
  // a save that was edited by hand loses its coins and packs and gets flagged for anti-cheat
  verify() {
    const P = this.p;
    if (P.sig && !sealOk(P, this.key)) {
      this.tampered = true; P.tampered = (P.tampered || 0) + 1;
      P.coins = Math.min(P.coins, 1500); P.packs = {}; P.tp = Math.min(P.tp || 0, 50);
      P.sig = seal(P, this.key);
      try { localStorage.setItem(this.key, JSON.stringify(P)); } catch (_) {}
    } else if (P.tampered) this.tampered = true;
  }
  save() { this.p.tpv = 1; this.p.at = Date.now(); this.p.sig = seal(this.p, this.key); this.p.rev++; try { localStorage.setItem(this.key, JSON.stringify(this.p)); } catch (_) {} this.listeners.forEach(f => f(this.p)); }
  // merge a copy loaded from the cloud (keeps whichever has seen more saves)
  // take the cloud copy when it's further along (more level/XP), or as far along but saved more recently
  // Never takes a cloud copy that fails its seal (that's what used to reset coins to 1500).
  // A local save that got wrongly flagged gives way to a clean cloud copy that's about as far along.
  adopt(remote) {
    if (!remote || remote.wipe !== WIPE_ID || !sealOk(remote, this.key)) return false;   // saves from before the Season 1 reset are ignored
    const pg = q => (q.lvl || 1) * 1e7 + (q.xp || 0) * 10 + Math.min(9, q.games || 0), a = pg(remote), b = pg(this.p);
    if (remote.tampered && !this.p.tampered && a <= b + 2e7) return false;   // a flagged copy from another device never beats a clean one
    // both flagged (the old sync bug flagged good saves) and about as far along: keep the richer one, since the flag knocked coins down
    const W = q => (q.coins || 0) + (q.tp || 0) * 10 + ((q.ut && q.ut.cards) || []).length * 60 + Object.values(q.packs || {}).reduce((s, n) => s + n * 400, 0);
    if (remote.tampered && this.p.tampered && Math.abs(a - b) <= 2e7) { if (W(remote) > W(this.p)) { /* take it */ } else return false; }
    const take = (remote.tampered && this.p.tampered && Math.abs(a - b) <= 2e7) || (this.p.tampered && !remote.tampered && W(remote) > W(this.p)) || a > b || (a === b && (remote.at || 0) > (this.p.at || 0) && remote.rev !== this.p.rev) || (this.p.tampered && !remote.tampered && a >= b - 2e7);
    if (take) { this.p = { ...blank(), ...remote, ut: { ...blank().ut, ...remote.ut }, fp: remote.fp || blank().fp, ach: remote.ach || {}, drill: remote.drill || { best: 0, runs: [] } }; this.verify(); this.refreshChallenges(); if (this.listeners) this.upgradeClub(); try { localStorage.setItem(this.key, JSON.stringify(this.p)); } catch (_) {} this.tampered = !!this.p.tampered; return true; } return false; }

  get rank() { return rankInfo(this.p.rp); }
  // today's login reward without paying it: { claimable, streak (today's day in the 7-day cycle), R, next (ms until it resets) }
  loginState() {
    const P = this.p, today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
    const mid = new Date(); mid.setHours(24, 0, 0, 0);
    if (P.login && P.login.d === today) return { claimable: false, streak: P.login.streak, R: LOGIN_REWARDS[P.login.streak - 1], next: mid - Date.now() };
    const streak = P.login && P.login.d === dayKey(y) ? (P.login.streak % 7) + 1 : 1;
    return { claimable: true, streak, R: LOGIN_REWARDS[streak - 1], next: mid - Date.now() };
  }
  // pays today's login reward (only when the player hits Claim): returns the reward, or null if it's already claimed
  // claimed on another device already today: mark it here too, no second payout
  markLoginClaimed() { const L = this.loginState(); if (!L.claimable) return; this.p.login = { d: dayKey(), streak: L.streak }; this.save(); }
  claimLogin() {
    const P = this.p, today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
    if (P.login && P.login.d === today) return null;
    const streak = P.login && P.login.d === dayKey(y) ? (P.login.streak % 7) + 1 : 1;
    const R = LOGIN_REWARDS[streak - 1];
    P.coins += R.coins; if (R.tp) P.tp = (P.tp || 0) + R.tp; if (R.pack) this.addPack(R.pack);
    P.login = { d: today, streak }; this.save();
    return { streak, ...R };
  }
  // pay out a finished ranked season / Weekend League (shown as a toast the next time the menu opens)
  settleSeasons() {
    const P = this.p, mk = monthKey(), wk = weekKey(); let paid = false;
    if (!P.rs) P.rs = { k: mk, peak: P.rp || 0 };
    else if (P.rs.k !== mk) {
      const rk = rankInfo(P.rs.peak || 0), R = RANK_REWARDS[Math.min(5, rk.idx)];
      P.coins += R.coins; if (R.pack) this.addPack(R.pack);
      this.notice = (this.notice || []).concat(`Ranked season over: you peaked at ${rk.name}. +${R.coins.toLocaleString()} coins${R.pack ? ' and a ' + (PACKS.find(k => k.key === R.pack) || {}).name : ''}. RP soft reset for the new season.`);
      P.rp = Math.floor((P.rp || 0) * 0.5); P.rs = { k: mk, peak: P.rp }; paid = true;
    }
    if (P.wl && P.wl.n > 0 && !P.wl.paid) {   // Weekend League is gone: pay out anyone's last unfinished record
      const R = wlReward(P.wl.w); P.coins += R.coins; if (R.pack) this.addPack(R.pack); P.wl.paid = true;
      this.notice = (this.notice || []).concat(`Weekend League over: ${P.wl.w}W-${P.wl.l}L. +${R.coins.toLocaleString()} coins${R.pack ? ' and a ' + (PACKS.find(k => k.key === R.pack) || {}).name : ''}.`);
      paid = true;
    }
    if (paid) this.save();
  }
  refreshChallenges() {
    const P = this.p, dk = dayKey(), wk = weekKey();
    // Season 1 record reset (Oct 20, 2026): wins, losses and games played start over for everyone, everywhere
    if (P.recReset !== 1) { P.recReset = 1; P.recs = {}; P.wins = 0; P.games = 0; P.streak = 0; P.h2h = {}; if (P.log) P.log = []; }
    if (this.listeners) this.settleSeasons();
    if (!P.daily || P.daily.d !== dk) P.daily = { d: dk, list: pickN(DAILY, 5, hashStr(dk + this.key)).map(c => ({ k: c.k, p: 0, done: false, claimed: false })) };
    if (!P.weekly || P.weekly.d !== wk) P.weekly = { d: wk, list: pickN(WEEKLY, 5, hashStr(wk + this.key)).map(c => ({ k: c.k, p: 0, done: false, claimed: false })) };
    for (const [box, pool, seed] of [[P.daily, DAILY, dk], [P.weekly, WEEKLY, wk]]) if (box.list.length < 5) { const have = new Set(box.list.map(c => c.k)); for (const c of pickN(pool.filter(x => !have.has(x.k)), 5 - box.list.length, hashStr(seed + this.key + 'more'))) box.list.push({ k: c.k, p: 0, done: false, claimed: false }); }
    const U = P.ut; if (!U.mk) U.mk = { slot: 0, bought: [], list: [], sold: 0 };
    if (!U.sets || U.sets.w !== wk) U.sets = { w: wk, done: [] };
    if (!U.solos || U.solos.w !== wk) U.solos = { w: wk, done: [] };
    // solo battles: last week's points pay out when the new week starts
    if (!U.sb || U.sb.w !== wk) {
      if (U.sb && U.sb.g > 0 && !U.sb.paid) { const T = sbTier(U.sb.pts); this.giveUT(T.give, U.sb.w + 'sb'); this.notice = (this.notice || []).concat(`Solo Battles week over: ${U.sb.pts.toLocaleString()} points, ${T.n} tier. Rewards added to your club.`); }
      U.sb = { w: wk, pts: 0, g: 0, wins: 0, l: 0 };
    }
    const pk = progKey(); if (!U.prog || U.prog.k !== pk) U.prog = { k: pk, xp: 0, got: [], done: [] };
    const fs = fpSeason(); if (!P.fp || P.fp.s !== fs) P.fp = { s: fs, xp: 0, got: [] };
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
  // 11-on-11 update: older clubs get free silver players for the new spots (tight end, slot, tackles, extra defenders)
  upgradeClub() {
    const U = this.p.ut; if (!U.started) return;
    if (SLOTS.every(s => U.lineup[s] !== undefined)) return;
    const extra = missingForLineup(U.cards);
    if (extra.length) this.addCards(extra);
    const used = new Set(Object.values(U.lineup));
    const pool = U.cards.map(c => ({ c, o: owned(c) })).sort((a, b) => b.o.ovr - a.o.ovr);
    for (const s of SLOTS) { if (U.lineup[s] !== undefined) continue; const f = pool.find(x => x.o.group === SLOT_GROUP[s] && !used.has(x.c.u)); if (f) { U.lineup[s] = f.c.u; used.add(f.c.u); } }
    this.upgradedNote = extra.length;
    this.save();
  }
  addPack(k, n = 1) { this.p.packs[k] = (this.p.packs[k] || 0) + n; }
  // add program XP; returns the program rewards it just unlocked
  progXp(n) {
    const G = this.p.ut.prog, out = []; if (!G || !n) return out;
    G.xp += n;
    PROG_STEPS.forEach((st, i) => { if (G.xp >= st.xp && !G.got.includes(i)) { G.got.push(i); this.giveUT(st.give, G.k + 'prog' + i); out.push(st.label); } });
    return out;
  }
  // pay an Ultimate Team reward: coins, Training Points, a pack and/or a special player item (tier 3 Elite, 4 Kings)
  giveUT(g, seedKey) {
    const P = this.p; let got = null;
    if (g.coins) P.coins += g.coins; if (g.tp) P.tp = (P.tp || 0) + g.tp; if (g.pack) this.addPack(g.pack);
    if (g.player) { const ids = this.addCards([programPlayer(g.player, hashStr(this.key + seedKey))]); got = ids && ids[0]; }
    return got;
  }
  addXp(x) {
    const P = this.p, ups = [];
    P.xp += x;
    while (P.xp >= xpFor(P.lvl)) { P.xp -= xpFor(P.lvl); P.lvl++; const r = levelReward(P.lvl); P.coins += r.coins; if (r.pack) this.addPack(r.pack); ups.push({ lvl: P.lvl, ...r }); }
    return ups;
  }

  // unlock anything newly earned; returns the list (each pays its coins right away)
  checkAch(r, ev) {
    const P = this.p, got = [];
    for (const a of ACH) {
      if (P.ach[a.k]) continue;
      let ok = false;
      try { ok = (a.f && r && a.f(r)) || (a.g && a.g(this)) || (a.ev && ev === a.ev); } catch (_) {}
      if (ok) { P.ach[a.k] = Date.now(); P.coins += a.c; got.push(a); }
    }
    return got;
  }
  unlock(ev) { const got = this.checkAch(null, ev); if (got.length) this.save(); return got; }
  // two-minute drill: pays by points, keeps your best and a top-10 for this device
  awardDrill(pts, diff, teamIdx, name) {
    const P = this.p; this.refreshChallenges();
    const mul = [0.7, 1, 1.35, 1.75][diff ?? 1] || 1;
    const lines = [{ label: 'Drill finished', c: Math.round(80 * mul), x: 120 }];
    if (pts) lines.push({ label: `${pts} points`, c: Math.round(pts * 16 * mul), x: pts * 18 });
    const best = pts > (P.drill.best || 0);
    if (best && pts) lines.push({ label: 'New personal best', c: Math.round(150 * mul), x: 100 });
    const coins = lines.reduce((a, l) => a + l.c, 0), xp = lines.reduce((a, l) => a + l.x, 0);
    P.coins += coins; P.drill.best = Math.max(P.drill.best || 0, pts);
    P.drill.runs.push({ pts, diff, team: teamIdx, at: Date.now() }); P.drill.runs.sort((a, b) => b.pts - a.pts || a.at - b.at); P.drill.runs.length = Math.min(P.drill.runs.length, 10);
    try { const k = 'ek_drill_board'; const b = JSON.parse(localStorage.getItem(k) || '[]'); b.push({ name, pts, diff, team: teamIdx, at: Date.now() }); b.sort((x, y) => y.pts - x.pts || x.at - y.at); localStorage.setItem(k, JSON.stringify(b.slice(0, 10))); } catch (_) {}
    const levels = this.addXp(xp);
    const ach = this.checkAch(null);
    this.save();
    return { lines, coins, xp, levels, drp: 0, rank: this.rank, promos: [], done: [], ach, best };
  }

  // Called once per finished game. r = { mode: 'cpu'|'online'|'season', ut, res: 'W'|'L'|'T', diff, qlen, sc: [mine, theirs], me: teamStats, opp: teamStats }
  award(r) {
    const P = this.p; this.refreshChallenges();
    const lines = [];
    const len = Math.max(0.5, Math.min(1.5, (r.qlen || 120) / 120));
    // harder difficulty pays a lot more, especially in Ultimate Team
    const diffMul = r.mode === 'online' ? 1.5 : (r.ut ? [0.55, 1, 1.6, 2.4] : [0.7, 1, 1.35, 1.75])[r.diff ?? 1] || 1;
    const ECON = 0.6;   // the grind: coins come slow, so packs and upgrades mean something
    const add = (label, c, x) => { if (c || x) lines.push({ label, c: Math.round(c * ECON * len * diffMul * (r.ut ? 1.2 : 1)), x: Math.round(x * len) }); };
    add('Game played', 120, 160);
    if (r.res === 'W') add('Win', 180, 160); else if (r.res === 'T') add('Tie', 60, 60);
    if (r.me.tds) add(`${r.me.tds} touchdown${r.me.tds > 1 ? 's' : ''}`, r.me.tds * 25, r.me.tds * 30);
    if (r.me.sacks) add(`${r.me.sacks} sack${r.me.sacks > 1 ? 's' : ''}`, r.me.sacks * 15, r.me.sacks * 15);
    if (r.opp.ints) add(`${r.opp.ints} interception${r.opp.ints > 1 ? 's' : ''}`, r.opp.ints * 30, r.opp.ints * 30);
    if (r.res === 'W' && r.me.ints === 0) add('No turnovers', 60, 50);
    if (r.res === 'W' && r.sc[1] === 0) add('Shutout', 120, 100);
    if (r.res === 'W' && r.sc[0] - r.sc[1] >= 21) add('Blowout', 80, 60);
    // Ultimate Team pays for big plays and big games
    if (r.ut) {
      const opp = r.opp || {}, me = r.me || {};
      if ((opp.ints || 0) >= 2) add('Ball hawk (2+ picks)', 90, 40);
      if ((me.sacks || 0) >= 3) add('Pass rush (3+ sacks)', 70, 30);
      if ((me.passYds || 0) >= 250) add('Air raid (250+ pass yds)', 80, 30);
      if ((me.rushYds || 0) >= 120) add('Ground and pound (120+ rush yds)', 70, 30);
      if ((opp.passYds || 0) + (opp.rushYds || 0) < 200) add('Lockdown D (under 200 yds allowed)', 110, 40);
      if ((me.tds || 0) >= 5) add('Scoring machine (5+ TDs)', 120, 50);
    }
    // win streak: every win in a row adds 6% to the whole payout (coins, XP and TP), up to +30% at 5 straight
    const streakMul = r.res === 'W' && P.streak >= 1 ? 1 + Math.min(5, P.streak) * 0.06 : 1;
    if (streakMul > 1) { const base = lines.reduce((s, l) => s + l.c, 0), bx = lines.reduce((s, l) => s + l.x, 0); lines.push({ label: `Win streak x${P.streak + 1} (+${Math.round((streakMul - 1) * 100)}%)`, c: Math.round(base * (streakMul - 1)), x: Math.round(bx * (streakMul - 1)) }); }
    let coins = lines.reduce((s, l) => s + l.c, 0), xp = lines.reduce((s, l) => s + l.x, 0);
    P.coins += coins; if (!r.forfeit) P.games++; P.tds += r.me.tds || 0;   // games played = games finished to the final whistle
    // Training Points: every rewarded game earns some, Ultimate Team games earn the most
    // Training Points: Ultimate Team pays the most, Franchise pays some
    const tpB = [], win = r.res === 'W', tds = r.me.tds || 0, ints = (r.opp && r.opp.ints) || 0, sacks = r.me.sacks || 0;
    let tpMul = len;
    if (r.ut) { tpB.push([r.mode === 'online' ? 'Online with your UT squad' : 'Played a UT game', 15]);   // Training Points only come from Ultimate Team games
      if (win) tpB.push(['Win', 15]); if (tds) tpB.push([`${tds} TD${tds > 1 ? 's' : ''}`, tds * 2]); if (ints) tpB.push([`${ints} pick${ints > 1 ? 's' : ''}`, ints * 5]); if (sacks) tpB.push([`${sacks} sack${sacks > 1 ? 's' : ''}`, sacks * 3]); tpMul *= r.mode === 'online' ? 1.3 : [0.6, 1, 1.5, 2.1][r.diff ?? 1] || 1; }
    const tpLines = tpB.map(([l, v]) => ({ label: l, tp: Math.round(v * tpMul * 0.7 * streakMul) })).filter(x => x.tp > 0);
    // rival strength in Ultimate Team climbs with your wins against the CPU
    if (r.ut && r.mode !== 'online' && P.ut) P.ut.rw = Math.max(0, (P.ut.rw || 0) + (r.res === 'W' ? 1 : r.res === 'L' ? -0.5 : 0));
    const tpS = tpLines.reduce((a, x) => a + x.tp, 0); P.tp = (P.tp || 0) + tpS;
    if (r.res === 'W') { P.wins++; P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak); } else if (r.res === 'L') P.streak = 0;
    // ranked points
    const before = rankInfo(P.rp), rp0 = P.rp;
    let drp = 0;
    if (r.mode === 'online') drp = r.res === 'W' ? 40 : r.res === 'L' ? -20 : 5;
    else drp = r.res === 'W' ? 6 + 4 * (r.diff ?? 1) : r.res === 'L' ? -4 : 1;
    P.rp = Math.max(before.floor, P.rp + drp); P.rpBest = Math.max(P.rpBest, P.rp);
    if (P.rs) P.rs.peak = Math.max(P.rs.peak || 0, P.rp);
    let wlLine = null;
    if (r.mode === 'online') {
      // head-to-head vs this opponent
      if (r.oppName) { const k = String(r.oppName).toLowerCase().slice(0, 24); P.h2h = P.h2h || {}; const h = P.h2h[k] = P.h2h[k] || [0, 0, 0]; h[r.res === 'W' ? 0 : r.res === 'L' ? 1 : 2]++; }
    }
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
    // field pass XP: every game counts, Ultimate Team games count more
    let fp = Math.round((150 + (r.res === 'W' ? 150 : 0) + (r.me.tds || 0) * 25) * len * (r.ut ? 1.5 : 1));
    let solo = null;
    if (r.solo && r.ut) {
      const sd = SOLOS.find(x => x.k === r.solo);
      if (sd && !P.ut.solos.done.includes(sd.k)) {
        let ok = false; try { ok = !!sd.f(r); } catch (_) {}
        solo = { ...sd, ok };
        if (ok) { P.ut.solos.done.push(sd.k); P.coins += sd.give.coins || 0; coins += sd.give.coins || 0; P.tp = (P.tp || 0) + (sd.give.tp || 75); if (sd.give.pack) this.addPack(sd.give.pack); fp += sd.give.fp || 0; }
      }
    }
    // solo battles: weekly ranked games against the CPU
    let sb = null;
    if (r.ut && r.battle != null && P.ut.sb && P.ut.sb.g < SB_GAMES) {
      const B = P.ut.sb, win = r.res === 'W', pts = sbPoints(Math.max(0, Math.min(3, r.battle | 0)), win, r.sc[0] - r.sc[1]);
      const before = sbTier(B.pts).n; B.pts += pts; B.g++; if (win) B.wins++; else B.l++;
      sb = { pts, total: B.pts, g: B.g, tier: sbTier(B.pts).n, up: sbTier(B.pts).n !== before };
      sb.px = win ? 120 : 30; sb.unlocked = this.progXp(sb.px);   // battles feed this month's program too
    }
    // theme challenges: coins, Training Points and program XP; program XP unlocks special player items
    let th = null;
    if (r.ut && r.theme && P.ut.prog) {
      const T = theme(), ch = T.ch.find(x => x.k === r.theme), G = P.ut.prog;
      if (ch && !G.done.includes(ch.k)) {
        let ok = false; try { ok = !!ch.f(r); } catch (_) {}
        th = { n: ch.n, d: ch.d, ok, give: ch.give, unlocked: [] };
        if (ok) {
          G.done.push(ch.k); this.giveUT({ coins: ch.give.coins, tp: ch.give.tp, pack: ch.give.pack }, '');
          coins += ch.give.coins || 0; th.unlocked.push(...this.progXp(ch.give.px || 0));
        }
      }
    }
    const fpBefore = this.fpTier; P.fp.xp += fp;
    const levels = this.addXp(xp);
    const ach = this.checkAch(r);
    P.log.unshift({ at: Date.now(), res: r.res, sc: r.sc, mode: r.mode, ut: !!r.ut, coins, xp }); P.log.length = Math.min(P.log.length, 20);
    this.save();
    return { wl: wlLine, tp: tpS, tpLines, lines, coins, xp, levels, drp: P.rp - rp0, rank: after, rankBefore: before, promos, done, ach, fp, fpTiers: this.fpTier - fpBefore, solo, sb, th };
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
    for (const e of ids) { const inst = typeof e === 'number' ? { u: U.next++, id: e, b: 0 } : { u: U.next++, id: e.id, b: e.b || 0, ...(e.x ? { x: e.x } : {}), ...(e.ab ? { ab: e.ab } : {}), ...(e.xf ? { xf: 1 } : {}) }; U.cards.push(inst); added.push(inst); }
    return added;
  }
  clubFull() { return this.p.ut.cards.length >= CLUB_CAP; }
  buyPack(k) {
    const P = PACKS.find(x => x.key === k); if (!P) return 'No such pack';
    if (P.tpCost) { if ((this.p.tp || 0) < P.tpCost) return `You need ${(P.tpCost - (this.p.tp || 0)).toLocaleString()} more Training Points`; }
    else if (this.p.coins < P.cost) return `You need ${(P.cost - this.p.coins).toLocaleString()} more coins`;
    if (this.p.ut.cards.length + Math.max(P.n, 3) > CLUB_CAP) return `Your club is full (${CLUB_CAP} players). Quicksell some players first`;
    if (P.tpCost) this.p.tp -= P.tpCost; else this.p.coins -= P.cost; this.addPack(k);
    this.save();
    return null;
  }
  // opens one pack you own; returns the new card instances or an error string
  openPack(k, ids) {
    if (!(this.p.packs[k] > 0)) return 'You have no pack like that';
    if (this.p.ut.cards.length + ids.length > CLUB_CAP) return `Your club is full (${CLUB_CAP} players). Quicksell some players first`;
    this.p.packs[k]--; this.p.ut.opened++;
    const added = this.addCards(ids);
    if (ids.tp) this.p.tp = (this.p.tp || 0) + ids.tp;
    this.bump('pack');
    this.lastAch = this.checkAch(null);
    this.save();
    return added;
  }
  // ---------------- trading: take items out (held in the trade) and put items in ----------------
  tradeCheck(it) {
    const U = this.p.ut;
    for (const u of it.us || []) { const c = U.cards.find(x => x.u === u); if (!c) return 'You no longer have one of those players'; if (this.inLineup(u)) return 'Take traded players out of your lineup first'; }
    for (const [k, n] of Object.entries(it.packs || {})) if ((this.p.packs[k] || 0) < n) return 'You don\'t have those packs anymore';
    if ((it.coins || 0) > this.p.coins) return 'Not enough coins';
    if ((it.tp || 0) > (this.p.tp || 0)) return 'Not enough Training Points';
    return null;
  }
  tradeTake(it) {
    const err = this.tradeCheck(it); if (err) return { err };
    const U = this.p.ut, cards = [];
    for (const u of it.us || []) { const i = U.cards.findIndex(x => x.u === u); const c = U.cards.splice(i, 1)[0]; cards.push({ id: c.id, ...(c.x ? { x: c.x } : {}), b: c.b || 0, ...(c.ab ? { ab: c.ab } : {}), ...(c.xf ? { xf: 1 } : {}) }); }
    for (const [k, n] of Object.entries(it.packs || {})) this.p.packs[k] -= n;
    this.p.coins -= it.coins || 0; this.p.tp = (this.p.tp || 0) - (it.tp || 0);
    this.save();
    return { items: { cards, packs: it.packs || {}, coins: it.coins || 0, tp: it.tp || 0 } };
  }
  tradeGive(items) {
    if (!items) return;
    if (items.cards && items.cards.length) this.addCards(items.cards.slice(0, 12));
    for (const [k, n] of Object.entries(items.packs || {})) if (PACKS.some(p => p.key === k)) this.p.packs[k] = (this.p.packs[k] || 0) + Math.max(0, Math.min(20, n | 0));
    this.p.coins += Math.max(0, Math.min(1e6, items.coins | 0)); this.p.tp = (this.p.tp || 0) + Math.max(0, Math.min(1e5, items.tp | 0));
    this.save();
  }
  inLineup(u) { return Object.values(this.p.ut.lineup).includes(u); }
  sell(u, value, tp = 0) {
    const U = this.p.ut; if (this.inLineup(u)) return false;
    const i = U.cards.findIndex(c => c.u === u); if (i < 0) return false;
    U.cards.splice(i, 1); this.p.coins += value; this.p.tp = (this.p.tp || 0) + (tp || 0); this.bump('qs'); this.save(); return true;
  }
  unlockAbility(u, k) {
    const inst = this.p.ut.cards.find(c => c.u === u); if (!inst) return 'No such player';
    const c = card(inst.id); if (c.tier < 2) return 'Abilities unlock on Gold cards and up';
    const cost = TP_ABILITY[c.tier]; if ((this.p.tp || 0) < cost) return `You need ${(cost - (this.p.tp || 0)).toLocaleString()} more Training Points`;
    this.p.tp -= cost; inst.ab = k; this.save(); return null;
  }
  unlockXFactor(u) {
    const inst = this.p.ut.cards.find(c => c.u === u); if (!inst) return 'No such player';
    if (card(inst.id).tier < 4 && inst.x !== 'legend') return 'X-Factors are for Kings and Ultimate Legend cards';
    if (inst.xf) return 'Already unlocked';
    if ((this.p.tp || 0) < TP_XFACTOR) return `You need ${(TP_XFACTOR - (this.p.tp || 0)).toLocaleString()} more Training Points`;
    this.p.tp -= TP_XFACTOR; inst.xf = 1; this.save(); return null;
  }
  addTp(n) { this.p.tp = (this.p.tp || 0) + Math.max(0, n | 0); this.save(); }
  train(u, cost) {
    const inst = this.p.ut.cards.find(c => c.u === u); if (!inst || !cost) return 'This player is maxed out';
    const have = this.p.tp || 0;
    if (have < cost) return `You need ${(cost - have).toLocaleString()} more Training Points. Play Ultimate Team games (offline or online with your squad) or quicksell players to earn them`;
    this.p.tp = have - cost; inst.b = (inst.b || 0) + 1; this.bump('train'); this.save(); return null;
  }
  // ---------------- field pass ----------------
  get fpTier() { return Math.min(FP_TIERS, Math.floor((this.p.fp.xp || 0) / FP_XP)); }
  fpClaim(t) {
    const F = this.p.fp; if (t < 1 || t > this.fpTier || F.got.includes(t)) return null;
    const rw = fpReward(t); F.got.push(t); this.p.coins += rw.coins || 0; if (rw.pack) this.addPack(rw.pack);
    this.save(); return rw;
  }
  fpClaimAll() { const out = { coins: 0, packs: [] }; for (let t = 1; t <= this.fpTier; t++) { if (this.p.fp.got.includes(t)) continue; const rw = fpReward(t); this.p.fp.got.push(t); this.p.coins += rw.coins || 0; this.p.tp = (this.p.tp || 0) + 15; out.coins += rw.coins || 0; if (rw.pack) { this.addPack(rw.pack); out.packs.push(rw.pack); } } this.save(); return out; }

  // ---------------- market ----------------
  get market() { const M = this.p.ut.mk, slot = marketSlot(); if (M.slot !== slot) { M.slot = slot; M.bought = []; } return { slot, items: marketListings(slot, hashStr(this.key)).filter(l => !M.bought.includes(l.k)), mine: M.list }; }
  marketBuy(k) {
    const m = this.market, l = m.items.find(x => x.k === k); if (!l) return 'Someone already bought that player';
    if (this.p.coins < l.price) return `You need ${(l.price - this.p.coins).toLocaleString()} more coins`;
    if (this.clubFull()) return `Your club is full (${CLUB_CAP} players). Quicksell or sell some players first`;
    this.p.coins -= l.price; this.p.ut.mk.bought.push(k); const [inst] = this.addCards([l.id]); this.bump('buy'); this.save(); return inst;
  }
  marketList(u, price, mins) {
    const U = this.p.ut, M = U.mk; if (this.inLineup(u)) return 'Take him out of your lineup first';
    if (M.list.length >= MAX_LISTINGS) return `You can only have ${MAX_LISTINGS} players listed at once`;
    const i = U.cards.findIndex(c => c.u === u); if (i < 0) return 'Player not found';
    const inst = U.cards[i], now = Date.now();
    U.cards.splice(i, 1);
    M.list.push({ u: inst.u, id: inst.id, b: inst.b || 0, price: Math.max(50, Math.round(price / 50) * 50), mv: marketValue(inst), at: now, end: now + mins * 60000 });
    this.save(); return null;
  }
  marketCancel(u) {
    const U = this.p.ut, M = U.mk, i = M.list.findIndex(l => l.u === u); if (i < 0) return 'Not listed';
    if (Date.now() >= M.list[i].end) return 'That listing already ended';
    const l = M.list.splice(i, 1)[0]; U.cards.push({ u: l.u, id: l.id, b: l.b }); this.save(); return null;
  }
  // settle finished listings: sold ones pay out (minus the market's cut), unsold ones come back to your club
  marketSettle() {
    const U = this.p.ut, M = U.mk, now = Date.now(), out = [];
    for (const l of M.list.slice()) {
      if (now < l.end) continue;
      const sold = listingSells(l);
      if (!sold && this.clubFull()) continue;
      M.list.splice(M.list.indexOf(l), 1);
      if (sold) { const net = Math.round(l.price * (1 - MARKET_TAX)); this.p.coins += net; M.sold = (M.sold || 0) + 1; out.push({ ...l, sold: true, net }); }
      else { U.cards.push({ u: l.u, id: l.id, b: l.b }); out.push({ ...l, sold: false }); }
    }
    if (out.length) this.save();
    return out;
  }

  // ---------------- sets ----------------
  // the cheapest players that fill a set (never lineup players, never trained ones you'd miss)
  setPick(k) {
    const S = SETS.find(x => x.k === k); if (!S) return null;
    const free = this.p.ut.cards.filter(c => !this.inLineup(c.u)).map(owned).sort((a, b) => a.ovr - b.ovr || a.b - b.b);
    const used = new Set(), pick = [], missing = [];
    for (const [tier, n] of S.need) {
      const got = free.filter(c => c.tier === tier && !used.has(c.u)).slice(0, n);
      got.forEach(c => used.add(c.u)); pick.push(...got);
      if (got.length < n) missing.push([tier, n - got.length]);
    }
    const locked = S.weekly && this.p.ut.sets.done.includes(k);
    return { set: S, pick, missing, locked, ok: !missing.length && !locked };
  }
  completeSet(k) {
    const r = this.setPick(k); if (!r) return 'No such set';
    if (r.locked) return 'You already finished this set this week';
    const U0 = this.p.ut, today = dayKey(); if (!U0.setDay || U0.setDay.d !== today) U0.setDay = { d: today, n: {} };
    if (r.set.daily && (U0.setDay.n[k] || 0) >= r.set.daily) return `You've done ${r.set.n} ${r.set.daily === 1 ? 'once' : r.set.daily + ' times'} today. Come back tomorrow`;
    if (!r.ok) return 'You don’t have enough players for this set';
    const U = this.p.ut, gone = new Set(r.pick.map(c => c.u));
    U.cards = U.cards.filter(c => !gone.has(c.u));
    const g = r.set.give; let got = null;
    if (g.pack) this.addPack(g.pack);
    if (g.coins) this.p.coins += g.coins;
    if (g.master) [got] = this.addCards([masterId(hashStr(U.sets.w + 'master'))]);
    if (r.set.weekly) U.sets.done.push(k);
    if (r.set.daily) U.setDay.n[k] = (U.setDay.n[k] || 0) + 1;
    this.p.fp.xp += 40; this.bump('set');
    this.save(); return { give: g, card: got };
  }
  soloDone(k) { return this.p.ut.solos.done.includes(k); }

  setSlot(slot, u) { const L = this.p.ut.lineup; for (const s of Object.keys(L)) if (L[s] === u) delete L[s]; L[slot] = u; this.save(); }
}
