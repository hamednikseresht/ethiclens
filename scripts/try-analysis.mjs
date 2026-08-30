/**
 * اجرای یک تحلیل واقعی از مسیر کامل برنامه (ورود → استریم SSE → تجزیه بلوک‌ها)
 * و گزارش اینکه مدل قالب خواسته‌شده را چقدر درست رعایت کرده است.
 *
 *   node scripts/try-analysis.mjs                     مدل پیش‌فرض
 *   node scripts/try-analysis.mjs <model-id>          مدل دلخواه
 *   node scripts/try-analysis.mjs --show              چاپ کامل متن تحلیل
 */
import 'dotenv/config';

const BASE = process.env.BASE || 'http://localhost:3000';
const SHOW = process.argv.includes('--show');
const MODEL = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

const REQUIRED = [
  'reframe', 'stakeholders', 'options',
  'school:virtue', 'school:deontology', 'school:utilitarianism', 'school:contractualism',
  'school:care', 'school:existentialism', 'school:nietzsche',
  'gate:dignity', 'gate:justice', 'gate:utility', 'gate:carevirtue', 'gate:authenticity',
  'tensions', 'recommendation', 'questions', 'blindspots'
];

const jar = new Map();
async function req(path, { method = 'GET', body, csrf, stream } = {}) {
  const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  if (stream) return res;
  const t = await res.text();
  try { return { status: res.status, data: JSON.parse(t) }; } catch { return { status: res.status, data: t }; }
}

/* ---- ورود ---- */
let { data: me } = await req('/api/auth/me');
const login = await req('/api/auth/login', {
  method: 'POST', csrf: me.csrf,
  body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
});
if (login.status !== 200) { console.error('ورود ناموفق:', login.data); process.exit(1); }
const csrf = login.data.csrf;

const model = MODEL || (await req('/api/analyze/meta')).data.defaultModel;
console.log(`\nمدل: ${model}`);
console.log('در حال ارسال دوراهی آزمایشی…\n');

/* ---- یک دوراهی واقعی و چندلایه ---- */
const payload = {
  model,
  dilemma:
    'من سرپرست تیم فنی یک استارتاپ سلامت هستم. کشف کرده‌ام که الگوریتم تشخیص ما برای بیماران زن ' +
    'حدود ۱۵٪ خطای بیشتری دارد، چون داده آموزشی‌مان بیشتر مردانه بوده. مدیرعامل می‌گوید انتشار این موضوع ' +
    'پیش از دور جذب سرمایه، شرکت را نابود می‌کند و ۴۰ نفر بیکار می‌شوند؛ قول می‌دهد ظرف شش ماه بعد از جذب سرمایه ' +
    'اصلاحش کنیم. در این شش ماه حدود دو هزار بیمار زن با این ابزار غربالگری می‌شوند. ' +
    'من تنها کسی هستم که این را می‌داند.',
  domain: 'فناوری و هوش مصنوعی',
  stakeholders: 'بیماران زن، ۴۰ کارمند شرکت، مدیرعامل، سرمایه‌گذاران، خودم و خانواده‌ام',
  options: '۱. سکوت تا بعد از جذب سرمایه ۲. اصرار بر افشای فوری به هیئت‌مدیره ۳. گزارش به نهاد ناظر ۴. توقف فروش به مراکز زنان تا اصلاح',
  urgency: 'چند روز فرصت دارم',
  values: 'صداقت حرفه‌ای برایم بنیادی است، ولی نمی‌خواهم باعث بیکاری همکارانم شوم.'
};

const started = Date.now();
const res = await req('/api/analyze/stream', { method: 'POST', csrf, body: payload, stream: true });
if (!res.ok) { console.error('خطا:', res.status, await res.text()); process.exit(1); }

