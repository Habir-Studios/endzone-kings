// ENDZONE KINGS — playoff bracket view (Season and Franchise): wild card → divisional → conference → Kings Bowl
import { TEAMS } from './teams.js?v=1792520257';
const RN = [['wildcard', 'Wild Card'], ['divisional', 'Divisional'], ['conference', 'Conference'], ['final', 'Kings Bowl']];
const win = g => g.hs == null ? -1 : g.hs >= g.as ? g.home : g.away;
export function bracketHTML(S, me, logo) {
  const P = S && S.playoffs; if (!P || !P.rounds) return '';
  const seedOf = t => { const a = P.afc.indexOf(t), n = P.nfc.indexOf(t); return a >= 0 ? a + 1 : n >= 0 ? n + 1 : ''; };
  const team = (t, sc, w) => t == null ? '<div class="bk-t tbd"><span>TBD</span></div>' :
    `<div class="bk-t ${t === me ? 'me' : ''} ${w === t ? 'won' : w >= 0 ? 'lost' : ''}"><i>${seedOf(t)}</i>${logo ? `<img alt="" src="${logo(t, 32)}">` : ''}<span>${TEAMS[t].abbr}</span><b>${sc == null ? '' : sc}</b></div>`;
  const game = g => `<div class="bk-g">${team(g.away, g.as, win(g))}${team(g.home, g.hs, win(g))}</div>`;
  const byes = `<div class="bk-g bye">${team(P.afc[0], null, -1)}<small>AFC bye</small></div><div class="bk-g bye">${team(P.nfc[0], null, -1)}<small>NFC bye</small></div>`;
  const cols = RN.map(([k, name]) => { const gs = P.rounds[k]; return `<div class="bk-col"><h4>${name}</h4>${gs ? gs.map(game).join('') : '<div class="bk-g pending"><span>Not played yet</span></div>'}${k === 'wildcard' ? byes : ''}</div>`; }).join('');
  return `<div class="bracket">${cols}</div>${S.champion != null ? `<p class="bk-champ">🏆 ${TEAMS[S.champion].city} won the Kings Bowl</p>` : ''}`;
}
