/* ==========================================================================
   نمایش نتیجه تحلیل.
   ساختار روایی = پنج فاز تصمیم‌گیری اخلاقی، و در دل فاز سوم،
   پنج مرحله فلوچارت پالایش (هر مرحله = دروازه + مکاتب تغذیه‌کننده‌اش).
   مشترک میان صفحه تحلیل زنده و صفحه مشاهده تحلیل ذخیره‌شده.
   ========================================================================== */
import { esc, md, faNum } from './core.js';
import { syncStageLinks } from './motion.js';

export const SCHOOLS = [
  { key: 'virtue',         name: 'فضیلت‌گرایی',     thinker: 'ارسطو',            icon: '🏛️', color: '#7c3aed' },
  { key: 'deontology',     name: 'وظیفه‌گرایی',     thinker: 'کانت',             icon: '⚖️', color: '#2563eb' },
  { key: 'utilitarianism', name: 'فایده‌گرایی',     thinker: 'میل و بنتام',      icon: '📊', color: '#0d9488' },
  { key: 'commongood',     name: 'خیر مشترک',       thinker: 'سنت خیر مشترک',    icon: '🏘️', color: '#0891b2' },
  { key: 'contractualism', name: 'قراردادگرایی',    thinker: 'رالز',             icon: '🤝', color: '#ea580c' },
  { key: 'care',           name: 'اخلاق مراقبت',    thinker: 'گیلیگان',          icon: '🫂', color: '#db2777' },
  { key: 'existentialism', name: 'اگزیستانسیالیسم', thinker: 'کی‌یرکگور و کامو', icon: '🕯️', color: '#65a30d' },
  { key: 'nietzsche',      name: 'تبارشناسی',       thinker: 'نیچه',             icon: '⛰️', color: '#b45309' }
];

const SCHOOL = Object.fromEntries(SCHOOLS.map(s => [s.key, s]));

export const STAGES = [
  { n: '۱', key: 'dignity', kind: 'veto',
    title: 'دروازه کرامت', thinker: 'ایمانوئل کانت',
    question: 'آیا در این تصمیم، انسانی صرفاً به ابزار تبدیل شده است؟',
    rule: 'وتوکننده — اگر کرامت کسی نقض شود، گزینه مردود است و باید حذف یا بازطراحی شود.',
    schools: ['deontology'] },

  { n: '۲', key: 'justice', kind: 'veto',
    title: 'دروازه عدالت', thinker: 'جان رالز',
    question: 'پشت پرده جهل، آیا این تصمیم را عادلانه می‌دانستید؟',
    rule: 'وتوکننده — اگر بار تصمیم بر دوش محروم‌ترین طرف بیفتد، باید به سود او تعدیل شود.',
    schools: ['contractualism'] },

  { n: '۳', key: 'utility', kind: 'optimize',
    title: 'فایده و خیر مشترک', thinker: 'میل و سنت خیر مشترک',
    question: 'کدام گزینه بیشترین خیر جمعی را می‌سازد، و با شرایط مشترک زندگی جمعی چه می‌کند؟',
    rule: 'بهینه‌ساز — فایده‌گرایی سودِ افراد را جمع می‌زند؛ خیر مشترک از چیزهایی می‌پرسد که فقط مشترک وجود دارند.',
    schools: ['utilitarianism', 'commongood'] },

  { n: '۴', key: 'carevirtue', kind: 'optimize',
    title: 'مراقبت و فضیلت', thinker: 'گیلیگان و ارسطو',
    question: 'نیاز عینی آسیب‌پذیرترین فرد چیست، و این تصمیم چه منشی می‌سازد؟',
    rule: 'بهینه‌ساز — شیوه اجرای تصمیم را انسانی و متناسب می‌کند.',
    schools: ['care', 'virtue'] },

  { n: '۵', key: 'authenticity', kind: 'refine',
    title: 'اصالت و انگیزه', thinker: 'کی‌یرکگور و نیچه',
    question: 'انگیزه این انتخاب شجاعت است یا ترس و همرنگی با جماعت؟',
    rule: 'پالایش‌کننده — تصمیم را از ریاکاری، ترس و خودفریبی پاک می‌کند.',
    schools: ['existentialism', 'nietzsche'] }
];

export const GATES = STAGES.map(s => ({ key: s.key, title: s.title, sub: s.thinker }));

