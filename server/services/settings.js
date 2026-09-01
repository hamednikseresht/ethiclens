import { db } from '../db.js';
import { DEFAULT_PROMPT, DEFAULT_PROMPT_KEY } from './default-prompt.js';

const DEFAULTS = {
  site_title: 'دیدگاه اخلاق — Ethic Lens',
  site_tagline: 'دوراهی‌ات را از هشت منظر فلسفه اخلاق ببین',
  site_url: '',                      // for canonical links and the sitemap — e.g. https://ethiclens.ir
  default_model: '',                 // in the form "providerKey:modelId"
  temperature: '0.6',
  top_p: '0.95',
  max_tokens: '4096',
  active_prompt_key: DEFAULT_PROMPT_KEY,
  allow_registration: '1',
  require_verification: '1',        // is email verification required?
  verification_gate: 'analysis',    // analysis = only analysis gated | login = login gated
  mail_provider: 'brevo',           // brevo | mailgun
  brevo_api_key: '',
  mailgun_api_key: '',
  mailgun_domain: '',
  mailgun_base_url: 'https://api.mailgun.net',
  mail_from_name: 'Ethic Lens',
  mail_from_email: '',
  default_daily_quota: '30'
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value !== null && row.value !== undefined && row.value !== '') return row.value;
  return DEFAULTS[key] ?? null;
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.value !== null && r.value !== '') out[r.key] = r.value;
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
  const v = getSetting(key);
  return v === '1' || v === 'true';
}

export function activePrompt() {
  const key = getSetting('active_prompt_key');
  const row = db.prepare('SELECT * FROM prompts WHERE key = ?').get(key)
           || db.prepare('SELECT * FROM prompts WHERE is_active = 1 ORDER BY id LIMIT 1').get();
  return row || { key: DEFAULT_PROMPT_KEY, label: 'پیش‌فرض', content: DEFAULT_PROMPT };
}
