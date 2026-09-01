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
import { fileURLToPath } from 'node:url';

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

/* ---- Client modules ---- */
console.log('\n── ماژول‌های /js ──');
for (const f of fs.readdirSync(path.join(PUBLIC, 'js')).filter(f => f.endsWith('.js')).sort()) {
  check(`js/${f}`, fs.readFileSync(path.join(PUBLIC, 'js', f), 'utf8'));
}

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

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${'═'.repeat(46)}`);
console.log(`  سالم: ${pass}   خراب: ${fail}`);
console.log(`${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
