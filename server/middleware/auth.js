import crypto from 'node:crypto';
import { db } from '../db.js';

export function loadUser(req, _res, next) {
  req.user = null;
  if (req.session?.userId) {
    const u = db.prepare('SELECT id, email, name, role, status, daily_quota, created_at FROM users WHERE id = ?')
                .get(req.session.userId);
    if (u && u.status === 'active') req.user = u;
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
