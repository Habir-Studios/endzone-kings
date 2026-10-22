// ENDZONE KINGS — Online Franchise. Up to 16 people each run a team. Before the season everyone drafts from one
// shared player pool (bots fill the empty spots and pick for themselves), trades stay open all season, and a
// 16-team knockout bracket runs until the last two meet in the Kings Bowl. Server side: supabase/leagues.sql.
import { TEAMS } from './teams.js?v=1792634143';
import { getRoster } from './teams.js?v=1792634143';
import { askYes } from './ui.js?v=1792634143';
import { rosterStyle } from './playbook.js?v=1792634143';
import { card, makeId, GROUPS, SLOTS, SLOT_GROUP, SLOT_LABEL } from './ut.js?v=1792634143';

let C = null, view = { code: null, tab: 'home', filter: 'All', trade: null }, poll = null, busy = false, lastRow = null;
const GKEYS = Object.keys(GROUPS);
const ROUND_NAMES = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Kings Bowl'];
const ROUNDS = 8, PICK_SECS = 60;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const db = () => (C.Auth.mode === 'supabase' && C.Auth.client ? C.Auth.client : null);
const me = () => (C.Auth.user && C.Auth.user.kind === 'account' ? C.Auth.user : null);
const $ = id => document.getElementById(id);
const errText = e => String((e && (e.message || e.error_description)) || e || 'Something went wrong').replace(/^.*?exception:\s*/i, '');
const teamName = t => TEAMS[t] ? TEAMS[t].city : '?';
const logo = (t, n = 40) => C.logoURL(t, n);

export function initLeague(ctx) { C = ctx; }

// ---------- rosters ----------
// your drafted players take the starting spots they fit (best first); the rest of the lineup is your team's regular roster
export function leagueRoster(s, slot) {
  const players = JSON.parse(JSON.stringify(getRoster(s.slots[slot].t).players));
  const mine = s.picks.filter(p => p.s === slot).map(p => card(+p.c)).sort((a, b) => b.ovr - a.ovr), used = new Set();
  for (const sl of SLOTS) {
    const c = mine.find(x => x.group === SLOT_GROUP[sl] && !used.has(x.id)); if (!c) continue; used.add(c.id);
    players[sl] = { first: c.first, last: c.last, num: c.num, face: c.face, ovr: c.ovr, spd: c.spd, hands: c.hands, acc: c.acc, arm: c.arm, elu: c.elu, blk: c.blk, rush: c.rush, tkl: c.tkl, cov: c.cov };
  }
  return { players };
}
const starters = (s, slot) => { const mine = s.picks.filter(p => p.s === slot).map(p => card(+p.c)).sort((a, b) => b.ovr - a.ovr), used = new Set(), out = {}; for (const sl of SLOTS) { const c = mine.find(x => x.group === SLOT_GROUP[sl] && !used.has(x.id)); if (c) { used.add(c.id); out[c.id] = sl; } } return out; };
const strength = (s, slot) => s.picks.filter(p => p.s === slot).reduce((a, p) => a + p.o, 0);

// ---------- the draft pool: ~225 players, every position, mostly gold and elite with a few Kings at the top ----------
function buildPool() {
  const per = { QB: 18, HB: 18, WR: 27, OL: 45, DL: 36, LB: 27, CB: 18, S: 18, TE: 18 }, pool = [], seen = new Set();
  for (const [g, n] of Object.entries(per)) for (let i = 0; i < n; i++) {
    const r = Math.random(), tier = r < 0.05 ? 4 : r < 0.3 ? 3 : r < 0.75 ? 2 : 1;
    let id; do id = makeId(tier, GKEYS.indexOf(g), (Math.random() * 1e7) | 0); while (seen.has(id)); seen.add(id);
    const c = card(id); pool.push({ c: id, o: c.ovr, g });
  }
  return pool.sort((a, b) => b.o - a.o);
}

