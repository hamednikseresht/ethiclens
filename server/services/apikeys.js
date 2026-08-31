import crypto from 'node:crypto';
import { db } from '../db.js';

/**
 * کلیدهای API برای دسترسی برنامه‌ای.
 *
 * قالب کلید: eth_<محیط>_<۴۳ نویسه تصادفی>
 * فقط چکیده SHA-256 ذخیره می‌شود؛ خود کلید تنها یک بار — هنگام ساخت —
 * به کاربر نشان داده می‌شود. اگر پایگاه داده لو برود، با محتوای جدول
 * نمی‌شود به هیچ حسابی دسترسی گرفت.
 */

const PREFIX_LEN = 12;

const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

export function generateKey() {
  const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  const secret = crypto.randomBytes(32).toString('base64url');
  return `eth_${env}_${secret}`;
}

export function createKey(userId, name, { expiresInDays = null } = {}) {
  const key = generateKey();
  const info = db.prepare(`
    INSERT INTO api_keys (user_id, name, key_hash, prefix, expires_at)
    VALUES (?,?,?,?, ${expiresInDays ? `datetime('now','+${Number(expiresInDays)} days')` : 'NULL'})`)
    .run(userId, String(name || 'کلید بدون نام').slice(0, 60), sha(key), key.slice(0, PREFIX_LEN));

  return { id: Number(info.lastInsertRowid), key, prefix: key.slice(0, PREFIX_LEN) };
}

/**
 * کلید را می‌سنجد و در صورت اعتبار، کاربرش را برمی‌گرداند.
 * مقایسه روی چکیده انجام می‌شود، پس زمان‌بندی حساس نیست.
 */
export function verifyKey(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'missing' };
  if (!raw.startsWith('eth_')) return { ok: false, reason: 'malformed' };

  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(sha(raw));
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };

  if (row.expires_at) {
    const expired = db.prepare("SELECT datetime('now') > ? AS x").get(row.expires_at).x;
    if (expired) return { ok: false, reason: 'expired' };
  }

  const user = db.prepare(`
    SELECT id, email, name, role, tier, status, email_verified, verified_at,
           quota_override, token_override, created_at
    FROM users WHERE id = ?`).get(row.user_id);

  if (!user) return { ok: false, reason: 'invalid' };
  if (user.status !== 'active') return { ok: false, reason: 'suspended' };

  return { ok: true, user, keyRow: row };
}

/** ثبت استفاده — بی‌صدا شکست می‌خورد تا هیچ‌وقت درخواست را خراب نکند */
export function touchKey(keyId, ip) {
  try {
    db.prepare(`UPDATE api_keys SET last_used_at = datetime('now'), last_used_ip = ?,
                calls = calls + 1 WHERE id = ?`).run(ip || null, keyId);
  } catch { /* آمار استفاده نباید مانع کار شود */ }
}

export function listKeys(userId) {
  return db.prepare(`
    SELECT id, name, prefix, last_used_at, last_used_ip, calls, revoked_at, expires_at, created_at
    FROM api_keys WHERE user_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC`).all(userId);
}

export function revokeKey(userId, keyId) {
  const info = db.prepare(`
    UPDATE api_keys SET revoked_at = datetime('now')
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).run(keyId, userId);
  return info.changes > 0;
}

export function deleteKey(userId, keyId) {
  return db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
           .run(keyId, userId).changes > 0;
}

/** آمار کلیدها برای پنل مدیریت */
export function keyStats() {
  return db.prepare(`
    SELECT COUNT(*) total,
           SUM(revoked_at IS NULL) active,
           SUM(last_used_at IS NOT NULL) used,
           COALESCE(SUM(calls), 0) calls
    FROM api_keys`).get();
}

export function allKeys(limit = 100) {
  return db.prepare(`
    SELECT k.id, k.name, k.prefix, k.calls, k.last_used_at, k.revoked_at, k.created_at,
           u.email, u.name AS user_name
    FROM api_keys k JOIN users u ON u.id = k.user_id
    ORDER BY k.created_at DESC LIMIT ?`).all(limit);
}
