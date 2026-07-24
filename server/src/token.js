import crypto from 'node:crypto';

const SECRET = process.env.TOKEN_SECRET || 'dev-secret';

/** Tiny HMAC-signed bearer token: base64(payload).signature */
export function issueToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

import { prisma } from './db.js';

/** Express middleware — attaches req.auth ({id, role}) and req.user or 401s. */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const data = verifyToken(header.replace(/^Bearer /, ''));
    if (!data) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: data.id } }).catch(() => null);
    if (!user) {
      return res.status(401).json({ error: 'You have been logged out or no account found for this ID' });
    }

    req.auth = data;
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'You have been logged out or no account found for this ID' });
  }
}

/**
 * Short-lived signed ticket carrying a server-verified eVerify identity, plus
 * the raw eVerify payload so registration can store the full PII record without
 * a second round-trip. `raw` is optional (mock SSO has none).
 */
export function issueTicket(identity, raw = null) {
  const payload = Buffer.from(
    JSON.stringify({ kind: 'identity', identity, raw, exp: Date.now() + 1000 * 60 * 15 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Returns { identity, raw } (or null). */
export function readTicket(ticket) {
  const data = verifyRaw(ticket);
  if (!data || data.kind !== 'identity' || data.exp < Date.now()) return null;
  return { identity: data.identity, raw: data.raw ?? null };
}

function verifyRaw(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Bad admin key' });
  next();
}
