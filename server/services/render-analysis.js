import { SCHOOLS, STAGES, MATRIX_COLUMNS } from './schools.js';
import { escapeHtml as esc } from './seo.js';

/**
 * Server-side rendering of an analysis.
 *
 * Public pages must carry their content in the first response rather than
 * filling in later via JavaScript: search-engine crawlers index that more
 * reliably and sooner. So result.js's display logic is reimplemented here.
 * The output deliberately reuses the same CSS class names so both look alike.
 */

const SCHOOL = Object.fromEntries(SCHOOLS.map(s => [s.key, s]));

/* ---------------- Lightweight markdown ---------------- */

/**
 * Turn `[text](url)` into an anchor.
 *
 * Editorial content cites sources — Aristotle, Kant, the Stanford
 * Encyclopedia — and without this the brackets rendered literally, so an
 * editor writing a citation got visible punctuation and no link. Linking out
 * to the work you are describing is also the thing Google asks for by name.
 *
 * Applied before the emphasis rules so a URL containing an asterisk cannot be
 * eaten by them, and run on already-escaped text so the href is safe by
 * construction.
 *
 * Only http, https, a site-relative path and a fragment are accepted.
 * Anything else — javascript:, data: — is left as plain text rather than
 * dropped, so a mistake is visible in the page instead of silently vanishing.
 */
function link(escaped) {
  return escaped.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, text, href) => {
    const safe = /^(https?:\/\/|\/(?!\/)|#)/i.test(href);
    if (!safe) return whole;

    // rel="noopener" on anything leaving the site: it costs nothing and closes
    // the window.opener hole. No nofollow — these are citations the editor
    // chose, and telling Google not to follow the source you are quoting is
    // the opposite of what the link is for.
    const external = /^https?:\/\//i.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  });
}

export function md(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null, para = [];

  const inline = t => link(esc(t))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closePara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { closePara(); closeList(); continue; }

    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    const ul = t.match(/^[-*•–]\s+(.*)$/);
    const quote = t.match(/^>\s?(.*)$/);
    const head = t.match(/^(#{1,4})\s+(.*)$/);

    if (head) {
      closePara(); closeList();
      out.push(`<h${Math.min(6, head[1].length + 2)}>${inline(head[2])}</h${Math.min(6, head[1].length + 2)}>`);
    } else if (ol) {
      closePara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[2])}</li>`);
    } else if (ul) {
      closePara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (quote) {
      closePara(); closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
    } else { closeList(); para.push(t); }
  }
  closePara(); closeList();
  return out.join('');
}

/* ---------------- Verdicts ---------------- */
function verdictClass(v) {
  if (!v) return '';
  if (/موافق|عبور|تأیید|تایید/.test(v)) return 'v-yes';
  if (/مخالف|توقف|رد/.test(v))          return 'v-no';
  if (/مشروط|هشدار/.test(v))            return 'v-maybe';
  return 'v-neutral';
}

export function splitVerdict(body) {
  if (!body) return { verdict: null, rest: '' };
  const lines = body.split('\n');
  const m = (lines[0] || '').trim().match(/^(?:حکم|وضعیت)\s*[:：]\s*(.+)$/);
  if (m) return { verdict: m[1].replace(/[*_`]/g, '').trim(), rest: lines.slice(1).join('\n').trim() };
  return { verdict: null, rest: body };
}

/* ---------------- Persian numerals ---------------- */
const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
const faNum = n => String(n).replace(/[0-9]/g, d => FA[+d]);

/* ---------------- Matrix ---------------- */
const FA_MAP = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };

