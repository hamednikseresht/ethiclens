import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db, audit } from '../db.js';
import { getSetting } from '../services/settings.js';
import { allowanceSummary } from '../services/tiers.js';
import { absoluteUrl } from '../services/seo.js';
import { issueCaptcha, verifyCaptcha } from '../services/captcha.js';
import { checkAndStore, EMAIL_RE as EMAIL_PATTERN } from '../services/email-check.js';
import {
  mailConfigured, createToken, consumeToken, sendVerification, secondsSinceLastToken,
  sendVerificationCode, sendResetCode
} from '../services/mail.js';
import {
  createOtp, verifyOtp, secondsSinceLastOtp, otpError,
  OTP_TTL_MINUTES, RESEND_COOLDOWN_SECONDS
} from '../services/otp.js';
import { requireAuth, csrfToken } from '../middleware/auth.js';

export const router = express.Router();

/**
 * Login rate limit.
 *
 * Only *failed* attempts are counted. Counting every request would let an
 * office or dormitory behind one shared IP lock itself out without anyone
 * attacking. An attacker who does not know the password fails by necessity,
 * and is still limited.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید.' }
});

/**
 * Registration limit — separate from login, and stricter.
 * The opposite rule applies here: successful signups count too, because
 * bulk account creation is exactly what we mean to limit.
 *
 * The ceiling is tight in production but loose in development, or testing the
 * signup flow by hand becomes impossible. Tunable with REGISTER_LIMIT.
 */
const REGISTER_LIMIT = Number(process.env.REGISTER_LIMIT)
  || (process.env.NODE_ENV === 'production' ? 10 : 200);

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: REGISTER_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد ثبت‌نام از این نشانی بیش از حد بود. یک ساعت دیگر تلاش کنید.' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    tier: u.tier || 'basic', createdAt: u.created_at,
    firstName: u.first_name || '', lastName: u.last_name || '',
    status: u.status,
    emailVerified: !!u.email_verified
  };
}

/** A fresh CAPTCHA image for the signup form */
router.get('/captcha', (req, res) => {
  const { svg } = issueCaptcha(req.session);
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-store, max-age=0');
  res.send(svg);
});

/**
 * Registration.
 *
 * First and last name are optional; only email and password are required.
 * The account is created pending and is unusable until an admin approves it.
 */
