import type {
  ApiDiscovery, PublicPlayers, PublicPlayerCards, PublicPlayerDetail, PublicPlayerBiography,
  PublicNotableGames, PublicEventIndex, PublicEvents, PublicGame, PublicGamePage, AnnotatedBooks,
  AnnotatedGame, AnnotatedGamePage, MasterGame, MasterGameDetail, MasterGamePage,
  PublicEventDetail, PublicEventAbout, GalleryPage, GalleryPhotoDetail, PublicBeginnerGames,
  PublicDailyGame, PublicEventOfTheDay, PublicTodaysPicks, SiteSearchPreview, SiteSearchPage, TablebaseProbe,
  PublicImportedGame, ChessTodayDay, SiteUpdatePage, SiteUpdateDetail, SiteContentSearchPage, PlayerOpeningExplorer,
  PlayerOpeningExplorerPending, ResolvedGameLink, GymSharedGame, operations,
} from './schema.js';
import { Transport, ApiError, segment, gameToken, usernameSegment } from './transport.js';
import type { CcnbRequestOptions, ClientOptions, RequestOptions, Query } from './transport.js';

export { ApiError } from './transport.js';
export type { CcnbFormat, CcnbRequestOptions, ClientOptions, RequestOptions } from './transport.js';
export type {
  ApiDiscovery, Biography, PublicPlayer, PublicPlayers, PublicPlayerCard, PublicPlayerCards, PublicPlayerDetail,
  PublicPlayerBiography, PublicPlayerCardBiography, GamePlayerPortraits, PublicNotableGames, PublicEventIndex, PublicEvents, PublicGame, PublicGamePage,
  AnnotatedBooks, AnnotatedGame, AnnotatedGamePage, MasterGame, MasterGameDetail, MasterGamePage,
  PublicEvent, PublicEventDetail, PublicEventAbout, EventBiography, GalleryPhoto, GalleryPage, GalleryPhotoDetail,
  PublicBeginnerGames, PublicGameSummary, PublicDailyGame, PublicEventOfTheDay, EventOfTheDay,
  EventOfTheDayWinner, PublicTodaysPicks, PlayerOfTheDay, TodaysGame, OnThisDayPick, SiteSearchPreview, SiteSearchPage,
  SearchPlayer, SearchEvent, SearchGame, TablebaseProbe, TablebaseMove,
  AccountGame, AccountCollectionItem, AccountCollections, AccountCollectionImport, AccountStarredGame, AccountStarredGames, AccountStarredPlayer,
  AccountStarredPlayers, AccountStarState, PublicImportedGame, AccountNotification, AccountNotificationPage,
  AccountNotificationChange, AccountNotificationTopic, AccountNotificationPreferences, AccountNotebook,
  AccountNotebooks, AccountNotebookDetail, GymBot, GymTimeControls, GymClock, GymGameSummary, GymGamePage,
  GymHome, GymGameState, GymDeleted, GymAborted, PuzzleSummary, PuzzleMove, PuzzleSolution, Puzzle,
  PuzzleResultSaved, PuzzleHistoryEntry, PuzzleHistoryPage, PuzzleReset, PuzzleBatch,
  NotebookAnnotationSearchLinks, NotebookAnnotationSearchHit, NotebookAnnotationSearchResult,
  ChessTodayDay, ChessTodayEntry, SiteUpdatePhoto, SiteUpdatePost, SiteUpdatePage, SiteUpdateDetail, SiteSearchHit,
  SiteContentSearchPage, PlayerOpeningExplorer, PlayerOpeningExplorerPending, ResolvedGameLink, GymBotVersion,
  GymSharedGame, AccountSummary, AccountPreferences, ViewerLayoutState, AccountGameLibraryState,
  AccountCollectionGameRemoved, AccountMessage, AccountCollection, AccountCollectionEntry, AccountCollectionPage,
  AccountImportedGames, AccountImportedGame, MobileLogin, MobileOk, MobileSession, MobileSessions,
  MobileSessionRevoked, MobileSessionsRevoked, MobileSettings, MobileHome, MobileAndroidRelease,
  AccountNotebookDetailSectionsItem, AccountNotebookDetailChaptersItem, AccountNotebookChapterDetail,
  AccountNotebookDeleted, AccountNotebookSectionDeletion, AccountNotebookCollaborator, AccountNotebookSettings,
  AccountNotebookShare,
} from './schema.js';

