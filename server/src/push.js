/**
 * Expo push notifications.
 *
 * The apps register an Expo push token per device (stored on the User row). To
 * ring a follow-up call — or nudge a new message — we POST to Expo's push
 * service, which delivers to APNs/FCM even when the app is backgrounded or
 * closed. Fire-and-forget: a failed push must never break the request that
 * triggered it.
 *
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Basic sanity check for an Expo push token. */
export function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[/.test(token);
}

/**
 * Send one push. `channelId` (Android) and a high priority help a call ring
 * promptly. Returns { ok } and never throws.
 */
export async function sendExpoPush(token, { title, body, data, sound = 'default', priority = 'high', channelId } = {}) {
  if (!isExpoPushToken(token)) return { ok: false, reason: 'no-token' };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ to: token, title, body, data, sound, priority, channelId }]),
      signal: AbortSignal.timeout(8000),
    });
    const out = await res.json().catch(() => ({}));
    const status = out?.data?.[0]?.status ?? (res.ok ? 'ok' : 'error');
    if (status !== 'ok') console.warn('[push] send status:', status, JSON.stringify(out).slice(0, 200));
    return { ok: status === 'ok', status };
  } catch (err) {
    console.warn('[push] send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}
