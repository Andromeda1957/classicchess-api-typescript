import { ApiError, Transport, segment, usernameSegment, type ClientOptions, type RequestOptions } from './transport.js';
import type {
  AccountCollectionItem, AccountNotebookDetail, AccountNotebooks, AccountNotificationChange,
  AccountNotificationPage, AccountNotificationPreferences, AccountStarState, AccountStarredGames,
  AccountStarredPlayers,
} from './schema.js';

type Json = Record<string, unknown>;

function libraryPage(page: number, pageSize: number): string {
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || page < 1 || pageSize < 1 || pageSize > 100) {
    throw new ApiError('Use a positive page and a page size from 1 to 100.', { code: 'invalid_pagination' });
  }
  return `page=${page}&page_size=${pageSize}`;
}

const PRIVATE_PATH = /^\/(?:api\/v1\/(?:account\/|desktop\/|mobile\/(?:notebooks\/|position-scan\/))|cast\/api\/mobile\/)/;
/** GIF exports need a registered account, so bearers may also reach the public GIF routes. */
const GIF_PATH = /^\/api\/v1\/(?:games\/[^/]+|public\/games\/[^/]+|public\/imported-games\/[^/]+\/[^/]+|annotated\/books\/[^/]+\/games\/[^/]+)\/gif\/$/;
const NOTEBOOK_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError(`Use a positive ${label}.`, { code: 'invalid_request' });
  return value;
}

function notebookUuid(value: string): string {
  if (typeof value !== 'string' || !NOTEBOOK_UUID.test(value)) {
    throw new ApiError('Use a Notebook UUID from the API.', { code: 'invalid_query' });
  }
  return value.toLowerCase();
}

function gifQuery(orientation: GifOrientation): string {
  if (orientation !== 'white' && orientation !== 'black') {
    throw new ApiError('orientation must be white or black.', { code: 'invalid_query' });
  }
  return orientation === 'white' ? '' : '?orientation=black';
}

function attachmentName(disposition: string | null): string | null {
  const match = /filename="([^"\\/\r\n]{1,255})"/.exec(disposition ?? '');
  return match ? match[1]! : null;
}

function collectionId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError('Use a positive collection ID.', { code: 'invalid_request' });
  return value;
}

export interface ApplicationRequest extends RequestOptions {
  /** Relative API path, including encoded query parameters. Never a URL from an untrusted server. */
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: string | Uint8Array;
  contentType?: string;
  /** Explicit per-request bearer; the SDK never stores credentials or sends browser cookies. */
  token?: string;
  timeoutMs?: number;
}
export interface ApplicationResponse<T> {
  ok: boolean;
  status: number;
  data: T;
  retryAfter: string | null;
}

export type GifOrientation = 'white' | 'black';
/** A file reply. bytes hold the GIF, PGN or .ccnb file only when ok; otherwise error holds the JSON reply. */
export interface ApplicationDownload {
  ok: boolean;
  status: number;
  bytes: Uint8Array;
  contentType: string | null;
  filename: string | null;
  retryAfter: string | null;
  error: Json | null;
}
export interface NotificationPreferenceChange { topics?: Record<string, boolean>; soundEnabled?: boolean }

/** Application APIs for account, notebook, opening and remote features.
 * Keep this in the trusted application process. Renderer IPC still needs its own narrow allowlist.
 * Public archive consumers should use ClassicChessClient's typed methods.
 */
export class ApplicationClient {
  private readonly transport: Transport;
  readonly baseUrl: string;
  constructor(options: ClientOptions = {}) {
    this.transport = new Transport(options);
    this.baseUrl = this.transport.baseUrl;
  }