/** The study theme taxonomy: slugs for the `theme` game filter, with each rule and its measured precision. */
export type StudyThemes = operations['listStudyThemes']['responses'][200]['content']['application/json'];
/** A public Lichess game for the opening explorer: its title and validated PGN. */
export type LichessExplorerGame = operations['getLichessOpeningExplorerGame']['responses'][200]['content']['application/json'];

export interface PageOptions { page?: number; pageSize?: number }
export interface MasterGameFilters extends PageOptions { query: string }
export interface MasterStatsFilters { query?: string; player?: string; opponent?: string; mode?: 'summary' | 'head_to_head' }
export interface ExportOptions { tokens?: string[]; format?: 'pgn' | 'ndjson'; pgnInJson?: boolean }
/** Export format for the by-token exports, whose tokens travel in the request body. */
export type ExportFormatOptions = Omit<ExportOptions, 'tokens'>;
export interface ExplorerFilters {
  fen?: string; play?: string; moves?: number; topGames?: number; sourceType?: string; sourceKey?: string;
  /** Inclusive years; sources without year indexes ignore them. */
  since?: number; until?: number;
}
/** One player's games at a position. `player` is a name the server resolves, or it returns candidates. */
export interface PlayerExplorerFilters {
  player: string; fen?: string; color?: 'both' | 'white' | 'black'; result?: 'all' | 'win' | 'loss' | 'draw';
  page?: number;
  /** Inclusive years; games with an unknown year are left out of any range. */
  since?: number; until?: number;
}
/** Lichess Explorer: no player covers the whole Lichess database; a Lichess username covers that player's games. */
export interface LichessExplorerFilters {
  fen?: string; player?: string; color?: 'both' | 'white' | 'black'; result?: 'all' | 'win' | 'loss' | 'draw';
  /** Games from January of `since` through December of `until`, inclusive years. */
  since?: number; until?: number;
}
export interface PublicGameFilters extends PageOptions {
  query?: string;
  archivePlayer?: string;
  archiveEvent?: string;
  /** Which fields `query` searches. Omitted means `all`. */
  searchMode?: PublicGameSearchMode;
  since?: number;
  until?: number;
  sort?: 'asc' | 'desc' | 'event';
  /** Comma-separated taxonomy slugs from studyThemes(); every one must match. */
  theme?: string;
  /** ECO code or prefix, such as D or D30. */
  eco?: string;
  result?: PublicGameResult;
  /** Up to eight terms in published annotation note text; all must match. */
  annotationQ?: string;
  /** Author text in the published annotation source label. */
  annotationAuthor?: string;
  /** Book title text in the published annotation source label. */
  annotationBook?: string;
}
/** `players`: players, event, site and date. `openings`: opening name and ECO. `all`: both. */
export type PublicGameSearchMode = 'all' | 'players' | 'openings';
const PUBLIC_GAME_SEARCH_MODES: readonly string[] = ['all', 'players', 'openings'];
export type PublicGameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
const PUBLIC_GAME_RESULTS: readonly string[] = ['1-0', '0-1', '1/2-1/2', '*'];
/** An annotated book's games. `query` searches the annotation notes, `headerQuery` the game headers. */
export interface AnnotatedGameFilters extends PageOptions {
  query?: string;
  /** One phrase found anywhere in White, Black, Event, Site, Date, opening name or ECO. */
  headerQuery?: string;
  /** Author name words in the published source label. */
  author?: string;
  /** By PGN date, undated games last; the server default is `asc`. */
  sort?: 'asc' | 'desc';
}
export interface GalleryFilters extends PageOptions { query?: string }
/** Archive result kinds. `siteSearch(query, 'site', page)` searches the site's own pages instead. */
export type SiteSearchKind = 'games' | 'events' | 'players';
export interface IterationOptions extends RequestOptions {
  /** Stop after this many games without fetching another page. */
  limit?: number;
  /** Fail explicitly if this guard is reached with more pages remaining. */
  maxPages?: number;
}

function pageQuery(filters: PageOptions): Query {
  for (const [key, value] of Object.entries({ page: filters.page, pageSize: filters.pageSize })) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || key === 'pageSize' && value > 100)) {
      throw new ApiError('page must be positive; pageSize must be between 1 and 100.', { code: 'invalid_pagination' });
    }
  }
  return { page: filters.page, page_size: filters.pageSize };
}

