const { app, BrowserWindow, ipcMain } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { ClassicChessClient } = require('@classicchess/api');
const { registerArchiveHandlers } = require('./bridge.cjs');

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
