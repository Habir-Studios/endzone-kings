// ENDZONE KINGS — app shell: menus, input, game loop, online glue
import { CONFIG } from './config.js?v=1792612483';
import { NOTES, SEASON } from './patchnotes.js?v=1792612483';
import { askYes, showInfo, injuryCard } from './ui.js?v=1792612483';
import * as Form from './form.js?v=1792612483';
import { watchSim } from './simview.js?v=1792612483';
import { bracketHTML } from './bracket.js?v=1792612483';
import { createGame, step, snapshot, drainEvents, recover, TEAMS, OFF_PLAYS, DEF_PLAYS, DIFFICULTIES, OFF_CATS, DEF_CATS, FORMS, teamPlaybook, throwNeed, tossResult } from './sim.js?v=1792612483';
import { rosterStyle } from './playbook.js?v=1792612483';
import { Renderer } from './render.js?v=1792612483';
import { Sfx } from './audio.js?v=1792612483';
import { Auth } from './auth.js?v=1792612483';
import { Peer, SupabaseSignal, LocalSignal, makeRoomCode, Lobby, SpecChannel, validCode, CODE_MIN, CODE_MAX } from './net.js?v=1792612483';
import { getRoster, teamOvr } from './teams.js?v=1792612483';
import * as Season from './season.js?v=1792612483';
import * as Fr from './franchise.js?v=1792612483';
import * as League from './league.js?v=1792612483';
import { rankInfo as rankInfoOf, isWeekend as isWeekendNow, wlReward as wlRewardOf, WL_MAX as WL_MAX_, RANK_REWARDS as RANK_REWARDS_, seasonDaysLeft as seasonDaysLeftOf, weekKey as weekKeyOf, LOGIN_REWARDS as LOGIN_REWARDS_, dayKey as dayKeyOf } from './profile.js?v=1792612483';
import { initGamepad, pad, glyphs } from './gamepad.js?v=1792612483';
import { WIND_OPTS, celOwned, buyCel, setTradeTarget, initMeta, profile, refreshChip, renderUT, renderProgress, awardGame, WX_OPTS, TOD_OPTS, pickWx, pickTod, RANK_COL, unlockAch, renderDrillBoard, drillRewardsHTML, CELS, celUnlocked } from './meta.js?v=1792612483';
import * as UTm from './ut.js?v=1792612483';
import { initCreator, renderCreator, adoptCloudPlays, localPlays } from './creator.js?v=1792612483';
import { filmCapture, filmSave, ADMIN_ID } from './social.js?v=1792612483';
import { showOnline } from './social.js?v=1792612483';
import { initSocial, renderSocial, renderMenuBoard, postGameStats, saveClip, refreshUnread, checkBan, isBanned, initAdmin, renderAdmin, refreshAdminBadge } from './social.js?v=1792612483';
import { portraitURL } from './faces.js?v=1792612483';
import { logoURL, clearLogoCache } from './logos.js?v=1792612483';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const LOCALNET = params.has('localnet');

// ---------------- settings ----------------
const DEF_SET = { touch: 'auto', vol: 0.7, music: 0.5, ann: true, cam: 'carrier', gfx: 'high', diff: 1, qlen: 120, team: 3, cpuTeam: 15, wx: 'clear', tod: 'night', vis: 'public', wx2: 'random', chat: true, cel: -1, pside: 'off', pspot: 25, pfreeze: 0 };
let SET = { ...DEF_SET };
try { SET = { ...DEF_SET, ...JSON.parse(localStorage.getItem('ek_settings') || '{}') }; } catch (_) {}
if (SET.camV !== 2) { SET.cam = 'player'; SET.camV = 2; }   // new over-the-shoulder camera is the default now
const DEVICE_SET = ['touch', 'vol', 'music', 'gfx'];   // these stay per device (a Chromebook and a gaming PC want different graphics)
const syncedSet = () => Object.fromEntries(Object.entries(SET).filter(([k]) => !DEVICE_SET.includes(k) && k !== '_at'));
const saveSet = (fromCloud) => { if (!fromCloud) SET._at = Date.now(); try { localStorage.setItem('ek_settings', JSON.stringify(SET)); } catch (_) {} if (!fromCloud && typeof Auth !== 'undefined' && Auth.saveCloud) Auth.saveCloud(null, { sp: { at: SET._at, v: syncedSet() } }); };
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
// cameras: in your own game you get Follow you; watching someone else's game you get Follow ball carrier instead
if (SET.camV !== 3) { if (SET.cam === 'carrier') SET.cam = 'player'; SET.camV = 3; }
if (!['behind', 'player', 'broadcast'].includes(SET.cam)) SET.cam = 'player';
if (!['behind', 'carrier', 'broadcast'].includes(SET.specCam)) SET.specCam = 'carrier';
const GAME_CAMS = [['behind', 'Follow ball'], ['player', 'Follow you'], ['broadcast', 'Sideline']];
const SPEC_CAMS = [['behind', 'Follow ball'], ['carrier', 'Follow ball carrier'], ['broadcast', 'Sideline']];
const watching = () => st.mode === 'spec' || st.mode === 'clip' || !!st.replay;
const camKey = () => watching() ? 'specCam' : 'cam';
const camName = () => ((watching() ? SPEC_CAMS : GAME_CAMS).find(c => c[0] === SET[camKey()]) || ['', 'Follow ball'])[1];
function cycleCam() { const L = watching() ? SPEC_CAMS : GAME_CAMS, k = camKey(), i = L.findIndex(c => c[0] === SET[k]); SET[k] = L[(i + 1) % L.length][0]; R.camMode = SET[k]; saveSet(); return camName(); }
R.camMode = SET.cam;
R.userZoom = Math.max(0.75, Math.min(2.6, +SET.zoom || 1));
function zoomCam(d) { R.userZoom = Math.max(0.75, Math.min(2.6, R.userZoom * (d > 0 ? 1.12 : 1 / 1.12))); SET.zoom = +R.userZoom.toFixed(2); saveSet(); }
// zoom needs a real scroll, not a trackpad brush: deltas add up and it steps at most every 180 ms
let wheelAcc = 0, wheelT = 0;
canvas.addEventListener('wheel', (e) => { if (!st.playing) return; e.preventDefault(); wheelAcc += e.deltaY; const now = performance.now(); if (Math.abs(wheelAcc) < 120 || now - wheelT < 180) return; zoomCam(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; wheelT = now; }, { passive: false });
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
// ---------------- Locker Room: custom uniform ----------------
function teamKit() { const t = TEAMS[SET.team] || TEAMS[0]; return { on: true, jersey: t.jersey, trim: t.trim, num: t.num || '#ffffff', pants: t.pants, helmet: t.helmet, pattern: 'none', patch: 'none', visor: 'none' }; }
function renderLocker() {
  if (!SET.kit) { SET.kit = { ...teamKit(), on: false }; saveSet(); }
  const K = SET.kit;
  const redraw = () => {
    saveSet();
    const cv = $('#lk-canvas'), c = cv.getContext('2d'), tex = R.kitTex({ jersey: K.jersey, trim: K.trim, pattern: K.pattern, patch: K.patch });
    c.clearRect(0, 0, 220, 220);
    // jersey silhouette filled with the real pattern texture
    c.save(); c.beginPath(); c.moveTo(70, 20); c.lineTo(20, 50); c.lineTo(36, 92); c.lineTo(58, 82); c.lineTo(58, 200); c.lineTo(162, 200); c.lineTo(162, 82); c.lineTo(184, 92); c.lineTo(200, 50); c.lineTo(150, 20); c.quadraticCurveTo(110, 48, 70, 20); c.closePath();
    c.clip(); c.drawImage(tex._canvas, -18, -18, 256, 256); c.restore();
    c.lineWidth = 4; c.strokeStyle = K.trim; c.beginPath(); c.moveTo(70, 20); c.quadraticCurveTo(110, 48, 150, 20); c.stroke();
    c.font = '900 64px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = K.trim; c.strokeText('12', 110, 150); c.fillStyle = K.num; c.fillText('12', 110, 150);
    if (K.visor !== 'none') { c.fillStyle = K.helmet; c.beginPath(); c.arc(190, 190, 22, Math.PI, 0); c.fill(); c.fillStyle = K.visor; c.fillRect(170, 186, 40, 8); }
  };
  seg($('#seg-lk-on'), [['on', 'On'], ['off', 'Off']], K.on ? 'on' : 'off', v => { K.on = v === 'on'; redraw(); });
  seg($('#seg-lk-pat'), [['none', 'Solid'], ['gradient', 'Gradient'], ['stripes', 'Stripes'], ['camo', 'Camo'], ['chrome', 'Chrome'], ['galaxy', 'Galaxy']], K.pattern, v => { K.pattern = v; redraw(); });
  seg($('#seg-lk-patch'), [['none', 'None'], ['star', 'Star'], ['crown', 'Crown'], ['bolt', 'Bolt'], ['flame', 'Flame']], K.patch, v => { K.patch = v; redraw(); });
  seg($('#seg-lk-visor'), [['none', 'Clear'], ['#111111', 'Black'], ['#c9a227', 'Gold'], ['#2b7bff', 'Blue'], ['#ff2e63', 'Red'], ['#b9f3ff', 'Ice']], K.visor, v => { K.visor = v; redraw(); });
  for (const k of ['jersey', 'trim', 'num', 'pants', 'helmet']) { const el = $('#lk-' + k); el.value = K[k]; el.oninput = () => { K[k] = el.value; redraw(); }; }
  $('#lk-reset').onclick = () => { SET.kit = { ...teamKit(), on: K.on }; renderLocker(); };
  renderCelShop();
  redraw();
}
// ---------------- adaptive CPU ----------------
// The CPU learns how good you are: blowout wins push it harder, losses ease it off. Your level and rank add a little
// on top. It stacks with the difficulty you pick, and can go past Legend.
function adaptiveCpu(opts) {
  if (opts.practice || opts.drill || opts.league) return 0;   // league bots stand in for a real team: they play to their roster, not to your skill
  const P = profile(); if (!P) return 0;
  const skill = P.p.skill || 0, lvl = Math.min(0.25, ((P.p.lvl || 1) - 1) * 0.008), rank = Math.min(0.2, (P.p.rp || 0) / 5000);
  return Math.max(-0.8, Math.min(1.4, skill + lvl + rank));
}
function learnSkill(res, mine, theirs) {
  const P = profile(); if (!P) return;
  const m = (mine || 0) - (theirs || 0);
  const d = res === 'W' ? 0.06 + Math.min(28, m) / 28 * 0.1 : res === 'L' ? -0.08 - Math.min(28, -m) / 28 * 0.06 : 0;
  P.p.skill = Math.max(-0.8, Math.min(1.2, (P.p.skill || 0) + d)); P.save();
}
function renderCelShop() {
  const box = $('#lk-cel-list'); if (!box) return;
  const P = !isGuest() ? profile() : null, own = celOwned(P);
  box.innerHTML = CELS.filter(c => c[0] >= 0).map(([id, n, price]) => {
    const have = own.has(id), on = SET.cel === id;
    return `<div class="lk-cel ${on ? 'on' : ''} ${have ? '' : 'locked'}"><span class="lk-ic">${CEL_IC[id] || CEL_IC[-1]}</span><b>${n}</b>${have ? `<button class="btn sm ${on ? 'primary' : ''}" data-celeq="${id}" type="button">${on ? 'Equipped' : 'Equip'}</button>` : `<button class="btn sm" data-celbuy="${id}" type="button" ${!P ? 'disabled title="Make an account to buy emotes"' : ''}><i class="coin"></i> ${price.toLocaleString()}</button>`}<button class="btn sm ghost" data-celhear="${id}" type="button" aria-label="Hear it">♪</button></div>`;
  }).join('') + `<div class="lk-cel ${SET.cel === -1 ? 'on' : ''}"><span class="lk-ic">${CEL_IC[-1]}</span><b>Random</b><button class="btn sm ${SET.cel === -1 ? 'primary' : ''}" data-celeq="-1" type="button">${SET.cel === -1 ? 'Equipped' : 'Equip'}</button></div>`;
  $$('[data-celeq]', box).forEach(b => b.onclick = () => { SET.cel = +b.dataset.celeq; saveSet(); sfx.play('ui'); renderCelShop(); });
  $$('[data-celhear]', box).forEach(b => b.onclick = () => { sfx.init(); sfx.play('cel' + b.dataset.celhear); });
  $$('[data-celbuy]', box).forEach(b => b.onclick = async () => {
    const id = +b.dataset.celbuy, c = CELS.find(x => x[0] === id);
    if (!(await askYes(`Buy the ${c[1]} emote for ${c[2].toLocaleString()} coins?`, 'Buy'))) return;
    const err = buyCel(profile(), id); if (err) return toast(err);
    SET.cel = id; saveSet(); sfx.play('cel' + id); toast(`${c[1]} unlocked and equipped`); refreshChip && refreshChip(); renderCelShop();
  });
}
// in-game celebration picker: hold Tab (Y / triangle on a controller)
let celSel = -1;
function celPickOpen() { return !$('#cel-pick').classList.contains('hidden'); }
function openCelPick() {
  const P = !isGuest() ? profile() : null, own = celOwned(P);
  const list = CELS.filter(c => own.has(c[0]));
  const n = list.length, R0 = n > 14 ? 156 : n > 8 ? 132 : 112;
  $('#cel-opts').innerHTML = `<div class="cw-ring"></div><div class="cw-center"><b id="cw-name">Pick one</b><small>let go of Tab</small></div>` + list.map(([id, nm], i) => {
    const a = i / n * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * R0, y = Math.sin(a) * R0;
    return `<button type="button" class="cw-slot ${SET.cel === id ? 'on' : ''}" data-cp="${id}" data-nm="${escapeHtml(nm)}" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px"><span class="cw-ic">${CEL_IC[id] || CEL_IC[-1]}</span><small>${escapeHtml(nm)}</small><kbd>${i + 1}</kbd></button>`;
  }).join('');
  $$('#cel-opts [data-cp]').forEach((b, i) => { b.onclick = () => pickCel(+b.dataset.cp); b.onmouseenter = () => celHighlight(i); });
  celSel = -1; $('#cel-pick').classList.remove('hidden'); sfx.play('ui');
}
// hand-drawn celebration icons (simple player silhouettes doing each move)
const celSvg = (body) => `<svg class="cel-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const CEL_IC = {
  24: celSvg('<circle cx="12" cy="7" r="2" fill="currentColor" stroke="none"/><path d="M12 9.6v5.4M9 2.5v8.5h6V2.5M12 15l-2.6 6M12 15l2.6 6"/>'),
  20: celSvg('<circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none"/><path d="M12 8v6M12 9l3 -3 -1 -2M12 9l-3 2.5 1.5 2M12 14l-2.5 7M12 14l2.5 7"/>'),
  22: celSvg('<circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none"/><path d="M12 8v6M12 9.5 7 9l-2-2M12 9.5l5-.5 2-2M12 14l-2.5 7M12 14l2.5 7"/>'),
  19: celSvg('<circle cx="12" cy="4.6" r="2.2" fill="currentColor" stroke="none"/><path d="M12 7.6v6.4M8 10.5q4 3 8 0M12 14l-2.5 7M12 14l2.5 7"/>'),
  23: celSvg('<circle cx="12" cy="7" r="2" fill="currentColor" stroke="none"/><ellipse cx="15" cy="3" rx="4.5" ry="1.6"/><path d="M12 9.5v5M12 10l3.5-6M12 10.5l-3 2M12 14.5l-2.5 6.5M12 14.5l2.5 6.5"/>'),
  18: celSvg('<circle cx="12" cy="4.5" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.5v6M12 9l-3.5 2.5M12 9l3.5-1.5M12 13.5 8 17l1 3.5M12 13.5l4 3"/>'),
  21: celSvg('<circle cx="17" cy="8" r="2" fill="currentColor" stroke="none"/><path d="M15 9.5 6 12M15 9.5l5 1.2M15 9.5l4.5-2.6M6 12l-3 1.5M6 12l-3-1"/>'),
  '-1': celSvg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8.3" cy="8.3" r="1.5"/><circle cx="15.7" cy="8.3" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8.3" cy="15.7" r="1.5"/><circle cx="15.7" cy="15.7" r="1.5"/></g>'),
  0: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v6M12 8.4 8 4.6M12 8.4l4-3.8M12 13.2l-3 2 1 3.2M12 13.2l3 2-1 3.2"/><path d="M5 21.5h3.5M15.5 21.5H19" stroke-width="1.6" opacity=".6"/>'),
  1: celSvg('<circle cx="10" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M10 7.2l1 6M10.4 8.6 6.5 6M10.4 8.6l3.6 3.4M11 13.2l-3.2 3.3L9 21M11 13.2l3.6 2.4-.6 5.4"/><path d="M18 3v5.2"/><circle cx="16.6" cy="8.4" r="1.4" fill="currentColor" stroke="none"/><path d="M18 3l2.5 1"/>'),
  2: celSvg('<circle cx="12" cy="5.4" r="2.1" fill="currentColor" stroke="none"/><path d="M12 8.4v6.6M12 9.4H7.4V5.2M12 9.4h4.6V5.2M12 15l-2.6 6M12 15l2.6 6"/><path d="M8.6 8.2a2 2 0 0 0 0-3M15.4 8.2a2 2 0 0 1 0-3" stroke-width="1.6"/>'),
  3: celSvg('<circle cx="12" cy="5.6" r="2.1" fill="currentColor" stroke="none"/><path d="M12 8.6v6M12 9.6l3.2-6.4M12 9.6 9 12.4l1.6 1.6M12 14.6l-2.6 6.4M12 14.6l2.6 6.4"/><path d="M15.2 3.2l.9-1.6" stroke-width="2.4"/>'),
  4: celSvg('<circle cx="12" cy="6.6" r="1.8" fill="currentColor" stroke="none"/><path d="M12 9.2v5M9.4 10.8h5.2M12 14.2l-1.8 4M12 14.2l1.8 4"/><path d="M19.4 9.4A8 8 0 0 0 6 6.3" stroke-width="1.7"/><path d="M4.6 14.6A8 8 0 0 0 18 17.7" stroke-width="1.7"/><path d="M6 6.3V3.6M6 6.3h2.7M18 17.7v2.7M18 17.7h-2.7" stroke-width="1.7"/>'),
  5: celSvg('<circle cx="7.2" cy="10.4" r="2.1" fill="currentColor" stroke="none"/><path d="M9.6 10.6l5.6 1.4v9M15.2 12l2.2 9M11.4 11.2 8.6 15M13.2 11.6l4.6-3.4"/><path d="M3 21.5h18" stroke-width="1.6" opacity=".6"/>'),
  6: celSvg('<path d="M8.4 2.6a4 4 0 1 0 4.4 5.2 3.2 3.2 0 0 1-4.4-5.2Z" fill="currentColor" stroke="none"/><circle cx="15.4" cy="7.4" r="1.9" fill="currentColor" stroke="none"/><path d="M15 10.2l-1 5.6M14.8 11.4l-3.2 2M14.8 11.4l3.4 1.6M14 15.8l-2.8 2.4.4 2.8M14 15.8l3.4 1.4 1.6 3.4"/><path d="M3.6 21.5h3M8 21.5h2" stroke-width="1.6" opacity=".6"/>'),
  7: celSvg('<circle cx="10.4" cy="6.6" r="2.1" fill="currentColor" stroke="none"/><path d="M12 9.6v5.4M12 10 7.2 7.8M7.2 7.8l1.6 2.2M12 10l7.4-5.6M12 15l-2.8 6M12 15l2.8 6"/>'),
  8: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v6.4M12 8.6 8.4 11M12 8.6l3.6 2.4M12 13.6l-4.4 3.4-1.4 3.6M12 13.6l4.4 3.4 1.4 3.6"/><path d="M3 15.4h2.4M2.6 18.6h2.6M18.6 15.4H21M18.8 18.6h2.6" stroke-width="1.5" opacity=".7"/>'),
  9: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 8.6 9 12M12 8.6l2.4-2.2 1.4-2.6M12 14.2l-2.4 6.6M12 14.2l2.4 6.6"/>'),
  10: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 8.6 8.8 5.4 10.4 2.6M12 8.6l3.2-3.2-1.6-2.8M12 14.2l-2.4 6.6M12 14.2l2.4 6.6"/>'),
  11: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 8.6H8v-3.4M12 8.6h4v3.6M12 14.2l-2.6 2v4.6M12 14.2l2.6 2v4.6"/>'),
  12: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 8.6 9.2 6.2 10.6 3.6M12 8.6h6.4M12 14.2l-3 6.6M12 14.2l2.2 6.6"/><path d="M20 6.4l1.4-1M20 10.8l1.4 1" stroke-width="1.4"/>'),
  13: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 9.2H5.6M12 9.2l4.6-.2M12 14.2l-3 6.6M12 14.2l3 6.6"/><path d="M5.6 5.4a5 5 0 0 1 0 7.6" stroke-width="1.5"/>'),
  14: celSvg('<circle cx="11" cy="6.2" r="2.1" fill="currentColor" stroke="none"/><path d="M11.6 9l1 5.6M12 10.4l-3 2.6M12 10.4l2.6 2.8M12.6 14.6H8.4v5.6M12.6 14.6l3 2.2v3.4"/><path d="M4 21.5h16" stroke-width="1.5"/>'),
  15: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 8.6 7.4 3.8M12 8.6l4.6-4.8M12 14.2 7.6 20.8M12 14.2l4.4 6.6"/>'),
  16: celSvg('<circle cx="12" cy="4.2" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.2v7M12 8.6 9 11.6M12 8.6l3.4-3.6v-2.4M12 14.2l-2.4 6.6M12 14.2l2.4 6.6"/><path d="M18 2.6l1.6 1.4M18.4 6.4l1.8.4" stroke-width="1.4"/>'),
  17: celSvg('<path d="M5 4l2.6 3L12 3l4.4 4L19 4v5H5Z" fill="currentColor" stroke="none"/><circle cx="12" cy="11.4" r="1.9" fill="currentColor" stroke="none"/><path d="M12 13.6v3.4M12 14.6 8 16.4M12 14.6l4 1.8M12 17H8.6v4M12 17h3.4v4M6 21.5h12" stroke-width="1.7"/>'),
};
function celHighlight(i) {
  const btns = $$('#cel-opts [data-cp]'); if (!btns.length) return;
  celSel = ((i % btns.length) + btns.length) % btns.length;
  btns.forEach((b, k) => b.classList.toggle('sel', k === celSel));
  const nm = $('#cw-name'); if (nm) nm.textContent = btns[celSel].dataset.nm;
}
// aim with the mouse like a real emote wheel: whatever direction you point from the middle
window.addEventListener('mousemove', (e) => {
  if (!celPickOpen()) return;
  const box = $('#cel-opts').getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2, dx = e.clientX - cx, dy = e.clientY - cy;
  if (Math.hypot(dx, dy) < 34) return;
  const n = $$('#cel-opts [data-cp]').length, a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const i = Math.round(a / (Math.PI * 2 / n)) % n; if (i !== celSel) celHighlight(i);
});
function closeCelPick() { $('#cel-pick').classList.add('hidden'); }
function pickCel(id) { SET.cel = id; saveSet(); pushEv({ t: 'cel', id }); closeCelPick(); toast(`Emote: ${(CELS.find(c => c[0] === id) || [0, 'Random'])[1]}`, 1200); }
function show(id) {
  if (st.screen !== id && !['howto', 'settings'].includes(st.screen)) st.prev = st.screen;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  st.screen = id;
  if (id === 'menu') { refreshProfile(); setTimeout(maybeAskTutorial, 900); }
  if (id === 'setup') renderSetup();
  if (id === 'online') renderOnline();
  if (id === 'auth') oauthButtons();
  if (id === 'settings') { renderSettings(); renderTwofa(); renderDevicesRow(); renderAccountRows(); }
  if (id === 'locker') renderLocker();
  if (id === 'season') renderSeason();
  if (id === 'rosters') renderRosters();
  if (id === 'playbooks') renderPlaybooks();
  if (id === 'ut') renderUT();
  if (id === 'progress') renderProgress();
  if (id === 'creator') renderCreator();
  if (id === 'modes') renderModes();
  if (id === 'social') renderSocial();
  if (id === 'menu') { renderMenuBoard(); refreshUnread(); checkBan(); refreshAdminBadge(); const P = !isGuest() && profile(); if (P && !st.playing) { try { const q = JSON.parse(localStorage.getItem(QUIT_KEY()) || 'null'); if (q && q.k) { applyQuitLoss(q); setTimeout(() => toast('You left your last game in the middle, so it counted as a loss.', 5000), 800); } } catch (_) {} }
  if (P) { P.settleSeasons(); for (const n of P.notice || []) toast(n, 6000); P.notice = []; (P.cloudReady || Promise.resolve()).then(() => { if (!st.dailyShown && !st.playing && st.screen === 'menu' && P === profile() && P.loginState().claimable) { st.dailyShown = true; setTimeout(() => openDaily(), 600); } updateDailyTile(); }); refreshChip(); } }
  if (id === 'admin') renderAdmin();
  if (id === 'franchise') Fr.renderFranchise();
  if (id === 'league') League.renderLeague();
  if (id === 'menu' && !st.playing) League.leftLeagueScreen();
  if (id !== 'online') stopLobby();
}
const LOCKED = ['ut', 'season', 'online', 'progress', 'creator', 'modes', 'franchise', 'league'];
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
  if (g === 'league' && !isGuest()) { const P = profile(); if (P && P.p.lvl < 5) { toast(`Online Franchise unlocks at level 5. You're level ${P.p.lvl}.`, 3500); return; } }
  if (g === 'back') {
    if (st.playing) backToPause();
    else show(st.prev || 'menu');
  } else show(g);
}));
$$('.logo-slot').forEach(s => s.appendChild($('#tpl-logo').content.cloneNode(true)));
$('#yr').textContent = new Date().getFullYear();

