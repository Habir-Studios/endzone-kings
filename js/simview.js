// ENDZONE KINGS — watch a simulated game. The real game engine plays it out CPU vs CPU in the background
// while a call-by-call feed tells you what happened and a field strip shows the ball moving, Retro Bowl style.
import { createGame, step, TEAMS } from './sim.js?v=1792633970';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DT = 1 / 60;
const pctOf = z => Math.max(0, Math.min(100, (z + 10) / 120 * 100));
const clockTxt = c => { c = Math.max(0, Math.ceil(c)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`; };
const ordQ = q => q > 4 ? 'OT' : ['1st', '2nd', '3rd', '4th'][q - 1];
const ordD = d => ['1st', '2nd', '3rd', '4th'][Math.max(0, Math.min(3, d - 1))];

export function watchSim({ teams, rosters, names, qlen = 120, diff = 1, logo }) {
  return new Promise(resolve => {
    const g = createGame({ teams, humans: [false, false], quarterLen: qlen, difficulty: diff, rosters: rosters || null, weather: 'clear', tod: 'night', wind: 0 });
    const T = teams.map(i => TEAMS[i]), N = names || T.map(t => t.city);
    const m = document.createElement('div'); m.className = 'modal simv'; m.style.zIndex = 60;
    m.innerHTML = `<div class="panel sv-panel">
      <div class="sv-board">
        <div class="sv-team" style="--c:${T[0].jersey}">${logo ? `<img alt="" src="${logo(teams[0], 56)}">` : ''}<div><small>${esc(N[0])}</small><b>${T[0].abbr}</b></div><span class="sv-sc" id="sv-s0">0</span></div>
        <div class="sv-mid"><b id="sv-q">1st</b><span id="sv-clk">${clockTxt(qlen)}</span><small id="sv-dd"></small></div>
        <div class="sv-team r" style="--c:${T[1].jersey}"><span class="sv-sc" id="sv-s1">0</span><div><small>${esc(N[1])}</small><b>${T[1].abbr}</b></div>${logo ? `<img alt="" src="${logo(teams[1], 56)}">` : ''}</div>
      </div>
      <div class="sv-field" id="sv-field">
        <div class="sv-ez l" style="background:${T[0].jersey}"><span>${T[0].abbr}</span></div>
        <div class="sv-ez r" style="background:${T[1].jersey}"><span>${T[1].abbr}</span></div>
        ${[10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => `<i class="sv-num" style="left:${pctOf(y)}%">${y <= 50 ? y : 100 - y}</i>`).join('')}
        <div class="sv-los" id="sv-los"></div><div class="sv-fd" id="sv-fd"></div>
        <div class="sv-ball" id="sv-ball"><i></i></div>
        <div class="sv-pos" id="sv-pos"></div>
      </div>
      <div class="sv-big hidden" id="sv-big"></div>
      <ol class="sv-feed" id="sv-feed"></ol>
      <div class="sv-ctl"><span class="note">Speed</span><div class="seg" id="sv-speed"><button type="button" data-sp="1">1x</button><button type="button" data-sp="2" class="on">2x</button><button type="button" data-sp="4">4x</button></div><button class="btn" id="sv-skip" type="button">Skip to final</button></div>
    </div>`;
    document.body.appendChild(m);
    const $ = id => m.querySelector('#' + id);
    let speed = 2, hold = 0, lastMsg = null, lastFlash = null, lastQ = 1, done = false, ballZ = g.ball.z, skipping = false;
    m.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { speed = +b.dataset.sp; m.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b)); });
    const feed = (txt, sub, cls = '') => {
      const li = document.createElement('li'); li.className = cls;
      li.innerHTML = `<span class="sv-t">${ordQ(g.quarter)} ${clockTxt(g.clock)}</span><b>${esc(txt)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
      const f = $('sv-feed'); f.prepend(li); while (f.children.length > 60) f.lastChild.remove();
    };
    const big = (txt, team) => { const el = $('sv-big'); el.textContent = txt; el.style.setProperty('--c', T[team] ? T[team].jersey : '#f6c445'); el.classList.remove('hidden'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); setTimeout(() => el.classList.add('hidden'), 1500 / speed + 400); };
    const abbr = t => T[t] ? T[t].abbr : '';
    feed('Kickoff', `${N[0]} vs ${N[1]}`, 'k');
    function watchEvents() {
      if (g.msg && g.msg !== lastMsg) {
        lastMsg = g.msg; const t = g.msg.text || '', sub = g.msg.sub || '';
        const isTD = /TOUCHDOWN/.test(t), isScore = isTD || /IT'S GOOD|FIELD GOAL|SAFETY|2-POINT GOOD/.test(t), isTO = /INTERCEPT|FUMBLE|TURNOVER/.test(t);
        feed(`${abbr(g.play ? g.play.off : g.poss)} · ${t.replace(/!+$/, '!')}`, sub, isScore ? 'score' : isTO ? 'to' : /FIRST DOWN|GAIN OF (1[5-9]|[2-9]\d)/.test(t) ? 'big' : '');
        if (isTD) big('TOUCHDOWN', g.msg.team ?? (g.play ? g.play.off : 0)); else if (isTO) big(t.replace(/!+$/, ''), g.poss);
        hold = (isScore || isTO ? 1.6 : 0.85);
      }
      if (g.flash && g.flash !== lastFlash) { lastFlash = g.flash; const t = g.flash.text || ''; if (/INTERCEPTED|FUMBLE|SACK|INJURY|BLOCKED/.test(t)) { feed(t, '', /INJURY/.test(t) ? 'inj' : 'to'); hold = Math.max(hold, 1.1); } }
      if (g.quarter !== lastQ) { feed(g.quarter > 4 ? 'Overtime' : g.quarter === 3 ? 'Halftime is over: 3rd quarter' : `End of the ${ordQ(lastQ)} quarter`, `${abbr(0)} ${g.score[0]}, ${abbr(1)} ${g.score[1]}`, 'k'); lastQ = g.quarter; }
    }
    function paint(dt) {
      ballZ += (g.ball.z - ballZ) * Math.min(1, dt * 10);
      $('sv-ball').style.left = pctOf(ballZ) + '%';
      $('sv-ball').classList.toggle('air', g.ball.state === 'air' || g.ball.state === 'kick');
      const pre = g.phase === 'presnap' || g.phase === 'dead';
      $('sv-los').style.left = pctOf(g.losZ) + '%'; $('sv-fd').style.left = pctOf(g.fdZ) + '%';
      $('sv-fd').style.opacity = g.fdZ > 100 || g.fdZ < 0 || g.phase === 'kickset' ? 0 : 1;
      const dir = g.poss === 0 ? 1 : -1;
      $('sv-pos').innerHTML = `<i style="background:${T[g.poss].jersey}"></i>${abbr(g.poss)} ball ${dir > 0 ? '→' : '←'}`;
      $('sv-s0').textContent = g.score[0]; $('sv-s1').textContent = g.score[1];
      $('sv-q').textContent = ordQ(g.quarter); $('sv-clk').textContent = clockTxt(g.clock);
      const yl = g.poss === 0 ? g.losZ : 100 - g.losZ, side = yl < 50 ? abbr(g.poss) : yl > 50 ? abbr(1 - g.poss) : '';
      $('sv-dd').textContent = pre && g.down ? `${ordD(g.down)} & ${g.togo + (g.poss === 0 ? g.losZ : 100 - g.losZ) >= 100 ? 'Goal' : Math.max(1, Math.round(g.togo))} · ${side} ${Math.round(yl > 50 ? 100 - yl : yl)}` : '';
    }
    function finish() {
      if (done) return; done = true;
      paint(1);
      feed('Final', `${N[0]} ${g.score[0]}, ${N[1]} ${g.score[1]}`, 'final');
      m.querySelector('.sv-ctl').innerHTML = `<b class="sv-final">FINAL: ${abbr(0)} ${g.score[0]} – ${abbr(1)} ${g.score[1]}</b><button class="btn primary" id="sv-done" type="button">Continue</button>`;
      $('sv-done').onclick = () => { m.remove(); resolve({ sc: g.score.slice(), ps: Object.values(g.ps), injLog: g.injLog.slice() }); };
    }
    // play it out: live plays at watchable speed, everything between plays fast, a short pause on each result
    let last = performance.now();
    function frame(now) {
      if (done || skipping) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (hold > 0) hold -= dt * speed;
      else {
        let budget = g.phase === 'live' || g.phase === 'kick' ? Math.round(dt * 60 * 2.2 * speed) : 900;
        while (budget-- > 0 && g.phase !== 'gameover') {
          const was = g.phase; step(g, DT, [{}, {}]); g.events.length = 0; watchEvents();
          if (hold > 0) break;
          if ((was !== 'live' && g.phase === 'live') || (was !== 'kick' && g.phase === 'kick')) break;   // a new play starts: slow down to watch it
        }
      }
      paint(dt);
      if (g.phase === 'gameover') return finish();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    $('sv-skip').onclick = () => {
      skipping = true; $('sv-skip').disabled = true; $('sv-skip').textContent = 'Finishing…';
      const chunk = () => { let n = 0; while (n++ < 6000 && g.phase !== 'gameover') { step(g, DT, [{}, {}]); g.events.length = 0; watchEvents(); } if (g.phase === 'gameover') finish(); else setTimeout(chunk, 0); };
      chunk();
    };
  });
}
