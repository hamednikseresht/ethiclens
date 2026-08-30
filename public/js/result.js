/* ==========================================================================
   نمایش نتیجه تحلیل — ساختار روایی بر پایه فلوچارت پالایش تصمیم.
   هر مرحله = یک دروازه فلوچارت + مکتب/مکاتبی که آن دروازه را تغذیه می‌کنند.
   مشترک میان صفحه تحلیل زنده و صفحه مشاهده تحلیل ذخیره‌شده.
   ========================================================================== */
import { esc, md, faNum } from './core.js';

export const SCHOOLS = [
  { key: 'virtue',         name: 'فضیلت‌گرایی',     thinker: 'ارسطو',            icon: '🏛️', color: '#7c3aed' },
  { key: 'deontology',     name: 'وظیفه‌گرایی',     thinker: 'کانت',             icon: '⚖️', color: '#2563eb' },
  { key: 'utilitarianism', name: 'فایده‌گرایی',     thinker: 'میل و بنتام',      icon: '📊', color: '#0d9488' },
  { key: 'contractualism', name: 'قراردادگرایی',    thinker: 'رالز',             icon: '🤝', color: '#ea580c' },
  { key: 'care',           name: 'اخلاق مراقبت',    thinker: 'گیلیگان',          icon: '🫂', color: '#db2777' },
  { key: 'existentialism', name: 'اگزیستانسیالیسم', thinker: 'کی‌یرکگور و کامو', icon: '🕯️', color: '#65a30d' },
  { key: 'nietzsche',      name: 'تبارشناسی',       thinker: 'نیچه',             icon: '⛰️', color: '#b45309' }
];

const SCHOOL = Object.fromEntries(SCHOOLS.map(s => [s.key, s]));

/**
 * مراحل فلوچارت. ترتیب و منطق دقیقاً همان دانشنامه است:
 * دو دروازه نخست وتوکننده‌اند، سپس بهینه‌سازی، و در پایان پالایش انگیزه.
 */
export const STAGES = [
  {
    n: '۱', key: 'dignity', kind: 'veto',
    title: 'دروازه کرامت',
    thinker: 'ایمانوئل کانت',
    question: 'آیا در این تصمیم، انسانی صرفاً به ابزار تبدیل شده است؟',
    rule: 'وتوکننده — اگر کرامت کسی نقض شود، گزینه مردود است و باید حذف یا بازطراحی شود.',
    schools: ['deontology']
  },
  {
    n: '۲', key: 'justice', kind: 'veto',
    title: 'دروازه عدالت',
    thinker: 'جان رالز',
    question: 'پشت پرده جهل، آیا این تصمیم را عادلانه می‌دانستید؟',
    rule: 'وتوکننده — اگر بار تصمیم بر دوش محروم‌ترین طرف بیفتد، باید به سود او تعدیل شود.',
    schools: ['contractualism']
  },
  {
    n: '۳', key: 'utility', kind: 'optimize',
    title: 'سنجش فایده',
    thinker: 'جان استیوارت میل',
    question: 'کدام گزینه بیشترین خیر و کمترین رنج جمعی را می‌سازد؟',
    rule: 'بهینه‌ساز — میان گزینه‌هایی که از دو دروازه بالا گذشته‌اند، بهترین را انتخاب می‌کند.',
    schools: ['utilitarianism']
  },
  {
    n: '۴', key: 'carevirtue', kind: 'optimize',
    title: 'مراقبت و فضیلت',
    thinker: 'گیلیگان و ارسطو',
    question: 'نیاز عینی آسیب‌پذیرترین فرد چیست، و این تصمیم چه منشی می‌سازد؟',
    rule: 'بهینه‌ساز — شیوه اجرای تصمیم را انسانی و متناسب می‌کند.',
    schools: ['care', 'virtue']
  },
  {
    n: '۵', key: 'authenticity', kind: 'refine',
    title: 'اصالت و انگیزه',
    thinker: 'کی‌یرکگور و نیچه',
    question: 'انگیزه این انتخاب شجاعت است یا ترس و همرنگی با جماعت؟',
    rule: 'پالایش‌کننده — تصمیم را از ریاکاری، ترس و خودفریبی پاک می‌کند.',
    schools: ['existentialism', 'nietzsche']
  }
];