export function parseMatrix(raw) {
  if (!raw) return [];
  const rows = [];
  for (const line of String(raw).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (/^[-:\s]+$/.test(cells.join(''))) continue;
    const scores = cells.slice(1).map(c => {
      const n = String(c).replace(/[۰-۹]/g, d => FA_MAP[d]).replace(/[−–—]/g, '-').match(/-?\d+/);
      return n ? Math.max(-2, Math.min(2, parseInt(n[0], 10))) : null;
    });
    if (scores.every(s => s === null)) continue;
    rows.push({ option: cells[0].replace(/[*`]/g, '').trim(), scores });
  }
  return rows;
}

/**
 * Which columns this particular matrix actually scored.
 *
 * The column list is what the current prompt asks for, but a stored analysis
 * was produced by whatever prompt was live when it ran — every analysis from
 * before the genealogy column existed has one fewer score per row. Rendering
 * the full list against those gives a column of em dashes down every historic
 * analysis, which reads as a broken table rather than as a lens that was not
 * asked about. A column no row scored is simply not drawn.
 */
export function scoredColumns(rows) {
  return MATRIX_COLUMNS
    .map((c, i) => ({ ...c, i }))
    .filter(c => rows.some(r => r.scores[c.i] !== null && r.scores[c.i] !== undefined));
}

function renderMatrix(raw) {
  const rows = parseMatrix(raw);
  if (!rows.length) return '';
  const cols = scoredColumns(rows);
  if (!cols.length) return '';

  const totals = rows.map(r => r.scores.reduce((a, b) => a + (b ?? 0), 0));
  const best = Math.max(...totals);

  const cell = v => v === null || v === undefined
    ? '<td class="mx-cell" data-v="na">—</td>'
    : `<td class="mx-cell" data-v="${v}">${v > 0 ? '+' : ''}${faNum(v)}</td>`;

  return `
    <div class="mx-wrap">
      <table class="mx">
        <thead><tr><th class="mx-opt">گزینه</th>
          ${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}
          <th class="mx-total">جمع</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr${totals[i] === best ? ' class="mx-best"' : ''}>
              <td class="mx-opt">${esc(r.option)}${totals[i] === best ? ' <span class="mx-badge">بالاترین</span>' : ''}</td>
              ${cols.map(c => cell(r.scores[c.i])).join('')}
              <td class="mx-total" data-t="${totals[i] > 0 ? 'pos' : totals[i] < 0 ? 'neg' : 'zero'}">${totals[i] > 0 ? '+' : ''}${faNum(totals[i])}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="mx-note">دو ستون نخست (کرامت و عدالت) <strong>وتوکننده</strong>اند — امتیاز منفی در آن‌ها با امتیاز مثبت ستون‌های دیگر جبران نمی‌شود.</p>
    </div>`;
}

/* ---------------- Text blocks ----------------
   Same reading order as the in-app result: the recommendation first, then the
   framing, the options and the matrix that scores them, the gates, where the
   lenses disagree, the three tests, and finally carrying it out.

   The phase numbers are the framework's own, and they still run 1-2-3-4-5
   down the page because the one block that moves — the recommendation, from
   phase four to the top — is lifted out of the phase structure entirely
   rather than dragging its heading up with it. */

/** Lifted out of its phase and rendered first, on its own. */
const LEAD = { key: 'recommendation', title: 'مسیر پیشنهادی', icon: '🧭', featured: true };

const PHASES = [
  { n: '۱', label: 'تشخیص مسئله اخلاقی', blocks: [
    { key: 'issue', title: 'آیا این یک مسئله اخلاقی است؟', icon: '🎯' }] },

  { n: '۲', label: 'گردآوری واقعیت‌ها', blocks: [
    { key: 'reframe',      title: 'بازخوانی مسئله', icon: '🔍' },
    { key: 'facts',        title: 'واقعیت‌ها و شکاف‌های اطلاعاتی', icon: '📋' },
    { key: 'stakeholders', title: 'ذی‌نفعان', icon: '👥' },
    { key: 'options',      title: 'گزینه‌های موجود', icon: '🔀' }] },

  { n: '۴', label: 'تعارض‌ها و آزمون تصمیم', blocks: [
    { key: 'tensions', title: 'تعارض میان مکاتب', icon: '⚡' },
    { key: 'test',     title: 'آزمون تصمیم', icon: '🧪' }] },

  { n: '۵', label: 'اجرا و بازنگری', blocks: [
    { key: 'implementation', title: 'اجرای کم‌آسیب', icon: '🛠️' },
    { key: 'questions',      title: 'پرسش‌هایی از خودتان', icon: '❓' },
    { key: 'blindspots',     title: 'نقاط کور و خطرها', icon: '🚧' },
    { key: 'revisit',        title: 'بازنگری', icon: '🔁' }] }
];

/**
 * The options, as numbered cards rather than a bullet list.
 *
 * Every later section refers back to these by name — the matrix scores them
 * row by row, the gates rule on them, the recommendation picks one — so they
 * are the most referred-to part of the page and were the least distinct.
 *
 * A line that does not split on a colon is still shown, without a heading:
 * dropping it would silently lose an option.
 */
export function renderOptions(raw) {
  const items = String(raw || '').split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*•–]\s+/.test(l))
    .map(l => {
      const text = l.replace(/^[-*•–]\s+/, '');
      const m = text.match(/^(.{1,40}?)\s*[:：]\s*([\s\S]+)$/);
      return m ? { label: m[1].replace(/[*`]/g, '').trim(), desc: m[2].trim() }
               : { label: null, desc: text };
    });

  if (!items.length) return `<div class="prose res-body">${md(raw)}</div>`;

  return `<ol class="opt-list">${items.map((o, i) => `
    <li class="opt">
      <span class="opt-n">${faNum(i + 1)}</span>
      <div class="opt-main">
        ${o.label ? `<div class="opt-label">${esc(o.label)}</div>` : ''}
        <div class="prose opt-desc">${md(o.desc)}</div>
      </div>
    </li>`).join('')}</ol>`;
}

