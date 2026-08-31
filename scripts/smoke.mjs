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


/**
 * کپچا را حل می‌کند.
 *
 * پاسخ به‌صورت چکیده در نشست ذخیره می‌شود، پس آزمون آن را از پایگاه داده
 * می‌خواند و در فضای کوچک اعداد ممکن جست‌وجو می‌کند. این فقط برای آزمون
 * محلی است؛ هیچ راه دور زدنی در خود برنامه اضافه نشده.
 */
const { db: _db } = await import('../server/db.js');
const _crypto = await import('node:crypto');

async function solveCaptcha() {
  await req('/api/auth/captcha');
  const sessions = _db.prepare('SELECT data FROM sessions').all()
    .map(r => { try { return JSON.parse(r.data); } catch { return null; } })
    .filter(x => x && x.captcha);
  const latest = sessions.sort((a, b) => (b.captcha.expires || 0) - (a.captcha.expires || 0))[0];
  if (!latest) return '';
  for (let n = -50; n <= 400; n++) {
    if (_crypto.createHash('sha256').update(String(n)).digest('hex') === latest.captcha.hash) return String(n);
  }
  return '';
}

console.log('\n── صفحات ──');
for (const [path, needle] of [
  ['/', 'اتیکا'],
  ['/login', 'ورود'],
  ['/guide', 'دانشنامه'],
  ['/about', 'علی مهبودی'],
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
const reg = await req('/api/auth/register', { method: 'POST', csrf,
  body: { firstName: 'کاربر', lastName: 'آزمایشی', email, password: 'Test12345!', captcha: await solveCaptcha() } });
check('ثبت‌نام موفق', reg.status === 200 && reg.data.user?.email === email, JSON.stringify(reg.data));
csrf = reg.data.csrf || csrf;

const dupe = await req('/api/auth/register', { method: 'POST', csrf,
  body: { email, password: 'Test12345!', captcha: await solveCaptcha() } });
check('ایمیل تکراری رد می‌شود', dupe.status === 409, `status=${dupe.status}`);

const weak = await req('/api/auth/register', { method: 'POST', csrf,
  body: { email: 'bad', password: '123', captcha: await solveCaptcha() } });
check('اعتبارسنجی ورودی ثبت‌نام', weak.status === 400);

me = await req('/api/auth/me');
check('نشست پس از ثبت‌نام برقرار است', me.data.user?.email === email);
check('کاربر تازه در وضعیت انتظار تأیید است', me.data.user?.status === 'pending', me.data.user?.status);

// کاربر تازه تا تأیید مدیر فعال نیست؛ برای بقیه آزمون‌ها فعالش می‌کنیم
_db.prepare("UPDATE users SET status = 'active' WHERE email = ?").run(email);

console.log('\n── تحلیل ──');
const meta = await req('/api/analyze/meta');
check('GET /api/analyze/meta', meta.status === 200 && meta.data.models?.length > 0, `models=${meta.data.models?.length}`);
check('هشت مکتب تعریف شده', meta.data.schools?.length === 8, 'schools=' + meta.data.schools?.length);
check('منظر خیر مشترک هست', (meta.data.schools || []).some(s => s.key === 'commongood'));
check('پنج دروازه تعریف شده', meta.data.gates?.length === 5);

const quota = await req('/api/analyze/quota');
check('GET /api/analyze/quota', quota.status === 200 && !!quota.data.tier, JSON.stringify(quota.data).slice(0, 120));
check('سهمیه روزانه گزارش می‌شود', typeof quota.data?.daily?.used === 'number');
check('مصرف توکن گزارش می‌شود', typeof quota.data?.tokens?.used === 'number');

const meNow = await req('/api/auth/me');
check('گروه کاربر در نشست هست', !!meNow.data.user?.tier, 'tier=' + meNow.data.user?.tier);
check('allowance در نشست هست', !!meNow.data.allowance?.tier);

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


/* ---------------- گروه‌های کاربری و سقف‌ها ---------------- */
console.log('\n── گروه‌های کاربری ──');
{
  const t = await req('/api/admin/tiers');
  check('GET /api/admin/tiers', t.status === 200 && t.data.items?.length >= 2, `tiers=${t.data.items?.length}`);
  check('گروه عادی و ویژه تعریف شده‌اند',
    ['basic', 'premium'].every(k => t.data.items.some(x => x.key === k)));
  check('شمار کاربران هر گروه می‌آید', t.data.items.every(x => typeof x.users === 'number'));

  const basic = t.data.items.find(x => x.key === 'basic');
  const originalQuota = basic.daily_quota;

  const up = await req(`/api/admin/tiers/${basic.id}`, {
    method: 'PUT', csrf, body: { daily_quota: 7, monthly_tokens: 123000 }
  });
  check('ویرایش سقف گروه', up.status === 200);

  const after = await req('/api/admin/tiers');
  const b2 = after.data.items.find(x => x.key === 'basic');
  check('سقف تازه گروه ذخیره شد', b2.daily_quota === 7 && b2.monthly_tokens === 123000,
    `${b2.daily_quota}/${b2.monthly_tokens}`);

  await req(`/api/admin/tiers/${basic.id}`, {
    method: 'PUT', csrf, body: { daily_quota: originalQuota, monthly_tokens: basic.monthly_tokens }
  });
}

console.log('\n── مصرف و سقف کاربران ──');
{
  const u = await req('/api/admin/users');
  check('گروه کاربران در فهرست هست', u.data.items.every(x => !!x.tier));
  check('مصرف توکن گزارش می‌شود',
    u.data.items.every(x => typeof x.totalTokens === 'number' && typeof x.monthTokens === 'number'));
  check('سقف مؤثر محاسبه می‌شود', u.data.items.every(x => typeof x.effectiveQuota === 'number'));
  check('فهرست گروه‌ها همراه پاسخ می‌آید', Array.isArray(u.data.tiers) && u.data.tiers.length >= 2);

  // کاربر آزمایشی که در بخش احراز هویت ساخته شد
  const target = u.data.items.find(x => x.email === email);
  if (!target) { console.log('  (کاربر آزمایشی پیدا نشد — رد شد)'); }
  else {
    check('کاربر تازه در گروه عادی است', target.tier === 'basic', target.tier);
    check('کاربر تازه استثنای فردی ندارد',
      target.quota_override === null && target.token_override === null);

    const setTier = await req(`/api/admin/users/${target.id}`, {
      method: 'PUT', csrf, body: { tier: 'premium', quota_override: '', token_override: 55000 }
    });
    check('تغییر گروه و سقف کاربر', setTier.status === 200);

    const after = await req('/api/admin/users');
    const t2 = after.data.items.find(x => x.id === target.id);
    check('گروه تازه ذخیره شد', t2.tier === 'premium', t2.tier);
    check('استثنای خالی یعنی ارث از گروه', t2.quota_override === null);
    check('استثنای توکن ذخیره شد', t2.token_override === 55000, String(t2.token_override));
    check('سقف مؤثر از گروه ویژه می‌آید', t2.effectiveQuota > 5, String(t2.effectiveQuota));

    const bad = await req(`/api/admin/users/${target.id}`, {
      method: 'PUT', csrf, body: { tier: 'superuser' }
    });
    const t3 = (await req('/api/admin/users')).data.items.find(x => x.id === target.id);
    check('گروه نامعتبر پذیرفته نمی‌شود', bad.status === 200 && t3.tier === 'premium', t3.tier);
  }
}

console.log('\n── دسترسی مدل بر اساس گروه ──');
{
  const models = await req('/api/admin/models');
  check('min_tier روی مدل‌ها هست', models.data.every(m => !!m.min_tier));

  const m = models.data.find(x => x.enabled);
  if (m) {
    const up = await req(`/api/admin/models/${m.id}`, { method: 'PUT', csrf, body: { min_tier: 'premium' } });
    check('محدودکردن مدل به گروه ویژه', up.status === 200);
    const back = (await req('/api/admin/models')).data.find(x => x.id === m.id);
    check('min_tier ذخیره شد', back.min_tier === 'premium', back.min_tier);
    await req(`/api/admin/models/${m.id}`, { method: 'PUT', csrf, body: { min_tier: m.min_tier } });
  }
}


/* ---------------- انتشار عمومی و SEO ---------------- */
// مقدار واقعی را نگه می‌داریم؛ site_url در پیوند ایمیل‌های تأیید استفاده می‌شود
// و جا ماندنِ مقدار آزمایشی، آن پیوندها را خراب می‌کند.
const SENTINEL_URL = 'https://smoke.test';
let realSiteUrl = '';
console.log('\n── انتشار عمومی و SEO ──');
{
  const captured = (await req('/api/admin/settings')).data.site_url || '';
  // اگر اجرای قبلی مقدار آزمایشی را جا گذاشته باشد، آن را برنمی‌گردانیم —
  // وگرنه آلودگی برای همیشه می‌ماند و پیوند ایمیل‌های تأیید خراب می‌شود.
  realSiteUrl = captured === SENTINEL_URL ? '' : captured;
  await req('/api/admin/settings', { method: 'POST', csrf, body: { site_url: SENTINEL_URL } });

  const mine = await req('/api/history?perPage=10');
  const target = mine.data.items?.find(i => i.status === 'done');

  if (!target) {
    console.log('  (تحلیل کاملی برای آزمون انتشار نبود — رد شد)');
  } else {
    const wasPublic = !!target.is_public;

    const pub = await req(`/api/history/${target.id}/publish`, {
      method: 'POST', csrf,
      body: { publish: true, public_title: 'عنوان آزمایشی انتشار', public_summary: 'خلاصه آزمایشی برای موتور جست‌وجو.' }
    });
    check('انتشار تحلیل', pub.status === 200 && !!pub.data.slug, JSON.stringify(pub.data).slice(0, 100));

    const page = await req(pub.data.url);
    const html = String(page.data || '');
    check('صفحه عمومی بدون ورود در دسترس است', page.status === 200);
    check('عنوان صفحه از عنوان عمومی می‌آید', /<title>عنوان آزمایشی انتشار/.test(html));
    check('توضیح متا درج شده', /<meta name="description" content="خلاصه آزمایشی/.test(html));
    check('نشانی canonical مطلق است', /<link rel="canonical" href="https:\/\/smoke\.test\/a\//.test(html));
    check('صفحه ایندکس‌شونده است', /content="index, follow/.test(html));
    check('OpenGraph از نوع article', /property="og:type" content="article"/.test(html));
    check('داده ساختاریافته Article', /"@type":"Article"/.test(html));
    check('داده ساختاریافته Breadcrumb', /"@type":"BreadcrumbList"/.test(html));
    check('محتوای تحلیل در HTML اولیه است', /class="stage-title"/.test(html));
    check('دقیقاً یک h1 دارد', (html.match(/<h1[ >]/g) || []).length === 1);

    const explore = await req('/explore');
    check('/explore کار می‌کند', explore.status === 200 && /pub-card-title/.test(String(explore.data)));
    check('/explore داده ItemList دارد', /"@type":"ItemList"/.test(String(explore.data)));

    const sm = await req('/sitemap.xml');
    check('نقشه سایت ساخته می‌شود', sm.status === 200 && /sitemaps\.org\/schemas\/sitemap/.test(String(sm.data)));
    check('تحلیل منتشرشده در نقشه سایت هست',
      String(sm.data).includes(encodeURIComponent(pub.data.slug)));

    const slug = pub.data.slug;
    const off = await req(`/api/history/${target.id}/publish`, { method: 'POST', csrf, body: { publish: false } });
    check('لغو انتشار', off.status === 200 && off.data.isPublic === false);

    const gone = await req(`/a/${encodeURIComponent(slug)}`);
    check('پس از لغو انتشار صفحه ۴۰۴ می‌شود', gone.status === 404, `status=${gone.status}`);

    const again = await req(`/api/history/${target.id}/publish`, { method: 'POST', csrf, body: { publish: true } });
    check('انتشار مجدد نشانی را عوض نمی‌کند', again.data.slug === slug);
    check('انتشار مجدد عنوان عمومی را پاک نمی‌کند',
      again.data.public_title === 'عنوان آزمایشی انتشار', String(again.data.public_title));
    check('انتشار مجدد خلاصه عمومی را پاک نمی‌کند',
      String(again.data.public_summary).startsWith('خلاصه آزمایشی'), String(again.data.public_summary).slice(0, 40));

    if (!wasPublic) {
      await req(`/api/history/${target.id}/publish`, { method: 'POST', csrf, body: { publish: false } });
    }
  }

  const rb = await req('/robots.txt');
  check('robots.txt سرو می‌شود', rb.status === 200 && /User-agent/.test(String(rb.data)));
  check('robots صفحه‌های خصوصی را می‌بندد',
    /Disallow: \/admin/.test(String(rb.data)) && /Disallow: \/api\//.test(String(rb.data)));
  check('robots نقشه سایت را معرفی می‌کند', /Sitemap: https:\/\/smoke\.test/.test(String(rb.data)));

  const missing = await req('/a/این-نشانی-وجود-ندارد');
  check('نشانی ناموجود ۴۰۴ می‌دهد', missing.status === 404, `status=${missing.status}`);
}

/* ---------------- noindex روی صفحه‌های خصوصی ---------------- */
console.log('\n── noindex صفحه‌های درون‌برنامه‌ای ──');
for (const p of ['/app', '/dashboard', '/history', '/admin', '/login', '/settings']) {
  const r = await req(p);
  check(`${p} با noindex علامت خورده`, /noindex/.test(String(r.data)), `status=${r.status}`);
}


/* ---------------- بازگردانی تنظیمات آزمون ---------------- */
{
  await req('/api/admin/settings', { method: 'POST', csrf, body: { site_url: realSiteUrl } });
  const back = await req('/api/admin/settings');
  check('site_url پس از آزمون بازگردانده شد',
    (back.data.site_url || '') === realSiteUrl, `مانده: ${back.data.site_url}`);
}

/* ---------------- تأیید ایمیل ---------------- */
console.log('\n── تأیید ایمیل ──');
{
  const st = await req('/api/admin/settings');
  check('وضعیت پیکربندی ایمیل گزارش می‌شود', typeof st.data.mailConfigured === 'boolean');
  check('کلید میل‌گان در پاسخ تنظیمات نیست',
    !/mailgun_api_key/.test(JSON.stringify(st.data)) || !st.data.mailgun_api_key,
    JSON.stringify(st.data).slice(0, 120));

  // مدیر خودش تأییدشده است (کاربر قدیمی)
  const v = await req('/api/auth/verification');
  check('GET /api/auth/verification', v.status === 200 && typeof v.data.verified === 'boolean');
  check('کاربر قدیمی تأییدشده است', v.data.verified === true, String(v.data.verified));

  const users = await req('/api/admin/users');
  check('پرچم اعتبار ایمیل در فهرست کاربران هست',
    users.data.items.every(u => 'email_valid' in u));
  check('وضعیت حساب در فهرست کاربران هست',
    users.data.items.every(u => ['pending', 'active', 'rejected', 'suspended'].includes(u.status)));

  const target = users.data.items.find(u => u.role !== 'admin');
  if (target) {
    const off = await req(`/api/admin/users/${target.id}/verify-email`, {
      method: 'POST', csrf, body: { verified: false }
    });
    check('لغو تأیید دستی', off.status === 200 && off.data.verified === false);

    const on = await req(`/api/admin/users/${target.id}/verify-email`, {
      method: 'POST', csrf, body: { verified: true }
    });
    check('تأیید دستی توسط مدیر', on.status === 200 && on.data.verified === true);
  }

  const noMail = await req('/api/auth/resend-verification', { method: 'POST', csrf });
  check('ارسال دوباره برای کاربر تأییدشده رد می‌شود', noMail.status === 400, `status=${noMail.status}`);

  const badToken = await req('/api/auth/verify', { method: 'POST', csrf, body: { token: 'not-a-real-token' } });
  check('توکن نامعتبر رد می‌شود', badToken.status === 400 && badToken.data.reason === 'invalid');

  const noToken = await req('/api/auth/verify', { method: 'POST', csrf, body: {} });
  check('توکن خالی رد می‌شود', noToken.status === 400 && noToken.data.reason === 'missing');

  const page = await req('/verify');
  check('صفحه /verify سرو می‌شود', page.status === 200 && /تأیید/.test(String(page.data)));
  check('صفحه /verify نباید ایندکس شود', /noindex/.test(String(page.data)));
}


console.log(`\n${'═'.repeat(46)}`);
console.log(`  موفق: ${pass}   ناموفق: ${fail}`);
console.log(`${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