export const GATES = STAGES.map(s => ({ key: s.key, title: s.title, sub: s.thinker }));

const INTRO_BLOCKS = [
  { key: 'reframe',      title: 'بازخوانی مسئله',  icon: '🔍', lead: 'هسته اخلاقی ماجرا و تعارض اصلی میان ارزش‌ها.' },
  { key: 'stakeholders', title: 'ذی‌نفعان',        icon: '👥', lead: 'چه کسانی درگیرند و چه چیزی برایشان در خطر است.' },
  { key: 'options',      title: 'گزینه‌های موجود', icon: '🔀', lead: 'مسیرهایی که واقعاً پیش روی شماست.' }
];

const OUTRO_BLOCKS = [
  { key: 'tensions',   title: 'تعارض میان مکاتب',    icon: '⚡', lead: 'جایی که مکاتب به نتایج متضاد می‌رسند — مهم‌ترین بخش تحلیل.' },
  { key: 'questions',  title: 'پرسش‌هایی از خودتان', icon: '❓', lead: 'پرسش‌هایی که فقط خودتان می‌توانید صادقانه پاسخ دهید.' },
  { key: 'blindspots', title: 'نقاط کور و خطرها',    icon: '🚧', lead: 'سوگیری‌های محتمل و آنچه این تحلیل نمی‌تواند ببیند.' }
];

/* ------- حکم‌ها و رنگ آن‌ها ------- */
function verdictClass(v) {
  if (!v) return '';
  if (/موافق|عبور|تأیید|تایید/.test(v)) return 'v-yes';
  if (/مخالف|توقف|رد/.test(v))          return 'v-no';
  if (/مشروط|هشدار/.test(v))            return 'v-maybe';
  return 'v-neutral';
}

const STATE_LABEL = { yes: 'عبور', no: 'توقف', maybe: 'هشدار', neutral: 'بررسی', '': 'در انتظار' };