function gameQuery(filters: PublicGameFilters): Query {
  if (filters.sort === 'event' && !filters.archiveEvent) throw new ApiError('sort=event requires archiveEvent.', { code: 'invalid_query' });
  if (filters.searchMode !== undefined && !PUBLIC_GAME_SEARCH_MODES.includes(filters.searchMode)) {
    throw new ApiError('searchMode must be all, players or openings.', { code: 'invalid_query' });
  }
  if (filters.result !== undefined && !PUBLIC_GAME_RESULTS.includes(filters.result)) {
    throw new ApiError('result must be 1-0, 0-1, 1/2-1/2 or *.', { code: 'invalid_query' });
  }
  return {
    ...pageQuery(filters),
    q: filters.query, archive_player: filters.archivePlayer, archive_event: filters.archiveEvent,
    search_mode: filters.searchMode,
    since: filters.since, until: filters.until, sort: filters.sort,
    theme: filters.theme, eco: filters.eco, result: filters.result, annotation_q: filters.annotationQ,
    annotation_author: filters.annotationAuthor, annotation_book: filters.annotationBook,
  };
}

function annotatedQuery(filters: AnnotatedGameFilters): Query {
  if (filters.sort !== undefined && filters.sort !== 'asc' && filters.sort !== 'desc') {
    throw new ApiError('sort must be asc or desc.', { code: 'invalid_query' });
  }
  return { ...pageQuery(filters), q: filters.query, header_q: filters.headerQuery, author: filters.author, sort: filters.sort };
}

function playerExplorerQuery(filters: PlayerExplorerFilters): Query {
  const player = filters?.player;
  if (typeof player !== 'string' || !player.trim() || [...player].length > 80) {
    throw new ApiError('Use a player name of 1 to 80 characters.', { code: 'invalid_query' });
  }
  const { fen, color = 'both', result = 'all', page } = filters;
  if (fen !== undefined && (typeof fen !== 'string' || fen.length > 100)) {
    throw new ApiError('Use a FEN of at most 100 characters.', { code: 'invalid_query' });
  }
  if (!['both', 'white', 'black'].includes(color) || !['all', 'win', 'loss', 'draw'].includes(result)) {
    throw new ApiError('color must be both, white or black; result must be all, win, loss or draw.', { code: 'invalid_query' });
  }
  if (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) {
    throw new ApiError('page must be a positive integer.', { code: 'invalid_pagination' });
  }
  return { player, fen, color, result, page, since: filters.since, until: filters.until };
}

/** Tokens for the by-token exports: 1 to 300, one per line in the request body. */
function exportBody(tokens: string[], token: (value: string) => string): string {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 300) {
    throw new ApiError('Export between 1 and 300 tokens per request.', { code: 'invalid_export' });
  }
  return tokens.map(token).join('\n');
}

function exportFormatQuery(filters: ExportFormatOptions): Query {
  return { format: filters.format ?? 'pgn', pgnInJson: filters.format === 'ndjson' ? String(filters.pgnInJson ?? true) : undefined };
}

const GYM_SHARE_TOKEN = /^[0-9]+\.[A-Za-z0-9_-]+$/;

function masterQuery(filters: MasterGameFilters): Query {
  if (!filters || typeof filters.query !== 'string' || filters.query.length > 240
    || [...filters.query].length > 120 || !filters.query.trim()) {
    throw new ApiError('Use a nonempty MasterDB query of at most 120 characters.', { code: 'invalid_query' });
  }
  return { ...pageQuery(filters), q: filters.query };
}

function masterToken(token: string): string {
  if (typeof token !== 'string' || token.length > 80 || !/^g[0-9a-z]+-[0-9a-f]{12}$/.test(token)) {
    throw new ApiError('Use an exact MasterDB game token returned by search.', { code: 'invalid_identifier' });
  }
  return token;
}

/** Public reads only. Catalogs are complete; game lists are pages. No account credentials needed. */
export class ClassicChessClient {
  private readonly transport: Transport;
  constructor(options: ClientOptions = {}) { this.transport = new Transport(options); }
  get baseUrl(): string { return this.transport.baseUrl; }

