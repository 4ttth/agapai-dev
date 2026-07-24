import { Router } from 'express';

import { bus } from './bus.js';
import { prisma } from './db.js';
import { sendExpoPush } from './push.js';
import {
  aiAssistant,
  aiCredits,
  createLivenessSession,
  everifyQrCheck,
  everifyQuery,
  extractDocument,
  extractedText,
  getLivenessResult,
  sendSms,
  serviceHealth,
  ssoExchange,
} from './egov.js';
import { encryptPii, unwrapKey, wrapKey } from './crypto.js';
import { buildPiiRecord } from './pii.js';
import { askGemini, geminiEnabled, synthesizeSpeech } from './gemini.js';
import { resolveCategory, warmCategory } from './medCategory.js';
import {
  buildHealthReply,
  genericHealthReply,
  looksHealthRelated,
  looksLikeRefusal,
  matchHealthTopic,
} from './healthKb.js';
import { issueTicket, issueToken, readTicket, requireAdmin, requireAuth } from './token.js';
import { matchScore, normalizeIdentity } from './identity.js';

export const api = Router();

const publicUser = (u) => ({
  id: u.id,
  role: u.role,
  firstName: u.firstName,
  lastName: u.lastName,
  middleName: u.middleName,
  suffix: u.suffix,
  birthDate: u.birthDate,
  gender: u.gender,
  pronouns: u.pronouns,
  mobile: u.mobile,
  bloodType: u.bloodType,
  allergies: JSON.parse(u.allergies || '[]'),
  conditions: JSON.parse(u.conditions || '[]'),
  mobile2: u.mobile2,
  emergencyName: u.emergencyName,
  emergencyPhone: u.emergencyPhone,
  prcLicense: u.prcLicense,
  verified: u.verified,
  everified: u.everified,
  liveVerified: u.liveVerified,
  activeDeviceId: u.activeDeviceId,
  notifyPostConsult: u.notifyPostConsult,
  notifyPostDispense: u.notifyPostDispense,
  publicKey: u.publicKey,
  followUpChat: u.followUpChat,
  followUpCall: u.followUpCall,
  createdAt: u.createdAt,
});

/**
 * Resolve a Face Liveness session token to a pass/fail, recording the audit
 * row. Optionally binds the check to a user. Returns { ok, score }.
 */
async function verifyLivenessToken(token, { purpose = 'generic', userId = null } = {}) {
  if (!token) return { ok: false, score: 0, error: 'liveness token required' };
  let result;
  try {
    result = await getLivenessResult(token);
  } catch (err) {
    console.error('[liveness] result fetch failed:', err.status, err.message);
    return { ok: false, score: 0, error: 'Could not verify the Face Liveness result.' };
  }
  await prisma.livenessCheck
    .upsert({
      where: { token },
      update: { status: result.status, score: result.score, userId: userId ?? undefined },
      create: { token, purpose, userId: userId ?? undefined, status: result.status, score: result.score },
    })
    .catch(() => {});
  return result;
}

// Identity matching can be disabled (e.g. in a demo without eVerify creds) by
// setting EVERIFY_IDENTITY_MATCH=off — but it defaults ON, because a plain
// liveness check only proves *a* live person, not *which* person.
const identityMatchEnabled = () => (process.env.EVERIFY_IDENTITY_MATCH || 'on').toLowerCase() !== 'off';

/**
 * Prove that the person in front of the camera is the account holder — not just
 * that they are alive. First the Face Liveness anti-spoof gate, then eVerify's
 * biometric "Verify Personal Information" match of that same live face against
 * the account's National ID name + birth date. A different live person clears
 * liveness but fails the identity match, which is the whole point of this check
 * for unlocking edits and recovering encrypted records onto a new phone.
 *
 * Fails closed: if identity matching is enabled but eVerify can't confirm the
 * match (mismatch, missing identity data, or upstream error), the check fails.
 */
async function verifyAccountHolder(token, user, purpose) {
  const live = await verifyLivenessToken(token, { purpose, userId: user?.id ?? null });
  if (!live.ok) return { ...live, ok: false, reason: 'liveness' };

  if (!identityMatchEnabled()) return { ...live, matched: null };

  if (!user?.firstName || !user?.lastName || !user?.birthDate) {
    return {
      ok: false,
      score: live.score,
      reason: 'identity',
      error: 'This account has no verified National ID identity on file to match against.',
    };
  }

  let match;
  try {
    match = await everifyQuery({
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      suffix: user.suffix,
      birthDate: user.birthDate,
      faceLivenessSessionId: token,
    });
  } catch (err) {
    console.error('[identity] eVerify query failed:', err.status, err.message);
    return {
      ok: false,
      score: live.score,
      reason: 'identity',
      error: 'Could not confirm your identity with eVerify. Please try again.',
    };
  }

  if (!match.matched) {
    console.warn(`[identity] face did not match account ${user.id} (${purpose})`);
    return {
      ok: false,
      score: live.score,
      reason: 'identity',
      error: 'That face does not match the National ID on this account.',
    };
  }
  return { ok: true, score: live.score, matched: true };
}

/**
 * Send a one-off SMS notification to a patient (primary + optional secondary
 * number), deduped by `dedupeKey` so a ret/re-save can't double-send. Silently
 * no-ops when SMS is disabled or the patient has no number. Used for the
 * post-consultation and post-dispense notifications the patient can toggle off.
 */
async function notifyPatientSms(patient, message, dedupeKey) {
  if (process.env.SMS_ENABLED !== 'true' || !patient?.mobile) return;
  const dup = await prisma.smsLog.findUnique({ where: { dedupeKey } }).catch(() => null);
  if (dup) return;
  const numbers = [patient.mobile, patient.mobile2].filter((n, i, arr) => n && arr.indexOf(n) === i);
  const results = await Promise.all(numbers.map((n) => sendSms(n, message)));
  const anyOk = results.some((r) => r.ok);
  const status = anyOk ? (results.every((r) => r.ok) ? 'sent' : 'partial') : `failed:${results[0]?.status ?? 'none'}`;
  await prisma.smsLog.create({ data: { patientId: patient.id, dedupeKey, message, status } }).catch(() => {});
  console.log(`[notify] ${dedupeKey} → ${status}`);
}

const PRO_ROLES = ['DOCTOR', 'PHARMACIST'];

/**
 * The same National ID may hold a patient Health ID *and* a professional
 * account, so every identity lookup is scoped to the app that is asking:
 * the patient app resolves the PATIENT row, AgapAI Pro the DOCTOR/PHARMACIST
 * row. Without this, whichever account was created first shadowed the other.
 */