function backToPause() { $$('.screen').forEach(s => s.classList.remove('active')); st.screen = 'game'; $('#pause').classList.remove('hidden'); }
function injBanner(t, mine) {
  const el = document.getElementById('inj-top') || Object.assign(document.createElement('div'), { id: 'inj-top', className: 'inj-top', role: 'status' });
  if (!el.parentNode) (document.getElementById('hud') || document.body).appendChild(el);
  el.innerHTML = `<b>${mine ? 'Injury' : 'Opponent injury'}</b><span></span>`; el.querySelector('span').textContent = t;
  el.classList.toggle('opp', !mine); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(injBanner._t); injBanner._t = setTimeout(() => el.classList.remove('show'), 4500);
}
function toast(t, ms = 2400) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), ms); }

// ---------------- anti-cheat: speed hacks vs lag vs skill ----------------
// A speed hack makes the game's own timer run fast, so the game plays out quicker than real time. The game compares how
// much game time it stepped against the computer's real clock (Date.now, which those tools don't touch) every 20 seconds.
// Lag and slow frames only ever make the game run SLOWER than real time, so they can never trip it, and nothing a
// skilled player does changes the clock at all.
let acW = null;
function speedCheck(dt) {
  const g = st.game; if (!g || st.practice || st.drill || st.mode === 'guest') { acW = null; return; }
  const w = Date.now();
  if (!acW || acW.g !== g || w - acW.t0 > 60000) { acW = { g, t0: w, p: 0, hits: 0 }; return; }   // a gap (tab hidden, pause): start over
  acW.p += dt;
  const span = (w - acW.t0) / 1000; if (span < 20) return;
  if (acW.p / span > 1.35) acW.hits++; else acW.hits = Math.max(0, acW.hits - 1);
  if (acW.hits >= 2) { g.ac = g.ac || { n: 0, why: '' }; g.ac.n++; if (!g.ac.why) g.ac.why = 'game ran faster than real time (speed hack)'; acW.hits = 0; }
  acW.t0 = w; acW.p = 0;
}
// ---------------- idle kick: sitting in a game without touching anything gets you removed ----------------
// Online games: 75 seconds (your opponent shouldn't wait on you). CPU games: 3 minutes unpaused. A warning shows 15 seconds before.
// If the game counts, leaving this way is a loss, same as quitting.
let lastInput = performance.now(), idleWarned = false;
for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel']) addEventListener(ev, () => { lastInput = performance.now(); idleWarned = false; }, { passive: true, capture: true });
function idleCheck() {
  if (pad.on && (Math.abs(pad.jx) > 0.25 || Math.abs(pad.jy) > 0.25 || Math.abs(pad.rx) > 0.25 || Math.abs(pad.ry) > 0.25 || pad.sprint)) lastInput = performance.now();
  if (!st.playing || st.overShown || st.mode === 'spec' || st.mode === 'clip' || st.replay || st.practice || st.drill || TUT.on) { lastInput = performance.now(); return; }
  if (st.mode === 'cpu' && st.paused) { lastInput = performance.now(); return; }
  if ((st.game && st.game.toss) || $('#toss')) { lastInput = performance.now(); return; }
  const lim = (st.mode === 'host' || st.mode === 'guest') ? 75 : 180, idle = (performance.now() - lastInput) / 1000;
  if (idle >= lim - 15 && !idleWarned) { idleWarned = true; toast('Still there? Move or press anything, or you\'ll be removed from the game for being idle.', 6000); sfx.play('ui'); }
  if (idle >= lim) {
    const counts = quitKind();
    if (counts) applyQuitLoss(quitInfo());
    leaveGame(); show('menu');
    toast(counts ? 'You were removed for being idle too long. It counts as a loss.' : 'You were removed for being idle too long.', 6000);
  }
}
setInterval(idleCheck, 1000);

// ---------------- splash → auth ----------------
let splashDone = false;
const authReady = Auth.init().catch(() => null);
function endSplash() {
  if (splashDone) return; splashDone = true;
  authReady.then(user => { setupAuthUI(); const oe = Auth.mode === 'supabase' && Auth.oauthError(); if (oe && !user) { show('auth'); return authMsg('Google login didn’t go through: ' + oe, true); }
    // opened from the itch.io page to log in or link with Google: start it right away
    const want = Auth.mode === 'supabase' && !Auth.framed() && (params.get('login') || params.get('link')); if (want === 'google') { try { history.replaceState(null, '', location.pathname); } catch (_) {} if (params.get('link') && user) Auth.linkLogin('google').catch(e => toast(e.message)); else if (!user) { Auth.oauthLogin('google').catch(e => authMsg(e.message, true)); return show('auth'); } }
    if (Auth.recovery) return showAuthForm('newpw'); if (Auth.needMfa) { setCodeNote(); return showAuthForm('code'); } show(user ? 'menu' : 'auth'); });
}
$('#splash').addEventListener('click', endSplash);
setTimeout(endSplash, 2900);