// ---------- data ----------
async function myLeagues() {
  const u = me(); const { data, error } = await db().from('ek_league_members').select('league,team').eq('player', u.id);
  if (error) throw error; const ids = (data || []).map(x => x.league); if (!ids.length) return [];
  const { data: L } = await db().from('ek_leagues').select('id,name,owner,status,created_at').in('id', ids);
  return (L || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
async function loadLeague(code) {
  const { data: L, error } = await db().from('ek_leagues').select('*').eq('id', code).maybeSingle();
  if (error) throw error; if (!L) return null;
  const { data: M } = await db().from('ek_league_members').select('player,team,joined_at').eq('league', code).order('joined_at');
  const ids = (M || []).map(m => m.player);
  const { data: P } = ids.length ? await db().from('ek_players').select('id,name').in('id', ids) : { data: [] };
  const nm = Object.fromEntries((P || []).map(p => [p.id, p.name]));
  L.members = (M || []).map(m => ({ ...m, name: nm[m.player] || 'Player' }));
  return L;
}
const rpc = async (fn, args) => { const { data, error } = await db().rpc(fn, args); if (error) throw error; return data; };

// ---------- screen ----------
export async function renderLeague() {
  const root = $('lg-pane'); if (!root) return;
  stopPoll();
  if (!db() || !me()) { root.innerHTML = '<p class="note center">Online Franchise needs a free account.</p>'; return; }
  { const P = C.profile && C.profile(), lv = P ? P.p.lvl : 1;
    if (lv < 5) { root.innerHTML = `<div class="lg-lock"><b>Online Franchise unlocks at level 5</b><p class="note">You're level ${lv}. Play Ultimate Team, online games and challenges to level up.</p></div>`; return; } }
  if (view.code) return openLeague(view.code);
  root.innerHTML = '<p class="note center"><span class="spinner"></span>Loading your leagues</p>';
  let mine = [];
  try { mine = await myLeagues(); } catch (e) { root.innerHTML = `<p class="note center">Couldn't load leagues: ${esc(errText(e))}</p>`; return; }
  const ST = { open: 'Waiting for players', draft: 'Drafting now', season: 'Season in progress', done: 'Finished' };
  root.innerHTML = `
    <p class="note center">Up to 16 people each run a team. Everybody drafts players from one pool before the season, bots fill any empty spots, trades stay open all season, and a knockout bracket ends with the last two teams in the Kings Bowl.</p>
    <div class="lg-start">
      <div class="lg-box"><h3>Start a league</h3><input id="lg-name" maxlength="24" placeholder="League name"><label class="check lg-pub"><input type="checkbox" id="lg-public" checked> Public: anyone can find and join it from the list (no code needed)</label><button class="btn primary" id="lg-create" type="button">Create league</button><small>You're the commissioner. You pick when the draft starts.</small></div>
      <div class="lg-box"><h3>Join a league</h3><input id="lg-code" maxlength="6" placeholder="6-letter code"><button class="btn" id="lg-join" type="button">Join league</button><small>Get the code from whoever made it.</small></div>
    </div>
    <h3 class="lg-h">Public leagues <span class="note" id="lg-pub-n"></span></h3><div class="lg-list" id="lg-public-list"><p class="note"><span class="spinner"></span>Looking for open leagues</p></div>
    <h3 class="lg-h">Your leagues</h3>
    ${mine.length ? `<div class="lg-list">${mine.map(l => `<button class="lg-row" type="button" data-open="${esc(l.id)}"><b>${esc(l.name)}</b><span>${ST[l.status] || l.status}</span><small>${esc(l.id)}${l.owner === me().id ? ' · commissioner' : ''}</small></button>`).join('')}</div>` : '<p class="note">You are not in any leagues yet. Make one and send the code to your friends.</p>'}`;
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openLeague(b.dataset.open));
  $('lg-create').onclick = () => {
    const name = ($('lg-name').value || '').trim(); if (name.length < 2) return C.toast('Give the league a name (2 letters or more)');
    C.openPicker('Pick your team', C.SET.team, -1, async t => {
      try { const code = await rpc('ek_league_create', { lname: C.cleanText ? C.cleanText(name) : name, lteam: t, lpublic: !!($('lg-public') && $('lg-public').checked) }); C.toast(`League made. Code: ${code}`, 4000); openLeague(code); } catch (e) { C.toast(errText(e)); }
    });
  };
  loadPublic(mine.map(l => l.id));
  $('lg-join').onclick = () => {
    const code = ($('lg-code').value || '').trim().toUpperCase(); if (code.length !== 6) return C.toast('League codes are 6 letters or numbers');
    C.openPicker('Pick your team', C.SET.team, -1, async t => { try { await rpc('ek_league_join', { code, lteam: t }); openLeague(code); } catch (e) { C.toast(errText(e)); } });
  };
}

// open public leagues: join straight from the list, no code
async function loadPublic(mineIds) {
  const box = $('lg-public-list'); if (!box) return;
  const { data, error } = await db().from('ek_leagues').select('id,name,owner,created_at').eq('public', true).eq('status', 'open').order('created_at', { ascending: false }).limit(30);
  if (!$('lg-public-list')) return;
  if (error) { box.innerHTML = `<p class="note">Couldn't load public leagues: ${esc(errText(error))}</p>`; return; }
  const rows = (data || []).filter(l => !mineIds.includes(l.id));
  const ids = rows.map(l => l.id);
  const { data: M } = ids.length ? await db().from('ek_league_members').select('league,team').in('league', ids) : { data: [] };
  const n = {}, taken = {}; for (const m of M || []) { n[m.league] = (n[m.league] || 0) + 1; (taken[m.league] = taken[m.league] || []).push(m.team); }
  const open = rows.filter(l => (n[l.id] || 0) < 16);
  $('lg-pub-n').textContent = open.length ? `${open.length} open` : '';
  box.innerHTML = open.length ? open.map(l => `<div class="lg-row lg-pubrow"><b>${esc(l.name)}</b><span>${n[l.id] || 0}/16 players</span><div class="lg-bar"><i style="width:${(n[l.id] || 0) / 16 * 100}%"></i></div><button class="btn primary sm" type="button" data-pjoin="${esc(l.id)}">Join</button></div>`).join('')
    : '<p class="note">No public leagues open right now. Start one and tick Public so people can find it.</p>';
  box.querySelectorAll('[data-pjoin]').forEach(b => b.onclick = () => {
    const code = b.dataset.pjoin, used = taken[code] || [];
    C.openPicker('Pick your team', used.includes(C.SET.team) ? TEAMS.findIndex((_, i) => !used.includes(i)) : C.SET.team, -1, async t => {
      if (used.includes(t)) return C.toast('Someone in that league already has that team');
      try { await rpc('ek_league_join', { code, lteam: t }); C.toast('You’re in!'); openLeague(code); } catch (e) { C.toast(errText(e)); }
    });
  });
}

async function openLeague(code) {
  view.code = code;
  const root = $('lg-pane'); if (!root) return;
  let L; try { L = await loadLeague(code); } catch (e) { root.innerHTML = `<p class="note center">${esc(errText(e))}</p>`; return; }
  if (!L) { view.code = null; C.toast('That league is gone'); return renderLeague(); }
  lastRow = L; draw(L);
  startPoll();
}
function startPoll() { stopPoll(); poll = setInterval(tick, 3000); }
function stopPoll() { if (poll) clearInterval(poll); poll = null; }
async function tick() {
  if (C.screen() !== 'league' || !view.code) return stopPoll();
  if (busy) return;
  busy = true;
  try {
    const L = await loadLeague(view.code); if (!L) { stopPoll(); view.code = null; return renderLeague(); }
    if (L.status === 'draft') await nudgeDraft(L);
    const changed = JSON.stringify([L.status, L.season, L.members]) !== JSON.stringify([lastRow && lastRow.status, lastRow && lastRow.season, lastRow && lastRow.members]);
    lastRow = L; if (changed || L.status === 'draft') draw(L);
  } catch (_) {} finally { busy = false; }
}
// bots pick right away; a person who runs out of time gets the best player at a spot they still need
async function nudgeDraft(L) {
  const s = L.season; if (!s || s.phase !== 'draft') return;
  for (let k = 0; k < 20; k++) {
    const p = s.pick, total = 16 * s.rounds; if (p >= total) return;
    const idx = onClock(s), slot = s.slots[idx], late = Date.now() / 1000 > s.dl + 1;
    if (slot.u && !late) return;
    try { await rpc('ek_draft_pick', { code: L.id, cid: null }); } catch (_) { return; }
    const fresh = await loadLeague(L.id); if (!fresh) return; Object.assign(L, fresh); Object.assign(s, fresh.season || {});
    if (!fresh.season || fresh.season.phase !== 'draft') return;
  }
}
const onClock = s => { const rnd = Math.floor(s.pick / 16); return rnd % 2 === 0 ? s.pick % 16 : 15 - (s.pick % 16); };
const mySlot = s => s ? s.slots.findIndex(x => x.u === me().id) : -1;

function draw(L) {
  const root = $('lg-pane'); if (!root) return;
  const s = L.season, owner = L.owner === me().id, slot = mySlot(s);
  const tabs = L.status === 'open' ? [] : L.status === 'draft' ? [['draft', 'Draft'], ['teams', 'Teams']] : [['home', 'Bracket'], ['team', 'My team'], ['trade', 'Trades'], ['teams', 'Teams']];
  if (tabs.length && !tabs.some(t => t[0] === view.tab)) view.tab = tabs[0][0];
  const head = `<div class="lg-head"><div><small>${esc(L.id)} · ${owner ? 'You are the commissioner' : 'League code'}</small><h3>${esc(L.name)}</h3></div><button class="btn sm" id="lg-back" type="button">All leagues</button></div>`;
  const tabBar = tabs.length ? `<div class="ut-tabs" role="tablist">${tabs.map(([k, n]) => `<button class="ut-tab ${view.tab === k ? 'on' : ''}" data-lt="${k}" role="tab" type="button">${n}${k === 'trade' && s && incoming(s, slot).length ? ` <i class="badge">${incoming(s, slot).length}</i>` : ''}</button>`).join('')}</div>` : '';
  let body = '';
  if (L.status === 'open') body = lobbyHTML(L, owner);
  else if (view.tab === 'draft') body = draftHTML(s, slot);
  else if (view.tab === 'teams') body = teamsHTML(s, slot);
  else if (view.tab === 'team') body = myTeamHTML(s, slot);
  else if (view.tab === 'trade') body = tradeHTML(s, slot);
  else body = bracketHTML(s, slot, owner);
  // keep the scroll spot in the draft pool between refreshes
  const pl = root.querySelector('.lg-pool'), sc = pl ? pl.scrollTop : 0;
  root.innerHTML = head + tabBar + body;
  const pl2 = root.querySelector('.lg-pool'); if (pl2) pl2.scrollTop = sc;
  $('lg-back').onclick = () => { stopPoll(); view = { code: null, tab: 'home', filter: 'All', trade: null }; renderLeague(); };
  root.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { view.tab = b.dataset.lt; draw(lastRow); });
  wire(L, s, slot, owner);
}

