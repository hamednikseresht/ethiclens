import crypto from 'node:crypto';
import { db } from '../db.js';
import { getSetting } from './settings.js';

/**
 * Public-page and search-engine helpers.
 *
 * Persian URLs are fine for Google and are shown decoded in results, so
 * Persian characters are kept in the slug on purpose — the address stays
 * readable and meaningful to a Persian-speaking reader.
 */

const ZERO_WIDTH = /[​-‏‪-‮﻿]/g;

export function slugify(text, { maxLen = 70 } = {}) {
  const base = String(text || '')
    .replace(ZERO_WIDTH, '')
    .replace(/[ً-ْ]/g, '')          // diacritics
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')       // letters, digits, spaces and hyphens only
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen)
    .replace(/-$/, '');

  return base || 'تحلیل';
}

/** Unique slug; on collision it gains a short random suffix */
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

/** Site base URL — required for canonical links and the sitemap */
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

/** Clean summary for the meta description — no markup, sized for Google */
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

/** String safe to embed inside JSON-LD */
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * The full page meta block: title, description, canonical, OpenGraph and
 * Twitter card. Every public page uses this one function so nothing is missed.
 */
export function metaTags({
  req, title, description, path = '/', type = 'website',
  publishedAt, modifiedAt, noindex = false, author
}) {
  const url = absoluteUrl(req, path);
  const siteName = getSetting('site_title') || 'Ethic Lens';
  const t = escapeHtml(title);
  const d = escapeHtml(description || '');

  // Configured in the admin panel. Left empty by default rather than shipping
  // a placeholder: an image that says nothing is not better than none.
  const configured = (getSetting('og_image') || '').trim();
  const image = configured
    ? (/^https?:\/\//i.test(configured) ? configured : absoluteUrl(req, configured))
    : '';

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

    // The card type has to follow the image, not the other way round. Every
    // page used to declare summary_large_image while the site had no image at
    // all, which asks the platform to render a large picture and then hands it
    // nothing — a blank frame is worse than the plain text card.
    image ? '<meta name="twitter:card" content="summary_large_image">'
          : '<meta name="twitter:card" content="summary">',
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : '',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,

    publishedAt ? `<meta property="article:published_time" content="${escapeHtml(isoDate(publishedAt))}">` : '',
    modifiedAt ? `<meta property="article:modified_time" content="${escapeHtml(isoDate(modifiedAt))}">` : '',
    author ? `<meta name="author" content="${escapeHtml(author)}">` : ''
  ];

  return bits.filter(Boolean).join('\n');
}

