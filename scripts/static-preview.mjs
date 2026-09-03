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

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'پیش‌نمایش ایستا — API در دسترس نیست.' }));
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