// ---------- lobby ----------
function lobbyHTML(L, owner) {
  return `<div class="lg-lobby">
    <p class="note">Send your friends the code <b class="lg-code">${esc(L.id)}</b>. ${L.members.length} of 16 spots are taken; bots take the rest when the draft starts.</p>
    <div class="lg-members">${L.members.map(m => `<div class="lg-mem"><img alt="" src="${logo(m.team, 36)}"><b>${esc(m.name)}</b><span>${teamName(m.team)}</span>${m.player === L.owner ? '<small>Commissioner</small>' : ''}</div>`).join('')}
      ${Array.from({ length: 16 - L.members.length }, () => '<div class="lg-mem empty"><span>Open spot (bot if nobody joins)</span></div>').join('')}</div>
    <div class="actions">${owner ? `<button class="btn primary" id="lg-startdraft" type="button">Start the draft</button>` : '<span class="note">Waiting for the commissioner to start the draft</span>'}
      <button class="btn" id="lg-team" type="button">Change my team</button><button class="btn danger" id="lg-leave" type="button">${owner ? 'Delete league' : 'Leave league'}</button></div>
  </div>`;
}
async function startDraft(L) {
  const used = new Set(L.members.map(m => m.team)), free = TEAMS.map((_, i) => i).filter(i => !used.has(i)).sort(() => Math.random() - 0.5);
  const slots = L.members.map(m => ({ u: m.player, t: m.team, n: m.name }));
  while (slots.length < 16) { const t = free.pop(); slots.push({ u: null, t, n: `${teamName(t)} (bot)` }); }
  slots.sort(() => Math.random() - 0.5);   // random draft order
  await rpc('ek_league_start', { code: L.id, s: { slots, pool: buildPool(), rounds: ROUNDS } });
}

