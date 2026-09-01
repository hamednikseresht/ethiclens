import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { DEFAULT_PROMPT, DEFAULT_PROMPT_KEY } from './services/default-prompt.js';
import { setSetting, getSetting } from './services/settings.js';
import { seedGuide } from './services/guide.js';

/**
 * Default models per provider.
 * These are only a starting point; an admin can add or remove models from
 * the panel, or pull the real list with "fetch account models".
 */
const CATALOG = {
  nvidia: [
    ['nvidia/nemotron-3-super-120b-a12b',              'Nemotron 3 Super 120B',  'تعادل خوب کیفیت استدلال، فارسی روان و سرعت', 1, 10],
    ['nvidia/nemotron-3-ultra-550b-a55b',              'Nemotron 3 Ultra 550B',  'بزرگ‌ترین مدل — برای دوراهی‌های پیچیده و چندلایه', 1, 20],
    ['moonshotai/kimi-k3',                             'Kimi K3',                'چندزبانه قوی — نثر فارسی طبیعی‌تر، کمی کندتر', 1, 30],
    ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',  'Nemotron 3 Nano Reasoning', 'نسخه استدلالی سبک', 1, 40],
    ['nvidia/nemotron-3.5-lightning-30b-a3b',          'Nemotron 3.5 Lightning', 'سریع — مناسب وقتی تصمیم فوری است', 1, 50],
    ['nvidia/nemotron-3-nano-30b-a3b',                 'Nemotron 3 Nano 30B',    'سبک‌ترین و کم‌هزینه‌ترین گزینه', 1, 60],
    ['openai/gpt-oss-120b',                            'GPT-OSS 120B',           'مدل باز — پیروی دقیق از قالب', 1, 70],
    ['minimaxai/minimax-m3',                           'MiniMax M3',             'گزینه جایگزین چندزبانه — کندتر', 1, 80],
    ['openai/gpt-oss-20b',                             'GPT-OSS 20B',            'نسخه کوچک — سریع ولی سطحی‌تر', 0, 90]
  ],
  // Ordered by measured fit for this task rather than by raw capability.
  // scripts/compare-models.mjs ran the same layered dilemma through each of
  // these three times: all returned 26/26 blocks with a verdict line for all
  // eight schools, so the deciding factors became how much of the output
  // stayed in Persian, how long it took, and what it cost in tokens.
  openai: [
    ['gpt-5.4-nano',    'GPT-5.4 nano',    'پیشنهادی — ۹۵٪ فارسی، ارزان‌ترین رده با کیفیت کامل', 1, 10],
    ['gpt-5.4-mini',    'GPT-5.4 mini',    'کیفیت یکسان با nano و کمی سریع‌تر — رده گران‌تر', 1, 20],
    ['gpt-4.1-mini',    'GPT-4.1 mini',    'کم‌مصرف‌ترین در توکن (~۲۲۰۰) ولی کندتر و ۹۳٪ فارسی', 1, 30],
    ['gpt-4o-mini',     'GPT-4o mini',     'سریع‌ترین (۱۸ ثانیه) ولی بیشترین نشت انگلیسی — ۹۱٪', 1, 40],
    ['gpt-4.1',         'GPT-4.1',         'پیروی دقیق از قالب، رده کامل', 1, 50],
    ['gpt-5-mini',      'GPT-5 mini',      'استدلالی — سه برابر کندتر بدون کیفیت بیشتر', 0, 60],
    ['gpt-5',           'GPT-5',           'رده کامل — برای دوراهی‌های بسیار پیچیده', 0, 70],
    ['o4-mini',         'o4-mini',         'استدلالی سبک', 0, 80]
  ]
};

const sha = t => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');

