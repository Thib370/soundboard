const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'), save: c => ipcRenderer.invoke('save', c), read: p => ipcRenderer.invoke('read', p),
  saveRecording: b => ipcRenderer.invoke('save-recording', b), pick: () => ipcRenderer.invoke('pick'), importUrl: u => ipcRenderer.invoke('import-url', u), updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
  teamsConnect: c => ipcRenderer.invoke('teams-connect', c), teamsDisconnect: () => ipcRenderer.invoke('teams-disconnect'), teamsConfig: c => ipcRenderer.invoke('teams-config', c), teamsLaunch: () => ipcRenderer.invoke('teams-launch'),
  onTeamsStatus: f => ipcRenderer.on('teams-status', (_, d) => f(d)), bridgePush: s => ipcRenderer.send('bridge-push', s), bridgeInfo: () => ipcRenderer.invoke('bridge-info'), bridgeRotate: () => ipcRenderer.invoke('bridge-rotate'), bridgeAllow: o => ipcRenderer.invoke('bridge-allow', o),
  onTeamsCall: f => ipcRenderer.on('teams-call', (_, d) => f(d)), onTeamsLog: f => ipcRenderer.on('teams-log', (_, d) => f(d)),
  onPopupData: f => ipcRenderer.on('popup-data', (_, d) => f(d)), popupChoice: id => ipcRenderer.send('popup-choice', id),
  onPlay: f => ipcRenderer.on('play', (_, id) => f(id)), onStop: f => ipcRenderer.on('stop', () => f()),
});