// ---------- draft ----------
function draftHTML(s, slot) {
  const idx = onClock(s), left = Math.max(0, Math.ceil(s.dl - Date.now() / 1000)), mineNow = idx === slot, taken = new Set(s.picks.map(p => String(p.c)));
  const need = {}; for (const g of GKEYS) need[g] = GROUPS[g].length - s.picks.filter(p => p.s === slot && p.g === g).length;
  const pool = s.pool.filter(p => !taken.has(String(p.c)) && (view.filter === 'All' || p.g === view.filter));
  const recent = s.picks.slice(-6).reverse();
  return `<div class="lg-draft">
    <div class="lg-clock ${mineNow ? 'me' : ''}"><img alt="" src="${logo(s.slots[idx].t, 44)}"><div><small>Round ${Math.floor(s.pick / 16) + 1} of ${s.rounds}, pick ${s.pick + 1}</small><b>${mineNow ? 'You are on the clock' : `${esc(s.slots[idx].n)} is picking`}</b></div><span class="lg-secs">${s.slots[idx].u ? `${left}s` : ''}</span></div>
    ${slot >= 0 ? (o => `<p class="note lg-myovr">Your team: <b>${o.ovr} OVR</b> (OFF ${o.off} · DEF ${o.def})</p>`)(lgOvr(s, slot)) : ''}
    <div class="lg-recent">${recent.map(p => { const c = card(+p.c); return `<span><img alt="" src="${logo(s.slots[p.s].t, 22)}">${esc(c.first[0])}. ${esc(c.last)} <i>${c.ovr} ${c.group}</i></span>`; }).join('') || '<span class="note">No picks yet</span>'}</div>
    <div class="seg lg-filter">${['All', ...GKEYS].map(g => `<button type="button" data-f="${g}" class="${view.filter === g ? 'on' : ''}">${g}${g !== 'All' && slot >= 0 && need[g] > 0 ? ` <i>${need[g]}</i>` : ''}</button>`).join('')}</div>
    <div class="lg-pool">${pool.map(p => { const c = card(+p.c); return `<div class="lg-pl t-${c.tierKey}"><b class="ovr">${c.ovr}</b><span><b>${esc(c.first)} ${esc(c.last)}</b><small>${c.group} · ${c.tierName}</small></span>${mineNow ? `<button class="btn sm primary" type="button" data-pick="${p.c}">Draft</button>` : ''}</div>`; }).join('')}</div>
    <p class="note">Numbers on the position buttons are starting spots you still need. Run out of time and you get the best player at a spot you need.</p>
  </div>`;
}

