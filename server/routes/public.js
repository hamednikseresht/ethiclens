import express from 'express';
import { db } from '../db.js';
import { getSetting } from '../services/settings.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  metaTags, siteUrl, absoluteUrl, escapeHtml as esc, jsonLd, isoDate, faDate,
  metaDescription, publishedAnalyses, publishedCount, findBySlug,
  siteJsonLd, breadcrumbJsonLd, injectHead, withNonce
} from '../services/seo.js';
import { renderAnalysis, verdictChips, faNum, splitVerdict, md } from '../services/render-analysis.js';
import { guideContent } from '../services/guide.js';
import {
  getCategory, getCategoryBySlug, listCategories, readTags,
  analysesInCategory, countInCategory, browsableCategories,
  resolveCategory, categoryPathFor, PUBLIC_CATEGORY
} from '../services/categories.js';

export const router = express.Router();

/** Encyclopedia content — public and unauthenticated, so the guide page can read it */
router.get('/api/guide', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=120');
  res.json(guideContent());
});

/**
 * The published analyses, as JSON, for the in-app list.
 *
 * The crawled /explore page stays exactly where it is and keeps rendering on
 * the server — that is the copy search engines read, and serving it from the
 * app bundle instead would hand them an empty div. This endpoint feeds the
 * signed-in list, which can search and filter in a way a static page cannot.
 *
 * It carries no private fields: everything here is already on a public page.
 */
const EXPLORE_PER_PAGE = 12;

router.get('/api/explore', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const q = String(req.query.q || '').slice(0, 120);
  const catSlug = String(req.query.category || '').slice(0, 80);
  const category = catSlug ? getCategoryBySlug(catSlug) : null;

  // An unknown slug filters to nothing rather than silently listing
  // everything, which would look like the filter had been ignored.
  const categoryId = catSlug ? (category?.id ?? -1) : undefined;

  const total = publishedCount({ q, categoryId });
  const pages = Math.max(1, Math.ceil(total / EXPLORE_PER_PAGE));

  const items = publishedAnalyses({
    q, categoryId,
    limit: EXPLORE_PER_PAGE,
    offset: (page - 1) * EXPLORE_PER_PAGE
  }).map(it => {
    let ctx = {};
    try { ctx = JSON.parse(it.context || '{}'); } catch { ctx = {}; }
    return {
      slug: it.slug,
      title: it.public_title || it.title,
      summary: it.public_summary?.trim() || metaDescription(it.dilemma, { max: 170 }),
      author: it.public_author || null,
      domain: ctx.domain || null,
      publishedAt: it.published_at,
      views: it.views,
      category: it.category_slug ? { slug: it.category_slug, title: it.category_title } : null
    };
  });

  res.set('Cache-Control', 'private, max-age=30');
  res.json({
    items, total, page, pages,
    categories: listCategories()
      .filter(c => c.published > 0)
      .map(c => ({ slug: c.slug, title: c.title, count: c.published }))
  });
});

const FONTS = `<link rel="stylesheet" href="/css/fonts.css">`;

function shell({ head, body, bodyClass = '' }) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
${FONTS}
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/result.css">
<link rel="stylesheet" href="/css/motion.css">
<link rel="stylesheet" href="/css/public.css">
<script src="/js/analytics.js"></script>
</head>
<body class="${bodyClass}">
${body}
<script type="module">
  import { boot } from '/js/core.js';
  import { initMotion, revealOnScroll } from '/js/motion.js';
  await boot({ auth: false });
  revealOnScroll('.res-block, .stage, .pub-card');
  initMotion({ reveal: null });
