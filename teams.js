// Main-process Teams watcher: attaches to Chrome over CDP (Playwright), reads live captions, reports mentions of your aliases.
const { chromium } = require('playwright-core');
const { spawn } = require('child_process'), fs = require('fs');
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
/** Returns the matched alias or null. Whole words only; 1 typo allowed for aliases of 5+ letters. */
function matchAlias(text, aliases) {
  const words = norm(text).split(/[^a-z0-9]+/).filter(Boolean);
  for (const raw of aliases) { const a = norm(raw).trim(); if (!a) continue;
    if (words.some(w => w === a || (a.length >= 5 && w.length >= 4 && lev(w, a) <= 1))) return raw.trim(); }
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
  return out;
};
// Minimal MCP (streamable HTTP) client, used to read the Teams tab through `@playwright/mcp --extension` (the Playwright MCP Bridge browser plugin).
class Mcp {
  constructor(url) { this.url = url; this.id = 0; this.sid = null; }
  async rpc(method, params, notify) {
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++this.id, method, params };
    const r = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(this.sid ? { 'mcp-session-id': this.sid } : {}) }, body: JSON.stringify(body) });
    this.sid = r.headers.get('mcp-session-id') || this.sid; if (notify) return null;
    const txt = await r.text(); const line = /^data:/m.test(txt) ? txt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).pop() : txt;
    const j = JSON.parse(line); if (j.error) throw new Error(j.error.message); return j.result;
  }
  async init() { await this.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'soundboard-mic', version: '0.1' } }); await this.rpc('notifications/initialized', {}, true); }
  async call(name, args) { const r = await this.rpc('tools/call', { name, arguments: args }); const text = (r.content || []).map(c => c.text || '').join('\n'); if (r.isError) throw new Error(text.slice(0, 200)); return text; }
}
const parseResult = text => { const m = text.match(/### Result\s*\n([\s\S]*?)(\n###|$)/); return JSON.parse(m ? m[1].trim() : text); };
class Teams {
  constructor(emit) { this.emit = emit; this.browser = null; this.page = null; this.timer = null; this.seen = new Map(); this.state = 'disconnected'; }
  set(state, detail = '') { if (state !== this.state || detail !== this.detail) { this.state = state; this.detail = detail; this.emit('status', { state, detail }); } }
  async connectBridge(cfg) {
    const port = cfg.bridgePort || 8931, brave = ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', process.env.LOCALAPPDATA + '\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'].find(p => fs.existsSync(p));
    const args = ['-y', '@playwright/mcp@latest', '--port', String(port), ...(cfg.bridgeArgs ? cfg.bridgeArgs.split(' ') : ['--extension']), ...(brave && !cfg.bridgeArgs ? ['--executable-path', brave] : [])];
    this.set('connected', 'Starting the Playwright plugin (approve the connection in the browser if asked)…');
    this.proc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { shell: process.platform === 'win32', windowsHide: true, env: process.env, stdio: 'ignore', detached: process.platform !== 'win32' });
    this.proc.on('exit', () => { if (this.mcp) { this.mcp = null; clearInterval(this.timer); this.set('disconnected', 'Plugin process stopped'); } });
    this.mcp = new Mcp(`http://127.0.0.1:${port}/mcp`);
    for (let i = 0; i < 40; i++) { try { await this.mcp.init(); this.tabOk = false; this.timer = setInterval(() => this.tick().catch(() => {}), 1000); return true; } catch { await new Promise(r => setTimeout(r, 1500)); if (!this.proc) break; } }
    await this.disconnect(); this.set('disconnected', 'Could not start the Playwright plugin (needs Node/npx and the extension in the browser)'); return false;
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
    try { this.browser = await chromium.connectOverCDP(cfg.endpoint || 'http://127.0.0.1:9222', { timeout: 5000 }); }
    catch (e) { this.set('disconnected', 'Cannot reach Chrome on the debug port (use "Launch Chrome for Teams")'); return false; }
    this.browser.on('disconnected', () => { this.browser = null; this.page = null; clearInterval(this.timer); this.set('disconnected', 'Chrome closed'); });
    this.set('connected', 'Looking for the Teams tab…');
    this.timer = setInterval(() => this.tick().catch(() => {}), 1000); return true;
  }
  async disconnect() { clearInterval(this.timer); this.timer = null; this.page = null; if (this.mcp) { this.mcp = null; } if (this.proc) { const p = this.proc; this.proc = null; try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' }) : process.kill(-p.pid); } catch { try { p.kill(); } catch {} } } if (this.browser) { const b = this.browser; this.browser = null; await b.close().catch(() => {}); } this.set('disconnected', ''); }
  findPage() { const re = new RegExp(this.cfg.urlMatch || 'teams\\.(microsoft|cloud\\.microsoft)|mcas\\.ms', 'i'); for (const c of this.browser.contexts()) for (const p of c.pages()) if (re.test(p.url())) return p; return null; }
  async tick() {
    if (!this.mcp && !this.browser) return;
    let lines;
    if (this.mcp) lines = await this.bridgeLines();
    else { if (!this.browser) return;
      if (!this.page || this.page.isClosed()) { this.page = this.findPage(); if (!this.page) return this.set('connected', 'No Teams tab found'); }
      lines = await this.page.evaluate(READ).catch(() => null); }
    if (!lines || (!this.mcp && !this.browser)) return;
    if (!lines.length) return this.set('connected', 'Teams tab found, no captions (turn on live captions in the call)');
    this.set('captions', 'Reading live captions');
    if (!this.cfg.listen) return;
    const aliases = String(this.cfg.aliases || '').split(',').map(s => s.trim()).filter(Boolean), self = norm(this.cfg.self || '');
    for (const { s, t } of lines.slice(-6)) {
      const key = s + '|' + t; if (this.seen.has(key) || !t) continue; this.seen.set(key, Date.now());
      if (this.cfg.ignoreSelf && self && s && norm(s).includes(self)) continue;
      const alias = matchAlias(t, aliases); if (alias) this.emit('mention', { speaker: s || 'Someone', text: t, alias });
    }
    for (const [k, v] of this.seen) if (Date.now() - v > 120000) this.seen.delete(k);
  }
}
module.exports = { Teams, matchAlias };
