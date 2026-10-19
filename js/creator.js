// ENDZONE KINGS — Play Creator: draw your own offense, defense and special teams plays.
// Plays save on this device (localStorage 'ek_custom_plays') and show up under "My Plays" in every game, online too.
import { askYes } from './ui.js?v=1792382050';
import { FORMS, cleanCustom } from './playbook.js?v=1792382050';

let C = null;
const KEY = 'ek_custom_plays', MAX = 24;
const COLS = { WR1: '#22c55e', WR2: '#3b82f6', RB: '#f97316', TE: '#a855f7', WR3: '#eab308', QB: '#e5e7eb' };
const LABEL = { WR1: 'WR 1', WR2: 'WR 2', RB: 'HB', TE: 'TE', WR3: 'Slot', QB: 'QB' };
const DEF_POS = { DL1: [-3.6, 1], DL4: [-1.1, 1], DL2: [1.1, 1], DL3: [3.6, 1], LB: [0, 5], LB2: [-4.8, 4.8], LB3: [4.8, 4.8], CB1: [-13, 5], CB2: [13, 5], S: [-3, 13], SS: [5, 10] };
const DEF_NAMES = { DL1: 'DE (left)', DL4: 'DT (left)', DL2: 'DT (right)', DL3: 'DE (right)', LB: 'MLB', LB2: 'OLB (left)', LB3: 'OLB (right)', CB1: 'CB (left)', CB2: 'CB (right)', S: 'Free safety', SS: 'Strong safety' };
const X = lx => 200 + lx * 7.2, Y = lz => 220 - lz * 6.5;
const LX = x => (x - 200) / 7.2, LZ = y => (220 - y) / 6.5;

export const SAVE_COST = 2250, EDIT_COST = 500;
let side = 'off';
let ed = null;      // the play being edited
let selRole = 'WR1';

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
const store = (list, fromCloud) => { try { localStorage.setItem(KEY, JSON.stringify(list)); localStorage.setItem(KEY + '_at', String(fromCloud || Date.now())); } catch (_) {} if (!fromCloud && C && C.Auth) C.Auth.saveCloud(null, { cp: { at: Date.now(), list } }); };
// cloud copy from another device: take it if it's newer than what this device has
export function adoptCloudPlays(cp) { if (!cp || !Array.isArray(cp.list)) return false; let at = 0; try { at = +localStorage.getItem(KEY + '_at') || 0; } catch (_) {} if ((cp.at || 0) <= at) return false; store(cp.list, cp.at); return true; }
export function localPlays() { let at = 0; try { at = +localStorage.getItem(KEY + '_at') || 0; } catch (_) {} return { at, list: load() }; }
function fresh(s) {
  if (s === 'def') return { side: 'def', name: '', assign: { DL1: { t: 'rush' }, DL4: { t: 'rush' }, DL2: { t: 'rush' }, DL3: { t: 'rush' }, LB: { t: 'man', who: 'RB' }, LB2: { t: 'man', who: 'TE' }, LB3: { t: 'zone', x: 5, z: 6 }, CB1: { t: 'man', who: 'WR1' }, CB2: { t: 'man', who: 'WR2' }, S: { t: 'deep' }, SS: { t: 'man', who: 'WR3' } } };
  return { side: 'off', special: s === 'st', name: '', form: s === 'st' ? 'punt' : 'gun', type: 'pass', carrier: 'RB', pa: false, routes: {} };
}

export function initCreator(ctx) {
  C = ctx;
  const { $ } = C;
  $('#cr-clear').onclick = () => { ed = fresh(side); $('#cr-name').value = ''; draw(); };
  $('#cr-save').onclick = save;
  $('#cr-field').addEventListener('pointerdown', onField);
}

