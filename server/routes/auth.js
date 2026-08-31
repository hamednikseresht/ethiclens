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
  mailConfigured, createToken, consumeToken, sendVerification, secondsSinceLastToken
} from '../services/mail.js';
import { requireAuth, csrfToken } from '../middleware/auth.js';

export const router = express.Router();

/**
 * محدودیت ورود.
 *
 * فقط تلاش‌های *ناموفق* شمرده می‌شوند. اگر همه درخواست‌ها شمرده شوند،
 * یک دفتر یا خوابگاه که پشت یک IP مشترک است خودش را قفل می‌کند — بی‌آنکه
 * کسی حمله کرده باشد. حمله‌کننده‌ای که رمز را نمی‌داند، ناگزیر شکست
 * می‌خورد و همچنان محدود می‌شود.
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
 * محدودیت ثبت‌نام — جدا از ورود و سخت‌گیرانه‌تر.
 * اینجا برعکس: هر ثبت‌نام موفق هم شمرده می‌شود، چون دقیقاً همان چیزی
 * است که می‌خواهیم محدودش کنیم (ساخت انبوه حساب).
 *
 * سقف در تولید تنگ است ولی در توسعه گشاد، وگرنه آزمودن دستی جریان
 * ثبت‌نام پس از چند بار غیرممکن می‌شود. با REGISTER_LIMIT قابل تنظیم است.
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

/** تصویر امنیتی تازه برای فرم ثبت‌نام */
router.get('/captcha', (req, res) => {
  const { svg } = issueCaptcha(req.session);
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-store, max-age=0');
  res.send(svg);
});

/**
 * ثبت‌نام.
 *
 * نام و نام خانوادگی اختیاری‌اند؛ فقط ایمیل و رمز الزامی است.
 * حساب با وضعیت pending ساخته می‌شود و تا تأیید مدیر قابل استفاده نیست.
 */
router.post('/register', registerLimiter, async (req, res) => {
  if (getSetting('allow_registration') !== '1') {
    return res.status(403).json({ error: 'ثبت‌نام در حال حاضر بسته است.' });
  }

  // کپچا پیش از هر کار دیگر — تا ربات حتی به اعتبارسنجی هم نرسد
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

  // نام نمایشی: از نام و نام خانوادگی، وگرنه بخش ابتدایی ایمیل
  const display = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];

  const info = db.prepare(`
    INSERT INTO users (email, name, first_name, last_name, password_hash, tier, status)
    VALUES (?,?,?,?,?,?, 'pending')`)
    .run(email, display, firstName || null, lastName || null,
         bcrypt.hashSync(password, 10), getSetting('default_tier') || 'basic');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  audit(user.id, 'register', { email, hasName: !!(firstName || lastName) }, req.ip);

  // پرچم اعتبار ایمیل — بدون ارسال چیزی، فقط برای کمک به مدیر هنگام تأیید.
  // اگر شکست بخورد نباید ثبت‌نام را خراب کند.
  checkAndStore(user.id, email).catch(e =>
    console.error('[email-check] ناموفق:', e.message));

  // نشست ساخته می‌شود تا کاربر بتواند وضعیتش را ببیند، ولی تا تأیید
  // مدیر هیچ مسیر کاربردی‌ای برایش باز نیست.
  req.session.userId = user.id;

  res.json({
    user: publicUser(user),
    csrf: csrfToken(req),
    pendingApproval: true,
    message: 'ثبت‌نام شما با موفقیت انجام شد. پس از تأیید مدیر، امکان استفاده از سامانه را خواهید داشت.'
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
  // کاربر منتظر تأیید اجازه ورود دارد تا وضعیتش را ببیند؛ بقیه وضعیت‌ها بسته‌اند.
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
   تأیید ایمیل
   ========================================================================== */

/** وضعیت تأیید و اینکه آیا سامانه اصلاً ایمیل می‌فرستد */
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

/** ارسال دوباره ایمیل تأیید — با فاصله اجباری تا ایمیل کسی بمباران نشود */
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

/** مصرف توکن — صفحه /verify این را صدا می‌زند */
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

  // تأیید، کاربر را وارد هم می‌کند تا مسیر بدون اصطکاک باشد
  req.session.regenerate(err => {
    if (err) return res.json({ ok: true, signedIn: false });
    req.session.userId = u.id;
    res.json({ ok: true, signedIn: true, user: publicUser({ ...u, email_verified: 1 }) });
  });
});
