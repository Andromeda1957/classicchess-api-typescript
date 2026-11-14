import { ApiError, Transport, ccnbFormatHeader, segment, usernameSegment, type CcnbRequestOptions, type ClientOptions, type RequestOptions } from './transport.js';
import type {
  AccountCollectionItem, AccountCollectionImport, AccountCollections, AccountNotebookDetail, AccountNotebooks, AccountNotificationChange,
  AccountNotificationPage, AccountNotificationPreferences, AccountStarState, AccountStarredGames,
  AccountStarredPlayers, GymAborted, GymDeleted, GymGamePage, GymGameState, GymHome,
  Puzzle, PuzzleBatch, PuzzleHistoryPage, PuzzleReset, PuzzleResultSaved, PuzzleSummary,
  NotebookAnnotationSearchResult, AccountPreferences, AccountGameLibraryState, AccountCollection, AccountCollectionPage,
  AccountCollectionGameRemoved, AccountMessage, AccountImportedGames, AccountImportedGame, MobileHome, MobileAndroidRelease,
  MobileLogin, MobileOk, MobileSessions, MobileSessionRevoked, MobileSessionsRevoked, MobileSettings,
  AccountNotebookDeleted, AccountNotebookSettings, AccountNotebookCollaborator, AccountNotebookShare,
  AccountNotebookDetailSectionsItem, AccountNotebookSectionDeletion, AccountNotebookChapterDetail, operations,
} from './schema.js';

type Json = Record<string, unknown>;

/** A partial website preference change in wire names; fields left out keep their values. */
export type AccountPreferencesChange = operations['updatePreferences']['requestBody']['content']['application/json'];
/** A partial device settings change in wire names; fields left out keep their values. */
export type MobileSettingsChange = operations['updateMobileSettings']['requestBody']['content']['application/json'];
/** A study plan: the collection, its first 100 entries and progress; created is false for an idempotent repeat. */
export type AccountPlan = operations['createPlan']['responses'][201]['content']['application/json'];
export type AccountCollectionOrder = operations['reorderCollection']['responses'][200]['content']['application/json'];
export type AccountPlanProgress = operations['getPlanProgress']['responses'][200]['content']['application/json'];
export type AccountPlayerBookmark = operations['togglePlayerBookmark']['responses'][200]['content']['application/json'];

export type CollectionSort = 'added' | 'date_desc' | 'date_asc' | 'player' | 'manual';
export type ImportedGameSource = 'lichess' | 'chesscom' | 'pgn';
export type ImportedGameSort = 'imported_desc' | 'imported_asc' | 'date_desc' | 'date_asc' | 'player' | 'visibility';
export type NotebookVisibility = 'private' | 'unlisted' | 'public';
export type NotebookRole = 'viewer' | 'commenter' | 'editor' | 'manager';

export interface CollectionGamesOptions extends RequestOptions { page?: number; pageSize?: number; sort?: CollectionSort; query?: string }
export interface CollectionChange { name?: string; sort?: CollectionSort; description?: string; isPlan?: boolean }
export interface CollectionItemChange { note?: string; studied?: boolean }
/** Games in exact playback order. Retry with the same idempotencyKey and input; changed input under it is 409. */
export interface PlanInput { name: string; description?: string; idempotencyKey: string; items: { game: string; note?: string }[] }
export interface ImportedGamesOptions extends RequestOptions {
  query?: string; source?: ImportedGameSource; sort?: ImportedGameSort; page?: number; pageSize?: number;
}
/** source defaults to pgn, which needs pgn; lichess and chesscom need remoteUrl. */
export interface ImportGameInput { source?: ImportedGameSource; pgn?: string; remoteUrl?: string; visibility?: 'private' | 'public' }
export interface MobileSignInInput { username: string; password: string; twoFactorCode?: string; deviceName?: string }
/** initialPosition is a FEN or one PGN game; game is a slug the account can open. Use one of them at most. */
export interface NotebookInput {
  title: string; description?: string; visibility?: NotebookVisibility; chapterTitle?: string; initialPosition?: string; game?: string;
}
export interface NotebookSettingsChange { title?: string; description?: string; visibility?: NotebookVisibility; allowPublicExports?: boolean }
export interface NotebookCollaboratorInput { username: string; role: NotebookRole; canPresentLive?: boolean }
export interface NotebookSectionInput { title: string; parentId?: number | null }
/** null or omitted: the top level, and last among siblings. */
export interface NotebookSectionPlacement { parentId?: number | null; beforeSectionId?: number | null }
export interface NotebookChapterInput { title?: string; sectionId?: number | null; initialPosition?: string; game?: string }
/** null or omitted: the top level, and last among siblings. */
export interface NotebookChapterPlacement { sectionId?: number | null; beforeChapterId?: number | null }
/** The whole chapter as one PGN game, and the content_version the edit started from. */
export interface NotebookChapterEdit { pgn: string; contentVersion: number; title?: string }
/**
 * A chapter save. conflict is true for 409 chapter_conflict: the chapter changed after contentVersion
 * was read (or this save already succeeded) and nothing was saved. The reply does not carry the
 * current version: reload with accountNotebookChapter, reapply the edit and save again.
 */
