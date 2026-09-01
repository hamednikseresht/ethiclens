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
export function md(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null, para = [];

  const inline = t => esc(t)
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

function renderMatrix(raw) {
  const rows = parseMatrix(raw);
  if (!rows.length) return '';
  const totals = rows.map(r => r.scores.reduce((a, b) => a + (b ?? 0), 0));
  const best = Math.max(...totals);

  const cell = v => v === null || v === undefined
    ? '<td class="mx-cell" data-v="na">—</td>'
    : `<td class="mx-cell" data-v="${v}">${v > 0 ? '+' : ''}${faNum(v)}</td>`;

  return `
    <div class="mx-wrap">
      <table class="mx">
        <thead><tr><th class="mx-opt">گزینه</th>
          ${MATRIX_COLUMNS.map(c => `<th>${esc(c.label)}</th>`).join('')}
          <th class="mx-total">جمع</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr${totals[i] === best ? ' class="mx-best"' : ''}>
              <td class="mx-opt">${esc(r.option)}${totals[i] === best ? ' <span class="mx-badge">بالاترین</span>' : ''}</td>
              ${MATRIX_COLUMNS.map((_, j) => cell(r.scores[j])).join('')}
              <td class="mx-total" data-t="${totals[i] > 0 ? 'pos' : totals[i] < 0 ? 'neg' : 'zero'}">${totals[i] > 0 ? '+' : ''}${faNum(totals[i])}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="mx-note">دو ستون نخست (کرامت و عدالت) <strong>وتوکننده</strong>اند — امتیاز منفی در آن‌ها با امتیاز مثبت ستون‌های دیگر جبران نمی‌شود.</p>
    </div>`;
}

/* ---------------- Text blocks ---------------- */
const PHASES = [
  { n: '۱', label: 'تشخیص مسئله اخلاقی', blocks: [
    { key: 'issue', title: 'آیا این یک مسئله اخلاقی است؟', icon: '🎯' }] },

  { n: '۲', label: 'گردآوری واقعیت‌ها', blocks: [
    { key: 'reframe',      title: 'بازخوانی مسئله', icon: '🔍' },
    { key: 'facts',        title: 'واقعیت‌ها و شکاف‌های اطلاعاتی', icon: '📋' },
    { key: 'stakeholders', title: 'ذی‌نفعان', icon: '👥' },
    { key: 'options',      title: 'گزینه‌های موجود', icon: '🔀' }] },

  { n: '۴', label: 'تصمیم و آزمون آن', blocks: [
    { key: 'tensions',       title: 'تعارض میان مکاتب', icon: '⚡' },
    { key: 'recommendation', title: 'مسیر پیشنهادی', icon: '🧭', featured: true },
    { key: 'test',           title: 'آزمون تصمیم', icon: '🧪' }] },

  { n: '۵', label: 'اجرا و بازنگری', blocks: [
    { key: 'implementation', title: 'اجرای کم‌آسیب', icon: '🛠️' },
    { key: 'questions',      title: 'پرسش‌هایی از خودتان', icon: '❓' },
    { key: 'blindspots',     title: 'نقاط کور و خطرها', icon: '🚧' },
    { key: 'revisit',        title: 'بازنگری', icon: '🔁' }] }
];

function block(b, sections) {
  const content = sections[b.key];
  if (!content) return '';
  return `
    <section class="res-block${b.featured ? ' featured' : ''}" id="rs-${b.key}">
      <h3 class="res-h"><span class="res-ic">${b.icon}</span> ${esc(b.title)}</h3>
      <div class="prose res-body">${md(content)}</div>
    </section>`;
}

function phase(p, sections, extra = '') {
  const inner = p.blocks.map(b => block(b, sections)).join('') + extra;
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
          <div class="stage-schools">${schools}</div>
          <p class="stage-rule">${esc(st.rule)}</p>
        </div>
      </section>`;
  }).join('<div class="stage-link filled" aria-hidden="true"></div>');

  return `<div class="stages">${html}</div>`;
}

/* ---------------- Full output ---------------- */
export function renderAnalysis(sections) {
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

  return `<div class="result">
    ${phase(PHASES[0], sections)}
    ${phase(PHASES[1], sections)}
    ${phase3}
    ${phase(PHASES[2], sections)}
    ${phase(PHASES[3], sections)}
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
