import { fa } from './fa';
import { MATRIX_COLUMNS, STAGE_SCHOOLS } from '@contract/schools.js';
import { parseMatrix, scoredColumns } from '@contract/matrix.js';

export { MATRIX_COLUMNS, STAGE_SCHOOLS, parseMatrix, scoredColumns };

/**
 * Parsing and structure for an analysis result.
 *
 * The model returns 26 blocks marked with @@key@@. The server stores them
 * parsed; this file turns them into what the screen needs — verdicts split
 * from bodies, and the narrative order the sections are read in.
 *
 * The order and grouping live here rather than coming from the API because
 * they are a reading decision, not data: the five gates each pull in the
 * schools that feed them, so a reader meets a verdict and then the reasoning
 * behind it. Column keys, section keys and the matrix parser live in
 * server/services — one list, one parser, three callers.
 */

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
