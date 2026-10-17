// ENDZONE KINGS — playbook data: formations, plays, coverages, team styles, custom plays.
// Coordinates are offense-relative [lateral, depth]: depth > 0 is downfield, lateral < 0 shows on the left of the screen.

export const FORMS = {
  gun:    { name: 'Shotgun',     QB: [0, -4.5], RB: [1.6, -4.9], WR1: [-13, -0.6], WR2: [13, -0.6] },
  trips:  { name: 'Gun Trips',   QB: [0, -4.5], RB: [1.6, -4.9], WR1: [-15, -0.6], WR2: [-8, -1.3] },
  single: { name: 'Singleback',  QB: [0, -1.2], RB: [0, -5.6], WR1: [-13, -0.6], WR2: [12, -0.6] },
  punt:   { name: 'Punt',        QB: [0, -12], RB: [2.5, -5], WR1: [-20, -0.6], WR2: [20, -0.6] },
  fg:     { name: 'Field Goal',  QB: [0, -7], RB: [1.5, -9.5], WR1: [-5, -1], WR2: [5, -1] },
};
export const LINE = { C: [0, -0.9], LG: [-1.75, -1.0], RG: [1.75, -1.0] };

export const OFF_CATS = ['Quick', 'Deep', 'Run', 'Play Action', 'Screen', 'Special'];
export const DEF_CATS = ['Man', 'Zone', 'Blitz'];

