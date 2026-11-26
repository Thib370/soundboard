#!/usr/bin/env node
// Ask the running Windows Soundboard Mic app to join a Teams meeting and play one sample into it.
// Uses the app's existing Brave Playwright-plugin connection (already signed in): no browser is started, no second plugin client.
//   node join-daily.js --list
//   node join-daily.js --song "name part"          DRY RUN: checks app + Teams connection + sample, joins nothing
//   node join-daily.js --song "name part" --yes    sends the request; the app then shows an Approve/Cancel dialog on Windows
// Options: --title "Daily meeting"  --delay 5 (seconds after joining before the sample plays)
// Needs: app running with ▶ Run Teams connected, "Send to mic" ON, Teams mic = CABLE Output.
const fs = require('fs'), { execFileSync } = require('child_process'), WS = require('ws');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const YES = !!arg('yes'), TITLE = String(arg('title', 'Daily meeting')), SONG = arg('song', ''), DELAY = +arg('delay', 5), LIST = !!arg('list'), LEAVE = +arg('leave-after', 0);
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a), die = m => { console.error('ERROR:', m); process.exit(1); };
const appdata = execFileSync('cmd.exe', ['/c', 'echo %APPDATA%'], { cwd: '/mnt/c' }).toString().trim().replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => '/mnt/' + d.toLowerCase());
let token; try { const j = JSON.parse(fs.readFileSync(appdata + '/soundboard-mic/bridge.json', 'utf8')); token = (j.bridge || j).token; } catch { die('Soundboard Mic config not found: start the Windows app once'); }
async function open() {
  for (const port of [8790, 8791, 8792]) {
    const r = await new Promise(res => { const ws = new WS('ws://127.0.0.1:' + port + '/', { origin: 'http://localhost:4200' }); const t = setTimeout(() => { ws.terminate(); res(null); }, 4000);
      ws.on('error', () => { clearTimeout(t); res(null); }); ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
      ws.on('message', m => { const d = JSON.parse(String(m)); if (d.t === 'state') { clearTimeout(t); res({ ws, st: d }); } if (d.t === 'error') { clearTimeout(t); ws.close(); res(null); } }); });
    if (r) return r;
  }
  die('Soundboard Mic app not reachable (is it running? try sb-restart)');
}
(async () => {
  const { ws, st } = await open(); let cur = st.data; ws.on('message', m => { const d = JSON.parse(String(m)); if (d.t === 'state') cur = d.data; });
  const samples = cur.samples || []; if (LIST) { console.log(samples.map(s => '- ' + s.name).join('\n')); return process.exit(0); }
  if (!SONG || SONG === true) die('Give --song "part of the sample name" (see --list)');
  const m = samples.filter(x => x.name.toLowerCase().includes(String(SONG).toLowerCase())); if (m.length !== 1) die(m.length ? 'Several samples match: ' + m.map(x => x.name).join(', ') : 'No sample matches "' + SONG + '"');
  log('Sample:', m[0].name, '| Teams:', cur.teams.state, '| in call:', !!cur.call.inCall);
  if (!/^(connected|captions)$/.test(cur.teams.state)) die('The app is not connected to Teams: click ▶ Run Teams in the app (approve the Brave extension popup).');
  if (cur.call.inCall) die('Already in a call.');
  if (!YES) { log('DRY RUN OK: nothing sent. Add --yes to request joining "' + TITLE + '" and playing "' + m[0].name + '" (the app will ask you to approve).'); return process.exit(0); }
  ws.send(JSON.stringify({ t: 'join', title: TITLE, id: m[0].id, delay: DELAY, leaveAfter: LEAVE })); log('Request sent. Approve the dialog on Windows…');
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 1000)); if (cur.call.inCall) { log('In the call. The sample plays in', DELAY, 's.'); await new Promise(r => setTimeout(r, (DELAY + 3) * 1000)); return process.exit(0); } }
  die('Not in the call after 150 s (cancelled, failed or waiting in the lobby: see the app log)');
})().catch(e => die(e.message));
