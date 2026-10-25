import { ApiError, Transport, ccnbFormatHeader, segment, usernameSegment, type CcnbRequestOptions, type ClientOptions, type RequestOptions } from './transport.js';
import type {
  AccountCollectionItem, AccountCollectionImport, AccountCollections, AccountNotebookDetail, AccountNotebooks, AccountNotificationChange,
  AccountNotificationPage, AccountNotificationPreferences, AccountStarState, AccountStarredGames,
  AccountStarredPlayers, GymAborted, GymDeleted, GymGamePage, GymGameState, GymHome,
  Puzzle, PuzzleBatch, PuzzleHistoryPage, PuzzleReset, PuzzleResultSaved, PuzzleSummary,
  NotebookAnnotationSearchResult,
} from './schema.js';

type Json = Record<string, unknown>;

/** Criteria are AND within a group; groups are OR. Catalog slugs match either participant or event membership. */
export interface CuratedGameFilter {
  players?: string[]; events?: string[]; since?: number; until?: number; notable?: boolean;
  q?: string; theme?: string; eco?: string; result?: string;
  annotationQ?: string; annotationAuthor?: string; annotationBook?: string;
}
export interface CuratedCollectionInput {
  collectionId: number; filters: CuratedGameFilter[]; exclude?: CuratedGameFilter[];
  batchSize?: number; afterGameId?: number; dryRun?: boolean;
}

function curatedFilter(group: CuratedGameFilter): Json {
  const keys = ['players', 'events', 'since', 'until', 'notable', 'q', 'theme', 'eco', 'result',
    'annotationQ', 'annotationAuthor', 'annotationBook'];
  if (typeof group !== 'object' || group === null || Array.isArray(group) ||
      Object.keys(group).some(key => !keys.includes(key))) {
    throw new ApiError('Use supported CuratedGameFilter fields (camelCase annotation names).', { code: 'invalid_request' });
  }
  return { players: group.players, events: group.events, since: group.since, until: group.until,
    notable: group.notable, q: group.q, theme: group.theme, eco: group.eco, result: group.result,
    annotation_q: group.annotationQ, annotation_author: group.annotationAuthor, annotation_book: group.annotationBook };
}

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

const PUZZLE_ID = /^p-[0-9a-f]{8}$/;

function puzzleId(value: string): string {
  if (typeof value !== 'string' || !PUZZLE_ID.test(value)) {
    throw new ApiError('Use a puzzle ID such as p-000ccc1f.', { code: 'invalid_request' });
  }
  return value;
}

export type PuzzleResult = 'solved' | 'missed';

export interface PuzzleReadOptions extends RequestOptions { result?: 'missed' }
export interface PuzzleAttemptOptions extends RequestOptions { eventId?: string; generation?: number; revision?: string }
export interface NotebookAnnotationSearchOptions extends RequestOptions {
  q?: string; kind?: 'all' | 'comments' | 'glyphs' | 'diagrams'; notebookUuid?: string; limit?: number; cursor?: string;
}

function puzzleFilter(result?: string): string {
  if (result !== undefined && result !== 'missed') throw new ApiError('result must be missed or omitted.', {code: 'invalid_request'});
  return result === 'missed' ? '&result=missed' : '';
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function gymGame(gameId: number): string {
  return `/api/v1/account/gym/games/${positiveId(gameId, 'game ID')}/`;
}

function ply(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ApiError('Use the ply from the game state: a whole number from 0.', { code: 'invalid_request' });
  }
  return value;
}

/** A new Gym game. time is 'unlimited', a preset such as '3+0', or 'custom' with minutes and increment. */
export interface GymNewGameOptions {
  color?: 'white' | 'black' | 'random';
  time?: string;
  minutes?: number;
  increment?: number;
}

