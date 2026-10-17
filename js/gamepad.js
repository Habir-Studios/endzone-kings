// ENDZONE KINGS — controller support (Xbox / PlayStation / Switch style pads through the Gamepad API).
// Touch a controller and the game switches to controller controls and button prompts; touch the keyboard or mouse
// (or unplug the pad) and it switches back.
//
// Buttons use the standard layout: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 4 LB, 5 RB, 6 LT, 7 RT,
// 8 View/Share, 9 Menu/Options, 10 L3, 11 R3, 12-15 D-pad up/down/left/right.

let C = null;
export const pad = { on: false, jx: 0, jy: 0, sprint: false, rx: 0, ry: 0, kind: 'xbox', id: '' };
const prev = [], held = [];
const DEAD = 0.2;

// which face button means what, for the prompts
export function glyphs() {
  if (pad.kind === 'ps') return { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'Share', Menu: 'Options', LS: 'L', RS: 'R', R3: 'R3' };
  if (pad.kind === 'switch') return { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', View: '−', Menu: '+', LS: 'L', RS: 'R', R3: 'R3' };
  return { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', View: 'View', Menu: 'Menu', LS: 'LS', RS: 'RS', R3: 'R3' };
}
function kindOf(id) { const s = id.toLowerCase(); if (/054c|playstation|dualsense|dualshock|wireless controller/.test(s)) return 'ps'; if (/057e|nintendo|switch|pro controller|joy-con/.test(s)) return 'switch'; return 'xbox'; }

function setMode(on) {
  if (pad.on === on) return;
  pad.on = on;
  document.body.classList.toggle('pad-mode', on);
  if (!on) { pad.jx = pad.jy = 0; pad.sprint = false; }
  C.onModeChange && C.onModeChange(on);
  C.toast(on ? `Controller connected: ${pad.kind === 'ps' ? 'PlayStation' : pad.kind === 'switch' ? 'Switch' : 'Xbox'} controls` : 'Keyboard and mouse controls', 1800);
}

// fake a key press so every control works the same as the keyboard version
function tap(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 40);
}

export function initGamepad(ctx) {
  C = ctx;
  window.addEventListener('gamepadconnected', (e) => { pad.kind = kindOf(e.gamepad.id); pad.id = e.gamepad.id; });
  window.addEventListener('gamepaddisconnected', () => { const any = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean); if (!any) setMode(false); });
  // real keyboard or mouse use flips back to keyboard prompts
  window.addEventListener('keydown', (e) => { if (e.isTrusted && pad.on) setMode(false); }, true);
  window.addEventListener('mousedown', (e) => { if (e.isTrusted && pad.on) setMode(false); }, true);
  window.addEventListener('mousemove', (e) => { if (e.isTrusted && pad.on && (Math.abs(e.movementX) + Math.abs(e.movementY) > 12)) setMode(false); }, true);
  requestAnimationFrame(poll);
}

function poll() {
  requestAnimationFrame(poll);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) return;
  if (gp.id !== pad.id) { pad.id = gp.id; pad.kind = kindOf(gp.id); }
  const ax = gp.axes, lx = ax[0] || 0, ly = ax[1] || 0, rx = ax[2] || 0, ry = ax[3] || 0;
  const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const down = [];
  for (let i = 0; i < gp.buttons.length; i++) { const now = b(i); if (now && !prev[i]) down.push(i); if (!now && prev[i] && held[i]) { window.dispatchEvent(new KeyboardEvent('keyup', { code: held[i], key: held[i], bubbles: true })); held[i] = null; } prev[i] = now; }
  const active = down.length || Math.hypot(lx, ly) > 0.35 || Math.hypot(rx, ry) > 0.5;
  if (active && !pad.on) setMode(true);
  if (!pad.on) return;
  const mag = Math.hypot(lx, ly);
  pad.jx = mag > DEAD ? lx : 0; pad.jy = mag > DEAD ? -ly : 0;
  pad.sprint = b(7) || b(10);
  // right stick flick = juke while carrying
  const rmag = Math.hypot(rx, ry);
  if (rmag > 0.75 && Math.hypot(pad.rx, pad.ry) <= 0.75) { const c = C.context(); if (c === 'carry') tap('Space'); else if (c === 'def') tap('KeyH'); }
  pad.rx = rx; pad.ry = ry;
  for (const i of down) press(i);
}

