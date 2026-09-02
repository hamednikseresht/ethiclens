/**
 * Test categories and the editorial publish form.
 *
 * Covers the split the feature exists for: an admin publishing gets category,
 * slug, SEO title, H1 and tags; an ordinary user publishing the same way gets
 * none of them, and cannot set them by posting the fields directly.
 *
 * Run:  node scripts/category-flow.mjs
 */
// Loaded before anything else: the session cookie is signed with
// SESSION_SECRET, and without .env this script would sign with the fallback
// while the server verifies with the real one — every request then looks like
// a fresh session and fails CSRF for reasons that point nowhere near the cause.
import 'dotenv/config';
import crypto from 'node:crypto';
import { db } from '../server/db.js';
import { readTags } from '../server/services/categories.js';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

function makeClient() {
  const jar = new Map();
  let csrf = null;
  return async function call(path, { method = 'GET', body } = {}) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual'
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let json = null;
    try { json = await res.json(); } catch {}
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
}

/**
 * Sign a user in by writing a session row directly.
 *
 * The alternative is posting a password, which the test would then have to
 * hold in plain text. This only works because the test runs against the same
 * database the server reads.
 */
function signIn(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + 3600_000;
  db.prepare('INSERT INTO sessions (sid,data,expires) VALUES (?,?,?)').run(
    sid,
    JSON.stringify({ cookie: { originalMaxAge: 3600000, httpOnly: true, path: '/' }, userId }),
    expires
  );
  const secret = process.env.SESSION_SECRET || 'insecure-dev-secret-change-me';
  const sig = crypto.createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  return { sid, cookie: `ethiclens.sid=${encodeURIComponent('s:' + sid + '.' + sig)}` };
}

function asUser(userId) {
  const { sid, cookie } = signIn(userId);
  let csrf = null;
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json', Cookie: cookie,
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch {}
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
  return { call, sid };
}

const stamp = Date.now();
const created = { cats: [], analyses: [], sids: [] };

/**
 * Clean up on the way out, however the script exits.
 *
 * An earlier version only cleaned up at the end, and when an assertion threw
 * partway it left a stub analysis behind — which the smoke test then picked
 * as "the newest finished analysis" and failed on, in a different file, for
 * reasons that looked nothing like the cause.
 */
function cleanup() {
  for (const id of created.analyses) db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
  for (const id of created.cats) db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  for (const sid of created.sids) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
}
process.on('exit', cleanup);
process.on('uncaughtException', e => { console.error('\n  ✗ خطای پیش‌بینی‌نشده:', e.message); process.exit(1); });
process.on('unhandledRejection', e => { console.error('\n  ✗ رد نشده:', e?.message || e); process.exit(1); });

console.log('══════════════════════════════════════════════');
console.log('  آزمون دسته‌بندی و فرم انتشار مدیر');
console.log('══════════════════════════════════════════════');

const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
const plainUser = db.prepare("SELECT id FROM users WHERE role<>'admin' AND status='active' ORDER BY id LIMIT 1").get();

if (!admin) { console.error('  هیچ مدیری نیست'); process.exit(1); }

const A = asUser(admin.id);
created.sids.push(A.sid);
await A.call('/api/auth/me');

/* ================= Category CRUD ================= */
section('مدیریت دسته‌بندی');

const mk = await A.call('/api/admin/categories', {
  method: 'POST',
  body: { title: 'اخلاق حرفه‌ای', slug: `work-ethics-${stamp}`, description: 'دوراهی‌های محیط کار' }
});
check('ساخت دسته‌بندی', mk.status === 200, JSON.stringify(mk.json).slice(0, 120));
const cat = mk.json?.item;
if (cat) created.cats.push(cat.id);

const dupe = await A.call('/api/admin/categories', {
  method: 'POST', body: { title: 'تکراری', slug: `work-ethics-${stamp}` }
});
check('آدرس تکراری رد می‌شود', dupe.status === 409, `status ${dupe.status}`);

const noSlug = await A.call('/api/admin/categories', {
  method: 'POST', body: { title: 'بدون آدرس', slug: 'فارسی' }
});
check('آدرس فارسی رد می‌شود', noSlug.status === 400, `status ${noSlug.status}`);

const list = await A.call('/api/admin/categories');
check('دسته‌بندی در فهرست هست', (list.json?.items || []).some(c => c.id === cat?.id));

/* ================= Admin publishing ================= */
section('انتشار توسط مدیر');

const adminAnalysis = db.prepare(`
  INSERT INTO analyses (user_id, title, dilemma, model, sections, status)
  VALUES (?,?,?,?,?, 'done')`).run(
  admin.id, `[آزمون] تحلیل مدیر ${stamp}`, 'یک دوراهی آزمایشی برای بررسی فرم انتشار مدیر.',
  'test:model', JSON.stringify({ reframe: 'بازخوانی آزمایشی', recommendation: 'پیشنهاد آزمایشی' })
);
const aid = Number(adminAnalysis.lastInsertRowid);
created.analyses.push(aid);

const detail = await A.call(`/api/history/${aid}`);
check('فهرست دسته‌بندی به مدیر داده می‌شود', Array.isArray(detail.json?.categories),
  typeof detail.json?.categories);

