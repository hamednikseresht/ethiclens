/* ==========================================================================
   نمایش نتیجه تحلیل — مشترک میان صفحه تحلیل زنده و صفحه مشاهده تحلیل ذخیره‌شده
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

export const GATES = [
  { key: 'dignity',      title: 'کرامت',           sub: 'کانت',   type: 'وتو' },
  { key: 'justice',      title: 'عدالت',           sub: 'رالز',   type: 'وتو' },
  { key: 'utility',      title: 'فایده',           sub: 'میل',    type: 'بهینه‌ساز' },
  { key: 'carevirtue',   title: 'مراقبت و فضیلت',  sub: 'گیلیگان و ارسطو', type: 'بهینه‌ساز' },
  { key: 'authenticity', title: 'اصالت',           sub: 'کی‌یرکگور و نیچه', type: 'پالایش' }
];

const BLOCKS = [
  { key: 'reframe',        title: 'بازخوانی مسئله',        icon: '🔍' },
  { key: 'stakeholders',   title: 'ذی‌نفعان',              icon: '👥' },
  { key: 'options',        title: 'گزینه‌های موجود',        icon: '🔀' },
  { key: 'tensions',       title: 'تعارض میان مکاتب',       icon: '⚡' },
  { key: 'recommendation', title: 'مسیر پیشنهادی',          icon: '🧭' },
  { key: 'questions',      title: 'پرسش‌هایی از خودتان',    icon: '❓' },
  { key: 'blindspots',     title: 'نقاط کور و خطرها',       icon: '🚧' }
];

/* ------- حکم‌ها و رنگ آن‌ها ------- */
function verdictClass(v) {
  if (!v) return '';
  if (/موافق|عبور|تأیید|تایید/.test(v)) return 'v-yes';
  if (/مخالف|توقف|رد/.test(v))          return 'v-no';
  if (/مشروط|هشدار/.test(v))            return 'v-maybe';
  return 'v-neutral';
}

/** «حکم: …» یا «وضعیت: …» را از ابتدای متن جدا می‌کند */
export function splitVerdict(body) {
  if (!body) return { verdict: null, rest: '' };
  const lines = body.split('\n');
  const m = (lines[0] || '').trim().match(/^(?:حکم|وضعیت)\s*[:：]\s*(.+)$/);
  if (m) return { verdict: m[1].replace(/[*_`]/g, '').trim(), rest: lines.slice(1).join('\n').trim() };
  return { verdict: null, rest: body };
}

/* ==========================================================================
   ساخت اسکلت نتیجه — همه بخش‌ها خالی، آماده پرشدن تدریجی هنگام استریم
   ========================================================================== */
export function buildSkeleton(host) {
  host.innerHTML = `
    <div class="result">
      <div id="rs-reframe"></div>

      <div class="pair">
        <div id="rs-stakeholders"></div>
        <div id="rs-options"></div>
      </div>

      <section class="res-block" id="gatesBlock">
        <h3 class="res-h"><span>🚦</span> فلوچارت پالایش تصمیم</h3>
        <p class="res-sub">دو دروازه نخست وتوکننده‌اند: نقض کرامت یا بی‌عدالتی، گزینه را رد می‌کند.</p>
        <div class="gates">
          ${GATES.map(g => `
            <div class="gate" id="gate-${g.key}" data-state="idle">
              <div class="gate-badge">${esc(g.type)}</div>
              <div class="gate-title">${esc(g.title)}</div>
              <div class="gate-sub">${esc(g.sub)}</div>
              <div class="gate-verdict">—</div>
              <div class="gate-note prose"></div>
            </div>`).join('<div class="gate-arrow">←</div>')}
        </div>
      </section>

      <section class="res-block">
        <h3 class="res-h"><span>🎓</span> نگاه هفت مکتب</h3>
        <p class="res-sub">هر کارت، همین موقعیت را از یک منظر فلسفی متفاوت می‌سنجد.</p>
        <div class="schools">
          ${SCHOOLS.map(s => `
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
            </article>`).join('')}
        </div>
      </section>

      <div id="rs-tensions"></div>
      <div id="rs-recommendation"></div>
      <div class="pair">
        <div id="rs-questions"></div>
        <div id="rs-blindspots"></div>
      </div>
    </div>`;
}

/* ==========================================================================
   به‌روزرسانی تدریجی از روی متن انباشته‌شده
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

export function applySections(sections, { streaming = false } = {}) {
  // بلوک‌های متنی ساده
  for (const b of BLOCKS) {
    const host = document.getElementById(`rs-${b.key}`);
    if (!host) continue;
    const content = sections[b.key];
    if (!content) { host.innerHTML = ''; continue; }
    const featured = b.key === 'recommendation' ? ' featured' : '';
    host.innerHTML = `
      <section class="res-block${featured}">
        <h3 class="res-h"><span>${b.icon}</span> ${esc(b.title)}</h3>
        <div class="prose">${md(content)}</div>
      </section>`;
  }

  // مکاتب
  for (const s of SCHOOLS) {
    const el = document.getElementById(`school-${s.key}`);
    if (!el) continue;
    const raw = sections[`school:${s.key}`];
    const vEl = el.querySelector('.school-verdict');
    const bEl = el.querySelector('.school-body');
    if (!raw) {
      el.classList.toggle('pending', streaming);
      vEl.textContent = streaming ? 'در انتظار…' : '—';
      vEl.className = 'school-verdict';
      continue;
    }
    el.classList.remove('pending');
    el.classList.add('filled');
    const { verdict, rest } = splitVerdict(raw);
    vEl.textContent = verdict || '—';
    vEl.className = `school-verdict ${verdictClass(verdict)}`;
    bEl.innerHTML = md(rest);
  }

  // دروازه‌ها
  for (const g of GATES) {
    const el = document.getElementById(`gate-${g.key}`);
    if (!el) continue;
    const raw = sections[`gate:${g.key}`];
    if (!raw) { el.dataset.state = 'idle'; continue; }
    const { verdict, rest } = splitVerdict(raw);
    el.dataset.state = verdictClass(verdict).replace('v-', '') || 'neutral';
    el.querySelector('.gate-verdict').textContent = verdict || '—';
    el.querySelector('.gate-note').innerHTML = md(rest);
  }
}

/* ------- شمارش پیشرفت برای نوار وضعیت ------- */
export const TOTAL_SECTIONS = BLOCKS.length + SCHOOLS.length + GATES.length;

export function progressOf(sections) {
  const done = Object.values(sections).filter(v => v && v.trim().length > 10).length;
  return Math.min(100, Math.round((done / TOTAL_SECTIONS) * 100));
}

/* ------- خلاصه یک‌خطی از احکام برای فهرست‌ها ------- */
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
