type Operation = 'players' | 'bio' | 'notable' | 'pgn';
const CHANNELS: readonly Operation[] = ['players', 'bio', 'notable', 'pgn'];

/** The archive reads the bridge forwards; ClassicChessClient provides all four. */
interface ArchiveClient {
  publicPlayers(): Promise<unknown>;
  publicPlayerBio(slug: string): Promise<unknown>;
  publicNotableGames(slug: string): Promise<unknown>;
  publicPgn(token: string): Promise<unknown>;
}
interface Frame { readonly url: string }
interface InvokeEvent { readonly sender: unknown; readonly senderFrame: Frame | null }
interface ArchiveIpc {
  handle(channel: string, listener: (event: InvokeEvent, value: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}
interface ArchiveWindow { readonly webContents: { readonly mainFrame: Frame } }
type ErrorFields = { code?: unknown; status?: unknown; retryAfter?: unknown } | null | undefined;

function registerArchiveHandlers(ipcMain: ArchiveIpc, window: ArchiveWindow, pageUrl: string, client: ArchiveClient): () => void {
  const calls: Record<Operation, (value: unknown) => Promise<unknown>> = {
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
        const fields = error as ErrorFields;
        // Electron does not preserve custom Error properties across invoke().
        return { ok: false, error: {
          message: error instanceof Error ? error.message : 'Archive request failed',
          code: typeof fields?.code === 'string' ? fields.code : 'invalid_request',
          status: typeof fields?.status === 'number' ? fields.status : null,
          retryAfter: typeof fields?.retryAfter === 'string' ? fields.retryAfter : null,
        } };
      }
    });
  }
  return () => CHANNELS.forEach(operation => ipcMain.removeHandler(`archive:${operation}`));
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) throw new Error('Invalid archive slug');
  return value;
}

export = { registerArchiveHandlers };
