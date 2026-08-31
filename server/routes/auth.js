import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db, audit } from '../db.js';
import { getSetting } from '../services/settings.js';
import { allowanceSummary } from '../services/tiers.js';
import { absoluteUrl } from '../services/seo.js';
import { createKey, listKeys, revokeKey } from '../services/apikeys.js';
import {
  mailConfigured, createToken, consumeToken, sendVerification, secondsSinceLastToken
} from '../services/mail.js';
import { requireAuth, csrfToken } from '../middleware/auth.js';

export const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید.' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    tier: u.tier || 'basic', createdAt: u.created_at,
    emailVerified: !!u.email_verified
  };
}

router.post('/register', loginLimiter, async (req, res) => {
  if (getSetting('allow_registration') !== '1') {
    return res.status(403).json({ error: 'ثبت‌نام در حال حاضر بسته است.' });
  }
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'نام باید حداقل ۲ نویسه باشد.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'ایمیل معتبر نیست.' });
  if (password.length < 8) return res.status(400).json({ error: 'رمز عبور باید حداقل ۸ نویسه باشد.' });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است.' });
  }

  const defaultTier = getSetting('default_tier') || 'basic';
  const info = db.prepare('INSERT INTO users (email, name, password_hash, tier) VALUES (?,?,?,?)')
    .run(email, name, bcrypt.hashSync(password, 10), defaultTier);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  req.session.userId = user.id;
  audit(user.id, 'register', { email }, req.ip);

  // اگر سرویس ایمیل تنظیم نشده باشد، ثبت‌نام نباید بشکند؛ حساب
  // تأییدشده در نظر گرفته می‌شود تا کاربر پشت دری قفل نماند.
  let verificationSent = false;
  if (!mailConfigured()) {
    db.prepare("UPDATE users SET email_verified = 1, verified_at = datetime('now') WHERE id = ?").run(user.id);
    user.email_verified = 1;
  } else {
    try {
      const token = createToken(user.id, 'verify', req.ip);
      await sendVerification({ user, url: absoluteUrl(req, `/verify?token=${token}`) });
      verificationSent = true;
    } catch (e) {
      console.error('[verify] ارسال ایمیل ناموفق:', e.message);
      audit(user.id, 'verify_send_failed', { error: e.message }, req.ip);
    }
  }

  res.json({ user: publicUser(user), csrf: csrfToken(req), verificationSent });
});

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    audit(user?.id ?? null, 'login_failed', { email }, req.ip);
    return res.status(401).json({ error: 'ایمیل یا رمز عبور نادرست است.' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'این حساب غیرفعال شده است. با مدیر تماس بگیرید.' });
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
    res.clearCookie('ethica.sid');
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

/* ==========================================================================
   کلیدهای API — مدیریت توسط خود کاربر
   ========================================================================== */
router.get('/api-keys', requireAuth, (req, res) => {
  res.json({ items: listKeys(req.user.id) });
});

router.post('/api-keys', requireAuth, (req, res) => {
  const active = listKeys(req.user.id).filter(k => !k.revoked_at).length;
  if (active >= 10) {
    return res.status(400).json({ error: 'حداکثر ۱۰ کلید فعال می‌توانید داشته باشید. یکی را باطل کنید.' });
  }

  const name = String(req.body?.name || '').trim() || 'کلید بدون نام';
  const days = req.body?.expiresInDays ? Number(req.body.expiresInDays) : null;

  const created = createKey(req.user.id, name, {
    expiresInDays: Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : null
  });

  audit(req.user.id, 'api_key_create', { id: created.id, name }, req.ip);

  // کلید کامل فقط همین یک بار برمی‌گردد
  res.json({
    ok: true,
    id: created.id,
    name,
    key: created.key,
    warning: 'این کلید دوباره نشان داده نمی‌شود. همین حالا در جای امنی ذخیره‌اش کنید.'
  });
});

router.delete('/api-keys/:id', requireAuth, (req, res) => {
  if (!revokeKey(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'کلید یافت نشد یا از قبل باطل شده است.' });
  }
  audit(req.user.id, 'api_key_revoke', { id: Number(req.params.id) }, req.ip);
  res.json({ ok: true });
});
