import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './db.js';
import { SqliteStore } from './session-store.js';
import { loadUser, requireCsrf } from './middleware/auth.js';
import { seed } from './seed.js';
import { router as authRouter } from './routes/auth.js';
import { router as analyzeRouter } from './routes/analyze.js';
import { router as historyRouter } from './routes/history.js';
import { router as adminRouter } from './routes/admin.js';
import { router as publicRouter } from './routes/public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

seed();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');

// Google Analytics needs three separate holes in the policy and fails silently
// without any one of them: the tag script itself, the endpoints it beacons to,
// and the tracking pixel it falls back to. Listed here rather than widened to
// a blanket 'https:' so the policy still says exactly who is trusted.
const GA_SCRIPT  = ['https://www.googletagmanager.com'];
const GA_CONNECT = ['https://www.google-analytics.com', 'https://analytics.google.com',
                    'https://*.analytics.google.com', 'https://*.googletagmanager.com',
                    'https://*.google-analytics.com'];
const GA_IMG     = ['https://www.google-analytics.com', 'https://*.google-analytics.com',
                    'https://www.googletagmanager.com'];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...GA_SCRIPT],      // Fonts are served from this origin now, so Google's hosts are gone
      // from the policy rather than left as entries nothing uses.
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', ...GA_IMG],
      connectSrc: ["'self'", ...GA_CONNECT],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.use(session({
  name: 'ethiclens.sid',
  store: new SqliteStore(),
  secret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIE === '1',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

app.use(loadUser);
app.use('/api', requireCsrf);

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use('/api/auth', authRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/history', historyRouter);
app.use('/api/admin', adminRouter);

// ---- Public, indexable pages (server-rendered) ----
// Mounted before the API 404, because /api/guide lives among these too
app.use('/', publicRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API یافت نشد.' }));

// ---- Static files and page routes ----
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

const PAGES = {
  '/': 'index.html',
  '/login': 'pages/login.html',
  '/app': 'pages/app.html',
  '/dashboard': 'pages/dashboard.html',
  '/history': 'pages/history.html',
  '/analysis': 'pages/analysis.html',
  '/settings': 'pages/settings.html',
  '/admin': 'pages/admin.html',
  '/guide': 'pages/guide.html',
  '/about': 'pages/about.html',
  '/verify': 'pages/verify.html'
};
for (const [route, file] of Object.entries(PAGES)) {
  app.get(route, (_req, res) => res.sendFile(path.join(PUBLIC, file)));
}

app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC, 'pages/404.html')));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'خطای داخلی سرور.' });
});

const server = app.listen(PORT, () => {
  console.log(`\n  ✅ Ethic Lens running on http://localhost:${PORT}  (${process.env.NODE_ENV || 'development'})\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[${sig}] shutting down…`);
    server.close(() => { try { db.close(); } catch {} process.exit(0); });
    setTimeout(() => process.exit(1), 8000).unref();
  });
}
