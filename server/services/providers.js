import { db } from '../db.js';
import { tierRank } from './tiers.js';

/**
 * AI service providers.
 * Every provider is an OpenAI-compatible API: a base URL plus a Bearer key.
 * That is why NVIDIA, OpenAI, OpenRouter, Groq, Together and any other
 * compatible service all fit the same shape.
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

/** The provider a given model belongs to */
export function providerForModel(modelRowId) {
  return db.prepare(
    'SELECT p.* FROM providers p JOIN models m ON m.provider_id = p.id WHERE m.id = ?'
  ).get(modelRowId);
}

/** Enabled models of enabled providers, joined with their provider details */
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

/** Models a given user tier is allowed to reach */
export function modelsForTier(tierKey) {
  const rank = tierRank(tierKey);
  return enabledModels().filter(m => tierRank(m.min_tier) <= rank);
}

/**
 * Resolve a model from a row id or a "providerKey:modelId" string.
 * When tierKey is given, only models that tier may use are searched.
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
  // Backwards compatibility with the older client that sent only the model id
  return models.find(m => m.model_id === s) || null;
}

/** Stable identifier the client sends back */
export function modelRef(m) {
  return `${m.provider_key}:${m.model_id}`;
}