export const MATRIX_COLUMNS = [
  { key: 'dignity',      label: 'کرامت' },
  { key: 'justice',      label: 'عدالت' },
  { key: 'utility',      label: 'فایده' },
  { key: 'commongood',   label: 'خیر مشترک' },
  { key: 'care',         label: 'مراقبت' },
  { key: 'virtue',       label: 'فضیلت' },
  { key: 'authenticity', label: 'اصالت' }
];

/* بلوک‌های متنی هر فاز */
const PHASE1 = [
  { key: 'issue', title: 'آیا این یک مسئله اخلاقی است؟', icon: '🎯',
    lead: 'پیش از تحلیل: جنس تعارض چیست و چرا فراتر از قانون و کارایی است.' }
];
const PHASE2 = [
  { key: 'reframe',      title: 'بازخوانی مسئله', icon: '🔍', lead: 'هسته اخلاقی ماجرا و تعارض اصلی میان ارزش‌ها.' },
  { key: 'facts',        title: 'واقعیت‌ها و شکاف‌های اطلاعاتی', icon: '📋', lead: 'آنچه می‌دانیم و آنچه پیش از تصمیم باید بدانیم.' },
  { key: 'stakeholders', title: 'ذی‌نفعان', icon: '👥', lead: 'چه کسانی درگیرند و چه چیزی برایشان در خطر است.' },
  { key: 'options',      title: 'گزینه‌های موجود', icon: '🔀', lead: 'مسیرهایی که واقعاً پیش روی شماست.' }
];
const PHASE4 = [
  { key: 'tensions', title: 'تعارض میان مکاتب', icon: '⚡', lead: 'جایی که مکاتب به نتایج متضاد می‌رسند — مهم‌ترین بخش تحلیل.' }
];
const PHASE5 = [
  { key: 'implementation', title: 'اجرای کم‌آسیب', icon: '🛠️', lead: 'تصمیم درست را چطور بدون آسیب اضافی اجرا کنید.' },
  { key: 'questions',      title: 'پرسش‌هایی از خودتان', icon: '❓', lead: 'پرسش‌هایی که فقط خودتان می‌توانید صادقانه پاسخ دهید.' },
  { key: 'blindspots',     title: 'نقاط کور و خطرها', icon: '🚧', lead: 'سوگیری‌های محتمل و آنچه این تحلیل نمی‌تواند ببیند.' }
];

export const TEXT_BLOCKS = [...PHASE1, ...PHASE2, ...PHASE4, ...PHASE5,
  { key: 'recommendation', title: 'مسیر پیشنهادی', icon: '🧭' },
  { key: 'test',           title: 'آزمون تصمیم',   icon: '🧪' },
  { key: 'revisit',        title: 'بازنگری',       icon: '🔁' }
];

/**
 * Section key to display name, covering all 26 blocks the model emits.
 *
 * Built from the arrays above rather than written out again, so a renamed
 * block cannot end up with one title in the result view and another in the
 * completeness warning.
 */
export const SECTION_LABELS = Object.fromEntries([
  ...TEXT_BLOCKS.map(b => [b.key, b.title]),
  ['matrix', 'ماتریس سنجش'],
  ...STAGES.map(s => [`gate:${s.key}`, s.title]),
  ...SCHOOLS.map(s => [`school:${s.key}`, s.name])
]);

export function sectionLabel(key) {
  return SECTION_LABELS[key] || key;
}

/* ------- حکم‌ها و رنگ آن‌ها ------- */
function verdictClass(v) {
  if (!v) return '';
  if (/موافق|عبور|تأیید|تایید/.test(v)) return 'v-yes';
  if (/مخالف|توقف|رد/.test(v))          return 'v-no';
  if (/مشروط|هشدار/.test(v))            return 'v-maybe';
  return 'v-neutral';
}
const STATE_LABEL = { yes: 'عبور', no: 'توقف', maybe: 'هشدار', neutral: 'بررسی', '': 'در انتظار' };