const P = (o) => ({ type: 'pass', drop: -7, ...o });
export const OFF_PLAYS = [
  // ---- quick
  P({ id: 'slants', cat: 'Quick', form: 'gun', name: 'Quick Slants', tip: 'Fast inside cuts, beats the blitz',
    routes: { WR1: [[-13, 3], [-9, 9], [-3, 17]], WR2: [[13, 3], [9, 9], [3, 17]], RB: [[5, -3], [13, 0], [21, 2]] } }),
  P({ id: 'curlflat', cat: 'Quick', form: 'gun', name: 'Curl Flat', tip: 'Safe chunk yards vs zone',
    routes: { WR1: [[-13, 11], [-15, 9.5, 'stop']], WR2: [[13, 7], [24, 7.5, 'stop']], RB: [[-6, -2], [-14, 1], [-22, 2]] } }),
  P({ id: 'mesh', cat: 'Quick', form: 'gun', name: 'Mesh', tip: 'Crossers rub off man coverage',
    routes: { WR1: [[-13, 2], [-6, 5], [8, 6], [20, 7]], WR2: [[13, 2], [6, 4], [-8, 5], [-20, 6]], RB: [[4, -3], [2, 4, 'stop']] } }),
  P({ id: 'stick', cat: 'Quick', form: 'trips', name: 'Trips Stick', tip: 'Slot sits at the sticks',
    routes: { WR1: [[-15, 5], [-17, 6, 'stop']], WR2: [[-8, 5], [-7.5, 5.5, 'stop']], RB: [[5, -3], [12, 0], [18, 1]] } }),
  // ---- deep
  P({ id: 'postdig', cat: 'Deep', form: 'gun', name: 'Post Dig', tip: 'Deep shot + crosser',
    routes: { WR1: [[-13, 9], [-7, 26], [-2, 45]], WR2: [[13, 11], [3, 12], [-14, 13]], RB: [[2, 0], [2.5, 4, 'stop']] } }),
  P({ id: 'verts', cat: 'Deep', form: 'gun', name: 'Four Verts', tip: 'Go deep, needs time', drop: -8,
    routes: { WR1: [[-13, 50]], WR2: [[13, 50]], RB: [[-1, 0], [-1.5, 5, 'stop']] } }),
  P({ id: 'smash', cat: 'Deep', form: 'gun', name: 'Smash', tip: 'Corner over a hitch, kills Cover 2',
    routes: { WR1: [[-13, 10], [-20, 20], [-22, 32]], WR2: [[13, 6], [13, 5, 'stop']], RB: [[5, -3], [13, 0], [20, 2]] } }),
  P({ id: 'flood', cat: 'Deep', form: 'trips', name: 'Trips Flood', tip: 'Three levels to one side', drop: -8,
    routes: { WR1: [[-15, 45]], WR2: [[-8, 11], [-20, 12]], RB: [[-4, -3], [-12, 0], [-18, 1]] } }),
  // ---- run
  { id: 'dive', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'HB Dive', tip: 'Downhill up the middle', hand: 0.45,
    routes: { RB: [[0.7, -3], [0.8, 0.5]] } },
  { id: 'toss', cat: 'Run', form: 'single', type: 'run', name: 'HB Toss', tip: 'Bounce it to the edge', pitch: 0.32,
    routes: { RB: [[4, -6], [11, -3], [13, 0.5]] } },
  { id: 'counter', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'HB Stretch', tip: 'Outside zone, cut it up', hand: 0.45,
    routes: { RB: [[-1.1, -3.4], [-6, -2.8], [-10, 0.5]] } },
  { id: 'draw', inside: true, cat: 'Run', form: 'gun', type: 'run', name: 'HB Draw', tip: 'Fake pass, hand it late', hand: 0.85, qbDrop: -6,
    routes: { RB: [[1.4, -4.6], [0.6, -4.4], [0.6, 1]] } },
  { id: 'sneak', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'QB Sneak', tip: 'Short yardage push', qbRun: true,
    routes: { QB: [[0.6, 0.5], [0.6, 3]] } },
  // ---- play action
  P({ id: 'paboot', cat: 'Play Action', form: 'single', name: 'PA Boot', tip: 'Fake the dive, roll out', pa: 0.65, qbPath: [[3, -5], [9, -5]],
    routes: { WR1: [[-13, 8], [0, 12], [14, 14]], WR2: [[12, 10], [19, 22]], RB: [[0.8, -3], [1, -1], [8, 0], [16, 1]] } }),
  P({ id: 'padeep', cat: 'Play Action', form: 'single', name: 'PA Deep Post', tip: 'Sell the run, go over the top', pa: 0.65, drop: -8,
    routes: { WR1: [[-13, 10], [-5, 28], [0, 45]], WR2: [[12, 45]], RB: [[0.8, -3], [0.8, -1.5, 'stop']] }, block: ['RB'] }),
  // ---- screens
  P({ id: 'rbscreen', cat: 'Screen', form: 'gun', name: 'HB Screen', tip: 'Let them rush, dump it off', screen: 1.1, drop: -8,
    routes: { WR1: [[-13, 30]], WR2: [[13, 30]], RB: [[5, -4], [9, -4.5, 'stop']] } }),
  P({ id: 'bubble', cat: 'Screen', form: 'trips', name: 'Bubble Screen', tip: 'Quick throw to the slot, WR blocks', drop: -5,
    routes: { WR2: [[-10, -2.5], [-12, -2.5, 'stop']], RB: [[5, -3], [10, -1, 'stop']] }, block: ['WR1'] }),
  // ---- special (fakes)
  { id: 'fakepunt', cat: 'Special', form: 'punt', type: 'run', name: 'Fake Punt', tip: 'Punter takes off', qbRun: true,
    routes: { QB: [[6, -9], [11, -2], [12, 8]] } },
  P({ id: 'fakefg', cat: 'Special', form: 'fg', name: 'Fake FG', tip: 'Holder throws it', drop: -8,
    routes: { WR2: [[5, -1], [8, 5], [9, 20]], WR1: [[-5, -1], [-12, 2], [-18, 4]], RB: [[3, -8], [10, -4], [14, 0]] } }),
];
export const KICK_PLAYS = [
  { id: 'fg', cat: 'Special', name: 'Field Goal', tip: 'Kick it through' },
  { id: 'punt', cat: 'Special', name: 'Punt', tip: 'Flip the field' },
  { id: 'xp', cat: 'Special', name: 'Extra Point', tip: 'Kick for 1' },
];

