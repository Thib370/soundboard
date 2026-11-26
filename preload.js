const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'), save: c => ipcRenderer.invoke('save', c), read: p => ipcRenderer.invoke('read', p),
  saveRecording: b => ipcRenderer.invoke('save-recording', b), pick: () => ipcRenderer.invoke('pick'), importUrl: u => ipcRenderer.invoke('import-url', u), updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
  teamsConnect: c => ipcRenderer.invoke('teams-connect', c), appRestart: () => ipcRenderer.invoke('app-restart'),
  teamsDisconnect: () => ipcRenderer.invoke('teams-disconnect'), teamsConfig: c => ipcRenderer.invoke('teams-config', c), teamsLaunch: () => ipcRenderer.invoke('teams-launch'),
  onTeamsStatus: f => ipcRenderer.on('teams-status', (_, d) => f(d)), bridgePush: s => ipcRenderer.send('bridge-push', s), bridgeInfo: () => ipcRenderer.invoke('bridge-info'), bridgeRotate: () => ipcRenderer.invoke('bridge-rotate'), bridgeAllow: o => ipcRenderer.invoke('bridge-allow', o),
  teamsBrief: () => ipcRenderer.invoke('teams-brief'), onTeamsBrief: f => ipcRenderer.on('teams-brief', (_, d) => f(d)),
  onTeamsCall: f => ipcRenderer.on('teams-call', (_, d) => f(d)), onTeamsLog: f => ipcRenderer.on('teams-log', (_, d) => f(d)),
  onPopupData: f => ipcRenderer.on('popup-data', (_, d) => f(d)), popupChoice: id => ipcRenderer.send('popup-choice', id),
  voiceAudio: b => ipcRenderer.send('voice-audio', b), voiceSilence: () => ipcRenderer.send('voice-silence'), onVoiceListen: f => ipcRenderer.on('voice-listen', () => f()), voiceText: t => ipcRenderer.send('voice-text', t), onVoiceToggle: f => ipcRenderer.on('voice-toggle', () => f()), onVoiceStatus: f => ipcRenderer.on('voice-status', (_, d) => f(d)),
  onPlay: f => ipcRenderer.on('play', (_, id) => f(id)), onStop: f => ipcRenderer.on('stop', () => f()),
});
