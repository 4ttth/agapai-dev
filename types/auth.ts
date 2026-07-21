import type { ISODateTimeString } from './common';

/**
 * Session returned by the (mocked) eGovPH Single Sign-On. Mirrors the shape we
 * expect from a real Digital ID / SSO exchange so swapping in the live service
 * later requires no UI changes.
 */
export interface EgovSession {
  /** eGovPH Digital ID subject identifier. */
  digitalId: string;
  fullName: string;
  /** Masked identifier shown in the UI, e.g. "•••• 4821". */
  maskedId: string;
  issuedAt: ISODateTimeString;
  /** Opaque access token (mock string today). */
  accessToken: string;
}

export type AuthStatus = 'initializing' | 'signedOut' | 'signedIn';
