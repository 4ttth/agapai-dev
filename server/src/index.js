import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { startCron } from './cron.js';
import { prisma } from './db.js';
import { api } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '30mb' }));

// Request metrics (fire-and-forget) for the admin dashboard.
app.use((req, res, next) => {
  const started = Date.now();
  const path = req.path; // capture before the router strips the mount prefix
  res.on('finish', () => {
    if (!path.startsWith('/api') || path.startsWith('/api/admin')) return;
    prisma.metric
      .create({
        data: { route: path, method: req.method, status: res.statusCode, ms: Date.now() - started },
      })
      .catch(() => {});
  });
  next();
});

app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('/', (_req, res) => res.json({ app: 'AgapAI server', ok: true }));

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`AgapAI server listening on :${port}`);
  startCron();
});
