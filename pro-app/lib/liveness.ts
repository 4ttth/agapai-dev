import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api } from './api';

export type LivenessOutcome =
  | { ok: true; token: string }
  | { ok: false; reason: 'cancelled' | 'error'; message?: string };

/**
 * Run the eGov Face Liveness flow for the professional app.
 *
 * The server (which holds the API key) creates a session; we open the hosted
 * liveness page in an auth session and resolve with the session token once it
 * redirects back. The pass/fail decision (SUCCEEDED and confidence >= 95) is
 * enforced server-side when the token is handed to /auth/register.
 */
export async function runFaceLiveness(purpose = 'pro-register'): Promise<LivenessOutcome> {
  try {
    const redirectUrl = Linking.createURL('liveness-callback');
    const { url, token } = await api<{ url: string; token: string }>('/liveness/session', {
      body: { action: 'redirect', callbackUrl: redirectUrl, purpose },
      timeoutMs: 20000,
    });
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
    if (result.type === 'success') return { ok: true, token };
    return { ok: false, reason: 'cancelled' };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Face Liveness could not start.',
    };
  }
}