// ---------- teams ----------
function rosterList(s, sl) {
  const st = starters(s, sl);
  return s.picks.filter(p => p.s === sl).map(p => card(+p.c)).sort((a, b) => b.ovr - a.ovr).map(c => `<div class="lg-pl t-${c.tierKey}"><b class="ovr">${c.ovr}</b><span><b>${esc(c.first)} ${esc(c.last)}</b><small>${st[c.id] ? `Starts at ${SLOT_LABEL[st[c.id]] || st[c.id]}` : 'Bench'} · ${c.group}</small></span></div>`).join('') || '<p class="note">No players yet</p>';
}
// team overall from the actual starting lineup (drafted players where they fit, the city's roster everywhere else)
const OFF_SL = ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'], DEF_SL = ['DL1', 'DL2', 'DL3', 'DL4', 'LB', 'LB2', 'LB3', 'CB1', 'CB2', 'S', 'SS'];
function lgOvr(s, slot) {
  const P = leagueRoster(s, slot).players, avg = a => Math.round(a.reduce((x, k) => x + ((P[k] && P[k].ovr) || 60), 0) / a.length);
  const off = avg(OFF_SL), def = avg(DEF_SL); return { ovr: Math.round((off + def) / 2), off, def };
}
function teamsHTML(s, slot) {
  return `<div class="lg-teams">${s.slots.map((x, i) => `<details class="lg-tm ${i === slot ? 'me' : ''}"><summary><img alt="" src="${logo(x.t, 30)}"><b>${esc(x.n)}</b><span>${teamName(x.t)}</span><small>${(o => `${o.ovr} OVR (OFF ${o.off} · DEF ${o.def})`)(lgOvr(s, i))} · ${s.picks.filter(p => p.s === i).length} drafted</small></summary>${rosterList(s, i)}</details>`).join('')}</div>`;
}
function myTeamHTML(s, slot) {
  if (slot < 0) return '<p class="note">You are watching this league.</p>';
  const o = lgOvr(s, slot);
  return `<div class="sq-ovr lg-ovr"><div><b>${o.ovr}</b><small>OVR</small></div><div><b>${o.off}</b><small>OFF</small></div><div><b>${o.def}</b><small>DEF</small></div></div><p class="note">Your drafted players start wherever they fit. Every other spot is filled by your ${teamName(s.slots[slot].t)} roster.</p>${rosterList(s, slot)}`;
}

