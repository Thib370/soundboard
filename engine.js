// Audio engine: plays each sound in two AudioContexts (virtual mic + monitor headphones).
export class Engine {
  constructor() { this.micCtx = new AudioContext(); this.monCtx = new AudioContext();
    this.micGain = this.micCtx.createGain(); this.monGain = this.monCtx.createGain();
    this.micGain.connect(this.micCtx.destination); this.monGain.connect(this.monCtx.destination);
    this.sendToMic = false; this.monitor = true; this.buffers = new Map(); this.active = new Set(); this.micStream = null; this.micSrc = null; }
  async devices() {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); } catch {}
    const all = await navigator.mediaDevices.enumerateDevices();
    return { outputs: all.filter(d => d.kind === 'audiooutput'), inputs: all.filter(d => d.kind === 'audioinput') };
  }
  async setMicSink(id) { if (this.micCtx.setSinkId) await this.micCtx.setSinkId(id || ''); }
  async setMonSink(id) { if (this.monCtx.setSinkId) await this.monCtx.setSinkId(id || ''); }
  setVolume(v) { this.micGain.gain.value = v; this.monGain.gain.value = v; }
  async decode(key, bytes) { const b = await this.micCtx.decodeAudioData(bytes.slice(0)); this.buffers.set(key, b); return b; }
  play(key) {
    const buf = this.buffers.get(key); if (!buf) return;
    const targets = [];
    if (this.sendToMic) targets.push([this.micCtx, this.micGain]);
    if (this.monitor) targets.push([this.monCtx, this.monGain]);
    for (const [ctx, gain] of targets) {
      if (ctx.state === 'suspended') ctx.resume();
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(gain); s.start();
      this.active.add(s); s.onended = () => this.active.delete(s);
    }
  }
  stopAll() { this.active.forEach(s => { try { s.stop(); } catch {} }); this.active.clear(); }
  async setMicMix(on, deviceId) {
    if (this.micSrc) { this.micSrc.disconnect(); this.micSrc = null; }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    if (!on) return;
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false } });
    this.micSrc = this.micCtx.createMediaStreamSource(this.micStream); this.micSrc.connect(this.micCtx.destination);
  }
}
