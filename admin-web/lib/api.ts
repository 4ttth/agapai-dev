'use client';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

const KEY_STORAGE = 'agapai_admin_key';

export function getAdminKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY_STORAGE) || '';
}

export function setAdminKey(key: string) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY_STORAGE, key);
}

export function clearAdminKey() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY_STORAGE);
}

export class AdminError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function adminFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new AdminError((data as { error?: string })?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

/** SWR fetcher — the SWR key is the API path. Typed by the useSWR<T> caller. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const swrFetcher = (path: string): Promise<any> => adminFetch<any>(path);

// ---- Types mirrored from the server ----

export interface AdminUser {
  id: string;
  role: 'PATIENT' | 'DOCTOR' | 'PHARMACIST';
  firstName: string;
  lastName: string;
  prcLicense?: string | null;
  verified: boolean;
  everified: boolean;
  liveVerified?: boolean;
  mobile?: string | null;
  createdAt: string;
}

export interface Overview {
  counts: {
    patients: number;
    doctors: number;
    pharmacists: number;
    pending: number;
    consultations: number;
    sms: number;
  };
  traffic: { last24h: number; avgMs: number };
  charts: {
    roles: { name: string; value: number }[];
    hourly: { hour: string; requests: number; errors: number }[];
    daily: { date: string; patients: number; professionals: number }[];
  };
  services: Record<string, { reachable: boolean; status?: number; ms: number }>;
  aiCredits: unknown;
}

export interface UsersPage {
  users: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
