import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import crypto from 'node:crypto';
import fs from 'node:fs';
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
import { router as publicRouter, siteFooter } from './routes/public.js';
import { withNonce } from './services/seo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
// The built React app. Outside public/ so nothing in it has a second address.
const CLIENT = path.join(ROOT, 'client-dist');

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

/**
 * A per-request nonce for the inline scripts.
 *
 * The policy used to carry 'unsafe-inline' for scripts, which is the one
 * directive that undoes most of what a CSP is for: it permits any injected
 * <script> as readily as our own. It was there because the server-rendered
 * pages each boot from an inline module and because the structured-data
 * blocks are inline too.
 *
 * The application never needed it — its shell loads everything by src — so
 * the only cost of removing it is stamping a nonce onto the handful of inline
 * scripts the other half of the site emits. renderHtml() in the public router
 * does that to every response it sends.
 */
app.use((_req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (_req, res) => `'nonce-${res.locals.cspNonce}'`,
        ...GA_SCRIPT
      ],
      // Fonts are served from this origin now, so Google's hosts are gone
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
/**
 * How long each kind of file may be held.
 *
 * A single max-age for everything is wrong in both directions at once. The
 * shell carries the current bundle's filename, so caching it for an hour
 * means an hour of people running the previous deploy; the bundle filenames
 * carry a content hash, so revalidating them every hour wastes the hash
 * entirely. They need opposite answers.
 *
 * The service worker is the one that bites hardest: a stale copy keeps
 * serving its own cached assets and cannot be replaced by a deploy, so it is
 * never cached.
 */
function cacheHeaders(res, filePath) {
  const rel = path.relative(PUBLIC, filePath).replace(/\\/g, '/');

  // Names are stable but the content can be replaced by a deploy, so these
  // are cached for a while and revalidated rather than trusted outright.
  if (rel.startsWith('fonts/') || rel.startsWith('icons/')) {
    return res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  }

  if (rel === 'sw.js' || rel === 'manifest.webmanifest' || rel.endsWith('.html')) {
    return res.setHeader('Cache-Control', 'no-cache');
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
}

const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');

/**
 * Anything still bookmarked under /v2 — including an app installed before the
 * move, whose start_url was /v2/ — lands on the same path at the root.
 *
 * Before the static handler, because a previous build may still be sitting in
 * public/v2 on a server that has not been cleaned, and it would otherwise be
 * served instead of redirected.
 */
app.get(/^\/v2(\/.*)?$/, (req, res) => {
  const rest = req.originalUrl.slice('/v2'.length);
  // Into the app, not the root — /v2 was the application, and the root is the
  // homepage now. Sending it to / would land people on marketing copy when
  // they asked for the screen they had bookmarked.
  res.redirect(301, '/app' + (rest === '/' ? '' : rest));
});

/**
 * The bundle's hashed assets.
 *
 * Vite writes a content hash into every filename, so a given URL can never
 * mean a different file — a year, never revalidated. They are mounted from
 * client-dist rather than public/ so each one has exactly one address.
 */
app.use('/app/assets', express.static(path.join(CLIENT, 'assets'), {
  index: false,
  immutable: process.env.NODE_ENV === 'production',
  maxAge: process.env.NODE_ENV === 'production' ? '365d' : 0
}));

/**
 * Everything else that is a real file: fonts, icons, the stylesheets and
 * scripts the server-rendered pages still use, the manifest and the worker.
 *
 * index:false matters now — without it this would answer / with the old
 * public/index.html and the application would never be reached.
 */
app.use(express.static(PUBLIC, {
  index: false,
  extensions: ['html'],
  setHeaders: process.env.NODE_ENV === 'production'
    ? cacheHeaders
    : (res) => res.setHeader('Cache-Control', 'no-store')
}));

// Ships with the bundle, so it is not under public/ — but the worker asks for
// it by an absolute path, so it needs one here.
app.get('/app/offline.html', (_req, res) => {
  noCache(res);
  res.sendFile(path.join(CLIENT, 'offline.html'));
});

/**
 * Addresses that moved, kept working.
 *
 * Two rounds of renaming produced these: the app went to the root and back
 * out to /app, and the public pages went to single letters and back to names
 * that say what they are. Every one of them has been live at some point, so
 * every one of them redirects rather than 404s.
 */
const MOVED = {
  '/intro': '/',              // the landing page is the root again
  '/g': '/guide',             // single letters, briefly
  '/p': '/explore',
  // Screens the application owns, at the addresses the old product used.
  '/login': '/app/login',
  '/history': '/app/history',
  '/dashboard': '/app/dashboard',
  '/settings': '/app/settings',
  '/admin': '/app/admin',
  '/verify': '/app/verify'
};

for (const [from, to] of Object.entries(MOVED)) {
  app.get(from, (req, res) => res.redirect(301, to + (req.url.slice(from.length) || '')));
}

// Prefixes, where the rest of the path is carried across.
for (const [from, to] of [['/a', '/analysis'], ['/c', '/category']]) {
  app.get(new RegExp(`^\\${from}/(.+)`), (req, res) =>
    res.redirect(301, `${to}/${req.params[0]}`));
}

// Anything under the old admin or verify addresses, and the app's own
// sub-paths, follow their parent.
app.get(/^\/(admin|history|settings|dashboard)\/(.*)$/, (req, res) =>
  res.redirect(301, `/app/${req.params[0]}/${req.params[1]}`));

/**
 * Everything under /app is the application.
 *
 * The React app routes in the browser, so /app/history exists only once its
 * JavaScript is running — a reload or a shared link has to be answered with
 * the shell or it lands on the 404 page. That is the classic single-page-app
 * deployment bug and it only shows up after someone refreshes.
 *
 * One prefix rather than a list of routes. While the app owned the root, the
 * two had to be enumerated and kept in step — a route added to the router and
 * not to the list worked when clicked and 404'd when reloaded. Giving the app
 * a prefix of its own removes the coupling: anything the router adds is
 * already covered, and everything outside it still reaches a real 404.
 */
function isAppRoute(pathname) {
  // A missing bundle file must fail as a 404. Without this it reaches the
  // fallback and comes back as HTML, which the browser then refuses as a
  // script — a blank page whose only clue is a MIME-type error.
  if (pathname.startsWith('/app/assets/')) return false;
  return pathname === '/app' || pathname.startsWith('/app/');
}

app.get('*', (req, res, next) => {
  if (!isAppRoute(req.path)) return next();
  const shell = path.join(CLIENT, 'index.html');
  if (!fs.existsSync(shell)) return next();
  // sendFile does not run the static middleware's header hook, so the shell
  // would otherwise go out with no policy at all and be heuristically cached.
  noCache(res);
  res.sendFile(shell);
});

// Read rather than sendFile: this page boots from an inline script, which
// needs the request's nonce stamped into it or it will not run.
app.use((_req, res) => {
  const file = path.join(PUBLIC, 'pages/404.html');
  let html;
  try { html = fs.readFileSync(file, 'utf8'); }
  catch { return res.status(404).type('text/plain').send('صفحه پیدا نشد.'); }
  // Same footer as every other page outside the app. Someone who lands here
  // from a stale link has nowhere else to go otherwise: the top bar is built
  // by script and the two buttons point at the app and the homepage only.
  html = html.replace('</body>', `${siteFooter()}\n</body>`);
  noCache(res);
  res.status(404).type('html').send(withNonce(html, res.locals.cspNonce));
});

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
