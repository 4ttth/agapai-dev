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

/** Express middleware — attaches req.auth ({id, role}) or 401s. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const data = verifyToken(header.replace(/^Bearer /, ''));
  if (!data) return res.status(401).json({ error: 'Unauthorized' });
  req.auth = data;
  next();
}

export function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Bad admin key' });
  next();
}
