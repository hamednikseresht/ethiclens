import express from 'express';
import { db } from '../db.js';
import { getSetting } from '../services/settings.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  metaTags, siteUrl, absoluteUrl, escapeHtml as esc, jsonLd, isoDate, faDate,
  metaDescription, publishedAnalyses, publishedCount, findBySlug,
  siteJsonLd, breadcrumbJsonLd, injectHead
} from '../services/seo.js';
import { renderAnalysis, verdictChips, faNum, splitVerdict } from '../services/render-analysis.js';
import { guideContent } from '../services/guide.js';
import {
  getCategory, getCategoryBySlug, listCategories, readTags,
  analysesInCategory, countInCategory
} from '../services/categories.js';

export const router = express.Router();

/** Encyclopedia content — public and unauthenticated, so the guide page can read it */
router.get('/api/guide', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=120');
  res.json(guideContent());
});

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Markazi+Text:wght@400;500;600;700&display=swap" rel="stylesheet">`;

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

function siteFooter() {
  return `<footer class="site pub-footer">
    <p><strong>Ethic Lens</strong> — دستیار تصمیم‌گیری اخلاقی ·
       <a href="/about">درباره ما</a> · <a href="/guide">دانشنامه</a> · <a href="/explore">تحلیل‌های عمومی</a></p>
    <p>تحلیل‌ها با کمک مدل‌های زبانی تولید می‌شوند و می‌توانند خطا داشته باشند.<br>
       این ابزار جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست.</p>
  </footer>`;
}

/* ==========================================================================
   A published analysis page
   ========================================================================== */
