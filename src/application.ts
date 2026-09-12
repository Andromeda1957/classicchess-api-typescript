import { ApiError, Transport, type ClientOptions, type RequestOptions } from './transport.js';

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

  async request<T = Record<string, unknown>>(input: ApplicationRequest): Promise<ApplicationResponse<T>> {
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
      if (!/^\/(?:api\/v1\/(?:account\/|desktop\/|mobile\/(?:notebooks\/|position-scan\/))|cast\/api\/mobile\/)/.test(url.pathname)) {
        throw new ApiError('Bearer credentials are not accepted by this public endpoint.', { code: 'unsafe_credentials' });
      }
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new ApiError('Bearer credentials require HTTPS or loopback development.', { code: 'unsafe_credentials' });
      }
    }
    const method = input.method ?? 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new ApiError('Invalid API method.', { code: 'invalid_method' });
    if (method === 'GET' && input.body !== undefined) throw new ApiError('GET cannot carry a body.', { code: 'invalid_request' });
    const headers = new Headers({ Accept: 'application/json' });
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
    const response = await this.transport.exchange(url, {
      method, headers, ...(input.body === undefined ? {} : { body: input.body as BodyInit }),
    }, input);
    return { ok: response.status >= 200 && response.status < 300, status: response.status,
      data: this.transport.json<T>(response, true), retryAfter: response.retryAfter };
  }
}