router.post('/register', registerLimiter, async (req, res) => {
  if (getSetting('allow_registration') !== '1') {
    return res.status(403).json({ error: 'ثبت‌نام در حال حاضر بسته است.' });
  }

  // CAPTCHA before anything else — so a bot never even reaches validation
  const cap = verifyCaptcha(req.session, req.body?.captcha);
  if (!cap.ok) return res.status(400).json({ error: cap.error, field: 'captcha' });

  const firstName = String(req.body?.firstName || '').trim().slice(0, 60);
  const lastName  = String(req.body?.lastName  || '').trim().slice(0, 60);
  const email     = String(req.body?.email || '').trim().toLowerCase();
  const password  = String(req.body?.password || '');

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'ایمیل معتبر نیست.', field: 'email' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۸ نویسه باشد.', field: 'password' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است.', field: 'email' });
  }

  // Display name: from first and last name, else the local part of the email
  const display = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];

  const info = db.prepare(`
    INSERT INTO users (email, name, first_name, last_name, password_hash, tier, status)
    VALUES (?,?,?,?,?,?, 'pending')`)
    .run(email, display, firstName || null, lastName || null,
         bcrypt.hashSync(password, 10), getSetting('default_tier') || 'basic');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  audit(user.id, 'register', { email, hasName: !!(firstName || lastName) }, req.ip);

  // Email plausibility flag — sends nothing, only helps the admin at approval
  // time. A failure here must not break registration.
  checkAndStore(user.id, email).catch(e =>
    console.error('[email-check] ناموفق:', e.message));

  // A session is created so the user can see their own status, but until an
  // admin approves them no useful route is open.
  req.session.userId = user.id;

  // Send the verification code straight away so the user can confirm the
  // address while the tab is still open. A failure here is logged and not
  // returned: the account exists either way, and the code can be requested
  // again from the pending screen.
  let codeSent = false;
  if (mailConfigured()) {
    try {
      const code = createOtp(user.id, 'verify-code', req.ip);
      await sendVerificationCode({ user, code, minutes: OTP_TTL_MINUTES });
      codeSent = true;
    } catch (e) {
      console.error('[otp] ارسال کد هنگام ثبت‌نام ناموفق:', e.message);
    }
  }

  res.json({
    user: publicUser(user),
    csrf: csrfToken(req),
    pendingApproval: true,
    codeSent,
    expiresInMinutes: OTP_TTL_MINUTES,
    message: codeSent
      ? `ثبت‌نام انجام شد. کد تأییدی به ${email} فرستادیم؛ آن را وارد کنید. حساب پس از تأیید مدیر فعال می‌شود.`
      : 'ثبت‌نام شما با موفقیت انجام شد. پس از تأیید مدیر، امکان استفاده از سامانه را خواهید داشت.'
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    audit(user?.id ?? null, 'login_failed', { email }, req.ip);
    return res.status(401).json({ error: 'ایمیل یا رمز عبور نادرست است.' });
  }
  // A pending user may sign in to see their status; other states are closed.
  if (user.status === 'rejected') {
    return res.status(403).json({
      error: user.review_note
        ? `درخواست عضویت شما پذیرفته نشد. توضیح مدیر: ${user.review_note}`
        : 'درخواست عضویت شما پذیرفته نشد.',
      reason: 'rejected'
    });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'این حساب مسدود شده است. با مدیر سامانه تماس بگیرید.', reason: 'suspended' });
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'خطا در ایجاد نشست.' });
    req.session.userId = user.id;
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    audit(user.id, 'login', null, req.ip);
    res.json({ user: publicUser(user), csrf: csrfToken(req) });
  });
});

router.post('/logout', (req, res) => {
  const uid = req.session?.userId;
  req.session.destroy(() => {
    audit(uid, 'logout', null, req.ip);
    res.clearCookie('ethiclens.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({
    user: req.user ? publicUser(req.user) : null,
    allowance: req.user ? allowanceSummary(req.user) : null,
    csrf: csrfToken(req),
    settings: {
      siteTitle: getSetting('site_title'),
      siteTagline: getSetting('site_tagline'),
      allowRegistration: getSetting('allow_registration') === '1'
    }
  });
});

router.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'رمز جدید باید حداقل ۸ نویسه باشد.' });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, row.password_hash)) {
    return res.status(401).json({ error: 'رمز فعلی نادرست است.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  audit(req.user.id, 'change_password', null, req.ip);
  res.json({ ok: true });
});

router.post('/profile', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'نام باید حداقل ۲ نویسه باشد.' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  res.json({ ok: true, name });
});

/* ==========================================================================
   Email verification
   ========================================================================== */

/** Verification status, and whether the system sends mail at all */
router.get('/verification', requireAuth, (req, res) => {
  const wait = Math.max(0, 60 - secondsSinceLastToken(req.user.id, 'verify'));
  res.json({
    verified: !!req.user.email_verified,
    required: getSetting('require_verification') === '1',
    gate: getSetting('verification_gate') || 'analysis',
    mailEnabled: mailConfigured(),
    email: req.user.email,
    resendInSeconds: wait
  });
});

