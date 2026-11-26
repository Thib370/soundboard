window.api.onPopupData(d => {
  document.getElementById('s').textContent = d.speaker; document.getElementById('t').textContent = d.text;
  const r = document.getElementById('r'); r.innerHTML = '';
  d.replies.forEach((x, i) => { const b = document.createElement('button'); b.textContent = (i === 0 ? 'Approve: ' : 'Play: ') + x.name + (i === 0 ? ' (Ctrl+Alt+Enter)' : ''); b.onclick = () => window.api.popupChoice(x.id); r.append(b); });
  if (!d.replies.length) r.textContent = 'No reply samples in the chosen folder.';
  let n = d.timeout; const k = document.getElementById('k'); k.textContent = 'Closes in ' + n + 's';
  setInterval(() => { n = Math.max(0, n - 1); k.textContent = 'Closes in ' + n + 's'; }, 1000);
  document.getElementById('x').onclick = () => window.api.popupChoice(null);
});
