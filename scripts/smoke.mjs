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
  ['/css/result.css', '.school']
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
check('هفت مکتب تعریف شده', meta.data.schools?.length === 7);
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
check('کلید API در پاسخ ماسک می‌شود', !String(aset.data.nvidia_api_key).startsWith('nvapi-'), String(aset.data.nvidia_api_key));

const prompts = await req('/api/admin/prompts');
check('GET /api/admin/prompts', prompts.status === 200 && prompts.data.items.length >= 1);
check('متن کارخانه در دسترس است', String(prompts.data.factoryDefault).includes('@@reframe@@'));

const amodels = await req('/api/admin/models');
check('GET /api/admin/models', amodels.status === 200 && amodels.data.length >= 1);

const addModel = await req('/api/admin/models', { method: 'POST', csrf, body: { model_id: 'test/smoke-model', label: 'مدل آزمایشی' } });
check('افزودن مدل', addModel.status === 200);
const models2 = await req('/api/admin/models');
const added = models2.data.find(m => m.model_id === 'test/smoke-model');
check('مدل تازه در فهرست هست', !!added);
if (added) {
  const del = await req(`/api/admin/models/${added.id}`, { method: 'DELETE', csrf });
  check('حذف مدل', del.status === 200);
}

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

console.log(`\n${'═'.repeat(46)}`);
console.log(`  موفق: ${pass}   ناموفق: ${fail}`);
console.log(`${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