export interface NotebookChapterSave extends ApplicationResponse<AccountNotebookChapterDetail> { conflict: boolean }

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const COLLECTION_SORTS: readonly CollectionSort[] = ['added', 'date_desc', 'date_asc', 'player', 'manual'];
const IMPORT_SOURCES: readonly ImportedGameSource[] = ['lichess', 'chesscom', 'pgn'];
const IMPORT_SORTS: readonly ImportedGameSort[] = ['imported_desc', 'imported_asc', 'date_desc', 'date_asc', 'player', 'visibility'];
const NOTEBOOK_VISIBILITIES: readonly NotebookVisibility[] = ['private', 'unlisted', 'public'];
const NOTEBOOK_ROLES: readonly NotebookRole[] = ['viewer', 'commenter', 'editor', 'manager'];

function invalid(message: string): never {
  throw new ApiError(message, { code: 'invalid_request' });
}

/** A string of min to max code points, as the server counts them. */
function text(value: unknown, label: string, max: number, min = 1): string {
  const length = typeof value === 'string' ? [...value].length : -1;
  if (length < min || length > max) {
    invalid(min > 0 ? `Use a ${label} of ${min}–${max} characters.` : `Use a ${label} of at most ${max} characters.`);
  }
  return value as string;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) invalid(`Use a non-empty ${label}.`);
  return value as string;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly unknown[]).includes(value)) invalid(`${label} must be ${allowed.join(', ')}.`);
  return value as T;
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be true or false.`);
  return value as boolean;
}

function chapterSource(value: unknown): string {
  if (typeof value !== 'string') invalid('initialPosition must be a FEN or PGN string.');
  return value as string;
}

/** A folder or chapter placement: a positive ID, or null for the top level or the end. */
function placement(label: string): (value: unknown) => number | null {
  return value => value === null ? null : positiveId(value as number, label);
}

type Field = readonly [wire: string, check: (value: unknown) => unknown];

/** Map an input's defined camelCase fields to their wire names, refusing fields the operation lacks. */
function fields(input: unknown, spec: Record<string, Field>, label: string): Json {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) invalid(`Use a ${label} object.`);
  const body: Json = {};
  for (const [key, value] of Object.entries(input as object)) {
    const field = spec[key];
    if (field === undefined) invalid(`${label} has no field ${key}.`);
    if (value !== undefined) body[field[0]] = field[1](value);
  }
  return body;
}

/** A partial change: at least one defined field, and nothing else is sent. */
function someChange(body: Json, label: string): Json {
  if (Object.keys(body).length === 0) invalid(`Provide at least one ${label} to change.`);
  return body;
}

/** A change in generated wire names, passed through for the server to validate. */
function wireChange(change: unknown, label: string): Json {
  if (typeof change !== 'object' || change === null || Array.isArray(change)) invalid(`Use a ${label} object.`);
  const body = Object.fromEntries(Object.entries(change as object).filter(([, value]) => value !== undefined));
  return someChange(body, label);
}

const titleText = (value: unknown) => text(value, 'title', 160);
const descriptionText = (value: unknown) => text(value, 'description', 2000, 0);
const gameSlug = (value: unknown) => text(value, 'game slug', 200);

/** A new Notebook or chapter starts from initial_position or game, not both. */
function startingPoint(body: Json): Json {
  if (body.initial_position !== undefined && body.game !== undefined) invalid('Use initialPosition or game, not both.');
  return body;
}

function notebookPath(notebook: string): string {
  return `/api/v1/account/notebooks/${notebookUuid(notebook)}/`;
}

function sectionPath(notebook: string, sectionId: number): string {
  return `${notebookPath(notebook)}sections/${positiveId(sectionId, 'folder ID')}/`;
}

function chapterPath(notebook: string, chapterId: number): string {
  return `${notebookPath(notebook)}chapters/${positiveId(chapterId, 'chapter ID')}/`;
}

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

/**
 * A new Gym game. time is 'unlimited', a preset such as '3+0', or 'custom' with minutes and increment.
 * version is a key from the bot's versions, such as 'v4'; omitted, the game plays its default_version.
 */
export interface GymNewGameOptions {
  color?: 'white' | 'black' | 'random';
  time?: string;
  minutes?: number;
  increment?: number;
  version?: string;
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
  const version = game.version === undefined ? {} : { version: nonEmpty(game.version, 'bot version') };
  if (time !== 'custom') {
    if (game.minutes !== undefined || game.increment !== undefined) {
      throw new ApiError('minutes and increment apply only to time "custom".', { code: 'invalid_request' });
    }
    return { color, time, ...version };
  }
  const { minutes, increment } = game;
  if (!Number.isSafeInteger(minutes) || minutes! < 1 || !Number.isSafeInteger(increment) || increment! < 0) {
    throw new ApiError('A custom time needs whole minutes from 1 and increment seconds from 0.', { code: 'invalid_request' });
  }
  return { color, time, minutes, increment, ...version };
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
  /** Your imports, newest first unless sort says otherwise; needs library:read. */
  accountImportedGames(token: string, options: ImportedGamesOptions = {}): Promise<ApplicationResponse<AccountImportedGames>> {
    const { query, source, sort, page = 1, pageSize = 50, ...request } = options;
    const params = new URLSearchParams(libraryPage(page, pageSize));
    if (query !== undefined && text(query, 'search', 120, 0)) params.set('q', query);
    if (source !== undefined) params.set('source', choice(source, IMPORT_SOURCES, 'source'));
    if (sort !== undefined) params.set('sort', choice(sort, IMPORT_SORTS, 'sort'));
    return this.request({ ...request, path: `/api/v1/account/imported-games/?${params}`, token });
  }
  /** One owned import with its PGN and board-ready mainline; needs library:read. */
  accountImportedGame(gameSlug: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountImportedGame>> {
    return this.request({ ...options, path: `/api/v1/account/imported-games/${segment(gameSlug)}/`, token });
  }
  /** Import a pasted PGN or a Lichess or Chess.com game URL (201); needs library:write. 429 and 503 carry retryAfter. */
  accountImportGame(game: ImportGameInput, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountImportedGame>> {
    const body = fields(game, {
      source: ['source', value => choice(value, IMPORT_SOURCES, 'source')],
      pgn: ['pgn', value => typeof value === 'string' ? value : invalid('pgn must be PGN text.')],
      remoteUrl: ['remote_url', value => text(value, 'game URL', 500)],
      visibility: ['visibility', value => choice(value, ['private', 'public'], 'visibility')],
    }, 'import');
    if ((body.source ?? 'pgn') === 'pgn' ? !(body.pgn as string | undefined)?.trim() : body.remote_url === undefined) {
      invalid('A PGN import needs pgn; a Lichess or Chess.com import needs remoteUrl.');
    }
    return this.send('POST', '/api/v1/account/imported-games/', token, options, body);
  }

  /** Website appearance, board, engine, sound and layout settings; needs preferences:read. */
  accountPreferences(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountPreferences>> {
    return this.request({ ...options, path: '/api/v1/account/preferences/', token });
  }
  /** Change only the given settings (wire names); needs preferences:write. An invalid value is 400 invalid_preference and changes nothing. */
  accountUpdatePreferences(change: AccountPreferencesChange, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountPreferences>> {
    return this.send('PATCH', '/api/v1/account/preferences/', token, options, wireChange(change, 'preference'));
  }
  /** Whether a game is starred and which of your collections hold it; needs library:read. */
  accountGameLibrary(gameSlug: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountGameLibraryState>> {
    return this.request({ ...options, path: `/api/v1/account/games/${segment(gameSlug)}/library/`, token });
  }
  /** Flip a player's bookmark; needs library:write. Not safe to retry: a repeat flips it back. */
  accountTogglePlayerBookmark(playerSlug: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountPlayerBookmark>> {
    return this.send('POST', `/api/v1/account/players/${segment(playerSlug)}/bookmark/`, token, options);
  }

  // Collections and study plans: library:read to read, library:write to change.
  /** A collection and one page of its games, in its saved sort unless sort is given; query searches them. */
  accountCollectionGames(collection: number, token: string,
    options: CollectionGamesOptions = {}): Promise<ApplicationResponse<AccountCollectionPage>> {
    const { page = 1, pageSize = 50, sort, query, ...request } = options;
    const params = new URLSearchParams(libraryPage(page, pageSize));
    if (sort !== undefined) params.set('sort', choice(sort, COLLECTION_SORTS, 'sort'));
    if (query !== undefined && text(query, 'search', 200, 0)) params.set('q', query);
    return this.request({ ...request, path: `/api/v1/account/collections/${collectionId(collection)}/?${params}`, token });
  }
  /** Rename, describe, re-sort or mark as a plan; isPlan true selects manual order unless sort is given. */
  accountUpdateCollection(collection: number, change: CollectionChange, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollection>> {
    const body = someChange(fields(change, {
      name: ['name', value => text(value, 'collection name', 120)],
      sort: ['sort', value => choice(value, COLLECTION_SORTS, 'sort')],
      description: ['description', descriptionText],
      isPlan: ['is_plan', value => flag(value, 'isPlan')],
    }, 'collection change'), 'collection field');
    return this.send('PATCH', `/api/v1/account/collections/${collectionId(collection)}/`, token, options, body);
  }
  /** Set an entry's note and/or studied state. */
  accountUpdateCollectionItem(collection: number, itemId: number, change: CollectionItemChange, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollectionItem>> {
    const body = someChange(fields(change, {
      note: ['note', value => text(value, 'note', 2000, 0)],
      studied: ['studied', value => flag(value, 'studied')],
    }, 'item change'), 'item field');
    return this.send('PATCH', this.collectionItem(collection, itemId), token, options, body);
  }
  /** Remove one entry by its collection item ID; the game itself stays. */
  accountRemoveCollectionItem(collection: number, itemId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountMessage>> {
    return this.send('DELETE', this.collectionItem(collection, itemId), token, options);
  }
  /** Remove a game by its slug; changed is false when the collection did not hold it. Safe to retry. */
  accountRemoveCollectionGame(collection: number, gameSlug: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollectionGameRemoved>> {
    return this.send('DELETE', `/api/v1/account/collections/${collectionId(collection)}/games/${segment(gameSlug)}/`, token, options);
  }
  /** Create a manual-order study plan atomically: 201 when created, 200 for a repeat of the same key and input. */
  accountCreatePlan(plan: PlanInput, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountPlan>> {
    const body = fields(plan, {
      name: ['name', value => text(value, 'plan name', 120)],
      description: ['description', descriptionText],
      idempotencyKey: ['idempotency_key', value => text(value, 'idempotency key', 80)],
      items: ['items', value => {
        if (!Array.isArray(value) || value.length < 1 || value.length > 100) invalid('A plan needs 1–100 games.');
        return value.map(item => fields(item, {
          game: ['game', gameSlug], note: ['note', note => text(note, 'note', 2000, 0)],
        }, 'plan item'));
      }],
    }, 'plan');
    if (body.name === undefined || body.idempotency_key === undefined || body.items === undefined) {
      invalid('A plan needs name, idempotencyKey and items.');
    }
    if ((body.items as Json[]).some(item => item.game === undefined)) invalid('Each plan item needs a game.');
    return this.send('POST', '/api/v1/account/plans/', token, options, body);
  }
  /** Put every accessible item ID exactly once in the new manual order. */
  accountReorderCollection(collection: number, itemIds: number[], token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountCollectionOrder>> {
    if (!Array.isArray(itemIds) || itemIds.length > 10_000) invalid('Use at most 10000 collection item IDs.');
    const body = { item_ids: itemIds.map(item => positiveId(item, 'collection item ID')) };
    return this.send('PUT', `/api/v1/account/collections/${collectionId(collection)}/reorder/`, token, options, body);
  }
  /** Studied counts and one page of entries in plan order. */
  accountPlanProgress(collection: number, token: string, page = 1, pageSize = 100,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountPlanProgress>> {
    return this.request({ ...options, path: `/api/v1/account/collections/${collectionId(collection)}/progress/?${libraryPage(page, pageSize)}`, token });
  }
  private collectionItem(collection: number, itemId: number): string {
    return `/api/v1/account/collections/${collectionId(collection)}/items/${positiveId(itemId, 'collection item ID')}/`;
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

  // Notebook changes, as the website makes them. Personal tokens need notebooks:write for
  // Notebooks, folders and chapters, and notebooks:manage for deletion, settings, collaborators
  // and share links; device sessions pass both. The member's role still applies.
  /** Create a Notebook with one chapter (201). Each call creates another, so do not retry blindly. */
  accountCreateNotebook(notebook: NotebookInput, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetail>> {
    const body = fields(notebook, {
      title: ['title', titleText], description: ['description', descriptionText],
      visibility: ['visibility', value => choice(value, NOTEBOOK_VISIBILITIES, 'visibility')],
      chapterTitle: ['chapter_title', titleText], initialPosition: ['initial_position', chapterSource], game: ['game', gameSlug],
    }, 'Notebook');
    if (body.title === undefined) invalid('A Notebook needs a title.');
    return this.send('POST', '/api/v1/account/notebooks/', token, options, startingPoint(body));
  }
  /** Owner or manager; every other setting keeps its value. */
  accountRenameNotebook(notebook: string, title: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetail>> {
    return this.send('PATCH', notebookPath(notebook), token, options, { title: titleText(title) });
  }
  /** Owner only: deletes every folder, chapter, collaborator and share link with it. */
  accountDeleteNotebook(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDeleted>> {
    return this.send('DELETE', notebookPath(notebook), token, options);
  }
  /** Title, description, visibility, public exports and every collaborator; owner or manager. */
  accountNotebookSettings(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookSettings>> {
    return this.request({ ...options, path: `${notebookPath(notebook)}settings/`, token });
  }
  /** Change only the given settings; settings left out keep their current values. */
  accountUpdateNotebookSettings(notebook: string, change: NotebookSettingsChange, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookSettings>> {
    const body = someChange(fields(change, {
      title: ['title', titleText], description: ['description', descriptionText],
      visibility: ['visibility', value => choice(value, NOTEBOOK_VISIBILITIES, 'visibility')],
      allowPublicExports: ['allow_public_exports', value => flag(value, 'allowPublicExports')],
    }, 'settings change'), 'setting');
    return this.send('PATCH', `${notebookPath(notebook)}settings/`, token, options, body);
  }
  /** Invite an account or change its role (201 when added). Only the owner grants or changes manager. */
  accountSetNotebookCollaborator(notebook: string, collaborator: NotebookCollaboratorInput, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookCollaborator>> {
    const body = fields(collaborator, {
      username: ['username', value => text(value, 'username', 150)],
      role: ['role', value => choice(value, NOTEBOOK_ROLES, 'role')],
      canPresentLive: ['can_present_live', value => flag(value, 'canPresentLive')],
    }, 'collaborator');
    if (body.username === undefined || body.role === undefined) invalid('A collaborator needs username and role.');
    return this.send('POST', `${notebookPath(notebook)}collaborators/`, token, options, body);
  }
  accountRemoveNotebookCollaborator(notebook: string, collaboratorId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDeleted>> {
    const path = `${notebookPath(notebook)}collaborators/${positiveId(collaboratorId, 'collaborator ID')}/`;
    return this.send('DELETE', path, token, options);
  }
  /** Leave a Notebook shared with you: removes only your invitation. The owner cannot leave. */
  accountLeaveNotebook(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDeleted>> {
    return this.send('DELETE', `${notebookPath(notebook)}membership/`, token, options);
  }
  /** The Notebook's read-only share link, or active false; owner or manager. Keep its url private. */
  accountNotebookShare(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookShare>> {
    return this.request({ ...options, path: `${notebookPath(notebook)}share/`, token });
  }
  /** Create the share link, or return the active one unchanged. */
  accountCreateNotebookShare(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookShare>> {
    return this.send('PUT', `${notebookPath(notebook)}share/`, token, options);
  }
  accountRevokeNotebookShare(notebook: string, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookShare>> {
    return this.send('DELETE', `${notebookPath(notebook)}share/`, token, options);
  }

  /** Add a folder, last among its siblings (201); parentId nests it. */
  accountCreateNotebookSection(notebook: string, section: NotebookSectionInput, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetailSectionsItem>> {
    const body = fields(section, { title: ['title', titleText], parentId: ['parent_id', placement('folder ID')] }, 'folder');
    if (body.title === undefined) invalid('A folder needs a title.');
    return this.send('POST', `${notebookPath(notebook)}sections/`, token, options, body);
  }
  accountRenameNotebookSection(notebook: string, sectionId: number, title: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetailSectionsItem>> {
    return this.send('PATCH', sectionPath(notebook, sectionId), token, options, { title: titleText(title) });
  }
  /** Delete a folder with every nested folder and chapter; the reply lists their IDs. */
  accountDeleteNotebookSection(notebook: string, sectionId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookSectionDeletion>> {
    return this.send('DELETE', sectionPath(notebook, sectionId), token, options);
  }
  /** Move a folder; returns the Notebook after the move. */
  accountMoveNotebookSection(notebook: string, sectionId: number, to: NotebookSectionPlacement, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetail>> {
    const body = fields(to, {
      parentId: ['parent_id', placement('folder ID')], beforeSectionId: ['before_section_id', placement('folder ID')],
    }, 'folder placement');
    return this.send('POST', `${sectionPath(notebook, sectionId)}move/`, token, options, body);
  }

  /** Add a chapter, last (201), from the standard position, a FEN or PGN, or a game you can open. */
  accountCreateNotebookChapter(notebook: string, chapter: NotebookChapterInput, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookChapterDetail>> {
    const body = fields(chapter, {
      title: ['title', titleText], sectionId: ['section_id', placement('folder ID')],
      initialPosition: ['initial_position', chapterSource], game: ['game', gameSlug],
    }, 'chapter');
    return this.send('POST', `${notebookPath(notebook)}chapters/`, token, options, startingPoint(body));
  }
  /** A chapter's PGN and the content_version a save must start from; needs notebooks:read. */
  accountNotebookChapter(notebook: string, chapterId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookChapterDetail>> {
    return this.request({ ...options, path: chapterPath(notebook, chapterId), token });
  }
  /**
   * Replace the chapter's PGN when contentVersion still matches. conflict marks a 409
   * chapter_conflict, which saved nothing: reload the chapter, reapply the edit and save again.
   */
  async accountSaveNotebookChapter(notebook: string, chapterId: number, edit: NotebookChapterEdit, token: string,
    options: RequestOptions = {}): Promise<NotebookChapterSave> {
    const body = fields(edit, {
      pgn: ['pgn', value => typeof value === 'string' ? value : invalid('pgn must be the chapter as PGN text.')],
      contentVersion: ['content_version', value => positiveId(value as number, 'content version')],
      title: ['title', titleText],
    }, 'chapter edit');
    if (body.pgn === undefined || body.content_version === undefined) invalid('A chapter save needs pgn and contentVersion.');
    const response = await this.send<AccountNotebookChapterDetail>('PUT', chapterPath(notebook, chapterId), token, options, body);
    const error = (response.data as { error?: { code?: unknown } } | null)?.error;
    return { ...response, conflict: response.status === 409 && error?.code === 'chapter_conflict' };
  }
  /** A rename raises content_version, so a save begun before it conflicts. */
  accountRenameNotebookChapter(notebook: string, chapterId: number, title: string, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookChapterDetail>> {
    return this.send('PATCH', chapterPath(notebook, chapterId), token, options, { title: titleText(title) });
  }
  accountDeleteNotebookChapter(notebook: string, chapterId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDeleted>> {
    return this.send('DELETE', chapterPath(notebook, chapterId), token, options);
  }
  /** Move a chapter; returns the Notebook after the move. */
  accountMoveNotebookChapter(notebook: string, chapterId: number, to: NotebookChapterPlacement, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookDetail>> {
    const body = fields(to, {
      sectionId: ['section_id', placement('folder ID')], beforeChapterId: ['before_chapter_id', placement('chapter ID')],
    }, 'chapter placement');
    return this.send('POST', `${chapterPath(notebook, chapterId)}move/`, token, options, body);
  }
  /** The chapter's read-only share link, or active false; owner or manager. Keep its url private. */
  accountNotebookChapterShare(notebook: string, chapterId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookShare>> {
    return this.request({ ...options, path: `${chapterPath(notebook, chapterId)}share/`, token });
  }
  /** Create the chapter's share link, or return the active one unchanged. */
  accountCreateNotebookChapterShare(notebook: string, chapterId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookShare>> {
    return this.send('PUT', `${chapterPath(notebook, chapterId)}share/`, token, options);
  }
  accountRevokeNotebookChapterShare(notebook: string, chapterId: number, token: string,
    options: RequestOptions = {}): Promise<ApplicationResponse<AccountNotebookShare>> {
    return this.send('DELETE', `${chapterPath(notebook, chapterId)}share/`, token, options);
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

  // Device sessions: what the Android app uses. Sign-in returns a session token, which the
  // session and settings operations require; a personal API token is not accepted there.
  /** Front-door counts, Game of the Day and the app's action links; no credentials. */
  mobileHome(options: RequestOptions = {}): Promise<ApplicationResponse<MobileHome>> {
    return this.request({ ...options, path: '/api/v1/mobile/home/' });
  }
  /** The current Android release: version, APK URL, SHA-256 checksum and size; no credentials. */
  mobileAndroidRelease(options: RequestOptions = {}): Promise<ApplicationResponse<MobileAndroidRelease>> {
    return this.request({ ...options, path: '/api/v1/mobile/android/release/' });
  }
  /**
   * Sign in with a username and password (201) and receive a device session token. A 401
   * two_factor_required asks for twoFactorCode. The password is sent only over HTTPS or loopback.
   */
  mobileSignIn(credentials: MobileSignInInput, options: RequestOptions = {}): Promise<ApplicationResponse<MobileLogin>> {
    const body = fields(credentials, {
      username: ['username', value => text(value, 'username', 150)],
      password: ['password', value => nonEmpty(value, 'password')],
      twoFactorCode: ['two_factor_code', value => nonEmpty(value, 'two-factor code')],
      deviceName: ['device_name', value => text(value, 'device name', 80)],
    }, 'sign-in');
    if (body.username === undefined || body.password === undefined) invalid('Sign-in needs username and password.');
    const { hostname, protocol } = new URL(this.baseUrl);
    if (protocol !== 'https:' && !LOOPBACK.includes(hostname)) {
      throw new ApiError('Passwords require HTTPS or loopback development.', { code: 'unsafe_credentials' });
    }
    return this.request({ ...options, path: '/api/v1/account/mobile/login/', method: 'POST', body: JSON.stringify(body) });
  }
  /** Revoke this device session. */
  mobileSignOut(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<MobileOk>> {
    return this.send('POST', '/api/v1/account/mobile/logout/', token, options);
  }
  /** The account's active device sessions; current marks this one. */
  mobileSessions(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<MobileSessions>> {
    return this.request({ ...options, path: '/api/v1/account/mobile/sessions/', token });
  }
  mobileRevokeSession(sessionId: number, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<MobileSessionRevoked>> {
    return this.send('POST', `/api/v1/account/mobile/sessions/${positiveId(sessionId, 'session ID')}/revoke/`, token, options);
  }
  /** Revoke every device session of the account, this one included. */
  mobileRevokeAllSessions(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<MobileSessionsRevoked>> {
    return this.send('POST', '/api/v1/account/mobile/sessions/revoke-all/', token, options);
  }
  /** The app's board, engine, sound, speech and cast settings, kept apart from the website's preferences. */
  mobileSettings(token: string, options: RequestOptions = {}): Promise<ApplicationResponse<MobileSettings>> {
    return this.request({ ...options, path: '/api/v1/account/mobile/settings/', token });
  }
  /** Change only the given settings (wire names). */
  mobileUpdateSettings(change: MobileSettingsChange, token: string, options: RequestOptions = {}): Promise<ApplicationResponse<MobileSettings>> {
    return this.send('POST', '/api/v1/account/mobile/settings/', token, options, wireChange(change, 'setting'));
  }

  private send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, token: string, options: RequestOptions,
    body?: Json): Promise<ApplicationResponse<T>> {
    return this.request({ ...options, path, method, token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
      if (url.protocol !== 'https:' && !LOOPBACK.includes(url.hostname)) {
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