// defense: man {role: targetRole}, zone {role: [lateral, depth]}, rush [roles], spy [roles]. DL rush unless zoned.
export const DEF_PLAYS = [
  { id: 'cover1', cat: 'Man', name: 'Cover 1 Man', tip: 'Tight man, safety deep', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, deep: ['S'] },
  { id: 'manspy', cat: 'Man', name: 'Man QB Spy', tip: 'LB mirrors the QB', man: { CB1: 'WR1', CB2: 'WR2', S: 'RB' }, spy: ['LB'] },
  { id: 'press', cat: 'Man', name: 'Press Man', tip: 'Jam at the line, risky deep', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, deep: ['S'], press: true },
  { id: 'cover2', cat: 'Zone', name: 'Cover 2', tip: 'Two deep halves, flats covered', zone: { CB1: [-12, 4], CB2: [12, 4], LB: [0, 8], S: [0, 18] } },
  { id: 'cover3', cat: 'Zone', name: 'Cover 3', tip: 'Deep thirds, keep it in front', zone: { CB1: [-13, 15], CB2: [13, 15], S: [0, 19], LB: [0, 7] } },
  { id: 'cover4', cat: 'Zone', name: 'Cover 4', tip: 'Quarters, stops the deep ball', zone: { CB1: [-12, 21], CB2: [12, 21], S: [0, 24], LB: [0, 8] } },
  { id: 'prevent', cat: 'Zone', name: 'Prevent', tip: 'Give up short, never deep', zone: { CB1: [-14, 28], CB2: [14, 28], S: [0, 34], LB: [0, 13], DL2: [0, 7] } },
  { id: 'cover0', cat: 'Blitz', name: 'Cover 0 Blitz', tip: 'Everybody comes, no help', man: { CB1: 'WR1', CB2: 'WR2', S: 'RB' }, rush: ['LB'], press: true },
  { id: 'sblitz', cat: 'Blitz', name: 'Safety Blitz', tip: 'Surprise heat off the edge', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, rush: ['S'] },
  { id: 'firezone', cat: 'Blitz', name: 'Fire Zone', tip: 'LB blitzes, DT drops', zone: { CB1: [-13, 15], CB2: [13, 15], S: [0, 19], DL2: [0, 6] }, rush: ['LB'] },
];

// ---------------- team playbook styles ----------------
export const OFF_STYLES = {
  air:      { name: 'Air Raid',       plays: ['slants', 'curlflat', 'mesh', 'stick', 'postdig', 'verts', 'smash', 'flood', 'draw', 'toss', 'bubble', 'rbscreen', 'padeep'], weight: { Quick: 3, Deep: 3, Run: 1, 'Play Action': 1, Screen: 1.5 } },
  ground:   { name: 'Smashmouth',     plays: ['dive', 'toss', 'counter', 'sneak', 'draw', 'paboot', 'padeep', 'slants', 'curlflat', 'smash', 'rbscreen'], weight: { Quick: 1.2, Deep: 0.8, Run: 4, 'Play Action': 2, Screen: 0.8 } },
  west:     { name: 'West Coast',     plays: ['slants', 'curlflat', 'mesh', 'stick', 'smash', 'postdig', 'dive', 'toss', 'counter', 'paboot', 'rbscreen', 'bubble'], weight: { Quick: 3.5, Deep: 1.2, Run: 2, 'Play Action': 1.5, Screen: 1.5 } },
  balanced: { name: 'Balanced',       plays: ['slants', 'curlflat', 'mesh', 'postdig', 'verts', 'flood', 'dive', 'toss', 'counter', 'draw', 'sneak', 'paboot', 'padeep', 'rbscreen'], weight: { Quick: 2, Deep: 1.5, Run: 2.5, 'Play Action': 1.2, Screen: 1 } },
};
export const DEF_STYLES = {
  pressure: { name: 'Pressure 4-3', plays: ['cover1', 'press', 'cover3', 'cover2', 'cover0', 'sblitz', 'firezone', 'manspy'], weight: { Man: 2, Zone: 1.5, Blitz: 3 } },
  zone:     { name: 'Bend Don’t Break', plays: ['cover2', 'cover3', 'cover4', 'prevent', 'cover1', 'firezone', 'manspy'], weight: { Man: 1, Zone: 4, Blitz: 1 } },
  lockdown: { name: 'Lockdown Man', plays: ['cover1', 'press', 'manspy', 'cover3', 'cover2', 'cover0', 'sblitz'], weight: { Man: 4, Zone: 1.5, Blitz: 1.5 } },
};
const OFF_STYLE_KEYS = Object.keys(OFF_STYLES), DEF_STYLE_KEYS = Object.keys(DEF_STYLES);
const SIG_NAMES = ['Special', 'Express', 'Heater', 'Thunder', 'Dagger', 'Haymaker', 'Lightning', 'Crown'];

function h32(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return (n ^ (n >>> 16)) >>> 0; }

