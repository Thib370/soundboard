import { Engine } from './engine.js';
const $ = id => document.getElementById(id), eng = new Engine();
let cfg = { sounds: [], settings: {} };
const save = () => window.api.save(cfg), say = t => $('msg').textContent = t;
const fill = (sel, list, cur) => { sel.innerHTML = '<option value="">Default</option>' + list.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join(''); sel.value = cur || ''; };
async function loadSound(s) { try { await eng.decode(s.id, await window.api.read(s.path)); } catch (e) { say('Cannot load ' + s.name + ': ' + e.message); } }
function render() {
  $('grid').innerHTML = '';
  cfg.sounds.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'snd';
    const b = document.createElement('button'); b.className = 'play'; b.textContent = (i < 9 ? (i + 1) + '. ' : '') + s.name; b.onclick = () => eng.play(s.id);
    const x = document.createElement('button'); x.className = 'del'; x.textContent = 'remove'; x.onclick = () => { cfg.sounds.splice(i, 1); save(); render(); };
    d.append(b, x); $('grid').append(d);
  });
}
async function addSound(name, path) { const s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, path }; await loadSound(s); cfg.sounds.push(s); await save(); render(); }
async function init() {
  cfg = await window.api.load(); cfg.settings ||= {}; const st = cfg.settings;
  const { outputs, inputs } = await eng.devices();
  fill($('micOut'), outputs, st.micOut); fill($('monOut'), outputs, st.monOut); fill($('micIn'), inputs, st.micIn);
  $('warn').hidden = outputs.some(o => /cable|virtual/i.test(o.label));
  if (!st.micOut) { const v = outputs.find(o => /cable input/i.test(o.label)); if (v) { $('micOut').value = v.deviceId; st.micOut = v.deviceId; } }
  $('send').checked = !!st.send; $('mon').checked = st.mon !== false; $('vol').value = st.vol ?? 0.8;
  eng.sendToMic = $('send').checked; eng.monitor = $('mon').checked; eng.setVolume(+$('vol').value);
  await eng.setMicSink($('micOut').value); await eng.setMonSink($('monOut').value);
  for (const s of cfg.sounds) await loadSound(s);
  render();
}
const upd = (k, v) => { cfg.settings[k] = v; save(); };
$('send').onchange = e => { eng.sendToMic = e.target.checked; upd('send', e.target.checked); };
$('mon').onchange = e => { eng.monitor = e.target.checked; upd('mon', e.target.checked); };
$('vol').oninput = e => { eng.setVolume(+e.target.value); upd('vol', +e.target.value); };
$('micOut').onchange = e => { eng.setMicSink(e.target.value); upd('micOut', e.target.value); };
$('monOut').onchange = e => { eng.setMonSink(e.target.value); upd('monOut', e.target.value); };
$('micIn').onchange = async e => { upd('micIn', e.target.value); if ($('mix').checked) await eng.setMicMix(true, e.target.value); };
$('mix').onchange = async e => { try { await eng.setMicMix(e.target.checked, $('micIn').value); } catch (x) { say(x.message); e.target.checked = false; } };
$('stop').onclick = () => eng.stopAll();
$('add').onclick = async () => { for (const p of await window.api.pick()) await addSound(p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), p); };
$('imp').onclick = async () => { const u = $('url').value.trim(); if (!u) return; say('Downloading…'); try { const r = await window.api.importUrl(u); await addSound(r.name, r.path); $('url').value = ''; say('Added: ' + r.name); } catch (e) { say('Import failed: ' + e.message); } };
$('upd').onclick = async () => { say('Updating yt-dlp…'); try { await window.api.updateYtdlp(); say('yt-dlp updated'); } catch (e) { say(e.message); } };
window.api.onPlay(id => eng.play(id)); window.api.onStop(() => eng.stopAll());
init();
