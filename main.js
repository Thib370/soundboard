const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
let win; const data = () => app.getPath('userData');
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
  globalShortcut.unregisterAll();
  globalShortcut.register('Control+Alt+0', () => win.webContents.send('stop'));
  sounds.forEach((s, i) => { if (i < 9) globalShortcut.register('Control+Alt+' + (i + 1), () => win.webContents.send('play', s.id)); });
}
app.whenReady().then(() => {
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