</script>
</body>
</html>`;
}

function publicNav() {
  return `<header class="topbar" id="topbar"></header>`;
}

export function siteFooter() {
  return `<footer class="site pub-footer">
    <p><strong>Ethic Lens</strong> — دستیار تصمیم‌گیری اخلاقی ·
       <a href="/about">درباره ما</a> · <a href="/guide">دانشنامه</a> · <a href="/explore">تحلیل‌های عمومی</a></p>
    <p>تحلیل‌ها با کمک مدل‌های زبانی تولید می‌شوند و می‌توانند خطا داشته باشند.<br>
       این ابزار جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست.</p>
  </footer>`;
}

/* ==========================================================================
   The view counter
   --------------------------------------------------------------------------
   Every hit on a published page used to be an unconditional write. That was
   tolerable while only people reached these pages; now that they are the
   crawlable half of the site, a single crawl writes once per article and the
   number stops meaning "people who read this".

   So a viewer counts once an hour per article. The window is held in memory
   rather than a table: the count is a vanity number, not an audit, and it is
   not worth a schema and a second write to make it survive a restart.

   Bots that announce themselves are not counted at all. The ones that lie
   still get through, which is why this is a floor on the noise rather than a
   fix for it.
   ========================================================================== */
const VIEW_WINDOW_MS = 60 * 60 * 1000;
const recentViews = new Map();          // `${id}:${ip}` → timestamp
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python-requests/i;

function countView(id, req) {
  if (BOT.test(req.get('user-agent') || '')) return;

  const key = `${id}:${req.ip}`;
  const now = Date.now();
  const seen = recentViews.get(key);
  if (seen && now - seen < VIEW_WINDOW_MS) return;

  recentViews.set(key, now);

  // Swept on write rather than on a timer, so an idle process holds nothing
  // and there is no interval to clean up on shutdown.
  if (recentViews.size > 5000) {
    for (const [k, t] of recentViews) {
      if (now - t >= VIEW_WINDOW_MS) recentViews.delete(k);
    }
  }

  db.prepare('UPDATE analyses SET views = views + 1 WHERE id = ?').run(id);
}

/* ==========================================================================
   A published analysis page
   ========================================================================== */
/**
 * The address published analyses used before the category went into the path.
 * Anything already shared points here, so it moves rather than breaking.
 */
router.get('/analysis/:slug', (req, res, next) => {
  const row = findBySlug(req.params.slug);
  if (!row) return next();
  res.redirect(301, `/analysis/${categoryPathFor(row)}/${encodeURIComponent(row.slug)}`);
});

/**
 * A published analysis, at /analysis/<category>/<slug>.
 *
 * The category is in the path because a reader seeing the address should be
 * able to tell what kind of thing it is, and because it gives every article a
 * parent that is a real page rather than a flat pile.
 *
 * An analysis with no category — anything a member published — sits under the
 * members' shelf, so every article has a category segment and there is no
 * second shape of address to handle.
 */
router.get('/analysis/:category/:slug', (req, res, next) => {
  const row = findBySlug(req.params.slug);
  if (!row) return next();

  // The slug is what identifies the analysis; the category segment is there
  // for the reader. If it does not match — a stale link, or a hand-edited
  // address — redirect to the right one rather than serving the same article
  // at two addresses.
  const correct = categoryPathFor(row);
  if (req.params.category !== correct) {
    return res.redirect(301, `/analysis/${correct}/${encodeURIComponent(row.slug)}`);
  }

  let sections = {};
  try { sections = JSON.parse(row.sections) || {}; } catch { /* no sections */ }

  const title = row.public_title?.trim() || row.title;
  // The <title> and the <h1> are allowed to differ. One competes in a search
  // result, the other is read by someone already on the page.
  const seoTitle = row.seo_title?.trim() || `${title} — تحلیل اخلاقی | Ethic Lens`;
  const heading = row.h1?.trim() || title;
  const tags = readTags(row.tags);
  const category = row.category_id ? getCategory(row.category_id) : null;
  const description = row.public_summary?.trim()
    || metaDescription(sections.reframe || row.dilemma);
  const author = row.public_author?.trim() || '';
  const path = `/analysis/${categoryPathFor(row)}/${encodeURIComponent(row.slug)}`;
  const url = absoluteUrl(req, path);

  countView(row.id, req);

  const ctx = (() => { try { return JSON.parse(row.context) || {}; } catch { return {}; } })();

  /* ---- Structured data for Google ---- */
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title.slice(0, 110),
    description,
    inLanguage: 'fa-IR',
    datePublished: isoDate(row.published_at),
    dateModified: isoDate(row.published_at || row.created_at),
    author: { '@type': author ? 'Person' : 'Organization', name: author || 'Ethic Lens' },
    publisher: {
      '@type': 'Organization',
      name: getSetting('site_title') || 'Ethic Lens',
      ...(siteUrl(req) ? { url: siteUrl(req) } : {})
    },
    ...(url ? { mainEntityOfPage: { '@type': 'WebPage', '@id': url } } : {}),
    articleSection: category?.title || ctx.domain || 'فلسفه اخلاق',
    keywords: (tags.length ? tags
      : ['فلسفه اخلاق', 'تصمیم‌گیری اخلاقی', 'دوراهی اخلاقی', ctx.domain, 'اخلاق کاربردی'])
      .filter(Boolean).join('، ')
  };

  const breadcrumb = url ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: absoluteUrl(req, '/') },
      { '@type': 'ListItem', position: 2, name: 'تحلیل‌های عمومی', item: absoluteUrl(req, '/explore') },
      ...(category
        ? [{ '@type': 'ListItem', position: 3, name: category.title, item: absoluteUrl(req, `/category/${category.slug}`) }]
        : []),
      { '@type': 'ListItem', position: category ? 4 : 3, name: title, item: url }
    ]
  } : null;

  const head = [
    metaTags({
      req, title: seoTitle, description, path,
      type: 'article', publishedAt: row.published_at,
      modifiedAt: row.published_at || row.created_at, author: author || undefined
    }),
    `<script type="application/ld+json">${jsonLd(structured)}</script>`,
    breadcrumb ? `<script type="application/ld+json">${jsonLd(breadcrumb)}</script>` : ''
  ].filter(Boolean).join('\n');

  /* ---- The options, above the fold ----
     What a reader wants first is what was actually being chosen between.
     It sits in phase two of the document, a long way down, so it is lifted
     here and omitted from its usual place — the same list twice in one
     article reads worse than either position on its own. */
  const optionsBlock = sections.options ? `
      <section class="pub-options">
        <h2>گزینه‌هایی که سنجیده شده</h2>
        <div class="prose">${md(sections.options)}</div>
      </section>` : '';

  const rec = sections.recommendation
    ? `<div class="pub-lead"><strong>خلاصه پیشنهاد:</strong> ${esc(metaDescription(sections.recommendation, { max: 260 }))}</div>`
    : '';

  const body = `
