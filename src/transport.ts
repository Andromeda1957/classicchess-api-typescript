export interface ClientOptions {
  /** API origin; HTTP is supported for explicit local development servers. */
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  /** Maximum decoded response size; defaults to 32 MiB. */
  maxResponseBytes?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions { signal?: AbortSignal }
export interface HttpResponse { status: number; text: string; retryAfter: string | null }
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
    if (url.origin !== this.baseUrl || url.username || url.password || url.hash
      || !masterRead && !/^\/api\/v1\/(?:public\/|annotated\/)/.test(url.pathname) && url.pathname !== '/api/v1/') {
      throw new ApiError('Refused a link outside the configured public API.', { code: 'unsafe_url' });
    }
    return url;
  }

  async read<T>(url: URL, format: 'json' | 'text', options: RequestOptions = {}): Promise<T> {
    this.apiUrl(url.href);
    const response = await this.exchange(url, { method: 'GET', headers: {
      Accept: format === 'json' ? 'application/json' : 'application/x-chess-pgn',
    } }, options);
    if (response.status < 200 || response.status >= 300) {
      let detail: { error?: { message?: unknown; code?: unknown } } | null = null;
      try { detail = JSON.parse(response.text); } catch { /* Proxies can return HTML. */ }
      throw new ApiError(typeof detail?.error?.message === 'string' ? detail.error.message : `HTTP ${response.status}`, {
        code: typeof detail?.error?.code === 'string' ? detail.error.code : 'http_error',
        status: response.status, retryAfter: response.retryAfter,
      });
    }
    if (format === 'text') return response.text as T;
    return this.json<T>(response);
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
      const response = await this.fetcher(url, {
        ...init, headers, redirect: 'error', credentials: 'omit', signal: controller.signal,
      });
      const text = await this.body(response);
      return { status: response.status, text, retryAfter: response.headers.get('Retry-After') };
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

  private async body(response: Response): Promise<string> {
    const declaredLength = Number.parseInt(response.headers.get('Content-Length') || '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ApiError('API response exceeds maxResponseBytes.', { code: 'response_too_large' });
    }
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > this.maxBytes) {
          throw new ApiError('API response exceeds maxResponseBytes.', { code: 'response_too_large' });
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      return chunks.join('') + decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
