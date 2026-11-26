// Teams connector: the existing Teams watcher + chat listing/sending, behind the common connector interface.
const { Teams } = require('../teams.js');
const { matchChats } = require('./match.js');
const NAMES = () => [...document.querySelectorAll('[role=treeitem][aria-level="2"]')].map(x => (x.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean).map(i => (document.getElementById(i) || {}).innerText || '').join(' | ').replace(/\s*\|\s*(\|\s*)+/g, ' | '));
class TeamsConnector extends Teams {
  get id() { return 'teams'; }
  need() { if (!this.mcp) throw new Error('Teams plugin not connected (▶ Run Teams)'); }
  /** Chats whose name matches the query: [{ index, name }] */
  async listChats(query) {
    this.need(); const names = await this.ev(NAMES, null); if (!Array.isArray(names)) throw new Error('Chat list not available');
    return matchChats(names, query).map(i => ({ index: i, name: names[i] }));
  }
  async allChats() { this.need(); const n = await this.ev(NAMES, null); return Array.isArray(n) ? n : []; }
  /** Opens the chat (by exact index from listChats) and types the text; sends only when send=true. Returns the chat title. */
  async sendMessage(index, text, send = true) {
    this.need(); if (!text || text.length > 2000) throw new Error('Invalid message length');
    const opened = await this.ev(async i => { const e = document.querySelectorAll('[role=treeitem][aria-level="2"]')[i]; if (!e) return 'no-chat'; e.click(); await new Promise(r => setTimeout(r, 2500)); return document.title; }, index);
    if (opened === 'no-chat') throw new Error('Chat not found (list changed)');
    await this.ev(async () => { for (let i = 0; i < 20 && !document.querySelector('[data-tid=ckeditor]'); i++) await new Promise(r => setTimeout(r, 500)); return 1; });
    await this.mcp.call('browser_type', { target: '[data-tid=ckeditor]', text });
    const typed = await this.ev(t => { const ck = document.querySelector('[data-tid=ckeditor]'); return ck && ck.innerText.trim() === t.trim() ? 'ok' : 'mismatch'; }, text);
    if (typed !== 'ok') throw new Error('Could not type the message (' + typed + ')');
    if (!send) return opened;
    const sent = await this.ev(() => { const b = document.querySelector('[data-tid="sendMessageCommands-send"]'); if (!b) return 'no-send'; b.click(); return 'ok'; });
    if (sent !== 'ok') throw new Error('Send button not found');
    return opened;
  }
}
module.exports = { TeamsConnector };
