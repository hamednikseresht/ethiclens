import { db } from '../db.js';
import { tierRank } from './tiers.js';

/**
 * ارائه‌دهندگان سرویس هوش مصنوعی.
 * هر ارائه‌دهنده یک API سازگار با OpenAI است: آدرس پایه + کلید Bearer.
 * بنابراین انویدیا، اوپن‌ای‌آی، OpenRouter، Groq، Together و هر سرویس
 * سازگار دیگری با همین ساختار پشتیبانی می‌شود.
 */

export const PRESETS = [
  { key: 'nvidia',     label: 'NVIDIA NIM',  base_url: 'https://integrate.api.nvidia.com/v1', hint: 'کلید با nvapi- شروع می‌شود' },
  { key: 'openai',     label: 'OpenAI',      base_url: 'https://api.openai.com/v1',           hint: 'کلید با sk- شروع می‌شود' },
  { key: 'openrouter', label: 'OpenRouter',  base_url: 'https://openrouter.ai/api/v1',        hint: 'کلید با sk-or- شروع می‌شود' },
  { key: 'groq',       label: 'Groq',        base_url: 'https://api.groq.com/openai/v1',      hint: 'کلید با gsk_ شروع می‌شود' },
  { key: 'together',   label: 'Together AI', base_url: 'https://api.together.xyz/v1',         hint: '' },
  { key: 'deepseek',   label: 'DeepSeek',    base_url: 'https://api.deepseek.com/v1',         hint: '' },
  { key: 'custom',     label: 'سرویس دلخواه', base_url: '',                                    hint: 'هر API سازگار با OpenAI' }
];

export function listProviders() {
  return db.prepare('SELECT * FROM providers ORDER BY sort_order, id').all();
}

export function enabledProviders() {
  return db.prepare('SELECT * FROM providers WHERE enabled = 1 ORDER BY sort_order, id').all();
}

export function getProvider(id) {
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
}

export function getProviderByKey(key) {
  return db.prepare('SELECT * FROM providers WHERE key = ?').get(key);
}

/** ارائه‌دهنده‌ای که یک مدل به آن تعلق دارد */
export function providerForModel(modelRowId) {
  return db.prepare(
    'SELECT p.* FROM providers p JOIN models m ON m.provider_id = p.id WHERE m.id = ?'
  ).get(modelRowId);
}

/** مدل‌های فعالِ ارائه‌دهندگان فعال، همراه اطلاعات ارائه‌دهنده */
export function enabledModels() {
  return db.prepare(`
    SELECT m.id, m.model_id, m.label, m.note, m.sort_order, m.min_tier,
           p.id AS provider_id, p.key AS provider_key, p.label AS provider_label,
           p.base_url, p.api_key
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    WHERE m.enabled = 1 AND p.enabled = 1
    ORDER BY p.sort_order, m.sort_order, m.id`).all();
}

/** مدل‌هایی که یک گروه کاربری به آن‌ها دسترسی دارد */
export function modelsForTier(tierKey) {
  const rank = tierRank(tierKey);
  return enabledModels().filter(m => tierRank(m.min_tier) <= rank);
}

/**
 * یافتن یک مدل بر اساس شناسه ردیف یا رشته "providerKey:modelId".
 * اگر tierKey داده شود، فقط میان مدل‌های مجاز آن گروه می‌گردد.
 */
export function resolveModel(ref, tierKey = null) {
  if (ref === null || ref === undefined || ref === '') return null;

  const models = tierKey === null ? enabledModels() : modelsForTier(tierKey);

  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    return models.find(m => m.id === Number(ref)) || null;
  }

  const s = String(ref);

  const sep = s.indexOf(':');
  if (sep > 0) {
    const pk = s.slice(0, sep), mid = s.slice(sep + 1);
    const hit = models.find(m => m.provider_key === pk && m.model_id === mid);
    if (hit) return hit;
  }
  // سازگاری با نسخه قبلی که فقط شناسه مدل را می‌فرستاد
  return models.find(m => m.model_id === s) || null;
}

/** شناسه پایدار برای ارسال از کلاینت */
export function modelRef(m) {
  return `${m.provider_key}:${m.model_id}`;
}
