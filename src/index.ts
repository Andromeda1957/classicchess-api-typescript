import type {
  ApiDiscovery, PublicPlayers, PublicPlayerDetail, PublicPlayerBiography,
  PublicNotableGames, PublicEventIndex, PublicEvents, PublicGame, PublicGamePage, AnnotatedBooks,
  AnnotatedGame, AnnotatedGamePage, MasterGame, MasterGameDetail, MasterGamePage,
} from './schema.js';
import { Transport, ApiError, segment, gameToken } from './transport.js';
import type { ClientOptions, RequestOptions, Query } from './transport.js';

export { ApiError } from './transport.js';
export type { ClientOptions, RequestOptions } from './transport.js';
export type {
  ApiDiscovery, Biography, PublicPlayer, PublicPlayers, PublicPlayerDetail,
  PublicPlayerBiography, PublicNotableGames, PublicEventIndex, PublicEvents, PublicGame, PublicGamePage,
  AnnotatedBooks, AnnotatedGame, AnnotatedGamePage, MasterGame, MasterGameDetail, MasterGamePage,
} from './schema.js';

export interface PageOptions { page?: number; pageSize?: number }
export interface MasterGameFilters extends PageOptions { query: string }
export interface PublicGameFilters extends PageOptions {
  query?: string;
  archivePlayer?: string;
  archiveEvent?: string;
  since?: number;
  until?: number;
  sort?: 'asc' | 'desc' | 'event';
}
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
  return {
    ...pageQuery(filters),
    q: filters.query, archive_player: filters.archivePlayer, archive_event: filters.archiveEvent,
    since: filters.since, until: filters.until, sort: filters.sort,
  };
}

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
  async playerNames(query?: string, options?: RequestOptions): Promise<string[]> {
    return (await this.publicPlayers(query, options)).results.map(player => player.name);
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
  annotatedBooks(options?: RequestOptions): Promise<AnnotatedBooks> {
    return this.json('/api/v1/annotated/books/', {}, options);
  }
  async bookTitles(options?: RequestOptions): Promise<string[]> {
    return (await this.annotatedBooks(options)).results.map(book => book.label);
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
  /** One export is limited to 300 games by the API. Use iteratePublicGames for a complete archive. */
  exportPublicGames(filters: Omit<PublicGameFilters, keyof PageOptions> & { tokens?: string[] } = {}, options?: RequestOptions): Promise<string> {
    if (filters.tokens && (filters.tokens.length < 1 || filters.tokens.length > 300)) {
      throw new ApiError('Export between 1 and 300 tokens per request.', { code: 'invalid_export' });
    }
    return this.text('/api/v1/public/games/export/', {
      ...gameQuery(filters), tokens: filters.tokens?.map(gameToken).join(','),
    }, options);
  }
  annotatedGames(bookSlug: string, page: PageOptions = {}, options?: RequestOptions): Promise<AnnotatedGamePage> {
    return this.json(`/api/v1/annotated/books/${segment(bookSlug)}/games/`, pageQuery(page), options);
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
  iterateAnnotatedGames(bookSlug: string, page: PageOptions = {}, options: IterationOptions = {}): AsyncGenerator<AnnotatedGame> {
    return this.iterate(this.transport.url(`/api/v1/annotated/books/${segment(bookSlug)}/games/`, pageQuery(page)), options);
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
export type { ApplicationRequest, ApplicationResponse } from './application.js';
