// ENDZONE KINGS — app shell: menus, input, game loop, online glue
import { createGame, step, snapshot, drainEvents, TEAMS, OFF_PLAYS, DEF_PLAYS, DIFFICULTIES, OFF_CATS, DEF_CATS, FORMS, teamPlaybook } from './sim.js?v=1792199573';
import { Renderer } from './render.js?v=1792199573';
import { Sfx } from './audio.js?v=1792199573';
import { Auth } from './auth.js?v=1792199573';
import { Peer, SupabaseSignal, LocalSignal, makeRoomCode } from './net.js?v=1792199573';
import { getRoster, teamOvr } from './teams.js?v=1792199573';
import * as Season from './season.js?v=1792199573';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const LOCALNET = params.has('localnet');

// ---------------- settings ----------------
const DEF_SET = { touch: 'auto', vol: 0.7, music: 0.5, ann: true, cam: 'behind', gfx: 'high', diff: 1, qlen: 120, team: 3, cpuTeam: 15 };
let SET = { ...DEF_SET };
try { SET = { ...DEF_SET, ...JSON.parse(localStorage.getItem('ek_settings') || '{}') }; } catch (_) {}
const saveSet = () => { try { localStorage.setItem('ek_settings', JSON.stringify(SET)); } catch (_) {} };

// ---------------- core objects ----------------
const canvas = $('#gl');
let R;
try { R = new Renderer(canvas, SET.gfx); } catch (e) {
  document.body.innerHTML = '<div style="color:#fff;font-family:sans-serif;text-align:center;margin-top:30vh;padding:20px">Your browser could not start 3D graphics (WebGL).<br>Try Chrome, Edge or Firefox with hardware acceleration on.</div>';
  throw e;
}
R.camMode = SET.cam;
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => R.refreshText());
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
}
$$('[data-go]').forEach(b => b.addEventListener('click', () => {
  sfx.play('ui');
  const g = b.dataset.go;
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
  $('#forgot').classList.toggle('hidden', !sb);
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
      const r = await Auth.signUp($('#su-name').value, $('#su-email').value, $('#su-pw').value);
      if (r.needsConfirm) { authMsg('Almost there! Check your email to confirm, then log in.'); $$('.tab')[0].click(); $('#li-id').value = $('#su-email').value; }
      else { authMsg(''); show('menu'); toast(`Welcome to the league, ${Auth.user.name}!`); }
    } catch (err) { authMsg(err.message, true); }
  });
});
$('#forgot').addEventListener('click', async () => {
  try { await Auth.resetPassword($('#li-id').value); authMsg('Reset link sent — check your email.'); } catch (err) { authMsg(err.message, true); }
});
$('#guest-btn').addEventListener('click', () => { Auth.guest(); show('menu'); });
$('#logout').addEventListener('click', async () => { await Auth.signOut(); show('auth'); });

function refreshProfile() {
  const u = Auth.user; if (!u) return;
  const SS = loadSeason();
  $('#tile-season-sub').textContent = SS ? (SS.phase === 'done' ? 'Season complete · start a new one' : `${TEAMS[SS.team].city} · ${SS.standings[SS.team].w}-${SS.standings[SS.team].l} · ${SS.phase === 'regular' ? 'Week ' + (SS.week + 1) : 'Playoffs'}`) : 'Chase the Kings Bowl';
  $('#pc-name').textContent = u.name;
  $('#pc-avatar').textContent = u.name[0].toUpperCase();
  $('#pc-rec').textContent = u.kind === 'guest' ? 'Guest' : `${u.wins}-${u.losses}${u.ties ? '-' + u.ties : ''}`;
  $('#logout').textContent = u.kind === 'guest' ? 'Sign in' : 'Log out';
}

