#!/usr/bin/env node
// On-demand control of the running Soundboard Mic app (and its Brave Playwright plugin session).
// Usage: node sb.js status | play <name> | stop | mute | unmute | leave | brief | join <name> [--song X --delay N --leave-after N]
// Needs the app running and Teams authenticated in the plugin's Brave tab. Nothing is sent to a call unless you run a command that does.
const WS = require('ws'), fs = require('fs'), path = require('path');
const dir = path.join(process.env.APPDATA || '/mnt/c/Users/thib3/AppData/Roaming', 'soundboard-mic');
const j = JSON.parse(fs.readFileSync(path.join(dir, 'bridge.json'))), cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf('--' + n); return i < 0 ? d : rest[i + 1]; };
const idOf = n => { const s = cfg.sounds.find(x => x.name.toLowerCase().includes(String(n).toLowerCase())); if (!s) { console.error('No sample matching ' + n); process.exit(2); } return s.id; };
const msgs = { stop: { t: 'stop' }, mute: { t: 'mute', muted: true }, unmute: { t: 'mute', muted: false }, leave: { t: 'leave' }, brief: { t: 'brief' } };
let msg = msgs[cmd];
if (cmd === 'voice') msg = { t: 'voice', text: rest.join(' ') };
if (cmd === 'play') msg = { t: 'play', id: idOf(rest[0]) };
if (cmd === 'join') msg = { t: 'join', title: rest[0] || 'Daily meeting', id: idOf(flag('song', '')), delay: +flag('delay', 5), leaveAfter: +flag('leave-after', 0) };
if (!msg && cmd !== 'status') { console.error('Usage: sb.js status|play <name>|voice "text"|stop|mute|unmute|leave|brief|join <title> --song X'); process.exit(1); }
const ws = new WS('ws://127.0.0.1:' + (j.port || 8790) + '/', { origin: 'http://localhost:4200' });
ws.on('error', () => { console.error('App not reachable (sb-restart)'); process.exit(1); });
ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token: j.token })));
let sent = false;
ws.on('message', m => { const d = JSON.parse(m);
  if (d.t === 'state' && !sent) { sent = true; if (!msg) { console.log(JSON.stringify({ teams: d.data.teams, call: d.data.call })); process.exit(0); } ws.send(JSON.stringify(msg)); }
  else if (d.t === 'ack') { console.log('ok: ' + cmd); setTimeout(() => process.exit(0), 300); }
  else if (d.t === 'error') { console.error('error: ' + d.code); process.exit(1); } });
setTimeout(() => process.exit(1), 15000);