router.get('/a/:slug', (req, res, next) => {
  const row = findBySlug(req.params.slug);
  if (!row) return next();

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
  const path = `/a/${encodeURIComponent(row.slug)}`;
  const url = absoluteUrl(req, path);

  db.prepare('UPDATE analyses SET views = views + 1 WHERE id = ?').run(row.id);

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
      { '@type': 'ListItem', position: 1, name: 'خانه', item: siteUrl(req) },
      { '@type': 'ListItem', position: 2, name: 'تحلیل‌های عمومی', item: absoluteUrl(req, '/explore') },
      ...(category
        ? [{ '@type': 'ListItem', position: 3, name: category.title, item: absoluteUrl(req, `/c/${category.slug}`) }]
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

  const rec = sections.recommendation
    ? `<div class="pub-lead"><strong>خلاصه پیشنهاد:</strong> ${esc(metaDescription(sections.recommendation, { max: 260 }))}</div>`
    : '';

  const body = `
${publicNav()}
<main class="wrap" id="main">
  <article>
    <div class="result-head">
      <nav class="pub-crumbs" aria-label="مسیر">
        <a href="/">خانه</a> ‹ <a href="/explore">تحلیل‌های عمومی</a>
        ${category ? `‹ <a href="/c/${esc(category.slug)}">${esc(category.title)}</a>` : ''}
        ‹ <span>${esc(title)}</span>
      </nav>
      ${category ? `<a class="cat-badge" href="/c/${esc(category.slug)}">${esc(category.title)}</a>` : ''}
      <h1>${esc(heading)}</h1>
      <div class="meta-row">
        ${row.published_at ? `<span class="badge">منتشرشده در ${esc(faDate(row.published_at))}</span>` : ''}
        ${author ? `<span class="badge">${esc(author)}</span>` : '<span class="badge">ناشناس</span>'}
        ${ctx.domain ? `<span class="badge">${esc(ctx.domain)}</span>` : ''}
        ${verdictChips(sections)}
      </div>
      ${rec}
      <details class="pub-dilemma">
        <summary>متن دوراهی که تحلیل شده است</summary>
        <div class="result-dilemma">${esc(row.dilemma)}</div>
      </details>
      ${tags.length ? `<div class="pub-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    </div>

    ${renderAnalysis(sections)}

    <div class="disclaimer">
      این تحلیل با کمک یک مدل زبانی تولید شده و می‌تواند خطا داشته باشد.
      دیدگاه اخلاق جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست و مسئولیت تصمیم با خود فرد است.
    </div>
  </article>

  <aside class="pub-cta">
    <h2>دوراهی خودتان را تحلیل کنید</h2>
    <p>Ethic Lens موقعیت شما را از هشت منظر فلسفه اخلاق می‌سنجد، تعارض‌ها را نشان می‌دهد و مسیری موجه پیشنهاد می‌کند.</p>
    <a class="btn btn-primary btn-lg" href="/login?mode=register">شروع رایگان</a>
    <a class="btn btn-lg" href="/explore">تحلیل‌های دیگر</a>
  </aside>
</main>
${siteFooter()}`;

  res.set('Cache-Control', 'public, max-age=300');
  res.send(shell({ head, body }));
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
      url: absoluteUrl(req, `/a/${encodeURIComponent(it.slug)}`),
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
        <a class="pub-card-title" href="/a/${encodeURIComponent(it.slug)}">${esc(it.public_title || it.title)}</a>
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
      <a class="btn btn-primary" href="/app">شروع تحلیل</a>
    </div></div>`;

  const pager = pages > 1 ? `
    <nav class="pager" aria-label="صفحه‌بندی">
      ${page > 1 ? `<a class="btn btn-sm" rel="prev" href="${page === 2 ? '/explore' : `/explore?page=${page - 1}`}">قبلی</a>` : ''}
      <span class="hint">صفحه ${faNum(page)} از ${faNum(pages)}</span>
      ${page < pages ? `<a class="btn btn-sm" rel="next" href="/explore?page=${page + 1}">بعدی</a>` : ''}
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

  <div class="pub-grid">${cards}</div>
  ${pager}
</main>
${siteFooter()}`;

  res.set('Cache-Control', 'public, max-age=600');
  res.send(shell({ head, body }));
});

/* ==========================================================================
   robots.txt and the sitemap
   ========================================================================== */
router.get('/robots.txt', (req, res) => {
  const base = siteUrl(req);
  res.type('text/plain').send(
`User-agent: *
Allow: /$
Allow: /about
Allow: /guide
Allow: /explore
Allow: /a/

# صفحه‌های خصوصی و درون‌برنامه‌ای نباید ایندکس شوند
Disallow: /app
Disallow: /dashboard
Disallow: /history
Disallow: /analysis
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
    { loc: '/',        priority: '1.0', freq: 'weekly' },
    { loc: '/explore', priority: '0.9', freq: 'daily'  },
    { loc: '/guide',   priority: '0.8', freq: 'monthly'},
    { loc: '/about',   priority: '0.5', freq: 'yearly' }
  ];

    // Category pages are real landing pages and belong in the sitemap; one
    // with nothing published in it does not, since an empty page is exactly
    // what crawlers treat as thin content.
    const cats = listCategories().filter(c => c.published > 0);

  const posts = db.prepare(`
    SELECT slug, published_at, created_at FROM analyses
    WHERE is_public = 1 AND slug IS NOT NULL AND status IN ('done','partial')
    ORDER BY published_at DESC LIMIT 20000`).all();

  const url = (loc, lastmod, freq, priority) =>
    `  <url>
    <loc>${esc(base + loc)}</loc>${lastmod ? `\n    <lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ''}
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${statics.map(s => url(s.loc, null, s.freq, s.priority)).join('\n')}
${cats.map(c => url('/c/' + c.slug, null, 'weekly', '0.8')).join('\n')}
${posts.map(p => url(`/a/${encodeURIComponent(p.slug)}`,
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

    res.type('html').send(injectHead(html, blocks.join('\n')));
  });
}

/* ==========================================================================
   Category listing
   --------------------------------------------------------------------------
   A shelf of published analyses under one heading. Worth having as a real
   page rather than a filter on /explore: it gives each subject a stable
   address that can be linked to and indexed on its own.
   ========================================================================== */
router.get('/c/:slug', (req, res, next) => {
  const cat = getCategoryBySlug(req.params.slug);
  if (!cat) return next();

  const perPage = 12;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const total = countInCategory(cat.id);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const items = analysesInCategory(cat.id, { limit: perPage, offset: (page - 1) * perPage });

  const path = page > 1 ? `/c/${cat.slug}?page=${page}` : `/c/${cat.slug}`;
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
      { name: cat.title, path: `/c/${cat.slug}` }
    ]))}</script>`,
    // An ItemList tells Google this is a collection rather than an article,
    // which is what keeps a category page out of the "thin content" bucket.
    `<script type="application/ld+json">${jsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: cat.title,
      description,
      inLanguage: 'fa-IR',
      ...(siteUrl(req) ? { url: absoluteUrl(req, `/c/${cat.slug}`) } : {}),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: total,
        itemListElement: items.map((a, i) => ({
          '@type': 'ListItem',
          position: (page - 1) * perPage + i + 1,
          name: a.h1?.trim() || a.public_title?.trim() || a.title,
          url: absoluteUrl(req, `/a/${encodeURIComponent(a.slug)}`)
        }))
      }
    })}</script>`
  ].join('\n');

  const cards = items.map(a => {
    const t = a.h1?.trim() || a.public_title?.trim() || a.title;
    const tags = readTags(a.tags);
    return `
      <article class="pub-card">
        <h2><a href="/a/${encodeURIComponent(a.slug)}">${esc(t)}</a></h2>
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
      ${page > 1 ? `<a class="btn btn-sm" href="/c/${esc(cat.slug)}?page=${page - 1}">→ قبلی</a>` : ''}
      <span class="hint">صفحه ${faNum(page)} از ${faNum(pages)}</span>
      ${page < pages ? `<a class="btn btn-sm" href="/c/${esc(cat.slug)}?page=${page + 1}">بعدی ←</a>` : ''}
    </nav>` : '';

  const body = `
${publicNav()}
<main class="wrap" id="main">
  <nav class="pub-crumbs" aria-label="مسیر">
    <a href="/">خانه</a> ‹ <a href="/explore">تحلیل‌های عمومی</a> ‹ <span>${esc(cat.title)}</span>
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
  res.send(shell({ head, body }));
});
