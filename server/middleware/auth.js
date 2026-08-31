import crypto from 'node:crypto';
import { db } from '../db.js';
import { getSetting } from '../services/settings.js';

export function loadUser(req, _res, next) {
  req.user = null;
  if (req.session?.userId) {
    const u = db.prepare(`SELECT id, email, name, first_name, last_name,
                                 role, tier, status, review_note,
                                 email_verified, verified_at, email_valid,
                                 quota_override, token_override, created_at
                          FROM users WHERE id = ?`)
                .get(req.session.userId);
    if (u && (u.status === 'active' || u.status === 'pending')) req.user = u;
    else req.session.destroy(() => {});
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'برای این کار باید وارد حساب کاربری شوید.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'ابتدا وارد شوید.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی مدیریتی لازم است.' });
  next();
}

/**
 * دروازه تأیید مدیر.
 *
 * حساب تازه با وضعیت pending ساخته می‌شود. کاربر می‌تواند وارد شود و
 * وضعیتش را ببیند، ولی تا وقتی مدیر تأییدش نکرده هیچ کار پرهزینه‌ای
 * انجام نمی‌دهد. این جلوی سوزاندن اعتبار API با ثبت‌نام انبوه را می‌گیرد.
 */
export function requireApproved(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'ابتدا وارد شوید.' });
  if (req.user.status === 'active') return next();

  return res.status(403).json({
    error: 'حساب شما هنوز تأیید نشده است. پس از تأیید مدیر، امکان استفاده از سامانه را خواهید داشت.',
    reason: 'pending_approval',
    status: req.user.status
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
