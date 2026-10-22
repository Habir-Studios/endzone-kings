// ENDZONE KINGS — menus for progression and Ultimate Team (squad, packs, club, play), plus post-game rewards.
import { askYes } from './ui.js?v=1792638941';
import { Profile, rankInfo, xpFor, levelReward, challengeDef, nextReset, RANK_REWARD, ACH } from './profile.js?v=1792638941';
import * as UT from './ut.js?v=1792638941';
import { portraitURL } from './faces.js?v=1792638941';
import { TEAMS } from './teams.js?v=1792638941';

let C = null;          // shared helpers from main.js
let prof = null, profUser = null;
const fmt = n => Math.round(n).toLocaleString();
// rank emblems: a shield in the division's colors with one to three chevrons (III to I), Diamond gets a gem, Kings a crown
export function rankIcon(div, sub = 1, size = 22) {
  const c = (RANK_COL[div] || RANK_COL.Bronze), id = 'rg' + div + size;
  const grad = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>`;
  if (div === 'Kings') return `<svg class="rk-ic" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${grad}<path d="M4 24 2 9l8 6 6-10 6 10 8-6-2 15z" fill="url(#${id})" stroke="#2a1700" stroke-width="1.6" stroke-linejoin="round"/><rect x="4" y="24" width="24" height="5" rx="1.5" fill="url(#${id})" stroke="#2a1700" stroke-width="1.6"/><circle cx="16" cy="13" r="2" fill="#fff"/></svg>`;
  const n = Math.max(1, 4 - (sub || 1));   // III = 1 chevron, I = 3
  const chev = Array.from({ length: n }, (_, k) => `<path d="M10 ${11 + k * 5}l6 3.5 6-3.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const gem = div === 'Diamond' ? '<path d="M12 9h8l3 4-7 9-7-9z" fill="#fff" opacity=".9"/>' : chev;
  return `<svg class="rk-ic" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${grad}<path d="M16 2 28 6v10c0 7-5.5 12-12 14C9.5 28 4 23 4 16V6z" fill="url(#${id})" stroke="rgba(0,0,0,.55)" stroke-width="1.6" stroke-linejoin="round"/>${gem}</svg>`;
}
export const RANK_COL = { Bronze: ['#cd7f32', '#5a3412'], Silver: ['#c9d1dd', '#5d6675'], Gold: ['#f6c445', '#9a6400'], Platinum: ['#6ee7d8', '#1f6b66'], Diamond: ['#8ab4ff', '#2d3f9a'], Kings: ['#ffe28a', '#7a4a00'] };
export const WX_OPTS = [['clear', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog'], ['random', 'Random']];
export const WIND_OPTS = [[0, 'Calm'], [5, '5 mph'], [10, '10 mph'], [15, '15 mph'], [20, '20 mph'], [25, '25 mph']];
export const TOD_OPTS = [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night'], ['random', 'Random']];
export function pickWx(v) { return v === 'random' || !v ? ['clear', 'clear', 'clear', 'rain', 'snow', 'fog'][(Math.random() * 6) | 0] : v; }
export function pickTod(v) { return v === 'random' || !v ? ['day', 'dusk', 'night'][(Math.random() * 3) | 0] : v; }

export function profile() {
  const u = C.Auth.user; if (!u) return null;
  if (!prof || profUser !== u.id) {
    prof = new Profile(u.id); profUser = u.id;
    prof.onSave(p => { C.Auth.saveCloud(p); refreshChip(); liveOvr(); });
    const cloud = C.Auth.cloudProfile(); if (cloud && prof.adopt(cloud)) refreshChip();
    const me = prof;
    me.cloudReady = C.Auth.refreshCloud().then(cp => {
      if (!prof || prof !== me) return;
      if (cp && prof.adopt(cp)) { if (C.Auth._pendP) C.Auth._pendP = prof.p; refreshChip(); if (C.screen() === 'ut') renderUT(); if (C.screen() === 'progress') renderProgress(); }
      const pg = q => q ? (q.lvl || 1) * 1e7 + (q.xp || 0) * 10 + Math.min(9, q.games || 0) : -1;
      // the cloud copy was stamped the old way and can't be checked on other devices: re-stamp and re-upload a clean save
      if (cp && !prof.p.tampered && !prof.cloudOk(cp) && pg(prof.p) >= pg(cp)) prof.save();
      const x = C.syncExtras ? C.syncExtras() : {};
      // this device is further along than the cloud (or the cloud has nothing yet): upload it now
      if (!cp || !C.Auth._row || pg(prof.p) > pg(cp) || (cp.tampered && !prof.p.tampered) || (cp.tampered && prof.p.tampered && (prof.p.coins || 0) > (cp.coins || 0)) || Object.keys(x).length) C.Auth.saveCloud(prof.p, x);
    }).catch(() => {});
  }
  return prof;
}

export function initMeta(ctx) {
  C = ctx;
  setInterval(uploadClub, 8000);
  setInterval(checkSave, 1000);
  setInterval(() => { if (tdb() && tme()) settleTrades().then(n => { if (n && C.screen() === 'ut') renderUT(); }); if (C.screen() === 'ut' && utTab === 'trade') loadTrades(true); }, 15000);
  const { $, $$ } = C;
  $$('#ut .ut-tab[data-ut]').forEach(b => b.addEventListener('click', () => { C.sfx.play('ui'); utTab = b.dataset.ut; renderUT(); }));
  $('#ut-begin').addEventListener('click', () => {
    const P = profile(); if (!P || utStartTeam < 0) return;
    P.p.ut.name = ($('#ut-name').value || '').replace(/[<>]/g, '').trim().slice(0, 18) || `${C.Auth.user.name}'s Squad`;
    P.startUT(utStartTeam);
    C.toast('Club created. Your free Silver Pack is waiting in Packs.');
    utTab = 'packs'; renderUT();
  });
  $('#po-all').addEventListener('click', () => $$('.flip:not(.open)', $('#po-cards')).forEach((f, i) => setTimeout(() => f.click(), i * 160)));
  $('#po-done').addEventListener('click', () => { $('#packopen').classList.add('hidden'); renderUT(); });
  $('#carddlg').addEventListener('click', e => { if (e.target.id === 'carddlg') closeDlg(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#carddlg').classList.contains('hidden')) closeDlg(); } });
}

// squad overall updates the moment your lineup changes (new card, training, X-Factor, swaps), no screen reload needed
function liveOvr() {
  const box = C && C.$ && C.$('#ut-pane .sq-ovr'); if (!box || !prof) return;
  const o = UT.squadOvr(prof.p.ut), b = box.querySelectorAll('b');
  [o.ovr, o.off, o.def].forEach((v, i) => { if (b[i] && b[i].textContent !== String(v)) { b[i].textContent = v; b[i].classList.remove('ovr-pop'); void b[i].offsetWidth; b[i].classList.add('ovr-pop'); } });
}
// pull your account from the cloud every ~15s so a change on another device (coins, cards, squad, Franchise, Season,
// settings, custom plays) shows up here without reopening the game. Never mid-game.
let pulling = false;
export async function pullCloud() {
  if (pulling || !prof || !C.Auth.user || C.Auth.user.kind !== 'account' || C.st.playing || C.screen() === 'game') return;
  pulling = true;
  try {
    const cp = await C.Auth.refreshCloud();
    let changed = false;
    if (cp && prof.adopt(cp)) { changed = true; if (C.Auth._pendP) C.Auth._pendP = prof.p; }
    if (C.syncExtras) C.syncExtras();
    if (changed) { refreshChip(); liveOvr(); if (C.screen() === 'ut') renderUT(); if (C.screen() === 'progress') renderProgress(); }
  } catch (_) {} finally { pulling = false; }
}
let lastStamp = null, owed = false, checking = false;
async function checkSave() {
  const A = C.Auth; if (checking || A.mode !== 'supabase' || !A.user || A.user.kind !== 'account' || !prof) return;
  if (C.st.playing || C.screen() === 'game') return;   // never touch a device that's mid-game: it catches up after
  if (owed) { owed = false; return pullCloud(); }
  checking = true;
  try {
    const { data } = await A.client.from('ek_saves').select('updated_at').eq('id', A.user.id).maybeSingle();
    const st = data && data.updated_at;
    if (st && st !== lastStamp) { const first = lastStamp === null; lastStamp = st; if (!first) await pullCloud(); }
  } catch (_) {} finally { checking = false; }
}
export function refreshChip() {
  const P = profile(); if (!P) return;
  const { $ } = C, r = P.rank, col = RANK_COL[r.div];
  $('#pc-lvl').innerHTML = `<small>LV</small><b>${P.p.lvl}</b>`; $('#pc-lvl').title = `Level ${P.p.lvl}`;
  $('#pc-rank').innerHTML = `${rankIcon(r.div, r.sub, 22)}<span>${r.name}</span>`; $('#pc-rank').style.setProperty('--rk', col[0]);
  $('#pc-coins').textContent = fmt(P.p.coins);
  const U = P.p.ut;
  $('#tile-ut-sub').textContent = U.started ? `${U.name}, ${UT.squadOvr(U).ovr} OVR, ${U.cards.length} players` : 'Open packs, build a squad, play for coins';
  const claim = [...P.p.daily.list, ...P.p.weekly.list].filter(c => c.done && !c.claimed).length;
  $('#tile-prog-sub').textContent = claim ? `${claim} reward${claim > 1 ? 's' : ''} ready to claim` : `Level ${P.p.lvl}, ${r.name}`;
}

// ---------------- cards ----------------
const TOP3 = { TE: ['hands', 'blk', 'spd'], QB: ['acc', 'arm', 'spd'], HB: ['spd', 'elu', 'hands'], WR: ['spd', 'hands', 'elu'], OL: ['blk', 'tkl', 'spd'], DL: ['rush', 'tkl', 'spd'], LB: ['tkl', 'spd', 'cov'], CB: ['cov', 'spd', 'hands'], S: ['cov', 'tkl', 'spd'] };
const SHORT = { spd: 'SPD', hands: 'HND', acc: 'ACC', arm: 'ARM', elu: 'ELU', blk: 'BLK', rush: 'RSH', tkl: 'TKL', cov: 'COV' };
export function cardHTML(c, o = {}) {
  const t = TEAMS[c.team];
  const tag = o.tag || 'div';
  return `<${tag} class="ucard ${c.tierKey}${o.mini ? ' mini' : ''}${o.inLu ? ' in-lu' : ''}" ${c.u ? `data-u="${c.u}"` : ''} ${tag === 'button' ? 'type="button"' : ''} title="${c.first} ${c.last}, ${c.ovr} ${c.pos}, ${t.city}">
    <span class="uc-ovr">${c.ovr}</span><span class="uc-pos">${c.pos}</span>
    <span class="uc-team" style="--tc:${t.jersey}">${C.logoURL ? `<img src="${C.logoURL(c.team, 48)}" alt="">` : ''}<i>${t.abbr}</i></span>${c.b ? `<span class="uc-boost">+${c.b}</span>` : ''}
    <img class="uc-img" alt="" src="${portraitURL(c.face, t.jersey, t.trim, 128)}">
    <span class="uc-name"><small>${C.escapeHtml(c.first)}</small><b>${C.escapeHtml(c.last)}</b></span>
    <span class="uc-stats">${TOP3[c.group].map(k => `<span>${c[k]}<small>${SHORT[k]}</small></span>`).join('')}</span>
    ${c.xf ? `<span class="uc-xf" title="X-Factor: ${c.xf}">X</span>` : ''}${c.ab ? `<span class="uc-ab" title="${c.ab.n}: ${c.ab.d}">★</span>` : ''}
    <span class="uc-prog">${c.program || c.tierName}</span></${tag}>`;
}

// ---------------- Ultimate Team ----------------
let utRival = true, utTab = 'squad', utStartTeam = -1, clubFilter = { g: 'all', sort: 'ovr' }, utOpp = 15, utWx = 'random', utTod = 'random';
export function renderUT() {
  const P = profile(); if (!P) return;
  const { $, $$ } = C, U = P.p.ut;
  $('#ut-coins').textContent = fmt(P.p.coins); { const t = document.getElementById('ut-tp'); if (t) t.textContent = fmt(P.p.tp || 0); }
  $('#ut-start').classList.toggle('hidden', U.started);
  $('#ut-main').classList.toggle('hidden', !U.started);
  if (!U.started) {
    C.fillGrid($('#ut-start-grid'), utStartTeam, -1, ti => { utStartTeam = ti; $('#ut-begin').disabled = false; });
    $('#ut-begin').disabled = utStartTeam < 0;
    return;
  }
  const np = Object.values(P.p.packs).reduce((a, b) => a + b, 0);
  $('#ut-packs-n').textContent = np; $('#ut-packs-n').classList.toggle('hidden', !np);
  const VIEWS = { trade: renderTrade, squad: renderSquad, packs: renderPacks, club: renderClub, play: renderPlay, solos: renderSolos, pass: renderPass, market: renderMarket, sets: renderSets };
  if (!VIEWS[utTab]) utTab = 'squad';
  $$('#ut .ut-tab[data-ut]').forEach(b => b.classList.toggle('on', b.dataset.ut === utTab));
  const fpN = P.fpTier - P.p.fp.got.filter(t => t <= P.fpTier).length;
  $('#ut-fp-n').textContent = fpN; $('#ut-fp-n').classList.toggle('hidden', fpN <= 0);
  const settled = P.marketSettle();
  for (const l of settled) C.toast(l.sold ? `${UT.card(l.id).last} sold on the market: +${fmt(l.net)} coins` : `${UT.card(l.id).last} didn't sell and is back in your club`, 3500);
  if (settled.length) $('#ut-coins').textContent = fmt(P.p.coins);
  VIEWS[utTab](P);
}

function renderSquad(P) {
  const U = P.p.ut, L = UT.lineupCards(U), o = UT.squadOvr(U), t = TEAMS[U.club];
  const slot = s => `<div class="slot" data-slot="${s}"><small>${UT.SLOT_LABEL[s]}</small>${L[s] ? cardHTML(L[s], { mini: true, tag: 'button' }) : `<button class="ucard mini empty" type="button">Add ${UT.SLOT_LABEL[s]}</button>`}</div>`;
  const row = (ss) => `<div class="pitch-row">${ss.map(slot).join('')}</div>`;
  const pane = C.$('#ut-pane');
  pane.innerHTML = `<div class="squad-head"><div><h3>${C.escapeHtml(U.name)}</h3><p class="note">Wearing ${t.city} colors. Click a player to swap him out.</p></div>
    <div class="sq-ovr"><div><b>${o.ovr}</b><small>OVR</small></div><div><b>${o.off}</b><small>OFF</small></div><div><b>${o.def}</b><small>DEF</small></div></div>
    <div class="cr-btns"><button class="btn sm" id="sq-auto">Best lineup</button><button class="btn sm" id="sq-uni">Change uniform</button></div></div>
    ${(() => { const ch = UT.chemistry(U); return `<div class="chem"><b>Chemistry +${ch.total}</b>${ch.groups.length ? ch.groups.map(g => `<span style="--c:${TEAMS[g.team].jersey}"><img alt="" src="${C.logoURL ? C.logoURL(g.team, 32) : ''}">${TEAMS[g.team].abbr} ×${g.n} · +${g.bonus} ratings</span>`).join('') : '<span class="note">Start 3+ players from the same team to boost them (+1 at 3, +2 at 5, +3 at 7). Your club\u2019s team counts one extra.</span>'}</div>`; })()}
    <div class="pitch">
      <div class="pitch-label">Offense</div>${row(['WR1', 'LT', 'LG', 'C', 'RG', 'RT', 'TE', 'WR2'])}${row(['WR3', 'QB', 'RB'])}
      <div class="pitch-label">Defense</div>${row(['DL1', 'DL4', 'DL2', 'DL3'])}${row(['LB2', 'LB', 'LB3'])}${row(['CB1', 'S', 'SS', 'CB2'])}
    </div>`;
  C.$$('.slot', pane).forEach(el => el.querySelector('button').addEventListener('click', () => { C.sfx.play('ui'); pickForSlot(el.dataset.slot); }));
  C.$('#sq-auto').onclick = () => { U.lineup = UT.autoLineup(U.cards); P.save(); C.toast('Best players moved into your lineup'); renderUT(); };
  C.$('#sq-uni').onclick = () => C.openPicker('Choose your uniform', U.club, -1, ti => { U.club = ti; P.save(); renderUT(); });
}

function openDlg(html) { const d = C.$('#carddlg'); C.$('#cd-panel').innerHTML = html; d.classList.remove('hidden'); return C.$('#cd-panel'); }
function closeDlg() { C.$('#carddlg').classList.add('hidden'); }

function pickForSlot(slot) {
  const P = profile(), U = P.p.ut, g = UT.SLOT_GROUP[slot];
  const cur = U.lineup[slot];
  const list = U.cards.map(UT.owned).filter(c => c.group === g).sort((a, b) => b.ovr - a.ovr);
  const el = openDlg(`<div style="grid-column:1/-1"><div class="pk-head"><h2 class="title sm">Pick your ${UT.SLOT_LABEL[slot]}</h2><button class="btn ghost sm" id="dlg-x">Close</button></div>
    <div class="pick-list">${list.map(c => cardHTML(c, { mini: true, tag: 'button', inLu: c.u !== cur && P.inLineup(c.u) })).join('') || '<p class="note">You have no players for this spot yet. Open some packs.</p>'}</div></div>`);
  C.$('#dlg-x', el).onclick = closeDlg;
  C.$$('.ucard', el).forEach(b => b.onclick = () => { P.setSlot(slot, +b.dataset.u); closeDlg(); C.sfx.play('ui'); renderUT(); });
}

function cardDetail(u) {
  const P = profile(), U = P.p.ut, inst = U.cards.find(c => c.u === u); if (!inst) return;
  const c = UT.owned(inst), t = TEAMS[c.team];
  const qs = UT.quicksell(inst), qtp = UT.quicksellTp(inst), tc = UT.trainCost(inst), inLu = P.inLineup(u);
  const abs = UT.ABILITIES[c.group] || [], abCost = UT.TP_ABILITY[c.tier], canXf = c.tier >= 4 || inst.x === 'legend';
  const abHTML = c.tier < 2 ? '<p class="note">Abilities unlock on Gold cards and up.</p>'
    : `<div class="cd-abs"><b>Ability</b>${abs.map(a => `<button class="btn sm ${inst.ab === a.k ? 'primary' : ''}" data-ab="${a.k}" ${inst.ab === a.k ? 'disabled' : ''}>${a.n} (${a.d})${inst.ab === a.k ? ' ✓' : ` · ${abCost} TP`}</button>`).join('')}
      ${canXf ? `<b>X-Factor</b><button class="btn sm ${inst.xf ? 'primary' : ''}" id="cd-xf" ${inst.xf ? 'disabled' : ''}>${UT.XFACTORS[c.group]} (+3 to key ratings)${inst.xf ? ' ✓' : ` · ${UT.TP_XFACTOR} TP`}</button>` : ''}</div>`;
  const rate = k => `<div class="cd-rate"><span>${UT.RATING_NAMES[k]}</span><b>${c[k]}</b><i style="--v:${c[k]}%;--bar:${c[k] >= 85 ? 'var(--go)' : c[k] >= 70 ? '#ffb020' : '#ff8b97'}"></i></div>`;
  const slots = UT.GROUPS[c.group];
  const el = openDlg(`${cardHTML(c)}<div class="cd-info"><h3>${C.escapeHtml(c.first)} ${C.escapeHtml(c.last)}</h3>
    <p class="note">${c.tierName} ${c.pos}${c.program ? `, ${c.program}` : ''}. #${c.num}. Card art in ${t.city} colors. Trained ${c.b} of ${UT.MAX_BOOST[c.tier]} times.</p>
    <div class="cd-rates">${['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'].map(rate).join('')}</div>
    ${abHTML}
    <div class="cd-acts">
      ${slots.map(s => `<button class="btn${U.lineup[s] === u ? ' primary' : ''}" data-slot="${s}" ${U.lineup[s] === u ? 'disabled' : ''}>${U.lineup[s] === u ? 'Starting at' : 'Start at'} ${UT.SLOT_LABEL[s]}${slots.length > 1 ? ' ' + (slots.indexOf(s) + 1) : ''}</button>`).join('')}
      <button class="btn" id="cd-train" ${tc ? '' : 'disabled'}>${tc ? `Train +1 OVR (${fmt(tc)} TP, you have ${fmt(P.p.tp || 0)})` : 'Fully trained'}</button>
      <button class="btn danger" id="cd-sell" ${inLu ? 'disabled' : ''}>${inLu ? 'Can’t quicksell a starter' : `Quicksell for ${fmt(qs)} coins + ${qtp} TP`}</button>${inLu ? '<small class="cd-why">He’s in your starting lineup. Swap him out of your squad first, then you can quicksell him.</small>' : ''}
      <button class="btn ghost" id="cd-x">Close</button>
    </div></div>`);
  C.$$('[data-slot]', el).forEach(b => b.onclick = () => { P.setSlot(b.dataset.slot, u); C.toast(`${c.last} is starting at ${UT.SLOT_LABEL[b.dataset.slot]}`); cardDetail(u); renderUT(); });
  C.$$('[data-ab]', el).forEach(b => b.onclick = async () => { const a = UT.abilityOf(c.group, b.dataset.ab); if (inst.ab && !(await askYes(`Swap ${inst.ab ? UT.abilityOf(c.group, inst.ab).n : ''} for ${a.n}? This costs ${abCost} TP.`, 'Swap'))) return; const err = P.unlockAbility(u, b.dataset.ab); if (err) C.toast(err); else { C.sfx.play('firstdown'); C.toast(`${c.last} unlocked ${a.n}`); } cardDetail(u); renderUT(); });
  { const xb = C.$('#cd-xf', el); if (xb) xb.onclick = () => { const err = P.unlockXFactor(u); if (err) C.toast(err); else { C.sfx.play('td'); C.toast(`X-Factor unlocked: ${UT.XFACTORS[c.group]}!`); } cardDetail(u); renderUT(); }; }
  C.$('#cd-train', el).onclick = () => { const err = P.train(u, tc); if (err) C.toast(err); else { C.sfx.play('firstdown'); C.toast(`${c.last} trained to ${c.ovr + 1} OVR`); } cardDetail(u); renderUT(); };
  C.$('#cd-sell', el).onclick = async () => {
    if (c.tier >= 3 && !(await askYes(`Quicksell ${c.first} ${c.last} (${c.ovr} ${c.tierName}) for ${fmt(qs)} coins?`, 'Quicksell'))) return;
    if (P.sell(u, qs, qtp)) { C.sfx.play('ui'); C.toast(`Sold ${c.last} for ${fmt(qs)} coins and ${qtp} TP`); closeDlg(); renderUT(); }
  };
  C.$('#cd-x', el).onclick = closeDlg;
}

function renderClub(P) {
  const U = P.p.ut, pane = C.$('#ut-pane');
  let list = U.cards.map(UT.owned);
  if (clubFilter.g !== 'all') list = list.filter(c => c.group === clubFilter.g);
  const sorters = { ovr: (a, b) => b.ovr - a.ovr || b.tier - a.tier, new: (a, b) => b.u - a.u, tier: (a, b) => b.tier - a.tier || b.ovr - a.ovr, pos: (a, b) => UT.SLOTS.indexOf(UT.GROUPS[a.group][0]) - UT.SLOTS.indexOf(UT.GROUPS[b.group][0]) || b.ovr - a.ovr };
  list.sort(sorters[clubFilter.sort]);
  const dupes = U.cards.filter(c => !P.inLineup(c.u) && UT.card(c.id).tier === 0 && !c.b);
  pane.innerHTML = `<div class="squad-head"><div><h3>Club</h3><p class="note">${U.cards.length} of ${UT.CLUB_CAP} players. Click a player to train, start or quicksell him.</p></div>
    <button class="btn sm danger" id="club-sellb" ${dupes.length ? '' : 'disabled'}>Quicksell spare bronzes (${dupes.length})</button></div>
    <div class="pk-filters"><div class="seg" id="club-g"></div><select id="club-sort" aria-label="Sort players"><option value="ovr">Best first</option><option value="new">Newest first</option><option value="tier">By card tier</option><option value="pos">By position</option></select></div>
    <div class="club-grid">${list.map(c => cardHTML(c, { mini: true, tag: 'button', inLu: P.inLineup(c.u) })).join('') || '<p class="note">No players here.</p>'}</div>`;
  C.seg(C.$('#club-g'), [['all', 'All'], ...Object.keys(UT.GROUPS).map(g => [g, g])], clubFilter.g, v => { clubFilter.g = v; renderUT(); });
  const so = C.$('#club-sort'); so.value = clubFilter.sort; so.onchange = () => { clubFilter.sort = so.value; renderUT(); };
  C.$$('.club-grid .ucard', pane).forEach(b => b.onclick = () => { C.sfx.play('ui'); cardDetail(+b.dataset.u); });
  C.$('#club-sellb').onclick = async () => {
    const tot = dupes.reduce((s, i) => s + UT.quicksell(i), 0);
    if (!(await askYes(`Quicksell ${dupes.length} bronze players who aren't in your lineup for ${fmt(tot)} coins?`, 'Quicksell'))) return;
    for (const d of dupes) P.sell(d.u, UT.quicksell(d), UT.quicksellTp(d));
    C.toast(`Sold ${dupes.length} players for ${fmt(tot)} coins`); renderUT();
  };
}

function renderPacks(P) {
  const pane = C.$('#ut-pane');
  const mine = UT.PACKS.filter(k => P.p.packs[k.key] > 0);
  const art = k => `<div class="pack-art"><i class="pa-tear"></i><span class="pa-brand">Endzone Kings</span><strong>${(k.art || [k.name])[0]}</strong><strong class="pa-2">${(k.art || [])[1] || ''}</strong><span class="pa-stars">${'★'.repeat(k.stars || 1)}</span><span class="pa-n">${k.n} players</span></div>`;
  pane.innerHTML = `${mine.length ? `<h3 class="store-h">My packs</h3><div class="store">${mine.map(k => `<div class="pack ${k.key}"><span class="own">x${P.p.packs[k.key]}</span>${art(k)}<b>${k.name}</b><small>${k.blurb}</small><button class="btn primary" data-open="${k.key}">Open</button></div>`).join('')}</div>` : ''}
    <h3 class="store-h">Store</h3><p class="note">Paid for with coins you earn by playing. No real money, ever.</p>
    <div class="store">${UT.PACKS.map(k => { const tp = !!k.tpCost, cost = tp ? k.tpCost : k.cost, have = tp ? (P.p.tp || 0) : P.p.coins, ic = tp ? '<i class="tp-ic">TP</i>' : '<i class="coin"></i>';
      return `<div class="pack ${k.key}">${art(k)}<b>${k.name}</b><small>${k.blurb}</small><button class="btn" data-buy="${k.key}" data-n="1" ${have < cost ? 'disabled' : ''}>${ic} ${fmt(cost)}</button><div class="pk-multi">${[5, 10].map(n => `<button class="btn sm" data-buy="${k.key}" data-n="${n}" ${have < cost * n ? 'disabled' : ''} title="Buy ${n} for ${fmt(cost * n)}"><span>Buy ${n}</span>${ic}<span>${fmt(cost * n)}</span></button>`).join('')}</div></div>`; }).join('')}</div>`;
  // buy 1, 5 or 10 at once: they all go to My packs
  C.$$('[data-buy]', pane).forEach(b => b.onclick = async () => {
    const k = UT.packByKey(b.dataset.buy), n = +b.dataset.n || 1;
    if (n > 1 && !(await askYes(`Buy ${n} ${k.name}s for ${fmt((k.tpCost || k.cost) * n)} ${k.tpCost ? 'Training Points' : 'coins'}?`, `Buy ${n}`))) return;
    let got = 0, err = null; for (let i = 0; i < n; i++) { err = P.buyPack(k.key); if (err) break; got++; }
    if (!got) return C.toast(err);
    C.sfx.play('ui'); C.toast(got === 1 ? `${k.name} added to My packs. Open it whenever, or trade it` : `${got} ${k.name}s added to My packs${err ? ` (${err})` : ''}`, 3000); renderUT();
  });
  C.$$('[data-open]', pane).forEach(b => b.onclick = () => openPack(b.dataset.open));
}

const BACK_SVG = '<svg viewBox="0 0 64 48"><path d="M6 40 12 10l12 14L32 4l8 20 12-14 6 30z" fill="#ff3347"/></svg>';
function openPack(k) {
  const P = profile(); const ids = UT.rollPack(k);
  const added = P.openPack(k, ids);
  if (!Array.isArray(added)) { C.toast(added); renderUT(); return; }
  const { $ } = C;
  $('#po-title').textContent = UT.packByKey(k).name;
  if (ids.tp) setTimeout(() => C.toast(`Supernova fizzled: +${ids.tp} Training Points`, 2600), 900);
  else if (k === 'supernova') setTimeout(() => C.toast('SUPERNOVA! 3 Elite players!', 3000), 900);
  const box = $('#po-cards');
  box.innerHTML = added.map(inst => { const c = UT.owned(inst); return `<button class="flip" data-tier="${c.tier}" type="button" aria-label="Reveal player"><div class="back">${BACK_SVG}</div>${cardHTML(c)}</button>`; }).join('');
  $('#po-done').classList.add('hidden'); $('#po-all').classList.remove('hidden');
  const flips = C.$$('.flip', box);
  flips.forEach(f => f.addEventListener('click', () => {
    if (f.classList.contains('open')) return;
    f.classList.add('open');
    const t = +f.dataset.tier;
    if (t >= 2) f.classList.add('glow-' + ['', '', 'gold', 'elite', 'kings'][t]);
    C.sfx.play(t >= 3 ? 'td' : t === 2 ? 'firstdown' : 'ui');
    if (t >= 4) C.sfx.airHorn && C.sfx.airHorn();
    if (flips.every(x => x.classList.contains('open'))) { $('#po-done').classList.remove('hidden'); $('#po-all').classList.add('hidden'); }
  }));
  $('#packopen').classList.remove('hidden');
  C.sfx.play('whistle');
  setTimeout(packAchToast, 1500);
}

let utMode = 'pick';
function renderPlay(P) {
  const V = { pick: renderPlayPick, solo: renderPlaySolo, cpu: renderPlayCpu, battles: renderBattles, theme: renderTheme };
  (V[utMode] || renderPlayPick)(P);
  C.$$('[data-utm]', C.$('#ut-pane')).forEach(b => b.onclick = () => { C.sfx.play('ui'); if (b.dataset.utm === 'solos') { utTab = 'solos'; utMode = 'solo'; } else utMode = b.dataset.utm; renderUT(); });
}
// first choice: against the CPU or against real people
function renderPlayPick(P) {
  const U = P.p.ut, o = UT.squadOvr(U);
  C.$('#ut-pane').innerHTML = `<div class="squad-head"><div><h3>Play</h3><p class="note">${C.escapeHtml(U.name)}, ${o.ovr} OVR. Pick how you want to play.</p></div></div>
    <div class="utp-pick">
      <button class="utp-mode" type="button" data-utm="solo"><b>Single Player</b><span>Play your squad against CPU teams. Solo Battles, theme challenges and solo challenges pay coins, Training Points, player items and program XP. Field Pass and daily challenges count too.</span><em>No pressure, no record on the line</em></button>
      <button class="utp-mode utp-h2h" type="button" id="utp-h2h"><b>Online H2H</b><span>Play your squad against a real person: host a game, join with a code or pick one from the public lobby.</span><em>Counts toward your Online H2H record</em></button>
    </div>`;
  C.$('#utp-h2h').onclick = () => {
    C.sfx.play('ui'); if (!o.full) return C.toast('Fill every lineup spot first');
    C.show('online'); const cb = document.getElementById('use-ut'); if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    C.toast(`${U.name} is loaded. Host, join or pick a game from the lobby.`, 3500);
  };
}
function renderPlaySolo(P) {
  const U = P.p.ut, B = U.sb || { pts: 0, g: 0 }, T = UT.theme(), G = U.prog || { done: [], xp: 0 };
  const soloLeft = UT.SOLOS.filter(x => !P.soloDone(x.k)).length;
  C.$('#ut-pane').innerHTML = `<div class="squad-head"><div><button class="link utp-back" type="button" data-utm="pick">◀ Play</button><h3>Single Player</h3><p class="note">Every game here pays Ultimate Team coins and Training Points, and counts for the Field Pass and daily challenges.</p></div></div>
    <div class="utp-pick four">
      <button class="utp-mode" type="button" data-utm="battles"><b>Solo Battles</b><span>Weekly ranked games against CPU squads. Harder difficulty, more points. Weekly rewards by tier.</span><em>${fmt(B.pts)} pts · ${UT.sbTier(B.pts).n} · ${UT.SB_GAMES - B.g} games left</em></button>
      <button class="utp-mode" type="button" data-utm="theme"><b>${C.escapeHtml(T.name)}</b><span>This month’s theme challenges: ${C.escapeHtml(T.blurb.toLowerCase())}. Theme challenges and Solo Battles earn program XP for special player items.</span><em>${G.done.length}/${T.ch.length} beaten · ${fmt(G.xp)} program XP</em></button>
      <button class="utp-mode" type="button" data-utm="solos"><b>Solo Challenges</b><span>One-game goals that reset every Monday.</span><em>${soloLeft} left this week</em></button>
      <button class="utp-mode" type="button" data-utm="cpu"><b>Quick CPU Game</b><span>Pick any opponent, difficulty, weather and quarter length.</span><em>Coins and Training Points every game</em></button>
    </div>`;
}
let sbDiff = 1;
function renderBattles(P) {
  const U = P.p.ut, B = U.sb, o = UT.squadOvr(U), tier = UT.sbTier(B.pts), next = UT.SB_TIERS.find(t => t.pts > B.pts);
  const opp = (hashS(B.w + ':' + B.g) % TEAMS.length) === U.club ? (U.club + 3) % TEAMS.length : hashS(B.w + ':' + B.g) % TEAMS.length;
  const lvl = Math.max(58, Math.min(98, UT.rivalLevel(U) + UT.SB_LEVEL[sbDiff])), left = UT.SB_GAMES - B.g;
  const pct = next ? Math.round((B.pts - tier.pts) / (next.pts - tier.pts) * 100) : 100;
  const giveTxt = g => [g.coins ? `${fmt(g.coins)} coins` : '', g.tp ? `${g.tp} TP` : '', g.pack ? UT.packByKey(g.pack).name : '', g.player ? 'a Kings player item' : ''].filter(Boolean).join(', ');
  C.$('#ut-pane').innerHTML = `<div class="squad-head"><div><button class="link utp-back" type="button" data-utm="solo">◀ Single Player</button><h3>Solo Battles</h3><p class="note">${UT.SB_GAMES} ranked games a week against CPU squads. A win is worth ${UT.SB_WIN.map((v, i) => `${v} on ${C.DIFFICULTIES[i]}`).join(', ')} (plus a bonus for the margin); a loss is still ${UT.SB_LOSS}. Rewards for your tier land when the week ends on Monday.</p></div></div>
    <div class="sb-box">
      <div class="sb-top"><div><small>This week</small><b>${fmt(B.pts)} pts</b></div><div><small>Record</small><b>${B.wins}-${B.l}</b></div><div><small>Tier</small><b>${tier.n}</b></div><div><small>Games left</small><b>${left}</b></div></div>
      <div class="sb-bar"><i style="width:${pct}%"></i></div><p class="note">${next ? `${fmt(next.pts - B.pts)} points to ${next.n}` : 'Top tier reached. Keep stacking points.'}</p>
      <div class="sb-tiers">${UT.SB_TIERS.map(t => `<div class="${t === tier ? 'on' : ''}"><b>${t.n}</b><small>${fmt(t.pts)}+ pts</small><span>${giveTxt(t.give)}</span></div>`).join('')}</div>
    </div>
    <div class="sb-next"><img src="${C.logoURL ? C.logoURL(opp, 64) : ''}" alt=""><div><small>Next opponent</small><b>${TEAMS[opp].city} CPU squad</b><span>${lvl} OVR</span></div></div>
    <label class="mini">Difficulty<div class="seg" id="sb-diff"></div></label>
    <div class="actions"><button class="btn primary big" id="sb-go" ${o.full && left > 0 ? '' : 'disabled'}>${left <= 0 ? 'All games played this week' : o.full ? 'Play battle' : 'Fill every lineup spot first'}</button></div>`;
  C.seg(C.$('#sb-diff'), C.DIFFICULTIES.map((n, i) => [i, n]), sbDiff, v => { sbDiff = v; renderBattles(P); });
  C.$('#sb-go').onclick = () => {
    const roster = UT.squadRoster(U); if (!roster) return C.toast('Fill every lineup spot first');
    C.startCPU({ teams: [U.club, opp], rosters: [roster, UT.rivalRoster(lvl, hashS(B.w + 'sb' + B.g))], ut: true, battle: sbDiff, diff: sbDiff, teamNames: [U.name, `${TEAMS[opp].city} AI`] });
  };
}
function renderTheme(P) {
  const U = P.p.ut, T = UT.theme(), G = U.prog, o = UT.squadOvr(U), base = UT.rivalLevel(U);
  const end = new Date(); end.setMonth(end.getMonth() + 1, 1); end.setHours(0, 0, 0, 0); const days = Math.max(1, Math.ceil((end - Date.now()) / 864e5));
  const max = UT.PROG_STEPS[UT.PROG_STEPS.length - 1].xp;
  C.$('#ut-pane').innerHTML = `<div class="squad-head"><div><button class="link utp-back" type="button" data-utm="solo">◀ Single Player</button><h3>${C.escapeHtml(T.name)}</h3><p class="note">${C.escapeHtml(T.blurb)}. Beat each challenge once for coins, Training Points and program XP. Every Solo Battle adds program XP too. The program ends in ${days} day${days > 1 ? 's' : ''}.</p></div></div>
    <div class="sb-box"><div class="sb-top"><div><small>Program XP</small><b>${fmt(G.xp)}</b></div><div><small>Beaten</small><b>${G.done.length}/${T.ch.length}</b></div></div>
      <div class="sb-bar"><i style="width:${Math.min(100, G.xp / max * 100)}%"></i></div>
      <div class="sb-tiers">${UT.PROG_STEPS.map((st, i) => `<div class="${G.got.includes(i) ? 'on' : ''}"><b>${fmt(st.xp)} XP</b><span>${st.label}${G.got.includes(i) ? ' ✓' : ''}</span></div>`).join('')}</div></div>
    <div class="solo-list">${T.ch.map(x => { const fin = G.done.includes(x.k), t = TEAMS[x.opp === U.club ? (x.opp + 1) % TEAMS.length : x.opp];
      return `<div class="solo ${fin ? 'done' : ''}"><img src="${C.logoURL ? C.logoURL(TEAMS.indexOf(t), 64) : ''}" alt=""><div class="solo-txt"><b>${C.escapeHtml(x.n)}</b><small>${x.d}. vs ${t.city} (${Math.min(99, base + x.lv)} OVR, ${C.DIFFICULTIES[x.diff]})</small><small class="rw">${rewardText(x.give)}, ${x.give.tp} TP, ${fmt(x.give.px)} program XP</small></div>
      <button class="btn ${fin ? '' : 'primary'}" data-th="${x.k}" ${fin || !o.full ? 'disabled' : ''}>${fin ? 'Done' : o.full ? 'Play' : 'Fill your lineup'}</button></div>`; }).join('')}</div>`;
  C.$$('[data-th]', C.$('#ut-pane')).forEach(b => b.onclick = () => {
    const x = T.ch.find(c => c.k === b.dataset.th), roster = UT.squadRoster(U); if (!roster) return C.toast('Fill every lineup spot first');
    const opp = x.opp === U.club ? (x.opp + 1) % TEAMS.length : x.opp;
    C.startCPU({ teams: [U.club, opp], rosters: [roster, UT.rivalRoster(Math.min(99, base + x.lv), hashS(T.key + x.k))], ut: true, theme: x.k, diff: x.diff, teamNames: [U.name, `${x.n}`] });
  });
}
const hashS = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function renderPlayCpu(P) {
  const U = P.p.ut, pane = C.$('#ut-pane'), o = UT.squadOvr(U);
  if (utOpp === U.club) utOpp = (U.club + 1) % TEAMS.length;
  pane.innerHTML = `<div class="squad-head"><div><button class="link utp-back" type="button" data-utm="solo">◀ Single Player</button><h3>Play a CPU game</h3><p class="note">Take ${C.escapeHtml(U.name)} (${o.ovr} OVR) against a CPU team. Ultimate Team games pay 20% more coins, and harder difficulties pay more still.</p></div></div>
    <div class="play-ut">
      <div class="team-pick" id="utp-opp"><small>Opponent</small><div class="team-card" tabindex="0"></div><div class="arrows"><button class="btn sm" data-d="-1" aria-label="Previous team">◀</button><button class="btn sm" data-d="1" aria-label="Next team">▶</button></div></div>
      <div class="form">
        <label>Opponent squad<div class="seg" id="utp-rival"></div></label>
        <p class="note" id="utp-rival-note"></p>
        <label>Difficulty<div class="seg" id="utp-diff"></div></label>
        <label>Quarter length<div class="seg" id="utp-qlen"></div></label>
        <label>Weather<div class="seg" id="utp-wx"></div></label>
        <label>Wind<div class="seg" id="utp-wind"></div><small class="note wind-note">Windy games change how you play: long passes and kicks drift with the wind, a tailwind adds distance and a headwind takes it away.</small></label>
        <label>Time of day<div class="seg" id="utp-tod"></div></label>
      </div>
    </div>
    <div class="actions"><button class="btn primary big" id="utp-go" ${o.full ? '' : 'disabled'}>${o.full ? 'Kick off' : 'Fill every lineup spot first'}</button></div>`;
  const root = C.$('#utp-opp');
  const draw = () => C.teamCard(C.$('.team-card', root), utOpp);
  draw();
  C.wireTeamPick(root, () => utOpp, v => { utOpp = v; draw(); }, () => U.club);
  const lvl = UT.rivalLevel(U);
  const rivalNote = () => { C.$('#utp-rival-note').textContent = utRival ? `Rival squad: ${lvl} OVR. It gets tougher as your squad improves and every time you win (${Math.floor(U.rw || 0)} win streak points).` : 'You play the real team’s roster.'; };
  C.seg(C.$('#utp-rival'), [[true, 'Scaling rival'], [false, 'Real team']], utRival, v => { utRival = v; rivalNote(); });
  rivalNote();
  C.seg(C.$('#utp-diff'), C.DIFFICULTIES.map((n, i) => [i, n]), C.SET.diff, v => { C.SET.diff = v; C.saveSet(); });
  C.seg(C.$('#utp-qlen'), C.QLENS, C.SET.qlen, v => { C.SET.qlen = v; C.saveSet(); });
  C.seg(C.$('#utp-wx'), WX_OPTS, utWx, v => { utWx = v; });
  C.seg(C.$('#utp-wind'), WIND_OPTS, C.SET.wind || 0, v => { C.SET.wind = v; C.saveSet(); });
  C.seg(C.$('#utp-tod'), TOD_OPTS, utTod, v => { utTod = v; });
  C.$('#utp-go').onclick = () => {
    const roster = UT.squadRoster(U); if (!roster) return C.toast('Fill every lineup spot first');
    const opp = utRival ? UT.rivalRoster(UT.rivalLevel(U), (Date.now() ^ utOpp * 7919) >>> 0) : null;
    C.startCPU({ wind: C.SET.wind || 0, teams: [U.club, utOpp], rosters: [roster, opp], ut: true, weather: pickWx(utWx), tod: pickTod(utTod), teamNames: [U.name, null] });
  };
}

// ---------------- solos ----------------
const rewardText = g => [g.coins ? `${fmt(g.coins)} coins` : '', g.pack ? UT.packByKey(g.pack).name : '', g.fp ? `${fmt(g.fp)} pass XP` : ''].filter(Boolean).join(', ');
function renderSolos(P) {
  const U = P.p.ut, pane = C.$('#ut-pane'), o = UT.squadOvr(U);
  const done = UT.SOLOS.filter(x => P.soloDone(x.k)).length;
  pane.innerHTML = `<div class="squad-head"><div><h3>Solo challenges</h3><p class="note">One game each against the CPU with your squad. Beat the goal to get paid. They reset every Monday. ${done} of ${UT.SOLOS.length} done this week.</p></div></div>
    <div class="solo-list">${UT.SOLOS.map(x => { const t = TEAMS[x.opp], fin = P.soloDone(x.k);
      return `<div class="solo ${fin ? 'done' : ''}"><img src="${C.logoURL ? C.logoURL(x.opp, 64) : ''}" alt=""><div class="solo-txt"><b>${x.n}</b><small>${x.d}. vs ${t.city} (${C.teamOvr ? C.teamOvr(x.opp) + ' OVR, ' : ''}${C.DIFFICULTIES[x.diff]})</small><small class="rw">${rewardText(x.give)}</small></div>
      <button class="btn ${fin ? '' : 'primary'}" data-solo="${x.k}" ${fin || !o.full ? 'disabled' : ''}>${fin ? 'Done' : o.full ? 'Play' : 'Fill your lineup'}</button></div>`; }).join('')}</div>`;
  C.$$('[data-solo]', pane).forEach(b => b.onclick = () => {
    const x = UT.SOLOS.find(s => s.k === b.dataset.solo), roster = UT.squadRoster(U); if (!roster) return C.toast('Fill every lineup spot first');
    if (x.req && !x.req(UT.lineupCards(U))) return C.toast(`Squad challenge: ${x.reqd}. Change your lineup first.`, 3500);
    const opp = x.opp === U.club ? (x.opp + 1) % TEAMS.length : x.opp;
    C.startCPU({ teams: [U.club, opp], rosters: [roster, null], ut: true, solo: x.k, diff: x.diff, weather: 'clear', tod: 'night', teamNames: [U.name, null] });
  });
}

// ---------------- field pass ----------------
function renderPass(P) {
  const pane = C.$('#ut-pane'), F = P.p.fp, tier = P.fpTier, into = F.xp - tier * UT.FP_XP;
  const end = new Date(); end.setMonth(end.getMonth() + 1, 1); end.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.ceil((end - Date.now()) / 864e5));
  const ready = []; for (let t = 1; t <= tier; t++) if (!F.got.includes(t)) ready.push(t);
  let cells = '';
  for (let t = 1; t <= UT.FP_TIERS; t++) {
    const rw = UT.fpReward(t), got = F.got.includes(t), open = t <= tier;
    cells += `<div class="fp-t ${got ? 'got' : open ? 'ready' : ''} ${rw.pack ? 'pk-' + rw.pack : ''}"><small>Tier ${t}</small><b>${fmt(rw.coins)}</b><span>coins</span>${rw.pack ? `<em>${UT.packByKey(rw.pack).name}</em>` : ''}
      ${got ? '<i>Claimed</i>' : open ? `<button class="btn sm primary" data-fp="${t}">Claim</button>` : ''}</div>`;
  }
  pane.innerHTML = `<div class="squad-head"><div><h3>Field Pass</h3><p class="note">Free for everyone with an account. Every game earns pass XP (Ultimate Team games 50% more, solos and sets add extra). Claim coins and packs at every tier. This season ends in ${days} day${days > 1 ? 's' : ''}.</p></div>
    <button class="btn primary" id="fp-all" ${ready.length ? '' : 'disabled'}>Claim all (${ready.length})</button></div>
    <div class="fp-prog"><b>Tier ${tier} of ${UT.FP_TIERS}</b><div class="bar"><i style="width:${tier >= UT.FP_TIERS ? 100 : into / UT.FP_XP * 100}%"></i></div><small>${tier >= UT.FP_TIERS ? 'Pass complete' : `${fmt(into)} / ${fmt(UT.FP_XP)} XP to tier ${tier + 1}`}</small></div>
    <div class="fp-track">${cells}</div>`;
  C.$$('[data-fp]', pane).forEach(b => b.onclick = () => { const rw = P.fpClaim(+b.dataset.fp); if (rw) { C.sfx.play('firstdown'); C.toast(`+${fmt(rw.coins)} coins${rw.pack ? ` and a ${UT.packByKey(rw.pack).name}` : ''}`); renderUT(); } });
  C.$('#fp-all').onclick = () => { const o = P.fpClaimAll(); C.sfx.play('firstdown'); C.toast(`+${fmt(o.coins)} coins${o.packs.length ? ` and ${o.packs.length} pack${o.packs.length > 1 ? 's' : ''}` : ''}`, 3500); renderUT(); };
}

// ---------------- market ----------------
let mkFilter = 'all', mkTimer = null;
function renderMarket(P) {
  const pane = C.$('#ut-pane'), m = P.market;
  let items = m.items; if (mkFilter !== 'all') items = items.filter(l => UT.card(l.id).group === mkFilter);
  const left = Math.max(0, (m.slot + 1) * UT.MARKET_SLOT_MS - Date.now()), mins = Math.ceil(left / 60000);
  const mine = m.mine.map(l => { const c = UT.owned({ id: l.id, b: l.b, u: l.u }), rem = Math.max(0, l.end - Date.now());
    return `<div class="mk-mine">${cardHTML(c, { mini: true })}<div><b>${fmt(l.price)}</b><small>${rem ? `${Math.ceil(rem / 60000)} min left` : 'Ended, settling'}</small>${rem ? `<button class="btn sm ghost" data-cancel="${l.u}">Take down</button>` : ''}</div></div>`; }).join('');
  pane.innerHTML = `<div class="squad-head"><div><h3>Market</h3><p class="note">Buy players outright or list your own. New players come up every 15 minutes (next batch in ${mins} min). The market keeps ${UT.MARKET_TAX * 100}% of every sale.</p></div>
    <button class="btn" id="mk-sell">Sell a player</button></div>
    ${mine ? `<h3 class="store-h">Your listings (${m.mine.length} of ${UT.MAX_LISTINGS})</h3><div class="mk-mines">${mine}</div>` : ''}
    <div class="pk-filters"><div class="seg" id="mk-g"></div></div>
    <div class="mk-grid">${items.map(l => { const c = UT.card(l.id), mv = UT.marketValue(l.id), deal = l.price <= mv;
      return `<div class="mk-item">${cardHTML(c, { mini: true })}<div class="mk-buy"><button class="btn sm ${deal ? 'primary' : ''}" data-buy="${l.k}" ${P.p.coins < l.price ? 'disabled' : ''}><i class="coin"></i> ${fmt(l.price)}</button><small>${deal ? 'Good price' : `Worth about ${fmt(mv)}`}</small></div></div>`; }).join('') || '<p class="note">Nothing at that position right now. Check back after the refresh.</p>'}</div>`;
  C.seg(C.$('#mk-g'), [['all', 'All'], ...Object.keys(UT.GROUPS).map(g => [g, g])], mkFilter, v => { mkFilter = v; renderUT(); });
  C.$$('[data-buy]', pane).forEach(b => b.onclick = async () => {
    const l = m.items.find(x => x.k === b.dataset.buy), c = UT.card(l.id);
    if (l.price >= 5000 && !(await askYes(`Buy ${c.first} ${c.last} (${c.ovr} ${c.tierName} ${c.pos}) for ${fmt(l.price)} coins?`, 'Buy'))) return;
    const r = P.marketBuy(b.dataset.buy); if (typeof r === 'string') return C.toast(r);
    C.sfx.play('firstdown'); C.toast(`${c.last} joined your club`); renderUT();
  });
  C.$$('[data-cancel]', pane).forEach(b => b.onclick = () => { const e = P.marketCancel(+b.dataset.cancel); if (e) C.toast(e); renderUT(); });
  C.$('#mk-sell').onclick = () => sellPicker(P);
  clearTimeout(mkTimer); if (m.mine.length) mkTimer = setTimeout(() => { if (C.screen() === 'ut' && utTab === 'market') renderUT(); }, 30000);
}
function sellPicker(P) {
  const U = P.p.ut, list = U.cards.filter(c => !P.inLineup(c.u)).map(UT.owned).sort((a, b) => b.ovr - a.ovr);
  const el = openDlg(`<div style="grid-column:1/-1"><div class="pk-head"><h2 class="title sm">Sell a player</h2><button class="btn ghost sm" id="dlg-x">Close</button></div>
    <p class="note">Lineup players can't be sold. Price him near what he's worth or he probably won't sell.</p>
    <div class="pick-list">${list.map(c => cardHTML(c, { mini: true, tag: 'button' })).join('') || '<p class="note">Nobody to sell.</p>'}</div></div>`);
  C.$('#dlg-x', el).onclick = closeDlg;
  C.$$('.ucard', el).forEach(b => b.onclick = () => listDialog(P, +b.dataset.u));
}
function listDialog(P, u) {
  const inst = P.p.ut.cards.find(c => c.u === u); if (!inst) return;
  const c = UT.owned(inst), mv = UT.marketValue(inst), lo = Math.max(50, Math.round(mv * 0.6 / 50) * 50), hi = Math.round(mv * 1.8 / 50) * 50;
  const el = openDlg(`${cardHTML(c)}<div class="cd-info"><h3>List ${C.escapeHtml(c.first)} ${C.escapeHtml(c.last)}</h3>
    <p class="note">Worth about ${fmt(mv)} coins. Quicksell gives ${fmt(UT.quicksell(inst))}.</p>
    <label class="mk-price">Price <b id="lp-v">${fmt(mv)}</b><input type="range" id="lp" min="${lo}" max="${hi}" step="50" value="${mv}"></label>
    <p class="note" id="lp-odds"></p>
    <label>Listing time<div class="seg" id="lp-t"></div></label>
    <div class="cd-acts"><button class="btn primary" id="lp-go">List him</button><button class="btn ghost" id="lp-x">Back</button></div></div>`);
  let mins = 30;
  const odds = () => { const v = +C.$('#lp', el).value, r = v / mv; C.$('#lp-v', el).textContent = fmt(v);
    C.$('#lp-odds', el).textContent = `You get ${fmt(v * (1 - UT.MARKET_TAX))} after the cut. Chance he sells: ${r <= 0.9 ? 'almost certain' : r <= 1 ? 'very likely' : r <= 1.15 ? 'likely' : r <= 1.3 ? 'maybe' : r <= 1.5 ? 'unlikely' : 'very unlikely'}.`; };
  C.$('#lp', el).oninput = odds; odds();
  C.seg(C.$('#lp-t', el), UT.LIST_TIMES, mins, v => { mins = v; });
  C.$('#lp-x', el).onclick = () => sellPicker(P);
  C.$('#lp-go', el).onclick = () => { const e = P.marketList(u, +C.$('#lp', el).value, mins); if (e) return C.toast(e); C.sfx.play('ui'); C.toast(`${c.last} is on the market`); closeDlg(); utTab = 'market'; renderUT(); };
}

// ---------------- sets ----------------
function renderSets(P) {
  const pane = C.$('#ut-pane');
  const tierN = t => UT.TIERS[t].name.toLowerCase();
  pane.innerHTML = `<div class="squad-head"><div><h3>Sets</h3><p class="note">Trade in players you don't need for something better. Your lineup is never touched, and the lowest rated players go first.</p></div></div>
    <div class="solo-list">${UT.SETS.map(x => { const r = P.setPick(x.k);
      const need = x.need.map(([t, n]) => `${n} ${tierN(t)}`).join(' + ');
      const status = r.locked ? 'Done this week' : r.ok ? 'Ready' : 'Need ' + r.missing.map(([t, n]) => `${n} more ${tierN(t)}`).join(', ');
      const prize = x.give.master ? (() => { const c = UT.card(UT.masterId(hashW(P.p.ut.sets.w + 'master'))); return `${c.ovr} OVR ${c.pos} ${c.first} ${c.last}`; })() : x.give.pack ? UT.packByKey(x.give.pack).name : `${fmt(x.give.coins)} coins`;
      return `<div class="solo ${r.locked ? 'done' : ''}"><div class="set-ic t${x.need[x.need.length - 1][0]}">${x.need.reduce((a, [, n]) => a + n, 0)}</div><div class="solo-txt"><b>${x.n}</b><small>${x.d}</small><small class="rw">Gives: ${prize}. Costs: ${need}. ${status}.</small></div>
      <button class="btn ${r.ok ? 'primary' : ''}" data-set="${x.k}" ${r.ok ? '' : 'disabled'}>Complete</button></div>`; }).join('')}</div>`;
  C.$$('[data-set]', pane).forEach(b => b.onclick = async () => {
    const r = P.setPick(b.dataset.set); if (!r.ok) return;
    if (!(await askYes(`Trade in ${r.pick.map(c => `${c.last} (${c.ovr})`).join(', ')}?`, 'Trade in'))) return;
    const out = P.completeSet(b.dataset.set); if (typeof out === 'string') return C.toast(out);
    C.sfx.play('td');
    if (out.give.pack) { C.toast(`Set done: ${UT.packByKey(out.give.pack).name} added`); utTab = 'packs'; }
    else if (out.card) { const c = UT.owned(out.card); C.toast(`Set done: ${c.first} ${c.last} (${c.ovr}) joined your club`, 4000); }
    else C.toast(`Set done: +${fmt(out.give.coins)} coins`);
    renderUT();
  });
}
function hashW(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------- progress ----------------
export function renderProgress() {
  const P = profile(); if (!P) return;
  P.refreshChallenges();
  const { $ } = C, p = P.p, r = P.rank, col = RANK_COL[r.div];
  const need = xpFor(p.lvl);
  $('#prog-level').innerHTML = `<div class="lv-row"><div class="lv-big">${p.lvl}</div><div style="flex:1"><h3>Level ${p.lvl}</h3><p class="note">${fmt(p.xp)} of ${fmt(need)} XP to level ${p.lvl + 1}</p><div class="bar"><i style="width:${(p.xp / need) * 100}%"></i></div>
    <p class="note">Next: ${fmt(levelReward(p.lvl + 1).coins)} coins${levelReward(p.lvl + 1).pack ? ` and a ${UT.packByKey(levelReward(p.lvl + 1).pack).name}` : ''}</p></div></div>`;
  const nextDiv = r.idx < 5 ? ['Silver', 'Gold', 'Platinum', 'Diamond', 'Kings'][r.idx] : null;
  $('#prog-rank').innerHTML = `<div class="rk-row" style="--rk:${col[0]};--rk2:${col[1]}"><div class="rk-emblem">${r.div === 'Kings' ? '♛' : 'I'.repeat(r.sub)}</div><div style="flex:1"><h3>${r.name}</h3>
    <p class="note">${r.span ? `${r.into} of ${r.span} RP to the next tier` : `${fmt(p.rp)} RP. You're at the top.`}</p>${r.span ? `<div class="bar rk"><i style="width:${Math.round(r.into / r.span * 100)}%"></i></div>` : ''}
    <p class="note">Online wins +40 RP, losses -20. CPU wins earn 6 to 18 RP depending on difficulty. You can't drop out of a division once you reach it.${nextDiv && RANK_REWARD[nextDiv] ? ` Reach ${nextDiv} for ${fmt(RANK_REWARD[nextDiv].coins)} coins and a ${UT.packByKey(RANK_REWARD[nextDiv].pack).name}.` : ''}</p></div></div>`;
  const chList = (list, kind) => {
    const left = Math.max(0, nextReset(kind) - Date.now()), h = Math.floor(left / 36e5), d = Math.floor(h / 24);
    return `<div class="ch-head"><h3 class="h3">${kind === 'daily' ? 'Daily' : 'Weekly'} challenges</h3><p class="note">New ones in ${d ? `${d}d ${h % 24}h` : `${h}h ${Math.floor(left / 6e4) % 60}m`}</p></div><div class="ch-list">${list.map(ch => {
      const d0 = challengeDef(ch.k); if (!d0) return '';
      return `<div class="ch ${ch.done ? 'done' : ''} ${ch.claimed ? 'claimed' : ''}"><b>${d0.d}</b><small>${fmt(d0.c)} coins, ${fmt(d0.x)} XP${d0.pack ? `, ${UT.packByKey(d0.pack).name}` : ''}</small><div class="bar"><i style="width:${(ch.p / d0.t) * 100}%"></i></div>
        ${ch.claimed ? '<button class="btn sm" disabled>Claimed</button>' : ch.done ? `<button class="btn primary sm" data-claim="${ch.k}">Claim</button>` : `<span class="note">${fmt(ch.p)}/${fmt(d0.t)}</span>`}</div>`;
    }).join('')}</div>`;
  };
  $('#prog-daily').innerHTML = chList(p.daily.list, 'daily');
  $('#prog-weekly').innerHTML = chList(p.weekly.list, 'weekly');
  C.$$('[data-claim]').forEach(b => b.onclick = () => {
    const out = P.claim(b.dataset.claim); if (!out) return;
    C.sfx.play('firstdown');
    C.toast(`+${fmt(out.coins)} coins, +${fmt(out.xp)} XP${out.pack ? `, ${UT.packByKey(out.pack).name}` : ''}${out.levels.length ? `. Level ${out.levels[out.levels.length - 1].lvl}!` : ''}`, 3500);
    renderProgress();
  });
  let tk = '';
  for (let l = Math.max(2, p.lvl - 1); l <= p.lvl + 12; l++) { const rw = levelReward(l); tk += `<div class="tk ${l <= p.lvl ? 'got' : l === p.lvl + 1 ? 'next' : ''}"><b>Lv ${l}</b><small>${fmt(rw.coins)} coins</small>${rw.pack ? `<small class="pk">${UT.packByKey(rw.pack).name}</small>` : ''}</div>`; }
  $('#prog-track').innerHTML = `<h3 class="h3">Level rewards</h3><div class="track">${tk}</div>`;
  const U = p.ut;
  $('#prog-career').innerHTML = `<h3 class="h3">Career</h3><div class="career">
    ${(() => { const u = C.Auth && C.Auth.user, R = u && u.recs, r = R ? [R.on_w || 0, R.on_l || 0, R.on_t || 0] : ((p.recs && p.recs.on) || [0, 0, 0]), gp = r[0] + r[1] + r[2]; return `<div><b>${r[0]}-${r[1]}${r[2] ? '-' + r[2] : ''}</b><small>Online H2H record</small></div><div><b>${gp ? Math.round(r[0] / gp * 100) : 0}%</b><small>H2H win rate</small></div><div><b>${fmt(p.games)}</b><small>Games played</small></div>`; })()}
    <div><b>${fmt(p.tds)}</b><small>Touchdowns</small></div><div><b>${p.bestStreak}</b><small>Best win streak</small></div><div><b>${rankInfo(p.rpBest).name}</b><small>Best rank</small></div>
    <div><b>${U.cards.length}</b><small>UT players</small></div><div><b>${U.opened}</b><small>Packs opened</small></div><div><b>${p.drill.best || 0}</b><small>Drill best</small></div></div>`;
  const got = ACH.filter(a => p.ach[a.k]).length;
  $('#prog-ach').innerHTML = `<h3 class="h3">Achievements <span class="note">${got} of ${ACH.length}</span></h3><div class="ach-grid">${ACH.map(a => `<div class="ach ${p.ach[a.k] ? 'got' : ''}"><i>${p.ach[a.k] ? '✓' : '?'}</i><div><b>${a.n}</b><small>${a.d}. ${fmt(a.c)} coins</small></div></div>`).join('')}</div>`;
  refreshChip();
}

// ---------------- celebrations, achievements, drill ----------------
// celebrations: [id, name, coin price (0 = free)]
export const CELS = [[-1, 'Random', 0], [0, 'Jump', 0], [1, 'Dance', 0], [2, 'Flex', 0], [3, 'Point up', 1800], [4, 'Spin', 2500], [5, 'Take a bow', 4000], [7, 'Dab', 5000], [6, 'Moonwalk', 7000], [8, 'Shuffle', 9000], [14, 'Take a knee', 2000], [9, 'Salute', 2500], [10, 'Heart hands', 3500], [16, 'Wave to the crowd', 4500], [15, 'Jumping jacks', 5500], [11, 'Robot', 6000], [12, 'Sprinkler', 6500], [13, 'Archer', 8000], [17, 'Kings throne', 12000], [24, 'Touchdown signal', 3000], [20, 'Phone call', 4000], [22, 'Shrug', 4500], [19, 'Rock the baby', 6000], [23, 'Lasso', 7500], [18, 'Griddy', 10000], [21, 'Superman', 15000]];
export const celOwned = P => { const own = new Set([-1, 0, 1, 2, ...((P && P.p.cels) || [])]); if (P && P.p.lvl >= 5) own.add(5); if (P && P.p.lvl >= 15) own.add(6); return own; };   // old level unlocks still count
export const celUnlocked = (lvlOrP) => [...celOwned(typeof lvlOrP === 'object' ? lvlOrP : null)];
export function buyCel(P, id) {
  const c = CELS.find(x => x[0] === id); if (!c || !P) return 'No such emote';
  if (celOwned(P).has(id)) return 'You already own it';
  if (P.p.coins < c[2]) return `You need ${(c[2] - P.p.coins).toLocaleString()} more coins`;
  P.p.coins -= c[2]; P.p.cels = [...(P.p.cels || []), id]; P.save(); return null;
}
export function unlockAch(ev) { const P = profile(); if (!P || (C.Auth.user && C.Auth.user.kind === 'guest')) return; const got = P.unlock(ev); for (const a of got) C.toast(`Achievement unlocked: ${a.n}! +${fmt(a.c)} coins`, 3500); }
export function packAchToast() { const P = profile(); if (P && P.lastAch) { for (const a of P.lastAch) C.toast(`Achievement unlocked: ${a.n}! +${fmt(a.c)} coins`, 3500); P.lastAch = null; } }
export function renderDrillBoard(el) {
  const P = profile();
  let dev = []; try { dev = JSON.parse(localStorage.getItem('ek_drill_board') || '[]'); } catch (_) {}
  const me = C.Auth.user ? C.Auth.user.name : '';
  const row = (r, i) => `<div class="row ${r.name === me ? 'me' : ''}"><span>${i + 1}</span><span>${C.escapeHtml(r.name || me)} <small class="note">${(TEAMS[r.team] || TEAMS[0]).abbr}, ${C.DIFFICULTIES[r.diff ?? 1] || ''}</small></span><b>${r.pts}</b></div>`;
  el.innerHTML = `<h4>Your best: ${P ? P.p.drill.best || 0 : 0} points</h4><h4>Top scores on this device</h4>${dev.length ? dev.map(row).join('') : '<p class="note">No runs yet. Set the first score.</p>'}`;
}
export function drillRewardsHTML(pts, diff, team) {
  const P = profile(); if (!P) return '';
  const out = P.awardDrill(pts, diff, team, C.Auth.user ? C.Auth.user.name : 'You');
  const lines = out.lines.map(l => `<span>${l.label}</span><span>+${fmt(l.c)}</span><span>+${fmt(l.x)} XP</span>`).join('');
  const extra = [];
  if (out.best && pts) extra.push(`<span class="up">New personal best: ${pts} points!</span>`);
  for (const lv of out.levels) extra.push(`<span class="up">Level up! You're level ${lv.lvl}: +${fmt(lv.coins)} coins${lv.pack ? `, ${UT.packByKey(lv.pack).name}` : ''}</span>`);
  for (const a of out.ach || []) extra.push(`<span class="up">Achievement unlocked: ${a.n}! +${fmt(a.c)} coins</span>`);
  return `<div class="gr-head"><b>Rewards</b><span class="coins-pill">New balance: <i class="coin"></i>${fmt(P.p.coins)}</span></div>
    <div class="gr-lines">${lines}<span class="gr-tot">Total</span><span class="gr-tot">+${fmt(out.coins)}</span><span class="gr-tot">+${fmt(out.xp)} XP</span></div>${extra.length ? `<div class="gr-extra">${extra.join('')}</div>` : ''}`;
}

// ---------------- trades ----------------
const tdb = () => (C.Auth.mode === 'supabase' && C.Auth.client ? C.Auth.client : null);
const tme = () => (C.Auth.user && C.Auth.user.kind === 'account' ? C.Auth.user : null);
const tesc = s => C.escapeHtml(String(s ?? ''));
const blankDraft = () => ({ to: null, toName: '', us: [], packs: {}, coins: 0, tp: 0, ask: { cards: [], packs: {}, coins: 0, tp: 0 }, note: '' });
let tradeDraft = blankDraft(), tradeRows = [], tradeNames = {}, theirClub = null;
// your club is copied to the server so other players can browse it and ask for specific cards
let clubUp = '';
async function uploadClub() {
  const D = tdb(), u = tme(), P = profile(); if (!D || !u || !P || !P.p.ut || !P.p.ut.started) return;
  const key = u.id + ':' + P.p.rev; if (key === clubUp) return;
  const U = P.p.ut;
  const { error } = await D.from('ek_clubs').upsert({ id: u.id, name: u.name.slice(0, 16), cards: U.cards.slice(0, 220).map(c => [c.u, c.id, c.x || 0, c.b || 0, c.ab || 0, c.xf ? 1 : 0]), lineup: Object.values(U.lineup || {}), packs: P.p.packs || {}, ovr: UT.squadOvr(U).ovr, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (!error) clubUp = key;
}
const fromRow = r => ({ u: r[0], id: r[1], ...(r[2] ? { x: r[2] } : {}), b: r[3] || 0, ...(r[4] ? { ab: r[4] } : {}), ...(r[5] ? { xf: 1 } : {}) });
async function loadTheirClub(id) {
  theirClub = { id, loading: true }; const { data } = await tdb().from('ek_clubs').select('cards,lineup,packs,ovr,updated_at').eq('id', id).maybeSingle();
  theirClub = data ? { id, cards: (data.cards || []).map(fromRow), lineup: data.lineup || [], packs: data.packs || {}, ovr: data.ovr, at: data.updated_at } : { id, none: true };
  if (C.screen() === 'ut' && utTab === 'trade') renderUT();
}
export function setTradeTarget(id, name) { utTab = 'trade'; if (!id) return; tradeDraft = blankDraft(); tradeDraft.to = id; tradeDraft.toName = name; loadTheirClub(id); }
function itemsHTML(it) {
  if (!it) return '<span class="note">nothing</span>';
  const bits = [];
  for (const c of it.cards || []) { const o = UT.owned({ ...c, u: -1 }); bits.push(cardHTML(o, { mini: true })); }
  for (const [k, n] of Object.entries(it.packs || {})) if (n > 0) bits.push(`<span class="tr-chip">${n}x ${tesc((UT.packByKey(k) || { name: k }).name)}</span>`);
  if (it.coins) bits.push(`<span class="tr-chip"><i class="coin"></i> ${fmt(it.coins)}</span>`);
  if (it.tp) bits.push(`<span class="tr-chip"><i class="tp-ic">TP</i> ${fmt(it.tp)}</span>`);
  return bits.join('') || '<span class="note">nothing</span>';
}
async function settleTrades() {
  const D = tdb(), u = tme(), P = profile(); if (!D || !u || !P) return 0;
  const { data } = await D.from('ek_trades').select('id,offer,ask,status').eq('sender', u.id).in('status', ['accepted', 'declined', 'cancelled']).limit(20);
  let n = 0;
  for (const t of data || []) {
    const { data: s } = await D.rpc('ek_trade_settle', { tid: t.id });
    if (s === 'completed') { P.tradeGive(t.ask); n++; C.toast('Trade accepted! Your new stuff is in your club.', 3500); C.sfx.play('firstdown'); }
    else if (s === 'returned') { P.tradeGive(t.offer); n++; C.toast(t.status === 'declined' ? 'A trade was declined. Your items are back.' : 'Trade cancelled. Your items are back.', 3000); }
  }
  return n;
}
async function loadTrades(quiet) {
  const D = tdb(), u = tme(); if (!D || !u) return;
  const { data, error } = await D.from('ek_trades').select('*').or(`sender.eq.${u.id},recipient.eq.${u.id}`).order('created_at', { ascending: false }).limit(40);
  if (error) { if (!quiet) C.toast('Couldn’t load trades: ' + error.message); return; }
  const key = JSON.stringify((data || []).map(t => [t.id, t.status]));
  if (quiet && key === loadTrades.key) return; loadTrades.key = key;
  tradeRows = data || [];
  const ids = [...new Set(tradeRows.flatMap(t => [t.sender, t.recipient]).filter(id => !tradeNames[id]))];
  if (ids.length) { const { data: ps } = await D.from('ek_players').select('id,name').in('id', ids); for (const p of ps || []) tradeNames[p.id] = p.name; }
  const inc = tradeRows.filter(t => t.recipient === u.id && t.status === 'pending').length;
  const dot = document.getElementById('ut-tr-n'); if (dot) { dot.textContent = inc; dot.classList.toggle('hidden', !inc); }
  if (C.screen() === 'ut' && utTab === 'trade') drawTradeLists();
}
function drawTradeLists() {
  const u = tme(), el = document.getElementById('tr-lists'); if (!el || !u) return;
  const row = t => {
    const mine = t.sender === u.id, other = tradeNames[mine ? t.recipient : t.sender] || 'Player';
    const acts = t.status !== 'pending' ? `<span class="ad-tag">${t.status}</span>` : mine ? `<button class="btn sm" data-tcancel="${t.id}">Cancel</button>` : `<button class="btn sm primary" data-tyes="${t.id}">Accept</button><button class="btn sm" data-tno="${t.id}">Decline</button>`;
    return `<div class="tr-row"><div class="tr-who"><b>${mine ? 'To' : 'From'} ${tesc(other)}</b>${t.note ? `<small>“${tesc(t.note)}”</small>` : ''}</div>
      <div class="tr-side"><small>${mine ? 'You give' : 'You get'}</small><div class="tr-items">${itemsHTML(t.offer)}</div></div>
      <div class="tr-side"><small>${mine ? 'You get' : 'You give'}</small><div class="tr-items">${itemsHTML(t.ask)}</div></div>
      <div class="tr-acts">${acts}</div></div>`;
  };
  const inc = tradeRows.filter(t => t.recipient === u.id), out = tradeRows.filter(t => t.sender === u.id);
  el.innerHTML = `<h3 class="store-h">Incoming</h3>${inc.map(row).join('') || '<p class="note">No trade offers yet.</p>'}<h3 class="store-h">Sent</h3>${out.map(row).join('') || '<p class="note">You haven’t sent any trades.</p>'}`;
  C.$$('[data-tyes]', el).forEach(b => b.onclick = () => respondTrade(+b.dataset.tyes, true));
  C.$$('[data-tno]', el).forEach(b => b.onclick = () => respondTrade(+b.dataset.tno, false));
  C.$$('[data-tcancel]', el).forEach(b => b.onclick = async () => { const { data } = await tdb().rpc('ek_trade_cancel', { tid: +b.dataset.tcancel }); if (data) { await settleTrades(); } loadTrades.key = null; await loadTrades(); renderUT(); });
}
async function respondTrade(id, yes) {
  const P = profile(), t = tradeRows.find(x => x.id === id); if (!t || !P) return;
  if (yes) {
    // you pay what they asked for (coins, TP, packs) and get what they offered
    const ask = t.ask || {}, need = { us: (ask.cards || []).map(c => c.u), packs: ask.packs || {}, coins: ask.coins || 0, tp: ask.tp || 0 };
    for (const c of ask.cards || []) { const mine = P.p.ut.cards.find(x => x.u === c.u); if (!mine || mine.id !== c.id) return C.toast('You don’t have one of the players they asked for anymore. Decline it'); }
    const err = P.tradeCheck(need); if (err) return C.toast(err);
    if (P.p.ut.cards.length + (t.offer.cards || []).length > UT.CLUB_CAP) return C.toast('Your club is full. Quicksell some players first');
    const { data, error } = await tdb().rpc('ek_trade_respond', { tid: id, yes: true });
    if (error || !data) return C.toast('That trade isn’t available anymore');
    P.tradeTake(need); P.tradeGive(t.offer);
    C.sfx.play('firstdown'); C.toast('Trade done! Check your club and packs.', 3000);
  } else {
    await tdb().rpc('ek_trade_respond', { tid: id, yes: false }); C.toast('Trade declined');
  }
  loadTrades.key = null; await loadTrades(); renderUT();
}
function theirBlock(d) {
  if (!d.to) return '<p class="note">Pick who you’re trading with to see their club.</p>';
  if (!theirClub || theirClub.id !== d.to || theirClub.loading) { if (!theirClub || theirClub.id !== d.to) loadTheirClub(d.to); return '<p class="note">Loading their club…</p>'; }
  if (theirClub.none) return '<p class="note">They haven’t opened Ultimate Team yet, so there’s no club to ask from. You can still ask for coins or TP.</p>';
  return `<div class="tr-items">${d.ask.cards.map(c => `<button class="tr-x" data-aunpick="${c.u}" title="Remove">${cardHTML({ ...UT.owned(c), u: c.u }, { mini: true })}</button>`).join('')}</div><button class="btn sm" id="tr-askcard" type="button">+ Ask for one of their players</button>`;
}
function renderTrade(P) {
  const pane = C.$('#ut-pane');
  if (!tdb() || !tme()) { pane.innerHTML = '<p class="note">Trading needs a real account. Sign in to trade players, packs, coins and Training Points with other players.</p>'; return; }
  const d = tradeDraft, U = P.p.ut;
  const sel = U.cards.filter(c => d.us.includes(c.u));
  const packOpts = UT.PACKS.filter(k => (P.p.packs[k.key] || 0) > 0);
  pane.innerHTML = `<div class="tr-new panel">
      <h3>New trade</h3>
      <label>Trade with<div class="tr-to"><input id="tr-q" placeholder="Search a player name" value="${tesc(d.toName)}" autocomplete="off"><div id="tr-qres" class="tr-qres"></div></div></label>
      <div class="tr-cols">
        <div><b>You give</b>
          <div class="tr-items">${sel.map(c => `<button class="tr-x" data-unpick="${c.u}" title="Remove">${cardHTML(UT.owned(c), { mini: true })}</button>`).join('')}</div>
          <button class="btn sm" id="tr-addcard" type="button">+ Add a player</button>
          ${packOpts.length ? `<div class="tr-packs">${packOpts.map(k => `<label class="tr-pk">${tesc(k.name)} <input type="number" min="0" max="${P.p.packs[k.key]}" value="${d.packs[k.key] || 0}" data-gpack="${k.key}"></label>`).join('')}</div>` : '<p class="note">No unopened packs to trade. Buy one and it goes to My packs.</p>'}
          <label class="tr-num"><i class="coin"></i><input type="number" min="0" max="${P.p.coins}" step="50" value="${d.coins}" id="tr-coins"></label>
          <label class="tr-num"><i class="tp-ic">TP</i><input type="number" min="0" max="${P.p.tp || 0}" step="5" value="${d.tp}" id="tr-tp"></label>
        </div>
        <div><b>You want</b>
          ${theirBlock(d)}
          <label class="tr-num"><i class="coin"></i><input type="number" min="0" max="500000" step="50" value="${d.ask.coins}" id="tr-acoins"></label>
          <label class="tr-num"><i class="tp-ic">TP</i><input type="number" min="0" max="50000" step="5" value="${d.ask.tp}" id="tr-atp"></label>
          ${(() => { const tp = theirClub && theirClub.packs ? UT.PACKS.filter(k => (theirClub.packs[k.key] || 0) > 0) : []; return tp.length ? `<small class="note">Their unopened packs</small><div class="tr-packs">${tp.map(k => `<label class="tr-pk">${tesc(k.name)} <input type="number" min="0" max="${theirClub.packs[k.key]}" value="${d.ask.packs[k.key] || 0}" data-apack="${k.key}"></label>`).join('')}</div>` : ''; })()}
        </div>
      </div>
      <label>Note<input id="tr-note" maxlength="120" value="${tesc(d.note)}" placeholder="optional"></label>
      <p class="note">What you give is held until they answer. If they decline or you cancel, you get it all back.</p>
      <button class="btn primary" id="tr-send" type="button">Send trade${d.toName ? ' to ' + tesc(d.toName) : ''}</button>
    </div>
    <div id="tr-lists"><p class="note">Loading trades…</p></div>`;
  const num = (id, f) => { const el = C.$('#' + id, pane); el.oninput = () => f(Math.max(0, +el.value || 0)); };
  num('tr-coins', v => d.coins = Math.min(v, P.p.coins)); num('tr-tp', v => d.tp = Math.min(v, P.p.tp || 0));
  num('tr-acoins', v => d.ask.coins = Math.min(v, 500000)); num('tr-atp', v => d.ask.tp = Math.min(v, 50000));
  C.$$('[data-gpack]', pane).forEach(el => el.oninput = () => { d.packs[el.dataset.gpack] = Math.max(0, Math.min(+el.value || 0, P.p.packs[el.dataset.gpack] || 0)); });
  C.$$('[data-apack]', pane).forEach(el => el.oninput = () => { d.ask.packs[el.dataset.apack] = Math.max(0, Math.min(+el.value || 0, (theirClub && theirClub.packs && theirClub.packs[el.dataset.apack]) || 0)); });
  C.$$('[data-aunpick]', pane).forEach(b => b.onclick = () => { d.ask.cards = d.ask.cards.filter(c => c.u !== +b.dataset.aunpick); renderUT(); });
  const ab = C.$('#tr-askcard', pane); if (ab) ab.onclick = () => {
    const lu = new Set(theirClub.lineup || []), list = theirClub.cards.filter(c => !d.ask.cards.some(x => x.u === c.u)).map(c => ({ c, o: UT.owned(c), st: lu.has(c.u) })).sort((a, b) => a.st - b.st || b.o.ovr - a.o.ovr);
    const el = openDlg(`<div style="grid-column:1/-1"><div class="pk-head"><h2 class="title sm">${tesc(d.toName)}'s club</h2><button class="btn ghost sm" id="dlg-x">Close</button></div>
      <p class="note">Starters (marked IN SQUAD) can’t be traded. If you want one, message ${tesc(d.toName)} and ask them to take him out of their starting lineup first. ${theirClub.ovr ? `Their squad is ${theirClub.ovr} OVR.` : ''}</p>
      <div class="pick-list">${list.map(({ c, o, st }) => cardHTML({ ...o, u: c.u }, { mini: true, tag: 'button', inLu: st })).join('') || '<p class="note">Nothing they can trade right now.</p>'}</div></div>`);
    C.$('#dlg-x', el).onclick = closeDlg;
    C.$$('.pick-list [data-u]', el).forEach(b => b.onclick = () => { if (lu.has(+b.dataset.u)) return C.toast(`Starters can’t be traded. Ask ${d.toName} to take him out of their starting lineup first.`, 4500); if (d.ask.cards.length >= 8) return C.toast('8 players max'); const c = theirClub.cards.find(x => x.u === +b.dataset.u); if (c) d.ask.cards.push(c); closeDlg(); renderUT(); });
  };
  C.$('#tr-note', pane).oninput = e => { d.note = e.target.value; };
  C.$$('[data-unpick]', pane).forEach(b => b.onclick = () => { d.us = d.us.filter(u => u !== +b.dataset.unpick); renderUT(); });
  C.$('#tr-addcard', pane).onclick = () => {
    const list = U.cards.filter(c => !d.us.includes(c.u)).map(c => UT.owned(c)).sort((a, b) => P.inLineup(a.u) - P.inLineup(b.u) || b.ovr - a.ovr);
    const el = openDlg(`<div style="grid-column:1/-1"><div class="pk-head"><h2 class="title sm">Add a player to the trade</h2><button class="btn ghost sm" id="dlg-x">Close</button></div>
      <p class="note">Starters (marked IN SQUAD) can’t be traded. Swap him out of your squad first, then you can trade him.</p>
      <div class="pick-list">${list.map(c => cardHTML(c, { mini: true, tag: 'button', inLu: P.inLineup(c.u) })).join('') || '<p class="note">No players yet.</p>'}</div></div>`);
    C.$('#dlg-x', el).onclick = closeDlg;
    C.$$('.pick-list [data-u]', el).forEach(b => b.onclick = () => { if (P.inLineup(+b.dataset.u)) return C.toast('He’s in your starting lineup, so he can’t be traded. Swap him out of your squad first.', 4500); if (d.us.length >= 8) return C.toast('8 players max per trade'); d.us.push(+b.dataset.u); closeDlg(); renderUT(); });
  };
  let qt = null;
  C.$('#tr-q', pane).oninput = e => { clearTimeout(qt); const q = C.cleanText(e.target.value).trim(); d.to = null; d.toName = ''; qt = setTimeout(async () => {
    const box = C.$('#tr-qres', pane); if (q.length < 2) { box.innerHTML = ''; return; }
    const { data } = await tdb().from('ek_players').select('id,name').ilike('name', `%${q}%`).neq('id', tme().id).limit(6);
    box.innerHTML = (data || []).map(p => `<button type="button" data-tto="${p.id}" data-tname="${tesc(p.name)}">${tesc(p.name)}</button>`).join('') || '<small class="note">No one by that name</small>';
    C.$$('[data-tto]', box).forEach(b => b.onclick = () => { d.to = b.dataset.tto; d.toName = b.dataset.tname; d.ask.cards = []; d.ask.packs = {}; loadTheirClub(d.to); renderUT(); });
  }, 250); };
  C.$('#tr-send', pane).onclick = async () => {
    if (!d.to) return C.toast('Pick who to trade with first');
    const give = { us: d.us, packs: Object.fromEntries(Object.entries(d.packs).filter(([, n]) => n > 0)), coins: d.coins | 0, tp: d.tp | 0 };
    const ask = { cards: d.ask.cards.map(c => ({ u: c.u, id: c.id, ...(c.x ? { x: c.x } : {}), b: c.b || 0, ...(c.ab ? { ab: c.ab } : {}), ...(c.xf ? { xf: 1 } : {}) })), packs: Object.fromEntries(Object.entries(d.ask.packs).filter(([, n]) => n > 0)), coins: d.ask.coins | 0, tp: d.ask.tp | 0 };
    if (!give.us.length && !Object.keys(give.packs).length && !give.coins && !give.tp) return C.toast('Add something to give');
    const r = P.tradeTake(give); if (r.err) return C.toast(r.err);
    const { error } = await tdb().from('ek_trades').insert({ recipient: d.to, offer: r.items, ask, note: C.cleanText(d.note).slice(0, 120) });
    if (error) { P.tradeGive(r.items); return C.toast('Trade failed: ' + error.message); }
    C.sfx.play('ui'); C.toast(`Trade sent to ${d.toName}`);
    tradeDraft = blankDraft(); theirClub = null;
    loadTrades.key = null; renderUT();
  };
  settleTrades().then(() => { loadTrades.key = null; loadTrades(); });
}

// ---------------- post-game ----------------
export function awardGame(r) {
  const P = profile(); if (!P) return '';
  const out = P.award(r);
  const lines = out.lines.map(l => `<span>${l.label}</span><span>+${fmt(l.c)}</span><span>+${fmt(l.x)} XP</span>`).join('');
  const extra = [];
  for (const lv of out.levels) extra.push(`<span class="up">Level up! You're level ${lv.lvl}: +${fmt(lv.coins)} coins${lv.pack ? `, ${UT.packByKey(lv.pack).name}` : ''}</span>`);
  if (out.drp) extra.push(`<span class="${out.drp > 0 ? 'up' : 'down'}">${out.drp > 0 ? '+' : ''}${out.drp} RP, ${out.rank.name}${out.rank.span ? ` (${out.rank.into}/${out.rank.span})` : ''}</span>`);
  for (const pr of out.promos) extra.push(`<span class="up">Promoted to ${pr.div}! +${fmt(pr.coins)} coins and a ${UT.packByKey(pr.pack).name}</span>`);
  for (const d of out.done) extra.push(`<span class="up">Challenge done: ${d.d}. Claim it in Progress.</span>`);
  if (out.solo) extra.push(out.solo.ok ? `<span class="up">Solo beaten: ${out.solo.n}! +${rewardText(out.solo.give)}</span>` : `<span class="down">Solo not beaten: ${out.solo.d}. Try it again from Solos.</span>`);
  if (out.sb) extra.push(`<span class="up">Solo Battles: +${fmt(out.sb.pts)} points (${fmt(out.sb.total)} this week, ${out.sb.tier} tier${out.sb.up ? ', tier up!' : ''}). Game ${out.sb.g} of ${UT.SB_GAMES}, +${out.sb.px} program XP</span>`); for (const u of out.sb.unlocked || []) extra.push(`<span class="up">Program reward unlocked: ${u}!</span>`);
  if (out.th) { extra.push(out.th.ok ? `<span class="up">Theme challenge beaten: ${out.th.n}! +${rewardText(out.th.give)}, +${fmt(out.th.give.tp)} TP, +${fmt(out.th.give.px)} program XP</span>` : `<span class="down">Theme challenge not beaten: ${out.th.d}. Try it again.</span>`); for (const u of out.th.unlocked) extra.push(`<span class="up">Program reward unlocked: ${u}!</span>`); }
  if (out.wl) extra.push(`<span class="up">${out.wl}</span>`);
  if (out.fp) extra.push(`<span class="up">+${fmt(out.fp)} Field Pass XP${out.fpTiers ? `, ${out.fpTiers} new tier${out.fpTiers > 1 ? 's' : ''} to claim` : ''}</span>`);
  for (const a of out.ach || []) extra.push(`<span class="up">Achievement unlocked: ${a.n}! +${fmt(a.c)} coins</span>`);
  return `<div class="gr-head"><b>Rewards</b><span class="coins-pill">New balance: <i class="coin"></i>${fmt(P.p.coins)} <i class="tp-ic">TP</i>${fmt(P.p.tp || 0)}</span></div>
    ${out.tp ? `<div class="gr-tp"><i class="tp-ic">TP</i><b>+${fmt(out.tp)} Training Points</b><small>${(out.tpLines || []).map(x => `${x.label} +${fmt(x.tp)}`).join(' · ')}${(out.lines || []).some(l => /^Win streak/.test(l.label)) ? ', win streak bonus included' : ''}</small></div>` : ''}
    <div class="gr-lines">${lines}<span class="gr-tot">Total</span><span class="gr-tot">+${fmt(out.coins)}</span><span class="gr-tot">+${fmt(out.xp)} XP</span></div>
    ${extra.length ? `<div class="gr-extra">${extra.join('')}</div>` : ''}`;
}
