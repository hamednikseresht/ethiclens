/** End-to-end test of the signup and admin-approval flow */
const BASE = 'http://localhost:3000';

function client() {
  const jar = new Map();
  return async function req(p, o = {}) {
    const h = { Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') };
    if (o.body !== undefined) h['Content-Type'] = 'application/json';
    if (o.csrf) h['x-csrf-token'] = o.csrf;
    const r = await fetch(BASE + p, {
      method: o.method || 'GET', headers: h,
      body: o.body === undefined ? undefined : JSON.stringify(o.body)
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const t = await r.text();
    try { return { s: r.status, d: JSON.parse(t), raw: t }; }
    catch { return { s: r.status, d: t, raw: t }; }
  };
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log(`  ✗ ${n}  → ${x}`)); };

/* ================= CAPTCHA ================= */
console.log('\n── کپچا ──');
const U = client();
let me = await U('/api/auth/me');
let csrf = me.d.csrf;

const cap = await U('/api/auth/captcha');
ok('تصویر امنیتی SVG برمی‌گردد', cap.s === 200 && String(cap.d).includes('<svg'), `status=${cap.s}`);

const noCap = await U('/api/auth/register', {
  method: 'POST', csrf,
  body: { email: `nocap${Date.now()}@example.com`, password: 'Test12345!' }
});
ok('ثبت‌نام بدون کپچا رد می‌شود', noCap.s === 400 && noCap.d.field === 'captcha', JSON.stringify(noCap.d));

const wrongCap = await U('/api/auth/register', {
  method: 'POST', csrf,
  body: { email: `bad${Date.now()}@example.com`, password: 'Test12345!', captcha: '999999' }
});
ok('پاسخ اشتباه کپچا رد می‌شود', wrongCap.s === 400, JSON.stringify(wrongCap.d));

/* ================= Registration ================= */
console.log('\n── ثبت‌نام ──');
  // The correct answer is taken from the server side (a real user reads the image)
const { db } = await import('../server/db.js');

async function registerWith(body) {
  await U('/api/auth/captcha');                       // a fresh challenge in the session
  const sid = [...(await U('/api/auth/me')).raw ? [] : []];
  // Recover the answer from the stored session
  const row = db.prepare('SELECT data FROM sessions ORDER BY rowid DESC').all()
    .map(r => { try { return JSON.parse(r.data); } catch { return null; } })
    .find(x => x?.captcha);
  // Challenges are stored hashed, so the number is found by search
  const crypto = await import('node:crypto');
  let answer = null;
  for (let n = -50; n <= 400; n++) {
    const h = crypto.createHash('sha256').update(String(n)).digest('hex');
    if (h === row?.captcha?.hash) { answer = n; break; }
  }
  return U('/api/auth/register', { method: 'POST', csrf, body: { ...body, captcha: String(answer) } });
}

const email = `flow${Date.now()}@gmail.com`;
const reg = await registerWith({ email, password: 'Test12345!' });
ok('ثبت‌نام بدون نام کار می‌کند', reg.s === 200, JSON.stringify(reg.d).slice(0, 160));

if (reg.s !== 200) {
  console.error('\n  ثبت‌نام ناموفق بود، پس بقیه آزمون‌ها بی‌معنا می‌شوند.');
  console.error('  اگر خطا درباره محدودیت نرخ است، سرور را ری‌استارت کنید' +
                ' یا REGISTER_LIMIT را بالاتر بگذارید.\n');
  process.exit(1);
}
csrf = reg.d.csrf || csrf;
ok('پیام انتظار تأیید برمی‌گردد', reg.d.pendingApproval === true && !!reg.d.message);
ok('وضعیت کاربر pending است', reg.d.user?.status === 'pending', reg.d.user?.status);
ok('نام نمایشی از ایمیل ساخته شد', reg.d.user?.name === email.split('@')[0], reg.d.user?.name);

const dupe = await registerWith({ email, password: 'Test12345!' });
ok('ایمیل تکراری رد می‌شود', dupe.s === 409, `status=${dupe.s}`);

/* ================= Approval gate ================= */
console.log('\n── دروازه تأیید مدیر ──');
const blocked = await U('/api/analyze/stream', {
  method: 'POST', csrf: reg.d.csrf,
  body: { dilemma: 'یک دوراهی آزمایشی به اندازه کافی طولانی برای عبور از اعتبارسنجی ورودی سامانه.' }
});
ok('کاربر تأییدنشده تحلیل اجرا نمی‌کند', blocked.s === 403 && blocked.d.reason === 'pending_approval',
   `${blocked.s} ${JSON.stringify(blocked.d).slice(0, 90)}`);

const canSee = await U('/api/auth/me');
ok('کاربر تأییدنشده می‌تواند وضعیتش را ببیند', canSee.d.user?.status === 'pending');

/* ================= Email validity flag ================= */
console.log('\n── پرچم اعتبار ایمیل ──');
await new Promise(r => setTimeout(r, 2500));      // the MX lookup is asynchronous
const row = db.prepare('SELECT email_valid, email_check_note FROM users WHERE email = ?').get(email);
ok('پرچم اعتبار ثبت شد', row.email_valid !== undefined,
   `valid=${row.email_valid} note=${row.email_check_note}`);
console.log(`     → gmail.com: valid=${row.email_valid} — ${row.email_check_note}`);

const { checkEmail } = await import('../server/services/email-check.js');
const bad1 = await checkEmail('someone@mailinator.com');
ok('دامنه یک‌بارمصرف مشکوک علامت می‌خورد', bad1.valid === 0, bad1.note);
const bad2 = await checkEmail('someone@gmial.com');
ok('غلط تایپی دامنه تشخیص داده می‌شود', bad2.valid === 0, bad2.note);
const bad3 = await checkEmail('not-an-email');
ok('ساختار نامعتبر رد می‌شود', bad3.valid === 0, bad3.note);

/* ================= Admin review ================= */
console.log('\n── بررسی توسط مدیر ──');
const A = client();
let ame = await A('/api/auth/me');
const login = await A('/api/auth/login', {
  method: 'POST', csrf: ame.d.csrf,
  body: { email: 'admin@example.com', password: 'ChangeMe123!' }
});
const acsrf = login.d.csrf;
ok('ورود مدیر', login.s === 200 && login.d.user?.role === 'admin');

const pending = await A('/api/admin/users?status=pending');
ok('فیلتر منتظر تأیید کار می‌کند', pending.s === 200 && pending.d.items.some(u => u.email === email));
ok('شمار وضعیت‌ها برمی‌گردد', typeof pending.d.counts?.pending === 'number', JSON.stringify(pending.d.counts));

const target = pending.d.items.find(u => u.email === email);
const act = await A(`/api/admin/users/${target.id}/activity`);
ok('گزارش فعالیت کاربر', act.s === 200 && act.d.user?.email === email);
ok('گزارش شامل زمان ثبت‌نام است', !!act.d.user?.created_at);
ok('گزارش شامل رویدادها است', Array.isArray(act.d.events));

const approve = await A(`/api/admin/users/${target.id}/review`, {
  method: 'POST', csrf: acsrf, body: { decision: 'approve' }
});
ok('تأیید کاربر', approve.s === 200 && approve.d.status === 'active', JSON.stringify(approve.d));

const after = await U('/api/auth/me');
ok('وضعیت کاربر به active تغییر کرد', after.d.user?.status === 'active', after.d.user?.status);

const quotaNow = await U('/api/analyze/quota');
ok('پس از تأیید، دسترسی باز می‌شود', quotaNow.s === 200, `status=${quotaNow.s}`);

/* ================= Rejection ================= */
console.log('\n── رد درخواست ──');
const email2 = `rej${Date.now()}@gmail.com`;
const reg2 = await registerWith({ firstName: 'علی', lastName: 'رضایی', email: email2, password: 'Test12345!' });
ok('ثبت‌نام با نام و نام خانوادگی', reg2.s === 200 && reg2.d.user?.name === 'علی رضایی', reg2.d.user?.name);

const u2 = db.prepare('SELECT id FROM users WHERE email = ?').get(email2);
const reject = await A(`/api/admin/users/${u2.id}/review`, {
  method: 'POST', csrf: acsrf, body: { decision: 'reject', note: 'اطلاعات ناقص است.' }
});
ok('رد کاربر', reject.s === 200 && reject.d.status === 'rejected');

const R = client();
let rme = await R('/api/auth/me');
const rlogin = await R('/api/auth/login', {
  method: 'POST', csrf: rme.d.csrf, body: { email: email2, password: 'Test12345!' }
});
ok('کاربر ردشده نمی‌تواند وارد شود', rlogin.s === 403 && rlogin.d.reason === 'rejected', `status=${rlogin.s}`);
ok('دلیل رد به کاربر نشان داده می‌شود', /اطلاعات ناقص/.test(rlogin.d.error || ''), rlogin.d.error);

/* ---- Cleanup ---- */
db.prepare("DELETE FROM users WHERE email LIKE 'flow%@gmail.com' OR email LIKE 'rej%@gmail.com'").run();

console.log(`\n${'═'.repeat(46)}\n  موفق: ${pass}   ناموفق: ${fail}\n${'═'.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
