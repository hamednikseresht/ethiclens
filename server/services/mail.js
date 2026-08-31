import crypto from 'node:crypto';
import { db } from '../db.js';
import { getSetting } from './settings.js';
import { escapeHtml as esc } from './seo.js';

/**
 * ارسال ایمیل تراکنشی.
 *
 * دو ارائه‌دهنده پشتیبانی می‌شوند و هر دو از راه API HTTP کار می‌کنند،
 * نه SMTP — یک fetch ساده است و وابستگی تازه‌ای به پروژه اضافه نمی‌کند.
 * افزودن ارائه‌دهنده تازه یعنی یک ورودی در جدول PROVIDERS پایین.
 */

export const MAIL_PROVIDERS = [
  {
    key: 'brevo',
    label: 'Brevo',
    keyHint: 'کلید با xkeysib- شروع می‌شود',
    needsDomain: false,
    docs: 'https://app.brevo.com/settings/keys/api'
  },
  {
    key: 'mailgun',
    label: 'Mailgun',
    keyHint: 'کلید ارسال (Sending API key)',
    needsDomain: true,
    docs: 'https://app.mailgun.com/settings/api_security'
  }
];

export function mailProvider() {
  const p = getSetting('mail_provider') || 'brevo';
  return MAIL_PROVIDERS.some(x => x.key === p) ? p : 'brevo';
}

export function mailConfig() {
  const provider = mailProvider();
  return {
    provider,
    apiKey: provider === 'brevo'
      ? (getSetting('brevo_api_key') || process.env.BREVO_API_KEY || '')
      : (getSetting('mailgun_api_key') || process.env.MAILGUN_API_KEY || ''),
    domain: getSetting('mailgun_domain') || process.env.MAILGUN_DOMAIN || '',
    baseUrl: (getSetting('mailgun_base_url') || process.env.MAILGUN_BASE_URL
              || 'https://api.mailgun.net').replace(/\/+$/, ''),
    fromName: getSetting('mail_from_name') || 'EthicLens',
    fromEmail: getSetting('mail_from_email') || ''
  };
}

export function mailConfigured() {
  const c = mailConfig();
  if (!c.apiKey) return false;
  // برِوو دامنه لازم ندارد؛ فقط نشانی فرستنده باید در حسابش تأیید شده باشد
  if (c.provider === 'brevo') return !!c.fromEmail;
  return !!c.domain;
}

function notConfigured(c) {
  const e = new Error(c.provider === 'brevo'
    ? 'سرویس ایمیل تنظیم نشده است. در پنل مدیریت کلید برِوو و نشانی فرستنده را وارد کنید.'
    : 'سرویس ایمیل تنظیم نشده است. در پنل مدیریت کلید و دامنه میل‌گان را وارد کنید.');
  e.code = 'MAIL_NOT_CONFIGURED';
  return e;
}

export async function sendMail({ to, subject, html, text, tag }) {
  const c = mailConfig();
  if (!mailConfigured()) throw notConfigured(c);

  const body = { to, subject, html, text: text || stripHtml(html || ''), tag };
  return c.provider === 'brevo' ? sendViaBrevo(c, body) : sendViaMailgun(c, body);
}

/* ---------------- برِوو ---------------- */
async function sendViaBrevo(c, { to, subject, html, text, tag }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': c.apiKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: c.fromName, email: c.fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      ...(tag ? { tags: [tag] } : {})
    }),
    signal: AbortSignal.timeout(20000)
  });

  const raw = await res.text().catch(() => '');
  // برِوو در موفقیت ۲۰۱ برمی‌گرداند، نه ۲۰۰
  if (!res.ok) {
    const e = new Error(brevoMessage(res.status, raw, c));
    e.status = res.status;
    e.detail = raw.slice(0, 400);
    throw e;
  }

  let id = '';
  try { id = JSON.parse(raw).messageId || ''; } catch { /* پاسخ غیر JSON */ }
  return { ok: true, id, provider: 'brevo' };
}