// ---------------- auth UI ----------------
function setupAuthUI() {
  const sb = Auth.mode === 'supabase';
  $('.lbl-id').textContent = sb ? 'Email or username' : 'Username';
  $('#li-id').type = 'text';
  $('.email-row').classList.toggle('hidden', !sb);
  $('#su-email').required = sb;
  $('#auth-mode').innerHTML = sb ? '✓ Online accounts are on — your record syncs everywhere.'
    : 'Online features are unavailable right now. You can still play against the CPU. Accounts made now are saved on this device only.';
  if (!sb) console.warn('[Endzone Kings] Supabase is not configured: add your keys in js/config.js (see README) to turn on real accounts and online play.');
}
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  showAuthForm(t.dataset.tab, true);
  authMsg('');
}));
// which auth form shows: login, signup, forgot (send reset email) or newpw (opened from the reset email)
function showAuthForm(f, fromTab) {
  if (!fromTab) show('auth');
  for (const k of ['login', 'signup', 'forgot', 'newpw', 'code']) $('#form-' + k).classList.toggle('hidden', k !== f);
  $('.auth-panel .tabs').classList.toggle('hidden', f === 'newpw' || f === 'forgot' || f === 'code');
  $('#guest-btn').classList.toggle('hidden', f === 'newpw'); $('.auth-panel .divider').classList.toggle('hidden', f === 'newpw');
  if (f === 'newpw') setTimeout(() => $('#np-pw').focus(), 50);
}
Auth.onRecovery = () => showAuthForm('newpw');
$('#li-forgot').addEventListener('click', () => {
  if (Auth.mode !== 'supabase') { authMsg('Accounts on this device can’t be reset. Online accounts can.', true); return; }
  $('#fp-email').value = $('#li-id').value.trim(); authMsg(''); showAuthForm('forgot', true);
});
$('#fp-back').addEventListener('click', () => { authMsg(''); showAuthForm('login', true); });
$('#form-forgot').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter || $('#form-forgot .btn'), async () => {
    try { const to = await Auth.resetPassword($('#fp-email').value); authMsg(`Sent to ${to}! Check your email (and spam) for the reset link.`); $('#li-id').value = $('#fp-email').value.trim(); showAuthForm('login', true); }
    catch (err) { authMsg(/rate|seconds/i.test(err.message) ? 'Hold up, wait a minute before asking for another link.' : err.message, true); }
  });
});
$('#form-newpw').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#np-pw').value !== $('#np-pw2').value) { authMsg('Those passwords don’t match', true); return; }
  busy(e.submitter || $('#form-newpw .btn'), async () => {
    try { await Auth.setNewPassword($('#np-pw').value); $('#np-pw').value = $('#np-pw2').value = ''; authMsg(''); show('menu'); toast('Password changed. You’re logged in.'); }
    catch (err) { authMsg(err.message, true); }
  });
});
// ---------------- daily login reward: you see it, you hit Claim, THEN the coins land; a timer counts down to the next one
const hms = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
function updateDailyTile() {
  const P = !isGuest() && Auth.user ? profile() : null, el = $('#daily-sub'), tile = $('#daily-tile'); if (!el || !tile) return;
  if (!P) { tile.classList.remove('ready'); el.textContent = 'Claim free coins and packs every day'; return; }
  const L = P.loginState(); tile.classList.toggle('ready', L.claimable);
  el.textContent = L.claimable ? `Day ${L.streak} ready: ${L.R.coins} coins${L.R.pack ? ' + 1 pack' : ''}` : `Next reward in ${hms(L.next)}`;
}
setInterval(() => { if (st.screen === 'menu') updateDailyTile(); }, 1000);
// the claim moment: the day's card pops and gets stamped, coins burst out and fly into your coin counter,
// "+N coins" floats up, and a pack drops in if you got one
function claimAnim(card, got, done, target) {
  if (!got || !card || matchMedia('(prefers-reduced-motion: reduce)').matches) { sfx.play('ui'); done(); return; }
  sfx.play('firstdown'); setTimeout(() => sfx.play('td'), 380);
  card.classList.add('claiming');
  const r = card.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const tgt = (target || document.querySelector('#pc-coins') || document.querySelector('.coins-pill'))?.getBoundingClientRect();   // coins fly into the balance in the window
  const tx = tgt && tgt.width ? tgt.left + tgt.width / 2 : innerWidth - 80, ty = tgt && tgt.width ? tgt.top + tgt.height / 2 : 40;
  const layer = document.createElement('div'); layer.className = 'claim-fx'; document.body.appendChild(layer);
  const n = Math.min(22, 8 + Math.round((got.coins || 0) / 60));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'claim-coin'; layer.appendChild(c);
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90, bx = cx + Math.cos(a) * d, by = cy + Math.sin(a) * d - 40;
    c.animate([
      { transform: `translate(${cx}px, ${cy}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${bx}px, ${by}px) scale(1.15)`, opacity: 1, offset: .35 },
      { transform: `translate(${bx}px, ${by}px) scale(1)`, opacity: 1, offset: .5 },
      { transform: `translate(${tx}px, ${ty}px) scale(.5)`, opacity: .2 }
    ], { duration: 1150 + Math.random() * 250, delay: i * 28, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
  }
  const t = document.createElement('div'); t.className = 'claim-pop'; t.textContent = `+${(got.coins || 0).toLocaleString()} coins`; t.style.left = cx + 'px'; t.style.top = cy + 'px'; layer.appendChild(t);
  if (got.pack) { const p = document.createElement('div'); p.className = 'claim-pack'; p.innerHTML = `<b>+1</b><span>${escapeHtml(String(got.pack))} pack</span>`; p.style.left = cx + 'px'; p.style.top = (cy + 64) + 'px'; layer.appendChild(p); }
  setTimeout(done, 1700);
  setTimeout(() => layer.remove(), 2600);
}
function openDaily() {
  const P = !isGuest() && Auth.user ? profile() : null; if (!P) return;
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
  document.body.appendChild(m);
  let tick = null;
  const close = () => { clearInterval(tick); m.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const draw = (justGot) => {
    const L = P.loginState();
    const days = LOGIN_REWARDS_.map((r, i) => `<div class="lg-day ${i + 1 < L.streak || (i + 1 === L.streak && !L.claimable) ? 'got' : i + 1 === L.streak ? 'now' : ''}"><small>Day ${i + 1}</small><b>${r.coins}</b><span>coins${r.tp ? ` +${r.tp} TP` : ''}${r.pack ? ' + 1 pack' : ''}</span></div>`).join('');
    const foot = L.claimable
      ? `<button class="btn primary" type="button" data-claim>Claim ${L.R.coins} coins${L.R.pack ? ` + 1 ${L.R.pack} pack` : ''}</button>`
      : `<p class="daily-done">${justGot ? `Claimed! +${justGot.coins} coins${justGot.pack ? ` + 1 ${justGot.pack} pack` : ''}` : 'Already claimed today'}</p><p class="note">Next reward in <b class="daily-left">${hms(L.next)}</b>. Miss a day and the streak starts over.</p><button class="btn" type="button" data-x>Close</button>`;
    m.innerHTML = `<div class="panel info-card daily-card"><div class="daily-top"><h3 style="margin:0">Daily reward · Day ${L.streak}</h3><span class="coins-pill daily-bal"><i class="coin" aria-hidden="true"></i><b id="daily-bal">${(P.p.coins || 0).toLocaleString()}</b></span></div><div class="login-row">${days}</div>${foot}</div>`;
    const c = m.querySelector('[data-claim]');
    if (c) c.onclick = async () => {
      c.disabled = true; const card = m.querySelector('.lg-day.now'), bal = m.querySelector('#daily-bal'), from = P.p.coins || 0;
      if (await Auth.dailyLock(dayKeyOf()) === false) { P.markLoginClaimed(); refreshChip(); updateDailyTile(); toast('You already claimed today’s reward on another device', 3500); draw(null); return; }
      const got = P.claimLogin(); refreshChip(); updateDailyTile(); try { Auth.flushNow && Auth.flushNow(); } catch (_) {}
      if (got && bal) { const to = P.p.coins || 0, t0 = performance.now(); setTimeout(function step() { const k = Math.min(1, (performance.now() - t0) / 900); bal.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(step); else bal.parentElement.classList.add('coin-hit'); }, 650); }
      claimAnim(card, got, () => draw(got || null), bal);
    };
    const x = m.querySelector('[data-x]'); if (x) x.onclick = close;
  };
  draw(null);
  tick = setInterval(() => { const e = m.querySelector('.daily-left'); if (e) e.textContent = hms(P.loginState().next); if (P.loginState().claimable && e) draw(null); }, 1000);
  m.onclick = e => { if (e.target === m) close(); };
  document.addEventListener('keydown', key, true);
}
$('#daily-tile').addEventListener('click', () => { sfx.play('ui'); if ((isGuest() || !Auth.user) && !LOCALNET) return lockPrompt('Daily Reward'); openDaily(); });
// ---------------- two-step login (authenticator app) ----------------
$('#form-code').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter || $('#form-code .btn'), async () => {
    try { await Auth.verifyMfa($('#code-in').value, $('#code-remember').checked); $('#code-in').value = ''; $('#code-remember').checked = false; authMsg(''); show('menu'); }
    catch (err) { authMsg(err.message, true); }
  });
});
// login code screen: tell them exactly which entry to look for in the app ("Endzone Kings" + their email)
function setCodeNote() {
  const e = (Auth.user && Auth.user.email) || '', masked = e ? e.replace(/^(.)[^@]*(@.*)$/, '$1•••$2') : 'your email';
  $('#code-note').innerHTML = `Two-step login is on for this account. Open your authenticator app (Google Authenticator, Microsoft Authenticator or Authy) and find <b>Endzone Kings</b> with <b>${escapeHtml(masked)}</b> under it. Type the 6-digit code it shows. The code changes every 30 seconds, so use the newest one.`;
}
// the full two-step login guide lives in How to Play
function openTfaGuide() { show('howto'); setTimeout(() => { const g = document.getElementById('howto-2fa'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); }
$('#code-help').addEventListener('click', openTfaGuide);
$('#code-back').addEventListener('click', async () => { await Auth.signOut(); authMsg(''); showAuthForm('login', true); });
async function renderTwofa() {
  const row = $('#tf-row'); if (!row) return;
  const ok = Auth.mode === 'supabase' && Auth.user && Auth.user.kind === 'account';
  row.classList.toggle('hidden', !ok); if (!ok) return;
  const on = await Auth.twofaOn();
  if (on === null) { row.classList.add('hidden'); return; }
  $('#tf-sub').textContent = on ? 'On: logging in needs the code from your authenticator app' : 'Off: anyone with your password can log in';
  $('#tf-btn').textContent = on ? 'Turn off' : 'Turn on'; $('#tf-btn').dataset.on = on ? '1' : '';
}
// "remember this device" ran out while the game was open: log out right away (after the final whistle if you're in a
// game), like other games do. Logging back in asks for the authenticator code. Checked every 30 seconds.
let mfaLapse = false, mfaDue = false;
async function checkMfaLapse() {
  if (mfaLapse || Auth.mode !== 'supabase' || !Auth.user || Auth.user.kind !== 'account' || !Auth.client) return;
  try {
    if (!mfaDue) { const { data, error } = await Auth.client.rpc('ek_mfa_ok'); if (error || data !== false) return; mfaDue = true; }
    if (st.playing && !st.overShown) return;   // mid-game: wait for the final whistle (checked every 2 seconds from here)
    mfaLapse = true; mfaDue = false;
    if (st.playing) leaveGame();
    await Auth.signOut(); show('auth');
    toast('Your 10 days on this device are up, so you were logged out. Log in again with your authenticator code.', 6000);
    mfaLapse = false;
  } catch (_) { mfaLapse = false; }
}
setInterval(checkMfaLapse, 30000);
setInterval(() => { if (mfaDue) checkMfaLapse(); }, 2000);   // once it's due, log out the moment the game ends
function codeModal(title, bodyHTML, onCode) {
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 64;
  m.innerHTML = `<form class="panel info-card form tf-card"><h3 style="margin:0">${title}</h3>${bodyHTML}<label>6-digit code<input inputmode="numeric" autocomplete="one-time-code" maxlength="8" required placeholder="123456"></label><p class="msg" role="status"></p><button class="btn primary" type="submit">Confirm</button><button class="btn" type="button" data-x>Cancel</button></form>`;
  document.body.appendChild(m);
  const f = m.querySelector('form'), inp = m.querySelector('input'), msg = m.querySelector('.msg'); setTimeout(() => inp.focus(), 50);
  m.querySelector('[data-x]').onclick = () => m.remove();
  f.onsubmit = (e) => { e.preventDefault(); busy(f.querySelector('.btn.primary'), async () => { try { await onCode(inp.value); m.remove(); renderTwofa(); } catch (err) { msg.textContent = err.message; msg.classList.add('err'); } }); };
}
$('#tf-btn').addEventListener('click', async () => {
  if ($('#tf-btn').dataset.on) {
    codeModal('Turn off two-step login', '<p class="note">Open your authenticator app, find <b>Endzone Kings</b> and type the 6-digit code to turn two-step login off. Any devices you told to remember you will need a code again if you turn it back on. You can delete the Endzone Kings entry from the app afterwards.</p>', async c => { await Auth.disableMfa(c); toast('Two-step login is off.', 3000); });
    return;
  }
  let en; try { en = await Auth.enrollStart(); } catch (err) { return toast(err.message, 3500); }
  codeModal('Turn on two-step login', `<ol class="tf-steps"><li><b>Get an authenticator app</b> on your phone: Google Authenticator, Microsoft Authenticator or Authy. All free in the App Store and Google Play.</li><li><b>Add Endzone Kings:</b> in the app tap <b>+</b> (or <b>Add account</b>), choose <b>Scan a QR code</b> and point your camera at this code.</li></ol><canvas class="tf-qr" width="232" height="232" aria-label="QR code for your authenticator app"></canvas><p class="note">Can’t scan it? In the app choose <b>Enter a setup key</b>, name it Endzone Kings and type this key: <code class="tf-secret">${escapeHtml(en.secret || '')}</code></p><ol class="tf-steps" start="3"><li><b>Type the 6-digit code</b> the app now shows for Endzone Kings, then press Confirm. Codes change every 30 seconds, so use the newest one.</li></ol><button class="link tf-how" type="button">How does two-step login work?</button>`,
    async c => { await Auth.enrollFinish(en.id, c); toast('Two-step login is on. You’ll need a code from the app every time you log in.', 4000); });
  drawQR(document.querySelector('.tf-card .tf-qr'), en.uri);
  const how = document.querySelector('.tf-card .tf-how'); if (how) how.onclick = () => { document.querySelector('.tf-card').closest('.modal').remove(); openTfaGuide(); };
});
// crisp, square QR drawn from the authenticator link (black squares on white, with the quiet border scanners need)
async function drawQR(cv, text) {
  if (!cv || !text) return;
  try {
    const qrcode = (await import('../vendor/qrcode.js')).default;
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), quiet = 4, cells = n + quiet * 2, px = Math.floor(cv.width / cells), size = px * cells;
    cv.width = cv.height = size;
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
  } catch (e) { cv.replaceWith(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Couldn’t draw the QR code. Type the key below into the app instead.' })); }
}
// ---------------- patch notes (top left of the main menu) ----------------
const PN_KEY = 'ek_pn_seen';
function fmtDate(d) { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); } catch (_) { return d; } }
function refreshPn() {
  { const f = document.getElementById('foot-v'); if (f) f.textContent = `Season ${SEASON} · v${NOTES[0].v}`; }
  $('#pn-v').textContent = `S${SEASON} · v${NOTES[0].v}`;
  let seen = null; try { seen = localStorage.getItem(PN_KEY); } catch (_) {}
  $('#pn-dot').classList.toggle('hidden', seen === NOTES[0].v);
}
function openPatchNotes() {
  try { localStorage.setItem(PN_KEY, NOTES[0].v); } catch (_) {}
  refreshPn();
  const esc = t => escapeHtml(t), rx = q => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const mark = (t, q) => q ? esc(t).replace(rx(esc(q)), x => `<mark>${x}</mark>`) : esc(t);
  const li = (a, q) => a.map(x => `<li>${mark(x, q)}</li>`).join('');
  // search: a version number ("1.0.2", "1.0") shows those versions whole; any other word shows just the lines that mention it
  const render = raw => {
    const q = raw.trim(), lq = q.toLowerCase();
    const out = NOTES.map((n, i) => {
      const verHit = !q || n.v.toLowerCase().includes(lq.replace(/^v(ersion)?\s*/, ''));
      const isVer = /^v?(ersion)?\s*\d+(\.\d*)*$/i.test(q);
      if (isVer && !verHit) return '';   // a version search only shows that version
      const pick = arr => !arr ? [] : (verHit && (isVer || !q)) ? arr : arr.filter(x => x.toLowerCase().includes(lq));
      const ad = pick(n.added), fx = pick(n.fixed), mq = isVer ? '' : q;
      if (!ad.length && !fx.length && !(verHit && isVer)) return '';
      return `<section class="pn-entry"><div class="pn-head"><b>Season ${SEASON} · Version ${esc(n.v)}</b>${i === 0 ? '<span class="pn-new">Latest</span>' : ''}<small>${fmtDate(n.date)}</small></div>${ad.length ? `<h4>New</h4><ul>${li(ad, mq)}</ul>` : ''}${fx.length ? `<h4>Fixed</h4><ul>${li(fx, mq)}</ul>` : ''}</section>`;
    }).join('');
    return out || `<p class="pn-none">Nothing matches “${esc(q)}”. Try a version like 1.0.2 or a word like passing.</p>`;
  };
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
  m.innerHTML = `<div class="panel info-card pn-card"><h3 style="margin:0">Patch notes <span class="season-tag sm">Season ${SEASON}</span></h3><input class="pn-search" type="search" placeholder="Search a version or keyword" aria-label="Search patch notes" autocomplete="off"><div class="pn-list">${render('')}</div><button class="btn primary" type="button" data-x>Close</button></div>`;
  const sIn = m.querySelector('.pn-search'), list = m.querySelector('.pn-list');
  sIn.addEventListener('input', () => { list.innerHTML = render(sIn.value); list.scrollTop = 0; });
  sIn.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  m.querySelector('[data-x]').onclick = close; m.onclick = e => { if (e.target === m) close(); };
}
$('#pn-btn').addEventListener('click', () => { sfx.play('ui'); openPatchNotes(); });
refreshPn();
// ---------------- auto update: no refresh needed ----------------
// bump-version.sh stamps every file with ?v=<time> and writes version.json. The game knows its own stamp (from its
// own URL); it checks version.json every 10 seconds and when you come back to the tab. Newer one out? It reloads itself
// right away on any screen, or waits till you're out of a game. Loading with ?u=<v> skips the browser's cached page.
const MY_V = +(new URL(import.meta.url).searchParams.get('v') || 0);
let pendingV = 0;
try { if (new URLSearchParams(location.search).has('u')) history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
async function checkUpdate() {
  if (!MY_V || !/^https?:$/.test(location.protocol)) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const v = +((await r.json()).v || 0);
    if (v > MY_V) { pendingV = v; applyUpdate(); }
  } catch (_) {}
}
function applyUpdate() {
  if (!pendingV || st.playing || st.screen === 'game' || (st.game && !st.overShown && !st.paused && st.screen === 'game')) return;   // never in a game: any other screen is fine
  if (st.peer || st.spec) return;   // not while hosting / joining / watching an online game
  const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && ae.value && ae.type !== 'checkbox' && ae.type !== 'range') return;   // not mid-typing
  let tried = null; try { tried = sessionStorage.getItem('ek_upd'); } catch (_) {}
  if (tried === String(pendingV)) return;   // already reloaded for this one: don't loop
  try { sessionStorage.setItem('ek_upd', String(pendingV)); } catch (_) {}
  toast('New update! Updating to the newest version…', 4000);
  setTimeout(() => location.replace(location.pathname + '?u=' + pendingV + location.hash), 3200);
}
setInterval(checkUpdate, 10000);   // every 10 seconds (a tiny file, no-store)
setInterval(applyUpdate, 5000);   // picks it up once you're back on the menu
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
setTimeout(checkUpdate, 4000);
// ---------------- devices logged into your account ----------------
// "Computer · Chrome 131 · Windows 10/11" from the browser's user agent
function deviceInfo(ua) {
  ua = ua || ''; const v = (re) => { const m = ua.match(re); return m ? m[1] : ''; };
  const browser = /Edg\//.test(ua) ? `Edge ${v(/Edg\/(\d+)/)}` : /OPR\//.test(ua) ? `Opera ${v(/OPR\/(\d+)/)}` : /SamsungBrowser\//.test(ua) ? `Samsung Internet ${v(/SamsungBrowser\/(\d+)/)}`
    : /CriOS\//.test(ua) ? `Chrome ${v(/CriOS\/(\d+)/)}` : /FxiOS\//.test(ua) ? `Firefox ${v(/FxiOS\/(\d+)/)}` : /Chrome\//.test(ua) ? `Chrome ${v(/Chrome\/(\d+)/)}`
    : /Firefox\//.test(ua) ? `Firefox ${v(/Firefox\/(\d+)/)}` : /Safari\//.test(ua) ? `Safari ${v(/Version\/(\d+(?:\.\d+)?)/)}` : 'Unknown browser';
  const sys = /CrOS/.test(ua) ? 'ChromeOS' : /iPhone|iPad|iPod/.test(ua) ? `iOS ${v(/OS (\d+(?:_\d+)?)/).replace('_', '.')}` : /Android/.test(ua) ? `Android ${v(/Android (\d+(?:\.\d+)?)/)}`
    : /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows NT 6\.3/.test(ua) ? 'Windows 8.1' : /Windows NT 6\.1/.test(ua) ? 'Windows 7' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? `macOS ${v(/Mac OS X (\d+[_.]\d+)/).replace('_', '.')}` : /Linux/.test(ua) ? 'Linux' : 'Unknown system';
  const type = /CrOS/.test(ua) ? 'Chromebook' : /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /iPhone|Mobile|Android/.test(ua) ? 'Phone' : ua ? 'Computer' : 'Unknown device';
  return { type, browser: browser.trim(), sys: sys.trim() };
}
const agoTxt = t => { const s = (Date.now() - new Date(t).getTime()) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} hr ago` : `${Math.round(s / 86400)} days ago`; };
// ---------- account: email (private) and linked logins ----------
const PROV_NAME = { google: 'Google', discord: 'Discord', email: 'Email' };
async function renderAccountRows() {
  const acc = Auth.mode === 'supabase' && Auth.user && Auth.user.kind === 'account';
  $('#acct-row').classList.toggle('hidden', !acc); $('#del-row').classList.toggle('hidden', !acc); $('#link-row').classList.add('hidden');
  if (!acc) return;
  $('#acct-email').textContent = `${Auth.user.email || 'No email'} · your login email, where password resets and verification emails go. Only you can see this`;
  const prov = await Auth.providers(); if (!prov.google) return;   // nothing to link until Google is switched on
  let ids = []; try { ids = await Auth.identities(); } catch (_) {}
  const has = p => ids.find(i => i.provider === p);
  $('#link-list').innerHTML = ['email', 'google'].filter(p => p === 'email' || prov[p]).map(p => {
    const i = has(p);
    if (p === 'email') return `<span class="link-pill on">Email ✓</span>`;
    return i ? `<span class="link-pill on">${PROV_NAME[p]} ✓<button class="link" type="button" data-unlink="${p}">Unlink</button></span>` : `<button class="btn sm" type="button" data-link="${p}">Link ${PROV_NAME[p]} Account</button>`;
  }).join('');
  $('#link-row').classList.remove('hidden');
  $$('#link-list [data-link]').forEach(b => b.onclick = async () => { sfx.play('ui'); try { if (await Auth.linkLogin(b.dataset.link) === 'tab') toast('Opened the full site in a new tab to link Google', 4500); } catch (e) { toast(oauthMsg(e)); } });
  $$('#link-list [data-unlink]').forEach(b => b.onclick = async () => {
    const i = has(b.dataset.unlink); if (!i) return;
    if (ids.length < 2) return toast('You need at least one way to log in');
    if (!(await askYes(`Unlink ${PROV_NAME[b.dataset.unlink]}? You can still log in with your email and password.`, 'Unlink'))) return;
    try { await Auth.unlinkLogin(i); toast(`${PROV_NAME[b.dataset.unlink]} unlinked`); renderAccountRows(); } catch (e) { toast(e.message || 'Couldn’t unlink that'); }
  });
}
// delete your account: with two-step login on you type a fresh authenticator code; without it you confirm twice
$('#del-btn').addEventListener('click', async () => {
  sfx.play('ui');
  if (!(Auth.mode === 'supabase' && Auth.user && Auth.user.kind === 'account')) return;
  const uid = Auth.user.id;
  const wipe = async () => {
    const { error } = await Auth.client.rpc('ek_delete_me'); if (error) throw new Error(error.message);
    try { for (const k of ['ek_prof_', 'ek_franchise_', 'ek_season_', 'ek_quit_', 'ek_trust_']) localStorage.removeItem(k + uid); } catch (_) {}
    try { await Auth.signOut(); } catch (_) { Auth.user = null; }
    show('auth'); toast('Your account was deleted.', 5000);
  };
  let f = null; try { f = await Auth.totpFactor(); } catch (_) {}
  if (f) {
    codeModal('Delete your account', '<p class="note"><b>This deletes your account and everything on it for good</b>: your progress, cards, coins, records, friends and messages. It can’t be undone.</p><p class="note">Open your authenticator app, find <b>Endzone Kings</b>, and type the 6-digit code to delete it.</p>', async code => { await Auth.verifyMfa(code, false); await wipe(); });
    return;
  }
  if (!(await askYes('Delete your account? This deletes your progress, cards, coins, records, friends and messages for good.', 'Delete account'))) return;
  if (!(await askYes('Are you really sure? Your account can’t be brought back after this.', 'Yes, delete it forever'))) return;
  try { await wipe(); } catch (e) { toast(e.message || 'Couldn’t delete the account'); }
});
$('#acct-email-btn').addEventListener('click', () => {
  sfx.play('ui');
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
  m.innerHTML = `<div class="panel info-card"><h3 style="margin:0">Change email</h3><p class="note">This changes the email on your whole account: it becomes the email you <b>log in with</b>, and it’s where <b>password resets</b> and <b>verification emails</b> go from now on. We’ll send a confirmation link to the new email first, and nothing changes until you click it. Nobody else can see your email.</p>
    <label>New email<input id="ce-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
    <div class="actions"><button class="btn primary" type="button" id="ce-go">Send confirmation</button><button class="btn" type="button" data-x>Cancel</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector('[data-x]').onclick = () => m.remove();
  m.querySelector('#ce-go').onclick = async () => {
    const v = m.querySelector('#ce-email').value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) return toast('Type a real email');
    try { await Auth.changeEmail(v); toast('Check your new email for the confirmation link', 4500); m.remove(); } catch (e) { toast(e.message || 'Couldn’t change it'); }
  };
  setTimeout(() => m.querySelector('#ce-email').focus(), 50);
});
const oauthMsg = e => { const m = (e && e.message) || ''; return /not enabled|unsupported provider/i.test(m) ? 'Google login isn’t switched on yet. Try again in a bit.' : /manual linking/i.test(m) ? 'Linking accounts isn’t switched on yet.' : m || 'Couldn’t start the Google login'; };
// "Continue with Google / Discord" on the login screen, only for the ones that are switched on
async function oauthButtons() { try { if (Auth.mode !== 'supabase') return; const p = await Auth.providers(); let any = false; for (const k of ['google']) { const b = document.querySelector(`[data-oauth="${k}"]`); if (b && p[k]) { b.classList.remove('hidden'); any = true; b.onclick = async () => { sfx.play('ui'); try { if (await Auth.oauthLogin(k) === 'tab') authMsg('Google login opened in a new tab. Finish it there and keep playing on that tab.'); } catch (e) { authMsg(oauthMsg(e), true); } }; } } $('#oauth-btns').classList.toggle('hidden', !any); } catch (_) {} }
function renderDevicesRow() { const r = $('#dev-row'); if (r) r.classList.toggle('hidden', !(Auth.mode === 'supabase' && Auth.user && Auth.user.kind === 'account')); }
async function openDevices() {
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 64;
  m.innerHTML = '<div class="panel info-card dev-card"><h3 style="margin:0">Sessions</h3><p class="note">Every device logged into your account right now.</p><div class="dev-list"><p class="note">Loading…</p></div><button class="btn danger" type="button" id="dev-all">Log out all other sessions</button><button class="btn" type="button" data-x>Close</button></div>';
  document.body.appendChild(m); m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = e => { if (e.target === m) m.remove(); };
  const list = m.querySelector('.dev-list');
  const draw = async () => {
    let rows; try { rows = await Auth.sessions(); } catch (err) { list.innerHTML = `<p class="note">Couldn’t load your devices: ${escapeHtml(err.message)}</p>`; return; }
    list.innerHTML = rows.map(r => { const d = deviceInfo(r.user_agent); return `<div class="dev-row ${r.current ? 'me' : ''}"><div><b>${escapeHtml(d.type)}${r.current ? ' <span class="pn-new">This device</span>' : ''}</b><span class="dev-meta">${escapeHtml(d.browser)} · ${escapeHtml(d.sys)}</span><small>Active ${agoTxt(r.last_active)} · logged in ${new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div>${r.current ? '' : `<button class="btn sm" type="button" data-kick="${r.id}">Log out</button>`}</div>`; }).join('') || '<p class="note">No devices found.</p>';
    m.querySelector('#dev-all').disabled = rows.filter(r => !r.current).length === 0;
    list.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => { b.disabled = true; try { await Auth.kickSession(b.dataset.kick); sendKick({ ids: [b.dataset.kick] }); toast('That device is logged out'); } catch (err) { toast(err.message, 3000); } draw(); });
  };
  m.querySelector('#dev-all').onclick = async () => { if (!(await askYes('Log out every other device on your account?', 'Log them out'))) return; try { const n = await Auth.kickOthers(); sendKick({ allBut: await Auth.mySessionId() }); toast(`Logged out ${n} other device${n === 1 ? '' : 's'}`); } catch (err) { toast(err.message, 3000); } draw(); };
  draw();
}
$('#dev-btn').addEventListener('click', () => { sfx.play('ui'); openDevices(); });
// kicked from another device: instant. Each logged-in game listens on a private-ish channel for its account; a kick
// message makes it double-check with the server (so nobody can fake one) and log out on the spot, even mid-game.
let kickCh = null, kickUid = null, kickSid = null;
async function bootIfDead() {
  if (Auth.mode !== 'supabase' || !Auth.user || Auth.user.kind !== 'account') return;
  if (await Auth.sessionAlive()) return;
  if (st.playing) { try { leaveGame(); } catch (_) {} }
  await Auth.signOut(); show('auth'); toast('You were logged out from another device.', 5000);
}
async function syncKickChannel() {
  const uid = Auth.mode === 'supabase' && Auth.user && Auth.user.kind === 'account' ? Auth.user.id : null;
  if (uid === kickUid && kickCh) return;
  if (kickCh) { try { Auth.client.removeChannel(kickCh); } catch (_) {} kickCh = null; }
  kickUid = uid; if (!uid) return;
  kickSid = await Auth.mySessionId();
  kickCh = Auth.client.channel('ek-acct-' + uid, { config: { broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'kick' }, ({ payload }) => {
      const p = payload || {};
      if ((p.ids && p.ids.includes(kickSid)) || (p.allBut && p.allBut !== kickSid)) bootIfDead();
    }).subscribe();
}
function sendKick(payload) { try { if (kickCh) kickCh.send({ type: 'broadcast', event: 'kick', payload }); } catch (_) {} }
setInterval(syncKickChannel, 3000);
setInterval(() => { if (!st.playing) bootIfDead(); }, 20000);   // backup in case a kick message was missed
// ---------------- feedback: bug reports, ideas and help requests go straight to the admin panel ----------------
function openFeedback() {
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
  m.innerHTML = `<form class="panel info-card form fb-card"><h3 style="margin:0">Contact the dev team</h3><p class="note">Found a bug, got an idea, or need help? This goes straight to Habir Studios.</p>
    <div class="seg fb-kind"><button type="button" data-k="bug" class="on">Report a bug</button><button type="button" data-k="idea">Suggestion</button><button type="button" data-k="help">Need help</button></div>
    <label>Message<textarea maxlength="1500" rows="6" required placeholder="What happened? What were you doing? The more detail the better."></textarea></label>
    <p class="note fb-meta"></p><p class="msg" role="status"></p><button class="btn primary" type="submit">Send</button><button class="btn" type="button" data-x>Cancel</button></form>`;
  document.body.appendChild(m);
  const f = m.querySelector('form'), ta = m.querySelector('textarea'), msg = m.querySelector('.msg'); let kind = 'bug';
  const d = deviceInfo(navigator.userAgent);
  m.querySelector('.fb-meta').textContent = `Sent as ${Auth.user ? Auth.user.name : 'a guest'} · ${d.type}, ${d.browser}, ${d.sys} · v${NOTES[0].v}`;
  m.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; m.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b)); });
  m.querySelector('[data-x]').onclick = () => m.remove();
  setTimeout(() => ta.focus(), 50);
  f.onsubmit = (e) => { e.preventDefault(); busy(f.querySelector('.btn.primary'), async () => {
    const text = ta.value.replace(/[<>]/g, '').trim(); if (text.length < 3) { msg.textContent = 'Write a little more first'; msg.classList.add('err'); return; }
    if (Auth.mode !== 'supabase') { msg.textContent = 'Can’t reach the server right now. Try again later.'; msg.classList.add('err'); return; }
    const acct = Auth.user && Auth.user.kind === 'account';
    const { error } = await Auth.client.from('ek_feedback').insert({ user_id: acct ? Auth.user.id : null, username: (Auth.user ? Auth.user.name : 'Guest').slice(0, 24), kind, message: text.slice(0, 1500), device: `${d.type} · ${d.browser} · ${d.sys}`.slice(0, 200), version: NOTES[0].v });
    if (error) { msg.textContent = /lot of messages/i.test(error.message) ? 'You sent a lot of messages. Try again in a bit.' : 'Couldn’t send it: ' + error.message; msg.classList.add('err'); return; }
    m.remove(); toast(kind === 'bug' ? 'Bug report sent. Thanks for helping fix the game!' : kind === 'idea' ? 'Suggestion sent. Thanks!' : 'Sent. The dev team will take a look.', 3500);
  }); };
}
$('#fb-btn').addEventListener('click', () => { sfx.play('ui'); openFeedback(); });
function authMsg(t, err) { const m = $('#auth-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
async function busy(btn, fn) { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } }
$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter || $('#form-login .btn'), async () => {
    try { const r = await Auth.signIn($('#li-id').value, $('#li-pw').value); $('#li-pw').value = ''; if (r && r.needCode) { $('#code-in').value = ''; setCodeNote(); authMsg(''); showAuthForm('code', true); setTimeout(() => $('#code-in').focus(), 50); return; } authMsg(''); show('menu'); }
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
  $('#tile-season-sub').textContent = SS ? (SS.phase === 'done' ? 'Season complete. Start a new one' : `${TEAMS[SS.team].city}, ${SS.standings[SS.team].w}W-${SS.standings[SS.team].l}L, ${SS.phase === 'regular' ? 'week ' + (SS.week + 1) : 'playoffs'}`) : 'Chase the Kings Bowl';
  $('#pc-name').textContent = u.name;
  if (u.id === ADMIN_ID) $('#pc-name').insertAdjacentHTML('beforeend', '<span class="admin-badge owner-badge" title="Owner of Habir Studios">OWNER</span>');
  $('#pc-avatar').textContent = u.name[0].toUpperCase();
  { const R2 = u.recs, f = (w, l, t) => `${w || 0}W-${l || 0}L${t ? '-' + t + 'T' : ''}`;
    const box = (n, w, l, t) => `<span class="rec-mini"><small>${n}</small><span class="rec-nums"><i><b>${w || 0}</b><em>W</em></i><i class="dash"><b>-</b><em>-</em></i><i><b>${l || 0}</b><em>L</em></i>${t ? `<i class="dash"><b>-</b><em>-</em></i><i><b>${t}</b><em>T</em></i>` : ''}</span></span>`;
    $('#pc-rec').innerHTML = u.kind === 'guest' ? 'Guest' : R2 ? box('Online H2H', R2.on_w, R2.on_l, R2.on_t) : (() => { const P = profile(), r = (P && P.p.recs && P.p.recs.on) || [0, 0, 0]; return box('Online H2H', r[0], r[1], r[2]); })(); void f; }
  $('#logout').textContent = u.kind === 'guest' ? 'Sign in' : 'Log out';
  const guest = isGuest() && !LOCALNET;
  $('.pc-meta').classList.toggle('hidden', guest);
  $$('.tiles .tile').forEach(t => t.classList.toggle('locked', guest && (LOCKED.includes(t.dataset.go) || t.id === 'daily-tile')));
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
// "Random" spins through a few teams, then lands on one
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
function saveSeason(S) { if (S) S.at = Date.now(); try { localStorage.setItem(seasonKey(), JSON.stringify(S)); } catch (_) {} Auth.saveCloud(null, { se: S }); }
// keep franchise and season in step with the cloud save (newest wins), and upload this device's copies if they're newer
function syncExtras() {
  const fr = Auth.cloudExtra('fr'), se = Auth.cloudExtra('se'), sp = Auth.cloudExtra('sp'), cp = Auth.cloudExtra('cp');
  Fr.adoptCloud(fr);
  if (sp && sp.v && (sp.at || 0) > (SET._at || 0)) { Object.assign(SET, sp.v); SET._at = sp.at; saveSet(true); try { sfx.setVolume(SET.vol); sfx.announcer = SET.ann; } catch (_) {} }   // settings from your other device
  adoptCloudPlays(cp);
  const cur = loadSeason(); if (se && (!cur || (se.at || 0) > (cur.at || 0))) { try { localStorage.setItem(seasonKey(), JSON.stringify(se)); } catch (_) {} }
  const lf = Fr.load(), ls = loadSeason(), x = {};
  if (lf && (!fr || (lf.at || 0) > (fr.at || 0))) x.fr = lf;
  if (ls && (!se || (ls.at || 0) > (se.at || 0))) x.se = ls;
  if (SET._at && (!sp || SET._at > (sp.at || 0))) x.sp = { at: SET._at, v: syncedSet() };
  { const lp = localPlays(); if (lp.at && (!cp || lp.at > (cp.at || 0))) x.cp = lp; }
  return x;
}
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
  $('#hub-team').innerHTML = `<img class="hb-logo" alt="" src="${logoURL(me, 136)}"><div><b>${t.city}</b><span>${rec.w}W-${rec.l}L${rec.t ? '-' + rec.t + 'T' : ''} record, ${teamOvr(me)} OVR</span></div>`;
  const g = Season.userGame(S);
  const nx = $('#hub-next');
  if (S.phase !== 'done' && !g) {
    nx.innerHTML = `<small>${Season.phaseLabel(S)}</small><b>Bye week</b><span>Rest up. The rest of the league plays this week.</span>`;
    $('#season-play').classList.add('hidden'); $('#season-sim').classList.remove('hidden'); $('#season-sim').textContent = 'Next week';
    $('#season-quit').textContent = 'Abandon season';
  } else if (S.phase === 'done') {
    const champ = TEAMS[S.champion];
    nx.innerHTML = S.champion === me ? `<small>SEASON COMPLETE</small><b>🏆 Kings Bowl Champions!</b>` : `<small>SEASON COMPLETE</small><b>${champ.city} won the Kings Bowl</b><span>${S.eliminated ? 'You missed out this year.' : ''}</span>`;
    $('#season-play').classList.add('hidden'); $('#season-sim').classList.add('hidden');
    $('#season-quit').textContent = 'Start new season';
  } else {
    const opp = g.home === me ? g.away : g.home, o = TEAMS[opp];
    const label = Season.phaseLabel(S); $('#season-sim').textContent = 'Simulate';
    nx.innerHTML = `<small>${label}</small><b>${g.home === me ? 'vs' : '@'} ${o.city}</b><span><i class="dot" style="background:${o.jersey}"></i>${o.abbr}, ${teamOvr(opp)} OVR, ${S.standings[opp].w}W-${S.standings[opp].l}L</span>`;
    $('#season-play').classList.remove('hidden'); $('#season-sim').classList.remove('hidden');
    $('#season-quit').textContent = 'Abandon season';
  }
  // schedule
  const rows = [];
  S.weeks.forEach((wk, i) => {
    const x = wk.find(q => q.home === me || q.away === me);
    if (!x) { rows.push(`<div class="sr ${i === S.week && S.phase === 'regular' ? 'cur' : ''}"><span>W${i + 1}</span><b class="note">Bye week</b></div>`); return; }
    const opp = x.home === me ? x.away : x.home;
    const mine = x.home === me ? [x.hs, x.as] : [x.as, x.hs];
    const res = mine[0] === null ? '' : mine[0] > mine[1] ? `<em class="w">W ${mine[0]}-${mine[1]}</em>` : mine[0] < mine[1] ? `<em class="l">L ${mine[0]}-${mine[1]}</em>` : `<em>T ${mine[0]}-${mine[1]}</em>`;
    rows.push(`<div class="sr ${i === S.week && S.phase === 'regular' ? 'cur' : ''}"><span>W${i + 1}</span><i class="dot" style="background:${TEAMS[opp].jersey}"></i><b>${x.home === me ? 'vs' : '@'} ${TEAMS[opp].city}</b>${res}</div>`);
  });
  if (S.playoffs) {
    const P = S.playoffs;
    const pg = (lbl, x) => x ? `<div class="sr po ${x.home === me || x.away === me ? 'cur' : ''}"><span>${lbl}</span><b>${TEAMS[x.away].abbr} @ ${TEAMS[x.home].abbr}</b>${x.hs !== null ? `<em>${x.as}-${x.hs}</em>` : ''}</div>` : '';
    if (P.rounds) { const L = { wildcard: 'WC', divisional: 'DIV', conference: 'CONF', final: 'BOWL' }; for (const k of ['wildcard', 'divisional', 'conference', 'final']) for (const x of P.rounds[k] || []) rows.push(pg(L[k], x)); }
    else rows.push(pg('SEMI', P.semis[0]) + pg('SEMI', P.semis[1]) + pg('BOWL', P.final));
  }
  $('#sched').innerHTML = rows.join('');
  if (S.v === 2) {
    // NFL standings: by division; division winners plus 3 wild cards per conference make it
    // playoff bracket once the postseason starts
  { let bx = $('#season-bracket'); if (!bx) { bx = document.createElement('div'); bx.id = 'season-bracket'; $('#stand-h').parentNode.insertBefore(bx, $('#stand-h')); }
    bx.innerHTML = S.playoffs ? `<h3 class="store-h">Playoff bracket</h3>${bracketHTML(S, S.team, logoURL)}` : ''; }
  // injury report: tap a player for the details
  { let box = $('#season-inj'); if (!box) { box = document.createElement('div'); box.id = 'season-inj'; box.className = 'season-inj'; $('#stand-h').parentNode.insertBefore(box, $('#stand-h')); }
    const ros = getRoster(S.team).players, rows = [...Object.entries(S.inj || {}).map(([r, j]) => ({ r, j, out: true })), ...Object.entries(S.ling || {}).filter(([r]) => !(S.inj || {})[r]).map(([r, j]) => ({ r, j, out: false }))];
    const hot = Object.entries(S.form || {}).filter(([, f]) => Math.abs(f) >= 1.5).sort((a, b) => b[1] - a[1]);
    box.innerHTML = (rows.length ? `<h3 class="store-h">Injury report</h3><ul class="fr-log">${rows.map(({ r, j, out }) => `<li class="inj-li" data-sinj="${r}"><i class="inj-cross ${out ? '' : 'q'}">✚</i><b>${escapeHtml(ros[r] ? ros[r].name : r)}</b> (${r}): ${out ? `${escapeHtml(j.kind)}, out ${j.weeks} more week${j.weeks === 1 ? '' : 's'}` : `playing through ${escapeHtml(j.kind.toLowerCase())}`}<small>details</small></li>`).join('')}</ul>` : '')
      + (hot.length ? `<h3 class="store-h">Form</h3><div class="form-row">${hot.map(([r, f]) => `<span data-sinj="${r}">${escapeHtml(ros[r] ? ros[r].name : r)} ${Form.formTag(f)}</span>`).join('')}</div>` : '');
    box.querySelectorAll('[data-sinj]').forEach(el => el.onclick = () => { const r = el.dataset.sinj, p = ros[r] || {}; showInfo((S.inj || {})[r] ? 'Injury report' : 'Player status', injuryCard({ name: p.name || r, pos: `${r} · ${p.ovr || ''} OVR`, inj: (S.inj || {})[r], ling: (S.ling || {})[r], form: (S.form || {})[r] || 0, backWeek: (S.inj || {})[r] ? (S.week || 0) + 1 + S.inj[r].weeks : 0 })); }); }
  $('#stand-h').textContent = S.phase === 'regular' ? 'Standings (division winners + 3 wild cards per conference make the playoffs)' : 'Final standings';
    const seeds = S.playoffs ? S.playoffs.seeds : [...Season.seeds(S, 'AFC'), ...Season.seeds(S, 'NFC')];
    $('#stand').innerHTML = '<tr><th>Seed</th><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr>' + Season.divisionTables(S).map(D => `<tr class="div-h"><th colspan="7">${D.div}</th></tr>` + D.rows.map(r => {
      const sd = seeds.indexOf(r.team), seed = sd < 0 ? '' : (sd % 7) + 1;
      return `<tr class="${r.team === me ? 'me' : ''}"><td>${seed ? `<small class="seed">${seed}</small>` : ''}</td><td><i class="dot" style="background:${TEAMS[r.team].jersey}"></i>${TEAMS[r.team].city}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pf}</td><td>${r.pa}</td></tr>`;
    }).join('')).join('');
    return;
  }
  const tb = Season.table(S);
  $('#stand-h').textContent = S.phase === 'regular' ? 'Standings (top 4 make the playoffs)' : 'Final standings';
  $('#stand').innerHTML = '<tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr>' + tb.map((r, i) =>
    `<tr class="${r.team === me ? 'me' : ''} ${i === 3 ? 'cut' : ''}"><td>${i + 1}</td><td><i class="dot" style="background:${TEAMS[r.team].jersey}"></i>${TEAMS[r.team].city}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pf}</td><td>${r.pa}</td></tr>`).join('');
}
$('#season-start').addEventListener('click', () => { if (seasonPick < 0) return; saveSeason(Season.newSeason(seasonPick)); renderSeason(); toast(`Welcome to ${TEAMS[seasonPick].city}, coach.`); });
$('#season-sim').addEventListener('click', () => {
  const S = loadSeason(); if (!S) return;
  const g = Season.userGame(S);
  if (g && !$('#season-sim').dataset.busy) {   // watch the sim: the real engine plays it out with a play-by-play feed
    const opp = g.home === S.team ? g.away : g.home; $('#season-sim').dataset.busy = 1;
    watchSim({ teams: [S.team, opp], rosters: [Form.seasonRoster(S), null], names: [TEAMS[S.team].city, TEAMS[opp].city], qlen: SET.qlen, diff: SET.diff, logo: logoURL }).then(res => {
      delete $('#season-sim').dataset.busy;
      const SS = loadSeason(); if (!SS) return;
      const notes = Form.seasonAfterGame(SS, res.ps, res.injLog, 0, res.sc[0] > res.sc[1], res.sc[0] - res.sc[1]);
      Season.finishWeek(SS, res.sc[0], res.sc[1]); saveSeason(SS); renderSeason();
      toast(`${res.sc[0] > res.sc[1] ? 'W' : res.sc[0] < res.sc[1] ? 'L' : 'T'} ${res.sc[0]}-${res.sc[1]}${notes.length ? ' · ' + notes[0] : ''}`, 3500);
    });
    return;
  }
  const r = Season.simMyGame(S); if (!r) Form.tickInjuries(S, []); saveSeason(S); renderSeason();
  if (r) toast(r[0] > r[1] ? `Simmed: W ${r[0]}-${r[1]}` : r[0] < r[1] ? `Simmed: L ${r[0]}-${r[1]}` : `Simmed: T ${r[0]}-${r[1]}`); else if (S.phase !== 'done') toast('Bye week done');
});
$('#season-play').addEventListener('click', () => {
  const S = loadSeason(); if (!S) return;
  const g = Season.userGame(S); if (!g) return;
  const opp = g.home === S.team ? g.away : g.home;
  startCPU({ teams: [S.team, opp], season: true, playoff: S.phase !== 'regular', rosters: [Form.seasonRoster(S), null] });
});
$('#season-quit').addEventListener('click', async () => {
  const S = loadSeason();
  if (S && S.phase !== 'done' && !(await askYes('Abandon this season? Your progress will be lost.', 'Abandon'))) return;
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
  seg($('#seg-wind'), WIND_OPTS, SET.wind || 0, v => { SET.wind = v; saveSet(); if (v >= 15) toast('Heads up: strong wind moves passes and kicks', 2200); });
  seg($('#seg-tod'), TOD_OPTS, SET.tod, v => { SET.tod = v; saveSet(); });
}
wireTeamPick($('#tp-me'), () => SET.team, v => { SET.team = v; saveSet(); renderSetup(); }, () => SET.cpuTeam);
wireTeamPick($('#tp-cpu'), () => SET.cpuTeam, v => { SET.cpuTeam = v; saveSet(); renderSetup(); }, () => SET.team);
$('#start-cpu').addEventListener('click', () => startCPU());

function renderModes() {
  teamCard($('#tp-modes .team-card'), SET.team);
  seg($('#seg-pside'), [['off', 'Offense'], ['def', 'Defense'], ['st', 'Special teams']], SET.pside, v => { SET.pside = v; saveSet(); });
  seg($('#seg-pspot'), [[25, 'Own 25'], [50, 'Midfield'], [80, 'Red zone'], [97, 'Goal line']], SET.pspot, v => { SET.pspot = v; saveSet(); });
  seg($('#seg-pfreeze'), [[0, 'Running'], [1, 'Frozen']], SET.pfreeze ? 1 : 0, v => { SET.pfreeze = v; saveSet(); });
  seg($('#seg-pdiff'), DIFFICULTIES.map((n, i) => [i, n]), SET.diff, v => { SET.diff = v; saveSet(); renderModes(); });
  seg($('#seg-ddiff'), DIFFICULTIES.map((n, i) => [i, n]), SET.diff, v => { SET.diff = v; saveSet(); renderModes(); });
  renderDrillBoard($('#drill-board'));
}
wireTeamPick($('#tp-modes'), () => SET.team, v => { SET.team = v; saveSet(); renderModes(); });
const randOpp = () => { let o; do { o = (Math.random() * TEAMS.length) | 0; } while (o === SET.team); return o; };
$('#use-ut').addEventListener('change', () => { const P = !isGuest() && profile(), useUT = $('#use-ut').checked && P && P.p.ut && P.p.ut.started; $('#wait-logo').src = logoURL(useUT ? P.p.ut.club : onlineTeam, 64); });
$('#player-count').addEventListener('click', () => { sfx.play('ui'); showOnline(); });
// the Online now / Players box sits under the notifications panel while it's open, then goes back to its spot
{ const pnl = $('#notif-panel'), pc = $('#player-count');
  const place = () => {
    if (!pnl || !pc) return;
    if (pnl.classList.contains('hidden') || window.innerWidth <= 700) { pc.style.top = ''; return; }
    pc.style.top = (pnl.offsetTop + pnl.offsetHeight + 10) + 'px';
  };
  if (pnl && pc) { new MutationObserver(place).observe(pnl, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true }); window.addEventListener('resize', place); } }
$('#tut-tile').addEventListener('click', () => { sfx.play('ui'); startTutorial(); });
$('#go-tutorial').addEventListener('click', () => { sfx.play('ui'); startTutorial(); });
$('#howto-tutorial').addEventListener('click', () => { sfx.play('ui'); startTutorial(); });
$('#go-practice').addEventListener('click', () => startCPU({ teams: [SET.team, randOpp()], practice: SET.pside, pspot: SET.pspot, freeze: !!SET.pfreeze, weather: 'clear', tod: 'day' }));
$('#go-drill').addEventListener('click', () => startCPU({ teams: [SET.team, randOpp()], drill: true }));

function renderSettings() {
  $('#set-vol').value = SET.vol; $('#set-music').value = SET.music;

  seg($('#seg-notif'), [['on', 'On'], ['off', 'Mute']], SET.notifs === 'off' ? 'off' : 'on', v => { SET.notifs = v; saveSet(); toast(v === 'off' ? 'Notifications muted: no pop-ups or badges, they still show in the bell' : 'Notifications on'); });
  seg($('#seg-ann'), [[true, 'On'], [false, 'Off']], SET.ann, v => { SET.ann = v; sfx.announcer = v; saveSet(); if (v) { sfx.init(); sfx.say('annOn', {}, true); } else sfx.stopVoice(); });
  seg($('#seg-cam'), GAME_CAMS, SET.cam, v => { SET.cam = v; if (!watching()) R.camMode = v; saveSet(); });
  seg($('#seg-gfx'), [['auto', 'Auto'], ['high', 'High'], ['low', 'Fast'], ['potato', 'Chromebook']], SET.gfxAuto ? 'auto' : SET.gfx, v => { if (v === 'auto') { SET.gfxAuto = true; SET.gfx = weakMachine() ? 'potato' : 'high'; } else { SET.gfxAuto = false; SET.gfx = v; } saveSet(); applyGfx(); });
  seg($('#seg-touch'), [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], SET.touch, v => { SET.touch = v; saveSet(); syncTouchClass(); });

  { const n = document.getElementById('cel-note'); if (n) n.textContent = !isGuest() ? 'Your scorer does this after a touchdown. Level up to unlock more.' : 'Make a free account to unlock the bow and the moonwalk.'; }
}
$('#set-vol').addEventListener('input', (e) => { SET.vol = +e.target.value; sfx.setVolume(SET.vol); saveSet(); });
$('#set-music').addEventListener('input', (e) => { SET.music = +e.target.value; sfx.setMusicVolume(SET.music); saveSet(); });
function applyGfx() { R.setQuality(SET.gfx); document.documentElement.dataset.q = SET.gfx; }

// ---------------- game start / end ----------------
function enterGame() {
  setTimeout(startUserCast, 50);
  $$('.screen').forEach(s => s.classList.remove('active'));
  st.screen = 'game';
  $('#hud').classList.remove('hidden');
  $('#gameover').classList.add('hidden'); $('#pause').classList.add('hidden');
  hideNp(); st.npLeft = NP_PER_GAME;
  st.playing = true; st.paused = false; st.acc = 0; st.overShown = false; st.resultSaved = false; st.logged = false; st.seasonSaved = false; st.rewarded = false; st.statsPosted = false; st.halfSaid = false; st.startedAt = performance.now(); crash.resets = 0;
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
  { const sk = document.getElementById('in-skip'); if (sk) sk.innerHTML = pad.on ? `Press <kbd>${glyphs().A}</kbd> to skip` : touchOn() ? 'Tap to skip' : 'Press <kbd>Space</kbd> to skip'; }
  $('#intro').classList.remove('hidden');
  $('#hud').classList.add('intro');
  st.intro = 4.2; st.introLen = 4.2; st.introOn = true;
  clearTimeout(st.introFail); st.introFail = setTimeout(() => endIntro(), 7000);   // never get stuck on the matchup screen
  sfx.cheer(0.5, 4); sfx.airHorn();
  sfx.say('welcome', { city: T[0].city, city2: T[1].city }, true);
}
function endIntro() {
  if (!st.introOn) return;
  st.introOn = false; clearTimeout(st.introFail);
  const natural = st.intro < 0.05;
  st.intro = 0; $('#intro').classList.add('hidden'); $('#hud').classList.remove('intro'); rotHint();
  if (natural) { R.camPos.copy(R.cam.position); R._camInit = true; } else R.snapCamera();
  maybeToss();
}
$('#intro').addEventListener('click', endIntro);

// ---------------- opening coin toss ----------------
// Every real game starts with one. Call heads or tails; win it and pick: receive (get the ball first) or kick (defend first).
// Against the CPU, if it wins it picks at random. Online, whoever calls it first gets the call, the host flips the coin
// and both screens show the same result.
const tossOn = () => st.playing && st.mode !== 'spec' && st.mode !== 'clip' && !st.replay && (st.mode === 'guest' ? !!(st.snap && st.snap.tz) : !!(st.game && st.game.toss));
function maybeToss() { if (tossOn() && !$('#toss')) openToss(); }
const tossName = t => t === st.local ? 'You' : (st.mode === 'cpu' ? 'The CPU' : (st.names && st.names[t]) || 'Your opponent');
function openToss() {
  if ($('#toss')) return;
  st.tossS = { call: null };
  const m = document.createElement('div'); m.id = 'toss'; m.className = 'toss-ov';
  m.innerHTML = `<div class="toss-card" role="dialog" aria-label="Coin toss">
    <h3>${st.snap && st.snap.q >= 5 ? 'Overtime coin toss' : 'Coin toss'}</h3>
    <div class="toss-stage"><div class="toss-coin" id="toss-coin"><i class="tc-face tc-h">H</i><i class="tc-face tc-t">T</i></div></div>
    <p class="toss-msg" id="toss-msg">${st.mode === 'cpu' ? 'Call it in the air.' : 'Call it. Whoever calls first gets the call.'}</p>
    <div class="toss-btns" id="toss-btns"><button class="btn primary" type="button" data-call="h">Heads</button><button class="btn primary" type="button" data-call="t">Tails</button></div>
  </div>`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-call]').forEach(b => b.onclick = () => { sfx.play('ui'); tossCall(b.dataset.call); });
  setTimeout(() => { const b = m.querySelector('[data-call]'); b && b.focus(); }, 50);
}
function tossBtns(html) { const b = $('#toss-btns'); if (b) b.innerHTML = html; }
function tossMsg(t) { const e = $('#toss-msg'); if (e) e.innerHTML = t; }
function tossCall(side) {
  if (!st.tossS || st.tossS.call) return;
  if (st.mode === 'guest') { st.peer && st.peer.send({ t: 'tossCall', side }, true); tossBtns(''); tossMsg('Calling it…'); return; }
  hostCall(st.local, side);
}
function hostCall(who, side) {
  if (!st.tossS) openToss();
  if (st.tossS.call) return;
  const res = Math.random() < 0.5 ? 'h' : 't', winner = side === res ? who : 1 - who;
  Object.assign(st.tossS, { call: side, who, res, winner });
  if (st.mode === 'host' && st.peer) st.peer.send({ t: 'tossRes', who, side, res, winner }, true);
  showFlip(who, side, res, winner);
}
function showFlip(who, side, res, winner) {
  if (!$('#toss')) { if (st.introOn) endIntro(); openToss(); }
  Object.assign(st.tossS, { call: side, who, res, winner });
  const word = x => x === 'h' ? 'heads' : 'tails';
  tossBtns(''); tossMsg(`${tossName(who)} called <b>${word(side)}</b>…`);
  const c = $('#toss-coin'); c.style.setProperty('--end', res === 'h' ? '1800deg' : '1980deg'); c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip');
  sfx.play('ui');
  setTimeout(() => {
    if (!$('#toss')) return;
    const mine = winner === st.local;
    tossMsg(`It's <b>${word(res).toUpperCase()}</b>! ${mine ? 'You win the toss.' : `${tossName(winner)} won the toss.`}`);
    if (mine) {
      tossBtns('<button class="btn primary" type="button" data-pick="1">Receive</button><button class="btn" type="button" data-pick="0">Kick</button>');
      $('#toss-btns').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { sfx.play('ui'); tossPick(b.dataset.pick === '1'); });
      const f = $('#toss-btns [data-pick]'); f && f.focus();
    } else if (st.mode === 'cpu') {
      const recv = Math.random() < 0.5;
      setTimeout(() => { tossMsg(`The CPU chose to <b>${recv ? 'receive' : 'kick'}</b>.`); setTimeout(() => finishToss(recv ? winner : 1 - winner), 1300); }, 900);
    } else tossMsg(`It's <b>${word(res).toUpperCase()}</b>. Waiting for ${escapeHtml(tossName(winner))} to choose…`);
  }, 1700);
}
function tossPick(recv) {
  if (!st.tossS || st.tossS.picked) return; st.tossS.picked = true; tossBtns('');
  const receiver = recv ? st.local : 1 - st.local;
  if (st.mode === 'guest') { st.peer && st.peer.send({ t: 'tossPick', recv }, true); tossMsg('Locked in…'); return; }
  finishToss(receiver);
}
function finishToss(receiver) {
  if (st.game && st.game.toss) tossResult(st.game, receiver);
  if (st.mode === 'host' && st.peer) st.peer.send({ t: 'tossDone', receiver }, true);
  closeToss();
}
function closeToss() { const m = $('#toss'); if (m) m.remove(); st.tossS = null; }
function tossRx(m) {
  if (m.t === 'tossCall' && st.mode === 'host') { if (st.introOn) endIntro(); hostCall(1, m.side === 't' ? 't' : 'h'); return true; }
  if (m.t === 'tossPick' && st.mode === 'host') { if (st.tossS && st.tossS.winner === 1 && !st.tossS.picked) { st.tossS.picked = true; finishToss(m.recv ? 1 : 0); } return true; }
  if (m.t === 'tossRes' && st.mode === 'guest') { showFlip(m.who, m.side, m.res, m.winner); return true; }
  if (m.t === 'tossDone' && st.mode === 'guest') { closeToss(); return true; }
  return false;
}

