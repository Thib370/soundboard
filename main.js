const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { Teams } = require('./teams.js');
let win, popup = null, popupTimer = null, lastPopup = 0; const data = () => app.getPath('userData');
const cfgFile = () => path.join(data(), 'config.json'), soundsDir = () => path.join(data(), 'sounds'), exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp', ytdlp = () => path.join(data(), exe);
const load = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return { sounds: [], settings: {} }; } };
const run = (cmd, args) => new Promise((res, rej) => { const p = spawn(cmd, args); let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('error', rej); p.on('close', c => c === 0 ? res(o) : rej(new Error(e.trim().split('\n').pop() || 'exit ' + c))); });
async function ensureYtdlp(force) {
  if (!force && fs.existsSync(ytdlp())) return;
  const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + (process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'));
  if (!r.ok) throw new Error('yt-dlp download failed: ' + r.status);
  fs.mkdirSync(data(), { recursive: true }); fs.writeFileSync(ytdlp(), Buffer.from(await r.arrayBuffer()), { mode: 0o755 });
}
function registerHotkeys(sounds) {
  globalShortcut.unregisterAll(); if (popup) popupKeys(true);
  globalShortcut.register('Control+Alt+0', () => win.webContents.send('stop'));
  sounds.forEach((s, i) => { if (i < 9) globalShortcut.register('Control+Alt+' + (i + 1), () => win.webContents.send('play', s.id)); });
}
// ---- Teams mention popup (approve / cancel) ----
const send = (ch, d) => win && !win.isDestroyed() && win.webContents.send(ch, d);
let pending = null;
function popupKeys(on) { for (const k of ['Control+Alt+Return', 'Control+Alt+Backspace']) globalShortcut.unregister(k);
  if (on) { globalShortcut.register('Control+Alt+Return', () => choose(pending && pending.replies[0] ? pending.replies[0].id : null)); globalShortcut.register('Control+Alt+Backspace', () => choose(null)); } }
function closePopup() { clearTimeout(popupTimer); popupKeys(false); pending = null; if (popup && !popup.isDestroyed()) popup.close(); popup = null; send('teams-popup', false); }
function choose(id) { const p = pending; closePopup(); if (!p) return; send('teams-log', { t: Date.now(), msg: id ? 'Approved: ' + (p.replies.find(r => r.id === id) || {}).name : 'Cancelled', who: p.speaker }); if (id) send('play', id); }
function showPopup(men) {
  const cfg = load(), t = cfg.teams || {};
  if (pending || Date.now() - lastPopup < (t.cooldown ?? 30) * 1000) return;
  lastPopup = Date.now();
  const replies = (cfg.sounds || []).filter(s => (s.folder || '') === (t.replyFolder || '')).slice(0, 4).map(s => ({ id: s.id, name: s.name }));
  pending = { ...men, replies }; const { screen } = require('electron'), wa = screen.getPrimaryDisplay().workArea;
  popup = new BrowserWindow({ width: 380, height: 120 + replies.length * 40, x: wa.x + wa.width - 400, y: wa.y + wa.height - 160 - replies.length * 40, frame: false, alwaysOnTop: true, focusable: false, skipTaskbar: true, resizable: false, show: false, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  popup.setAlwaysOnTop(true, 'screen-saver'); popup.loadFile('popup.html');
  popup.webContents.once('did-finish-load', () => { popup.webContents.send('popup-data', { ...pending, timeout: t.timeout ?? 15 }); popup.showInactive(); });
  popupKeys(true); popupTimer = setTimeout(() => choose(null), (t.timeout ?? 15) * 1000); send('teams-popup', true);
  send('teams-log', { t: Date.now(), msg: 'Mention: ' + men.text, who: men.speaker });
}
const teams = new Teams((ev, d) => { if (ev === 'status') send('teams-status', d); else if (ev === 'mention') showPopup(d); });
function findChrome() { const c = [process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']; return c.find(p => fs.existsSync(p)); }
app.whenReady().then(() => {
  ipcMain.handle('teams-connect', (_, c) => teams.connect(c));
  ipcMain.handle('teams-disconnect', () => teams.disconnect());
  ipcMain.handle('teams-config', (_, c) => { if (teams.cfg) teams.cfg = { ...teams.cfg, ...c }; });
  ipcMain.handle('teams-launch', () => { const exe = findChrome(); if (!exe) throw new Error('Chrome not found'); spawn(exe, ['--remote-debugging-port=9222', '--user-data-dir=' + path.join(data(), 'chrome-teams'), 'https://teams.microsoft.com'], { detached: true, stdio: 'ignore' }).unref(); return true; });
  ipcMain.on('popup-choice', (_, id) => choose(id));
  win = new BrowserWindow({ width: 900, height: 700, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.loadFile('index.html');
  ipcMain.handle('load', () => load());
  ipcMain.handle('save', (_, cfg) => { fs.mkdirSync(data(), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 1)); registerHotkeys(cfg.sounds || []); });
  ipcMain.handle('read', (_, p) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); });
  ipcMain.handle('pick', async () => (await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'] }] })).filePaths);
  ipcMain.handle('import-url', async (_, url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Invalid URL');
    await ensureYtdlp(); fs.mkdirSync(soundsDir(), { recursive: true });
    const id = Date.now().toString(36), tpl = path.join(soundsDir(), id + '.%(ext)s');
    const title = (await run(ytdlp(), ['--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio', '--print', 'title', '--no-simulate', '-o', tpl, url])).trim().split('\n')[0];
    const f = fs.readdirSync(soundsDir()).find(x => x.startsWith(id + '.')); if (!f) throw new Error('Download failed');
    return { path: path.join(soundsDir(), f), name: title };
  });
  ipcMain.handle('save-recording', (_, buf) => { fs.mkdirSync(soundsDir(), { recursive: true }); const p = path.join(soundsDir(), 'rec-' + Date.now().toString(36) + '.webm'); fs.writeFileSync(p, Buffer.from(buf)); return p; });
  ipcMain.handle('update-ytdlp', async () => { await ensureYtdlp(true); return true; });
  registerHotkeys(load().sounds || []);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
