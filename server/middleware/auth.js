import crypto from 'node:crypto';
import { db } from '../db.js';
import { getSetting } from '../services/settings.js';

export function loadUser(req, _res, next) {
  req.user = null;
  if (req.session?.userId) {
    const u = db.prepare(`SELECT id, email, name, role, tier, status,
                                 email_verified, verified_at,
                                 quota_override, token_override, created_at
                          FROM users WHERE id = ?`)
                .get(req.session.userId);
    if (u && u.status === 'active') req.user = u;
    else req.session.destroy(() => {});
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'برای این کار باید وارد حساب کاربری شوید.' });

  // اگر مدیر دروازه را روی «ورود» گذاشته باشد، کاربر تأییدنشده به هیچ
  // مسیر محافظت‌شده‌ای دسترسی ندارد — جز خود مسیرهای تأیید ایمیل.
  if (!req.user.email_verified
      && getSetting('require_verification') === '1'
      && getSetting('verification_gate') === 'login'
      && !/^\/(verification|resend-verification|verify)$/.test(req.path)) {
    return res.status(403).json({
      error: 'برای استفاده از سامانه، ابتدا نشانی ایمیل خود را تأیید کنید.',
      reason: 'email_unverified',
      email: req.user.email
    });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'ابتدا وارد شوید.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی مدیریتی لازم است.' });
  next();
}

/**
 * دروازه تأیید ایمیل.
 *
 * پیش‌فرض «نرم» است: کاربر تأییدنشده می‌تواند وارد شود و بگردد، ولی
 * تحلیل اجرا نمی‌کند. دلیلش این است که ریسک واقعیِ ثبت‌نام‌های جعلی،
 * سوزاندن اعتبار API است — نه صرفِ ورود. مدیر می‌تواند از پنل سخت‌گیرانه‌ترش کند.
 */
export function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'ابتدا وارد شوید.' });
  if (req.user.email_verified) return next();
  if (getSetting('require_verification') !== '1') return next();

  return res.status(403).json({
    error: 'برای اجرای تحلیل، ابتدا نشانی ایمیل خود را تأیید کنید. پیوند تأیید به ایمیلتان فرستاده شده است.',
    reason: 'email_unverified',
    email: req.user.email
  });
}

/** CSRF با الگوی double-submit: توکن در نشست، ارسال در هدر */
export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token');
  if (!sent || !req.session?.csrf || sent !== req.session.csrf) {
    return res.status(403).json({ error: 'توکن امنیتی نامعتبر است. صفحه را تازه کنید.' });
  }
  next();
}
