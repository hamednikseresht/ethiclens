/* ==========================================================================
   Rendering the encyclopedia from database content.
   Structure and styling are fixed here. Only the text comes from the API, so
   an admin can edit it without breaking the page layout.
   ========================================================================== */
import { esc, md } from './core.js';

const el = (html) => html;

/* ---------------- Free prose ---------------- */
function prose(p, { as = 'section' } = {}) {
  if (!p) return '';
  if (p.extra?.style === 'note') {
    return `<div class="note"><strong>${esc(p.title)}</strong> ${md(p.body).replace(/^<p>|<\/p>$/g, '')}</div>`;
  }
  return `
    <${as} class="sec">
      <h2 class="sec-title" id="${esc(p.key.replace(/^intro:/, ''))}">
        ${p.subtitle ? `<span>${esc(p.subtitle)}</span>` : ''} ${esc(p.title)}
      </h2>
      <div class="sec-lead">${md(p.body)}</div>
    </${as}>`;
}

/* ---------------- Phase ---------------- */
function phase(p) {
  const pts = p.extra?.points || [];
  return `
    <div class="phase-card${p.extra?.accent ? ' accent' : ''}">
      <h3><b>${esc(p.subtitle || '')}</b> ${esc(p.title)}</h3>
      <div class="pc-body">${md(p.body)}</div>
      ${pts.length ? `<ul>${pts.map(t => `<li>${md(t).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : ''}
    </div>`;
}

/* ---------------- Lens ---------------- */
function lens(l) {
  const x = l.extra || {};
  const concepts = (x.concepts || []).map(c => `
    <div class="concept">
      <b>${esc(c.name)}</b>
      <span class="term">${esc(c.term || '')}</span>
      <span>${esc(c.desc || '')}</span>
    </div>`).join('');

  return `
    <article class="lens" style="--lc:${esc(x.color || 'var(--primary)')}" id="lens-${esc(l.key.split(':')[1] || '')}">
      <div class="lens-head">
        <span class="lens-ic">${esc(x.icon || '🔍')}</span>
        <div class="grow">
          <div class="lens-name">${esc(l.title)}
            ${l.subtitle ? `<span class="lens-orig">${esc(l.subtitle)}</span>` : ''}</div>
        </div>
        ${x.thinkers ? `<span class="badge">${esc(x.thinkers)}</span>` : ''}
      </div>
      ${l.lead ? `<div class="lens-q">${esc(l.lead)}</div>` : ''}
      <div class="lens-body">
        ${md(l.body)}
        ${concepts ? `<h4>مفاهیم کلیدی</h4><div class="concepts">${concepts}</div>` : ''}
        ${x.critique ? `<div class="critique"><b>نقطه کور:</b> ${md(x.critique).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}
        ${x.sources ? `<div class="srcs"><b>منابع اصلی</b>${md(x.sources)}</div>` : ''}
      </div>
    </article>`;
}

/* ---------------- Gate ---------------- */
function gate(g, isLast) {
  const x = g.extra || {};
  return `
    <div class="gate" style="--gc:${esc(x.color || 'var(--primary)')}">
      <div class="gate-n">${esc(x.n || '')}</div>
      <div>
        <h3>${esc(g.title)} ${g.lead ? `<span class="kind">${esc(g.lead)}</span>` : ''}</h3>
        ${g.subtitle ? `<div class="who">${esc(g.subtitle)}</div>` : ''}
        ${md(g.body)}
      </div>
    </div>
    ${isLast ? '' : '<div class="gate-link"></div>'}`;
}

/* ---------------- Thought experiment ---------------- */
function experiment(e) {
  return `
    <div class="exp">
      <h3>${esc(e.title)}</h3>
      ${md(e.body)}
      ${e.extra?.ref ? `<p class="ref">${md(e.extra.ref).replace(/^<p>|<\/p>$/g, '')}</p>` : ''}
    </div>`;
}

/* ---------------- Comparison table ---------------- */
function comparison(lenses) {
  const rows = lenses.map(l => {
    const x = l.extra || {};
    // Title without its leading number
    const name = l.title.replace(/^[۰-۹\d]+\.\s*/, '');
    const critique = String(x.critique || '').replace(/\*/g, '').split(/[.،]/)[0].trim().slice(0, 45);
    return `<tr>
      <td>${esc(name)}</td>
      <td>${esc(l.lead || '')}</td>
      <td>${esc(x.thinkers || '')}</td>
      <td>${esc(critique)}</td>
    </tr>`;
  }).join('');

  return `
    <section class="sec">
      <h2 class="sec-title" id="compare"><span>📊</span> جدول تطبیقی</h2>
      <p class="sec-lead">مقایسه سریع لنزها بر اساس پرسش بنیادین و مهم‌ترین نقد.</p>
      <div class="table-wrap">
        <table class="cmp">
          <thead><tr><th>لنز</th><th>پرسش بنیادین</th><th>چهره‌های شاخص</th><th>نقد اصلی</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

/* ==========================================================================
   Full render
   ========================================================================== */
export function renderGuide(host, data) {
  const P = data.prose || {};

  const toc = [
    P.framework && ['framework', '۱', P.framework.title],
    P.lenses && ['lenses', '۲', P.lenses.title],
    P.gates && ['gates', '۳', P.gates.title],
    ['compare', '۴', 'جدول تطبیقی'],
    P.experiments && ['experiments', '۵', P.experiments.title],
    P.bibliography && ['bibliography', '۶', P.bibliography.title]
  ].filter(Boolean);

  host.innerHTML = `
    <div class="g-hero">
      ${P.hero?.subtitle ? `<span class="badge badge-primary">${esc(P.hero.subtitle)}</span>` : ''}
      <h1>${esc(P.hero?.title || 'دانشنامه')}</h1>
      <div class="lead">${md(P.hero?.body || '')}</div>
    </div>

    <nav class="toc">
      <h2>فهرست</h2>
      <div class="toc-list">
        ${toc.map(([id, n, t]) => `<a href="#${id}"><i>${n}</i> ${esc(t)}</a>`).join('')}
      </div>
    </nav>

    ${prose(P.framework)}
    <div class="phases">${data.phases.map(phase).join('')}</div>
    ${prose(P['method-note'])}

    ${prose(P.lenses)}
    ${data.lenses.map(lens).join('')}

    ${prose(P.gates)}
    <div class="gates">${data.gates.map((g, i) => gate(g, i === data.gates.length - 1)).join('')}</div>
    ${prose(P['gates-why'])}

    ${comparison(data.lenses)}

    ${prose(P.experiments)}
    ${data.experiments.map(experiment).join('')}

    <div class="cta-guide">
      <h2>حالا این لنزها را روی موقعیت خودتان بگذارید</h2>
      <p>
        دیدگاه اخلاق دوراهی شما را از هر ${data.lenses.length} منظر می‌سنجد،
        از ${data.gates.length} دروازه می‌گذراند و تعارض‌ها را نشان می‌دهد —
        نه اینکه به‌جای شما تصمیم بگیرد.
      </p>
      <a class="btn btn-lg" href="/app">شروع تحلیل</a>
    </div>

    ${prose(P.bibliography)}
    ${prose(P.method)}`;
}