${publicNav()}
<main class="wrap" id="main">
  <article>
    <div class="result-head">
      <nav class="pub-crumbs" aria-label="مسیر">
        <a href="/intro">خانه</a> ‹ <a href="/explore">تحلیل‌های عمومی</a>
        ${category ? `‹ <a href="/category/${esc(category.slug)}">${esc(category.title)}</a>` : ''}
        ‹ <span>${esc(title)}</span>
      </nav>
      ${category ? `<a class="cat-badge" href="/category/${esc(category.slug)}">${esc(category.title)}</a>` : ''}
      <h1>${esc(heading)}</h1>
      <div class="meta-row">
        ${row.published_at ? `<span class="badge">منتشرشده در ${esc(faDate(row.published_at))}</span>` : ''}
        ${author ? `<span class="badge">${esc(author)}</span>` : '<span class="badge">ناشناس</span>'}
        ${ctx.domain ? `<span class="badge">${esc(ctx.domain)}</span>` : ''}
        ${verdictChips(sections)}
      </div>
      ${rec}
      ${optionsBlock}
      <details class="pub-dilemma">
        <summary>متن دوراهی که تحلیل شده است</summary>
        <div class="result-dilemma">${esc(row.dilemma)}</div>
      </details>
      ${tags.length ? `<div class="pub-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    </div>

    ${renderAnalysis(sections, { omit: ['options'] })}

    <div class="disclaimer">
      این تحلیل با کمک یک مدل زبانی تولید شده و می‌تواند خطا داشته باشد.
      دیدگاه اخلاق جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست و مسئولیت تصمیم با خود فرد است.
    </div>
  </article>

  <aside class="pub-cta">
    <h2>دوراهی خودتان را تحلیل کنید</h2>
    <p>Ethic Lens موقعیت شما را از هشت منظر فلسفه اخلاق می‌سنجد، تعارض‌ها را نشان می‌دهد و مسیری موجه پیشنهاد می‌کند.</p>
    <a class="btn btn-primary btn-lg" href="/app/login?mode=register">شروع رایگان</a>
    <a class="btn btn-lg" href="/explore">تحلیل‌های دیگر</a>
  </aside>
</main>
${siteFooter()}`;

  res.set('Cache-Control', 'public, max-age=300');
  res.send(withNonce(shell({ head, body }), res.locals.cspNonce));
});

