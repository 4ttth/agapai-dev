import { Router } from 'express';

import { prisma } from './db.js';
import { aiAssistant, aiCredits, everifyQrCheck, sendSms, serviceHealth, ssoExchange } from './egov.js';
import { askGemini, geminiEnabled } from './gemini.js';
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
  mobile: u.mobile,
  bloodType: u.bloodType,
  allergies: JSON.parse(u.allergies || '[]'),
  conditions: JSON.parse(u.conditions || '[]'),
  emergencyName: u.emergencyName,
  emergencyPhone: u.emergencyPhone,
  prcLicense: u.prcLicense,
  verified: u.verified,
  everified: u.everified,
  createdAt: u.createdAt,
});

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
    // First time: hand back a short-lived signed ticket for registration.
    res.json({ registered: false, identity, ticket: issueTicket(identity) });
  }),
);

api.post(
  '/auth/register',
  wrap(async (req, res) => {
    const b = req.body;
    const role = ['PATIENT', 'DOCTOR', 'PHARMACIST'].includes(b.role) ? b.role : 'PATIENT';

    // Real path: identity fields come only from the server-issued eVerify ticket.
    let identity = null;
    if (b.ticket) {
      identity = readTicket(b.ticket);
      if (!identity) return res.status(401).json({ error: 'Identity ticket invalid or expired — scan your National ID again.' });
    } else if (!String(b.egovUniqid ?? '').startsWith('MOCK-')) {
      return res.status(422).json({ error: 'Registration requires an eVerify identity ticket.' });
    }

    const egovUniqid = identity?.uniqid ?? b.egovUniqid ?? null;
    const firstName = identity?.firstName ?? b.firstName;
    const lastName = identity?.lastName ?? b.lastName;
    if (!firstName || !lastName) return res.status(422).json({ error: 'Verified identity is incomplete.' });

    // Scoped to the role being registered: a pro account must not be handed
    // back to someone creating their Health ID (or vice versa).
    if (egovUniqid) {
      const existing = await findScoped(egovUniqid, role === 'PATIENT' ? 'PATIENT' : 'PRO');
      if (existing)
        return res.json({ user: publicUser(existing), token: issueToken(existing), existed: true });
    }
    const user = await prisma.user.create({
      data: {
        egovUniqid,
        role,
        firstName,
        lastName,
        middleName: identity?.middleName ?? b.middleName ?? null,
        suffix: identity?.suffix ?? b.suffix ?? null,
        birthDate: identity?.birthDate ?? b.birthDate ?? null,
        mobile: b.mobile ?? identity?.mobile ?? null,
        bloodType: b.bloodType ?? identity?.bloodType ?? null,
        allergies: JSON.stringify(b.allergies || []),
        conditions: JSON.stringify(b.conditions || []),
        emergencyName: b.emergencyName || null,
        emergencyPhone: b.emergencyPhone || null,
        verified: role === 'PATIENT',
        everified: Boolean(identity),
      },
    });
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
    const data = {};
    for (const k of [
      'firstName',
      'lastName',
      'middleName',
      'suffix',
      'birthDate',
      'mobile',
      'bloodType',
      'emergencyName',
      'emergencyPhone',
    ])
      if (b[k] !== undefined) data[k] = b[k];
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

// ---------- eGov AI ----------

api.post(
  '/ai/assistant',
  requireAuth,
  wrap(async (req, res) => {
    const { prompt, firstName } = req.body;
    if (!prompt) return res.status(422).json({ error: 'prompt required' });

    // 1) Primary engine: Gemini (handles health questions properly).
    if (geminiEnabled()) {
      try {
        const reply = await askGemini(prompt, firstName);
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
    res.json({ consultation });
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
    if (consultationId) {
      await prisma.consultation
        .update({ where: { id: consultationId }, data: { dispensedAt: new Date() } })
        .catch(() => {});
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
    res.json({ medications: list.map((m) => ({ ...m, times: JSON.parse(m.times || '[]') })) });
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
    res.json({
      counts: { patients, doctors, pharmacists, pending, consultations, sms },
      traffic: { last24h: reqs24h, avgMs: Math.round(avg._avg.ms || 0) },
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
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ users: users.map(publicUser) });
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
