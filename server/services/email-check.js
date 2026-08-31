import dns from 'node:dns/promises';
import { db } from '../db.js';

/**
 * سنجش اعتبار نشانی ایمیل — بدون ارسال هیچ پیامی.
 *
 * سه لایه بررسی می‌شود:
 *   ۱. ساختار نشانی
 *   ۲. دامنه‌های یک‌بارمصرف (فهرست کوتاه و پرکاربرد)
 *   ۳. رکورد MX دامنه — یعنی آن دامنه اصلاً ایمیل می‌پذیرد یا نه
 *
 * نتیجه یک «پرچم» است نه حکم قطعی: هیچ روشی جز ارسال واقعی نمی‌تواند
 * ثابت کند صندوقی وجود دارد. پرچم فقط به مدیر کمک می‌کند هنگام تأیید
 * حساب، ثبت‌نام‌های آشکارا جعلی را زودتر تشخیص دهد.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** دامنه‌های یک‌بارمصرف پرکاربرد */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com',
  'mohmal.com', 'emailondeck.com', 'mintemail.com', 'spamgourmet.com', 'tempinbox.com',
  'discard.email', 'mailnesia.com', 'tempr.email', 'moakt.com', 'inboxkitten.com'
]);

/** دامنه‌های بسیار رایج — برای تشخیص غلط تایپی */
const COMMON = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me'];

function levenshtein(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1,
                         m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

/** دامنه‌ای که احتمالاً غلط تایپیِ یک دامنه رایج است */
function typoOf(domain) {
  for (const c of COMMON) {
    const d = levenshtein(domain, c);
    if (d > 0 && d <= 2) return c;
  }
  return null;
}

/**
 * ایمیل را می‌سنجد.
 * بازگشت: { valid: 1|0, note, checks }
 * valid=1 یعنی هیچ نشانه بدی پیدا نشد؛ valid=0 یعنی دست‌کم یک نشانه هست.
 */
export async function checkEmail(email, { timeoutMs = 5000 } = {}) {
  const addr = String(email || '').trim().toLowerCase();
  const checks = { syntax: false, disposable: false, mx: null, typo: null };

  if (!EMAIL_RE.test(addr)) {
    return { valid: 0, note: 'ساختار نشانی معتبر نیست.', checks };
  }
  checks.syntax = true;

  const domain = addr.split('@')[1];

  if (DISPOSABLE.has(domain)) {
    checks.disposable = true;
    return { valid: 0, note: `دامنه یک‌بارمصرف: ${domain}`, checks };
  }

  const typo = typoOf(domain);
  if (typo) {
    checks.typo = typo;
    return { valid: 0, note: `شاید غلط تایپی «${typo}» باشد.`, checks };
  }

  // بررسی MX: آیا این دامنه اصلاً ایمیل می‌پذیرد؟
  try {
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);
    checks.mx = Array.isArray(mx) && mx.length > 0;
    if (!checks.mx) return { valid: 0, note: `دامنه ${domain} رکورد MX ندارد.`, checks };
  } catch (e) {
    if (e.message === 'timeout') {
      // نتوانستیم بررسی کنیم — این «بد» نیست، فقط «نامعلوم» است
      return { valid: null, note: 'بررسی MX به نتیجه نرسید (مهلت تمام شد).', checks };
    }
    checks.mx = false;
    return { valid: 0, note: `دامنه ${domain} پیدا نشد یا ایمیل نمی‌پذیرد.`, checks };
  }

  return { valid: 1, note: 'ساختار، دامنه و رکورد MX سالم است.', checks };
}

/** بررسی می‌کند و نتیجه را روی کاربر ثبت می‌کند */
export async function checkAndStore(userId, email) {
  let result;
  try {
    result = await checkEmail(email);
  } catch (e) {
    result = { valid: null, note: `بررسی ناموفق: ${e.message}` };
  }

  db.prepare(`UPDATE users SET email_valid = ?, email_checked_at = datetime('now'),
              email_check_note = ? WHERE id = ?`)
    .run(result.valid, result.note, userId);

  return result;
}
