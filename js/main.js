// ENDZONE KINGS — app shell: menus, input, game loop, online glue
import { createGame, step, snapshot, drainEvents, recover, TEAMS, OFF_PLAYS, DEF_PLAYS, DIFFICULTIES, OFF_CATS, DEF_CATS, FORMS, teamPlaybook, throwNeed } from './sim.js?v=1792259173';
import { Renderer } from './render.js?v=1792259173';
import { Sfx } from './audio.js?v=1792259173';
import { Auth } from './auth.js?v=1792259173';
import { Peer, SupabaseSignal, LocalSignal, makeRoomCode, Lobby, SpecChannel, validCode, CODE_MIN, CODE_MAX } from './net.js?v=1792259173';
import { getRoster, teamOvr } from './teams.js?v=1792259173';
import * as Season from './season.js?v=1792259173';
import * as Fr from './franchise.js?v=1792259173';
import { initGamepad, pad, glyphs } from './gamepad.js?v=1792259173';
import { initMeta, profile, refreshChip, renderUT, renderProgress, awardGame, WX_OPTS, TOD_OPTS, pickWx, pickTod, RANK_COL, unlockAch, renderDrillBoard, drillRewardsHTML, CELS, celUnlocked } from './meta.js?v=1792259173';
import * as UTm from './ut.js?v=1792259173';
import { initCreator, renderCreator } from './creator.js?v=1792259173';
import { initSocial, renderSocial, renderMenuBoard, postGameStats, saveClip, refreshUnread, checkBan, isBanned, initAdmin, renderAdmin, refreshAdminBadge } from './social.js?v=1792259173';
import { portraitURL } from './faces.js?v=1792259173';
import { logoURL, clearLogoCache } from './logos.js?v=1792259173';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const LOCALNET = params.has('localnet');

// ---------------- settings ----------------
const DEF_SET = { touch: 'auto', vol: 0.7, music: 0.5, ann: true, cam: 'player', gfx: 'high', diff: 1, qlen: 120, team: 3, cpuTeam: 15, wx: 'clear', tod: 'night', vis: 'public', wx2: 'random', chat: true, cel: -1, pside: 'off', pspot: 25 };
let SET = { ...DEF_SET };
try { SET = { ...DEF_SET, ...JSON.parse(localStorage.getItem('ek_settings') || '{}') }; } catch (_) {}
if (SET.camV !== 2) { SET.cam = 'player'; SET.camV = 2; }   // new over-the-shoulder camera is the default now
const saveSet = () => { try { localStorage.setItem('ek_settings', JSON.stringify(SET)); } catch (_) {} };
// graphics: unless the player picked a setting themselves, start low on weak machines (Chromebooks, 4 cores or less,
// little memory) and keep stepping down while the frame rate is bad
if (SET.gfxAuto === undefined) SET.gfxAuto = true;
const weakMachine = () => /CrOS/.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
if (SET.gfxAuto) SET.gfx = weakMachine() ? 'potato' : (SET.gfx === 'potato' ? 'potato' : SET.gfx || 'high');

// ---------------- core objects ----------------
const canvas = $('#gl');
let R;
try { R = new Renderer(canvas, SET.gfx); } catch (e) {
  document.body.innerHTML = '<div style="color:#fff;font-family:sans-serif;text-align:center;margin-top:30vh;padding:20px">Your browser could not start 3D graphics (WebGL).<br>Try Chrome, Edge or Firefox with hardware acceleration on.</div>';
  throw e;
}
R.camMode = SET.cam;
R.userZoom = Math.max(0.75, Math.min(2.6, +SET.zoom || 1));
function zoomCam(d) { R.userZoom = Math.max(0.75, Math.min(2.6, R.userZoom * (d > 0 ? 1.12 : 1 / 1.12))); SET.zoom = +R.userZoom.toFixed(2); saveSet(); }
canvas.addEventListener('wheel', (e) => { if (!st.playing) return; e.preventDefault(); zoomCam(e.deltaY > 0 ? 1 : -1); }, { passive: false });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { clearLogoCache(); R.refreshText(); if (st.screen && st.screen !== 'splash' && st.screen !== 'game') show(st.screen); });
R.setTeams([SET.team, SET.cpuTeam]);
const sfx = new Sfx(); sfx.setVolume(SET.vol); sfx.musicVol = SET.music; sfx.announcer = SET.ann; sfx.startMusic();
window.addEventListener('pointerdown', () => sfx.init(), { once: false });
window.addEventListener('keydown', () => sfx.init(), { once: true });

const st = {
  screen: 'splash', prev: 'menu', playing: false, paused: false,
  mode: null, local: 0, game: null, snap: null, acc: 0,
  pbTab: 0, pbTabs: null,
  peer: null, remote: { mx: 0, mz: 0, sprint: false, ev: [] }, netAcc: 0, netEv: [],
  guestBuf: [], inputAcc: 0, overShown: false, resultSaved: false, names: ['', ''],
};

// ---------------- screens ----------------
function show(id) {
  if (st.screen !== id && !['howto', 'settings'].includes(st.screen)) st.prev = st.screen;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  st.screen = id;
  if (id === 'menu') refreshProfile();
  if (id === 'setup') renderSetup();
  if (id === 'online') renderOnline();
  if (id === 'settings') renderSettings();
  if (id === 'season') renderSeason();
  if (id === 'rosters') renderRosters();
  if (id === 'ut') renderUT();
  if (id === 'progress') renderProgress();
  if (id === 'creator') renderCreator();
  if (id === 'modes') renderModes();
  if (id === 'social') renderSocial();
  if (id === 'menu') { renderMenuBoard(); refreshUnread(); checkBan(); refreshAdminBadge(); }
  if (id === 'admin') renderAdmin();
  if (id === 'franchise') Fr.renderFranchise();
  if (id !== 'online') stopLobby();
}
const LOCKED = ['ut', 'season', 'online', 'progress', 'creator', 'modes', 'franchise'];
const isGuest = () => !Auth.user || Auth.user.kind === 'guest';
function lockPrompt(what) {
  $('#lock-title').textContent = what ? `${what} needs a free account` : 'Make a free account';
  $('#lockdlg').classList.remove('hidden');
}
$('#lock-no').addEventListener('click', () => $('#lockdlg').classList.add('hidden'));
$('#lock-yes').addEventListener('click', async () => { $('#lockdlg').classList.add('hidden'); if (st.playing) leaveGame(); await Auth.signOut(); show('auth'); $$('.tab')[1].click(); });
$$('[data-go]').forEach(b => b.addEventListener('click', () => {
  sfx.play('ui');
  const g = b.dataset.go;
  if (LOCKED.includes(g) && isGuest() && !LOCALNET) { const t = b.querySelector('.tl-k'); lockPrompt(t ? t.textContent : ''); return; }
  if (g === 'back') {
    if (st.playing) { $$('.screen').forEach(s => s.classList.remove('active')); st.screen = 'game'; $('#pause').classList.remove('hidden'); }
    else show(st.prev || 'menu');
  } else show(g);
}));
$$('.logo-slot').forEach(s => s.appendChild($('#tpl-logo').content.cloneNode(true)));
$('#yr').textContent = new Date().getFullYear();

function toast(t, ms = 2400) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), ms); }

// ---------------- splash → auth ----------------
let splashDone = false;
const authReady = Auth.init().catch(() => null);
function endSplash() {
  if (splashDone) return; splashDone = true;
  authReady.then(user => { setupAuthUI(); show(user ? 'menu' : 'auth'); });
}
$('#splash').addEventListener('click', endSplash);
setTimeout(endSplash, 2900);

// ---------------- auth UI ----------------
function setupAuthUI() {
  const sb = Auth.mode === 'supabase';
  $('.lbl-id').textContent = sb ? 'Email' : 'Username';
  $('#li-id').type = sb ? 'email' : 'text';
  $('.email-row').classList.toggle('hidden', !sb);
  $('#su-email').required = sb;
  $('#auth-mode').innerHTML = sb ? '✓ Online accounts are on — your record syncs everywhere.'
    : 'Offline mode: accounts are saved on this device only. Add your Supabase keys in <code>js/config.js</code> to turn on real accounts + online 1v1.';
}
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $('#form-login').classList.toggle('hidden', t.dataset.tab !== 'login');
  $('#form-signup').classList.toggle('hidden', t.dataset.tab !== 'signup');
  authMsg('');
}));
function authMsg(t, err) { const m = $('#auth-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
async function busy(btn, fn) { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } }
$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter || $('#form-login .btn'), async () => {
    try { await Auth.signIn($('#li-id').value, $('#li-pw').value); authMsg(''); $('#li-pw').value = ''; show('menu'); }
    catch (err) { authMsg(err.message, true); }
  });
});
$('#form-signup').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter || $('#form-signup .btn'), async () => {
    try {
      if (!$('#su-tos').checked) { authMsg('You need to agree to the Terms of Service first', true); return; }
      const r = await Auth.signUp($('#su-name').value, $('#su-email').value, $('#su-pw').value);
      if (r.needsConfirm) { authMsg('Almost there! Check your email to confirm, then log in.'); $$('.tab')[0].click(); $('#li-id').value = $('#su-email').value; }
      else { authMsg(''); show('menu'); toast(`Welcome to the league, ${Auth.user.name}!`); }
    } catch (err) { authMsg(err.message, true); }
  });
});

$('#guest-btn').addEventListener('click', () => { Auth.guest(); show('menu'); });
$('#logout').addEventListener('click', async () => { await Auth.signOut(); show('auth'); });

function refreshProfile() {
  const u = Auth.user; if (!u) return;
  $('#tile-fr-sub').textContent = Fr.franchiseSub();
  const SS = loadSeason();
  $('#tile-season-sub').textContent = SS ? (SS.phase === 'done' ? 'Season complete. Start a new one' : `${TEAMS[SS.team].city}, ${SS.standings[SS.team].w}-${SS.standings[SS.team].l}, ${SS.phase === 'regular' ? 'week ' + (SS.week + 1) : 'playoffs'}`) : 'Chase the Kings Bowl';
  $('#pc-name').textContent = u.name;
  $('#pc-avatar').textContent = u.name[0].toUpperCase();
  $('#pc-rec').textContent = u.kind === 'guest' ? 'Guest' : `${u.wins}-${u.losses}${u.ties ? '-' + u.ties : ''}`;
  $('#logout').textContent = u.kind === 'guest' ? 'Sign in' : 'Log out';
  const guest = isGuest() && !LOCALNET;
  $('.pc-meta').classList.toggle('hidden', guest);
  $$('.tiles .tile').forEach(t => t.classList.toggle('locked', guest && LOCKED.includes(t.dataset.go)));
  if (guest) return;
  profile(); refreshChip();
}