export function splitVerdict(body) {
  if (!body) return { verdict: null, rest: '' };
  const lines = body.split('\n');
  const m = (lines[0] || '').trim().match(/^(?:حکم|وضعیت)\s*[:：]\s*(.+)$/);
  if (m) return { verdict: m[1].replace(/[*_`]/g, '').trim(), rest: lines.slice(1).join('\n').trim() };
  return { verdict: null, rest: body };
}

/* ==========================================================================
   ماتریس مقایسه گزینه‌ها
   ========================================================================== */
const FA_DIGIT_MAP = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
                       '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };

function toScore(cell) {
  const norm = String(cell).replace(/[۰-۹٠-٩]/g, d => FA_DIGIT_MAP[d]).replace(/[−–—]/g, '-').trim();
  const m = norm.match(/-?\d+/);
  if (!m) return null;
  return Math.max(-2, Math.min(2, parseInt(m[0], 10)));
}

/** جدول مارک‌داون مدل را به ردیف‌های امتیاز تبدیل می‌کند */
export function parseMatrix(raw) {
  if (!raw) return [];
  const rows = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (/^[-:\s]+$/.test(cells.join(''))) continue;              // خط جداکننده
    const scores = cells.slice(1).map(toScore);
    if (scores.every(s => s === null)) continue;                  // سرستون
    rows.push({ option: cells[0].replace(/[*`]/g, '').trim(), scores });
  }
  return rows;
}

function renderMatrix(raw) {
  const rows = parseMatrix(raw);
  if (!rows.length) return '';

  const cols = MATRIX_COLUMNS;
  const totals = rows.map(r => r.scores.reduce((a, b) => a + (b ?? 0), 0));
  const best = Math.max(...totals);

  const cell = v => {
    if (v === null || v === undefined) return '<td class="mx-cell" data-v="na">—</td>';
    const sign = v > 0 ? '+' : '';
    return `<td class="mx-cell" data-v="${v}" title="${v > 0 ? 'پشتیبانی' : v < 0 ? 'مخالفت' : 'خنثی'}">${sign}${faNum(v)}</td>`;
  };

  return `
    <div class="mx-wrap">
      <table class="mx">
        <thead>
          <tr>
            <th class="mx-opt">گزینه</th>
            ${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}
            <th class="mx-total">جمع</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr ${totals[i] === best ? 'class="mx-best"' : ''}>
              <td class="mx-opt">${esc(r.option)}${totals[i] === best ? ' <span class="mx-badge">بالاترین</span>' : ''}</td>
              ${cols.map((_, j) => cell(r.scores[j])).join('')}
              <td class="mx-total" data-t="${totals[i] > 0 ? 'pos' : totals[i] < 0 ? 'neg' : 'zero'}">
                ${totals[i] > 0 ? '+' : ''}${faNum(totals[i])}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="mx-legend">
        <span class="mx-key" data-v="2">+۲</span> قویاً پشتیبانی
        <span class="mx-key" data-v="1">+۱</span> پشتیبانی
        <span class="mx-key" data-v="0">۰</span> خنثی
        <span class="mx-key" data-v="-1">−۱</span> مخالف
        <span class="mx-key" data-v="-2">−۲</span> قویاً مخالف
      </p>
      <p class="mx-note">
        جمع ستون‌ها فقط یک راهنمای بصری است، نه حکم نهایی: دو ستون نخست (کرامت و عدالت)
        <strong>وتوکننده</strong>اند — امتیاز منفی در آن‌ها را نمی‌توان با امتیاز مثبت ستون‌های دیگر جبران کرد.
      </p>
    </div>`;
}

/* ==========================================================================
   اسکلت نتیجه
   ========================================================================== */
function blockHtml(b, featured = false) {
  return `
    <section class="res-block${featured ? ' featured' : ''}" id="rs-${b.key}" data-empty="1">
      <h3 class="res-h"><span class="res-ic">${b.icon}</span> ${esc(b.title)}</h3>
      ${b.lead ? `<p class="res-sub">${esc(b.lead)}</p>` : ''}
      <div class="prose res-body"></div>
    </section>`;
}

function phaseHtml(n, label, lead, inner) {
  return `
    <div class="phase">
      <div class="phase-label"><span class="phase-n">${n}</span> ${esc(label)}</div>
      ${lead ? `<p class="phase-lead">${lead}</p>` : ''}
      <div class="phase-body">${inner}</div>
    </div>`;
}

