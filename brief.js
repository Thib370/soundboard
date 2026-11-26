// Local summary through Ollama (127.0.0.1:11434). Returns null if Ollama or the model is missing: callers show the plain list.
async function summarize(b, model = 'qwen2.5:7b', url = 'http://127.0.0.1:11434') {
  if (!b.unread || !b.unread.length) return null;
  const items = b.unread.slice(0, 25).map(u => `- ${u.title}${u.time ? ' (' + u.time + ')' : ''}: ${u.message}`.slice(0, 240)).join('\n'), meets = (b.meetings || []).map(x => `- ${x.start}-${x.end} ${x.title}`).join('\n');
  const prompt = `You write a morning brief from Teams data. Rules: use ONLY facts in the data; no advice, no generic tips, no deadlines or times that are not in the data; one short bullet per unread chat saying who wrote and what they ask (put urgent or direct questions first), then one line listing today's meetings with their times. Max 6 bullets. If a field is missing, skip it.\n\nUNREAD CHATS:\n${items}\n\nTODAY'S MEETINGS:\n${meets || '(none)'}`;
  try {
    const r = await fetch(url + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: model || 'qwen2.5:7b', prompt, stream: false, keep_alive: '5m', options: { temperature: 0.2, num_ctx: 4096 } }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) return null; return String((await r.json()).response || '').trim() || null;
  } catch { return null; }
}
module.exports = { summarize };