export function renderCreator() {
  if (!ed) ed = fresh(side);
  C.seg(C.$('#cr-side'), [['off', 'Offense'], ['def', 'Defense'], ['st', 'Special teams']], side, v => { side = v; ed = fresh(v); selRole = v === 'def' ? 'LB' : 'WR1'; C.$('#cr-name').value = ''; renderCreator(); });
  opts(); draw(); list();
  msg(''); costLabel();
}
function costLabel() { C.$('#cr-save').textContent = `Save play (${(ed && ed.id ? EDIT_COST : SAVE_COST).toLocaleString()} coins)`; }
function msg(t, err) { const m = C.$('#cr-msg'); m.textContent = t; m.classList.toggle('err', !!err); }

function opts() {
  const box = C.$('#cr-opts'); const help = C.$('#cr-help');
  if (ed.side === 'def') {
    const choices = [['rush', 'Rush the QB'], ['man:WR1', 'Cover WR 1'], ['man:WR2', 'Cover WR 2'], ['man:WR3', 'Cover the slot'], ['man:TE', 'Cover the TE'], ['man:RB', 'Cover the HB'], ['man:QB', 'Spy the QB'], ['zone', 'Zone (click a spot)'], ['deep', 'Deep help']];
    box.innerHTML = `<div class="cr-assign">${Object.keys(DEF_POS).map(r => { const a = ed.assign[r] || { t: 'rush' }; const v = a.t === 'man' ? 'man:' + a.who : a.t;
      return `<label><span>${DEF_NAMES[r]}</span><select data-r="${r}">${choices.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }).join('')}</div>`;
    C.$$('select', box).forEach(sel => sel.onchange = () => {
      const r = sel.dataset.r, v = sel.value;
      ed.assign[r] = v.startsWith('man:') ? { t: 'man', who: v.slice(4) } : v === 'zone' ? { t: 'zone', x: DEF_POS[r][0], z: Math.max(6, DEF_POS[r][1] + 3) } : { t: v };
      if (v === 'zone') selRole = r;
      draw();
    });
    help.innerHTML = 'Give every defender a job. For a <b>zone</b>, pick Zone and then click the field to drop his spot. Yellow zones are short, blue zones are deep.';
    return;
  }
  const forms = ed.special ? [['punt', 'Fake punt'], ['fg', 'Fake field goal']] : [['gun', 'Shotgun'], ['trips', 'Trips'], ['single', 'Singleback'], ['pistol', 'Pistol'], ['iform', 'I-Form'], ['spread', 'Spread'], ['bunch', 'Bunch'], ['empty', 'Empty']];
  box.innerHTML = `<label>Formation<div class="seg" id="cr-form"></div></label>
    <label>Play type<div class="seg" id="cr-type"></div></label>
    ${ed.type === 'run' ? '<label>Ball carrier<div class="seg" id="cr-car"></div></label>' : '<label class="check"><input type="checkbox" id="cr-pa"> Play action fake first</label>'}
    <p class="note" style="margin:0">Draw a route for</p>
    <div class="cr-roles">${roles().map(r => `<button type="button" class="cr-role ${r === selRole ? 'on' : ''}" data-r="${r}" style="--rc:${COLS[r]}">${LABEL[r]}${ed.routes[r] && ed.routes[r].length ? ` (${ed.routes[r].length})` : ''}</button>`).join('')}</div>
    <div class="cr-btns"><button class="btn sm" id="cr-undo">Undo point</button><button class="btn sm" id="cr-block">Make ${LABEL[selRole]} block</button></div>`;
  C.seg(C.$('#cr-form'), forms, ed.form, v => { ed.form = v; draw(); });
  C.seg(C.$('#cr-type'), [['pass', 'Pass'], ['run', 'Run']], ed.type, v => { ed.type = v; if (v === 'run') { ed.routes = {}; selRole = ed.carrier; } else { selRole = 'WR1'; } opts(); draw(); });
  if (ed.type === 'run') C.seg(C.$('#cr-car'), [['RB', 'HB'], ['QB', 'QB keeper']], ed.carrier, v => { ed.carrier = v; delete ed.routes[v === 'QB' ? 'RB' : 'QB']; selRole = v; opts(); draw(); });
  else { const pa = C.$('#cr-pa'); pa.checked = !!ed.pa; pa.onchange = () => { ed.pa = pa.checked; }; }
  C.$$('.cr-role', box).forEach(b => b.onclick = () => { selRole = b.dataset.r; opts(); draw(); });
  C.$('#cr-undo').onclick = () => { const r = ed.routes[selRole]; if (r && r.length) r.pop(); if (r && !r.length) delete ed.routes[selRole]; opts(); draw(); };
  C.$('#cr-block').onclick = () => { delete ed.routes[selRole]; opts(); draw(); };
  help.innerHTML = ed.type === 'pass'
    ? `Pick a player, then <b>click the field</b> to add up to 5 points to his route. Players with no route stay in and block. Pick <b>QB</b> to draw a rollout or bootleg he runs before throwing. ${ed.special ? 'The kicker or punter throws it.' : ''}`
    : `Click the field to draw the ${ed.carrier === 'QB' ? 'QB keeper' : 'HB'}'s running lane. Everyone else blocks for him.`;
}
const roles = () => ed.type === 'run' ? [ed.carrier] : ['WR1', 'WR2', 'WR3', 'TE', 'RB', 'QB'];   // QB on a pass play = rollout / bootleg path before he throws

