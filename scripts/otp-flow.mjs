/**
 * End-to-end test of the one-time-code flows: signup verification and
 * password reset.
 *
 * Mail is not actually sent — the transport is left unconfigured and the code
 * is read straight from the database, the same way scripts/signup-flow.mjs
 * solves the CAPTCHA. Codes are stored as a salted hash, so the test brute
 * forces the six-digit space against that hash. That is only practical here
 * because the user id and purpose are known; it is exactly the property that
 * makes the codes safe in production.
 *
 * Run:  node scripts/otp-flow.mjs
 */
import crypto from 'node:crypto';
import { db } from '../server/db.js';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  results.push({ name, ok });
}

function section(t) { console.log(`\n── ${t} ──`); }

/* Cookie-aware fetch, one jar per simulated browser. */
function makeClient() {
  const jar = new Map();
  let csrf = null;

  return async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual'
    });

    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }

    let json = null;
    try { json = await res.json(); } catch {}
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
}

/** Recover a live code by matching the salted hash. */
function readCode(userId, purpose) {
  const row = db.prepare(`
    SELECT token_hash FROM email_tokens
    WHERE user_id = ? AND purpose = ? AND used_at IS NULL
    ORDER BY id DESC LIMIT 1`).get(userId, purpose);
  if (!row) return null;

  for (let n = 0; n < 1000000; n++) {
    const code = String(n).padStart(6, '0');
    const h = crypto.createHash('sha256').update(`${userId}:${purpose}:${code}`).digest('hex');
    if (h === row.token_hash) return code;
  }
  return null;
}

/**
 * Point the mail transport at a port nothing listens on.
 *
 * The code is minted before the send is attempted, so a failing transport
 * still exercises the whole path — and it proves the flow does not depend on
 * delivery succeeding, which is the case that actually bites in production.
 * The previous values are captured and restored in a finally block; leaving
 * a test transport behind would silently break real verification mail.
 */
const MAIL_KEYS = ['mail_provider', 'smtp_host', 'smtp_port', 'mail_from_email'];
const savedMail = Object.fromEntries(
  MAIL_KEYS.map(k => [k, db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? null])
);

function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?,?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

function restoreMail() {
  for (const [k, v] of Object.entries(savedMail)) {
    if (v === null) db.prepare('DELETE FROM settings WHERE key = ?').run(k);
    else setSetting(k, v);
  }
}

setSetting('mail_provider', 'smtp');
setSetting('smtp_host', '127.0.0.1');
setSetting('smtp_port', '9');           // discard port — refuses immediately
setSetting('mail_from_email', 'test@example.invalid');
process.on('exit', restoreMail);

const stamp = Date.now();
const EMAIL = `otp-test-${stamp}@example.com`;
const PASSWORD = 'first-password-1';
const NEW_PASSWORD = 'second-password-2';

console.log('══════════════════════════════════════════════');
console.log('  آزمون کد یک‌بارمصرف');
console.log('══════════════════════════════════════════════');

/* ================= Signup with code ================= */
section('ثبت‌نام و کد تأیید');

const user = makeClient();
await user('/api/auth/me');

const cap = await user('/api/auth/captcha');
const capRow = db.prepare("SELECT data FROM sessions ORDER BY rowid DESC LIMIT 1").get();
let capAnswer = null;
try {
  const sess = JSON.parse(capRow.data);
  const target = sess.captcha?.hash;
  for (let n = -50; n < 200 && capAnswer === null; n++) {
    if (crypto.createHash('sha256').update(String(n)).digest('hex') === target) capAnswer = String(n);
  }
} catch {}

const reg = await user('/api/auth/register', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD, captcha: capAnswer, captchaId: cap.json?.id }
});

check('ثبت‌نام موفق', reg.status === 200, `status ${reg.status} ${JSON.stringify(reg.json).slice(0, 120)}`);
const row = db.prepare('SELECT * FROM users WHERE email = ?').get(EMAIL);
check('کاربر ساخته شد', !!row);
check('وضعیت pending است', row?.status === 'pending', row?.status);
check('ایمیل هنوز تأییدنشده', row?.email_verified === 0);