export function buildSkeleton(host) {
  const stagesHtml = STAGES.map(st => `
    <section class="stage" id="stage-${st.key}" data-state="" data-kind="${st.kind}">
      <div class="stage-rail"><span class="stage-num">${st.n}</span></div>
      <div class="stage-main">
        <header class="stage-head">
          <div class="grow">
            <h3 class="stage-title">${esc(st.title)}</h3>
            <div class="stage-thinker">${esc(st.thinker)}</div>
          </div>
          <span class="stage-kind">${st.kind === 'veto' ? 'وتوکننده' : st.kind === 'optimize' ? 'بهینه‌ساز' : 'پالایش‌کننده'}</span>
          <span class="stage-state">در انتظار</span>
        </header>
        <p class="stage-question">${esc(st.question)}</p>
        <div class="stage-gate">
          <div class="stage-gate-label">نتیجه این مرحله</div>
          <div class="prose stage-gate-note"></div>
        </div>
        <div class="stage-schools">
          ${st.schools.map(k => {
            const s = SCHOOL[k];
            return `
            <article class="school" id="school-${s.key}" style="--sc:${s.color}">
              <header>
                <span class="school-icon">${s.icon}</span>
                <div class="grow">
                  <div class="school-name">${esc(s.name)}</div>
                  <div class="school-thinker">${esc(s.thinker)}</div>
                </div>
                <span class="school-verdict">در انتظار…</span>
              </header>
              <div class="school-body prose"></div>
            </article>`;
          }).join('')}
        </div>
        <p class="stage-rule">${esc(st.rule)}</p>
      </div>
    </section>`).join('<div class="stage-link" aria-hidden="true"></div>');

  host.innerHTML = `
    <div class="result">
      ${phaseHtml('۱', 'تشخیص مسئله اخلاقی', '', PHASE1.map(b => blockHtml(b)).join(''))}

      ${phaseHtml('۲', 'گردآوری واقعیت‌ها', '', PHASE2.map(b => blockHtml(b)).join(''))}

      ${phaseHtml('۳', 'ارزیابی گزینه‌ها',
        `هر گزینه از هفت معیار اخلاقی امتیاز می‌گیرد، سپس تصمیم از پنج دروازه پیاپی می‌گذرد.
         دو دروازه نخست <strong>وتوکننده</strong>اند: گزینه‌ای که کرامت انسانی یا عدالت را نقض کند،
         پیش از هر محاسبه‌ای مردود می‌شود.`,
        `<section class="res-block" id="rs-matrix" data-empty="1">
           <h3 class="res-h"><span class="res-ic">🧮</span> ماتریس مقایسه گزینه‌ها</h3>
           <p class="res-sub">امتیاز هر گزینه از منظر هر معیار اخلاقی، برای مقایسه یک‌نگاهی.</p>
           <div class="res-body"></div>
         </section>
         <div class="stages">${stagesHtml}</div>`)}

      ${phaseHtml('۴', 'تصمیم و آزمون آن', '',
        PHASE4.map(b => blockHtml(b)).join('') +
        blockHtml({ key: 'recommendation', title: 'مسیر پیشنهادی', icon: '🧭',
                    lead: 'خروجی فلوچارت پس از عبور از هر پنج مرحله.' }, true) +
        blockHtml({ key: 'test', title: 'آزمون تصمیم', icon: '🧪',
                    lead: 'سه محکِ کلاسیک برای اینکه ببینید تصمیم در برابر نگاه دیگران دوام می‌آورد یا نه.' }))}

      ${phaseHtml('۵', 'اجرا و بازنگری', '',
        PHASE5.map(b => blockHtml(b)).join('') +
        blockHtml({ key: 'revisit', title: 'بازنگری', icon: '🔁',
                    lead: 'تصمیم اخلاقی نقطه پایان نیست — کِی و با چه نشانه‌هایی باید دوباره بررسی‌اش کنید.' }))}
    </div>`;
}

/* ==========================================================================
   تجزیه بلوک‌های @@key@@
   ========================================================================== */
const MARKER_RE = /^\s*@@\s*([a-zA-Z:_-]+)\s*@@\s*$/;

export function parseSections(text) {
  const out = {};
  let cur = null, buf = [];
  const flush = () => { if (cur) out[cur] = buf.join('\n').trim(); buf = []; };
  for (const line of String(text || '').split('\n')) {
    const m = line.match(MARKER_RE);
    if (m) { flush(); cur = m[1]; } else if (cur) buf.push(line);
  }
  flush();
  return out;
}

/* ==========================================================================
   اعمال محتوا
   ========================================================================== */
