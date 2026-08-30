/**
 * آزمایش تک‌تک مدل‌ها با یک درخواست کوچک، برای تشخیص اینکه کدام‌ها
 * واقعاً روی این حساب برای chat/completions کار می‌کنند.
 *
 *   node scripts/probe-models.mjs                 مدل‌های ثبت‌شده در پایگاه داده
 *   node scripts/probe-models.mjs --remote        همه مدل‌های چت روی حساب
 *   node scripts/probe-models.mjs --fix           مدل‌های خراب را در پایگاه داده غیرفعال می‌کند
 */
import 'dotenv/config';
import { db } from '../server/db.js';
import { listRemoteModels } from '../server/services/nvidia.js';
import { getSetting, apiKey } from '../server/services/settings.js';

const REMOTE = process.argv.includes('--remote');
const FIX = process.argv.includes('--fix');

const SKIP = /embed|rerank|nemoretriever|clip|ocr|parakeet|riva|stt|tts|safety|guard|topic-control|nemoguard|vision|video-detector|diffusion|molmo|deplot|kosmos|neva|vila|nvclip|parse|reward|fuyu/i;

const base = (getSetting('nvidia_base_url') || '').replace(/\/+$/, '');
const key = apiKey();

const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : null; };
const TIMEOUT = arg('timeout') ?? 90000;
const CONCURRENCY = arg('jobs') ?? 6;

async function probe(model) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'به فارسی فقط یک کلمه بنویس: سلام' }],
        max_tokens: 24, temperature: 0, stream: false
      }),
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      let msg = '';
      const body = await res.text();
      try { msg = JSON.parse(body)?.detail || JSON.parse(body)?.error?.message || body; } catch { msg = body; }
      return { ok: false, ms, status: res.status, msg: String(msg).replace(/\s+/g, ' ').slice(0, 110) };
    }
    const j = await res.json();
    const txt = (j.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim();
    const fa = /[؀-ۿ]/.test(txt);
    return { ok: true, ms, txt: txt.slice(0, 50), fa };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, status: 'ERR', msg: e.message.slice(0, 110) };
  }
}

let list;
if (REMOTE) {
  list = (await listRemoteModels()).filter(m => !SKIP.test(m));
} else {
  list = db.prepare('SELECT model_id FROM models ORDER BY sort_order, id').all().map(r => r.model_id);
}

console.log(`\nآزمایش ${list.length} مدل — ${CONCURRENCY} درخواست همزمان، مهلت ${TIMEOUT / 1000} ثانیه…\n`);

const good = [], bad = [];
let cursor = 0;

async function worker() {
  while (cursor < list.length) {
    const m = list[cursor++];
    const r = await probe(m);
    if (r.ok) {
      good.push({ m, ms: r.ms, fa: r.fa });
      console.log(`  ✓ ${String(r.ms).padStart(6)} م‌ث  ${r.fa ? 'فا' : '؟ '}  ${m}`);
    } else {
      bad.push({ m, ...r });
      console.log(`  ✗ ${String(r.status).padStart(6)}     ${m}  →  ${r.msg}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

console.log(`\n${'═'.repeat(58)}`);
console.log(`  سالم: ${good.length}    خراب: ${bad.length}`);
console.log('═'.repeat(58));

if (good.length) {
  console.log('\n── مدل‌های سالم به ترتیب سرعت ──');
  for (const g of [...good].sort((a, b) => a.ms - b.ms)) {
    console.log(`  ${String(g.ms).padStart(6)} م‌ث  ${g.fa ? '✓فارسی' : '  ?   '}  ${g.m}`);
  }
}

if (FIX) {
  const goodSet = new Set(good.map(g => g.m));
  let off = 0, on = 0;
  for (const r of db.prepare('SELECT id, model_id, enabled FROM models').all()) {
    const works = goodSet.has(r.model_id);
    if (!works && r.enabled) { db.prepare('UPDATE models SET enabled = 0 WHERE id = ?').run(r.id); off++; }
    if (works && !r.enabled && good.find(g => g.m === r.model_id)) on++;
  }
  console.log(`\n✓ ${off} مدل ناکارآمد غیرفعال شد. (${on} مدل سالمِ خاموش هست که می‌توانید از پنل روشن کنید.)`);
}
console.log();
