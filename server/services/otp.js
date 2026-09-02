import crypto from 'node:crypto';
import { db } from '../db.js';

/**
 * Six-digit one-time codes for email ownership and password reset.
 *
 * These reuse the email_tokens table, but they are NOT interchangeable with
 * the long random link tokens in mail.js, and the difference matters.
 *
 * A link token is 32 random bytes: guessing one is not a threat model. A
 * six-digit code has a million possibilities, which is small enough that two
 * things become real problems:
 *
 *   1. Global lookup. mail.js finds a token by hash alone, with no idea whose
 *      it is. That is safe when the token is unguessable, but for short codes
 *      it would let an attacker brute-force the space and match *any* live
 *      code — they would not even need to target a particular account, which
 *      makes success far likelier than one-in-a-million suggests. So the hash
 *      here is salted with the user id and the purpose: a code cannot be
 *      looked up without already knowing whose account it belongs to.
 *
 *   2. Unlimited guesses. A million tries is minutes of scripted work, so a
 *      code dies after MAX_ATTEMPTS wrong answers rather than lasting its
 *      full lifetime.
 *
 * Salting also fixes a quieter bug: token_hash is UNIQUE, so two users who
 * happened to get the same six digits would collide on insert. Mixing the
 * user id in makes their hashes differ.
 */

export const OTP_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

/** Codes are always six digits, zero-padded, so 000123 is a valid code. */
const DIGITS = 6;
const MAX_CODE = 10 ** DIGITS;

const scopedHash = (userId, purpose, code) =>
  crypto.createHash('sha256')
        .update(`${userId}:${purpose}:${String(code).trim()}`)
        .digest('hex');

/**
 * Generate a code and store only its salted hash.
 *
 * randomInt is used rather than Math.random: the latter is seeded predictably
 * and is not fit to generate anything an attacker would like to guess.
 */
export function createOtp(userId, purpose, ip = null) {
  const code = String(crypto.randomInt(0, MAX_CODE)).padStart(DIGITS, '0');

  // Any earlier unused code for this purpose stops working the moment a new
  // one is issued, so a resend cannot leave two valid codes in circulation.
  db.prepare(`UPDATE email_tokens SET used_at = datetime('now')
              WHERE user_id = ? AND purpose = ? AND used_at IS NULL`).run(userId, purpose);

  db.prepare(`
    INSERT INTO email_tokens (user_id, token_hash, purpose, expires_at, ip)
    VALUES (?,?,?, datetime('now', '+${OTP_TTL_MINUTES} minutes'), ?)`)
    .run(userId, scopedHash(userId, purpose, code), purpose, ip);

  return code;
}

/**
 * Check a code against one specific user.
 *
 * Returns { ok } or { ok: false, reason, attemptsLeft }. Wrong attempts are
 * counted against the live code, so the caller does not have to.
 */
export function verifyOtp(userId, purpose, code) {
  // Accept Persian and Arabic digits, and tolerate spaces or dashes that
  // people add when copying a code out of an email.
  const clean = String(code ?? '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\D/g, '');

  if (!/^\d{6}$/.test(clean)) return { ok: false, reason: 'malformed' };

  // The newest row is fetched whether or not it is spent, so a dead code can
  // be explained accurately. Filtering on used_at IS NULL would report a
  // burnt-out code as "no code was issued", which reads like a system fault
  // and sends the user looking in the wrong place.
  const row = db.prepare(`
    SELECT * FROM email_tokens
    WHERE user_id = ? AND purpose = ?
    ORDER BY id DESC LIMIT 1`).get(userId, purpose);

  if (!row) return { ok: false, reason: 'none' };
  if (row.used_at) {
    return { ok: false, reason: row.attempts >= MAX_ATTEMPTS ? 'locked' : 'used' };
  }

  const expired = db.prepare("SELECT datetime('now') > ? AS x").get(row.expires_at).x;
  if (expired) return { ok: false, reason: 'expired' };

  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
    return { ok: false, reason: 'locked' };
  }

  if (row.token_hash !== scopedHash(userId, purpose, clean)) {
    const attempts = row.attempts + 1;
    db.prepare('UPDATE email_tokens SET attempts = ? WHERE id = ?').run(attempts, row.id);
    // Burn the code on the last allowed miss rather than waiting for one more
    // request, so the attacker gets exactly MAX_ATTEMPTS tries and no more.
    if (attempts >= MAX_ATTEMPTS) {
      db.prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  db.prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return { ok: true };
}

/** Seconds since the last code was issued — drives the resend cooldown. */
export function secondsSinceLastOtp(userId, purpose) {
  const row = db.prepare(`
    SELECT CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) s
    FROM email_tokens WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1`)
    .get(userId, purpose);
  return row ? row.s : Infinity;
}

/** Persian message for a failure reason, so routes do not each invent one. */
export function otpError(reason, attemptsLeft) {
  switch (reason) {
    case 'malformed': return 'کد باید شش رقم باشد.';
    case 'none':      return 'کدی برای این حساب صادر نشده است. کد تازه بخواهید.';
    case 'used':      return 'این کد قبلاً استفاده شده است. اگر لازم دارید، کد تازه بخواهید.';
    case 'expired':   return `کد منقضی شده است. کدها ${OTP_TTL_MINUTES} دقیقه اعتبار دارند — کد تازه بخواهید.`;
    case 'locked':    return 'تعداد تلاش‌های نادرست زیاد بود و این کد باطل شد. کد تازه بخواهید.';
    case 'wrong':     return attemptsLeft > 0
                        ? `کد نادرست است. ${attemptsLeft} تلاش دیگر باقی مانده.`
                        : 'کد نادرست است.';
    default:          return 'کد معتبر نیست.';
  }
}