const PROVIDER_SEED = [
  { key: 'nvidia', label: 'NVIDIA NIM', base_url: 'https://integrate.api.nvidia.com/v1',
    envKey: 'NVIDIA_API_KEY', envUrl: 'NVIDIA_BASE_URL', sort: 10 },
  { key: 'openai', label: 'OpenAI', base_url: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY', envUrl: 'OPENAI_BASE_URL', sort: 20 }
];

const TIER_SEED = [
  { key: 'basic',   label: 'عادی', daily_quota: 5,   monthly_tokens: 200000,  sort: 10 },
  { key: 'premium', label: 'ویژه', daily_quota: 40,  monthly_tokens: 2000000, sort: 20 }
];

export function seed() {
  /* ---- Encyclopedia content ---- */
  seedGuide();

  /* ---- User tiers ---- */
  const insTier = db.prepare(
    `INSERT INTO tiers (key, label, daily_quota, monthly_tokens, sort_order)
     VALUES (?,?,?,?,?) ON CONFLICT(key) DO NOTHING`);
  for (const t of TIER_SEED) insTier.run(t.key, t.label, t.daily_quota, t.monthly_tokens, t.sort);

  /* ---- Providers ---- */
  const insProvider = db.prepare(
    `INSERT INTO providers (key, label, base_url, api_key, enabled, sort_order)
     VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO NOTHING`);

  for (const p of PROVIDER_SEED) {
    const envKeyValue = process.env[p.envKey] || '';
    const baseUrl = process.env[p.envUrl] || p.base_url;
    // A provider whose key we do not have is created but left disabled
    insProvider.run(p.key, p.label, baseUrl, envKeyValue, envKeyValue ? 1 : 0, p.sort);

    // If the row existed without a key and env now has one, fill it in
    if (envKeyValue) {
      const row = db.prepare('SELECT id, api_key FROM providers WHERE key = ?').get(p.key);
      if (row && !row.api_key) {
        db.prepare('UPDATE providers SET api_key = ?, enabled = 1 WHERE id = ?').run(envKeyValue, row.id);
      }
    }
  }

  /* ---- Models ---- */
  const insModel = db.prepare(
    `INSERT INTO models (provider_id, model_id, label, note, enabled, sort_order)
     VALUES (?,?,?,?,?,?) ON CONFLICT(provider_id, model_id) DO NOTHING`);

  for (const [providerKey, models] of Object.entries(CATALOG)) {
    const p = db.prepare('SELECT id FROM providers WHERE key = ?').get(providerKey);
    if (!p) continue;
    for (const [id, label, note, enabled, sort] of models) {
      insModel.run(p.id, id, label, note, enabled, sort);
    }
  }

  /* ---- Default prompt ----
     If the admin has not touched the text, it is updated to the new factory
     version. If they have edited it, it is left alone and only a warning is
     logged — so a version upgrade never destroys someone's customisation. */
  const factoryHash = sha(DEFAULT_PROMPT);
  const existing = db.prepare('SELECT * FROM prompts WHERE key = ?').get(DEFAULT_PROMPT_KEY);

  if (!existing) {
    db.prepare('INSERT INTO prompts (key, label, content, is_active) VALUES (?,?,?,1)')
      .run(DEFAULT_PROMPT_KEY, 'دستور پیش‌فرض فارسی', DEFAULT_PROMPT);
    setSetting('factory_prompt_hash', factoryHash);
  } else if (sha(existing.content) !== factoryHash) {
    const seededHash = getSetting('factory_prompt_hash');
    const untouched = seededHash && sha(existing.content) === seededHash;
    if (untouched) {
      db.prepare(`UPDATE prompts SET content = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(DEFAULT_PROMPT, existing.id);
      setSetting('factory_prompt_hash', factoryHash);
      console.log('[seed] دستور پیش‌فرض به نسخه تازه به‌روزرسانی شد.');
    } else {
      console.log('[seed] ⚠️  دستور تحلیل توسط مدیر ویرایش شده — نسخه تازه کارخانه اعمال نشد.');
      console.log('[seed]    برای دیدن نسخه تازه: پنل مدیریت ← دستور تحلیل ← بازگرداندن متن کارخانه.');
    }
  } else {
    setSetting('factory_prompt_hash', factoryHash);
  }
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('active_prompt_key')) {
    setSetting('active_prompt_key', DEFAULT_PROMPT_KEY);
  }

  /* ---- Default model: the first enabled model of an enabled provider ---- */
  const current = getSetting('default_model');
  const stillValid = current && db.prepare(`
    SELECT 1 FROM models m JOIN providers p ON p.id = m.provider_id
    WHERE m.enabled = 1 AND p.enabled = 1 AND p.key || ':' || m.model_id = ?`).get(current);

  if (!stillValid) {
    const first = db.prepare(`
      SELECT p.key || ':' || m.model_id AS ref FROM models m
      JOIN providers p ON p.id = m.provider_id
      WHERE m.enabled = 1 AND p.enabled = 1
      ORDER BY p.sort_order, m.sort_order LIMIT 1`).get();
    if (first) {
      setSetting('default_model', first.ref);
      console.log(`[seed] مدل پیش‌فرض روی ${first.ref} تنظیم شد.`);
    }
  }

  /* ---- Admins always sit in the premium tier ----
     Admins created before tiers existed land in the basic tier and would hit
     a lower ceiling unintentionally. This corrects that. */
  const promoted = db.prepare(
    "UPDATE users SET tier = 'premium' WHERE role = 'admin' AND tier <> 'premium'").run().changes;
  db.prepare("UPDATE users SET status = 'active' WHERE role = 'admin' AND status = 'pending'").run();
  if (promoted) console.log(`[seed] ${promoted} مدیر به گروه ویژه منتقل شد.`);

  /* ---- Initial admin ---- */
  const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
  if (adminCount === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    const pass  = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const name  = process.env.ADMIN_NAME || 'مدیر سامانه';
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare("UPDATE users SET role = 'admin', tier = 'premium' WHERE id = ?").run(existing.id);
      console.log(`[seed] کاربر ${email} به مدیر ارتقا یافت.`);
    } else {
      db.prepare(`INSERT INTO users (email, name, password_hash, role, tier, status,
                                     quota_override, token_override, email_verified, verified_at)
                  VALUES (?,?,?,?,?, 'active', ?,?, 1, datetime('now'))`)
        .run(email, name, bcrypt.hashSync(pass, 10), 'admin', 'premium', 500, 0);
      console.log(`[seed] حساب مدیر ساخته شد: ${email}`);
      if (pass === 'ChangeMe123!') console.log('[seed] ⚠️  رمز پیش‌فرض فعال است — حتماً تغییرش دهید.');
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed();
  console.log('[seed] انجام شد.');
}
