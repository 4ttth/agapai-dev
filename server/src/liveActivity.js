/**
 * ActivityKit Live Activity push over APNs (token-based auth, HTTP/2).
 *
 * Drives the AgapAI medication Live Activity when the patient's app is closed:
 *  - push-to-START it ~5 minutes before a dose (event "start"),
 *  - push-UPDATE it to the "due" state at the exact dose time (event "update"),
 *  - push-END it once taken or the answer window lapses (event "end").
 *
 * Uses only Node built-ins: a cached ES256 JWT (APNs provider token) and the
 * http2 client. No third-party APNs library. Everything is best-effort and never
 * throws into the cron.
 *
 * Required env (see .env.example):
 *   APNS_ENABLED=true
 *   APNS_KEY / APNS_KEY_PATH   (the .p8 contents or a path to it)
 *   APNS_KEY_ID, APNS_TEAM_ID
 *   APNS_BUNDLE_ID             (default com.4ttth.agapaihealth)
 *   APNS_PRODUCTION            (true → api.push.apple.com, else sandbox)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';

/** Live Activity content state — MUST match Swift AgapAIMedAttributes.ContentState. */
export function contentState({ phase, acknowledged = false, taken = false, deadlineEpoch }) {
  return { phase, acknowledged, taken, deadlineEpoch };
}

export function apnsEnabled() {
  return process.env.APNS_ENABLED === 'true';
}

function bundleId() {
  return process.env.APNS_BUNDLE_ID || 'com.4ttth.agapaihealth';
}

function apnsHost() {
  return process.env.APNS_PRODUCTION === 'true'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function loadSigningKey() {
  const inline = process.env.APNS_KEY;
  if (inline && inline.includes('BEGIN')) return inline.replace(/\\n/g, '\n');
  const path = process.env.APNS_KEY_PATH;
  if (path && fs.existsSync(path)) return fs.readFileSync(path, 'utf8');
  return null;
}

// The provider token is valid up to 60 min; Apple rejects reuse < ~20 min old
// churn, so we mint one and reuse it for 40 minutes.
let cachedToken = null;
let cachedAt = 0;

function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedAt < 40 * 60) return cachedToken;
  const keyPem = loadSigningKey();
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyPem || !keyId || !teamId) return null;
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${payload}`;
  const privateKey = crypto.createPrivateKey(keyPem);
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363', // JOSE raw r||s, as ES256 requires
  });
  cachedToken = `${signingInput}.${base64url(signature)}`;
  cachedAt = now;
  return cachedToken;
}

/**
 * POST one Live Activity APNs request. `token` is the push-to-start token (for
 * event "start") or the per-activity update token (for "update"/"end"). Returns
 * { ok, status, reason }.
 */
function apnsPost(token, aps) {
  return new Promise((resolve) => {
    const jwt = providerToken();
    if (!jwt) return resolve({ ok: false, reason: 'no-provider-token' });
    let client;
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { client && client.close(); } catch { /* ignore */ }
      resolve(result);
    };
    try {
      client = http2.connect(apnsHost());
      client.on('error', (err) => done({ ok: false, reason: err.message }));
      const body = JSON.stringify({ aps });
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': `${bundleId()}.push-type.liveactivity`,
        'apns-push-type': 'liveactivity',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });
      let status = 0;
      let data = '';
      req.on('response', (headers) => { status = headers[':status']; });
      req.setEncoding('utf8');
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        if (status !== 200) console.warn('[live-activity] apns', status, data.slice(0, 200));
        done({ ok: status === 200, status, reason: data || undefined });
      });
      req.setTimeout(10000, () => { req.close(); done({ ok: false, reason: 'timeout' }); });
      req.write(body);
      req.end();
    } catch (err) {
      done({ ok: false, reason: err.message });
    }
  });
}

/**
 * push-to-START a medication Live Activity. `pushToStartToken` is the user's
 * ActivityKit push-to-start token. `attributes` is the static shape; `state` the
 * initial content state. `alert` shows a banner as it starts.
 */
export function startActivity(pushToStartToken, attributes, state, alert) {
  const aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'start',
    'attributes-type': 'AgapAIMedAttributes',
    attributes,
    'content-state': state,
    'stale-date': Math.floor(state.deadlineEpoch) + 600,
    'relevance-score': 100,
  };
  if (alert) aps.alert = alert;
  return apnsPost(pushToStartToken, aps);
}

/** push-UPDATE a running activity via its per-activity update token. */
export function updateActivity(updateToken, state, alert) {
  const aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'update',
    'content-state': state,
    'stale-date': Math.floor(state.deadlineEpoch) + 600,
  };
  if (alert) aps.alert = alert;
  return apnsPost(updateToken, aps);
}

/** push-END a running activity via its per-activity update token. */
export function endActivity(updateToken, state, dismissEpoch) {
  const aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'end',
    'content-state': state,
    'dismissal-date': dismissEpoch ?? Math.floor(Date.now() / 1000),
  };
  return apnsPost(updateToken, aps);
}
