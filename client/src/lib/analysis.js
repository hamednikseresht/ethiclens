import { fa } from './fa';

/**
 * Parsing and structure for an analysis result.
 *
 * The model returns 26 blocks marked with @@key@@. The server stores them
 * parsed; this file turns them into what the screen needs — verdicts split
 * from bodies, the comparison matrix from a markdown table, and the narrative
 * order the sections are read in.
 *
 * The order and grouping live here rather than coming from the API because
 * they are a reading decision, not data: the five gates each pull in the
 * schools that feed them, so a reader meets a verdict and then the reasoning
 * behind it. Names and colours still come from the server, which stays the
 * one source of truth for what a lens is called and how it looks.
 */

/** Which schools argue for each gate, in the order the result reads. */
export const STAGE_SCHOOLS = {
  dignity:      ['deontology'],
  justice:      ['contractualism'],
  utility:      ['utilitarianism', 'commongood'],
  carevirtue:   ['care', 'virtue'],
  authenticity: ['existentialism', 'nietzsche']
};

/** Prose blocks, grouped into the five phases of the framework. */
export const PHASES = [
  {
    id: 'frame',
    title: 'صورت‌بندی مسئله',
    blocks: [
      { key: 'issue',        title: 'آیا این یک مسئله اخلاقی است؟' },
      { key: 'reframe',      title: 'بازخوانی مسئله' },
      { key: 'facts',        title: 'واقعیت‌ها و شکاف‌های اطلاعاتی' },
      { key: 'stakeholders', title: 'ذی‌نفعان' },
      { key: 'options',      title: 'گزینه‌های موجود' }
    ]
  },
  {
    id: 'tension',
    title: 'تعارض‌ها',
    blocks: [{ key: 'tensions', title: 'تعارض میان مکاتب' }]
  },
  {
    id: 'decide',
    title: 'تصمیم',
    blocks: [
      { key: 'recommendation', title: 'مسیر پیشنهادی' },
      { key: 'test',           title: 'آزمون تصمیم' }
    ]
  },
  {
    id: 'act',
    title: 'اجرا و بازنگری',
    blocks: [
      { key: 'implementation', title: 'اجرای کم‌آسیب' },
      { key: 'questions',      title: 'پرسش‌هایی از خودتان' },
      { key: 'blindspots',     title: 'نقاط کور و خطرها' },
      { key: 'revisit',        title: 'بازنگری' }
    ]
  }
];

/**
 * Split a leading verdict line off a section body.
 *
 * Gate and school sections start with «حکم: …» or «وضعیت: …». Keeping the
 * verdict as a separate value lets it be shown as a chip rather than buried
 * as the first sentence of a paragraph.
 */
export function splitVerdict(body) {
  if (!body) return { verdict: null, rest: '' };
  const lines = String(body).split('\n');
  const m = (lines[0] || '').trim().match(/^(?:حکم|وضعیت)\s*[:：]\s*(.+)$/);
  if (!m) return { verdict: null, rest: body };
  return {
    verdict: m[1].replace(/[*_`]/g, '').trim(),
    rest: lines.slice(1).join('\n').trim()
  };
}

/** Map a verdict phrase to one of four states, for colour. */
export function verdictState(v) {
  if (!v) return null;
  if (/موافق|عبور|تأیید|تایید/.test(v)) return 'ok';
  if (/مخالف|توقف|رد/.test(v))          return 'no';
  if (/مشروط|هشدار/.test(v))            return 'warn';
  return 'neutral';
}

export const VERDICT_STYLE = {
  ok:      'bg-ok-soft text-ok border-ok/30',
  no:      'bg-destructive-soft text-destructive border-destructive/30',
  warn:    'bg-warn-soft text-warn border-warn/30',
  neutral: 'bg-muted text-text-3 border-border'
};

/* --------------------------------------------------------------------------
   Comparison matrix
   -------------------------------------------------------------------------- */

const FA_DIGITS = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
                    '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };

function toScore(cell) {
  const norm = String(cell)
    .replace(/[۰-۹٠-٩]/g, d => FA_DIGITS[d])
    .replace(/[−–—]/g, '-')     // the model writes a real minus sign, not a hyphen
    .trim();
  const m = norm.match(/-?\d+/);
  if (!m) return null;
  return Math.max(-2, Math.min(2, parseInt(m[0], 10)));
}

/**
 * Turn the model's markdown table into scored rows.
 *
 * Separator and header rows are skipped by shape rather than position: the
 * model does not always emit them in the same order, and counting rows would
 * silently drop a real option the day it changes.
 */
export function parseMatrix(raw) {
  if (!raw) return [];
  const rows = [];
  for (const line of String(raw).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;

    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (/^[-:\s]+$/.test(cells.join(''))) continue;      // separator row

    const scores = cells.slice(1).map(toScore);
    if (scores.every(s => s === null)) continue;         // header row

    rows.push({ option: cells[0].replace(/[*`]/g, '').trim(), scores });
  }
  return rows;
}

export const MATRIX_COLUMNS = [
  { key: 'dignity',      label: 'کرامت' },
  { key: 'justice',      label: 'عدالت' },
  { key: 'utility',      label: 'فایده' },
  { key: 'commongood',   label: 'خیر مشترک' },
  { key: 'care',         label: 'مراقبت' },
  { key: 'virtue',       label: 'فضیلت' },
  { key: 'authenticity', label: 'اصالت' }
];

/** Cell colour by score, from strong support to strong objection. */
export function scoreStyle(v) {
  if (v === null || v === undefined) return 'bg-muted/40 text-text-5';
  if (v >= 2)  return 'bg-ok text-white';
  if (v === 1) return 'bg-ok-soft text-ok';
  if (v === 0) return 'bg-muted text-text-4';
  if (v === -1) return 'bg-destructive-soft text-destructive';
  return 'bg-destructive text-white';
}

export function scoreLabel(v) {
  if (v === null || v === undefined) return '—';
  return fa(v > 0 ? `+${v}` : String(v));
}

/**
 * Row totals, and which option leads.
 *
 * The sum is a visual aid, never the answer: the first two columns are veto
 * gates, and a negative there cannot be bought back with positives elsewhere.
 * The result screen says so next to the table.
 */
export function matrixTotals(rows) {
  const totals = rows.map(r => r.scores.reduce((a, b) => a + (b ?? 0), 0));
  const best = totals.length ? Math.max(...totals) : null;
  return { totals, best };
}
