// ENDZONE KINGS — in-game Yes/No box. Browser confirm() is blocked in fullscreen and by some browsers,
// which made buttons that asked first silently do nothing.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function askYes(msg, yes = 'Yes', no = 'Cancel') {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
    m.innerHTML = `<div class="panel"><p style="margin:0 0 6px;font-weight:700">${esc(msg)}</p><div style="display:flex;gap:8px"><button class="btn" data-a="0" type="button">${esc(no)}</button><button class="btn primary" data-a="1" type="button" style="flex:1">${esc(yes)}</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); document.removeEventListener('keydown', key, true); res(v); };
    // Enter presses whichever button has focus (Cancel by default, so a stray Enter never confirms)
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); }
      else if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); const f = document.activeElement; if (f && m.contains(f) && f.dataset.a) done(f.dataset.a === '1'); }
    };
    document.addEventListener('keydown', key, true);
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => done(b.dataset.a === '1'));
    setTimeout(() => { const c = m.querySelector('[data-a="0"]'); if (c && m.isConnected) c.focus(); }, 30);
  });
}
// pick one option from a list (replaces prompt() menus)
export function askPick(title, options) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
    m.innerHTML = `<div class="panel"><p style="margin:0 0 6px;font-weight:700">${esc(title)}</p><div style="display:flex;flex-direction:column;gap:6px">${options.map(([v, n], i) => `<button class="btn" data-v="${i}" type="button">${esc(n)}</button>`).join('')}</div><button class="btn ghost" data-x type="button" style="margin-top:8px">Cancel</button></div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { m.remove(); res(options[+b.dataset.v][0]); });
    m.querySelector('[data-x]').onclick = () => { m.remove(); res(null); };
  });
}
// a read-only info card (injury details and such)
export function showInfo(title, html) {
  const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
  m.innerHTML = `<div class="panel info-card"><h3 style="margin:0">${esc(title)}</h3>${html}<button class="btn primary" type="button" data-x>Got it</button></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  m.querySelector('[data-x]').onclick = close; m.onclick = e => { if (e.target === m) close(); };
}
// the injury card: what he has, how long he's out, when he's back
export function injuryCard(p) {
  const inj = p.inj, ling = p.ling, fat = Math.round((p.fat || 0) * 100);
  const total = inj ? (inj.total || inj.weeks) : 0, done = inj ? Math.max(0, total - inj.weeks) : 0;
  const status = inj ? `<div class="ic-status out">OUT</div>` : ling ? `<div class="ic-status q">BANGED UP</div>` : `<div class="ic-status ok">HEALTHY</div>`;
  const body = inj ? `<div class="ic-row"><b>${esc(inj.kind)}</b><span>Out ${inj.weeks} more week${inj.weeks === 1 ? '' : 's'}${p.backWeek ? ` · back around week ${p.backWeek}` : ''}</span></div>
      <div class="ic-bar" title="Recovery"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div><small class="note">A backup plays his spot until he's healthy. When he comes back he'll play banged up (ratings -3) for 2 weeks.</small>`
    : ling ? `<div class="ic-row"><b>${esc(ling.kind)}</b><span>Playing through it, ${ling.weeks} week${ling.weeks === 1 ? '' : 's'} left</span></div><small class="note">He plays, but all his ratings are down 3 until it clears.</small>`
    : `<small class="note">No injuries.</small>`;
  const f = p.form || 0;
  return `<div class="ic">${status}<div class="ic-who"><b>${esc(p.name)}</b><small>${esc(p.pos || '')}</small></div>${body}
    <div class="ic-meta">${p.fat != null ? `<span>Fatigue <b>${fat}%</b></span>` : ''}<span>Form <b class="${f >= 1.5 ? 'hot' : f <= -1.5 ? 'cold' : ''}">${f > 0 ? '+' : ''}${Math.round(f)}</b></span></div></div>`;
}
