import { Engine } from './engine.js';
const mark = () => document.querySelectorAll('#grid .snd').forEach(d => { const p = d.querySelector('.play'), on = eng.isPlaying(p.dataset.id); p.classList.toggle('on', on); d.querySelector('.stopone').hidden = !on; });
const $ = id => document.getElementById(id), eng = new Engine(); eng.onChange = () => mark();
let cfg = { sounds: [], settings: {} };
const save = () => window.api.save(cfg), say = t => $('msg').textContent = t;
const fill = (sel, list, cur) => { sel.innerHTML = '<option value="">Default</option>' + list.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join(''); sel.value = cur || ''; };
async function loadSound(s) { try { await eng.decode(s.id, await window.api.read(s.path)); } catch (e) { say('Cannot load ' + s.name + ': ' + e.message); } }
function render() {
  $('grid').innerHTML = '';
  cfg.sounds.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'snd';
    const b = document.createElement('button'); b.className = 'play'; b.textContent = (i < 9 ? (i + 1) + '. ' : '') + s.name; b.onclick = () => eng.play(s.id); b.dataset.id = s.id; if (eng.isPlaying(s.id)) b.classList.add('on');
    const t = document.createElement('button'); t.className = 'stopone'; t.textContent = '■ stop'; t.hidden = !eng.isPlaying(s.id); t.onclick = () => eng.stop(s.id);
    const x = document.createElement('button'); x.className = 'del'; x.textContent = 'remove'; x.onclick = () => { eng.stop(s.id); cfg.sounds.splice(i, 1); save(); render(); };
    d.append(b, t, x); $('grid').append(d);
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

// Live routing diagram: who plays, where it goes, and levels.
const nameOf = id => cfg.sounds.find(s => s.id === id)?.name || id;
const optName = sel => { if (sel.value) return sel.selectedOptions[0]?.textContent || sel.value; const d = [...sel.options].find(o => o.value === 'default'); return d ? d.textContent : 'System default'; };
// Name Discord/Teams must select as input: the cable's recording side ("CABLE Input" -> "CABLE Output").
const discordIn = name => /input/i.test(name) && /cable|virtual/i.test(name) ? name.replace(/Input/i, 'Output') : null;
function frame() {
  const ids = [...eng.byKey.keys()], mixOn = !!eng.micStream, lv = { m: eng.level(eng.anMic), h: eng.level(eng.anMon), i: mixOn ? eng.level(eng.anIn) : 0 };
  $('playing').textContent = ids.length ? ids.map(nameOf).join(', ') : 'idle';
  $('inName').textContent = (mixOn ? 'in: ' : 'off · ') + optName($('micIn'));
  $('volTxt').textContent = Math.round($('vol').value * 100) + '%';
  const mo = optName($('micOut')), di = discordIn(mo);
  $('micName').textContent = (eng.sendToMic ? 'App output: ' + mo : 'disabled (tick Send to mic)');
  $('discName').textContent = di ? 'Discord/Teams input must be: ' + di : (/default/i.test(mo) || !mo ? 'Output is not the cable: set App output to CABLE Input' : 'Discord/Teams input: pick the cable matching this device');
  $('monName').textContent = eng.monitor ? 'out: ' + optName($('monOut')) : 'disabled';
  $('mMic').style.width = lv.m * 100 + '%'; $('mMon').style.width = lv.h * 100 + '%'; $('mIn').style.width = lv.i * 100 + '%';
  $('nSounds').classList.toggle('live', ids.length > 0); $('nIn').classList.toggle('live', mixOn); $('nApp').classList.toggle('live', ids.length > 0 || mixOn);
  $('nMic').classList.toggle('live', eng.sendToMic && (lv.m > 0.01 || ids.length > 0)); $('nMon').classList.toggle('live', eng.monitor && ids.length > 0);
  $('a1').classList.toggle('live', ids.length > 0 || mixOn); $('a2').classList.toggle('live', ids.length > 0 || mixOn);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