// ---------- bracket ----------
const winnerOf = g => g.hs == null ? -1 : g.hs >= g.as ? g.h : g.a;
function myGame(s, slot) { if (s.phase !== 'bracket' || slot < 0) return null; const gs = s.br[s.r] || []; const gi = gs.findIndex(g => (g.h === slot || g.a === slot) && g.hs == null); return gi < 0 ? null : { gi, g: gs[gi] }; }
function bracketHTML(s, slot, owner) {
  const tm = (i, sc, w) => `<div class="bk-t ${i === slot ? 'me' : ''} ${w === i ? 'won' : w >= 0 ? 'lost' : ''}"><img alt="" src="${logo(s.slots[i].t, 28)}"><span>${esc(s.slots[i].n)}</span><b>${sc == null ? '' : sc}</b></div>`;
  const cols = ROUND_NAMES.map((name, r) => { const gs = s.br[r]; return `<div class="bk-col"><h4>${name}</h4>${gs ? gs.map((g, gi) => `<div class="bk-g">${tm(g.h, g.hs, winnerOf(g))}${tm(g.a, g.as, winnerOf(g))}${g.sim ? '<small>simmed</small>' : ''}${owner && r === s.r && g.hs == null && s.phase === 'bracket' ? `<button class="link" data-force="${gi}" type="button">Sim this game</button>` : ''}</div>`).join('') : '<div class="bk-g pending"><span>Not set yet</span></div>'}</div>`; }).join('');
  const mg = myGame(s, slot);
  let top = '';
  if (s.phase === 'done') top = `<div class="lg-champ"><img alt="" src="${logo(s.slots[s.champ].t, 64)}"><div><small>Kings Bowl champion</small><b>${esc(s.slots[s.champ].n)}</b></div></div>`;
  else if (mg) {
    const opp = mg.g.h === slot ? mg.g.a : mg.g.h, bot = !s.slots[opp].u, home = mg.g.h === slot;
    top = `<div class="lg-next"><div><small>${ROUND_NAMES[s.r]}: your game</small><b>vs ${esc(s.slots[opp].n)}</b><span>${bot ? 'They are a bot. Play it whenever.' : home ? 'You are home: you host. Tell them to hit Join.' : 'They are home: they host. Hit Join once they are waiting.'}</span></div>
      <div class="lg-play-btns"><button class="btn primary" id="lg-play" type="button">${bot ? 'Play game' : home ? 'Host game' : 'Join game'}</button>${bot ? '' : `<button class="btn hidden" id="lg-standin" type="button" data-opp="${esc(s.slots[opp].u)}">They’re offline: play their bot</button>`}</div></div>`;
  } else if (slot >= 0 && s.phase === 'bracket') {
    const out = (s.br || []).some(gs => gs.some(g => (g.h === slot || g.a === slot) && winnerOf(g) >= 0 && winnerOf(g) !== slot));
    top = `<p class="note center">${out ? 'You got knocked out. You can still make trades and watch the rest of the bracket.' : 'Waiting on the rest of this round.'}</p>`;
  }
  return `${top}<div class="bracket lg-bracket">${cols}</div>`;
}