/** Resend the verification email — throttled so nobody gets mail-bombed */
router.post('/resend-verification', requireAuth, async (req, res) => {
  if (req.user.email_verified) {
    return res.status(400).json({ error: 'ایمیل شما از قبل تأیید شده است.' });
  }
  if (!mailConfigured()) {
    return res.status(503).json({ error: 'سرویس ایمیل تنظیم نشده است. با مدیر سامانه تماس بگیرید.' });
  }

  const since = secondsSinceLastToken(req.user.id, 'verify');
  if (since < 60) {
    return res.status(429).json({
      error: `کمی صبر کنید. ${Math.ceil(60 - since)} ثانیه دیگر می‌توانید دوباره درخواست دهید.`,
      resendInSeconds: Math.ceil(60 - since)
    });
  }

  try {
    const token = createToken(req.user.id, 'verify', req.ip);
    await sendVerification({ user: req.user, url: absoluteUrl(req, `/verify?token=${token}`) });
    audit(req.user.id, 'verify_resend', null, req.ip);
    res.json({ ok: true, resendInSeconds: 60 });
  } catch (e) {
    console.error('[verify] ارسال دوباره ناموفق:', e.message);
    res.status(502).json({ error: e.message });
  }
});

/** Consume a token — the /verify page calls this */
router.post('/verify', (req, res) => {
  const result = consumeToken(String(req.body?.token || ''), 'verify');

  if (!result.ok) {
    const messages = {
      missing: 'پیوند تأیید ناقص است.',
      invalid: 'این پیوند تأیید معتبر نیست.',
      used:    'این پیوند قبلاً استفاده شده است. اگر حسابتان تأیید نشده، پیوند تازه بخواهید.',
      expired: 'این پیوند منقضی شده است. از حسابتان پیوند تازه بخواهید.'
    };
    return res.status(400).json({ error: messages[result.reason] || 'پیوند تأیید معتبر نیست.', reason: result.reason });
  }

  const u = result.user;
  if (!u.email_verified) {
    db.prepare("UPDATE users SET email_verified = 1, verified_at = datetime('now') WHERE id = ?").run(u.id);
    audit(u.id, 'email_verified', { email: u.email }, req.ip);
  }

  // Verifying also signs the user in, to keep the path frictionless
  req.session.regenerate(err => {
    if (err) return res.json({ ok: true, signedIn: false });
    req.session.userId = u.id;
    res.json({ ok: true, signedIn: true, user: publicUser({ ...u, email_verified: 1 }) });
  });
});

/* ==========================================================================
   One-time codes: email verification and password reset
   --------------------------------------------------------------------------
   Verifying an address and being allowed in are two separate gates here. A
   code proves the person controls the mailbox; it does not activate the
   account. Activation stays with the admin, so a verified stranger still
   waits in the pending queue.
   ========================================================================== */

/** A stricter limiter for the code endpoints — these send mail and grant access. */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.OTP_LIMIT) || (process.env.NODE_ENV === 'production' ? 20 : 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'درخواست‌های زیادی از این نشانی آمده. ۱۵ دقیقه دیگر تلاش کنید.' }
});

/** Issue a verification code for the signed-in account. */
router.post('/send-code', requireAuth, otpLimiter, async (req, res) => {
  if (req.user.email_verified) {
    return res.status(400).json({ error: 'ایمیل شما از قبل تأیید شده است.' });
  }
  if (!mailConfigured()) {
    return res.status(503).json({ error: 'سرویس ایمیل تنظیم نشده است. با مدیر سامانه تماس بگیرید.' });
  }

  const since = secondsSinceLastOtp(req.user.id, 'verify-code');
  if (since < RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - since);
    return res.status(429).json({ error: `کمی صبر کنید. ${wait} ثانیه دیگر می‌توانید کد تازه بخواهید.`, resendInSeconds: wait });
  }

  try {
    const code = createOtp(req.user.id, 'verify-code', req.ip);
    await sendVerificationCode({ user: req.user, code, minutes: OTP_TTL_MINUTES });
    audit(req.user.id, 'verify_code_sent', null, req.ip);
    res.json({ ok: true, resendInSeconds: RESEND_COOLDOWN_SECONDS, expiresInMinutes: OTP_TTL_MINUTES });
  } catch (e) {
    console.error('[otp] ارسال کد تأیید ناموفق:', e.message);
    res.status(502).json({ error: e.message });
  }
});

