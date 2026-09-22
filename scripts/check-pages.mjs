/**
 * Syntax check for the pages' inline scripts and the client modules.
 *
 * A page whose <script type="module"> has a syntax error is still served
 * with a 200 and looks healthy — but none of its buttons work. The smoke
 * test does not catch that; this script does.
 *
 *   node scripts/check-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ethiclens-check-'));
let pass = 0, fail = 0;

function check(label, code) {
  const file = path.join(tmp, 'chunk.mjs');
  fs.writeFileSync(file, code, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (e) {
    const msg = (e.stderr?.toString() || e.message).split('\n')
      .filter(l => l.trim() && !l.includes(tmp) && !l.startsWith('    at'))
      .slice(0, 4).join('\n      ');
    console.log(`  ✗ ${label}\n      ${msg}`);
    fail++;
  }
}

function assert(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? '  → ' + extra : ''}`); }
}

/* ---- Client modules ---- */
console.log('\n── ماژول‌های /js ──');
for (const f of fs.readdirSync(path.join(PUBLIC, 'js')).filter(f => f.endsWith('.js')).sort()) {
  check(`js/${f}`, fs.readFileSync(path.join(PUBLIC, 'js', f), 'utf8'));
}
check('sw.js', fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8'));

/* ---- Inline page scripts ---- */
console.log('\n── اسکریپت درون‌خطی صفحه‌ها ──');
const pages = [
  path.join(PUBLIC, 'index.html'),
  ...fs.readdirSync(path.join(PUBLIC, 'pages'))
      .filter(f => f.endsWith('.html'))
      .sort()
      .map(f => path.join(PUBLIC, 'pages', f))
];

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  const rel = path.relative(PUBLIC, p).replace(/\\/g, '/');
  let found = 0;

  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc=/.test(attrs)) continue;          // external script
    if (!body.trim()) continue;
    found++;
    const isModule = /type\s*=\s*["']module["']/.test(attrs);
    // A non-module script must parse too
    check(`${rel}${found > 1 ? ` (#${found})` : ''}${isModule ? '' : ' [classic]'}`, body);
  }

  if (!found) console.log(`  · ${rel} — بدون اسکریپت درون‌خطی`);
}

/* ---- Duplicate identifiers in imports ---- */
console.log('\n── تکرار در فهرست import ──');
let dupes = 0;
for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  const rel = path.relative(PUBLIC, p).replace(/\\/g, '/');
  for (const m of html.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) {
        console.log(`  ✗ ${rel} — شناسه تکراری در import: ${n}`);
        dupes++; fail++;
      }
      seen.add(n);
    }
  }
}
if (!dupes) { console.log('  ✓ هیچ شناسه تکراری‌ای نیست'); pass++; }

/* ---- Service worker contract ----
 * A worker that intercepts /api ends the SSE analysis stream. One that
 * caches HTML can hand person B person A's logged-in screen. The archived
 * mobile prototype does both; public/sw.js must not. */
console.log('\n── قرارداد سرویس‌ورکر ──');
const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
assert('SW هرگز /api را قطع نمی‌کند',
  /if\s*\(\s*url\.pathname\.startsWith\(['"]\/api\/['"]\)\s*\)\s*return;/.test(sw)
  && !/startsWith\(['"]\/api\/['"]\)\s*\)\s*\{/.test(sw));
assert('SW پاسخ HTML را ذخیره نمی‌کند',
  /includes\(['"]text\/html['"]\)\)\s*return;/.test(sw));
assert('SW ناوبری را اول از شبکه می‌گیرد',
  /request\.mode === ['"]navigate['"]/.test(sw)
  && /fetch\(request\)\.catch/.test(sw));
const offlineJs = fs.readFileSync(path.join(ROOT, 'client/src/lib/offline.js'), 'utf8');
assert('کش آفلاین در localStorage است نه SW',
  /localStorage/.test(offlineJs)
  && !/caches\.(open|match)/.test(offlineJs));

/* ---- One analysis contract ---- */
console.log('\n── قرارداد تحلیل ──');
const { SECTION_KEYS, MATRIX_COLUMNS, STAGE_SCHOOLS, STAGES } =
  await import(pathToFileURL(path.join(ROOT, 'server/services/schools.js')).href);
const { parseMatrix } = await import(pathToFileURL(path.join(ROOT, 'server/services/matrix.js')).href);

assert('SECTION_KEYS بیست‌وشش بلوک است', SECTION_KEYS.length === 26, `n=${SECTION_KEYS.length}`);
assert('MATRIX_COLUMNS هشت لنز است', MATRIX_COLUMNS.length === 8);
assert('STAGE_SCHOOLS از STAGES مشتق شده',
  STAGES.every(s => JSON.stringify(STAGE_SCHOOLS[s.key]) === JSON.stringify(s.schools)));

const sample = parseMatrix([
  '| گزینه | کرامت | عدالت |',
  '|---|---|---|',
  '| الف | ۲ | -1 |',
  '| ب | 0 | −2 |'
].join('\n'));
assert('parseMatrix رقم فارسی و منها را می‌خواند',
  sample.length === 2
  && sample[0].scores[0] === 2
  && sample[1].scores[1] === -2,
  JSON.stringify(sample));

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${'═'.repeat(46)}`);
console.log(`  سالم: ${pass}   خراب: ${fail}`);
console.log(`${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