// ---------- trades ----------
const incoming = (s, slot) => (s.trades || []).filter(t => t.st === 'open' && t.t === slot);
function tradeHTML(s, slot) {
  if (slot < 0) return '<p class="note">Only teams in the league can trade.</p>';
  if (s.phase !== 'bracket') return '<p class="note">Trades are closed. The season is over.</p>';
  const T = view.trade || (view.trade = { to: -1, give: [], get: [] });
  const list = (sl, sel, key) => s.picks.filter(p => p.s === sl).map(p => card(+p.c)).sort((a, b) => b.ovr - a.ovr).map(c => `<label class="lg-pl t-${c.tierKey} ${sel.includes(String(c.id)) ? 'on' : ''}"><input type="checkbox" data-${key}="${c.id}" ${sel.includes(String(c.id)) ? 'checked' : ''}><b class="ovr">${c.ovr}</b><span><b>${esc(c.first)} ${esc(c.last)}</b><small>${c.group}</small></span></label>`).join('');
  const nm = i => esc(s.slots[i].n), cn = id => { const c = card(+id); return `${esc(c.last)} (${c.ovr} ${c.group})`; };
  const inc = incoming(s, slot), out = (s.trades || []).filter(t => t.st === 'open' && t.f === slot), past = (s.trades || []).filter(t => t.st === 'done').slice(-6).reverse();
  return `<div class="lg-trade">
    ${inc.length ? `<h4>Offers for you</h4>${inc.map(t => `<div class="lg-offer"><p><b>${nm(t.f)}</b> gives ${t.give.map(cn).join(', ')} for your ${t.get.map(cn).join(', ')}</p><button class="btn sm primary" data-acc="${t.id}" type="button">Accept</button><button class="btn sm" data-dec="${t.id}" type="button">Decline</button></div>`).join('')}` : ''}
    ${out.length ? `<h4>Your offers</h4>${out.map(t => `<div class="lg-offer"><p>To <b>${nm(t.t)}</b>: your ${t.give.map(cn).join(', ')} for ${t.get.map(cn).join(', ')}</p><button class="btn sm" data-dec="${t.id}" type="button">Cancel</button></div>`).join('')}` : ''}
    <h4>Make an offer</h4>
    <select id="lg-tto"><option value="-1">Pick a team</option>${s.slots.map((x, i) => i === slot ? '' : `<option value="${i}" ${T.to === i ? 'selected' : ''}>${esc(x.n)}${x.u ? '' : ' (bot)'}</option>`).join('')}</select>
    ${T.to >= 0 ? `<div class="lg-tcols"><div><h5>You give (1 to 3)</h5>${list(slot, T.give, 'give')}</div><div><h5>You get (1 to 3)</h5>${list(T.to, T.get, 'get')}</div></div>
      <div class="actions"><button class="btn primary" id="lg-send" type="button" ${T.give.length && T.get.length ? '' : 'disabled'}>Send offer</button></div>
      ${s.slots[T.to].u ? '' : '<p class="note">Bots take a deal only when they get a little more overall than they give.</p>'}` : ''}
    ${past.length ? `<h4>Recent trades</h4>${past.map(t => `<p class="note">${nm(t.f)} sent ${t.give.map(cn).join(', ')} to ${nm(t.t)} for ${t.get.map(cn).join(', ')}</p>`).join('')}` : ''}
  </div>`;
}

// ---------- buttons ----------
function wire(L, s, slot, owner) {
  const q = sel => document.querySelectorAll('#lg-pane ' + sel);
  const act = async (fn, ok) => { try { const r = await fn(); if (ok) ok(r); } catch (e) { C.toast(errText(e)); } const f = await loadLeague(L.id).catch(() => null); if (f) { lastRow = f; draw(f); } };
  const b = id => $(id);
  if (b('lg-startdraft')) b('lg-startdraft').onclick = () => act(() => startDraft(L), () => { view.tab = 'draft'; C.toast('The draft is on'); });
  if (b('lg-leave')) b('lg-leave').onclick = async () => { if (!(await askYes(owner ? 'Delete this league for everyone?' : 'Leave this league?', owner ? 'Delete' : 'Leave'))) return; try { await rpc('ek_league_leave', { code: L.id }); stopPoll(); view.code = null; renderLeague(); } catch (e) { C.toast(errText(e)); } };
  if (b('lg-team')) b('lg-team').onclick = () => C.openPicker('Pick your team', (L.members.find(m => m.player === me().id) || {}).team ?? C.SET.team, -1, t => act(() => rpc('ek_league_join', { code: L.id, lteam: t })));
  q('[data-f]').forEach(x => x.onclick = () => { view.filter = x.dataset.f; draw(lastRow); });
  q('[data-pick]').forEach(x => x.onclick = () => { x.disabled = true; act(() => rpc('ek_draft_pick', { code: L.id, cid: +x.dataset.pick })); });
  q('[data-force]').forEach(x => x.onclick = () => act(() => rpc('ek_lg_force', { code: L.id, gi: +x.dataset.force })));
  q('[data-acc]').forEach(x => x.onclick = () => act(() => rpc('ek_lg_trade_answer', { code: L.id, tid: x.dataset.acc, yes: true }), () => C.toast('Trade done')));
  q('[data-dec]').forEach(x => x.onclick = () => act(() => rpc('ek_lg_trade_answer', { code: L.id, tid: x.dataset.dec, yes: false })));
  const T = view.trade;
  if (b('lg-tto')) b('lg-tto').onchange = e => { view.trade = { to: +e.target.value, give: [], get: [] }; draw(lastRow); };
  const tog = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0 && arr.length < 3) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };
  q('[data-give]').forEach(x => x.onchange = () => { tog(T.give, x.dataset.give, x.checked); draw(lastRow); });
  q('[data-get]').forEach(x => x.onchange = () => { tog(T.get, x.dataset.get, x.checked); draw(lastRow); });
  if (b('lg-send')) b('lg-send').onclick = () => act(() => rpc('ek_lg_trade', { code: L.id, tslot: T.to, give: T.give, gett: T.get }), r => { C.toast(r === 'accepted' ? 'They took it. Trade done.' : r === 'declined' ? 'They said no. Offer them a little more.' : 'Offer sent'); if (r !== 'declined') view.trade = null; });
  if (b('lg-play')) b('lg-play').onclick = () => playGame(L, s, slot);
  // opponent not around? their team still plays: a bot with their exact roster and a game plan built from it
  const si = b('lg-standin');
  if (si && db()) db().from('ek_players').select('last_seen').eq('id', si.dataset.opp).maybeSingle().then(({ data }) => {
    const off = !data || !data.last_seen || Date.now() - new Date(data.last_seen).getTime() > 150000;
    if (off && document.body.contains(si)) { si.classList.remove('hidden'); si.onclick = () => playGame(L, s, slot, true); }
  }, () => {});
}