// ---------------- team / option widgets ----------------
const accent = t => (t.jersey === '#121a14' ? '#18c964' : t.jersey);
function teamCard(el, ti) {
  const t = TEAMS[ti], r = getRoster(ti);
  el.style.background = `linear-gradient(160deg, ${t.jersey}, ${shade(t.jersey, -0.55)})`;
  el.style.color = '#fff';
  el.style.setProperty('--trim', t.trim);
  el.innerHTML = `<img class="tlogo" alt="" src="${logoURL(ti, 112)}"><b>${t.city}</b><span>${t.abbr} ${r.ovr} OVR</span><em>Offense ${r.off}, defense ${r.def}</em>`;
  el.title = 'Click to pick a team';
}
let pickCb = null;
function openPicker(title, current, avoid, cb) {
  $('#pk-title').textContent = title;
  fillGrid($('#pk-grid'), current, avoid, (ti) => { $('#teampick').classList.add('hidden'); cb(ti); });
  $('#teampick').classList.remove('hidden');
}
$('#pk-close').addEventListener('click', () => $('#teampick').classList.add('hidden'));
function fillGrid(el, current, avoid, onPick) {
  el.innerHTML = '';
  const rb = document.createElement('button'); rb.className = 'tg rnd-tile'; rb.type = 'button';
  rb.innerHTML = '<span class="dice" aria-hidden="true">?</span><b>Random</b><small>Any team</small>';
  rb.onclick = () => { const i = randomTeam(avoid); sfx.play('ui'); $$('.tg', el).forEach(x => x.classList.toggle('on', x.dataset.ti === String(i))); onPick(i); };
  el.appendChild(rb);
  TEAMS.map((t, i) => i).sort((a, b) => TEAMS[a].city.localeCompare(TEAMS[b].city)).forEach(i => {
    const t = TEAMS[i];
    const b = document.createElement('button');
    b.className = 'tg' + (i === current ? ' on' : ''); b.dataset.ti = i;
    b.disabled = i === avoid;
    b.style.setProperty('--c', t.jersey); b.style.setProperty('--c2', t.trim);
    b.innerHTML = `<img class="tg-logo" alt="" src="${logoURL(i, 64)}"><b>${t.city}</b><small>${t.abbr}</small><span>${teamOvr(i)}</span>`;
    b.onclick = () => { sfx.play('ui'); $$('.tg', el).forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(i); };
    el.appendChild(b);
  });
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function randomTeam(avoid) { let v; do { v = (Math.random() * TEAMS.length) | 0; } while (v === avoid); return v; }
// "Random" spins through a few teams, then lands on one (like Madden's random team)
function spinTeam(set, avoid) {
  let n = 0; const tick = () => { set(randomTeam(avoid)); sfx.play('ui'); if (++n < 9) setTimeout(tick, 40 + n * 18); };
  tick();
}
function wireTeamPick(root, get, set, avoid) {
  $('.team-card', root).onclick = () => openPicker('Choose a team', get(), avoid ? avoid() : -1, set);
  const ar = $('.arrows', root);
  if (ar && !$('.rnd', ar)) { const r = document.createElement('button'); r.className = 'btn sm rnd'; r.type = 'button'; r.textContent = 'Random'; r.setAttribute('aria-label', 'Random team'); ar.appendChild(r); }
  if (ar) $('.rnd', ar).onclick = () => spinTeam(set, avoid ? avoid() : -1);
  $$('.arrows button[data-d]', root).forEach(b => b.onclick = () => {
    let v = get();
    do { v = (v + +b.dataset.d + TEAMS.length) % TEAMS.length; } while (avoid && v === avoid());
    set(v); sfx.play('ui');
  });
}
function seg(el, options, val, onPick) {
  el.innerHTML = '';
  options.forEach(([v, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.classList.toggle('on', v === val);
    b.onclick = () => { $$('button', el).forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(v); sfx.play('ui'); };
    el.appendChild(b);
  });
}
const QLENS = [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']];

// ---------------- season ----------------
const seasonKey = () => 'ek_season_' + (Auth.user ? Auth.user.id : 'anon');
function loadSeason() { try { return JSON.parse(localStorage.getItem(seasonKey())); } catch (_) { return null; } }
function saveSeason(S) { try { localStorage.setItem(seasonKey(), JSON.stringify(S)); } catch (_) {} }
let seasonPick = -1;
function renderSeason() {
  const S = loadSeason();
  $('#season-new').classList.toggle('hidden', !!S);
  $('#season-hub').classList.toggle('hidden', !S);
  if (!S) {
    fillGrid($('#season-grid'), seasonPick, -1, (ti) => { seasonPick = ti; $('#season-start').disabled = false; });
    $('#season-start').disabled = seasonPick < 0;
    return;
  }
  const me = S.team, t = TEAMS[me], rec = S.standings[me];
  $('#hub-team').innerHTML = `<img class="hb-logo" alt="" src="${logoURL(me, 136)}"><div><b>${t.city}</b><span>${rec.w}-${rec.l}${rec.t ? '-' + rec.t : ''} record, ${teamOvr(me)} OVR</span></div>`;
  const g = Season.userGame(S);
  const nx = $('#hub-next');
  if (S.phase === 'done') {
    const champ = TEAMS[S.champion];
    nx.innerHTML = S.champion === me ? `<small>SEASON COMPLETE</small><b>🏆 Kings Bowl Champions!</b>` : `<small>SEASON COMPLETE</small><b>${champ.city} won the Kings Bowl</b><span>${S.eliminated ? 'You missed out this year.' : ''}</span>`;
    $('#season-play').classList.add('hidden'); $('#season-sim').classList.add('hidden');
    $('#season-quit').textContent = 'Start new season';
  } else {
    const opp = g.home === me ? g.away : g.home, o = TEAMS[opp];
    const label = S.phase === 'regular' ? `Week ${S.week + 1} of ${Season.WEEKS}` : S.phase === 'semis' ? 'Playoff semifinal' : 'The Kings Bowl';
    nx.innerHTML = `<small>${label}</small><b>${g.home === me ? 'vs' : '@'} ${o.city}</b><span><i class="dot" style="background:${o.jersey}"></i>${o.abbr}, ${teamOvr(opp)} OVR, ${S.standings[opp].w}-${S.standings[opp].l}</span>`;
    $('#season-play').classList.remove('hidden'); $('#season-sim').classList.remove('hidden');
    $('#season-quit').textContent = 'Abandon season';
  }
  // schedule
  const rows = [];
  S.weeks.forEach((wk, i) => {
    const x = wk.find(q => q.home === me || q.away === me), opp = x.home === me ? x.away : x.home;
    const mine = x.home === me ? [x.hs, x.as] : [x.as, x.hs];
    const res = mine[0] === null ? '' : mine[0] > mine[1] ? `<em class="w">W ${mine[0]}-${mine[1]}</em>` : mine[0] < mine[1] ? `<em class="l">L ${mine[0]}-${mine[1]}</em>` : `<em>T ${mine[0]}-${mine[1]}</em>`;
    rows.push(`<div class="sr ${i === S.week && S.phase === 'regular' ? 'cur' : ''}"><span>W${i + 1}</span><i class="dot" style="background:${TEAMS[opp].jersey}"></i><b>${x.home === me ? 'vs' : '@'} ${TEAMS[opp].city}</b>${res}</div>`);
  });
  if (S.playoffs) {
    const P = S.playoffs;
    const pg = (lbl, x) => x ? `<div class="sr po"><span>${lbl}</span><b>${TEAMS[x.away].abbr} @ ${TEAMS[x.home].abbr}</b>${x.hs !== null ? `<em>${x.as}-${x.hs}</em>` : ''}</div>` : '';
    rows.push(pg('SEMI', P.semis[0]) + pg('SEMI', P.semis[1]) + pg('BOWL', P.final));
  }
  $('#sched').innerHTML = rows.join('');
  const tb = Season.table(S);
  $('#stand-h').textContent = S.phase === 'regular' ? 'Standings (top 4 make the playoffs)' : 'Final standings';
  $('#stand').innerHTML = '<tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr>' + tb.map((r, i) =>
    `<tr class="${r.team === me ? 'me' : ''} ${i === 3 ? 'cut' : ''}"><td>${i + 1}</td><td><i class="dot" style="background:${TEAMS[r.team].jersey}"></i>${TEAMS[r.team].city}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pf}</td><td>${r.pa}</td></tr>`).join('');
}
$('#season-start').addEventListener('click', () => { if (seasonPick < 0) return; saveSeason(Season.newSeason(seasonPick)); renderSeason(); toast(`Welcome to ${TEAMS[seasonPick].city}, coach.`); });
$('#season-sim').addEventListener('click', () => {
  const S = loadSeason(); if (!S) return;
  const r = Season.simMyGame(S); saveSeason(S); renderSeason();
  if (r) toast(r[0] > r[1] ? `Simmed: W ${r[0]}-${r[1]}` : r[0] < r[1] ? `Simmed: L ${r[0]}-${r[1]}` : `Simmed: T ${r[0]}-${r[1]}`);
});
$('#season-play').addEventListener('click', () => {
  const S = loadSeason(); if (!S) return;
  const g = Season.userGame(S); if (!g) return;
  const opp = g.home === S.team ? g.away : g.home;
  startCPU({ teams: [S.team, opp], season: true });
});
$('#season-quit').addEventListener('click', () => {
  const S = loadSeason();
  if (S && S.phase !== 'done' && !confirm('Abandon this season? Your progress will be lost.')) return;
  try { localStorage.removeItem(seasonKey()); } catch (_) {}
  seasonPick = -1; renderSeason();
});

// ---------------- rosters ----------------
let rosterTeam = SET.team;
function renderRosters() {
  const strip = $('#roster-strip');
  if (!strip.childElementCount) fillGrid(strip, rosterTeam, -1, (ti) => { rosterTeam = ti; renderRosters(); });
  const t = TEAMS[rosterTeam], R2 = getRoster(rosterTeam);
  $('#roster-head').innerHTML = `<img class="hb-logo" alt="" src="${logoURL(rosterTeam, 136)}"><div><b>${t.city}</b><span>${R2.ovr} OVR, offense ${R2.off}, defense ${R2.def}</span></div>`;
  const cell = (v) => `<td class="rt ${v >= 90 ? 'elite' : v >= 80 ? 'good' : v < 65 ? 'low' : ''}">${v}</td>`;
  $('#roster-tbl').innerHTML = '<tr><th>#</th><th>Name</th><th>Pos</th><th>OVR</th><th>SPD</th><th>HND</th><th>ACC</th><th>ARM</th><th>ELU</th><th>BLK</th><th>RSH</th><th>TKL</th><th>COV</th><th>Age</th></tr>' +
    R2.order.map(k => { const p = R2.players[k]; return `<tr><td>${p.num}</td><td class="nm">${p.first} ${p.last}</td><td>${p.pos}</td>${cell(p.ovr)}${cell(p.spd)}${cell(p.hands)}${cell(p.acc)}${cell(p.arm)}${cell(p.elu)}${cell(p.blk)}${cell(p.rush)}${cell(p.tkl)}${cell(p.cov)}<td>${p.age}</td></tr>`; }).join('');
}

function renderSetup() {
  if (SET.cpuTeam === SET.team) SET.cpuTeam = (SET.team + 1) % TEAMS.length;
  teamCard($('#tp-me .team-card'), SET.team); teamCard($('#tp-cpu .team-card'), SET.cpuTeam);
  seg($('#seg-diff'), DIFFICULTIES.map((n, i) => [i, n]), SET.diff, v => { SET.diff = v; saveSet(); });
  seg($('#seg-qlen'), QLENS, SET.qlen, v => { SET.qlen = v; saveSet(); });
  seg($('#seg-wx'), WX_OPTS, SET.wx, v => { SET.wx = v; saveSet(); });
  seg($('#seg-tod'), TOD_OPTS, SET.tod, v => { SET.tod = v; saveSet(); });
}
wireTeamPick($('#tp-me'), () => SET.team, v => { SET.team = v; saveSet(); renderSetup(); }, () => SET.cpuTeam);
wireTeamPick($('#tp-cpu'), () => SET.cpuTeam, v => { SET.cpuTeam = v; saveSet(); renderSetup(); }, () => SET.team);
$('#start-cpu').addEventListener('click', () => startCPU());

function renderModes() {
  teamCard($('#tp-modes .team-card'), SET.team);
  seg($('#seg-pside'), [['off', 'Offense'], ['def', 'Defense'], ['st', 'Special teams']], SET.pside, v => { SET.pside = v; saveSet(); });
  seg($('#seg-pspot'), [[25, 'Own 25'], [50, 'Midfield'], [80, 'Red zone'], [97, 'Goal line']], SET.pspot, v => { SET.pspot = v; saveSet(); });
  seg($('#seg-pdiff'), DIFFICULTIES.map((n, i) => [i, n]), SET.diff, v => { SET.diff = v; saveSet(); renderModes(); });
  seg($('#seg-ddiff'), DIFFICULTIES.map((n, i) => [i, n]), SET.diff, v => { SET.diff = v; saveSet(); renderModes(); });
  renderDrillBoard($('#drill-board'));
}
wireTeamPick($('#tp-modes'), () => SET.team, v => { SET.team = v; saveSet(); renderModes(); });
const randOpp = () => { let o; do { o = (Math.random() * TEAMS.length) | 0; } while (o === SET.team); return o; };
$('#go-practice').addEventListener('click', () => startCPU({ teams: [SET.team, randOpp()], practice: SET.pside, pspot: SET.pspot, weather: 'clear', tod: 'day' }));
$('#go-drill').addEventListener('click', () => startCPU({ teams: [SET.team, randOpp()], drill: true }));

function renderSettings() {
  $('#set-vol').value = SET.vol; $('#set-music').value = SET.music;
  seg($('#seg-ann'), [[true, 'On'], [false, 'Off']], SET.ann, v => { SET.ann = v; sfx.announcer = v; saveSet(); if (v) { sfx.init(); sfx.say('Announcer is on. Let\'s go!', true); } else if (window.speechSynthesis) speechSynthesis.cancel(); });
  seg($('#seg-cam'), [['behind', 'Follow ball'], ['player', 'Follow you'], ['broadcast', 'Sideline']], SET.cam, v => { SET.cam = v; R.camMode = v; saveSet(); });
  seg($('#seg-gfx'), [['auto', 'Auto'], ['high', 'High'], ['low', 'Fast'], ['potato', 'Chromebook']], SET.gfxAuto ? 'auto' : SET.gfx, v => { if (v === 'auto') { SET.gfxAuto = true; SET.gfx = weakMachine() ? 'potato' : 'high'; } else { SET.gfxAuto = false; SET.gfx = v; } saveSet(); applyGfx(); });
  seg($('#seg-touch'), [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], SET.touch, v => { SET.touch = v; saveSet(); });
  const P = !isGuest() ? profile() : null, lvl = P ? P.p.lvl : 0, ok = celUnlocked(lvl);
  if (!ok.includes(SET.cel)) SET.cel = -1;
  seg($('#seg-cel'), CELS.map(c => [c[0], c[1]]), SET.cel, v => { SET.cel = v; saveSet(); });
  $$('#seg-cel button').forEach((b, i) => { const need = CELS[i][2]; if (need > lvl) { b.disabled = true; b.title = `Unlocks at level ${need}`; b.textContent += ` (Lv ${need})`; } });
  $('#cel-note').textContent = P ? 'Your scorer does this after a touchdown. Level up to unlock more.' : 'Make a free account to unlock the bow and the moonwalk.';
}
$('#set-vol').addEventListener('input', (e) => { SET.vol = +e.target.value; sfx.setVolume(SET.vol); saveSet(); });
$('#set-music').addEventListener('input', (e) => { SET.music = +e.target.value; sfx.setMusicVolume(SET.music); saveSet(); });
function applyGfx() { R.setQuality(SET.gfx); }

// ---------------- game start / end ----------------
function enterGame() {
  $$('.screen').forEach(s => s.classList.remove('active'));
  st.screen = 'game';
  $('#hud').classList.remove('hidden');
  $('#gameover').classList.add('hidden'); $('#pause').classList.add('hidden');
  st.playing = true; st.paused = false; st.acc = 0; st.overShown = false; st.resultSaved = false; st.seasonSaved = false; st.rewarded = false; st.statsPosted = false; st.halfSaid = false; st.startedAt = performance.now(); crash.resets = 0;
  R.snapCamera(); hudCache = {};
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  canvas.focus();
  sfx.stopMusic();
  startIntro();
}

// ---------------- pre-game matchup intro ----------------
function startIntro() {
  const teams = st.mode === 'guest' ? R.teams : st.game.opts.teams;
  const T = teams.map(i => TEAMS[i]);
  const tn = st.teamNames || [];
  const card = (t, name, side, k) => `<div class="in-team ${side}" style="--c:${t.jersey === '#121a14' ? '#18c964' : t.jersey};--c2:${t.trim}"><img class="in-logo" alt="" src="${logoURL(teams[k], 160)}"><div><small>${escapeHtml(name || '')}</small><b>${escapeHtml(tn[k] || t.name)}</b><span>${tn[k] ? 'Ultimate Team' : t.abbr}</span></div></div>`;
  $('#intro-teams').innerHTML = card(T[0], st.names[0], 'l', 0) + '<div class="in-vs">VS</div>' + card(T[1], st.names[1], 'r', 1);
  $('#intro').classList.remove('hidden');
  $('#hud').classList.add('intro');
  st.intro = 4.2; st.introLen = 4.2; st.introOn = true;
  clearTimeout(st.introFail); st.introFail = setTimeout(() => endIntro(), 7000);   // never get stuck on the matchup screen
  sfx.cheer(0.5, 4); sfx.airHorn();
  sfx.say(`Welcome to ${T[0].city}! Tonight it's ${T[1].city} against ${T[0].city}. Let's play some football!`, true);
}
function endIntro() {
  if (!st.introOn) return;
  st.introOn = false; clearTimeout(st.introFail);
  const natural = st.intro < 0.05;
  st.intro = 0; $('#intro').classList.add('hidden'); $('#hud').classList.remove('intro');
  if (natural) { R.camPos.copy(R.cam.position); R._camInit = true; } else R.snapCamera();
}
$('#intro').addEventListener('click', endIntro);

function startCPU(opts = {}) {
  sfx.init();
  st.mode = 'cpu'; st.local = 0;
  st.seasonGame = !!opts.season; st.franchiseGame = !!opts.franchise;
  st.lastCpu = opts;
  const teams = opts.teams || [SET.team, SET.cpuTeam];
  st.ut = !!opts.ut; st.solo = opts.solo || null; st.teamNames = opts.teamNames || null; st.practice = opts.practice || null; st.drill = !!opts.drill; st.rec = []; st.replay = null;
  const weather = opts.weather || (opts.season || opts.franchise ? pickWx('random') : pickWx(SET.wx)), tod = opts.tod || (opts.season || opts.franchise ? pickTod('random') : pickTod(SET.tod));
  st.game = createGame({ teams, humans: [true, false], quarterLen: opts.drill ? 120 : SET.qlen, difficulty: opts.diff ?? SET.diff, rosters: opts.rosters || null, weather, tod, practice: opts.practice || null, pspot: opts.pspot || 25, drill: !!opts.drill, cel: [SET.cel, -1] });
  st.wx = weather; st.tod = tod;
  st.names = [Auth.user ? Auth.user.name : 'You', 'CPU'];
  R.setTeams(st.game.opts.teams);
  R.setWeather(weather, tod);
  $('#net-badge').classList.add('hidden');
  enterGame();
  $('#hud').classList.toggle('practice', !!st.practice);
  if (st.practice || st.drill) endIntro();
}

function leaveGame() {
  stopSpec();
  if (st.mode === 'spec') st.mode = 'cpu';
  $('#hud').classList.remove('spec');
  st.playing = false; st.game = null; st.snap = null; st.guestBuf = [];
  if (st.peer) { st.peer.close(); st.peer = null; }
  $('#hud').classList.add('hidden'); $('#pause').classList.add('hidden'); $('#gameover').classList.add('hidden');
  for (const m of R.pmeshes.values()) { m.root.visible = false; m.blob.visible = false; }
  if (R.refs) R.refs.forEach(r => { r.root.visible = false; r.blob.visible = false; });
  if (R.flagMesh) R.flagMesh.visible = false;
  $('#intro').classList.add('hidden'); $('#hud').classList.remove('intro'); st.intro = 0; st.introOn = false; clearTimeout(st.introFail);
  $('#chat').classList.add('hidden');
  if (st.replay) stopReplay(); st.hot.open = false; $('#hot').classList.add('hidden'); $('#hud').classList.remove('practice');
  R.ball.visible = false;
  sfx.setSituation('idle'); sfx.startMusic();
  R.setWeather('clear', 'night'); closeChat(); $('#chat-log').innerHTML = '';
  show('menu');
}

// ---------------- input ----------------
const keys = new Set();
let evq = [];
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
window.addEventListener('keydown', (e) => {
  if (typing()) return;
  if (!st.playing) return;
  const k = e.code;
  if (st.mode === 'clip') { if (k === 'Escape') $('#clip-close').click(); return; }
  if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !e.target.closest('.modal')) e.preventDefault();
  if (e.repeat) { keys.add(k); return; }
  keys.add(k);
  if (st.intro > 0) { if (k === 'Space' || k === 'Enter' || k === 'Escape') endIntro(); return; }
  if (k === 'Escape' && st.hot.open) { toggleHot(false); return; }
  if (k === 'Escape' && st.replay) { stopReplay(); return; }
  if (k === 'Escape') { togglePause(); return; }
  if (k === 'KeyT') { e.preventDefault(); openChat(); return; }
  if (st.replay) { if (k === 'Space' || k === 'Enter' || k === 'KeyR') stopReplay(); return; }
  if (k === 'KeyR' && st.snap && st.snap.ph !== 'live' && !st.paused) { startReplay(); return; }
  if (k === 'KeyH' && st.snap && st.snap.ph === 'presnap') { toggleHot(); return; }
  if (st.hot.open) {
    const d = k.startsWith('Digit') ? +k.slice(5) : 0;
    if (d >= 1 && d <= 5) { st.hot.role = HOT_ROLES[d - 1]; sfx.play('ui'); hudCache.hot = null; return; }
    if (d >= 4 && d <= 7) { setHot(d); return; }
    const dir = { ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 }[k];
    if (dir !== undefined) { setHot(dir); return; }
  }
  if (k === 'KeyM') { toast(sfx.toggleMute() ? 'Sound off' : 'Sound on'); return; }
  if (k === 'Minus' || k === 'NumpadSubtract') { zoomCam(1); return; }
  if (k === 'Equal' || k === 'NumpadAdd') { zoomCam(-1); return; }
  if (k === 'KeyC') { SET.cam = SET.cam === 'behind' ? 'player' : SET.cam === 'player' ? 'broadcast' : 'behind'; R.camMode = SET.cam; saveSet(); toast('Camera: ' + ({ behind: 'Follow the ball', player: 'Follow your player', broadcast: 'Sideline' })[SET.cam] + '. Scroll or press - and + to zoom'); return; }
  if (st.paused) return;
  const ev = keyToEvent(k);
  if (ev) pushEv(ev);
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); if (st.charge && st.charge.code === e.code) releaseCharge(); if (st.playing && (e.code === 'Space' || e.code === 'Enter') && !e.target.closest('.modal')) e.preventDefault(); });
window.addEventListener('blur', () => keys.clear());

// ---- throw power: hold a receiver's button to wind up, release to throw. Green = right amount for that distance ----
const CHARGE_T = 1.0;   // seconds to reach full (1.0); holding past it overthrows, auto-throws at 1.4
function throwMeterEl() {
  let el = document.getElementById('throw-meter');
  if (!el) { el = document.createElement('div'); el.id = 'throw-meter'; el.innerHTML = '<div class="tm-zone"></div><div class="tm-fill"></div><span></span>'; document.body.appendChild(el); }
  return el;
}
function chargeNeed(n) {
  const S = st.snap; if (!S) return 0.5;
  const role = ['WR1', 'WR2', 'RB', 'TE', 'WR3'][n - 1];
  const qb = S.pl.find(q => q[0] === st.local && q[2] === 'QB'), r = S.pl.find(q => q[0] === st.local && q[2] === role);
  if (!qb || !r) return 0.5;
  return throwNeed(Math.hypot(r[4] - qb[4], r[5] - qb[5]));
}
function startCharge(n, code) {
  if (st.charge) return;
  st.charge = { n, code, t0: performance.now() };
  sfx.play('ui');
}
function chargePw() { return st.charge ? Math.min(1.4, (performance.now() - st.charge.t0) / 1000 / CHARGE_T) : 0; }
function releaseCharge() {
  const c = st.charge; if (!c) return;
  const pw = chargePw(); st.charge = null;
  const el = document.getElementById('throw-meter'); if (el) el.classList.remove('on');
  const S = st.snap;
  if (S && S.canThrow && S.off === st.local) pushEv({ t: 'throw', n: c.n, pw: Math.round(pw * 100) / 100 });
}
function renderThrowMeter() {
  const el = throwMeterEl(), c = st.charge, S = st.snap;
  if (!c) { el.classList.remove('on'); return; }
  if (!S || !S.canThrow || S.off !== st.local) { st.charge = null; el.classList.remove('on'); return; }
  const pw = chargePw(), need = chargeNeed(c.n);
  if (pw >= 1.4) return releaseCharge();
  el.classList.add('on');
  const pct = v => (v / 1.4 * 100).toFixed(1) + '%';
  el.querySelector('.tm-zone').style.left = pct(Math.max(0, need - 0.14)); el.querySelector('.tm-zone').style.width = pct(0.34);
  const f = el.querySelector('.tm-fill'); f.style.width = pct(pw);
  f.style.background = pw < need - 0.14 ? '#60a5fa' : pw <= need + 0.2 ? '#22c55e' : '#ef4444';
  el.querySelector('span').textContent = `${c.n} · ${pw < 0.45 ? 'touch' : pw > 0.9 ? 'bullet' : 'firm'}`;
}

function pushEv(ev) { if (st.mode === 'guest') { st.peer && st.peer.send({ t: 'ev', ev }, true); } else evq.push(ev); }

function moveVec() {
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (touch.jx || touch.jy) { x = touch.jx; y = touch.jy; }
  if (pad.on && (pad.jx || pad.jy)) { x = pad.jx; y = pad.jy; }
  if (!x && !y) return { mx: 0, mz: 0 };
  const b = R.basis();
  let mx = b.fx * y + b.rx * x, mz = b.fz * y + b.rz * x;
  const l = Math.hypot(mx, mz) || 1;
  return { mx: mx / l, mz: mz / l };
}
const sprinting = () => keys.has('ShiftLeft') || keys.has('ShiftRight') || (pad.on && pad.sprint) || touch.sprint || Math.hypot(touch.jx, touch.jy) > 0.92;

// ---------------- touch controls ----------------
const touch = { jx: 0, jy: 0, sprint: false, id: null, key: '' };
const isTouchDevice = () => ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
const touchOn = () => SET.touch === 'on' || (SET.touch === 'auto' && isTouchDevice());
(() => {
  const joy = $('#joy'), knob = $('.joy-knob', joy);
  const move = (e) => {
    const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
    let dx = (e.clientX - cx) / rad, dy = (e.clientY - cy) / rad; const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    touch.jx = Math.abs(dx) < 0.12 ? 0 : dx; touch.jy = Math.abs(dy) < 0.12 ? 0 : -dy;
    knob.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
  };
  joy.addEventListener('pointerdown', (e) => { touch.id = e.pointerId; joy.setPointerCapture(e.pointerId); move(e); sfx.init(); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === touch.id) move(e); });
  const end = (e) => { if (e.pointerId !== touch.id) return; touch.id = null; touch.jx = touch.jy = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
})();
function touchButtons(S) {
  const me = st.local;
  let btns = [];
  if (S.ph === 'presnap') btns = S.poss === me ? [['snap', 'SNAP', 'big'], ['timeout', 'T/O']] : [['switch', 'SWITCH'], ['timeout', 'T/O']];
  else if (S.ph === 'kickset' && S.poss === me) btns = [['kick', 'KICK', 'big']];
  else if (S.ph === 'live') {
    const carrier = S.b[3] === 0 ? S.b[5] : -1, iCarry = carrier >= 0 && carrier === S.ctrl[me];
    if (S.canThrow && S.off === me) btns = [['t1', '1', 'r1'], ['t2', '2', 'r2'], ['t3', '3', 'r3'], ['t4', '4', 'r4'], ['t5', '5', 'r5'], ['sprint', 'SPRINT', 'hold']];
    else if (iCarry) btns = [['juke', 'JUKE'], ['spin', 'SPIN'], ['stiff', 'STIFF'], ['truck', 'TRUCK'], ['hurdle', 'HURDLE'], ['cdive', 'DIVE'], ['slide', 'DOWN'], ['sprint', 'SPRINT', 'hold']];
    else if (S.b[3] === 1 && S.b[4]) btns = [['playball', S.off === me ? 'CATCH' : 'PLAY BALL', 'big'], ...(S.off === me ? [['rdive', 'DIVE']] : []), ['switch', 'SWITCH'], ['sprint', 'SPRINT', 'hold']];
    else btns = [['dive', 'DIVE', 'big'], ...(carrier >= 0 && S.off !== me ? [['hitstick', 'HIT STICK']] : []), ['switch', 'SWITCH'], ['sprint', 'SPRINT', 'hold']];
  }
  const key = btns.map(b => b[0]).join();
  if (touch.key === key) return;
  touch.key = key;
  const box = $('#tbtns'); box.innerHTML = '';
  for (const [id, label, cls] of btns) {
    const b = document.createElement('button'); b.className = 'tbtn ' + (cls || ''); b.textContent = label;
    if (cls === 'hold') {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.sprint = true; b.classList.add('down'); });
      const up = () => { touch.sprint = false; b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    } else b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sfx.init();
      const v = moveVec();
      if (id[0] === 't' && id.length === 2) { startCharge(+id[1], 'touch' + id[1]); const rel = () => { if (st.charge && st.charge.code === 'touch' + id[1]) releaseCharge(); }; b.addEventListener('pointerup', rel, { once: true }); b.addEventListener('pointerleave', rel, { once: true }); b.addEventListener('pointercancel', rel, { once: true }); return; }
      const ev = id === 'snap' ? { t: 'snap' } : id === 'juke' ? { t: 'juke', x: v.mx, z: v.mz } : { t: id };
      pushEv(ev);
    });
    box.appendChild(b);
  }
}

