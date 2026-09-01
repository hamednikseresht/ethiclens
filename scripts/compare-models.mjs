/**
 * Run the same dilemma through several models and score the results.
 *
 * Choosing a model for this product is not a general "which is smartest"
 * question. What matters here is narrow and measurable: does it return all 26
 * marked blocks, does it write Persian rather than drifting to English, does
 * it produce a parseable comparison matrix, and what does that cost in tokens
 * and seconds. This measures exactly those.
 *
 * Usage:
 *   node scripts/compare-models.mjs                       every enabled model
 *   node scripts/compare-models.mjs openai:gpt-4.1-mini … a specific list
 */
import 'dotenv/config';
import { db } from '../server/db.js';
import { runAnalysis } from '../server/services/analysis.js';
import { enabledModels, modelRef } from '../server/services/providers.js';
import { checkCompleteness } from '../server/services/completeness.js';
import { parseSections } from '../server/services/parser.js';
import { SECTION_KEYS, SCHOOLS } from '../server/services/schools.js';

/** One dilemma, deliberately layered, so weak models visibly thin out. */
const DILEMMA = {
  dilemma: 'مدیرم خواسته در گزارش ایمنی یک محصول، نتیجه یک آزمون شکست‌خورده را حذف کنم. ' +
           'می‌گوید آزمون ایراد داشته و تکرارش هزینه دارد و تحویل مشتری عقب می‌افتد. ' +
           'اگر قبول نکنم احتمالاً از پروژه کنار گذاشته می‌شوم و همسرم به‌تازگی بیکار شده. ' +
           'اگر قبول کنم و محصول واقعاً ایراد داشته باشد، ممکن است کسی آسیب ببیند.',
  domain: 'محیط کار و حرفه',
  stakeholders: 'خودم، مدیرم، همکاران تیم، مشتریان نهایی، خانواده‌ام',
  options: '۱. حذف کنم ۲. رد کنم ۳. به واحد ایمنی گزارش بدهم ۴. درخواست تکرار آزمون بدهم',
  urgency: 'چند روز فرصت دارم',
  values: 'صداقت برایم مهم است ولی نمی‌توانم خانواده‌ام را بی‌درآمد بگذارم.'
};

const PERSIAN = /[؀-ۿ]/g;

function score(text, sections) {
  const c = checkCompleteness(sections);

  const letters = text.replace(/\s|[0-9\p{P}\p{S}]/gu, '');
  const persianRatio = letters.length ? (text.match(PERSIAN) || []).length / letters.length : 0;

  // A verdict line is what the result page turns into the gate pills; without
  // it the analysis renders but says nothing at a glance.
  const verdicts = SCHOOLS.filter(s => /^\s*(حکم|وضعیت)\s*[:：]/m.test(sections[`school:${s.key}`] || '')).length;

  const matrixRows = (sections.matrix || '').split('\n')
    .filter(l => l.trim().startsWith('|') && !/^[\s|:-]+$/.test(l)).length;

  return {
    present: c.present, total: c.total, severity: c.severity,
    missing: [...c.missing, ...c.thin],
    persianPct: Math.round(persianRatio * 100),
    verdicts, schools: SCHOOLS.length,
    matrixRows: Math.max(0, matrixRows - 1)   // minus the header row
  };
}

const wanted = process.argv.slice(2);
const models = enabledModels().filter(m => !wanted.length || wanted.includes(modelRef(m)));

if (!models.length) {
  console.error('هیچ مدلی برای مقایسه پیدا نشد.');
  process.exit(1);
}

const user = db.prepare("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
if (!user) { console.error('کاربر مدیر پیدا نشد.'); process.exit(1); }

console.log(`\n  مقایسه ${models.length} مدل روی یک دوراهی یکسان\n`);

const results = [];
for (const m of models) {
  const ref = modelRef(m);
  process.stdout.write(`  ${ref.padEnd(34)} `);
  const started = Date.now();
  try {
    const r = await runAnalysis({
      user, input: { ...DILEMMA, model: ref }, source: 'compare', ip: null
    });
    const s = score(r.text, r.sections);
    const secs = Math.round((Date.now() - started) / 1000);
    const inTok = r.usage?.prompt_tokens ?? 0;
    const outTok = r.usage?.completion_tokens ?? 0;
    const reason = r.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    results.push({ ref, ...s, secs, inTok, outTok, reason });
    console.log(`${s.present}/${s.total} بخش · ${s.persianPct}% فارسی · ${s.verdicts}/${s.schools} حکم · ${secs}s · ${outTok} توکن خروجی${reason ? ` (${reason} استدلال)` : ''}`);
  } catch (e) {
    results.push({ ref, failed: e.message });
    console.log(`❌ ${e.message}`);
  }
}

console.log('\n  ─────────────────────────────────────────────────────────────');
console.log('  مدل                                بخش   فارسی  حکم  ماتریس  ثانیه  توکن‌خروجی');
for (const r of results) {
  if (r.failed) { console.log(`  ${r.ref.padEnd(34)} ناموفق`); continue; }
  console.log(
    `  ${r.ref.padEnd(34)} ${String(r.present + '/' + r.total).padEnd(6)}` +
    `${String(r.persianPct + '%').padEnd(7)}${String(r.verdicts + '/' + r.schools).padEnd(5)}` +
    `${String(r.matrixRows).padEnd(8)}${String(r.secs).padEnd(7)}${r.outTok}`
  );
}

const ok = results.filter(r => !r.failed && r.present === r.total && r.persianPct >= 90);
if (ok.length) {
  ok.sort((a, b) => a.outTok - b.outTok);
  console.log(`\n  کامل و فارسی، از کم‌هزینه‌ترین: ${ok.map(r => r.ref).join(' → ')}`);
}

const gaps = results.filter(r => !r.failed && r.missing?.length);
if (gaps.length) {
  console.log('\n  بخش‌های جامانده:');
  for (const r of gaps) console.log(`    ${r.ref}: ${r.missing.join('، ')}`);
}
console.log();
process.exit(0);