/* ==========================================================================
   Public analyses index
   ========================================================================== */
router.get('/explore', (req, res) => {
  const perPage = 12;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const total = publishedCount();
  const pages = Math.max(1, Math.ceil(total / perPage));
  const items = publishedAnalyses({ limit: perPage, offset: (page - 1) * perPage });

  const path = page > 1 ? `/explore?page=${page}` : '/explore';
  const description = total
    ? `${total} تحلیل اخلاقی منتشرشده — دوراهی‌های واقعی بررسی‌شده از منظر هشت مکتب فلسفه اخلاق: فضیلت‌گرایی، وظیفه‌گرایی، فایده‌گرایی، خیر مشترک، قراردادگرایی، اخلاق مراقبت و بیشتر.`
    : 'تحلیل‌های اخلاقی منتشرشده در دیدگاه اخلاق.';

  const listLd = items.length ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: (page - 1) * perPage + i + 1,
      url: absoluteUrl(req, `/analysis/${it.category_slug || PUBLIC_CATEGORY.slug}/${encodeURIComponent(it.slug)}`),
      name: (it.public_title || it.title).slice(0, 110)
    }))
  } : null;

  const head = [
    metaTags({
      req, title: page > 1 ? `تحلیل‌های عمومی — صفحه ${page} | Ethic Lens` : 'تحلیل‌های اخلاقی عمومی | Ethic Lens',
      description, path
    }),
    page > 1 ? `<link rel="prev" href="${esc(absoluteUrl(req, page === 2 ? '/explore' : `/explore?page=${page - 1}`))}">` : '',
    page < pages ? `<link rel="next" href="${esc(absoluteUrl(req, `/explore?page=${page + 1}`))}">` : '',
    listLd ? `<script type="application/ld+json">${jsonLd(listLd)}</script>` : ''
  ].filter(Boolean).join('\n');

  const cards = items.length ? items.map(it => {
    const summary = it.public_summary?.trim() || metaDescription(it.dilemma, { max: 170 });
    let ctx = {}; try { ctx = JSON.parse(it.context || '{}'); } catch {}
    return `
      <article class="pub-card">
        <a class="pub-card-title" href="/analysis/${it.category_slug || PUBLIC_CATEGORY.slug}/${encodeURIComponent(it.slug)}">${esc(it.public_title || it.title)}</a>
        <p class="pub-card-sum">${esc(summary)}</p>
        <div class="pub-card-foot">
          ${ctx.domain ? `<span class="badge">${esc(ctx.domain)}</span>` : ''}
          ${it.published_at ? `<span>${esc(faDate(it.published_at))}</span>` : ''}
          ${it.public_author ? `<span>· ${esc(it.public_author)}</span>` : ''}
        </div>
      </article>`;
  }).join('') : `
    <div class="card"><div class="empty">
      <div class="empty-icon">🌱</div>
      <h3>هنوز تحلیلی منتشر نشده است</h3>
      <p>کاربران می‌توانند تحلیل‌هایشان را به‌صورت عمومی منتشر کنند. اولین نفر باشید.</p>
      <a class="btn btn-primary" href="/">شروع تحلیل</a>
    </div></div>`;

  const pager = pages > 1 ? `
    <nav class="pager" aria-label="صفحه‌بندی">
      ${page > 1 ? `<a class="btn btn-sm" rel="prev" href="${page === 2 ? '/explore' : `/explore?page=${page - 1}`}">قبلی</a>` : ''}
      <span class="hint">صفحه ${faNum(page)} از ${faNum(pages)}</span>
      ${page < pages ? `<a class="btn btn-sm" rel="next" href="/explore?page=${page + 1}">بعدی</a>` : ''}
    </nav>` : '';

  /* ---- The shelves ----
     A reader arriving here wants a subject before a list, so the categories
     come first and the recent posts follow. Only shelves with something on
     them appear: an empty category is a dead end for a reader and a thin
     page for a crawler. They are hidden entirely on page two and beyond,
     where someone is already reading a list and does not need the index
     repeated above it. */
  const shelves = browsableCategories();
  const shelfCards = page === 1 && shelves.length ? `
    <nav class="cat-grid" aria-label="دسته‌بندی‌ها">
      ${shelves.map(c => `
        <a class="cat-card" href="/category/${esc(c.slug)}">
          <span class="cat-card-title">${esc(c.title)}</span>
          ${c.description ? `<span class="cat-card-desc">${esc(c.description)}</span>` : ''}
          <span class="cat-card-count">${faNum(c.published)} تحلیل</span>
        </a>`).join('')}
    </nav>` : '';

  const body = `
${publicNav()}
<main class="wrap" id="main">
  <div class="pub-head">
    <h1>تحلیل‌های اخلاقی عمومی</h1>
    <p>
      دوراهی‌های واقعی که کاربران Ethic Lens تحلیل کرده و برای استفاده دیگران منتشر کرده‌اند.
      هر تحلیل موقعیت را از هشت منظر فلسفه اخلاق می‌سنجد و از پنج دروازه تصمیم می‌گذراند.
    </p>
    ${total ? `<p class="hint">${faNum(total)} تحلیل منتشرشده</p>` : ''}
  </div>

  ${shelfCards}

  ${page === 1 && shelves.length ? '<h2 class="pub-sec">تازه‌ترین‌ها</h2>' : ''}
  <div class="pub-grid">${cards}</div>
  ${pager}
</main>
${siteFooter()}`;

  res.set('Cache-Control', 'public, max-age=600');
  res.send(withNonce(shell({ head, body }), res.locals.cspNonce));
});

