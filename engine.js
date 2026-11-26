// Audio engine: plays each sound in two AudioContexts (virtual mic + monitor headphones).
export class Engine {
  constructor() { this.micCtx = new AudioContext(); this.monCtx = new AudioContext();
    this.micGain = this.micCtx.createGain(); this.monGain = this.monCtx.createGain();
    this.micBus = this.micCtx.createGain(); this.mixGate = this.micCtx.createGain(); this.mixGate.connect(this.micBus); this.micGain.connect(this.micBus); this.limiter = this.micCtx.createDynamicsCompressor(); this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.1; this.micBus.connect(this.limiter); this.limiter.connect(this.micCtx.destination); this.gains = new Map(); this.monGain.connect(this.monCtx.destination);
    const an = c => { const a = c.createAnalyser(); a.fftSize = 512; return a; };
    this.anMic = an(this.micCtx); this.anMon = an(this.monCtx); this.anIn = an(this.micCtx);
    this.micBus.connect(this.anMic); this.monGain.connect(this.anMon);
    this.sendToMic = false; this.monitor = true; this.buffers = new Map(); this.active = new Set(); this.byKey = new Map(); this.onChange = () => {}; this.micStream = null; this.micSrc = null; }
  async devices() {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); } catch {}
    const all = await navigator.mediaDevices.enumerateDevices();
    return { outputs: all.filter(d => d.kind === 'audiooutput'), inputs: all.filter(d => d.kind === 'audioinput') };
  }
  async setMicSink(id) { if (this.micCtx.setSinkId) await this.micCtx.setSinkId(id || ''); }
  async setMonSink(id) { if (this.monCtx.setSinkId) await this.monCtx.setSinkId(id || ''); }
  setVolume(v) { this.micGain.gain.value = v; this.monGain.gain.value = v; }
  async decode(key, bytes) { const b = await this.micCtx.decodeAudioData(bytes.slice(0)); this.buffers.set(key, b); return b; }
  level(an) { const d = new Uint8Array(an.fftSize); an.getByteTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v - 128)); return Math.min(1, m / 90); }
  forget(key) { this.stop(key); this.buffers.delete(key); this.gains.delete(key); this.byKey.delete(key); }
  isPlaying(key) { return (this.byKey.get(key)?.size || 0) > 0; }
  // Toggle: clicking a playing sound stops it, otherwise starts it.
  play(key) {
    const now = Date.now(); if (now - (this.lastPlay?.get(key) || 0) < 250) return; (this.lastPlay ||= new Map()).set(key, now); // ignore double-clicks
    if (this.isPlaying(key)) return this.stop(key);
    const buf = this.buffers.get(key); if (!buf) return;
    const targets = [];
    if (this.sendToMic) targets.push([this.micCtx, this.micGain]);
    if (this.monitor) targets.push([this.monCtx, this.monGain]);
    const set = new Set(); this.byKey.set(key, set);
    for (const [ctx, gain] of targets) {
      if (ctx.state === 'suspended') ctx.resume();
      const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = this.gains.get(key) ?? 1.2; s.connect(g); g.connect(gain); s._g = g;
      set.add(s); this.active.add(s);
      s.onended = () => { set.delete(s); this.active.delete(s); if (!set.size) this.byKey.delete(key); this.onChange(); };
      s.start();
    }
    if (!set.size) this.byKey.delete(key);
    this.onChange();
  }
  // Per-sound boost (1 = normal, up to 4); applies live to a playing sound. A limiter on the mic path avoids clipping.
  setGain(key, v) { this.gains.set(key, v); (this.byKey.get(key) || []).forEach(s => s._g && (s._g.gain.value = v)); }
  stop(key) { (this.byKey.get(key) || []).forEach(s => { try { s.stop(); } catch {} }); }
  stopAll() { [...this.active].forEach(s => { try { s.stop(); } catch {} }); }
  // Real mic: `mix` sends it to the virtual mic; `hear` plays it in the headphones (sidetone). Independent toggles, one shared stream.
  async setMic(mix, hear, deviceId) {
    const seq = this.micSeq = (this.micSeq || 0) + 1;
    this.micSrc?.disconnect(); this.monSrc?.disconnect(); this.micSrc = this.monSrc = null;
    this.mixOn = mix; this.hearOn = hear;
    if (!mix && !hear) { this.micStream?.getTracks().forEach(t => t.stop()); this.micStream = null; return; }
    if (this.micStreamId !== (deviceId || '') || !this.micStream?.active) {
      this.micStream?.getTracks().forEach(t => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false } });
      if (seq !== this.micSeq) { s.getTracks().forEach(t => t.stop()); return; } // a newer call took over
      this.micStream = s; this.micStreamId = deviceId || '';
    }
    if (mix) { this.micSrc = this.micCtx.createMediaStreamSource(this.micStream); this.micSrc.connect(this.mixGate); this.micSrc.connect(this.anIn); }
    if (hear) { this.monSrc = this.monCtx.createMediaStreamSource(this.micStream); this.monSrc.connect(this.monCtx.destination); }
  }
}
