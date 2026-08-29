import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { DEFAULT_PROMPT, DEFAULT_PROMPT_KEY } from './services/default-prompt.js';
import { setSetting, getSetting } from './services/settings.js';

const CATALOG = [
  ['nvidia/llama-3.1-nemotron-70b-instruct', 'Llama 3.1 Nemotron 70B', 'پیش‌فرض — تعادل خوب میان کیفیت استدلال و سرعت', 1, 10],
  ['nvidia/llama-3.3-nemotron-super-49b-v1', 'Llama 3.3 Nemotron Super 49B', 'سریع‌تر، مناسب تحلیل‌های کوتاه‌تر', 1, 20],
  ['meta/llama-3.3-70b-instruct',            'Llama 3.3 70B Instruct',      'مدل عمومی متا', 1, 30],
  ['qwen/qwen2.5-72b-instruct',              'Qwen 2.5 72B',                'چندزبانه قوی', 1, 40],
  ['mistralai/mistral-large-2-instruct',     'Mistral Large 2',             'استدلال ساختارمند', 0, 50],
  ['deepseek-ai/deepseek-r1',                'DeepSeek R1',                 'استدلال عمیق، کندتر و پرهزینه‌تر', 0, 60]
];

export function seed() {
  // مدل‌ها
  const insModel = db.prepare(`INSERT INTO models (model_id, label, note, enabled, sort_order)
                               VALUES (?,?,?,?,?) ON CONFLICT(model_id) DO NOTHING`);
  for (const m of CATALOG) insModel.run(...m);

  // پرامپت پیش‌فرض
  const exists = db.prepare('SELECT id FROM prompts WHERE key = ?').get(DEFAULT_PROMPT_KEY);
  if (!exists) {
    db.prepare('INSERT INTO prompts (key, label, content, is_active) VALUES (?,?,?,1)')
      .run(DEFAULT_PROMPT_KEY, 'دستور پیش‌فرض فارسی', DEFAULT_PROMPT);
  }

  // تنظیمات اولیه از متغیرهای محیطی
  if (!getSetting('nvidia_api_key') && process.env.NVIDIA_API_KEY) setSetting('nvidia_api_key', process.env.NVIDIA_API_KEY);
  if (process.env.NVIDIA_BASE_URL) setSetting('nvidia_base_url', process.env.NVIDIA_BASE_URL);
  if (process.env.DEFAULT_MODEL && !getSetting('default_model')) setSetting('default_model', process.env.DEFAULT_MODEL);
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('active_prompt_key')) {
    setSetting('active_prompt_key', DEFAULT_PROMPT_KEY);
  }

  // مدیر اولیه
  const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
  if (adminCount === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    const pass  = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const name  = process.env.ADMIN_NAME || 'مدیر سامانه';
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
      console.log(`[seed] کاربر ${email} به مدیر ارتقا یافت.`);
    } else {
      db.prepare('INSERT INTO users (email, name, password_hash, role, daily_quota) VALUES (?,?,?,?,?)')
        .run(email, name, bcrypt.hashSync(pass, 10), 'admin', 500);
      console.log(`[seed] حساب مدیر ساخته شد: ${email}`);
      if (pass === 'ChangeMe123!') console.log('[seed] ⚠️  رمز پیش‌فرض فعال است — حتماً تغییرش دهید.');
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed();
  console.log('[seed] انجام شد.');
}