  discovery(options?: RequestOptions): Promise<ApiDiscovery> {
    return this.json('/api/v1/', {}, options);
  }
  players(query: string, filters: { limit?: number } = {}, options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.json('/api/v1/players/', { q: query, limit: filters.limit ?? 10 }, options);
  }
  masterStats(filters: MasterStatsFilters, options?: RequestOptions): Promise<Record<string, unknown>> {
    if (filters.query) return this.json('/api/v1/stats/', { q: filters.query }, options);
    const mode = filters.mode ?? (filters.opponent ? 'head_to_head' : 'summary');
    if (!filters.player || mode === 'head_to_head' && !filters.opponent) {
      throw new ApiError('Use a stats query or player; head_to_head requires opponent.', { code: 'invalid_query' });
    }
    return this.json('/api/v1/stats/', { player: filters.player, opponent: filters.opponent, mode }, options);
  }
  explorer(filters: ExplorerFilters = {}, options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.json('/api/v1/opening-explorer/', { fen: filters.fen, play: filters.play,
      moves: filters.moves ?? 12, topGames: filters.topGames, source_type: filters.sourceType, source_key: filters.sourceKey,
      since: filters.since, until: filters.until }, options);
  }
  explorerSources(options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.json('/api/v1/opening-explorer/sources/', {}, options);
  }
  /**
   * One player's games at a position, as structured rows. An unresolved name returns candidates.
   * While the player's index is first built the reply is `pending` with `retry_after_ms`; ask again then.
   */
  playerExplorer(filters: PlayerExplorerFilters, options?: RequestOptions): Promise<PlayerOpeningExplorer | PlayerOpeningExplorerPending> {
    return this.json('/api/v1/opening-explorer/player/', playerExplorerQuery(filters), options);
  }
  /** Load a public Lichess game by its eight-character ID, as the explorer's game loader does; nothing is imported. */
  lichessExplorerGame(gameId: string, options?: RequestOptions): Promise<LichessExplorerGame> {
    if (typeof gameId !== 'string' || !/^[A-Za-z0-9]{8}$/.test(gameId)) {
      throw new ApiError('Use an eight-character Lichess game ID.', { code: 'invalid_identifier' });
    }
    return this.json(`/api/v1/opening-explorer/lichess/games/${gameId}/`, {}, options);
  }
  /**
   * The Analysis Board's game-link loader: the PGN of one public Lichess or Chess.com game and, for a Lichess
   * /white or /black link, the side to view it from. Nothing is saved; shares the website's per-address limit.
   */
  resolveGameLink(url: string, options?: RequestOptions): Promise<ResolvedGameLink> {
    if (typeof url !== 'string' || !url.trim() || [...url].length > 500) {
      throw new ApiError('Use a game link of 1 to 500 characters.', { code: 'invalid_query' });
    }
    return this.transport.post(this.transport.url('/api/v1/analysis/game-link/'), 'json', JSON.stringify({ url }),
      'application/json; charset=utf-8', options);
  }
  /** Explore a position in the Lichess database; Classic Chess relays it with its own Lichess credential. */
  lichessExplorer(filters: LichessExplorerFilters = {}, options?: RequestOptions): Promise<Record<string, unknown>> {
    const player = (filters.player ?? '').trim();
    const color = filters.color ?? 'both';
    const result = filters.result ?? 'all';
    if (filters.fen !== undefined && filters.fen.length > 100) {
      throw new ApiError('Use a FEN of at most 100 characters.', { code: 'invalid_query' });
    }
    if (player && !/^[A-Za-z0-9_-]{2,30}$/.test(player)) {
      throw new ApiError('Use a valid Lichess username.', { code: 'invalid_query' });
    }
    if (!['both', 'white', 'black'].includes(color) || !['all', 'win', 'loss', 'draw'].includes(result)) {
      throw new ApiError('color must be both, white or black; result must be all, win, loss or draw.', { code: 'invalid_query' });
    }
    if (!player && result !== 'all') {
      throw new ApiError('A Lichess username is needed for result filters.', { code: 'invalid_query' });
    }
    const years = { since: filters.since, until: filters.until };
    return this.json('/api/v1/opening-explorer/lichess/', player
      ? { fen: filters.fen || undefined, player, color, result, ...years }
      : { fen: filters.fen || undefined, ...years }, options);
  }
  exportMasterGames(filters: ExportOptions & { query?: string }, options?: RequestOptions): Promise<string> {
    if (!filters.tokens?.length && !filters.query) throw new ApiError('Use a query or game tokens.', { code: 'invalid_export' });
    if (filters.tokens && (filters.tokens.length < 1 || filters.tokens.length > 300)) {
      throw new ApiError('Export between 1 and 300 tokens.', { code: 'invalid_export' });
    }
    return this.text('/api/v1/games/export/', { q: filters.tokens?.length ? undefined : filters.query,
      tokens: filters.tokens?.map(masterToken).join(','), format: filters.format ?? 'pgn',
      pgnInJson: filters.format === 'ndjson' ? String(filters.pgnInJson ?? true) : undefined }, options);
  }
  /** Export 1–300 MasterDB games by token, sent in the request body rather than the URL. */
  exportMasterGamesByToken(tokens: string[], filters: ExportFormatOptions = {}, options?: RequestOptions): Promise<string> {
    const body = exportBody(tokens, masterToken);
    return this.transport.post(this.transport.url('/api/v1/games/export/', exportFormatQuery(filters)), 'text', body,
      'text/plain; charset=utf-8', options);
  }
  masterGames(filters: MasterGameFilters, options?: RequestOptions): Promise<MasterGamePage> {
    return this.json('/api/v1/games/', masterQuery(filters), options);
  }
  masterGame(token: string, options?: RequestOptions): Promise<MasterGameDetail> {
    return this.json(`/api/v1/games/${masterToken(token)}/`, {}, options);
  }
  masterPgn(token: string, options?: RequestOptions): Promise<string> {
    return this.text(`/api/v1/games/${masterToken(token)}/pgn/`, {}, options);
  }
  /** Follows next until null, including when the server search limit is reached. */
  iterateMasterGames(filters: MasterGameFilters, options: IterationOptions = {}): AsyncGenerator<MasterGame> {
    return this.iterate(this.transport.url('/api/v1/games/', masterQuery(filters)), options);
  }
  publicPlayers(query?: string, options?: RequestOptions): Promise<PublicPlayers> {
    return this.json('/api/v1/public/players/', { q: query }, options);
  }
  /** The players catalog for lists and pickers: biography headline only, about a tenth the size. */
  publicPlayerCards(query?: string, options?: RequestOptions): Promise<PublicPlayerCards> {
    return this.json('/api/v1/public/players/cards/', { q: query }, options);
  }
  async playerNames(query?: string, options?: RequestOptions): Promise<string[]> {
    return (await this.publicPlayerCards(query, options)).results.map(player => player.name);
  }
  publicPlayer(slug: string, options?: RequestOptions): Promise<PublicPlayerDetail> {
    return this.json(`/api/v1/public/players/${segment(slug)}/`, {}, options);
  }
  publicPlayerBio(slug: string, options?: RequestOptions): Promise<PublicPlayerBiography> {
    return this.json(`/api/v1/public/players/${segment(slug)}/bio/`, {}, options);
  }
  publicNotableGames(slug: string, options?: RequestOptions): Promise<PublicNotableGames> {
    return this.json(`/api/v1/public/players/${segment(slug)}/notable-games/`, {}, options);
  }
  eventSeries(query?: string, series?: string, options: RequestOptions = {}): Promise<PublicEventIndex> {
    if (query && (query.length > 240 || [...query].length > 120) || series && !/^[a-z0-9-]{1,160}$/.test(series) || query && series) {
      throw new ApiError('Use either an event query of at most 120 characters or an exact series slug.', { code: 'invalid_query' });
    }
    return this.json('/api/v1/public/event-series/', { q: query, series }, options);
  }
  publicEvents(query?: string, options?: RequestOptions): Promise<PublicEvents> {
    return this.json('/api/v1/public/events/', { q: query }, options);
  }
  async eventNames(query?: string, options?: RequestOptions): Promise<string[]> {
    return (await this.publicEvents(query, options)).results.map(event => event.name);
  }
  publicEvent(slug: string, options?: RequestOptions): Promise<PublicEventDetail> {
    return this.json(`/api/v1/public/events/${segment(slug)}/`, {}, options);
  }
  publicEventAbout(slug: string, options?: RequestOptions): Promise<PublicEventAbout> {
    return this.json(`/api/v1/public/events/${segment(slug)}/about/`, {}, options);
  }
  gallery(filters: GalleryFilters = {}, options?: RequestOptions): Promise<GalleryPage> {
    return this.json('/api/v1/public/gallery/', { ...pageQuery(filters), q: filters.query }, options);
  }
  galleryPhoto(photoId: string, options?: RequestOptions): Promise<GalleryPhotoDetail> {
    return this.json(`/api/v1/public/gallery/${segment(String(photoId))}/`, {}, options);
  }
  beginnerGames(options?: RequestOptions): Promise<PublicBeginnerGames> {
    return this.json('/api/v1/public/beginner-games/', {}, options);
  }
  dailyGame(options?: RequestOptions): Promise<PublicDailyGame> {
    return this.json('/api/v1/public/daily/', {}, options);
  }
  /** The homepage's Event of the day; `event` is null when none can be published. */
  eventOfTheDay(options?: RequestOptions): Promise<PublicEventOfTheDay> {
    return this.json('/api/v1/public/event-of-the-day/', {}, options);
  }
  /** Every face of today's homepage card: Player of the day, Game of the Day, On this day and Event of the day; each is null when absent. */
  todaysPicks(options?: RequestOptions): Promise<PublicTodaysPicks> {
    return this.json('/api/v1/public/todays-picks/', {}, options);
  }
  /** Today's sourced chess-history anniversaries in the site timezone, in featured order. */
  chessToday(options?: RequestOptions): Promise<ChessTodayDay> {
    return this.json('/api/v1/public/chess-today/', {}, options);
  }
  /** The anniversaries on one month and day of any year; February 29 is always available. */
  chessTodayOnDate(month: number, day: number, options?: RequestOptions): Promise<ChessTodayDay> {
    if (!Number.isSafeInteger(month) || month < 1 || month > 12 || !Number.isSafeInteger(day) || day < 1 || day > 31) {
      throw new ApiError('Use a month from 1 to 12 and a day from 1 to 31.', { code: 'invalid_query' });
    }
    return this.json(`/api/v1/public/chess-today/${month}/${day}/`, {}, options);
  }
  /** The study theme taxonomy whose slugs the `theme` game filter takes. */
  studyThemes(options?: RequestOptions): Promise<StudyThemes> {
    return this.json('/api/v1/public/themes/', {}, options);
  }
  /** One page of What's New posts, newest first; `has_next` says whether another page follows. */
  siteUpdates(page: PageOptions = {}, options?: RequestOptions): Promise<SiteUpdatePage> {
    return this.json('/api/v1/public/site-updates/', pageQuery(page), options);
  }
  /** One What's New post by the `id` a listing returned. */
  siteUpdate(updateId: string, options?: RequestOptions): Promise<SiteUpdateDetail> {
    return this.json(`/api/v1/public/site-updates/${segment(updateId)}/`, {}, options);
  }
  /** A Gym game as its signed share link shows it to anyone who holds the link. */
  sharedGymGame(token: string, options?: RequestOptions): Promise<GymSharedGame> {
    if (typeof token !== 'string' || token.length > 255 || !GYM_SHARE_TOKEN.test(token)) {
      throw new ApiError('Use the signed token from a Gym share link.', { code: 'invalid_identifier' });
    }
    return this.json(`/api/v1/public/gym/games/${token}/`, {}, options);
  }
  /**
   * The site search box: a grouped preview, or one page of one archive result kind. Kind `site` searches the
   * site's own pages, player biographies, event histories and What's New posts instead.
   */
  siteSearch(query: string, options?: RequestOptions): Promise<SiteSearchPreview>;
  siteSearch(query: string, kind: 'site', page?: number, options?: RequestOptions): Promise<SiteContentSearchPage>;
  siteSearch(query: string, kind: SiteSearchKind, page?: number, options?: RequestOptions): Promise<SiteSearchPage>;
  siteSearch(query: string, kindOrOptions?: SiteSearchKind | 'site' | RequestOptions, page?: number,
    options?: RequestOptions): Promise<SiteSearchPreview | SiteSearchPage | SiteContentSearchPage> {
    if (typeof query !== 'string' || !query.trim() || [...query].length > 120) {
      throw new ApiError('Use a search query of 1 to 120 characters.', { code: 'invalid_query' });
    }
    if (typeof kindOrOptions !== 'string') return this.json('/api/v1/public/search/', { q: query }, kindOrOptions);
    if (!['games', 'events', 'players', 'site'].includes(kindOrOptions)) {
      throw new ApiError('kind must be games, events, players or site.', { code: 'invalid_query' });
    }
    if (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) {
      throw new ApiError('page must be a positive integer.', { code: 'invalid_pagination' });
    }
    return this.json('/api/v1/public/search/', { q: query, kind: kindOrOptions, page }, options);
  }
  tablebase(fen: string, options?: RequestOptions): Promise<TablebaseProbe> {
    if (typeof fen !== 'string' || !fen.trim() || new TextEncoder().encode(fen).length > 200) {
      throw new ApiError('Use a FEN of at most 200 bytes.', { code: 'invalid_query' });
    }
    return this.json('/api/v1/tablebase/', { fen }, options);
  }
  annotatedBooks(options: CcnbRequestOptions = {}): Promise<AnnotatedBooks> {
    return this.transport.read(this.transport.url('/api/v1/annotated/books/'), 'json', options, options.ccnbFormat);
  }
  async bookTitles(options?: CcnbRequestOptions): Promise<string[]> {
    return (await this.annotatedBooks(options)).results.map(book => book.label);
  }
  /**
   * Exact package bytes from the website's book download link; use the same ccnbFormat as annotatedBooks for
   * matching revisions. annotatedBookCcnb reads the same package through the versioned API.
   */
  annotatedNotebookFile(bookSlug: string, options?: CcnbRequestOptions): Promise<Uint8Array> {
    return this.transport.ccnbDownload(bookSlug, options);
  }
  /** The book's .ccnb Notebook package from the versioned API (catalog `urls.api_ccnb`), with the same ccnbFormat negotiation. */
  annotatedBookCcnb(bookSlug: string, options?: CcnbRequestOptions): Promise<Uint8Array> {
    return this.transport.ccnbDownload(bookSlug, options, 'api');
  }
  publicGames(filters: PublicGameFilters = {}, options?: RequestOptions): Promise<PublicGamePage> {
    return this.json('/api/v1/public/games/', gameQuery(filters), options);
  }
  publicGame(token: string, options?: RequestOptions): Promise<PublicGame> {
    return this.json(`/api/v1/public/games/${gameToken(token)}/`, {}, options);
  }
  publicPgn(token: string, options?: RequestOptions): Promise<string> {
    return this.text(`/api/v1/public/games/${gameToken(token)}/pgn/`, {}, options);
  }
  /** A game another account imported and made public, by the username and slug in its page address. */
  publicImportedGame(username: string, gameSlug: string, options?: RequestOptions): Promise<PublicImportedGame> {
    return this.json(`/api/v1/public/imported-games/${usernameSegment(username)}/${segment(gameSlug)}/`, {}, options);
  }
  publicImportedPgn(username: string, gameSlug: string, options?: RequestOptions): Promise<string> {
    return this.text(`/api/v1/public/imported-games/${usernameSegment(username)}/${segment(gameSlug)}/pgn/`, {}, options);
  }
  /** One export is limited to 300 games by the API. Use iteratePublicGames for a complete archive. */
  exportPublicGames(filters: Omit<PublicGameFilters, keyof PageOptions> & ExportOptions = {}, options?: RequestOptions): Promise<string> {
    if (filters.tokens && (filters.tokens.length < 1 || filters.tokens.length > 300)) {
      throw new ApiError('Export between 1 and 300 tokens per request.', { code: 'invalid_export' });
    }
    return this.text('/api/v1/public/games/export/', {
      ...gameQuery(filters), tokens: filters.tokens?.map(gameToken).join(','), format: filters.format ?? 'pgn',
      pgnInJson: filters.format === 'ndjson' ? String(filters.pgnInJson ?? true) : undefined,
    }, options);
  }
  /** Export 1–300 public games by canonical or legacy token, sent in the request body; filters apply as in exportPublicGames. */
  exportPublicGamesByToken(tokens: string[], filters: Omit<PublicGameFilters, keyof PageOptions> & ExportFormatOptions = {},
    options?: RequestOptions): Promise<string> {
    const body = exportBody(tokens, gameToken);
    const url = this.transport.url('/api/v1/public/games/export/', { ...gameQuery(filters), ...exportFormatQuery(filters) });
    return this.transport.post(url, 'text', body, 'text/plain; charset=utf-8', options);
  }
  /** One page of a book's games; `query` searches the annotation notes and `headerQuery` the game headers. */
  annotatedGames(bookSlug: string, filters: AnnotatedGameFilters = {}, options?: RequestOptions): Promise<AnnotatedGamePage> {
    return this.json(`/api/v1/annotated/books/${segment(bookSlug)}/games/`, annotatedQuery(filters), options);
  }
  annotatedGame(bookSlug: string, gameSlug: string, options?: RequestOptions): Promise<AnnotatedGame> {
    return this.json(`/api/v1/annotated/books/${segment(bookSlug)}/games/${segment(gameSlug)}/`, {}, options);
  }
  annotatedPgn(bookSlug: string, gameSlug?: string, options?: RequestOptions): Promise<string> {
    const suffix = gameSlug === undefined ? 'pgn/' : `games/${segment(gameSlug)}/pgn/`;
    return this.text(`/api/v1/annotated/books/${segment(bookSlug)}/${suffix}`, {}, options);
  }
  iteratePublicGames(filters: PublicGameFilters = {}, options: IterationOptions = {}): AsyncGenerator<PublicGame> {
    return this.iterate(this.transport.url('/api/v1/public/games/', gameQuery(filters)), options);
  }
  iterateAnnotatedGames(bookSlug: string, filters: AnnotatedGameFilters = {}, options: IterationOptions = {}): AsyncGenerator<AnnotatedGame> {
    return this.iterate(this.transport.url(`/api/v1/annotated/books/${segment(bookSlug)}/games/`, annotatedQuery(filters)), options);
  }

