#!/usr/bin/env node
// Soundboard "brief daemon" for WSL (no Electron, no audio): drives your Windows browser through its debug port,
// reads Teams (unread chats, today's meetings, mentions), summarizes locally with Ollama, and serves the PROne page via the localhost bridge.
//   node daemon.js          run (keeps watching; refresh from the PROne page)
//   node daemon.js --once   print the brief and exit
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, execFileSync } = require('child_process');
const { Teams } = require('./teams.js'), { startBridge } = require('./bridge.js'), { summarize } = require('./brief.js');
const dir = process.env.SB_DAEMON_DIR || path.join(os.homedir(), '.config', 'soundboard-daemon'); fs.mkdirSync(dir, { recursive: true });
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
const wr = (f, o) => { const p = path.join(dir, f), t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, p); };
const cfg = { aliases: 'Thib, Thibault, Thibu', self: '', ignoreSelf: true, model: 'qwen2.5:7b', endpoint: 'http://127.0.0.1:9222', ollama: 'http://127.0.0.1:11434', urlMatch: '', ...(rd('config.json') || {}) };
if (!fs.existsSync(path.join(dir, 'config.json'))) wr('config.json', cfg);
const once = process.argv.includes('--once'), log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const state = { teams: { state: 'disconnected', detail: '' }, call: { inCall: false, muted: false }, alerts: [], playing: [], samples: [], brief: null };
let bridge = null, briefBusy = false;
const push = () => bridge && bridge.push(state);

const WIN = { brave: ['/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'], edge: ['/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe'], chrome: ['/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'] };
const findBrowser = () => [...WIN.brave, ...WIN.edge, ...WIN.chrome].find(p => fs.existsSync(p));
function launchBrowser() {
  const exe = findBrowser(); if (!exe) throw new Error('No Brave, Edge or Chrome found under /mnt/c');
  const appdata = execFileSync('cmd.exe', ['/c', 'echo %APPDATA%'], { cwd: '/mnt/c' }).toString().trim();
  const profile = appdata + '\\soundboard-mic\\chrome-teams'; // same profile as the Windows app: you stay signed in
  spawn(exe, ['--remote-debugging-port=9222', '--user-data-dir=' + profile, 'https://teams.microsoft.com'], { detached: true, stdio: 'ignore' }).unref();
  log('Started', path.basename(exe), 'with its own profile:', profile);
}

const teams = new Teams((ev, d) => {
  if (ev === 'status') { state.teams = d; push(); if (once) return; }
  else if (ev === 'call') { state.call = d; push(); }
  else if (ev === 'mention') { state.alerts.unshift({ t: Date.now(), speaker: d.speaker, text: String(d.text).slice(0, 200), kind: 'mention' }); state.alerts.length = Math.min(state.alerts.length, 20); log('Mention:', d.speaker + ':', d.text); push(); }
});
async function runBrief() {
  if (briefBusy) return null; briefBusy = true; state.brief = { at: Date.now(), busy: true, summarizing: false, summary: '', note: '', unread: [], meetings: null }; push();
  try {
    const b = await teams.brief(); state.brief = { at: b.at, busy: false, summarizing: !!(b.unread && b.unread.length), summary: '', note: b.note || '', unread: (b.unread || []).slice(0, 10).map(u => ({ title: u.title, message: String(u.message).slice(0, 200), time: u.time })), meetings: b.meetings }; push();
    const s = await summarize(b, cfg.model, cfg.ollama); state.brief.summary = s || ''; state.brief.summarizing = false; push(); return { b, s };
  } catch (e) { state.brief = { at: Date.now(), busy: false, summarizing: false, summary: '', note: e.message.slice(0, 120), unread: [], meetings: null }; push(); log('Brief failed:', e.message); return null; }
  finally { briefBusy = false; }
}
const print = ({ b, s }) => {
  console.log('\n=== Morning brief ===' + (b.note ? '  (' + b.note + ')' : ''));
  console.log(b.unread && b.unread.length ? 'Unread (' + b.unread.length + '):\n' + b.unread.map(u => `  - ${u.title}${u.time ? ' · ' + u.time : ''}${u.message ? ' — ' + u.message : ''}`).join('\n') : 'No unread chats.');
  if (b.meetings) console.log(b.meetings.length ? 'Today:\n' + b.meetings.map(m => `  ${m.start}–${m.end} ${m.title}${m.link ? ' 🔗' : ''}`).join('\n') : 'No meetings today.');
  if (s) console.log('\nSummary:\n' + s.split('\n').map(l => '  ' + l).join('\n')); console.log();
};

async function connect() {
  const c = { ...cfg, listen: !once, mode: 'cdp' }; let ok = await teams.connect(c);
  if (!ok) { try { launchBrowser(); } catch (e) { log(e.message); return false; }
    for (let i = 0; i < 20 && !ok; i++) { await new Promise(r => setTimeout(r, 3000)); ok = await teams.connect(c); if (!ok) log('Waiting for the browser…', i + 1); } }
  return ok;
}
(async () => {
  if (!once) {
    bridge = startBridge({ getCfg: () => { const b = rd('bridge.json'); return b ? { bridge: b } : {}; }, saveCfg: c => wr('bridge.json', c.bridge), validId: () => false, onCommand: c => { if (c.t === 'brief') runBrief().then(r => r && print(r)); } });
    await new Promise(r => setTimeout(r, 400)); const i = bridge.info();
    log(`Bridge on 127.0.0.1:${i.port || 'none'} · pairing code ${i.token} · link: http://192.168.1.11/#/soundboard?sb=${i.token}`);
  }
  if (!await connect()) { log('Could not reach the browser on port 9222.'); process.exit(1); }
  log('Connected. Sign in to Teams in the browser window if asked.');
  const r = await runBrief(); if (r) print(r);
  if (once) { await teams.disconnect(); process.exit(r ? 0 : 2); }
  log('Watching Teams. Refresh from the PROne Soundboard page, or restart to re-run. Ctrl+C to stop.');
  const stop = async () => { await teams.disconnect().catch(() => {}); bridge && bridge.stop(); process.exit(0); }; process.on('SIGINT', stop); process.on('SIGTERM', stop);
})();