const scopeOf = (req) => (String(req.body?.scope ?? '').toUpperCase() === 'PRO' ? 'PRO' : 'PATIENT');

const findScoped = (egovUniqid, scope) =>
  egovUniqid
    ? prisma.user.findFirst({
        where: { egovUniqid, role: scope === 'PRO' ? { in: PRO_ROLES } : 'PATIENT' },
      })
    : null;

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[api] ${req.method} ${req.path}:`, err.message, err.body ?? '');
    res.status(500).json({ error: err.message, upstream: err.body ?? null });
  });

// ---------- Health ----------

api.get(
  '/health',
  wrap(async (_req, res) => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {}
    res.json({ ok: db, db, services: await serviceHealth(), at: new Date().toISOString() });
  }),
);

api.get(
  '/time',
  wrap(async (_req, res) => {
    try {
      const r = await fetch('https://gateway.timeapi.world/timezone/Asia/Manila', {
        signal: AbortSignal.timeout(6000),
      });
      const body = await r.json();
      res.json({ source: 'timeapi.world', ...body });
    } catch {
      res.json({ source: 'server-fallback', datetime: new Date().toISOString() });
    }
  }),
);

// ---------- Auth ----------

async function ssoRespond(res, egovProfile, scope) {
  const user = await findScoped(egovProfile.uniqid, scope);
  if (user) {
    return res.json({ registered: true, user: publicUser(user), token: issueToken(user), egovProfile });
  }
  res.json({ registered: false, egovProfile });
}

api.post(
  '/auth/sso/exchange',
  wrap(async (req, res) => {
    const { exchange_code } = req.body;
    if (!exchange_code) return res.status(422).json({ error: 'exchange_code required' });
    const egovProfile = await ssoExchange(exchange_code);
    await ssoRespond(res, egovProfile, scopeOf(req));
  }),
);

/** Demo-mode SSO: deterministic sandbox profile so the flow works without the live authorize page. */
api.post(
  '/auth/mock-sso',
  wrap(async (req, res) => {
    const seed = (req.body?.seed || 'demo').toLowerCase().replace(/[^a-z0-9]/g, '');
    const egovProfile = {
      uniqid: `MOCK-${seed.toUpperCase()}`,
      email: `${seed}@egov.demo`,
      first_name: req.body?.firstName || 'JUAN',
      middle_name: 'SANTOS',
      last_name: req.body?.lastName || 'DELA CRUZ',
      mobile: req.body?.mobile || '+639090000000',
      birth_date: '1990-01-01',
      nationality: 'Filipino',
    };
    await ssoRespond(res, egovProfile, scopeOf(req));
  }),
);

/**
 * Real eGov verification sign-in: the app sends the raw National ID QR value,
 * the server resolves it through eVerify. Identity fields come exclusively
 * from the government record — never typed by the user.
 */
api.post(
  '/auth/everify-login',
  wrap(async (req, res) => {
    const { value } = req.body;
    if (!value) return res.status(422).json({ error: 'value (National ID QR) required' });
    let data;
    try {
      data = await everifyQrCheck(value);
    } catch (err) {
      console.error('[everify-login] upstream:', err.status, JSON.stringify(err.body ?? {}).slice(0, 300));
      return res
        .status(422)
        .json({ error: 'eVerify could not read this QR. Use the QR on the back of your Philippine National ID.' });
    }
    console.log('[everify-login] fields received:', Object.keys(data ?? {}).join(','));
    const identity = normalizeIdentity(data);
    if (!identity) return res.status(422).json({ error: 'eVerify returned no usable identity for this QR.' });
    const user = await findScoped(identity.uniqid, scopeOf(req));
    if (user) {
      return res.json({ registered: true, user: publicUser(user), token: issueToken(user), identity });
    }
    // First time: hand back a short-lived signed ticket for registration. The
    // raw eVerify payload rides along (server-signed) so registration can store
    // the full PII record without re-querying eVerify.
    res.json({ registered: false, identity, ticket: issueTicket(identity, data) });
  }),
);

api.post(
  '/auth/register',
  wrap(async (req, res) => {
    const b = req.body;
    const role = ['PATIENT', 'DOCTOR', 'PHARMACIST'].includes(b.role) ? b.role : 'PATIENT';

    // Real path: identity fields come only from the server-issued eVerify ticket.
    let identity = null;
    let raw = null;
    if (b.ticket) {
      const ticketData = readTicket(b.ticket);
      if (!ticketData) return res.status(401).json({ error: 'Identity ticket invalid or expired — scan your National ID again.' });
      identity = ticketData.identity;
      raw = ticketData.raw;
    } else if (!String(b.egovUniqid ?? '').startsWith('MOCK-')) {
      return res.status(422).json({ error: 'Registration requires an eVerify identity ticket.' });
    }

    const egovUniqid = identity?.uniqid ?? b.egovUniqid ?? null;
    const firstName = identity?.firstName ?? b.firstName;
    const lastName = identity?.lastName ?? b.lastName;
    if (!firstName || !lastName) return res.status(422).json({ error: 'Verified identity is incomplete.' });

    // Optional Face Liveness proof captured right after eVerify. When present it
    // must be a genuine live person (SUCCEEDED >= 95); the pro app requires it.
    let liveVerified = false;
    if (b.livenessToken) {
      const live = await verifyLivenessToken(b.livenessToken, { purpose: `register:${role}` });
      if (!live.ok)
        return res.status(403).json({
          error: `Face Liveness check did not pass (${live.status ?? 'no result'}${
            live.score ? `, score ${live.score}` : ''
          }). Please try the liveness test again.`,
          liveness: live,
        });

      // Anti-spoof liveness only proves *a* live person is present — not that
      // it is the person whose National ID was just scanned. Bind the live face
      // to the eVerify identity so a DIFFERENT live person can't register (or
      // re-register) against someone else's identity. Without this, the pro app
      // "passed" for any face as long as one valid ID had been scanned.
      if (identityMatchEnabled() && identity) {
        if (!firstName || !lastName || !identity.birthDate) {
          return res.status(422).json({
            error: 'Verified identity is incomplete, so the Face Liveness match cannot be confirmed.',
          });
        }
        let match;
        try {
          match = await everifyQuery({
            firstName,
            lastName,
            middleName: identity.middleName,
            suffix: identity.suffix,
            birthDate: identity.birthDate,
            faceLivenessSessionId: b.livenessToken,
          });
        } catch (err) {
          console.error('[register] identity match failed:', err.status, err.message);
          return res.status(502).json({
            error: 'Could not confirm your identity with eVerify. Please try the Face Liveness test again.',
          });
        }
        if (!match.matched) {
          console.warn(`[register] live face did not match scanned National ID (${role})`);
          return res.status(403).json({
            error: 'The live face does not match the National ID that was scanned. Registration must be completed by the ID holder.',
          });
        }
      }
      liveVerified = true;
    }

    // Scoped to the role being registered: a pro account must not be handed
    // back to someone creating their Health ID (or vice versa).
    if (egovUniqid) {
      const existing = await findScoped(egovUniqid, role === 'PATIENT' ? 'PATIENT' : 'PRO');
      if (existing)
        return res.json({ user: publicUser(existing), token: issueToken(existing), existed: true });
    }
    const mobile = b.mobile ?? identity?.mobile ?? null;
    const user = await prisma.user.create({
      data: {
        egovUniqid,
        role,
        firstName,
        lastName,
        middleName: identity?.middleName ?? b.middleName ?? null,
        suffix: identity?.suffix ?? b.suffix ?? null,
        birthDate: identity?.birthDate ?? b.birthDate ?? null,
        // Self-declared at registration: eVerify carries a sex marker, never pronouns.
        gender: b.gender ?? identity?.gender ?? null,
        pronouns: b.pronouns ?? null,
        mobile,
        mobile2: b.mobile2 || null,
        bloodType: b.bloodType ?? identity?.bloodType ?? null,
        allergies: JSON.stringify(b.allergies || []),
        conditions: JSON.stringify(b.conditions || []),
        emergencyName: b.emergencyName || null,
        emergencyPhone: b.emergencyPhone || null,
        verified: role === 'PATIENT',
        everified: Boolean(identity),
        liveVerified,
      },
    });

    // Patient PII: store the full record from eVerify, encrypted at rest.
    if (role === 'PATIENT' && (raw || identity)) {
      const record = buildPiiRecord(raw ?? {}, identity ?? {}, {
        email: b.email,
        gender: b.gender,
        bloodType: b.bloodType,
        mobile,
        mobile2: b.mobile2,
      });
      await prisma.patientPII
        .create({ data: { userId: user.id, ...encryptPii(record) } })
        .catch((err) => console.error('[pii] store failed:', err.message));
    }

    res.json({ user: publicUser(user), token: issueToken(user) });
  }),
);

api.get(
  '/users/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ user: publicUser(user) });
  }),
);

api.patch(
  '/users/me',
  requireAuth,
  wrap(async (req, res) => {
    const b = req.body;
    const current = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!current) return res.status(404).json({ error: 'Not found' });

    const data = {};
    for (const k of [
      'firstName',
      'lastName',
      'middleName',
      'suffix',
      'birthDate',
      'gender',
      'pronouns',
      'mobile',
      'mobile2',
      'bloodType',
      'emergencyName',
      'emergencyPhone',
    ])
      if (b[k] !== undefined) data[k] = b[k];

    // Notification preferences the patient controls from the app.
    for (const k of ['notifyPostConsult', 'notifyPostDispense'])
      if (typeof b[k] === 'boolean') data[k] = b[k];

    // Follow-up opt-ins are a professional setting; ignore them for patients so
    // a patient client can't flip a doctor-only flag on their own row.
    if (PRO_ROLES.includes(current.role)) {
      for (const k of ['followUpChat', 'followUpCall'])
        if (typeof b[k] === 'boolean') data[k] = b[k];
    }

    // Device public key for end-to-end follow-up key exchange (any role).
    if (typeof b.publicKey === 'string' && b.publicKey) data.publicKey = b.publicKey;

    // Identity fields come from the National ID via eVerify and are immutable
    // once verified: the birth date can never be changed, and the mobile number
    // is locked once eVerify has supplied one. This mirrors the locked fields in
    // the app and stops a tampered client from editing them directly.
    if (current.everified) {
      delete data.birthDate;
      if (current.mobile) delete data.mobile;
    }

    if (b.allergies) data.allergies = JSON.stringify(b.allergies);
    if (b.conditions) data.conditions = JSON.stringify(b.conditions);
    const user = await prisma.user.update({ where: { id: req.auth.id }, data });
    res.json({ user: publicUser(user) });
  }),
);

/** Doctors/pharmacists resolve a scanned Health ID to the profile on record. */
api.get(
  '/users/:id',
  requireAuth,
  wrap(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ user: publicUser(user) });
  }),
);

// ---------- eVerify ----------

/**
 * Edit-unlock verification: the scanned National ID must match the Health ID
 * on record at >= 70% (weighted name + birth date similarity).
 */
api.post(
  '/everify/qr-check',
  requireAuth,
  wrap(async (req, res) => {
    if (!req.body.value) return res.status(422).json({ error: 'value required' });
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me) return res.status(404).json({ error: 'User not found' });
    const data = await everifyQrCheck(req.body.value);
    const identity = normalizeIdentity(data);
    if (!identity) return res.status(422).json({ error: 'eVerify returned no usable identity.' });
    const score = matchScore(me, identity);
    if (score < 70) {
      return res.status(403).json({
        error: `This National ID matches your Health ID only ${score}% — at least 70% is required to edit your information.`,
        score,
      });
    }
    await prisma.user.update({ where: { id: me.id }, data: { everified: true } });
    res.json({ verified: true, score });
  }),
);

/**
 * Edit-unlock via Face Liveness — the alternative to eVerify when the patient
 * is on a new phone. The live face must both pass the anti-spoof liveness gate
 * AND match this account's National ID identity (name + birth date) through
 * eVerify, so another live person can't unlock someone else's information.
 */
api.post(
  '/identity/liveness-unlock',
  requireAuth,
  wrap(async (req, res) => {
    const { livenessToken } = req.body || {};
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me) return res.status(404).json({ error: 'User not found' });
    const check = await verifyAccountHolder(livenessToken, me, 'edit-unlock');
    if (!check.ok)
      return res.status(403).json({
        error:
          check.reason === 'identity'
            ? check.error
            : `Face Liveness check did not pass (${check.status ?? 'no result'}).`,
        liveness: check,
      });
    await prisma.user.update({ where: { id: req.auth.id }, data: { everified: true, liveVerified: true } });
    res.json({ verified: true, score: check.score });
  }),
);

// ---------- Face Liveness ----------

/**
 * Start a Face Liveness session. The app opens the returned `url` in a WebView.
 * Public: registration needs it before an account exists. `action` defaults to
 * `post` (the WebView posts the result back); `redirect` needs a callbackUrl.
 */
api.post(
  '/liveness/session',
  wrap(async (req, res) => {
    const { action, callbackUrl, delay } = req.body || {};
    const session = await createLivenessSession({ action, callbackUrl, delay });
    await prisma.livenessCheck
      .create({ data: { token: session.token, purpose: req.body?.purpose || 'session', status: 'PENDING' } })
      .catch(() => {});
    res.json(session);
  }),
);

/** Verify a completed liveness session token (SUCCEEDED and score >= 95). */
api.post(
  '/liveness/verify',
  wrap(async (req, res) => {
    const { token, purpose } = req.body || {};
    if (!token) return res.status(422).json({ error: 'token required' });
    const result = await verifyLivenessToken(token, { purpose: purpose || 'verify' });
    res.json(result);
  }),
);

// ---------- Consultation key escrow (Face Liveness = master key) ----------

/**
 * The patient's phone escrows its consultation key here (wrapped at rest). The
 * key never leaves as plaintext except back to a device that has proven Face
 * Liveness. The calling device becomes the active device.
 */
api.post(
  '/keys/escrow',
  requireAuth,
  wrap(async (req, res) => {
    const { patientKey, deviceId } = req.body || {};
    if (!patientKey) return res.status(422).json({ error: 'patientKey required' });
    const wrapped = wrapKey(patientKey);
    await prisma.keyEscrow.upsert({
      where: { userId: req.auth.id },
      update: { ...wrapped },
      create: { userId: req.auth.id, ...wrapped },
    });
    if (deviceId) {
      await prisma.user.update({ where: { id: req.auth.id }, data: { activeDeviceId: deviceId } }).catch(() => {});
    }
    res.json({ ok: true });
  }),
);

/**
 * Recover the escrowed key onto a NEW phone. Requires a passing Face Liveness
 * token: liveness is the master key. On success the new device becomes the sole
 * active device — the old phone is locked out (its deviceId no longer matches).
 */
api.post(
  '/keys/recover',
  requireAuth,
  wrap(async (req, res) => {
    const { livenessToken, deviceId } = req.body || {};
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me) return res.status(404).json({ error: 'User not found' });
    const check = await verifyAccountHolder(livenessToken, me, 'key-recovery');
    if (!check.ok)
      return res.status(403).json({
        error:
          check.reason === 'identity'
            ? `${check.error} Records stay locked.`
            : `Face Liveness check did not pass (${check.status ?? 'no result'}). Records stay locked.`,
        liveness: check,
      });
    const escrow = await prisma.keyEscrow.findUnique({ where: { userId: req.auth.id } });
    if (!escrow) return res.status(404).json({ error: 'No escrowed key for this account yet.' });
    let patientKey;
    try {
      patientKey = unwrapKey(escrow);
    } catch {
      return res.status(500).json({ error: 'Escrowed key could not be unwrapped.' });
    }
    await prisma.user.update({
      where: { id: req.auth.id },
      data: { activeDeviceId: deviceId || null, liveVerified: true },
    });
    res.json({ patientKey, score: check.score });
  }),
);

// ---------- eGov AI ----------

api.post(
  '/ai/assistant',
  requireAuth,
  wrap(async (req, res) => {
    const { prompt, firstName, documentText } = req.body;
    if (!prompt) return res.status(422).json({ error: 'prompt required' });

    // Persona comes from the record, not the client, so pronouns can't be spoofed.
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } }).catch(() => null);

    // 1) Primary engine: Gemini (handles health questions properly).
    if (geminiEnabled()) {
      try {
        const reply = await askGemini(prompt, firstName ?? me?.firstName, {
          pronouns: me?.pronouns,
          gender: me?.gender,
          documentText,
        });
        return res.json({ reply, source: 'gemini' });
      } catch (err) {
        console.error('[ai] Gemini failed, falling back:', err.message);
      }
    }

    // 2) Fallback: curated home-remedy engine for symptom questions.
    const topic = matchHealthTopic(prompt);
    if (topic) {
      return res.json({ reply: buildHealthReply(topic, firstName), source: 'agapai-health' });
    }

    // 3) Fallback: live eGov AI for everything else, with refusal detection.
    try {
      const out = await aiAssistant(prompt);
      if (looksLikeRefusal(out.data) && looksHealthRelated(prompt)) {
        return res.json({ reply: genericHealthReply(firstName), source: 'agapai-health' });
      }
      return res.json({ reply: out.data, sessionId: out.session_id ?? null, source: 'egov-ai' });
    } catch (err) {
      if (looksHealthRelated(prompt)) {
        return res.json({ reply: genericHealthReply(firstName), source: 'agapai-health' });
      }
      throw err;
    }
  }),
);

/**
 * Neural text-to-speech via Gemini. Returns base64 PCM (24 kHz) the app plays
 * so the assistant sounds human, instead of the device's robotic voice. The
 * key stays server-side. 503 tells the client to fall back to on-device speech.
 */
api.post(
  '/ai/tts',
  requireAuth,
  wrap(async (req, res) => {
    const { text, voice } = req.body || {};
    if (!text || !String(text).trim()) return res.status(422).json({ error: 'text required' });
    if (!geminiEnabled()) return res.status(503).json({ error: 'Gemini TTS is not configured on the server.' });
    try {
      const out = await synthesizeSpeech(text, { voice });
      return res.json(out);
    } catch (err) {
      console.error('[tts] failed:', err.status, err.message);
      return res.status(502).json({ error: 'Could not generate speech right now.' });
    }
  }),
);

/**
 * Classify a medicine name into one of the fixed visual categories so the app
 * can show a matching icon. Cached per normalized name (see medCategory.js), so
 * the same medicine is only ever sent to the AI once.
 */
api.get(
  '/ai/medication-category',
  requireAuth,
  wrap(async (req, res) => {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(422).json({ error: 'name required' });
    const { category, source } = await resolveCategory(name);
    res.json({ name, category, source });
  }),
);

/**
 * Document text extraction via eGov AI. The patient photographs a lab result,
 * prescription or clinic form on their own phone; we OCR it upstream and hand
 * the text back so it can be fed to the assistant for interpretation.
 */
api.post(
  '/documents/extract',
  requireAuth,
  wrap(async (req, res) => {
    const { base64, filename, mimeType } = req.body;
    if (!base64) return res.status(422).json({ error: 'base64 (document image) required' });
    try {
      const body = await extractDocument({ base64, filename, mimeType });
      const text = extractedText(body);
      if (!text.trim())
        return res.status(422).json({ error: 'No readable text found in that document.', raw: body });
      return res.json({ text, source: 'egov-document-extractor' });
    } catch (err) {
      console.error('[documents] extraction failed:', err.status, err.message);
      return res
        .status(502)
        .json({ error: 'eGov could not read that document. Try a clearer, well-lit photo.' });
    }
  }),
);

// ---------- Consultations ----------

api.post(
  '/consultations',
  requireAuth,
  wrap(async (req, res) => {
    const doctor = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!doctor || doctor.role !== 'DOCTOR') return res.status(403).json({ error: 'Doctors only' });
    if (!doctor.verified) return res.status(403).json({ error: 'Awaiting admin verification' });
    const b = req.body;
    if (!b.patientId || !b.ciphertext || !b.iv || !b.salt || !b.type)
      return res.status(422).json({ error: 'patientId, type, ciphertext, iv, salt required' });
    const consultation = await prisma.consultation.create({
      data: {
        patientId: b.patientId,
        doctorId: doctor.id,
        date: b.date ? new Date(b.date) : new Date(),
        type: b.type,
        ciphertext: b.ciphertext,
        iv: b.iv,
        salt: b.salt,
        hasVoice: !!b.hasVoice,
        hasRxImage: !!b.hasRxImage,
      },
    });

    // Auto-apply: the prescription list is sent in the clear alongside the
    // encrypted record so the medicines land in the patient's system
    // immediately (no need to open the consultation and tap "add"), power the
    // SMS reminder cron, and stay doctor-managed (read-only for the patient).
    const rx = Array.isArray(b.prescriptions) ? b.prescriptions : [];
    let medications = [];
    if (rx.length > 0) {
      medications = await Promise.all(
        rx
          .filter((p) => p && p.name)
          .map((p) =>
            prisma.medication.create({
              data: {
                patientId: b.patientId,
                name: String(p.name),
                dosage: p.dosage ? String(p.dosage) : '',
                instructions: p.instructions || null,
                times: JSON.stringify(Array.isArray(p.times) ? p.times : []),
                quantity: p.quantity ?? null,
                source: 'DOCTOR',
                consultationId: consultation.id,
              },
            }),
          ),
      );
      // Warm the icon-category cache in the background so the patient's list
      // shows an AI-classified icon without a first-open delay.
      medications.forEach((m) => warmCategory(m.name));
    }
    // Post-consultation notification (patient-toggleable; delivered by SMS so it
    // arrives even when the app is closed).
    const patient = await prisma.user.findUnique({ where: { id: b.patientId } }).catch(() => null);
    if (patient?.notifyPostConsult) {
      const drName = `Dr. ${doctor.firstName} ${doctor.lastName}`.replace(/\s+/g, ' ').trim();
      const meds = medications.length
        ? ` with ${medications.length} medicine${medications.length === 1 ? '' : 's'}`
        : '';
      const msg = `AgapAI: ${drName} saved a new ${consultation.type} consultation for you${meds}. Open the AgapAI app to view it.`;
      void notifyPatientSms(patient, msg, `consult:${consultation.id}`);
    }

    res.json({ consultation, medicationsCreated: medications.length });
  }),
);

api.get(
  '/consultations',
  requireAuth,
  wrap(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    const where = me.role === 'DOCTOR' ? { doctorId: me.id } : { patientId: me.id };
    const list = await prisma.consultation.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        doctor: { select: { firstName: true, lastName: true, prcLicense: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
    });
    res.json({ consultations: list });
  }),
);

api.get(
  '/consultations/latest/:patientId',
  requireAuth,
  wrap(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me || me.role !== 'PHARMACIST') return res.status(403).json({ error: 'Pharmacists only' });
    if (!me.verified) return res.status(403).json({ error: 'Awaiting admin verification' });
    const latest = await prisma.consultation.findFirst({
      where: { patientId: req.params.patientId },
      orderBy: { date: 'desc' },
      include: {
        doctor: { select: { firstName: true, lastName: true, prcLicense: true } },
        patient: { select: { firstName: true, lastName: true, bloodType: true } },
      },
    });
    if (!latest) return res.status(404).json({ error: 'No consultations for this patient' });
    res.json({ consultation: latest });
  }),
);

// ---------- Follow-ups (doctor ⇄ patient, E2E chat + call signaling) ----------

const FOLLOW_UP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the purge cron

/**
 * The patient's most-recent consultation decides who they may follow up with.
 * Only that one doctor is eligible — older doctors and other consultations are
 * never contactable. Returns { doctor, consultationId } or null.
 */
async function mostRecentDoctorFor(patientId) {
  const latest = await prisma.consultation.findFirst({
    where: { patientId },
    orderBy: { date: 'desc' },
    include: {
      doctor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          prcLicense: true,
          publicKey: true,
          followUpChat: true,
          followUpCall: true,
        },
      },
    },
  });
  if (!latest?.doctor) return null;
  return { doctor: latest.doctor, consultationId: latest.id };
}

const threadView = (t, meId) => {
  const iAmPatient = t.patientId === meId;
  const other = iAmPatient ? t.doctor : t.patient;
  return {
    id: t.id,
    status: t.status,
    consultationId: t.consultationId,
    createdAt: t.createdAt,
    lastMessageAt: t.lastMessageAt,
    expiresAt: t.expiresAt,
    closedAt: t.closedAt,
    messageCount: t._count?.messages ?? undefined,
    counterpart: other
      ? {
          id: other.id,
          role: iAmPatient ? 'DOCTOR' : 'PATIENT',
          firstName: other.firstName,
          lastName: other.lastName,
          prcLicense: iAmPatient ? other.prcLicense ?? null : null,
        }
      : null,
  };
};

/** Load a thread the caller participates in (and that hasn't expired), or 404/403. */
async function loadParticipantThread(req, res) {
  const thread = await prisma.followUpThread.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { messages: true } },
      doctor: { select: { id: true, firstName: true, lastName: true, prcLicense: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!thread || thread.expiresAt < new Date()) {
    res.status(404).json({ error: 'This follow-up no longer exists (it may have expired).' });
    return null;
  }
  if (thread.patientId !== req.auth.id && thread.doctorId !== req.auth.id) {
    res.status(403).json({ error: 'Not a participant in this follow-up.' });
    return null;
  }
  return thread;
}

/** Publish this device's follow-up public key (idempotent). Any role. */
api.post(
  '/keys/public',
  requireAuth,
  wrap(async (req, res) => {
    const { publicKey } = req.body || {};
    if (!publicKey) return res.status(422).json({ error: 'publicKey required' });
    await prisma.user.update({ where: { id: req.auth.id }, data: { publicKey } });
    res.json({ ok: true });
  }),
);

/** Register this device's Expo push token so calls can ring in the background. */
api.post(
  '/keys/push-token',
  requireAuth,
  wrap(async (req, res) => {
    const { pushToken, platform } = req.body || {};
    if (!pushToken) return res.status(422).json({ error: 'pushToken required' });
    await prisma.user.update({
      where: { id: req.auth.id },
      data: { pushToken, pushPlatform: platform ? String(platform).slice(0, 16) : null },
    });
    res.json({ ok: true });
  }),
);

/** WebRTC ICE servers for a follow-up call. STUN is free; TURN is optional. */
api.get(
  '/follow-up/ice',
  requireAuth,
  wrap(async (_req, res) => {
    const defaultStun = 'stun:stun.l.google.com:19302';
    const stunString = process.env.STUN_URLS || defaultStun;
    
    const iceServers = [{ 
      urls: stunString.split(','),
      url: stunString.split(',')[0] // Fallback for strict/older native clients
    }];

    // Strict safety check: ONLY push TURN if the env vars are actually loaded
    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
      iceServers.push({
        urls: process.env.TURN_URL.split(','),
        url: process.env.TURN_URL.split(',')[0], // Fallback for strict/older native clients
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_PASSWORD,
      });
    }

    res.json({ iceServers });
  }),
);

/**
 * Who (if anyone) the signed-in patient may follow up with, plus that doctor's
 * public key so the app can seal a thread key to them. Also reports whether an
 * open thread already exists so the app can resume instead of duplicating.
 */
api.get(
  '/follow-up/eligibility',
  requireAuth,
  wrap(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me || me.role !== 'PATIENT') return res.status(403).json({ error: 'Patients only' });
    const recent = await mostRecentDoctorFor(me.id);
    if (!recent) return res.json({ eligible: false, reason: 'no-consultation' });
    const { doctor, consultationId } = recent;
    const existing = await prisma.followUpThread.findFirst({
      where: {
        patientId: me.id,
        doctorId: doctor.id,
        status: 'OPEN',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    res.json({
      eligible: doctor.followUpChat || doctor.followUpCall,
      chatEnabled: doctor.followUpChat,
      callEnabled: doctor.followUpCall,
      doctor: {
        id: doctor.id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        prcLicense: doctor.prcLicense,
        publicKey: doctor.publicKey,
      },
      consultationId,
      existingThreadId: existing?.id ?? null,
    });
  }),
);

/**
 * Patient opens (or resumes) a follow-up thread with their most-recent doctor.
 * The thread key is sealed to the doctor client-side; the server only stores the
 * opaque wrap. Re-opening an existing OPEN thread returns it unchanged so keys
 * aren't needlessly rotated.
 */
api.post(
  '/follow-up/threads',
  requireAuth,
  wrap(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me || me.role !== 'PATIENT') return res.status(403).json({ error: 'Patients only' });
    const b = req.body || {};
    const recent = await mostRecentDoctorFor(me.id);
    if (!recent) return res.status(403).json({ error: 'You have no consultation to follow up on yet.' });
    if (b.doctorId !== recent.doctor.id)
      return res.status(403).json({ error: 'Follow-ups are only with your most recent doctor.' });
    if (!recent.doctor.followUpChat && !recent.doctor.followUpCall)
      return res.status(403).json({ error: 'This doctor has not enabled follow-ups.' });

    const existing = await prisma.followUpThread.findFirst({
      where: { patientId: me.id, doctorId: recent.doctor.id, status: 'OPEN', expiresAt: { gt: new Date() } },
      include: { _count: { select: { messages: true } }, doctor: true, patient: true },
    });
    if (existing) return res.json({ thread: threadView(existing, me.id), resumed: true });

    if (!b.wrappedKey || !b.wrapNonce || !b.wrapEphemPub)
      return res.status(422).json({ error: 'Sealed thread key (wrappedKey, wrapNonce, wrapEphemPub) required.' });

    const shares = Array.isArray(b.shares) ? b.shares : [];
    const thread = await prisma.followUpThread.create({
      data: {
        patientId: me.id,
        doctorId: recent.doctor.id,
        consultationId: b.consultationId ?? recent.consultationId,
        wrappedKey: b.wrappedKey,
        wrapNonce: b.wrapNonce,
        wrapEphemPub: b.wrapEphemPub,
        expiresAt: new Date(Date.now() + FOLLOW_UP_TTL_MS),
        shares: {
          create: shares
            .filter((s) => s && s.ciphertext && s.iv && s.salt && ['CONSULTATION', 'AI_HISTORY'].includes(s.kind))
            .map((s) => ({
              kind: s.kind,
              label: s.label ? String(s.label).slice(0, 120) : null,
              ciphertext: s.ciphertext,
              iv: s.iv,
              salt: s.salt,
            })),
        },
        ...(b.firstMessage?.ciphertext
          ? {
              messages: {
                create: {
                  senderId: me.id,
                  senderRole: 'PATIENT',
                  ciphertext: b.firstMessage.ciphertext,
                  iv: b.firstMessage.iv,
                  salt: b.firstMessage.salt,
                },
              },
            }
          : {}),
      },
      include: { _count: { select: { messages: true } }, doctor: true, patient: true },
    });
    res.json({ thread: threadView(thread, me.id), resumed: false });
  }),
);

/** List the caller's follow-up threads (patient → theirs, doctor → theirs). */
api.get(
  '/follow-up/threads',
  requireAuth,
  wrap(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me) return res.status(404).json({ error: 'Not found' });
    const where =
      me.role === 'PATIENT' ? { patientId: me.id } : { doctorId: me.id };
    const threads = await prisma.followUpThread.findMany({
      where: { ...where, expiresAt: { gt: new Date() } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
        doctor: { select: { id: true, firstName: true, lastName: true, prcLicense: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ threads: threads.map((t) => threadView(t, me.id)) });
  }),
);

/** One thread with its sealed key + shares (for the participant to decrypt). */
api.get(
  '/follow-up/threads/:id',
  requireAuth,
  wrap(async (req, res) => {
    const thread = await loadParticipantThread(req, res);
    if (!thread) return;
    const shares = await prisma.followUpShare.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      thread: threadView(thread, req.auth.id),
      // Only the doctor needs the wrap; it is sealed to their key regardless.
      wrap:
        req.auth.id === thread.doctorId
          ? { wrappedKey: thread.wrappedKey, wrapNonce: thread.wrapNonce, wrapEphemPub: thread.wrapEphemPub }
          : null,
      shares,
    });
  }),
);

/** Messages in a thread, oldest first (ciphertext only). */
api.get(
  '/follow-up/threads/:id/messages',
  requireAuth,
  wrap(async (req, res) => {
    const thread = await loadParticipantThread(req, res);
    if (!thread) return;
    const messages = await prisma.followUpMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ messages });
  }),
);

/** Append an E2E-encrypted message; fan it out live to the peer. */
api.post(
  '/follow-up/threads/:id/messages',
  requireAuth,
  wrap(async (req, res) => {
    const thread = await loadParticipantThread(req, res);
    if (!thread) return;
    if (thread.status !== 'OPEN')
      return res.status(409).json({ error: 'This follow-up is closed.' });
    const { ciphertext, iv, salt } = req.body || {};
    if (!ciphertext || !iv || !salt)
      return res.status(422).json({ error: 'ciphertext, iv, salt required' });
    const senderRole = thread.patientId === req.auth.id ? 'PATIENT' : 'DOCTOR';
    const message = await prisma.followUpMessage.create({
      data: { threadId: thread.id, senderId: req.auth.id, senderRole, ciphertext, iv, salt },
    });
    await prisma.followUpThread
      .update({ where: { id: thread.id }, data: { lastMessageAt: message.createdAt } })
      .catch(() => {});
    bus.emit('followup:message', { threadId: thread.id, message });

    // Nudge the recipient by push (best-effort). The body is generic — the
    // message itself is end-to-end encrypted and never leaves the two devices.
    const recipientIsDoctor = senderRole === 'PATIENT';
    const senderName = recipientIsDoctor
      ? `${thread.patient.firstName} ${thread.patient.lastName}`.replace(/\s+/g, ' ').trim()
      : `Dr. ${thread.doctor.firstName} ${thread.doctor.lastName}`.replace(/\s+/g, ' ').trim();
    const recipientId = recipientIsDoctor ? thread.doctorId : thread.patientId;
    prisma.user
      .findUnique({ where: { id: recipientId }, select: { pushToken: true } })
      .then((r) => {
        if (r?.pushToken)
          void sendExpoPush(r.pushToken, {
            title: 'New follow-up message',
            body: `${senderName} sent you a message.`,
            data: { kind: 'follow-up-message', threadId: thread.id },
          });
      })
      .catch(() => {});

    res.json({ message });
  }),
);

/**
 * Ring the other participant for a WebRTC call: sends them a push notification
 * so the call rings even when their app is backgrounded or closed. Either side
 * may initiate (patient → doctor or doctor → patient), but only while the
 * thread's doctor has follow-up calls enabled.
 */
api.post(
  '/follow-up/threads/:id/call',
  requireAuth,
  wrap(async (req, res) => {
    const thread = await loadParticipantThread(req, res);
    if (!thread) return;
    if (thread.status !== 'OPEN') return res.status(409).json({ error: 'This follow-up is closed.' });

    const doctor = await prisma.user.findUnique({
      where: { id: thread.doctorId },
      select: { followUpCall: true },
    });
    if (!doctor?.followUpCall)
      return res.status(403).json({ error: 'Calls are not enabled for this follow-up.' });

    const callerIsDoctor = req.auth.id === thread.doctorId;
    const callerName = callerIsDoctor
      ? `Dr. ${thread.doctor.firstName} ${thread.doctor.lastName}`.replace(/\s+/g, ' ').trim()
      : `${thread.patient.firstName} ${thread.patient.lastName}`.replace(/\s+/g, ' ').trim();
    const calleeId = callerIsDoctor ? thread.patientId : thread.doctorId;

    const callee = await prisma.user.findUnique({
      where: { id: calleeId },
      select: { pushToken: true },
    });

    const callId = `${thread.id}-${Date.now()}`;
    if (callee?.pushToken) {
      void sendExpoPush(callee.pushToken, {
        title: 'Incoming AgapAI call',
        body: `${callerName} is calling you…`,
        data: { kind: 'follow-up-call', threadId: thread.id, callId },
        channelId: 'calls',
      });
    }
    res.json({ ok: true, callId, rang: !!callee?.pushToken });
  }),
);

/** Close a follow-up (either participant). It still purges at expiry. */
api.post(
  '/follow-up/threads/:id/close',
  requireAuth,
  wrap(async (req, res) => {
    const thread = await loadParticipantThread(req, res);
    if (!thread) return;
    const updated = await prisma.followUpThread.update({
      where: { id: thread.id },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: {
        _count: { select: { messages: true } },
        doctor: { select: { id: true, firstName: true, lastName: true, prcLicense: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ thread: threadView(updated, req.auth.id) });
  }),
);

// ---------- Dispense (pharmacist -> patient medication sync) ----------

api.post(
  '/dispense',
  requireAuth,
  wrap(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!me || me.role !== 'PHARMACIST') return res.status(403).json({ error: 'Pharmacists only' });
    if (!me.verified) return res.status(403).json({ error: 'Awaiting admin verification' });
    const { patientId, consultationId, items } = req.body;
    if (!patientId || !Array.isArray(items) || items.length === 0)
      return res.status(422).json({ error: 'patientId and items required' });
    const created = [];
    for (const it of items) {
      created.push(
        await prisma.medication.create({
          data: {
            patientId,
            name: it.name,
            dosage: it.dosage || '',
            instructions: it.instructions || null,
            times: JSON.stringify(it.times || []),
            quantity: it.quantity ?? null,
            source: 'PHARMACIST',
            consultationId: consultationId || null,
          },
        }),
      );
    }
    created.forEach((m) => warmCategory(m.name));
    if (consultationId) {
      await prisma.consultation
        .update({ where: { id: consultationId }, data: { dispensedAt: new Date() } })
        .catch(() => {});
    }

    // Post-dispense notification (patient-toggleable, delivered by SMS).
    const patient = await prisma.user.findUnique({ where: { id: patientId } }).catch(() => null);
    if (patient?.notifyPostDispense) {
      const names = created.map((m) => m.name).filter(Boolean);
      const list =
        names.slice(0, 2).join(', ') + (names.length > 2 ? `, +${names.length - 2} more` : '');
      const msg = `AgapAI: Your pharmacist dispensed ${list || 'your medicine'}. Open the AgapAI app to see your medications.`;
      void notifyPatientSms(patient, msg, `dispense:${consultationId || created[0]?.id}`);
    }

    res.json({ medications: created });
  }),
);

// ---------- Medications sync (patient) ----------

api.get(
  '/medications',
  requireAuth,
  wrap(async (req, res) => {
    const list = await prisma.medication.findMany({
      where: { patientId: req.auth.id, active: true },
      orderBy: { createdAt: 'desc' },
    });
    // Attach a visual category per medicine. cacheOnly keeps this list fast: it
    // reads the cache (warmed when the med was prescribed/dispensed) or a
    // keyword guess, never a blocking AI call.
    const medications = await Promise.all(
      list.map(async (m) => ({
        ...m,
        times: JSON.parse(m.times || '[]'),
        category: (await resolveCategory(m.name, { cacheOnly: true })).category,
      })),
    );
    res.json({ medications });
  }),
);

/** Patient pushes their locally-managed meds so the SMS cron knows the schedule. */
api.put(
  '/medications/sync',
  requireAuth,
  wrap(async (req, res) => {
    const meds = Array.isArray(req.body.medications) ? req.body.medications : [];
    await prisma.medication.deleteMany({ where: { patientId: req.auth.id, source: 'SELF' } });
    for (const m of meds) {
      await prisma.medication.create({
        data: {
          patientId: req.auth.id,
          name: m.name,
          dosage: m.dosage || '',
          instructions: m.instructions || null,
          times: JSON.stringify(m.times || []),
          quantity: m.quantity ?? null,
          source: 'SELF',
        },
      });
    }
    res.json({ ok: true, count: meds.length });
  }),
);

// ---------- Public directory (PRC accountability) ----------

api.get(
  '/directory/professionals',
  wrap(async (_req, res) => {
    const pros = await prisma.user.findMany({
      where: { role: { in: ['DOCTOR', 'PHARMACIST'] }, verified: true },
      select: { id: true, role: true, firstName: true, lastName: true, prcLicense: true },
      orderBy: { lastName: 'asc' },
    });
    res.json({ professionals: pros });
  }),
);

// ---------- Admin ----------

api.get(
  '/admin/overview',
  requireAdmin,
  wrap(async (_req, res) => {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const [patients, doctors, pharmacists, pending, consultations, sms, reqs24h, avg] = await Promise.all([
      prisma.user.count({ where: { role: 'PATIENT' } }),
      prisma.user.count({ where: { role: 'DOCTOR' } }),
      prisma.user.count({ where: { role: 'PHARMACIST' } }),
      prisma.user.count({ where: { verified: false } }),
      prisma.consultation.count(),
      prisma.smsLog.count(),
      prisma.metric.count({ where: { at: { gte: dayAgo } } }),
      prisma.metric.aggregate({ _avg: { ms: true }, where: { at: { gte: dayAgo } } }),
    ]);
    let credits = null;
    try {
      credits = await aiCredits();
    } catch {}

    // Requests per hour over the last 24h (for the traffic chart).
    const recentMetrics = await prisma.metric.findMany({
      where: { at: { gte: dayAgo } },
      select: { at: true, status: true, ms: true },
    });
    const hourly = Array.from({ length: 24 }, (_, i) => {
      const h = new Date(Date.now() - (23 - i) * 3600 * 1000);
      return { hour: `${String(h.getHours()).padStart(2, '0')}:00`, requests: 0, errors: 0 };
    });
    const nowH = new Date();
    for (const m of recentMetrics) {
      const diffH = Math.floor((nowH - new Date(m.at)) / 3600000);
      const idx = 23 - diffH;
      if (idx >= 0 && idx < 24) {
        hourly[idx].requests += 1;
        if (m.status >= 400) hourly[idx].errors += 1;
      }
    }

    // Signups per day over the last 14 days (for the growth chart).
    const twoWeeks = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const newUsers = await prisma.user.findMany({
      where: { createdAt: { gte: twoWeeks } },
      select: { createdAt: true, role: true },
    });
    const dailyMap = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      dailyMap.set(d, { date: d, patients: 0, professionals: 0 });
    }
    for (const u of newUsers) {
      const d = new Date(u.createdAt).toISOString().slice(0, 10);
      const row = dailyMap.get(d);
      if (row) row[u.role === 'PATIENT' ? 'patients' : 'professionals'] += 1;
    }

    res.json({
      counts: { patients, doctors, pharmacists, pending, consultations, sms },
      traffic: { last24h: reqs24h, avgMs: Math.round(avg._avg.ms || 0) },
      charts: {
        roles: [
          { name: 'Patients', value: patients },
          { name: 'Doctors', value: doctors },
          { name: 'Pharmacists', value: pharmacists },
        ],
        hourly,
        daily: Array.from(dailyMap.values()),
      },
      services: await serviceHealth(),
      aiCredits: credits,
    });
  }),
);

api.get(
  '/admin/pending',
  requireAdmin,
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({ where: { verified: false }, orderBy: { createdAt: 'asc' } });
    res.json({ users: users.map(publicUser) });
  }),
);

api.get(
  '/admin/users',
  requireAdmin,
  wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const q = String(req.query.q || '').trim();
    const roleFilter = String(req.query.role || '').toUpperCase();
    const where = {
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { prcLicense: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(['PATIENT', 'DOCTOR', 'PHARMACIST'].includes(roleFilter) ? { role: roleFilter } : {}),
    };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({
      users: users.map(publicUser),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

/**
 * Delete any account (professional or patient). Dependent rows that don't
 * cascade are removed first; PatientPII and KeyEscrow cascade automatically.
 * Deleting a patient therefore also erases their consultations, medications,
 * SMS log, escrowed key, and encrypted PII record.
 */
api.delete(
  '/admin/users/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const id = user.id;
    // Consultations and follow-up threads reference this person as patient or
    // doctor (no cascade to User); messages/shares cascade from the thread.
    await prisma.followUpThread.deleteMany({ where: { OR: [{ patientId: id }, { doctorId: id }] } }).catch(() => {});
    await prisma.consultation.deleteMany({ where: { OR: [{ patientId: id }, { doctorId: id }] } }).catch(() => {});
    await prisma.medication.deleteMany({ where: { patientId: id } }).catch(() => {});
    await prisma.smsLog.deleteMany({ where: { patientId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true, deleted: id, role: user.role });
  }),
);

/** Change a professional's role between DOCTOR and PHARMACIST. */
api.patch(
  '/admin/users/:id/role',
  requireAdmin,
  wrap(async (req, res) => {
    const role = String(req.body?.role || '').toUpperCase();
    if (!PRO_ROLES.includes(role))
      return res.status(422).json({ error: 'role must be DOCTOR or PHARMACIST' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!PRO_ROLES.includes(user.role))
      return res.status(403).json({ error: 'Only registered professionals can have their role changed.' });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { role } });
    res.json({ user: publicUser(updated) });
  }),
);

api.post(
  '/admin/verify',
  requireAdmin,
  wrap(async (req, res) => {
    const { userId, prcLicense } = req.body;
    if (!userId || !prcLicense) return res.status(422).json({ error: 'userId and prcLicense required' });
    const user = await prisma.user.update({
      where: { id: userId },
      data: { verified: true, prcLicense },
    });
    res.json({ user: publicUser(user) });
  }),
);

api.get(
  '/admin/metrics',
  requireAdmin,
  wrap(async (_req, res) => {
    const rows = await prisma.metric.findMany({ orderBy: { at: 'desc' }, take: 100 });
    res.json({ metrics: rows });
  }),
);

api.post(
  '/admin/test-sms',
  requireAdmin,
  wrap(async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(422).json({ error: 'number required' });
    const out = await sendSms(number, 'AgapAI: test message from the admin dashboard.');
    res.json(out);
  }),
);
