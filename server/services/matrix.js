/**
 * Parse the model's markdown comparison table into scored rows.
 *
 * Lives here rather than in the React result page or the HTML renderer, so
 * a stored analysis, a public page and the live-model probe all agree on
 * what a cell means. MATRIX_COLUMNS stays in schools.js — this file only
 * reads a table.
 *
 * Separator and header rows are skipped by shape rather than position: the
 * model does not always emit them in the same order, and counting rows would
 * silently drop a real option the day it changes.
 */
import { MATRIX_COLUMNS } from './schools.js';

const FA_DIGITS = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function toScore(cell) {
  const norm = String(cell)
    .replace(/[۰-۹٠-٩]/g, d => FA_DIGITS[d])
    .replace(/[−–—]/g, '-')
    .trim();
  const m = norm.match(/-?\d+/);
  if (!m) return null;
  return Math.max(-2, Math.min(2, parseInt(m[0], 10)));
}

export function parseMatrix(raw) {
  if (!raw) return [];
  const rows = [];
  for (const line of String(raw).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;

    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (/^[-:\s]+$/.test(cells.join(''))) continue;

    const scores = cells.slice(1).map(toScore);
    if (scores.every(s => s === null)) continue;

    rows.push({ option: cells[0].replace(/[*`]/g, '').trim(), scores });
  }
  return rows;
}

/**
 * Which of MATRIX_COLUMNS this particular table actually scored.
 *
 * The list is what the current prompt asks for, but a stored analysis was
 * produced by whatever prompt was live when it ran — everything from before
 * the genealogy column has one fewer score per row. A column no row scored
 * is not drawn.
 */
export function scoredColumns(rows) {
  return MATRIX_COLUMNS
    .map((c, i) => ({ ...c, i }))
    .filter(c => rows.some(r => r.scores[c.i] !== null && r.scores[c.i] !== undefined));
}
