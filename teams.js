// Main-process Teams watcher: attaches to Chrome over CDP (Playwright), reads live captions, reports mentions of your aliases.
const { chromium } = require('playwright-core');
const { spawn } = require('child_process'), fs = require('fs');
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
/** Returns the matched alias or null. Whole words only; 1 typo allowed for aliases of 5+ letters. */
function matchAlias(text, aliases) {
  const words = norm(text).split(/[^a-z0-9]+/).filter(Boolean), hay = ' ' + words.join(' ') + ' ';
  for (const raw of aliases) { const a = norm(raw).split(/[^a-z0-9]+/).filter(Boolean).join(' '); if (!a) continue;
    if (hay.includes(' ' + a + ' ')) return raw.trim();                       // exact word / phrase
    if (a.length >= 6 && !a.includes(' ') && words.some(w => w.length >= 5 && w.slice(0, 3) === a.slice(0, 3) && lev(w, a) <= 1)) return raw.trim(); // one typo, same first 3 letters
  }
  return null;
}
// Caption selectors (Teams web); several fallbacks because Teams changes its markup.
const READ = () => {
  const out = [];
  document.querySelectorAll('[data-tid="closed-caption-text"], [data-tid="closed-caption-message"] [data-tid="closed-caption-text"]').forEach(e => {
    const row = e.closest('[data-tid="closed-caption-message"]') || e.parentElement;
    const a = row && row.querySelector('[data-tid="author"]');
    out.push({ s: (a && a.textContent || '').trim(), t: (e.textContent || '').trim() });
  });
  const mic = document.getElementById('microphone-button'), label = mic ? (mic.getAttribute('aria-label') || '') : '';
  const title = (document.title || '').replace(/\s*\|\s*Microsoft Teams\s*$/i, '').replace(/^(Conversation|Chat|Calendar|Calendrier)\s*\|\s*/i, '');
  return { lines: out, call: { inCall: !!mic, muted: /r[ée]activer|unmute|activer le micro/i.test(label), title } };
};
// ---- Morning brief: unread chats (Teams' own "Unread" filter, restored afterwards) + today's meetings (Calendar app, then back) ----
const UNREAD = async () => {
  const chip = [...document.querySelectorAll('button')].find(b => /^\s*(non lu|unread)/i.test(b.innerText || ''));
  if (!chip) return { ok: false };
  const was = chip.getAttribute('aria-pressed') === 'true'; if (!was) chip.click();
  await new Promise(r => setTimeout(r, 1500));
  const nm = e => (e.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean).map(i => (document.getElementById(i) || {}).innerText || '').join(' | ').replace(/\s+/g, ' ');
  const rows = [...document.querySelectorAll('[role=treeitem][aria-level="2"]')].filter(e => e.getClientRects().length).map(nm).filter(Boolean);
  if (!was) chip.click();
  return { ok: true, rows };
};
const GO_APP = (names) => {
  const nav = document.querySelector('[role=navigation][aria-label*="pplication" i]') || document;
  const bs = [...nav.querySelectorAll('button')], lab = b => (b.getAttribute('aria-label') || b.innerText || '').trim();
  const prev = bs.find(b => b.getAttribute('aria-pressed') === 'true'); const want = bs.find(b => names.some(n => n.test(lab(b))));
  if (!want) return null; want.click(); return prev ? lab(prev) : '';
};
const parseUnread = rows => rows.map(r => { const p = r.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean); const i = p.findIndex(s => /^(dernier message|last message)$/i.test(s));
  return { kind: p[0] || '', title: p[1] || '', message: i >= 0 ? (p[i + 1] || '') : '', time: i >= 0 ? (p[i + 2] || '') : '' }; });