if (row) {
  const code = readCode(row.id, 'verify-code');
  check('کد تأیید صادر شد', !!code);

  if (code) {
    const wrong = await user('/api/auth/verify-code', { method: 'POST', body: { code: '000000' } });
    check('کد نادرست رد می‌شود', wrong.status === 400);
    check('تعداد تلاش باقی‌مانده گزارش می‌شود', /تلاش دیگر/.test(wrong.json?.error || ''), wrong.json?.error);

    const ok = await user('/api/auth/verify-code', { method: 'POST', body: { code } });
    check('کد درست پذیرفته می‌شود', ok.status === 200, JSON.stringify(ok.json).slice(0, 120));

    const after = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    check('ایمیل تأییدشده ثبت شد', after.email_verified === 1);
    check('تأیید ایمیل حساب را فعال نمی‌کند', after.status === 'pending', after.status);
    check('پیام انتظار تأیید مدیر داده می‌شود', ok.json?.pendingApproval === true);

    const again = await user('/api/auth/verify-code', { method: 'POST', body: { code } });
    check('کد مصرف‌شده دوباره کار نمی‌کند', again.json?.alreadyVerified === true || again.status === 400);
  }
}

/* ================= Password reset ================= */
section('بازیابی رمز');

const anon = makeClient();
await anon('/api/auth/me');

const unknown = await anon('/api/auth/forgot', { method: 'POST', body: { email: `nobody-${stamp}@example.com` } });
const known = await anon('/api/auth/forgot', { method: 'POST', body: { email: EMAIL } });
check('پاسخ برای ایمیل ناموجود و موجود یکسان است',
  unknown.status === known.status && unknown.json?.message === known.json?.message,
  `${unknown.status}/${known.status}`);

if (row) {
  const rcode = readCode(row.id, 'reset');
  check('کد بازیابی صادر شد', !!rcode);

  if (rcode) {
    const short = await anon('/api/auth/reset', { method: 'POST', body: { email: EMAIL, code: rcode, password: 'abc' } });
    check('رمز کوتاه رد می‌شود', short.status === 400);

    const badCode = await anon('/api/auth/reset', { method: 'POST', body: { email: EMAIL, code: '999999', password: NEW_PASSWORD } });
    check('کد نادرست رد می‌شود', badCode.status === 400);

    const fresh = readCode(row.id, 'reset');
    const done = await anon('/api/auth/reset', { method: 'POST', body: { email: EMAIL, code: fresh, password: NEW_PASSWORD } });
    check('بازیابی با کد درست انجام شد', done.status === 200, JSON.stringify(done.json).slice(0, 140));

    const login = makeClient();
    await login('/api/auth/me');
    const old = await login('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
    check('رمز قدیمی دیگر کار نمی‌کند', old.status === 401);

    const neu = await login('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: NEW_PASSWORD } });
    check('رمز تازه کار می‌کند', neu.status === 200, `status ${neu.status}`);
  }
}

/* ================= Admin approval still required ================= */
section('تأیید مدیر همچنان لازم است');

const after = db.prepare('SELECT * FROM users WHERE email = ?').get(EMAIL);
check('کاربر تأییدشده‌ایمیل هنوز pending است', after?.status === 'pending', after?.status);

const probe = makeClient();
await probe('/api/auth/me');
await probe('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: NEW_PASSWORD } });
const analyze = await probe('/api/analyze/stream', { method: 'POST', body: { dilemma: 'x'.repeat(40) } });
check('کاربر تأییدنشده به تحلیل دسترسی ندارد', analyze.status === 403 || analyze.status === 401, `status ${analyze.status}`);

/* ---- Cleanup ---- */
if (row) {
  db.prepare('DELETE FROM email_tokens WHERE user_id = ?').run(row.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
}

console.log('\n══════════════════════════════════════════════');
console.log(`  موفق: ${pass}   ناموفق: ${fail}`);
console.log('══════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
