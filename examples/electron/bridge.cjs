const CHANNELS = ['players', 'bio', 'notable', 'pgn'];

function registerArchiveHandlers(ipcMain, window, pageUrl, client) {
  const calls = {
    players: () => client.publicPlayers(),
    bio: slug => client.publicPlayerBio(identifier(slug)),
    notable: slug => client.publicNotableGames(identifier(slug)),
    pgn: token => {
      if (typeof token !== 'string' || token.split('/').length > 2) throw new Error('Invalid game token');
      token.split('/').forEach(identifier);
      return client.publicPgn(token);
    },
  };
  for (const operation of CHANNELS) {
    ipcMain.handle(`archive:${operation}`, async (event, value) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
        || event.senderFrame.url !== pageUrl) throw new Error('Untrusted archive caller');
      try {
        return { ok: true, data: await calls[operation](value) };
      } catch (error) {
        // Electron does not preserve custom Error properties across invoke().
        return { ok: false, error: {
          message: error instanceof Error ? error.message : 'Archive request failed',
          code: typeof error?.code === 'string' ? error.code : 'invalid_request',
          status: typeof error?.status === 'number' ? error.status : null,
          retryAfter: typeof error?.retryAfter === 'string' ? error.retryAfter : null,
        } };
      }
    });
  }
  return () => CHANNELS.forEach(operation => ipcMain.removeHandler(`archive:${operation}`));
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) throw new Error('Invalid archive slug');
  return value;
}

module.exports = { registerArchiveHandlers };
