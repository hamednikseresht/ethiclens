/* ==========================================================================
   Exporting an analysis — PDF via the browser print dialog, and standalone HTML
   ========================================================================== */
import { esc, faDate, toast } from './core.js';
import { gateSummary } from './result.js';

/**
 * Injects a print-only header at the top of the page.
 * Hidden in normal display, visible only in the PDF.
 */
function ensurePrintHead(meta) {
  let el = document.querySelector('.print-head');
  if (!el) {
    el = document.createElement('div');
    el.className = 'print-head';
    document.querySelector('main')?.prepend(el);
  }
  el.innerHTML = `
    <div class="ph-brand">دیدگاه اخلاق — تحلیل تصمیم اخلاقی</div>
    <div class="ph-sub">
      ${esc(meta.title || '')}
      ${meta.createdAt ? ` · ${esc(faDate(meta.createdAt))}` : ''}
      ${meta.model ? ` · مدل: ${esc(meta.model)}` : ''}
    </div>`;
}

/**
 * PDF export. The browser handles Persian shaping and pagination itself,
 * so right-to-left text stays correct and selectable in the PDF.
 */
export function exportPdf(meta = {}) {
  ensurePrintHead(meta);
  const restoreTitle = document.title;
  // The suggested filename in the save dialog comes from the document title
  document.title = `Ethic Lens — ${(meta.title || 'تحلیل اخلاقی').slice(0, 60)}`;

  const done = () => { document.title = restoreTitle; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);

  // Wait a frame so the print header lands in the DOM first
  requestAnimationFrame(() => setTimeout(() => window.print(), 60));
}

/** Export buttons — the action bar shared by the analysis and view pages */
export function exportBar({ analysisId, meta, extra = '' }) {
  return `
    <div class="row no-print" style="gap:.4rem;flex-wrap:wrap">
      ${extra}
      <button class="btn btn-sm btn-primary" data-export="pdf">
        <span aria-hidden="true">📄</span> خروجی PDF
      </button>
      <div class="dropdown" style="position:relative">
        <button class="btn btn-sm" data-export="menu" aria-haspopup="true">قالب‌های دیگر ▾</button>
      </div>
    </div>`;
}

/**
 * Wire up the export bar's events.
 * host: the element the buttons live inside.
 */
export function wireExport(host, { analysisId, meta, sections }) {
  if (!host) return;
  host.addEventListener('click', e => {
    const btn = e.target.closest('[data-export]');
    if (!btn) return;

    if (btn.dataset.export === 'pdf') {
      exportPdf(meta);
      return;
    }

    if (btn.dataset.export === 'menu') {
      const existing = host.querySelector('.export-pop');
      if (existing) { existing.remove(); return; }

      const pop = document.createElement('div');
      pop.className = 'usermenu-pop export-pop';
      pop.style.cssText = 'inset-inline-end:0;top:calc(100% + .4rem);min-width:210px';
      pop.innerHTML = `
        <button data-fmt="html">🌐 صفحه HTML مستقل</button>
        ${analysisId ? `<a href="/api/history/${analysisId}/export">📝 فایل Markdown</a>` : ''}
        <button data-fmt="copy">📋 کپی متن تحلیل</button>`;
      btn.parentElement.appendChild(pop);

      pop.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-fmt]');
        if (!b) return;
        pop.remove();
        if (b.dataset.fmt === 'html') downloadHtml(meta);
        if (b.dataset.fmt === 'copy') {
          try {
            await navigator.clipboard.writeText(plainText(meta, sections));
            toast('متن تحلیل کپی شد.', 'ok');
          } catch { toast('کپی ممکن نشد — مرورگر اجازه نداد.', 'err'); }
        }
      });

      setTimeout(() => document.addEventListener('click', function once(ev) {
        if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', once); }
      }), 0);
    }
  });
}

/* ---------------- Standalone HTML export ---------------- */
function downloadHtml(meta) {
  const result = document.querySelector('.result');
  if (!result) return toast('محتوایی برای خروجی نیست.', 'err');

  const css = [...document.styleSheets]
    .filter(s => !s.href || s.href.startsWith(location.origin))
    .map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } })
    .join('\n');

  const head = document.querySelector('.result-head')?.outerHTML || '';
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'تحلیل اخلاقی')} — دیدگاه اخلاق</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Markazi+Text:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<main class="wrap">
  <div class="print-head" style="display:block">
    <div class="ph-brand">دیدگاه اخلاق — تحلیل تصمیم اخلاقی</div>
    <div class="ph-sub">${esc(meta.title || '')}${meta.createdAt ? ` · ${esc(faDate(meta.createdAt))}` : ''}</div>
  </div>
  ${head}
  ${result.outerHTML}
</main>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ethiclens-${analysisSlug(meta)}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('فایل HTML دانلود شد.', 'ok');
}

function analysisSlug(meta) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${meta.analysisId || 'analysis'}-${stamp}`;
}

/* ---------------- Plain text for copying ---------------- */
function plainText(meta, sections = {}) {
  const L = [];
  L.push(`دیدگاه اخلاق — تحلیل تصمیم اخلاقی`);
  if (meta.title) L.push(meta.title);
  if (meta.createdAt) L.push(faDate(meta.createdAt));
  L.push('', '— وضعیت دروازه‌ها —');
  for (const g of gateSummary(sections)) L.push(`${g.n}. ${g.title}: ${g.label}`);
  L.push('', '— متن تحلیل —', '');

  const order = [
    'issue', 'reframe', 'facts', 'stakeholders', 'options', 'matrix',
    'gate:dignity', 'school:deontology',
    'gate:justice', 'school:contractualism',
    'gate:utility', 'school:utilitarianism', 'school:commongood',
    'gate:carevirtue', 'school:care', 'school:virtue',
    'gate:authenticity', 'school:existentialism', 'school:nietzsche',
    'tensions', 'recommendation', 'test',
    'implementation', 'questions', 'blindspots', 'revisit'
  ];

  for (const k of order) {
    if (sections[k]) L.push(`### ${k}`, sections[k], '');
  }
  return L.join('\n');
}
