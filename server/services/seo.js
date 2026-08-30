import crypto from 'node:crypto';
import { db } from '../db.js';
import { getSetting } from './settings.js';

/**
 * ابزارهای انتشار عمومی و بهینه‌سازی موتور جست‌وجو.
 *
 * نشانی‌های فارسی برای گوگل مشکلی ندارند و در نتایج جست‌وجو رمزگشایی‌شده
 * نمایش داده می‌شوند، پس عمداً حروف فارسی را در slug نگه می‌داریم تا
 * نشانی برای کاربر فارسی‌زبان خوانا و بامعنا بماند.
 */

const ZERO_WIDTH = /[​-‏‪-‮﻿]/g;

export function slugify(text, { maxLen = 70 } = {}) {
  const base = String(text || '')
    .replace(ZERO_WIDTH, '')
    .replace(/[ً-ْ]/g, '')          // اعراب
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')       // فقط حرف، رقم، فاصله و خط تیره
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen)
    .replace(/-$/, '');

  return base || 'تحلیل';
}

/** slug یکتا؛ در صورت برخورد، پسوند کوتاه تصادفی می‌گیرد */
export function uniqueSlug(text, excludeId = null) {
  const base = slugify(text);
  const taken = s => {
    const row = db.prepare('SELECT id FROM analyses WHERE slug = ?').get(s);
    return row && row.id !== excludeId;
  };

  if (!taken(base)) return base;
  for (let i = 0; i < 6; i++) {
    const s = `${base}-${crypto.randomBytes(2).toString('hex')}`;
    if (!taken(s)) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** نشانی پایه سایت — برای canonical و نقشه سایت لازم است */
export function siteUrl(req = null) {
  const configured = (getSetting('site_url') || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) return `${proto}://${host}`;
  }
  return '';
}

export function absoluteUrl(req, path) {
  const base = siteUrl(req);
  return base ? `${base}${path}` : path;
}

/** خلاصه تمیز برای توضیح متا — بدون نشانه‌گذاری و در طول مناسب گوگل */
export function metaDescription(text, { max = 158 } = {}) {
  const clean = String(text || '')
    .replace(ZERO_WIDTH, '')
    .replace(/^@@.*@@$/gm, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** رشته امن برای درج داخل JSON-LD */
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * بلوک کامل متای صفحه: عنوان، توضیح، canonical، OpenGraph و کارت توییتر.
 * همه صفحه‌های عمومی از همین یک تابع استفاده می‌کنند تا چیزی جا نیفتد.
 */
export function metaTags({
  req, title, description, path = '/', type = 'website',
  publishedAt, modifiedAt, noindex = false, author
}) {
  const url = absoluteUrl(req, path);
  const siteName = getSetting('site_title') || 'اتیکا';
  const t = escapeHtml(title);
  const d = escapeHtml(description || '');

  const bits = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    url ? `<link rel="canonical" href="${escapeHtml(url)}">` : '',
    noindex
      ? '<meta name="robots" content="noindex, nofollow">'
      : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',

    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    url ? `<meta property="og:url" content="${escapeHtml(url)}">` : '',
    `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
    '<meta property="og:locale" content="fa_IR">',

    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,

    publishedAt ? `<meta property="article:published_time" content="${escapeHtml(isoDate(publishedAt))}">` : '',
    modifiedAt ? `<meta property="article:modified_time" content="${escapeHtml(isoDate(modifiedAt))}">` : '',
    author ? `<meta name="author" content="${escapeHtml(author)}">` : ''
  ];

  return bits.filter(Boolean).join('\n');
}

/** تاریخ SQLite را به ISO تبدیل می‌کند */
export function isoDate(sqliteDate) {
  if (!sqliteDate) return '';
  const d = new Date(String(sqliteDate).includes('T')
    ? sqliteDate : String(sqliteDate).replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toISOString();
}

/** تاریخ خوانا برای نمایش */
export function faDate(sqliteDate) {
  const iso = isoDate(sqliteDate);
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

/** فهرست تحلیل‌های منتشرشده */
export function publishedAnalyses({ limit = 50, offset = 0 } = {}) {
  return db.prepare(`
    SELECT id, slug, title, public_title, public_summary, public_author,
           dilemma, context, published_at, created_at, views
    FROM analyses
    WHERE is_public = 1 AND slug IS NOT NULL AND status = 'done'
    ORDER BY published_at DESC
    LIMIT ? OFFSET ?`).all(limit, offset);
}

export function publishedCount() {
  return db.prepare(
    "SELECT COUNT(*) c FROM analyses WHERE is_public = 1 AND slug IS NOT NULL AND status = 'done'"
  ).get().c;
}

export function findBySlug(slug) {
  return db.prepare(`
    SELECT * FROM analyses
    WHERE slug = ? AND is_public = 1 AND status = 'done'`).get(String(slug));
}