// ---------------- tutorial: a guided mini-game that teaches the controls and the basics ----------------
// Two short practice sessions with a coach card on top: offense (pick a play, snap, throw, catch, run moves,
// move the chains), then defense (pick a coverage, switch players, make a stop). Each step ticks off by itself
// when you actually do it. New players get offered it the first time they reach the main menu.
const TUT = { on: false, i: 0, sw: false, snapCtrl: -1, scored: false };
const tutDev = () => (pad && pad.on) || (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) ? 'p' : document.body.classList.contains('touch') ? 't' : 'k';
const TUT_STEPS = [
  { ph: 'off', h: 'Pick a play', k: 'Press 1 to 6, or click a play card. Z and X flip through the tabs.', t: 'Tap any play card at the bottom.', p: 'Use the D-pad to pick a play and press A.', tick: S => S.ph === 'presnap' && !!S.op },
  { ph: 'off', h: 'Snap the ball', k: 'Press Space to snap it.', t: 'Tap SNAP.', p: 'Press A to snap it.', ev: ['snap'] },
  { ph: 'off', h: 'Throw it', k: 'Each receiver has a number over his head. Press that number (1 to 5) to throw to him. Hold it longer for a harder throw.', t: 'Tap a receiver’s number button to throw to him.', p: 'Each receiver has a button over his head. Press it to throw to him.', ev: ['throw'] },
  { ph: 'off', h: 'Complete a pass', k: 'Throw to the open man. If it falls incomplete, call another play and try again.', t: 'Throw to the open man. Missed? Pick another play and try again.', p: 'Throw to the open man. Missed? Pick another play and try again.', ev: ['catch'] },
  { ph: 'off', h: 'Make a move', k: 'With the ball in your hands: Shift sprints, Space jukes, E spins, R stiff arms, F hurdles a diving tackler. Try a run play.', t: 'With the ball: tap JUKE, SPIN, STIFF or HURDLE. Run plays are a good spot to try.', p: 'With the ball: flick the right stick to juke, B spins, A stiff arms, Y hurdles. Run plays are a good spot to try.', ev: ['juke', 'spin', 'stiff', 'hurdle', 'brokentackle'] },
  { ph: 'off', h: 'Move the chains', k: 'Gain enough yards for a first down (or score). Ten yards resets your downs.', t: 'Gain enough yards for a first down (or score).', p: 'Gain enough yards for a first down (or score).', ev: ['firstdown', 'score'] },
  { ph: 'def', h: 'Call a coverage', k: 'You’re on defense now. Press 1 to 6 to pick a coverage before the snap.', t: 'You’re on defense now. Tap a coverage card.', p: 'You’re on defense now. Pick a coverage with the D-pad and A.', tick: S => S.ph === 'presnap' && !!S.dc },
  { ph: 'def', h: 'Switch players', k: 'After the snap, press Q to take over the defender nearest the ball. You can also click any defender.', t: 'After the snap, tap SWITCH to take over the defender nearest the ball.', p: 'After the snap, press B to take over the defender nearest the ball.', tick: S => S.ph === 'live' && TUT.snapCtrl >= 0 && S.ctrl && S.ctrl[st.local] !== TUT.snapCtrl },
  { ph: 'def', h: 'Make a stop', k: 'Run at the ball carrier to tackle him. Space dives, E jumps a pass. Keep him out of the end zone.', t: 'Run at the ball carrier to tackle him. TACKLE dives at him. Keep him out of the end zone.', p: 'Run at the ball carrier to tackle him. A dives at him. Keep him out of the end zone.', ev: ['whistle'], ok: () => !TUT.scored },
];
function startTutorial() {
  try { SET.tutSeen = 1; saveSet(); } catch (_) {}
  closeTutAsk();
  TUT.on = true; TUT.i = 0; TUT.scored = false; TUT.snapCtrl = -1;
  tutGame('off');
}
function tutGame(side) {
  TUT.sw = true;
  if (st.playing) leaveGame();
  TUT.sw = false;
  startCPU({ teams: [SET.team, randOpp()], practice: side, pspot: side === 'off' ? 30 : 60, freeze: true, diff: 0, weather: 'clear', tod: 'day', tutorial: true });
  drawCoach();
}
function drawCoach() {
  let c = $('#tut-coach');
  if (!TUT.on) { if (c) c.remove(); return; }
  if (!c) { c = document.createElement('div'); c.id = 'tut-coach'; c.className = 'tut-coach'; $('#hud').appendChild(c); }
  const S = TUT_STEPS[TUT.i]; if (!S) return;
  c.innerHTML = `<div class="tut-top"><span>Tutorial · ${S.ph === 'off' ? 'Offense' : 'Defense'}</span><span>Step ${TUT.i + 1} of ${TUT_STEPS.length}</span></div>
    <b>${S.h}</b><p>${S[tutDev()]}</p><div class="tut-dots">${TUT_STEPS.map((_, i) => `<i class="${i < TUT.i ? 'done' : i === TUT.i ? 'on' : ''}"></i>`).join('')}</div>
    <button class="link" type="button" id="tut-skip">Skip tutorial</button>`;
  c.querySelector('#tut-skip').onclick = () => { sfx.play('ui'); endTutorial(false); };
}
function tutNext() {
  sfx.play('firstdown'); TUT.i++;
  const S = TUT_STEPS[TUT.i];
  if (!S) return endTutorial(true);
  if (S.ph !== TUT_STEPS[TUT.i - 1].ph) { toast('Nice work. Now let’s play some defense.', 2200); setTimeout(() => { if (TUT.on) tutGame(S.ph); }, 1600); return; }
  drawCoach();
}
function tutEv(e) {
  if (!TUT.on) return;
  if (e === 'snap') { TUT.scored = false; TUT.snapCtrl = st.snap && st.snap.ctrl ? st.snap.ctrl[st.local] : -1; }
  if (e === 'score') TUT.scored = true;
  const S = TUT_STEPS[TUT.i];
  if (S && S.ev && S.ev.includes(e) && (!S.ok || S.ok())) tutNext();
}
function tutTick(S) { if (!TUT.on) return; const T = TUT_STEPS[TUT.i]; if (T && T.tick && T.tick(S)) tutNext(); }
function endTutorial(done) {
  TUT.on = false; drawCoach();
  if (!done) { leaveGame(); return; }
  const P = !isGuest() ? profile() : null;
  let reward = '';
  if (P && !P.p.tutDone) { P.p.tutDone = 1; P.p.coins += 500; P.save(); reward = '<p class="note">First time bonus: +500 coins.</p>'; }
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 64;
  m.innerHTML = `<div class="panel info-card tut-done"><h3 style="margin:0">You’re ready</h3><p>You know how to call plays, throw, run, and play defense. Everything else is in How to Play.</p>${reward}
    <div class="actions"><button class="btn primary" type="button" data-t="play">Play Quick Play</button><button class="btn" type="button" data-t="menu">Main menu</button></div></div>`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { m.remove(); leaveGame(); if (b.dataset.t === 'play') show('setup'); });
}
// the first time someone reaches the main menu, offer the tutorial
function maybeAskTutorial() {
  if (SET.tutSeen || $('#tut-ask') || st.playing || st.screen !== 'menu') return;
  { const P = profile(); if (P && (P.p.games > 0 || P.p.lvl > 1)) { SET.tutSeen = 1; saveSet(); return; } }   // not new: don't nag
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'tut-ask'; m.style.zIndex = 63;
  m.innerHTML = `<div class="panel info-card tut-done"><h3 style="margin:0">New to Endzone Kings?</h3><p>Play a quick tutorial: a few minutes of offense and defense with a coach walking you through the controls.</p>
    <div class="actions"><button class="btn primary" type="button" id="tut-yes">Play the tutorial</button><button class="btn" type="button" id="tut-no">Skip</button></div><p class="note">You can always find it later in Practice and in How to Play.</p></div>`;
  document.body.appendChild(m);
  $('#tut-yes').onclick = () => { sfx.play('ui'); startTutorial(); };
  $('#tut-no').onclick = () => { sfx.play('ui'); SET.tutSeen = 1; saveSet(); closeTutAsk(); };
}
function closeTutAsk() { const m = $('#tut-ask'); if (m) m.remove(); }