/** «حکم: …» یا «وضعیت: …» را از ابتدای متن جدا می‌کند */
export function splitVerdict(body) {
  if (!body) return { verdict: null, rest: '' };
  const lines = body.split('\n');
  const m = (lines[0] || '').trim().match(/^(?:حکم|وضعیت)\s*[:：]\s*(.+)$/);
  if (m) return { verdict: m[1].replace(/[*_`]/g, '').trim(), rest: lines.slice(1).join('\n').trim() };
  return { verdict: null, rest: body };
}

/* ==========================================================================
   اسکلت نتیجه — همه بخش‌ها خالی، آماده پرشدن تدریجی هنگام استریم
   ========================================================================== */
export function buildSkeleton(host) {
  const introHtml = INTRO_BLOCKS.map(b => `
    <section class="res-block" id="rs-${b.key}" data-empty="1">
      <h3 class="res-h"><span class="res-ic">${b.icon}</span> ${esc(b.title)}</h3>
      <p class="res-sub">${esc(b.lead)}</p>
      <div class="prose res-body"></div>
    </section>`).join('');

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

  const outroHtml = OUTRO_BLOCKS.map(b => `
    <section class="res-block" id="rs-${b.key}" data-empty="1">
      <h3 class="res-h"><span class="res-ic">${b.icon}</span> ${esc(b.title)}</h3>
      <p class="res-sub">${esc(b.lead)}</p>
      <div class="prose res-body"></div>
    </section>`).join('');

  host.innerHTML = `
    <div class="result">
      <div class="phase">
        <div class="phase-label">گام نخست — صورت‌بندی</div>
        <div class="phase-body">${introHtml}</div>
      </div>

      <div class="phase">
        <div class="phase-label">پالایش تصمیم — پنج مرحله فلوچارت</div>
        <p class="phase-lead">
          تصمیم از پنج دروازه پیاپی می‌گذرد. دو دروازه نخست <strong>وتوکننده</strong>اند:
          اگر گزینه‌ای کرامت انسانی یا عدالت را نقض کند، پیش از هر محاسبه‌ای مردود می‌شود.
          تنها گزینه‌هایی که از این دو گذشتند، با معیار فایده و مراقبت سنجیده و در پایان از نظر
          اصالت انگیزه پالایش می‌شوند.
        </p>
        <div class="stages">${stagesHtml}</div>
      </div>

      <div class="phase">
        <div class="phase-label">جمع‌بندی</div>
        <div class="phase-body">
          <section class="res-block" id="rs-tensions" data-empty="1">
            <h3 class="res-h"><span class="res-ic">⚡</span> تعارض میان مکاتب</h3>
            <p class="res-sub">جایی که مکاتب به نتایج متضاد می‌رسند — مهم‌ترین بخش تحلیل.</p>
            <div class="prose res-body"></div>
          </section>

          <section class="res-block featured" id="rs-recommendation" data-empty="1">
            <h3 class="res-h"><span class="res-ic">🧭</span> مسیر پیشنهادی</h3>
            <p class="res-sub">خروجی فلوچارت پس از عبور از هر پنج مرحله.</p>
            <div class="prose res-body"></div>
          </section>

          <section class="res-block" id="rs-questions" data-empty="1">
            <h3 class="res-h"><span class="res-ic">❓</span> پرسش‌هایی از خودتان</h3>
            <p class="res-sub">پرسش‌هایی که فقط خودتان می‌توانید صادقانه پاسخ دهید.</p>
            <div class="prose res-body"></div>
          </section>

          <section class="res-block" id="rs-blindspots" data-empty="1">
            <h3 class="res-h"><span class="res-ic">🚧</span> نقاط کور و خطرها</h3>
            <p class="res-sub">سوگیری‌های محتمل و آنچه این تحلیل نمی‌تواند ببیند.</p>
            <div class="prose res-body"></div>
          </section>
        </div>
      </div>
    </div>`;

  // بلوک‌های ابتدایی و انتهایی که در قالب بالا تکرار شده‌اند حذف شوند
  void outroHtml;
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
   اعمال محتوا روی اسکلت
   ========================================================================== */
export function applySections(sections, { streaming = false } = {}) {
  const setBlock = (key, content) => {
    const host = document.getElementById(`rs-${key}`);
    if (!host) return;
    const body = host.querySelector('.res-body');
    if (content && content.trim()) {
      body.innerHTML = md(content);
      host.dataset.empty = '0';
    } else {
      body.innerHTML = '';
      host.dataset.empty = streaming ? '1' : '0';
    }
  };

  for (const b of [...INTRO_BLOCKS, ...OUTRO_BLOCKS]) setBlock(b.key, sections[b.key]);
  setBlock('recommendation', sections.recommendation);

  // مکاتب
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

  // مراحل / دروازه‌ها
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
}

/* ------- پیشرفت ------- */
export const TOTAL_SECTIONS =
  INTRO_BLOCKS.length + OUTRO_BLOCKS.length + 1 + SCHOOLS.length + STAGES.length;

export function progressOf(sections) {
  const done = Object.values(sections).filter(v => v && v.trim().length > 10).length;
  return Math.min(100, Math.round((done / TOTAL_SECTIONS) * 100));
}

/* ------- خلاصه احکام برای سربرگ ------- */
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

/** خلاصه وضعیت دروازه‌ها — برای سربرگ و خروجی PDF */
export function gateSummary(sections) {
  return STAGES.map(st => {
    const { verdict } = splitVerdict(sections[`gate:${st.key}`] || '');
    const cls = verdictClass(verdict).replace('v-', '');
    return { key: st.key, n: st.n, title: st.title, state: cls, label: verdict || STATE_LABEL[cls] || '—' };
  });
}
