/** Shared primitive/utility types used across features. */

export type ISODateString = string; // e.g. "2026-07-22"
export type ISODateTimeString = string; // e.g. "2026-07-22T08:00:00.000Z"

/** Discriminated async status for hooks and providers. */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
}

/** Result wrapper so callers handle failures without try/catch everywhere. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
