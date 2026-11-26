// Fuzzy chat-name matching shared by connectors (accent/case-insensitive, 1 typo tolerated on words of 5+ letters).
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const STOP = new Set(['chat', 'the', 'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'conversation', 'groupe', 'group']);
const wordHit = (q, w) => w === q || (q.length >= 4 && (w.startsWith(q) || q.startsWith(w) && w.length >= 4)) || (q.length >= 5 && w.length >= 5 && lev(q, w) <= 1);
/** names: string[]; returns indexes of names where every meaningful query word matches a word of the name; exact-name hits win. */
function matchChats(names, query) {
  const q = words(query).filter(w => !STOP.has(w)); if (!q.length) return [];
  const hits = names.map((n, i) => ({ i, w: words(n) })).filter(({ w }) => q.every(x => w.some(y => wordHit(x, y))));
  const exact = hits.filter(h => norm(names[h.i]).trim() === norm(query).trim()); return (exact.length ? exact : hits).map(h => h.i);
}
/** True when any word of the query is close (<=2 typos) to one of the comma-separated aliases (e.g. Whisper hears "Tibo" for "Thib"). */
const isAlias = (query, aliases) => { const al = String(aliases || '').split(',').map(a => norm(a).trim()).filter(a => a.length >= 3); return words(query).filter(w => w.length >= 3 && !STOP.has(w)).some(w => al.some(a => w === a || lev(w, a) <= (a.length >= 5 ? 2 : 1))); };
module.exports = { matchChats, norm, isAlias };