// ---------- playing a bracket game ----------
function roomFor(code, r, gi) { let h = 2166136261; for (const ch of `${code}:${r}:${gi}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return ('L' + h.toString(36).toUpperCase() + 'XXXXXXX').slice(0, 8); }
function playGame(L, s, slot, standIn) {
  const mg = myGame(s, slot); if (!mg) return;
  const opp = mg.g.h === slot ? mg.g.a : mg.g.h, home = mg.g.h === slot;
  const info = { code: L.id, r: s.r, gi: mg.gi, slot, home, opp, oppName: s.slots[opp].n, team: s.slots[slot].t, roster: leagueRoster(s, slot), sent: false };
  C.st.league = info;
  stopPoll();
  if (!s.slots[opp].u) C.startCPU({ teams: [s.slots[slot].t, s.slots[opp].t], rosters: [info.roster, leagueRoster(s, opp)], league: info });
  else if (standIn) { const r2 = leagueRoster(s, opp); C.startCPU({ teams: [s.slots[slot].t, s.slots[opp].t], rosters: [info.roster, r2], styles: [null, rosterStyle(r2)], diff: 2, teamNames: [null, `${s.slots[opp].n} (bot)`], league: info }); }   // stand-in: All-Pro bot, their roster, their game plan
  else if (home) C.hostGame(roomFor(L.id, s.r, mg.gi));
  else C.joinGame(roomFor(L.id, s.r, mg.gi));
}
// online games: your league team and drafted roster go in instead of whatever's picked on the online screen
export function onlineOverride() {
  const lg = C.st.league; if (!lg) return null;
  return { team: lg.team, roster: lg.roster, squad: null };
}
// the game ended: report the score to the bracket (either player can; the first report counts)
export async function reportResult(S, quit) {
  const lg = C.st.league; if (!lg || lg.sent || !S || S.mode !== 'game') return;
  const st = C.st, meI = st.local;
  if (st.mode !== 'cpu') { const a = String(st.names[1 - meI] || '').toLowerCase().slice(0, 16), b = String(lg.oppName || '').toLowerCase().slice(0, 16); if (a !== b) { st.league = null; return; } }   // that wasn't your league opponent
  lg.sent = true;
  let mine = S.sc[meI], theirs = S.sc[1 - meI];
  if (quit) theirs = Math.max(theirs, mine + 1);
  const hs = lg.home ? mine : theirs, aws = lg.home ? theirs : mine;
  try { await rpc('ek_lg_report', { code: lg.code, rr: lg.r, gi: lg.gi, hs, aws }); C.toast(quit ? 'League game counted as a loss' : `League result saved: ${mine}-${theirs}`, 3500); }
  catch (e) { C.toast('League result: ' + errText(e), 4000); }
  st.league = null;
}
export function leftLeagueScreen() { if (C.st.league && !C.st.playing) C.st.league = null; }
