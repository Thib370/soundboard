import { Engine } from './engine.js';
const mark = () => document.querySelectorAll('#grid .snd').forEach(d => { const p = d.querySelector('.play'), on = eng.isPlaying(p.dataset.id); p.classList.toggle('on', on); d.querySelector('.stopone').hidden = !on; });
const $ = id => document.getElementById(id), eng = new Engine(); eng.onChange = () => mark();
let cfg = { sounds: [], settings: {} };
const save = () => window.api.save(cfg), say = t => $('msg').textContent = t;
const fill = (sel, list, cur) => { sel.innerHTML = '<option value="">Default</option>' + list.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join(''); sel.value = cur || ''; };
async function loadSound(s) { eng.setGain(s.id, s.gain ?? DEF_GAIN); try { await eng.decode(s.id, await window.api.read(s.path)); } catch (e) { say('Cannot load ' + s.name + ': ' + e.message); } }
const DEF_GAIN = 1.2; // default boost for sounds without a saved value
const cur = () => cfg.settings.folder ?? '*';           // '*' = all, '' = unsorted, else folder name
function tabs() {
  const t = $('tabs'); t.innerHTML = '';
  const mk = (label, val) => { const b = document.createElement('button'); b.textContent = label; b.className = 'tab' + (cur() === val ? ' on' : ''); b.onclick = () => { cfg.settings.folder = val; save(); render(); }; t.append(b); };
  mk('All (' + cfg.sounds.length + ')', '*'); mk('Unsorted (' + cfg.sounds.filter(s => !s.folder).length + ')', '');
  (cfg.folders ||= []).forEach(f => mk(f + ' (' + cfg.sounds.filter(s => s.folder === f).length + ')', f));
  const real = cur() !== '*' && cur() !== ''; $('fRen').disabled = $('fDel').disabled = !real;
  $('grid').classList.toggle('list', !!cfg.settings.list); $('view').textContent = cfg.settings.list ? 'Grid view' : 'List view';
}
function render() {
  tabs(); $('grid').innerHTML = '';
  const shown = cfg.sounds.filter(s => cur() === '*' || (s.folder || '') === cur());
  shown.forEach(s => {
    const i = cfg.sounds.indexOf(s);
    const d = document.createElement('div'); d.className = 'snd';
    const b = document.createElement('button'); b.className = 'play'; b.textContent = (i < 9 ? (i + 1) + '. ' : '') + s.name; b.onclick = () => eng.play(s.id); b.dataset.id = s.id; if (eng.isPlaying(s.id)) b.classList.add('on');
    const t = document.createElement('button'); t.className = 'stopone'; t.textContent = '■ stop'; t.hidden = !eng.isPlaying(s.id); t.onclick = () => eng.stop(s.id);
    const gl = document.createElement('label'); gl.className = 'gain'; const gv = document.createElement('em'); const g = document.createElement('input');
    g.type = 'range'; g.min = 0.2; g.max = 4; g.step = 0.1; g.value = s.gain ?? DEF_GAIN; gv.textContent = '×' + (+g.value).toFixed(1); eng.setGain(s.id, +g.value);
    g.oninput = () => { s.gain = +g.value; gv.textContent = '×' + s.gain.toFixed(1); eng.setGain(s.id, s.gain); }; g.onchange = () => save(); gl.append('boost ', g, gv);
    const mv = document.createElement('select'); mv.className = 'move'; mv.title = 'Move to folder';
    mv.innerHTML = '<option value="">No folder</option>' + cfg.folders.map(f => `<option>${f.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</option>`).join(''); mv.value = s.folder || '';
    mv.onchange = () => { s.folder = mv.value; save(); render(); };
    const rn = document.createElement('button'); rn.className = 'del'; rn.textContent = 'rename';
    rn.onclick = () => {
      const inp = document.createElement('input'); inp.className = 'rename'; inp.value = s.name; inp.maxLength = 80; b.replaceWith(inp); inp.focus(); inp.select();
      let done = false; const fin = ok => { if (done) return; done = true; const n = inp.value.trim(); if (ok && n) { s.name = n; save(); } render(); };
      inp.onkeydown = e => { if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); }; inp.onblur = () => fin(true);
    };
    const x = document.createElement('button'); x.className = 'del'; x.textContent = 'remove'; x.onclick = () => { eng.stop(s.id); cfg.sounds.splice(cfg.sounds.indexOf(s), 1); save(); render(); };
    d.append(b, gl, t, mv, rn, x); $('grid').append(d);
  });
  if (!shown.length) $('grid').innerHTML = '<p class="hint">No sounds here.</p>';
}
async function addSound(name, path) { const s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, path, folder: cur() === '*' ? '' : cur() }; await loadSound(s); cfg.sounds.push(s); await save(); render(); }
async function init() {
  cfg = await window.api.load(); cfg.settings ||= {}; cfg.folders ||= []; const st = cfg.settings;
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
// Record own sample from the selected real mic (max 60 s), saved as a new sound.
let rec = null, recTimer = null, recMax = null;
async function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); }
$('rec').onclick = async () => {
  if (rec && rec.state === 'recording') return stopRec();
  try {
    const id = $('micIn').value, stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const chunks = []; rec = new MediaRecorder(stream); const t0 = Date.now();
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearInterval(recTimer); clearTimeout(recMax); stream.getTracks().forEach(t => t.stop()); $('rec').textContent = '● Record'; $('rec').classList.remove('recording');
      try { const buf = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer(); if (!buf.byteLength) throw new Error('empty recording');
        const p = await window.api.saveRecording(buf); const n = $('recName').value.trim() || 'Recording ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        await addSound(n, p); $('recName').value = ''; say('Saved: ' + n); } catch (e) { say('Recording failed: ' + e.message); }
    };
    rec.start(); $('rec').classList.add('recording');
    const tick = () => $('rec').textContent = '■ Stop (' + Math.floor((Date.now() - t0) / 1000) + 's)'; tick(); recTimer = setInterval(tick, 500);
    recMax = setTimeout(stopRec, 60000);
  } catch (e) { say('Cannot record: ' + e.message); }
};
const fname = () => $('folderName').value.trim().slice(0, 40);
$('fAdd').onclick = () => { const n = fname(); if (!n) return say('Type a folder name first'); if (cfg.folders.includes(n) || n === '*') return say('Folder exists or invalid'); cfg.folders.push(n); cfg.settings.folder = n; $('folderName').value = ''; save(); render(); };
$('fRen').onclick = () => { const n = fname(), o = cur(); if (!n || cfg.folders.includes(n)) return say('Type a new, unused folder name'); cfg.folders[cfg.folders.indexOf(o)] = n; cfg.sounds.forEach(s => { if (s.folder === o) s.folder = n; }); cfg.settings.folder = n; $('folderName').value = ''; save(); render(); };
$('fDel').onclick = () => { const o = cur(); cfg.folders = cfg.folders.filter(f => f !== o); cfg.sounds.forEach(s => { if (s.folder === o) s.folder = ''; }); cfg.settings.folder = ''; save(); render(); say('Folder deleted; its sounds moved to Unsorted'); };
$('view').onclick = () => { cfg.settings.list = !cfg.settings.list; save(); render(); };
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