/* ==========================================================================
   robots.txt and the sitemap
   ========================================================================== */
router.get('/robots.txt', (req, res) => {
  const base = siteUrl(req);
  res.type('text/plain').send(
// The root is the application now, so it is no longer an allowed path: the
// crawlable pages are the ones listed here, and everything the app owns is
// behind a login where there is nothing to index.
`User-agent: *
Allow: /intro
Allow: /about
Allow: /guide
Allow: /explore
Allow: /analysis/
Allow: /category/

# صفحه‌های خصوصی و درون‌برنامه‌ای نباید ایندکس شوند
Disallow: /$
Disallow: /dashboard
Disallow: /history
Disallow: /explore
Disallow: /guide
Disallow: /settings
Disallow: /admin
Disallow: /login
Disallow: /api/

${base ? `Sitemap: ${base}/sitemap.xml` : ''}`);
});

router.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  if (!base) return res.status(503).type('text/plain')
    .send('نشانی سایت تنظیم نشده است. در پنل مدیریت «آدرس سایت» را وارد کنید.');

  const statics = [
    { loc: '/',   priority: '1.0', freq: 'weekly' },
    { loc: '/explore', priority: '0.9', freq: 'daily'  },
    { loc: '/guide',   priority: '0.8', freq: 'monthly'},
    { loc: '/about',   priority: '0.5', freq: 'yearly' }
  ];

    // Category pages are real landing pages and belong in the sitemap; one
    // with nothing published in it does not, since an empty page is exactly
    // what crawlers treat as thin content.
    const cats = listCategories().filter(c => c.published > 0);

  const posts = db.prepare(`
    SELECT a.slug, a.published_at, a.created_at, c.slug AS category_slug
    FROM analyses a LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.is_public = 1 AND a.slug IS NOT NULL AND a.status IN ('done','partial')
    ORDER BY a.published_at DESC LIMIT 20000`).all();

  const url = (loc, lastmod, freq, priority) =>
    `  <url>
    <loc>${esc(base + loc)}</loc>${lastmod ? `\n    <lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ''}
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${statics.map(s => url(s.loc, null, s.freq, s.priority)).join('\n')}
${cats.map(c => url('/category/' + c.slug, null, 'weekly', '0.8')).join('\n')}
${posts.map(p => url(`/analysis/${p.category_slug || PUBLIC_CATEGORY.slug}/${encodeURIComponent(p.slug)}`,
    isoDate(p.published_at || p.created_at), 'monthly', '0.7')).join('\n')}
