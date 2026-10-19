export interface ClientOptions {
  /** API origin; HTTP is supported for explicit local development servers. */
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  /** Maximum decoded response size; defaults to 32 MiB. */
  maxResponseBytes?: number;
  fetch?: typeof globalThis.fetch;
  /** Opt selected JSON reads into bounded, memory-only ETag revalidation. Never serves offline data. */
  revalidate?: (url: URL) => boolean;
}

export interface RequestOptions { signal?: AbortSignal }
export type CcnbFormat = 2 | 3;
export interface CcnbRequestOptions extends RequestOptions { ccnbFormat?: CcnbFormat }

export function ccnbFormatHeader(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value !== 2 && value !== 3) throw new ApiError('CCNB format must be 2 or 3.', { code: 'invalid_request' });
  return String(value);
}
export interface HttpResponse {
  status: number;
  text: string;
  retryAfter: string | null;
  /** The undecoded body, for GIF, PGN and Notebook file downloads. */
  bytes: Uint8Array;
  contentType: string | null;
  contentDisposition: string | null;
}
export type Query = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  /** Original Retry-After header (seconds or HTTP date). */
  readonly retryAfter: string | null;

  constructor(message: string, options: {
    code: string; status?: number; retryAfter?: string | null; cause?: unknown;
  }) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.retryAfter = options.retryAfter ?? null;
  }
}

export function segment(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) {
    throw new ApiError('Use an exact slug or token returned by the catalog.', { code: 'invalid_identifier' });
  }
  return value;
}

/** The username of the account that imported a game, from its page address; safe in a URL path. */
export function usernameSegment(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9@.+_-]{1,150}$/.test(value) || value === '.' || value === '..') {
    throw new ApiError('Use the exact username from the game page address.', { code: 'invalid_identifier' });
  }
  return value;
}

export function gameToken(value: string): string {
  if (typeof value !== 'string') return segment(value);
  const parts = value.split('/');
  if (parts.length > 2) throw new ApiError('Use a game token, not a URL.', { code: 'invalid_identifier' });
  return parts.map(segment).join('/');
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ApiError(`${name} must be a positive integer.`, { code: 'invalid_options' });
  }
  return value;
}

export class Transport {
  readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly userAgent: string;
  private readonly revalidate: ClientOptions['revalidate'];
  private readonly representations = new Map<string, {
    etag: string; response: Pick<HttpResponse, 'status' | 'bytes' | 'contentType' | 'contentDisposition'>;
  }>();
  private storedBytes = 0;
  private generation = 0;