/** Check a verification code. Marks the email verified; does not activate the account. */
router.post('/verify-code', requireAuth, otpLimiter, (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true, alreadyVerified: true });

  const result = verifyOtp(req.user.id, 'verify-code', req.body?.code);
  if (!result.ok) {
    audit(req.user.id, 'verify_code_failed', { reason: result.reason }, req.ip);
    return res.status(400).json({ error: otpError(result.reason, result.attemptsLeft), reason: result.reason });
  }

  db.prepare("UPDATE users SET email_verified = 1, verified_at = datetime('now') WHERE id = ?")
    .run(req.user.id);
  audit(req.user.id, 'email_verified', { via: 'code' }, req.ip);

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    ok: true,
    user: publicUser(fresh),
    // Said plainly, because a verified user who still cannot do anything will
    // otherwise assume something is broken.
    pendingApproval: fresh.status === 'pending',
    message: fresh.status === 'pending'
      ? 'ایمیل شما تأیید شد. حساب پس از تأیید مدیر فعال می‌شود.'
      : 'ایمیل شما تأیید شد.'
  });
});

/* ---------------- Password reset ---------------- */

/**
 * Request a reset code.
 *
 * The response is identical whether or not the address exists. Saying "no
 * such account" would turn this endpoint into a way to test which email
 * addresses are registered, which is exactly the list an attacker wants
 * before trying passwords elsewhere.
 */
router.post('/forgot', otpLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = {
    ok: true,
    message: 'اگر حسابی با این نشانی وجود داشته باشد، کد بازیابی برایش فرستاده شد.',
    expiresInMinutes: OTP_TTL_MINUTES
  };

  if (!EMAIL_PATTERN.test(email)) return res.json(generic);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !mailConfigured()) return res.json(generic);

  // Suspended and rejected accounts are not resettable. Still answered with
  // the same text, so the state of an account cannot be probed from outside.
  if (user.status === 'suspended' || user.status === 'rejected') {
    audit(user.id, 'reset_blocked', { status: user.status }, req.ip);
    return res.json(generic);
  }

  if (secondsSinceLastOtp(user.id, 'reset') < RESEND_COOLDOWN_SECONDS) return res.json(generic);

  try {
    const code = createOtp(user.id, 'reset', req.ip);
    await sendResetCode({ user, code, minutes: OTP_TTL_MINUTES });
    audit(user.id, 'reset_code_sent', null, req.ip);
  } catch (e) {
    // Logged, not surfaced: a delivery failure must not reveal that the
    // address exists either.
    console.error('[otp] ارسال کد بازیابی ناموفق:', e.message);
  }
  res.json(generic);
});

/** Complete a reset: code plus a new password. */
router.post('/reset', otpLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (password.length < 8) {
    return res.status(400).json({ error: 'رمز تازه باید دست‌کم ۸ نویسه باشد.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Past this point the caller has already proved they hold a live code, so a
  // precise error is no longer an enumeration risk — and a vague one here
  // would leave a legitimate user with no idea what went wrong.
  if (!user) return res.status(400).json({ error: 'کد یا نشانی ایمیل نادرست است.' });

  const result = verifyOtp(user.id, 'reset', req.body?.code);
  if (!result.ok) {
    audit(user.id, 'reset_failed', { reason: result.reason }, req.ip);
    return res.status(400).json({ error: otpError(result.reason, result.attemptsLeft), reason: result.reason });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), user.id);

  // Every existing session is dropped. If the reset happened because someone
  // else had gained access, leaving their session alive would defeat it.
  db.prepare("DELETE FROM sessions WHERE data LIKE ?").run(`%"userId":${user.id}%`);
  audit(user.id, 'password_reset', null, req.ip);

  res.json({
    ok: true,
    message: user.status === 'pending'
      ? 'رمز تازه ثبت شد. حساب شما هنوز در انتظار تأیید مدیر است.'
      : 'رمز تازه ثبت شد. حالا می‌توانید وارد شوید.'
  });
});
