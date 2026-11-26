// Main-process Teams watcher: attaches to Chrome over CDP (Playwright), reads live captions, reports mentions of your aliases.
const { chromium } = require('playwright-core');
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
class Teams {
  constructor(emit) { this.emit = emit; this.browser = null; this.page = null; this.timer = null; this.seen = new Map(); this.state = 'disconnected'; }
  set(state, detail = '') { if (state !== this.state || detail !== this.detail) { this.state = state; this.detail = detail; this.emit('status', { state, detail }); } }
  async connect(cfg) {
    await this.disconnect(); this.cfg = cfg;
    try { this.browser = await chromium.connectOverCDP(cfg.endpoint || 'http://127.0.0.1:9222', { timeout: 5000 }); }
    catch (e) { this.set('disconnected', 'Cannot reach Chrome on the debug port (use "Launch Chrome for Teams")'); return false; }
    this.browser.on('disconnected', () => { this.browser = null; this.page = null; clearInterval(this.timer); this.set('disconnected', 'Chrome closed'); });
    this.set('connected', 'Looking for the Teams tab…');
    this.timer = setInterval(() => this.tick().catch(() => {}), 1000); return true;
  }
  async disconnect() { clearInterval(this.timer); this.timer = null; this.page = null; if (this.browser) { const b = this.browser; this.browser = null; await b.close().catch(() => {}); } this.set('disconnected', ''); }
  findPage() { const re = new RegExp(this.cfg.urlMatch || 'teams\\.(microsoft|cloud\\.microsoft)|mcas\\.ms', 'i'); for (const c of this.browser.contexts()) for (const p of c.pages()) if (re.test(p.url())) return p; return null; }
  async tick() {
    if (!this.browser) return;
    if (!this.page || this.page.isClosed()) { this.page = this.findPage(); if (!this.page) return this.set('connected', 'No Teams tab found'); }
    const lines = await this.page.evaluate(READ).catch(() => null); if (!lines) return;
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
