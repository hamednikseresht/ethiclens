/**
 * Serve public/ with nothing but Node built-ins.
 *
 * The real server needs better-sqlite3, which has no prebuilt binary and will
 * not compile without a toolchain. That makes the app unrunnable on a machine
 * missing one — and design work cannot be done blind.
 *
 * This serves the static layer only: pages, CSS, JS, fonts. Anything hitting
 * /api/ gets a 503 with a JSON body, so a page that fetches its data will show
 * its error state rather than hanging. That is enough to judge layout,
 * spacing, colour and typography, which is what a redesign needs to see.
 *
 *   node scripts/static-preview.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.webmanifest': 'application/manifest+json'
};

// Same route table as server/index.js, so the URLs match the real app.
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

/**
 * Canned API responses.
 *
 * Enough for a signed-in page to render its own shell and chrome. The point
 * is to see layout and typography, so the data is plausible rather than
 * complete — anything not listed still returns 503 and the page shows its
 * error state, which is itself worth looking at.
 */
const FIXTURES = {
  '/api/auth/me': {
    user: {
      id: 1, email: 'hamed@ethiclens.ir', name: 'حامد نیک‌سرشت',
      role: 'admin', tier: 'premium', status: 'active',
      emailVerified: 1, createdAt: '2026-01-11 09:00:00'
    },
    csrf: 'preview-csrf-token',
    settings: { site_title: 'دیدگاه اخلاق' },
    allowance: { tierLabel: 'گروه ویژه', used: 12, limit: 40 }
  },

  '/api/analyze/quota': {
    tier: { key: 'premium', label: 'ویژه' },
    daily:  { limit: 40, used: 12, remaining: 28 },
    tokens: { limit: 2000000, used: 431200, remaining: 1568800, percent: 22 }
  },

  '/api/analyze/meta': {
    defaultModel: 'openai:gpt-5.4-nano',
    models: [
      { ref: 'openai:gpt-5.4-nano', label: 'GPT-5.4 nano', note: 'پیشنهادی — ارزان و کامل', provider: 'OpenAI' },
      { ref: 'openai:gpt-4.1-mini', label: 'GPT-4.1 mini', note: 'کم‌مصرف‌تر، کمی کندتر',  provider: 'OpenAI' },
      { ref: 'deepseek:deepseek-v4-flash', label: 'DeepSeek v4 Flash', note: 'استدلالی', provider: 'DeepSeek' }
    ],
    providers: {}, schools: [], gates: []
  }
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const canned = FIXTURES[pathname];
    res.writeHead(canned ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(canned ?? { error: 'پیش‌نمایش ایستا — این مسیر داده نمونه ندارد.' }));
  }

  const rel = PAGES[pathname] || pathname.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);

  // Never serve outside public/
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<meta charset="utf-8"><p style="font:14px system-ui">یافت نشد: ${pathname}</p>`);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`\n  static preview on http://localhost:${PORT}  (public/ only, no API)\n`);
});