// ---------------- Playbooks: browse any team's offense and defense outside a game ----------------
// Offense is organized by formation (then filtered by play type), defense by coverage family.
// Tap a play to see it big with who runs what.
let pbTeam = -1, pbSide = 'off', pbGroup = 'all', pbCat = 'all', pbUT = false;
const ROLE_NAME = { WR1: 'X receiver', WR2: 'Z receiver', WR3: 'Slot receiver', TE: 'Tight end', RB: 'Running back', QB: 'Quarterback' };
function pbBook() {
  const P = !isGuest() ? profile() : null, ut = pbUT && P && P.p.ut && P.p.ut.started ? UTm.squadRoster(P.p.ut) : null;
  const ti = ut ? P.p.ut.club : pbTeam;
  return { ti, ut, book: teamPlaybook(ti, TEAMS[ti], ut ? rosterStyle(ut) : undefined), name: ut ? P.p.ut.name : TEAMS[ti].city };
}
function pbOffPlays(book) {
  const list = book.off.map(id => OFF_PLAYS.find(p => p.id === id)).filter(Boolean);
  if (book.sig) list.unshift({ ...book.sig, signature: true });
  return list;
}
function renderPlaybooks() {
  if (pbTeam < 0) pbTeam = SET.team;
  const P = !isGuest() ? profile() : null, canUT = !!(P && P.p.ut && P.p.ut.started && UTm.squadRoster(P.p.ut));
  if (!canUT) pbUT = false;
  const { ti, book, name } = pbBook();
  teamCard($('#tp-pb .team-card'), ti);
  $('#tp-pb').classList.toggle('dim', pbUT);
  wireTeamPick($('#tp-pb'), () => pbTeam, v => { pbTeam = v; pbUT = false; pbGroup = 'all'; renderPlaybooks(); });
  $('#seg-pbsrc').classList.toggle('hidden', !canUT);
  seg($('#seg-pbsrc'), canUT ? [[false, 'Team playbook'], [true, 'My Ultimate Team squad']] : [[false, 'Team playbook']], pbUT, v => { pbUT = v; pbGroup = 'all'; renderPlaybooks(); });
  seg($('#seg-pbside'), [['off', 'Offense'], ['def', 'Defense']], pbSide, v => { pbSide = v; pbGroup = 'all'; pbCat = 'all'; renderPlaybooks(); });
  const mine = customPlays().filter(c => c.side === pbSide);
  const offAll = pbOffPlays(book), defAll = book.def.map(id => DEF_PLAYS.find(p => p.id === id)).filter(Boolean);
  $('#pb-meta').innerHTML = `<b>${escapeHtml(name)}</b><span>Offense: <em>${escapeHtml(book.offName)}</em></span><span>Defense: <em>${escapeHtml(book.defName)}</em></span><span>${offAll.length} offensive plays, ${defAll.length} defensive calls</span>`;
  // groups for the left column
  let groups = [];
  if (pbSide === 'off') {
    if (offAll.some(p => p.signature)) groups.push(['sig', 'Signature', offAll.filter(p => p.signature)]);
    const byForm = {};
    for (const p of offAll) { if (p.signature || p.cat === 'Special') continue; const f = p.form || 'gun'; (byForm[f] = byForm[f] || []).push(p); }
    for (const [f, ps] of Object.entries(byForm).sort((a, b) => b[1].length - a[1].length)) groups.push(['f:' + f, (FORMS[f] || FORMS.gun).name, ps]);
    const sp = offAll.filter(p => p.cat === 'Special'); if (sp.length) groups.push(['special', 'Special Teams', sp]);
  } else for (const cat of DEF_CATS) { const ps = defAll.filter(p => p.cat === cat); if (ps.length) groups.push(['c:' + cat, cat + ' coverage', ps]); }
  if (mine.length) groups.push(['mine', 'My Plays', mine.map(c => ({ ...c, mine: true }))]);
  const all = pbSide === 'off' ? offAll.filter(p => !p.signature || true) : defAll;
  groups.unshift(['all', 'All plays', all.concat(mine.map(c => ({ ...c, mine: true })))]);
  if (!groups.some(g => g[0] === pbGroup)) pbGroup = 'all';
  $('#pb-forms').innerHTML = groups.map(([k, n, ps]) => `<button type="button" class="pb-form ${k === pbGroup ? 'on' : ''}" data-pbg="${escapeHtml(k)}"><span>${escapeHtml(n)}</span><small>${ps.length}</small></button>`).join('');
  $$('#pb-forms [data-pbg]').forEach(b => b.onclick = () => { sfx.play('ui'); pbGroup = b.dataset.pbg; renderPlaybooks(); });
  let plays = (groups.find(g => g[0] === pbGroup) || groups[0])[2];
  // play type filter (offense)
  const cats = pbSide === 'off' ? ['all', ...OFF_CATS.filter(c => c !== 'Special' && plays.some(p => p.cat === c))] : [];
  if (!cats.includes(pbCat)) pbCat = 'all';
  $('#pb-cats').innerHTML = cats.length > 2 ? cats.map(c => `<button type="button" class="pb-cat ${c === pbCat ? 'on' : ''}" data-pbc="${c}">${c === 'all' ? 'All types' : c}</button>`).join('') : '';
  $$('#pb-cats [data-pbc]').forEach(b => b.onclick = () => { sfx.play('ui'); pbCat = b.dataset.pbc; renderPlaybooks(); });
  if (pbCat !== 'all') plays = plays.filter(p => p.cat === pbCat);
  const art = p => pbSide === 'off' ? (p.mine ? routeSvg({ ...p, routes: p.routes || {} }) : routeSvg(p)) : defSvg(p.mine ? (p.preview || {}) : p);
  const sub = p => pbSide === 'off' ? `${p.mine ? 'Custom' : (FORMS[p.form || 'gun'] || FORMS.gun).name} · ${p.signature ? 'Signature' : p.cat || 'Custom'}` : `${p.mine ? 'Custom' : p.cat} · ${(p.rush || []).length || 4} rushing`;
  $('#pb-grid').innerHTML = plays.length ? plays.map((p, i) => `<button type="button" class="pb-card ${p.signature ? 'sig' : ''}" data-pbi="${i}">${art(p)}<b>${escapeHtml(p.name)}</b><small>${escapeHtml(sub(p))}</small></button>`).join('') : '<p class="note">No plays here.</p>';
  $$('#pb-grid [data-pbi]').forEach(b => b.onclick = () => { sfx.play('ui'); openPlayDetail(plays[+b.dataset.pbi], art, sub); });
}
function openPlayDetail(p, art, sub) {
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
  const roles = pbSide === 'off' ? Object.keys({ ...(p.routes || {}), ...(p.qbPath ? { QB: 1 } : {}) }).filter(r => ROLE_NAME[r]) : [];
  const facts = pbSide === 'off'
    ? [p.type === 'run' ? 'Run play' : 'Pass play', p.pa ? 'Play action fake' : '', p.qbRun ? 'QB keeps it' : '', p.signature ? 'Team signature play' : ''].filter(Boolean)
    : [`${(p.rush || []).length || 4} rushers`, Object.keys(p.man || {}).length ? `${Object.keys(p.man).length} in man coverage` : '', Object.keys(p.zone || {}).length ? `${Object.keys(p.zone).length} in zones` : '', (p.deep || []).length ? `${p.deep.length} deep` : '', (p.spy || []).length ? 'QB spy' : ''].filter(Boolean);
  m.innerHTML = `<div class="panel info-card pb-detail"><small class="pb-dsub">${escapeHtml(sub(p))}</small><h3>${escapeHtml(p.name)}</h3><div class="pb-dart">${art(p)}</div>
    <p>${escapeHtml(p.tip || '')}</p><div class="pb-facts">${facts.map(f => `<span>${escapeHtml(f)}</span>`).join('')}</div>
    ${roles.length ? `<div class="pb-legend">${roles.map(r => `<span><i style="background:${RCOLS[r]}"></i>${ROLE_NAME[r]}</span>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn primary" type="button" data-x>Close</button></div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  m.querySelector('[data-x]').onclick = close; m.onclick = e => { if (e.target === m) close(); };
}

function startCPU(opts = {}) {
  sfx.init();
  if (!opts.tutorial && TUT.on) { TUT.on = false; drawCoach(); }
  st.mode = 'cpu'; st.local = 0;
  st.seasonGame = !!opts.season; st.franchiseGame = !!opts.franchise; st.league = opts.league || null;
  st.lastCpu = opts;
  const teams = opts.teams || [SET.team, SET.cpuTeam];
  st.learned = false; st.ut = !!opts.ut; st.solo = opts.solo || null; st.battle = opts.battle ?? null; st.theme = opts.theme || null; st.teamNames = opts.teamNames || null; st.practice = opts.practice || null; st.drill = !!opts.drill; st.rec = []; st.replay = null;
  const weather = opts.weather || (opts.season || opts.franchise ? pickWx('random') : pickWx(SET.wx)), tod = opts.tod || (opts.season || opts.franchise ? pickTod('random') : pickTod(SET.tod));
  const adapt = adaptiveCpu(opts);
  // the adjustment is silent: no message, the CPU just plays tougher (or easier)
  const wind = opts.practice || opts.drill ? 0 : opts.wind ?? (opts.season || opts.franchise ? [0, 0, 5, 5, 10, 10, 15, 20][(Math.random() * 8) | 0] : (SET.wind || 0));
  st.game = createGame({ wind, teams, humans: [true, false], playoff: !!opts.playoff, adapt, quarterLen: opts.drill ? 120 : SET.qlen, difficulty: opts.diff ?? SET.diff, rosters: opts.rosters || null, styles: opts.styles || null, weather, tod, practice: opts.practice || null, pspot: opts.pspot || 25, freeze: !!(opts.practice && opts.freeze), drill: !!opts.drill, toss: !opts.practice && !opts.drill, cel: [SET.cel, -1] });
  st.wx = weather; st.tod = tod;
  st.names = [Auth.user ? Auth.user.name : 'You', (st.teamNames && st.teamNames[1]) || TEAMS[teams[1]].city];   // the CPU side goes by its team name
  R.setTeams(st.game.opts.teams);
  R.setWeather(weather, tod);
  $('#net-badge').classList.add('hidden');
  enterGame();
  $('#hud').classList.toggle('practice', !!st.practice);
  if (st.practice || st.drill) endIntro();
}

function leaveGame() {
  closeToss();
  if (TUT.on && !TUT.sw) { TUT.on = false; drawCoach(); }
  if (st.league && st.playing && !st.overShown && st.snap) League.reportResult(st.snap, true);   // walking out of a league game is a loss
  stopSpec(); stopUserCast();
  if (st.mode === 'spec') st.mode = 'cpu';
  $('#hud').classList.remove('spec'); $('#pause').classList.remove('spec'); $('#spec-vs').classList.add('hidden'); R.specNames = null;
  st.playing = false; st.game = null; st.snap = null; st.guestBuf = []; st.bench = null;
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
  if (st.mode === 'clip') { if (k === 'Escape') $('#clip-close').click(); const n = k.startsWith('Digit') ? +k.slice(5) : 0; if (n >= 1 && n <= 5) { const b = $$('#clip-views [data-cv]')[n - 1]; if (b) b.click(); } return; }
  if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !e.target.closest('.modal')) e.preventDefault();
  if (e.repeat) { keys.add(k); return; }
  keys.add(k);
  if (k === 'Escape') {
    const sd = document.getElementById('subs-dlg');
    if (sd && !sd.classList.contains('hidden')) { const x = $('#subs-x'); if (x) x.click(); else sd.classList.add('hidden'); return; }
    // Settings or Controls opened from the pause menu: Esc goes back to the pause menu
    if (st.screen !== 'game' && (st.screen === 'settings' || st.screen === 'howto')) { backToPause(); return; }
  }
  if (st.intro > 0) { if (k === 'Space' || k === 'Enter' || k === 'Escape') endIntro(); return; }
  if (k === 'Escape' && celPickOpen()) { closeCelPick(); return; }
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
  if (k === 'KeyC') { toast('Camera: ' + cycleCam() + '. Scroll, press - and +, or use the zoom buttons to zoom'); return; }
  if (st.paused) return;
  if (celPickOpen()) {
    const btns = $$('#cel-opts [data-cp]'), d = k.startsWith('Digit') ? +k.slice(5) : 0;
    if (d >= 1 && d <= btns.length) { pickCel(+btns[d - 1].dataset.cp); return; }
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowLeft') { celHighlight(celSel + (k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1)); return; }
    if (k === 'Enter' || k === 'Space') { if (celSel >= 0) pickCel(+btns[celSel].dataset.cp); return; }
    if (k === 'Escape') { closeCelPick(); return; }
    if (k === 'Tab') { e.preventDefault(); return; }
    return;
  }
  if (k === 'Tab' && st.playing) e.preventDefault();   // Tab is the emote button in a game, not focus-hopping
  if (k === 'Tab' && !e.repeat && st.snap && (st.snap.ph === 'dead' || st.snap.ph === 'presnap') && st.mode !== 'spec' && st.mode !== 'clip') { openCelPick(); return; }
  const ev = keyToEvent(k);
  if (ev) pushEv(ev);
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Tab' && celPickOpen() && celSel >= 0) { const b = $$('#cel-opts [data-cp]')[celSel]; if (b) pickCel(+b.dataset.cp); } if (st.charge && st.charge.code === e.code) releaseCharge(); if (st.playing && (e.code === 'Space' || e.code === 'Enter') && !e.target.closest('.modal')) e.preventDefault(); });
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
  st.charge = { n, code, t0: performance.now(), pw: 0, last: performance.now() };
  sfx.play('ui');
}
// the bar fills faster when the QB is on the run, so timing a throw on the move is harder
function chargePw() { const c = st.charge; if (!c) return 0; const now = performance.now(), dt = Math.min(0.1, (now - c.last) / 1000); c.last = now; const mv = (st.snap && st.snap.qbs) ? st.snap.qbs[1] : 0; c.pw = Math.min(1.4, c.pw + dt / CHARGE_T * (1 + 0.8 * mv)); return c.pw; }
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
  const pct = v => (v / 1.4 * 100).toFixed(1) + '%', q = S.qbs || [0, 0], W = 1 - 0.55 * q[0];   // pressure shrinks the green box
  el.querySelector('.tm-zone').style.left = pct(Math.max(0, need - 0.14 * W)); el.querySelector('.tm-zone').style.width = pct(0.34 * W);
  const f = el.querySelector('.tm-fill'); f.style.width = pct(pw);
  f.style.background = pw < need - 0.14 * W ? '#60a5fa' : pw <= need + 0.2 * W ? '#22c55e' : '#ef4444';
  el.classList.toggle('heat', q[0] > 0.35); el.classList.toggle('run', q[1] > 0.3);
  el.querySelector('span').textContent = `${c.n} · ${pw < 0.45 ? 'touch' : pw > 0.9 ? 'bullet' : 'firm'}${q[0] > 0.35 ? ' · UNDER PRESSURE' : ''}${q[1] > 0.3 ? ' · ON THE RUN' : ''}`;
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
// body.touch scopes the phone/tablet styles so the desktop layout never changes
function syncTouchClass() { document.body.classList.toggle('touch', touchOn()); }
syncTouchClass();
// long-press on the field or the touch pad shouldn't pop the browser menu mid-play
canvas.addEventListener('contextmenu', (e) => { if (touchOn()) e.preventDefault(); });
$('#touch').addEventListener('contextmenu', (e) => e.preventDefault());
// portrait phones: a one-time, non-blocking nudge to turn sideways
let rotTimer = 0;
function rotHint() {
  const el = document.getElementById('rot-hint'); if (!el) return;
  let seen = false; try { seen = sessionStorage.getItem('ek_rot') === '1'; } catch (_) {}
  if (seen || !touchOn() || !matchMedia('(orientation: portrait) and (max-width: 600px)').matches) return;
  el.classList.add('show'); clearTimeout(rotTimer); rotTimer = setTimeout(() => el.classList.remove('show'), 7000);
}
$('#rot-hint').addEventListener('click', () => { $('#rot-hint').classList.remove('show'); try { sessionStorage.setItem('ek_rot', '1'); } catch (_) {} });
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
  const me = st.local, watch = st.mode === 'spec' || st.mode === 'clip';
  let btns = [];
  // lists are in reading order (top-left to bottom-right); the pad is laid out from the bottom-right corner up, so the last ones land under the thumb
  if (S.ph === 'presnap') {
    if (S.poss === me) {
      const col = pcCollapsed(S), pat = !!(S.sp && S.sp.pat);
      btns = col ? [['snap', 'SNAP', 'big'], ['plays', 'PLAYS'], ...(hotOk(S) ? [['hot', st.hot.open ? 'DONE' : 'HOT ROUTE', 'sm']] : []), ...(pat ? [] : [['flip', S.flip ? 'UNFLIP' : 'FLIP', 'sm'], ['motion', 'MOTION', 'sm']]), ['timeout', 'T/O']]
        : [['snap', 'SNAP', 'big']];   // while the playbook is open its own Timeout button is showing
    } else btns = pcCollapsed(S) ? [['switch', 'SWITCH'], ['timeout', 'T/O']] : [['switch', 'SWITCH']];
  }
  else if (S.ph === 'dead' && !watch) btns = S.poss === me ? [['skip', 'NEXT', 'big'], ['nohuddle', 'NO HUDDLE', 'sm']] : [['skip', 'NEXT', 'big']];
  else if (S.ph === 'kickset' && S.poss === me) btns = [['kick', 'KICK', 'big']];
  else if (S.ph === 'live') {
    const carrier = S.b[3] === 0 ? S.b[5] : -1, iCarry = carrier >= 0 && carrier === S.ctrl[me];
    if (S.canThrow && S.off === me) btns = [['t1', '1', 'r1'], ['t2', '2', 'r2'], ['t3', '3', 'r3'], ['t4', '4', 'r4'], ['t5', '5', 'r5'], ['sprint', 'SPRINT', 'hold']];
    else if (iCarry) btns = [['hurdle', 'HURDLE'], ['slide', 'DOWN'], ['truck', 'TRUCK'], ['stiff', 'STIFF'], ['cdive', 'DIVE'], ['spin', 'SPIN'], ['juke', 'JUKE'], ['sprint', 'SPRINT', 'hold']];
    else if (S.b[3] === 1 && S.b[4]) btns = [['playball', S.off === me ? 'CATCH' : 'PLAY BALL', 'big'], ['switch', 'SWITCH'], ...(S.off === me ? [['rdive', 'DIVE']] : []), ['sprint', 'SPRINT', 'hold']];
    else btns = [['dive', 'DIVE', 'big'], ['switch', 'SWITCH'], ...(carrier >= 0 && S.off !== me ? [['hitstick', 'HIT STICK', 'sm']] : []), ['sprint', 'SPRINT', 'hold']];
  }
  const key = btns.map(b => b[0] + b[1]).join();
  if (touch.key === key) return;
  touch.key = key;
  const isBig = b => (b[2] || '') === 'big', small = btns.filter(b => !isBig(b));
  const box = $('#tbtns'); box.innerHTML = ''; box.dataset.n = small.length;
  for (const [id, label, cls] of [...btns.filter(isBig), ...small.reverse()]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn ' + (cls || ''); b.textContent = label;
    if (id[0] === 't' && id.length === 2) b.setAttribute('aria-label', 'Throw to receiver ' + id[1]);
    const up = () => b.classList.remove('down');
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    if (cls === 'hold') {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.sprint = true; b.classList.add('down'); });
      const off = () => { touch.sprint = false; };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    } else b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sfx.init(); b.classList.add('down');
      const v = moveVec();
      if (id[0] === 't' && id.length === 2) { startCharge(+id[1], 'touch' + id[1]); const rel = () => { if (st.charge && st.charge.code === 'touch' + id[1]) releaseCharge(); }; b.addEventListener('pointerup', rel, { once: true }); b.addEventListener('pointerleave', rel, { once: true }); b.addEventListener('pointercancel', rel, { once: true }); return; }
      if (id === 'plays') { reopenPlaybook(); return; }
      if (id === 'hot') { toggleHot(); return; }
      if (id === 'timeout') { const ev = keyToEvent('KeyV'); if (ev) pushEv(ev); return; }
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
  if (S.ph === 'dead' && (k === 'Space' || k === 'Enter')) return { t: 'skip' };
  if (S.ph === 'dead' && onOff && k === 'KeyN') return { t: 'nohuddle' };
  if ((S.ph === 'dead' || S.ph === 'kickset') && onOff && k === 'KeyO') return { t: 'onside' };
  if (S.ph === 'kickset') return onOff && (k === 'Space' || k === 'Enter') ? { t: 'kick' } : null;
  if (k === 'KeyV' && (S.ph === 'presnap' || S.ph === 'dead' || S.ph === 'live')) {
    if (!((S.to || [0, 0])[me] > 0)) { toast('No timeouts left'); return null; }
    if (S.mode === 'practice') return null;
    if (S.ph === 'live') toast('Timeout called: the clock stops when this play ends', 1600);
    return { t: 'timeout' };
  }
  if (S.ph === 'presnap') {
    if (k === 'Backspace') { if (pcCollapsed(S)) reopenPlaybook(); return null; }
    if (k === 'KeyZ') { switchTab(-1); return null; }
    if (k === 'KeyX') { switchTab(1); return null; }
    if (digit >= 1 && digit <= PER_TAB) return pickCard(digit);
    if (onOff) {
      if (k === 'KeyP' && !(S.sp && S.sp.pat)) { sfx.play('ui'); return { t: 'play', id: 'punt' }; }
      if (k === 'KeyF' && S.sp && S.sp.fg) { sfx.play('ui'); return { t: 'play', id: 'fg' }; }
      if (k === 'Space' || k === 'Enter') return { t: 'snap' };
      if (k === 'KeyL') return { t: 'flip' };
      if (k === 'KeyJ') return { t: 'motion' };
      if (k === 'KeyK') return { t: 'spike' };
      if (k === 'KeyU') return { t: 'play', id: 'kneel' };   // take a knee (then snap)
      if (k === 'KeyN') return { t: 'nohuddle' };
      if (k === 'KeyO') return { t: 'onside' };
    } else if (k === 'KeyQ') return { t: 'switch' };
    return null;
  }
  if (S.ph !== 'live') return null;
  if (digit >= 1 && digit <= 5 && S.canThrow && S.off === me) { startCharge(digit, k); return null; }
  if (k === 'KeyQ') return { t: 'switch' };
  const carrier = S.b[3] === 0 ? S.b[5] : -1;
  const iCarry = carrier >= 0 && carrier === S.ctrl[me];
  if (k === 'KeyE') return iCarry ? { t: 'spin' } : { t: 'playball' };
  if (k === 'KeyR' && iCarry) return { t: 'stiff' };
  if (k === 'KeyB' && iCarry) return { t: 'truck' };
  if (k === 'KeyF' && iCarry) return { t: 'hurdle' };
  if (k === 'KeyX' && iCarry) return { t: 'cdive' };
  if (k === 'KeyX' && !iCarry && S.b[3] === 1 && S.off === me) return { t: 'rdive' };
  if (k === 'KeyG' && iCarry) return { t: 'slide' };
  if (k === 'KeyO' && iCarry && S.canThrow) return { t: 'throwaway' };
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
  if (st.snap.ph === 'presnap' && st.snap.poss === st.local) return;   // on offense you're always the QB before the snap
  const id = R.pick(e.clientX, e.clientY, st.snap, st.local);
  if (id >= 0) pushEv({ t: 'pick', id });
});
canvas.tabIndex = 0;

$('#playcall').addEventListener('click', (e) => { if ($('#playcall').classList.contains('collapsed') && !e.target.closest('#pc-timeout')) reopenPlaybook(); });
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
  el.innerHTML = `<h4>Hot route</h4><div class="who">${HOT_ROLES.map((r, i) => `<button data-r="${r}" class="${r === st.hot.role ? 'on' : ''}" style="--rc:${RCOLS[r]}">${document.body.classList.contains('pad-mode') ? '' : `<kbd>${i + 1}</kbd>`}${HOT_NAME(r)}</button>`).join('')}</div>
    <div class="kinds">${HOT_LABELS[g].map((h, i) => `<button data-k="${i}">${document.body.classList.contains('pad-mode') ? '' : `<kbd>${arrows[i]}</kbd>`}${h[1]}</button>`).join('')}</div><small>Changed: ${(S.opDef.hot || []).map(HOT_NAME).join(', ') || 'nothing yet'}. ${document.body.classList.contains('pad-mode') ? `Press ${glyphs().B || 'B'} when you're done.` : touchOn() ? '' : 'Press H or Esc when you\'re done.'}</small>${touchOn() ? '<button class="hot-done" data-done type="button">Done</button>' : ''}`;   // controller players see their button
  $$('[data-r]', el).forEach(b => b.onclick = () => { st.hot.role = b.dataset.r; hudCache.hot = null; sfx.play('ui'); });
  $$('[data-k]', el).forEach(b => b.onclick = () => setHot(+b.dataset.k));
  const dn = $('[data-done]', el); if (dn) dn.onclick = () => toggleHot(false);
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
  st.replay = { frames, i: 0, t: 0, ang: Math.random() * 6, view: 'orbit' };
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
  const bx = S.b[0], by = S.b[1], bz = S.b[2], d = S.poss === 0 ? 1 : -1;
  r.cx = r.cx === undefined ? bx : r.cx + (bx - r.cx) * Math.min(1, dt * 3); r.cz = r.cz === undefined ? bz : r.cz + (bz - r.cz) * Math.min(1, dt * 3);
  // camera angles for clips and replays
  const v = r.view || 'orbit';
  if (v === 'side') { R.cam.position.set(r.cx * 0.3 - 30, 14, r.cz - 2 * d); R.cam.lookAt(r.cx * 0.6, 0.8, r.cz + 3 * d); }
  else if (v === 'behind') { R.cam.position.set(r.cx * 0.9, 7, r.cz - 13 * d); R.cam.lookAt(r.cx, 0.8, r.cz + 10 * d); }
  else if (v === 'endzone') { const ez = d > 0 ? 118 : -18; R.cam.position.set(0, 16, ez); R.cam.lookAt(r.cx * 0.7, 0.5, r.cz); }
  else if (v === 'ball') { R.cam.position.set(bx - 2.5, Math.max(1.6, by + 1.4), bz - 4.5 * d); R.cam.lookAt(bx, by, bz + 2 * d); }
  else { R.cam.position.set(r.cx + Math.sin(r.ang) * 10, 4.2, r.cz + Math.cos(r.ang) * 10); R.cam.lookAt(r.cx, 1.1, r.cz); }
  return S;
}

// ---------------- controller context ----------------
function padContext() {
  if (!st.playing) return 'menu';
  if (st.mode === 'clip') return 'replay';
  if (st.screen !== 'game') return 'paused';   // Settings / Controls opened from the pause menu
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
  if (pcCollapsed(st.snap)) return reopenPlaybook();
  const cards = $$('#pc-cards .pc-card'); if (!cards.length) return;
  if (i === 12 || i === 13) { switchTab(i === 12 ? -1 : 1); padCard = 0; }
  else padCard = Math.max(0, Math.min(cards.length - 1, (padCard < 0 ? 0 : padCard) + (i === 15 ? 1 : -1)));
  const list = $$('#pc-cards .pc-card'); list.forEach((c, k) => c.classList.toggle('padfocus', k === padCard));
  if (list[padCard]) list[padCard].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function cardPickFocused() {
  if (pcCollapsed(st.snap)) return false;
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
  st.replay = { frames, i: 0, t: 0, ang: Math.random() * 6, clip: true, view: 'orbit' };
  R.ballBoost = true;
  $$('#clip-views [data-cv]').forEach(b => b.classList.toggle('on', b.dataset.cv === 'orbit'));
}
$$('#clip-views [data-cv]').forEach(b => b.addEventListener('click', () => { if (!st.replay) return; st.replay.view = b.dataset.cv; $$('#clip-views [data-cv]').forEach(x => x.classList.toggle('on', x === b)); sfx.play('ui'); }));
function stopClip(back) {
  st.replay = null; st.mode = 'cpu'; R.ballBoost = false;
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
const QUICK = ['GG', "Let's go!", 'Nice play', 'Too easy', 'Unlucky', 'Run it back?', 'My bad', 'Respect'];
$('#quick-chat').innerHTML = QUICK.map(q => { const h = q.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); return `<button type="button" data-q="${h}">${h}</button>`; }).join('');   // runs while the page loads, so no helpers that aren't defined yet
$$('#quick-chat [data-q]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); if (!st.peer) return closeChat(); if (Date.now() - chatLast < 1200) { chatLine('sys', '', 'Slow down a little.'); return; } chatLast = Date.now(); st.peer.send({ t: 'chat', m: b.dataset.q }, true); chatLine('me', st.names[st.local] || 'You', b.dataset.q); closeChat(); }));
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
  if (st.paused) { sfx.setSituation('idle'); sfx.stopVoice(); }
  $('#p-cam-l').textContent = camName();
  $('#quit').textContent = st.mode === 'spec' ? 'Stop watching' : st.mode === 'cpu' ? 'Quit to menu' : 'Leave online game';
  $('#p-chat').classList.toggle('hidden', st.mode === 'cpu');
  $('#p-askpause').classList.toggle('hidden', !isNet()); $('#p-askpause').textContent = `Ask to pause (${st.npLeft ?? NP_PER_GAME} left)`;
  $('#p-forfeit').classList.toggle('hidden', !isNet());
  $('#p-replay').classList.toggle('hidden', st.mode !== 'cpu' || !st.snap || st.snap.ph === 'live');
  if (st.practice) $('#quit').textContent = 'Leave practice'; $('#p-chat').textContent = SET.chat ? 'Mute chat' : 'Unmute chat';
}
$('#pause-btn').addEventListener('click', () => togglePause());
// ---------------- online pause (both players have to agree, 30 seconds max) and forfeit ----------------
const NP_SECS = 30, NP_PER_GAME = 3;
const isNet = () => st.mode === 'host' || st.mode === 'guest';
const oppName = () => (st.names && st.names[1 - st.local]) || 'Your opponent';
let npTick = null;
function showNp(by) {
  $('#np-overlay').classList.remove('hidden'); $('#np-by').textContent = by || 'Both players agreed to pause';
  $('#np-resume').disabled = false; $('#np-resume').textContent = 'I’m ready'; $('#np-wait').textContent = 'The game resumes when you’re both ready, or when the timer runs out';
  clearInterval(npTick);
  const tick = () => { if (!st.np) return; const s = Math.max(0, Math.ceil((st.np.until - performance.now()) / 1000)); $('#np-left').textContent = `0:${String(s).padStart(2, '0')}`; if (s <= 0 && st.mode === 'guest') hideNp(); };
  tick(); npTick = setInterval(tick, 250);
  sfx.play('whistle');
}
function hideNp() { st.np = null; clearInterval(npTick); npTick = null; $('#np-overlay').classList.add('hidden'); }
function startNetPause(hostAsked) { st.np = { until: performance.now() + NP_SECS * 1000, ready: [false, false] }; st.peer && st.peer.send({ t: 'np', ms: NP_SECS * 1000, hostAsked }, true); showNp(hostAsked ? `You asked, ${oppName()} agreed` : `${oppName()} asked, you agreed`); }
function endNetPause() { if (!st.np) return; hideNp(); st.peer && st.peer.send({ t: 'npEnd' }, true); toast('Game resumed'); }
function askPause() {
  if (!isNet() || !st.peer) return;
  if (st.np) return toast('The game is already paused');
  if ((st.npLeft ?? NP_PER_GAME) <= 0) return toast('You’re out of pauses this game');
  st.npLeft = (st.npLeft ?? NP_PER_GAME) - 1;
  st.peer.send({ t: 'npReq' }, true); togglePause(false);
  toast(`Asked ${oppName()} to pause (${st.npLeft} left)`, 3000);
}
function netPauseRx(m) {
  if (m.t === 'npReq') {   // opponent wants to pause: accept or decline (auto-decline after 10s)
    const box = document.createElement('div'); box.className = 'np-ask';
    box.innerHTML = `<b>${escapeHtml(oppName())} wants to pause</b><span>Up to ${NP_SECS} seconds</span><div><button class="btn primary sm" data-y type="button">Accept</button><button class="btn sm" data-n type="button">Decline</button></div>`;
    document.body.appendChild(box); sfx.play('ui');
    const done = yes => { if (!box.isConnected) return; box.remove(); if (yes && st.mode === 'host') startNetPause(false); else st.peer && st.peer.send({ t: 'npAns', yes }, true); };
    box.querySelector('[data-y]').onclick = () => done(true); box.querySelector('[data-n]').onclick = () => done(false);
    setTimeout(() => done(false), 10000);
    return true;
  }
  if (m.t === 'npAns') { if (!m.yes) toast(`${oppName()} said no to the pause`, 3000); else if (st.mode === 'host') startNetPause(true); return true; }
  if (m.t === 'np' && st.mode === 'guest') { st.np = { until: performance.now() + (+m.ms || NP_SECS * 1000) }; showNp(m.hostAsked ? `${oppName()} asked, you agreed` : `You asked, ${oppName()} agreed`); return true; }
  if (m.t === 'npEnd' && st.mode === 'guest') { hideNp(); toast('Game resumed'); return true; }
  if (m.t === 'npReady' && st.mode === 'host' && st.np) { st.np.ready[1] = true; npReadyCheck(); return true; }   // guest is ready
  if (m.t === 'npOppReady' && st.mode === 'guest') { $('#np-wait').textContent = `${oppName()} is ready. Resume when you are.`; return true; }
  if (m.t === 'forfeit') { st.peer && st.peer.handlers.close && st.peer.handlers.close(`${oppName()} forfeited. You win!`); return true; }
  return false;
}
// resuming needs BOTH players ready (or the timer running out): one player can't force the other back in
function npReadyCheck() {
  if (!st.np || st.mode !== 'host') return;
  if (st.np.ready[0] && st.np.ready[1]) return endNetPause();
  if (st.np.ready[1] && !st.np.ready[0]) $('#np-wait').textContent = `${oppName()} is ready. Resume when you are.`;
  if (st.np.ready[0] && !st.np.ready[1]) st.peer && st.peer.send({ t: 'npOppReady' }, true);
}
$('#np-resume').addEventListener('click', () => {
  if (!st.np) return;
  $('#np-resume').disabled = true; $('#np-resume').textContent = 'Ready ✓'; $('#np-wait').textContent = `Waiting for ${oppName()}…`;
  if (st.mode === 'host') { st.np.ready[0] = true; npReadyCheck(); } else if (st.peer) st.peer.send({ t: 'npReady' }, true);
});
$('#p-askpause').addEventListener('click', askPause);
$('#p-forfeit').addEventListener('click', async () => {
  if (!(await askYes('Forfeit this game? It counts as a loss and your opponent gets the win.', 'Forfeit', 'Keep playing'))) return;
  try { st.peer && st.peer.send({ t: 'forfeit' }, true); } catch (_) {}
  toast('You forfeited the game', 3000);
  setTimeout(() => leaveGame(), 150);
});
$('#resume').addEventListener('click', () => togglePause(false));
$('#p-howto').addEventListener('click', () => { $('#pause').classList.add('hidden'); show('howto'); });
// subs & injuries (pause menu): a depth chart — put any healthy guy at any spot between plays
const SUB_ROLES = ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'DL1', 'DL4', 'DL2', 'DL3', 'LB2', 'LB', 'LB3', 'CB1', 'CB2', 'S', 'SS'];
function subRow(S, role, focus) {
  const me = st.local, j = (S.inj || []).find(x => x.team === me && x.role === role), full = (st.bench && st.bench[me] && st.bench[me][role]) || [], bench = full.slice(1), s0 = full[0];
  const fat = (S.fat && S.fat[me]) || {}, dep = (S.depth && S.depth[me] && S.depth[me][role]) || 0, live = S.ph === 'live';
  const pl = S.pl.find(q => q[0] === me && q[2] === role);
  const starterName = j ? j.name : (s0 && s0[0]) || (dep === 0 && pl && pl[11]) || role;
  const opts = [[starterName, s0 ? s0[1] : '', 0, j && !j.ready && !(j.sub && j.out === 'plays') ? j.kind : 0], ...bench.map((b, i) => [b[0], b[1], i + 1, b[3]])];
  const chips = opts.map(([nm, ovr, d, hurt]) => {
    const f = Math.round((fat[d ? `${role}#${d}` : role] || 0) * 100), on = d === dep;
    const tag = d === 0 ? 'Starter' : d === 1 ? '2nd string' : '3rd string';
    const why = hurt ? `Hurt: ${hurt}` : f > 0 ? `Tired ${f}%` : 'Fresh';
    return `<button class="sub-chip ${on ? 'on' : ''} ${hurt ? 'hurt' : ''}" data-role="${role}" data-pick="${d}" ${on || hurt || live ? 'disabled' : ''} type="button"><small>${tag}</small><b>${escapeHtml(String(nm))}</b><span>${ovr ? ovr + ' OVR · ' : ''}${why}</span><i class="fat"><i style="width:${f}%;background:${f > 60 ? '#ff5a5a' : f > 35 ? '#ffb020' : '#22c55e'}"></i></i></button>`;
  }).join('');
  return `<div class="sub-row2 ${focus ? 'focus' : ''}"><span class="sub-pos">${role}</span><div class="sub-chips">${chips}</div></div>`;
}
function renderSubs(only) {
  const S = st.snap; if (!S) return;
  const me = st.local, ask = S.subAsk && S.subAsk[me], live = S.ph === 'live';
  const roles = only ? [only] : ask ? [ask, ...SUB_ROLES.filter(r => r !== ask)] : SUB_ROLES;
  const el = document.getElementById('subs-dlg') || Object.assign(document.createElement('div'), { id: 'subs-dlg', className: 'modal' });
  const head = ask ? `<h3>Pick a sub at ${ask}</h3><p class="note">Your guy went down. Pick who goes in. You can swap anyone else too.</p>` : `<h3>Depth chart</h3><p class="note">Put anybody in at any spot to see how they play. Tired players slow down and get hurt more. ${live ? 'You can make changes between plays.' : ''}</p>`;
  el.innerHTML = `<div class="panel subs-panel">${head}<div class="sub-list">${roles.map(r => subRow(S, r, r === ask)).join('')}</div><button class="btn" id="subs-x" type="button">${ask ? 'Keep who’s in' : 'Done'}</button></div>`;
  el.classList.remove('hidden'); if (!el.parentNode) document.body.appendChild(el);
  el.dataset.ask = ask || '';
  $('#subs-x').onclick = () => { if (ask) pushEv({ t: 'sub', role: ask, pick: (S.depth && S.depth[me] && S.depth[me][ask]) || 1 }); el.classList.add('hidden'); };
  $$('[data-pick]', el).forEach(b => b.onclick = () => {
    const role = b.dataset.role, d = +b.dataset.pick; pushEv({ t: 'sub', role, pick: d });
    const j = (S.inj || []).find(x => x.team === me && x.role === role); if (d === 0 && j && j.ready) pushEv({ t: 'injback', role, back: true });
    if (role === ask) { el.classList.add('hidden'); toast(`${b.querySelector('b').textContent} is in at ${role}`); } else setTimeout(() => renderSubs(only), 150);
  });
}
$('#p-subs').addEventListener('click', () => renderSubs());
$('#inj-back').addEventListener('click', () => { const S = st.snap; const r = S && S.injAsk && S.injAsk[st.local]; if (r) pushEv({ t: 'injback', role: r, back: true }); $('#inj-ask').classList.add('hidden'); });
$('#inj-keep').addEventListener('click', () => { const S = st.snap; const r = S && S.injAsk && S.injAsk[st.local]; if (r) pushEv({ t: 'injback', role: r, back: false }); $('#inj-ask').classList.add('hidden'); });
$('#p-settings').addEventListener('click', () => { $('#pause').classList.add('hidden'); show('settings'); });
$('#p-replay').addEventListener('click', () => { togglePause(false); startReplay(); });
$('#p-cam').addEventListener('click', () => { $('#p-cam-l').textContent = cycleCam(); });
// quitting a game that counts (Online, Ultimate Team, Season, Franchise) is a loss; Quick Play, practice and drills don't count
function quitKind() {
  const S = st.snap; if (!st.playing || st.overShown || !S || S.mode !== 'game' || st.replay) return null;
  if (st.mode === 'host' || st.mode === 'guest') return 'online';
  if (st.mode !== 'cpu' || st.practice || st.drill) return null;
  return st.ut ? 'ut' : st.franchiseGame ? 'fr' : st.seasonGame ? 'season' : null;
}
function quitInfo() { const S = st.snap, me = st.local, other = 1 - me; return { k: quitKind(), my: S.sc[me], opp: Math.max(S.sc[other], S.sc[me] + 1), ql: S.ql, at: Date.now() }; }
function applyQuitLoss(q) {
  if (!q || !q.k || isGuest()) return;
  try { localStorage.removeItem(QUIT_KEY()); } catch (_) {}
  const P = profile(), online = q.k === 'online', ut = q.k === 'ut', fr = q.k === 'fr';
  // a quit is a game played (and lost) on your profile's game history
  try { if (Auth.mode === 'supabase' && Auth.client && Auth.user && Auth.user.kind === 'account') Auth.client.from('ek_game_log').insert({ player: Auth.user.id, mode: { online: 'Online H2H', ut: 'Ultimate Team', fr: 'Franchise', season: 'Season' }[q.k] || 'Game', res: 'L', sc_me: q.my | 0, sc_opp: q.opp | 0, vs: 'Quit (counted as a loss)' }).then(() => {}, () => {}); } catch (_) {}
  if (online || ut || fr) postGameStats({ res: 'L', ps: [], st: [{}, {}], me: 0, lvl: P ? P.p.lvl : 1, rp: P ? P.p.rp : 0, secs: 600, qlen: q.ql || SET.qlen, ac: 0, acWhy: '', ut, pts: q.my, online, fr, quit: true });
  if (P) { P.p.streak = 0; if (online) P.p.rp = Math.max(0, (P.p.rp || 0) - 25); if (ut && P.p.ut) P.p.ut.rw = Math.max(0, (P.p.ut.rw || 0) - 0.5); P.save(); }
  if (q.k === 'season') { const SS = loadSeason(); if (SS && Season.userGame(SS)) { Season.finishWeek(SS, q.my, q.opp); saveSeason(SS); } }
  if (fr) { const F = Fr.load(); if (F) Fr.recordResult(F, q.my, q.opp, [], 0, []); }
}
const QUIT_KEY = () => 'ek_quit_' + (Auth.user ? Auth.user.id : 'anon');
// closing the tab mid-game counts too: the game keeps a note, and the loss is applied next time you open the game
setInterval(() => { const k = quitKind(); try { if (k) localStorage.setItem(QUIT_KEY(), JSON.stringify(quitInfo())); else if (!st.playing) localStorage.removeItem(QUIT_KEY()); } catch (_) {} }, 3000);
$('#quit').addEventListener('click', async () => {
  if (quitKind()) { if (!(await askYes('Leaving now counts as a LOSS on your record. Quit anyway?', 'Quit and take the L'))) return; applyQuitLoss(quitInfo()); toast('You quit: counted as a loss', 3000); }
  leaveGame();
});
$('#p-chat').addEventListener('click', () => { SET.chat = !SET.chat; saveSet(); $('#p-chat').textContent = SET.chat ? 'Mute chat' : 'Unmute chat'; if (!SET.chat) $('#chat-log').innerHTML = ''; });
$('#go-menu').addEventListener('click', () => leaveGame());
$('#go-clip').addEventListener('click', () => { if (st.mode !== 'spec') saveClip(st.rec); });
$('#p-clip').addEventListener('click', () => { if (st.mode !== 'spec') saveClip(st.rec); });
$('#go-again').addEventListener('click', () => {
  $('#gameover').classList.add('hidden');
  if (st.mode === 'cpu' && st.seasonGame) { leaveGame(); show('season'); return; }
  if (st.mode === 'cpu' && st.franchiseGame) { leaveGame(); show('franchise'); return; }
  else if (st.mode === 'cpu') { const o = st.lastCpu || {}; if (o.drill) o.teams = [o.teams[0], randOpp()]; startCPU(o); }
  else if (st.mode === 'host') { startHostGame(); }
  else { if (st.peer) st.peer.send({ t: 'rematch' }, true); toast('Rematch request sent. Waiting for the host…', 3000); }
});

