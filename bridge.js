// Local bridge (127.0.0.1 only): lets the PROne web page mirror the app state and trigger samples. No file/command access.
const http = require('http'), crypto = require('crypto'), { WebSocketServer } = require('ws');
const DEFAULT_ORIGINS = ['http://192.168.1.11', 'http://localhost:4200', 'http://127.0.0.1:4200'];
const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newToken = () => { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += A[b[i] % 32]; return s.slice(0, 4) + '-' + s.slice(4); };
function startBridge({ getCfg, saveCfg, validId, onCommand, ports = [8790, 8791, 8792] }) {
  const clients = new Set(); let state = {}, seq = 0, port = 0, badTokens = [], lockUntil = 0, throttle = null;
  const cfg = () => { const c = getCfg(); c.bridge ||= {}; if (!c.bridge.token) { c.bridge.token = newToken(); c.bridge.origins ||= []; saveCfg(c); } return c; };
  const origins = () => [...DEFAULT_ORIGINS, ...(cfg().bridge.origins || [])];
  // /health is readable from any origin (it only says "an app is running" and whether THIS origin is allowed), so pages on other addresses stay silent instead of logging CORS errors.
  const server = http.createServer((req, res) => {
    const o = req.headers.origin; res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ app: 'soundboard-mic', proto: 1, allowed: !!o && origins().includes(o) })); }
    res.writeHead(404); res.end(); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, sock, head) => {
    const ra = req.socket.remoteAddress; if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ra) || clients.size >= 8 || Date.now() < lockUntil || !origins().includes(req.headers.origin || '')) { sock.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return sock.destroy(); }
    wss.handleUpgrade(req, sock, head, ws => onConn(ws));
  });
  const send = (ws, o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} };
  const snapshot = () => ({ t: 'state', seq: ++seq, ts: Date.now(), data: state });
  function onConn(ws) {
    let authed = false, cmds = [];
    const timer = setTimeout(() => { if (!authed) ws.close(4401); }, 3000);
    ws.on('message', raw => {
      let m; try { m = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', code: 'bad-request' }); }
      if (!m || typeof m.t !== 'string') return send(ws, { t: 'error', code: 'bad-request' });
      if (m.t === 'auth') {
        const want = Buffer.from(cfg().bridge.token), got = Buffer.from(String(m.token || '').toUpperCase());
        if (want.length === got.length && crypto.timingSafeEqual(want, got)) { authed = true; clearTimeout(timer); clients.add(ws); send(ws, { t: 'ready', proto: 1, app: 'soundboard-mic' }); return send(ws, snapshot()); }
        badTokens = badTokens.filter(x => Date.now() - x < 60000); badTokens.push(Date.now()); if (badTokens.length >= 5) lockUntil = Date.now() + 300000;
        send(ws, { t: 'error', code: 'bad-token' }); return ws.close(4401);
      }
      if (!authed) return ws.close(4401);
      cmds = cmds.filter(x => Date.now() - x < 10000); cmds.push(Date.now()); if (cmds.length > 20) return ws.close(4429);
      if (m.t === 'ping') return send(ws, { t: 'pong', ts: Date.now() });
      if (m.t === 'brief') { onCommand({ t: 'brief' }); return send(ws, { t: 'ack', id: 'brief', ok: true }); }
      if (m.t === 'join') { if (typeof m.title !== 'string' || !m.title || m.title.length > 80 || typeof m.id !== 'string' || !validId(m.id)) return send(ws, { t: 'error', code: 'bad-request' }); onCommand({ t: 'join', title: m.title, id: m.id, delay: Math.min(60, Math.max(0, +m.delay || 5)) }); return send(ws, { t: 'ack', id: 'join', ok: true }); }
      if (m.t === 'sync') return send(ws, snapshot());
      if (m.t === 'stop') { onCommand({ t: 'stop' }); return send(ws, { t: 'ack', id: 'stop', ok: true }); }
      if (m.t === 'play') { if (typeof m.id !== 'string' || !validId(m.id)) return send(ws, { t: 'error', code: 'unknown-id' }); onCommand({ t: 'play', id: m.id }); return send(ws, { t: 'ack', id: 'play', ok: true }); }
      send(ws, { t: 'error', code: 'bad-request' });
    });
    ws.on('close', () => { clearTimeout(timer); clients.delete(ws); });
    ws.on('error', () => {});
  }
  (async () => { for (const p of ports) { const ok = await new Promise(r => { const f = () => r(false); server.once('error', f); server.listen(p, '127.0.0.1', () => { server.off('error', f); r(true); }); }); if (ok) { port = p; return; } } })();
  return {
    push(s) { state = s; if (throttle) return; throttle = setTimeout(() => { throttle = null; const m = snapshot(); clients.forEach(ws => send(ws, m)); }, 100); },
    info() { const c = cfg(); return { port, token: c.bridge.token, origins: c.bridge.origins || [], defaults: DEFAULT_ORIGINS, clients: clients.size }; },
    rotate() { const c = cfg(); c.bridge.token = newToken(); saveCfg(c); clients.forEach(ws => ws.close(4401)); return c.bridge.token; },
    allowOrigin(o) { if (!/^https?:\/\/[\w.\-]+(:\d+)?$/.test(o)) throw new Error('Invalid origin (example: http://100.1.2.3)'); const c = cfg(); (c.bridge.origins ||= []).includes(o) || c.bridge.origins.push(o); saveCfg(c); },
    stop() { clients.forEach(ws => ws.close()); server.close(); },
  };
}
module.exports = { startBridge };
