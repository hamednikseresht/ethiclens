/**
 * Fixture eval for the 26-block analysis contract.
 *
 * try-analysis.mjs still runs a live model. This file never does: it feeds
 * canned marked-up text through parseSections / checkCompleteness /
 * mergeSections so a format regression fails in npm test without spending
 * an API call.
 *
 *   node scripts/eval-format.mjs
 */
import { SECTION_KEYS } from '../server/services/schools.js';
import { parseSections } from '../server/services/parser.js';
import {
  checkCompleteness, mergeSections, applyFinishReason,
  completenessMessage, MIN_BODY_CHARS
} from '../server/services/completeness.js';

let pass = 0, fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function pad(key) {
  return `این بخش برای آزمون کامل‌بودن نوشته شده و از سقف حداقل نویسه می‌گذرد. (${key})`;
}

function marked(overrides = {}, omit = []) {
  const skip = new Set(omit);
  return SECTION_KEYS
    .filter(k => !skip.has(k))
    .map(k => `@@${k}@@\n${overrides[k] ?? pad(k)}`)
    .join('\n\n');
}

console.log('══════════════════════════════════════════════');
console.log('  آزمون قالب تحلیل (بدون API زنده)');
console.log('══════════════════════════════════════════════');

console.log('\n── قرارداد بلوک‌ها ──');
check('SECTION_KEYS بیست‌وشش کلید است', SECTION_KEYS.length === 26, `n=${SECTION_KEYS.length}`);
check('هر کلید یک‌بار می‌آید', new Set(SECTION_KEYS).size === SECTION_KEYS.length);

const fullText = marked();
const full = parseSections(fullText);
check('parseSections هر ۲۶ بلوک را می‌خواند', Object.keys(full).length === 26);
const fullC = checkCompleteness(full);
check('متن کامل complete است', fullC.complete === true && fullC.severity === 'ok');
check('missing و thin خالی‌اند', fullC.missing.length === 0 && fullC.thin.length === 0);
check('پیام کامل خالی است', completenessMessage(fullC) === '');

console.log('\n── ناقص و نازک ──');
const noRec = parseSections(marked({}, ['recommendation', 'test']));
const noRecC = checkCompleteness(noRec);
check('حذف پیشنهاد و آزمون → critical',
  noRecC.complete === false && noRecC.severity === 'critical'
  && noRecC.criticalMissing.includes('recommendation')
  && noRecC.criticalMissing.includes('test'));
check('پیام ناقص نام بخش را می‌گوید',
  completenessMessage(noRecC).includes('پیشنهاد'));

const thinText = marked({ issue: 'کوتاه' });
const thinC = checkCompleteness(parseSections(thinText));
check('بدنه کوتاه‌تر از MIN_BODY_CHARS نازک است',
  thinC.thin.includes('issue') && !thinC.missing.includes('issue'),
  `thin=${thinC.thin.join(',')}`);
check('MIN_BODY_CHARS همان ۲۵ است', MIN_BODY_CHARS === 25);

const emptyC = checkCompleteness({});
check('بدون بخش همه کلیدها missingاند', emptyC.missing.length === 26 && emptyC.present === 0);

console.log('\n── finish_reason ──');
const cut = applyFinishReason(fullC, 'length');
check('length حتی متن کامل را truncated می‌کند',
  cut.complete === false && cut.truncated === true && cut.severity === 'partial');
const aborted = applyFinishReason(fullC, 'abort');
check('abort هم truncated است', aborted.truncated === true && aborted.complete === false);
check('finish_reason دیگر دست نمی‌زند',
  applyFinishReason(fullC, 'stop').complete === true);

console.log('\n── ادغام ادامه ──');
const previous = parseSections(marked({}, ['recommendation', 'blindspots']));
const incoming = parseSections(
  `@@recommendation@@\n${pad('recommendation')}\n\n@@blindspots@@\n${pad('blindspots')}\n\n@@issue@@\nاین تکرار نباید جایگزین صورت‌بندی قبلی شود چون در فهرست پر کردن نیست.`
);
const merged = mergeSections(previous, incoming, ['recommendation', 'blindspots']);
const mergedC = checkCompleteness(merged);
check('ادامه بخش‌های جاافتاده را پر می‌کند', mergedC.complete === true, completenessMessage(mergedC));
check('بلوک کامل تکرارشده دست نخورده می‌ماند', merged.issue === previous.issue);
check('بدنه نازک در ادامه جایگزین نمی‌شود',
  mergeSections({ issue: pad('issue') }, { issue: 'کوتاه' }, ['issue']).issue === pad('issue'));

const stillMissing = mergeSections(previous, parseSections('@@recommendation@@\nکوتاه'), ['recommendation', 'blindspots']);
check('ادامه نازک سوراخ را پر نمی‌کند',
  checkCompleteness(stillMissing).missing.includes('blindspots')
  && checkCompleteness(stillMissing).thin.includes('recommendation') === false
  && !stillMissing.recommendation);

console.log('\n══════════════════════════════════════════════');
console.log(`  سالم: ${pass}   خراب: ${fail}`);
console.log('══════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
