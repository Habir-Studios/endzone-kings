// ENDZONE KINGS — live attribute form and lingering injuries.
// A player's ratings run hot or cold off his last few games: a big game bumps every rating a little,
// a bad one drops them. Coming back from an injury he plays a little banged up for a week or two.
import { getRoster } from './teams.js?v=1792637380';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RK = ['spd', 'hands', 'acc', 'arm', 'elu', 'blk', 'rush', 'tkl', 'cov'];
export const roleGroup = r => ({ QB: 'QB', RB: 'RB', WR1: 'WR', WR2: 'WR', WR3: 'WR', TE: 'TE', DL1: 'DL', DL2: 'DL', DL3: 'DL', DL4: 'DL', LB: 'LB', LB2: 'LB', LB3: 'LB', CB1: 'CB', CB2: 'CB', S: 'S', SS: 'S' }[r] || 'OL');
const BASE = { QB: 14, RB: 9, WR: 6, TE: 4, DL: 3, LB: 5, CB: 3, S: 4 };
// how a game went for one player, -2.5 (awful) .. +2.5 (monster game)
export function grade(s, role, won, margin = 0) {
  const g = roleGroup(role);
  if (g === 'OL') return clamp((won ? 0.8 : -0.6) + margin / 28, -1.5, 1.5);
  const sc = (s.py || 0) / 25 + (s.ptd || 0) * 4 + (s.ry || 0) / 10 + (s.recy || 0) / 10 + (s.rec || 0) * 0.8 + (s.td || 0) * 6 + (s.tk || 0) * 1.2 + (s.sk || 0) * 4 + (s.int || 0) * 5;
  const b = BASE[g];
  return clamp((sc - b) / Math.max(4, b) * 1.6 + (won ? 0.3 : -0.2), -2.5, 2.5);
}
export const nextForm = (f, d) => clamp(Math.round(((f || 0) * 0.6 + d) * 10) / 10, -5, 5);
export const decay = f => Math.abs((f || 0) * 0.7) < 0.2 ? 0 : Math.round((f || 0) * 7) / 10;
// ratings for the game: form plus any lingering knock
export function formed(pl, f, ling) {
  const d = Math.round(f || 0) - (ling ? 3 : 0); if (!d || !pl) return pl;
  const q = { ...pl }; for (const k of RK) if (q[k] != null) q[k] = clamp(q[k] + d, 30, 99);
  if (q.ovr != null) q.ovr = clamp(q.ovr + d, 30, 99); return q;
}
export function formTag(f, ling) {
  const t = [];
  if ((f || 0) >= 1.5) t.push(`<i class="form-tag hot" title="Playing well lately: ratings up">▲ Hot +${Math.round(f)}</i>`);
  else if ((f || 0) <= -1.5) t.push(`<i class="form-tag cold" title="Struggling lately: ratings down">▼ Cold ${Math.round(f)}</i>`);
  if (ling) t.push(`<i class="form-tag ling" title="Playing through ${ling.kind}: ratings -3">✚ ${ling.kind}, ${ling.weeks} wk</i>`);
  return t.join('');
}
// ---------- Season mode (team rosters, not your own players): form, injuries and knocks are tracked per spot ----------
export function seasonRoster(S) {
  const base = getRoster(S.team), players = {};
  S.form = S.form || {}; S.inj = S.inj || {}; S.ling = S.ling || {};
  for (const [role, p] of Object.entries(base.players)) {
    let q = p;
    if (S.inj[role]) { q = { ...p, first: 'Backup', last: p.last, name: `Backup ${role}`, num: (p.num + 37) % 100 }; for (const k of RK) q[k] = Math.max(40, (p[k] || 60) - 8); q.ovr = Math.max(50, (p.ovr || 70) - 8); }
    else q = formed(p, S.form[role], S.ling[role]);
    players[role] = q;
  }
  return { ...base, players };
}
// after a season week (played or simmed): update form from the box score, carry injuries forward a week
export function seasonAfterGame(S, ps, injLog, myIdx, won, margin) {
  S.form = S.form || {}; S.inj = S.inj || {}; S.ling = S.ling || {};
  const played = new Set();
  for (const s of ps || []) if (s.t === myIdx && !S.inj[s.role]) { S.form[s.role] = nextForm(S.form[s.role], grade(s, s.role, won, margin)); played.add(s.role); }
  for (const r of Object.keys(S.form)) if (!played.has(r)) S.form[r] = decay(S.form[r]);
  return tickInjuries(S, (injLog || []).filter(j => j.team === myIdx));
}
export function tickInjuries(S, newInj) {
  S.inj = S.inj || {}; S.ling = S.ling || {};
  const notes = [];
  for (const r of Object.keys(S.ling)) { if (--S.ling[r].weeks <= 0) delete S.ling[r]; }
  for (const r of Object.keys(S.inj)) { const j = S.inj[r]; if (--j.weeks <= 0) { delete S.inj[r]; S.ling[r] = { kind: j.kind, weeks: 2 }; notes.push(`${j.name} is back from ${j.kind} but still banged up`); } }
  for (const j of newInj || []) {
    if (j.out === 'weeks') { S.inj[j.role] = { name: j.name, kind: j.kind, weeks: j.weeks, total: j.weeks }; notes.push(`${j.name}: ${j.kind}, out ${j.weeks} weeks`); }
    else S.ling[j.role] = { kind: j.kind, weeks: j.out === 'game' ? 2 : 1 };
  }
  return notes;
}