  accountMe(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Record<string, unknown>>> {
    return this.request({ ...options, path: '/api/v1/account/me/', token });
  }
  accountCollections(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Record<string, unknown>>> {
    return this.request({ ...options, path: '/api/v1/account/collections/', token });
  }
  accountCreateCollection(name: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Record<string, unknown>>> {
    return this.request({ ...options, path: '/api/v1/account/collections/', method: 'POST', body: JSON.stringify({ name }), token });
  }
  accountImportPublicPlayerGames(input: { archivePlayer: string; name?: string; collectionId?: number; since?: number; until?: number },
    token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Record<string, unknown>>> {
    return this.request({ ...options, path: '/api/v1/account/collections/import/', method: 'POST', token,
      body: JSON.stringify({ source: 'public_player_games', name: input.name, collection_id: input.collectionId,
        archive_player: input.archivePlayer, since: input.since, until: input.until }) });
  }
  /** Add one openable game. Status 201 when added; 200 with changed false when already present. */
  accountAddCollectionGame(collection: number, gameSlug: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollectionItem>> {
    return this.request({ ...options, path: `/api/v1/account/collections/${collectionId(collection)}/items/`,
      method: 'POST', body: JSON.stringify({ game: segment(gameSlug) }), token });
  }
  accountStarredPlayers(token: string, page = 1, pageSize = 50,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountStarredPlayers>> {
    return this.request({ ...options, path: `/api/v1/account/starred/players/?${libraryPage(page, pageSize)}`, token });
  }
  accountStarPlayer(playerSlug: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountStarState>> {
    return this.request({ ...options, path: `/api/v1/account/starred/players/${segment(playerSlug)}/`, method: 'PUT', token });
  }
  accountUnstarPlayer(playerSlug: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountStarState>> {
    return this.request({ ...options, path: `/api/v1/account/starred/players/${segment(playerSlug)}/`, method: 'DELETE', token });
  }
  accountStarredGames(token: string, page = 1, pageSize = 50,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountStarredGames>> {
    return this.request({ ...options, path: `/api/v1/account/starred/games/?${libraryPage(page, pageSize)}`, token });
  }
  accountStarGame(gameSlug: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountStarState>> {
    return this.request({ ...options, path: `/api/v1/account/starred/games/${segment(gameSlug)}/`, method: 'PUT', token });
  }
  accountUnstarGame(gameSlug: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountStarState>> {
    return this.request({ ...options, path: `/api/v1/account/starred/games/${segment(gameSlug)}/`, method: 'DELETE', token });
  }
  accountSetImportedGameVisibility(gameSlug: string, visibility: 'private' | 'public', token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<Json>> {
    if (visibility !== 'private' && visibility !== 'public') {
      throw new ApiError('visibility must be private or public.', { code: 'invalid_request' });
    }
    return this.request({ ...options, path: `/api/v1/account/imported-games/${segment(gameSlug)}/`, method: 'PATCH',
      body: JSON.stringify({ visibility }), token });
  }
  /** Permanently delete an owned import, including from every collection and star list. */
  accountDeleteImportedGame(gameSlug: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Json>> {
    return this.request({ ...options, path: `/api/v1/account/imported-games/${segment(gameSlug)}/`, method: 'DELETE', token });
  }
  // GIF exports need a registered account: any personal token, or a device session.
  masterGameGif(game: string, token: string, orientation: GifOrientation = 'white', options: RequestOptions = {}): Promise<ApplicationDownload> {
    return this.gif(`/api/v1/games/${segment(game)}/gif/`, token, orientation, options);
  }
  publicGameGif(gameSlug: string, token: string, orientation: GifOrientation = 'white', options: RequestOptions = {}): Promise<ApplicationDownload> {
    return this.gif(`/api/v1/public/games/${segment(gameSlug)}/gif/`, token, orientation, options);
  }
  annotatedGameGif(bookSlug: string, gameSlug: string, token: string, orientation: GifOrientation = 'white',
    options: RequestOptions = {}): Promise<ApplicationDownload> {
    return this.gif(`/api/v1/annotated/books/${segment(bookSlug)}/games/${segment(gameSlug)}/gif/`, token, orientation, options);
  }
  publicImportedGameGif(username: string, gameSlug: string, token: string, orientation: GifOrientation = 'white',
    options: RequestOptions = {}): Promise<ApplicationDownload> {
    return this.gif(`/api/v1/public/imported-games/${usernameSegment(username)}/${segment(gameSlug)}/gif/`, token, orientation, options);
  }
  /** An owned import of either visibility; needs library:read. */
  accountImportedGameGif(gameSlug: string, token: string, orientation: GifOrientation = 'white',
    options: RequestOptions = {}): Promise<ApplicationDownload> {
    return this.gif(`/api/v1/account/imported-games/${segment(gameSlug)}/gif/`, token, orientation, options);
  }
  private gif(path: string, token: string, orientation: GifOrientation, options: RequestOptions): Promise<ApplicationDownload> {
    return this.download({ ...options, path: path + gifQuery(orientation), token, accept: 'image/gif' });
  }

  accountNotifications(token: string, page = 1, pageSize = 50,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationPage>> {
    return this.request({ ...options, path: `/api/v1/account/notifications/?${libraryPage(page, pageSize)}`, token });
  }
  accountMarkNotificationRead(notificationId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationChange>> {
    const item = positiveId(notificationId, 'notification ID');
    return this.request({ ...options, path: `/api/v1/account/notifications/${item}/read/`, method: 'POST', token });
  }
  accountMarkAllNotificationsRead(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationChange>> {
    return this.request({ ...options, path: '/api/v1/account/notifications/read-all/', method: 'POST', token });
  }
  accountDismissNotification(notificationId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationChange>> {
    const item = positiveId(notificationId, 'notification ID');
    return this.request({ ...options, path: `/api/v1/account/notifications/${item}/`, method: 'DELETE', token });
  }
  accountNotificationPreferences(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationPreferences>> {
    return this.request({ ...options, path: '/api/v1/account/notifications/preferences/', token });
  }
  /** Change only the named topics and/or the sound setting. */
  accountUpdateNotificationPreferences(change: NotificationPreferenceChange, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationPreferences>> {
    const payload: Json = {};
    if (change.topics !== undefined) {
      const entries = typeof change.topics === 'object' && change.topics !== null ? Object.entries(change.topics) : null;
      if (!entries || !entries.every(([, value]) => typeof value === 'boolean')) {
        throw new ApiError('topics must map topic keys to true or false.', { code: 'invalid_request' });
      }
      payload.topics = change.topics;
    }
    if (change.soundEnabled !== undefined) {
      if (typeof change.soundEnabled !== 'boolean') throw new ApiError('soundEnabled must be true or false.', { code: 'invalid_request' });
      payload.sound_enabled = change.soundEnabled;
    }
    if (Object.keys(payload).length === 0) {
      throw new ApiError('Provide topics and/or soundEnabled to update.', { code: 'invalid_request' });
    }
    return this.request({ ...options, path: '/api/v1/account/notifications/preferences/', method: 'PATCH',
      body: JSON.stringify(payload), token });
  }

  accountNotebooks(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebooks>> {
    return this.request({ ...options, path: '/api/v1/account/notebooks/', token });
  }
  accountNotebook(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetail>> {
    return this.request({ ...options, path: `/api/v1/account/notebooks/${notebookUuid(notebook)}/`, token });
  }
  accountNotebookChapterPgn(notebook: string, chapterId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationDownload> {
    const chapter = positiveId(chapterId, 'chapter ID');
    return this.download({ ...options, token, accept: 'application/x-chess-pgn',
      path: `/api/v1/account/notebooks/${notebookUuid(notebook)}/chapters/${chapter}/pgn/` });
  }
  /** The whole Notebook as .ccnb bytes; a password (members only) encrypts it. */
  accountNotebookFile(notebook: string, token: string, password?: string, options: RequestOptions = {}): Promise<ApplicationDownload> {
    const path = `/api/v1/account/notebooks/${notebookUuid(notebook)}/file/`;
    const accept = 'application/vnd.classicchess.notebook';
    if (password === undefined) return this.download({ ...options, path, token, accept });
    if (typeof password !== 'string' || !password) throw new ApiError('Use a non-empty password.', { code: 'invalid_request' });
    return this.download({ ...options, path, token, accept, method: 'POST', body: JSON.stringify({ password }) });
  }

  async scanPosition(image: Uint8Array, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Record<string, unknown>>> {
    if (!(image instanceof Uint8Array) || image.byteLength < 1 || image.byteLength > 850_000) {
      throw new ApiError('Use a JPEG of at most 850000 bytes.', { code: 'invalid_upload' });
    }
    const form = new FormData();
    form.append('image', new Blob([Uint8Array.from(image).buffer], { type: 'image/jpeg' }), 'diagram.jpg');
    const upload = new Request(this.baseUrl, { method: 'POST', body: form });
    return this.request({ ...options, path: '/api/v1/mobile/position-scan/', method: 'POST', token, timeoutMs: 85_000,
      body: new Uint8Array(await upload.arrayBuffer()), contentType: upload.headers.get('Content-Type')! });
  }

  async request<T = Record<string, unknown>>(input: ApplicationRequest): Promise<ApplicationResponse<T>> {
    const response = await this.exchange(input, 'application/json');
    return { ok: response.status >= 200 && response.status < 300, status: response.status,
      data: this.transport.json<T>(response, true), retryAfter: response.retryAfter };
  }

  /** Fetch a file. The bytes are returned only for a 2xx; otherwise error holds the JSON reply. */
  async download(input: ApplicationRequest & { accept?: string }): Promise<ApplicationDownload> {
    const response = await this.exchange(input, input.accept ?? '*/*');
    const ok = response.status >= 200 && response.status < 300;
    return {
      ok, status: response.status, bytes: ok ? response.bytes : new Uint8Array(0),
      contentType: response.contentType, filename: ok ? attachmentName(response.contentDisposition) : null,
      retryAfter: response.retryAfter, error: ok ? null : this.transport.json<Json>(response, true),
    };
  }

  private async exchange(input: ApplicationRequest, accept: string) {
    const { path, token } = input;
    const pathname = typeof path === 'string' ? path.split('?')[0]! : '';
    if (typeof path !== 'string' || path.length > 8192 || /[\\#\u0000-\u0020\u007f]/.test(path)
      || /%|\/\.{1,2}(?:\/|$)/.test(pathname)
      || !/^\/(?:api\/v1\/|cast\/api\/mobile\/)/.test(pathname)) {
      throw new ApiError('Use a relative application API path.', { code: 'unsafe_url' });
    }
    const url = new URL(path, this.baseUrl);
    if (token !== undefined) {
      if (!/^[\x21-\x7e]{1,4096}$/.test(token)) throw new ApiError('Invalid bearer token.', { code: 'invalid_token' });
      if (!PRIVATE_PATH.test(url.pathname) && !GIF_PATH.test(url.pathname)) {
        throw new ApiError('Bearer credentials are not accepted by this public endpoint.', { code: 'unsafe_credentials' });
      }
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new ApiError('Bearer credentials require HTTPS or loopback development.', { code: 'unsafe_credentials' });
      }
    }
    const method = input.method ?? 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new ApiError('Invalid API method.', { code: 'invalid_method' });
    if (method === 'GET' && input.body !== undefined) throw new ApiError('GET cannot carry a body.', { code: 'invalid_request' });
    const headers = new Headers({ Accept: accept });
    if (token !== undefined) headers.set('Authorization', `Bearer ${token}`);
    if (input.body !== undefined) {
      if (typeof input.body !== 'string' && !(input.body instanceof Uint8Array)) throw new ApiError('Use JSON text or bytes.', { code: 'invalid_request' });
      // Atomic notebook sync is a binary API upload; cap it without copying the body.
      const bytes = typeof input.body === 'string' ? new TextEncoder().encode(input.body).byteLength : input.body.byteLength;
      if (bytes > 128 * 1024 * 1024) throw new ApiError('API request exceeds 128 MiB.', { code: 'request_too_large' });
      const contentType = input.contentType ?? 'application/json; charset=utf-8';
      if (contentType.length > 200 || /[\r\n]/.test(contentType)) throw new ApiError('Invalid content type.', { code: 'invalid_request' });
      headers.set('Content-Type', contentType);
    }
    return this.transport.exchange(url, {
      method, headers, ...(input.body === undefined ? {} : { body: input.body as BodyInit }),
    }, input);
  }
}