export function applySections(sections, { streaming = false } = {}) {
  const setBlock = (key, content, html) => {
    const host = document.getElementById(`rs-${key}`);
    if (!host) return;
    const body = host.querySelector('.res-body');
    if (content && content.trim()) {
      body.innerHTML = html ?? md(content);
      host.dataset.empty = '0';
    } else {
      body.innerHTML = '';
      host.dataset.empty = streaming ? '1' : '0';
    }
  };

  for (const b of TEXT_BLOCKS) setBlock(b.key, sections[b.key]);
  setBlock('matrix', sections.matrix, renderMatrix(sections.matrix));

  for (const s of SCHOOLS) {
    const el = document.getElementById(`school-${s.key}`);
    if (!el) continue;
    const raw = sections[`school:${s.key}`];
    const vEl = el.querySelector('.school-verdict');
    const bEl = el.querySelector('.school-body');
    if (!raw) {
      el.classList.toggle('pending', streaming);
      el.classList.remove('filled');
      vEl.textContent = streaming ? 'در انتظار…' : '—';
      vEl.className = 'school-verdict';
      bEl.innerHTML = '';
      continue;
    }
    el.classList.remove('pending');
    el.classList.add('filled');
    const { verdict, rest } = splitVerdict(raw);
    vEl.textContent = verdict || '—';
    vEl.className = `school-verdict ${verdictClass(verdict)}`;
    bEl.innerHTML = md(rest);
  }

  for (const st of STAGES) {
    const el = document.getElementById(`stage-${st.key}`);
    if (!el) continue;
    const raw = sections[`gate:${st.key}`];
    const stateEl = el.querySelector('.stage-state');
    const noteEl = el.querySelector('.stage-gate-note');
    if (!raw) {
      el.dataset.state = '';
      stateEl.textContent = streaming ? 'در انتظار' : '—';
      noteEl.innerHTML = '';
      continue;
    }
    const { verdict, rest } = splitVerdict(raw);
    const cls = verdictClass(verdict).replace('v-', '');
    el.dataset.state = cls;
    stateEl.textContent = verdict || STATE_LABEL[cls] || '—';
    noteEl.innerHTML = md(rest);
  }

  syncStageLinks();
}

/* ------- پیشرفت ------- */
export const TOTAL_SECTIONS = TEXT_BLOCKS.length + 1 + SCHOOLS.length + STAGES.length;

export function progressOf(sections) {
  const done = Object.values(sections).filter(v => v && v.trim().length > 10).length;
  return Math.min(100, Math.round((done / TOTAL_SECTIONS) * 100));
}

/* ------- خلاصه‌ها ------- */
export function verdictSummary(sections) {
  const counts = { yes: 0, no: 0, maybe: 0 };
  for (const s of SCHOOLS) {
    const { verdict } = splitVerdict(sections[`school:${s.key}`] || '');
    const c = verdictClass(verdict);
    if (c === 'v-yes') counts.yes++;
    else if (c === 'v-no') counts.no++;
    else if (c === 'v-maybe') counts.maybe++;
  }
  return counts;
}

export function verdictChips(sections) {
  const c = verdictSummary(sections);
  const bits = [];
  if (c.yes)   bits.push(`<span class="badge badge-success">${faNum(c.yes)} موافق</span>`);
  if (c.maybe) bits.push(`<span class="badge badge-warn">${faNum(c.maybe)} مشروط</span>`);
  if (c.no)    bits.push(`<span class="badge badge-danger">${faNum(c.no)} مخالف</span>`);
  return bits.join(' ');
}

export function gateSummary(sections) {
  return STAGES.map(st => {
    const { verdict } = splitVerdict(sections[`gate:${st.key}`] || '');
    const cls = verdictClass(verdict).replace('v-', '');
    return { key: st.key, n: st.n, title: st.title, state: cls, label: verdict || STATE_LABEL[cls] || '—' };
  });
}

/** گزینه برنده ماتریس — برای نمایش در سربرگ */
export function topOption(sections) {
  const rows = parseMatrix(sections.matrix);
  if (!rows.length) return null;
  let best = null;
  for (const r of rows) {
    const total = r.scores.reduce((a, b) => a + (b ?? 0), 0);
    if (!best || total > best.total) best = { option: r.option, total };
  }
  return best;
}