  constructor(options: ClientOptions = {}) {
    let base: URL;
    try { base = new URL(options.baseUrl ?? 'https://classicchess.com'); }
    catch (cause) { throw new ApiError('Invalid API base URL.', { code: 'invalid_options', cause }); }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
      || base.search || base.hash || base.pathname !== '/') {
      throw new ApiError('Use an HTTP(S) API origin without credentials, path, query or fragment.', { code: 'invalid_options' });
    }
    this.baseUrl = base.origin;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = positiveInteger(options.timeoutMs ?? 30_000, 'timeoutMs');
    this.maxBytes = positiveInteger(options.maxResponseBytes ?? 32 * 1024 * 1024, 'maxResponseBytes');
    this.userAgent = options.userAgent ?? 'classicchess-npm-client/0.1.0';
    this.revalidate = options.revalidate;
  }

  url(path: string, query: Query = {}): URL {
    const url = this.apiUrl(path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return url;
  }

  /** Accept only public API links on the configured origin, including pagination. */
  apiUrl(path: string, relativeTo = this.baseUrl): URL {
    let url: URL;
    try { url = new URL(path, relativeTo); }
    catch (cause) { throw new ApiError('API returned an invalid URL.', { code: 'unsafe_url', cause }); }
    const masterRead = /^\/api\/v1\/games\/(?:g[0-9a-z]+-[0-9a-f]{12}\/(?:pgn\/)?)?$/.test(url.pathname);
    const publicTool = ['/api/v1/players/', '/api/v1/stats/', '/api/v1/games/export/',
      '/api/v1/opening-explorer/', '/api/v1/opening-explorer/sources/', '/api/v1/opening-explorer/lichess/',
      '/api/v1/tablebase/'].includes(url.pathname);
    if (url.origin !== this.baseUrl || url.username || url.password || url.hash
      || !masterRead && !publicTool && !/^\/api\/v1\/(?:public\/|annotated\/)/.test(url.pathname) && url.pathname !== '/api/v1/') {
      throw new ApiError('Refused a link outside the configured public API.', { code: 'unsafe_url' });
    }
    return url;
  }

  async read<T>(url: URL, format: 'json' | 'text', options: RequestOptions = {}, ccnbFormat?: CcnbFormat): Promise<T> {
    this.apiUrl(url.href);
    const header = ccnbFormatHeader(ccnbFormat);
    if (header !== undefined && (url.pathname !== '/api/v1/annotated/books/' || url.search)) {
      throw new ApiError('CCNB negotiation requires the fixed annotated catalog endpoint.', { code: 'invalid_request' });
    }
    const headers = new Headers({ Accept: format === 'json' ? 'application/json' : 'application/x-chess-pgn' });
    if (header !== undefined) headers.set('CCNB-Format', header);
    const response = await this.exchange(url, { method: 'GET', headers }, options);
    this.requireSuccess(response);
    if (format === 'text') return response.text as T;
    return this.json<T>(response);
  }

  async ccnbDownload(bookSlug: string, options: CcnbRequestOptions = {}): Promise<Uint8Array> {
    const url = new URL(`/annotated/${segment(bookSlug)}/download/`, this.baseUrl);
    const header = ccnbFormatHeader(options.ccnbFormat);
    const headers = new Headers({ Accept: 'application/vnd.classicchess.notebook' });
    if (header !== undefined) headers.set('CCNB-Format', header);
    const response = await this.exchange(url, { method: 'GET', headers }, options);
    this.requireSuccess(response);
    if (!response.contentType?.startsWith('application/vnd.classicchess.notebook')) {
      throw new ApiError('Response was not a Notebook file.', { code: 'invalid_response' });
    }
    return response.bytes;
  }

  private requireSuccess(response: HttpResponse): void {
    if (response.status < 200 || response.status >= 300) {
      let detail: { error?: { message?: unknown; code?: unknown } } | null = null;
      try { detail = JSON.parse(response.text); } catch { /* Proxies can return HTML. */ }
      throw new ApiError(typeof detail?.error?.message === 'string' ? detail.error.message : `HTTP ${response.status}`, {
        code: typeof detail?.error?.code === 'string' ? detail.error.code : 'http_error',
        status: response.status, retryAfter: response.retryAfter,
      });
    }
  }

  json<T>(response: HttpResponse, allowEmpty = false): T {
    try { return JSON.parse(allowEmpty && !response.text ? '{}' : response.text) as T; }
    catch (cause) { throw new ApiError('Response was not JSON.', { code: 'invalid_response', status: response.status, cause }); }
  }

  /** Shared bounded transport. Callers validate their own public/application route boundary. */
  async exchange(url: URL, init: Pick<RequestInit, 'method' | 'headers' | 'body'>,
    options: RequestOptions & { timeoutMs?: number } = {}): Promise<HttpResponse> {
    if (url.origin !== this.baseUrl || url.username || url.password || url.hash) {
      throw new ApiError('Refused a link outside the configured API origin.', { code: 'unsafe_url' });
    }
    const timeoutMs = options.timeoutMs === undefined ? this.timeoutMs : positiveInteger(options.timeoutMs, 'timeoutMs');
    if (timeoutMs > 600_000) throw new ApiError('timeoutMs must be at most ten minutes.', { code: 'invalid_options' });
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('User-Agent', this.userAgent);
      const method = (init.method ?? 'GET').toUpperCase();
      if (method !== 'GET') {
        this.representations.clear(); this.storedBytes = 0; this.generation++;
      }
      const generation = this.generation;
      // All request headers partition representations, including credentials and CCNB format.
      const key = method === 'GET' && init.body === undefined && this.revalidate?.(new URL(url.href))
        && headers.get('Accept') === 'application/json' && !headers.has('If-None-Match')
        && !/\bno-store\b/i.test(headers.get('Cache-Control') ?? '')
        ? JSON.stringify([url.href, [...headers]]) : null;
      const saved = key ? this.representations.get(key) : undefined;
      if (saved) headers.set('If-None-Match', saved.etag);
      const response = await this.fetcher(url, {
        ...init, headers, redirect: 'error', credentials: 'omit', signal: controller.signal,
      });
      const bytes = await this.body(response);
      let decoded: string | undefined;
      const reply: HttpResponse = {
        status: response.status, bytes,
        get text() { return decoded ??= new TextDecoder().decode(this.bytes); },
        set text(value: string) { decoded = value; },
        retryAfter: response.headers.get('Retry-After'),
        contentType: response.headers.get('Content-Type'),
        contentDisposition: response.headers.get('Content-Disposition'),
      };
      if (response.status === 304 && saved) {
        const validator = response.headers.get('ETag');
        if (validator && validator.replace(/^W\//, '') !== saved.etag.replace(/^W\//, '')) {
          if (key) this.forget(key);
          throw new ApiError('Conditional response used a different validator.', { code: 'invalid_response', status: 304 });
        }
        // Reparse bytes for every caller; neither mutable objects nor byte arrays escape the cache.
        reply.status = saved.response.status;
        reply.bytes = saved.response.bytes.slice();
        reply.contentType = saved.response.contentType;
        reply.contentDisposition = saved.response.contentDisposition;
      }
      if (key && generation === this.generation) {
        this.forget(key);
        const etag = response.headers.get('ETag') ?? (response.status === 304 ? saved?.etag : null);
        if (reply.status === 200 && etag && etag.length <= 512 && reply.bytes.byteLength <= 16 * 1024 * 1024
          && /(?:application\/json|\+json)(?:;|$)/i.test(reply.contentType ?? '')
          && !/\bno-store\b/i.test(response.headers.get('Cache-Control') ?? '')
          && !response.headers.get('Vary')?.split(',').some(field => field.trim() === '*')) {
          while (this.representations.size >= 64 || this.storedBytes + reply.bytes.byteLength > 16 * 1024 * 1024) {
            this.forget(this.representations.keys().next().value!);
          }
          this.representations.set(key, { etag, response: {
            status: reply.status, bytes: reply.bytes.slice(), contentType: reply.contentType,
            contentDisposition: reply.contentDisposition,
          } });
          this.storedBytes += reply.bytes.byteLength;
        }
      }
      return reply;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw new ApiError(timedOut ? 'API request timed out.' : controller.signal.aborted ? 'API request aborted.' : 'API request failed.', {
        code: timedOut ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network_error', cause,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  private forget(key: string): void {
    const previous = this.representations.get(key);
    if (previous) this.storedBytes -= previous.response.bytes.byteLength;
    this.representations.delete(key);
  }

  private async body(response: Response): Promise<Uint8Array> {
    const declaredLength = Number.parseInt(response.headers.get('Content-Length') || '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ApiError('API response exceeds maxResponseBytes.', { code: 'response_too_large' });
    }
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > this.maxBytes) {
          throw new ApiError('API response exceeds maxResponseBytes.', { code: 'response_too_large' });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
