// ENDZONE KINGS — in-game Yes/No box. Browser confirm() is blocked in fullscreen and by some browsers,
// which made buttons that asked first silently do nothing.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function askYes(msg, yes = 'Yes', no = 'Cancel') {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 62;
    m.innerHTML = `<div class="panel"><p style="margin:0 0 6px;font-weight:700">${esc(msg)}</p><div style="display:flex;gap:8px"><button class="btn" data-a="0" type="button">${esc(no)}</button><button class="btn primary" data-a="1" type="button" style="flex:1">${esc(yes)}</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.stopPropagation(); done(true); } };
    document.addEventListener('keydown', key, true);
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => done(b.dataset.a === '1'));
    setTimeout(() => m.querySelector('[data-a="1"]').focus(), 30);
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