/** Convert a SQLite datetime to ISO */
export function isoDate(sqliteDate) {
  if (!sqliteDate) return '';
  const d = new Date(String(sqliteDate).includes('T')
    ? sqliteDate : String(sqliteDate).replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toISOString();
}

/** Human-readable date for display */
export function faDate(sqliteDate) {
  const iso = isoDate(sqliteDate);
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

/** List of published analyses */
/**
 * The published set, optionally narrowed.
 *
 * `q` and `categoryId` are both optional and both default to off, so the
 * server-rendered /explore page keeps calling this exactly as before and gets
 * exactly what it got before. The filters exist for the in-app list, which
 * can search where a crawled page cannot.
 */
/**
 * The WHERE clause shared by the listing and its count, written against a
 * caller-supplied table alias so the two queries — one joined, one not — can
 * use the same definition of "published" without either restating it.
 */
function publishedFilter({ q, categoryId } = {}, t = '') {
  const col = name => `${t ? t + '.' : ''}${name}`;
  const where = [
    `${col('is_public')} = 1`,
    `${col('slug')} IS NOT NULL`,
    `${col('status')} IN ('done','partial')`
  ];
  const params = [];

  if (categoryId) { where.push(`${col('category_id')} = ?`); params.push(categoryId); }

  // The dilemma is searched alongside the titles: someone looking for a topic
  // remembers the situation, not the headline an editor gave it.
  if (q && String(q).trim()) {
    where.push(`(${col('title')} LIKE ? OR ${col('public_title')} LIKE ? OR ` +
               `${col('public_summary')} LIKE ? OR ${col('dilemma')} LIKE ?)`);
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like, like);
  }

  return { sql: where.join(' AND '), params };
}

export function publishedAnalyses({ limit = 50, offset = 0, q, categoryId } = {}) {
  const { sql, params } = publishedFilter({ q, categoryId }, 'a');
  return db.prepare(`
    SELECT a.id, a.slug, a.title, a.public_title, a.public_summary, a.public_author,
           a.dilemma, a.context, a.published_at, a.created_at, a.views,
           a.category_id, c.title AS category_title, c.slug AS category_slug
    FROM analyses a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE ${sql}
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?`).all(...params, limit, offset);
}

export function publishedCount({ q, categoryId } = {}) {
  const { sql, params } = publishedFilter({ q, categoryId });
  return db.prepare(`SELECT COUNT(*) c FROM analyses WHERE ${sql}`).get(...params).c;
}

export function findBySlug(slug) {
  return db.prepare(`
    SELECT * FROM analyses
    WHERE slug = ? AND is_public = 1 AND status IN ('done','partial')`).get(String(slug));
}

/**
 * Site-level structured data for the landing page.
 *
 * WebSite and Organization are what let Google attach a name and logo to the
 * domain rather than guessing from the title tag. No SearchAction is declared
 * because the site has no search endpoint, and claiming one that 404s is
 * worse than omitting it.
 */
export function siteJsonLd(req) {
  const base = siteUrl(req);
  const name = getSetting('site_title') || 'Ethic Lens';
  const tagline = getSetting('site_tagline') || '';
  const image = (getSetting('og_image') || '').trim();

  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    ...(base ? { url: base } : {}),
    ...(image ? { logo: /^https?:\/\//i.test(image) ? image : absoluteUrl(req, image) } : {}),
    description: tagline
  };

  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    ...(base ? { url: base } : {}),
    inLanguage: 'fa-IR',
    description: tagline
  };

  return [site, org];
}

/** Breadcrumb trail for a static public page. */
export function breadcrumbJsonLd(req, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name,
      item: absoluteUrl(req, t.path)
    }))
  };
}

/**
 * Insert generated <head> content into one of the static public pages.
 *
 * These pages are plain files on disk, so they cannot know the site's own
 * address — which is exactly what a canonical link needs. Rather than move
 * them into templates, the file is read once and the generated tags are
 * spliced in before </head>. Any tag the file already carries statically is
 * dropped first, so the two copies cannot disagree.
 */
export function injectHead(html, headHtml) {
  const stripped = html
    .replace(/^[ \t]*<title>[\s\S]*?<\/title>[ \t]*\r?\n?/gim, '')
    .replace(/^[ \t]*<meta\s+name="(description|robots)"[^>]*>[ \t]*\r?\n?/gim, '')
    .replace(/^[ \t]*<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>[ \t]*\r?\n?/gim, '')
    .replace(/^[ \t]*<link\s+rel="canonical"[^>]*>[ \t]*\r?\n?/gim, '');

  return stripped.replace('</head>', `${headHtml}\n</head>`);
}

/**
 * Stamp the request's CSP nonce onto every inline script in a document.
 *
 * The policy names a nonce instead of allowing inline scripts wholesale, so a
 * script without one does not run — silently, which is the failure mode to
 * watch for. Applied to the whole document at the point of sending rather
 * than to each template, because one missed template is a page that boots to
 * a blank top bar and says nothing about why.
 *
 * Scripts with a src are given one too. They do not need it, and it costs a
 * few bytes, but the alternative is a regex that has to reason about
 * attribute order to tell them apart.
 */
export function withNonce(html, nonce) {
  if (!nonce) return html;
  return html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
}
