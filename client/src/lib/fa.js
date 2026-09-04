/**
 * Persian numeral helpers.
 *
 * The handoff asks for Persian numerals throughout, and this is the only way
 * to get them: a Latin digit stays Latin no matter what the font does.
 * `font-feature-settings` was tried first and does nothing here — Vazirmatn's
 * stylistic sets change letterforms, not the digits a string is made of.
 *
 * Everything user-visible goes through fa(). Anything the machine reads back
 * — form values, ids, API payloads — must not, or a number stops parsing.
 */

const FA = '۰۱۲۳۴۵۶۷۸۹';

/** Latin digits to Persian, for display only. */
export function fa(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace(/[0-9]/g, (d) => FA[+d]);
}

/** Thousands separated, then converted — for counts and token totals. */
export function faCount(n) {
  if (n === null || n === undefined) return '';
  return fa(Number(n).toLocaleString('en-US'));
}

/** Seconds as m:ss, already converted. */
export function faDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, '0');
  return fa(m > 0 ? `${m}:${rest}` : `۰:${rest}`.replace('۰:', '0:'));
}
