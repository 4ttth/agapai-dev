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

// ---------- eMessage ----------

export async function sendSms(number, message) {
  const { status, body } = await jsonFetch(`${env('EMESSAGE_BASE')}/messaging/v1/sms/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-EMESSAGE-Auth': env('EMESSAGE_TOKEN') },
    body: JSON.stringify({ number, message }),
  });
  return { ok: status === 200 || status === 201, status, body };
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
  const [sso, everify, emessage, egovai] = await Promise.all([
    ping(env('SSO_BASE')),
    ping(env('EVERIFY_BASE')),
    ping(env('EMESSAGE_BASE')),
    ping(env('EGOVAI_BASE')),
  ]);
  healthCache = { at: Date.now(), data: { sso, everify, emessage, egovai } };
  return healthCache.data;
}
