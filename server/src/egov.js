/**
 * eGov platform clients. All secrets stay server-side; the mobile apps only
 * ever talk to this server. Each client caches its upstream token.
 */

const env = (k) => process.env[k] || '';

async function jsonFetch(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

// ---------- eGov SSO ----------

export async function ssoExchange(exchangeCode) {
  const { status, body } = await jsonFetch(`${env('SSO_BASE')}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exchange_code: exchangeCode,
      scope: 'SSO_AUTHENTICATION',
      partner_code: env('SSO_PARTNER_CODE'),
      partner_secret: env('SSO_PARTNER_SECRET'),
    }),
  });
  if (status !== 200 || !body.access_token) {
    throw Object.assign(new Error('SSO token exchange failed'), { status, body });
  }
  const profile = await jsonFetch(`${env('SSO_BASE')}/api/partner/sso_authentication`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${body.access_token}` },
  });
  if (profile.status !== 200) {
    throw Object.assign(new Error('SSO profile fetch failed'), profile);
  }
  return profile.body.data;
}

// ---------- eVerify ----------

let everifyToken = { value: null, exp: 0 };

async function everifyAuth() {
  if (everifyToken.value && Date.now() < everifyToken.exp) return everifyToken.value;
  const { status, body } = await jsonFetch(`${env('EVERIFY_BASE')}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env('EVERIFY_CLIENT_ID'), client_secret: env('EVERIFY_CLIENT_SECRET') }),
  });
  const token = body?.data?.access_token;
  if (status !== 200 || !token) throw Object.assign(new Error('eVerify auth failed'), { status, body });
  everifyToken = { value: token, exp: Date.now() + 1000 * 60 * 30 };
  return token;
}

/** Decode a scanned National ID QR without biometrics. */
export async function everifyQrCheck(value) {
  const token = await everifyAuth();
  const { status, body } = await jsonFetch(`${env('EVERIFY_BASE')}/api/query/qr/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  });
  if (status !== 200) throw Object.assign(new Error('eVerify QR check failed'), { status, body });
  return body.data ?? body;
}

/**
 * eVerify "Verify Personal Information" — the real biometric identity check.
 *
 * Unlike a bare Face Liveness result (which only proves *a* live human), this
 * compares the supplied demographics **and** the face captured in the liveness
 * session against the PhilSys NIDAS database. A 200 means the live face belongs
 * to the person named — so if a *different* live person runs the check against
 * an account's name + birth date, NIDAS returns a non-match and this rejects.
 *
 * Returns `{ ok, matched, data }`. `ok` is only true when eVerify confirms the
 * face and the demographics are the same identity.
 */
export async function everifyQuery({ firstName, lastName, middleName, suffix, birthDate, faceLivenessSessionId }) {
  if (!firstName || !lastName || !birthDate || !faceLivenessSessionId) {
    return { ok: false, matched: false, error: 'missing name, birth date, or liveness session' };
  }
  const token = await everifyAuth();
  const payload = {
    first_name: firstName,
    last_name: lastName,
    birth_date: birthDate,
    face_liveness_session_id: faceLivenessSessionId,
  };
  if (middleName) payload.middle_name = middleName;
  if (suffix) payload.suffix = suffix;

  const { status, body } = await jsonFetch(
    `${env('EVERIFY_BASE')}/api/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    },
    20000,
  );
  const data = body?.data ?? body;
  // 200 with a returned record is a confirmed demographic + biometric match.
  const matched = status === 200 && !!(data?.full_name || data?.first_name || data?.reference);
  if (!matched) {
    return { ok: false, matched: false, status, data };
  }
  return { ok: true, matched: true, status, data };
}

// ---------- eMessage ----------

export async function sendSms(number, message) {
  const { status, body } = await jsonFetch(`${env('EMESSAGE_BASE')}/messaging/v1/sms/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-EMESSAGE-Auth': env('EMESSAGE_TOKEN') },
    body: JSON.stringify({ number, message }),
  });
  return { ok: status === 200 || status === 201, status, body };
}

// ---------- Face Liveness ----------

// The REST API lives on the `-api` host (matching eVerify/SSO). The bare
// `hackathon-face-liveness.e.gov.ph` host serves the liveness *web app* (an
// SPA), so pointing at it returns HTML instead of JSON.
const FACE_BASE = () => env('FACE_LIVENESS_BASE') || 'https://hackathon-face-liveness-api.e.gov.ph';

/** Turn an upstream body into a short, safe diagnostic string. */
function bodySnippet(res) {
  if (res && typeof res.raw === 'string') {
    const html = /<!doctype html|<html/i.test(res.raw);
    return {
      text: res.raw.slice(0, 140),
      hint: html
        ? ' — got an HTML page, so FACE_LIVENESS_BASE is pointing at the liveness web app, not the REST API. Use the -api host.'
        : '',
    };
  }
  return { text: JSON.stringify(res ?? {}).slice(0, 200), hint: '' };
}

/**
 * Create an eGov Face Liveness session. Returns { token, url }; the app opens
 * `url` in a WebView so the user completes the on-device liveness capture.
 * `action` is redirect | post | close (see the Face Liveness API docs).
 */
