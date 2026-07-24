import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { startCron } from './cron.js';
import { prisma } from './db.js';
import { attachFollowUpRelay } from './followup.js';
import { attachLiveRelay } from './live.js';
import { api } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '30mb' }));

// Headers that carry secrets — redact their values before storing.
const REDACTED_HEADERS = new Set([
  'authorization',
  'x-admin-key',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

/** Sanitize a headers object: redact sensitive keys, drop noise. */
function sanitizeHeaders(raw = {}) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase();
    if (key === 'host' || key === 'content-length' || key === 'accept-encoding') continue;
    out[key] = REDACTED_HEADERS.has(key) ? '[REDACTED]' : v;
  }
  return out;
}

/** Truncate a JSON string to maxBytes UTF-8 bytes. */
function truncate(str, maxBytes = 10240) {
  if (!str || str.length <= maxBytes) return str;
  return str.slice(0, maxBytes) + '…[truncated]';
}

/**
 * Intercept res.json() so we can capture the response body before it's sent.
 * We only capture for /api routes; the original method is always called.
 */
function captureResJson(res) {
  const original = res.json.bind(res);
  let captured = '{}';
  res.json = (body) => {
    try {
      captured = truncate(JSON.stringify(body));
    } catch {
      captured = '{}';
    }
    return original(body);
  };
  return () => captured;
}

// Request metrics + verbose request log (fire-and-forget) for the admin dashboard.
app.use((req, res, next) => {
  const started = Date.now();
  const reqPath = req.path; // capture before the router strips the mount prefix
  const fullPath = req.originalUrl;

  // Only instrument /api routes (skip static files, etc.)
  if (!reqPath.startsWith('/api')) return next();

  const getResBody = captureResJson(res);

  res.on('finish', () => {
    const ms = Date.now() - started;
    const status = res.statusCode;

    // Lightweight metric (existing — skip admin routes to avoid noise)
    if (!reqPath.startsWith('/api/admin')) {
      prisma.metric
        .create({ data: { route: reqPath, method: req.method, status, ms } })
        .catch(() => {});
    }

    // Verbose request log — capture everything, stored fire-and-forget.
    try {
      const reqHeaders = truncate(JSON.stringify(sanitizeHeaders(req.headers)));
      const reqBody = truncate(JSON.stringify(req.body ?? {}));
      const resBody = getResBody();
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null);

      prisma.requestLog
        .create({
          data: {
            method: req.method,
            route: reqPath,
            fullPath,
            status,
            ms,
            reqHeaders: reqHeaders ?? '{}',
            reqBody: reqBody ?? '{}',
            resBody: resBody ?? '{}',
            ip: typeof ip === 'string' ? ip.split(',')[0].trim() : null,
          },
        })
        .catch(() => {});
    } catch {
      // Never let logging crash the server.
    }
  });

  next();
});

app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('/', (_req, res) => res.json({ app: 'AgapAI server', ok: true }));

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`AgapAI server listening on :${port}`);
  startCron();
});
attachLiveRelay(server);
attachFollowUpRelay(server);