function gymNewGameBody(game: GymNewGameOptions): Json {
  const color = game.color ?? 'white';
  const time = game.time ?? 'unlimited';
  if (color !== 'white' && color !== 'black' && color !== 'random') {
    throw new ApiError('color must be white, black or random.', { code: 'invalid_request' });
  }
  if (typeof time !== 'string' || !time) {
    throw new ApiError('time must be unlimited, a preset such as 3+0, or custom.', { code: 'invalid_request' });
  }
  if (time !== 'custom') {
    if (game.minutes !== undefined || game.increment !== undefined) {
      throw new ApiError('minutes and increment apply only to time "custom".', { code: 'invalid_request' });
    }
    return { color, time };
  }
  const { minutes, increment } = game;
  if (!Number.isSafeInteger(minutes) || minutes! < 1 || !Number.isSafeInteger(increment) || increment! < 0) {
    throw new ApiError('A custom time needs whole minutes from 1 and increment seconds from 0.', { code: 'invalid_request' });
  }
  return { color, time, minutes, increment };
}

export interface ApplicationRequest extends CcnbRequestOptions {
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
  /** Exact name ignoring case. Returns count/results, empty when absent. */
  accountFindCollection(name: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollections>> {
    if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > 120) {
      throw new ApiError('Use a collection name of 1–120 characters.', { code: 'invalid_request' });
    }
    return this.request({ ...options, path: '/api/v1/account/collections/?' + new URLSearchParams({ name: name.trim() }), token });
  }
  /** Delete the collection, memberships, notes and progress; keep underlying games. */
  accountDeleteCollection(collection: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Json>> {
    return this.request({ ...options, path: `/api/v1/account/collections/${collectionId(collection)}/`, method: 'DELETE', token });
  }
  /** One curated-only batch. Keep selection unchanged; pass next_after_game_id while has_more is true.
   * dryRun previews without writing. No automatic write retries; HTTP errors retain status and data.
   */
  accountAddCuratedGames(input: CuratedCollectionInput, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollectionImport>> {
    const keys = ['collectionId', 'filters', 'exclude', 'batchSize', 'afterGameId', 'dryRun'];
    if (typeof input !== 'object' || input === null || Array.isArray(input) ||
        Object.keys(input).some(key => !keys.includes(key)) || !Array.isArray(input.filters) ||
        input.filters.length < 1 || input.filters.length > 10 ||
        (input.exclude !== undefined && (!Array.isArray(input.exclude) || input.exclude.length > 10))) {
      throw new ApiError('Use supported bulk-add fields, 1–10 filter groups and at most 10 exclusions.', { code: 'invalid_request' });
    }
    const id = collectionId(input.collectionId);
    const batchSize = input.batchSize === undefined ? 1000 : input.batchSize;
    const after = input.afterGameId === undefined ? 0 : input.afterGameId;
    const dryRun = input.dryRun === undefined ? false : input.dryRun;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 || !Number.isInteger(after) ||
        after < 0 || after > 2147483647 || typeof dryRun !== 'boolean') {
      throw new ApiError('Use a batch size from 1 to 1000, a nonnegative game ID and boolean dryRun.', { code: 'invalid_request' });
    }
    return this.request({ ...options, path: '/api/v1/account/collections/import/', method: 'POST', token,
      body: JSON.stringify({ source: 'curated_games', collection_id: id, filters: input.filters.map(curatedFilter),
        exclude: (input.exclude ?? []).map(curatedFilter), batch_size: batchSize, after_game_id: after, dry_run: dryRun }) });
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
  /** Empty the inbox: dismiss every notification in it. */
  accountDismissAllNotifications(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotificationChange>> {
    return this.request({ ...options, path: '/api/v1/account/notifications/dismiss-all/', method: 'POST', token });
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
  accountNotebookFile(notebook: string, token: string, password?: string, options: CcnbRequestOptions = {}): Promise<ApplicationDownload> {
    const path = `/api/v1/account/notebooks/${notebookUuid(notebook)}/file/`;
    const accept = 'application/vnd.classicchess.notebook';
    if (password === undefined) return this.download({ ...options, path, token, accept });
    if (typeof password !== 'string' || !password) throw new ApiError('Use a non-empty password.', { code: 'invalid_request' });
    return this.download({ ...options, path, token, accept, method: 'POST', body: JSON.stringify({ password }) });
  }

  // The Gym: play the site's bots. Personal tokens need gym:read to read and
  // gym:play for the rest; device sessions pass both.
  /** The bots, the time controls a new game may use and the newest page of your games. */
  accountGym(token: string, pageSize = 20, options: RequestOptions = {}): Promise<ApplicationResponse<GymHome>> {
    libraryPage(1, pageSize);
    return this.request({ ...options, path: `/api/v1/account/gym/?page_size=${pageSize}`, token });
  }
  /** Your games, newest first; player 'others' is for the Gym's review accounts only. */
  accountGymGames(token: string, page = 1, pageSize = 20, player: 'me' | 'others' = 'me',
    options: RequestOptions = {}): Promise<ApplicationResponse<GymGamePage>> {
    if (player !== 'me' && player !== 'others') throw new ApiError('player must be me or others.', { code: 'invalid_request' });
    const query = libraryPage(page, pageSize) + (player === 'others' ? '&player=others' : '');
    return this.request({ ...options, path: `/api/v1/account/gym/games/?${query}`, token });
  }
  /** Start a game (201). */
  accountGymNewGame(botKey: string, token: string, game: GymNewGameOptions = {},
    options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    const body = JSON.stringify(gymNewGameBody(game));
    return this.request({ ...options, path: `/api/v1/account/gym/bots/${segment(botKey)}/games/`, method: 'POST', body, token });
  }
  accountGymGame(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    return this.request({ ...options, path: gymGame(gameId), token });
  }
  accountGymGamePgn(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationDownload> {
    return this.download({ ...options, path: `${gymGame(gameId)}pgn/`, token, accept: 'application/x-chess-pgn' });
  }
  /** Play a UCI move such as 'e2e4' at the ply you have seen; a stale ply is 409 and plays nothing. */
  accountGymMove(gameId: number, move: string, atPly: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    if (typeof move !== 'string' || !UCI_MOVE.test(move)) {
      throw new ApiError('Use a UCI move such as e2e4 or e7e8q.', { code: 'invalid_request' });
    }
    return this.gymPost(gameId, 'move/', token, options, { move, ply: ply(atPly) });
  }
  /**
   * Ask for the bot's move. A 429 capacity_exhausted means the engine is busy: wait retryAfter
   * seconds and ask again with the same ply. A 429 engine_budget means this account has used its
   * 30 minutes of engine time for the current hour; ask again after retryAfter seconds.
   */
  accountGymBotMove(gameId: number, atPly: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    return this.gymPost(gameId, 'bot-move/', token, options, { ply: ply(atPly) });
  }
  accountGymResign(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    return this.gymPost(gameId, 'resign/', token, options);
  }
  accountGymTakeBack(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    return this.gymPost(gameId, 'takeback/', token, options);
  }
  /** Settle the clock when one you show reaches zero; the server decides. */
  accountGymClock(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<GymGameState>> {
    return this.gymPost(gameId, 'clock/', token, options);
  }
  /** Abort (and delete) a game before your first move. */
  accountGymAbort(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<GymAborted>> {
    return this.gymPost(gameId, 'abort/', token, options);
  }
  accountGymDeleteGame(gameId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<GymDeleted>> {
    return this.request({ ...options, path: gymGame(gameId), method: 'DELETE', token });
  }
  private gymPost<T>(gameId: number, action: string, token: string, options: RequestOptions,
    body?: Json): Promise<ApplicationResponse<T>> {
    return this.request({ ...options, path: gymGame(gameId) + action, method: 'POST', token,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  // Puzzles, for signed-in accounts only. Personal tokens need puzzles:read to
  // read and puzzles:write to save results and reset; device sessions pass both.
  /** Your figures: first-try solves, misses, what is left in your rotation, and the total. */
  accountPuzzles(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<PuzzleSummary>> {
    return this.request({ ...options, path: '/api/v1/account/puzzles/', token });
  }
  /** Download at most 100 playable puzzles with their account/reset identity. */
  accountPuzzleBatch(token: string, limit = 25, options: PuzzleReadOptions = {}): Promise<ApplicationResponse<PuzzleBatch>> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ApiError('Use a batch size from 1 to 100.', {code: 'invalid_request'});
    return this.request({...options, path: `/api/v1/account/puzzles/batch/?limit=${limit}${puzzleFilter(options.result)}`, token});
  }
  /**
   * A random puzzle from your rotation, another than `after` (the one just played) when there is
   * one. A 404 rotation_empty means every puzzle is solved; reset to play them again.
   */
  accountPuzzleNext(token: string, after?: string, options: PuzzleReadOptions = {}): Promise<ApplicationResponse<Puzzle>> {
    const query = (after === undefined ? '' : `&after=${puzzleId(after)}`) + puzzleFilter(options.result);
    return this.request({ ...options, path: `/api/v1/account/puzzles/next/${query ? '?' + query.slice(1) : ''}`, token });
  }
  accountPuzzle(id: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<Puzzle>> {
    return this.request({ ...options, path: `/api/v1/account/puzzles/${puzzleId(id)}/`, token });
  }
  /**
   * Save one play: 'missed' at the first wrong move or when the solution is shown, 'solved' for a
   * clean finish. A first-try solve stands until reset, so the saved result can differ.
   */
  accountPuzzleResult(id: string, result: PuzzleResult, token: string,
    options: PuzzleAttemptOptions = {}): Promise<ApplicationResponse<PuzzleResultSaved>> {
    if (result !== 'solved' && result !== 'missed') {
      throw new ApiError('result must be solved or missed.', { code: 'invalid_request' });
    }
    const {eventId, generation, revision} = options;
    const body: Json = {result};
    if ([eventId, generation, revision].some(value => value !== undefined)) {
      if (typeof eventId !== 'string' || !NOTEBOOK_UUID.test(eventId) || !Number.isSafeInteger(generation) || generation! < 0
          || typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision)) {
        throw new ApiError('An offline attempt needs a UUID eventId, generation and puzzle revision.', {code: 'invalid_request'});
      }
      Object.assign(body, {event_id: eventId, generation, revision});
    }
    return this.request({ ...options, path: `/api/v1/account/puzzles/${puzzleId(id)}/result/`, method: 'POST',
      body: JSON.stringify(body), token });
  }
  /** The puzzles you have played and how you did, most recent first. */
  accountPuzzleHistory(token: string, page = 1, pageSize = 20,
    options: PuzzleReadOptions = {}): Promise<ApplicationResponse<PuzzleHistoryPage>> {
    return this.request({ ...options, path: `/api/v1/account/puzzles/history/?${libraryPage(page, pageSize)}${puzzleFilter(options.result)}`, token });
  }
  /** Search owned/directly invited Notebook annotations. Continue with cursor until null. */
  accountNotebookAnnotationSearch(token: string, options: NotebookAnnotationSearchOptions = {}): Promise<ApplicationResponse<NotebookAnnotationSearchResult>> {
    const {q = '', kind = 'all', notebookUuid: uuid, limit = 50, cursor} = options;
    if (typeof q !== 'string' || q.length > 128 || !['all', 'comments', 'glyphs', 'diagrams'].includes(kind)
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
        || cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 2048)) {
      throw new ApiError('Use a bounded annotation query, kind and page size.', {code: 'invalid_query'});
    }
    const query = new URLSearchParams({q, kind, limit: String(limit)});
    if (uuid !== undefined) query.set('notebook_uuid', notebookUuid(uuid));
    if (cursor !== undefined) query.set('cursor', cursor);
    return this.request({...options, path: '/api/v1/account/notebooks/annotation-search/?' + query, token});
  }
  /** Every puzzle goes back into your rotation. Your history stays. */
  accountPuzzleReset(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<PuzzleReset>> {
    return this.request({ ...options, path: '/api/v1/account/puzzles/reset/', method: 'POST', token });
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
    const ccnbFormat = ccnbFormatHeader(input.ccnbFormat);
    if (ccnbFormat !== undefined) {
      const notebook = /^\/api\/v1\/account\/notebooks\/([^/]+)\/file\/$/.exec(pathname);
      if (!notebook || !NOTEBOOK_UUID.test(notebook[1]!) || url.search) {
        throw new ApiError('CCNB negotiation requires the fixed Notebook file endpoint.', { code: 'invalid_request' });
      }
      headers.set('CCNB-Format', ccnbFormat);
    }
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
