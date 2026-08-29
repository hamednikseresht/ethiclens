import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db, audit } from '../db.js';
import { getSetting, num } from '../services/settings.js';
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
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at };
}

router.post('/register', loginLimiter, (req, res) => {
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

  const info = db.prepare('INSERT INTO users (email, name, password_hash, daily_quota) VALUES (?,?,?,?)')
    .run(email, name, bcrypt.hashSync(password, 10), num('default_daily_quota', 30));

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  req.session.userId = user.id;
  audit(user.id, 'register', { email }, req.ip);
  res.json({ user: publicUser(user), csrf: csrfToken(req) });
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