const MONTHS = { fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'], en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] };
function parseMeetings(labels, now = new Date()) {
  const d = now.getDate(), mi = now.getMonth(), low = s => s.toLowerCase(), seen = new Set(), out = [];
  for (const l of labels) {
    const parts = l.split(', '), ti = parts.findIndex(s => /^\d{1,2}:\d{2}(\s*[AP]M)?\s*(à|to|-|–)\s*\d{1,2}:\d{2}(\s*[AP]M)?$/i.test(s)); if (ti < 1) continue;
    const L = low(l), today = [`${d} ${MONTHS.fr[mi]}`, `${d} ${MONTHS.en[mi]}`, `${MONTHS.en[mi]} ${d}`].some(k => L.includes(k)); if (!today) continue;
    const title = parts.slice(0, ti).join(', '), [start, end] = parts[ti].split(/\s*(?:à|to|-|–)\s*/).map(s => s.replace(/\s*[AP]M$/i, m => m));
    if (/^(canceled|cancelled|annulé)/i.test(title) || seen.has(title + start)) continue; seen.add(title + start);
    out.push({ title, start, end, link: /teams meeting|réunion microsoft teams|microsoft teams/i.test(l) });
  }
  return out.sort((a, b) => a.start.padStart(5, '0').localeCompare(b.start.padStart(5, '0')));
}
// Minimal MCP (streamable HTTP) client, used to read the Teams tab through `@playwright/mcp --extension` (the Playwright MCP Bridge browser plugin).
class Mcp {
  constructor(url) { this.url = url; this.id = 0; this.sid = null; }
  async rpc(method, params, notify) {
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++this.id, method, params };
    const r = await fetch(this.url, { signal: AbortSignal.timeout(8000), method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(this.sid ? { 'mcp-session-id': this.sid } : {}) }, body: JSON.stringify(body) });
    this.sid = r.headers.get('mcp-session-id') || this.sid; if (notify) return null;
    const txt = await r.text(); const line = /^data:/m.test(txt) ? txt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).pop() : txt;
    const j = JSON.parse(line); if (j.error) throw new Error(j.error.message); return j.result;
  }
  async init() { await this.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'soundboard-mic', version: '0.1' } }); await this.rpc('notifications/initialized', {}, true); }
  async call(name, args) { const r = await this.rpc('tools/call', { name, arguments: args }); const text = (r.content || []).map(c => c.text || '').join('\n'); if (r.isError) throw new Error(text.slice(0, 200)); return text; }
}
const parseResult = text => { const m = text.match(/### Result\s*\n([\s\S]*?)(\n###|$)/); return JSON.parse(m ? m[1].trim() : text); };
class Teams {
  constructor(emit) { this.emit = emit; this.browser = null; this.page = null; this.timer = null; this.seen = new Map(); this.state = 'disconnected'; this.gen = 0; }
  set(state, detail = '') { if (state !== this.state || detail !== this.detail) { this.state = state; this.detail = detail; this.emit('status', { state, detail }); } }
  async connectBridge(cfg) {
    const gen = this.gen; const alive = () => gen === this.gen;
    if (/[&|<>^%"`;$]/.test(cfg.bridgeArgs || '')) { this.set('disconnected', 'Invalid plugin arguments'); return false; }
    const port = cfg.bridgePort || 8931, brave = ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', process.env.LOCALAPPDATA + '\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'].find(p => fs.existsSync(p));
    const args = ['-y', '@playwright/mcp@latest', '--port', String(port), ...(cfg.bridgeArgs ? cfg.bridgeArgs.split(' ') : ['--extension']), ...(brave && !cfg.bridgeArgs ? ['--executable-path', brave] : [])];
    this.set('connected', 'Starting the Playwright plugin (approve the connection in the browser if asked)…');
    this.proc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { shell: process.platform === 'win32', windowsHide: true, env: { ...process.env, ...(cfg.bridgeToken ? { PLAYWRIGHT_MCP_EXTENSION_TOKEN: cfg.bridgeToken } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    this.out = ''; const grab = d => { this.out = (this.out + d).slice(-600); }; this.proc.stdout.on('data', grab); this.proc.stderr.on('data', grab);
    const me = this.proc; this.proc.on('exit', () => { if (this.proc === me && this.mcp) { this.mcp = null; clearInterval(this.timer); this.set('disconnected', 'Plugin process stopped: ' + (String(this.out).trim().split('\n').pop() || 'no output').slice(0, 160)); } });
    this.mcp = new Mcp(`http://127.0.0.1:${port}/mcp`);
    for (let i = 0; i < 40; i++) { if (!alive()) return false; try { await this.mcp.init(); if (!alive()) return false; this.tabOk = false; this.timer = setInterval(() => this.tick().catch(() => {}), 1000); return true; } catch { await new Promise(r => setTimeout(r, 1500)); if (!alive() || !this.proc || !this.mcp) break; } }
    const why = String(this.out || '').trim().split('\n').pop() || ''; await this.disconnect(); this.set('disconnected', 'Could not start the Playwright plugin' + (why ? ': ' + why.slice(0, 160) : ' (needs Node/npx and the extension in the browser)')); return false;
  }
  async bridgeLines() {
    if (!this.tabOk) {
      const list = await this.mcp.call('browser_tabs', { action: 'list' }); const re = new RegExp(this.cfg.urlMatch || 'teams\\.(microsoft|cloud\\.microsoft)|mcas\\.ms', 'i');
      const hit = list.split('\n').map(l => l.match(/^- (\d+):.*\(([^)\s]+)\)/)).find(m => m && re.test(m[2]));
      if (!this.mcp) return null;
      if (!hit) { this.set('connected', 'No Teams tab found in the plugin browser'); return null; }
      await this.mcp.call('browser_tabs', { action: 'select', index: +hit[1] }); this.tabOk = true;
    }
    try { return parseResult(await this.mcp.call('browser_evaluate', { function: `() => (${READ.toString()})()` })); } catch (e) { this.tabOk = false; return null; }
  }
  async connect(cfg) {
    await this.disconnect(); this.cfg = cfg; if (cfg.mode === 'bridge') return this.connectBridge(cfg);
    const gen = this.gen;
    let br; try { br = await chromium.connectOverCDP(cfg.endpoint || 'http://127.0.0.1:9222', { timeout: 5000 }); if (gen !== this.gen) { br.close().catch(() => {}); return false; } this.browser = br; }
    catch (e) { this.set('disconnected', 'Cannot reach Chrome on the debug port (use "Launch Chrome for Teams")'); return false; }
    this.browser.on('disconnected', () => { this.browser = null; this.page = null; clearInterval(this.timer); this.set('disconnected', 'Chrome closed'); });
    this.set('connected', 'Looking for the Teams tab…');
    this.timer = setInterval(() => this.tick().catch(() => {}), 1000); return true;
  }
  async disconnect() { this.gen++; clearInterval(this.timer); this.timer = null; this.page = null; if (this.mcp) { this.mcp = null; } if (this.proc) { const p = this.proc; this.proc = null; try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' }) : process.kill(-p.pid); } catch { try { p.kill(); } catch {} } } if (this.browser) { const b = this.browser; this.browser = null; await b.close().catch(() => {}); } this.set('disconnected', ''); }
  findPage() { const re = new RegExp(this.cfg.urlMatch || 'teams\\.(microsoft|cloud\\.microsoft)|mcas\\.ms', 'i'); for (const c of this.browser.contexts()) for (const p of c.pages()) if (re.test(p.url())) return p; return null; }
  async brief() {
    if (!this.browser && !this.mcp) throw new Error('Not connected to Teams');
    const res = { at: Date.now(), unread: null, meetings: null, note: '' };
    const evalTop = async fn => this.mcp ? parseResult(await this.mcp.call('browser_evaluate', { function: `() => (${fn.toString()})()` })) : (this.page || this.findPage() || (() => { throw new Error('No Teams tab found'); })()).evaluate(fn);
    let u = null; for (let i = 0; i < 20 && !u?.ok; i++) { u = await evalTop(UNREAD).catch(() => null); if (!u?.ok) await new Promise(r => setTimeout(r, 3000)); }
    if (!u?.ok) { res.note = 'Teams chat list not ready (sign in to Teams in the opened browser)'; return res; }
    res.unread = parseUnread(u.rows);
    if (this.mcp) { res.note = 'Calendar is only read in "Run Teams" mode'; return res; }
    try {
      const page = this.page || this.findPage(), prev = await page.evaluate(GO_APP, [/^calend/i]);
      if (prev === null) { res.note = 'Calendar button not found'; return res; }
      let labels = []; for (let i = 0; i < 16 && !labels.length; i++) { await new Promise(r => setTimeout(r, 700)); for (const f of page.frames()) labels.push(...await f.evaluate(() => [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).filter(l => /\d{1,2}:\d{2}/.test(l))).catch(() => [])); }
      res.meetings = parseMeetings(labels);
      if (prev) await page.evaluate(GO_APP, [new RegExp('^' + prev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')]);
    } catch (e) { res.note = 'Calendar not read: ' + e.message.slice(0, 80); }
    return res;
  }
  async tick() {
    if (!this.mcp && !this.browser) return;
    if (this.busy && Date.now() - this.busy > 20000) this.busy = 0;
    if (this.busy) { if (this.mcp && Date.now() - this.busy > 5000) this.set('connected', 'Waiting for the browser extension: approve the connection (select the Teams tab) in your browser'); return; }
    this.busy = Date.now(); try { await this.tick2(); } finally { this.busy = 0; }
  }
  async tick2() {
    let lines;
    if (this.mcp) lines = await this.bridgeLines();
    else { if (!this.browser) return;
      if (!this.page || this.page.isClosed()) { this.page = this.findPage(); if (!this.page) return this.set('connected', 'No Teams tab found'); }
      lines = await this.page.evaluate(READ).catch(() => null); }
    if (!lines || (!this.mcp && !this.browser)) return;
    const call = lines.call; lines = lines.lines; const ck = JSON.stringify(call); if (ck !== this.callKey) { this.callKey = ck; this.emit('call', call); }
    if (!lines.length) return this.set('connected', 'Teams tab found, no captions (turn on live captions in the call)');
    this.set('captions', 'Reading live captions');
    if (!this.cfg.listen) return;
    const aliases = String(this.cfg.aliases || '').split(',').map(s => s.trim()).filter(Boolean), selfFirst = norm(this.cfg.self || '').trim().split(/\s+/)[0];
    for (const { s, t } of lines.slice(-6)) {
      const key = s + '|' + t; if (this.seen.has(key) || !t) continue; this.seen.set(key, Date.now());
      if (this.cfg.ignoreSelf && selfFirst && s && norm(s).split(/\s+/).includes(selfFirst)) continue;
      const alias = matchAlias(t, aliases); if (alias) this.emit('mention', { speaker: s || 'Someone', text: t, alias });
    }
    for (const [k, v] of this.seen) if (Date.now() - v > 120000) this.seen.delete(k);
  }
}
module.exports = { Teams, matchAlias, parseUnread, parseMeetings };