function block(b, sections, omit) {
  if (omit?.has(b.key)) return '';
  const content = sections[b.key];
  if (!content) return '';
  const body = b.key === 'options'
    ? renderOptions(content)
    : `<div class="prose res-body">${md(content)}</div>`;
  return `
    <section class="res-block${b.featured ? ' featured' : ''}" id="rs-${b.key}">
      <h3 class="res-h"><span class="res-ic">${b.icon}</span> ${esc(b.title)}</h3>
      ${body}
    </section>`;
}

function phase(p, sections, extra = '', omit) {
  const inner = p.blocks.map(b => block(b, sections, omit)).join('') + extra;
  if (!inner.trim()) return '';
  return `
    <div class="phase">
      <div class="phase-label"><span class="phase-n">${p.n}</span> ${esc(p.label)}</div>
      <div class="phase-body">${inner}</div>
    </div>`;
}

/* ---------------- Flowchart stages ---------------- */
function renderStages(sections) {
  const html = STAGES.map(st => {
    const raw = sections[`gate:${st.key}`];
    const { verdict, rest } = splitVerdict(raw || '');
    const state = verdictClass(verdict).replace('v-', '');

    const schools = st.schools.map(k => {
      const s = SCHOOL[k];
      const sraw = sections[`school:${s.key}`];
      if (!sraw) return '';
      const sv = splitVerdict(sraw);
      return `
        <article class="school filled" style="--sc:${s.color}">
          <header>
            <span class="school-icon">${s.icon}</span>
            <div class="grow">
              <div class="school-name">${esc(s.name)}</div>
              <div class="school-thinker">${esc(s.thinker)}</div>
            </div>
            <span class="school-verdict ${verdictClass(sv.verdict)}">${esc(sv.verdict || '—')}</span>
          </header>
          <div class="school-body prose">${md(sv.rest)}</div>
        </article>`;
    }).join('');

    return `
      <section class="stage" data-state="${state}" data-kind="${st.kind}">
        <div class="stage-rail"><span class="stage-num">${st.n}</span></div>
        <div class="stage-main">
          <header class="stage-head">
            <div class="grow">
              <h3 class="stage-title">${esc(st.title)}</h3>
              <div class="stage-thinker">${esc(st.thinker)}</div>
            </div>
            <span class="stage-kind">${st.kind === 'veto' ? 'وتوکننده' : st.kind === 'optimize' ? 'بهینه‌ساز' : 'پالایش‌کننده'}</span>
            <span class="stage-state">${esc(verdict || '—')}</span>
          </header>
          <p class="stage-question">${esc(st.question)}</p>
          ${rest ? `<div class="stage-gate">
            <div class="stage-gate-label">نتیجه این مرحله</div>
            <div class="prose stage-gate-note">${md(rest)}</div>
          </div>` : ''}
          ${schools ? `<details class="stage-more">
            <summary>دیدن ${faNum(st.schools.length)} لنز این دروازه</summary>
            <div class="stage-schools">${schools}</div>
          </details>` : ''}
          <p class="stage-rule">${esc(st.rule)}</p>
        </div>
      </section>`;
  }).join('<div class="stage-link filled" aria-hidden="true"></div>');

  return `<div class="stages">${html}</div>`;
}

