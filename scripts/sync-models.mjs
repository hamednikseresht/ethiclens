/**
 * همگام‌سازی فهرست مدل‌ها با آنچه واقعاً روی حساب هر ارائه‌دهنده در دسترس است.
 *
 *   node scripts/sync-models.mjs                    گزارش وضعیت (بدون تغییر)
 *   node scripts/sync-models.mjs --apply            مدل‌های منتخبِ موجود را ثبت/فعال می‌کند
 *   node scripts/sync-models.mjs --apply --probe    قبل از فعال‌سازی، هر مدل را عملاً می‌آزماید
 *   node scripts/sync-models.mjs --provider=openai  فقط یک ارائه‌دهنده
 */
import 'dotenv/config';
import { db } from '../server/db.js';
import { listRemoteModels, pingModel } from '../server/services/llm.js';
import { listProviders } from '../server/services/providers.js';
import { setSetting, getSetting } from '../server/services/settings.js';

const APPLY = process.argv.includes('--apply');
const PROBE = process.argv.includes('--probe');
const ONLY = (process.argv.find(a => a.startsWith('--provider=')) || '').split('=')[1] || null;

/**
 * مدل‌های منتخب هر ارائه‌دهنده، به ترتیب اولویت نمایش.
 * `on:1` یعنی اگر روی حساب موجود بود فعال شود؛ `on:0` یعنی ثبت ولی خاموش.
 */
const CURATED = {
  nvidia: [
    { id: 'nvidia/nemotron-3-super-120b-a12b',             label: 'Nemotron 3 Super 120B',      note: 'تعادل خوب کیفیت استدلال، فارسی روان و سرعت', on: 1 },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b',             label: 'Nemotron 3 Ultra 550B',      note: 'بزرگ‌ترین مدل — برای دوراهی‌های پیچیده و چندلایه', on: 1 },
    { id: 'moonshotai/kimi-k3',                            label: 'Kimi K3',                    note: 'چندزبانه قوی — نثر فارسی طبیعی‌تر، کمی کندتر', on: 1 },
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', label: 'Nemotron 3 Nano Reasoning',  note: 'نسخه استدلالی سبک', on: 1 },
    { id: 'nvidia/nemotron-3.5-lightning-30b-a3b',         label: 'Nemotron 3.5 Lightning',     note: 'سریع — مناسب وقتی تصمیم فوری است', on: 1 },
    { id: 'nvidia/nemotron-3-nano-30b-a3b',                label: 'Nemotron 3 Nano 30B',        note: 'سبک‌ترین و کم‌هزینه‌ترین گزینه', on: 1 },
    { id: 'openai/gpt-oss-120b',                           label: 'GPT-OSS 120B',               note: 'مدل باز — پیروی دقیق از قالب', on: 1 },
    { id: 'minimaxai/minimax-m3',                          label: 'MiniMax M3',                 note: 'گزینه جایگزین چندزبانه — کندتر', on: 1 },
    { id: 'openai/gpt-oss-20b',                            label: 'GPT-OSS 20B',                note: 'نسخه کوچک — سریع ولی سطحی‌تر', on: 0 },
    { id: 'meta/muse-glimmer-30b',                         label: 'Muse Glimmer 30B',           note: 'آزمایشی', on: 0 }
  ],
  openai: [
    { id: 'gpt-4o',       label: 'GPT-4o',       note: 'چندزبانه قوی — فارسی بسیار روان', on: 1 },
    { id: 'gpt-4o-mini',  label: 'GPT-4o mini',  note: 'ارزان و سریع — برای حجم بالا', on: 1 },
    { id: 'gpt-4.1',      label: 'GPT-4.1',      note: 'پیروی دقیق‌تر از دستور و قالب', on: 1 },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', note: 'نسخه سبک ۴٫۱', on: 1 },
    { id: 'o4-mini',      label: 'o4-mini',      note: 'مدل استدلالی — برای دوراهی‌های پیچیده', on: 1 },
    { id: 'gpt-5',        label: 'GPT-5',        note: 'در صورت دسترسی روی حساب', on: 0 },
    { id: 'gpt-5-mini',   label: 'GPT-5 mini',   note: 'در صورت دسترسی روی حساب', on: 0 },
    { id: 'o3',           label: 'o3',           note: 'استدلال عمیق — پرهزینه', on: 0 }
  ]
};

const upsert = db.prepare(`
  INSERT INTO models (provider_id, model_id, label, note, enabled, sort_order)
  VALUES (@pid, @id, @label, @note, @enabled, @sort)
  ON CONFLICT(provider_id, model_id) DO UPDATE SET
    label = excluded.label, note = excluded.note,
    enabled = excluded.enabled, sort_order = excluded.sort_order`);

let anyEnabled = null;