function brevoMessage(status, raw, c) {
  let msg = '', code = '';
  try { const j = JSON.parse(raw); msg = j?.message || ''; code = j?.code || ''; } catch { msg = String(raw).slice(0, 160); }

  if (status === 401) return 'کلید API برِوو نامعتبر است. کلید باید با xkeysib- شروع شود.';
  if (code === 'unauthorized') return 'کلید برِوو اجازه ارسال ایمیل تراکنشی ندارد.';
  if (/sender/i.test(msg)) {
    return `نشانی فرستنده «${c.fromEmail}» در برِوو تأیید نشده است. ` +
           'در پنل برِوو بخش Senders آن را اضافه و تأیید کنید.';
  }
  if (status === 402) return 'اعتبار ارسال برِوو تمام شده است.';
  if (status === 429) return 'محدودیت نرخ برِوو فعال شد. کمی بعد دوباره تلاش کنید.';
  if (status >= 500) return 'سرویس برِوو موقتاً در دسترس نیست.';
  return msg ? `برِوو: ${msg}` : `خطای سرویس ایمیل (کد ${status}).`;
}

/* ---------------- میل‌گان ---------------- */
async function sendViaMailgun(c, { to, subject, html, text, tag }) {
  const from = c.fromEmail || `no-reply@${c.domain}`;
  const form = new URLSearchParams({
    from: c.fromName ? `${c.fromName} <${from}>` : from,
    to, subject, text,
    ...(html ? { html } : {})
  });
  if (tag) form.append('o:tag', tag);

  const res = await fetch(`${c.baseUrl}/v3/${encodeURIComponent(c.domain)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`api:${c.apiKey}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form,
    signal: AbortSignal.timeout(20000)
  });

  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    const e = new Error(mailgunMessage(res.status, raw, c));
    e.status = res.status;
    e.detail = raw.slice(0, 400);
    throw e;
  }

  let id = '';
  try { id = JSON.parse(raw).id || ''; } catch { /* پاسخ غیر JSON */ }
  return { ok: true, id, provider: 'mailgun' };
}

function mailgunMessage(status, raw, c) {
  let msg = '';
  try { msg = JSON.parse(raw)?.message || ''; } catch { msg = String(raw).slice(0, 160); }

  if (status === 401) return 'کلید API میل‌گان نامعتبر است. اگر حساب اروپایی دارید، آدرس پایه را روی api.eu.mailgun.net بگذارید.';
  if (status === 404) return `دامنه «${c.domain}» در میل‌گان پیدا نشد.`;
  if (status === 400 && /free accounts|authorized recipient/i.test(msg)) {
    return 'حساب آزمایشی میل‌گان فقط به گیرندگان تأییدشده ایمیل می‌فرستد.';
  }
  if (status === 429) return 'محدودیت نرخ میل‌گان فعال شد. کمی بعد دوباره تلاش کنید.';
  return msg ? `میل‌گان: ${msg}` : `خطای سرویس ایمیل (کد ${status}).`;
}

