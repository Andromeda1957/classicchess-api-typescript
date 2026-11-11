const { app, BrowserWindow, ipcMain }: typeof import('./electron-api.cjs') = require('electron');
const { join }: typeof import('node:path') = require('node:path');
const { pathToFileURL }: typeof import('node:url') = require('node:url');
const { ClassicChessClient }: typeof import('classicchess-sdk') = require('classicchess-sdk');
const { registerArchiveHandlers }: typeof import('./bridge.cjs') = require('./bridge.cjs');

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1000, height: 760,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const pageUrl = pathToFileURL(join(__dirname, 'index.html')).href;
  const client = new ClassicChessClient({ userAgent: 'classicchess-electron-example/0.1.0' });
  const cleanup = registerArchiveHandlers(ipcMain, window, pageUrl, client);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', cleanup);
  window.loadURL(pageUrl);
});
app.on('window-all-closed', () => app.quit());