function teamStatsHTML(S) {
  const s = S.st, T = S.teams.map(i => TEAMS[i]);
  const rows = [['Total yards', (s[0].passYds || 0) + (s[0].rushYds || 0), (s[1].passYds || 0) + (s[1].rushYds || 0)], ['Passing', s[0].passYds, s[1].passYds], ['Comp/Att', `${s[0].comp}/${s[0].att}`, `${s[1].comp}/${s[1].att}`], ['Rushing', s[0].rushYds, s[1].rushYds],
    ['First downs', s[0].firstDowns, s[1].firstDowns], ['Touchdowns', s[0].tds, s[1].tds], ['Interceptions thrown', s[0].ints, s[1].ints], ['Sacks', s[0].sacks, s[1].sacks], ['Field goals', `${s[0].fgm || 0}/${s[0].fga || 0}`, `${s[1].fgm || 0}/${s[1].fga || 0}`], ['Penalties', `${s[0].pens || 0}-${s[0].penYds || 0}`, `${s[1].pens || 0}-${s[1].penYds || 0}`]];
  return `<tr><th>${T[0].abbr}</th><th></th><th>${T[1].abbr}</th></tr>` + rows.map(r => `<tr><td>${r[1] ?? 0}</td><td>${r[0]}</td><td>${r[2] ?? 0}</td></tr>`).join('');
}
// pause menu → Game stats: both teams' numbers so far, plus your team's leaders
function showGameStats() {
  const S = st.snap; if (!S || !S.st) return;
  const me = st.mode === 'spec' ? 0 : st.local, T = TEAMS[S.teams[me]], ps = (S.ps || (st.game && st.game.ps ? Object.values(st.game.ps) : [])).filter(p => p.t === me);
  const top = (k, f) => { const p = ps.slice().sort((a, b) => (b[k] || 0) - (a[k] || 0))[0]; return p && p[k] ? `<tr><td>${escapeHtml(p.n)} <small>${p.pos}</small></td><td>${f(p)}</td></tr>` : ''; };
  const lead = top('py', p => `${p.py} pass yds, ${p.ptd || 0} TD`) + top('ry', p => `${p.ry} rush yds`) + top('recy', p => `${p.rec} catches, ${p.recy} yds`) + top('tk', p => `${p.tk} tackles${p.sk ? `, ${p.sk} sacks` : ''}`) + top('int', p => `${p.int} INT`);
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 63;
  m.innerHTML = `<div class="panel info-card gs-card"><h3 style="margin:0">Game stats <small class="note">${S.q >= 5 ? 'OT' : 'Q' + S.q} ${fmtClock(S.clk)} · ${S.sc[0]}-${S.sc[1]}</small></h3><table class="go-stats">${teamStatsHTML(S)}</table>${lead ? `<h4>${T.abbr} leaders</h4><table class="gs-lead">${lead}</table>` : ''}<div class="actions"><button class="btn primary" type="button" data-x>Back</button></div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  m.querySelector('[data-x]').onclick = () => { sfx.play('ui'); close(); }; m.onclick = e => { if (e.target === m) close(); };
  document.addEventListener('keydown', key, true);
}
$('#p-stats').addEventListener('click', () => { sfx.play('ui'); showGameStats(); });
// on-screen zoom buttons (scroll and - / + still work)
$$('#zoom-btns [data-z]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); zoomCam(+b.dataset.z); }));
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
  try { awardGame({ mode: 'online', forfeit: true, ut: !!st.myUT, res: 'W', diff: 1, qlen: S.ql, sc: [S.sc[me], S.sc[other]], me: S.st[me], opp: S.st[other] }); setTimeout(() => toast('Your opponent quit. You get the win, XP and rank points.', 3500), 600); } catch (e) { console.warn(e); }
}
function filmOk() { return !st.practice && !st.drill && st.mode !== 'spec' && st.mode !== 'clip' && !st.replay; }
function showGameOver(S) {
  st.overShown = true; try { localStorage.removeItem(QUIT_KEY()); } catch (_) {}
  if (filmOk() && S.mode === 'game') { if (st.lastDead) filmCapture(st.rec, st.lastDead); const T0 = TEAMS[S.teams[0]], T1 = TEAMS[S.teams[1]]; filmSave(S, `${(st.teamNames && st.teamNames[0]) || T0.abbr} ${S.sc[0]} - ${S.sc[1]} ${(st.teamNames && st.teamNames[1]) || T1.abbr}${st.ut ? ' · UT' : st.seasonGame ? ' · Season' : st.franchiseGame ? ' · Franchise' : st.mode === 'cpu' ? ' · Quick Play' : ' · Online'}`); }
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
  if (st.mode === 'cpu' && S.mode === 'game' && !st.learned) { st.learned = true; learnSkill(res, S.sc[me], S.sc[other]); }
  const el = $('#go-res');
  el.textContent = res === 'W' ? 'VICTORY' : res === 'L' ? 'DEFEAT' : 'TIE GAME';
  el.className = 'go-res ' + (res === 'W' ? 'win' : res === 'L' ? 'loss' : '');
  if (st.mode === 'spec') { el.textContent = 'FINAL'; el.className = 'go-res'; }
  if (st.league && S.mode === 'game') League.reportResult(S);
  $('#gameover').classList.toggle('spec', st.mode === 'spec');
  const T = S.teams.map(i => TEAMS[i]);
  $('#go-score').innerHTML = `<span style="color:${T[0].jersey === '#121a14' ? '#18c964' : T[0].jersey}">${T[0].abbr}</span> ${S.sc[0]} – ${S.sc[1]} <span style="color:${T[1].jersey === '#121a14' ? '#18c964' : T[1].jersey}">${T[1].abbr}</span>`;
  $('#go-stats').innerHTML = teamStatsHTML(S);
  $('#go-again').textContent = st.mode === 'guest' ? 'Ask for a rematch' : st.mode === 'host' ? 'Rematch' : st.seasonGame ? 'Back to season' : st.franchiseGame ? 'Back to franchise' : 'Play again';
  $('#go-again').classList.toggle('hidden', st.mode === 'spec');
  if (st.franchiseGame && !st.seasonSaved) {
    st.seasonSaved = true;
    const F = Fr.load();
    if (F && F.phase === 'season') {
      const ups = Fr.recordResult(F, S.sc[0], S.sc[1], S.ps || [], 0, st.game && st.game.injLog ? st.game.injLog.filter(j => j.team === 0) : []);
      const done = F.phase !== 'season';
      setTimeout(() => toast(done ? `Season over. ${F.history[0] && F.history[0].champ ? 'KINGS BOWL CHAMPIONS!' : 'Time for the offseason.'}` : ups.length ? 'Progression: ' + ups.slice(0, 3).join(', ') : `Record: ${F.season.standings[F.team].w}W-${F.season.standings[F.team].l}L`, 4000), 400);
    }
  }
  if (st.seasonGame && !st.seasonSaved) {
    st.seasonSaved = true;
    const SS = loadSeason();
    if (SS) {
      { const inj = (st.game && st.game.injLog) || [], notes = Form.seasonAfterGame(SS, S.ps || [], inj, 0, S.sc[0] > S.sc[1], S.sc[0] - S.sc[1]); if (notes.length) setTimeout(() => toast(notes[0], 3500), 4200); }
      Season.finishWeek(SS, S.sc[0], S.sc[1]); saveSeason(SS);
      if (SS.phase === 'done' && SS.champion === SS.team) unlockAch('champ');
      const note = SS.phase === 'done' ? (SS.champion === SS.team ? '🏆 KINGS BOWL CHAMPIONS!' : 'Season over.') : `Season record: ${SS.standings[SS.team].w}W-${SS.standings[SS.team].l}L${SS.standings[SS.team].t ? '-' + SS.standings[SS.team].t + 'T' : ''}`;
      setTimeout(() => toast(note, 3500), 400);
    }
  }
  if (!st.rewarded && isGuest() && !LOCALNET) { st.rewarded = true; $('#go-rewards').innerHTML = '<div class="gr-head"><b>Rewards</b></div><p class="note">Guests don\'t earn coins, XP or rank. <button class="link" id="go-signup">Make a free account</button> and this game would have paid out.</p>'; setTimeout(() => { const b = $('#go-signup'); if (b) b.onclick = () => lockPrompt(''); }); }
  // coins, XP, rank and leaderboard stats come from Online 1v1, Ultimate Team and Franchise. Quick Play,
  // Season, practice and drills against the CPU are just for fun.
  const paid = S.mode === 'game' && (st.mode === 'host' || st.mode === 'guest' || st.ut || st.franchiseGame);
  if (!st.rewarded && !paid && !isGuest()) {
    st.rewarded = true;
    const P = profile();
    if (st.seasonGame && S.mode === 'game' && P) {
      $('#go-rewards').innerHTML = `<div class="gr-head"><b>Rewards</b><span class="coins-pill">New balance: <i class="tp-ic">TP</i>${(P.p.tp || 0).toLocaleString()}</span></div><p class="note">Season games don’t pay coins, XP, rank or Training Points. Training Points come from Ultimate Team games.</p>`;
    } else $('#go-rewards').innerHTML = NO_REWARDS_HTML;
  }
  // leaderboard stats (yards, TDs, tackles...) count from every full game, CPU ones included; the record only counts online 1v1 and Ultimate Team
  const statsOk = S.mode === 'game' && !st.practice && !st.drill && st.mode !== 'spec' && st.mode !== 'clip' && !st.replay;
  if (!st.statsPosted && statsOk && !isGuest()) {
    st.statsPosted = true;
    const P = profile();
    // the guest can't touch the host's game, so in-game anti-cheat flags never count against the guest
    postGameStats({ res, ps: S.ps || [], st: S.st, me, lvl: P ? P.p.lvl : 1, rp: P ? P.p.rp : 0, secs: (performance.now() - (st.startedAt || performance.now())) / 1000, qlen: S.ql, ac: (st.mode !== 'guest' && S.ac && S.ac.n) || (P && P.tampered ? 1 : 0), acWhy: (st.mode !== 'guest' && S.ac && S.ac.why) || (P && P.tampered ? 'save file was edited' : ''), ut: !!st.ut, pts: S.sc[me], online: st.mode === 'host' || st.mode === 'guest', fr: !!st.franchiseGame });
    if (P && P.tampered) { P.tampered = false; P.p.tampered = 0; P.save(); }
  }
  if (!st.rewarded) {
    st.rewarded = true;
    const mine = S.st[me], theirs = S.st[other];
    try {
      $('#go-rewards').innerHTML = awardGame({ mode: st.mode === 'cpu' ? (st.franchiseGame ? 'franchise' : st.ut ? 'ut' : 'cpu') : 'online', ut: st.mode === 'cpu' ? !!st.ut : !!st.myUT, solo: st.solo, battle: st.mode === 'cpu' ? st.battle : null, theme: st.mode === 'cpu' ? st.theme : null, res, diff: st.mode === 'cpu' ? (st.game && st.game.opts && st.game.opts.difficulty != null ? st.game.opts.difficulty : SET.diff) : 1, qlen: S.ql, oppName: st.names && st.names[other], sc: [S.sc[me], S.sc[other]], me: mine, opp: theirs });
      if (st.ut && S.mode === 'game') { try { const P = profile(); if (P && P.p.ut) { const fl = UTm.updateForm(P.p.ut, S.ps || [], me, res === 'W', S.sc[me] - S.sc[other]); P.save(); if (fl.length) $('#go-rewards').insertAdjacentHTML('beforeend', `<div class="gr-extra">${fl.map(t => `<span class="up">${escapeHtml(t)}</span>`).join('')}</div>`); } } catch (e) { console.warn(e); } }
    } catch (e) { console.warn(e); $('#go-rewards').innerHTML = ''; }
  }
  $('#gameover').classList.remove('hidden');
  // game history on your profile: every finished game, any mode (practice and drills don't count)
  if (!st.logged && S.mode === 'game' && st.mode !== 'spec' && st.mode !== 'clip' && Auth.user && Auth.user.kind === 'account' && Auth.mode === 'supabase' && Auth.client) {
    st.logged = true;
    const vs = String((st.teamNames && st.teamNames[other]) || (st.names && st.names[other]) || (TEAMS[S.teams[other]] || {}).city || 'CPU').slice(0, 30);
    Auth.client.from('ek_game_log').insert({ player: Auth.user.id, mode: gameKind(), res, sc_me: S.sc[me] | 0, sc_opp: S.sc[other] | 0, vs }).then(() => {}, () => {});
  }
  if (!st.resultSaved && Auth.user) {
    st.resultSaved = true;
    const counted = S.mode === 'game' && (st.mode === 'host' || st.mode === 'guest');   // the record is Online H2H only: games against real people
    (counted && Auth.user.kind !== 'account' ? Auth.recordResult(res) : Promise.resolve()).then(() => {
      const u = Auth.user;
      // the record for the mode you just played; CPU quick play and seasons don't count toward any record
      const online = st.mode === 'host' || st.mode === 'guest', kinds = [online && 'on'].filter(Boolean);
      const P = profile();
      if (P && kinds.length && S.mode === 'game') {
        P.p.recs = P.p.recs || {};
        for (const k of kinds) { const r = P.p.recs[k] = P.p.recs[k] || [0, 0, 0]; r[res === 'W' ? 0 : res === 'L' ? 1 : 2]++; }
        P.save();
      }
      const NAME = { on: 'Online H2H', ut: 'Ultimate Team', fr: 'Franchise' };
      const SV = { on: ['on_w', 'on_l', 'on_t'], ut: ['ut_wins', 'ut_l', 'ut_t'], fr: ['fr_w', 'fr_l', 'fr_t'] };
      const draw = () => {
        const line = kinds.map(k => { const r = u.recs ? SV[k].map(f => u.recs[f] || 0) : ((P && P.p.recs && P.p.recs[k]) || [0, 0, 0]); return `${NAME[k]} record: ${r[0]}W-${r[1]}L${r[2] ? '-' + r[2] + 'T' : ''}`; }).join(' · ');
        $('#go-rec').textContent = u.kind === 'guest' ? 'Make an account to save your record.' : line || 'Only online head-to-head games against real players count toward your record.';
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
    b.onclick = () => { sfx.play('ui'); st.pcOpen = null; pushEv({ t: 'play', id: c.id, ...(c.def ? { def: c.def } : {}) }); };
    box.appendChild(b);
  });
  box.scrollLeft = 0;
  hudCache.pcSel = null;
}
// once you call a play the playbook folds away; Backspace, Z/X or a click brings it back
function pcCollapsed(S) {
  if (!S || S.ph !== 'presnap') return false;
  const onOff = S.poss === st.local, picked = onOff ? !!S.op : !!S.dc;
  return picked && st.pcOpen !== S.id;
}
function reopenPlaybook() { const S = st.snap; if (S) { st.pcOpen = S.id; hudCache.pcKey = null; sfx.play('ui'); } }
function pickCard(n) {
  if (pcCollapsed(st.snap)) { reopenPlaybook(); return null; }
  const t = st.pbTabs && st.pbTabs[st.pbTab]; if (!t) return null;
  const c = t.cards[n - 1]; if (!c) return null;
  sfx.play('ui'); st.pcOpen = null;
  return { t: 'play', id: c.id, ...(c.def ? { def: c.def } : {}) };
}
function switchTab(d) {
  if (pcCollapsed(st.snap)) return reopenPlaybook();
  if (!st.pbTabs || !st.pbTabs.length) return;
  st.pbTab = (st.pbTab + d + st.pbTabs.length) % st.pbTabs.length; hudCache.pcKey = null; sfx.play('ui');
}

// controller prompts: same hints, controller buttons instead of keys
function padHint(items) {
  const g = glyphs(), c = padContext();
  const M = {
    presnapOff: { Space: g.A, Backspace: 'D-pad', L: g.LT, J: g.X, N: 'L3', K: g.RT, V: g.View, H: g.Y, 'hold Tab': '' },
    presnapDef: { Q: g.B, V: g.View, 'hold Tab': '' },
    dead: { Space: g.A, N: '', O: '', V: g.View, 'hold Tab': g.Y },
    pass: { '1 2 3 4 5': `${g.A} ${g.B} ${g.X} ${g.Y} ${g.RB}`, 'hold 1-5': `hold ${g.A} ${g.B} ${g.X} ${g.Y} ${g.RB}`, 'W A S D': g.LS, Shift: g.RT, O: '', G: '' },
    carry: { Space: g.RS + ' flick', E: g.B, R: g.A, B: g.RB, F: g.Y, X: g.X, G: g.LB, Shift: g.RT },
    air: { 'W A S D': g.LS, E: g.Y, Q: g.B, Shift: g.RT },
    def: { Space: g.X, Q: g.B, Shift: g.RT, E: g.Y },
  }[c] || {};
  const G = { Esc: g.Menu, C: g.R3, R: g.X, T: '', 'hold Tab': `hold ${g.Y}`, '- +': 'D-pad ↑ ↓' };
  return items.map(([k, t]) => [k in M ? M[k] : k in G ? G[k] : k, t]).filter(([k]) => k);
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
      ${(S.hls || []).length ? `<div class="ht-hl"><h4>First-half highlights</h4>${highlightsHTML(S)}</div>` : ''}
      <div class="ht-foot">${ready ? '<span>Waiting for the other coach…</span>' : '<button class="btn primary" id="ht-go">Start second half</button><span><kbd>Space</kbd></span>'}<span id="ht-left"></span></div></div>`;
    const b = $('#ht-go', el); if (b) b.onclick = () => pushEv({ t: 'ready' });
    hudCache['#ht-left'] = null;
  }
  setTxt('#ht-left', `Second half in ${Math.max(0, Math.ceil((S.hl || 12) - S.pt))}s`);
  if (!st.halfSaid) {
    st.halfSaid = true;
    if (S.sc[0] === S.sc[1]) sfx.say('htTie', { n: S.sc[0] }, true); else sfx.say('htLead', { city: T[S.sc[0] > S.sc[1] ? 0 : 1].city, n: Math.max(...S.sc), n2: Math.min(...S.sc) }, true); sfx.cheer(0.4, 3);
  }
}