for (const p of listProviders()) {
  if (ONLY && p.key !== ONLY) continue;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${p.label}  (${p.key})`);
  console.log(`  ${p.base_url}`);
  console.log('═'.repeat(60));

  if (!p.api_key) {
    console.log('  ⚠ کلید API ثبت نشده — رد شد.\n');
    continue;
  }

  let remote;
  try {
    remote = await listRemoteModels(p);
    console.log(`  ${remote.length} مدل روی حساب فهرست شده است.`);
  } catch (e) {
    console.log(`  ✗ فهرست مدل‌ها گرفته نشد: ${e.message}\n`);
    continue;
  }

  const wanted = CURATED[p.key] || [];
  const present = wanted.filter(w => remote.includes(w.id));
  const absent  = wanted.filter(w => !remote.includes(w.id));

  console.log(`  ${present.length} مورد از ${wanted.length} مدل منتخب روی این حساب هست.`);
  if (absent.length) console.log(`  ✗ نیست: ${absent.map(a => a.id).join('، ')}`);

  /* ---- آزمایش واقعی (اختیاری) ---- */
  // خطای دائمی یعنی مدل واقعاً روی حساب نیست؛ تایم‌اوت و ۵۰۳ گذرا هستند
  const PERMANENT = new Set([400, 401, 403, 404, 410]);
  let usable = present;
  if (PROBE && present.length) {
    console.log('\n  ── آزمایش عملی هر مدل ──');
    const results = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < present.length) {
        const m = present[cursor++];
        try {
          const r = await pingModel(p, m.id, 60000);
          results.push({ id: m.id, ok: true, ms: r.latencyMs });
          console.log(`    ✓ ${String(r.latencyMs).padStart(6)} م‌ث  ${m.id}`);
        } catch (e) {
          const permanent = PERMANENT.has(e.status);
          results.push({ id: m.id, ok: false, permanent });
          console.log(`    ${permanent ? '✗' : '~'} ${'—'.padStart(6)}      ${m.id}  →  ${e.message.slice(0, 68)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, present.length) }, worker));

    // فقط خطای دائمی مدل را از فهرست استفاده‌پذیر بیرون می‌برد
    usable = present.filter(w => {
      const r = results.find(x => x.id === w.id);
      return !r || r.ok || !r.permanent;
    });
    const okCount = results.filter(r => r.ok).length;
    const transient = results.filter(r => !r.ok && !r.permanent).length;
    console.log(`\n  ${okCount} مدل پاسخ داد، ${transient} مورد گذرا (فعال می‌ماند)، ` +
                `${results.length - okCount - transient} مورد دائماً در دسترس نیست.`);
  }

  if (!APPLY) continue;

  /* ---- ثبت در پایگاه داده ---- */
  const curatedIds = new Set(wanted.map(w => w.id));

  db.transaction(() => {
    wanted.forEach((w, i) => {
      if (!remote.includes(w.id)) return;
      const works = !PROBE || usable.some(u => u.id === w.id);
      upsert.run({ pid: p.id, id: w.id, label: w.label, note: w.note,
                   enabled: (w.on && works) ? 1 : 0, sort: (i + 1) * 10 });
    });

    for (const r of db.prepare('SELECT id, model_id, enabled FROM models WHERE provider_id = ?').all(p.id)) {
      // روی حساب نیست → حذف
      if (!remote.includes(r.model_id)) {
        db.prepare('DELETE FROM models WHERE id = ?').run(r.id);
        console.log(`  حذف شد (روی حساب نیست): ${r.model_id}`);
        continue;
      }
      // هست ولی در فهرست منتخب نیست → ثبت بماند، ولی خاموش شود
      if (!curatedIds.has(r.model_id) && r.enabled) {
        db.prepare('UPDATE models SET enabled = 0 WHERE id = ?').run(r.id);
        console.log(`  خاموش شد (خارج از فهرست منتخب): ${r.model_id}`);
      }
    }
  })();

  const rows = db.prepare('SELECT model_id, label, enabled FROM models WHERE provider_id = ? ORDER BY sort_order').all(p.id);
  console.log('\n  ── وضعیت نهایی ──');
  for (const r of rows) {
    console.log(`    ${r.enabled ? '●' : '○'} ${r.model_id.padEnd(46)} ${r.label}`);
    if (r.enabled && !anyEnabled) anyEnabled = `${p.key}:${r.model_id}`;
  }
}

/* ---- اطمینان از معتبر بودن مدل پیش‌فرض ---- */
if (APPLY) {
  const current = getSetting('default_model');
  const valid = current && db.prepare(`
    SELECT 1 FROM models m JOIN providers p ON p.id = m.provider_id
    WHERE m.enabled = 1 AND p.enabled = 1 AND p.key || ':' || m.model_id = ?`).get(current);

  if (!valid && anyEnabled) {
    setSetting('default_model', anyEnabled);
    console.log(`\n✓ مدل پیش‌فرض روی ${anyEnabled} تنظیم شد (مقدار قبلی معتبر نبود).`);
  } else if (valid) {
    console.log(`\n✓ مدل پیش‌فرض: ${current}`);
  } else {
    console.log('\n⚠ هیچ مدل فعالی وجود ندارد — مدل پیش‌فرض تنظیم نشد.');
  }
}
console.log();
