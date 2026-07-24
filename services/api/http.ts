import { appConfig } from '@/constants';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/** The Live voice socket authenticates via query param, not a header. */
export function getAuthToken() {
  return authToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type UnauthorizedCallback = (msg: string) => void;
let unauthorizedListener: UnauthorizedCallback | null = null;

export function setOnUnauthorized(cb: UnauthorizedCallback | null) {
  unauthorizedListener = cb;
}

/** JSON fetch against the AgapAI server with bearer auth + timeout. */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 20000);
  try {
    const res = await fetch(`${appConfig.serverUrl}/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (data as { error?: string })?.error ?? `Request failed (${res.status}). Please try again.`;
      if (msg.includes('logged out') || msg.includes('no account found')) {
        if (unauthorizedListener) {
          unauthorizedListener(msg);
        }
      }
      throw new ApiError(msg, res.status);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Cannot reach the AgapAI server. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }
}
