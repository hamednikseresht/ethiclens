/**
 * آزمون دود (smoke test) — بررسی سرتاسری مسیرهای API بدون نیاز به کلید انویدیا.
 * اجرا:  node scripts/smoke.mjs
 */
const BASE = process.env.BASE || 'http://localhost:3000';

let pass = 0, fail = 0;
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(path, { method = 'GET', body, csrf } = {}) {
  const headers = { 'Cookie': cookieHeader() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['x-csrf-token'] = csrf;

  const res = await fetch(BASE + path, {
    method, headers, redirect: 'manual',
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
}

console.log('\n── صفحات ──');
for (const [path, needle] of [
  ['/', 'اتیکا'],
  ['/login', 'ورود'],
  ['/guide', 'دانشنامه'],
  ['/css/app.css', '--bg-body'],
  ['/js/core.js', 'export'],
  ['/js/result.js', 'buildSkeleton'],
  ['/css/result.css', '.school'],
  ['/css/motion.css', 'prefers-reduced-motion'],
  ['/js/motion.js', 'revealOnScroll']
]) {
  const r = await req(path);
  check(`${path} → ۲۰۰ و محتوا درست`, r.status === 200 && String(r.data).includes(needle), `status=${r.status}`);
}

const nf = await req('/this-does-not-exist');
check('مسیر ناموجود → ۴۰۴', nf.status === 404, `status=${nf.status}`);

console.log('\n── احراز هویت ──');
let me = await req('/api/auth/me');
check('GET /api/auth/me بدون ورود', me.status === 200 && me.data.user === null);
let csrf = me.data.csrf;
check('توکن CSRF صادر شد', !!csrf);

const noCsrf = await req('/api/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } });
check('POST بدون توکن CSRF رد می‌شود', noCsrf.status === 403, `status=${noCsrf.status}`);

const email = `test${Date.now()}@example.com`;
const reg = await req('/api/auth/register', { method: 'POST', csrf, body: { name: 'کاربر آزمایشی', email, password: 'Test12345!' } });
check('ثبت‌نام موفق', reg.status === 200 && reg.data.user?.email === email, JSON.stringify(reg.data));
csrf = reg.data.csrf || csrf;

const dupe = await req('/api/auth/register', { method: 'POST', csrf, body: { name: 'دوباره', email, password: 'Test12345!' } });
check('ایمیل تکراری رد می‌شود', dupe.status === 409, `status=${dupe.status}`);

const weak = await req('/api/auth/register', { method: 'POST', csrf, body: { name: 'ض', email: 'bad', password: '123' } });
check('اعتبارسنجی ورودی ثبت‌نام', weak.status === 400);

me = await req('/api/auth/me');
check('نشست پس از ثبت‌نام برقرار است', me.data.user?.email === email);

console.log('\n── تحلیل ──');
const meta = await req('/api/analyze/meta');
check('GET /api/analyze/meta', meta.status === 200 && meta.data.models?.length > 0, `models=${meta.data.models?.length}`);
check('هشت مکتب تعریف شده', meta.data.schools?.length === 8, 'schools=' + meta.data.schools?.length);
check('منظر خیر مشترک هست', (meta.data.schools || []).some(s => s.key === 'commongood'));
check('پنج دروازه تعریف شده', meta.data.gates?.length === 5);

const quota = await req('/api/analyze/quota');
check('GET /api/analyze/quota', quota.status === 200 && typeof quota.data.remaining === 'number');

const short = await req('/api/analyze/stream', { method: 'POST', csrf, body: { dilemma: 'کوتاه' } });
check('متن کوتاه رد می‌شود', short.status === 400, `status=${short.status}`);

console.log('\n── تاریخچه ──');
const hist = await req('/api/history');
check('GET /api/history', hist.status === 200 && Array.isArray(hist.data.items));
const stats = await req('/api/history/stats');
check('GET /api/history/stats', stats.status === 200 && 'total' in stats.data);
const missing = await req('/api/history/999999');
check('تحلیل ناموجود → ۴۰۴', missing.status === 404);

console.log('\n── کنترل دسترسی ──');
const adminBlocked = await req('/api/admin/overview');
check('کاربر عادی به پنل مدیریت دسترسی ندارد', adminBlocked.status === 403, `status=${adminBlocked.status}`);

await req('/api/auth/logout', { method: 'POST', csrf });
const afterLogout = await req('/api/history');
check('پس از خروج، API محافظت‌شده ۴۰۱ می‌دهد', afterLogout.status === 401, `status=${afterLogout.status}`);

console.log('\n── مدیر ──');
me = await req('/api/auth/me');
csrf = me.data.csrf;
const adminLogin = await req('/api/auth/login', {
  method: 'POST', csrf,
  body: { email: process.env.ADMIN_EMAIL || 'admin@example.com', password: process.env.ADMIN_PASSWORD || 'ChangeMe123!' }
});
check('ورود مدیر', adminLogin.status === 200 && adminLogin.data.user?.role === 'admin', JSON.stringify(adminLogin.data).slice(0, 120));
csrf = adminLogin.data.csrf || csrf;

const ov = await req('/api/admin/overview');
check('GET /api/admin/overview', ov.status === 200 && ov.data.users?.total >= 1);

const aset = await req('/api/admin/settings');
check('GET /api/admin/settings', aset.status === 200 && 'default_model' in aset.data);
const settingsBlob = JSON.stringify(aset.data);
check('هیچ کلید API در پاسخ تنظیمات نیست',
  !/nvapi-|sk-[A-Za-z0-9]{16}/.test(settingsBlob),
  settingsBlob.slice(0, 160));

console.log('\n── ارائه‌دهندگان ──');
const provs = await req('/api/admin/providers');
check('GET /api/admin/providers', provs.status === 200 && provs.data.items.length >= 1);
check('پیش‌تنظیم‌ها ارائه شده', (provs.data.presets || []).some(p => p.key === 'openai'));
const provBlob = JSON.stringify(provs.data.items);
check('کلیدهای ارائه‌دهندگان ماسک شده‌اند',
  !/nvapi-|sk-[A-Za-z0-9]{16}/.test(provBlob), provBlob.slice(0, 160));

const newProv = await req('/api/admin/providers', {
  method: 'POST', csrf,
  body: { key: 'smoketest', label: 'سرویس آزمایشی', base_url: 'https://example.invalid/v1', api_key: 'test-key' }
});
check('افزودن ارائه‌دهنده', newProv.status === 200, JSON.stringify(newProv.data));
const provId = newProv.data?.id;

const badUrl = await req('/api/admin/providers', {
  method: 'POST', csrf, body: { key: 'badurl', label: 'x', base_url: 'not-a-url' }
});
check('آدرس پایه نامعتبر رد می‌شود', badUrl.status === 400);

if (provId) {
  const addM = await req('/api/admin/models', {
    method: 'POST', csrf,
    body: { provider_id: provId, model_id: 'test/smoke-model', label: 'مدل آزمایشی' }
  });
  check('افزودن مدل به ارائه‌دهنده', addM.status === 200 && addM.data.added === 1, JSON.stringify(addM.data));

  const dupe2 = await req('/api/admin/models', {
    method: 'POST', csrf,
    body: { provider_id: provId, model_id: 'test/smoke-model', label: 'تکراری' }
  });
  check('مدل تکراری دوباره اضافه نمی‌شود', dupe2.status === 200 && dupe2.data.added === 0);

  const bulk = await req('/api/admin/models', {
    method: 'POST', csrf,
    body: { provider_id: provId, models: [{ model_id: 'test/a' }, { model_id: 'test/b' }] }
  });
  check('افزودن دسته‌ای مدل', bulk.status === 200 && bulk.data.added === 2, JSON.stringify(bulk.data));

  const delBlocked = await req(`/api/admin/providers/${provId}`, { method: 'DELETE', csrf });
  check('حذف ارائه‌دهنده دارای مدل بدون force رد می‌شود', delBlocked.status === 400 && delBlocked.data.needsForce);

  const delForced = await req(`/api/admin/providers/${provId}?force=1`, { method: 'DELETE', csrf });
  check('حذف با force انجام می‌شود', delForced.status === 200);

  const after = await req('/api/admin/models');
  check('مدل‌های ارائه‌دهنده حذف‌شده هم رفتند',
    !after.data.some(m => String(m.model_id).startsWith('test/')));
}

const prompts = await req('/api/admin/prompts');
check('GET /api/admin/prompts', prompts.status === 200 && prompts.data.items.length >= 1);
check('متن کارخانه در دسترس است', String(prompts.data.factoryDefault).includes('@@reframe@@'));

const amodels = await req('/api/admin/models');
check('GET /api/admin/models', amodels.status === 200 && amodels.data.length >= 1);

const users = await req('/api/admin/users');
check('GET /api/admin/users', users.status === 200 && users.data.items.length >= 1);
const audit = await req('/api/admin/audit');
check('GET /api/admin/audit', audit.status === 200 && audit.data.items.length >= 1);

const selfDemote = await req(`/api/admin/users/${adminLogin.data.user.id}`, { method: 'PUT', csrf, body: { role: 'user' } });
check('مدیر نمی‌تواند خودش را تنزل دهد', selfDemote.status === 400, `status=${selfDemote.status}`);

const badSetting = await req('/api/admin/settings', { method: 'POST', csrf, body: { evil_key: 'x', temperature: '0.7' } });
check('تنظیمات غیرمجاز فیلتر می‌شوند',
  badSetting.status === 200 && badSetting.data.changed.includes('temperature') && !badSetting.data.changed.includes('evil_key'),
  JSON.stringify(badSetting.data));

/* ---------------- بازنگری (فاز پنجم) ---------------- */
console.log('\n── دفترچه بازنگری ──');
{
  const mine = await req('/api/history?perPage=5');
  const target = mine.data.items?.find(i => i.status === 'done');
  if (!target) {
    console.log('  (تحلیل کاملی برای آزمون بازنگری نبود — رد شد)');
  } else {
    const before = await req(`/api/history/${target.id}`);
    const original = { decision: before.data.decision, reflection: before.data.reflection };

    const save = await req(`/api/history/${target.id}/reflection`, {
      method: 'POST', csrf,
      body: { decision: 'گزینه آزمایشی', reflection: 'متن آزمایشی بازنگری برای آزمون خودکار.' }
    });
    check('ثبت بازنگری', save.status === 200 && !!save.data.reflected_at, JSON.stringify(save.data));

    const after = await req(`/api/history/${target.id}`);
    check('بازنگری در تحلیل ذخیره شد', after.data.decision === 'گزینه آزمایشی');

    const filtered = await req('/api/history?reflected=1');
    check('فیلتر بازنگری‌شده‌ها کار می‌کند',
      filtered.data.items.some(i => i.id === target.id));

    const md = await req(`/api/history/${target.id}/export`);
    check('بازنگری در خروجی Markdown هست', String(md.data).includes('## بازنگری'));

    const cleared = await req(`/api/history/${target.id}/reflection`, {
      method: 'POST', csrf, body: { decision: '', reflection: '' }
    });
    check('پاک‌کردن بازنگری', cleared.status === 200 && cleared.data.cleared === true);

    // بازگرداندن مقدار اولیه تا داده کاربر دست‌نخورده بماند
    if (original.decision || original.reflection) {
      await req(`/api/history/${target.id}/reflection`, { method: 'POST', csrf, body: original });
    }
  }

  const foreign = await req('/api/history/999999/reflection', {
    method: 'POST', csrf, body: { decision: 'x' }
  });
  check('بازنگری روی تحلیل ناموجود → ۴۰۴', foreign.status === 404);
}


console.log(`\n${'═'.repeat(46)}`);
console.log(`  موفق: ${pass}   ناموفق: ${fail}`);
console.log(`${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