function keyToEvent(k) {
  const S = st.snap; if (!S) return null;
  const me = st.local, onOff = S.poss === me;
  const digit = k.startsWith('Digit') ? +k.slice(5) : k.startsWith('Numpad') ? +k.slice(6) : 0;
  if (S.ph === 'half') return k === 'Space' || k === 'Enter' ? { t: 'ready' } : null;
  if (S.ph === 'kickset') return onOff && (k === 'Space' || k === 'Enter') ? { t: 'kick' } : null;
  if (k === 'KeyV' && (S.ph === 'presnap' || S.ph === 'dead' || S.ph === 'live')) {
    if (!((S.to || [0, 0])[me] > 0)) { toast('No timeouts left'); return null; }
    if (S.mode === 'practice') return null;
    if (S.ph === 'live') toast('Timeout called: the clock stops when this play ends', 1600);
    return { t: 'timeout' };
  }
  if (S.ph === 'presnap') {
    if (k === 'KeyZ') { switchTab(-1); return null; }
    if (k === 'KeyX') { switchTab(1); return null; }
    if (digit >= 1 && digit <= PER_TAB) return pickCard(digit);
    if (onOff) {
      if (k === 'KeyP' && !(S.sp && S.sp.pat)) { sfx.play('ui'); return { t: 'play', id: 'punt' }; }
      if (k === 'KeyF' && S.sp && S.sp.fg) { sfx.play('ui'); return { t: 'play', id: 'fg' }; }
      if (k === 'Space' || k === 'Enter') return { t: 'snap' };
    } else if (k === 'KeyQ' || k === 'Tab') return { t: 'switch' };
    return null;
  }
  if (S.ph !== 'live') return null;
  if (digit >= 1 && digit <= 5 && S.canThrow && S.off === me) { startCharge(digit, k); return null; }
  if (k === 'KeyQ' || k === 'Tab') return { t: 'switch' };
  const carrier = S.b[3] === 0 ? S.b[5] : -1;
  const iCarry = carrier >= 0 && carrier === S.ctrl[me];
  if (k === 'KeyE') return iCarry ? { t: 'spin' } : { t: 'playball' };
  if (k === 'KeyR' && iCarry) return { t: 'stiff' };
  if (k === 'KeyB' && iCarry) return { t: 'truck' };
  if (k === 'KeyF' && iCarry) return { t: 'hurdle' };
  if (k === 'KeyX' && iCarry) return { t: 'cdive' };
  if (k === 'KeyX' && !iCarry && S.b[3] === 1 && S.off === me) return { t: 'rdive' };
  if (k === 'KeyG' && iCarry) return { t: 'slide' };
  if ((k === 'KeyH' || k === 'KeyR') && !iCarry && carrier >= 0 && S.off !== me) return { t: 'hitstick' };
  if (k === 'Space') {
    const v = moveVec();
    if (iCarry) return { t: 'juke', x: v.mx, z: v.mz };
    if (S.b[3] === 1) return { t: 'playball' };
    return { t: 'dive' };
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!st.playing || st.paused || !st.snap || st.intro > 0) return;
  const id = R.pick(e.clientX, e.clientY, st.snap, st.local);
  if (id >= 0) pushEv({ t: 'pick', id });
});
canvas.tabIndex = 0;