export function teamStyle(ti) {
  const h = h32(ti + 17);
  return { off: OFF_STYLE_KEYS[h % OFF_STYLE_KEYS.length], def: DEF_STYLE_KEYS[(h >>> 8) % DEF_STYLE_KEYS.length], sig: SIG_NAMES[(h >>> 16) % SIG_NAMES.length] };
}

// each team's signature play: a mirrored / re-depthed version of a play from its style
export function signaturePlay(ti, abbr, city) {
  const st = teamStyle(ti), list = OFF_STYLES[st.off].plays.map(id => OFF_PLAYS.find(p => p.id === id)).filter(p => p.type === 'pass' && p.cat !== 'Screen');
  const base = list[h32(ti * 7 + 3) % list.length];
  const flip = h32(ti) % 2 ? -1 : 1, deep = 1 + ((h32(ti * 13) % 5) - 2) * 0.06;
  const routes = {};
  for (const [k, pts] of Object.entries(base.routes)) routes[k] = pts.map(w => [w[0] * (k === 'RB' ? 1 : 1), w[1] > 2 ? w[1] * deep : w[1], ...(w[2] ? [w[2]] : [])]);
  if (flip < 0) { const a = routes.WR1, b = routes.WR2; if (a && b && base.form === 'gun') { routes.WR1 = b.map(w => [-w[0], w[1], ...w.slice(2)]); routes.WR2 = a.map(w => [-w[0], w[1], ...w.slice(2)]); } }
  return { ...base, id: 'sig_' + abbr, name: `${city} ${st.sig}`, tip: `${abbr} signature play`, signature: true, routes };
}

export function teamPlaybook(ti, team) {
  const st = teamStyle(ti);
  const off = OFF_STYLES[st.off].plays.slice();
  if (!off.includes('fakepunt')) off.push('fakepunt');
  if (!off.includes('fakefg')) off.push('fakefg');
  return { style: st, offName: OFF_STYLES[st.off].name, defName: DEF_STYLES[st.def].name, off, def: DEF_STYLES[st.def].plays.slice(), sig: team ? signaturePlay(ti, team.abbr, team.city) : null };
}

// ---------------- custom plays ----------------
const num = (v, a, b, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanCustom(def) {
  if (!def || typeof def !== 'object') return null;
  const id = String(def.id || '').replace(/[^a-z0-9_]/gi, '').slice(0, 24);
  if (!id.startsWith('c_')) return null;
  const name = String(def.name || 'My Play').replace(/[<>]/g, '').slice(0, 22) || 'My Play';
  if (def.side === 'def') {
    const roles = ['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S'], tgts = ['WR1', 'WR2', 'RB', 'QB'];
    const out = { id, name, side: 'def', cat: 'Custom', tip: 'Your custom defense', man: {}, zone: {}, rush: [], spy: [], deep: [] };
    for (const r of roles) {
      const a = def.assign && def.assign[r]; if (!a) continue;
      if (a.t === 'rush') out.rush.push(r);
      else if (a.t === 'man' && tgts.includes(a.who)) { if (a.who === 'QB') out.spy.push(r); else out.man[r] = a.who; }
      else if (a.t === 'zone') out.zone[r] = [num(a.x, -24, 24), num(a.z, 1, 35, 8)];
      else if (a.t === 'deep') out.deep.push(r);
    }
    return out;
  }
  const form = FORMS[def.form] && def.form !== 'punt' && def.form !== 'fg' ? def.form : (def.special && FORMS[def.form] ? def.form : 'gun');
  const type = def.type === 'run' ? 'run' : 'pass';
  const routes = {};
  for (const r of ['WR1', 'WR2', 'RB', 'QB']) {
    const pts = def.routes && def.routes[r];
    if (!Array.isArray(pts) || !pts.length) continue;
    routes[r] = pts.slice(0, 6).map(w => [num(w[0], -25, 25), num(w[1], -12, 55), ...(w[2] === 'stop' ? ['stop'] : [])]);
  }
  const out = { id, name, side: 'off', cat: def.special ? 'Special' : 'Custom', form, type, tip: 'Your custom play', routes, drop: -7, custom: true };
  if (type === 'run') {
    if (def.carrier === 'QB') out.qbRun = true; else out.hand = num(def.hand, 0.3, 1.2, 0.5);
  }
  if (def.pa) out.pa = 0.65;
  return out;
}