function draw() {
  const svg = C.$('#cr-field');
  let s = `<rect width="400" height="300" fill="#1c6b34"/>`;
  for (let z = -10; z <= 30; z += 5) s += `<line x1="0" x2="400" y1="${Y(z)}" y2="${Y(z)}" stroke="rgba(255,255,255,${z % 10 === 0 ? 0.25 : 0.1})"/>`;
  for (const lx of [-6, 6]) for (let z = -10; z <= 30; z += 1) s += `<line x1="${X(lx) - 3}" x2="${X(lx) + 3}" y1="${Y(z)}" y2="${Y(z)}" stroke="rgba(255,255,255,.18)"/>`;
  s += `<line x1="0" x2="400" y1="${Y(0)}" y2="${Y(0)}" stroke="#60a5fa" stroke-width="2"/><text x="6" y="${Y(0) - 5}" fill="#93c5fd" font-size="10" font-family="sans-serif">Line of scrimmage</text>`;
  for (const z of [10, 20, 30]) s += `<text x="394" y="${Y(z) + 4}" text-anchor="end" fill="rgba(255,255,255,.4)" font-size="10" font-family="sans-serif">+${z}</text>`;
  if (ed.side === 'def') {
    const tgt = { WR1: [-13, 0], WR2: [13, 0], WR3: [-8.5, -1.3], TE: [5.3, -1.15], RB: [1.6, -4.9], QB: [0, -4.5] };
    for (const [r, p] of Object.entries(tgt)) s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="6" fill="none" stroke="${COLS[r]}" stroke-width="2"/><text x="${X(p[0])}" y="${Y(p[1]) + 18}" text-anchor="middle" fill="${COLS[r]}" font-size="9" font-family="sans-serif">${LABEL[r]}</text>`;
    for (const [r, a] of Object.entries(ed.assign)) {
      const p = DEF_POS[r]; if (!p) continue;
      if (a.t === 'zone') { const deep = a.z > 12; s += `<ellipse cx="${X(a.x)}" cy="${Y(a.z)}" rx="${deep ? 44 : 32}" ry="${deep ? 18 : 13}" fill="${deep ? '#3b82f6' : '#eab308'}" opacity=".35"/><line x1="${X(p[0])}" y1="${Y(p[1])}" x2="${X(a.x)}" y2="${Y(a.z)}" stroke="${deep ? '#93c5fd' : '#fde047'}" stroke-width="2"/>`; }
      else if (a.t === 'man') { const q = tgt[a.who]; s += `<line x1="${X(p[0])}" y1="${Y(p[1])}" x2="${X(q[0])}" y2="${Y(q[1])}" stroke="${a.who === 'QB' ? '#c084fc' : '#f87171'}" stroke-width="2" stroke-dasharray="5 4"/>`; }
      else if (a.t === 'rush') s += `<line x1="${X(p[0])}" y1="${Y(p[1])}" x2="${X(p[0] * 0.4)}" y2="${Y(-4)}" stroke="#fb923c" stroke-width="2.4" marker-end="url(#ar)"/>`;
      else if (a.t === 'deep') s += `<line x1="${X(p[0])}" y1="${Y(p[1])}" x2="${X(p[0] * 0.5)}" y2="${Y(24)}" stroke="#60a5fa" stroke-width="2"/>`;
    }
    for (const [r, p] of Object.entries(DEF_POS)) s += `<g class="who" data-r="${r}"><circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${r === selRole ? 8 : 6.5}" fill="#fecaca" stroke="${r === selRole ? '#f6c445' : '#7f1d1d'}" stroke-width="${r === selRole ? 3 : 1.5}"/></g>`;
  } else {
    const f = FORMS[ed.form] || FORMS.gun;
    for (const lx of [-3.5, -1.75, 0, 1.75, 3.5]) s += `<rect x="${X(lx) - 6}" y="${Y(-1) - 6}" width="12" height="12" fill="#cbd5e1"/>`;
    const start = { WR1: f.WR1, WR2: f.WR2, WR3: f.WR3 || [-8.5, -1.3], TE: f.TE || [5.3, -1.15], RB: f.RB, QB: f.QB };
    for (const [r, pts] of Object.entries(ed.routes)) {
      if (!pts.length || !start[r]) continue;
      const all = [start[r], ...pts];
      s += `<polyline points="${all.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${COLS[r]}" stroke-width="${ed.type === 'run' ? 4 : 3}" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#ar-${r})"/>`;
      for (const p of pts) s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="${COLS[r]}"/>`;
    }
    for (const r of ['WR1', 'WR2', 'WR3', 'TE', 'RB', 'QB']) { const p = start[r]; const on = r === selRole; s += `<g class="who" data-r="${r}"><circle cx="${X(p[0])}" cy="${Y(Math.max(p[1], -11.5))}" r="${on ? 9 : 7}" fill="${COLS[r]}" stroke="${on ? '#fff' : '#0a1024'}" stroke-width="${on ? 3 : 1.5}"/><text x="${X(p[0])}" y="${Y(Math.max(p[1], -11.5)) + 3.5}" text-anchor="middle" font-size="9" font-weight="700" font-family="sans-serif" fill="#0a1024">${r === 'RB' ? 'HB' : r === 'QB' ? (ed.special ? 'K' : 'QB') : r === 'TE' ? 'TE' : r === 'WR3' ? 'S' : r.slice(2)}</text></g>`; }
  }
  const markers = Object.entries(COLS).map(([r, c]) => `<marker id="ar-${r}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');
  svg.innerHTML = `<defs>${markers}<marker id="ar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#fb923c"/></marker></defs>${s}`;
}

function onField(e) {
  const svg = C.$('#cr-field');
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const who = e.target.closest && e.target.closest('.who');
  if (who) { selRole = who.dataset.r; if (ed.side === 'off' && !roles().includes(selRole)) selRole = roles()[0]; opts(); draw(); return; }
  const lx = Math.max(-25, Math.min(25, Math.round(LX(p.x) * 2) / 2)), lz = Math.max(-10, Math.min(32, Math.round(LZ(p.y) * 2) / 2));
  if (ed.side === 'def') {
    const a = ed.assign[selRole];
    if (!a || a.t !== 'zone') { msg(`Set ${DEF_NAMES[selRole]} to Zone first, then click to place his spot.`, true); return; }
    a.x = lx; a.z = Math.max(1, lz); draw(); msg('');
    return;
  }
  const r = ed.routes[selRole] || (ed.routes[selRole] = []);
  if (r.length >= 5) { msg('Five points per route is the max. Undo one to change it.', true); return; }
  r.push([lx, lz]); C.sfx.play('ui'); opts(); draw(); msg('');
}

async function save() {
  const name = (C.$('#cr-name').value || '').trim();
  if (!name) return msg('Give your play a name first.', true);
  const mine = load();
  if (!ed.id && mine.length >= MAX) return msg(`You can save up to ${MAX} plays. Delete one first.`, true);
  let def;
  if (ed.side === 'def') def = { id: ed.id || 'c_' + Date.now().toString(36), side: 'def', name, assign: ed.assign };
  else {
    if (ed.type === 'run' && !(ed.routes[ed.carrier] || []).length) return msg('Draw the running lane first.', true);
    if (ed.type === 'pass' && !Object.values(ed.routes).some(r => r.length)) return msg('Draw at least one route first.', true);
    def = { id: ed.id || 'c_' + Date.now().toString(36), side: 'off', special: !!ed.special, name, form: ed.form, type: ed.type, carrier: ed.carrier, pa: !!ed.pa, routes: ed.routes };
  }
  const clean = cleanCustom(def); if (!clean) return msg('That play could not be saved.', true);
  // new plays cost coins to save, edits cost a little
  const P = C.profile && C.profile(), price = ed.id ? EDIT_COST : SAVE_COST;
  if (P) {
    if (P.p.coins < price) return msg(`Saving ${ed.id ? 'changes' : 'a new play'} costs ${price.toLocaleString()} coins. You need ${(price - P.p.coins).toLocaleString()} more.`, true);
    if (!(await askYes(`${ed.id ? 'Save your changes' : 'Save this play'} for ${price.toLocaleString()} coins?`, 'Save'))) return;
    P.p.coins -= price; P.save();
  }
  const out = { ...def };
  if (def.side === 'def') out.preview = { man: clean.man, zone: clean.zone, rush: clean.rush, spy: clean.spy, deep: clean.deep };
  const i = mine.findIndex(p => p.id === out.id);
  if (i >= 0) mine[i] = out; else mine.push(out);
  store(mine);
  C.sfx.play('firstdown'); if (C.unlockAch) C.unlockAch('creator');
  msg(`Saved "${name}"${P ? ` for ${price.toLocaleString()} coins` : ''}. It's in the My Plays tab when you call a play.`);
  ed = fresh(side); C.$('#cr-name').value = '';
  opts(); draw(); list(); costLabel();
}

function list() {
  const mine = load();
  C.$('#cr-count').textContent = `${mine.length} of ${MAX}`;
  const box = C.$('#cr-list');
  box.innerHTML = mine.map(p => `<div class="cr-item"><div>${p.side === 'def' ? C.defSvg(p.preview || {}) : C.routeSvg({ ...p, routes: p.routes || {} })}</div><b>${C.escapeHtml(p.name)}</b>
    <small>${p.side === 'def' ? 'Defense' : p.special ? (p.form === 'fg' ? 'Fake field goal' : 'Fake punt') : `${p.type === 'run' ? 'Run' : 'Pass'}, ${(FORMS[p.form] || FORMS.gun).name}`}</small>
    <div class="row"><button class="btn sm" data-edit="${p.id}">Edit</button><button class="btn sm danger" data-del="${p.id}">Delete</button></div></div>`).join('') || '<p class="note">No plays yet. Draw one above and hit Save.</p>';
  C.$$('[data-del]', box).forEach(b => b.onclick = async () => { if (!(await askYes('Delete this play?', 'Delete'))) return; store(load().filter(p => p.id !== b.dataset.del)); list(); });
  C.$$('[data-edit]', box).forEach(b => b.onclick = () => {
    const p = load().find(q => q.id === b.dataset.edit); if (!p) return;
    side = p.side === 'def' ? 'def' : p.special ? 'st' : 'off';
    ed = JSON.parse(JSON.stringify(p)); if (!ed.routes) ed.routes = {}; delete ed.preview;
    selRole = side === 'def' ? 'LB' : (p.type === 'run' ? p.carrier || 'RB' : 'WR1');
    renderCreator(); C.$('#cr-name').value = p.name; window.scrollTo(0, 0);
  });
}