$('#pc-timeout').addEventListener('click', () => { if (st.snap && (st.snap.to || [0, 0])[st.local] > 0) pushEv({ t: 'timeout' }); });
$('#km-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.init(); pushEv({ t: 'kick' }); });

// ---------------- hot routes (press H at the line) ----------------
st.hot = { open: false, role: 'WR1' };
const HOT_ROLES = ['WR1', 'WR2', 'RB', 'TE', 'WR3'];
const HOT_NAME = r => r === 'RB' ? 'HB' : r === 'TE' ? 'TE' : r === 'WR3' ? 'Slot' : 'WR ' + r[2];
const RCOLS = { WR1: '#22c55e', WR2: '#3b82f6', RB: '#f97316', TE: '#a855f7', WR3: '#eab308', QB: '#e5e7eb' };
const HOT_LABELS = { TE: [['go', 'Seam'], ['in', 'Slant'], ['out', 'Out'], ['curl', 'Stick'], ['post', 'Post'], ['corner', 'Corner'], ['drag', 'Drag'], ['block', 'Stay in'], ], WR: [['go', 'Go'], ['in', 'Slant'], ['out', 'Out'], ['curl', 'Curl'], ['post', 'Post'], ['corner', 'Corner'], ['drag', 'Drag'], ['comeback', 'Comeback']], RB: [['wheel', 'Wheel'], ['flat', 'Flat'], ['curl', 'Check down'], ['block', 'Block'], ['angle', 'Angle'], ['swing', 'Swing'], ['seam', 'Seam'], ['texas', 'Texas']] };
const HOT_KEYS = ['↑', '←', '→', '↓', '4', '5', '6', '7'];
const hotOk = S => S && S.ph === 'presnap' && S.poss === st.local && S.opDef && S.opDef.type === 'pass' && !(S.sp && S.sp.pat);
function toggleHot(force) {
  const S = st.snap; const open = force !== undefined ? force : !st.hot.open;
  if (open && !hotOk(S)) { toast(S && S.poss === st.local ? 'Pick a pass play first, then press H' : 'Hot routes are for the offense'); return; }
  st.hot.open = open; hudCache.hot = null; sfx.play('ui');
}
function setHot(i) { const g = st.hot.role === 'RB' ? 'RB' : st.hot.role === 'TE' ? 'TE' : 'WR'; const kind = HOT_LABELS[g][i][0]; pushEv({ t: 'hot', role: st.hot.role, kind }); sfx.play('ui'); hudCache.hot = null; }
function renderHot(S) {
  const el = $('#hot');
  if (st.hot.open && !hotOk(S)) st.hot.open = false;
  el.classList.toggle('hidden', !st.hot.open);
  if (!st.hot.open) return;
  const key = st.hot.role + '|' + (S.opDef.hot || []).join();
  if (hudCache.hot === key) return; hudCache.hot = key;
  const g = st.hot.role === 'RB' ? 'RB' : st.hot.role === 'TE' ? 'TE' : 'WR', arrows = HOT_KEYS;
  el.innerHTML = `<h4>Hot route</h4><div class="who">${HOT_ROLES.map((r, i) => `<button data-r="${r}" class="${r === st.hot.role ? 'on' : ''}" style="--rc:${RCOLS[r]}"><kbd>${i + 1}</kbd>${HOT_NAME(r)}</button>`).join('')}</div>
    <div class="kinds">${HOT_LABELS[g].map((h, i) => `<button data-k="${i}"><kbd>${arrows[i]}</kbd>${h[1]}</button>`).join('')}</div><small>Changed: ${(S.opDef.hot || []).map(HOT_NAME).join(', ') || 'nothing yet'}. Press H or Esc when you're done.</small>`;
  $$('[data-r]', el).forEach(b => b.onclick = () => { st.hot.role = b.dataset.r; hudCache.hot = null; sfx.play('ui'); });
  $$('[data-k]', el).forEach(b => b.onclick = () => setHot(+b.dataset.k));
}

// ---------------- instant replay (CPU games: press R between plays) ----------------
function startReplay() {
  if (st.mode !== 'cpu') { toast('Instant replay works in games against the CPU'); return; }
  const rec = st.rec || []; let id = -1;
  for (let i = rec.length - 1; i >= 0; i--) if (rec[i].s.ph === 'live') { id = rec[i].s.id; break; }
  if (id < 0) { toast('Nothing to replay yet'); return; }
  let frames = rec.filter(f => f.s.id === id && (f.s.ph === 'live' || f.s.ph === 'kick' || f.s.ph === 'dead'));
  let dead = 0; frames = frames.filter(f => { if (f.s.ph === 'dead') dead += f.dt; return dead < 1.4; });
  if (frames.length < 5) { toast('Nothing to replay yet'); return; }
  st.replay = { frames, i: 0, t: 0, ang: Math.random() * 6 };
  $('#hud').classList.add('replaying'); $('#replay-badge').classList.remove('hidden'); $('#pause').classList.add('hidden'); st.paused = false;
  sfx.play('whistle');
}
function stopReplay() { st.replay = null; $('#hud').classList.remove('replaying'); $('#replay-badge').classList.add('hidden'); R.snapCamera(); hudCache = {}; }
function stepReplay(dt) {
  const r = st.replay, sp = r.clip ? 0.85 : 0.55; r.t += dt * sp;
  let acc = 0, i = 0; while (i < r.frames.length - 1 && acc + r.frames[i].dt < r.t) { acc += r.frames[i].dt; i++; }
  if (i >= r.frames.length - 1 && r.t > acc + 0.3) { if (r.clip) { r.t = 0; r.cx = undefined; return null; } stopReplay(); return null; }
  const S = r.frames[i].s;
  R.update(S, dt * sp, st.local);
  r.ang += dt * 0.35;
  const bx = S.b[0], bz = S.b[2];
  r.cx = r.cx === undefined ? bx : r.cx + (bx - r.cx) * Math.min(1, dt * 3); r.cz = r.cz === undefined ? bz : r.cz + (bz - r.cz) * Math.min(1, dt * 3);
  R.cam.position.set(r.cx + Math.sin(r.ang) * 10, 4.2, r.cz + Math.cos(r.ang) * 10); R.cam.lookAt(r.cx, 1.1, r.cz);
  return S;
}

// ---------------- controller context ----------------
function padContext() {
  if (!st.playing) return 'menu';
  if (st.mode === 'clip') return 'replay';
  if (!$('#gameover').classList.contains('hidden')) return 'over';
  if (st.paused || !$('#pause').classList.contains('hidden')) return 'paused';
  if (st.replay) return 'replay';
  const S = st.snap; if (!S) return 'menu';
  const me = st.local;
  if (S.ph === 'presnap') return S.poss === me ? 'presnapOff' : 'presnapDef';
  if (S.ph === 'kickset') return 'kick';
  if (S.ph === 'half') return 'half';
  if (S.ph !== 'live') return 'dead';
  const carrier = S.b[3] === 0 ? S.b[5] : -1;
  if (S.canThrow && S.off === me) return 'pass';
  if (carrier >= 0 && carrier === S.ctrl[me]) return 'carry';
  if (S.b[3] === 1 && S.off === me) return 'air';
  return 'def';
}
let padCard = -1;
function cardNav(i) {
  const cards = $$('#pc-cards .pc-card'); if (!cards.length) return;
  if (i === 12 || i === 13) { switchTab(i === 12 ? -1 : 1); padCard = 0; }
  else padCard = Math.max(0, Math.min(cards.length - 1, (padCard < 0 ? 0 : padCard) + (i === 15 ? 1 : -1)));
  const list = $$('#pc-cards .pc-card'); list.forEach((c, k) => c.classList.toggle('padfocus', k === padCard));
  if (list[padCard]) list[padCard].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function cardPickFocused() {
  const list = $$('#pc-cards .pc-card'), c = list[padCard];
  if (!c || c.classList.contains('on')) return false;
  c.click(); return true;
}

// ---------------- clips ----------------
function playClip(frames) {
  const s0 = frames[0].s;
  $$('.screen').forEach(x => x.classList.remove('active')); st.screen = 'game';
  st.mode = 'clip'; st.local = 0; st.playing = true; st.paused = false; st.game = null; st.intro = 0;
  R.setTeams(s0.teams); if (s0.wx) R.setWeather(s0.wx, s0.tod || 'night');
  $('#hud').classList.add('hidden'); $('#gameover').classList.add('hidden'); $('#pause').classList.add('hidden');
  sfx.stopMusic();
  st.replay = { frames, i: 0, t: 0, ang: Math.random() * 6, clip: true };
}
function stopClip(back) {
  st.replay = null; st.mode = 'cpu';
  leaveGame();
  if (back && back !== 'menu' && back !== 'game') show(back);
}

// ---------------- chat (online games, press T) ----------------
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'retard', 'whore', 'slut', 'dick', 'pussy', 'kys'];
const cleanText = t => { let out = String(t).replace(/[<>]/g, ''); for (const w of BAD) out = out.replace(new RegExp(w + '\\w*', 'gi'), m => m[0] + '*'.repeat(m.length - 1)); return out; };
const clean = t => { let out = String(t).replace(/[<>]/g, '').slice(0, 120); for (const w of BAD) out = out.replace(new RegExp(w + '\\w*', 'gi'), m => m[0] + '*'.repeat(m.length - 1)); return out; };
let chatLast = 0;
function openChat() {
  if (st.mode === 'cpu') { toast('Chat works in online games'); return; }
  if (!SET.chat) { toast('Chat is muted. Unmute it in the pause menu'); return; }
  keys.clear();
  $('#chat').classList.add('open'); $('#chat-form').classList.remove('hidden');
  setTimeout(() => $('#chat-in').focus(), 0);
}
function closeChat() { $('#chat').classList.remove('open'); $('#chat-form').classList.add('hidden'); $('#chat-in').value = ''; $('#chat-in').blur(); canvas.focus(); }
function chatLine(cls, who, text) {
  const log = $('#chat-log'), p = document.createElement('p'); p.className = cls;
  p.innerHTML = who ? `<b>${escapeHtml(who)}</b>${escapeHtml(text)}` : escapeHtml(text);
  log.appendChild(p); while (log.children.length > 8) log.firstChild.remove();
  setTimeout(() => p.classList.add('old'), 9000);
}
function chatRx(m) {
  if (!SET.chat || !st.playing) return;
  const now = Date.now(); if (now - (chatRx.t || 0) < 600) return; chatRx.t = now;
  chatLine('them', st.names[1 - st.local] || 'Opponent', clean(m.m || ''));
  sfx.play('ui');
}
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = clean($('#chat-in').value.trim());
  if (t && st.peer) {
    if (Date.now() - chatLast < 1200) { chatLine('sys', '', 'Slow down a little.'); }
    else { chatLast = Date.now(); st.peer.send({ t: 'chat', m: t }, true); chatLine('me', st.names[st.local] || 'You', t); }
  }
  closeChat();
});
$('#chat-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closeChat(); } });
$('#chat-in').addEventListener('keyup', (e) => e.stopPropagation());

// ---------------- pause / game over ----------------
function togglePause(force) {
  if (st.overShown) return;
  const open = force !== undefined ? force : $('#pause').classList.contains('hidden');
  $('#pause').classList.toggle('hidden', !open);
  st.paused = open && st.mode === 'cpu';
  if (st.paused) { sfx.setSituation('idle'); if (window.speechSynthesis) speechSynthesis.cancel(); }
  $('#p-cam-l').textContent = CAM_NAME[SET.cam] || 'Follow ball';
  $('#quit').textContent = st.mode === 'cpu' ? 'Quit to menu' : 'Leave online game';
  $('#p-chat').classList.toggle('hidden', st.mode === 'cpu');
  $('#p-replay').classList.toggle('hidden', st.mode !== 'cpu' || !st.snap || st.snap.ph === 'live');
  if (st.practice) $('#quit').textContent = 'Leave practice'; $('#p-chat').textContent = SET.chat ? 'Mute chat' : 'Unmute chat';
}
$('#pause-btn').addEventListener('click', () => togglePause());
$('#resume').addEventListener('click', () => togglePause(false));
$('#p-howto').addEventListener('click', () => { $('#pause').classList.add('hidden'); show('howto'); });
$('#p-settings').addEventListener('click', () => { $('#pause').classList.add('hidden'); show('settings'); });
$('#p-replay').addEventListener('click', () => { togglePause(false); startReplay(); });
const CAM_NAME = { behind: 'Follow ball', player: 'Follow you', broadcast: 'Sideline' };
$('#p-cam').addEventListener('click', () => { SET.cam = SET.cam === 'behind' ? 'player' : SET.cam === 'player' ? 'broadcast' : 'behind'; R.camMode = SET.cam; saveSet(); $('#p-cam-l').textContent = CAM_NAME[SET.cam]; });
$('#quit').addEventListener('click', () => leaveGame());
$('#p-chat').addEventListener('click', () => { SET.chat = !SET.chat; saveSet(); $('#p-chat').textContent = SET.chat ? 'Mute chat' : 'Unmute chat'; if (!SET.chat) $('#chat-log').innerHTML = ''; });
$('#go-menu').addEventListener('click', () => leaveGame());
$('#go-clip').addEventListener('click', () => saveClip(st.rec));
$('#p-clip').addEventListener('click', () => saveClip(st.rec));
$('#go-again').addEventListener('click', () => {
  $('#gameover').classList.add('hidden');
  if (st.mode === 'cpu' && st.seasonGame) { leaveGame(); show('season'); return; }
  if (st.mode === 'cpu' && st.franchiseGame) { leaveGame(); show('franchise'); return; }
  else if (st.mode === 'cpu') { const o = st.lastCpu || {}; if (o.drill) o.teams = [o.teams[0], randOpp()]; startCPU(o); }
  else if (st.mode === 'host') { startHostGame(); }
  else toast('Waiting for the host to start a rematch…');
});

function potg(S) {
  const ps = S.ps || []; if (!ps.length) return '';
  const score = p => p.py / 25 + p.ptd * 4 + p.ry / 10 + p.recy / 10 + p.rec * 0.5 + p.td * 6 + p.tk + p.sk * 3 + p.int * 5;
  const best = ps.slice().sort((a, b) => score(b) * (b.t === S.win ? 1.15 : 1) - score(a) * (a.t === S.win ? 1.15 : 1))[0];
  if (!best || score(best) <= 0) return '';
  const T = TEAMS[S.teams[best.t]];
  const line = [best.py && `${best.py} pass yds, ${best.ptd} TD`, best.ry && `${best.ry} rush yds`, best.rec && `${best.rec} catches, ${best.recy} yds`, best.td && !best.ptd && `${best.td} TD`, best.tk && `${best.tk} tackles`, best.sk && `${best.sk} sacks`, best.int && `${best.int} INT`].filter(Boolean).slice(0, 3).join(', ');
  return `<img alt="" src="${portraitURL(best.face, T.jersey, T.trim, 152)}"><div><small>Player of the game</small><b>${escapeHtml(best.n)}</b><span>${best.pos}, ${T.abbr}. ${line}</span></div>`;
}
function highlightsHTML(S) {
  const h = (S.hls || []).slice(-6).reverse(); if (!h.length) return '';
  return `<h4>Highlights</h4>${h.map(x => `<div><span>${x.q >= 5 ? 'OT' : 'Q' + x.q} ${fmtClock(x.clk)}</span><span><b>${escapeHtml(x.text)}</b> <em>${escapeHtml(x.sub)}, ${TEAMS[S.teams[x.team]].abbr}</em></span></div>`).join('')}`;
}
const NO_REWARDS_HTML = '<div class="gr-head"><b>Rewards</b></div><p class="note">Games against the CPU in Quick Play, Season and practice are just for fun: no coins, XP, rank or leaderboard stats. Play <b>Online 1v1</b>, <b>Ultimate Team</b> or <b>Franchise</b> to earn them.</p>';
// opponent rage quit mid-game: you get the win, the XP and the rank points (no leaderboard stats, the game wasn't finished)
function forfeitWin() {
  const S = st.snap;
  if (!S || st.rewarded || isGuest() || st.mode === 'spec' || !(st.mode === 'host' || st.mode === 'guest') || S.mode !== 'game') return;
  if ((performance.now() - (st.startedAt || performance.now())) / 1000 < 45) return;   // left during the intro: no free wins
  st.rewarded = true;
  const me = st.local, other = 1 - me;
  try { awardGame({ mode: 'online', ut: !!st.ut, res: 'W', diff: 1, qlen: S.ql, sc: [S.sc[me], S.sc[other]], me: S.st[me], opp: S.st[other] }); setTimeout(() => toast('Your opponent quit. You get the win, XP and rank points.', 3500), 600); } catch (e) { console.warn(e); }
}
function showGameOver(S) {
  st.overShown = true;
  const me = st.local, other = 1 - me;
  if (st.mode === 'spec') { st.rewarded = true; st.resultSaved = true; st.seasonSaved = true; }
  $('#go-potg').innerHTML = S.mode === 'drill' ? '' : potg(S);
  $('#go-hl').innerHTML = highlightsHTML(S);
  if (S.mode === 'drill') {
    $('#go-res').textContent = 'DRILL OVER'; $('#go-res').className = 'go-res win';
    $('#go-score').innerHTML = `${S.sc[0]} <small style="font-size:24px">POINTS</small>`;
    $('#go-stats').innerHTML = ''; $('#go-rec').textContent = '';
    if (!st.rewarded) { st.rewarded = true; $('#go-rewards').innerHTML = NO_REWARDS_HTML; }
    $('#go-again').textContent = 'Run it again';
    $('#gameover').classList.remove('hidden'); sfx.play(S.sc[0] ? 'td' : 'final');
    return;
  }
  const res = S.win === -1 ? 'T' : S.win === me ? 'W' : 'L';
  const el = $('#go-res');
  el.textContent = res === 'W' ? 'VICTORY' : res === 'L' ? 'DEFEAT' : 'TIE GAME';
  el.className = 'go-res ' + (res === 'W' ? 'win' : res === 'L' ? 'loss' : '');
  const T = S.teams.map(i => TEAMS[i]);
  $('#go-score').innerHTML = `<span style="color:${T[0].jersey === '#121a14' ? '#18c964' : T[0].jersey}">${T[0].abbr}</span> ${S.sc[0]} – ${S.sc[1]} <span style="color:${T[1].jersey === '#121a14' ? '#18c964' : T[1].jersey}">${T[1].abbr}</span>`;
  const s = S.st;
  const rows = [['Passing', s[0].passYds, s[1].passYds], ['Comp/Att', `${s[0].comp}/${s[0].att}`, `${s[1].comp}/${s[1].att}`], ['Rushing', s[0].rushYds, s[1].rushYds],
    ['First downs', s[0].firstDowns, s[1].firstDowns], ['Touchdowns', s[0].tds, s[1].tds], ['Interceptions thrown', s[0].ints, s[1].ints], ['Sacks', s[0].sacks, s[1].sacks], ['Penalties', `${s[0].pens || 0}-${s[0].penYds || 0}`, `${s[1].pens || 0}-${s[1].penYds || 0}`]];
  $('#go-stats').innerHTML = `<tr><th>${T[0].abbr}</th><th></th><th>${T[1].abbr}</th></tr>` + rows.map(r => `<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('');
  $('#go-again').textContent = st.mode === 'guest' ? 'Rematch (host starts)' : st.seasonGame ? 'Back to season' : st.franchiseGame ? 'Back to franchise' : 'Play again';
  $('#go-again').classList.toggle('hidden', st.mode === 'spec');
  if (st.franchiseGame && !st.seasonSaved) {
    st.seasonSaved = true;
    const F = Fr.load();
    if (F && F.phase === 'season') {
      const ups = Fr.recordResult(F, S.sc[0], S.sc[1], S.ps || [], 0);
      const done = F.phase !== 'season';
      setTimeout(() => toast(done ? `Season over. ${F.history[0] && F.history[0].champ ? 'KINGS BOWL CHAMPIONS!' : 'Time for the offseason.'}` : ups.length ? 'Progression: ' + ups.slice(0, 3).join(', ') : `Record: ${F.season.standings[F.team].w}-${F.season.standings[F.team].l}`, 4000), 400);
    }
  }
  if (st.seasonGame && !st.seasonSaved) {
    st.seasonSaved = true;
    const SS = loadSeason();
    if (SS) {
      Season.finishWeek(SS, S.sc[0], S.sc[1]); saveSeason(SS);
      if (SS.phase === 'done' && SS.champion === SS.team) unlockAch('champ');
      const note = SS.phase === 'done' ? (SS.champion === SS.team ? '🏆 KINGS BOWL CHAMPIONS!' : 'Season over.') : `Season record: ${SS.standings[SS.team].w}-${SS.standings[SS.team].l}${SS.standings[SS.team].t ? '-' + SS.standings[SS.team].t : ''}`;
      setTimeout(() => toast(note, 3500), 400);
    }
  }
  if (!st.rewarded && isGuest() && !LOCALNET) { st.rewarded = true; $('#go-rewards').innerHTML = '<div class="gr-head"><b>Rewards</b></div><p class="note">Guests don\'t earn coins, XP or rank. <button class="link" id="go-signup">Make a free account</button> and this game would have paid out.</p>'; setTimeout(() => { const b = $('#go-signup'); if (b) b.onclick = () => lockPrompt(''); }); }
  // like Madden: coins, XP, rank and leaderboard stats come from Online 1v1, Ultimate Team and Franchise. Quick Play,
  // Season, practice and drills against the CPU are just for fun.
  const paid = S.mode === 'game' && (st.mode === 'host' || st.mode === 'guest' || st.ut || st.franchiseGame);
  if (!st.rewarded && !paid && !isGuest()) { st.rewarded = true; $('#go-rewards').innerHTML = NO_REWARDS_HTML; }
  if (!st.statsPosted && paid && !isGuest()) {
    st.statsPosted = true;
    const P = profile();
    postGameStats({ res, ps: S.ps || [], st: S.st, me, lvl: P ? P.p.lvl : 1, rp: P ? P.p.rp : 0, secs: (performance.now() - (st.startedAt || performance.now())) / 1000, qlen: S.ql, ac: (S.ac && S.ac.n) || (P && P.tampered ? 1 : 0), acWhy: (S.ac && S.ac.why) || (P && P.tampered ? 'save file was edited' : ''), ut: !!st.ut, pts: S.sc[me], online: st.mode === 'host' || st.mode === 'guest', fr: !!st.franchiseGame });
    if (P && P.tampered) { P.tampered = false; P.p.tampered = 0; P.save(); }
  }
  if (!st.rewarded) {
    st.rewarded = true;
    const mine = S.st[me], theirs = S.st[other];
    try {
      $('#go-rewards').innerHTML = awardGame({ mode: st.mode === 'cpu' ? (st.franchiseGame ? 'franchise' : st.ut ? 'ut' : 'cpu') : 'online', ut: !!st.ut, solo: st.solo, res, diff: st.mode === 'cpu' ? (st.game && st.game.opts && st.game.opts.difficulty != null ? st.game.opts.difficulty : SET.diff) : 1, qlen: S.ql, sc: [S.sc[me], S.sc[other]], me: mine, opp: theirs });
    } catch (e) { console.warn(e); $('#go-rewards').innerHTML = ''; }
  }
  $('#gameover').classList.remove('hidden');
  if (!st.resultSaved && Auth.user) {
    st.resultSaved = true;
    const counted = S.mode === 'game' && (st.mode === 'host' || st.mode === 'guest' || st.ut || st.franchiseGame);
    (counted && Auth.user.kind !== 'account' ? Auth.recordResult(res) : Promise.resolve()).then(() => {
      const u = Auth.user;
      // the record for the mode you just played; CPU quick play and seasons don't count toward any record
      const online = st.mode === 'host' || st.mode === 'guest', kinds = [online && 'on', st.ut && 'ut', st.franchiseGame && 'fr'].filter(Boolean);
      const P = profile();
      if (P && kinds.length && S.mode === 'game') {
        P.p.recs = P.p.recs || {};
        for (const k of kinds) { const r = P.p.recs[k] = P.p.recs[k] || [0, 0, 0]; r[res === 'W' ? 0 : res === 'L' ? 1 : 2]++; }
        P.save();
      }
      const NAME = { on: 'Online 1v1', ut: 'Ultimate Team', fr: 'Franchise' };
      const SV = { on: ['on_w', 'on_l', 'on_t'], ut: ['ut_wins', 'ut_l', 'ut_t'], fr: ['fr_w', 'fr_l', 'fr_t'] };
      const draw = () => {
        const line = kinds.map(k => { const r = u.recs ? SV[k].map(f => u.recs[f] || 0) : ((P && P.p.recs && P.p.recs[k]) || [0, 0, 0]); return `${NAME[k]} record: ${r[0]}-${r[1]}${r[2] ? '-' + r[2] : ''}`; }).join(' · ');
        $('#go-rec').textContent = u.kind === 'guest' ? 'Make an account to save your record.' : line || 'CPU games don\'t count toward your record. Play online 1v1, Ultimate Team or Franchise.';
      };
      draw(); setTimeout(draw, 3000);   // the leaderboard copy lands a moment later
    });
  }
  sfx.play(res === 'W' ? 'td' : 'final');
}

// ---------------- HUD ----------------
let hudCache = {};
const setTxt = (sel, v) => { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).textContent = v; } };
const ord = n => ['', '1st', '2nd', '3rd', '4th'][n] || n + 'th';
const fmtClock = c => { c = Math.max(0, Math.ceil(c)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`; };

function routeSvg(play) {
  const f = FORMS[play.form || 'gun'] || FORMS.gun;
  const X = lx => 60 + lx * 2.6, Y = d => 50 - d * 1.35;
  const al = { WR1: f.WR1, WR2: f.WR2, RB: f.RB, QB: f.QB, TE: f.TE || [5.3, -1.15], WR3: f.WR3 || [-8.5, -1.3] };
  const cols = RCOLS;
  let s = `<svg viewBox="0 0 120 64"><line x1="0" y1="${Y(0)}" x2="120" y2="${Y(0)}" stroke="#93c5fd" stroke-width="1" opacity=".6"/>`;
  for (const lx of [-3.5, -1.75, 0, 1.75, 3.5]) s += `<circle cx="${X(lx)}" cy="${Y(-1)}" r="2.2" fill="#cbd5e1"/>`;
  s += `<circle cx="${X(f.QB[0])}" cy="${Y(Math.max(f.QB[1], -10))}" r="2.6" fill="#fff"/>`;
  const all = { ...(play.routes || {}) }; if (play.qbPath) all.QB = play.qbPath;
  for (const [role, pts] of Object.entries(all)) {
    if (!al[role] || !pts.length) continue;
    const p = [al[role], ...pts].map(w => `${X(w[0])},${Y(Math.max(-10, Math.min(w[1], 32)))}`).join(' ');
    const dash = play.type === 'run' && role === 'RB' ? '' : role === 'QB' ? 'stroke-dasharray="3 3"' : '';
    s += `<polyline points="${p}" fill="none" stroke="${cols[role]}" stroke-width="${play.type === 'run' && role !== 'QB' ? 3 : 2.2}" ${dash} stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = pts[pts.length - 1];
    s += `<circle cx="${X(last[0])}" cy="${Y(Math.max(-10, Math.min(last[1], 32)))}" r="2.3" fill="${cols[role]}"/>`;
  }
  for (const r of ['WR1', 'WR2', 'RB', 'TE', 'WR3']) if (!all[r] || !all[r].length) s += `<circle cx="${X(al[r][0])}" cy="${Y(Math.max(al[r][1], -10))}" r="2.4" fill="${cols[r]}" opacity="${(play.block || []).includes(r) ? 1 : .55}"/>`;
  return s + '</svg>';
}
function defSvg(dp) {
  const X = lx => 60 + lx * 2.4, Y = d => 12 + Math.min(d, 34) * 1.45;
  const pos = { DL1: [-3.6, 1], DL4: [-1.1, 1], DL2: [1.1, 1], DL3: [3.6, 1], LB: [0, 5], LB2: [-4.8, 4.8], LB3: [4.8, 4.8], CB1: [-13, 5], CB2: [13, 5], S: [-3, 13], SS: [5, 10] };
  const tgt = { WR1: [-13, 6], WR2: [13, 6], RB: [2, 3], TE: [5.3, 4], WR3: [-8.5, 5] };
  let s = `<svg viewBox="0 0 120 64"><line x1="0" y1="${Y(0)}" x2="120" y2="${Y(0)}" stroke="#93c5fd" opacity=".6"/>`;
  for (const [r, z] of Object.entries(dp.zone || {})) {
    if (!pos[r]) continue;
    const deep = z[1] > 12;
    s += `<ellipse cx="${X(z[0])}" cy="${Y(z[1])}" rx="${deep ? 16 : 11}" ry="${deep ? 7 : 5}" fill="${deep ? '#3b82f6' : '#eab308'}" opacity=".35"/>`;
    s += `<line x1="${X(pos[r][0])}" y1="${Y(pos[r][1])}" x2="${X(z[0])}" y2="${Y(z[1])}" stroke="${deep ? '#60a5fa' : '#facc15'}" stroke-width="1.6"/>`;
  }
 for (const [r, w] of Object.entries(dp.man || {})) if (pos[r] && tgt[w]) s += `<line x1="${X(pos[r][0])}" y1="${Y(pos[r][1])}" x2="${X(tgt[w][0])}" y2="${Y(tgt[w][1])}" stroke="#f87171" stroke-width="1.8" stroke-dasharray="3 2"/>`;
  const rush = ['DL1', 'DL2', 'DL3', 'DL4'].filter(r => !(dp.zone || {})[r]).concat(dp.rush || []).filter(r => pos[r]);
  for (const r of rush) s += `<path d="M${X(pos[r][0])} ${Y(pos[r][1])} L${X(pos[r][0] * 0.6)} ${Y(-2)}" stroke="#f97316" stroke-width="2.2" marker-end=""/><circle cx="${X(pos[r][0] * 0.6)}" cy="${Y(-2)}" r="1.6" fill="#f97316"/>`;
  for (const r of (dp.spy || []).filter(r => pos[r])) s += `<circle cx="${X(pos[r][0])}" cy="${Y(pos[r][1])}" r="5" fill="none" stroke="#a855f7" stroke-width="1.6"/>`;
  for (const r of (dp.deep || []).filter(r => pos[r])) s += `<path d="M${X(pos[r][0])} ${Y(pos[r][1])} L${X(0)} ${Y(20)}" stroke="#60a5fa" stroke-width="1.6"/>`;
  for (const [r, q] of Object.entries(pos)) s += `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="2.5" fill="#fecaca"/>`;
  return s + '</svg>';
}
const PUNT_SVG = `<svg viewBox="0 0 120 64"><path d="M20 54 Q60 -10 104 40" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-dasharray="4 4"/><circle cx="20" cy="54" r="4" fill="#fff"/></svg>`;
const FG_SVG = `<svg viewBox="0 0 120 64"><g stroke="#fde047" stroke-width="3"><path d="M60 60V40M44 40H76M44 40V6M76 40V6"/></g><path d="M60 62 Q58 30 60 14" stroke="#fff" stroke-dasharray="3 4" fill="none" stroke-width="2"/></svg>`;

// custom plays (Play Creator) live on this device
function customPlays() { try { return JSON.parse(localStorage.getItem('ek_custom_plays') || '[]'); } catch (_) { return []; } }

// Build the playbook for whoever is calling the play: tabs of cards
const PER_TAB = 6;
function playbookTabs(S) {
  const me = st.local, onOff = S.poss === me, ti = S.teams[me];
  const book = teamPlaybook(ti, TEAMS[ti]);
  const mine = customPlays();
  const tabs = [];
  if (onOff) {
    const pat = S.sp && S.sp.pat;
    const offIds = book.off.slice();
    const plays = offIds.map(id => OFF_PLAYS.find(p => p.id === id)).filter(Boolean);
    if (book.sig) plays.unshift(book.sig);
    if (pat) tabs.push({ name: 'Extra Point', cards: [{ id: 'xp', name: 'Extra Point', tip: 'Kick it for 1 (94%)', svg: FG_SVG, special: true }] });
    for (const cat of OFF_CATS) {
      if (cat === 'Special') continue;
      const cards = plays.filter(p => p.cat === cat).map(p => ({ id: p.id, name: p.name, tip: (pat ? 'Go for 2. ' : '') + p.tip, svg: routeSvg(p), sig: p.signature }));
      if (cards.length) tabs.push({ name: pat ? cat + ' (2-pt)' : cat, cards });
    }
    const myOff = mine.filter(c => c.side === 'off');
    if (myOff.length) tabs.push({ name: 'My Plays', cards: myOff.map(c => ({ id: c.id, name: c.name, tip: pat ? 'Go for 2' : 'Custom play', svg: routeSvg({ ...c, routes: c.routes || {} }), def: c })) });
    if (!pat) {
      const sp = [];
      if (S.sp && S.sp.fg) sp.push({ id: 'fg', name: 'Field Goal', tip: `${S.sp.fgd} yard attempt`, svg: FG_SVG, special: true });
      sp.push({ id: 'punt', name: 'Punt', tip: 'Flip the field', svg: PUNT_SVG, special: true });
      for (const id of ['fakepunt', 'fakefg']) { const p = OFF_PLAYS.find(q => q.id === id); sp.push({ id, name: p.name, tip: p.tip, svg: routeSvg(p), special: true }); }
      tabs.push({ name: 'Special Teams', cards: sp });
    }
  } else {
    const plays = book.def.map(id => DEF_PLAYS.find(p => p.id === id)).filter(Boolean);
    for (const cat of DEF_CATS) {
      const cards = plays.filter(p => p.cat === cat).map(p => ({ id: p.id, name: p.name, tip: p.tip, svg: defSvg(p) }));
      if (cards.length) tabs.push({ name: cat, cards });
    }
    const myDef = mine.filter(c => c.side === 'def');
    if (myDef.length) tabs.push({ name: 'My Plays', cards: myDef.map(c => ({ id: c.id, name: c.name, tip: 'Custom defense', svg: defSvg(c.preview || {}), def: c })) });
  }
  // six plays per tab at most: bigger groups split into "Quick 1", "Quick 2"...
  const out = [];
  for (const t of tabs) {
    if (t.cards.length <= PER_TAB) { out.push(t); continue; }
    const n = Math.ceil(t.cards.length / PER_TAB);
    for (let i = 0; i < n; i++) out.push({ name: `${t.name} ${i + 1}`, cards: t.cards.slice(i * PER_TAB, (i + 1) * PER_TAB) });
  }
  return { tabs: out, book, onOff };
}

function buildPlaycall(S) {
  const me = st.local, onOff = S.poss === me;
  if (st.pbSide !== onOff || st.pbPat !== !!(S.sp && S.sp.pat)) { st.pbSide = onOff; st.pbPat = !!(S.sp && S.sp.pat); st.pbTab = 0; }
  const key = `${S.id}-${onOff}-${S.sp && S.sp.pat}-${S.sp && S.sp.fg}-${st.pbTab}`;
  if (hudCache.pcKey === key) return;
  hudCache.pcKey = key;
  const { tabs, book } = playbookTabs(S);
  if (st.pbTab >= tabs.length || st.pbTab < 0) st.pbTab = 0;
  st.pbTabs = tabs;
  $('#pc-book').textContent = onOff ? `${TEAMS[S.teams[me]].abbr} ${book.offName} playbook` : `${TEAMS[S.teams[me]].abbr} ${book.defName} playbook`;
  const tb = $('#pc-tabs'); tb.innerHTML = '';
  tabs.forEach((t, i) => {
    const b = document.createElement('button'); b.className = 'pc-tab' + (i === st.pbTab ? ' on' : ''); b.textContent = t.name;
    b.onclick = () => { st.pbTab = i; sfx.play('ui'); hudCache.pcKey = null; };
    tb.appendChild(b);
  });
  const box = $('#pc-cards'); box.innerHTML = '';
  (tabs[st.pbTab] ? tabs[st.pbTab].cards : []).forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'pc-card' + (c.special ? ' special' : '') + (c.sig ? ' sig' : ''); b.dataset.id = c.id;
    b.innerHTML = `${c.svg}<span class="k">${i + 1}</span>${c.sig ? '<span class="sigtag">SIGNATURE</span>' : ''}<b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.tip)}</small>`;
    b.onclick = () => { sfx.play('ui'); pushEv({ t: 'play', id: c.id, ...(c.def ? { def: c.def } : {}) }); };
    box.appendChild(b);
  });
  box.scrollLeft = 0;
  hudCache.pcSel = null;
}
function pickCard(n) {
  const t = st.pbTabs && st.pbTabs[st.pbTab]; if (!t) return null;
  const c = t.cards[n - 1]; if (!c) return null;
  sfx.play('ui');
  return { t: 'play', id: c.id, ...(c.def ? { def: c.def } : {}) };
}
function switchTab(d) {
  if (!st.pbTabs || !st.pbTabs.length) return;
  st.pbTab = (st.pbTab + d + st.pbTabs.length) % st.pbTabs.length; hudCache.pcKey = null; sfx.play('ui');
}

// controller prompts: same hints, controller buttons instead of keys
function padHint(items) {
  const g = glyphs(), c = padContext();
  const M = {
    pass: { '1 2 3 4 5': `${g.A} ${g.B} ${g.X} ${g.Y} ${g.RB}`, 'W A S D': g.LS, Shift: g.RT },
    carry: { Space: g.RS + ' flick', E: g.B, R: g.A, B: g.RB, F: g.Y, X: g.X, G: g.LB, Shift: g.RT },
    air: { 'W A S D': g.LS, E: g.Y, Q: g.B, Shift: g.RT },
    def: { Space: g.X, Q: g.B, Shift: g.RT, E: g.Y },
  }[c] || {};
  const G = { Esc: g.Menu, C: g.R3, R: g.X, T: '' };
  return items.map(([k, t]) => [M[k] || G[k] || k, t]).filter(([k]) => k);
}
function hint(items) {
  if (pad.on) items = padHint(items);
  const html = items.map(([k, t]) => `<span>${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}${t}</span>`).join('');
  if (hudCache.hint !== html) { hudCache.hint = html; $('#hint').innerHTML = html; }
}

function renderHalftime(S) {
  const el = $('#halftime'), me = st.local;
  const T = S.teams.map(i => TEAMS[i]), tn = st.teamNames || [];
  if (hudCache.htKey !== S.id + '|' + (S.hr || []).join()) {
    hudCache.htKey = S.id + '|' + (S.hr || []).join();
    const ps = S.ps || [];
    const best = (t, f) => ps.filter(p => p.t === t).sort((a, b) => f(b) - f(a))[0];
    const ldr = (t, f, label, line) => { const p = best(t, f); if (!p || f(p) <= 0) return ''; return `<div class="ldr"><img alt="" src="${portraitURL(p.face, T[t].jersey, T[t].trim, 104)}"><div><b>${escapeHtml(p.n)} <small>${p.pos}</small></b><small>${label}: ${line(p)}</small></div></div>`; };
    const col = t => `<div class="ht-col" style="--c:${T[t].jersey === '#121a14' ? '#18c964' : T[t].jersey}"><h4>${escapeHtml(tn[t] || T[t].city)} leaders</h4>
      ${ldr(t, p => p.py, 'Passing', p => `${p.py} yds, ${p.ptd} TD`)}${ldr(t, p => p.ry, 'Rushing', p => `${p.ry} yds${p.td ? `, ${p.td} TD` : ''}`)}
      ${ldr(t, p => p.recy, 'Receiving', p => `${p.rec} catches, ${p.recy} yds`)}${ldr(t, p => p.tk + p.sk * 2 + p.int * 3, 'Defense', p => [p.tk && `${p.tk} tkl`, p.sk && `${p.sk} sack`, p.int && `${p.int} INT`].filter(Boolean).join(', '))}
      ${ps.some(p => p.t === t) ? '' : '<p class="note">Nobody has done much yet.</p>'}</div>`;
    const s0 = S.st[0], s1 = S.st[1];
    const rows = [['Total yards', s0.passYds + s0.rushYds, s1.passYds + s1.rushYds], ['Passing', s0.passYds, s1.passYds], ['Rushing', s0.rushYds, s1.rushYds], ['Completions', `${s0.comp}/${s0.att}`, `${s1.comp}/${s1.att}`], ['First downs', s0.firstDowns, s1.firstDowns], ['Sacks', s0.sacks, s1.sacks], ['Turnovers', s0.ints, s1.ints], ['Penalties', `${s0.pens || 0}-${s0.penYds || 0}`, `${s1.pens || 0}-${s1.penYds || 0}`]];
    const ready = S.hr && S.hr[me];
    el.innerHTML = `<div class="ht-box"><h2 class="ht-title">Halftime</h2>
      <div class="ht-score"><span class="tm"><img alt="" src="${logoURL(S.teams[0], 96)}">${T[0].abbr}</span><span class="sc">${S.sc[0]} - ${S.sc[1]}</span><span class="tm">${T[1].abbr}<img alt="" src="${logoURL(S.teams[1], 96)}"></span></div>
      <div class="ht-grid">${col(0)}<div class="ht-col"><h4>First half</h4><table class="ht-stats">${rows.map(r => `<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>${col(1)}</div>
      <div class="ht-foot">${ready ? '<span>Waiting for the other coach…</span>' : '<button class="btn primary" id="ht-go">Start second half</button><span><kbd>Space</kbd></span>'}<span id="ht-left"></span></div></div>`;
    const b = $('#ht-go', el); if (b) b.onclick = () => pushEv({ t: 'ready' });
    hudCache['#ht-left'] = null;
  }
  setTxt('#ht-left', `Second half in ${Math.max(0, Math.ceil((S.hl || 12) - S.pt))}s`);
  if (!st.halfSaid) {
    st.halfSaid = true;
    const lead = S.sc[0] === S.sc[1] ? `All tied up at ${S.sc[0]}` : `${T[S.sc[0] > S.sc[1] ? 0 : 1].city} leads it ${Math.max(...S.sc)} to ${Math.min(...S.sc)}`;
    sfx.say(`That's halftime. ${lead}. Stay with us.`, true); sfx.cheer(0.4, 3);
  }
}

function renderKickMeter(S) {
  const el = $('#kickmeter'), k = S.ks, mine = k && S.poss === st.local;
  el.classList.toggle('hidden', !k);
  if (!k) { hudCache.km = null; return; }
  el.classList.toggle('theirs', !mine);
  if (!mine) {   // the other team never sees your aim or power
    if (hudCache.km !== 'theirs') { hudCache.km = 'theirs'; $('#km-title').textContent = k.type === 'punt' ? 'Punt' : k.type === 'xp' ? 'Extra point' : 'Field goal'; $('#km-dist').textContent = k.type === 'punt' ? '' : `${k.fd} yards`; $('#km-step').textContent = 'The other team is lining up the kick…'; $('#km-btn').classList.add('hidden'); }
    return;
  }
  if (hudCache.km !== k.type + k.stage + mine) {
    hudCache.km = k.type + k.stage + mine;
    $('#km-title').textContent = k.type === 'punt' ? 'Punt' : k.type === 'xp' ? 'Extra point' : 'Field goal';
    $('#km-dist').textContent = k.type === 'punt' ? `Leg range about ${Math.round(k.maxR)} yds` : `${k.fd} yards, range ${Math.round(k.maxR)}`;
    const steps = { aim: 'Aim with <kbd>A</kbd> <kbd>D</kbd>, then press <kbd>Space</kbd> to start the kick', power: 'Press <kbd>Space</kbd> to lock your power', acc: 'Press <kbd>Space</kbd> as the needle hits the gold zone' };
    $('#km-step').innerHTML = mine ? steps[k.stage] : 'The other team is kicking';
    $('#km-btn').textContent = k.stage === 'aim' ? 'Start kick' : k.stage === 'power' ? 'Lock power' : 'Kick';
    $('#km-btn').classList.toggle('hidden', !mine);
    const need = k.type === 'punt' ? null : Math.min(1, k.fd / (k.maxR * 1.08) + 0.06);
    $('#km-need').style.display = need ? '' : 'none'; if (need) $('#km-need').style.left = need * 100 + '%';
    const sw = $('#km-sweet'); sw.style.left = Math.max(0, k.sweet - 0.03) * 100 + '%'; sw.style.width = '6%';
  }
  el.classList.toggle('acc', k.stage === 'acc');
  $('#km-fill').style.width = (k.stage === 'power' ? k.m : k.stage === 'acc' ? k.power : 0) * 100 + '%';
  if (k.stage === 'acc') $('#km-acc').style.left = Math.max(0, k.m) * 100 + '%';
  const lim = k.type === 'punt' ? 24 : 14;
  $('#km-aim').style.left = (50 + (k.aim / lim) * 50) + '%';
}

function updateHud(S) {
  const me = st.local;
  const T = S.teams.map(i => TEAMS[i]);
  const htEl = $('#halftime');
  $('#hud').classList.toggle('half-open', S.ph === 'half');
  if (S.ph === 'half') { htEl.classList.remove('hidden'); renderHalftime(S); }
  else if (!htEl.classList.contains('hidden')) { htEl.classList.add('hidden'); hudCache.htKey = null; }
  for (let t = 0; t < 2; t++) {
    const el = $('#sb-t' + t);
    const k = `t${t}`;
    const val = `${T[t].abbr}|${S.sc[t]}|${S.poss === t}`;
    if (hudCache[k] !== val) {
      hudCache[k] = val;
      $('.abbr', el).textContent = T[t].abbr; $('.pts', el).textContent = S.sc[t];
      $('.sb-logo', el).src = logoURL(S.teams[t], 64);
      el.style.setProperty('--tc', T[t].jersey === '#121a14' ? '#18c964' : T[t].jersey);
      el.classList.toggle('has', S.poss === t);
    }
  }
  setTxt('#sb-q', S.mode === 'practice' ? 'PRACTICE' : S.mode === 'drill' ? 'DRILL' : S.q >= 5 ? 'OT' : 'Q' + S.q);
  setTxt('#sb-clk', S.mode === 'practice' ? '--:--' : fmtClock(S.clk));
  if (hudCache.mom !== S.mom) {
    hudCache.mom = S.mom; const m = S.mom || 0, w = Math.abs(m) / 2;
    const f = $('#mom-fill'); f.style.width = w + '%'; f.style.left = m > 0 ? (50 - w) + '%' : '50%';
    const lead = TEAMS[S.teams[m >= 0 ? 0 : 1]]; f.style.setProperty('--mc', lead.jersey === '#121a14' ? '#18c964' : lead.jersey);
  }
  renderHot(S);
  const p = S.poss === 0 ? S.los : 100 - S.los;
  const goal = (S.poss === 0 ? S.fd : 100 - S.fd) >= 100;
  setTxt('#sb-down', S.pat >= 0 ? 'PAT' : `${ord(S.dn)} & ${goal ? 'Goal' : S.tg}`);
  const yl = Math.round(p);
  setTxt('#sb-spot', yl === 50 ? 'MIDFIELD' : yl < 50 ? `${T[S.poss].abbr} ${yl}` : `${T[1 - S.poss].abbr} ${100 - yl}`);
  setTxt('#sb-pc', S.ph === 'presnap' ? String(S.pc) : '');
  $('#sb-pc').classList.toggle('low', S.ph === 'presnap' && S.pc <= 5);

  // banner
  const ban = $('#banner');
  const mtxt = S.msg && S.ph !== 'gameover' ? S.msg.text + '|' + S.msg.sub + '|' + S.msg.big : '';
  if (hudCache.msg !== mtxt) {
    hudCache.msg = mtxt;
    if (mtxt) { sfx.call(S.msg, { team: (S.msg.sub || '').split(' · ')[1] }); $('b', ban).textContent = S.msg.text; $('small', ban).innerHTML = (S.msg.sub || '').split(' · ').filter(Boolean).map(x => `<span>${escapeHtml(x)}</span>`).join(''); ban.className = 'banner show' + (S.msg.big ? ' big' : '') + (S.msg.pen ? ' pen' : ''); }
    else ban.className = 'banner';
  }
  const fl = $('#flash'); const ft = S.flash || '';
  if (hudCache.flash !== ft) { hudCache.flash = ft; sfx.flashCall(ft); fl.textContent = ft; fl.classList.toggle('show', !!ft); }

  // stamina + who you control
  const cp = S.ctrl[me] >= 0 ? S.pl[S.ctrl[me]] : null;
  $('.stam').classList.toggle('show', S.ph === 'live' && !!cp);
  if (cp) $('#stam-bar').style.width = Math.round(cp[9] * 100) + '%';
  { const v = cp && S.ph !== 'gameover' && S.ph !== 'kick' ? `#${cp[3]} ${escapeHtml(cp[11])}<i>${escapeHtml(cp[12])}</i>` : ''; if (hudCache.me !== v) { hudCache.me = v; $('#me-label').innerHTML = v; } }

  // play-the-ball prompt
  let pb = false;
  if (S.ph === 'live' && cp && S.b[3] === 1 && S.b[4] && S.bT >= 0) {
    const dl = Math.hypot(cp[4] - S.b[4][0], cp[5] - S.b[4][1]);
    pb = dl < 6 + S.bT * 4 && !(cp[8] & 2048);
    if (pb) setTxt('#pb-txt', S.off === me ? 'CATCH IT!' : 'PLAY THE BALL!');
  }
  $('#playball').classList.toggle('show', pb);

  // kick meter
  renderKickMeter(S);

  // play call
  const pc = $('#playcall');
  const showPc = S.ph === 'presnap';
  pc.classList.toggle('hidden', !showPc);
  $('#hud').classList.toggle('pc-open', showPc);
  if (showPc) {
    buildPlaycall(S);
    const onOff = S.poss === me;
    const sel = onOff ? S.op : S.dp;
    if (hudCache.pcSel !== sel) { hudCache.pcSel = sel; $$('.pc-card', pc).forEach(c => c.classList.toggle('on', c.dataset.id === sel)); }
    const isCPU = !S.humans[1 - me];
    setTxt('#pc-title', onOff ? (S.pat >= 0 ? 'Kick the extra point or go for 2' : S.dn === 4 ? 'Fourth down, your call' : 'Offense') : 'Defense');
    const waitD = onOff && S.humans[1 - me] && !S.dc;
    const hintHtml = onOff ? (S.op ? (waitD ? '<span>Waiting for the defense to call a play…</span>' : '') + `<span><kbd>Space</kbd> snap</span>${hotOk(S) ? '<span><kbd>H</kbd> hot route</span>' : ''}<span><kbd>Z</kbd><kbd>X</kbd> tabs</span>` : `<span><kbd>1</kbd>–<kbd>${Math.min(PER_TAB, ((st.pbTabs || [])[st.pbTab] || { cards: [] }).cards.length) || 1}</kbd> pick</span><span><kbd>Z</kbd><kbd>X</kbd> tabs</span>`)
      : (isCPU ? '<span>CPU snaps soon</span><span><kbd>Z</kbd><kbd>X</kbd> tabs</span><span><kbd>Q</kbd> switch</span>' : '<span><kbd>Z</kbd><kbd>X</kbd> tabs</span><span><kbd>Q</kbd> switch player</span>');
    if (hudCache.pch !== hintHtml) { hudCache.pch = hintHtml; $('#pc-hint').innerHTML = hintHtml; }
    const clk = $('#pc-clock'), pcv = S.pc;
    if (hudCache.pcv !== pcv) { hudCache.pcv = pcv; $('b', clk).textContent = pcv; clk.classList.toggle('low', pcv <= 5); if (pcv <= 5 && pcv > 0 && S.poss === me) sfx.play('ui'); }
    const tos = (S.to || [3, 3])[me], toKey = tos + '|' + S.mode;
    if (hudCache.to !== toKey) { hudCache.to = toKey; $('#pc-to').innerHTML = [0, 1, 2].map(i => `<i class="${i < tos ? '' : 'used'}"></i>`).join(''); $('#pc-timeout').disabled = !tos || S.mode === 'practice'; }
  }

  // contextual hints
  if (S.ph === 'live') {
    const carrier = S.b[3] === 0 ? S.b[5] : -1;
    const iCarry = carrier >= 0 && carrier === S.ctrl[me];
    if (S.canThrow && S.off === me) hint([['hold 1-5', 'throw: tap = touch, hold = bullet, green = on target'], ['W A S D', 'move'], ['Shift', 'sprint']]);
    else if (iCarry) hint([['Space', 'juke'], ['E', 'spin'], ['R', 'stiff arm'], ['B', 'truck'], ['F', 'hurdle'], ['X', 'dive'], ['G', 'go down'], ['Shift', 'sprint']]);
    else if (S.b[3] === 1 && S.b[4] && S.off === me) hint([['W A S D', 'get to the ring'], ['E', 'aggressive catch'], ['X', 'dive for it']]);
    else if (S.b[3] === 1 && S.b[4]) hint([['E', 'play the ball'], ['Q', 'switch'], ['Shift', 'sprint']]);
    else hint([['Space', 'dive tackle'], ['H', 'hit stick'], ['Q', 'switch'], ['Shift', 'sprint']]);
  } else hint(st.mode === 'cpu' ? [['Esc', 'pause'], ['C', 'camera'], ['- +', 'zoom'], ['R', 'instant replay']] : [['Esc', 'pause'], ['C', 'camera'], ['- +', 'zoom'], ['T', 'chat']]);
  const tOn = touchOn();
  $('#touch').classList.toggle('hidden', !tOn || S.ph === 'gameover');
  $('#hud').classList.toggle('touch-mode', tOn);
  if (tOn) touchButtons(S);
}

// ---------------- online ----------------
let onlineTeam = SET.team;
function renderOnline() {
  teamCard($('#tp-online .team-card'), onlineTeam);
  seg($('#seg-qlen2'), QLENS, SET.qlen, v => { SET.qlen = v; saveSet(); });
  const warn = $('#online-warn');
  let w = '';
  if (isBanned()) w = 'Your account is banned, so online play is off.';
  else if (!Auth.configured() && !LOCALNET) w = 'Online 1v1 needs the free Supabase setup first. Open <b>README.md</b> → Step 2, paste your keys into <code>js/config.js</code>, and push to GitHub.';
  else if (Auth.user && Auth.user.kind === 'guest' && !LOCALNET) w = 'Make a free account to play online (Log out → Sign up).';
  warn.innerHTML = w; warn.classList.toggle('hidden', !w);
  $('#host-btn').disabled = !!w; $('#join-btn').disabled = !!w;
  if (!st.peer) { $('#online-main').classList.remove('hidden'); $('#online-wait').classList.add('hidden'); onlineMsg(''); }
  seg($('#seg-vis'), [['public', 'Anyone (lobby)'], ['private', 'Only with code']], SET.vis, v => { SET.vis = v; saveSet(); });
  seg($('#seg-wx2'), [['random', 'Random'], ['clear', 'Clear night'], ['day', 'Day game'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog']], SET.wx2, v => { SET.wx2 = v; saveSet(); });
  const P = profile(), utOk = P && P.ut.started && UTm.squadOvr(P.ut).full;
  $('#use-ut').disabled = !utOk; if (!utOk) $('#use-ut').checked = false;
  $('#use-ut').parentElement.title = utOk ? '' : 'Start Ultimate Team and fill your lineup first';
  if (!w) startLobby();
}
function myOnlineInfo() {
  const P = profile(), useUT = $('#use-ut').checked && P && P.ut.started;
  const roster = useUT ? UTm.squadRoster(P.ut) : null;
  return { name: Auth.user ? Auth.user.name : 'Player', team: useUT ? P.ut.club : onlineTeam, rank: P ? P.rank.name : '', roster, squad: roster ? P.ut.name : null, cel: SET.cel };
}
// ---------------- spectating ----------------
let spec = null, liveLobby = null, specAcc = 0, liveAt = 0;
function startSpecCast(code, listed) {
  stopSpec(); if (!code) return;
  const client = Auth.mode === 'supabase' && !LOCALNET ? Auth.client : null;
  spec = new SpecChannel(client, code); spec.open(() => {}).catch(() => { spec = null; });
  if (listed) { liveLobby = new Lobby(client); liveLobby.open(() => {}).then(() => liveTrack(true)).catch(() => {}); }
}
function liveTrack(force) {
  if (!liveLobby || !st.snap) return;
  const now = performance.now(); if (!force && now - liveAt < 8000) return; liveAt = now;
  const S = st.snap, i = myOnlineInfo();
  liveLobby.track({ code: st.roomCode, live: true, name: `${st.names[0]} vs ${st.names[1]}`, team: S.teams[0], team2: S.teams[1], sc: S.sc, q: S.q, rank: i.rank, ql: SET.qlen, at: Date.now() });
}
// host side: send a snapshot to watchers about 8 times a second
function specPush(events) {
  if (!spec || !st.snap) return;
  specAcc += 1; if (specAcc < 2 && !(events && events.length)) return; specAcc = 0;
  spec.send({ t: 's', s: st.snap, e: events || [], names: st.names, teamNames: st.teamNames, teams: st.snap.teams });
  liveTrack(false);
}
function stopSpec() { if (spec) { spec.close(); spec = null; } if (liveLobby) { liveLobby.close(); liveLobby = null; } }
async function startSpectate(code) {
  sfx.init(); stopSpec(); onlineMsg('');
  const client = Auth.mode === 'supabase' && !LOCALNET ? Auth.client : null;
  $('#online-main').classList.add('hidden'); $('#online-wait').classList.remove('hidden');
  $('#room-code').textContent = code; $('#wait-label').textContent = 'Watching game'; $('#copy-code').classList.add('hidden');
  $('#wait-status').innerHTML = '<span class="spinner"></span>Looking for a live game…';
  const ch = spec = new SpecChannel(client, code);
  const give = setTimeout(() => { if (spec === ch && !st.playing) { stopSpec(); onlineMsg('No live game with that code right now. It might not have kicked off yet.', true); resetOnlineUI(); } }, 15000);
  try {
    await ch.open((m) => {
      if (spec !== ch || !m || m.t !== 's' || !m.s) return;
      st.specRx = performance.now();
      if (!st.playing) {
        clearTimeout(give); stopLobby();
        st.mode = 'spec'; st.local = 0; st.names = m.names || ['Home', 'Away']; st.teamNames = m.teamNames || null; st.ut = false; st.practice = null; st.drill = false; st.rec = []; st.replay = null;
        R.setTeams(m.teams); st.guestBuf = []; st.snap = null;
        $('#net-badge').textContent = 'Spectating'; $('#net-badge').classList.remove('hidden');
        enterGame(); $('#hud').classList.add('spec'); st.intro = 0;
        toast(`Watching ${st.names[0]} vs ${st.names[1]}. Press Esc to leave.`, 3500);
      }
      st.guestBuf.push({ at: performance.now(), s: m.s }); if (st.guestBuf.length > 40) st.guestBuf.shift();
      if (m.e) for (const e of m.e) { sfx.play(e); R.event(e); }
    });
  } catch (e) { clearTimeout(give); onlineMsg(e.message, true); resetOnlineUI(); }
}

// ---------------- public lobby ----------------
let lobby = null;
function startLobby() {
  if (lobby) return;
  lobby = new Lobby(Auth.mode === 'supabase' && !LOCALNET ? Auth.client : null);
  lobby.open(renderLobby).catch(() => {});
  renderLobby([]);
}
function stopLobby() { if (lobby) { lobby.close(); lobby = null; } }
function renderLobby(list) {
  const el = $('#lobby-list'); if (!el) return;
  const open = list.filter(g => !g.live), live = list.filter(g => g.live);
  $('#lobby-count').textContent = [open.length ? `${open.length} open` : '', live.length ? `${live.length} live` : ''].filter(Boolean).join(', ');
  if (!list.length) { el.innerHTML = '<div class="lob-empty">No games right now. Host one and it shows up here for everyone.</div>'; return; }
  const safe = c => validCode(String(c || '')) ? c : '';
  el.innerHTML = open.map(g => { const t = TEAMS[g.team] || TEAMS[0]; const r = (g.rank || 'Bronze').split(' ')[0];
    return `<div class="lob" style="--c:${t.jersey};--c2:${t.trim}"><img class="tg-logo" alt="" src="${logoURL(TEAMS[g.team] ? g.team : 0, 64)}"><div><b>${escapeHtml(g.name)}</b><small>${g.squad ? escapeHtml(g.squad) + ' (Ultimate Team)' : t.city}, ${Math.round((g.ql || 120) / 60)} min quarters${g.wx && g.wx !== 'random' ? ', ' + g.wx : ''}</small></div><span class="rank-pill" style="--rk:${(RANK_COL[r] || RANK_COL.Bronze)[0]}">${escapeHtml(g.rank || '')}</span><button class="btn primary sm" data-code="${safe(g.code)}">Join</button></div>`; }).join('')
    + live.map(g => { const a = TEAMS[g.team] || TEAMS[0], h = TEAMS[g.team2] || TEAMS[1], sc = Array.isArray(g.sc) ? g.sc.map(n => +n || 0) : [0, 0];
    return `<div class="lob live" style="--c:${a.jersey};--c2:${h.jersey}"><img class="tg-logo" alt="" src="${logoURL(TEAMS[g.team] ? g.team : 0, 64)}"><div><b>${escapeHtml(g.name)}</b><small><span class="live-dot"></span>Live: ${a.abbr} ${sc[0]}, ${h.abbr} ${sc[1]}, Q${Math.min(5, +g.q || 1)}</small></div><img class="tg-logo" alt="" src="${logoURL(TEAMS[g.team2] ? g.team2 : 1, 64)}"><button class="btn sm" data-watch="${safe(g.code)}">Watch</button></div>`; }).join('');
  $$('[data-code]', el).forEach(b => b.onclick = () => { $('#join-code').value = b.dataset.code; $('#join-btn').click(); });
  $$('[data-watch]', el).forEach(b => b.onclick = () => startSpectate(b.dataset.watch));
}
wireTeamPick($('#tp-online'), () => onlineTeam, v => { onlineTeam = v; renderOnline(); });
function onlineMsg(t, err) { const m = $('#online-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
function makeSignal(code) { return (Auth.mode === 'supabase' && !LOCALNET) ? new SupabaseSignal(Auth.client, code) : new LocalSignal(code); }
$('#online-back').addEventListener('click', () => { if (st.peer) { st.peer.close(); st.peer = null; } show('menu'); });
$('#copy-code').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('#room-code').textContent).then(() => toast('Code copied')); });
$('#join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#host-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#watch-btn').addEventListener('click', () => { const code = $('#join-code').value.trim().toUpperCase(); if (!validCode(code)) { onlineMsg(`Codes are ${CODE_MIN} to ${CODE_MAX} letters or numbers`, true); return; } startSpectate(code); });

function wirePeer(peer, role) {
  peer.on('error', (m) => { onlineMsg(m, true); resetOnlineUI(); });
  peer.on('joined', (info) => {
    st.names[role === 'host' ? 1 : 0] = info.name;
    if (role === 'host' && lobby) lobby.untrack();
    $('#wait-status').innerHTML = `<span class="spinner"></span>${escapeHtml(info.name)} ${role === 'host' ? 'joined' : 'found'}! Connecting…`;
  });
  peer.on('open', (mode) => {
    $('#net-badge').textContent = mode === 'p2p' ? 'Online, direct connection' : 'Online, relay connection';
    if (role === 'host') startHostGame();
    else $('#wait-status').innerHTML = '<span class="spinner"></span>Connected! Starting…';
  });
  peer.on('close', (why) => {
    if (peer._done) return; peer._done = true; peer.close();
    if (st.peer !== peer) return;
    if (st.playing && !st.overShown) { forfeitWin(); toast(why || 'Opponent left'); leaveGame(); }
    else if (st.playing) toast('Opponent left');
    st.peer = null;
    if (!st.playing && st.screen === 'online') { onlineMsg(why || 'Disconnected', true); resetOnlineUI(); }
  });
  peer.on('message', (m) => { try { role === 'host' ? hostRx(m) : guestRx(m); } catch (e) { console.warn('bad net message', e); } });
}
function resetOnlineUI() { $('#online-main').classList.remove('hidden'); $('#online-wait').classList.add('hidden'); if (st.peer) { st.peer.close(); st.peer = null; } if (lobby) lobby.untrack(); }
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#host-btn').addEventListener('click', async () => {
  sfx.init();
  const custom = ($('#host-code').value || '').trim().toUpperCase();
  if (custom && !validCode(custom)) { onlineMsg(`Custom codes must be ${CODE_MIN} to ${CODE_MAX} letters or numbers`, true); return; }
  const code = custom || makeRoomCode();
  st.roomCode = code;
  const peer = st.peer = new Peer(makeSignal(code), 'host', myOnlineInfo());
  wirePeer(peer, 'host');
  $('#online-main').classList.add('hidden'); $('#online-wait').classList.remove('hidden');
  $('#room-code').textContent = code; $('#wait-label').textContent = 'Your game code — send it to your friend';
  $('#copy-code').classList.remove('hidden');
  $('#wait-status').innerHTML = '<span class="spinner"></span>Connecting to server…';
  onlineMsg('');
  try {
    await peer.start(); $('#wait-status').innerHTML = `<span class="spinner"></span>Waiting for opponent${SET.vis === 'public' ? '. Your game is listed in the public lobby.' : '…'}`;
    if (SET.vis === 'public' && lobby && st.peer === peer) { const i = myOnlineInfo(); lobby.track({ code, name: i.name, team: i.team, rank: i.rank, squad: i.squad, ql: SET.qlen, wx: SET.wx2, at: Date.now() }); }
  }
  catch (e) { onlineMsg(e.message, true); resetOnlineUI(); }
});
$('#join-btn').addEventListener('click', async () => {
  sfx.init();
  const code = $('#join-code').value.trim().toUpperCase();
  if (!validCode(code)) { onlineMsg(`Codes are ${CODE_MIN} to ${CODE_MAX} letters or numbers`, true); return; }
  const peer = st.peer = new Peer(makeSignal(code), 'guest', myOnlineInfo());
  wirePeer(peer, 'guest');
  $('#online-main').classList.add('hidden'); $('#online-wait').classList.remove('hidden');
  $('#room-code').textContent = code; $('#wait-label').textContent = 'Joining game';
  $('#copy-code').classList.add('hidden');
  $('#wait-status').innerHTML = '<span class="spinner"></span>Looking for game…';
  onlineMsg('');
  try { await peer.start(); } catch (e) { onlineMsg(e.message, true); resetOnlineUI(); }
});

function startHostGame() {
  const peer = st.peer; if (!peer) return;
  stopLobby();
  const me = peer.info, them = peer.remote.info || {};
  const myTeam = me.team ?? onlineTeam;
  const gt = them.team === myTeam ? (myTeam + 1) % TEAMS.length : (TEAMS[them.team] ? them.team : (myTeam + 1) % TEAMS.length);
  st.mode = 'host'; st.local = 0; st.ut = !!me.roster; st.practice = null; st.drill = false; st.rec = []; st.replay = null;
  st.names = [Auth.user ? Auth.user.name : 'Host', String(them.name || 'Guest').slice(0, 16)];
  st.teamNames = [me.squad || null, them.squad ? String(them.squad).replace(/[<>]/g, '').slice(0, 18) : null];
  const w = SET.wx2 === 'random' ? null : SET.wx2;
  const weather = w === 'day' ? 'clear' : w === 'clear' ? 'clear' : pickWx(w || 'random'), tod = w === 'day' ? 'day' : w === 'clear' ? 'night' : pickTod('random');
  st.game = createGame({ teams: [myTeam, gt], humans: [true, true], quarterLen: SET.qlen, difficulty: 1, rosters: [me.roster || null, them.roster || null], weather, tod, cel: [SET.cel, +them.cel] });
  st.remote = { mx: 0, mz: 0, sprint: false, ev: [] };
  st.netEv = [];
  R.setTeams(st.game.opts.teams);
  R.setWeather(weather, tod);
  peer.send({ t: 'start', teams: st.game.opts.teams, ql: SET.qlen, names: st.names, teamNames: st.teamNames, ut: !!them.roster }, true);
  startSpecCast(st.roomCode, SET.vis === 'public');
  $('#net-badge').classList.remove('hidden');
  enterGame();
  $('#chat').classList.remove('hidden'); chatLine('sys', '', 'Press T to chat.');
}
function hostRx(m) {
  if (m.t === 'i') { st.remote.mx = +m.mx || 0; st.remote.mz = +m.mz || 0; st.remote.sprint = !!m.sp; }
  else if (m.t === 'chat') chatRx(m);
  else if (m.t === 'ev' && m.ev && typeof m.ev.t === 'string') { if (st.remote.ev.length < 50) st.remote.ev.push(m.ev); }
  else if (m.t === 'bye') { st.peer && st.peer.handlers.close && st.peer.handlers.close('Opponent left'); }
}
function guestRx(m) {
  if (m.t === 'chat') { chatRx(m); return; }
  if (m.t === 'start') {
    stopLobby();
    st.mode = 'guest'; st.local = 1; st.names = m.names || st.names; st.teamNames = m.teamNames || null; st.ut = !!m.ut; st.practice = null; st.drill = false; st.rec = []; st.replay = null;
    R.setTeams(m.teams); st.guestBuf = []; st.snap = null;
    $('#net-badge').classList.remove('hidden');
    enterGame();
    $('#chat').classList.remove('hidden'); chatLine('sys', '', 'Press T to chat.');
  } else if (m.t === 's') {
    if (!st.playing) return;
    st.guestBuf.push({ at: performance.now(), s: m.s });
    if (st.guestBuf.length > 40) st.guestBuf.shift();
    if (m.e) for (const e of m.e) { sfx.play(e); R.event(e); }
  } else if (m.t === 'bye') { st.peer && st.peer.handlers.close && st.peer.handlers.close('Opponent left'); }
}

const lerpN = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
function guestView() {
  const buf = st.guestBuf; if (!buf.length) return null;
  const rt = performance.now() - 110;
  let i = buf.length - 1;
  while (i > 0 && buf[i - 1].at > rt) i--;
  const b = buf[i], a = buf[i - 1];
  if (!a || a.s.id !== b.s.id || b.at <= rt) return b.s;
  const t = Math.max(0, Math.min(1, (rt - a.at) / (b.at - a.at)));
  const s = { ...b.s, pl: b.s.pl.map((p, k) => { const q = a.s.pl[k]; if (!q) return p; const r = p.slice(); r[4] = q[4] + (p[4] - q[4]) * t; r[5] = q[5] + (p[5] - q[5]) * t; r[6] = lerpA(q[6], p[6], t); return r; }) };
  const bb = b.s.b.slice(), ab = a.s.b;
  for (let k = 0; k < 3; k++) bb[k] = ab[k] + (bb[k] - ab[k]) * t;
  s.b = bb;
  return s;
}

// ---------------- main loop ----------------
let last = performance.now(), menuT = 0;
const DT = 1 / 60;
// keep an online host's game running (and its opponent connected) if the tab goes to the background
setInterval(() => {
  if (!document.hidden || !st.playing || st.mode !== 'host' || !st.game) return;
  const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
  if (st.introOn) endIntro();
  let n = Math.min(60, Math.round(dt / DT));
  try { for (let i = 0; i < n; i++) { step(st.game, DT, [{}, { mx: st.remote.mx, mz: st.remote.mz, sprint: st.remote.sprint, ev: i === 0 ? st.remote.ev : [] }]); if (i === 0) st.remote.ev = []; for (const e of drainEvents(st.game)) st.netEv.push(e); } } catch (e) { onFrameError(e); return; }
  st.snap = snapshot(st.game);
  if (st.peer) { st.peer.send({ t: 's', s: st.snap, e: st.netEv }, false); specPush(st.netEv); st.netEv = []; }
}, 100);
// frame-rate watchdog: resolution scaling every 2 seconds, and in Auto mode a step down a tier if it stays slow
const fpsMon = { t: 0, n: 0, bad: 0 };
function watchFps(dt) {
  if (!st.playing || st.paused || document.hidden || st.intro > 0) { fpsMon.t = 0; fpsMon.n = 0; return; }
  fpsMon.t += dt; fpsMon.n++;
  if (fpsMon.t < 2) return;
  const fps = fpsMon.n / fpsMon.t; fpsMon.t = 0; fpsMon.n = 0;
  R.adaptResolution(fps);
  if (!SET.gfxAuto) return;
  fpsMon.bad = fps < 40 ? fpsMon.bad + 1 : 0;
  if (fpsMon.bad >= 2 && SET.gfx !== 'potato') {
    fpsMon.bad = 0; SET.gfx = SET.gfx === 'high' ? 'low' : 'potato'; saveSet(); applyGfx();
    toast(SET.gfx === 'low' ? 'Switched to faster graphics so the game runs smoother' : 'Switched to Chromebook graphics so the game runs smoother', 3000);
  }
}
// crash guard: an error in one frame never kills the game. Repeated errors reset the play; if that keeps failing,
// the game ends cleanly and you're back at the menu instead of a frozen screen.
const crash = { n: 0, t: 0, resets: 0 };
function onFrameError(e) {
  console.error('frame error', e);
  const now = performance.now();
  if (now - crash.t > 4000) { crash.n = 0; crash.t = now; }
  crash.n++;
  if (crash.n < 20) return;
  crash.n = 0; crash.t = now;
  if (st.playing && st.game && crash.resets < 3) { crash.resets++; recover(st.game); hudCache = {}; toast('Something glitched, so the play was reset', 2500); return; }
  if (st.playing) { crash.resets = 0; try { leaveGame(); } catch (_) { show('menu'); } toast('The game hit an error and was ended. Sorry about that.', 4000); }
}
window.addEventListener('error', (e) => console.warn('uncaught', e.message));
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('Graphics were reset by your browser, recovering…', 3000); });
canvas.addEventListener('webglcontextrestored', () => { try { R.resize(); } catch (_) {} toast('Graphics back', 1500); });
window.addEventListener('unhandledrejection', (e) => console.warn('unhandled promise', e.reason));
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); } catch (e) { onFrameError(e); }
}
function frameBody(now) {
  renderThrowMeter();
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  watchFps(dt);
  if (st.playing) {
    if (st.replay) {
      stepReplay(dt);
      R.render();
      return;
    }
    if (st.mode === 'spec') {
      const v = guestView(); if (v) st.snap = v;
      if (performance.now() - (st.specRx || 0) > 15000) { toast('The game you were watching ended or lost connection'); leaveGame(); return; }
    } else if (st.mode === 'guest') {
      const v = guestView();
      if (v) st.snap = v;
      st.inputAcc += dt;
      if (st.peer && st.inputAcc >= 0.045) { st.inputAcc = 0; const m = moveVec(); st.peer.send({ t: 'i', mx: +m.mx.toFixed(2), mz: +m.mz.toFixed(2), sp: sprinting() ? 1 : 0 }, false); }
    } else if (st.game && !st.paused) {
      st.acc = st.intro > 0 ? 0 : st.acc + dt;
      let n = 0;
      while (st.acc >= DT && n < 6) {
        const mine = { ...moveVec(), sprint: sprinting(), ev: n === 0 ? evq : [] };
        const inputs = [{}, {}];
        inputs[st.local] = mine;
        if (st.mode === 'host') { inputs[1] = { mx: st.remote.mx, mz: st.remote.mz, sprint: st.remote.sprint, ev: n === 0 ? st.remote.ev : [] }; }
        step(st.game, DT, inputs);
        if (n === 0) { evq = []; st.remote.ev = []; }
        for (const e of drainEvents(st.game)) { sfx.play(e); R.event(e); if (st.mode === 'host') st.netEv.push(e); }
        st.acc -= DT; n++;
      }
      if (n >= 6) st.acc = 0;
      st.snap = snapshot(st.game);
      if (st.mode === 'host' && st.peer) {
        st.netAcc += dt;
        if (st.netAcc >= 0.05) { st.netAcc = 0; st.peer.send({ t: 's', s: st.snap, e: st.netEv }, false); specPush(st.netEv); st.netEv = []; }
      }
    }
    if (st.snap) {
      R.ball.visible = true;
      R.update(st.snap, dt, st.local);
      if (st.snap.ph === 'half') {
        st.halfT = (st.halfT || 0) + dt * 0.07;
        R.cam.position.set(Math.sin(st.halfT) * 70, 30, 50 + Math.cos(st.halfT) * 84);
        R.cam.lookAt(0, 0, 50); R._camInit = false;
      }
      if (st.intro > 0) {
        st.intro -= dt;
        const t = 1 - Math.max(0, st.intro) / st.introLen, e = t * t * (3 - 2 * t);
        const s = st.local === 1 ? -1 : 1, los = st.snap.los;
        const a = Math.PI * (1 - e), Rr = 80 - e * 63;
        R.cam.position.set(Math.sin(a) * Rr * 0.55, 46 - e * 33.5, los - s * Math.cos(a) * Rr);
        R.cam.lookAt(0, 0, lerpN(50, los + 5 * s, e));
        R.followShadow(0, los);
        if (st.intro <= 0) endIntro();
      }
      updateHud(st.snap);
      if (st.rec && st.snap.ph !== 'presnap') { const L = st.rec[st.rec.length - 1]; if (!L || L.s !== st.snap) { st.rec.push({ s: st.snap, dt }); if (st.rec.length > 2400) st.rec.splice(0, 600); } }
      const S0 = st.snap;
      sfx.setSituation(st.paused ? 'idle' : S0.ph === 'presnap' && S0.poss !== st.local && st.local === 0 ? 'homeDefense' : S0.ph === 'live' ? 'live' : 'idle');
      if (st.snap.ph === 'gameover' && !st.overShown) {
        st.overT = (st.overT || 0) + dt;
        if (st.overT > 1.6) { st.overT = 0; showGameOver(st.snap); }
      }
    }
  } else {
    // menu: slow orbit around the stadium
    menuT += dt * 0.06;
    const r = 78;
    R.cam.position.set(Math.sin(menuT) * r, 34, 50 + Math.cos(menuT) * r * 1.2);
    R.cam.lookAt(0, 0, 50);
    R.ambient(dt); R.followShadow(0, 50);
    R.ball.visible = false; R.ctrlArrow.visible = false;
    R.ctrlRing.visible = false; R.target.visible = false; R.badges.forEach(b => b.visible = false);
    R.losLine.visible = false; R.fdLine.visible = false;
  }
  if (window.__ek && window.__ek.cam) { const c = window.__ek.cam; R.cam.position.set(c[0], c[1], c[2]); R.cam.lookAt(c[3], c[4], c[5]); }
  // menus on slow machines: the stadium behind the menu only needs ~20 frames a second
  if (!st.playing && SET.gfx !== 'high') { menuSkip = (menuSkip + 1) % (SET.gfx === 'potato' ? 3 : 2); if (menuSkip) return; }
  R.render();
}
let menuSkip = 0;
requestAnimationFrame(frame);

