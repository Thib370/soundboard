// Router: spoken/typed text -> intent -> connector action. Platform-agnostic: works with any connector exposing
// listChats / sendMessage / join / leave / setMute. Irreversible actions (chat send, join, leave) always wait for a spoken "yes".
const { parse, parseLLM, yesNo } = require('./voice.js');
const short = n => { const p = String(n).split(' | ').map(x => x.trim()).filter(Boolean); return p.length > 1 ? p[1] : p[0] || ''; };
function createRouter({ getConnector, speak, play, stop, sounds, status, model, listen, llmUrl, brief }) {
  let pending = null, retries = 0;
  // 60 s to answer, counted after the readback
  const ask = (label, run) => { retries = 0; pending = { run, label, exp: Date.now() + 120000 }; status({ state: 'confirm', msg: label }); return speak(label + ' Say yes or no.').then(() => { if (pending) { pending.exp = Date.now() + 60000; listen && listen(); } }); };
  const say = msg => { status({ state: 'idle', msg }); return speak(msg); };
  async function execute(it) {
    const c = getConnector(); if (!c) return say('No platform connected.');
    switch (it.action) {
      case 'chat': {
        const hits = await c.listChats(it.target);
        if (!hits.length) return say('No chat matches ' + it.target + '.');
        if (hits.length > 1) return say('Several chats match: ' + hits.slice(0, 4).map(h => short(h.name)).join(', ') + '. Be more specific.');
        const h = hits[0]; return ask('Send to ' + short(h.name) + ': ' + it.text + '?', async () => { await c.sendMessage(h, it.text, true, short(h.name)); return say('Sent.'); });
      }
      case 'play': { const s = sounds().find(x => x.name.toLowerCase().includes(String(it.name).toLowerCase())); return s ? (play(s.id), status({ state: 'idle', msg: 'Playing ' + s.name })) : say('No sample named ' + it.name + '.'); }
      case 'brief': brief && brief(); return say('Checking Teams.');
      case 'stop': stop(); return status({ state: 'idle', msg: 'Stopped' });
      case 'mute': case 'unmute': return say(await c.setMute(it.action === 'mute'));
      case 'leave': return ask('Leave the call?', async () => say(await c.leave()));
      case 'join': return ask('Join ' + (it.target || 'the meeting') + '?', async () => { say('Joining.'); return say(await c.join(it.target || 'Daily meeting')); });
      default: return say('I did not understand.');
    }
  }
  async function handleText(text) {
    status({ state: 'thinking', text });
    try {
      if (pending && Date.now() < pending.exp) {
        const yn = yesNo(text);
        if (yn === null) { if (retries++ < 1) { status({ state: 'confirm', msg: 'Say yes or no' }); return speak('Please say yes or no.').then(() => listen && listen()); } pending = null; return say('Cancelled.'); }
        const p = pending; pending = null; if (!yn) return say('Cancelled.'); return await p.run();
      }
      pending = null;
      const c = getConnector(), it = parse(text) || await parseLLM(text, model, sounds().map(s => s.name), c && c.allChats ? (await c.allChats().catch(() => [])).map(short) : [], llmUrl && llmUrl()).catch(() => null);
      return it ? await execute(it) : say('I did not understand: ' + text);
    } catch (e) { pending = null; return say('Failed: ' + String(e.message).replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').slice(0, 600)); }
  }
  return { handleText, isPending: () => !!pending && Date.now() < pending.exp, cancel: () => { if (!pending) return; pending = null; return say('Cancelled.'); } };
}
module.exports = { createRouter, short };
