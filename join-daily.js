#!/usr/bin/env node
// Join today's "Daily meeting" in Teams (Windows Brave via its debug port) and play one soundboard sample into the call.
//   node join-daily.js --song "name part"            DRY RUN: checks everything, joins nothing, plays nothing
//   node join-daily.js --song "name part" --yes      really joins, then plays the sample through the running Windows app
// Options: --title "Daily meeting"  --delay 5 (s after joining)  --leave-after 20 (s after the song starts, then leave)  --list (print samples)
// Needs: Windows Soundboard Mic app running (VB-Cable, "Send to mic" ON, Teams mic = CABLE Output), Brave on the Teams profile.
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright-core'), WS = require('ws');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const YES = !!arg('yes'), TITLE = String(arg('title', 'Daily meeting')), SONG = arg('song', ''), DELAY = +arg('delay', 5), LEAVE = +arg('leave-after', 0), LIST = !!arg('list');
const wait = ms => new Promise(r => setTimeout(r, ms)), log = (...a) => console.log(new Date().toLocaleTimeString(), ...a), die = m => { console.error('ERROR:', m); process.exit(1); };

async function appSamples() { // ask the running Windows app (localhost bridge) for its samples
  const appdata = execFileSync('cmd.exe', ['/c', 'echo %APPDATA%'], { cwd: '/mnt/c' }).toString().trim().replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => '/mnt/' + d.toLowerCase());
  let token; try { token = JSON.parse(fs.readFileSync(appdata + '/soundboard-mic/bridge.json', 'utf8')).bridge?.token || JSON.parse(fs.readFileSync(appdata + '/soundboard-mic/bridge.json', 'utf8')).token; } catch { die('Soundboard Mic app config not found: start the Windows app once'); }
  for (const port of [8790, 8791, 8792]) {
    const r = await new Promise(res => { const ws = new WS('ws://127.0.0.1:' + port + '/', { origin: 'http://localhost:4200' }); let st = null; const t = setTimeout(() => { ws.terminate(); res(null); }, 4000);
      ws.on('error', () => { clearTimeout(t); res(null); }); ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
      ws.on('message', m => { const d = JSON.parse(String(m)); if (d.t === 'state') { st = d; clearTimeout(t); res({ ws, st }); } if (d.t === 'error') { clearTimeout(t); ws.close(); res(null); } }); });
    if (r) return r;
  }
  die('Soundboard Mic app not reachable (is it running?)');
}
const pick = (samples, q) => { const s = String(q).toLowerCase(); return samples.filter(x => x.name.toLowerCase().includes(s)); };

(async () => {
  const { ws, st } = await appSamples(); const samples = st.data.samples || [];
  if (LIST) { console.log(samples.map(s => '- ' + s.name).join('\n')); return process.exit(0); }
  if (!SONG || SONG === true) die('Give --song "part of the sample name" (see --list)');
  const m = pick(samples, SONG); if (m.length !== 1) die(m.length ? 'Several samples match: ' + m.map(x => x.name).join(', ') : 'No sample matches "' + SONG + '" (try --list)');
  log('Sample:', m[0].name);
  let br; try { br = await chromium.connectOverCDP('http://127.0.0.1:9222'); } catch {
    const exe = ['/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].find(p => fs.existsSync(p)); if (!exe) die('Brave not found');
    const ad = execFileSync('cmd.exe', ['/c', 'echo %APPDATA%'], { cwd: '/mnt/c' }).toString().trim();
    spawn(exe, ['--remote-debugging-port=9222', '--user-data-dir=' + ad + '\\soundboard-mic\\chrome-teams', 'https://teams.microsoft.com'], { detached: true, stdio: 'ignore' }).unref(); log('Started Brave, waiting…');
    for (let i = 0; i < 20 && !br; i++) { await wait(3000); br = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null); } if (!br) die('Cannot reach Brave on port 9222');
  }
  let page = null; for (let i = 0; i < 25 && !page; i++) { page = br.contexts().flatMap(c => c.pages()).find(p => /teams\.(microsoft|cloud\.microsoft)|mcas\.ms/.test(p.url())); if (!page) await wait(2000); } if (!page) die('No Teams tab open in that Brave');
  let told = false; for (let i = 0; i < 90; i++) { if (await page.evaluate(() => document.querySelectorAll('[role=treeitem][aria-level="2"]').length).catch(() => 0)) break; if (!told) { log('Waiting for Teams chat list: sign in to Teams in the Brave window that just opened (needed once, stays saved)…'); told = true; } await wait(2000); }
  const found = await page.evaluate(async ([title]) => { const nmf = e => (e.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean).map(i => (document.getElementById(i) || {}).innerText || '').join(' | ');
    const e = [...document.querySelectorAll('[role=treeitem][aria-level="2"]')].find(x => nmf(x).toLowerCase().includes(title.toLowerCase()) && /réunion|meeting/i.test(nmf(x))); if (!e) return 'no-chat'; e.click(); await new Promise(r => setTimeout(r, 2500));
    return document.querySelector('[data-tid="chat-join-button"]') ? 'ok' : 'no-join'; }, [TITLE]);
  if (found === 'no-chat') die('No meeting chat named "' + TITLE + '" in your chat list');
  if (found === 'no-join') die('Meeting chat found but no Join button (meeting not started yet?)');
  log('Found the "' + TITLE + '" chat with a Join button.');
  if (!YES) { log('DRY RUN: nothing joined, nothing played. Add --yes to really join and play "' + m[0].name + '".'); ws.close(); await br.close(); return process.exit(0); }

  log('Joining…'); await page.click('[data-tid="chat-join-button"]');
  const ready = await page.waitForSelector('[data-tid="prejoin-join-button"], button:has-text("Rejoindre maintenant"), button:has-text("Join now")', { timeout: 30000 }).catch(() => null); if (!ready) die('Pre-join screen not found');
  // camera OFF, mic ON on the pre-join screen (unverified selectors: failures are only logged)
  for (const [kind, want] of [['cam', false], ['mic', true]]) {
    const re = kind === 'cam' ? /cam[eé]ra|video/i : /micro/i;
    const ok = await page.evaluate(([src, w]) => { const re = new RegExp(src, 'i'); const e = [...document.querySelectorAll('[role=switch],input[type=checkbox]')].find(x => re.test(x.getAttribute('aria-label') || ''));
      if (!e) return null; const on = (e.getAttribute('aria-checked') ?? String(e.checked)) === 'true'; if (on !== w) e.click(); return true; }, [re.source, want]);
    if (!ok) log('WARNING: pre-join', kind, 'toggle not found, left as is');
  }
  await ready.click(); log('Clicked join. Waiting for the call…');
  const inCall = await page.waitForSelector('#microphone-button', { timeout: 60000 }).catch(() => null); if (!inCall) die('Did not enter the call (lobby? waiting for someone to admit you)');
  const muted = await page.evaluate(() => /réactiver|unmute/i.test(document.querySelector('#microphone-button').getAttribute('aria-label') || '')); if (muted) log('WARNING: your Teams mic is muted, nobody will hear the song. Unmute then re-run with the app button.');
  log('In the call. Playing in', DELAY, 's…'); await wait(DELAY * 1000);
  ws.send(JSON.stringify({ t: 'play', id: m[0].id })); log('Play sent:', m[0].name);
  if (LEAVE > 0) { await wait(LEAVE * 1000); await page.click('#hangup-button, [data-tid="hangup-button"]').then(() => log('Left the call.')).catch(() => log('Could not find the leave button')); }
  ws.close(); await br.close(); process.exit(0);
})().catch(e => die(e.message));
