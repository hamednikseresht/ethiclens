import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAnalysis } from './render-analysis.js';
import { escapeHtml as esc, faDate } from './seo.js';

/**
 * An analysis as a standalone document.
 *
 * This is what someone attaches to an email or hands to the person they are
 * deciding about, so it has to survive leaving the site: the stylesheets and
 * the four Shabnam faces are read off disk and inlined, and nothing here
 * fetches anything at render time. Opened from a downloads folder with no
 * network it looks exactly as it did in the app.
 *
 * The same document is what the PDF comes from. Rather than rendering PDF
 * server-side — which for Persian means implementing Arabic shaping and
 * bidirectional layout on top of a drawing library, and getting worse text
 * than a browser produces — the print path opens this in the browser and
 * lets it print. The result has real selectable Persian text, live links and
 * the correct RTL layout, and costs no dependency.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'public');

const read = (rel) => {
  try { return fs.readFileSync(path.join(PUBLIC, rel), 'utf8'); }
  catch { return ''; }
};

/** Font files as data URIs, so the document carries its own typeface. */
function inlineFonts() {
  const faces = [
    ['Shabnam-Light.woff2', 300],
    ['Shabnam.woff2', 400],
    ['Shabnam-Medium.woff2', 500],
    ['Shabnam-Bold.woff2', 700]
  ];
  return faces.map(([file, weight]) => {
    let b64;
    try { b64 = fs.readFileSync(path.join(PUBLIC, 'fonts', file)).toString('base64'); }
    catch { return ''; }
    return `@font-face{font-family:Shabnam;font-style:normal;font-weight:${weight};` +
           `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  }).join('');
}

/* Read once: these files do not change between requests, and a 300KB base64
   font re-encoded on every export is pure waste. */
let cachedCss = null;
function styles() {
  if (cachedCss === null) {
    cachedCss = [
      inlineFonts(),
      'body{font-family:Shabnam,system-ui,sans-serif}',
      read('css/app.css'),
      read('css/result.css'),
      read('css/public.css'),
      PRINT_CSS
    ].join('\n');
  }
  return cachedCss;
}

/* The page is a document now, not an app: no sticky bars, no floating button,
   and every disclosure open — a folded section in a printout is content the
   reader simply does not get. */
const PRINT_CSS = `
.topbar,.fab,#toasts,.no-print{display:none!important}
.wrap{max-width:900px;margin:0 auto;padding:1.5rem 1.25rem}
details.stage-more>summary{display:none!important}
details.stage-more>.stage-schools{display:grid!important}
.ex-head{border-bottom:2px solid var(--border);padding-bottom:1rem;margin-bottom:1.5rem}
.ex-title{font-size:1.45rem;font-weight:900;line-height:1.6;margin:0 0 .5rem}
.ex-meta{font-size:.8rem;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:.3rem 1rem}
.ex-dilemma{background:var(--bg-surface);border:1px solid var(--border);
            border-radius:var(--r-sm);padding:1rem 1.2rem;margin-bottom:1.5rem;
            font-size:.9rem;line-height:2;text-align:justify;white-space:pre-wrap}
.ex-foot{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--border);
         font-size:.75rem;color:var(--text-faint);line-height:1.9;text-align:center}
@media print{
  @page{margin:14mm 12mm}
  html,body{background:#fff}
  .wrap{padding:0;max-width:none}
  /* Keep a section and its heading on the same sheet. */
  .res-block,.stage,.school,.opt,.phase-label{break-inside:avoid}
  .phase-label{break-after:avoid}
  a{color:inherit;text-decoration:none}
}`;

/**
 * The whole analysis as one HTML file.
 *
 * `print` adds the script that opens the browser's print dialog on load —
 * only for the inline route, never for the downloaded file, where a document
 * that prints itself when opened would be a nasty surprise.
 */
export function analysisDocument(row, sections, { print = false } = {}) {
  const reflection = row.reflected_at ? `
    <section class="res-block">
      <h3 class="res-h"><span class="res-ic">📝</span> بازنگری</h3>
      <div class="prose res-body">
        <p><strong>تصمیمی که گرفتم:</strong> ${esc(row.decision || '—')}</p>
        ${row.reflection ? `<p>${esc(row.reflection)}</p>` : ''}
        <p><em>ثبت‌شده در ${esc(faDate(row.reflected_at) || row.reflected_at)}</em></p>
      </div>
    </section>` : '';

  const meta = [
    row.created_at && `تاریخ تحلیل: ${esc(faDate(row.created_at) || row.created_at)}`,
    row.model && `مدل: <span dir="ltr">${esc(row.model)}</span>`
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(row.title || 'تحلیل اخلاقی')} — دیدگاه اخلاق</title>
<style>${styles()}</style>
</head>
<body>
<main class="wrap">
  <header class="ex-head">
    <h1 class="ex-title">${esc(row.title || 'تحلیل اخلاقی')}</h1>
    <div class="ex-meta">${meta.join('')}</div>
  </header>

  ${row.dilemma ? `<section>
    <h3 class="res-h"><span class="res-ic">✍️</span> شرح دوراهی</h3>
    <div class="ex-dilemma">${esc(row.dilemma)}</div>
  </section>` : ''}

  ${renderAnalysis(sections)}
  ${reflection}

  <footer class="ex-foot">
    <p><strong>Ethic Lens — دیدگاه اخلاق</strong> · ethiclens.ir</p>
    <p>این تحلیل با کمک یک مدل زبانی تولید شده و می‌تواند خطا داشته باشد.
       تصمیم نهایی و مسئولیت آن با شماست.
       این ابزار جایگزین مشاوره حقوقی، پزشکی یا روان‌شناختی نیست.</p>
  </footer>
</main>
${print ? `<script>
  // Wait for the fonts: printing before they resolve lays the page out in a
  // fallback face and the PDF keeps those line breaks.
  (document.fonts ? document.fonts.ready : Promise.resolve())
    .then(() => setTimeout(() => window.print(), 120));
</script>` : ''}
</body>
</html>`;
}

/**
 * A Content-Disposition value carrying a Persian filename.
 *
 * Two names are sent because they are read by different clients: `filename`
 * is a plain ASCII fallback, and `filename*` is the RFC 5987 UTF-8 form that
 * every current browser prefers. Sending only the Persian one gets it mangled
 * or dropped; sending only the ASCII one names every download the same.
 */
export function attachmentHeader(row, ext) {
  const title = String(row.title || 'تحلیل')
    .replace(/[\\/:*?"<>|\r\n]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'تحلیل';
  const utf8 = encodeURIComponent(`${title}-${row.id}.${ext}`);
  return `attachment; filename="analysis-${row.id}.${ext}"; filename*=UTF-8''${utf8}`;
}