/* ---------------- Full output ---------------- */
/**
 * The whole analysis as HTML.
 *
 * `omit` names sections the caller renders itself. The published page lifts
 * the options above the fold, and printing them twice in one article reads
 * worse than either placement on its own.
 */
export function renderAnalysis(sections, { omit = [] } = {}) {
  const skip = new Set(omit);
  const matrix = sections.matrix ? `
    <section class="res-block" id="rs-matrix">
      <h3 class="res-h"><span class="res-ic">🧮</span> ماتریس مقایسه گزینه‌ها</h3>
      <p class="res-sub">امتیاز هر گزینه از منظر هر معیار اخلاقی.</p>
      <div class="res-body">${renderMatrix(sections.matrix)}</div>
    </section>` : '';

  const phase3 = (matrix || Object.keys(sections).some(k => k.startsWith('gate:')))
    ? `<div class="phase">
         <div class="phase-label"><span class="phase-n">۳</span> ارزیابی گزینه‌ها</div>
         <div class="phase-body">${matrix}${renderStages(sections)}</div>
       </div>`
    : '';

  // The recommendation leads, outside any phase: it belongs to phase four of
  // the framework, and printing «فاز ۴» above the page and again halfway down
  // reads as a numbering error rather than as a deliberate reading order.
  // Then the framing and the options, the matrix that scores them and the
  // gates that rule on them, the disagreements and the tests, and last how to
  // carry it out.
  return `<div class="result">
    ${block(LEAD, sections, skip)}
    ${phase(PHASES[0], sections, '', skip)}
    ${phase(PHASES[1], sections, '', skip)}
    ${phase3}
    ${phase(PHASES[2], sections, '', skip)}
    ${phase(PHASES[3], sections, '', skip)}
  </div>`;
}

/** Verdict summary for the page header */
export function verdictChips(sections) {
  const c = { yes: 0, no: 0, maybe: 0 };
  for (const s of SCHOOLS) {
    const { verdict } = splitVerdict(sections[`school:${s.key}`] || '');
    const k = verdictClass(verdict);
    if (k === 'v-yes') c.yes++; else if (k === 'v-no') c.no++; else if (k === 'v-maybe') c.maybe++;
  }
  const bits = [];
  if (c.yes)   bits.push(`<span class="badge badge-success">${faNum(c.yes)} موافق</span>`);
  if (c.maybe) bits.push(`<span class="badge badge-warn">${faNum(c.maybe)} مشروط</span>`);
  if (c.no)    bits.push(`<span class="badge badge-danger">${faNum(c.no)} مخالف</span>`);
  return bits.join(' ');
}

export { faNum };
