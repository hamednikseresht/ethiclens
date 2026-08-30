import express from 'express';
import { db } from '../db.js';
import { getSetting } from '../services/settings.js';
import {
  metaTags, siteUrl, absoluteUrl, escapeHtml as esc, jsonLd, isoDate, faDate,
  metaDescription, publishedAnalyses, publishedCount, findBySlug
} from '../services/seo.js';
import { renderAnalysis, verdictChips, faNum, splitVerdict } from '../services/render-analysis.js';

export const router = express.Router();

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`;

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
    <p><strong>اتیکا</strong> — دستیار تصمیم‌گیری اخلاقی ·
       <a href="/about">درباره ما</a> · <a href="/guide">دانشنامه</a> · <a href="/explore">تحلیل‌های عمومی</a></p>
    <p>تحلیل‌ها با کمک مدل‌های زبانی تولید می‌شوند و می‌توانند خطا داشته باشند.<br>
       این ابزار جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست.</p>
  </footer>`;
}

/* ==========================================================================
   صفحه یک تحلیل منتشرشده
   ========================================================================== */
router.get('/a/:slug', (req, res, next) => {
  const row = findBySlug(req.params.slug);
  if (!row) return next();

  let sections = {};
  try { sections = JSON.parse(row.sections) || {}; } catch { /* بدون بخش */ }

  const title = row.public_title?.trim() || row.title;
  const description = row.public_summary?.trim()
    || metaDescription(sections.reframe || row.dilemma);
  const author = row.public_author?.trim() || '';
  const path = `/a/${encodeURIComponent(row.slug)}`;
  const url = absoluteUrl(req, path);

  db.prepare('UPDATE analyses SET views = views + 1 WHERE id = ?').run(row.id);

  const ctx = (() => { try { return JSON.parse(row.context) || {}; } catch { return {}; } })();

  /* ---- داده ساختاریافته برای گوگل ---- */
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title.slice(0, 110),
    description,
    inLanguage: 'fa-IR',
    datePublished: isoDate(row.published_at),
    dateModified: isoDate(row.published_at || row.created_at),
    author: { '@type': author ? 'Person' : 'Organization', name: author || 'اتیکا' },
    publisher: {
      '@type': 'Organization',
      name: getSetting('site_title') || 'اتیکا',
      ...(siteUrl(req) ? { url: siteUrl(req) } : {})
    },
    ...(url ? { mainEntityOfPage: { '@type': 'WebPage', '@id': url } } : {}),
    articleSection: ctx.domain || 'فلسفه اخلاق',
    keywords: ['فلسفه اخلاق', 'تصمیم‌گیری اخلاقی', 'دوراهی اخلاقی',
               ctx.domain, 'اخلاق کاربردی'].filter(Boolean).join('، ')
  };

  const breadcrumb = url ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: siteUrl(req) },
      { '@type': 'ListItem', position: 2, name: 'تحلیل‌های عمومی', item: absoluteUrl(req, '/explore') },
      { '@type': 'ListItem', position: 3, name: title, item: url }
    ]
  } : null;

  const head = [
    metaTags({
      req, title: `${title} — تحلیل اخلاقی | اتیکا`, description, path,
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
        <a href="/">خانه</a> ‹ <a href="/explore">تحلیل‌های عمومی</a> ‹ <span>${esc(title)}</span>
      </nav>
      <h1>${esc(title)}</h1>
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
    </div>

    ${renderAnalysis(sections)}

    <div class="disclaimer">
      این تحلیل با کمک یک مدل زبانی تولید شده و می‌تواند خطا داشته باشد.
      اتیکا جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست و مسئولیت تصمیم با خود فرد است.
    </div>
  </article>

  <aside class="pub-cta">
    <h2>دوراهی خودتان را تحلیل کنید</h2>
    <p>اتیکا موقعیت شما را از هشت منظر فلسفه اخلاق می‌سنجد، تعارض‌ها را نشان می‌دهد و مسیری موجه پیشنهاد می‌کند.</p>
    <a class="btn btn-primary btn-lg" href="/login?mode=register">شروع رایگان</a>
    <a class="btn btn-lg" href="/explore">تحلیل‌های دیگر</a>
  </aside>
</main>
${siteFooter()}`;

  res.set('Cache-Control', 'public, max-age=300');
  res.send(shell({ head, body }));
});

/* ==========================================================================
   فهرست تحلیل‌های عمومی
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
    : 'تحلیل‌های اخلاقی منتشرشده در اتیکا.';

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
      req, title: page > 1 ? `تحلیل‌های عمومی — صفحه ${page} | اتیکا` : 'تحلیل‌های اخلاقی عمومی | اتیکا',
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
      دوراهی‌های واقعی که کاربران اتیکا تحلیل کرده و برای استفاده دیگران منتشر کرده‌اند.
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
   robots.txt و نقشه سایت
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

  const posts = db.prepare(`
    SELECT slug, published_at, created_at FROM analyses
    WHERE is_public = 1 AND slug IS NOT NULL AND status = 'done'
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
${posts.map(p => url(`/a/${encodeURIComponent(p.slug)}`,
    isoDate(p.published_at || p.created_at), 'monthly', '0.7')).join('\n')}
</urlset>`;

  res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(xml);
});