const pub = await A.call(`/api/history/${aid}/publish`, {
  method: 'POST',
  body: {
    publish: true,
    public_title: `عنوان عمومی ${stamp}`,
    public_summary: 'توضیح متای آزمایشی',
    category_id: cat?.id,
    slug: `admin-page-${stamp}`,
    seo_title: 'عنوان سئوی متفاوت',
    h1: 'تیتر اصلی متفاوت',
    tags: 'اخلاق کار، صداقت, تعارض منافع، صداقت'
  }
});
check('انتشار مدیر موفق', pub.status === 200, JSON.stringify(pub.json).slice(0, 140));

const stored = db.prepare('SELECT * FROM analyses WHERE id = ?').get(aid);
check('دسته‌بندی ثبت شد', stored.category_id === cat?.id, `${stored.category_id}`);
check('نشانی دلخواه پذیرفته شد', stored.slug === `admin-page-${stamp}`, stored.slug);
check('عنوان سئو ثبت شد', stored.seo_title === 'عنوان سئوی متفاوت', stored.seo_title);
check('تیتر H1 ثبت شد', stored.h1 === 'تیتر اصلی متفاوت', stored.h1);

const tags = readTags(stored.tags);
check('تگ‌ها با کامای فارسی و لاتین جدا شدند', tags.length === 3, JSON.stringify(tags));
check('تگ تکراری حذف شد', new Set(tags.map(t => t.toLowerCase())).size === tags.length, JSON.stringify(tags));

/* ================= The published page ================= */
section('صفحه منتشرشده');

const pageRes = await fetch(`${BASE}/a/${encodeURIComponent(stored.slug)}`);
const html = await pageRes.text();
check('صفحه سرو می‌شود', pageRes.status === 200, `status ${pageRes.status}`);
check('عنوان سئو در تگ title است', /<title>عنوان سئوی متفاوت<\/title>/.test(html));
check('تیتر H1 جدا از عنوان سئوست', /<h1>تیتر اصلی متفاوت<\/h1>/.test(html));
check('نشان دسته‌بندی نمایش داده می‌شود', html.includes('cat-badge') && html.includes('اخلاق حرفه‌ای'));
check('تگ‌ها روی صفحه‌اند', html.includes('pub-tags') && html.includes('تعارض منافع'));
check('دسته‌بندی در مسیر راهنما هست', /pub-crumbs[\s\S]{0,400}اخلاق حرفه‌ای/.test(html));
check('keywords از تگ‌ها ساخته شده', /"keywords":"[^"]*تعارض منافع/.test(html));

/* ================= Category listing ================= */
section('صفحه دسته‌بندی');

const catRes = await fetch(`${BASE}/c/${cat.slug}`);
const catHtml = await catRes.text();
check('صفحه دسته سرو می‌شود', catRes.status === 200, `status ${catRes.status}`);
check('عنوان دسته در H1 است', catHtml.includes('<h1>اخلاق حرفه‌ای</h1>'));
check('تحلیل منتشرشده فهرست شده', catHtml.includes(stored.slug));
check('CollectionPage اعلام شده', catHtml.includes('"@type":"CollectionPage"'));

const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
check('دسته در نقشه سایت آمده', sm.includes(`/c/${cat.slug}`));

const missing = await fetch(`${BASE}/c/does-not-exist-${stamp}`);
check('دسته ناموجود ۴۰۴ می‌دهد', missing.status === 404, `status ${missing.status}`);

/* ================= A normal user cannot set editorial fields ================= */
section('کاربر عادی فیلدهای مدیر را نمی‌گیرد');

if (plainUser) {
  const U = asUser(plainUser.id);
  created.sids.push(U.sid);
  await U.call('/api/auth/me');

  const ua = db.prepare(`
    INSERT INTO analyses (user_id, title, dilemma, model, sections, status)
    VALUES (?,?,?,?,?, 'done')`).run(
    plainUser.id, `[آزمون] تحلیل کاربر ${stamp}`, 'دوراهی آزمایشی کاربر عادی.',
    'test:model', JSON.stringify({ reframe: 'بازخوانی' }));
  const uid = Number(ua.lastInsertRowid);
  created.analyses.push(uid);

  const ud = await U.call(`/api/history/${uid}`);
  check('فهرست دسته‌بندی به کاربر عادی داده نمی‌شود', ud.json?.categories === undefined);

  const up = await U.call(`/api/history/${uid}/publish`, {
    method: 'POST',
    body: {
      publish: true,
      public_title: `عنوان کاربر ${stamp}`,
      category_id: cat?.id,
      slug: `user-tries-slug-${stamp}`,
      seo_title: 'کاربر نباید بتواند',
      h1: 'این هم نباید',
      tags: 'الف، ب'
    }
  });
  check('انتشار کاربر عادی موفق است', up.status === 200, `status ${up.status}`);

  const us = db.prepare('SELECT * FROM analyses WHERE id = ?').get(uid);
  check('دسته‌بندی از کاربر پذیرفته نشد', us.category_id === null, `${us.category_id}`);
  check('نشانی دلخواه از کاربر پذیرفته نشد', us.slug !== `user-tries-slug-${stamp}`, us.slug);
  check('عنوان سئو از کاربر پذیرفته نشد', !us.seo_title, us.seo_title);
  check('تگ از کاربر پذیرفته نشد', !us.tags, us.tags);
} else {
  console.log('  (کاربر عادی فعالی نیست — این بخش رد شد)');
}

/* Cleanup runs from the exit handler above, so a failure cannot skip it. */

console.log('\n══════════════════════════════════════════════');
console.log(`  موفق: ${pass}   ناموفق: ${fail}`);
console.log('══════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
