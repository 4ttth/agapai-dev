import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api } from '@/services/api/http';
import { getDeviceId } from './device';

export type LivenessOutcome =
  | { ok: true; token: string }
  | { ok: false; reason: 'cancelled' | 'error'; message?: string };

/**
 * Run the eGov Face Liveness flow.
 *
 * We create a session on our own server (which holds the API key), open the
 * hosted liveness page in an auth session, and resolve with the session token
 * once the page redirects back to the app. The actual pass/fail (SUCCEEDED and
 * confidence >= 95) is enforced server-side by whichever endpoint the token is
 * later handed to — the client never sees the raw score decision.
 */
export async function runFaceLiveness(purpose = 'app'): Promise<LivenessOutcome> {
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

export { getDeviceId };
