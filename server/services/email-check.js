import dns from 'node:dns/promises';
import { db } from '../db.js';

/**
 * Email address plausibility check — without sending anything.
 *
 * Three layers are inspected:
 *   1. address syntax
 *   2. disposable domains (a short list of common ones)
 *   3. the domain's MX record — whether it accepts mail at all
 *
 * The result is a flag, not a verdict: nothing short of actually sending can
 * prove a mailbox exists. The flag only helps an admin spot obviously fake
 * signups sooner when approving accounts.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Common disposable-mail domains */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com',
  'mohmal.com', 'emailondeck.com', 'mintemail.com', 'spamgourmet.com', 'tempinbox.com',
  'discard.email', 'mailnesia.com', 'tempr.email', 'moakt.com', 'inboxkitten.com'
]);

/** Very common domains — used to catch typos */
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

/** A domain that looks like a typo of a common one */
function typoOf(domain) {
  for (const c of COMMON) {
    const d = levenshtein(domain, c);
    if (d > 0 && d <= 2) return c;
  }
  return null;
}

/**
 * Check an email address.
 * Returns { valid: 1|0, note, checks }.
 * valid=1 means nothing bad was found; valid=0 means at least one signal was.
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

  // MX check: does this domain accept mail at all?
  try {
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);
    checks.mx = Array.isArray(mx) && mx.length > 0;
    if (!checks.mx) return { valid: 0, note: `دامنه ${domain} رکورد MX ندارد.`, checks };
  } catch (e) {
    if (e.message === 'timeout') {
    // We could not check — that is not "bad", only "unknown"
      return { valid: null, note: 'بررسی MX به نتیجه نرسید (مهلت تمام شد).', checks };
    }
    checks.mx = false;
    return { valid: 0, note: `دامنه ${domain} پیدا نشد یا ایمیل نمی‌پذیرد.`, checks };
  }

  return { valid: 1, note: 'ساختار، دامنه و رکورد MX سالم است.', checks };
}

/** Run the check and record the result on the user */
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