function stripHtml(h) {
  return String(h)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ==========================================================================
   توکن‌های ایمیل
   ========================================================================== */
const TOKEN_TTL_HOURS = 24;

const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

/**
 * توکن تازه می‌سازد و فقط چکیده‌اش را ذخیره می‌کند.
 * خود توکن تنها یک بار — در ایمیل — از سامانه بیرون می‌رود؛ اگر پایگاه
 * داده لو برود، با محتوای جدول نمی‌شود حسابی را تأیید یا تصاحب کرد.
 */
export function createToken(userId, purpose = 'verify', ip = null) {
  const token = crypto.randomBytes(32).toString('base64url');

  // توکن‌های استفاده‌نشده قبلی همان کاربر باطل می‌شوند
  db.prepare(`UPDATE email_tokens SET used_at = datetime('now')
              WHERE user_id = ? AND purpose = ? AND used_at IS NULL`).run(userId, purpose);

  db.prepare(`INSERT INTO email_tokens (user_id, token_hash, purpose, expires_at, ip)
              VALUES (?,?,?, datetime('now', '+${TOKEN_TTL_HOURS} hours'), ?)`)
    .run(userId, hash(token), purpose, ip);

  return token;
}

/** توکن را مصرف می‌کند؛ در صورت اعتبار، کاربر را برمی‌گرداند */
export function consumeToken(token, purpose = 'verify') {
  if (!token) return { ok: false, reason: 'missing' };

  const row = db.prepare(
    `SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = ?`
  ).get(hash(token), purpose);

  if (!row) return { ok: false, reason: 'invalid' };
  if (row.used_at) return { ok: false, reason: 'used' };

  const expired = db.prepare("SELECT datetime('now') > ? AS x").get(row.expires_at).x;
  if (expired) return { ok: false, reason: 'expired' };

  db.prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user) return { ok: false, reason: 'invalid' };

  return { ok: true, user };
}

/** آخرین باری که برای این کاربر توکن ساخته شده — برای محدودکردن ارسال دوباره */
export function lastTokenAt(userId, purpose = 'verify') {
  return db.prepare(
    `SELECT created_at FROM email_tokens WHERE user_id = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`).get(userId, purpose)?.created_at || null;
}

export function secondsSinceLastToken(userId, purpose = 'verify') {
  const row = db.prepare(
    `SELECT CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) s
     FROM email_tokens WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1`
  ).get(userId, purpose);
  return row ? row.s : Infinity;
}

/* ==========================================================================
   قالب ایمیل
   ========================================================================== */
function layout({ title, intro, buttonLabel, buttonUrl, footer, rawUrl }) {
  const brand = getSetting('site_title') || 'EthicLens';
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="UTF-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#2563eb,#0d9488);padding:22px 28px;">
          <div style="color:#ffffff;font-size:19px;font-weight:bold;">${esc(brand)}</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 14px;font-size:19px;color:#0f172a;line-height:1.6;">${esc(title)}</h1>
          <p style="margin:0 0 22px;font-size:14px;color:#475569;line-height:2;">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
            <tr><td style="background:#2563eb;border-radius:10px;">
              <a href="${esc(buttonUrl)}"
                 style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;">
                ${esc(buttonLabel)}
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.9;">
            اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:
          </p>
          <p style="margin:0 0 22px;font-size:12px;color:#2563eb;direction:ltr;text-align:left;word-break:break-all;">
            ${esc(rawUrl)}
          </p>
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.9;border-top:1px solid #e2e8f0;padding-top:16px;">
            ${footer}
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">${esc(brand)} — دستیار تصمیم‌گیری اخلاقی</p>
    </td></tr>
  </table>
</body></html>`;
}

export function verificationEmail({ name, url }) {
  return {
    subject: `${getSetting('site_title') || 'EthicLens'} — تأیید نشانی ایمیل`,
    html: layout({
      title: 'نشانی ایمیل خود را تأیید کنید',
      intro: `${esc(name || 'سلام')}، برای فعال‌شدن حساب و شروع تحلیل، روی دکمه زیر بزنید.
              این پیوند تا ${TOKEN_TTL_HOURS} ساعت معتبر است.`,
      buttonLabel: 'تأیید ایمیل',
      buttonUrl: url,
      rawUrl: url,
      footer: 'اگر شما در EthicLens ثبت‌نام نکرده‌اید، این ایمیل را نادیده بگیرید؛ بدون تأیید، حسابی فعال نمی‌شود.'
    })
  };
}

export async function sendVerification({ user, url, tag = 'verify' }) {
  const { subject, html } = verificationEmail({ name: user.name, url });
  return sendMail({ to: user.email, subject, html, tag });
}
