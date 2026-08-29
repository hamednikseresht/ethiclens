import { db } from '../db.js';
import { DEFAULT_PROMPT, DEFAULT_PROMPT_KEY } from './default-prompt.js';

const DEFAULTS = {
  site_title: 'اتیکا — دستیار تصمیم‌گیری اخلاقی',
  site_tagline: 'دوراهی‌ات را از هفت منظر فلسفه اخلاق ببین',
  nvidia_api_key: '',
  nvidia_base_url: 'https://integrate.api.nvidia.com/v1',
  default_model: 'nvidia/llama-3.1-nemotron-70b-instruct',
  temperature: '0.6',
  top_p: '0.95',
  max_tokens: '4096',
  active_prompt_key: DEFAULT_PROMPT_KEY,
  allow_registration: '1',
  default_daily_quota: '30',
  guest_preview: '0'
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value !== null && row.value !== undefined) return row.value;
  return DEFAULTS[key] ?? null;
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.value !== null) out[r.key] = r.value;
  return out;
}

export function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
    .run(key, value == null ? '' : String(value));
}

export function num(key, fallback) {
  const v = Number(getSetting(key));
  return Number.isFinite(v) ? v : fallback;
}

export function bool(key) {
  return getSetting(key) === '1' || getSetting(key) === 'true';
}

/** کلید API: تنظیمات پایگاه داده اولویت دارد، در غیر این صورت متغیر محیطی */
export function apiKey() {
  return getSetting('nvidia_api_key') || process.env.NVIDIA_API_KEY || '';
}

export function activePrompt() {
  const key = getSetting('active_prompt_key');
  const row = db.prepare('SELECT * FROM prompts WHERE key = ?').get(key)
           || db.prepare('SELECT * FROM prompts WHERE is_active = 1 ORDER BY id LIMIT 1').get();
  return row || { key: DEFAULT_PROMPT_KEY, label: 'پیش‌فرض', content: DEFAULT_PROMPT };
}

export function enabledModels() {
  return db.prepare('SELECT * FROM models WHERE enabled = 1 ORDER BY sort_order, id').all();
}