  /** Combine returned api_pgn URLs in order; each URL must stay on the configured public API. */
  async pgnTextForGames(pgnUrls: Iterable<string>, options?: RequestOptions): Promise<string> {
    const games: string[] = [];
    for (const url of pgnUrls) {
      games.push((await this.transport.read<string>(this.transport.apiUrl(url), 'text', options)).trim());
    }
    return games.length ? games.join('\n\n') + '\n' : '';
  }

  private json<T>(path: string, query: Query, options?: RequestOptions): Promise<T> {
    return this.transport.read(this.transport.url(path, query), 'json', options);
  }
  private text(path: string, query: Query, options?: RequestOptions): Promise<string> {
    return this.transport.read(this.transport.url(path, query), 'text', options);
  }
  private async *iterate<T>(url: URL, options: IterationOptions): AsyncGenerator<T> {
    const maxPages = options.maxPages ?? 100_000;
    const limit = options.limit ?? Infinity;
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) {
      throw new ApiError('Use a positive maxPages and a nonnegative limit.', { code: 'invalid_pagination' });
    }
    let count = 0;
    const seen = new Set<string>();
    for (let pages = 0; count < limit; pages++) {
      if (seen.has(url.href) || pages >= maxPages) {
        throw new ApiError('Pagination repeated a page or exceeded maxPages.', { code: 'invalid_pagination' });
      }
      seen.add(url.href);
      const page = await this.transport.read<{ results: T[]; next: string | null }>(url, 'json', options);
      if (!page || !Array.isArray(page.results) || page.next !== null && typeof page.next !== 'string') {
        throw new ApiError('Response is not a game page.', { code: 'invalid_response' });
      }
      for (const item of page.results) {
        yield item;
        if (++count >= limit) return;
      }
      if (page.next === null) return;
      const next = this.transport.apiUrl(page.next, url.href);
      if (next.pathname !== url.pathname) {
        throw new ApiError('Pagination changed the collection path.', { code: 'unsafe_url' });
      }
      url = next;
    }
  }
}
export { ApplicationClient } from './application.js';
export type {
  ApplicationDownload, ApplicationRequest, ApplicationResponse, GifOrientation, GymNewGameOptions,
  NotificationPreferenceChange, PuzzleResult, PuzzleReadOptions, PuzzleAttemptOptions, NotebookAnnotationSearchOptions,
  CuratedGameFilter, CuratedCollectionInput,
  AccountPreferencesChange, MobileSettingsChange, AccountPlan, AccountCollectionOrder, AccountPlanProgress,
  AccountPlayerBookmark, CollectionSort, ImportedGameSource, ImportedGameSort, NotebookVisibility, NotebookRole,
  CollectionGamesOptions, CollectionChange, CollectionItemChange, PlanInput, ImportedGamesOptions, ImportGameInput,
  MobileSignInInput, NotebookInput, NotebookSettingsChange, NotebookCollaboratorInput, NotebookSectionInput,
  NotebookSectionPlacement, NotebookChapterInput, NotebookChapterPlacement, NotebookChapterEdit, NotebookChapterSave,
} from './application.js';