function press(i) {
  const c = C.context();
  if (i === 9) return tap('Escape');                       // Menu/Options: pause / back
  if (c === 'menu') return menuNav(i);
  if (c === 'paused' || c === 'over') return menuNav(i);
  if (i === 11) return tap('KeyC');                          // R3: camera
  if ((i === 12 || i === 13) && c !== 'presnapOff' && c !== 'presnapDef') return C.zoomCam && C.zoomCam(i === 12 ? -1 : 1);   // D-pad up/down: zoom
  const map = {
    presnapOff: { 0: 'Space', 3: 'KeyH', 4: 'KeyZ', 5: 'KeyX', 8: 'KeyV', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 1: 'Escape' },
    presnapDef: { 1: 'KeyQ', 4: 'KeyZ', 5: 'KeyX', 8: 'KeyV' },
    pass: { 0: 'Digit1', 1: 'Digit2', 2: 'Digit3', 3: 'Digit4', 5: 'Digit5' },
    carry: { 1: 'KeyE', 3: 'KeyF', 0: 'KeyR', 2: 'KeyX', 4: 'KeyG', 5: 'KeyB' },
    air: { 3: 'KeyE', 1: 'KeyQ', 0: 'KeyE' },
    def: { 2: 'Space', 0: 'Space', 1: 'KeyQ', 3: 'KeyE', 5: 'KeyH' },
    kick: { 0: 'Space' },
    half: { 0: 'Space' },
    replay: { 0: 'Space', 1: 'Escape' },
    dead: { 8: 'KeyV', 2: 'KeyR' },
  }[c] || {};
  const pre = c === 'presnapOff' || c === 'presnapDef';
  if (pre && (i === 14 || i === 15 || i === 12 || i === 13) && !C.hotOpen()) return C.cardNav(i);
  if (pre && i === 0 && !C.hotOpen() && C.cardPickFocused()) return;
  if (c === 'presnapOff' && i === 1 && !C.hotOpen()) return;   // B only closes the hot route menu
  if (c === 'pass' && map[i]) { held[i] = map[i]; window.dispatchEvent(new KeyboardEvent('keydown', { code: map[i], key: map[i], bubbles: true })); return; }   // hold for power, release to throw
  if (map[i]) tap(map[i]);
}

// menus: D-pad / stick moves between buttons, A presses, B goes back
let navT = 0;
function menuNav(i) {
  const list = [...document.querySelectorAll('.screen.active button:not([disabled]), .screen.active input, .screen.active select, .modal:not(.hidden) button:not([disabled]), #gameover:not(.hidden) button:not([disabled])')].filter(el => el.offsetParent !== null);
  if (!list.length) return;
  let k = list.indexOf(document.activeElement);
  if (i === 0) { if (k >= 0) list[k].click(); else list[0].focus(); return; }
  if (i === 1) { const back = list.find(el => el.dataset.go === 'menu' || el.dataset.go === 'back' || el.id === 'resume'); if (back) back.click(); return; }
  if (i === 12 || i === 14) k = k <= 0 ? list.length - 1 : k - 1;
  else if (i === 13 || i === 15) k = k < 0 || k >= list.length - 1 ? 0 : k + 1;
  else return;
  list[k].focus({ preventScroll: false }); list[k].scrollIntoView({ block: 'nearest' });
  void navT;
}
// stick nudges menu focus too (repeat while held)
setInterval(() => {
  if (!pad.on || !C || C.context() !== 'menu') return;
  if (pad.jy > 0.6) menuNav(12); else if (pad.jy < -0.6) menuNav(13);
}, 180);