function renderKickMeter(S) {
  const el = $('#kickmeter'), k = S.ks, mine = k && S.poss === st.local;
  el.classList.toggle('hidden', !k);
  if (!k) { hudCache.km = null; return; }
  el.classList.toggle('theirs', !mine);
  if (!mine) {   // the other team never sees your aim or power
    if (hudCache.km !== 'theirs') { hudCache.km = 'theirs'; $('#km-title').textContent = k.type === 'kickoff' ? 'Kickoff' : k.type === 'punt' ? 'Punt' : k.type === 'xp' ? 'Extra point' : 'Field goal'; $('#km-dist').textContent = k.type === 'punt' || k.type === 'kickoff' ? '' : `${k.fd} yards`; $('#km-step').textContent = 'The other team is lining up the kick…'; $('#km-btn').classList.add('hidden'); }
    return;
  }
  if (hudCache.km !== k.type + k.stage + mine) {
    hudCache.km = k.type + k.stage + mine;
    $('#km-title').textContent = k.type === 'kickoff' ? 'Kickoff' : k.type === 'punt' ? 'Punt' : k.type === 'xp' ? 'Extra point' : 'Field goal';
    $('#km-dist').textContent = k.type === 'kickoff' ? 'Full power reaches the end zone' : k.type === 'punt' ? `Leg range about ${Math.round(k.maxR)} yds` : `${k.fd} yards, range ${Math.round(k.maxR)}`;
    const kk = pad.on ? glyphs().A : 'Space', aimK = pad.on ? `<kbd>${glyphs().LS}</kbd>` : '<kbd>A</kbd> <kbd>D</kbd>';
    const steps = { aim: `Aim with ${aimK}, then press <kbd>${kk}</kbd> to start the kick`, power: `Press <kbd>${kk}</kbd> to lock your power`, acc: `Press <kbd>${kk}</kbd> as the needle hits the white zone` };
    $('#km-step').innerHTML = mine ? steps[k.stage] : 'The other team is kicking';
    $('#km-btn').textContent = k.stage === 'aim' ? 'Start kick' : k.stage === 'power' ? 'Lock power' : 'Kick';
    $('#km-btn').classList.toggle('hidden', !mine);
    const need = k.type === 'punt' || k.type === 'kickoff' ? null : Math.min(1, k.fd / (k.maxR * 1.08) + 0.06);
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
  if (TUT.on) tutTick(S);
  if (S.tz) { if (!st.introOn && st.intro <= 0 && !st.tossS) maybeToss(); } else if (st.tossS && st.mode === 'guest') closeToss();
  if (S.bench) st.bench = S.bench;
  if (S.wx && S.wx !== st.wx) { st.wx = S.wx; R.setWeather(S.wx, S.tod || st.tod || 'night'); }   // the weather turned mid-game
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
  // timeout stoppage: big countdown till play resumes
  { const on = S.toh > 0; $('#to-timer').classList.toggle('hidden', !on);
    if (on) { setTxt('#to-left', `0:${String(Math.ceil(S.toh)).padStart(2, '0')}`); setTxt('#to-who', S.tot >= 0 && st.names && st.names[S.tot] ? `TIMEOUT · ${st.names[S.tot]}` : 'TIMEOUT'); } }
  $('#chat-hint').classList.toggle('hidden', !(isNet() && SET.chat && !$('#chat').classList.contains('open')));
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
  const showPc = S.ph === 'presnap' && st.mode !== 'spec' && st.mode !== 'clip';   // spectators never see anyone's playbook or play call
  pc.classList.toggle('hidden', !showPc);
  const col = showPc && pcCollapsed(S); pc.classList.toggle('collapsed', col); $('#hud').classList.toggle('pc-col', col);
  $('#hud').classList.toggle('pc-open', showPc);
  if (showPc) {
    buildPlaycall(S);
    const onOff = S.poss === me;
    const sel = onOff ? S.op : S.dp;
    if (hudCache.pcSel !== sel) { hudCache.pcSel = sel; $$('.pc-card', pc).forEach(c => c.classList.toggle('on', c.dataset.id === sel)); }
    const isCPU = !S.humans[1 - me];
    const pickedName = col ? (() => { const id = onOff ? S.op : S.dp; for (const t of st.pbTabs || []) { const c = t.cards.find(x => x.id === id); if (c) return c.name; } return ''; })() : '';
    setTxt('#pc-title', col ? `${onOff ? 'Offense' : 'Defense'}: ${pickedName}` : onOff ? (S.pat >= 0 ? 'Kick the extra point or go for 2' : S.dn === 4 ? 'Fourth down, your call' : 'Offense') : 'Defense');
    const waitD = onOff && S.humans[1 - me] && !S.dc;
    const g = glyphs(), kb = (key, pk) => `<kbd>${pad.on ? pk : key}</kbd>`;
    const tabsH = pad.on ? `<span><kbd>${g.LB}</kbd><kbd>${g.RB}</kbd> tabs</span>` : '<span><kbd>Z</kbd><kbd>X</kbd> tabs</span>';
    const nCards = Math.min(PER_TAB, ((st.pbTabs || [])[st.pbTab] || { cards: [] }).cards.length) || 1;
    const pickH = pad.on ? `<span><kbd>◀</kbd><kbd>▶</kbd><kbd>${g.A}</kbd> pick</span>` : `<span><kbd>1</kbd>–<kbd>${nCards}</kbd> pick</span>`;
    const hintHtml = onOff ? (S.op ? (waitD ? '<span>Waiting for the defense to call a play…</span>' : '') + `<span>${kb('Space', g.A)} snap</span>${hotOk(S) ? `<span>${kb('H', g.Y)} hot route</span>` : ''}${tabsH}` : pickH + tabsH)
      : (isCPU ? `<span>${escapeHtml(st.names[1 - me] || 'They')} snap soon</span>` + tabsH + `<span>${kb('Q', g.B)} switch</span>` : tabsH + `<span>${kb('Q', g.B)} switch player</span>`);
    const hintFull = col ? hintHtml.replace(tabsH, '') + `<span>${kb('Backspace', 'D-pad')} change play</span>` : hintHtml;
    // the scorebug hides while the play call is up, so the situation goes in the header
    { let sit = document.getElementById('pc-sit'); if (!sit) { sit = document.createElement('small'); sit.id = 'pc-sit'; sit.className = 'pc-sit'; $('#pc-book').insertAdjacentElement('afterend', sit); }
      setTxt('#pc-sit', `${T[0].abbr} ${S.sc[0]} - ${S.sc[1]} ${T[1].abbr} · ${hudCache['#sb-q'] || ''} ${hudCache['#sb-clk'] || ''} · ${hudCache['#sb-down'] || ''} · ${hudCache['#sb-spot'] || ''}`); }
    if (hudCache.pch !== hintFull) { hudCache.pch = hintFull; $('#pc-hint').innerHTML = hintFull; }
    const clk = $('#pc-clock'), pcv = S.pc;
    if (hudCache.pcv !== pcv) { hudCache.pcv = pcv; $('b', clk).textContent = pcv; clk.classList.toggle('low', pcv <= 5); if (pcv <= 5 && pcv > 0 && S.poss === me) sfx.play('ui'); }
    const tos = (S.to || [3, 3])[me], toKey = tos + '|' + S.mode;
    if (hudCache.to !== toKey) { hudCache.to = toKey; $('#pc-to').innerHTML = [0, 1, 2].map(i => `<i class="${i < tos ? '' : 'used'}"></i>`).join(''); $('#pc-timeout').disabled = !tos || S.mode === 'practice'; }
  }

  // injuries: a heads-up when someone goes down, and the "put him back in?" question
  if (S.msgInj && S.msgInj.text !== hudCache.injMsg) { hudCache.injMsg = S.msgInj.text; if (st.mode !== 'clip') injBanner((S.msgInj.team === me ? '' : 'Opponent: ') + S.msgInj.text, S.msgInj.team === me); }
  { const need = S.subAsk && S.subAsk[me], dlg = document.getElementById('subs-dlg');
    if (need && S.ph !== 'live' && st.mode !== 'clip' && hudCache.subAsk !== need && st.bench) { hudCache.subAsk = need; renderSubs(); }
    if (!need) { hudCache.subAsk = null; if (dlg && dlg.dataset.ask && !dlg.classList.contains('hidden')) dlg.classList.add('hidden'); } }
  { const ask = S.injAsk && S.injAsk[me], j = ask && (S.inj || []).find(x => x.team === me && x.role === ask);
    const show = !!(j && j.ready) && S.ph !== 'live'; $('#inj-ask').classList.toggle('hidden', !show);
    if (show) setTxt('#inj-ask-t', `${j.name} (${j.kind}) is cleared to go back in.`); }
  // wind arrow, drawn from your point of view
  { const W = S.wind, on = !!(W && W.mph); $('#wind-ind').classList.toggle('hidden', !on || st.hot.open);   // the hot route panel sits in the same corner
    if (on) { const s = st.local === 1 ? -1 : 1, ang = Math.atan2(-Math.sin(W.dir) * s, Math.cos(W.dir) * s) * 180 / Math.PI, key = W.mph + '|' + Math.round(ang);
      if (hudCache.wind !== key) { hudCache.wind = key; $('#wind-arrow').style.transform = `rotate(${ang - 90}deg)`; setTxt('#wind-mph', `${W.mph} mph`); } } }
  // contextual hints
  if (S.ph === 'dead' && st.mode !== 'clip' && st.mode !== 'spec') hint(S.poss === me ? [['hold Tab', 'emote'], ['Space', 'skip'], ['N', 'no huddle'], ['O', (S.osd || [])[me] ? 'cancel onside' : 'onside kick']] : [['hold Tab', 'emote'], ['Space', 'skip']]);
  else if (S.ph === 'presnap' && S.poss === me && st.mode !== 'clip' && st.mode !== 'spec' && !(S.sp && S.sp.pat) && S.mode !== 'drill') hint([['Space', 'snap'], ['Backspace', 'audible'], ['L', S.flip ? 'unflip' : 'flip play'], ['J', 'motion'], ['N', 'same play'], ['K', 'spike'], ['U', 'kneel'], ['V', 'timeout'], ['hold Tab', 'emote']]);
  else if (S.ph === 'live') {
    const carrier = S.b[3] === 0 ? S.b[5] : -1;
    const iCarry = carrier >= 0 && carrier === S.ctrl[me];
    if (S.canThrow && S.off === me) hint([['hold 1-5', 'throw: tap = touch, hold = bullet, green = on target'], ['W A S D', 'move'], ['Shift', 'sprint'], ['O', 'throw it away'], ['G', 'slide']]);
    else if (iCarry) hint([['Space', 'juke'], ['E', 'spin'], ['R', 'stiff arm'], ['B', 'truck'], ['F', 'hurdle'], ['X', 'dive'], ['G', 'go down'], ['Shift', 'sprint']]);
    else if (S.b[3] === 1 && S.b[4] && S.off === me) hint([['W A S D', 'get to the ring'], ['E', 'aggressive catch'], ['X', 'dive for it']]);
    else if (S.b[3] === 1 && S.b[4]) hint([['E', 'play the ball'], ['Q', 'switch'], ['Shift', 'sprint']]);
    else if (S.b[3] === 3) hint([['Space', 'dive on the ball'], ['W A S D', 'get to it first'], ['Q', 'switch'], ['Shift', 'sprint']]);
    else hint([['Space', 'dive tackle'], ['H', 'hit stick'], ['Q', 'switch'], ['Shift', 'sprint']]);
  } else hint(st.mode === 'spec' || st.mode === 'clip' ? [['Esc', 'leave'], ['C', 'camera'], ['- +', 'zoom']] : st.mode === 'cpu' ? [['Esc', 'pause'], ['C', 'camera'], ['- +', 'zoom'], ['R', 'instant replay'], ['hold Tab', 'emote']] : [['Esc', 'pause'], ['C', 'camera'], ['- +', 'zoom'], ['T', 'chat'], ['hold Tab', 'emote']]);
  const tOn = touchOn();
  if (hudCache.tOn !== tOn) { hudCache.tOn = tOn; syncTouchClass(); }
  $('#touch').classList.toggle('hidden', !tOn || S.ph === 'gameover');
  $('#hud').classList.toggle('touch-mode', tOn);
  if (tOn) touchButtons(S);
}

// ---------------- online ----------------
let onlineTeam = SET.team;
function renderOnline() {
  teamCard($('#tp-online .team-card'), onlineTeam);
  { const u = Auth.user, P = !isGuest() && profile(), R = u && u.recs, r = R ? [R.on_w || 0, R.on_l || 0, R.on_t || 0] : ((P && P.p.recs && P.p.recs.on) || [0, 0, 0]);
    $('#h2h-name').textContent = u ? u.name : 'Player'; $('#h2h-rec').textContent = `${r[0]}-${r[1]}${r[2] ? '-' + r[2] : ''}`;
    $('#wait-me').textContent = u ? u.name : 'You'; const useUT = $('#use-ut').checked && P && P.p.ut && P.p.ut.started; $('#wait-logo').src = logoURL(useUT ? P.p.ut.club : onlineTeam, 64); }
  // ranked season
  { const P = !isGuest() && profile(); let box = $('#comp-box'); if (!box) { box = document.createElement('div'); box.id = 'comp-box'; box.className = 'comp-box'; $('#online-main').prepend(box); }
    if (!P) box.innerHTML = ''; else {
      P.settleSeasons(); const rk = P.rank, peak = rankInfoOf((P.p.rs && P.p.rs.peak) || P.p.rp);
      const RR = RANK_REWARDS_[Math.min(5, peak.idx)];
      box.innerHTML = `<div class="comp-card rk"><small>Ranked Season · ends in ${seasonDaysLeftOf()} day${seasonDaysLeftOf() === 1 ? '' : 's'}</small><b>${rk.name}</b><span>Peak this season: ${peak.name} · pays ${RR.coins.toLocaleString()} coins${RR.pack ? ' + pack' : ''}</span><i class="comp-bar"><i style="width:${rk.span ? rk.into : 100}%"></i></i></div>`;
    } }
  seg($('#seg-qlen2'), QLENS, SET.qlen, v => { SET.qlen = v; saveSet(); });
  const warn = $('#online-warn');
  let w = '';
  if (isBanned()) w = 'Your account is banned, so online play is off.';
  else if (!Auth.configured() && !LOCALNET) { w = 'Online features are unavailable right now. You can still play against the CPU.'; console.warn('[Endzone Kings] Online 1v1 needs Supabase: add your keys in js/config.js (see README, Step 2).'); }
  else if (Auth.user && Auth.user.kind === 'guest' && !LOCALNET) w = 'Make a free account to play online (Log out → Sign up).';
  warn.innerHTML = w; warn.classList.toggle('hidden', !w);
  $('#host-btn').disabled = !!w; $('#join-btn').disabled = !!w;
  if (!st.peer) { $('#online-main').classList.remove('hidden'); $('#online-wait').classList.add('hidden'); onlineMsg(''); }
  seg($('#seg-vis'), [['public', 'Anyone (lobby)'], ['private', 'Only with code']], SET.vis, v => { SET.vis = v; saveSet(); });
  seg($('#seg-wind2'), WIND_OPTS, SET.wind || 0, v => { SET.wind = v; saveSet(); if (v >= 15) toast('Heads up: strong wind moves passes and kicks', 2200); });
  seg($('#seg-wx2'), [['random', 'Random'], ['clear', 'Clear night'], ['day', 'Day game'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog']], SET.wx2, v => { SET.wx2 = v; saveSet(); });
  const P = profile(), utOk = P && P.ut.started && UTm.squadOvr(P.ut).full;
  $('#use-ut').disabled = !utOk; if (!utOk) $('#use-ut').checked = false;
  $('#use-ut').parentElement.title = utOk ? '' : 'Start Ultimate Team and fill your lineup first';
  if (!w) startLobby();
}
function myOnlineInfo() {
  st.myUT = false;
  const P = profile(), useUT = $('#use-ut').checked && P && P.ut.started;
  const roster = useUT ? UTm.squadRoster(P.ut) : null;
  st.myUT = !!roster && !st.league;   // TP online only when YOU bring your UT squad
  return { name: Auth.user ? Auth.user.name : 'Player', team: useUT ? P.ut.club : onlineTeam, rank: P ? P.rank.name : '', roster, squad: roster ? P.ut.name : null, cel: SET.cel, ...(League.onlineOverride() || {}) };
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
  spec.send({ t: 's', s: specSafe(st.snap), e: events || [], names: st.names, teamNames: st.teamNames, teams: st.snap.teams });
  liveTrack(false);
}
// every signed-in game streams on your own channel so friends can watch it from your profile.
// Nothing is sent until someone is actually watching.
let ucast = null, ucastAcc = 0;
const ucastEv = [];
function gameKind() { const online = st.mode === 'host' || st.mode === 'guest'; return st.league ? 'Online Franchise' : online ? (st.myUT || st.ut ? 'UT Online H2H' : 'Online H2H') : st.battle != null && st.ut ? 'UT Solo Battle' : st.theme && st.ut ? 'UT Theme Challenge' : st.solo && st.ut ? 'UT Solo Challenge' : st.ut ? 'Ultimate Team' : st.franchiseGame ? 'Franchise' : st.seasonGame ? 'Season' : 'Quick Play'; }
function startUserCast() {
  stopUserCast();
  const u = Auth.user; if (!st.playing && st.screen !== 'game') return;
  if (!u || u.kind !== 'account' || Auth.mode !== 'supabase' || LOCALNET || st.practice || st.drill || st.mode === 'spec' || st.mode === 'clip') return;
  const info = { host: 1, kind: gameKind(), vs: st.names[1 - st.local] || 'the other team', at: Date.now() };
  const ch = ucast = new SpecChannel(Auth.client, 'u' + u.id, info);
  ch.open(() => {}).catch(() => { if (ucast === ch) ucast = null; });
  // also mark it on your player row (any mode), refreshed every 40s, so profiles always know you're live
  const mark = () => { if (ucast !== ch) return; Auth.client.from('ek_players').update({ live: { kind: info.kind, vs: info.vs, at: new Date().toISOString() } }).eq('id', u.id).then(() => {}, () => {}); };
  mark(); clearInterval(liveBeat); liveBeat = setInterval(mark, 40000);
}
let liveBeat = 0;
function stopUserCast() {
  const had = !!ucast; if (ucast) { ucast.close(); ucast = null; } ucastEv.length = 0; clearInterval(liveBeat);
  const u = Auth.user; if (had && u && u.kind === 'account' && Auth.mode === 'supabase' && Auth.client) Auth.client.from('ek_players').update({ live: null }).eq('id', u.id).then(() => {}, () => {});
}
function userCastPush() {
  if (!ucast || !st.snap || !(ucast.watchers > 0)) { ucastEv.length = 0; return; }
  ucastAcc++; if (ucastAcc < 7 && !ucastEv.length) return; ucastAcc = 0;
  ucast.send({ t: 's', s: specSafe(st.snap), e: ucastEv.splice(0, 30), names: st.names, teamNames: st.teamNames, teams: st.snap.teams, kind: ucast.meta.kind });
}
async function peekLive(uid) {
  if (Auth.mode !== 'supabase' || LOCALNET || !Auth.client) return null;
  const ch = new SpecChannel(Auth.client, 'u' + uid);
  try { await ch.open(() => {}); for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 500)); const h = ch.hostInfo(); if (h) return h; } return null; } catch (e) { return null; } finally { ch.close(); }
}
function watchUser(uid) { startSpectate('u' + uid, true); }
// what watchers get: the game, minus the play calls (routes, hot routes, play art) so nobody can scout a live game
function specSafe(s) { return s ? { ...s, opDef: null, hot: undefined } : s; }
function stopSpec() { if (spec) { spec.close(); spec = null; } if (liveLobby) { liveLobby.close(); liveLobby = null; } }
async function startSpectate(code, fromProfile) {
  sfx.init(); stopSpec(); onlineMsg('');
  const client = Auth.mode === 'supabase' && !LOCALNET ? Auth.client : null;
  $('#online-main').classList.add('hidden'); $('#online-wait').classList.remove('hidden');
  $('#room-code').textContent = code; $('#wait-label').textContent = 'Watching game'; $('#copy-code').classList.add('hidden');
  $('#wait-status').innerHTML = '<span class="spinner"></span>Looking for a live game…';
  const ch = spec = new SpecChannel(client, code);
  const give = setTimeout(() => { if (spec === ch && !st.playing) { stopSpec(); if (fromProfile) toast('Their game just ended.'); onlineMsg('No live game with that code right now. It might not have kicked off yet.', true); resetOnlineUI(); } }, 15000);
  try {
    await ch.open((m) => {
      if (spec !== ch || !m || m.t !== 's' || !m.s) return;
      st.specRx = performance.now();
      if (!st.playing) {
        clearTimeout(give); stopLobby();
        st.mode = 'spec'; st.local = 0; st.names = m.names || ['Home', 'Away']; st.teamNames = m.teamNames || null; st.ut = false; st.practice = null; st.drill = false; st.rec = []; st.replay = null;
        R.setTeams(m.teams); st.guestBuf = []; st.snap = null;
        $('#net-badge').textContent = m.kind ? `Spectating · ${m.kind}` : 'Spectating'; $('#net-badge').classList.remove('hidden');
        enterGame(); $('#hud').classList.add('spec'); $('#pause').classList.add('spec'); st.intro = 0;
        { const T = (m.teams || [0, 1]).map(i => TEAMS[i]), col = t => t.jersey === '#121a14' ? '#18c964' : t.jersey; const sv = $('#spec-vs');
          sv.innerHTML = `<span style="--c:${col(T[0])}"><i></i><b>${escapeHtml(st.names[0])}</b><small>${T[0].abbr}</small></span><em>vs</em><span style="--c:${col(T[1])}"><i></i><b>${escapeHtml(st.names[1])}</b><small>${T[1].abbr}</small></span>`; sv.classList.remove('hidden'); }
        toast(`Watching ${st.names[0]} vs ${st.names[1]}${m.kind ? ` (${m.kind})` : ''}. Press Esc to leave.`, 3500);
      }
      if (m.s && m.s.bench) st.bench = m.s.bench; st.guestBuf.push({ at: performance.now(), s: m.s }); if (st.guestBuf.length > 40) st.guestBuf.shift();
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
  st.game = createGame({ wind: SET.wind || 0, teams: [myTeam, gt], humans: [true, true], quarterLen: SET.qlen, difficulty: 1, rosters: [me.roster || null, them.roster || null], weather, tod, toss: true, cel: [SET.cel, +them.cel] });
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
  if (tossRx(m)) return;
  if (netPauseRx(m)) return;
  if (m.t === 'i') { st.remote.mx = +m.mx || 0; st.remote.mz = +m.mz || 0; st.remote.sprint = !!m.sp; }
  else if (m.t === 'chat') chatRx(m);
  else if (m.t === 'ev' && m.ev && typeof m.ev.t === 'string') { if (st.remote.ev.length < 50) st.remote.ev.push(m.ev); }
  else if (m.t === 'rematch') { toast(`${st.names[1] || 'Your opponent'} wants a rematch. Hit Rematch to run it back.`, 5000); sfx.play('ui'); }
  else if (m.t === 'bye') { st.peer && st.peer.handlers.close && st.peer.handlers.close('Opponent left'); }
}
function guestRx(m) {
  if (m.t === 'chat') { chatRx(m); return; }
  if (tossRx(m)) return;
  if (netPauseRx(m)) return;
  if (m.t === 'start') {
    stopLobby();
    st.mode = 'guest'; st.local = 1; st.names = m.names || st.names; st.teamNames = m.teamNames || null; st.ut = !!m.ut; st.practice = null; st.drill = false; st.rec = []; st.replay = null;
    R.setTeams(m.teams); st.guestBuf = []; st.snap = null;
    $('#net-badge').classList.remove('hidden');
    enterGame();
    $('#chat').classList.remove('hidden'); chatLine('sys', '', 'Press T to chat.');
  } else if (m.t === 's') {
    if (!st.playing) return;
    if (m.s && m.s.bench) st.bench = m.s.bench; st.guestBuf.push({ at: performance.now(), s: m.s });
    if (st.guestBuf.length > 40) st.guestBuf.shift();
    if (m.e) for (const e of m.e) { sfx.play(e); R.event(e); ucastEv.push(e); }
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
  R.userKit = SET.kit && SET.kit.on && st.mode !== 'spec' && st.mode !== 'clip' ? { jersey: SET.kit.jersey, trim: SET.kit.trim, num: SET.kit.num, pants: SET.kit.pants, helmet: SET.kit.helmet, pattern: SET.kit.pattern, patch: SET.kit.patch, visor: SET.kit.visor } : null;
  R.userSlot = st.local;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  watchFps(dt);
  if (st.playing) {
    if (st.replay) {
      R.ball.visible = true;   // clips opened from the menu start with the ball hidden; show it for playback
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
    } else if (st.np && st.mode === 'host' && performance.now() < st.np.until) {
      st.acc = 0;   // online pause: the game is frozen for both players
    } else if (st.game && !st.paused) {
      if (st.np && st.mode === 'host') endNetPause();   // 30 seconds are up
      st.acc = st.intro > 0 ? 0 : st.acc + dt;
      speedCheck(dt);
      let n = 0;
      while (st.acc >= DT && n < 6) {
        const mine = { ...moveVec(), sprint: sprinting(), ev: n === 0 ? evq : [] };
        const inputs = [{}, {}];
        inputs[st.local] = mine;
        if (st.mode === 'host') { inputs[1] = { mx: st.remote.mx, mz: st.remote.mz, sprint: st.remote.sprint, ev: n === 0 ? st.remote.ev : [] }; }
        step(st.game, DT, inputs);
        if (n === 0) { evq = []; st.remote.ev = []; }
        for (const e of drainEvents(st.game)) { sfx.play(e); R.event(e); if (TUT.on) tutEv(e); if (st.mode === 'host') st.netEv.push(e); ucastEv.push(e); }
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
      userCastPush();
      R.ball.visible = true;
      R.spectating = st.mode === 'spec'; R.specNames = st.mode === 'spec' ? st.names : null; R.camMode = SET[camKey()];
      R.update(st.snap, dt, st.mode === 'spec' ? -1 : st.local);   // spectators: no player rings, routes or kick aim
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
      // Film Room: when a dead ball ends, keep the play if it was a big one
      if (st.lastPh === 'dead' && st.snap.ph !== 'dead' && st.lastDead && filmOk()) filmCapture(st.rec, st.lastDead);
      if (st.snap.ph === 'dead') st.lastDead = st.snap; st.lastPh = st.snap.ph;
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
const CTX = { syncExtras, peekLive, watchUser, openTrade: (id, name) => { setTradeTarget(id, name); show('ut'); }, SET, leaveGame, refreshProfile, hostGame, joinGame, newCode: () => makeRoomCode(), zoomCam, st, cleanText, playClip, stopClip, profile, refreshChip, logoURL, teamOvr, $, $$, show, toast, sfx, Auth, TEAMS, seg, unlockAch, fillGrid, teamCard, wireTeamPick, openPicker, startCPU, DIFFICULTIES, QLENS, SET, saveSet, escapeHtml, screen: () => st.screen, customPlays, routeSvg, defSvg };
initMeta(CTX);
initCreator(CTX);
initSocial(CTX);
initAdmin();
initGamepad({ toast, zoomCam, context: padContext, cardNav, cardPickFocused, hotOpen: () => st.hot.open, onModeChange: (on) => { hudCache = {}; R.setBadgeLabels(on ? (() => { const g = glyphs(); return [g.A, g.B, g.X, g.Y, g.RB]; })() : ['1', '2', '3', '4', '5']); } });
Fr.initFranchise(CTX);
League.initLeague(CTX);
$('#ban-ok').addEventListener('click', () => $('#banned').classList.add('hidden'));
$('#ban-out').addEventListener('click', async () => { $('#banned').classList.add('hidden'); await Auth.signOut(); show('auth'); });

// test hooks (used by automated tests; harmless in production)
window.__ek = { st, startCPU, keys, pushEv, Auth, R, sfx, cam: null, keyToEvent, pickCard, playClip, show, profile, renderUT };
