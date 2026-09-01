import { SECTION_KEYS, SCHOOLS, STAGES } from './schools.js';

/**
 * Completeness check for a finished analysis.
 *
 * The model is asked to emit 26 marked blocks. Nothing guarantees it does.
 * A response can be cut short by the provider's token ceiling, a dropped
 * connection mid-stream, or the model simply wandering off the format. In
 * every one of those cases streamChat still resolves, so without this check
 * the row would be stored as 'done' and the user would be shown a partial
 * analysis with no indication that anything was missing.
 *
 * Two failure shapes are distinguished:
 *   missing — the marker never appeared at all
 *   thin    — the marker appeared but the body is too short to be real
 *
 * "Thin" matters because a truncated stream usually leaves the final block
 * as a bare marker with a word or two under it, which parses fine but says
 * nothing.
 */

/**
 * SQL predicate for "the model finished and produced something usable".
 *
 * Introducing 'partial' split what used to be a single 'done' value, so every
 * query that meant "finished" and tested status = 'done' would silently drop
 * partial rows — hiding them from the reflection reminder, from the sitemap,
 * and from their own published page. Import this instead of writing the
 * comparison inline, so the next status value only has to be added once.
 */
export const SQL_FINISHED = "status IN ('done','partial')";

/** A block shorter than this is treated as unusable rather than terse. */
const MIN_BODY_CHARS = 25;

/**
 * Sections whose absence breaks the product rather than merely thinning it.
 * These carry the verdict the user actually came for; the rest are context.
 */
const CRITICAL = new Set([
  'issue', 'options', 'recommendation', 'test',
  ...STAGES.map(s => `gate:${s.key}`)
]);

/** Persian labels, so the UI can name what is missing without its own map. */
const LABELS = {
  issue: 'صورت‌بندی مسئله',
  reframe: 'بازخوانی مسئله',
  facts: 'واقعیت‌های لازم',
  stakeholders: 'ذی‌نفعان',
  options: 'گزینه‌ها',
  matrix: 'ماتریس سنجش',
  tensions: 'تعارض‌ها',
  recommendation: 'پیشنهاد',
  test: 'آزمون تصمیم',
  implementation: 'گام‌های اجرا',
  questions: 'پرسش‌های باقی‌مانده',
  blindspots: 'نقاط کور',
  revisit: 'بازنگری'
};

for (const s of STAGES) LABELS[`gate:${s.key}`] = s.title;
for (const s of SCHOOLS) LABELS[`school:${s.key}`] = s.name;

export function sectionLabel(key) {
  return LABELS[key] || key;
}

/**
 * Inspect parsed sections against the canonical key list.
 *
 * Returns a plain object so it can be stored as JSON and handed to the
 * client unchanged.
 */
export function checkCompleteness(sections) {
  const src = sections && typeof sections === 'object' ? sections : {};

  const missing = [];
  const thin = [];

  for (const key of SECTION_KEYS) {
    const body = String(src[key] ?? '').trim();
    if (!body) missing.push(key);
    else if (body.length < MIN_BODY_CHARS) thin.push(key);
  }

  const incomplete = [...missing, ...thin];
  const criticalMissing = incomplete.filter(k => CRITICAL.has(k));

  return {
    total: SECTION_KEYS.length,
    present: SECTION_KEYS.length - missing.length,
    missing,
    thin,
    criticalMissing,
    complete: incomplete.length === 0,
    // Severity drives whether the UI warns quietly or loudly.
    severity: incomplete.length === 0 ? 'ok'
            : criticalMissing.length ? 'critical'
            : 'partial'
  };
}

/** One-line Persian summary for toasts and list rows. */
export function completenessMessage(c) {
  if (!c || c.complete) return '';
  const n = c.missing.length + c.thin.length;
  const names = [...c.missing, ...c.thin].slice(0, 3).map(sectionLabel).join('، ');
  const more = n > 3 ? ` و ${n - 3} بخش دیگر` : '';
  return `${n} بخش از ${c.total} بخش ناقص است: ${names}${more}`;
}
