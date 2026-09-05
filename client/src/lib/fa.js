/**
 * Persian numeral helpers.
 *
 * The handoff asks for Persian numerals throughout, and this is the only way
 * to get them: a Latin digit stays Latin no matter what the font does.
 * `font-feature-settings` was tried first and does nothing here — Shabnam's
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

/**
 * A SQLite timestamp as a Persian calendar date.
 *
 * The column is written by SQLite's datetime('now'), which is UTC but has no
 * zone marker, so `new Date` on it would be read as local time and drift the
 * day across midnight. The 'Z' is added before parsing.
 *
 * Intl carries the calendar conversion and the numerals both; the fallback is
 * for the rare environment without the fa-IR locale data.
 */
export function faDate(sqlDate) {
  if (!sqlDate) return '';
  const raw = String(sqlDate);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  } catch {
    return fa(iso.slice(0, 10));
  }
}

/** Seconds as m:ss, already converted. */
export function faDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, '0');
  return fa(m > 0 ? `${m}:${rest}` : `۰:${rest}`.replace('۰:', '0:'));
}