// ---------------- team / option widgets ----------------
const accent = t => (t.jersey === '#121a14' ? '#18c964' : t.jersey);
function teamCard(el, ti) {
  const t = TEAMS[ti], r = getRoster(ti);
  el.style.background = `linear-gradient(160deg, ${t.jersey}, ${shade(t.jersey, -0.55)})`;
  el.style.color = '#fff';
  el.style.setProperty('--trim', t.trim);
  el.innerHTML = `<div class="helm" style="background:${t.helmet}"></div><b>${t.city}</b><span>${t.abbr} · ${r.ovr} OVR</span><em>OFF ${r.off} · DEF ${r.def}</em>`;
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
  TEAMS.map((t, i) => i).sort((a, b) => TEAMS[a].city.localeCompare(TEAMS[b].city)).forEach(i => {
    const t = TEAMS[i];
    const b = document.createElement('button');
    b.className = 'tg' + (i === current ? ' on' : '');
    b.disabled = i === avoid;
    b.style.setProperty('--c', t.jersey); b.style.setProperty('--c2', t.trim);
    b.innerHTML = `<i></i><b>${t.city}</b><small>${t.abbr}</small><span>${teamOvr(i)}</span>`;
    b.onclick = () => { sfx.play('ui'); $$('.tg', el).forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(i); };
    el.appendChild(b);
  });
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function wireTeamPick(root, get, set, avoid) {
  $('.team-card', root).onclick = () => openPicker('Choose a team', get(), avoid ? avoid() : -1, set);
  $$('.arrows button', root).forEach(b => b.onclick = () => {
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
  $('#hub-team').innerHTML = `<div class="hb-badge" style="--c:${t.jersey};--c2:${t.trim}">${t.abbr}</div><div><b>${t.city}</b><span>${rec.w}-${rec.l}${rec.t ? '-' + rec.t : ''} · ${teamOvr(me)} OVR</span></div>`;
  const g = Season.userGame(S);
  const nx = $('#hub-next');
  if (S.phase === 'done') {
    const champ = TEAMS[S.champion];
    nx.innerHTML = S.champion === me ? `<small>SEASON COMPLETE</small><b>🏆 Kings Bowl Champions!</b>` : `<small>SEASON COMPLETE</small><b>${champ.city} won the Kings Bowl</b><span>${S.eliminated ? 'You missed out this year.' : ''}</span>`;
    $('#season-play').classList.add('hidden'); $('#season-sim').classList.add('hidden');
    $('#season-quit').textContent = 'Start new season';
  } else {
    const opp = g.home === me ? g.away : g.home, o = TEAMS[opp];
    const label = S.phase === 'regular' ? `WEEK ${S.week + 1} OF ${Season.WEEKS}` : S.phase === 'semis' ? 'PLAYOFFS · SEMIFINAL' : 'THE KINGS BOWL';
    nx.innerHTML = `<small>${label}</small><b>${g.home === me ? 'vs' : '@'} ${o.city}</b><span><i class="dot" style="background:${o.jersey}"></i>${o.abbr} · ${teamOvr(opp)} OVR · ${S.standings[opp].w}-${S.standings[opp].l}</span>`;
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
  $('#stand-h').textContent = S.phase === 'regular' ? 'Standings · top 4 make playoffs' : 'Final standings';
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
  $('#roster-head').innerHTML = `<div class="hb-badge" style="--c:${t.jersey};--c2:${t.trim}">${t.abbr}</div><div><b>${t.city}</b><span>${R2.ovr} OVR · Offense ${R2.off} · Defense ${R2.def}</span></div>`;
  const cell = (v) => `<td class="rt ${v >= 90 ? 'elite' : v >= 80 ? 'good' : v < 65 ? 'low' : ''}">${v}</td>`;
  $('#roster-tbl').innerHTML = '<tr><th>#</th><th>Name</th><th>Pos</th><th>OVR</th><th>SPD</th><th>HND</th><th>ACC</th><th>ARM</th><th>ELU</th><th>BLK</th><th>RSH</th><th>TKL</th><th>COV</th><th>Age</th></tr>' +
    R2.order.map(k => { const p = R2.players[k]; return `<tr><td>${p.num}</td><td class="nm">${p.first} ${p.last}</td><td>${p.pos}</td>${cell(p.ovr)}${cell(p.spd)}${cell(p.hands)}${cell(p.acc)}${cell(p.arm)}${cell(p.elu)}${cell(p.blk)}${cell(p.rush)}${cell(p.tkl)}${cell(p.cov)}<td>${p.age}</td></tr>`; }).join('');
}

function renderSetup() {
  if (SET.cpuTeam === SET.team) SET.cpuTeam = (SET.team + 1) % TEAMS.length;
  teamCard($('#tp-me .team-card'), SET.team); teamCard($('#tp-cpu .team-card'), SET.cpuTeam);
  seg($('#seg-diff'), DIFFICULTIES.map((n, i) => [i, n]), SET.diff, v => { SET.diff = v; saveSet(); });
  seg($('#seg-qlen'), QLENS, SET.qlen, v => { SET.qlen = v; saveSet(); });
}
wireTeamPick($('#tp-me'), () => SET.team, v => { SET.team = v; saveSet(); renderSetup(); }, () => SET.cpuTeam);
wireTeamPick($('#tp-cpu'), () => SET.cpuTeam, v => { SET.cpuTeam = v; saveSet(); renderSetup(); }, () => SET.team);
$('#start-cpu').addEventListener('click', () => startCPU());

function renderSettings() {
  $('#set-vol').value = SET.vol; $('#set-music').value = SET.music;
  seg($('#seg-ann'), [[true, 'On'], [false, 'Off']], SET.ann, v => { SET.ann = v; sfx.announcer = v; saveSet(); if (v) { sfx.init(); sfx.say('Announcer is on. Let\'s go!', true); } else if (window.speechSynthesis) speechSynthesis.cancel(); });
  seg($('#seg-cam'), [['behind', 'Behind play'], ['broadcast', 'Sideline']], SET.cam, v => { SET.cam = v; R.camMode = v; saveSet(); });
  seg($('#seg-gfx'), [['high', 'High'], ['low', 'Fast']], SET.gfx, v => { SET.gfx = v; saveSet(); applyGfx(); });
  seg($('#seg-touch'), [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], SET.touch, v => { SET.touch = v; saveSet(); });
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
  st.playing = true; st.paused = false; st.acc = 0; st.overShown = false; st.resultSaved = false; st.seasonSaved = false;
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
  const card = (t, name, side) => `<div class="in-team ${side}" style="--c:${t.jersey === '#121a14' ? '#18c964' : t.jersey};--c2:${t.trim}"><small>${escapeHtml(name || '')}</small><b>${t.name}</b><span>${t.abbr}</span></div>`;
  $('#intro-teams').innerHTML = card(T[0], st.names[0], 'l') + '<div class="in-vs">VS</div>' + card(T[1], st.names[1], 'r');
  $('#intro').classList.remove('hidden');
  $('#hud').classList.add('intro');
  st.intro = 4.2; st.introLen = 4.2;
  sfx.cheer(0.5, 4); sfx.airHorn();
  sfx.say(`Welcome to ${T[0].city}! Tonight it's ${T[1].city} against ${T[0].city}. Let's play some football!`, true);
}
function endIntro() {
  if (st.intro <= 0) return;
  const natural = st.intro < 0.05;
  st.intro = 0; $('#intro').classList.add('hidden'); $('#hud').classList.remove('intro');
  if (natural) { R.camPos.copy(R.cam.position); R._camInit = true; } else R.snapCamera();
}
$('#intro').addEventListener('click', endIntro);

function startCPU(opts = {}) {
  sfx.init();
  st.mode = 'cpu'; st.local = 0;
  st.seasonGame = !!opts.season;
  st.lastCpu = opts;
  const teams = opts.teams || [SET.team, SET.cpuTeam];
  st.game = createGame({ teams, humans: [true, false], quarterLen: SET.qlen, difficulty: SET.diff });
  st.names = [Auth.user ? Auth.user.name : 'You', 'CPU'];
  R.setTeams(st.game.opts.teams);
  $('#net-badge').classList.add('hidden');
  enterGame();
}

function leaveGame() {
  st.playing = false; st.game = null; st.snap = null; st.guestBuf = [];
  if (st.peer) { st.peer.close(); st.peer = null; }
  $('#hud').classList.add('hidden'); $('#pause').classList.add('hidden'); $('#gameover').classList.add('hidden');
  for (const m of R.pmeshes.values()) { m.root.visible = false; m.blob.visible = false; }
  $('#intro').classList.add('hidden'); st.intro = 0;
  R.ball.visible = false;
  sfx.setSituation('idle'); sfx.startMusic();
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
  if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !e.target.closest('.modal')) e.preventDefault();
  if (e.repeat) { keys.add(k); return; }
  keys.add(k);
  if (st.intro > 0) { if (k === 'Space' || k === 'Enter' || k === 'Escape') endIntro(); return; }
  if (k === 'Escape') { togglePause(); return; }
  if (k === 'KeyM') { toast(sfx.toggleMute() ? 'Sound off' : 'Sound on'); return; }
  if (k === 'KeyC') { SET.cam = SET.cam === 'behind' ? 'broadcast' : 'behind'; R.camMode = SET.cam; saveSet(); toast('Camera: ' + (SET.cam === 'behind' ? 'Behind play' : 'Sideline')); return; }
  if (st.paused) return;
  const ev = keyToEvent(k);
  if (ev) pushEv(ev);
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); if (st.playing && (e.code === 'Space' || e.code === 'Enter') && !e.target.closest('.modal')) e.preventDefault(); });
window.addEventListener('blur', () => keys.clear());

function pushEv(ev) { if (st.mode === 'guest') { st.peer && st.peer.send({ t: 'ev', ev }, true); } else evq.push(ev); }

function moveVec() {
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (touch.jx || touch.jy) { x = touch.jx; y = touch.jy; }
  if (!x && !y) return { mx: 0, mz: 0 };
  const b = R.basis();
  let mx = b.fx * y + b.rx * x, mz = b.fz * y + b.rz * x;
  const l = Math.hypot(mx, mz) || 1;
  return { mx: mx / l, mz: mz / l };
}
const sprinting = () => keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint || Math.hypot(touch.jx, touch.jy) > 0.92;

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
  if (S.ph === 'presnap') btns = S.poss === me ? [['snap', 'SNAP', 'big']] : [['switch', 'SWITCH']];
  else if (S.ph === 'live') {
    const carrier = S.b[3] === 0 ? S.b[5] : -1, iCarry = carrier >= 0 && carrier === S.ctrl[me];
    if (S.canThrow && S.off === me) btns = [['t1', '1', 'r1'], ['t2', '2', 'r2'], ['t3', '3', 'r3'], ['sprint', 'SPRINT', 'hold']];
    else if (iCarry) btns = [['juke', 'JUKE'], ['spin', 'SPIN'], ['stiff', 'STIFF'], ['hurdle', 'HURDLE'], ['sprint', 'SPRINT', 'hold']];
    else if (S.b[3] === 1 && S.b[4]) btns = [['playball', S.off === me ? 'CATCH' : 'PLAY BALL', 'big'], ['switch', 'SWITCH'], ['sprint', 'SPRINT', 'hold']];
    else btns = [['dive', 'DIVE', 'big'], ['switch', 'SWITCH'], ['sprint', 'SPRINT', 'hold']];
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
      const ev = id === 'snap' ? { t: 'snap' } : id[0] === 't' && id.length === 2 ? { t: 'throw', n: +id[1] } : id === 'juke' ? { t: 'juke', x: v.mx, z: v.mz } : { t: id };
      pushEv(ev);
    });
    box.appendChild(b);
  }
}