/* ---- خواندن SSE ---- */
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '', acc = '', analysisId = null, firstByte = null, err = null, doneInfo = null;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let sep;
  while ((sep = buf.indexOf('\n\n')) >= 0) {
    const chunk = buf.slice(0, sep); buf = buf.slice(sep + 2);
    if (chunk.startsWith(':')) continue;
    let ev = 'message', data = '';
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) continue;
    let o; try { o = JSON.parse(data); } catch { continue; }
    if (ev === 'start') { analysisId = o.analysisId; }
    else if (ev === 'delta') {
      if (firstByte === null) { firstByte = Date.now() - started; process.stdout.write('  دریافت: '); }
      acc += o.t;
      if (acc.length % 400 < o.t.length) process.stdout.write('▪');
    }
    else if (ev === 'done') doneInfo = o;
    else if (ev === 'error') err = o.message;
  }
}
console.log('\n');

if (err) { console.error('✗ خطای مدل:', err); process.exit(1); }

const elapsed = Date.now() - started;
const sections = doneInfo?.sections || {};

/* ---- گزارش ---- */
console.log('═'.repeat(58));
console.log(`  شناسه تحلیل   : ${analysisId}`);
console.log(`  اولین توکن    : ${firstByte} م‌ث`);
console.log(`  زمان کل       : ${(elapsed / 1000).toFixed(1)} ثانیه`);
console.log(`  طول خروجی     : ${acc.length} نویسه`);
if (doneInfo?.usage) {
  console.log(`  توکن ورودی    : ${doneInfo.usage.prompt_tokens}`);
  console.log(`  توکن خروجی    : ${doneInfo.usage.completion_tokens}`);
}
console.log('═'.repeat(58));

const missing = REQUIRED.filter(k => !sections[k] || sections[k].trim().length < 15);
const extra = Object.keys(sections).filter(k => !REQUIRED.includes(k));

console.log(`\n  بلوک‌های لازم : ${REQUIRED.length - missing.length}/${REQUIRED.length}`);
if (missing.length) console.log(`  ✗ جا افتاده   : ${missing.join(', ')}`);
if (extra.length)   console.log(`  ! بلوک اضافه  : ${extra.join(', ')}`);

/* ---- بررسی خط «حکم:» در هر مکتب ---- */
const schools = REQUIRED.filter(k => k.startsWith('school:'));
const gates = REQUIRED.filter(k => k.startsWith('gate:'));
const hasVerdict = k => /^\s*(حکم|وضعیت)\s*[:：]/.test((sections[k] || '').split('\n')[0] || '');
const sv = schools.filter(hasVerdict).length;
const gv = gates.filter(hasVerdict).length;
console.log(`  خط «حکم»      : ${sv}/${schools.length} مکتب`);
console.log(`  خط «وضعیت»    : ${gv}/${gates.length} دروازه`);

/* ---- بررسی زبان: نسبت نویسه‌های فارسی ---- */
const fa = (acc.match(/[؀-ۿ]/g) || []).length;
const la = (acc.match(/[A-Za-z]/g) || []).length;
console.log(`  نسبت فارسی    : ${((fa / (fa + la || 1)) * 100).toFixed(1)}٪`);

/* ---- نمونه خروجی ---- */
console.log('\n── نمونه: بازخوانی مسئله ──');
console.log((sections.reframe || '(خالی)').slice(0, 500));
console.log('\n── نمونه: حکم وظیفه‌گرایی (کانت) ──');
console.log((sections['school:deontology'] || '(خالی)').slice(0, 500));
console.log('\n── نمونه: مسیر پیشنهادی ──');
console.log((sections.recommendation || '(خالی)').slice(0, 700));

if (SHOW) {
  console.log('\n' + '═'.repeat(58) + '\n متن کامل \n' + '═'.repeat(58));
  console.log(acc);
}

const ok = missing.length === 0 && sv === schools.length && gv === gates.length;
console.log(`\n${ok ? '✓ مدل قالب را کامل رعایت کرد.' : '⚠ قالب ناقص رعایت شد — دستور تحلیل نیاز به تنظیم دارد.'}\n`);
process.exit(ok ? 0 : 2);
