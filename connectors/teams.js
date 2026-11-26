// Teams connector: the existing Teams watcher + chat listing/sending, behind the common connector interface.
const { Teams } = require('../teams.js');
const { matchChats, isAlias } = require('./match.js');
const NAMES = () => [...document.querySelectorAll('[role=treeitem][aria-level="2"]')].map(x => (x.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean).map(i => (document.getElementById(i) || {}).innerText || '').join(' | ').replace(/\s*\|\s*(\|\s*)+/g, ' | '));
let chain = Promise.resolve();
const locked = fn => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; }; // one page action at a time: the brief and a send must not fight over the same tab
class TeamsConnector extends Teams {
  get id() { return 'teams'; }
  need() { if (!this.mcp) throw new Error('Teams plugin not connected (▶ Run Teams)'); }
  /** Chats whose name matches the query: [{ index, name }] */
  async listChats(query) {
    this.need(); const names = await this.ev(NAMES, null); if (!Array.isArray(names)) throw new Error('Chat list not available');
    const self = /^\s*(?:moi|me|myself|self|mon|my|mes|notes?)(?:\s+(?:chat|conversation|meme|même))?\s*$/i.test(query) || (this.cfg && isAlias(query, this.cfg.aliases)); // "me" / my aliases -> your own chat
    if (self) { const mine = names.map((n, i) => ({ index: i, name: n })).filter(x => /\(Vous\)|\(You\)/.test(x.name)); if (mine.length) return mine; }
    return matchChats(names, query).map(i => ({ index: i, name: names[i] }));
  }
  async allChats() { this.need(); const n = await this.ev(NAMES, null); return Array.isArray(n) ? n : []; }
  /** Opens the chat (by exact index from listChats) and types the text; sends only when send=true. Returns the chat title. */
  sendMessage(index, text, send = true, expect = '') { return locked(() => this._send(index, text, send, expect)); }
  brief() { return locked(() => super.brief()); }
  async _send(index, text, send = true, expect = '') {
    this.need(); if (!text || text.length > 2000) throw new Error('Invalid message length');
    const opened = await this.ev(async (hit) => { const nm = x => (x.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean).map(i => (document.getElementById(i) || {}).innerText || '').join(' | ').replace(/\s*\|\s*(\|\s*)+/g, ' | '); const e = [...document.querySelectorAll('[role=treeitem][aria-level="2"]')].find(x => nm(x) === hit.name); if (!e) return 'no-chat'; e.click(); await new Promise(r => setTimeout(r, 1500)); const w = String(hit.expect || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 12); for (let k = 0; k < 16 && w && !document.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(w); k++) await new Promise(r => setTimeout(r, 500)); return document.title; }, { ...(typeof index === 'object' ? index : { name: String(index) }), expect });
    if (opened === 'no-chat') throw new Error('Chat not found (list changed)');
    const nz = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (expect && !nz(opened).includes(nz(expect).slice(0, 12))) throw new Error('Opened the wrong chat (' + opened + ')'); // list order changed between search and click: never type into another chat
    await this.ev(async () => { for (let i = 0; i < 20 && !document.querySelector('[data-tid=ckeditor]'); i++) await new Promise(r => setTimeout(r, 500)); return 1; });
    for (let k = 0; ; k++) { try { await this.mcp.call('browser_type', { target: '[data-tid=ckeditor]', text }); break; } catch (e) { if (k >= 2) throw e; await new Promise(r => setTimeout(r, 1500)); } } // Teams sometimes needs a moment after switching chats
    const typed = await this.ev(t => { const ck = document.querySelector('[data-tid=ckeditor]'); return ck && ck.innerText.trim() === t.trim() ? 'ok' : 'mismatch'; }, text);
    if (typed !== 'ok') throw new Error('Could not type the message (' + typed + ')');
    if (!send) return opened;
    const count = () => this.ev(x => document.body.innerText.split(x).length - 1, text), before = await count();
    const sent = await this.ev(() => { const b = document.querySelector('[data-tid="sendMessageCommands-send"]'); if (!b) return 'no-send'; b.click(); return 'ok'; });
    if (sent !== 'ok') throw new Error('Send button not found');
    for (let i = 0; i < 16; i++) { // confirm: composer emptied and the text now appears once more in the conversation
      await new Promise(r => setTimeout(r, 500));
      const empty = await this.ev(() => (document.querySelector('[data-tid=ckeditor]') || { innerText: '' }).innerText.trim() === '');
      if (empty && (await count()) > before) return opened;
      if (i === 5 && !empty) await this.mcp.call('browser_press_key', { key: 'Enter' }).catch(() => {}); // button click ignored: try Enter
    }
    throw new Error('Message not confirmed as sent in ' + opened);
    return opened;
  }
}
module.exports = { TeamsConnector };
