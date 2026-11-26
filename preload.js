const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'), save: c => ipcRenderer.invoke('save', c), read: p => ipcRenderer.invoke('read', p),
  saveRecording: b => ipcRenderer.invoke('save-recording', b), pick: () => ipcRenderer.invoke('pick'), importUrl: u => ipcRenderer.invoke('import-url', u), updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
  onPlay: f => ipcRenderer.on('play', (_, id) => f(id)), onStop: f => ipcRenderer.on('stop', () => f()),
});