function keyToEvent(k) {
  const S = st.snap; if (!S) return null;
  const me = st.local, onOff = S.poss === me;
  const digit = k.startsWith('Digit') ? +k.slice(5) : k.startsWith('Numpad') ? +k.slice(6) : 0;
  if (S.ph === 'presnap') {
    if (k === 'KeyZ') { switchTab(-1); return null; }
    if (k === 'KeyX') { switchTab(1); return null; }
    if (digit >= 1 && digit <= 9) return pickCard(digit);
    if (onOff) {
      if (k === 'KeyP' && !(S.sp && S.sp.pat)) { sfx.play('ui'); return { t: 'play', id: 'punt' }; }
      if (k === 'KeyF' && S.sp && S.sp.fg) { sfx.play('ui'); return { t: 'play', id: 'fg' }; }
      if (k === 'Space' || k === 'Enter') return { t: 'snap' };
    } else if (k === 'KeyQ' || k === 'Tab') return { t: 'switch' };
    return null;
  }
  if (S.ph !== 'live') return null;
  if (digit >= 1 && digit <= 3 && S.canThrow && S.off === me) return { t: 'throw', n: digit };
  if (k === 'KeyQ' || k === 'Tab') return { t: 'switch' };
  const carrier = S.b[3] === 0 ? S.b[5] : -1;
  const iCarry = carrier >= 0 && carrier === S.ctrl[me];
  if (k === 'KeyE') return iCarry ? { t: 'spin' } : { t: 'playball' };
  if (k === 'KeyR' && iCarry) return { t: 'stiff' };
  if (k === 'KeyF' && iCarry) return { t: 'hurdle' };
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

// ---------------- pause / game over ----------------
function togglePause(force) {
  if (st.overShown) return;
  const open = force !== undefined ? force : $('#pause').classList.contains('hidden');
  $('#pause').classList.toggle('hidden', !open);
  st.paused = open && st.mode === 'cpu';
  if (st.paused) { sfx.setSituation('idle'); if (window.speechSynthesis) speechSynthesis.cancel(); }
  $('#p-cam-l').textContent = SET.cam === 'behind' ? 'Behind play' : 'Sideline';
  $('#quit').textContent = st.mode === 'cpu' ? 'Quit to menu' : 'Leave online game';
}
$('#pause-btn').addEventListener('click', () => togglePause());
$('#resume').addEventListener('click', () => togglePause(false));
$('#p-howto').addEventListener('click', () => { $('#pause').classList.add('hidden'); show('howto'); });
$('#p-cam').addEventListener('click', () => { SET.cam = SET.cam === 'behind' ? 'broadcast' : 'behind'; R.camMode = SET.cam; saveSet(); $('#p-cam-l').textContent = SET.cam === 'behind' ? 'Behind play' : 'Sideline'; });
$('#quit').addEventListener('click', () => leaveGame());
$('#go-menu').addEventListener('click', () => leaveGame());
$('#go-again').addEventListener('click', () => {
  $('#gameover').classList.add('hidden');
  if (st.mode === 'cpu' && st.seasonGame) { leaveGame(); show('season'); }
  else if (st.mode === 'cpu') startCPU(st.lastCpu || {});
  else if (st.mode === 'host') { startHostGame(); }
  else toast('Waiting for the host to start a rematch…');
});

function showGameOver(S) {
  st.overShown = true;
  const me = st.local, other = 1 - me;
  const res = S.win === -1 ? 'T' : S.win === me ? 'W' : 'L';
  const el = $('#go-res');
  el.textContent = res === 'W' ? 'VICTORY' : res === 'L' ? 'DEFEAT' : 'TIE GAME';
  el.className = 'go-res ' + (res === 'W' ? 'win' : res === 'L' ? 'loss' : '');
  const T = S.teams.map(i => TEAMS[i]);
  $('#go-score').innerHTML = `<span style="color:${T[0].jersey === '#121a14' ? '#18c964' : T[0].jersey}">${T[0].abbr}</span> ${S.sc[0]} – ${S.sc[1]} <span style="color:${T[1].jersey === '#121a14' ? '#18c964' : T[1].jersey}">${T[1].abbr}</span>`;
  const s = S.st;
  const rows = [['Passing', s[0].passYds, s[1].passYds], ['Comp/Att', `${s[0].comp}/${s[0].att}`, `${s[1].comp}/${s[1].att}`], ['Rushing', s[0].rushYds, s[1].rushYds],
    ['First downs', s[0].firstDowns, s[1].firstDowns], ['Touchdowns', s[0].tds, s[1].tds], ['Interceptions thrown', s[0].ints, s[1].ints], ['Sacks', s[0].sacks, s[1].sacks]];
  $('#go-stats').innerHTML = `<tr><th>${T[0].abbr}</th><th></th><th>${T[1].abbr}</th></tr>` + rows.map(r => `<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('');
  $('#go-again').textContent = st.mode === 'guest' ? 'Rematch (host starts)' : st.seasonGame ? 'Back to season' : 'Play again';
  if (st.seasonGame && !st.seasonSaved) {
    st.seasonSaved = true;
    const SS = loadSeason();
    if (SS) {
      Season.finishWeek(SS, S.sc[0], S.sc[1]); saveSeason(SS);
      const note = SS.phase === 'done' ? (SS.champion === SS.team ? '🏆 KINGS BOWL CHAMPIONS!' : 'Season over.') : `Season record: ${SS.standings[SS.team].w}-${SS.standings[SS.team].l}${SS.standings[SS.team].t ? '-' + SS.standings[SS.team].t : ''}`;
      setTimeout(() => toast(note, 3500), 400);
    }
  }
  $('#gameover').classList.remove('hidden');
  if (!st.resultSaved && Auth.user) {
    st.resultSaved = true;
    Auth.recordResult(res).then(() => {
      const u = Auth.user;
      $('#go-rec').textContent = u.kind === 'guest' ? 'Make an account to save your record.' : `Your record: ${u.wins}-${u.losses}${u.ties ? '-' + u.ties : ''}`;
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
  const al = { WR1: f.WR1, WR2: f.WR2, RB: f.RB, QB: f.QB };
  const cols = { WR1: '#22c55e', WR2: '#3b82f6', RB: '#f97316', QB: '#e5e7eb' };
  let s = `<svg viewBox="0 0 120 64"><line x1="0" y1="${Y(0)}" x2="120" y2="${Y(0)}" stroke="#93c5fd" stroke-width="1" opacity=".6"/>`;
  for (const lx of [-1.75, 0, 1.75]) s += `<circle cx="${X(lx)}" cy="${Y(-1)}" r="2.4" fill="#cbd5e1"/>`;
  s += `<circle cx="${X(f.QB[0])}" cy="${Y(Math.max(f.QB[1], -10))}" r="2.6" fill="#fff"/>`;
  const all = { ...(play.routes || {}) }; if (play.qbPath) all.QB = play.qbPath;
  for (const [role, pts] of Object.entries(all)) {
    const p = [al[role], ...pts].map(w => `${X(w[0])},${Y(Math.max(-10, Math.min(w[1], 32)))}`).join(' ');
    const dash = play.type === 'run' && role === 'RB' ? '' : role === 'QB' ? 'stroke-dasharray="3 3"' : '';
    s += `<polyline points="${p}" fill="none" stroke="${cols[role]}" stroke-width="${play.type === 'run' && role !== 'QB' ? 3 : 2.2}" ${dash} stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = pts[pts.length - 1];
    s += `<circle cx="${X(last[0])}" cy="${Y(Math.max(-10, Math.min(last[1], 32)))}" r="2.3" fill="${cols[role]}"/>`;
  }
  for (const r of ['WR1', 'WR2', 'RB']) if (!all[r]) s += `<circle cx="${X(al[r][0])}" cy="${Y(Math.max(al[r][1], -10))}" r="2.4" fill="${cols[r]}" opacity="${(play.block || []).includes(r) ? 1 : .55}"/>`;
  return s + '</svg>';
}
function defSvg(dp) {
  const X = lx => 60 + lx * 2.4, Y = d => 12 + Math.min(d, 34) * 1.45;
  const pos = { DL1: [-2.3, 1], DL2: [0.2, 1], DL3: [2.3, 1], LB: [0, 5], CB1: [-13, 5], CB2: [13, 5], S: [0, 13] };
  const tgt = { WR1: [-13, 6], WR2: [13, 6], RB: [2, 3] };
  let s = `<svg viewBox="0 0 120 64"><line x1="0" y1="${Y(0)}" x2="120" y2="${Y(0)}" stroke="#93c5fd" opacity=".6"/>`;
  for (const [r, z] of Object.entries(dp.zone || {})) {
    const deep = z[1] > 12;
    s += `<ellipse cx="${X(z[0])}" cy="${Y(z[1])}" rx="${deep ? 16 : 11}" ry="${deep ? 7 : 5}" fill="${deep ? '#3b82f6' : '#eab308'}" opacity=".35"/>`;
    s += `<line x1="${X(pos[r][0])}" y1="${Y(pos[r][1])}" x2="${X(z[0])}" y2="${Y(z[1])}" stroke="${deep ? '#60a5fa' : '#facc15'}" stroke-width="1.6"/>`;
  }
  for (const [r, w] of Object.entries(dp.man || {})) s += `<line x1="${X(pos[r][0])}" y1="${Y(pos[r][1])}" x2="${X(tgt[w][0])}" y2="${Y(tgt[w][1])}" stroke="#f87171" stroke-width="1.8" stroke-dasharray="3 2"/>`;
  const rush = ['DL1', 'DL2', 'DL3'].filter(r => !(dp.zone || {})[r]).concat(dp.rush || []);
  for (const r of rush) s += `<path d="M${X(pos[r][0])} ${Y(pos[r][1])} L${X(pos[r][0] * 0.6)} ${Y(-2)}" stroke="#f97316" stroke-width="2.2" marker-end=""/><circle cx="${X(pos[r][0] * 0.6)}" cy="${Y(-2)}" r="1.6" fill="#f97316"/>`;
  for (const r of dp.spy || []) s += `<circle cx="${X(pos[r][0])}" cy="${Y(pos[r][1])}" r="5" fill="none" stroke="#a855f7" stroke-width="1.6"/>`;
  for (const r of dp.deep || []) s += `<path d="M${X(pos[r][0])} ${Y(pos[r][1])} L${X(0)} ${Y(20)}" stroke="#60a5fa" stroke-width="1.6"/>`;
  for (const [r, q] of Object.entries(pos)) s += `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="2.5" fill="#fecaca"/>`;
  return s + '</svg>';
}
const PUNT_SVG = `<svg viewBox="0 0 120 64"><path d="M20 54 Q60 -10 104 40" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-dasharray="4 4"/><circle cx="20" cy="54" r="4" fill="#fff"/></svg>`;
const FG_SVG = `<svg viewBox="0 0 120 64"><g stroke="#fde047" stroke-width="3"><path d="M60 60V40M44 40H76M44 40V6M76 40V6"/></g><path d="M60 62 Q58 30 60 14" stroke="#fff" stroke-dasharray="3 4" fill="none" stroke-width="2"/></svg>`;

// custom plays (Play Creator) live on this device
function customPlays() { try { return JSON.parse(localStorage.getItem('ek_custom_plays') || '[]'); } catch (_) { return []; } }

// Build the playbook for whoever is calling the play: tabs of cards
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
      const cards = plays.filter(p => p.cat === cat).map(p => ({ id: p.id, name: p.name, tip: (pat ? 'Go for 2 · ' : '') + p.tip, svg: routeSvg(p), sig: p.signature }));
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
  return { tabs, book, onOff };
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
  $('#pc-book').textContent = onOff ? `${TEAMS[S.teams[me]].abbr} · ${book.offName} playbook` : `${TEAMS[S.teams[me]].abbr} · ${book.defName}`;
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
    b.innerHTML = `${c.svg}<span class="k">${i < 9 ? i + 1 : ''}</span>${c.sig ? '<span class="sigtag">SIGNATURE</span>' : ''}<b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.tip)}</small>`;
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

function hint(items) {
  const html = items.map(([k, t]) => `<span>${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}${t}</span>`).join('');
  if (hudCache.hint !== html) { hudCache.hint = html; $('#hint').innerHTML = html; }
}

function updateHud(S) {
  const me = st.local;
  const T = S.teams.map(i => TEAMS[i]);
  for (let t = 0; t < 2; t++) {
    const el = $('#sb-t' + t);
    const k = `t${t}`;
    const val = `${T[t].abbr}|${S.sc[t]}|${S.poss === t}`;
    if (hudCache[k] !== val) {
      hudCache[k] = val;
      $('.abbr', el).textContent = T[t].abbr; $('.pts', el).textContent = S.sc[t];
      el.style.setProperty('--tc', T[t].jersey === '#121a14' ? '#18c964' : T[t].jersey);
      el.classList.toggle('has', S.poss === t);
    }
  }
  setTxt('#sb-q', S.q >= 5 ? 'OT' : 'Q' + S.q);
  setTxt('#sb-clk', fmtClock(S.clk));
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
    if (mtxt) { sfx.call(S.msg, { team: (S.msg.sub || '').split(' · ')[1] }); $('b', ban).textContent = S.msg.text; $('small', ban).textContent = S.msg.sub || ''; ban.className = 'banner show' + (S.msg.big ? ' big' : ''); }
    else ban.className = 'banner';
  }
  const fl = $('#flash'); const ft = S.flash || '';
  if (hudCache.flash !== ft) { hudCache.flash = ft; sfx.flashCall(ft); fl.textContent = ft; fl.classList.toggle('show', !!ft); }

  // stamina + who you control
  const cp = S.ctrl[me] >= 0 ? S.pl[S.ctrl[me]] : null;
  $('.stam').classList.toggle('show', S.ph === 'live' && !!cp);
  if (cp) $('#stam-bar').style.width = Math.round(cp[9] * 100) + '%';
  setTxt('#me-label', cp && S.ph !== 'gameover' && S.ph !== 'kick' ? `#${cp[3]} ${cp[11]} · ${cp[12]}` : '');

  // play-the-ball prompt
  let pb = false;
  if (S.ph === 'live' && cp && S.b[3] === 1 && S.b[4] && S.bT >= 0) {
    const dl = Math.hypot(cp[4] - S.b[4][0], cp[5] - S.b[4][1]);
    pb = dl < 6 + S.bT * 4 && !(cp[8] & 2048);
    if (pb) setTxt('#pb-txt', S.off === me ? 'CATCH IT!' : 'PLAY THE BALL!');
  }
  $('#playball').classList.toggle('show', pb);

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
    setTxt('#pc-title', onOff ? (S.pat >= 0 ? 'Try for point — kick or go for 2' : S.dn === 4 ? '4th down — your call' : 'Offense') : 'Defense');
    const hintHtml = onOff ? (S.op ? '<kbd>Space</kbd> snap · <kbd>Z</kbd><kbd>X</kbd> tabs' : '<kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Z</kbd><kbd>X</kbd> tabs')
      : (isCPU ? 'CPU snaps soon · <kbd>Z</kbd><kbd>X</kbd> tabs · <kbd>Q</kbd> switch' : '<kbd>Z</kbd><kbd>X</kbd> tabs · <kbd>Q</kbd> switch player');
    if (hudCache.pch !== hintHtml) { hudCache.pch = hintHtml; $('#pc-hint').innerHTML = hintHtml; }
  }

  // contextual hints
  if (S.ph === 'live') {
    const carrier = S.b[3] === 0 ? S.b[5] : -1;
    const iCarry = carrier >= 0 && carrier === S.ctrl[me];
    if (S.canThrow && S.off === me) hint([['1 2 3', 'throw (or click)'], ['W A S D', 'move'], ['Shift', 'sprint']]);
    else if (iCarry) hint([['Space', 'juke'], ['E', 'spin'], ['R', 'stiff arm'], ['F', 'hurdle'], ['Shift', 'sprint']]);
    else if (S.b[3] === 1 && S.b[4] && S.off === me) hint([['W A S D', 'get to the ring'], ['E', 'aggressive catch']]);
    else if (S.b[3] === 1 && S.b[4]) hint([['E', 'play the ball'], ['Q', 'switch'], ['Shift', 'sprint']]);
    else hint([['Space', 'dive tackle'], ['Q', 'switch'], ['Shift', 'sprint']]);
  } else hint([['Esc', 'pause'], ['C', 'camera'], ['T', 'chat']]);
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
  if (!Auth.configured() && !LOCALNET) w = 'Online 1v1 needs the free Supabase setup first. Open <b>README.md</b> → Step 2, paste your keys into <code>js/config.js</code>, and push to GitHub.';
  else if (Auth.user && Auth.user.kind === 'guest' && !LOCALNET) w = 'Make a free account to play online (Log out → Sign up).';
  warn.innerHTML = w; warn.classList.toggle('hidden', !w);
  $('#host-btn').disabled = !!w; $('#join-btn').disabled = !!w;
  if (!st.peer) { $('#online-main').classList.remove('hidden'); $('#online-wait').classList.add('hidden'); onlineMsg(''); }
}
wireTeamPick($('#tp-online'), () => onlineTeam, v => { onlineTeam = v; renderOnline(); });
function onlineMsg(t, err) { const m = $('#online-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
function makeSignal(code) { return (Auth.mode === 'supabase' && !LOCALNET) ? new SupabaseSignal(Auth.client, code) : new LocalSignal(code); }
$('#online-back').addEventListener('click', () => { if (st.peer) { st.peer.close(); st.peer = null; } show('menu'); });
$('#copy-code').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('#room-code').textContent).then(() => toast('Code copied')); });
$('#join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

function wirePeer(peer, role) {
  peer.on('error', (m) => { onlineMsg(m, true); resetOnlineUI(); });
  peer.on('joined', (info) => {
    st.names[role === 'host' ? 1 : 0] = info.name;
    $('#wait-status').innerHTML = `<span class="spinner"></span>${escapeHtml(info.name)} ${role === 'host' ? 'joined' : 'found'}! Connecting…`;
  });
  peer.on('open', (mode) => {
    $('#net-badge').textContent = mode === 'p2p' ? 'Online · direct' : 'Online · relay';
    if (role === 'host') startHostGame();
    else $('#wait-status').innerHTML = '<span class="spinner"></span>Connected! Starting…';
  });
  peer.on('close', (why) => {
    if (peer._done) return; peer._done = true; peer.close();
    if (st.peer !== peer) return;
    if (st.playing && !st.overShown) { toast(why || 'Opponent left'); leaveGame(); }
    else if (st.playing) toast('Opponent left');
    st.peer = null;
    if (!st.playing && st.screen === 'online') { onlineMsg(why || 'Disconnected', true); resetOnlineUI(); }
  });
  peer.on('message', (m) => role === 'host' ? hostRx(m) : guestRx(m));
}
function resetOnlineUI() { $('#online-main').classList.remove('hidden'); $('#online-wait').classList.add('hidden'); if (st.peer) { st.peer.close(); st.peer = null; } }
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#host-btn').addEventListener('click', async () => {
  sfx.init();
  const code = makeRoomCode();
  const peer = st.peer = new Peer(makeSignal(code), 'host', { name: Auth.user ? Auth.user.name : 'Host', team: onlineTeam });
  wirePeer(peer, 'host');
  $('#online-main').classList.add('hidden'); $('#online-wait').classList.remove('hidden');
  $('#room-code').textContent = code; $('#wait-label').textContent = 'Your game code — send it to your friend';
  $('#copy-code').classList.remove('hidden');
  $('#wait-status').innerHTML = '<span class="spinner"></span>Connecting to server…';
  onlineMsg('');
  try { await peer.start(); $('#wait-status').innerHTML = '<span class="spinner"></span>Waiting for opponent…'; }
  catch (e) { onlineMsg(e.message, true); resetOnlineUI(); }
});
$('#join-btn').addEventListener('click', async () => {
  sfx.init();
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length !== 5) { onlineMsg('Codes are 5 characters', true); return; }
  const peer = st.peer = new Peer(makeSignal(code), 'guest', { name: Auth.user ? Auth.user.name : 'Guest', team: onlineTeam });
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
  const gt = peer.remote.info.team === onlineTeam ? (onlineTeam + 1) % TEAMS.length : peer.remote.info.team;
  st.mode = 'host'; st.local = 0;
  st.names = [Auth.user ? Auth.user.name : 'Host', peer.remote.info.name];
  st.game = createGame({ teams: [onlineTeam, gt], humans: [true, true], quarterLen: SET.qlen, difficulty: 1 });
  st.remote = { mx: 0, mz: 0, sprint: false, ev: [] };
  st.netEv = [];
  R.setTeams(st.game.opts.teams);
  peer.send({ t: 'start', teams: st.game.opts.teams, ql: SET.qlen, names: st.names }, true);
  $('#net-badge').classList.remove('hidden');
  enterGame();
}
function hostRx(m) {
  if (m.t === 'i') { st.remote.mx = +m.mx || 0; st.remote.mz = +m.mz || 0; st.remote.sprint = !!m.sp; }
  else if (m.t === 'ev' && m.ev && typeof m.ev.t === 'string') { if (st.remote.ev.length < 50) st.remote.ev.push(m.ev); }
  else if (m.t === 'bye') { st.peer && st.peer.handlers.close && st.peer.handlers.close('Opponent left'); }
}
function guestRx(m) {
  if (m.t === 'start') {
    st.mode = 'guest'; st.local = 1; st.names = m.names || st.names;
    R.setTeams(m.teams); st.guestBuf = []; st.snap = null;
    $('#net-badge').classList.remove('hidden');
    enterGame();
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
  st.intro = 0;
  let n = Math.min(60, Math.round(dt / DT));
  for (let i = 0; i < n; i++) { step(st.game, DT, [{}, { mx: st.remote.mx, mz: st.remote.mz, sprint: st.remote.sprint, ev: i === 0 ? st.remote.ev : [] }]); if (i === 0) st.remote.ev = []; for (const e of drainEvents(st.game)) st.netEv.push(e); }
  st.snap = snapshot(st.game);
  if (st.peer) { st.peer.send({ t: 's', s: st.snap, e: st.netEv }, false); st.netEv = []; }
}, 100);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (st.playing) {
    if (st.mode === 'guest') {
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
        if (st.netAcc >= 0.05) { st.netAcc = 0; st.peer.send({ t: 's', s: st.snap, e: st.netEv }, false); st.netEv = []; }
      }
    }
    if (st.snap) {
      R.ball.visible = true;
      R.update(st.snap, dt, st.local);
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
  R.render();
}
requestAnimationFrame(frame);

// test hooks (used by automated tests; harmless in production)
window.__ek = { st, startCPU, keys, pushEv, Auth, R, sfx, cam: null, keyToEvent, pickCard };
