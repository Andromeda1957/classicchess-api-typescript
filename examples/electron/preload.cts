const { contextBridge, ipcRenderer }: typeof import('./electron-api.cjs') = require('electron');

contextBridge.exposeInMainWorld('archive', {
  players: () => ipcRenderer.invoke('archive:players'),
  bio: (slug: string) => ipcRenderer.invoke('archive:bio', slug),
  notable: (slug: string) => ipcRenderer.invoke('archive:notable', slug),
  pgn: (token: string) => ipcRenderer.invoke('archive:pgn', token),
});