</urlset>`;

  res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(xml);
});

/* ==========================================================================
   Landing and reference pages
   --------------------------------------------------------------------------
   These are static files, which means they cannot know the site's own
   address — so they shipped without a canonical link, and /guide had no
   OpenGraph or robots tag at all. Serving them through here lets the same
   metaTags() that produces the published pages produce theirs too, so all
   public pages stay consistent, and it adds the site-level structured data
   that tells Google what this domain is.

   The files are read on each request rather than cached: they change only on
   deploy, the pages are small, and a stale cache after an edit is a far more
   annoying bug than one extra read.
   ========================================================================== */
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

const SEO_PAGES = {
  '/': {
    file: 'index.html',
    title: () => getSetting('site_title') || 'دیدگاه اخلاق — Ethic Lens',
    description: () => getSetting('site_tagline') ||
      'دوراهی‌های اخلاقی‌تان را از منظر هشت مکتب بزرگ فلسفه اخلاق بررسی کنید.',
    trail: null,
    extra: req => siteJsonLd(req)
  },
  '/guide': {
    file: 'pages/guide.html',
    title: () => 'دانشنامه لنزهای اخلاقی — راهنمای هشت مکتب فلسفه اخلاق',
    description: () => 'راهنمای هشت لنز فلسفه اخلاق و فرایند پنج‌فازی تصمیم‌گیری: ' +
      'فضیلت‌گرایی، وظیفه‌گرایی، فایده‌گرایی، خیر مشترک، قراردادگرایی، اخلاق مراقبت، ' +
      'اگزیستانسیالیسم و تبارشناسی — با ارجاع به منابع اصلی.',
    trail: [{ name: 'خانه', path: '/' }, { name: 'دانشنامه', path: '/guide' }],
    extra: req => [{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'دانشنامه لنزهای اخلاقی',
      inLanguage: 'fa-IR',
      author: { '@type': 'Organization', name: getSetting('site_title') || 'Ethic Lens' },
      publisher: { '@type': 'Organization', name: getSetting('site_title') || 'Ethic Lens' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(req, '/guide') }
    }]
  },
  '/about': {
    file: 'pages/about.html',
    title: () => 'درباره دیدگاه اخلاق',
    description: () => 'Ethic Lens حاصل همکاری یک دانش‌آموخته فلسفه و یک مهندس نرم‌افزار است؛ ' +
      'ابزاری برای مستدل و قابل‌دفاع کردن تصمیم‌های اخلاقی روزمره.',
    trail: [{ name: 'خانه', path: '/' }, { name: 'درباره ما', path: '/about' }],
    extra: () => []
  }
};

for (const [route, page] of Object.entries(SEO_PAGES)) {
  router.get(route, (req, res, next) => {
    let html;
    try { html = fs.readFileSync(path.join(PUBLIC_DIR, page.file), 'utf8'); }
    catch { return next(); }

    const blocks = [
      metaTags({ req, title: page.title(), description: page.description(), path: route }),
      ...(page.trail ? [`<script type="application/ld+json">${jsonLd(breadcrumbJsonLd(req, page.trail))}</script>`] : []),
      ...page.extra(req).map(o => `<script type="application/ld+json">${jsonLd(o)}</script>`)
    ];

    // The site footer is the only set of internal links these pages carry in
    // their raw HTML — their top bar is built by script, so a crawler reading
    // the response alone would find nothing to follow out of them.
    html = html.replace('</body>', `${siteFooter()}\n</body>`);

    // Identical for every visitor — no session data is injected — so this can
    // be cached publicly. Kept short because an admin's edit to the guide
    // should show up in minutes, not hours.
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(withNonce(injectHead(html, blocks.join('\n')), res.locals.cspNonce));
  });
}

/* ==========================================================================
   Category listing
   --------------------------------------------------------------------------
   A shelf of published analyses under one heading. Worth having as a real
   page rather than a filter on /explore: it gives each subject a stable
   address that can be linked to and indexed on its own.
   ========================================================================== */
router.get('/category/:slug', (req, res, next) => {
  const cat = resolveCategory(req.params.slug);
  if (!cat) return next();

  const perPage = 12;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const total = countInCategory(cat.id);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const items = analysesInCategory(cat.id, { limit: perPage, offset: (page - 1) * perPage });

  const path = page > 1 ? `/category/${cat.slug}?page=${page}` : `/category/${cat.slug}`;
  const description = cat.description?.trim()
    || `${total} تحلیل اخلاقی منتشرشده در دسته «${cat.title}» — بررسی‌شده از منظر هشت مکتب فلسفه اخلاق.`;

  const head = [
    metaTags({
      req,
      title: `${cat.title} — تحلیل‌های اخلاقی | ${getSetting('site_title') || 'Ethic Lens'}`,
      description, path
    }),
    `<script type="application/ld+json">${jsonLd(breadcrumbJsonLd(req, [
      { name: 'خانه', path: '/' },
      { name: 'تحلیل‌های عمومی', path: '/explore' },
      { name: cat.title, path: `/category/${cat.slug}` }
    ]))}</script>`,
    // An ItemList tells Google this is a collection rather than an article,
    // which is what keeps a category page out of the "thin content" bucket.
    `<script type="application/ld+json">${jsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: cat.title,
      description,
      inLanguage: 'fa-IR',
      ...(siteUrl(req) ? { url: absoluteUrl(req, `/category/${cat.slug}`) } : {}),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: total,
        itemListElement: items.map((a, i) => ({
          '@type': 'ListItem',
          position: (page - 1) * perPage + i + 1,
          name: a.h1?.trim() || a.public_title?.trim() || a.title,
          url: absoluteUrl(req, `/analysis/${cat.slug}/${encodeURIComponent(a.slug)}`)
        }))
      }
    })}</script>`
  ].join('\n');

  const cards = items.map(a => {
    const t = a.h1?.trim() || a.public_title?.trim() || a.title;
    const tags = readTags(a.tags);
    return `
      <article class="pub-card">
        <h2><a href="/analysis/${cat.slug}/${encodeURIComponent(a.slug)}">${esc(t)}</a></h2>
        <p>${esc(a.public_summary || '')}</p>
        <div class="pub-card-meta">
          ${a.published_at ? `<span>${esc(faDate(a.published_at))}</span>` : ''}
          ${a.public_author ? `<span>${esc(a.public_author)}</span>` : '<span>ناشناس</span>'}
          <span>${faNum(a.views || 0)} بازدید</span>
        </div>
        ${tags.length ? `<div class="pub-tags">${tags.slice(0, 5).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      </article>`;
  }).join('');

  const pager = pages > 1 ? `
    <nav class="pub-pager" aria-label="صفحه‌بندی">
      ${page > 1 ? `<a class="btn btn-sm" href="/category/${esc(cat.slug)}?page=${page - 1}">→ قبلی</a>` : ''}
      <span class="hint">صفحه ${faNum(page)} از ${faNum(pages)}</span>
      ${page < pages ? `<a class="btn btn-sm" href="/category/${esc(cat.slug)}?page=${page + 1}">بعدی ←</a>` : ''}
    </nav>` : '';

  const body = `
${publicNav()}
<main class="wrap" id="main">
  <nav class="pub-crumbs" aria-label="مسیر">
    <a href="/intro">خانه</a> ‹ <a href="/explore">تحلیل‌های عمومی</a> ‹ <span>${esc(cat.title)}</span>
  </nav>
  <div class="pub-head">
    <h1>${esc(cat.title)}</h1>
    <p>${esc(description)}</p>
  </div>
  ${items.length
    ? `<div class="pub-grid">${cards}</div>${pager}`
    : '<div class="empty"><div class="empty-icon">📂</div><h3>هنوز تحلیلی در این دسته منتشر نشده</h3><a class="btn" href="/explore">دیدن همه تحلیل‌ها</a></div>'}
</main>
${siteFooter()}`;

  res.set('Cache-Control', 'public, max-age=300');
  res.send(withNonce(shell({ head, body }), res.locals.cspNonce));
});
