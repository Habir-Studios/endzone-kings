// ENDZONE KINGS — community: global leaderboards (live), public profiles, follows, direct messages and clips.
// Needs real accounts (Supabase). Tables are set up by supabase/social.sql.
import { askYes } from './ui.js';
import { TEAMS } from './teams.js';

let C = null;
const fmt = n => Math.round(+n || 0).toLocaleString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const db = () => (C.Auth.mode === 'supabase' && C.Auth.client ? C.Auth.client : null);
const me = () => (C.Auth.user && C.Auth.user.kind === 'account' ? C.Auth.user : null);
const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };

// ---------------- leaderboard categories ----------------
export const BOARDS = {
  Overall: [['wins', 'Wins'], ['rp', 'Rank points'], ['lvl', 'Level'], ['games', 'Games played']],
  Offense: [['pass_yds', 'Passing yards'], ['pass_td', 'Passing TDs'], ['rush_yds', 'Rushing yards'], ['rush_td', 'Rushing TDs'], ['rec_yds', 'Receiving yards'], ['rec', 'Receptions'], ['rec_td', 'Receiving TDs']],
  Defense: [['tackles', 'Tackles'], ['sacks', 'Sacks'], ['ints', 'Interceptions']],
  'Special teams': [['fgm', 'Field goals made'], ['fg_long', 'Longest field goal'], ['xpm', 'Extra points'], ['punt_yds', 'Punting yards']],
  'Ultimate Team': [['ut_wins', 'UT wins'], ['ut_games', 'UT games'], ['ut_tds', 'UT touchdowns'], ['ut_pts', 'UT points scored']],
};
const ALL_COLS = Object.values(BOARDS).flat().map(c => c[0]);
const colName = k => (Object.values(BOARDS).flat().find(c => c[0] === k) || [k, k])[1];

