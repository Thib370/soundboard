// Voice side (platform-agnostic): local Whisper speech-to-text, command parsing (regex first, local Ollama fallback), Windows text-to-speech.
const { spawn, execFile } = require('child_process'), fs = require('fs'), path = require('path');
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function transcribe(dataDir, wavPath, lang, hint, fast) {
  const dir = path.join(dataDir, 'whisper'), cli = path.join(dir, 'Release', 'whisper-cli.exe'), model = (fast ? ['ggml-base.bin'] : ['ggml-small.bin', 'ggml-base.bin']).map(f => path.join(dir, f)).find(f => fs.existsSync(f) && fs.statSync(f).size > 1e8) || path.join(dir, 'ggml-base.bin'), prompt = fast ? (hint || '') : 'Commands: envoie, dis, dans le chat, in the chat say, joue, play, mute, unmute, raccroche, leave, join. ' + (hint || '');
  if (!fs.existsSync(cli) || !fs.existsSync(model)) return Promise.reject(new Error('Whisper not installed in ' + dir));
  const run = l => new Promise((res, rej) => execFile(cli, ['-m', model, '-f', wavPath, '-l', l, '-nt', '-np', '--prompt', prompt], { windowsHide: true, timeout: 60000 }, (e, out) => e ? rej(e) : res(String(out).trim())));
  return run(lang || 'auto').then(t => /[^\u0000-\u024F\u2000-\u206F]/.test(t) ? run('fr') : t); // auto-detect picked a non-Latin language on a short clip: retry in French
}

/** Spoken command -> intent, or null. */
function parse(text) {
  const t = String(text).replace(/\s+/g, ' ').trim().replace(/\.+$/, ''), n = norm(t);
  if (!t) return null;
  let m;
  const SAY = '(?:say|tell|write|send|type|dis|dit|ecris|envoie|ecrit)', same = n.length === t.length; // same: indexes of n map onto t, so the message keeps its case and accents
  const cut = (mm, g) => same ? t.slice(mm.indices[g][0], mm.indices[g][1]).trim() : mm[g].trim();
  const P1 = new RegExp('^(?:please |s.il te plait )?(?:in|on|to|dans|sur|a)\\s+(?:the |le |la |les )?(.+?)\\s+(?:chat|conversation|discussion|channel)\\s*,?\\s*' + SAY + '\\s*:?\\s*(.+)$', 'd');
  const P2 = new RegExp('^(?:in|on|to|dans|sur|a)\\s+(?:the |le |la )?(?:chat|conversation|discussion)\\s+(?:de |du |des |named |called )?(.+?)\\s*,?\\s*' + SAY + '\\s*:?\\s*(.+)$', 'd');
  if ((m = n.match(P1) || n.match(P2))) return { action: 'chat', target: m[1].trim(), text: cut(m, 2) };
  if ((m = n.match(new RegExp('^' + SAY + '\\s+(.+?)\\s+(?:to|a)\\s+(?:the |le |la |les )?(.+?)\\s+(?:chat|conversation)$', 'd')))) return { action: 'chat', target: m[2].trim(), text: cut(m, 1) };
  if ((m = n.match(/^(?:play|joue|lance|launch)\s+(?:the |le |la )?(.+)$/))) return { action: 'play', name: m[1].trim() };
  if (/^(?:stop|arrete|silence)\b/.test(n)) return { action: 'stop' };
  if (/^(?:un ?mute|unmute|reactive|active (?:le )?(?:micro|mic))/.test(n)) return { action: 'unmute' };
  if (/^(?:mute|coupe|desactive|mets? (?:le )?(?:micro|mic) (?:en )?(?:muet|sourdine))/.test(n)) return { action: 'mute' };
  if (/^(?:leave|quit|quitte|raccroche|hang up)/.test(n)) return { action: 'leave' };
  if ((m = n.match(/^(?:join|rejoins?|rejoindre|connect)\s+(?:the |le |la )?(.+)$/))) return { action: 'join', target: m[1].replace(/\s+(?:meeting|reunion|call)$/, '').trim() };
  return null;
}
const yesNo = text => { const n = norm(text).replace(/[^a-z ]/g, ' '); return /\b(yes|yeah|yep|oui|ok|okay|send|envoie|confirm|go)\b/.test(n) ? true : /\b(no|non|cancel|annule|stop|nope)\b/.test(n) ? false : null; };

/** Local LLM fallback when the regex parser does not understand the sentence. */
async function parseLLM(text, model, names, chats, url) {
  const sys = 'You convert a (possibly mis-transcribed, French or English) spoken command into JSON. Actions: {"action":"chat","target":"<chat name>","text":"<message>"}, {"action":"play","name":"<sample>"}, {"action":"stop"}, {"action":"mute"}, {"action":"unmute"}, {"action":"leave"}, {"action":"join","target":"<meeting>"}, {"action":"none"}. '
    + 'Sending a message to a chat/group/person = chat. Fix speech-recognition errors using the known names. Known chats: ' + (chats || []).slice(0, 40).join('; ') + '. Known samples: ' + names.slice(0, 40).join(', ') + '. '
    + 'Examples: "envoie dans les guignols à Kekar" -> {"action":"chat","target":"guignols","text":"Kekar"}; "dis bonjour dans le daily" -> {"action":"chat","target":"daily","text":"bonjour"}; "message to Jerome: ok" -> {"action":"chat","target":"Jerome","text":"ok"}. Reply with JSON only.';
  const r = await fetch((url || 'http://localhost:11434') + '/api/chat', { method: 'POST', body: JSON.stringify({ model: model || 'qwen2.5:7b', stream: false, format: 'json', messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], options: { temperature: 0 } }), signal: AbortSignal.timeout(30000) });
  const o = JSON.parse((await r.json()).message.content); return o && o.action && o.action !== 'none' ? o : null;
}

let q = Promise.resolve();
/** Reads the text aloud on the default output (your headphones), queued. The text goes through an env var, never the command line. */
function speak(text, wavOut) {
  const ps = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " + (wavOut ? "$s.SetOutputToWaveFile($env:SBOUT); " : '') + "$s.Speak($env:SBTEXT); $s.Dispose()";
  const job = () => new Promise(res => { const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, env: { ...process.env, SBTEXT: String(text).slice(0, 500), SBOUT: wavOut || '' }, stdio: 'ignore' }); p.on('exit', res); p.on('error', res); });
  return (q = q.then(job));
}
module.exports = { transcribe, parse, parseLLM, yesNo, speak };
