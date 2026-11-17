export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type QueryValue = string | number | undefined;
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AccessTokenProvider {
  getAccessToken(): Promise<string | undefined>;
}

export const SESSION_EXPIRED_EVENT = 'dividend:session-expired';
export const ACCESS_DENIED_EVENT = 'dividend:access-denied';

function announceSecurityResponse(status: number): void {
  if (typeof window === 'undefined') return;
  if (status === 401) window.dispatchEvent(new window.CustomEvent(SESSION_EXPIRED_EVENT));
  if (status === 403) window.dispatchEvent(new window.CustomEvent(ACCESS_DENIED_EVENT));
}

export function assertLocalApiUrl(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new ApiError('A URL da API não é válida.'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new ApiError('O painel está restrito a uma API HTTP local (localhost, 127.0.0.1 ou ::1).');
  }
  return url.toString().replace(/\/$/, '');
}

export class ApiClient {
  private readonly baseUrl: string;
  private tokenProvider?: AccessTokenProvider;
  constructor(
    baseUrl: string,
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
    tokenProvider?: AccessTokenProvider,
  ) {
    this.baseUrl = assertLocalApiUrl(baseUrl);
    this.tokenProvider = tokenProvider;
  }

  setAccessTokenProvider(provider?: AccessTokenProvider): void {
    this.tokenProvider = provider;
  }

  async get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(headers ? { headers } : {}),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      const accessToken = await this.tokenProvider?.getAccessToken();
      response = await this.fetcher(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
    } catch {
      throw new ApiError('Não foi possível conectar ao backend. Verifique se a API local está em execução.');
    }

    if (!response.ok) {
      announceSecurityResponse(response.status);
      let message = `A API respondeu com erro HTTP ${response.status}.`;
      let code: string | undefined;
      try {
        const payload: unknown = await response.json();
        if (payload && typeof payload === 'object') {
          const record = payload as { message?: unknown; error?: unknown; code?: unknown };
          if (typeof record.message === 'string') message = record.message;
          else if (Array.isArray(record.message) && record.message.every((entry) => typeof entry === 'string')) message = record.message.join(' ');
          else if (typeof record.error === 'string') message = record.error;
          if (typeof record.code === 'string') code = record.code;
        }
      } catch { /* Keep the useful HTTP fallback when the response has no JSON body. */ }
      throw new ApiError(message, response.status, code);
    }

    if (response.status === 204) return undefined as T;
    try { return await response.json() as T; }
    catch { throw new ApiError('O backend retornou uma resposta inválida.'); }
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';
export const API_BASE_URL = assertLocalApiUrl(apiBaseUrl);
export const apiClient = new ApiClient(API_BASE_URL);