// ---------------- menus that live in their own modules ----------------
// used by friend challenges: host a private game with a given code, or join one
function hostGame(code) { show('online'); SET.vis = 'private'; saveSet(); renderOnline(); $('#host-code').value = code; setTimeout(() => $('#host-btn').click(), 50); }
function joinGame(code) { if (st.playing) { toast('Finish your game first'); return; } show('online'); $('#join-code').value = code; setTimeout(() => $('#join-btn').click(), 50); }
const CTX = { refreshProfile, hostGame, joinGame, newCode: () => makeRoomCode(), zoomCam, st, cleanText, playClip, stopClip, profile, refreshChip, logoURL, teamOvr, $, $$, show, toast, sfx, Auth, TEAMS, seg, unlockAch, fillGrid, teamCard, wireTeamPick, openPicker, startCPU, DIFFICULTIES, QLENS, SET, saveSet, escapeHtml, screen: () => st.screen, customPlays, routeSvg, defSvg };
initMeta(CTX);
initCreator(CTX);
initSocial(CTX);
initAdmin();
initGamepad({ toast, zoomCam, context: padContext, cardNav, cardPickFocused, hotOpen: () => st.hot.open, onModeChange: (on) => { hudCache = {}; R.setBadgeLabels(on ? (() => { const g = glyphs(); return [g.A, g.B, g.X, g.Y, g.RB]; })() : ['1', '2', '3', '4', '5']); } });
Fr.initFranchise(CTX);
$('#ban-ok').addEventListener('click', () => $('#banned').classList.add('hidden'));
$('#ban-out').addEventListener('click', async () => { $('#banned').classList.add('hidden'); await Auth.signOut(); show('auth'); });

// test hooks (used by automated tests; harmless in production)
window.__ek = { st, startCPU, keys, pushEv, Auth, R, sfx, cam: null, keyToEvent, pickCard };
