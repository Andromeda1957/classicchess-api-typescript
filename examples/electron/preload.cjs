// Generated from preload.cts by `npm run build:examples`; edit the TypeScript instead.
"use strict";
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('archive', {
    players: () => ipcRenderer.invoke('archive:players'),
    bio: (slug) => ipcRenderer.invoke('archive:bio', slug),
    notable: (slug) => ipcRenderer.invoke('archive:notable', slug),
    pgn: (token) => ipcRenderer.invoke('archive:pgn', token),
});
