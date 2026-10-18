// Endzone Kings desktop app: the same game as the website, in its own window.
// The game files are served from an app:// address so saves, modules and online play all work offline-installed.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const ROOT = path.join(__dirname, 'game');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 760, minWidth: 900, minHeight: 560, backgroundColor: '#050506', autoHideMenuBar: true,
    title: 'Endzone Kings', icon: path.join(ROOT, 'assets', 'icon-512.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL('app://game/index.html');
  if (process.env.EK_SMOKE) win.webContents.on('console-message', (e, lvl, msg, line, src) => console.log('CONSOLE', lvl, msg, src, line));
  if (process.env.EK_SMOKE) win.webContents.on('did-finish-load', () => setTimeout(async () => {   // build check: does the game boot?
    const r = await win.webContents.executeJavaScript("JSON.stringify({ ek: !!window.__ek, screen: document.querySelector('.screen.active') && document.querySelector('.screen.active').id })").catch(e => String(e));
    console.log('SMOKE', r); app.quit();
  }, 6000));
  // links (help pages, email, etc.) open in the normal browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // F11 = fullscreen
  win.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname); if (p === '/' || !p) p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