export async function createLivenessSession({ action = 'post', callbackUrl, delay = 3000 } = {}) {
  const body = { action, delay };
  if (action === 'redirect' && callbackUrl) body.callback_url = callbackUrl;
  const { status, body: res } = await jsonFetch(`${FACE_BASE()}/v1/liveness/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env('FACE_LIVENESS_API_KEY') },
    body: JSON.stringify(body),
  });
  if ((status !== 200 && status !== 201) || !res.token || !res.url) {
    const s = bodySnippet(res);
    throw Object.assign(new Error(`Face Liveness session creation failed (eGov ${status})${s.hint}`), {
      status,
      body: res,
      snippet: s.text,
    });
  }
  return { token: res.token, url: res.url };
}

/**
 * Fetch the final result for a liveness session token. Per the spec a pass is
 * status === "SUCCEEDED" AND confidence_score >= 95.0; anything less is treated
 * as high-risk (possible spoof) and rejected.
 */
export async function getLivenessResult(token) {
  const { status, body } = await jsonFetch(`${FACE_BASE()}/v1/liveness/result/${token}`, {
    headers: { 'x-api-key': env('FACE_LIVENESS_API_KEY') },
  });
  if (status !== 200) {
    const s = bodySnippet(body);
    throw Object.assign(new Error(`Face Liveness result fetch failed (eGov ${status})${s.hint}`), {
      status,
      body,
      snippet: s.text,
    });
  }
  const score = Number(body.confidence_score ?? 0);
  const ok = body.status === 'SUCCEEDED' && score >= 95.0;
  return { ok, status: body.status, score, referenceImageUrl: body.reference_image_url ?? null, raw: body };
}

// ---------- eGov AI ----------

let aiToken = { value: null, exp: 0 };

async function egovAiAuth() {
  if (aiToken.value && Date.now() < aiToken.exp) return aiToken.value;
  const { status, body } = await jsonFetch(`${env('EGOVAI_BASE')}/api/v1/egov/integration/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_code: env('EGOVAI_ACCESS_CODE') }),
  });
  if (status !== 200 || !body.access_token) {
    throw Object.assign(new Error('eGov AI auth failed'), { status, body });
  }
  const ttl = (body.expires_in_seconds ?? 28800) * 1000;
  aiToken = { value: body.access_token, exp: Date.now() + ttl - 60000 };
  return body.access_token;
}

export async function aiAssistant(prompt) {
  const token = await egovAiAuth();
  const { status, body } = await jsonFetch(
    `${env('EGOVAI_BASE')}/api/v1/egov/integration/ai_assistant/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt, category: 'PH' }),
    },
    60000,
  );
  if (status !== 200) throw Object.assign(new Error('eGov AI generate failed'), { status, body });
  return body;
}

/**
 * eGov AI Document Extractor — OCR/structured extraction from a photo or PDF
 * the patient took on their own phone. Returns whatever shape the upstream
 * gives; extractedText() below flattens it to plain text for the assistant.
 */
export async function extractDocument({ base64, filename = 'document.jpg', mimeType = 'image/jpeg' }) {
  const token = await egovAiAuth();
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(base64, 'base64')], { type: mimeType }), filename);
  const { status, body } = await jsonFetch(
    `${env('EGOVAI_BASE')}/api/v1/egov/integration/document_extractor/generate`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
    90000,
  );
  if (status !== 200) throw Object.assign(new Error('eGov document extraction failed'), { status, body });
  return body;
}

/** The extractor formats its answer as light HTML; the models want plain text. */
const stripHtml = (s) =>
  String(s)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Flatten the extractor's response to plain text, whatever key it used. */
export function extractedText(body) {
  if (body == null) return '';
  if (typeof body === 'string') return stripHtml(body);
  const direct = body.text ?? body.data ?? body.result ?? body.content ?? body.extracted_text;
  if (typeof direct === 'string') return stripHtml(direct);
  const seen = new Set();
  const parts = [];
  const walk = (v, depth = 0) => {
    if (v == null || depth > 6 || parts.length > 400) return;
    if (typeof v === 'string') {
      if (v.trim()) parts.push(v.trim());
      return;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string' && val.trim()) parts.push(`${k}: ${val.trim()}`);
      else walk(val, depth + 1);
    }
  };
  walk(direct ?? body);
  return stripHtml(parts.join('\n'));
}

export async function aiCredits() {
  const token = await egovAiAuth();
  const { body } = await jsonFetch(`${env('EGOVAI_BASE')}/api/v1/egov/integration/credits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return body;
}

// ---------- Health pings (for the admin dashboard) ----------

async function ping(url) {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return { reachable: true, status: res.status, ms: Date.now() - started };
  } catch {
    return { reachable: false, ms: Date.now() - started };
  }
}

let healthCache = { at: 0, data: null };

export async function serviceHealth() {
  if (healthCache.data && Date.now() - healthCache.at < 30000) return healthCache.data;
  const [sso, everify, emessage, egovai, faceliveness] = await Promise.all([
    ping(env('SSO_BASE')),
    ping(env('EVERIFY_BASE')),
    ping(env('EMESSAGE_BASE')),
    ping(env('EGOVAI_BASE')),
    ping(FACE_BASE()),
  ]);
  healthCache = { at: Date.now(), data: { sso, everify, emessage, egovai, faceliveness } };
  return healthCache.data;
}