// ---------------- setup ----------------
export function initSocial(ctx) {
  C = ctx;
  const { $, $$ } = C;
  $$('.so-tab').forEach(b => b.addEventListener('click', () => { C.sfx.play('ui'); view = { tab: b.dataset.so }; renderSocial(); }));
  $('#so-search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(doSearch, 300); });
  $('#clip-close').addEventListener('click', closeClip);
  $('#clip-again').addEventListener('click', () => { if (C.st.replay) { C.st.replay.t = 0; C.st.replay.i = 0; } else if (lastClip) playFrames(lastClip.frames, lastClip.meta); });
  setInterval(tick, 1000);
}

// one heartbeat: refresh whatever leaderboard is on screen, every second
let boardCat = 'wins', menuCat = 0, menuSpin = 0, boardRows = [], ticking = false;
async function tick() {
  if (ticking || !db()) return;
  const scr = C.screen();
  ticking = true;
  try {
    if (scr === 'menu') { await renderMenuBoard(); if (playerCountT++ % 30 === 0) refreshPlayerCount(); }
    else if (scr === 'social' && view.tab === 'boards') await loadBoard(boardCat, true);
    if (me()) { ensureProfile(); listenInvites(); if (++kickPollT % 5 === 0 && C.st.playing) pollKicks(); }
    if (me() && (++unreadT % 10 === 0)) { refreshUnread(); refreshRequests(); loadNotifs(); }
  } catch (_) {} finally { ticking = false; }
}

// ---------------- player count (every account counts, active or not) ----------------
let playerCountT = 0;
async function refreshPlayerCount() {
  const el = C.$('#player-count'); if (!el || !db()) return;
  const { count, error } = await db().from('ek_players').select('id', { count: 'exact', head: true });
  if (error || count == null) return;
  C.$('#pc-total').textContent = count.toLocaleString(); el.classList.remove('hidden');
}

// ---------------- main menu mini board ----------------
const MENU_CATS = ['wins', 'pass_yds', 'rush_yds', 'rec_yds', 'tackles', 'sacks', 'ints', 'fgm'];
export async function renderMenuBoard() {
  const el = C.$('#menu-board'); if (!el) return;
  if (!db()) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  if (++menuSpin % 6 === 0) menuCat = (menuCat + 1) % MENU_CATS.length;   // rotate category every 6 seconds
  const col = MENU_CATS[menuCat];
  const { data, error } = await db().from('ek_players').select(`id,name,team,${col}`).eq('banned', false).order(col, { ascending: false }).limit(5);
  if (error) { C.$('#mb-list').innerHTML = `<li class="mb-empty">Leaderboard is offline right now</li>`; return; }
  C.$('#mb-cat').textContent = colName(col);
  C.$('#mb-list').innerHTML = (data || []).map((r, i) => `<li data-pid="${esc(r.id)}"><span class="mb-n">${i + 1}</span><img alt="" src="${C.logoURL(r.team ?? 0, 32)}"><b>${esc(r.name)}</b><em>${fmt(r[col])}</em></li>`).join('') || '<li class="mb-empty">No one yet. Play a game to get on the board.</li>';
  C.$$('#mb-list [data-pid]').forEach(li => li.onclick = () => { C.show('social'); openProfile(li.dataset.pid); });
}

// ---------------- social screen ----------------
let view = { tab: 'boards' }, searchT = null, unreadT = 0;
export function renderSocial() {
  const { $, $$ } = C;
  const pane = $('#so-pane');
  $$('.so-tab').forEach(b => b.classList.toggle('on', b.dataset.so === view.tab));
  if (view.tab === 'film') return renderFilm();
  if (!db()) { pane.innerHTML = '<p class="note">The community needs online accounts. Add your Supabase keys in js/config.js.</p>'; return; }
  if (!me() && view.tab !== 'boards' && view.tab !== 'clips' && view.tab !== 'player') { pane.innerHTML = '<p class="note">Sign in with a real account to follow players, message them and post clips.</p>'; return; }
  if (view.tab === 'boards') return renderBoards();
  if (view.tab === 'clips') return renderFeed();
  if (view.tab === 'msgs') return renderInbox();
  if (view.tab === 'friends') return renderFriends();
  if (view.tab === 'crews') return renderCrews();
  if (view.tab === 'me') return openProfile(me().id);
  if (view.tab === 'player') return openProfile(view.id);
  if (view.tab === 'thread') return openThread(view.id, view.name);
}

// ---------- leaderboards ----------
function renderBoards() {
  const pane = C.$('#so-pane');
  pane.innerHTML = `<div class="lb-cats">${Object.entries(BOARDS).map(([g, cols]) => `<div class="lb-group"><small>${g}</small><div class="seg">${cols.map(([k, n]) => `<button type="button" data-col="${k}" class="${k === boardCat ? 'on' : ''}">${n}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="lb-head"><h3 id="lb-title">${colName(boardCat)}</h3><span class="note"><span class="live-dot"></span>Live, updates every second. Online 1v1, Ultimate Team and Franchise games count.</span></div>
    <ol class="lb-list" id="lb-list"><li class="mb-empty">Loading…</li></ol>`;
  C.$$('[data-col]', pane).forEach(b => b.onclick = () => { boardCat = b.dataset.col; C.sfx.play('ui'); renderBoards(); });
  loadBoard(boardCat, false);
}
async function loadBoard(col, quiet) {
  const el = C.$('#lb-list'); if (!el || !ALL_COLS.includes(col)) return;
  const { data, error } = await db().from('ek_players').select(`id,name,team,lvl,games,${col}`).eq('banned', false).order(col, { ascending: false }).order('games', { ascending: true }).limit(50);
  if (error) { if (!quiet) el.innerHTML = '<li class="mb-empty">Couldn’t load the leaderboard</li>'; return; }
  const key = JSON.stringify((data || []).map(r => [r.id, r[col]]));
  if (quiet && key === boardRows.key) return;
  boardRows = data || []; boardRows.key = key;
  const mine = me() ? me().id : '';
  el.innerHTML = boardRows.map((r, i) => `<li class="${r.id === mine ? 'me' : ''}" data-pid="${esc(r.id)}"><span class="lb-n">${i + 1}</span><img alt="" src="${C.logoURL(r.team ?? 0, 40)}"><div><b>${esc(r.name)}</b><small>Level ${r.lvl}, ${fmt(r.games)} games</small></div><em>${fmt(r[col])}</em></li>`).join('') || '<li class="mb-empty">Nobody on this board yet. Finish an online 1v1, Ultimate Team or Franchise game to get on it.</li>';
  C.$$('[data-pid]', el).forEach(li => li.onclick = () => openProfile(li.dataset.pid));
}

// ---------- search ----------
async function doSearch() {
  const q = (C.$('#so-search').value || '').trim().replace(/[%_,()]/g, '');
  const box = C.$('#so-results');
  if (q.length < 2 || !db()) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  const { data } = await db().from('ek_players').select('id,name,team,lvl').ilike('name', `%${q}%`).limit(8);
  box.classList.remove('hidden');
  box.innerHTML = (data || []).map(r => `<button type="button" data-pid="${esc(r.id)}"><img alt="" src="${C.logoURL(r.team ?? 0, 32)}">${esc(r.name)}<small>Lv ${r.lvl}</small></button>`).join('') || '<p class="note">No players found</p>';
  C.$$('[data-pid]', box).forEach(b => b.onclick = () => { box.classList.add('hidden'); C.$('#so-search').value = ''; openProfile(b.dataset.pid); });
}

// ---------- profiles ----------
async function openProfile(id) {
  view = { tab: id === (me() && me().id) ? 'me' : 'player', id };
  C.$$('.so-tab').forEach(b => b.classList.toggle('on', b.dataset.so === view.tab));
  const pane = C.$('#so-pane'); pane.innerHTML = '<p class="note">Loading…</p>';
  const D = db();
  const [{ data: p }, { count: followers }, { count: following }, { data: clips }, iFollow] = await Promise.all([
    D.from('ek_players').select('*').eq('id', id).maybeSingle(),
    D.from('ek_follows').select('*', { count: 'exact', head: true }).eq('followee', id),
    D.from('ek_follows').select('*', { count: 'exact', head: true }).eq('follower', id),
    D.from('ek_clips').select('id,title,teams,secs,views,created_at,vs').eq('owner', id).order('created_at', { ascending: false }).limit(30),
    me() && me().id !== id ? D.from('ek_follows').select('follower').eq('follower', me().id).eq('followee', id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!p) { if (id === (me() && me().id)) { profileMade = false; await ensureProfile(); return openProfile(id); } pane.innerHTML = '<p class="note">That player doesn’t exist.</p>'; return; }
  const mine = me() && me().id === id, fol = !!(iFollow && iFollow.data), t = TEAMS[p.team] || TEAMS[0];
  let theyFollow = false;
  if (me() && !mine) { const { data: tf } = await D.from('ek_follows').select('follower').eq('follower', id).eq('followee', me().id).maybeSingle(); theyFollow = !!tf; }
  const stat = (n, v) => `<div><b>${v}</b><small>${n}</small></div>`;
  const fgPct = p.fga ? Math.round(p.fgm / p.fga * 100) + '%' : '-';
  pane.innerHTML = `<div class="pf-head" style="--c:${t.jersey};--c2:${t.trim}">
      <img class="pf-logo" alt="" src="${C.logoURL(p.team, 112)}">
      <div class="pf-id"><h3>${esc(p.name)}</h3><small>Level ${p.lvl}, ${t.city} fan</small>
        <div class="pf-recs">${[['Overall', p.wins, p.losses, 0], ['Online 1v1', p.on_w, p.on_l, p.on_t], ['Ultimate Team', p.ut_wins, p.ut_l, p.ut_t]].map(([n, w, l, tt]) => `<span class="rec-card"><small>${n}</small><span class="rec-nums"><i><b>${fmt(w || 0)}</b><em>W</em></i><i class="dash"><b>-</b><em>-</em></i><i><b>${fmt(l || 0)}</b><em>L</em></i>${tt ? `<i class="dash"><b>-</b><em>-</em></i><i><b>${fmt(tt)}</b><em>T</em></i>` : ''}</span></span>`).join('')}</div>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
        <div class="pf-follow"><span><b>${fmt(followers)}</b> followers</span><span><b>${fmt(following)}</b> following</span>${theyFollow && fol ? '<span class="ad-tag st-open">Friends</span>' : ''}${(() => { const P = !mine && C.profile && C.profile(); const h = P && P.p.h2h && P.p.h2h[String(p.name).toLowerCase().slice(0, 24)]; return h ? `<span class="h2h">You vs ${esc(p.name)}: <b>${h[0]}W-${h[1]}L${h[2] ? '-' + h[2] + 'T' : ''}</b></span>` : ''; })()}</div></div>
      <div class="pf-acts">${mine ? '<button class="btn" id="pf-edit">Edit profile</button>' : me() ? `<button class="btn ${fol ? '' : 'primary'}" id="pf-follow">${fol ? (theyFollow ? 'Friends ✓' : 'Request sent') : theyFollow ? 'Accept friend request' : 'Add friend'}</button><button class="btn primary" id="pf-challenge">Challenge to 1v1</button><button class="btn" id="pf-trade">Trade</button><button class="btn" id="pf-msg">Message</button><button class="btn ghost sm" id="pf-report">Report</button>` : ''}${p.banned ? '<span class="ad-tag st-banned">Banned</span>' : ''}</div>
    </div>
    <div id="pf-live" class="pf-live ${mine ? 'hidden' : 'checking'}">${mine ? '' : '<span class="live-dot idle"></span><div><b>Checking if they’re in a game…</b><small>If they are, you can watch it live</small></div>'}</div>
    <div class="pf-stats">
      <div class="pf-grp"><h4>Offense</h4><div class="pf-row">${stat('Pass yds', fmt(p.pass_yds))}${stat('Pass TD', fmt(p.pass_td))}${stat('Rush yds', fmt(p.rush_yds))}${stat('Rush TD', fmt(p.rush_td))}${stat('Rec yds', fmt(p.rec_yds))}${stat('Catches', fmt(p.rec))}${stat('Rec TD', fmt(p.rec_td))}</div></div>
      <div class="pf-grp"><h4>Defense</h4><div class="pf-row">${stat('Tackles', fmt(p.tackles))}${stat('Sacks', fmt(p.sacks))}${stat('INTs', fmt(p.ints))}</div></div>
      <div class="pf-grp"><h4>Special teams</h4><div class="pf-row">${stat('FG made', `${fmt(p.fgm)}/${fmt(p.fga)}`)}${stat('FG %', fgPct)}${stat('Long FG', p.fg_long || '-')}${stat('XP', fmt(p.xpm))}${stat('Punt avg', p.punts ? (p.punt_yds / p.punts).toFixed(1) : '-')}</div></div>
    </div>
    <h3 class="store-h">Clips ${clips && clips.length ? `<span class="note">${clips.length}</span>` : ''}</h3>
    <div class="clip-grid">${clipCards(clips || [], mine || isAdmin(), p.name)}</div>`;
  if (mine) C.$('#pf-edit').onclick = () => editProfile(p);
  const fb = C.$('#pf-follow');
  if (fb) fb.onclick = async () => {
    fb.disabled = true;
    const r = fol ? await D.from('ek_follows').delete().eq('follower', me().id).eq('followee', id) : await D.from('ek_follows').insert({ follower: me().id, followee: id });
    if (r.error) C.toast(r.error.message); else { C.sfx.play('ui'); if (!fol) C.toast(theyFollow ? `You and ${p.name} are friends now` : `Friend request sent to ${p.name}`); }
    openProfile(id);
  };
  const cb = C.$('#pf-challenge'); if (cb) cb.onclick = () => challenge(id, p.name);
  const mb = C.$('#pf-msg'); if (mb) mb.onclick = () => openThread(id, p.name);
  const tb = C.$('#pf-trade'); if (tb) tb.onclick = () => C.openTrade && C.openTrade(id, p.name);
  wireReport(id, p.name);
  wireClipCards(pane, id);
  // playing right now? show what kind of game and let people watch it
  // live = their player row says they're in a game (refreshed every 40s), or their game channel answers
  const liveRow = l => l && l.at && Date.now() - new Date(l.at).getTime() < 100000 ? l : null;
  const check = async () => {
    if (view.id !== id || !C.$('#pf-live')) return;
    let info = liveRow(p.live);
    const { data: fresh } = await D.from('ek_players').select('live').eq('id', id).maybeSingle(); if (fresh) info = liveRow(fresh.live) || null;
    if (!info && C.peekLive) info = await C.peekLive(id);
    show(info);
    clearTimeout(liveT); liveT = setTimeout(check, 10000);   // keep checking while the profile is open
  };
  const show = info => {
    const box = C.$('#pf-live'); if (!box || view.id !== id) return;
    box.classList.remove('checking', 'idle');
    if (!info) { box.innerHTML = `<span class="live-dot idle"></span><div><b>Not in a game right now</b><small>When ${esc(p.name)} is playing, a Watch button shows up here</small></div>`; box.classList.add('idle'); return; }
    box.innerHTML = `<span class="live-dot"></span><div><b>Live now · ${esc(info.kind || 'Game')}</b><small>${esc(p.name)} vs ${esc(info.vs || 'CPU')}</small></div><button class="btn primary" id="pf-watch" type="button">Watch</button>`;
    box.classList.remove('hidden');
    C.$('#pf-watch').onclick = () => { clearTimeout(liveT); C.watchUser(id); };
  };
  if (!mine) check();
}
let liveT = 0;
function editProfile(p) {
  const pane = C.$('#so-pane');
  pane.innerHTML = `<div class="form"><h3>Edit profile</h3>
    <label>Bio<input id="pf-bio" maxlength="160" value="${esc(p.bio)}" placeholder="Say something about yourself"></label>
    <label>Favorite team<div class="team-grid" id="pf-team"></div></label>
    <div class="actions"><button class="btn" id="pf-cancel">Cancel</button><button class="btn primary" id="pf-save">Save</button></div></div>`;
  let team = p.team;
  C.fillGrid(C.$('#pf-team'), team, -1, ti => { team = ti; });
  C.$('#pf-cancel').onclick = () => openProfile(p.id);
  C.$('#pf-save').onclick = async () => {
    const bio = C.cleanText(C.$('#pf-bio').value || '').slice(0, 160);
    const { error } = await db().from('ek_players').update({ bio, team, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) C.toast(error.message); else C.toast('Profile saved');
    openProfile(p.id);
  };
}

// ---------- clips ----------
function clipCards(list, mine, owner) {
  if (!list.length) return `<p class="note">${mine ? 'No clips yet. Pause during a game or open the game summary and hit “Clip last play”.' : 'No clips yet.'}</p>`;
  return list.map(c => { const a = TEAMS[(c.teams || [])[0]] || TEAMS[0], b = TEAMS[(c.teams || [])[1]] || TEAMS[1];
    return `<div class="clip" data-clip="${c.id}" style="--c:${a.jersey};--c2:${b.jersey}"><button class="clip-play" type="button" aria-label="Play clip"><span>▶</span></button>
      <div class="clip-txt"><b>${esc(c.title)}</b><small>${owner ? esc(owner) + ', ' : c.owner_name ? esc(c.owner_name) + ', ' : ''}${a.abbr} vs ${b.abbr}${c.vs ? `, against ${esc(c.vs)}` : ''}, ${fmt(c.views)} views, ${ago(c.created_at)}</small></div>
      <button class="btn sm ghost" data-like="${c.id}" type="button">♥ <span class="clip-like-n">0</span></button>${mine ? `<button class="btn sm ghost" data-del="${c.id}">Delete</button>` : ''}</div>`; }).join('');
}
async function toggleLike(id) {
  if (!db() || !me()) { C.toast('Sign in to like clips'); return null; }
  const { data } = await db().from('ek_clip_likes').select('clip_id').eq('clip_id', id).eq('user_id', me().id).maybeSingle();
  if (data) { await db().from('ek_clip_likes').delete().eq('clip_id', id).eq('user_id', me().id); return false; }
  const { error } = await db().from('ek_clip_likes').insert({ clip_id: id, user_id: me().id });
  if (error) { C.toast(error.message); return null; }
  C.sfx.play('ui'); return true;
}
async function paintLikes(root) {
  const btns = C.$$('[data-like]', root); if (!btns.length || !db()) return;
  const ids = btns.map(b => +b.dataset.like);
  const { data } = await db().from('ek_clip_likes').select('clip_id,user_id').in('clip_id', ids).limit(2000);
  const cnt = {}, mineL = new Set();
  for (const r of data || []) { cnt[r.clip_id] = (cnt[r.clip_id] || 0) + 1; if (me() && r.user_id === me().id) mineL.add(r.clip_id); }
  for (const b of btns) { const id = +b.dataset.like; b.querySelector('.clip-like-n').textContent = cnt[id] || 0; b.classList.toggle('on', mineL.has(id)); }
}
function wireClipCards(root) {
  C.$$('.clip-play', root).forEach(b => b.onclick = () => watchClip(+b.closest('.clip').dataset.clip));
  C.$$('[data-like]', root).forEach(b => b.onclick = async () => { const r = await toggleLike(+b.dataset.like); if (r !== null) paintLikes(root); });
  paintLikes(root);
  C.$$('[data-del]', root).forEach(b => b.onclick = async () => {
    if (!(await askYes('Delete this clip? This can’t be undone.', 'Delete'))) return;
    const { data, error } = await db().from('ek_clips').delete().eq('id', +b.dataset.del).select('id');
    if (error) C.toast('Couldn’t delete: ' + error.message); else if (!data || !data.length) C.toast('Couldn’t delete that clip. Is it yours?'); else { C.toast('Clip deleted'); renderSocial(); }
  });
}
async function renderFeed() {
  const pane = C.$('#so-pane'); pane.innerHTML = '<p class="note">Loading clips…</p>';
  const D = db();
  let ids = null;
  if (me()) { const { data } = await D.from('ek_follows').select('followee').eq('follower', me().id).limit(500); ids = (data || []).map(r => r.followee); }
  const fetch = async (q) => { const { data } = await q.order('created_at', { ascending: false }).limit(24); return data || []; };
  const base = () => D.from('ek_clips').select('id,owner,title,teams,secs,views,created_at,vs');
  const [mine, recent, top] = await Promise.all([ids && ids.length ? fetch(base().in('owner', ids)) : [], fetch(base()), D.from('ek_clips').select('id,owner,title,teams,secs,views,created_at,vs').order('views', { ascending: false }).limit(12).then(r => r.data || [])]);
  const owners = [...new Set([...mine, ...recent, ...top].map(c => c.owner))];
  const names = {};
  if (owners.length) { const { data } = await D.from('ek_players').select('id,name').in('id', owners); for (const r of data || []) names[r.id] = r.name; }
  for (const c of [...mine, ...recent, ...top]) c.owner_name = names[c.owner] || 'Player';
  pane.innerHTML = `${me() ? `<h3 class="store-h">From people you follow</h3><div class="clip-grid">${mine.length ? clipCards(mine, false) : '<p class="note">Follow players from the leaderboard to see their clips here.</p>'}</div>` : ''}
    <h3 class="store-h">Most watched</h3><div class="clip-grid">${clipCards(top, false)}</div>
    <h3 class="store-h">Newest</h3><div class="clip-grid">${clipCards(recent, false)}</div>`;
  wireClipCards(pane);
}

// pack the last play into a compact, gzipped string
async function packFrames(frames) {
  const slim = frames.map(f => { const { ps, hls, ...s } = f.s; return { dt: +f.dt.toFixed(3), s }; });
  const json = JSON.stringify(slim);
  if (typeof CompressionStream === 'undefined') return 'j:' + json;
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return 'g:' + btoa(bin);
}
async function unpackFrames(data) {
  if (data.startsWith('j:')) return JSON.parse(data.slice(2));
  const bin = atob(data.slice(2)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(txt);
}
// ---------------- Film Room: every game you play keeps a condensed replay of its biggest plays (saved on this device) ----------------
const FILM_DB = 'ek-film', FILM_MAX = 6, FILM_PLAYS = 14;
function filmDb() { return new Promise((res, rej) => { const r = indexedDB.open(FILM_DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('games', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function filmTx(mode, fn) { const d = await filmDb(); return new Promise((res, rej) => { const t = d.transaction('games', mode), st = t.objectStore('games'), out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); }
const playScore = s => { const t = (s.msg && s.msg.text) || '', sub = (s.msg && s.msg.sub) || '', y = +((sub.match(/([+-]?\d+) ?y/) || [])[1] || 0), f = (s.flash && s.flash.text) || '';
  return /TOUCHDOWN/.test(t) ? 10 : /INTERCEPT|FUMBLE/.test(t + f) ? 8 : /SAFETY|ONSIDE|2-POINT GOOD/.test(t + f) ? 7 : /IT.S GOOD/.test(t) ? 5 : /SACK/.test(t) ? 4 : /RETURN/.test(t) && y >= 20 ? 5 : Math.max(0, y - 12) / 3; };
// called when a play is fully over (the dead ball ended); keeps the best plays of the game
export function filmCapture(rec, deadSnap) {
  const st = C.st; if (!deadSnap || !rec) return; const sc = playScore(deadSnap); if (sc < 2) return;
  const frames = lastPlayFrames(rec); if (!frames) return;
  const thin = []; let acc = 0; frames.forEach((f, i) => { acc += f.dt; if (i % 2 === 0 || i === frames.length - 1) { thin.push({ dt: acc, s: f.s }); acc = 0; } });   // ~15 fps keeps it small
  st.film = (st.film || []).concat({ sc, q: deadSnap.q, frames: thin }).sort((a, b) => b.sc - a.sc).slice(0, FILM_PLAYS);
}
export async function filmSave(S, title) {
  const st = C.st; const plays = (st.film || []).slice().sort((a, b) => (a.frames[0].s.id || 0) - (b.frames[0].s.id || 0)); st.film = [];
  if (!plays.length || typeof indexedDB === 'undefined') return;
  try {
    const packed = []; for (const p of plays) packed.push(await packFrames(p.frames));
    const g = { id: Date.now(), at: new Date().toISOString(), title, plays: packed, n: packed.length };
    await filmTx('readwrite', s => s.put(g));
    const all = await filmTx('readonly', s => s.getAll()); const old = (all || []).sort((a, b) => b.id - a.id).slice(FILM_MAX);
    if (old.length) await filmTx('readwrite', s => { for (const o of old) s.delete(o.id); });
  } catch (e) { console.warn('film save failed', e); }
}
async function renderFilm() {
  const pane = C.$('#so-pane'); pane.innerHTML = '<p class="note">Loading your game film…</p>';
  let games = []; try { games = ((await filmTx('readonly', s => s.getAll())) || []).sort((a, b) => b.id - a.id); } catch (_) {}
  pane.innerHTML = `<h3 class="store-h">Film Room</h3><p class="note">Your last ${FILM_MAX} games, cut down to every big play (touchdowns, picks, sacks, long gains). Saved on this device.</p>
    <div class="film-list">${games.map(g => `<div class="film-row"><div><b>${esc(g.title)}</b><small>${g.n} plays · ${ago(g.at)}</small></div><button class="btn primary sm" data-film="${g.id}" type="button">Watch</button><button class="btn sm" data-filmdel="${g.id}" type="button">Delete</button></div>`).join('') || '<p class="note">Play a game and its big plays show up here.</p>'}</div>`;
  C.$$('[data-film]', pane).forEach(b => b.onclick = async () => { const g = games.find(x => x.id === +b.dataset.film); if (!g) return; b.disabled = true; b.textContent = 'Loading…';
    const all = []; for (const d of g.plays) { try { all.push(...await unpackFrames(d)); } catch (_) {} } if (all.length) C.playClip(all); else { C.toast('That film is damaged'); b.disabled = false; b.textContent = 'Watch'; } });
  C.$$('[data-filmdel]', pane).forEach(b => b.onclick = async () => { await filmTx('readwrite', s => s.delete(+b.dataset.filmdel)); renderFilm(); });
}
// ---------------- crews ----------------
async function renderCrews() {
  const pane = C.$('#so-pane'), D = db(), uid = me().id; pane.innerHTML = '<p class="note">Loading crews…</p>';
  const [{ data: crews, error }, { data: mems }] = await Promise.all([D.from('ek_crews').select('*'), D.from('ek_crew_members').select('player,crew')]);
  if (error) { pane.innerHTML = '<p class="note">Crews aren\u2019t set up on the server yet.</p>'; return; }
  const ids = [...new Set((mems || []).map(m => m.player))];
  const { data: ps } = ids.length ? await D.from('ek_players').select('id,name,on_w,on_l,ut_wins,ut_l,team').in('id', ids) : { data: [] };
  const P = Object.fromEntries((ps || []).map(p => [p.id, p])), mine = (mems || []).find(m => m.player === uid);
  const rows = (crews || []).map(c => { const ms = (mems || []).filter(m => m.crew === c.id).map(m => P[m.player]).filter(Boolean); const w = ms.reduce((a, p) => a + (p.on_w || 0) + (p.ut_wins || 0), 0), l = ms.reduce((a, p) => a + (p.on_l || 0) + (p.ut_l || 0), 0); return { c, ms, w, l }; }).sort((a, b) => b.w - a.w || a.l - b.l);
  const myRow = mine && rows.find(r => r.c.id === mine.crew);
  pane.innerHTML = `${myRow ? `<div class="crew-mine"><div><small>Your crew</small><h3>[${esc(myRow.c.tag)}] ${esc(myRow.c.name)}</h3><span>${myRow.w}W-${myRow.l}L combined · ${myRow.ms.length}/20 members · invite code <b>${esc(myRow.c.id)}</b></span></div><button class="btn sm danger" id="crew-leave" type="button">${myRow.c.owner === uid ? 'Disband crew' : 'Leave crew'}</button></div>
      <div class="crew-members">${myRow.ms.map(p => `<button class="crew-m" data-pid="${esc(p.id)}" type="button"><img alt="" src="${C.logoURL(p.team ?? 0, 32)}">${esc(p.name)}<small>${(p.on_w || 0) + (p.ut_wins || 0)}W-${(p.on_l || 0) + (p.ut_l || 0)}L</small></button>`).join('')}</div>`
    : `<div class="crew-make"><h3>Start or join a crew</h3><div class="crew-form"><input id="crew-name" maxlength="20" placeholder="Crew name"><input id="crew-tag" maxlength="4" placeholder="TAG"><button class="btn primary" id="crew-new" type="button">Create</button></div><div class="crew-form"><input id="crew-code" maxlength="8" placeholder="Invite code"><button class="btn" id="crew-join" type="button">Join</button></div></div>`}
    <h3 class="store-h">Crew leaderboard</h3><div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>Crew</th><th>Members</th><th>W</th><th>L</th></tr>${rows.map((r, i) => `<tr class="${myRow && r.c.id === myRow.c.id ? 'me' : ''}"><td>${i + 1}</td><td><b>[${esc(r.c.tag)}]</b> ${esc(r.c.name)}</td><td>${r.ms.length}</td><td>${r.w}</td><td>${r.l}</td></tr>`).join('') || '<tr><td colspan="5">No crews yet. Start the first one.</td></tr>'}</table></div>`;
  C.$$('[data-pid]', pane).forEach(b => b.onclick = () => openProfile(b.dataset.pid));
  const lv = C.$('#crew-leave'); if (lv) lv.onclick = async () => { if (!(await askYes(myRow.c.owner === uid ? 'Disband your crew? Everyone gets removed.' : 'Leave your crew?', myRow.c.owner === uid ? 'Disband' : 'Leave'))) return; const r = myRow.c.owner === uid ? await D.from('ek_crews').delete().eq('id', myRow.c.id) : await D.from('ek_crew_members').delete().eq('player', uid); if (r.error) C.toast(r.error.message); renderCrews(); };
  const nw = C.$('#crew-new'); if (nw) nw.onclick = async () => { const name = C.cleanText(C.$('#crew-name').value.trim()).slice(0, 20), tag = C.cleanText(C.$('#crew-tag').value.trim()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); if (name.length < 2 || tag.length < 2) return C.toast('Give it a name and a 2-4 letter tag');
    const id = Math.random().toString(36).slice(2, 8).toUpperCase(); const r = await D.from('ek_crews').insert({ id, name, tag, owner: uid }); if (r.error) return C.toast(r.error.message); const j = await D.from('ek_crew_members').insert({ player: uid, crew: id }); if (j.error) C.toast(j.error.message); else C.toast(`[${tag}] ${name} is live. Share code ${id}`, 4000); renderCrews(); };
  const jn = C.$('#crew-join'); if (jn) jn.onclick = async () => { const code = C.$('#crew-code').value.trim().toUpperCase(); if (!code) return; const r = await D.from('ek_crew_members').insert({ player: uid, crew: code }); if (r.error) return C.toast(/foreign|violates/.test(r.error.message) ? 'No crew with that code (or it\u2019s full)' : r.error.message); C.toast('You joined the crew'); renderCrews(); };
}
// the frames of the most recent play (same window as instant replay), thinned to about 30 fps
export function lastPlayFrames(rec) {
  rec = rec || []; let id = -1;
  for (let i = rec.length - 1; i >= 0; i--) if (rec[i].s.ph === 'live') { id = rec[i].s.id; break; }
  if (id < 0) return null;
  let frames = rec.filter(f => f.s.id === id && (f.s.ph === 'live' || f.s.ph === 'kick' || f.s.ph === 'dead'));
  let dead = 0; frames = frames.filter(f => { if (f.s.ph === 'dead') dead += f.dt; return dead < 1.6; });
  const out = []; let acc = 0;
  for (const f of frames) { acc += f.dt; if (acc >= 1 / 30 || !out.length) { out.push({ dt: acc, s: f.s }); acc = 0; } }
  return out.length >= 5 ? out : null;
}
// in-game text box (browser prompt() gets blocked in fullscreen and some browsers, which made clips silently do nothing)
export function askText(title, def = '', ok = 'Post') {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 60;
    m.innerHTML = `<div class="panel"><h3>${esc(title)}</h3><input id="ask-in" maxlength="60" value="${esc(def)}"><div style="display:flex;gap:8px"><button class="btn" id="ask-no" type="button">Cancel</button><button class="btn primary" id="ask-ok" type="button" style="flex:1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(m);
    const inp = m.querySelector('#ask-in'), done = v => { m.remove(); res(v); };
    m.querySelector('#ask-ok').onclick = () => done(inp.value);
    m.querySelector('#ask-no').onclick = () => done(null);
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}
export function askChoice(title, options) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 61;
    m.innerHTML = `<div class="panel"><h3>${esc(title)}</h3><div class="ask-opts">${options.map(([v, n]) => `<button class="btn" data-v="${esc(v)}" type="button">${esc(n)}</button>`).join('')}</div><button class="btn ghost" id="ask-no" type="button">Cancel</button></div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { m.remove(); res(b.dataset.v); });
    m.querySelector('#ask-no').onclick = () => { m.remove(); res(null); };
  });
}
const BAN_LENGTHS = [['1', '1 hour'], ['24', '1 day'], ['72', '3 days'], ['168', '1 week'], ['720', '30 days'], ['0', 'Permanent']];
const banLeft = until => { if (!until) return 'permanent'; const ms = new Date(until) - Date.now(); if (ms <= 0) return 'expired'; const h = Math.ceil(ms / 3600000); return h >= 48 ? `${Math.ceil(h / 24)} days left` : `${h} hour${h > 1 ? 's' : ''} left`; };
export async function saveClip(rec) {
  if (!db() || !me()) { C.toast('Sign in with a real account to post clips'); return; }
  const frames = lastPlayFrames(rec); if (!frames) { C.toast('Nothing to clip yet. Run a play first.'); return; }
  C.toast('Clipped last play! Name it to post it.', 2200); C.sfx.play('ui');
  const def = (() => { const s = frames[frames.length - 1].s; return (s.msg && s.msg.text) ? s.msg.text.slice(0, 40) : 'Big play'; })();
  const title = await askText('Name your clip', def, 'Post clip'); if (title === null) return;
  const t = C.cleanText(title).trim().slice(0, 60) || def;
  C.toast('Uploading clip…');
  try {
    const data = await packFrames(frames);
    if (data.length > 600000) { C.toast('That play is too long to clip'); return; }
    const secs = frames.reduce((a, f) => a + f.dt, 0);
    const online = C.st.mode === 'host' || C.st.mode === 'guest';
    const vs = online && C.st.names ? String(C.st.names[1 - C.st.local] || '').slice(0, 20) : C.st.mode === 'cpu' ? 'CPU' : '';
    let { error } = await db().from('ek_clips').insert({ owner: me().id, title: t, teams: frames[0].s.teams, secs: +secs.toFixed(1), data, vs });
    if (error && /vs/.test(error.message)) ({ error } = await db().from('ek_clips').insert({ owner: me().id, title: t, teams: frames[0].s.teams, secs: +secs.toFixed(1), data }));
    if (error) C.toast(error.message.includes('limit') ? 'You have 30 clips. Delete one from your profile first.' : 'Clip upload failed: ' + error.message);
    else { C.toast('Clipped last play: posted to your profile ✓', 3000); C.sfx.play('firstdown'); }
  } catch (e) { console.warn(e); C.toast('Clip upload failed: ' + (e && e.message || e)); }
}

// ---------- clip playback ----------
let lastClip = null, clipBack = null;
async function watchClip(id) {
  C.toast('Loading clip…');
  const { data, error } = await db().from('ek_clips').select('id,title,owner,teams,data,vs').eq('id', id).maybeSingle();
  if (error || !data) { C.toast('Couldn’t load that clip'); return; }
  let frames; try { frames = await unpackFrames(data.data); } catch (_) { C.toast('That clip is damaged'); return; }
  db().rpc('ek_clip_view', { cid: id }).then(() => {}, () => {});
  const { data: o } = await db().from('ek_players').select('name').eq('id', data.owner).maybeSingle();
  playFrames(frames, { id, title: data.title, by: o ? o.name : 'Player', vs: data.vs || '' });
}
function playFrames(frames, meta) {
  lastClip = { frames, meta };
  { const lb = C.$('#clip-like'); if (lb) { lb.classList.toggle('hidden', !meta.id); lb.classList.remove('on'); lb.onclick = async () => { const r = await toggleLike(meta.id); if (r !== null) { lb.classList.toggle('on', r); C.toast(r ? 'Liked' : 'Like removed'); } }; if (meta.id && me()) db().from('ek_clip_likes').select('clip_id').eq('clip_id', meta.id).eq('user_id', me().id).maybeSingle().then(({ data }) => lb.classList.toggle('on', !!data)); } }
  clipBack = C.screen();
  C.playClip(frames);
  C.$('#clip-title').textContent = meta.title; C.$('#clip-by').textContent = 'by ' + meta.by + (meta.vs ? ` vs ${meta.vs}` : '');
  C.$('#clipbar').classList.remove('hidden');
}
function closeClip() {
  C.$('#clipbar').classList.add('hidden');
  C.stopClip(clipBack || 'social');
}

// ---------- messages ----------
async function renderInbox() {
  const pane = C.$('#so-pane'); pane.innerHTML = '<p class="note">Loading messages…</p>';
  const uid = me().id;
  const { data } = await db().from('ek_messages').select('id,sender,recipient,body,read,created_at').or(`sender.eq.${uid},recipient.eq.${uid}`).order('created_at', { ascending: false }).limit(300);
  const convos = new Map();
  for (const m of data || []) { const other = m.sender === uid ? m.recipient : m.sender; if (!convos.has(other)) convos.set(other, { last: m, unread: 0 }); if (m.recipient === uid && !m.read) convos.get(other).unread++; }
  const names = {};
  if (convos.size) { const { data: ps } = await db().from('ek_players').select('id,name,team').in('id', [...convos.keys()]); for (const p of ps || []) names[p.id] = p; }
  pane.innerHTML = `<h3 class="store-h">Messages</h3><div class="inbox">${[...convos.entries()].map(([id, c]) => { const p = names[id] || { name: 'Player', team: 0 };
    return `<button class="convo ${c.unread ? 'unread' : ''}" type="button" data-id="${esc(id)}" data-name="${esc(p.name)}"><img alt="" src="${C.logoURL(p.team ?? 0, 40)}"><div><b>${esc(p.name)}</b><small>${c.last.sender === uid ? 'You: ' : ''}${parseInvite(c.last.body) ? '🏈 1v1 challenge' : esc(c.last.body.slice(0, 70))}</small></div><em>${c.unread ? `<i class="dotn">${c.unread}</i>` : ago(c.last.created_at)}</em></button>`; }).join('') || '<p class="note">No messages yet. Find someone on the leaderboard and hit Message.</p>'}</div>`;
  C.$$('.convo', pane).forEach(b => b.onclick = () => openThread(b.dataset.id, b.dataset.name));
}
let threadSub = null;
async function openThread(id, name) {
  view = { tab: 'thread', id, name };
  C.$$('.so-tab').forEach(b => b.classList.toggle('on', b.dataset.so === 'msgs'));
  const pane = C.$('#so-pane'), uid = me().id;
  pane.innerHTML = `<div class="thread-head"><button class="btn sm ghost" id="th-back">Back</button><button class="link" id="th-who">${esc(name || 'Player')}</button></div>
    <div class="thread" id="thread"><p class="note">Loading…</p></div>
    <form class="thread-form" id="th-form"><input id="th-in" maxlength="500" placeholder="Message ${esc(name || '')}" autocomplete="off"><button class="btn primary" type="submit">Send</button></form>`;
  C.$('#th-back').onclick = () => { view = { tab: 'msgs' }; renderSocial(); };
  C.$('#th-who').onclick = () => openProfile(id);
  const draw = async () => {
    const { data } = await db().from('ek_messages').select('id,sender,recipient,body,created_at').or(`and(sender.eq.${uid},recipient.eq.${id}),and(sender.eq.${id},recipient.eq.${uid})`).order('created_at', { ascending: true }).limit(200);
    const box = C.$('#thread'); if (!box) return;
    box.innerHTML = (data || []).map(m => { const inv = parseInvite(m.body), fresh = inv && Date.now() - new Date(m.created_at) < 10 * 60000;
      return inv ? `<div class="bubble invite ${m.sender === uid ? 'mine' : ''}"><p>${m.sender === uid ? 'You challenged them to a 1v1' : 'Challenged you to a 1v1'}</p>${m.sender !== uid && fresh ? `<button class="btn sm primary" data-join="${esc(inv)}">Play now</button>` : `<small>${fresh ? 'Waiting…' : 'Expired'}</small>`}<small>${ago(m.created_at)}</small></div>`
        : `<div class="bubble ${m.sender === uid ? 'mine' : ''}"><p>${esc(m.body)}</p><small>${ago(m.created_at)}</small></div>`; }).join('') || '<p class="note">Say hi.</p>';
    C.$$('[data-join]', box).forEach(b => b.onclick = () => C.joinGame(b.dataset.join));
    box.scrollTop = box.scrollHeight;
    await db().from('ek_messages').update({ read: true }).eq('recipient', uid).eq('sender', id).eq('read', false);
    refreshUnread();
  };
  await draw();
  if (threadSub) { try { db().removeChannel(threadSub); } catch (_) {} }
  threadSub = db().channel('ek-dm-' + uid + '-' + Date.now()).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ek_messages', filter: `recipient=eq.${uid}` }, (p) => { if (view.tab === 'thread' && view.id === p.new.sender) draw(); else refreshUnread(); }).subscribe();
  C.$('#th-form').onsubmit = async (e) => {
    e.preventDefault();
    const inp = C.$('#th-in'), body = C.cleanText(inp.value || '').trim().slice(0, 500); if (!body) return;
    inp.value = '';
    const { error } = await db().from('ek_messages').insert({ sender: uid, recipient: id, body });
    if (error) C.toast(error.message); else draw();
  };
}
export async function refreshUnread() {
  if (!db() || !me()) return;
  const { count } = await db().from('ek_messages').select('id', { count: 'exact', head: true }).eq('recipient', me().id).eq('read', false);
  const n = count || 0;
  for (const el of C.$$('.so-unread')) { el.textContent = n; el.classList.toggle('hidden', !n); }
}

// ---------------- notifications (bell, top right of the main menu) ----------------
const NSEEN = 'ek_notif_seen';
const seenAt = () => { try { return localStorage.getItem(NSEEN) || '1970-01-01T00:00:00Z'; } catch (_) { return '1970-01-01T00:00:00Z'; } };
let notifItems = [], notifBusy = false, notifWired = false;
export async function loadNotifs() {
  if (!db() || !me() || notifBusy) return; notifBusy = true;
  try {
    const uid = me().id, D = db(), items = [];
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [msgs, inc, out, trades, clips] = await Promise.all([
      D.from('ek_messages').select('id,sender,body,created_at').eq('recipient', uid).eq('read', false).order('created_at', { ascending: false }).limit(30),
      D.from('ek_follows').select('follower,created_at').eq('followee', uid).limit(300),
      D.from('ek_follows').select('followee').eq('follower', uid).limit(500),
      D.from('ek_trades').select('id,sender,created_at').eq('recipient', uid).eq('status', 'pending').limit(20),
      D.from('ek_clips').select('id,title').eq('owner', uid).limit(30),
    ]);
    const mine = new Set((out.data || []).map(r => r.followee)), ign = ignoredSet();
    const bySender = {};
    for (const m of msgs.data || []) {
      const code = parseInvite(m.body);
      if (code && Date.now() - new Date(m.created_at) < 20 * 60000) items.push({ k: 'inv', who: m.sender, at: m.created_at, code });
      else if (!code) { const b = bySender[m.sender] || (bySender[m.sender] = { k: 'msg', who: m.sender, at: m.created_at, n: 0 }); b.n++; }
    }
    items.push(...Object.values(bySender));
    for (const f of inc.data || []) if (!mine.has(f.follower) && !ign.has(f.follower)) items.push({ k: 'req', who: f.follower, at: f.created_at || since });
    for (const t of trades.data || []) items.push({ k: 'trade', who: t.sender, at: t.created_at, id: t.id });
    const myClips = clips.data || [];
    if (myClips.length) {
      const { data: likes } = await D.from('ek_clip_likes').select('clip_id,user_id,created_at').in('clip_id', myClips.map(c => c.id)).gt('created_at', since).neq('user_id', uid).order('created_at', { ascending: false }).limit(30);
      for (const l of likes || []) items.push({ k: 'like', who: l.user_id, at: l.created_at, clip: (myClips.find(c => c.id === l.clip_id) || {}).title || 'your clip' });
    }
    const ids = [...new Set(items.map(i => i.who))];
    const names = {};
    if (ids.length) { const { data } = await D.from('ek_players').select('id,name').in('id', ids); for (const p of data || []) names[p.id] = p.name; }
    for (const i of items) i.name = names[i.who] || 'Someone';
    notifItems = items.sort((a, b) => (a.at < b.at ? 1 : -1));
    paintNotifs();
  } catch (e) { console.warn(e); } finally { notifBusy = false; }
}
function paintNotifs() {
  wireNotifs();
  const seen = seenAt(), blocked = C.SET && C.SET.notifs === 'off';
  const fresh = notifItems.filter(i => i.k !== 'like' || i.at > seen);
  const n = notifItems.filter(i => i.at > seen).length;
  const badge = C.$('#notif-n'); if (badge) { badge.textContent = n > 99 ? '99+' : n; badge.classList.toggle('hidden', !n || blocked); }
  const list = C.$('#notif-list'); if (!list) return;
  const IC = { msg: '✉', inv: '🏈', req: '👋', trade: '⇄', like: '♥' };
  const TXT = i => i.k === 'msg' ? `<b>${esc(i.name)}</b> sent you ${i.n > 1 ? i.n + ' messages' : 'a message'}` : i.k === 'inv' ? `<b>${esc(i.name)}</b> challenged you to a 1v1` : i.k === 'req' ? `<b>${esc(i.name)}</b> sent you a friend request` : i.k === 'trade' ? `<b>${esc(i.name)}</b> sent you a trade offer` : `<b>${esc(i.name)}</b> liked “${esc(i.clip)}”`;
  list.innerHTML = fresh.slice(0, 30).map((i, k) => `<div class="np-item ${i.at > seen ? 'new' : ''}" data-ni="${k}"><span class="np-ic">${IC[i.k]}</span><div>${TXT(i)}<small>${ago(i.at)}</small></div>${i.k === 'inv' ? '<button class="btn sm primary" type="button">Join</button>' : ''}</div>`).join('') || '<p class="note">Nothing new.</p>';
  C.$$('[data-ni]', list).forEach(el => el.onclick = () => {
    const i = fresh[+el.dataset.ni]; C.$('#notif-panel').classList.add('hidden');
    if (i.k === 'inv') { if (C.st.playing) return C.toast('Finish your game first'); C.joinGame(i.code); }
    else if (i.k === 'msg') { C.show('social'); openThread(i.who, i.name); }
    else if (i.k === 'req') { C.show('social'); view = { tab: 'friends' }; renderSocial(); }
    else if (i.k === 'trade') { C.openTrade && C.openTrade(null, ''); }
    else if (i.k === 'like') { C.show('social'); view = { tab: 'me' }; renderSocial(); }
  });
}
function wireNotifs() {
  if (notifWired) return; const btn = C.$('#notif-btn'); if (!btn) return; notifWired = true;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!me()) { C.toast('Sign in with a real account to get notifications'); return; }
    const p = C.$('#notif-panel'); const open = p.classList.toggle('hidden') === false;
    if (open) { loadNotifs(); C.sfx.play('ui'); }
  };
  C.$('#notif-read').onclick = () => { try { localStorage.setItem(NSEEN, new Date().toISOString()); } catch (_) {} paintNotifs(); };
  document.addEventListener('click', (e) => { const p = C.$('#notif-panel'); if (p && !p.classList.contains('hidden') && !e.target.closest('#notif-panel') && !e.target.closest('#notif-btn')) p.classList.add('hidden'); });
}

// ---------------- after a game: push career stats ----------------
// r: { res, ps (player stats list), st (team stats), me (team index), lvl, rp }
export async function postGameStats(r) {
  if (!db() || !me()) return;
  const mine = (r.ps || []).filter(p => p.t === r.me), ts = (r.st || [])[r.me] || {};
  const sum = k => mine.reduce((a, p) => a + (+p[k] || 0), 0);
  let rtd = 0, retd = 0;
  for (const p of mine) { if (!p.td) continue; if ((p.rec || 0) > 0 && (p.recy || 0) >= (p.ry || 0)) retd += p.td; else rtd += p.td; }
  const s = { name: me().name, res: r.res, py: sum('py'), ptd: sum('ptd'), ry: sum('ry'), rtd, rec: sum('rec'), recy: sum('recy'), retd, tk: sum('tk'), sk: sum('sk'), int: sum('int'),
    fgm: ts.fgm || 0, fga: ts.fga || 0, fgl: ts.fgl || 0, xpm: ts.xpm || 0, punts: ts.punts || 0, puntYds: ts.puntYds || 0,
    secs: Math.round(r.secs || 0), qlen: r.qlen || 120, ac: r.ac || 0, acWhy: String(r.acWhy || '').slice(0, 120), ut: r.ut ? 1 : 0, pts: r.pts || 0, on: r.online ? 1 : 0, fr: r.fr ? 1 : 0 };
  if (isBanned()) return;
  try {
    await db().from('ek_players').upsert({ id: me().id, name: me().name, lvl: r.lvl || 1, rp: r.rp || 0 }, { onConflict: 'id' });
    const { error } = await db().rpc('ek_add_game', { s });
    if (error) console.warn('leaderboard update failed', error.message);
    await syncRecord();
  } catch (e) { console.warn(e); }
}

// ---------------- bans ----------------
const ADMIN_EMAIL = 'hussainzidan16@gmail.com';
export const isAdmin = () => !!(me() && (me().email || '').toLowerCase() === ADMIN_EMAIL);
let banInfo = null, banChecked = '';
export async function checkBan() {
  if (!db() || !me()) { banInfo = null; return null; }
  if (banChecked === me().id) return banInfo;
  banChecked = me().id;
  let data = null;
  const r = await db().rpc('ek_my_ban');
  if (!r.error) data = (r.data || [])[0] || null;
  else { const q = await db().from('ek_bans').select('reason,until').eq('id', me().id).maybeSingle(); data = q.data || null; if (data && data.until && new Date(data.until) <= new Date()) data = null; }
  banInfo = data || null;
  if (banInfo) {
    const len = banInfo.until ? `Banned until ${new Date(banInfo.until).toLocaleString()} (${banLeft(banInfo.until)}).` : 'This ban is permanent.';
    C.$('#ban-why').textContent = `${banInfo.reason ? `Reason: ${banInfo.reason}. ` : 'You broke the Terms of Service. '}${len}`;
    C.$('#banned').classList.remove('hidden');
    if (C.st.playing) C.leaveGame && C.leaveGame();
  }
  return banInfo;
}
export const isBanned = () => !!banInfo;

// ---------------- reports ----------------
const REASONS = [['cheating', 'Cheating or exploiting'], ['harassment', 'Harassment or hate'], ['bad name', 'Bad name or bio'], ['bad clip', 'Bad clip'], ['spam', 'Spam'], ['other', 'Something else']];
function reportDialog(id, name) {
  const pane = C.$('#so-pane');
  pane.insertAdjacentHTML('afterbegin', `<div class="form report-box" id="rep-box"><h3>Report ${esc(name)}</h3><p class="note">Reports go privately to the Habir Studios admin. False reports can get you banned too.</p>
    <label>What happened<select id="rep-why">${REASONS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
    <label>Details (optional)<textarea id="rep-txt" maxlength="500" rows="3" placeholder="When, what game, what they did"></textarea></label>
    <div class="actions"><button class="btn" id="rep-x" type="button">Cancel</button><button class="btn danger" id="rep-go" type="button">Send report</button></div></div>`);
  C.$('#rep-x').onclick = () => C.$('#rep-box').remove();
  C.$('#rep-go').onclick = async () => {
    const { error } = await db().from('ek_reports').insert({ reporter: me().id, target: id, reason: C.$('#rep-why').value, details: C.cleanText(C.$('#rep-txt').value || '').slice(0, 500) });
    if (error) C.toast(error.message.includes('recently') ? 'You already reported this player recently' : 'Report failed: ' + error.message);
    else { C.toast('Report sent. Thanks for keeping the game clean.'); C.$('#rep-box').remove(); }
  };
}
export function wireReport(id, name) { const b = C.$('#pf-report'); if (b) b.onclick = () => reportDialog(id, name); }

// ---------------- admin panel (only the admin account's requests are allowed by the database) ----------------
let adTab = 'open';
export function initAdmin() {
  C.$$('.ad-tab').forEach(b => b.addEventListener('click', () => { adTab = b.dataset.ad; C.sfx.play('ui'); renderAdmin(); }));
}
export async function refreshAdminBadge() {
  const tile = C.$('#admin-tile'); if (!tile) return;
  tile.classList.toggle('hidden', !isAdmin());
  if (!isAdmin() || !db()) return;
  const { count } = await db().from('ek_reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
  for (const el of [C.$('#admin-n'), C.$('#ad-n')]) { if (!el) continue; el.textContent = count || 0; el.classList.toggle('hidden', !count); }
}
export async function renderAdmin() {
  const pane = C.$('#ad-pane');
  C.$$('.ad-tab').forEach(b => b.classList.toggle('on', b.dataset.ad === adTab));
  if (!isAdmin() || !db()) { pane.innerHTML = '<p class="note">Admins only.</p>'; return; }
  pane.innerHTML = '<p class="note">Loading…</p>';
  refreshAdminBadge();
  if (adTab === 'find') return adminFind();
  if (adTab === 'bans') {
    await db().rpc('ek_admin_clean_bans');
    const { data } = await db().from('ek_bans').select('id,reason,by_admin,created_at,until').order('created_at', { ascending: false }).limit(200);
    const names = await namesFor((data || []).map(b => b.id));
    pane.innerHTML = `<div class="ad-list">${(data || []).map(b => `<div class="ad-row"><div><b>${esc(names[b.id] || b.id.slice(0, 8))}</b><small>${esc(b.reason || 'No reason')}${b.by_admin ? '' : ' (automatic)'}, ${ago(b.created_at)}, ${banLeft(b.until)}</small></div><button class="btn sm" data-unban="${b.id}">Unban</button></div>`).join('') || '<p class="note">Nobody is banned.</p>'}</div>`;
    C.$$('[data-unban]', pane).forEach(x => x.onclick = () => adminAct('unban', x.dataset.unban));
    return;
  }
  let q = db().from('ek_reports').select('id,reporter,target,reason,details,status,created_at').order('created_at', { ascending: false }).limit(200);
  if (adTab === 'open') q = q.eq('status', 'open');
  const { data, error } = await q;
  if (error) { pane.innerHTML = `<p class="note">Couldn’t load reports: ${esc(error.message)}</p>`; return; }
  const names = await namesFor([...new Set((data || []).flatMap(r => [r.target, r.reporter].filter(Boolean)))]);
  pane.innerHTML = `<div class="ad-list">${(data || []).map(r => `<div class="ad-row ${r.reason.startsWith('auto') ? 'auto' : ''}">
      <div><b>${esc(names[r.target] || r.target.slice(0, 8))}</b> <span class="ad-tag">${esc(r.reason)}</span> <span class="ad-tag st-${r.status}">${r.status}</span>
      <small>${r.reporter ? `Reported by ${esc(names[r.reporter] || 'player')}` : 'Flagged by anti-cheat'}, ${ago(r.created_at)}</small>${r.details ? `<p>${esc(r.details)}</p>` : ''}</div>
      <div class="ad-btns"><button class="btn sm" data-view="${r.target}">Profile</button>${r.status === 'open' ? `<button class="btn sm" data-dismiss="${r.id}">Dismiss</button>` : ''}<button class="btn sm" data-reset="${r.target}">Reset stats</button><button class="btn sm" data-kick="${r.target}">Kick from game</button><button class="btn sm danger" data-ban="${r.target}">Ban</button></div></div>`).join('') || '<p class="note">No reports. All quiet.</p>'}</div>`;
  wireAdmin(pane);
}
function wireAdmin(pane) {
  C.$$('[data-view]', pane).forEach(x => x.onclick = () => { C.show('social'); openProfile(x.dataset.view); });
  C.$$('[data-dismiss]', pane).forEach(x => x.onclick = async () => { await db().from('ek_reports').update({ status: 'dismissed' }).eq('id', +x.dataset.dismiss); renderAdmin(); });
  C.$$('[data-ban]', pane).forEach(x => x.onclick = () => adminAct('ban', x.dataset.ban));
  C.$$('[data-unban]', pane).forEach(x => x.onclick = () => adminAct('unban', x.dataset.unban));
  C.$$('[data-reset]', pane).forEach(x => x.onclick = () => adminAct('reset', x.dataset.reset));
  C.$$('[data-kick]', pane).forEach(x => x.onclick = () => adminAct('kick', x.dataset.kick));
}
async function adminAct(kind, id) {
  let r;
  if (kind === 'ban') {
    const why = await askText('Why are you banning this player? (they will see this)', 'Cheating', 'Next'); if (why === null) return;
    const hrs = await askChoice('How long?', BAN_LENGTHS); if (hrs === null) return;
    r = await db().rpc('ek_admin_ban', { uid: id, why, hours: +hrs });
    if (!r.error) await db().from('ek_kicks').insert({ target: id, reason: 'banned' });   // a ban also boots them out of the game they're in
  }
  else if (kind === 'kick') {
    const why = await askText('Kick this player out of their current game? Reason (they will see this)', 'Removed by an admin', 'Kick'); if (why === null) return;
    r = await db().from('ek_kicks').insert({ target: id, reason: C.cleanText(why).slice(0, 200) });
    if (!r.error) { C.toast('Kick sent. If they are in a game, they are out of it now.'); return; }
  }
  else if (kind === 'unban') { if (!(await askYes('Unban this player?', 'Unban'))) return; r = await db().rpc('ek_admin_unban', { uid: id }); }
  else { if (!(await askYes('Wipe this player’s career stats to zero?', 'Reset stats'))) return; r = await db().rpc('ek_admin_reset_stats', { uid: id }); }
  if (r.error) C.toast(r.error.message); else C.toast(kind === 'ban' ? 'Player banned' : kind === 'unban' ? 'Player unbanned' : 'Stats reset');
  renderAdmin();
}
async function adminFind() {
  const pane = C.$('#ad-pane');
  pane.innerHTML = `<div class="form"><label>Player name<input id="ad-q" placeholder="Type a name" autocomplete="off"></label></div><div class="ad-list" id="ad-res"></div>`;
  const go = async () => {
    const q = (C.$('#ad-q').value || '').trim().replace(/[%_,()]/g, ''); if (q.length < 2) { C.$('#ad-res').innerHTML = ''; return; }
    const { data } = await db().from('ek_players').select('id,name,games,wins,flags,banned').ilike('name', `%${q}%`).limit(20);
    C.$('#ad-res').innerHTML = (data || []).map(p => `<div class="ad-row"><div><b>${esc(p.name)}</b>${p.banned ? ' <span class="ad-tag st-banned">banned</span>' : ''}<small>${p.games} games, ${p.wins} wins, ${p.flags} anti-cheat flags</small></div>
      <div class="ad-btns"><button class="btn sm" data-view="${p.id}">Profile</button><button class="btn sm" data-reset="${p.id}">Reset stats</button><button class="btn sm" data-kick="${p.id}">Kick from game</button>${p.banned ? `<button class="btn sm" data-unban="${p.id}">Unban</button>` : `<button class="btn sm danger" data-ban="${p.id}">Ban</button>`}</div></div>`).join('') || '<p class="note">No players found.</p>';
    wireAdmin(C.$('#ad-res'));
  };
  let t; C.$('#ad-q').oninput = () => { clearTimeout(t); t = setTimeout(go, 300); };
}
async function namesFor(ids) {
  const out = {}; if (!ids.length) return out;
  const { data } = await db().from('ek_players').select('id,name').in('id', ids.slice(0, 300));
  for (const r of data || []) out[r.id] = r.name;
  return out;
}


// ---------------- profiles exist from the moment you sign in (so friends can find you) ----------------
let profileMade = false;
async function ensureProfile() {
  if (profileMade || !db() || !me()) return; profileMade = true;
  const P = C.profile && C.profile();
  const { error } = await db().from('ek_players').upsert({ id: me().id, name: me().name, lvl: P ? P.p.lvl : 1, rp: P ? P.p.rp : 0 }, { onConflict: 'id' });
  if (error) { console.warn('profile create failed', error.message); profileMade = false; }
  syncRecord();
}
// your record everywhere (main menu, game over) is the same one the leaderboard shows: only online 1v1,
// Ultimate Team and Franchise games, never CPU quick play
export async function syncRecord() {
  if (!db() || !me()) return null;
  const { data } = await db().from('ek_players').select('wins,losses,on_w,on_l,on_t,ut_wins,ut_l,ut_t,fr_w,fr_l,fr_t').eq('id', me().id).maybeSingle();
  if (!data) return null;
  const u = me(); u.wins = data.wins || 0; u.losses = data.losses || 0; u.ties = 0; u.recs = data;
  C.refreshProfile && C.refreshProfile();
  return data;
}

// ---------------- friends: add = follow, friends = you both added each other ----------------
async function refreshRequests() {
  if (!db() || !me()) return;
  const uid = me().id;
  const [{ data: inc }, { data: out }] = await Promise.all([db().from('ek_follows').select('follower').eq('followee', uid).limit(500), db().from('ek_follows').select('followee').eq('follower', uid).limit(500)]);
  const mine = new Set((out || []).map(r => r.followee)), ignored = ignoredSet();
  const n = (inc || []).filter(r => !mine.has(r.follower) && !ignored.has(r.follower)).length;
  const el = C.$('#fr-req-n'); if (el) { el.textContent = n; el.classList.toggle('hidden', !n); }
}
const ignoredSet = () => { try { return new Set(JSON.parse(localStorage.getItem('ek_ignored_req') || '[]')); } catch (_) { return new Set(); } };
const ignore = id => { try { const s = ignoredSet(); s.add(id); localStorage.setItem('ek_ignored_req', JSON.stringify([...s])); } catch (_) {} };
async function renderFriends() {
  const pane = C.$('#so-pane'), uid = me().id; pane.innerHTML = '<p class="note">Loading…</p>';
  const [{ data: inc }, { data: out }] = await Promise.all([db().from('ek_follows').select('follower').eq('followee', uid).limit(500), db().from('ek_follows').select('followee').eq('follower', uid).limit(500)]);
  const incS = new Set((inc || []).map(r => r.follower)), outS = new Set((out || []).map(r => r.followee)), ignored = ignoredSet();
  const friends = [...outS].filter(x => incS.has(x)), requests = [...incS].filter(x => !outS.has(x) && !ignored.has(x)), sent = [...outS].filter(x => !incS.has(x));
  const ids = [...new Set([...friends, ...requests, ...sent])];
  const ps = {}; if (ids.length) { const { data } = await db().from('ek_players').select('id,name,team,lvl').in('id', ids); for (const p of data || []) ps[p.id] = p; }
  const row = (id, btns, sub) => { const p = ps[id] || { name: 'Player', team: 0, lvl: 1 }; return `<div class="friend-row"><img alt="" src="${C.logoURL(p.team ?? 0, 40)}"><div><button class="link" data-pid="${esc(id)}">${esc(p.name)}</button><small>${sub || 'Level ' + p.lvl}</small></div><div class="ad-btns">${btns}</div></div>`; };
  pane.innerHTML = `<p class="note">Find people with the search box above, open their profile and hit Add friend. When they add you back you're friends, and you can challenge each other to a 1v1 from here.</p>
    ${requests.length ? `<h3 class="store-h">Friend requests (${requests.length})</h3><div class="ad-list">${requests.map(id => row(id, `<button class="btn sm primary" data-accept="${esc(id)}">Accept</button><button class="btn sm ghost" data-ignore="${esc(id)}">Ignore</button>`, 'Wants to be friends')).join('')}</div>` : ''}
    <h3 class="store-h">Friends (${friends.length})</h3><div class="ad-list">${friends.map(id => row(id, `<button class="btn sm primary" data-chal="${esc(id)}">Challenge</button><button class="btn sm" data-dm="${esc(id)}">Message</button>`)).join('') || '<p class="note">No friends yet.</p>'}</div>
    ${sent.length ? `<h3 class="store-h">Sent requests</h3><div class="ad-list">${sent.map(id => row(id, `<button class="btn sm ghost" data-cancel="${esc(id)}">Cancel</button>`, 'Waiting for them to add you back')).join('')}</div>` : ''}`;
  C.$$('[data-pid]', pane).forEach(b => b.onclick = () => openProfile(b.dataset.pid));
  C.$$('[data-accept]', pane).forEach(b => b.onclick = async () => { const { error } = await db().from('ek_follows').insert({ follower: uid, followee: b.dataset.accept }); if (error) C.toast(error.message); else C.toast('Friend added'); renderFriends(); refreshRequests(); });
  C.$$('[data-ignore]', pane).forEach(b => b.onclick = () => { ignore(b.dataset.ignore); renderFriends(); refreshRequests(); });
  C.$$('[data-cancel]', pane).forEach(b => b.onclick = async () => { await db().from('ek_follows').delete().eq('follower', uid).eq('followee', b.dataset.cancel); renderFriends(); });
  C.$$('[data-chal]', pane).forEach(b => b.onclick = () => challenge(b.dataset.chal, (ps[b.dataset.chal] || {}).name || 'them'));
  C.$$('[data-dm]', pane).forEach(b => b.onclick = () => openThread(b.dataset.dm, (ps[b.dataset.dm] || {}).name));
}

// ---------------- 1v1 challenges: host a private game and send the code as a special message ----------------
const INVITE_RE = /^\[1v1:([A-Z0-9]{6,8})\]/;
const parseInvite = body => { const m = INVITE_RE.exec(body || ''); return m ? m[1] : null; };
async function challenge(id, name) {
  if (!db() || !me()) return;
  const code = C.newCode();
  const { error } = await db().from('ek_messages').insert({ sender: me().id, recipient: id, body: `[1v1:${code}] ${me().name} challenged you to a 1v1` });
  if (error) { C.toast('Couldn’t send the challenge: ' + error.message); return; }
  C.toast(`Challenge sent to ${name}. Waiting for them to join…`, 3500);
  C.hostGame(code);
}
let inviteSub = null, inviteUser = '';
function listenInvites() {
  if (!db() || !me() || inviteUser === me().id) return;
  inviteUser = me().id;
  if (inviteSub) { try { db().removeChannel(inviteSub); } catch (_) {} }
  // baseline = newest kick already on the server (server clock), so old kicks never fire and new ones always do
  db().from('ek_kicks').select('created_at').eq('target', me().id).order('created_at', { ascending: false }).limit(1).then(({ data }) => { kickSeen = (data && data[0] && data[0].created_at) || '1970-01-01T00:00:00Z'; }, () => { kickSeen = '1970-01-01T00:00:00Z'; });
  inviteSub = db().channel('ek-inv-' + me().id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ek_kicks', filter: `target=eq.${me().id}` }, (pl) => gotKick(pl.new, true)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ek_messages', filter: `recipient=eq.${me().id}` }, async (pl) => {
    refreshUnread();
    const code = parseInvite(pl.new && pl.new.body); if (!code) return;
    const { data } = await db().from('ek_players').select('name').eq('id', pl.new.sender).maybeSingle();
    showInvite(code, data ? data.name : 'Someone');
  }).subscribe();
}
let kickSeen = null, kickPollT = 0;
function gotKick(k, live) {
  if (!k || (!live && kickSeen && k.created_at && k.created_at <= kickSeen)) return;
  if (k.created_at && (!kickSeen || k.created_at > kickSeen)) kickSeen = k.created_at;
  if (k.reason === 'banned') { banChecked = ''; checkBan(); }
  if (C.st.playing) { C.leaveGame && C.leaveGame(); }
  setTimeout(() => C.toast(`An admin removed you from the game${k.reason && k.reason !== 'banned' ? ': ' + k.reason : ''}`, 5000), 300);
}
async function pollKicks() {
  if (!db() || !me() || !kickSeen) return;
  const { data } = await db().from('ek_kicks').select('reason,created_at').eq('target', me().id).gt('created_at', kickSeen).order('created_at', { ascending: false }).limit(1);
  if (data && data[0]) gotKick(data[0]);
}
function showInvite(code, from) {
  loadNotifs();
  if (C.SET && C.SET.notifs === 'off') return;   // notifications blocked in Settings: it stays in the bell and messages
  const el = C.$('#invite-pop'); if (!el) return;
  C.$('#inv-title').textContent = `${from} challenged you`;
  C.$('#inv-sub').textContent = C.st.playing ? 'Finish your game first, it’s in your messages' : 'Online 1v1, ready when you are';
  C.$('#inv-yes').disabled = !!C.st.playing;
  el.classList.remove('hidden'); C.sfx.play('whistle');
  C.$('#inv-yes').onclick = () => { el.classList.add('hidden'); C.joinGame(code); };
  C.$('#inv-no').onclick = () => el.classList.add('hidden');
  clearTimeout(showInvite.t); showInvite.t = setTimeout(() => el.classList.add('hidden'), 30000);
}
